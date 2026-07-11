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
    const start = new Date().getTime();
    try {
      // 1. Core structural creation & auto-repair styling
      SheetManager.initializeAllSheets();

      // 2. Initialize cached systems
      Settings.init();
      Logger.init();

      const elapsed = new Date().getTime() - start;
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
    const start = new Date().getTime();

    // Perform safety self-healing check on start to make sure structure is intact
    this.initializeProject();

    Settings.init();
    Logger.init();

    try {
      const ss = SheetManager.getActiveSpreadsheet();
      const masterSheet = ss.getSheetByName(Config.SHEETS.STOCK_MASTER);

      if (!masterSheet) {
        throw new Error("Critical: Stock Master sheet is missing or corrupted. Run Initialize Project first.");
      }

      const lastRow = masterSheet.getLastRow();
      if (lastRow <= 1) {
        Logger.warning("MainOrchestrator.updateData", 0, "No active stocks found inside Stock Master sheet.");
        return;
      }

      // Batch Read active stock listings in exactly one spreadsheet call
      const masterData = masterSheet.getRange(2, 1, lastRow - 1, 8).getValues();
      const activeSymbols = [];
      const localIndices = []; // Tracks index inside masterData array

      for (let i = 0; i < masterData.length; i++) {
        const symbol = String(masterData[i][0]).trim();
        const status = String(masterData[i][5]).trim();
        if (symbol && status.toUpperCase() === "ACTIVE") {
          activeSymbols.push(symbol);
          localIndices.push(i);
        }
      }

      if (activeSymbols.length === 0) {
        Logger.warning("MainOrchestrator.updateData", 0, "All listed symbols inside Stock Master are marked inactive.");
        return;
      }

      const batchSize = Settings.getNum("Batch Size", 100);
      const accumulatedHistoricalRows = [];

      // Process in chunked iterations to optimize memory usage bounds
      for (let i = 0; i < activeSymbols.length; i += batchSize) {
        const chunkSymbols = activeSymbols.slice(i, i + batchSize);
        const chunkIndices = localIndices.slice(i, i + batchSize);

        for (let j = 0; j < chunkSymbols.length; j++) {
          const symbol = chunkSymbols[j];
          const dataIndex = chunkIndices[j];
          const stockStart = new Date().getTime();

          // Individual stock boundary wrapper: single stock failure never terminates execution
          try {
            const result = DataProvider.fetchAndStoreStockData(symbol);

            // Accumulate historical rows in memory
            if (result.status === "SUCCESS" && result.records && result.records.length > 0) {
              for (const record of result.records) {
                accumulatedHistoricalRows.push(record);
              }
            }

            // Update local memory data matrix
            masterData[dataIndex][6] = new Date(); // Col 7 is Last Processed (index 6)

          } catch (individualError) {
            const stockElapsed = new Date().getTime() - stockStart;
            Logger.error(`MainOrchestrator.updateData[${symbol}]`, stockElapsed, individualError);
          }
        }
      }

      // Performance Optimization 1: Write all accumulated historical rows in exactly ONE batch call
      if (accumulatedHistoricalRows.length > 0) {
        SheetManager.batchAppend(Config.SHEETS.HISTORICAL_DATA, accumulatedHistoricalRows);
      }

      // Performance Optimization 2: Batch write updated Last Processed column back to Stock Master
      const lastProcessedColumnValues = [];
      for (let i = 0; i < masterData.length; i++) {
        lastProcessedColumnValues.push([masterData[i][6]]);
      }

      // Column 7 in Stock Master is 'Last Processed'
      masterSheet.getRange(2, 7, lastProcessedColumnValues.length, 1).setValues(lastProcessedColumnValues);

      // Purge and clear expired Cache items dynamically to keep sheet compact
      Cache.purgeExpired();

      const elapsed = new Date().getTime() - start;
      Logger.success("MainOrchestrator.updateData", elapsed);

    } catch (globalError) {
      const elapsed = new Date().getTime() - start;
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
    const start = new Date().getTime();

    // Perform safety self-healing check on start to make sure structure is intact
    this.initializeProject();

    Settings.init();
    Logger.init();

    try {
      StrategyEngine.runOverallBacktest();
      const elapsed = new Date().getTime() - start;
      Logger.success("MainOrchestrator.runBacktest", elapsed);
    } catch (e) {
      const elapsed = new Date().getTime() - start;
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
    const start = new Date().getTime();

    // Perform safety self-healing check on start to make sure structure is intact
    this.initializeProject();

    Settings.init();
    Logger.init();

    try {
      const reportId = ReportEngine.compilePerformanceReport();
      ReportEngine.renderDashboardCharts();
      ReportEngine.runAIResearchSummary();
      ReportEngine.exportToObsidianFormat();

      const elapsed = new Date().getTime() - start;
      Logger.success(`MainOrchestrator.generateReport[${reportId}]`, elapsed);
    } catch (e) {
      const elapsed = new Date().getTime() - start;
      Logger.error("MainOrchestrator.generateReport", elapsed, e);
      throw e;
    } finally {
      Logger.flush();
    }
  }
}

// Export to Node environment for local CI/CD testing
if (typeof exports !== 'undefined') {
  exports.MainOrchestrator = MainOrchestrator;
}
