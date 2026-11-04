/**
 * SA Automatic Futures Gap Analysis System
 * BackfillEngine.gs - Resumable historical backfill for ~6 months of trading-day data.
 *
 * Rules:
 * 1. Checks existing records and skips already-processed dates.
 * 2. Strict completeness rule: ONLY saves complete records (Valid Spot + Current Future + Next Future).
 *    Never permanently saves incomplete records as successful.
 * 3. Dates with PARSING_ERROR, UNPUBLISHED, ARCHIVE_UNAVAILABLE, or NETWORK_ERROR remain recoverable in retry queues.
 * 4. Starvation prevention: Transient failures rotate to the back of the queue so they never block subsequent dates.
 * 5. Automatically continues batches via time-driven trigger until 100% complete.
 */

var BackfillEngine = {
  STATE_KEY: 'BACKFILL_STATE',

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

      // Check if all active symbols already have complete records for this date
      var allSymbolsComplete = true;
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
          allSymbolsComplete = false;
          break;
        }
      }

      if (allSymbolsComplete) {
        processedCount++;
        continue;
      }

      // Download shared daily Bhavcopy ONCE for this date
      var dailyData = DataProvider.fetchDailyDataForDate(dateObj, activeSymbols);

      // Check fetch status
      if (dailyData.status === DataProvider.STATUS.HOLIDAY) {
        // Confirmed holiday / weekend; safe to mark done
        processedCount++;
        continue;
      }

      // Recoverable error conditions: NETWORK_ERROR, ARCHIVE_UNAVAILABLE, UNPUBLISHED, PARSING_ERROR
      if (dailyData.status === DataProvider.STATUS.NETWORK_ERROR ||
          dailyData.status === DataProvider.STATUS.ARCHIVE_UNAVAILABLE ||
          dailyData.status === DataProvider.STATUS.UNPUBLISHED ||
          dailyData.status === DataProvider.STATUS.PARSING_ERROR) {

        var retries = (failedRetryMap[dateStr] || 0) + 1;
        failedRetryMap[dateStr] = retries;

        // Rotate to back of queue to prevent starvation of remaining dates
        if (retries <= 3) {
          reenqueueDates.push(dateStr);
          SheetManager.log('WARN', 'Backfill', 'Temporary issue on ' + dateStr + ' (' + dailyData.status + ': ' + dailyData.errorMsg + '). Re-queuing to back (attempt ' + retries + '/3).');
        } else {
          SheetManager.log('ERROR', 'Backfill', 'Max batch retries reached for ' + dateStr + '. Retaining for periodic recovery.');
        }
        processedCount++;
        continue;
      }

      if (!dailyData.isTradingDay || Object.keys(dailyData.symbolsData).length === 0) {
        processedCount++;
        continue;
      }

      // Process symbols with STRICT completeness requirement
      var dateAllSymbolsProcessed = true;
      for (var j = 0; j < activeSymbols.length; j++) {
        var symbol = activeSymbols[j];
        var stockData = dailyData.symbolsData[symbol];
        if (!stockData) {
          dateAllSymbolsProcessed = false;
          continue;
        }

        var mapped = ContractMapper.mapContractsForDate(dateObj, stockData);
        // STRICT COMPLETENESS CHECK: Spot, Current Future, and Next Future must all be valid (> 0)
        if (!mapped.currentContract || !mapped.nextContract || mapped.spotPrice === null || mapped.spotPrice <= 0) {
          // INCOMPLETE record! Do NOT permanently save as successful!
          dateAllSymbolsProcessed = false;
          SheetManager.log('WARN', 'Backfill', 'Incomplete data for ' + symbol + ' on ' + dateStr + ' (Spot/CurFut/NxtFut missing). Skipped permanent save.');
          continue;
        }

        var curPrice = mapped.currentContract.closePrice;
        var nextPrice = mapped.nextContract.closePrice;
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

      if (!dateAllSymbolsProcessed) {
        // Re-enqueue date if symbols had incomplete data so later recovery can retry
        var incRetries = (failedRetryMap[dateStr] || 0) + 1;
        failedRetryMap[dateStr] = incRetries;
        if (incRetries <= 3) {
          reenqueueDates.push(dateStr);
        }
      }

      processedCount++;
    }

    if (rowsToAdd.length > 0) {
      SheetManager.appendAnalysisRows(rowsToAdd);
      SheetManager.refreshDashboardSummary();
      SheetManager.log('INFO', 'Backfill', 'Appended ' + rowsToAdd.length + ' complete historical rows for ' + processedCount + ' days.');
    }

    // Append transient re-enqueued dates to the END of the queue (starvation prevention)
    var combinedRemaining = remainingQueue.concat(reenqueueDates);

    if (combinedRemaining.length > 0) {
      this._saveState({ datesQueue: combinedRemaining, failedRetryMap: failedRetryMap });
      SheetManager.log('INFO', 'Backfill', 'Batch complete. ' + combinedRemaining.length + ' dates remaining. Triggering auto-continuation.');
      Triggers.scheduleBackfillContinuation();
      return { completed: false, remaining: combinedRemaining.length, newRows: rowsToAdd.length };
    } else {
      this._clearState();
      Triggers.removeContinuationTrigger();
      SheetManager.log('SUCCESS', 'Backfill', 'Historical 6-month backfill successfully completed 100%!');
      return { completed: true, remaining: 0, newRows: rowsToAdd.length };
    }
  },

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
