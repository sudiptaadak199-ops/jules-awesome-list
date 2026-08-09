/**
 * SA Stock Research & Backtest Platform - Phase 1 (Foundation)
 *
 * Sector Rotation Engine Module
 *
 * Implements full 14-step architecture:
 * 1. Read master listings and historical pricing data in-memory.
 * 2. Calculate stock-level technical metrics (EMA 20, EMA 50, RVOL, Vol Acceleration, Returns, Trend Breadth, and RS vs Nifty).
 * 3. Formulate individual Stock Rotation Scores and New Money Inflow Scores.
 * 4. Aggregate metrics by sector.
 * 5. Classify sectors into five distinct stages.
 * 6. Detect New Money Inflows and stage rotation shifts.
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

      // Helper function to find the NIFTY close on or closest to a target date string
      var findNiftyClose = function(targetDateStr) {
        if (niftyHistory.length === 0) return 0.0;
        var targetTime = new Date(targetDateStr).getTime();
        var closestEntry = niftyHistory[0];
        var minDiff = Math.abs(new Date(closestEntry.date).getTime() - targetTime);

        for (var n = 1; n < niftyHistory.length; n++) {
          var diff = Math.abs(new Date(niftyHistory[n].date).getTime() - targetTime);
          if (diff < minDiff) {
            minDiff = diff;
            closestEntry = niftyHistory[n];
          }
        }
        return closestEntry.close;
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

        // Stock Breadth indicator: close above 20 EMA
        var isAboveEma = latest.close >= latestEma20;

        // Stock Rotation Score
        // Formula: 40% 20D Return + 30% RS vs Nifty + 20% RVOL + 10% EMA Trend
        var emaTrendBonus = isAboveEma ? 10 : 0;
        var score = (ret20 * 4.0) + (rsVsNifty * 3.0) + (rvol * 2.0) + emaTrendBonus;
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
          isAboveEma: isAboveEma,
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
            aboveEmaCount: 0,
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
        if (m.isAboveEma) {
          s.aboveEmaCount += 1;
        }
        s.stocks.push(m);
      }

      // Load previous snapshot history for changes comparison
      var prevSnapshotMap = {};
      try {
        var sHistSheet = ss.getSheetByName(Config.SHEETS.SECTOR_HISTORY);
        if (sHistSheet && sHistSheet.getLastRow() > 1) {
          var lastRow = sHistSheet.getLastRow();
          var histRows = sHistSheet.getRange(2, 1, lastRow - 1, 9).getValues();
          // Read backwards to capture the most recent unique snapshot of each sector
          for (var i = histRows.length - 1; i >= 0; i--) {
            var secName = String(histRows[i][1]).trim();
            if (secName && !prevSnapshotMap[secName]) {
              // Parse New Money Score from the Inflow column e.g. "STRONG INFLOW (85)" -> 85
              var inflowStr = String(histRows[i][5]);
              var scoreMatch = inflowStr.match(/\(\s*(\d+)/);
              var prevNewMoney = scoreMatch ? parseFloat(scoreMatch[1]) : 50.0;

              // Parse previous RVOL from description if possible, or fall back to 1.0
              var rvolMatch = inflowStr.match(/RVOL=([\d.]+)/);
              var prevRvol = rvolMatch ? parseFloat(rvolMatch[1]) : 1.0;

              prevSnapshotMap[secName] = {
                score: parseFloat(histRows[i][2]),
                rank: parseInt(histRows[i][3]),
                stage: String(histRows[i][4]).trim(),
                moneyInflowScore: prevNewMoney,
                breadth: parseFloat(histRows[i][6]),
                rs: parseFloat(histRows[i][7]),
                rvol: prevRvol
              };
            }
          }
        }
      } catch (snapshotErr) {
        console.warn("Failed to load previous snapshots: " + snapshotErr.message);
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
        var breadthPct = count > 0 ? ((s.aboveEmaCount / count) * 100) : 0.0;

        if (isNaN(avgScore) || !isFinite(avgScore)) avgScore = 0.0;
        if (isNaN(avgRvol) || !isFinite(avgRvol)) avgRvol = 1.0;
        if (isNaN(avgVolAcc) || !isFinite(avgVolAcc)) avgVolAcc = 1.0;
        if (isNaN(avgRet5) || !isFinite(avgRet5)) avgRet5 = 0.0;
        if (isNaN(avgRet20) || !isFinite(avgRet20)) avgRet20 = 0.0;
        if (isNaN(avgRs) || !isFinite(avgRs)) avgRs = 0.0;

        // Sort stocks inside the sector to prioritize leading stocks
        s.stocks.sort(function(a, b) {
          return b.score - a.score;
        });

        // Quantify raw Money Inflow Score
        var rawMoneyScore = (avgRvol * 35.0) + (avgVolAcc * 25.0) + ((breadthPct / 100.0) * 25.0) + (avgRs * 15.0);
        // Normalize New Money Score exactly to 0-100!
        var normalizedMoney = Math.min(100.0, Math.max(0.0, (rawMoneyScore / 1.5) * 100.0 / 75.0));
        if (isNaN(normalizedMoney) || !isFinite(normalizedMoney)) normalizedMoney = 50.0;

        // Pull previous values to calculate changes
        var prev = prevSnapshotMap[secName] || {
          score: avgScore,
          rank: 3, // Initial fallback
          stage: "OUTFLOW",
          moneyInflowScore: normalizedMoney,
          breadth: breadthPct,
          rvol: avgRvol,
          rs: avgRs
        };

        var moneyScoreChange = normalizedMoney - prev.moneyInflowScore;
        var breadthChange = breadthPct - prev.breadth;
        var rvolChange = avgRvol - prev.rvol;

        if (isNaN(moneyScoreChange)) moneyScoreChange = 0.0;
        if (isNaN(breadthChange)) breadthChange = 0.0;
        if (isNaN(rvolChange)) rvolChange = 0.0;

        sectorsList.push({
          name: secName,
          score: avgScore,
          rvol: avgRvol,
          volAcc: avgVolAcc,
          ret5: avgRet5,
          ret20: avgRet20,
          rsVsNifty: avgRs,
          breadth: breadthPct,
          moneyInflowScore: normalizedMoney,
          moneyScoreChange: moneyScoreChange,
          breadthChange: breadthChange,
          rvolChange: rvolChange,
          prevRank: prev.rank,
          prevStage: prev.stage,
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
        // If first run, prevRank will default to current rank (i+1) inside MainOrchestrator fallback
        var pRank = sectorsList[i].prevRank !== undefined ? sectorsList[i].prevRank : (i + 1);
        sectorsList[i].rankChange = pRank - (i + 1); // Positive is Rank Improvement (Rank 4 -> 2 is +2!)
        if (isNaN(sectorsList[i].rankChange)) sectorsList[i].rankChange = 0;
      }

      // 6. Refined 6-Stage Rotation State Classifications
      for (var i = 0; i < sectorsList.length; i++) {
        var s = sectorsList[i];

        // SIX SEPARATE ROTATION STATES
        var stage = "OUTFLOW";
        if (s.moneyInflowScore > 70.0 && s.volAcc > 1.25 && s.breadthChange > 0) {
          stage = "CONFIRMED INFLOW";
        } else if (s.score < 55.0 && (s.moneyScoreChange > 15.0 || s.rvolChange > 0.35)) {
          stage = "EARLY INFLOW";
        } else if (s.score >= 58.0 && s.rsVsNifty >= 0.0) {
          stage = "LEADING";
        } else if (s.score >= 52.0 && (s.ret20 < 0.0 || s.moneyScoreChange < -5.0 || s.rsVsNifty < 0.0)) {
          stage = "WEAKENING";
        } else if (s.score < 52.0 && (s.moneyScoreChange > 3.0 || s.ret5 > 0 || s.rvolChange > 0.1)) {
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

      // 8. Generate Alerts & Save stage cache
      var activeAlerts = [];
      var newStageCache = {};

      for (var i = 0; i < sectorsList.length; i++) {
        var s = sectorsList[i];
        newStageCache[s.name] = s.stage;

        var prevStage = previousStages[s.name];
        if (prevStage && prevStage !== s.stage) {
          activeAlerts.push({
            type: "ROTATION ALERT 🔄",
            sector: s.name,
            message: "EOD Sector rotation shifted from [" + prevStage + "] to [" + s.stage + "]!"
          });
        }

        if (s.stage === "EARLY INFLOW") {
          activeAlerts.push({
            type: "EARLY INFLOW ⚡",
            sector: s.name,
            message: "Fresh capital accumulation detected in [" + s.name + "]! Inflow Score change: +" + s.moneyScoreChange.toFixed(0)
          });
        }
      }

      // Cache current stages for next execution
      Cache.put("PREV_SECTOR_STAGES", JSON.stringify(newStageCache), 24 * 60); // 24 hours TTL

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

    // Style design tokens
    var theme = Config.THEME;
    var colors = theme.COLORS;
    var fonts = theme.FONTS;

    // Title Block
    sheet.getRange("B2:H2").merge()
         .setValue(Config.METADATA.NAME.toUpperCase())
         .setFontSize(fonts.SIZE_TITLE)
         .setFontWeight("bold")
         .setFontColor(colors.PRIMARY_DARK)
         .setFontFamily(fonts.FAMILY)
         .setHorizontalAlignment("center")
         .setVerticalAlignment("middle");

    sheet.getRange("B3:H3").merge()
         .setValue("Sector Rotation & Institutional Money Flow Analyzer • Daily End-Of-Day Analytics")
         .setFontSize(fonts.SIZE_SUBTITLE)
         .setFontStyle("italic")
         .setFontColor(colors.ACCENT)
         .setFontFamily(fonts.FAMILY)
         .setHorizontalAlignment("center")
         .setVerticalAlignment("middle");

    // 1. Performance Monitor Panel (E5:H9)
    var monHeader = sheet.getRange("E5:H5");
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
      ["Last Successful Update:", PlatformUtils.formatDate(new Date()) + " " + PlatformUtils.formatTime(new Date())],
      ["Stocks Processed (Sufficient):", monitorStats.stocksProcessed],
      ["Stocks Skipped (History < 50D):", monitorStats.stocksSkipped],
      ["NIFTY Benchmark Status:", monitorStats.benchmarkStatus],
      ["Active Sectors Processed:", monitorStats.sectorsProcessed],
      ["Data Rows Updated / Saved:", monitorStats.dataRowsUpdated],
      ["API Requests / Failures:", monitorStats.apiRequests + " / " + monitorStats.failedRequests],
      ["Execution Compute Speed:", executionSec + " sec"],
      ["System Database Status:", statusText]
    ];

    sheet.getRange("E6:F14").setValues(monitorRows.map(function(r) { return [r[0], ""]; }));
    sheet.getRange("E6:E14").setFontWeight("bold").setFontFamily(fonts.FAMILY).setFontSize(fonts.SIZE_BODY);

    // Set actual values next to keys
    for (var i = 0; i < monitorRows.length; i++) {
      var cell = sheet.getRange("G" + (6 + i) + ":H" + (6 + i));
      cell.merge()
          .setValue(monitorRows[i][1])
          .setFontFamily(fonts.FAMILY)
          .setFontSize(fonts.SIZE_BODY)
          .setHorizontalAlignment("left");

      if (monitorRows[i][0].indexOf("Status") !== -1) {
        cell.setBackground(statusColor).setFontWeight("bold").setHorizontalAlignment("center");
      }
    }

    // Border around Performance Monitor
    sheet.getRange("E5:H14").setBorder(true, true, true, true, false, false, colors.ACCENT, SpreadsheetApp.BorderStyle.SOLID);

    // ==========================================
    // DATA INGESTION MODE HIGHLIGHT CELL (E15:H15)
    // ==========================================
    var dataMode = Settings.get("Data Mode", "LIVE").toUpperCase().trim();
    var modeCell = sheet.getRange("E15:H15");
    modeCell.merge();
    if (dataMode === "LIVE") {
      modeCell.setValue("🟢 LIVE DAILY MARKET DATA (EOD)")
              .setBackground("#d8f3dc") // light green alert
              .setFontColor("#1b4332")
              .setFontWeight("bold")
              .setFontFamily(fonts.FAMILY)
              .setFontSize(fonts.SIZE_HEADER)
              .setHorizontalAlignment("center")
              .setVerticalAlignment("middle");
    } else {
      modeCell.setValue("⚠️ INGESTION MODE: DEMO/MOCK SIMULATION DATA")
              .setBackground("#f8d7da") // soft red alert
              .setFontColor("#721c24")
              .setFontWeight("bold")
              .setFontFamily(fonts.FAMILY)
              .setFontSize(fonts.SIZE_HEADER)
              .setHorizontalAlignment("center")
              .setVerticalAlignment("middle");
    }
    modeCell.setBorder(true, true, true, true, false, false, colors.ACCENT, SpreadsheetApp.BorderStyle.SOLID);

    // Quick platform guidelines Box (B5:C14)
    var guideBox = sheet.getRange("B5:C14");
    guideBox.merge()
            .setValue("ZERO-MANUAL-WORK PRINCIPLE:\n\n" +
                      "• Open this Dashboard to instantly check where institutional capital is entering NSE.\n" +
                      "• The platform automatically tracks EOD daily prices, computes RVOL, ranks sectors, and triggers alerts.\n" +
                      "• Change update delays or trigger periods inside the Settings sheet.\n" +
                      "• Under the hood, the calculation engine runs on pure in-memory matrix computations for rapid speed.")
            .setBackground(colors.INFO_BOX_BG)
            .setFontColor(colors.TEXT_DARK)
            .setFontFamily(fonts.FAMILY)
            .setFontSize(fonts.SIZE_BODY)
            .setVerticalAlignment("top")
            .setWrap(true);
    guideBox.setBorder(true, true, true, true, false, false, colors.ACCENT, SpreadsheetApp.BorderStyle.SOLID);


    // 2. Prioritized Sector Leaderboard (B16:H27)
    var leadStartRow = 16;
    var leadHeader = sheet.getRange(leadStartRow, 2, 1, 7);
    leadHeader.merge()
              .setValue("🏆 PRIORITIZED SECTOR ROTATION LEADERBOARD (RANKED BY INSTITUTIONAL SCORE)")
              .setBackground(colors.PRIMARY_DARK)
              .setFontColor(colors.TEXT_LIGHT)
              .setFontWeight("bold")
              .setFontFamily(fonts.FAMILY)
              .setFontSize(fonts.SIZE_HEADER)
              .setHorizontalAlignment("center")
              .setVerticalAlignment("middle");

    var leadColumns = ["Rank (Chg)", "Sector Name", "Rotation Score", "Rotation Stage", "New Money Inflow", "RS vs Nifty (%)", "Breadth (%)"];
    var leadColRange = sheet.getRange(leadStartRow + 1, 2, 1, 7);
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

      // Format Rank Change e.g. "2 (+1)" or "4 (-2)" or "3 (=)"
      var rankChgStr = s.rank;
      if (s.rankChange > 0) {
        rankChgStr += " (▲" + s.rankChange + ")";
      } else if (s.rankChange < 0) {
        rankChgStr += " (▼" + Math.abs(s.rankChange) + ")";
      } else {
        rankChgStr += " (=)";
      }

      // Format Money Inflow with Normalized Score Change
      var chgSymbol = s.moneyScoreChange >= 0 ? "+" : "";
      var inflowStr = s.moneyInflow + " (" + s.moneyInflowScore.toFixed(0) + " | " + chgSymbol + s.moneyScoreChange.toFixed(0) + ")";

      sectorTableRows.push([
        rankChgStr,
        s.name,
        parseFloat(s.score.toFixed(2)),
        s.stage,
        inflowStr,
        parseFloat(s.rsVsNifty.toFixed(2)) + "%",
        parseFloat(s.breadth.toFixed(1)) + "%"
      ]);
    }

    if (sectorTableRows.length > 0) {
      var leadBodyRange = sheet.getRange(leadStartRow + 2, 2, sectorTableRows.length, 7);
      leadBodyRange.setValues(sectorTableRows)
                   .setFontFamily(fonts.FAMILY)
                   .setFontSize(fonts.SIZE_BODY)
                   .setVerticalAlignment("middle");

      // Zebra-striping and stage background highlights
      for (var i = 0; i < sectorTableRows.length; i++) {
        var rowNum = leadStartRow + 2 + i;
        var rRange = sheet.getRange(rowNum, 2, 1, 7);

        // Standard alternate rows color
        if (i % 2 === 1) {
          rRange.setBackground(colors.BG_ALT);
        }

        // Apply distinct colors to the 6 separate rotation states
        var stageCell = sheet.getRange(rowNum, 5); // Stage column (Col E is index 5 under 1-based columns)
        var stageText = sectorTableRows[i][3];
        var sBg = colors.BG_ALT;

        if (stageText === "LEADING") sBg = colors.STATE_LEADING;
        else if (stageText === "EARLY INFLOW") sBg = colors.STATE_EARLY_INFLOW;
        else if (stageText === "CONFIRMED INFLOW") sBg = colors.STATE_CONFIRMED_INFLOW;
        else if (stageText === "WEAKENING") sBg = colors.STATE_WEAKENING;
        else if (stageText === "OUTFLOW") sBg = colors.STATE_OUTFLOW;
        else if (stageText === "BOTTOMING") sBg = colors.STATE_BOTTOMING;

        stageCell.setBackground(sBg).setFontWeight("bold");

        // Highlight first Rank
        if (i === 0) {
          sheet.getRange(rowNum, 2, 1, 3).setBackground(colors.GOLD_GOLD);
        }
      }

      sheet.getRange(leadStartRow + 2, 2, sectorTableRows.length, 7).setBorder(true, true, true, true, true, true, "#e0e0e0", SpreadsheetApp.BorderStyle.SOLID);
    }


    // 3. Top Stocks Opportunities & Active Alert Feed Panels Side-by-Side (B31:H45)
    var nextStartRow = leadStartRow + 3 + sectorTableRows.length;

    // Col B to D: Top Stocks (3 columns: Symbol, Sector, Rotation Score)
    var tsHeader = sheet.getRange(nextStartRow, 2, 1, 3);
    tsHeader.merge()
            .setValue("🎯 PRIORITY LEADING STOCKS")
            .setBackground(colors.PRIMARY_DARK)
            .setFontColor(colors.TEXT_LIGHT)
            .setFontWeight("bold")
            .setFontFamily(fonts.FAMILY)
            .setFontSize(fonts.SIZE_HEADER)
            .setHorizontalAlignment("center")
            .setVerticalAlignment("middle");

    var tsColumns = ["Symbol", "Sector", "Stock Score"];
    var tsColRange = sheet.getRange(nextStartRow + 1, 2, 1, 3);
    tsColRange.setValues([tsColumns])
              .setBackground(colors.ACCENT)
              .setFontColor(colors.TEXT_LIGHT)
              .setFontWeight("bold")
              .setFontFamily(fonts.FAMILY)
              .setFontSize(fonts.SIZE_HEADER)
              .setHorizontalAlignment("center")
              .setVerticalAlignment("middle");

    // Gather top 2 stocks from each leading sector
    var topStocksRows = [];
    var limitCount = 0;
    for (var i = 0; i < sectorsList.length; i++) {
      var s = sectorsList[i];
      for (var j = 0; j < Math.min(2, s.stocks.length); j++) {
        var stock = s.stocks[j];
        topStocksRows.push([
          stock.symbol,
          s.name,
          parseFloat(stock.score.toFixed(2))
        ]);
        limitCount++;
        if (limitCount >= 8) break; // Display top 8 opportunities
      }
      if (limitCount >= 8) break;
    }

    if (topStocksRows.length > 0) {
      var tsBodyRange = sheet.getRange(nextStartRow + 2, 2, topStocksRows.length, 3);
      tsBodyRange.setValues(topStocksRows)
                 .setFontFamily(fonts.FAMILY)
                 .setFontSize(fonts.SIZE_BODY)
                 .setVerticalAlignment("middle");

      for (var i = 0; i < topStocksRows.length; i++) {
        if (i % 2 === 1) {
          sheet.getRange(nextStartRow + 2 + i, 2, 1, 3).setBackground(colors.BG_ALT);
        }
      }
      tsBodyRange.setBorder(true, true, true, true, true, true, "#e0e0e0", SpreadsheetApp.BorderStyle.SOLID);
    }


    // Col E to H: Active Alert Feed (4 columns: Alert Type, Sector, Alert Message)
    var alertHeader = sheet.getRange(nextStartRow, 5, 1, 4);
    alertHeader.merge()
               .setValue("🚨 REAL-TIME SYSTEM ALERTS (MONEY FLOW & STAGE SHIFTS)")
               .setBackground("#780000") // Warning Dark Red
               .setFontColor(colors.TEXT_LIGHT)
               .setFontWeight("bold")
               .setFontFamily(fonts.FAMILY)
               .setFontSize(fonts.SIZE_HEADER)
               .setHorizontalAlignment("center")
               .setVerticalAlignment("middle");

    var alertColumns = ["Alert Class", "Target", "Detail Notification", "Time"];
    var alertColRange = sheet.getRange(nextStartRow + 1, 5, 1, 4);
    alertColRange.setValues([alertColumns])
                 .setBackground(colors.ACCENT)
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
          nowTimeStr
        ]);
      }
    } else {
      alertRows.push(["HEALTHY 🟢", "System", "No sector-rotation shifts or high-volume anomalies found. Capital is steady.", nowTimeStr]);
    }

    var alertBodyRange = sheet.getRange(nextStartRow + 2, 5, alertRows.length, 4);
    alertBodyRange.setValues(alertRows)
                  .setFontFamily(fonts.FAMILY)
                  .setFontSize(fonts.SIZE_BODY)
                  .setVerticalAlignment("middle");

    for (var i = 0; i < alertRows.length; i++) {
      var rowNum = nextStartRow + 2 + i;
      if (alertRows[i][0].indexOf("MONEY") !== -1 || alertRows[i][0].indexOf("EARLY") !== -1) {
        sheet.getRange(rowNum, 5, 1, 4).setBackground("#fff3b0"); // Highlight golden warning
      } else if (alertRows[i][0].indexOf("ROTATION") !== -1) {
        sheet.getRange(rowNum, 5, 1, 4).setBackground("#e2eafc"); // Soft Blue highlight
      } else if (i % 2 === 1) {
        sheet.getRange(rowNum, 5, 1, 4).setBackground(colors.BG_ALT);
      }
    }
    alertBodyRange.setBorder(true, true, true, true, true, true, "#e0e0e0", SpreadsheetApp.BorderStyle.SOLID);

    // Apply auto-row heights to headers to make it clean
    sheet.setRowHeight(2, 35);
    sheet.setRowHeight(3, 20);
    sheet.setRowHeight(5, 26);
    sheet.setRowHeight(leadStartRow, 28);
    sheet.setRowHeight(leadStartRow + 1, 24);
    sheet.setRowHeight(nextStartRow, 28);
    sheet.setRowHeight(nextStartRow + 1, 24);
  }
}
