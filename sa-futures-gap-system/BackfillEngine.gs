/**
 * SA Automatic Futures Gap Analysis System
 * BackfillEngine.gs - Resumable historical backfill for ~6 months of trading-day data.
 * Features:
 * - Checks existing records and skips already-processed dates
 * - Checkpoints state in PropertiesService
 * - Automatically continues batches via time-driven trigger until 100% completion
 * - Differentiates holidays vs transient network failures (never drops failed dates permanently)
 * - Single daily Bhavcopy download per date shared across all active symbols
 */

var BackfillEngine = {
  STATE_KEY: 'BACKFILL_STATE',

  /**
   * Run historical backfill batch.
   * If not completed, stores next checkpoint in PropertiesService, schedules continuation trigger,
   * and returns { completed: false }.
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

    // Load or initialize trading days queue
    var state = this._loadState();
    var tradingDaysQueue;
    var failedRetryMap;

    if (!state || !state.datesQueue || state.datesQueue.length === 0) {
      var allDays = Utils.getHistoricalTradingDays(months);
      var dateStrings = allDays.map(function(d) {
        return Utils.formatDateKey(d);
      });
      tradingDaysQueue = dateStrings;
      failedRetryMap = {};
      SheetManager.log('INFO', 'Backfill', 'Initialized new 6-month backfill queue with ' + tradingDaysQueue.length + ' trading days.');
    } else {
      tradingDaysQueue = state.datesQueue;
      failedRetryMap = state.failedRetryMap || {};
      SheetManager.log('INFO', 'Backfill', 'Resuming backfill. Remaining dates in queue: ' + tradingDaysQueue.length);
    }

    var existingKeys = SheetManager.getExistingRecordKeys();
    var daysToProcess = tradingDaysQueue.slice(0, batchSize);
    var remainingQueue = tradingDaysQueue.slice(batchSize);

    var rowsToAdd = [];
    var processedCount = 0;
    var reenqueueDates = [];

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
        // Already processed and stored
        processedCount++;
        continue;
      }

      // Download shared daily Bhavcopy ONCE for this date
      var dailyData = DataProvider.fetchDailyDataForDate(dateObj, activeSymbols);

      // Check fetch status
      if (dailyData.status === DataProvider.STATUS.HOLIDAY) {
        // Confirmed market holiday or weekend; safe to skip permanently
        processedCount++;
        continue;
      }

      if (dailyData.status === DataProvider.STATUS.NETWORK_ERROR || dailyData.status === DataProvider.STATUS.UNPUBLISHED) {
        // Transient error or not yet published: DO NOT permanently drop!
        // Increment retry count; re-enqueue if within limit
        var retries = (failedRetryMap[dateStr] || 0) + 1;
        failedRetryMap[dateStr] = retries;
        if (retries <= 3) {
          reenqueueDates.push(dateStr);
          SheetManager.log('WARN', 'Backfill', 'Transient failure for ' + dateStr + ' (' + dailyData.errorMsg + '). Re-queuing (attempt ' + retries + '/3).');
        } else {
          SheetManager.log('ERROR', 'Backfill', 'Max retries reached for ' + dateStr + '. Will be left for periodic recovery.');
        }
        processedCount++;
        continue;
      }

      if (!dailyData.isTradingDay || Object.keys(dailyData.symbolsData).length === 0) {
        processedCount++;
        continue;
      }

      // Process each active symbol
      for (var j = 0; j < activeSymbols.length; j++) {
        var symbol = activeSymbols[j];
        var stockData = dailyData.symbolsData[symbol];
        if (!stockData) {
          continue;
        }

        var mapped = ContractMapper.mapContractsForDate(dateObj, stockData);
        if (!mapped.currentContract) {
          continue;
        }

        var curPrice = mapped.currentContract.closePrice;
        var nextPrice = mapped.nextContract ? mapped.nextContract.closePrice : null;
        var spot = mapped.spotPrice;
        var histExpiry = mapped.historicalExpiryDate;

        var recKey = Utils.makeRecordKey(dateStr, symbol, histExpiry);
        if (existingKeys[recKey]) {
          continue;
        }

        var row = GapEngine.buildAnalysisRow(dateStr, symbol, spot, curPrice, nextPrice, histExpiry);
        rowsToAdd.push(row);
        existingKeys[recKey] = true;
      }

      processedCount++;
    }

    // Bulk append newly processed rows
    if (rowsToAdd.length > 0) {
      SheetManager.appendAnalysisRows(rowsToAdd);
      SheetManager.refreshDashboardSummary();
      SheetManager.log('INFO', 'Backfill', 'Appended ' + rowsToAdd.length + ' historical rows for ' + processedCount + ' days.');
    }

    // Combine remaining queue with any transient re-enqueued dates
    var combinedRemaining = remainingQueue.concat(reenqueueDates);

    if (combinedRemaining.length > 0) {
      this._saveState({ datesQueue: combinedRemaining, failedRetryMap: failedRetryMap });
      SheetManager.log('INFO', 'Backfill', 'Batch finished. ' + combinedRemaining.length + ' dates remaining. Triggering auto-continuation.');
      // Automatically chain next batch execution via trigger
      Triggers.scheduleBackfillContinuation();
      return { completed: false, remaining: combinedRemaining.length, newRows: rowsToAdd.length };
    } else {
      this._clearState();
      Triggers.removeContinuationTrigger();
      SheetManager.log('SUCCESS', 'Backfill', 'Historical 6-month backfill successfully completed 100%!');
      return { completed: true, remaining: 0, newRows: rowsToAdd.length };
    }
  },

  /**
   * Reset the backfill state checkpoint and remove continuation triggers
   */
  resetBackfillState: function() {
    this._clearState();
    Triggers.removeContinuationTrigger();
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
