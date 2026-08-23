/**
 * Backtest.gs - Look-Ahead Bias-Free Quantitative Backtesting Engine
 * Author: Quantitative Trading System Architect
 */

/**
 * Runs historical backtesting across Strategies A-E without look-ahead bias.
 * Pre-indexes price matrices and signal dates into memory maps for O(1) bar lookups.
 */
function runBacktestEngine(strategyName, startDateStr, endDateStr) {
  var config = getConfig();
  var settings = getSettings();

  if (!strategyName) strategyName = "Strategy D: Potential Big Money Entry";
  if (!startDateStr) startDateStr = settings["BACKTEST_START_DATE"] || "2024-01-01";
  if (!endDateStr) endDateStr = settings["BACKTEST_END_DATE"] || "2026-12-31";

  var holdingPeriod = safeNumber(settings["BACKTEST_HOLDING_DAYS"], 10);
  var stopLossPct = safeNumber(settings["BACKTEST_STOP_LOSS_PCT"], 5.0);
  var targetPct = safeNumber(settings["BACKTEST_TARGET_PCT"], 15.0);

  logSystem("INFO", "Backtest", "Executing backtest for Strategy: " + strategyName + " (" + startDateStr + " to " + endDateStr + ")...", null);

  var rawHistory = readBatchData(config.SHEETS.RAW_DAILY);
  var histLogs = readBatchData(config.SHEETS.HISTORICAL_LOG);

  if (rawHistory.length === 0 || histLogs.length === 0) {
    logSystem("WARN", "Backtest", "Insufficient historical logs for backtesting. Running signal generation snapshot...", null);
    generateSignalsAndSnapshot();
    rawHistory = readBatchData(config.SHEETS.RAW_DAILY);
    histLogs = readBatchData(config.SHEETS.HISTORICAL_LOG);
  }

  // 1. Index daily price data O(N) into O(1) hash maps
  var stockPriceMap = {};
  var dateMap = {};
  var dateList = [];

  for (var i = 0; i < rawHistory.length; i++) {
    var r = rawHistory[i];
    var sym = r[1];
    var dKey = formatDateKey(r[0]);

    if (!stockPriceMap[sym]) stockPriceMap[sym] = {};
    stockPriceMap[sym][dKey] = {
      open: safeNumber(r[3], 0),
      high: safeNumber(r[4], 0),
      low: safeNumber(r[5], 0),
      close: safeNumber(r[6], 0)
    };

    if (!dateMap[dKey]) {
      dateMap[dKey] = true;
      if (dKey >= startDateStr && dKey <= endDateStr) {
        dateList.push(dKey);
      }
    }
  }

  // Fast direct date sorting
  dateList.sort(function(a, b) { return a < b ? -1 : (a > b ? 1 : 0); });

  // Index date positions for O(1) index retrieval
  var dateIndexMap = {};
  for (var idx = 0; idx < dateList.length; idx++) {
    dateIndexMap[dateList[idx]] = idx;
  }

  var tradeLogs = [];
  var tradeIdCounter = 1;
  var sellerThreshold = settings["SELLER_THRESHOLD"] || 40000;

  // 2. Fast single-pass historical log processing
  for (var h = 0; h < histLogs.length; h++) {
    var log = histLogs[h];
    var sigDate = formatDateKey(log[0]);
    if (sigDate < startDateStr || sigDate > endDateStr) continue;

    var symbol = log[1];
    var rvol = safeNumber(log[5], 0);
    var delPct = safeNumber(log[7], 0);
    var seller20D = safeNumber(log[9], 0);
    var secStage = log[12];
    var bmScore = safeNumber(log[15], 0);

    var isSignalTriggered = false;

    if (strategyName.indexOf("20x Volume") !== -1 || strategyName.indexOf("Strategy A") !== -1) {
      isSignalTriggered = rvol >= 20.0;
    } else if (strategyName.indexOf("High Delivery") !== -1 || strategyName.indexOf("Strategy B") !== -1) {
      isSignalTriggered = delPct >= 60.0 && rvol >= 1.5;
    } else if (strategyName.indexOf("Low Seller") !== -1 || strategyName.indexOf("Strategy C") !== -1) {
      isSignalTriggered = seller20D < sellerThreshold;
    } else if (strategyName.indexOf("Big Money") !== -1 || strategyName.indexOf("Strategy D") !== -1) {
      isSignalTriggered = bmScore >= 75;
    } else if (strategyName.indexOf("Sector Rotation") !== -1 || strategyName.indexOf("Strategy E") !== -1) {
      isSignalTriggered = (secStage === "Leading" || secStage === "Accumulation / Early Rotation") && rvol >= 1.5;
    } else {
      isSignalTriggered = bmScore >= 70;
    }

    if (!isSignalTriggered) continue;

    // Strict No Look-Ahead Bias: Entry happens at Next Day's OPEN price
    var sigDateIdx = dateIndexMap[sigDate];
    if (sigDateIdx === undefined || sigDateIdx + 1 >= dateList.length) continue;

    var entryDate = dateList[sigDateIdx + 1];
    var prices = stockPriceMap[symbol] || {};
    var entryData = prices[entryDate];
    if (!entryData || entryData.open <= 0) continue;

    var entryPrice = entryData.open;
    var currentHoldDays = 0;
    var maxFavExcursion = 0;
    var maxAdvExcursion = 0;
    var exitPrice = entryPrice;
    var exitDate = entryDate;
    var outcome = "OPEN";

    // Simulate trade progression
    for (var k = sigDateIdx + 1; k < dateList.length && currentHoldDays < holdingPeriod; k++) {
      var barDate = dateList[k];
      var barPrice = prices[barDate];
      if (!barPrice) continue;

      currentHoldDays++;
      exitDate = barDate;

      var barHighPct = ((barPrice.high - entryPrice) / entryPrice) * 100;
      var barLowPct = ((barPrice.low - entryPrice) / entryPrice) * 100;

      if (barHighPct > maxFavExcursion) maxFavExcursion = barHighPct;
      if (barLowPct < maxAdvExcursion) maxAdvExcursion = barLowPct;

      if (barLowPct <= -stopLossPct) {
        exitPrice = entryPrice * (1 - (stopLossPct / 100));
        outcome = "STOP LOSS";
        break;
      }

      if (barHighPct >= targetPct) {
        exitPrice = entryPrice * (1 + (targetPct / 100));
        outcome = "TARGET";
        break;
      }

      exitPrice = barPrice.close;
    }

    if (outcome === "OPEN") {
      outcome = ((exitPrice - entryPrice) / entryPrice) >= 0 ? "WIN" : "LOSS";
    }

    var returnPct = ((exitPrice - entryPrice) / entryPrice) * 100;

    var tradeRow = [
      "TRD_" + ("000" + tradeIdCounter++).slice(-4),
      strategyName,
      symbol,
      entryDate,
      Math.round(entryPrice * 100) / 100,
      exitDate,
      Math.round(exitPrice * 100) / 100,
      Math.round(returnPct * 100) / 100,
      Math.round(maxFavExcursion * 100) / 100,
      Math.round(maxAdvExcursion * 100) / 100,
      outcome,
      currentHoldDays,
      bmScore
    ];

    tradeLogs.push(tradeRow);
  }

  // Summary Statistics
  var totalTrades = tradeLogs.length;
  var winningTrades = 0;
  var losingTrades = 0;
  var sumReturn = 0;
  var grossProfit = 0;
  var grossLoss = 0;
  var bestTrade = -999;
  var worstTrade = 999;

  for (var t = 0; t < tradeLogs.length; t++) {
    var ret = tradeLogs[t][7];
    sumReturn += ret;
    if (ret > 0) {
      winningTrades++;
      grossProfit += ret;
      if (ret > bestTrade) bestTrade = ret;
    } else {
      losingTrades++;
      grossLoss += Math.abs(ret);
      if (ret < worstTrade) worstTrade = ret;
    }
  }

  var winRate = totalTrades > 0 ? Math.round((winningTrades / totalTrades) * 100) : 0;
  var avgReturn = totalTrades > 0 ? Math.round((sumReturn / totalTrades) * 100) / 100 : 0;
  var profitFactor = grossLoss > 0 ? Math.round((grossProfit / grossLoss) * 100) / 100 : grossProfit;

  if (bestTrade === -999) bestTrade = 0;
  if (worstTrade === 999) worstTrade = 0;

  writeBatchData(config.SHEETS.BACKTEST, 2, 1, tradeLogs, true);

  logSystem("INFO", "Backtest", "Completed backtest for " + strategyName + ". Total Trades: " + totalTrades + ", Win Rate: " + winRate + "%, Profit Factor: " + profitFactor, null);

  return {
    strategyName: strategyName,
    totalTrades: totalTrades,
    winningTrades: winningTrades,
    losingTrades: losingTrades,
    winRate: winRate,
    avgReturn: avgReturn,
    profitFactor: profitFactor,
    bestTrade: bestTrade,
    worstTrade: worstTrade
  };
}
