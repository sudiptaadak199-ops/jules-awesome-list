/**
 * SignalEngine.gs - Active Signal Generation & End-of-Day Snapshot Logging
 * Author: Quantitative Trading System Architect
 */

/**
 * Scans calculated indicators and logs active trading intelligence signals into Signals and Historical_Log.
 * Uses single-pass array construction and O(1) hash map indexing.
 */
function generateSignalsAndSnapshot() {
  var config = getConfig();

  logSystem("INFO", "SignalEngine", "Generating active trading signals and snapshotting historical log...", null);

  var calcData = readBatchData(config.SHEETS.CALCULATIONS);
  if (calcData.length === 0) {
    calcData = calculateAllIndicators();
  }

  // Build sector stage hash map O(S) for O(1) lookup
  var sectorData = readBatchData(config.SHEETS.SECTOR_DATA);
  var sectorStageMap = {};
  for (var s = 0; s < sectorData.length; s++) {
    sectorStageMap[sectorData[s][0]] = sectorData[s][11];
  }

  var todayStr = formatDateKey(new Date());
  var activeSignals = [];
  var historicalSnapshots = [];

  // Single pass through calculation records O(N)
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

    var snapshotRow = [
      todayStr,
      symbol,
      price,
      row[5],  // Change %
      row[6],  // Volume
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

  // Write Active Signals in a single batch
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
 * Uses fast pre-normalized string comparisons (< and >) in sort.
 */
function mergeHistoricalSnapshots(existingLogs, newSnapshots) {
  var logMap = {};

  for (var i = 0; i < existingLogs.length; i++) {
    var row = existingLogs[i];
    if (row && row[0] && row[1]) {
      var dateStr = formatDateKey(row[0]);
      var symStr = (row[1] || "").toString().trim().toUpperCase();
      var key = makeCompositeKey(dateStr, symStr);
      row[0] = dateStr;
      row[1] = symStr;
      logMap[key] = row;
    }
  }

  for (var j = 0; j < newSnapshots.length; j++) {
    var nRow = newSnapshots[j];
    var nDateStr = formatDateKey(nRow[0]);
    var nSymStr = (nRow[1] || "").toString().trim().toUpperCase();
    var nKey = makeCompositeKey(nDateStr, nSymStr);
    nRow[0] = nDateStr;
    nRow[1] = nSymStr;
    logMap[nKey] = nRow;
  }

  var mergedList = [];
  for (var k in logMap) {
    mergedList.push(logMap[k]);
  }

  // Fast direct string comparison sort O(N log N)
  mergedList.sort(function(a, b) {
    var dA = a[0];
    var dB = b[0];
    if (dA < dB) return -1;
    if (dA > dB) return 1;
    var sA = a[1];
    var sB = b[1];
    if (sA < sB) return -1;
    if (sA > sB) return 1;
    return 0;
  });

  return mergedList;
}
