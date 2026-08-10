/**
 * SA Stock Research & Backtest Platform - Phase 1 (Foundation)
 *
 * Sector Rotation Engine Module
 *
 * Implements full 14-step architecture:
 * 1. Read master listings and historical pricing data in-memory.
 * 2. Calculate stock-level technical metrics (EMA 20, EMA 50, RVOL, Vol Acceleration, Returns, Trend Breadth, and RS vs Nifty).
 * 3. Formulate individual Stock Money Scores and New Money Inflow Proxy scores.
 * 4. Aggregate metrics by sector and track 1D / 3D / 5D changes from Sector History.
 * 5. Classify sectors into six distinct rotation stages (Capital Rotation Proxy).
 * 6. Detect New Money Inflows and stage rotation shifts (State Transitions).
 * 7. Rank sectors and prioritize top-performing stocks.
 * 8. Log active alert logs, store Sector History records, and render a prioritized Dashboard and Performance Monitor.
 */

class SectorEngine {
  /**
   * Helper function to calculate Exponential Moving Average (EMA) from an array of values.
   * alpha = 2 / (period + 1)
   * EMA_t = Price_t * alpha + EMA_y * (1 - alpha)
   * @param {Array<number>} values
   * @param {number} period
   * @returns {Array<number>}
   */
  static calculateEMA(values, period) {
    var ema = [];
    if (values.length === 0) return ema;

    var alpha = 2 / (period + 1);

    // Initial SMA to start EMA
    var sum = 0;
    var limit = Math.min(period, values.length);
    for (var i = 0; i < limit; i++) {
      sum += values[i];
    }
    var sma = sum / limit;

    for (var i = 0; i < values.length; i++) {
      if (i < period - 1) {
        ema.push(values[i]); // Fill with values before period starts
      } else if (i === period - 1) {
        ema.push(sma);
      } else {
        var currentEma = values[i] * alpha + ema[i - 1] * (1 - alpha);
        ema.push(currentEma);
      }
    }
    return ema;
  }

  /**
   * Helper function to calculate Average True Range (ATR)
   * @param {Array<object>} history - Array of {high, low, close}
   * @returns {Array<number>}
   */
  static calculateATR(history) {
    var atrValues = [];
    if (history.length === 0) return atrValues;

    var trValues = [history[0].high - history[0].low];
    for (var j = 1; j < history.length; j++) {
      var tr = Math.max(
        history[j].high - history[j].low,
        Math.abs(history[j].high - history[j - 1].close),
        Math.abs(history[j].low - history[j - 1].close)
      );
      trValues.push(tr);
    }

    var sumTr = 0;
    var limit = Math.min(14, trValues.length);
    for (var j = 0; j < limit; j++) {
      sumTr += trValues[j];
    }
    var initialAtr = sumTr / limit;

    for (var j = 0; j < trValues.length; j++) {
      if (j < 13) {
        atrValues.push(initialAtr);
      } else if (j === 13) {
        atrValues.push(initialAtr);
      } else {
        var curAtr = (atrValues[j - 1] * 13 + trValues[j]) / 14;
        atrValues.push(curAtr);
      }
    }
    return atrValues;
  }

  /**
   * Main entry point for the Sector Rotation & Ranking calculation.
   * Runs the entire sequence in-memory to ensure lightning fast execution speed.
   * Ensures NO NaN, Infinity, or undefined values reach the Dashboard or Sector History.
   * @param {object} monitorStats - Tracker object for registering execution metrics.
   */
  static runSectorPipeline(monitorStats) {
    var start = new Date().getTime();
    try {
      var ss = SheetManager.getActiveSpreadsheet();
      var masterSheet = ss.getSheetByName(Config.SHEETS.STOCK_MASTER);
      var histSheet = ss.getSheetByName(Config.SHEETS.HISTORICAL_DATA);

      if (!masterSheet || !histSheet) {
        throw new Error("Missing required sheets for Sector pipeline. Run Initialize Project first.");
      }

      // 1. Read Stock Master to map symbols to Sectors
      var masterData = masterSheet.getRange(2, 1, Math.max(1, masterSheet.getLastRow() - 1), 8).getValues();
      var symbolToSector = {};
      var symbolToCompany = {};
      var activeStocks = [];

      for (var i = 0; i < masterData.length; i++) {
        var symbol = String(masterData[i][0]).trim();
        var company = String(masterData[i][1]).trim();
        var sector = String(masterData[i][3]).trim();
        var status = String(masterData[i][5]).trim();

        if (symbol && status.toUpperCase() === "ACTIVE") {
          symbolToSector[symbol] = sector || "Uncategorized";
          symbolToCompany[symbol] = company || symbol;
          activeStocks.push(symbol);
        }
      }

      // 2. Read Historical Data in-memory
      var lastHistRow = histSheet.getLastRow();
      if (lastHistRow <= 1) {
        throw new Error("No pricing data found in Historical Data sheet.");
      }

      var histData = histSheet.getRange(2, 1, lastHistRow - 1, 10).getValues();
      monitorStats.apiRequests += 1; // Simulated read request

      // Group historical data by Symbol: { SYMBOL: [ {date, open, high, low, close, volume}, ... ] }
      var stockHistories = {};
      for (var i = 0; i < histData.length; i++) {
        var symbol = String(histData[i][0]).trim();
        var date = histData[i][1];
        var open = parseFloat(histData[i][2]);
        var high = parseFloat(histData[i][3]);
        var low = parseFloat(histData[i][4]);
        var close = parseFloat(histData[i][5]);
        var volume = parseFloat(histData[i][7]);

        if (!symbol || isNaN(close) || isNaN(volume)) continue;

        if (!stockHistories[symbol]) {
          stockHistories[symbol] = [];
        }
        stockHistories[symbol].push({
          date: date,
          open: isNaN(open) ? close : open,
          high: isNaN(high) ? close : high,
          low: isNaN(low) ? close : low,
          close: close,
          volume: volume
        });
      }

      // Ensure historical records are sorted chronologically
      for (var sym in stockHistories) {
        stockHistories[sym].sort(function(a, b) {
          return new Date(a.date).getTime() - new Date(b.date).getTime();
        });
      }

      // Benchmark NIFTY history index (NO FABRICATION fallback!)
      var niftyHistory = stockHistories["NIFTY"] || [];
      var benchmarkStatus = "🟢 ACTIVE / OK";
      if (niftyHistory.length === 0 || niftyHistory.length < 50) {
        benchmarkStatus = "⚠️ MISSING / INVALID";
      }

      // Helper function to find the NIFTY close on or most recent before target date string (strictly <= targetDate, preventing look-ahead bias!)
      var findNiftyClose = function(targetDateStr) {
        if (niftyHistory.length === 0) return 0.0;
        var targetTime = new Date(targetDateStr).getTime();
        var bestEntry = null;
        var minPastDiff = Infinity;

        // Loop chronologically to find the closest entry where entry.date <= targetDate
        for (var n = 0; n < niftyHistory.length; n++) {
          var entryTime = new Date(niftyHistory[n].date).getTime();
          var diff = targetTime - entryTime; // Positive diff means entry is in the past or exact same day (<= targetDate)

          if (diff >= 0) {
            if (diff < minPastDiff) {
              minPastDiff = diff;
              bestEntry = niftyHistory[n];
            }
          }
        }

        // If no past/exact date is found, fallback to Nifty's oldest available historical record
        if (!bestEntry) {
          bestEntry = niftyHistory[0];
        }

        return bestEntry.close;
      };

      var stocksSufficient = 0;
      var stocksSkipped = 0;

      // Read Scoring Weights from Settings dynamically
      var w_rvol = Settings.getNum("Weight Relative Volume", 20);
      var w_volAcc = Settings.getNum("Weight Volume Acceleration", 15);
      var w_volPers = Settings.getNum("Weight Volume Persistence", 10);
      var w_upDown = Settings.getNum("Weight Up Down Volume", 5);
      var w_absorb = Settings.getNum("Weight Absorption Proxy", 10);
      var w_breadth = Settings.getNum("Weight Sector Breadth", 10);
      var w_rs = Settings.getNum("Weight RS Improvement", 10);
      var w_mom = Settings.getNum("Weight Momentum Acceleration", 10);
      var w_compress = Settings.getNum("Weight Compression Expansion", 5);
      var w_oi_del = Settings.getNum("Weight Futures OI Delivery", 5);

      // Lookback periods
      var rvolShortWindow = Settings.getNum("RVOL Lookback Short", 5);
      var rvolMedWindow = Settings.getNum("RVOL Lookback Medium", 10);
      var rvolLongWindow = Settings.getNum("RVOL Lookback Long", 20);

      // 3. Compute Advanced Stock Metrics & Scores in-memory
      var stockMetricsList = [];
      for (var i = 0; i < activeStocks.length; i++) {
        var symbol = activeStocks[i];
        if (symbol === "NIFTY") continue; // Skip Nifty benchmark itself from stock metrics

        var history = stockHistories[symbol] || [];

        // Exclude stocks with insufficient history (< 50 days to support EMA20/EMA50 metrics correctly)
        if (history.length < 50) {
          stocksSkipped++;
          continue;
        }

        stocksSufficient++;
        var len = history.length;
        var latest = history[len - 1];

        // Extracted Price Closes for EMA calculations
        var closes = history.map(function(h) { return h.close; });
        var ema20Values = this.calculateEMA(closes, 20);
        var ema50Values = this.calculateEMA(closes, 50);
        var atrValues = this.calculateATR(history);

        var latestEma20 = ema20Values[len - 1] || latest.close;
        var latestEma50 = ema50Values[len - 1] || latest.close;

        // Current Volume
        var curVol = latest.volume;

        // RVOL (Relative Volume) relative to short, medium, and long periods
        var getAvgVolume = function(history, period) {
          var sum = 0;
          var count = 0;
          var startIdx = Math.max(0, history.length - period - 1);
          var endIdx = history.length - 2; // exclude current day
          for (var j = startIdx; j <= endIdx; j++) {
            sum += history[j].volume;
            count++;
          }
          return count > 0 ? (sum / count) : latest.volume;
        };

        var avgVolShort = getAvgVolume(history, rvolShortWindow);
        var avgVolMedium = getAvgVolume(history, rvolMedWindow);
        var avgVolLong = getAvgVolume(history, rvolLongWindow);

        var rvol = avgVolLong > 0 ? (curVol / avgVolLong) : 1.0;
        if (isNaN(rvol) || !isFinite(rvol)) rvol = 1.0;

        var rvolShort = avgVolShort > 0 ? (curVol / avgVolShort) : 1.0;
        var rvolMedium = avgVolMedium > 0 ? (curVol / avgVolMedium) : 1.0;

        // Volume Acceleration
        var volAcc = 1.0;
        if (len >= 11) {
          var sumVolLast5 = 0;
          var sumVolPrev5 = 0;
          for (var j = len - 6; j <= len - 2; j++) {
            sumVolLast5 += history[j].volume;
          }
          for (var j = len - 11; j <= len - 7; j++) {
            sumVolPrev5 += history[j].volume;
          }
          volAcc = sumVolPrev5 > 0 ? (sumVolLast5 / sumVolPrev5) : 1.0;
        }
        if (isNaN(volAcc) || !isFinite(volAcc)) volAcc = 1.0;

        // Volume Persistence: % of last 10 completed days exceeding long-term avg volume
        var highVolCount = 0;
        var startPIdx = Math.max(0, len - 11);
        var endPIdx = len - 2;
        var countP = 0;
        for (var j = startPIdx; j <= endPIdx; j++) {
          if (history[j].volume > avgVolLong) {
            highVolCount++;
          }
          countP++;
        }
        var volPersistence = countP > 0 ? ((highVolCount / countP) * 100) : 50.0;

        // Up-Volume vs Down-Volume pressure ratio (over last 10 completed days)
        var upVol = 0;
        var downVol = 0;
        for (var j = Math.max(1, len - 11); j <= len - 2; j++) {
          var prevClose = history[j - 1].close;
          var curClose = history[j].close;
          if (curClose > prevClose) {
            upVol += history[j].volume;
          } else if (curClose < prevClose) {
            downVol += history[j].volume;
          }
        }
        var upDownRatio = upVol / (downVol + 1.0);

        // Price-Volume Absorption/Accumulation Proxy
        // High volume, tight return, close near high is a strong absorption signal
        var absProxSum = 0;
        var absProxCount = 0;
        for (var j = Math.max(0, len - 5); j < len; j++) {
          var h_l = history[j].high - history[j].low;
          var rejection = h_l > 0 ? (history[j].close - history[j].low) / h_l : 0.5;
          // Local RVOL at index j
          var sumV = 0;
          var countV = 0;
          for (var k = Math.max(0, j - 10); k < j; k++) {
            sumV += history[k].volume;
            countV++;
          }
          var avgV = countV > 0 ? (sumV / countV) : history[j].volume;
          var localRvol = avgV > 0 ? (history[j].volume / avgV) : 1.0;
          absProxSum += (localRvol * rejection);
          absProxCount++;
        }
        var absorptionProxy = absProxCount > 0 ? (absProxSum / absProxCount) : 1.0;

        // Volume + Price Efficiency
        var ret5 = 0.0;
        var prev5Index = Math.max(0, len - 6);
        var p5Close = history[prev5Index] ? history[prev5Index].close : 0.0;
        if (p5Close > 0.0) {
          ret5 = ((latest.close - p5Close) / p5Close) * 100;
        }
        var priceEfficiency = ret5 / (rvol + 0.1);

        // ATR & Compression-to-Expansion setup
        var atr5 = atrValues[len - 1] || 1.0;
        var atr20 = atrValues[Math.max(0, len - 20)] || 1.0;
        var compressionScore = atr20 / (atr5 + 0.0001); // Volatility contraction > 1.0

        // Sector Breadth stock indicators
        var isAboveEma20 = latest.close >= latestEma20;
        var isAboveEma50 = latest.close >= latestEma50;

        // Relative Strength vs NIFTY index
        var ret20 = 0.0;
        var prev20Index = Math.max(0, len - 21);
        var p20Close = history[prev20Index] ? history[prev20Index].close : 0.0;
        if (p20Close > 0.0) {
          ret20 = ((latest.close - p20Close) / p20Close) * 100;
        }

        var rsVsNifty = 0.0;
        if (benchmarkStatus === "🟢 ACTIVE / OK") {
          var startDateStr = PlatformUtils.formatDate(new Date(history[prev20Index].date));
          var endDateStr = PlatformUtils.formatDate(new Date(latest.date));

          var niftyStartClose = findNiftyClose(startDateStr);
          var niftyEndClose = findNiftyClose(endDateStr);

          var niftyRet20 = 0.0;
          if (niftyStartClose > 0.0) {
            niftyRet20 = ((niftyEndClose - niftyStartClose) / niftyStartClose) * 100;
          }
          rsVsNifty = ret20 - niftyRet20;
        }

        // Recent High closeness (within 2% of 20-day High)
        var max20 = 0;
        for (var j = Math.max(0, len - 20); j < len; j++) {
          if (history[j].high > max20) {
            max20 = history[j].high;
          }
        }
        var isNear20DayHigh = max20 > 0 ? (latest.close >= max20 * 0.98) : false;

        // Normalized Stock Scores
        var score_rvol = Math.min(100.0, Math.max(0.0, ((rvol - 0.5) / 1.5) * 100.0));
        var score_volAcc = Math.min(100.0, Math.max(0.0, ((volAcc - 0.5) / 1.0) * 100.0));
        var score_volPers = volPersistence;
        var score_upDown = Math.min(100.0, Math.max(0.0, ((upDownRatio - 0.5) / 1.5) * 100.0));
        var score_absorb = Math.min(100.0, Math.max(0.0, ((absorptionProxy - 0.5) / 1.0) * 100.0));
        var score_rs = Math.min(100.0, Math.max(0.0, ((rsVsNifty + 10.0) / 20.0) * 100.0));
        var score_mom = Math.min(100.0, Math.max(0.0, ((ret5 + 10.0) / 20.0) * 100.0));
        var score_compress = Math.min(100.0, Math.max(0.0, ((compressionScore - 0.7) / 0.8) * 100.0));
        var score_oi_del_val = 50.0; // Default fallback for unavailable data

        // Compile combined stock scoring matrix
        var sumW = w_rvol + w_volAcc + w_volPers + w_upDown + w_absorb + w_breadth + w_rs + w_mom + w_compress + w_oi_del;
        var combinedWScore = 0.0;
        if (sumW > 0) {
          combinedWScore = (
            (score_rvol * w_rvol) + (score_volAcc * w_volAcc) + (score_volPers * w_volPers) +
            (score_upDown * w_upDown) + (score_absorb * w_absorb) + ((isAboveEma20 ? 100.0 : 0.0) * w_breadth) +
            (score_rs * w_rs) + (score_mom * w_mom) + (score_compress * w_compress) + (score_oi_del_val * w_oi_del)
          ) / sumW;
        }

        // Extension & Chasing Risk calculation
        var isExtended = false;
        var extensionFactor = 1.0;
        if (ret20 > 15.0) {
          isExtended = true;
          extensionFactor = Math.max(0.2, 1.0 - (ret20 - 15.0) / 20.0);
        }
        if (latest.close > latestEma20 * 1.1) {
          isExtended = true;
          extensionFactor = Math.min(extensionFactor, 0.5);
        }

        var earlyRotationStockScore = combinedWScore * extensionFactor;

        stockMetricsList.push({
          symbol: symbol,
          company: symbolToCompany[symbol],
          sector: symbolToSector[symbol],
          price: latest.close,
          ema20: latestEma20,
          ema50: latestEma50,
          volume: curVol,
          rvol: rvol,
          rvolShort: rvolShort,
          rvolMedium: rvolMedium,
          volAcc: volAcc,
          volPersistence: volPersistence,
          upDownRatio: upDownRatio,
          absorptionProxy: absorptionProxy,
          priceEfficiency: priceEfficiency,
          compressionScore: compressionScore,
          isNear20DayHigh: isNear20DayHigh,
          ret5: ret5,
          ret20: ret20,
          rsVsNifty: rsVsNifty,
          isAboveEma20: isAboveEma20,
          isAboveEma50: isAboveEma50,
          score: combinedWScore, // Early Accumulation Score
          earlyRotationScore: earlyRotationStockScore,
          isExtended: isExtended
        });
      }

      monitorStats.stocksProcessed = stocksSufficient;
      monitorStats.stocksSkipped = stocksSkipped;
      monitorStats.benchmarkStatus = benchmarkStatus;

      // 4. Aggregate Stock Metrics by Sector
      var sectorMap = {};
      for (var i = 0; i < stockMetricsList.length; i++) {
        var m = stockMetricsList[i];
        if (!sectorMap[m.sector]) {
          sectorMap[m.sector] = {
            name: m.sector,
            scoresSum: 0,
            rotationScoresSum: 0,
            rvolSum: 0,
            rvolShortSum: 0,
            rvolMedSum: 0,
            volAccSum: 0,
            volPersSum: 0,
            upDownRatioSum: 0,
            absorbSum: 0,
            compressSum: 0,
            ret5Sum: 0,
            ret20Sum: 0,
            rsSum: 0,
            aboveEma20Count: 0,
            aboveEma50Count: 0,
            near20DayHighCount: 0,
            advancingCount: 0,
            stocks: []
          };
        }
        var s = sectorMap[m.sector];
        s.scoresSum += m.score;
        s.rotationScoresSum += m.earlyRotationScore;
        s.rvolSum += m.rvol;
        s.rvolShortSum += m.rvolShort;
        s.rvolMedSum += m.rvolMedium;
        s.volAccSum += m.volAcc;
        s.volPersSum += m.volPersistence;
        s.upDownRatioSum += m.upDownRatio;
        s.absorbSum += m.absorptionProxy;
        s.compressSum += m.compressionScore;
        s.ret5Sum += m.ret5;
        s.ret20Sum += m.ret20;
        s.rsSum += m.rsVsNifty;

        if (m.isAboveEma20) s.aboveEma20Count += 1;
        if (m.isAboveEma50) s.aboveEma50Count += 1;
        if (m.isNear20DayHigh) s.near20DayHighCount += 1;
        if (m.ret5 > 0) s.advancingCount += 1;

        s.stocks.push(m);
      }

      // Load sector historical timelines for 1D, 3D, 5D change analysis
      var sectorHistoryTimelines = {}; // { secName: [ {score, inflowScore, breadth, rvol, stage, rank}, ... ] }
      try {
        var sHistSheet = ss.getSheetByName(Config.SHEETS.SECTOR_HISTORY);
        if (sHistSheet && sHistSheet.getLastRow() > 1) {
          var lastRow = sHistSheet.getLastRow();
          var histRows = sHistSheet.getRange(2, 1, lastRow - 1, 9).getValues();

          // Read backwards (latest first) and accumulate history timeline per sector
          for (var i = histRows.length - 1; i >= 0; i--) {
            var secName = String(histRows[i][1]).trim();
            if (!secName) continue;

            if (!sectorHistoryTimelines[secName]) {
              sectorHistoryTimelines[secName] = [];
            }

            var inflowStr = String(histRows[i][5]);
            var scoreMatch = inflowStr.match(/\(\s*(\d+)/);
            var prevInflowScore = scoreMatch ? parseFloat(scoreMatch[1]) : 50.0;

            var rvolMatch = inflowStr.match(/RVOL=([\d.]+)/);
            var prevRvol = rvolMatch ? parseFloat(rvolMatch[1]) : 1.0;

            sectorHistoryTimelines[secName].push({
              score: parseFloat(histRows[i][2]) || 0.0,
              rank: parseInt(histRows[i][3]) || 1,
              stage: String(histRows[i][4]).trim(),
              moneyInflowScore: prevInflowScore,
              breadth: parseFloat(histRows[i][6]) || 50.0,
              rs: parseFloat(histRows[i][7]) || 0.0,
              rvol: prevRvol
            });
          }
        }
      } catch (snapshotErr) {
        console.warn("Failed to load historical timelines: " + snapshotErr.message);
      }

      var sectorsList = [];
      for (var secName in sectorMap) {
        var s = sectorMap[secName];
        var count = s.stocks.length;

        var avgScore = s.scoresSum / count;
        var avgRotationScore = s.rotationScoresSum / count;
        var avgRvol = s.rvolSum / count;
        var avgRvolShort = s.rvolShortSum / count;
        var avgRvolMed = s.rvolMedSum / count;
        var avgVolAcc = s.volAccSum / count;
        var avgVolPers = s.volPersSum / count;
        var avgUpDown = s.upDownRatioSum / count;
        var avgAbsorb = s.absorbSum / count;
        var avgCompress = s.compressSum / count;
        var avgRet5 = s.ret5Sum / count;
        var avgRet20 = s.ret20Sum / count;
        var avgRs = s.rsSum / count;

        var breadthPct = count > 0 ? ((s.aboveEma20Count / count) * 100) : 0.0;
        var breadth50Pct = count > 0 ? ((s.aboveEma50Count / count) * 100) : 0.0;
        var advancingRatio = count > 0 ? (s.advancingCount / count) * 100 : 0.0;
        var nearHighsPct = count > 0 ? (s.near20DayHighCount / count) * 100 : 0.0;

        if (isNaN(avgScore) || !isFinite(avgScore)) avgScore = 0.0;
        if (isNaN(avgRotationScore) || !isFinite(avgRotationScore)) avgRotationScore = 0.0;
        if (isNaN(avgRvol) || !isFinite(avgRvol)) avgRvol = 1.0;
        if (isNaN(avgVolAcc) || !isFinite(avgVolAcc)) avgVolAcc = 1.0;
        if (isNaN(avgRet5) || !isFinite(avgRet5)) avgRet5 = 0.0;
        if (isNaN(avgRet20) || !isFinite(avgRet20)) avgRet20 = 0.0;
        if (isNaN(avgRs) || !isFinite(avgRs)) avgRs = 0.0;

        // Sort stocks inside the sector by Individual Stock Early Accumulation Score
        s.stocks.sort(function(a, b) {
          return b.score - a.score;
        });

        // Compute dedicated New Money Inflow Score (Volume and Participation heavy)
        var rawMoneyScore = (avgRvol * 35.0) + (avgVolAcc * 25.0) + ((breadthPct / 100.0) * 25.0) + (avgRs * 15.0);
        var normalizedMoney = Math.min(100.0, Math.max(0.0, (rawMoneyScore / 1.5) * 100.0 / 75.0));
        if (isNaN(normalizedMoney) || !isFinite(normalizedMoney)) normalizedMoney = 50.0;

        // Multi-period change extraction (1D, 3D, 5D) from history sheet
        var timeline = sectorHistoryTimelines[secName] || [];

        var getHistoryField = function(timeline, snapshotOffset, fieldName, currentFallbackValue) {
          if (timeline.length > snapshotOffset) {
            return timeline[snapshotOffset][fieldName];
          }
          return currentFallbackValue;
        };

        // Extract historical snapshot references
        var prev1Inflow = getHistoryField(timeline, 0, "moneyInflowScore", normalizedMoney);
        var prev3Inflow = getHistoryField(timeline, 2, "moneyInflowScore", normalizedMoney);
        var prev5Inflow = getHistoryField(timeline, 4, "moneyInflowScore", normalizedMoney);

        var prev1Breadth = getHistoryField(timeline, 0, "breadth", breadthPct);
        var prev3Breadth = getHistoryField(timeline, 2, "breadth", breadthPct);
        var prev5Breadth = getHistoryField(timeline, 4, "breadth", breadthPct);

        var prev1Rvol = getHistoryField(timeline, 0, "rvol", avgRvol);
        var prev3Rvol = getHistoryField(timeline, 2, "rvol", avgRvol);
        var prev5Rvol = getHistoryField(timeline, 4, "rvol", avgRvol);

        var prevStage = getHistoryField(timeline, 0, "stage", "OUTFLOW");
        var prevRank = getHistoryField(timeline, 0, "rank", 1);

        // Compute Delta Shifts
        var inflowChg1D = normalizedMoney - prev1Inflow;
        var inflowChg3D = normalizedMoney - prev3Inflow;
        var inflowChg5D = normalizedMoney - prev5Inflow;

        var breadthChg1D = breadthPct - prev1Breadth;
        var breadthChg3D = breadthPct - prev3Breadth;
        var breadthChg5D = breadthPct - prev5Breadth;

        var rvolChg1D = avgRvol - prev1Rvol;
        var rvolChg3D = avgRvol - prev3Rvol;
        var rvolChg5D = avgRvol - prev5Rvol;

        sectorsList.push({
          name: secName,
          score: avgScore, // Sector Money Score (Early Accumulation Score)
          earlyRotationScore: avgRotationScore, // Early Rotation Score
          rvol: avgRvol,
          rvolShort: avgRvolShort,
          rvolMedium: avgRvolMed,
          volAcc: avgVolAcc,
          volPersistence: avgVolPers,
          upDownRatio: avgUpDown,
          absorptionProxy: avgAbsorb,
          compressionScore: avgCompress,
          ret5: avgRet5,
          ret20: avgRet20,
          rsVsNifty: avgRs,
          breadth: breadthPct,
          breadth50: breadth50Pct,
          advancingRatio: advancingRatio,
          nearHighsRatio: nearHighsPct,
          moneyInflowScore: normalizedMoney, // New Money Inflow Proxy Score

          // Multi-period Change parameters
          inflowChg1D: inflowChg1D,
          inflowChg3D: inflowChg3D,
          inflowChg5D: inflowChg5D,

          breadthChg1D: breadthChg1D,
          breadthChg3D: breadthChg3D,
          breadthChg5D: breadthChg5D,

          rvolChg1D: rvolChg1D,
          rvolChg3D: rvolChg3D,
          rvolChg5D: rvolChg5D,

          prevRank: prevRank,
          prevStage: prevStage,
          stocks: s.stocks
        });
      }

      monitorStats.sectorsProcessed = sectorsList.length;

      // 5. Sort Sector Ranking by Early Accumulation Score
      sectorsList.sort(function(a, b) {
        return b.score - a.score;
      });

      for (var i = 0; i < sectorsList.length; i++) {
        sectorsList[i].rank = i + 1;
        var pRank = sectorsList[i].prevRank !== undefined ? sectorsList[i].prevRank : (i + 1);
        sectorsList[i].rankChange = pRank - (i + 1);
        if (isNaN(sectorsList[i].rankChange)) sectorsList[i].rankChange = 0;
      }

      // 6. Upgraded 6-Stage Rotation State Classifications (Capital Rotation Proxy)
      for (var i = 0; i < sectorsList.length; i++) {
        var s = sectorsList[i];

        var stage = "OUTFLOW";
        if (s.moneyInflowScore > 70.0 && s.volAcc > 1.2 && s.breadthChg3D > 0.0) {
          stage = "CONFIRMED INFLOW";
        } else if (s.score < 55.0 && (s.inflowChg3D > 12.0 || s.rvolChg1D > 0.3)) {
          stage = "EARLY INFLOW";
        } else if (s.score >= 58.0 && s.rsVsNifty >= 0.0) {
          stage = "LEADING";
        } else if (s.score >= 52.0 && (s.ret20 < 0.0 || s.inflowChg3D < -5.0 || s.rsVsNifty < 0.0)) {
          stage = "WEAKENING";
        } else if (s.score < 52.0 && (s.inflowChg3D > 3.0 || s.ret5 > 0.0 || s.rvolChg3D > 0.1)) {
          stage = "BOTTOMING";
        } else {
          stage = "OUTFLOW";
        }

        s.stage = stage;

        // Label Money Inflow Status
        s.moneyInflow = "Neutral";
        if (s.moneyInflowScore > 75.0) {
          s.moneyInflow = "🔥 STRONG";
        } else if (s.moneyInflowScore > 50.0) {
          s.moneyInflow = "⚠️ RISING";
        } else {
          s.moneyInflow = "❄️ FLAT/OUT";
        }
      }

      // 7. Load previous alerts for rotation comparison from Cache
      var previousStages = {};
      try {
        var cachedStagesStr = Cache.get("PREV_SECTOR_STAGES");
        if (cachedStagesStr) {
          previousStages = JSON.parse(cachedStagesStr);
        }
      } catch (cacheErr) {
        console.warn("Failed to parse previous sector stages cache: " + cacheErr.message);
      }

      // 8. Generate System Alerts
      var activeAlerts = [];
      var newStageCache = {};

      for (var i = 0; i < sectorsList.length; i++) {
        var s = sectorsList[i];
        newStageCache[s.name] = s.stage;

        var prevStage = previousStages[s.name] || s.prevStage;
        if (prevStage && prevStage !== s.stage) {
          if (s.stage === "CONFIRMED INFLOW") {
            activeAlerts.push({
              type: "CONFIRMED INFLOW 🔄",
              sector: s.name,
              message: "Capital Rotation confirmed into [" + s.name + "]! Breadth is expanding."
            });
          } else {
            activeAlerts.push({
              type: "ROTATION ALERT 🔄",
              sector: s.name,
              message: "Sector rotation shifted from [" + prevStage + "] to [" + s.stage + "]!"
            });
          }
        }

        if (s.stage === "EARLY INFLOW" || (s.score < 55.0 && s.inflowChg3D > 10.0)) {
          activeAlerts.push({
            type: "EARLY INFLOW ⚡",
            sector: s.name,
            message: "Early accumulation detected in [" + s.name + "]! Inflow change: +" + s.inflowChg3D.toFixed(0)
          });
        }
      }

      // Cache current stages for next execution
      Cache.put("PREV_SECTOR_STAGES", JSON.stringify(newStageCache), 24 * 60);

      // 9. History Storage: Append Sector Scores to history sheet
      var todayStr = PlatformUtils.formatDate(new Date());
      var historyRows = [];
      for (var i = 0; i < sectorsList.length; i++) {
        var s = sectorsList[i];
        var sAlerts = activeAlerts.filter(function(a) { return a.sector === s.name; }).map(function(a) { return a.message; }).join(" | ");

        historyRows.push([
          todayStr,
          s.name,
          parseFloat(s.score.toFixed(2)),
          s.rank,
          s.stage,
          s.moneyInflow + " (" + s.moneyInflowScore.toFixed(0) + " | RVOL=" + s.rvol.toFixed(2) + ")",
          parseFloat(s.breadth.toFixed(1)),
          parseFloat(s.rsVsNifty.toFixed(2)),
          sAlerts || "None"
        ]);
      }
      SheetManager.batchAppend(Config.SHEETS.SECTOR_HISTORY, historyRows);

      // 10. Dashboard Rendering
      this.renderDashboardLayout(sectorsList, activeAlerts, monitorStats);

      monitorStats.dataRowsUpdated += historyRows.length;

    } catch (e) {
      console.error("Sector Engine failed run: " + e.message + " Stack: " + e.stack);
      throw e;
    }
  }

  /**
   * Clears and formats the central Dashboard with prioritized rankings, top stocks, alerts and metrics.
   * Uses extremely optimized block calculations and writes them in unified blocks.
   */
  static renderDashboardLayout(sectorsList, activeAlerts, monitorStats) {
    var ss = SheetManager.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(Config.SHEETS.DASHBOARD);
    if (!sheet) return;

    // Reset layout
    sheet.clear();
    sheet.setGridlines(false);

    // Set Column Widths Programmatically for a beautifully spaced trader layout
    sheet.setColumnWidth(1, 40);   // Spacing Column A
    sheet.setColumnWidth(2, 90);   // Rank (Chg)
    sheet.setColumnWidth(3, 140);  // Sector Name
    sheet.setColumnWidth(4, 150);  // Capital Rotation Proxy (Stage)
    sheet.setColumnWidth(5, 120);  // Money Score
    sheet.setColumnWidth(6, 80);   // 1D Change
    sheet.setColumnWidth(7, 80);   // 3D Change
    sheet.setColumnWidth(8, 80);   // 5D Change
    sheet.setColumnWidth(9, 70);   // RVOL
    sheet.setColumnWidth(10, 80);  // Vol Acc
    sheet.setColumnWidth(11, 80);  // Breadth (%)
    sheet.setColumnWidth(12, 100); // RS vs Nifty (%)
    sheet.setColumnWidth(13, 90);  // 20D Return
    sheet.setColumnWidth(14, 120); // Top Stock

    // Style design tokens
    var theme = Config.THEME;
    var colors = theme.COLORS;
    var fonts = theme.FONTS;

    // Title Block
    sheet.getRange("B2:N2").merge()
         .setValue(Config.METADATA.NAME.toUpperCase())
         .setFontSize(fonts.SIZE_TITLE)
         .setFontWeight("bold")
         .setFontColor(colors.PRIMARY_DARK)
         .setFontFamily(fonts.FAMILY)
         .setHorizontalAlignment("center")
         .setVerticalAlignment("middle");

    sheet.getRange("B3:N3").merge()
         .setValue("Sector Rotation & Institutional Money Flow Analyzer • Daily End-Of-Day Analytics")
         .setFontSize(fonts.SIZE_SUBTITLE)
         .setFontStyle("italic")
         .setFontColor(colors.ACCENT)
         .setFontFamily(fonts.FAMILY)
         .setHorizontalAlignment("center")
         .setVerticalAlignment("middle");

    // Left Column: System & Ingestion Monitor Card (B5:D15)
    var monHeader = sheet.getRange("B5:D5");
    monHeader.merge()
             .setValue("⚡ PERFORMANCE & SYSTEM MONITOR")
             .setBackground(colors.PRIMARY_DARK)
             .setFontColor(colors.TEXT_LIGHT)
             .setFontWeight("bold")
             .setFontFamily(fonts.FAMILY)
             .setFontSize(fonts.SIZE_HEADER)
             .setHorizontalAlignment("center")
             .setVerticalAlignment("middle");

    var executionSec = ((monitorStats.executionTime || 0) / 1000).toFixed(2);
    var statusText = monitorStats.failedRequests > 0 ? "⚠️ WARNING" : "✅ HEALTHY";
    var statusColor = monitorStats.failedRequests > 0 ? colors.ALERT_ERROR : colors.ALERT_SUCCESS;

    var dataModeStr = Settings.get("Data Mode", "LIVE").toUpperCase().trim();
    var dataModeLabel = dataModeStr === "LIVE" ? "🟢 LIVE DAILY MARKET DATA (EOD)" : "🔴 DEMO/MOCK SIMULATION DATA";

    var monitorRows = [
      ["Data Mode:", dataModeLabel],
      ["Data Source:", monitorStats.dataSource || "Yahoo Finance"],
      ["Last Update:", PlatformUtils.formatDate(monitorStats.lastSuccessfulUpdate || new Date()) + " " + PlatformUtils.formatTime(monitorStats.lastSuccessfulUpdate || new Date())],
      ["Stocks (OK):", monitorStats.stocksProcessed || 0],
      ["Stocks (Skipped):", monitorStats.stocksSkipped || 0],
      ["NIFTY Index Status:", monitorStats.benchmarkStatus || "🟢 ACTIVE / OK"],
      ["Compute Latency:", executionSec + " sec"],
      ["Database Health Status:", statusText]
    ];

    sheet.getRange("B6:C13").setValues(monitorRows.map(function(r) { return [r[0], ""]; }));
    sheet.getRange("B6:B13").setFontWeight("bold").setFontFamily(fonts.FAMILY).setFontSize(fonts.SIZE_BODY);

    // Write monitor values
    for (var i = 0; i < monitorRows.length; i++) {
      var cell = sheet.getRange("D" + (6 + i));
      cell.setValue(monitorRows[i][1])
          .setFontFamily(fonts.FAMILY)
          .setFontSize(fonts.SIZE_BODY)
          .setHorizontalAlignment("left");

      if (monitorRows[i][0].indexOf("Health") !== -1) {
        cell.setBackground(statusColor).setFontWeight("bold").setHorizontalAlignment("center");
      }
    }

    // Mathematical Proxy notice below monitor metrics
    var noticeCell = sheet.getRange("B14:D15");
    noticeCell.merge()
              .setValue("NOTICE: All 'NEW MONEY INFLOW PROXY' and 'CAPITAL ROTATION PROXY' metrics are calculated mathematical indicators tracking momentum, relative strength, and volume acceleration. They do not represent direct institutional order-flow or execution desk data.")
              .setBackground("#f8f9fa")
              .setFontColor("#555555")
              .setFontFamily(fonts.FAMILY)
              .setFontSize(7)
              .setVerticalAlignment("middle")
              .setWrap(true);

    // Border around Left Card Panel
    sheet.getRange("B5:D15").setBorder(true, true, true, true, false, false, colors.ACCENT, SpreadsheetApp.BorderStyle.SOLID);


    // Right Column Side-by-Side: Real-time System Alerts & Ingestion Status (E5:N15)
    var alertHeader = sheet.getRange("E5:N5");
    alertHeader.merge()
               .setValue("🚨 REAL-TIME SYSTEM ALERTS (MONEY FLOW & CAPITAL ROTATION)")
               .setBackground("#780000") // Warning Dark Red
               .setFontColor(colors.TEXT_LIGHT)
               .setFontWeight("bold")
               .setFontFamily(fonts.FAMILY)
               .setFontSize(fonts.SIZE_HEADER)
               .setHorizontalAlignment("center")
               .setVerticalAlignment("middle");

    var alertRows = [];
    var nowTimeStr = PlatformUtils.formatTime(new Date());

    if (activeAlerts.length > 0) {
      for (var i = 0; i < Math.min(8, activeAlerts.length); i++) {
        var a = activeAlerts[i];
        alertRows.push([
          a.type,
          a.sector,
          a.message,
          nowTimeStr,
          "", "", "", "", "", "" // Merge padding columns
        ]);
      }
    } else {
      alertRows.push(["HEALTHY 🟢", "System", "No sector-rotation shifts or high-volume anomalies found. Capital is steady.", nowTimeStr, "", "", "", "", "", ""]);
    }

    // Fill details inside the alerts block
    for (var i = 0; i < Math.min(8, alertRows.length); i++) {
      var rNum = 6 + i;
      sheet.getRange("E" + rNum + ":F" + rNum).merge().setValue(alertRows[i][0]).setFontWeight("bold").setHorizontalAlignment("center");
      sheet.getRange("G" + rNum + ":H" + rNum).merge().setValue(alertRows[i][1]).setHorizontalAlignment("center");
      sheet.getRange("I" + rNum + ":M" + rNum).merge().setValue(alertRows[i][2]).setWrap(true);
      sheet.getRange("N" + rNum).setValue(alertRows[i][3]).setHorizontalAlignment("center");

      var styleRowRange = sheet.getRange("E" + rNum + ":N" + rNum);
      styleRowRange.setFontFamily(fonts.FAMILY).setFontSize(fonts.SIZE_BODY);

      if (alertRows[i][0].indexOf("MONEY") !== -1 || alertRows[i][0].indexOf("EARLY") !== -1) {
        styleRowRange.setBackground("#fff3b0");
      } else if (alertRows[i][0].indexOf("CONFIRMED") !== -1 || alertRows[i][0].indexOf("ROTATION") !== -1) {
        styleRowRange.setBackground("#e2eafc");
      } else if (i % 2 === 1) {
        styleRowRange.setBackground(colors.BG_ALT);
      }
    }

    // Blank out unused lines in alert cards
    for (var i = alertRows.length; i < 9; i++) {
      var rNum = 6 + i;
      sheet.getRange("E" + rNum + ":N" + rNum).merge().setValue("");
    }

    sheet.getRange("E5:N15").setBorder(true, true, true, true, false, false, colors.ACCENT, SpreadsheetApp.BorderStyle.SOLID);


    // 2. Prioritized Sector Leaderboard (B17:N29)
    var leadStartRow = 17;
    var leadHeader = sheet.getRange(leadStartRow, 2, 1, 13);
    leadHeader.merge()
              .setValue("🏆 PRIORITIZED SECTOR ROTATION LEADERBOARD (RANKED BY SECTOR MONEY SCORE)")
              .setBackground(colors.PRIMARY_DARK)
              .setFontColor(colors.TEXT_LIGHT)
              .setFontWeight("bold")
              .setFontFamily(fonts.FAMILY)
              .setFontSize(fonts.SIZE_HEADER)
              .setHorizontalAlignment("center")
              .setVerticalAlignment("middle");

    var leadColumns = ["Rank (Chg)", "Sector Name", "Money Score", "Capital Rotation Proxy", "NEW MONEY INFLOW PROXY", "RVOL", "Vol Acc", "Breadth (%)", "RS vs NIFTY", "20D Return", "Top Stock", "Score 1D Δ", "Score 3D Δ"];
    var leadColRange = sheet.getRange(leadStartRow + 1, 2, 1, 13);
    leadColRange.setValues([leadColumns])
                .setBackground(colors.ACCENT)
                .setFontColor(colors.TEXT_LIGHT)
                .setFontWeight("bold")
                .setFontFamily(fonts.FAMILY)
                .setFontSize(fonts.SIZE_HEADER)
                .setHorizontalAlignment("center")
                .setVerticalAlignment("middle");

    var sectorTableRows = [];
    for (var i = 0; i < sectorsList.length; i++) {
      var s = sectorsList[i];

      var rankChgStr = s.rank;
      if (s.rankChange > 0) {
        rankChgStr += " (▲" + s.rankChange + ")";
      } else if (s.rankChange < 0) {
        rankChgStr += " (▼" + Math.abs(s.rankChange) + ")";
      } else {
        rankChgStr += " (=)";
      }

      var getChgSym = function(val) { return val >= 0.0 ? "+" : ""; };
      var inflowDetails = s.moneyInflow + " (" + s.moneyInflowScore.toFixed(0) + " | 1D: " + getChgSym(s.inflowChg1D) + s.inflowChg1D.toFixed(0) + " | 3D: " + getChgSym(s.inflowChg3D) + s.inflowChg3D.toFixed(0) + ")";

      var topStockSymbol = s.stocks[0] ? s.stocks[0].symbol : "None";

      sectorTableRows.push([
        rankChgStr,
        s.name,
        parseFloat(s.score.toFixed(2)),
        s.stage,
        inflowDetails,
        parseFloat(s.rvol.toFixed(2)),
        parseFloat(s.volAcc.toFixed(2)),
        parseFloat(s.breadth.toFixed(1)) + "%",
        parseFloat(s.rsVsNifty.toFixed(2)) + "%",
        parseFloat(s.ret20.toFixed(2)) + "%",
        topStockSymbol,
        parseFloat(s.inflowChg1D.toFixed(2)),
        parseFloat(s.inflowChg3D.toFixed(2))
      ]);
    }

    if (sectorTableRows.length > 0) {
      var leadBodyRange = sheet.getRange(leadStartRow + 2, 2, sectorTableRows.length, 13);
      leadBodyRange.setValues(sectorTableRows)
                   .setFontFamily(fonts.FAMILY)
                   .setFontSize(fonts.SIZE_BODY)
                   .setVerticalAlignment("middle");

      // Highlights and stripes
      for (var i = 0; i < sectorTableRows.length; i++) {
        var rowNum = leadStartRow + 2 + i;
        var rRange = sheet.getRange(rowNum, 2, 1, 13);

        if (i % 2 === 1) {
          rRange.setBackground(colors.BG_ALT);
        }

        // Color rotation state cell
        var stageCell = sheet.getRange(rowNum, 5); // Column 5 is Column E (Capital Rotation Stage)
        var stageText = sectorsList[i].stage;
        var sBg = colors.BG_ALT;

        if (stageText === "LEADING") sBg = colors.STATE_LEADING;
        else if (stageText === "EARLY INFLOW") sBg = colors.STATE_EARLY_INFLOW;
        else if (stageText === "CONFIRMED INFLOW") sBg = colors.STATE_CONFIRMED_INFLOW;
        else if (stageText === "WEAKENING") sBg = colors.STATE_WEAKENING;
        else if (stageText === "OUTFLOW") sBg = colors.STATE_OUTFLOW;
        else if (stageText === "BOTTOMING") sBg = colors.STATE_BOTTOMING;

        stageCell.setBackground(sBg).setFontWeight("bold");

        // First rank gets highlight
        if (i === 0) {
          sheet.getRange(rowNum, 2, 1, 3).setBackground(colors.GOLD_GOLD);
        }
      }

      leadBodyRange.setBorder(true, true, true, true, true, true, "#e0e0e0", SpreadsheetApp.BorderStyle.SOLID);
    }


    // 3. Category Group Watchlists & Alerts side-by-side (Row 32 onwards)
    var catStartRow = leadStartRow + 3 + sectorTableRows.length;

    // Col B to H: Category Watchlists
    var cwHeader = sheet.getRange(catStartRow, 2, 1, 6);
    cwHeader.merge()
            .setValue("📋 CAPITAL ROTATION WATCHLISTS & SIGNAL CLASSIFICATIONS")
            .setBackground(colors.PRIMARY_DARK)
            .setFontColor(colors.TEXT_LIGHT)
            .setFontWeight("bold")
            .setFontFamily(fonts.FAMILY)
            .setFontSize(fonts.SIZE_HEADER)
            .setHorizontalAlignment("center")
            .setVerticalAlignment("middle");

    var cwColumns = ["Stage Category", "Sectors Grouped", "Money Score", "Avg Breadth", "1D Δ Inflow", "Top Stock In Sector"];
    var cwColRange = sheet.getRange(catStartRow + 1, 2, 1, 6);
    cwColRange.setValues([cwColumns])
              .setBackground(colors.ACCENT)
              .setFontColor(colors.TEXT_LIGHT)
              .setFontWeight("bold")
              .setFontFamily(fonts.FAMILY)
              .setFontSize(fonts.SIZE_HEADER)
              .setHorizontalAlignment("center")
              .setVerticalAlignment("middle");

    // Group sectors by category
    var stagesToWatch = ["LEADING", "CONFIRMED INFLOW", "EARLY INFLOW", "BOTTOMING", "WEAKENING", "OUTFLOW"];
    var watchRows = [];

    for (var k = 0; k < stagesToWatch.length; k++) {
      var stageKey = stagesToWatch[k];
      var matchingSectors = sectorsList.filter(function(s) { return s.stage === stageKey; });

      if (matchingSectors.length > 0) {
        for (var m = 0; m < matchingSectors.length; m++) {
          var s = matchingSectors[m];
          var topStockSymbol = s.stocks[0] ? s.stocks[0].symbol : "None";
          watchRows.push([
            m === 0 ? stageKey : "", // Only show label on the first grouped row
            s.name,
            parseFloat(s.score.toFixed(2)),
            parseFloat(s.breadth.toFixed(1)) + "%",
            parseFloat(s.inflowChg1D.toFixed(1)),
            topStockSymbol
          ]);
        }
      } else {
        watchRows.push([
          stageKey,
          "No active sectors.",
          0.00,
          "0.0%",
          0.00,
          "N/A"
        ]);
      }
    }

    var cwBodyRange = sheet.getRange(catStartRow + 2, 2, watchRows.length, 6);
    cwBodyRange.setValues(watchRows)
               .setFontFamily(fonts.FAMILY)
               .setFontSize(fonts.SIZE_BODY)
               .setVerticalAlignment("middle");

    // Apply watch list stage styles
    var currentGroupStyle = "";
    var currentGroupColor = colors.BG_ALT;
    for (var i = 0; i < watchRows.length; i++) {
      var rNum = catStartRow + 2 + i;
      var stageText = watchRows[i][0];

      if (stageText) {
        currentGroupStyle = stageText;
        if (stageText === "LEADING") currentGroupColor = colors.STATE_LEADING;
        else if (stageText === "CONFIRMED INFLOW") currentGroupColor = colors.STATE_CONFIRMED_INFLOW;
        else if (stageText === "EARLY INFLOW") currentGroupColor = colors.STATE_EARLY_INFLOW;
        else if (stageText === "BOTTOMING") currentGroupColor = colors.STATE_BOTTOMING;
        else if (stageText === "WEAKENING") currentGroupColor = colors.STATE_WEAKENING;
        else currentGroupColor = colors.STATE_OUTFLOW;
      }

      sheet.getRange(rNum, 2).setBackground(currentGroupColor).setFontWeight("bold");

      if (i % 2 === 1) {
        sheet.getRange(rNum, 3, 1, 5).setBackground(colors.BG_ALT);
      }
    }
    cwBodyRange.setBorder(true, true, true, true, true, true, "#e0e0e0", SpreadsheetApp.BorderStyle.SOLID);


    // Col I to N: Priority Leading Stocks opportunities
    var sHeader = sheet.getRange(catStartRow, 8, 1, 7);
    sHeader.merge()
           .setValue("🎯 PRIORITY OPPORTUNITY LEADING STOCKS")
           .setBackground(colors.PRIMARY_DARK)
           .setFontColor(colors.TEXT_LIGHT)
           .setFontWeight("bold")
           .setFontFamily(fonts.FAMILY)
           .setFontSize(fonts.SIZE_HEADER)
           .setHorizontalAlignment("center")
           .setVerticalAlignment("middle");

    var sColumns = ["Symbol", "Sector Name", "Stock Score", "RVOL", "RS vs Nifty (%)", "20D Return", "Close Price"];
    var sColRange = sheet.getRange(catStartRow + 1, 8, 1, 7);
    sColRange.setValues([sColumns])
             .setBackground(colors.ACCENT)
             .setFontColor(colors.TEXT_LIGHT)
             .setFontWeight("bold")
             .setFontFamily(fonts.FAMILY)
             .setFontSize(fonts.SIZE_HEADER)
             .setHorizontalAlignment("center")
             .setVerticalAlignment("middle");

    // Gather top opportunities
    var stockRows = [];
    var counter = 0;
    for (var i = 0; i < sectorsList.length; i++) {
      var s = sectorsList[i];
      for (var j = 0; j < Math.min(2, s.stocks.length); j++) {
        var stock = s.stocks[j];
        stockRows.push([
          stock.symbol,
          s.name,
          parseFloat(stock.score.toFixed(2)),
          parseFloat(stock.rvol.toFixed(2)),
          parseFloat(stock.rsVsNifty.toFixed(2)) + "%",
          parseFloat(stock.ret20.toFixed(2)) + "%",
          parseFloat(stock.price.toFixed(2))
        ]);
        counter++;
        if (counter >= watchRows.length) break; // Keep side-by-side tables perfectly aligned
      }
      if (counter >= watchRows.length) break;
    }

    // Padding empty lines if stocks count is smaller
    for (var i = stockRows.length; i < watchRows.length; i++) {
      stockRows.push(["N/A", "No Sector Data", 0.00, 1.00, "0.0%", "0.0%", 0.00]);
    }

    var sBodyRange = sheet.getRange(catStartRow + 2, 8, stockRows.length, 7);
    sBodyRange.setValues(stockRows)
              .setFontFamily(fonts.FAMILY)
              .setFontSize(fonts.SIZE_BODY)
              .setVerticalAlignment("middle");

    for (var i = 0; i < stockRows.length; i++) {
      if (i % 2 === 1) {
        sheet.getRange(catStartRow + 2 + i, 8, 1, 7).setBackground(colors.BG_ALT);
      }
    }
    sBodyRange.setBorder(true, true, true, true, true, true, "#e0e0e0", SpreadsheetApp.BorderStyle.SOLID);


    // Formatting Row Heights
    sheet.setRowHeight(2, 35);
    sheet.setRowHeight(3, 20);
    sheet.setRowHeight(5, 26);
    sheet.setRowHeight(leadStartRow, 28);
    sheet.setRowHeight(leadStartRow + 1, 24);
    sheet.setRowHeight(catStartRow, 28);
    sheet.setRowHeight(catStartRow + 1, 24);

    for (var r = 6; r <= 14; r++) {
      sheet.setRowHeight(r, 22);
    }
    for (var r = leadStartRow + 2; r < leadStartRow + 2 + sectorTableRows.length; r++) {
      sheet.setRowHeight(r, 22);
    }
    for (var r = catStartRow + 2; r < catStartRow + 2 + watchRows.length; r++) {
      sheet.setRowHeight(r, 22);
    }
  }
}
