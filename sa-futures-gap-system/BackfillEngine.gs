/**
 * SA Automatic Futures Gap Analysis System
 * BackfillEngine.gs - Resumable historical backfill for ~6 months of trading-day data.
 * Features:
 * - Automatically checks existing records and skips already-processed dates
 * - Checkpoints state in PropertiesService to prevent Google Apps Script execution timeout (6-minute limit)
 * - Single daily Bhavcopy download per date shared across all active symbols
 * - Preserves valid historical records without fabrication or zero-substitution
 */

var BackfillEngine = {
  STATE_KEY: 'BACKFILL_STATE',

  /**
   * Run historical backfill batch.
   * If not completed, stores next checkpoint in PropertiesService and returns { completed: false }.
   */
  runBackfill: function() {
    SheetManager.initializeSheets();
    var activeSymbols = SheetManager.getActiveSymbols();

    if (activeSymbols.length === 0) {
      SheetManager.log('WARN', 'Backfill', 'No active symbols found in Symbols sheet.');
      return { completed: true, processedDays: 0, newRows: 0 };
    }

    var settings = this._getSettings();
    var months = settings.months || 6;
    var batchSize = settings.batchSize || 15;

    // Load or generate trading days queue
    var state = this._loadState();
    var tradingDaysQueue;

    if (!state || !state.datesQueue || state.datesQueue.length === 0) {
      var allDays = Utils.getHistoricalTradingDays(months);
      // Format as YYYY-MM-DD
      var dateStrings = allDays.map(function(d) {
        return Utils.formatDateKey(d);
      });
      tradingDaysQueue = dateStrings;
      SheetManager.log('INFO', 'Backfill', 'Initialized new 6-month backfill queue with ' + tradingDaysQueue.length + ' trading days.');
    } else {
      tradingDaysQueue = state.datesQueue;
      SheetManager.log('INFO', 'Backfill', 'Resuming backfill. Remaining dates in queue: ' + tradingDaysQueue.length);
    }

    // Get existing keys to prevent duplicate insertions
    var existingKeys = SheetManager.getExistingRecordKeys();

    // Take next batch of days
    var daysToProcess = tradingDaysQueue.slice(0, batchSize);
    var remainingQueue = tradingDaysQueue.slice(batchSize);

    var rowsToAdd = [];
    var processedCount = 0;

    for (var i = 0; i < daysToProcess.length; i++) {
      var dateStr = daysToProcess[i];
      var dateObj = Utils.parseDate(dateStr);
      if (!dateObj) continue;

      // Check if all active symbols already have records for this date
      var allSymbolsPresent = true;
      for (var s = 0; s < activeSymbols.length; s++) {
        var dummyKeyPrefix = dateStr + '|' + activeSymbols[s] + '|';
        var found = false;
        var existingKeysList = Object.keys(existingKeys);
        for (var k = 0; k < existingKeysList.length; k++) {
          if (existingKeysList[k].indexOf(dummyKeyPrefix) === 0) {
            found = true;
            break;
          }
        }
        if (!found) {
          allSymbolsPresent = false;
          break;
        }
      }

      if (allSymbolsPresent) {
        // Skip already-processed date
        processedCount++;
        continue;
      }

      // Download shared daily Bhavcopy ONCE for this date
      var dailyData = DataProvider.fetchDailyDataForDate(dateObj, activeSymbols);
      if (!dailyData || !dailyData.isTradingDay || Object.keys(dailyData.symbolsData).length === 0) {
        // Market holiday or closed; proceed
        processedCount++;
        continue;
      }

      // Process each active symbol
      for (var j = 0; j < activeSymbols.length; j++) {
        var symbol = activeSymbols[j];
        var stockData = dailyData.symbolsData[symbol];
        if (!stockData) {
          continue; // Missing symbol data for date
        }

        var mapped = ContractMapper.mapContractsForDate(dateObj, stockData);
        if (!mapped.currentContract) {
          continue; // No active contracts
        }

        var curPrice = mapped.currentContract.closePrice;
        var nextPrice = mapped.nextContract ? mapped.nextContract.closePrice : null;
        var spot = mapped.spotPrice;
        var histExpiry = mapped.historicalExpiryDate;

        var recKey = Utils.makeRecordKey(dateStr, symbol, histExpiry);
        if (existingKeys[recKey]) {
          continue; // Duplicate prevention
        }

        var row = GapEngine.buildAnalysisRow(dateStr, symbol, spot, curPrice, nextPrice, histExpiry);
        rowsToAdd.push(row);
        existingKeys[recKey] = true;
      }

      processedCount++;
    }

    // Bulk append rows
    if (rowsToAdd.length > 0) {
      SheetManager.appendAnalysisRows(rowsToAdd);
      SheetManager.refreshDashboardSummary();
      SheetManager.log('INFO', 'Backfill', 'Appended ' + rowsToAdd.length + ' historical rows for ' + processedCount + ' days.');
    }

    if (remainingQueue.length > 0) {
      this._saveState({ datesQueue: remainingQueue });
      SheetManager.log('INFO', 'Backfill', 'Batch complete. ' + remainingQueue.length + ' dates remaining. Continuing in next cycle.');
      return { completed: false, remaining: remainingQueue.length, newRows: rowsToAdd.length };
    } else {
      this._clearState();
      SheetManager.log('SUCCESS', 'Backfill', 'Historical 6-month backfill successfully completed!');
      return { completed: true, remaining: 0, newRows: rowsToAdd.length };
    }
  },

  /**
   * Reset the backfill state checkpoint
   */
  resetBackfillState: function() {
    this._clearState();
  },

  _loadState: function() {
    if (typeof PropertiesService === 'undefined') return null;
    try {
      var json = PropertiesService.getScriptProperties().getProperty(this.STATE_KEY);
      return json ? JSON.parse(json) : null;
    } catch (e) {
      return null;
    }
  },

  _saveState: function(state) {
    if (typeof PropertiesService === 'undefined') return;
    try {
      PropertiesService.getScriptProperties().setProperty(this.STATE_KEY, JSON.stringify(state));
    } catch (e) {
      // Ignore
    }
  },

  _clearState: function() {
    if (typeof PropertiesService === 'undefined') return;
    try {
      PropertiesService.getScriptProperties().deleteProperty(this.STATE_KEY);
    } catch (e) {
      // Ignore
    }
  },

  _getSettings: function() {
    return {
      months: 6,
      batchSize: 15
    };
  }
};
