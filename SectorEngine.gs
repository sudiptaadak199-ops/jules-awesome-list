/**
 * SectorEngine.gs - Sector Aggregation, Sector Relative Strength & Stage Classification
 * Author: Quantitative Trading System Architect
 */

/**
 * Aggregates stock-level indicators into sector performance metrics and classifies Sector Rotation Stages.
 */
function calculateSectorRotation() {
  var config = getConfig();
  var settings = getSettings();

  logSystem("INFO", "SectorEngine", "Aggregating sector-level metrics and calculating rotation stages...", null);

  var calcData = readBatchData(config.SHEETS.CALCULATIONS);
  if (calcData.length === 0) {
    logSystem("WARN", "SectorEngine", "Calculations sheet is empty. Running indicator engine first...", null);
    calcData = calculateAllIndicators();
  }

  // Group calculation records by Sector
  var sectorsMap = {};

  for (var i = 0; i < calcData.length; i++) {
    var row = calcData[i];
    var sector = row[2] || "Unassigned";
    if (sector === "Benchmark" || sector === "General") continue;

    if (!sectorsMap[sector]) {
      sectorsMap[sector] = {
        totalStocks: 0,
        advancing: 0,
        declining: 0,
        rvols: [],
        volAccels: [],
        returns20D: [],
        rsVsNiftyList: [],
        delPcts: [],
        newMoneyScores: []
      };
    }

    var sec = sectorsMap[sector];
    sec.totalStocks++;

    var changePct = safeNumber(row[5], 0);
    if (changePct > 0) sec.advancing++;
    else if (changePct < 0) sec.declining++;

    sec.rvols.push(safeNumber(row[10], 1.0));
    sec.volAccels.push(safeNumber(row[12], 1.0));
    sec.delPcts.push(safeNumber(row[14], 0));
    sec.returns20D.push(safeNumber(row[19], 0));
    sec.rsVsNiftyList.push(safeNumber(row[25], 0));
    sec.newMoneyScores.push(safeNumber(row[31], 50));
  }

  var sectorResults = [];
  var todayStr = formatDateKey(new Date());

  for (var sectorName in sectorsMap) {
    var s = sectorsMap[sectorName];
    var total = s.totalStocks || 1;
    var breadthPct = Math.round((s.advancing / total) * 100);

    var avgRvol = Math.round(calculateSMA(s.rvols) * 100) / 100;
    var avgVolAccel = Math.round(calculateSMA(s.volAccels) * 100) / 100;
    var avg20DReturn = Math.round(calculateSMA(s.returns20D) * 100) / 100;
    var sectorRS = Math.round(calculateSMA(s.rsVsNiftyList) * 100) / 100;
    var avgDelivery = Math.round(calculateSMA(s.delPcts) * 100) / 100;

    // Sector New Money Score Calculation (0-100)
    // Formula: 40% RVOL + 30% Vol Accel + 20% Breadth + 10% Sector RS
    var normRvol = normalizeToRange(avgRvol, 0.8, 3.0);
    var normVolAccel = normalizeToRange(avgVolAccel, 0.8, 2.0);
    var normBreadth = breadthPct; // Already 0-100
    var normRS = normalizeToRange(sectorRS, -10, 10);

    var sectorMoneyScore = Math.round(
      (normRvol * 0.40) +
      (normVolAccel * 0.30) +
      (normBreadth * 0.20) +
      (normRS * 0.10)
    );

    // Sector Stage Classification Rules:
    // 1. Leading: Strong RS > 3% AND High Breadth > 60% AND Strong Returns
    // 2. Improving: Positive RS > 0% AND Vol Acceleration > 1.1 AND Money Score >= 60
    // 3. Accumulation / Early Rotation: High Volume/Money Score >= 70 BUT Price Return still < 2% (Initial entry)
    // 4. Weakening: Positive RS BUT Breadth dropping < 40% OR Returns declining
    // 5. Lagging: Negative RS < 0% AND Low Breadth < 40%
    var stage = "Lagging";

    if (sectorMoneyScore >= 70 && avg20DReturn <= 3.0) {
      stage = "Accumulation / Early Rotation";
    } else if (sectorRS > 3.0 && breadthPct >= 60) {
      stage = "Leading";
    } else if (sectorRS >= 0 && avgVolAccel >= 1.05 && sectorMoneyScore >= 55) {
      stage = "Improving";
    } else if (sectorRS >= 0 && breadthPct < 45) {
      stage = "Weakening";
    } else {
      stage = "Lagging";
    }

    var row = [
      sectorName,
      total,
      s.advancing,
      s.declining,
      breadthPct,
      avgRvol,
      avgVolAccel,
      avg20DReturn,
      sectorRS,
      avgDelivery,
      sectorMoneyScore,
      stage,
      todayStr
    ];

    sectorResults.push(row);
  }

  // Sort sectors descending by Sector New Money Score
  sectorResults.sort(function(a, b) { return b[10] - a[10]; });

  writeBatchData(config.SHEETS.SECTOR_DATA, 2, 1, sectorResults, true);
  logSystem("INFO", "SectorEngine", "Completed sector rotation calculations for " + sectorResults.length + " sectors.", null);
  return sectorResults;
}
