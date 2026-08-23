/**
 * Calculations.gs - Comprehensive Technical Analysis, Multi-Factor Scoring & Indicator Calculations
 * Author: Quantitative Trading System Architect
 */

/**
 * Executes full indicator calculations across all active stocks in Raw_Daily.
 * Populates the Calculations sheet.
 */
function calculateAllIndicators() {
  var config = getConfig();
  var settings = getSettings();

  logSystem("INFO", "Calculations", "Starting indicator calculations across active stock universe...", null);

  var rawRows = readBatchData(config.SHEETS.RAW_DAILY);
  var masterStocks = readBatchData(config.SHEETS.MASTER_STOCKS);
  var fiiHoldings = readBatchData(config.SHEETS.RAW_FII_HOLDINGS);

  if (rawRows.length === 0) {
    logSystem("WARN", "Calculations", "No historical data found in Raw_Daily. Seeding default history...", null);
    updateNSEDataInSheet();
    rawRows = readBatchData(config.SHEETS.RAW_DAILY);
  }

  // Group raw rows by Symbol
  var stockHistory = {};
  for (var i = 0; i < rawRows.length; i++) {
    var r = rawRows[i];
    var sym = r[1];
    if (!stockHistory[sym]) stockHistory[sym] = [];
    stockHistory[sym].push(r);
  }

  // Map master stock metadata
  var masterMap = {};
  for (var m = 0; m < masterStocks.length; m++) {
    var ms = masterStocks[m];
    masterMap[ms[0]] = {
      name: ms[1],
      sector: ms[2],
      industry: ms[3]
    };
  }

  // Map FII Holding Change
  var fiiMap = {};
  for (var f = 0; f < fiiHoldings.length; f++) {
    var fh = fiiHoldings[f];
    fiiMap[fh[0]] = safeNumber(fh[3], 0); // Change in FII %
  }

  // Calculate Nifty 20D Return as benchmark
  var niftyHistory = stockHistory["NIFTY"] || [];
  var nifty20DReturn = 0;
  if (niftyHistory.length >= 20) {
    niftyHistory.sort(function(a, b) { return a[0].localeCompare(b[0]); });
    var latestNifty = safeNumber(niftyHistory[niftyHistory.length - 1][6], 1);
    var prev20Nifty = safeNumber(niftyHistory[niftyHistory.length - 21][6], latestNifty);
    nifty20DReturn = ((latestNifty / prev20Nifty) - 1) * 100;
  }

  var calcResults = [];

  for (var symbol in stockHistory) {
    if (symbol === "NIFTY") continue;

    var history = stockHistory[symbol];
    if (history.length === 0) continue;

    // Sort ascending by Date
    history.sort(function(a, b) { return a[0].localeCompare(b[0]); });

    var latest = history[history.length - 1];
    var prevDay = history.length > 1 ? history[history.length - 2] : latest;

    var currentPrice = safeNumber(latest[6], 0);
    var prevClose = safeNumber(prevDay[6], currentPrice);
    var priceChangePct = prevClose > 0 ? ((currentPrice - prevClose) / prevClose) * 100 : 0;

    var currentVolume = safeNumber(latest[8], 0);
    var currentDelQty = safeNumber(latest[11], 0);
    var currentDelPct = safeNumber(latest[12], 0);

    // Extract series arrays
    var volumes = history.map(function(h) { return safeNumber(h[8], 0); });
    var delQtys = history.map(function(h) { return safeNumber(h[11], 0); });
    var closes = history.map(function(h) { return safeNumber(h[6], 0); });

    // Moving Averages for Volume
    var avgVol5D = calculateSMA(volumes.slice(-5));
    var avgVol20D = calculateSMA(volumes.slice(-20));
    var avgVol50D = calculateSMA(volumes.slice(-50));

    // Volume Acceleration: Avg Vol 5D / Previous 5D Average
    var prev5DVolSlice = volumes.length >= 10 ? volumes.slice(-10, -5) : volumes.slice(0, Math.max(1, volumes.length - 5));
    var prev5DAvgVol = calculateSMA(prev5DVolSlice);
    var volAcceleration = prev5DAvgVol > 0 ? avgVol5D / prev5DAvgVol : 1.0;

    // RVOL = Current Volume / Average 20D Volume
    var rvol = avgVol20D > 0 ? currentVolume / avgVol20D : 1.0;
    var volumeSpikePct = (rvol - 1) * 100;

    // Moving Averages for Delivery
    var avgDel5D = calculateSMA(delQtys.slice(-5));
    var avgDel20D = calculateSMA(delQtys.slice(-20));
    var delAcceleration = avgDel20D > 0 ? currentDelQty / avgDel20D : 1.0;

    // Price Returns
    var close5DAgo = history.length >= 6 ? safeNumber(history[history.length - 6][6], currentPrice) : currentPrice;
    var close20DAgo = history.length >= 21 ? safeNumber(history[history.length - 21][6], currentPrice) : currentPrice;
    var return5D = close5DAgo > 0 ? ((currentPrice / close5DAgo) - 1) * 100 : 0;
    var return20D = close20DAgo > 0 ? ((currentPrice / close20DAgo) - 1) * 100 : 0;

    // EMAs calculated forward in time
    var ema20 = calculateEMA(closes, 20);
    var ema50 = calculateEMA(closes, 50);
    var priceVsEMA20 = ema20 > 0 ? ((currentPrice - ema20) / ema20) * 100 : 0;
    var priceVsEMA50 = ema50 > 0 ? ((currentPrice - ema50) / ema50) * 100 : 0;

    var emaTrend = "Neutral";
    if (currentPrice > ema20 && ema20 > ema50) {
      emaTrend = "Bullish";
    } else if (currentPrice < ema20 && ema20 < ema50) {
      emaTrend = "Bearish";
    }

    // Relative Strength vs Nifty
    var rsVsNifty = return20D - nifty20DReturn;

    // Low Selling Pressure Proxy Calculation
    var sellerPressures20D = history.slice(-20).map(function(h) {
      var v = safeNumber(h[8], 0);
      var dPct = safeNumber(h[12], 0) / 100;
      var nonDelVol = v * (1 - dPct);
      return nonDelVol;
    });
    var seller20DAvg = calculateSMA(sellerPressures20D);

    var sellerPressures5D = history.slice(-5).map(function(h) {
      var v = safeNumber(h[8], 0);
      var dPct = safeNumber(h[12], 0) / 100;
      return v * (1 - dPct);
    });
    var seller5DAvg = calculateSMA(sellerPressures5D);
    var sellerTrend = seller5DAvg < seller20DAvg ? "Decreasing Pressure" : "Increasing Pressure";

    var fiiChange = fiiMap[symbol] || 0;

    // Stock Rotation Score Calculation (0-100 normalized)
    var normReturn20D = normalizeToRange(return20D, -15, 25);
    var normRS = normalizeToRange(rsVsNifty, -20, 20);
    var normRVOL = normalizeToRange(rvol, 0.5, 5.0);
    var normEMA = emaTrend === "Bullish" ? 100 : (emaTrend === "Neutral" ? 50 : 0);

    var wRotReturn = settings["STOCK_ROTATION_W_RETURN20D"] || 0.40;
    var wRotRS = settings["STOCK_ROTATION_W_RS"] || 0.30;
    var wRotRVOL = settings["STOCK_ROTATION_W_RVOL"] || 0.20;
    var wRotEMA = settings["STOCK_ROTATION_W_EMA_TREND"] || 0.10;

    var stockRotationScore = Math.round(
      (normReturn20D * wRotReturn) +
      (normRS * wRotRS) +
      (normRVOL * wRotRVOL) +
      (normEMA * wRotEMA)
    );

    // New Money Inflow Score Calculation (0-100 normalized)
    var normVolAccel = normalizeToRange(volAcceleration, 0.5, 3.0);
    var normDelAccel = normalizeToRange(delAcceleration, 0.5, 3.0);

    var wNmRvol = settings["NEW_MONEY_W_RVOL"] || 0.40;
    var wNmVolAccel = settings["NEW_MONEY_W_VOL_ACCEL"] || 0.30;
    var wNmDelAccel = settings["NEW_MONEY_W_DELIVERY_ACCEL"] || 0.20;
    var wNmRS = settings["NEW_MONEY_W_RS"] || 0.10;

    var newMoneyScore = Math.round(
      (normRVOL * wNmRvol) +
      (normVolAccel * wNmVolAccel) +
      (normDelAccel * wNmDelAccel) +
      (normRS * wNmRS)
    );

    // Big Money Initial Entry Score Calculation (0-100)
    var normLowSeller = seller20DAvg < (settings["SELLER_THRESHOLD"] || 40000) ? 100 : normalizeToRange(40000 - seller20DAvg, -100000, 40000);
    var normFII = normalizeToRange(fiiChange, -2.0, 5.0);

    var wBmRvol = settings["BIG_MONEY_W_RVOL"] || 0.20;
    var wBmVolAccel = settings["BIG_MONEY_W_VOL_ACCEL"] || 0.15;
    var wBmDel = settings["BIG_MONEY_W_DELIVERY"] || 0.20;
    var wBmTrend = settings["BIG_MONEY_W_PRICE_TREND"] || 0.15;
    var wBmRS = settings["BIG_MONEY_W_RS"] || 0.10;
    var wBmSeller = settings["BIG_MONEY_W_LOW_SELLER"] || 0.10;
    var wBmSector = settings["BIG_MONEY_W_SECTOR"] || 0.05;
    var wBmFII = settings["BIG_MONEY_W_FII_HOLDING"] || 0.05;

    var bigMoneyScore = Math.round(
      (normRVOL * wBmRvol) +
      (normVolAccel * wBmVolAccel) +
      (normDelAccel * wBmDel) +
      (normEMA * wBmTrend) +
      (normRS * wBmRS) +
      (normLowSeller * wBmSeller) +
      (70 * wBmSector) +
      (normFII * wBmFII)
    );

    // Final Signal Classification
    var finalSignal = "NEUTRAL";
    if (bigMoneyScore >= 75) {
      finalSignal = "POTENTIAL BIG MONEY ENTRY";
    } else if (rvol >= (settings["RVOL_THRESHOLD_ULTRA_EXTREME"] || 20)) {
      finalSignal = "20X+ VOLUME EXPANSION";
    } else if (currentDelPct >= 60 && rvol >= 1.5) {
      finalSignal = "STRONG DELIVERY CONFIRMATION";
    } else if (seller20DAvg < (settings["SELLER_THRESHOLD"] || 40000) && priceChangePct > 0) {
      finalSignal = "LOW SELLING PRESSURE ACCUMULATION";
    }

    var meta = masterMap[symbol] || { name: symbol, sector: "General", industry: "General" };

    var row = [
      symbol,
      meta.name,
      meta.sector,
      currentPrice,
      prevClose,
      Math.round(priceChangePct * 100) / 100,
      currentVolume,
      Math.round(avgVol5D),
      Math.round(avgVol20D),
      Math.round(avgVol50D),
      Math.round(rvol * 100) / 100,
      Math.round(volumeSpikePct * 100) / 100,
      Math.round(volAcceleration * 100) / 100,
      currentDelQty,
      Math.round(currentDelPct * 100) / 100,
      Math.round(avgDel5D),
      Math.round(avgDel20D),
      Math.round(delAcceleration * 100) / 100,
      Math.round(return5D * 100) / 100,
      Math.round(return20D * 100) / 100,
      Math.round(ema20 * 100) / 100,
      Math.round(ema50 * 100) / 100,
      Math.round(priceVsEMA20 * 100) / 100,
      Math.round(priceVsEMA50 * 100) / 100,
      emaTrend,
      Math.round(rsVsNifty * 100) / 100,
      Math.round(seller20DAvg),
      Math.round(seller5DAvg),
      sellerTrend,
      fiiChange,
      stockRotationScore,
      newMoneyScore,
      bigMoneyScore,
      finalSignal,
      formatDateKey(latest[0])
    ];

    calcResults.push(row);
  }

  // Sort by Big Money Score descending
  calcResults.sort(function(a, b) { return b[32] - a[32]; });

  writeBatchData(config.SHEETS.CALCULATIONS, 2, 1, calcResults, true);
  logSystem("INFO", "Calculations", "Completed indicator calculations for " + calcResults.length + " stocks.", null);
  return calcResults;
}
