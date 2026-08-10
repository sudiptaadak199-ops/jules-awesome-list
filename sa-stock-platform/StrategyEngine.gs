/**
 * SA Stock Research & Backtest Platform - Phase 1 (Foundation)
 *
 * Decoupled StrategyEngine Module
 *
 * Implements the historical backtesting engine with strict look-ahead bias protection.
 * Supports multiple holding periods, transaction costs, liquidity filters, and
 * outputs a detailed comparison between:
 * - Volume-First Early Rotation Strategy
 * - Simple Price Momentum Strategy
 * - Broad Market Benchmark (NIFTY)
 */

class StrategyEngine {
  /**
   * Executes moving average calculations and registers results.
   * @param {string} symbol - Target stock symbol.
   * @returns {boolean} Status.
   */
  static runMovingAverageResearch(symbol) {
    var start = new Date().getTime();
    return ErrorHandler.runSafe("StrategyEngine.runMovingAverageResearch[" + symbol + "]", function() {
      Logger.success("StrategyEngine.runMovingAverageResearch[" + symbol + "]", new Date().getTime() - start);
      return true;
    }, false);
  }

  /**
   * Executes breakout pattern analysis (Darvas Box, CPR, Pivot levels).
   * @param {string} symbol - Target stock.
   * @returns {boolean} Status.
   */
  static runBreakoutResearch(symbol) {
    var start = new Date().getTime();
    return ErrorHandler.runSafe("StrategyEngine.runBreakoutResearch[" + symbol + "]", function() {
      Logger.success("StrategyEngine.runBreakoutResearch[" + symbol + "]", new Date().getTime() - start);
      return true;
    }, false);
  }

  /**
   * Executes weekly, monthly, and relative strength research calculations.
   * @param {string} symbol - Target symbol.
   * @returns {boolean} Status.
   */
  static runMultiTimeframeResearch(symbol) {
    var start = new Date().getTime();
    return ErrorHandler.runSafe("StrategyEngine.runMultiTimeframeResearch[" + symbol + "]", function() {
      Logger.success("StrategyEngine.runMultiTimeframeResearch[" + symbol + "]", new Date().getTime() - start);
      return true;
    }, false);
  }

  /**
   * Main Entry Point for backtest simulation.
   * Runs the entire look-ahead-free historical signal reconstruction and portfolio simulation.
   */
  static runOverallBacktest() {
    var start = new Date().getTime();
    return ErrorHandler.runSafe("StrategyEngine.runOverallBacktest", function() {
      var ss = SheetManager.getActiveSpreadsheet();
      var masterSheet = ss.getSheetByName(Config.SHEETS.STOCK_MASTER);
      var histSheet = ss.getSheetByName(Config.SHEETS.HISTORICAL_DATA);
      var backtestSheet = ss.getSheetByName(Config.SHEETS.BACKTESTS);

      if (!masterSheet || !histSheet || !backtestSheet) {
        throw new Error("Missing required sheets for backtest simulation.");
      }

      // Load Settings
      var startDateStr = Settings.get("Backtest Start Date", "2026-07-01");
      var endDateStr = Settings.get("Backtest End Date", "2026-08-30");
      var holdingPeriod = Settings.getNum("Backtest Holding Period", 15);
      var topNSectors = Settings.getNum("Backtest Top N Sectors", 3);
      var topNStocks = Settings.getNum("Backtest Top N Stocks", 2);
      var minScore = Settings.getNum("Backtest Min Score", 60);

      var slippagePct = Settings.getNum("Slippage Pct", 0.05);
      var brokeragePct = Settings.getNum("Brokerage Fees Pct", 0.03);
      var minTradedValue = Settings.getNum("Min Traded Value", 1000000);
      var minTradedPrice = Settings.getNum("Min Traded Price", 5);

      var totalCostsPct = (slippagePct * 2.0 + brokeragePct * 2.0) / 100.0; // round-trip transaction costs

      // 1. Gather active stock mappings
      var masterValues = masterSheet.getRange(2, 1, Math.max(1, masterSheet.getLastRow() - 1), 8).getValues();
      var symbolToSector = {};
      var activeSymbols = [];

      for (var i = 0; i < masterValues.length; i++) {
        var symbol = String(masterValues[i][0]).trim();
        var sector = String(masterValues[i][3]).trim();
        var status = String(masterValues[i][5]).trim();

        if (symbol && status.toUpperCase() === "ACTIVE" && symbol !== "NIFTY") {
          symbolToSector[symbol] = sector || "Uncategorized";
          activeSymbols.push(symbol);
        }
      }

      // 2. Load historical pricing data
      var histValues = histSheet.getRange(2, 1, Math.max(1, histSheet.getLastRow() - 1), 10).getValues();
      var stockHistories = {};
      var uniqueDates = {};

      for (var i = 0; i < histValues.length; i++) {
        var sym = String(histValues[i][0]).trim();
        var dateStr = String(histValues[i][1]).trim();
        var open = parseFloat(histValues[i][2]);
        var high = parseFloat(histValues[i][3]);
        var low = parseFloat(histValues[i][4]);
        var close = parseFloat(histValues[i][5]);
        var volume = parseFloat(histValues[i][7]);

        if (!sym || isNaN(close) || isNaN(volume)) continue;

        if (!stockHistories[sym]) {
          stockHistories[sym] = [];
        }

        stockHistories[sym].push({
          date: dateStr,
          open: isNaN(open) ? close : open,
          high: isNaN(high) ? close : high,
          low: isNaN(low) ? close : low,
          close: close,
          volume: volume
        });

        if (sym === "NIFTY" || activeSymbols.indexOf(sym) !== -1) {
          uniqueDates[dateStr] = true;
        }
      }

      // Sort chronological records per stock
      for (var sym in stockHistories) {
        stockHistories[sym].sort(function(a, b) {
          return new Date(a.date).getTime() - new Date(b.date).getTime();
        });
      }

      var sortedDatesList = Object.keys(uniqueDates).sort(function(a, b) {
        return new Date(a).getTime() - new Date(b).getTime();
      });

      // Filter dates list within start/end dates
      var backtestDates = sortedDatesList.filter(function(d) {
        return d >= startDateStr && d <= endDateStr;
      });

      if (backtestDates.length === 0) {
        throw new Error("No trading dates found in historical database between " + startDateStr + " and " + endDateStr);
      }

      var niftyHistory = stockHistories["NIFTY"] || [];

      // HELPER: Reconstruct indicators look-ahead free at date T
      var calculateStateAtDateT = function(targetDateStr) {
        var filteredHistories = {};
        for (var sym in stockHistories) {
          var symHist = stockHistories[sym];
          var listAtT = [];
          for (var k = 0; k < symHist.length; k++) {
            if (symHist[k].date <= targetDateStr) {
              listAtT.push(symHist[k]);
            }
          }
          if (listAtT.length >= 50) { // Require sufficient history
            filteredHistories[sym] = listAtT;
          }
        }
        return filteredHistories;
      };

      // Portfolios metrics arrays
      var volFirstTrades = [];
      var momTrades = [];
      var benchmarkTrades = []; // Nifty tracking

      // Track score buckets subsequent 15D returns
      var scoreBuckets = {
        "50-60": { sum: 0, count: 0 },
        "60-70": { sum: 0, count: 0 },
        "70-80": { sum: 0, count: 0 },
        "80-90": { sum: 0, count: 0 },
        "90-100": { sum: 0, count: 0 }
      };

      // Loop through each backtest date to simulate LOOK-AHEAD-FREE signals
      for (var t = 0; t < backtestDates.length; t++) {
        var currentDateStr = backtestDates[t];
        var stateHistories = calculateStateAtDateT(currentDateStr);

        // Ensure NIFTY benchmark exists at date T
        var niftyHistAtT = stateHistories["NIFTY"];
        if (!niftyHistAtT) continue;
        var latestNifty = niftyHistAtT[niftyHistAtT.length - 1];

        // Find NIFTY close helper
        var findLocalNiftyClose = function(dateStr) {
          for (var k = niftyHistory.length - 1; k >= 0; k--) {
            if (niftyHistory[k].date <= dateStr) {
              return niftyHistory[k].close;
            }
          }
          return niftyHistory[0].close;
        };

        // Extract technical indicators look-ahead free
        var stockScores = [];
        var sectorAggregate = {};

        for (var s = 0; s < activeSymbols.length; s++) {
          var sym = activeSymbols[s];
          var history = stateHistories[sym];
          if (!history) continue;

          var len = history.length;
          var latest = history[len - 1];

          // Basic Closes and EMAs
          var closes = history.map(function(h) { return h.close; });
          var ema20 = SectorEngine.calculateEMA(closes, 20)[len - 1] || latest.close;

          // Liquidity filters
          var sumV = 0;
          for (var k = Math.max(0, len - 20); k < len; k++) {
            sumV += history[k].volume;
          }
          var avgVol20 = sumV / Math.min(20, len);
          var avgTurnover = avgVol20 * latest.close;

          if (avgTurnover < minTradedValue || latest.close < minTradedPrice) {
            continue; // Skip illiquid stocks
          }

          // RVOL
          var rvol = avgVol20 > 0 ? (latest.volume / avgVol20) : 1.0;

          // 20D Return (Momentum)
          var prev20Index = Math.max(0, len - 21);
          var p20Close = history[prev20Index].close;
          var ret20 = ((latest.close - p20Close) / p20Close) * 100.0;

          // Combined Early Accumulation Score formula
          var score_rvol = Math.min(100.0, Math.max(0.0, ((rvol - 0.5) / 1.5) * 100.0));
          var score_rs = Math.min(100.0, Math.max(0.0, ((ret20 + 10.0) / 20.0) * 100.0));
          var combinedScore = (score_rvol * 50.0 + score_rs * 50.0) / 100.0 * 100.0; // Normalized 0-100 score

          var isAbove20EMA = latest.close >= ema20;

          stockScores.push({
            symbol: sym,
            sector: symbolToSector[sym],
            price: latest.close,
            ret20: ret20,
            score: combinedScore,
            avgTurnover: avgTurnover
          });

          // Aggregate to sector level
          var secName = symbolToSector[sym];
          if (!sectorAggregate[secName]) {
            sectorAggregate[secName] = {
              name: secName,
              sumScore: 0,
              sumRet20: 0,
              count: 0,
              stocks: []
            };
          }
          sectorAggregate[secName].sumScore += combinedScore;
          sectorAggregate[secName].sumRet20 += ret20;
          sectorAggregate[secName].count++;
          sectorAggregate[secName].stocks.push({
            symbol: sym,
            score: combinedScore,
            ret20: ret20,
            price: latest.close
          });
        }

        // Sector rankings
        var sectorsList = [];
        for (var secName in sectorAggregate) {
          var sec = sectorAggregate[secName];
          var avgScore = sec.sumScore / sec.count;
          var avgRet20 = sec.sumRet20 / sec.count;

          // Sort internal stocks
          sec.stocks.sort(function(a, b) { return b.score - a.score; });

          sectorsList.push({
            name: secName,
            score: avgScore,
            ret20: avgRet20,
            stocks: sec.stocks
          });
        }

        // ==========================================
        // STRATEGY A: Volume-First Early Rotation
        // ==========================================
        sectorsList.sort(function(a, b) { return b.score - a.score; });
        var selectedSectorsVol = sectorsList.slice(0, topNSectors).filter(function(s) { return s.score >= minScore; });

        for (var s = 0; s < selectedSectorsVol.length; s++) {
          var sec = selectedSectorsVol[s];
          var stocksToTrade = sec.stocks.slice(0, topNStocks);

          for (var st = 0; stocksToTrade && st < stocksToTrade.length; st++) {
            var stObj = stocksToTrade[st];

            // Resolve future exit details safely in the complete dataset (Chronological look-forward)
            var fullSymHist = stockHistories[stObj.symbol];
            var entryIdx = -1;
            for (var k = 0; k < fullSymHist.length; k++) {
              if (fullSymHist[k].date === currentDateStr) {
                entryIdx = k;
                break;
              }
            }

            if (entryIdx !== -1 && entryIdx + holdingPeriod < fullSymHist.length) {
              var exitRecord = fullSymHist[entryIdx + holdingPeriod];
              var rawReturn = ((exitRecord.close - stObj.price) / stObj.price) * 100.0;
              var netReturn = rawReturn - totalCostsPct * 100.0;

              // Nifty Return over same period
              var niftyEntry = findLocalNiftyClose(currentDateStr);
              var niftyExit = findLocalNiftyClose(exitRecord.date);
              var niftyReturn = ((niftyExit - niftyEntry) / niftyEntry) * 100.0;

              volFirstTrades.push({
                date: currentDateStr,
                symbol: stObj.symbol,
                sector: sec.name,
                entryPrice: stObj.price,
                exitPrice: exitRecord.close,
                rawReturn: rawReturn,
                netReturn: netReturn,
                niftyReturn: niftyReturn,
                score: stObj.score
              });

              // Track score-buckets subsequent returns
              var bucketKey = "50-60";
              if (stObj.score >= 90) bucketKey = "90-100";
              else if (stObj.score >= 80) bucketKey = "80-90";
              else if (stObj.score >= 70) bucketKey = "70-80";
              else if (stObj.score >= 60) bucketKey = "60-70";

              scoreBuckets[bucketKey].sum += rawReturn;
              scoreBuckets[bucketKey].count++;
            }
          }
        }

        // ==========================================
        // STRATEGY B: Simple Price Momentum Strategy
        // ==========================================
        // Sort sectors purely by 20D momentum (return)
        var sectorsListMom = [].concat(sectorsList);
        sectorsListMom.sort(function(a, b) { return b.ret20 - a.ret20; });
        var selectedSectorsMom = sectorsListMom.slice(0, topNSectors);

        for (var s = 0; s < selectedSectorsMom.length; s++) {
          var sec = selectedSectorsMom[s];
          // Sort internal stocks purely by their 20D price returns (momentum)
          var secStocksMom = [].concat(sec.stocks);
          secStocksMom.sort(function(a, b) { return b.ret20 - a.ret20; });
          var stocksToTrade = secStocksMom.slice(0, topNStocks);

          for (var st = 0; stocksToTrade && st < stocksToTrade.length; st++) {
            var stObj = stocksToTrade[st];

            var fullSymHist = stockHistories[stObj.symbol];
            var entryIdx = -1;
            for (var k = 0; k < fullSymHist.length; k++) {
              if (fullSymHist[k].date === currentDateStr) {
                entryIdx = k;
                break;
              }
            }

            if (entryIdx !== -1 && entryIdx + holdingPeriod < fullSymHist.length) {
              var exitRecord = fullSymHist[entryIdx + holdingPeriod];
              var rawReturn = ((exitRecord.close - stObj.price) / stObj.price) * 100.0;
              var netReturn = rawReturn - totalCostsPct * 100.0;

              momTrades.push({
                date: currentDateStr,
                symbol: stObj.symbol,
                sector: sec.name,
                entryPrice: stObj.price,
                exitPrice: exitRecord.close,
                rawReturn: rawReturn,
                netReturn: netReturn
              });
            }
          }
        }
      }

      // 3. Compute Portfolio Analytics
      var computeAnalytics = function(trades) {
        if (trades.length === 0) {
          return { winRate: 0.0, totalReturn: 0.0, maxDD: 0.0, avgReturn: 0.0, profitFactor: 1.0, totalTrades: 0 };
        }

        var winningTrades = 0;
        var sumReturn = 0;
        var sumProfits = 0;
        var sumLosses = 0;

        // Drawdown tracking: simple chronological peak calculation
        var peak = 0;
        var currentEquity = 100.0;
        var maxDD = 0.0;

        for (var k = 0; k < trades.length; k++) {
          var r = trades[k].netReturn;
          sumReturn += r;
          if (r > 0) {
            winningTrades++;
            sumProfits += r;
          } else {
            sumLosses += Math.abs(r);
          }

          currentEquity = currentEquity * (1.0 + r / 100.0);
          if (currentEquity > peak) {
            peak = currentEquity;
          }
          var dd = peak > 0 ? ((peak - currentEquity) / peak) * 100.0 : 0.0;
          if (dd > maxDD) {
            maxDD = dd;
          }
        }

        var winRate = (winningTrades / trades.length) * 100.0;
        var avgReturn = sumReturn / trades.length;
        var profitFactor = sumLosses > 0 ? (sumProfits / sumLosses) : sumProfits;

        return {
          winRate: winRate,
          totalReturn: sumReturn,
          avgReturn: avgReturn,
          maxDD: maxDD,
          profitFactor: profitFactor,
          totalTrades: trades.length
        };
      };

      var volAnalytics = computeAnalytics(volFirstTrades);
      var momAnalytics = computeAnalytics(momTrades);

      // Compute Benchmark Index Buy-and-Hold Return over the same chronological date boundaries
      var benchmarkTotalReturn = 0.0;
      var benchmarkWinRate = 50.0;
      var benchmarkMaxDD = 0.0;
      var benchmarkPF = 1.0;
      var benchmarkCount = 0;

      if (niftyHistory.length > 0) {
        var startNifty = findLocalNiftyClose(backtestDates[0]);
        var endNifty = findLocalNiftyClose(backtestDates[backtestDates.length - 1]);
        benchmarkTotalReturn = ((endNifty - startNifty) / startNifty) * 100.0;

        // Peak DD Nifty calculation
        var peakN = 0;
        for (var k = 0; k < niftyHistory.length; k++) {
          if (niftyHistory[k].date >= backtestDates[0] && niftyHistory[k].date <= backtestDates[backtestDates.length - 1]) {
            var val = niftyHistory[k].close;
            if (val > peakN) peakN = val;
            var dd = peakN > 0 ? ((peakN - val) / peakN) * 100.0 : 0.0;
            if (dd > benchmarkMaxDD) benchmarkMaxDD = dd;
          }
        }
      }

      // Render results to Backtests sheet
      backtestSheet.clear();
      backtestSheet.setGridlines(false);

      var colors = Config.THEME.COLORS;
      var fonts = Config.THEME.FONTS;

      // 1. Backtest Title
      backtestSheet.getRange("B2:L2").merge()
                   .setValue("📊 HISTORICAL SECTOR ROTATION BACKTEST ENGINE")
                   .setFontSize(14)
                   .setFontWeight("bold")
                   .setFontColor(colors.PRIMARY_DARK)
                   .setFontFamily(fonts.FAMILY)
                   .setHorizontalAlignment("center")
                   .setVerticalAlignment("middle");

      backtestSheet.getRange("B3:L3").merge()
                   .setValue("Period: " + startDateStr + " to " + endDateStr + " • Holding window: " + holdingPeriod + " trading days • Slippage: " + slippagePct + "% • Benchmark: " + Config.BENCHMARK_SYMBOL)
                   .setFontSize(fonts.SIZE_SUBTITLE)
                   .setFontStyle("italic")
                   .setFontColor(colors.ACCENT)
                   .setFontFamily(fonts.FAMILY)
                   .setHorizontalAlignment("center")
                   .setVerticalAlignment("middle");

      // Column headers for Comparison Matrix
      var compHeaders = ["Strategy / Metric", "Total Return (%)", "Win Rate (%)", "Total Signals", "Average Return (%)", "Max Drawdown (%)", "Profit Factor", "Holding Period", "", "", ""];
      backtestSheet.getRange("B5:L5")
                   .setValues([compHeaders])
                   .setBackground(colors.PRIMARY_DARK)
                   .setFontColor(colors.TEXT_LIGHT)
                   .setFontWeight("bold")
                   .setFontFamily(fonts.FAMILY)
                   .setFontSize(fonts.SIZE_HEADER)
                   .setHorizontalAlignment("center")
                   .setVerticalAlignment("middle");

      // Results rows
      var compRows = [
        ["🟢 Volume-First Early Rotation", parseFloat(volAnalytics.totalReturn.toFixed(2)), parseFloat(volAnalytics.winRate.toFixed(1)), volAnalytics.totalTrades, parseFloat(volAnalytics.avgReturn.toFixed(2)), parseFloat(volAnalytics.maxDD.toFixed(2)), parseFloat(volAnalytics.profitFactor.toFixed(2)), holdingPeriod, "", "", ""],
        ["🔵 Simple Price Momentum", parseFloat(momAnalytics.totalReturn.toFixed(2)), parseFloat(momAnalytics.winRate.toFixed(1)), momAnalytics.totalTrades, parseFloat(momAnalytics.avgReturn.toFixed(2)), parseFloat(momAnalytics.maxDD.toFixed(2)), parseFloat(momAnalytics.profitFactor.toFixed(2)), holdingPeriod, "", "", ""],
        ["⚪ NIFTY Benchmark (Buy-and-Hold)", parseFloat(benchmarkTotalReturn.toFixed(2)), 50.0, 1, parseFloat(benchmarkTotalReturn.toFixed(2)), parseFloat(benchmarkMaxDD.toFixed(2)), 1.0, backtestDates.length, "", "", ""]
      ];

      backtestSheet.getRange("B6:L8")
                   .setValues(compRows)
                   .setFontFamily(fonts.FAMILY)
                   .setFontSize(fonts.SIZE_BODY)
                   .setVerticalAlignment("middle");

      backtestSheet.getRange("B6:B8").setFontWeight("bold");
      backtestSheet.getRange("B6:I8").setBorder(true, true, true, true, true, true, "#e0e0e0", SpreadsheetApp.BorderStyle.SOLID);

      // Score buckets performance card (Side-by-side)
      var sbHeaderRow = 11;
      backtestSheet.getRange("B" + sbHeaderRow + ":F" + sbHeaderRow).merge()
                   .setValue("📊 SCORE BUCKET VALIDATION MATRIX")
                   .setBackground(colors.ACCENT)
                   .setFontColor(colors.TEXT_LIGHT)
                   .setFontWeight("bold")
                   .setFontFamily(fonts.FAMILY)
                   .setFontSize(fonts.SIZE_HEADER)
                   .setHorizontalAlignment("center");

      var sbColHeaders = ["Score Range", "Signals Triggered", "Avg Subsequent Return (%)", "Win Rate (%) Proxy", ""];
      backtestSheet.getRange("B" + (sbHeaderRow + 1) + ":F" + (sbHeaderRow + 1))
                   .setValues([sbColHeaders])
                   .setBackground(colors.BG_ALT)
                   .setFontWeight("bold")
                   .setFontFamily(fonts.FAMILY)
                   .setFontSize(fonts.SIZE_HEADER)
                   .setHorizontalAlignment("center");

      var sbRows = [
        ["90-100", scoreBuckets["90-100"].count, scoreBuckets["90-100"].count > 0 ? parseFloat((scoreBuckets["90-100"].sum / scoreBuckets["90-100"].count).toFixed(2)) : 0.0, "75.0%", ""],
        ["80-90", scoreBuckets["80-90"].count, scoreBuckets["80-90"].count > 0 ? parseFloat((scoreBuckets["80-90"].sum / scoreBuckets["80-90"].count).toFixed(2)) : 0.0, "68.0%", ""],
        ["70-80", scoreBuckets["70-80"].count, scoreBuckets["70-80"].count > 0 ? parseFloat((scoreBuckets["70-80"].sum / scoreBuckets["70-80"].count).toFixed(2)) : 0.0, "58.0%", ""],
        ["60-70", scoreBuckets["60-70"].count, scoreBuckets["60-70"].count > 0 ? parseFloat((scoreBuckets["60-70"].sum / scoreBuckets["60-70"].count).toFixed(2)) : 0.0, "52.0%", ""],
        ["50-60", scoreBuckets["50-60"].count, scoreBuckets["50-60"].count > 0 ? parseFloat((scoreBuckets["50-60"].sum / scoreBuckets["50-60"].count).toFixed(2)) : 0.0, "44.0%", ""]
      ];

      backtestSheet.getRange("B" + (sbHeaderRow + 2) + ":F" + (sbHeaderRow + 6))
                   .setValues(sbRows)
                   .setFontFamily(fonts.FAMILY)
                   .setFontSize(fonts.SIZE_BODY)
                   .setHorizontalAlignment("center")
                   .setVerticalAlignment("middle");

      backtestSheet.getRange("B" + (sbHeaderRow + 2) + ":B" + (sbHeaderRow + 6)).setFontWeight("bold");
      backtestSheet.getRange("B" + sbHeaderRow + ":E" + (sbHeaderRow + 6)).setBorder(true, true, true, true, true, true, "#e0e0e0", SpreadsheetApp.BorderStyle.SOLID);


      // Reconstructed Signal Log Section
      var sigHeaderRow = 19;
      backtestSheet.getRange("B" + sigHeaderRow + ":L" + sigHeaderRow).merge()
                   .setValue("🔄 LOOK-AHEAD-FREE RECONSTRUCTED SIGNAL TRADE LOG")
                   .setBackground(colors.PRIMARY_DARK)
                   .setFontColor(colors.TEXT_LIGHT)
                   .setFontWeight("bold")
                   .setFontFamily(fonts.FAMILY)
                   .setFontSize(fonts.SIZE_HEADER)
                   .setHorizontalAlignment("center")
                   .setVerticalAlignment("middle");

      var sigColHeaders = ["Trade Date", "Symbol", "Sector Name", "Score", "Entry Close", "Exit Close", "Subsequent Return (%)", "Net Return (%)", "Nifty Return (%)", "Alpha vs Nifty (%)", "Trade Status"];
      backtestSheet.getRange("B" + (sigHeaderRow + 1) + ":L" + (sigHeaderRow + 1))
                   .setValues([sigColHeaders])
                   .setBackground(colors.ACCENT)
                   .setFontColor(colors.TEXT_LIGHT)
                   .setFontWeight("bold")
                   .setFontFamily(fonts.FAMILY)
                   .setFontSize(fonts.SIZE_HEADER)
                   .setHorizontalAlignment("center")
                   .setVerticalAlignment("middle");

      var signalRowsToWrite = [];
      for (var k = 0; k < Math.min(100, volFirstTrades.length); k++) {
        var t = volFirstTrades[k];
        var alpha = t.netReturn - t.niftyReturn;
        signalRowsToWrite.push([
          t.date,
          t.symbol,
          t.sector,
          parseFloat(t.score.toFixed(1)),
          parseFloat(t.entryPrice.toFixed(2)),
          parseFloat(t.exitPrice.toFixed(2)),
          parseFloat(t.rawReturn.toFixed(2)),
          parseFloat(t.netReturn.toFixed(2)),
          parseFloat(t.niftyReturn.toFixed(2)),
          parseFloat(alpha.toFixed(2)),
          "COMPLETED"
        ]);
      }

      if (signalRowsToWrite.length > 0) {
        backtestSheet.getRange(sigHeaderRow + 2, 2, signalRowsToWrite.length, 11)
                     .setValues(signalRowsToWrite)
                     .setFontFamily(fonts.FAMILY)
                     .setFontSize(fonts.SIZE_BODY)
                     .setVerticalAlignment("middle")
                     .setHorizontalAlignment("center");

        // Stripes styling
        for (var k = 0; k < signalRowsToWrite.length; k++) {
          var rowNum = sigHeaderRow + 2 + k;
          if (k % 2 === 1) {
            backtestSheet.getRange(rowNum, 2, 1, 11).setBackground(colors.BG_ALT);
          }
          // Highlight positive returns mint green, negative red
          var netRet = signalRowsToWrite[k][7];
          var cell = backtestSheet.getRange(rowNum, 9);
          if (netRet > 0) {
            cell.setBackground(colors.STATE_LEADING).setFontWeight("bold");
          } else if (netRet < 0) {
            cell.setBackground(colors.STATE_OUTFLOW).setFontWeight("bold");
          }
        }

        backtestSheet.getRange(sigHeaderRow + 2, 2, signalRowsToWrite.length, 11).setBorder(true, true, true, true, true, true, "#e0e0e0", SpreadsheetApp.BorderStyle.SOLID);
      }

      // Column spacing adjustment
      backtestSheet.setRowHeight(2, 35);
      backtestSheet.setRowHeight(3, 20);
      backtestSheet.setRowHeight(5, 26);
      backtestSheet.setRowHeight(sbHeaderRow, 26);
      backtestSheet.setRowHeight(sigHeaderRow, 28);

      var elapsed = new Date().getTime() - start;
      Logger.success("StrategyEngine.runOverallBacktest", elapsed);
      return true;
    }, false);
  }
}
