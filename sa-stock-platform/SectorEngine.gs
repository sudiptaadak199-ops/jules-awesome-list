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

      // Group historical data by Symbol: { SYMBOL: [ {date, close, volume}, ... ] }
      var stockHistories = {};
      for (var i = 0; i < histData.length; i++) {
        var symbol = String(histData[i][0]).trim();
        var date = histData[i][1];
        var close = parseFloat(histData[i][5]);
        var volume = parseFloat(histData[i][7]);

        if (!symbol || isNaN(close) || isNaN(volume)) continue;

        if (!stockHistories[symbol]) {
          stockHistories[symbol] = [];
        }
        stockHistories[symbol].push({
          date: date,
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

      // 3. Compute Advanced Stock Metrics & Scores in-memory
      var stockMetricsList = [];
      for (var i = 0; i < activeStocks.length; i++) {
        var symbol = activeStocks[i];
        if (symbol === "NIFTY") continue; // Skip Nifty benchmark itself from stock metrics

        var history = stockHistories[symbol] || [];

        // Exclude stocks with insufficient history (< 50 days to support EMA20/EMA50 metrics correctly)
        if (history.length < 50) {
          stocksSkipped++;
          console.warn("Skipping stock [" + symbol + "] due to insufficient history: " + history.length + " rows (required >= 50).");
          continue;
        }

        stocksSufficient++;
        var len = history.length;
        var latest = history[len - 1];

        // Extracted Price Closes for EMA calculations
        var closes = history.map(function(h) { return h.close; });
        var ema20Values = this.calculateEMA(closes, 20);
        var ema50Values = this.calculateEMA(closes, 50);

        var latestEma20 = ema20Values[len - 1] || latest.close;
        var latestEma50 = ema50Values[len - 1] || latest.close;

        // Current Volume
        var curVol = latest.volume;

        // Volume Baseline: EXCLUDE current day's volume from the 20-day baseline
        var sumVol20 = 0;
        var prev20Start = Math.max(0, len - 21);
        var prev20End = len - 2;
        var countVol20 = 0;
        for (var j = prev20Start; j <= prev20End; j++) {
          sumVol20 += history[j].volume;
          countVol20++;
        }
        var avgVol20 = countVol20 > 0 ? (sumVol20 / countVol20) : latest.volume;

        // RVOL (Relative Volume)
        var rvol = avgVol20 > 0 ? (curVol / avgVol20) : 1.0;
        if (isNaN(rvol) || !isFinite(rvol)) rvol = 1.0;

        // Volume Acceleration: COMPUTE using previous completed 5D periods (excluding current day index len-1)
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

        // Returns: 5D and 20D with safety divide-by-zero checks
        var prev5Index = Math.max(0, len - 6);
        var prev20Index = Math.max(0, len - 21);

        var p5Close = history[prev5Index] ? history[prev5Index].close : 0.0;
        var p20Close = history[prev20Index] ? history[prev20Index].close : 0.0;

        var ret5 = 0.0;
        if (p5Close > 0.0) {
          ret5 = ((latest.close - p5Close) / p5Close) * 100;
        }

        var ret20 = 0.0;
        if (p20Close > 0.0) {
          ret20 = ((latest.close - p20Close) / p20Close) * 100;
        }

        if (isNaN(ret5) || !isFinite(ret5)) ret5 = 0.0;
        if (isNaN(ret20) || !isFinite(ret20)) ret20 = 0.0;

        // Relative Strength vs NIFTY index (NO fabrication if missing)
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
          if (isNaN(niftyRet20) || !isFinite(niftyRet20)) niftyRet20 = 0.0;
          rsVsNifty = ret20 - niftyRet20;
        }
        if (isNaN(rsVsNifty) || !isFinite(rsVsNifty)) rsVsNifty = 0.0;

        // Stock Breadth indicators
        var isAboveEma20 = latest.close >= latestEma20;
        var isAboveEma50 = latest.close >= latestEma50;

        // Stock Money Score (Proxy for capital accumulation/volume breakout)
        // Combined Score: 30% RS vs Nifty, 30% 20D momentum, 20% RVOL, 10% Vol Acceleration, 10% Trend Breadth
        var score = (rsVsNifty * 3.0) + (ret20 * 3.0) + (rvol * 2.0) + (volAcc * 1.0) + (isAboveEma20 ? 10 : 0);
        if (isNaN(score) || !isFinite(score)) score = 0.0;

        stockMetricsList.push({
          symbol: symbol,
          company: symbolToCompany[symbol],
          sector: symbolToSector[symbol],
          price: latest.close,
          ema20: latestEma20,
          ema50: latestEma50,
          volume: curVol,
          rvol: rvol,
          volAcc: volAcc,
          ret5: ret5,
          ret20: ret20,
          rsVsNifty: rsVsNifty,
          isAboveEma20: isAboveEma20,
          isAboveEma50: isAboveEma50,
          score: score
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
            rvolSum: 0,
            volAccSum: 0,
            ret5Sum: 0,
            ret20Sum: 0,
            rsSum: 0,
            aboveEma20Count: 0,
            aboveEma50Count: 0,
            stocks: []
          };
        }
        var s = sectorMap[m.sector];
        s.scoresSum += m.score;
        s.rvolSum += m.rvol;
        s.volAccSum += m.volAcc;
        s.ret5Sum += m.ret5;
        s.ret20Sum += m.ret20;
        s.rsSum += m.rsVsNifty;
        if (m.isAboveEma20) {
          s.aboveEma20Count += 1;
        }
        if (m.isAboveEma50) {
          s.aboveEma50Count += 1;
        }
        s.stocks.push(m);
      }

      // Load sector historical timelines for 1D, 3D, 5D change analysis
      var sectorHistoryTimelines = {}; // { secName: [ {score, inflowScore, breadth, rvol, stage}, ... ] }
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
        var avgRvol = s.rvolSum / count;
        var avgVolAcc = s.volAccSum / count;
        var avgRet5 = s.ret5Sum / count;
        var avgRet20 = s.ret20Sum / count;
        var avgRs = s.rsSum / count;
        var breadthPct = count > 0 ? ((s.aboveEma20Count / count) * 100) : 0.0;

        if (isNaN(avgScore) || !isFinite(avgScore)) avgScore = 0.0;
        if (isNaN(avgRvol) || !isFinite(avgRvol)) avgRvol = 1.0;
        if (isNaN(avgVolAcc) || !isFinite(avgVolAcc)) avgVolAcc = 1.0;
        if (isNaN(avgRet5) || !isFinite(avgRet5)) avgRet5 = 0.0;
        if (isNaN(avgRet20) || !isFinite(avgRet20)) avgRet20 = 0.0;
        if (isNaN(avgRs) || !isFinite(avgRs)) avgRs = 0.0;

        // Sort stocks inside the sector by Individual Stock Money Score
        s.stocks.sort(function(a, b) {
          return b.score - a.score;
        });

        // Compute dedicated New Money Inflow Score
        var rawMoneyScore = (avgRvol * 35.0) + (avgVolAcc * 25.0) + ((breadthPct / 100.0) * 25.0) + (avgRs * 15.0);
        var normalizedMoney = Math.min(100.0, Math.max(0.0, (rawMoneyScore / 1.5) * 100.0 / 75.0));
        if (isNaN(normalizedMoney) || !isFinite(normalizedMoney)) normalizedMoney = 50.0;

        // Multi-period change extraction (1D, 3D, 5D)
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
          score: avgScore, // Sector Money Score
          rvol: avgRvol,
          volAcc: avgVolAcc,
          ret5: avgRet5,
          ret20: avgRet20,
          rsVsNifty: avgRs,
          breadth: breadthPct,
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

      // 5. Sort Sector Ranking and Compute Rank Changes
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

    var executionSec = (monitorStats.executionTime / 1000).toFixed(2);
    var statusText = monitorStats.failedRequests > 0 ? "⚠️ WARNING" : "✅ HEALTHY";
    var statusColor = monitorStats.failedRequests > 0 ? colors.ALERT_ERROR : colors.ALERT_SUCCESS;

    var monitorRows = [
      ["Last Update:", PlatformUtils.formatDate(new Date()) + " " + PlatformUtils.formatTime(new Date())],
      ["Stocks (OK):", monitorStats.stocksProcessed],
      ["Stocks (Skipped):", monitorStats.stocksSkipped],
      ["NIFTY Index Status:", monitorStats.benchmarkStatus],
      ["API Requests / Errors:", monitorStats.apiRequests + " / " + monitorStats.failedRequests],
      ["Compute Latency:", executionSec + " sec"],
      ["Database Health Status:", statusText]
    ];

    sheet.getRange("B6:C12").setValues(monitorRows.map(function(r) { return [r[0], ""]; }));
    sheet.getRange("B6:B12").setFontWeight("bold").setFontFamily(fonts.FAMILY).setFontSize(fonts.SIZE_BODY);

    // Write monitor values
    for (var i = 0; i < monitorRows.length; i++) {
      var cell = sheet.getRange("D" + (6 + i));
      cell.setValue(monitorRows[i][1])
          .setFontFamily(fonts.FAMILY)
          .setFontSize(fonts.SIZE_BODY)
          .setHorizontalAlignment("left");

      if (monitorRows[i][0].indexOf("Status") !== -1) {
        cell.setBackground(statusColor).setFontWeight("bold").setHorizontalAlignment("center");
      }
    }

    // Mathematical Proxy notice below monitor metrics
    var noticeCell = sheet.getRange("B13:D15");
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
