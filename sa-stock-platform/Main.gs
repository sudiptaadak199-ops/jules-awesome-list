/**
 * SA Stock Research & Backtest Platform - Phase 1 (Foundation)
 *
 * Central Enterprise Orchestrator
 *
 * Manages full lifecycle initialization, high-performance batch updates,
 * and robust task boundaries. Implements complete self-healing on execution.
 */

class MainOrchestrator {
  /**
   * Initializes and repairs all platform databases, structural parameters, and settings.
   */
  static initializeProject() {
    var start = new Date().getTime();
    try {
      // 1. Core structural creation & auto-repair styling
      SheetManager.initializeAllSheets();

      // 2. Initialize cached systems
      Settings.init();
      Logger.init();

      // 3. Populate baseline/historical records and draw the custom Dashboard
      SectorEngine.seedDataIfNeeded();
      SectorEngine.refreshDashboard();

      var elapsed = new Date().getTime() - start;
      Logger.success("MainOrchestrator.initializeProject", elapsed);
    } catch (e) {
      Logger.init();
      Logger.error("MainOrchestrator.initializeProject", new Date().getTime() - start, e);
      throw e;
    } finally {
      Logger.flush();
    }
  }

  /**
   * Orchestrates high-performance data ingestion across master listings.
   * Leverages batch reads, safe stock boundaries, chunked iterations, and registers statistics.
   * Optimized: accumulates historical rows and updates Stock Master in memory to execute exactly
   * ONE batch append and ONE batch write back to the sheet.
   */
  static updateData() {
    var start = new Date().getTime();

    // Perform safety self-healing check on start to make sure structure is intact
    this.initializeProject();

    Settings.init();
    Logger.init();

    try {
      var ss = SheetManager.getActiveSpreadsheet();
      var masterSheet = ss.getSheetByName(Config.SHEETS.STOCK_MASTER);

      if (!masterSheet) {
        throw new Error("Critical: Stock Master sheet is missing or corrupted. Run Initialize Project first.");
      }

      var lastRow = masterSheet.getLastRow();
      if (lastRow <= 1) {
        Logger.warning("MainOrchestrator.updateData", 0, "No active stocks found inside Stock Master sheet.");
        return;
      }

      // Batch Read active stock listings in exactly one spreadsheet call
      var masterData = masterSheet.getRange(2, 1, lastRow - 1, 8).getValues();
      var activeSymbols = [];
      var localIndices = []; // Tracks index inside masterData array

      for (var i = 0; i < masterData.length; i++) {
        var symbol = String(masterData[i][0]).trim();
        var status = String(masterData[i][5]).trim();
        if (symbol && status.toUpperCase() === "ACTIVE") {
          activeSymbols.push(symbol);
          localIndices.push(i);
        }
      }

      if (activeSymbols.length === 0) {
        Logger.warning("MainOrchestrator.updateData", 0, "All listed symbols inside Stock Master are marked inactive.");
        return;
      }

      var batchSize = Settings.getNum("Batch Size", 100);
      var accumulatedHistoricalRows = [];

      // Process in chunked iterations to optimize memory usage bounds
      for (var i = 0; i < activeSymbols.length; i += batchSize) {
        var chunkSymbols = activeSymbols.slice(i, i + batchSize);
        var chunkIndices = localIndices.slice(i, i + batchSize);

        for (var j = 0; j < chunkSymbols.length; j++) {
          var symbol = chunkSymbols[j];
          var dataIndex = chunkIndices[j];
          var stockStart = new Date().getTime();

          // Individual stock boundary wrapper: single stock failure never terminates execution
          try {
            var result = DataProvider.fetchAndStoreStockData(symbol);

            // Accumulate historical rows in memory
            if (result.status === "SUCCESS" && result.records && result.records.length > 0) {
              for (var k = 0; k < result.records.length; k++) {
                accumulatedHistoricalRows.push(result.records[k]);
              }
            }

            // Update local memory data matrix
            masterData[dataIndex][6] = new Date(); // Col 7 is Last Processed (index 6)

          } catch (individualError) {
            var stockElapsed = new Date().getTime() - stockStart;
            Logger.error("MainOrchestrator.updateData[" + symbol + "]", stockElapsed, individualError);
          }
        }
      }

      // Performance Optimization 1: Write all accumulated historical rows in exactly ONE batch call
      if (accumulatedHistoricalRows.length > 0) {
        SheetManager.batchAppend(Config.SHEETS.HISTORICAL_DATA, accumulatedHistoricalRows);
      }

      // Performance Optimization 2: Batch write updated Last Processed column back to Stock Master
      var lastProcessedColumnValues = [];
      for (var i = 0; i < masterData.length; i++) {
        lastProcessedColumnValues.push([masterData[i][6]]);
      }

      // Column 7 in Stock Master is 'Last Processed'
      masterSheet.getRange(2, 7, lastProcessedColumnValues.length, 1).setValues(lastProcessedColumnValues);

      // --- RUN SECTOR ROTATION ANALYSIS AND REFRESH DASHBOARD ---
      SectorEngine.runSectorRotationAnalysis();

      // Purge and clear expired Cache items dynamically to keep sheet compact
      Cache.purgeExpired();

      var elapsed = new Date().getTime() - start;
      Logger.success("MainOrchestrator.updateData", elapsed);

    } catch (globalError) {
      var elapsed = new Date().getTime() - start;
      Logger.error("MainOrchestrator.updateData", elapsed, globalError);
      throw globalError;
    } finally {
      Logger.flush();
    }
  }

  /**
   * Orchestrates technical research indicators calculations and strategy simulations.
   */
  static runBacktest() {
    var start = new Date().getTime();

    // Perform safety self-healing check on start to make sure structure is intact
    this.initializeProject();

    Settings.init();
    Logger.init();

    try {
      StrategyEngine.runOverallBacktest();
      var elapsed = new Date().getTime() - start;
      Logger.success("MainOrchestrator.runBacktest", elapsed);
    } catch (e) {
      var elapsed = new Date().getTime() - start;
      Logger.error("MainOrchestrator.runBacktest", elapsed, e);
      throw e;
    } finally {
      Logger.flush();
    }
  }

  /**
   * Orchestrates compilation and rendering of analytical reports.
   */
  static generateReport() {
    var start = new Date().getTime();

    // Perform safety self-healing check on start to make sure structure is intact
    this.initializeProject();

    Settings.init();
    Logger.init();

    try {
      var reportId = ReportEngine.compilePerformanceReport();
      ReportEngine.renderDashboardCharts();
      ReportEngine.runAIResearchSummary();
      ReportEngine.exportToObsidianFormat();

      var elapsed = new Date().getTime() - start;
      Logger.success("MainOrchestrator.generateReport[" + reportId + "]", elapsed);
    } catch (e) {
      var elapsed = new Date().getTime() - start;
      Logger.error("MainOrchestrator.generateReport", elapsed, e);
      throw e;
    } finally {
      Logger.flush();
    }
  }
}
