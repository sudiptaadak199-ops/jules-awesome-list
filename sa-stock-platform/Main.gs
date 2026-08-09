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
   * Auto-preloads mock historical prices if the Historical Data sheet is empty,
   * ensuring immediate functionality for the Sector Rotation calculations.
   */
  static initializeProject() {
    var start = new Date().getTime();
    try {
      // 1. Core structural creation & auto-repair styling
      SheetManager.initializeAllSheets();

      // 2. Initialize cached systems
      Settings.init();
      Logger.init();

      // 3. Preload 30 days of mock historical pricing data if Historical Data sheet is empty
      var ss = SheetManager.getActiveSpreadsheet();
      var histSheet = ss.getSheetByName(Config.SHEETS.HISTORICAL_DATA);
      if (histSheet && histSheet.getLastRow() <= 1) {
        var preloadedRows = SheetManager.preloadHistoricalData();
        if (preloadedRows > 0) {
          Logger.warning("MainOrchestrator.initializeProject", 0, "Preloaded " + preloadedRows + " historical market price rows automatically.");
        }
      }

      // 4. Verify and setup installable triggers programmatically
      var triggerStatus = this.checkAndRepairTriggers();
      if (triggerStatus === "repaired") {
        Logger.warning("MainOrchestrator.initializeProject", 0, "Re-established automatic daily trigger 'triggerUpdateData' successfully.");
      }

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
   * Runs a comprehensive lightweight health check of all platform subsystems.
   * Automatically heals missing sheets, misconfigured headers, absent triggers, or lost configurations.
   */
  static performHealthCheckAndRepair() {
    var start = new Date().getTime();
    var repairs = [];

    try {
      var ss = SheetManager.getActiveSpreadsheet();
      var sheetDefs = Config.SHEETS_DEFINITION;

      // 1. Repair missing sheets or corrupted headers
      for (var sheetName in sheetDefs) {
        var sheet = ss.getSheetByName(sheetName);
        var def = sheetDefs[sheetName];

        if (!sheet) {
          SheetManager.ensureAndRepairSheet(ss, sheetName, def);
          repairs.push("Created missing sheet: [" + sheetName + "]");
          continue;
        }

        // Repair headers if missing or invalid
        if (def.headers) {
          var lastRow = sheet.getLastRow();
          var currentHeaders = lastRow > 0 ? sheet.getRange(1, 1, 1, def.headers.length).getValues()[0] : [];
          var headersMatch = true;

          for (var i = 0; i < def.headers.length; i++) {
            if (String(currentHeaders[i]).trim() !== String(def.headers[i]).trim()) {
              headersMatch = false;
              break;
            }
          }

          if (!headersMatch) {
            var headerRange = sheet.getRange(1, 1, 1, def.headers.length);
            headerRange.setValues([def.headers]);
            SheetManager.applyHeaderStyle(headerRange);
            repairs.push("Healed corrupted headers on sheet: [" + sheetName + "]");
          }
        }
      }

      // 2. Repair missing configuration settings
      var defaults = Config.DEFAULT_SETTINGS;
      var settingsSheet = ss.getSheetByName(Config.SHEETS.SETTINGS);
      if (settingsSheet) {
        var lastSettingsRow = settingsSheet.getLastRow();
        var currentKeys = {};
        if (lastSettingsRow > 1) {
          var data = settingsSheet.getRange(2, 1, lastSettingsRow - 1, 1).getValues();
          for (var i = 0; i < data.length; i++) {
            currentKeys[String(data[i][0]).trim()] = true;
          }
        }

        for (var i = 1; i < defaults.length; i++) {
          var defaultKey = defaults[i][0];
          if (!currentKeys[defaultKey]) {
            var nowStr = PlatformUtils.formatDate(new Date());
            settingsSheet.appendRow([defaultKey, defaults[i][1], defaults[i][2], nowStr]);
            repairs.push("Restored default setting: [" + defaultKey + "]");
          }
        }
      }

      // 3. Repair missing triggers
      var triggerStatus = this.checkAndRepairTriggers();
      if (triggerStatus === "repaired") {
        repairs.push("Reconstructed missing daily update trigger.");
      }

      // 4. Validate and repair corrupted cache structures
      var cacheSheet = ss.getSheetByName(Config.SHEETS.CACHE);
      if (cacheSheet && cacheSheet.getLastRow() > 1) {
        try {
          var cacheValues = cacheSheet.getRange(2, 1, cacheSheet.getLastRow() - 1, 3).getValues();
          // Check for any row with invalid or un-parsable date
          var isCorrupt = false;
          for (var i = 0; i < cacheValues.length; i++) {
            var dateVal = new Date(cacheValues[i][2]);
            if (isNaN(dateVal.getTime())) {
              isCorrupt = true;
              break;
            }
          }
          if (isCorrupt) {
            Cache.clearAll();
            repairs.push("Detected and cleared corrupted cache entries.");
          }
        } catch (cacheErr) {
          Cache.clearAll();
          repairs.push("Purged corrupted cache table.");
        }
      }

      // Log all completed repairs
      if (repairs.length > 0) {
        var elapsed = new Date().getTime() - start;
        for (var i = 0; i < repairs.length; i++) {
          Logger.warning("SelfHealing.HealthCheck", elapsed, repairs[i]);
          console.log("[SA SELF-HEALING] " + repairs[i]);
        }
      }

    } catch (e) {
      console.error("Self-healing check encountered an error: " + e.message);
    }
  }

  /**
   * Safe getter/creator of installable triggers.
   * @returns {string} Trigger status ("ok", "repaired", "bypassed").
   */
  static checkAndRepairTriggers() {
    try {
      var triggers = ScriptApp.getProjectTriggers();
      var triggerExists = false;
      for (var i = 0; i < triggers.length; i++) {
        if (triggers[i].getHandlerFunction() === "triggerUpdateData") {
          triggerExists = true;
          break;
        }
      }
      if (!triggerExists) {
        // Create daily time-driven trigger for updateData (scheduled for 4 PM standard NSE market close)
        ScriptApp.newTrigger("triggerUpdateData")
                 .timeBased()
                 .everyDays(1)
                 .atHour(16)
                 .create();
        return "repaired";
      }
    } catch (triggerErr) {
      console.warn("Trigger validation bypassed (requires installable trigger authentication/scopes): " + triggerErr.message);
      return "bypassed";
    }
    return "ok";
  }

  /**
   * Orchestrates high-performance data ingestion across master listings.
   * Implements full 14-step architecture:
   * 1. Check self-healing health.
   * 2. Initialize in-memory configuration.
   * 3. Fetch active master stocks in bulk.
   * 4. Query caching layer to bypass unnecessary API fetches.
   * 5. Fallback fetch from raw API feeds on cache miss.
   * 6. Perform validation metrics and accumulate price history rows.
   * 7. Trigger the Sector Engine rotation and ranking calculations.
   * 8. Append records, purge cache, track statistics, and write Performance Monitor to Dashboard.
   */
  static updateData() {
    var start = new Date().getTime();

    // 1. Execute safety self-healing health check on major start
    this.performHealthCheckAndRepair();

    Settings.init();
    Logger.init();

    // Monitor statistics variables for Dashboard status box
    var monitorStats = {
      executionTime: 0,
      stocksProcessed: 0,
      sectorsProcessed: 0,
      dataRowsUpdated: 0,
      apiRequests: 0,
      failedRequests: 0
    };

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
      var cacheEnabled = Settings.getBool("Cache Enabled", true);

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
            var result = null;
            var cacheKey = "LAST_PRICE_DATA_" + symbol;

            // 1. Check Caching Layer
            var cachedData = cacheEnabled ? Cache.get(cacheKey) : null;
            if (cachedData) {
              try {
                result = JSON.parse(cachedData);
              } catch (e) {
                result = null; // Cache corrupted
              }
            }

            // 2. Fetch from Feed on Cache Miss
            if (!result) {
              monitorStats.apiRequests += 1;
              var fetchRes = DataProvider.fetchAndStoreStockData(symbol);
              if (fetchRes.status === "SUCCESS") {
                result = fetchRes;
                if (cacheEnabled && fetchRes.records.length > 0) {
                  Cache.put(cacheKey, fetchRes, 60); // Cache for 60 minutes
                }
              } else {
                monitorStats.failedRequests += 1;
                throw new Error("Market Data API fetch failed for [" + symbol + "]");
              }
            }

            // 3. Accumulate historical rows in memory
            if (result && result.records && result.records.length > 0) {
              for (var k = 0; k < result.records.length; k++) {
                // Ensure Date object formatting
                var row = result.records[k];
                row[9] = new Date(); // Update Timestamp column (index 9)
                accumulatedHistoricalRows.push(row);
              }
            }

            // Update local memory data matrix Last Processed Column
            masterData[dataIndex][6] = new Date(); // Col 7 is Last Processed (index 6)

          } catch (individualError) {
            var stockElapsed = new Date().getTime() - stockStart;
            Logger.error("MainOrchestrator.updateData[" + symbol + "]", stockElapsed, individualError);
          }
        }
      }

      // Performance Optimization: Write all accumulated historical rows in exactly ONE batch call
      if (accumulatedHistoricalRows.length > 0) {
        SheetManager.batchAppend(Config.SHEETS.HISTORICAL_DATA, accumulatedHistoricalRows);
        monitorStats.dataRowsUpdated = accumulatedHistoricalRows.length;
      }

      // Batch write updated Last Processed column back to Stock Master
      var lastProcessedColumnValues = [];
      for (var i = 0; i < masterData.length; i++) {
        lastProcessedColumnValues.push([masterData[i][6]]);
      }

      // Column 7 in Stock Master is 'Last Processed'
      masterSheet.getRange(2, 7, lastProcessedColumnValues.length, 1).setValues(lastProcessedColumnValues);

      // Purge and clear expired Cache items dynamically to keep sheet compact
      Cache.purgeExpired();

      // Trigger the Sector Rotation Calculations & Scoring Engine
      // Passes monitor stats so the engine can update stocks, sectors, and render Dashboard
      monitorStats.executionTime = new Date().getTime() - start;
      SectorEngine.runSectorPipeline(monitorStats);

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
    this.performHealthCheckAndRepair();

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
    this.performHealthCheckAndRepair();

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
