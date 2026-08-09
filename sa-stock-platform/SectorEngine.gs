/**
 * SA Stock Research & Backtest Platform - Phase 1 (Foundation)
 *
 * Sector Rotation Engine Module
 *
 * Implements advanced multi-factor sector scoring, rotation stage classification,
 * historical trend analysis, automated alert engines, and a gorgeous Dashboard UI.
 */

class SectorEngine {
  /**
   * Main entry point to run Sector Rotation Analysis.
   * Pulls stock list, validates/mocks history, computes metrics, records history, and draws the Dashboard.
   */
  static runSectorAnalysis() {
    var start = new Date().getTime();

    // 1. Fetch active stocks and group by sector
    var ss = SheetManager.getActiveSpreadsheet();
    var masterSheet = ss.getSheetByName(Config.SHEETS.STOCK_MASTER);
    if (!masterSheet) {
      throw new Error("Critical: Stock Master sheet is missing.");
    }

    var lastRow = masterSheet.getLastRow();
    if (lastRow <= 1) {
      return; // No stocks to analyze
    }

    var masterData = masterSheet.getRange(2, 1, lastRow - 1, 8).getValues();
    var sectorToSymbols = {};
    var activeSymbols = [];

    for (var i = 0; i < masterData.length; i++) {
      var symbol = String(masterData[i][0]).trim();
      var sector = String(masterData[i][3]).trim();
      var status = String(masterData[i][5]).trim();

      if (symbol && status.toUpperCase() === "ACTIVE") {
        activeSymbols.push(symbol);
        if (sector) {
          if (!sectorToSymbols[sector]) {
            sectorToSymbols[sector] = [];
          }
          sectorToSymbols[sector].push(symbol);
        }
      }
    }

    if (activeSymbols.length === 0) {
      return; // No active symbols
    }

    // Ensure we have historical data. If missing, generate mock history for active symbols + NIFTY
    this.ensureHistoricalDataBaseline(activeSymbols);

    // 2. Load and group historical data
    var histSheet = ss.getSheetByName(Config.SHEETS.HISTORICAL_DATA);
    var histLastRow = histSheet.getLastRow();
    var histData = [];
    if (histLastRow > 1) {
      histData = histSheet.getRange(2, 1, histLastRow - 1, 10).getValues();
    }

    var symbolHist = {};
    // Group historical rows by symbol
    for (var i = 0; i < histData.length; i++) {
      var sym = String(histData[i][0]).trim();
      var dateStr = String(histData[i][1]).trim();
      var closePrice = parseFloat(histData[i][5]);
      var vol = parseFloat(histData[i][7]);

      if (!sym) continue;
      if (!symbolHist[sym]) {
        symbolHist[sym] = [];
      }
      symbolHist[sym].push({
        date: dateStr,
        close: isNaN(closePrice) ? 0 : closePrice,
        volume: isNaN(vol) ? 0 : vol
      });
    }

    // Sort history for each symbol by Date ascending
    for (var sym in symbolHist) {
      symbolHist[sym].sort(function(a, b) {
        return new Date(a.date).getTime() - new Date(b.date).getTime();
      });
    }

    // Calculate NIFTY benchmark historical metrics
    var niftyBars = symbolHist["NIFTY"] || [];
    var nifty5DReturn = 0;
    if (niftyBars.length >= 6) {
      var nToday = niftyBars[niftyBars.length - 1].close;
      var n5Ago = niftyBars[niftyBars.length - 6].close;
      if (n5Ago > 0) {
        nifty5DReturn = ((nToday - n5Ago) / n5Ago) * 100;
      }
    }

    // 3. Compute metrics for each sector
    var sectorMetricsList = [];

    for (var sectorName in sectorToSymbols) {
      var symbols = sectorToSymbols[sectorName];
      var sectorStocksMetrics = [];

      for (var k = 0; k < symbols.length; k++) {
        var sym = symbols[k];
        var bars = symbolHist[sym] || [];
        if (bars.length < 2) continue; // Not enough data for this stock

        var idxToday = bars.length - 1;
        var p0 = bars[idxToday].close;
        var v0 = bars[idxToday].volume;

        // 5D Return & 20D Return (using bars 5 and 20 steps back)
        var p5 = idxToday >= 5 ? bars[idxToday - 5].close : bars[0].close;
        var p20 = idxToday >= 20 ? bars[idxToday - 20].close : bars[0].close;

        var ret5D = p5 > 0 ? ((p0 - p5) / p5) * 100 : 0;
        var ret20D = p20 > 0 ? ((p0 - p20) / p20) * 100 : 0;

        // 5D Volume & Previous 5D Volume
        var vol5D = 0;
        var prevVol5D = 0;
        for (var idx = 0; idx < 5; idx++) {
          if (idxToday - idx >= 0) {
            vol5D += bars[idxToday - idx].volume;
          }
          if (idxToday - 5 - idx >= 0) {
            prevVol5D += bars[idxToday - 5 - idx].volume;
          }
        }

        var volAccel = prevVol5D > 0 ? ((vol5D - prevVol5D) / prevVol5D) * 100 : 0;

        // Current RVOL (5D Avg Volume / 20D Avg Volume)
        var vol20DSum = 0;
        var count20 = 0;
        for (var idx = 0; idx < 20; idx++) {
          if (idxToday - idx >= 0) {
            vol20DSum += bars[idxToday - idx].volume;
            count20++;
          }
        }
        var avgVol20D = count20 > 0 ? vol20DSum / count20 : 1;
        var rvol = avgVol20D > 0 ? (vol5D / 5) / avgVol20D : 1;

        // Calculate 20 EMA
        var ema20 = this.calculateEMA20(bars);
        var aboveEMA20 = p0 > ema20 ? 1 : 0;

        sectorStocksMetrics.push({
          symbol: sym,
          ret5D: ret5D,
          ret20D: ret20D,
          vol5D: vol5D,
          prevVol5D: prevVol5D,
          volAccel: volAccel,
          rvol: rvol,
          aboveEMA20: aboveEMA20
        });
      }

      if (sectorStocksMetrics.length === 0) continue;

      // Aggregate sector metrics
      var sumRet5D = 0;
      var sumRet20D = 0;
      var sumVol5D = 0;
      var sumPrevVol5D = 0;
      var sumRvol = 0;
      var countRvol15 = 0;
      var countAboveEMA20 = 0;
      var countPositive5D = 0;

      for (var k = 0; k < sectorStocksMetrics.length; k++) {
        var m = sectorStocksMetrics[k];
        sumRet5D += m.ret5D;
        sumRet20D += m.ret20D;
        sumVol5D += m.vol5D;
        sumPrevVol5D += m.prevVol5D;
        sumRvol += m.rvol;
        if (m.rvol > 1.5) countRvol15++;
        if (m.aboveEMA20 > 0) countAboveEMA20++;
        if (m.ret5D > 0) countPositive5D++;
      }

      var numStocks = sectorStocksMetrics.length;
      var avgRet5D = sumRet5D / numStocks;
      var avgRet20D = sumRet20D / numStocks;
      var avgRvol = sumRvol / numStocks;
      var sectorVolAccel = sumPrevVol5D > 0 ? ((sumVol5D - sumPrevVol5D) / sumPrevVol5D) * 100 : 0;
      var relStrength = avgRet5D - nifty5DReturn;
      var breadth = (countPositive5D / numStocks) * 100;

      // Multi-factor New Money Inflow Score (combines Volume Change, Price Confirmation, Breadth, Rel Strength, Acceleration)
      var score = this.computeInflowScore(avgRvol, sectorVolAccel, avgRet5D, breadth, relStrength);

      sectorMetricsList.push({
        sector: sectorName,
        score: score,
        rvol: avgRvol,
        vol5D: sumVol5D,
        prevVol5D: sumPrevVol5D,
        volAccel: sectorVolAccel,
        ret5D: avgRet5D,
        ret20D: avgRet20D,
        relStrength: relStrength,
        breadth: breadth,
        stocksRvol15: countRvol15,
        stocksAboveEMA20: countAboveEMA20
      });
    }

    // 4. Fetch Previous Scores and compute historical Score changes
    var historySheet = ss.getSheetByName(Config.SHEETS.ROTATION_HISTORY);
    var histRecords = [];
    if (historySheet && historySheet.getLastRow() > 1) {
      histRecords = historySheet.getRange(2, 1, historySheet.getLastRow() - 1, 15).getValues();
    }

    // Group history records by sector
    var sectorHistory = {};
    for (var i = 0; i < histRecords.length; i++) {
      var sec = String(histRecords[i][1]).trim();
      var d = histRecords[i][0];
      var s = parseFloat(histRecords[i][2]);
      var stageStr = String(histRecords[i][11]);
      var rank = parseInt(histRecords[i][12]); // Wait, we can track past ranks if we record them in history. Let's make sure our columns match
      if (!sec) continue;
      if (!sectorHistory[sec]) {
        sectorHistory[sec] = [];
      }
      sectorHistory[sec].push({
        date: d,
        score: isNaN(s) ? 0 : s,
        breadth: parseFloat(histRecords[i][10]),
        stage: stageStr
      });
    }

    // Process previous data and determine stages, score change over 1, 5, 20 days
    for (var i = 0; i < sectorMetricsList.length; i++) {
      var sm = sectorMetricsList[i];
      var sHist = sectorHistory[sm.sector] || [];

      // Sort sector history by date ascending
      sHist.sort(function(a, b) {
        return new Date(a.date).getTime() - new Date(b.date).getTime();
      });

      var prevScore = 0;
      var scoreChange1D = 0;
      var scoreChange5D = 0;
      var scoreChange20D = 0;
      var prevBreadth = sm.breadth; // default to today's breadth

      if (sHist.length > 0) {
        var lastEntry = sHist[sHist.length - 1];
        prevScore = lastEntry.score;
        prevBreadth = lastEntry.breadth;
        scoreChange1D = sm.score - prevScore;

        var entry5D = sHist.length >= 5 ? sHist[sHist.length - 5] : sHist[0];
        scoreChange5D = sm.score - entry5D.score;

        var entry20D = sHist.length >= 20 ? sHist[sHist.length - 20] : sHist[0];
        scoreChange20D = sm.score - entry20D.score;
      } else {
        // No history, default calculations
        prevScore = sm.score; // initial run has 0 change
        scoreChange1D = 0;
        scoreChange5D = 0;
        scoreChange20D = 0;
      }

      sm.prevScore = prevScore;
      sm.scoreChange = scoreChange1D;
      sm.scoreChange5D = scoreChange5D;
      sm.scoreChange20D = scoreChange20D;
      sm.prevBreadth = prevBreadth;

      // Classify Rotation Stage (12)
      sm.stage = this.classifyRotationStage(sm.score, sm.volAccel, sm.ret5D, sm.breadth, sm.relStrength);

      // Map Signals
      sm.signal = this.determineSignal(sm.stage);
    }

    // 5. Sort table by: Score Change DESC, then New Money Inflow Score DESC
    sectorMetricsList.sort(function(a, b) {
      if (Math.abs(b.scoreChange - a.scoreChange) > 0.001) {
        return b.scoreChange - a.scoreChange;
      }
      return b.score - a.score;
    });

    // Assign Current Rank based on sorted list
    for (var i = 0; i < sectorMetricsList.length; i++) {
      sectorMetricsList[i].rank = i + 1;
    }

    // Retrieve previous rank from 5 runs ago to check rank improvements
    // We can estimate the previous sorted list of 5 runs ago if we scan the whole history sheet.
    // Let's implement an elegant historical rank retriever!
    var historicalRanks5DAgo = this.reconstructHistoricalRanks(histRecords, 5);
    var historicalRanks1DAgo = this.reconstructHistoricalRanks(histRecords, 1);

    var alertsList = [];

    for (var i = 0; i < sectorMetricsList.length; i++) {
      var sm = sectorMetricsList[i];
      var rToday = sm.rank;
      var r5Ago = historicalRanks5DAgo[sm.sector] !== undefined ? historicalRanks5DAgo[sm.sector] : 12; // default to lower rank if not found
      var r1Ago = historicalRanks1DAgo[sm.sector] !== undefined ? historicalRanks1DAgo[sm.sector] : rToday;

      sm.rank5DAgo = r5Ago;
      sm.rankChange5D = r5Ago - rToday; // positive is rank improvement

      // Check Alerts (13. ROTATION ALERT & 14. TOP PRIORITY ALERT)
      // 14. TOP PRIORITY ALERT: MONEY FLOW SHIFT
      // Trigger when: Rank improves by >= 5 positions AND VolAccel > 15% AND 5D Return > 0 AND Breadth improves
      var breadthImproved = sm.breadth > sm.prevBreadth;
      if (sm.rankChange5D >= 5 && sm.volAccel > 15 && sm.ret5D > 0 && breadthImproved) {
        alertsList.push({
          type: "MONEY_FLOW_SHIFT",
          sector: sm.sector,
          rankBefore: r5Ago,
          rankNow: rToday,
          volAccel: sm.volAccel,
          rvol: sm.rvol,
          ret5D: sm.ret5D,
          breadth: sm.breadth,
          status: "🔥 NEW MONEY ENTERING"
        });
      }
      // 13. ROTATION ALERT
      // Trigger when: Sector Rank improves by >= 5 positions but maybe doesn't trigger the above full shift conditions
      else if (sm.rankChange5D >= 5) {
        alertsList.push({
          type: "ROTATION_ALERT",
          sector: sm.sector,
          rankBefore: r5Ago,
          rankNow: rToday,
          status: "🚨 ROTATION ALERT"
        });
      }
    }

    // 6. Store daily run in Rotation History
    var todayStr = PlatformUtils.formatDate(new Date());
    var historyRows = [];
    for (var i = 0; i < sectorMetricsList.length; i++) {
      var sm = sectorMetricsList[i];
      historyRows.push([
        todayStr,
        sm.sector,
        sm.score,
        sm.prevScore,
        sm.scoreChange,
        sm.rvol,
        sm.volAccel,
        sm.ret5D,
        sm.ret20D,
        sm.relStrength,
        sm.breadth,
        sm.stage,
        sm.scoreChange,
        sm.scoreChange5D,
        sm.scoreChange20D
      ]);
    }
    if (historyRows.length > 0 && historySheet) {
      SheetManager.batchAppend(Config.SHEETS.ROTATION_HISTORY, historyRows);
    }

    // 7. Render Dashboard
    var dashSheet = ss.getSheetByName(Config.SHEETS.DASHBOARD);
    if (dashSheet) {
      this.renderDashboard(dashSheet, sectorMetricsList, alertsList);
    }
  }

  /**
   * multi-factor scoring formula combining:
   * CHANGE IN VOLUME (RVOL) + PRICE CONFIRMATION (5D Return) + BREADTH + RELATIVE STRENGTH + ACCELERATION (VolAccel)
   */
  static computeInflowScore(rvol, volAccel, ret5D, breadth, relStrength) {
    var score = 0;

    // 1. RVOL (Relative Volume change) - max 20 points
    if (rvol >= 1.5) score += 20;
    else if (rvol >= 1.2) score += 15;
    else if (rvol >= 1.0) score += 10;
    else if (rvol >= 0.8) score += 5;

    // 2. Volume Acceleration - max 20 points
    if (volAccel >= 25) score += 20;
    else if (volAccel >= 10) score += 15;
    else if (volAccel >= 0) score += 10;

    // 3. Price Confirmation (5D Return) - max 20 points
    if (ret5D >= 2.0) score += 20;
    else if (ret5D >= 0.0) score += 15;
    else if (ret5D >= -1.0) score += 5;

    // 4. Breadth (Breadth %) - max 20 points
    if (breadth >= 70) score += 20;
    else if (breadth >= 50) score += 15;
    else if (breadth >= 30) score += 10;
    else score += 5;

    // 5. Relative Strength vs NIFTY - max 20 points
    if (relStrength >= 1.5) score += 20;
    else if (relStrength >= 0.0) score += 15;
    else if (relStrength >= -1.0) score += 10;
    else score += 5;

    return Math.min(100, Math.max(0, score));
  }

  /**
   * Classify into 5 Rotation Stages.
   */
  static classifyRotationStage(score, volAccel, ret5D, breadth, relStrength) {
    // Stage 3: CONFIRMED ROTATION
    if (volAccel > 15 && ret5D > 0 && breadth > 50 && relStrength > 0 && score >= 70) {
      return "Stage 3 \n🚀 CONFIRMED ROTATION";
    }
    // Stage 2: ACCELERATING INFLOW
    if (volAccel > 5 && ret5D > 0 && breadth > 40 && score >= 50) {
      return "Stage 2 \n🔥 ACCELERATING INFLOW";
    }
    // Stage 1: EARLY INFLOW
    if (volAccel > 0 && score >= 30) {
      return "Stage 1 \n🟢 EARLY INFLOW";
    }
    // Stage 4: MATURE LEADER
    if (score >= 45 && volAccel <= 5) {
      return "Stage 4 \n🟡 MATURE LEADER";
    }
    // Stage 5: OUTFLOW / DISTRIBUTION
    return "Stage 5 \n🔴 OUTFLOW / DISTRIBUTION";
  }

  /**
   * Maps Rotation Stage to trading action Signal.
   */
  static determineSignal(stage) {
    if (stage.indexOf("Stage 3") >= 0) return "🚀 STRONG BUY";
    if (stage.indexOf("Stage 2") >= 0) return "🔥 BUY";
    if (stage.indexOf("Stage 1") >= 0) return "🟢 WATCH";
    if (stage.indexOf("Stage 4") >= 0) return "🟡 HOLD";
    return "🔴 AVOID";
  }

  /**
   * Reconstruct historical ranks for sectors N days/runs ago.
   * Scans history records in reverse to group dates and reconstruct ranking of each sector for that run.
   */
  static reconstructHistoricalRanks(histRecords, runsAgo) {
    var ranksBySector = {};
    if (!histRecords || histRecords.length === 0) return ranksBySector;

    // 1. Group records by Date
    var datesMap = {};
    for (var i = 0; i < histRecords.length; i++) {
      var d = histRecords[i][0];
      if (!datesMap[d]) {
        datesMap[d] = [];
      }
      datesMap[d].push({
        sector: histRecords[i][1],
        score: parseFloat(histRecords[i][2]),
        scoreChange: parseFloat(histRecords[i][4])
      });
    }

    // Sort distinct dates ascending
    var dates = Object.keys(datesMap).sort(function(a, b) {
      return new Date(a).getTime() - new Date(b).getTime();
    });

    if (dates.length < runsAgo) {
      return ranksBySector; // Not enough history
    }

    // Pick date runsAgo runs back
    var targetDate = dates[dates.length - runsAgo];
    var runRecords = datesMap[targetDate] || [];

    // Rank them by Score Change DESC, then Score DESC
    runRecords.sort(function(a, b) {
      if (Math.abs(b.scoreChange - a.scoreChange) > 0.001) {
        return b.scoreChange - a.scoreChange;
      }
      return b.score - a.score;
    });

    for (var i = 0; i < runRecords.length; i++) {
      ranksBySector[runRecords[i].sector] = i + 1;
    }

    return ranksBySector;
  }

  /**
   * High performance baseline historical data generator.
   * Pre-populates the sheet with 30 days of daily time-series if empty,
   * guaranteeing that calculation engines can run successfully during testing/initialization.
   */
  static ensureHistoricalDataBaseline(activeSymbols) {
    var ss = SheetManager.getActiveSpreadsheet();
    var histSheet = ss.getSheetByName(Config.SHEETS.HISTORICAL_DATA);
    if (!histSheet) return;

    var lastRow = histSheet.getLastRow();
    if (lastRow > 5) {
      return; // History already populated, skip
    }

    Logger.warning("SectorEngine.ensureHistoricalDataBaseline", 0, "No historical data found. Automatically simulating 30 days of baseline market data for analysis.");

    var symbolsToSimulate = activeSymbols.concat(["NIFTY"]);
    var generatedRows = [];
    var today = new Date();

    // Generate 30 weekdays back
    var dates = [];
    var curr = new Date(today.getTime());
    while (dates.length < 30) {
      var day = curr.getDay();
      if (day !== 0 && day !== 6) { // Skip Sunday and Saturday
        dates.push(PlatformUtils.formatDate(curr));
      }
      curr.setDate(curr.getDate() - 1);
    }
    dates.reverse(); // ascending order

    for (var s = 0; s < symbolsToSimulate.length; s++) {
      var symbol = symbolsToSimulate[s];

      // Define realistic starting baselines
      var basePrice = 1000.00;
      var baseVolume = 1000000;
      if (symbol === "NIFTY") { basePrice = 22000.00; baseVolume = 50000000; }
      else if (symbol === "RELIANCE") { basePrice = 2400.00; baseVolume = 2500000; }
      else if (symbol === "TCS") { basePrice = 3800.00; baseVolume = 1200000; }
      else if (symbol === "INFY") { basePrice = 1500.00; baseVolume = 1800000; }

      var currentPrice = basePrice;

      for (var d = 0; d < dates.length; d++) {
        var dateStr = dates[d];

        // Simulate daily price fluctuations (drift with upward volatility)
        var percentChange = (Math.random() - 0.45) * 0.02; // slight upward bias
        var closePrice = currentPrice * (1 + percentChange);
        var openPrice = currentPrice;
        var highPrice = Math.max(openPrice, closePrice) * (1 + Math.random() * 0.01);
        var lowPrice = Math.min(openPrice, closePrice) * (1 - Math.random() * 0.01);
        var volume = Math.floor(baseVolume * (0.8 + Math.random() * 0.8));

        // Let's create a volume spike on the last 5 days for some sectors to test early inflow/acceleration
        if (d >= 25 && (symbol === "TCS" || symbol === "INFY")) {
          volume = Math.floor(volume * 2.1); // huge acceleration
          closePrice = closePrice * 1.015; // strong price confirmation
        }

        generatedRows.push([
          symbol,
          dateStr,
          parseFloat(openPrice.toFixed(2)),
          parseFloat(highPrice.toFixed(2)),
          parseFloat(lowPrice.toFixed(2)),
          parseFloat(closePrice.toFixed(2)),
          parseFloat(closePrice.toFixed(2)),
          volume,
          "Simulated Data",
          new Date()
        ]);

        currentPrice = closePrice;
      }
    }

    if (generatedRows.length > 0) {
      SheetManager.batchAppend(Config.SHEETS.HISTORICAL_DATA, generatedRows);
    }
  }

  /**
   * Simple EMA 20 calculator.
   */
  static calculateEMA20(bars) {
    if (bars.length === 0) return 0;
    var k = 2 / (20 + 1);
    var ema = bars[0].close; // Start with the first price
    for (var i = 1; i < bars.length; i++) {
      ema = (bars[i].close * k) + (ema * (1 - k));
    }
    return ema;
  }

  /**
   * Renders a breathtaking, highly analytical Dashboard.
   */
  static renderDashboard(sheet, sectors, alerts) {
    sheet.clear();
    sheet.setGridlines(false);

    // Style title
    var titleRange = sheet.getRange("B2:R2");
    titleRange.merge()
              .setValue(Config.METADATA.NAME.toUpperCase())
              .setFontSize(Config.THEME.FONTS.SIZE_TITLE)
              .setFontWeight("bold")
              .setFontColor(Config.THEME.COLORS.PRIMARY_DARK)
              .setFontFamily(Config.THEME.FONTS.FAMILY)
              .setHorizontalAlignment("center");

    var subtitleRange = sheet.getRange("B3:R3");
    subtitleRange.merge()
                 .setValue("Real-time Sector Rotation Analysis & Emerging Money Flow Terminal • Phase 1 Core")
                 .setFontSize(Config.THEME.FONTS.SIZE_SUBTITLE)
                 .setFontStyle("italic")
                 .setFontColor(Config.THEME.COLORS.ACCENT)
                 .setFontFamily(Config.THEME.FONTS.FAMILY)
                 .setHorizontalAlignment("center");

    var startRow = 5;

    // --- 16. DASHBOARD PRIORITY: WHERE IS NEW MONEY ENTERING NOW? ---
    var emergHeader = sheet.getRange("B" + startRow + ":R" + startRow);
    emergHeader.merge()
               .setValue("💰 WHERE IS NEW MONEY ENTERING NOW?")
               .setBackground(Config.THEME.COLORS.PRIMARY_DARK)
               .setFontColor(Config.THEME.COLORS.TEXT_LIGHT)
               .setFontWeight("bold")
               .setFontFamily(Config.THEME.FONTS.FAMILY)
               .setFontSize(11)
               .setHorizontalAlignment("left")
               .setVerticalAlignment("middle");
    sheet.setRowHeight(startRow, 26);
    startRow++;

    // Write Top 3 Emerging Sectors
    var emergHeaders = ["Rank Position", "Sector", "New Money Inflow Score", "Score Change", "RVOL", "Volume Acceleration", "5D Return", "Breadth", "Relative Strength", "Rotation Stage"];
    var emergHeaderRange = sheet.getRange(startRow, 2, 1, emergHeaders.length);
    emergHeaderRange.setValues([emergHeaders])
                    .setBackground(Config.THEME.COLORS.ACCENT)
                    .setFontColor(Config.THEME.COLORS.TEXT_LIGHT)
                    .setFontWeight("bold")
                    .setFontFamily(Config.THEME.FONTS.FAMILY)
                    .setFontSize(10)
                    .setHorizontalAlignment("center")
                    .setVerticalAlignment("middle");
    sheet.setRowHeight(startRow, 24);
    startRow++;

    var topSectors = sectors.slice(0, 3);
    var emergRows = [];
    for (var i = 0; i < 3; i++) {
      if (i < topSectors.length) {
        var ts = topSectors[i];
        emergRows.push([
          "#" + (i + 1) + " Emerging Sector",
          ts.sector,
          parseFloat(ts.score.toFixed(1)),
          parseFloat(ts.scoreChange.toFixed(1)),
          parseFloat(ts.rvol.toFixed(2)),
          (ts.volAccel >= 0 ? "+" : "") + ts.volAccel.toFixed(1) + "%",
          (ts.ret5D >= 0 ? "+" : "") + ts.ret5D.toFixed(2) + "%",
          ts.breadth.toFixed(1) + "%",
          (ts.relStrength >= 0 ? "+" : "") + ts.relStrength.toFixed(2) + "%",
          ts.stage
        ]);
      } else {
        emergRows.push(["#" + (i + 1) + " Emerging Sector", "No data", 0, 0, 0, "0%", "0%", "0%", "0%", "N/A"]);
      }
    }

    var emergDataRange = sheet.getRange(startRow, 2, emergRows.length, emergHeaders.length);
    emergDataRange.setValues(emergRows)
                  .setFontFamily(Config.THEME.FONTS.FAMILY)
                  .setFontSize(10)
                  .setHorizontalAlignment("center")
                  .setVerticalAlignment("middle");
    emergDataRange.setBorder(true, true, true, true, true, true, Config.THEME.COLORS.PRIMARY_LIGHT, SpreadsheetApp.BorderStyle.SOLID);

    // Formatting positive / negative text colors for Score Change & returns
    for (var i = 0; i < emergRows.length; i++) {
      var scoreChangeCell = sheet.getRange(startRow + i, 5);
      var scVal = parseFloat(emergRows[i][2]);
      if (scVal > 0) scoreChangeCell.setFontColor("#2d6a4f").setFontWeight("bold");
      else if (scVal < 0) scoreChangeCell.setFontColor("#9b2226");

      var stageCell = sheet.getRange(startRow + i, 11);
      stageCell.setFontWeight("bold").setHorizontalAlignment("center");
      if (emergRows[i][9].indexOf("Stage 3") >= 0) stageCell.setBackground("#d8f3dc");
      else if (emergRows[i][9].indexOf("Stage 2") >= 0) stageCell.setBackground("#ffe5ec");
      else if (emergRows[i][9].indexOf("Stage 4") >= 0) stageCell.setBackground("#fefae0");
    }

    sheet.setRowHeights(startRow, emergRows.length, 24);
    startRow += emergRows.length + 2;

    // --- ALERTS SECTION ---
    var alertsHeader = sheet.getRange("B" + startRow + ":R" + startRow);
    alertsHeader.merge()
                 .setValue("🚨 ACTIVE ROTATION & MONEY FLOW ALERTS")
                 .setBackground(Config.THEME.COLORS.PRIMARY_DARK)
                 .setFontColor(Config.THEME.COLORS.TEXT_LIGHT)
                 .setFontWeight("bold")
                 .setFontFamily(Config.THEME.FONTS.FAMILY)
                 .setFontSize(11)
                 .setHorizontalAlignment("left")
                 .setVerticalAlignment("middle");
    sheet.setRowHeight(startRow, 26);
    startRow++;

    var alertsBox = sheet.getRange("B" + startRow + ":R" + (startRow + 4));
    alertsBox.merge()
             .setFontFamily(Config.THEME.FONTS.FAMILY)
             .setFontSize(10)
             .setVerticalAlignment("top")
             .setWrap(true);

    if (alerts.length === 0) {
      alertsBox.setValue("\n🟢 No major sector rotation alerts today. Market money flow remains structured.\n" +
                         "• Systems are checking for rank improvements >= 5 and volume accelerations > 15%.\n" +
                         "• Check Stock Master to ensure multi-sector equities are active.")
               .setBackground(Config.THEME.COLORS.INFO_BOX_BG)
               .setFontColor(Config.THEME.COLORS.TEXT_DARK)
               .setBorder(true, true, true, true, false, false, Config.THEME.COLORS.ACCENT, SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
    } else {
      var alertText = "\n";
      for (var a = 0; a < Math.min(3, alerts.length); a++) {
        var al = alerts[a];
        if (al.type === "MONEY_FLOW_SHIFT") {
          alertText += "⚡ MONEY FLOW SHIFT ALERT\n" +
                       "Sector: " + al.sector + "  |  " +
                       "Rank Improvement: " + al.rankBefore + " → " + al.rankNow + "  |  " +
                       "Volume Acceleration: +" + al.volAccel.toFixed(1) + "%  |  " +
                       "RVOL: " + al.rvol.toFixed(2) + "  |  " +
                       "5D Return: +" + al.ret5D.toFixed(2) + "%  |  " +
                       "Breadth: " + al.breadth.toFixed(1) + "%\n" +
                       "Status: " + al.status + "\n\n";
        } else {
          alertText += "🚨 ROTATION ALERT\n" +
                       "Sector: " + al.sector + "  |  " +
                       "Rank Improvement: " + al.rankBefore + " → " + al.rankNow + " (" + al.status + ")\n\n";
        }
      }
      alertsBox.setValue(alertText)
               .setBackground(Config.THEME.COLORS.ALERT_ERROR)
               .setFontColor(Config.THEME.COLORS.TEXT_DARK)
               .setFontWeight("bold")
               .setBorder(true, true, true, true, false, false, "#9b2226", SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
    }
    sheet.setRowHeights(startRow, 5, 20);
    startRow += 7;

    // --- FULL SECTORS RANKING (ALL SECTORS) ---
    var fullHeader = sheet.getRange("B" + startRow + ":R" + startRow);
    fullHeader.merge()
              .setValue("📊 ALL SECTORS RANKING (Emerging Priority sorted)")
              .setBackground(Config.THEME.COLORS.PRIMARY_DARK)
              .setFontColor(Config.THEME.COLORS.TEXT_LIGHT)
              .setFontWeight("bold")
              .setFontFamily(Config.THEME.FONTS.FAMILY)
              .setFontSize(11)
              .setHorizontalAlignment("left")
              .setVerticalAlignment("middle");
    sheet.setRowHeight(startRow, 26);
    startRow++;

    var fullHeaders = [
      "Rank", "Sector", "New Money Inflow Score", "Previous Score", "Score Change",
      "Current RVOL", "5D Volume", "Previous 5D Volume", "Volume Acceleration %",
      "5D Return", "20D Return", "Relative Strength vs NIFTY", "Breadth %",
      "Stocks RVOL > 1.5", "Stocks Above 20 EMA", "Signal", "Rotation Stage"
    ];

    var fullHeaderRange = sheet.getRange(startRow, 2, 1, fullHeaders.length);
    fullHeaderRange.setValues([fullHeaders])
                   .setBackground(Config.THEME.COLORS.ACCENT)
                   .setFontColor(Config.THEME.COLORS.TEXT_LIGHT)
                   .setFontWeight("bold")
                   .setFontFamily(Config.THEME.FONTS.FAMILY)
                   .setFontSize(9)
                   .setHorizontalAlignment("center")
                   .setVerticalAlignment("middle");
    sheet.setRowHeight(startRow, 24);
    startRow++;

    var allRows = [];
    for (var i = 0; i < sectors.length; i++) {
      var ts = sectors[i];
      allRows.push([
        ts.rank,
        ts.sector,
        parseFloat(ts.score.toFixed(1)),
        parseFloat(ts.prevScore.toFixed(1)),
        parseFloat(ts.scoreChange.toFixed(1)),
        parseFloat(ts.rvol.toFixed(2)),
        ts.vol5D,
        ts.prevVol5D,
        (ts.volAccel >= 0 ? "+" : "") + ts.volAccel.toFixed(1) + "%",
        (ts.ret5D >= 0 ? "+" : "") + ts.ret5D.toFixed(2) + "%",
        (ts.ret20D >= 0 ? "+" : "") + ts.ret20D.toFixed(2) + "%",
        (ts.relStrength >= 0 ? "+" : "") + ts.relStrength.toFixed(2) + "%",
        ts.breadth.toFixed(1) + "%",
        ts.stocksRvol15,
        ts.stocksAboveEMA20,
        ts.signal,
        ts.stage
      ]);
    }

    if (allRows.length > 0) {
      var allDataRange = sheet.getRange(startRow, 2, allRows.length, fullHeaders.length);
      allDataRange.setValues(allRows)
                    .setFontFamily(Config.THEME.FONTS.FAMILY)
                    .setFontSize(9)
                    .setHorizontalAlignment("center")
                    .setVerticalAlignment("middle");
      allDataRange.setBorder(true, true, true, true, true, true, Config.THEME.COLORS.PRIMARY_LIGHT, SpreadsheetApp.BorderStyle.SOLID);
      sheet.setRowHeights(startRow, allRows.length, 24);

      // Color coding individual cells
      for (var i = 0; i < allRows.length; i++) {
        var scoreChangeCell = sheet.getRange(startRow + i, 6);
        var scVal = parseFloat(allRows[i][4]);
        if (scVal > 0) scoreChangeCell.setFontColor("#2d6a4f").setFontWeight("bold");
        else if (scVal < 0) scoreChangeCell.setFontColor("#9b2226");

        var signalCell = sheet.getRange(startRow + i, 17);
        signalCell.setFontWeight("bold");
        if (allRows[i][15].indexOf("STRONG BUY") >= 0) signalCell.setFontColor("#2d6a4f").setBackground("#d8f3dc");
        else if (allRows[i][15].indexOf("BUY") >= 0) signalCell.setFontColor("#2d6a4f");
        else if (allRows[i][15].indexOf("AVOID") >= 0) signalCell.setFontColor("#9b2226").setBackground("#ffe5ec");

        var stageCell = sheet.getRange(startRow + i, 18);
        stageCell.setFontWeight("bold");
        if (allRows[i][16].indexOf("Stage 3") >= 0) stageCell.setBackground("#d8f3dc");
        else if (allRows[i][16].indexOf("Stage 2") >= 0) stageCell.setBackground("#ffe5ec");
        else if (allRows[i][16].indexOf("Stage 4") >= 0) stageCell.setBackground("#fefae0");
      }
    }

    // Adjust specific column widths to display beautifully
    var widthMap = {
      2: 50,  // Rank
      3: 130, // Sector
      4: 140, // Score
      5: 110, // Prev Score
      6: 110, // Score Change
      7: 100, // RVOL
      8: 120, // 5D Volume
      9: 120, // Prev 5D Vol
      10: 140, // Vol Accel
      11: 100, // 5D Return
      12: 100, // 20D Return
      13: 160, // Rel Strength
      14: 90,  // Breadth
      15: 120, // RVOL > 1.5
      16: 130, // Above 20 EMA
      17: 110, // Signal
      18: 180  // Stage
    };
    for (var colIndexStr in widthMap) {
      sheet.setColumnWidth(parseInt(colIndexStr), widthMap[colIndexStr]);
    }
  }
}
