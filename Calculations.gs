/**
 * Calculations.gs - Comprehensive Technical Analysis, Multi-Factor Scoring & Indicator Calculations
 * Author: Quantitative Trading System Architect
 */

/**
 * Executes full indicator calculations across all active stocks in Raw_Daily.
 * Populates the Calculations sheet using high-performance single-pass array maps.
 */
function calculateAllIndicators() {
  var config = getConfig();
  var settings = getSettings();

  logSystem("INFO", "Calculations", "Starting optimized indicator calculations across active stock universe...", null);

  var rawRows = readBatchData(config.SHEETS.RAW_DAILY);
  var masterStocks = readBatchData(config.SHEETS.MASTER_STOCKS);
  var fiiHoldings = readBatchData(config.SHEETS.RAW_FII_HOLDINGS);

  if (rawRows.length === 0) {
    logSystem("WARN", "Calculations", "No historical data found in Raw_Daily. Seeding default history...", null);
    updateNSEDataInSheet();
    rawRows = readBatchData(config.SHEETS.RAW_DAILY);
  }

  // 1. Group raw rows by Symbol in a single pass O(N)
  var stockHistory = {};
  for (var i = 0; i < rawRows.length; i++) {
    var r = rawRows[i];
    var sym = r[1];
    if (!stockHistory[sym]) stockHistory[sym] = [];
    stockHistory[sym].push(r);
  }

  // 2. Map master stock metadata O(M)
  var masterMap = {};
  for (var m = 0; m < masterStocks.length; m++) {
    var ms = masterStocks[m];
    masterMap[ms[0]] = {
      name: ms[1],
      sector: ms[2],
      industry: ms[3]
    };
  }

  // 3. Map FII Holding Change O(F)
  var fiiMap = {};
  for (var f = 0; f < fiiHoldings.length; f++) {
    var fh = fiiHoldings[f];
    fiiMap[fh[0]] = safeNumber(fh[3], 0);
  }

  // 4. Pre-calculate Nifty 20D Return benchmark ONCE O(K)
  var niftyHistory = stockHistory["NIFTY"] || [];
  var nifty20DReturn = 0;
  if (niftyHistory.length >= 21) {
    niftyHistory.sort(function(a, b) { return a[0] < b[0] ? -1 : (a[0] > b[0] ? 1 : 0); });
    var latestNifty = safeNumber(niftyHistory[niftyHistory.length - 1][6], 1);
    var prev20Nifty = safeNumber(niftyHistory[niftyHistory.length - 21][6], latestNifty);
    nifty20DReturn = ((latestNifty / prev20Nifty) - 1) * 100;
  }

  var calcResults = [];

  // Settings & Threshold Pre-lookups
  var sellerThreshold = settings["SELLER_THRESHOLD"] || 40000;
  var ultraExtremeThreshold = settings["RVOL_THRESHOLD_ULTRA_EXTREME"] || 20;

  var wRotReturn = settings["STOCK_ROTATION_W_RETURN20D"] || 0.40;
  var wRotRS = settings["STOCK_ROTATION_W_RS"] || 0.30;
  var wRotRVOL = settings["STOCK_ROTATION_W_RVOL"] || 0.20;
  var wRotEMA = settings["STOCK_ROTATION_W_EMA_TREND"] || 0.10;

  var wNmRvol = settings["NEW_MONEY_W_RVOL"] || 0.40;
  var wNmVolAccel = settings["NEW_MONEY_W_VOL_ACCEL"] || 0.30;
  var wNmDelAccel = settings["NEW_MONEY_W_DELIVERY_ACCEL"] || 0.20;
  var wNmRS = settings["NEW_MONEY_W_RS"] || 0.10;

  var wBmRvol = settings["BIG_MONEY_W_RVOL"] || 0.20;
  var wBmVolAccel = settings["BIG_MONEY_W_VOL_ACCEL"] || 0.15;
  var wBmDel = settings["BIG_MONEY_W_DELIVERY"] || 0.20;
  var wBmTrend = settings["BIG_MONEY_W_PRICE_TREND"] || 0.15;
  var wBmRS = settings["BIG_MONEY_W_RS"] || 0.10;
  var wBmSeller = settings["BIG_MONEY_W_LOW_SELLER"] || 0.10;
  var wBmSector = settings["BIG_MONEY_W_SECTOR"] || 0.05;
  var wBmFII = settings["BIG_MONEY_W_FII_HOLDING"] || 0.05;

  // 5. Single Pass Stock Calculation Loop
  for (var symbol in stockHistory) {
    if (symbol === "NIFTY") continue;

    var history = stockHistory[symbol];
    var hLen = history.length;
    if (hLen === 0) continue;

    // Fast string comparison sort
    history.sort(function(a, b) { return a[0] < b[0] ? -1 : (a[0] > b[0] ? 1 : 0); });

    var latest = history[hLen - 1];
    var prevDay = hLen > 1 ? history[hLen - 2] : latest;

    var currentPrice = safeNumber(latest[6], 0);
    var prevClose = safeNumber(prevDay[6], currentPrice);
    var priceChangePct = prevClose > 0 ? ((currentPrice - prevClose) / prevClose) * 100 : 0;

    var currentVolume = safeNumber(latest[8], 0);
    var currentDelQty = safeNumber(latest[11], 0);
    var currentDelPct = safeNumber(latest[12], 0);

    // Extract series vectors in single loop
    var volumes = new Array(hLen);
    var delQtys = new Array(hLen);
    var closes = new Array(hLen);
    for (var idx = 0; idx < hLen; idx++) {
      volumes[idx] = safeNumber(history[idx][8], 0);
      delQtys[idx] = safeNumber(history[idx][11], 0);
      closes[idx] = safeNumber(history[idx][6], 0);
    }

    // Historical Baselines (excluding current day)
    var histVolumes20D = hLen >= 21 ? volumes.slice(-21, -1) : volumes.slice(0, Math.max(1, hLen - 1));
    var histVolumes5D = hLen >= 6 ? volumes.slice(-6, -1) : volumes.slice(0, Math.max(1, hLen - 1));
    var histVolumes50D = hLen >= 51 ? volumes.slice(-51, -1) : volumes.slice(0, Math.max(1, hLen - 1));

    var avgVol5D = calculateSMA(histVolumes5D);
    var avgVol20D = calculateSMA(histVolumes20D);
    var avgVol50D = calculateSMA(histVolumes50D);

    var prev5DVolSlice = hLen >= 11 ? volumes.slice(-11, -6) : volumes.slice(0, Math.max(1, hLen - 6));
    var prev5DAvgVol = calculateSMA(prev5DVolSlice);
    var volAcceleration = prev5DAvgVol > 0 ? avgVol5D / prev5DAvgVol : 1.0;

    var rvol = avgVol20D > 0 ? currentVolume / avgVol20D : 1.0;
    var volumeSpikePct = (rvol - 1) * 100;

    var histDelQtys20D = hLen >= 21 ? delQtys.slice(-21, -1) : delQtys.slice(0, Math.max(1, hLen - 1));
    var histDelQtys5D = hLen >= 6 ? delQtys.slice(-6, -1) : delQtys.slice(0, Math.max(1, hLen - 1));

    var avgDel5D = calculateSMA(histDelQtys5D);
    var avgDel20D = calculateSMA(histDelQtys20D);
    var delAcceleration = avgDel20D > 0 ? currentDelQty / avgDel20D : 1.0;

    var close5DAgo = hLen >= 6 ? safeNumber(history[hLen - 6][6], currentPrice) : currentPrice;
    var close20DAgo = hLen >= 21 ? safeNumber(history[hLen - 21][6], currentPrice) : currentPrice;
    var return5D = close5DAgo > 0 ? ((currentPrice / close5DAgo) - 1) * 100 : 0;
    var return20D = close20DAgo > 0 ? ((currentPrice / close20DAgo) - 1) * 100 : 0;

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

    var rsVsNifty = return20D - nifty20DReturn;

    var hist20Slice = hLen >= 21 ? history.slice(-21, -1) : history.slice(0, Math.max(1, hLen - 1));
    var sumSeller20 = 0;
    for (var s20 = 0; s20 < hist20Slice.length; s20++) {
      var v = safeNumber(hist20Slice[s20][8], 0);
      var dPct = safeNumber(hist20Slice[s20][12], 0) / 100;
      sumSeller20 += v * (1 - dPct);
    }
    var seller20DAvg = hist20Slice.length > 0 ? sumSeller20 / hist20Slice.length : 0;

    var hist5Slice = hLen >= 6 ? history.slice(-6, -1) : history.slice(0, Math.max(1, hLen - 1));
    var sumSeller5 = 0;
    for (var s5 = 0; s5 < hist5Slice.length; s5++) {
      var v5 = safeNumber(hist5Slice[s5][8], 0);
      var dPct5 = safeNumber(hist5Slice[s5][12], 0) / 100;
      sumSeller5 += v5 * (1 - dPct5);
    }
    var seller5DAvg = hist5Slice.length > 0 ? sumSeller5 / hist5Slice.length : 0;
    var sellerTrend = seller5DAvg < seller20DAvg ? "Decreasing Pressure" : "Increasing Pressure";

    var fiiChange = fiiMap[symbol] || 0;

    var normReturn20D = normalizeToRange(return20D, -15, 25);
    var normRS = normalizeToRange(rsVsNifty, -20, 20);
    var normRVOL = normalizeToRange(rvol, 0.5, 5.0);
    var normEMA = emaTrend === "Bullish" ? 100 : (emaTrend === "Neutral" ? 50 : 0);

    var stockRotationScore = Math.round(
      (normReturn20D * wRotReturn) +
      (normRS * wRotRS) +
      (normRVOL * wRotRVOL) +
      (normEMA * wRotEMA)
    );

    var normVolAccel = normalizeToRange(volAcceleration, 0.5, 3.0);
    var normDelAccel = normalizeToRange(delAcceleration, 0.5, 3.0);

    var newMoneyScore = Math.round(
      (normRVOL * wNmRvol) +
      (normVolAccel * wNmVolAccel) +
      (normDelAccel * wNmDelAccel) +
      (normRS * wNmRS)
    );

    var normLowSeller = seller20DAvg < sellerThreshold ? 100 : normalizeToRange(sellerThreshold - seller20DAvg, -100000, sellerThreshold);
    var normFII = normalizeToRange(fiiChange, -2.0, 5.0);

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

    var finalSignal = "NEUTRAL";
    if (bigMoneyScore >= 75) {
      finalSignal = "POTENTIAL BIG MONEY ENTRY";
    } else if (rvol >= ultraExtremeThreshold) {
      finalSignal = "20X+ VOLUME EXPANSION";
    } else if (currentDelPct >= 60 && rvol >= 1.5) {
      finalSignal = "STRONG DELIVERY CONFIRMATION";
    } else if (seller20DAvg < sellerThreshold && priceChangePct > 0) {
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

  // Fast direct score sorting
  calcResults.sort(function(a, b) { return b[32] - a[32]; });

  writeBatchData(config.SHEETS.CALCULATIONS, 2, 1, calcResults, true);
  logSystem("INFO", "Calculations", "Completed indicator calculations for " + calcResults.length + " stocks.", null);
  return calcResults;
}
