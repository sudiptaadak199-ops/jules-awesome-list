/**
 * SA Stock Research & Backtest Platform - Phase 1 (Foundation)
 *
 * Main Platform Orchestrator
 *
 * Provides structural orchestration, modular coordination, and robust error boundaries.
 * Wraps individual sub-routines (e.g. stock-by-stock updating) so that individual stock
 * failures log cleanly but never cause the entire process run to crash.
 */

class MainOrchestrator {
  /**
   * Safe entry-point for platform schema setup.
   */
  static initializeProject() {
    const start = new Date().getTime();
    try {
      // Create all sheets
      SheetManager.initializeAllSheets();

      // Initialize system components
      Settings.init();
      Logger.init();

      Logger.success("MainOrchestrator.initializeProject", new Date().getTime() - start);
    } catch (e) {
      // In worst-case sheet creation blocks, dump logs to standard logger
      Logger.init();
      Logger.error("MainOrchestrator.initializeProject", new Date().getTime() - start, e);
      throw e;
    } finally {
      Logger.flush();
    }
  }

  /**
   * Orchestrates high-performance updating of Stock historical tables.
   * Reads stock master, chunks execution in batches, runs placeholder engines,
   * handles individual errors gracefully, and registers professional metrics.
   */
  static updateData() {
    const start = new Date().getTime();

    // Safety check initialization
    Settings.init();
    Logger.init();

    try {
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const masterSheet = ss.getSheetByName(Config.SHEETS.STOCK_MASTER);

      if (!masterSheet) {
        throw new Error("Stock Master sheet not initialized. Please run project initialization.");
      }

      const lastRow = masterSheet.getLastRow();
      if (lastRow <= 1) {
        Logger.log("MainOrchestrator.updateData", "WARNING", 0, "No active stock listings found in Stock Master.");
        return;
      }

      // Read all active stock listings in batch (minimize Spreadsheet API queries)
      const data = masterSheet.getRange(2, 1, lastRow - 1, 6).getValues();
      const activeSymbols = [];
      const rowMapping = []; // Tracks index back to the master list row for status updating

      for (let i = 0; i < data.length; i++) {
        const symbol = String(data[i][0]).trim();
        const status = String(data[i][5]).trim();
        if (symbol && status.toUpperCase() === "ACTIVE") {
          activeSymbols.push(symbol);
          rowMapping.push(i + 2); // Row index in Stock Master sheet
        }
      }

      if (activeSymbols.length === 0) {
        Logger.log("MainOrchestrator.updateData", "WARNING", 0, "All stock listings are marked as inactive.");
        return;
      }

      const batchSize = Settings.getNum("Batch Size", 100);
      const updateStatuses = [];

      // Loop through stock symbols in chunks/batches
      for (let i = 0; i < activeSymbols.length; i += batchSize) {
        const chunkSymbols = activeSymbols.slice(i, i + batchSize);
        const chunkRows = rowMapping.slice(i, i + batchSize);

        for (let j = 0; j < chunkSymbols.length; j++) {
          const symbol = chunkSymbols[j];
          const rowNum = chunkRows[j];
          const stockStart = new Date().getTime();

          try {
            // Process individual stock - failure inside does NOT stop others
            const result = PlaceholderEngine.processStockData(symbol);

            // Mark last processed time in Stock Master in memory buffer
            updateStatuses.push({
              row: rowNum,
              timestamp: new Date(),
              status: result.status
            });

          } catch (individualError) {
            // Strong error boundary: Keep the loop moving
            const duration = new Date().getTime() - stockStart;
            Logger.error(`MainOrchestrator.updateData[${symbol}]`, duration, individualError);
            updateStatuses.push({
              row: rowNum,
              timestamp: new Date(),
              status: "ERROR"
            });
          }
        }
      }

      // Batch write the processing updates back to Stock Master to keep it fast
      for (const stat of updateStatuses) {
        masterSheet.getRange(stat.row, 7, 1, 1).setValue(stat.timestamp);
      }

      // Automatically purge cache of expired elements
      Cache.purgeExpired();

      Logger.success("MainOrchestrator.updateData", new Date().getTime() - start);

    } catch (globalError) {
      Logger.error("MainOrchestrator.updateData", new Date().getTime() - start, globalError);
      throw globalError;
    } finally {
      Logger.flush();
    }
  }

  /**
   * Orchestrator command for running research backtesting strategies.
   */
  static runBacktest() {
    const start = new Date().getTime();
    Settings.init();
    Logger.init();

    try {
      // Execute future research & analysis placeholders
      PlaceholderEngine.runMovingAverageAnalysis();
      PlaceholderEngine.runBreakoutRetestAnalysis();
      PlaceholderEngine.runBacktestMock();

      Logger.success("MainOrchestrator.runBacktest", new Date().getTime() - start);
    } catch (e) {
      Logger.error("MainOrchestrator.runBacktest", new Date().getTime() - start, e);
      throw e;
    } finally {
      Logger.flush();
    }
  }

  /**
   * Orchestrator command for compiling and outputting generated analytical reports.
   */
  static generateReport() {
    const start = new Date().getTime();
    Settings.init();
    Logger.init();

    try {
      PlaceholderEngine.generateReportMock();
      Logger.success("MainOrchestrator.generateReport", new Date().getTime() - start);
    } catch (e) {
      Logger.error("MainOrchestrator.generateReport", new Date().getTime() - start, e);
      throw e;
    } finally {
      Logger.flush();
    }
  }
}

// Expose globally if context allows
if (typeof exports !== 'undefined') {
  exports.MainOrchestrator = MainOrchestrator;
}
