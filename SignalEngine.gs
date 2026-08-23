/**
 * SignalEngine.gs - Active Signal Generation & End-of-Day Snapshot Logging
 * Author: Quantitative Trading System Architect
 */

/**
 * Scans calculated indicators and logs active trading intelligence signals into Signals and Historical_Log.
 */
function generateSignalsAndSnapshot() {
  var config = getConfig();
  var settings = getSettings();

  logSystem("INFO", "SignalEngine", "Generating active trading signals and snapshotting historical log...", null);

  var calcData = readBatchData(config.SHEETS.CALCULATIONS);
  if (calcData.length === 0) {
    calcData = calculateAllIndicators();
  }

  var sectorData = readBatchData(config.SHEETS.SECTOR_DATA);
  var sectorStageMap = {};
  for (var s = 0; s < sectorData.length; s++) {
    sectorStageMap[sectorData[s][0]] = sectorData[s][11]; // Stage
  }

  var todayStr = formatDateKey(new Date());
  var activeSignals = [];
  var historicalSnapshots = [];

  for (var i = 0; i < calcData.length; i++) {
    var row = calcData[i];
    var symbol = row[0];
    var company = row[1];
    var sector = row[2];
    var price = row[3];
    var rvol = row[10];
    var delPct = row[14];
    var volAccel = row[12];
    var seller20D = row[26];
    var rotScore = row[30];
    var newMoneyScore = row[31];
    var bigMoneyScore = row[32];
    var signalType = row[33];
    var secStage = sectorStageMap[sector] || "Neutral";

    // Build historical snapshot row
    var snapshotRow = [
      todayStr,
      symbol,
      price,
      row[5], // Change %
      row[6], // Volume
      rvol,
      row[13], // Delivery Qty
      delPct,
      volAccel,
      seller20D,
      row[25], // RS vs Nifty
      sector,
      secStage,
      rotScore,
      newMoneyScore,
      bigMoneyScore,
      signalType
    ];
    historicalSnapshots.push(snapshotRow);

    // Filter active actionable signals
    if (signalType !== "NEUTRAL") {
      var sigId = "SIG_" + todayStr.replace(/-/g, "") + "_" + symbol;
      var sigRow = [
        sigId,
        todayStr,
        symbol,
        company,
        sector,
        signalType,
        price,
        rvol,
        delPct,
        volAccel,
        seller20D,
        rotScore,
        newMoneyScore,
        bigMoneyScore,
        "ACTIVE"
      ];
      activeSignals.push(sigRow);
    }
  }

  // Write Active Signals
  writeBatchData(config.SHEETS.SIGNALS, 2, 1, activeSignals, true);

  // Append Historical Log incrementally without erasing past records
  var existingLogs = readBatchData(config.SHEETS.HISTORICAL_LOG);
  var mergedLogs = mergeHistoricalSnapshots(existingLogs, historicalSnapshots);
  writeBatchData(config.SHEETS.HISTORICAL_LOG, 2, 1, mergedLogs, true);

  logSystem("INFO", "SignalEngine", "Generated " + activeSignals.length + " active signals. Total historical log snapshots: " + mergedLogs.length, null);
  return activeSignals;
}

/**
 * Deduplicates and appends historical daily snapshots by composite key (Date_Symbol).
 */
function mergeHistoricalSnapshots(existingLogs, newSnapshots) {
  var logMap = {};

  for (var i = 0; i < existingLogs.length; i++) {
    var row = existingLogs[i];
    if (row && row[0] && row[1]) {
      var key = makeCompositeKey(row[0], row[1]);
      logMap[key] = row;
    }
  }

  for (var j = 0; j < newSnapshots.length; j++) {
    var nRow = newSnapshots[j];
    var nKey = makeCompositeKey(nRow[0], nRow[1]);
    logMap[nKey] = nRow;
  }

  var mergedList = [];
  for (var k in logMap) {
    mergedList.push(logMap[k]);
  }

  mergedList.sort(function(a, b) {
    if (a[0] === b[0]) return a[1].localeCompare(b[1]);
    return a[0].localeCompare(b[0]);
  });

  return mergedList;
}
