/**
 * SA Automatic Futures Gap Analysis System
 * BackfillEngine.gs - Resumable historical backfill for ~6 months of trading-day data.
 *
 * Rules:
 * 1. Dual synchronization: Saves complete rows to BOTH 'Futures Gap Analysis' and 'Contract_Mapping' simultaneously.
 * 2. Strict completeness rule: ONLY saves complete records (Valid Spot + Current Future + Next Future).
 * 3. Starvation prevention & queue rotation: Failing dates are rotated to the end of the queue.
 * 4. Exponential backoff tracking for temporary archive/network errors.
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

    var existingGapKeys = SheetManager.getExistingRecordKeys();
    var existingMapKeys = SheetManager.getExistingMappingKeys();

    var daysToProcess = tradingDaysQueue.slice(0, batchSize);
    var remainingQueue = tradingDaysQueue.slice(batchSize);

    var gapRowsToAdd = [];
    var mapRowsToAdd = [];
    var processedCount = 0;
    var reenqueueDates = [];

    var now = new Date().getTime();

    for (var i = 0; i < daysToProcess.length; i++) {
      var dateStr = daysToProcess[i];
      var dateObj = Utils.parseDate(dateStr);
      if (!dateObj) continue;

      // Exponential backoff check: if nextRetryTime > now, defer
      var retryInfo = failedRetryMap[dateStr];
      if (retryInfo && retryInfo.nextRetryTime && retryInfo.nextRetryTime > now) {
        reenqueueDates.push(dateStr);
        continue;
      }

      // Check if all active symbols already have complete synchronized records
      var allSymbolsComplete = true;
      for (var s = 0; s < activeSymbols.length; s++) {
        var dummyKeyPrefix = dateStr + '|' + activeSymbols[s] + '|';
        var foundGap = false;
        var foundMap = false;

        var gapKeysList = Object.keys(existingGapKeys);
        for (var kg = 0; kg < gapKeysList.length; kg++) {
          if (gapKeysList[kg].indexOf(dummyKeyPrefix) === 0) {
            foundGap = true;
            break;
          }
        }

        var mapKeysList = Object.keys(existingMapKeys);
        for (var km = 0; km < mapKeysList.length; km++) {
          if (mapKeysList[km].indexOf(dummyKeyPrefix) === 0) {
            foundMap = true;
            break;
          }
        }

        if (!foundGap || !foundMap) {
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
        processedCount++;
        continue;
      }

      // Recoverable error conditions: NETWORK_ERROR, ARCHIVE_UNAVAILABLE, UNPUBLISHED, PARSING_ERROR
      if (dailyData.status === DataProvider.STATUS.NETWORK_ERROR ||
          dailyData.status === DataProvider.STATUS.ARCHIVE_UNAVAILABLE ||
          dailyData.status === DataProvider.STATUS.UNPUBLISHED ||
          dailyData.status === DataProvider.STATUS.PARSING_ERROR) {

        var currentCount = (retryInfo ? retryInfo.count : 0) + 1;
        // Exponential backoff: 2^count * 60,000 ms (e.g. 2 min, 4 min, 8 min)
        var backoffMs = Math.pow(2, currentCount) * 60000;
        failedRetryMap[dateStr] = {
          count: currentCount,
          nextRetryTime: now + backoffMs
        };

        if (currentCount <= 5) {
          reenqueueDates.push(dateStr);
          SheetManager.log('WARN', 'Backfill', 'Temporary issue on ' + dateStr + ' (' + dailyData.status + '). Re-queued with backoff (attempt ' + currentCount + '/5).');
        } else {
          SheetManager.log('ERROR', 'Backfill', 'Max batch retries reached for ' + dateStr + '. Retained for background recovery.');
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
        // STRICT COMPLETENESS: Spot, Current Future, and Next Future must all be valid (> 0)
        if (!mapped.currentContract || !mapped.nextContract || mapped.spotPrice === null || mapped.spotPrice <= 0) {
          dateAllSymbolsProcessed = false;
          SheetManager.log('WARN', 'Backfill', 'Incomplete data for ' + symbol + ' on ' + dateStr + '. Skipped permanent save.');
          continue;
        }

        var curPrice = mapped.currentContract.closePrice;
        var nextPrice = mapped.nextContract.closePrice;
        var spot = mapped.spotPrice;
        var histExpiry = mapped.historicalExpiryDate;
        var nextExpiry = mapped.nextExpiryDate;
        var curContractSym = mapped.currentContractSymbol;
        var nextContractSym = mapped.nextContractSymbol;

        var recKey = Utils.makeRecordKey(dateStr, symbol, histExpiry);

        // Synchronized Dual Insertion
        if (!existingGapKeys[recKey]) {
          var gapRow = GapEngine.buildAnalysisRow(dateStr, symbol, spot, curPrice, nextPrice, histExpiry);
          gapRowsToAdd.push(gapRow);
          existingGapKeys[recKey] = true;
        }

        if (!existingMapKeys[recKey]) {
          var mapRow = GapEngine.buildMappingRow(dateStr, symbol, curContractSym, histExpiry, nextContractSym, nextExpiry, curPrice, nextPrice, 'COMPLETE');
          mapRowsToAdd.push(mapRow);
          existingMapKeys[recKey] = true;
        }
      }

      if (!dateAllSymbolsProcessed) {
        var incCount = (retryInfo ? retryInfo.count : 0) + 1;
        failedRetryMap[dateStr] = {
          count: incCount,
          nextRetryTime: now + (Math.pow(2, incCount) * 60000)
        };
        if (incCount <= 5) {
          reenqueueDates.push(dateStr);
        }
      } else {
        // Successfully processed: remove from failed retry map
        delete failedRetryMap[dateStr];
      }

      processedCount++;
    }

    // Synchronously append rows to both sheets
    if (gapRowsToAdd.length > 0) {
      SheetManager.appendAnalysisRows(gapRowsToAdd);
      SheetManager.refreshDashboardSummary();
    }
    if (mapRowsToAdd.length > 0) {
      SheetManager.appendMappingRows(mapRowsToAdd);
    }

    if (gapRowsToAdd.length > 0) {
      SheetManager.log('INFO', 'Backfill', 'Synchronously appended ' + gapRowsToAdd.length + ' complete historical rows across both sheets for ' + processedCount + ' days.');
    }

    // Starvation Prevention: Rotate re-enqueued dates to the END of the queue
    var combinedRemaining = remainingQueue.concat(reenqueueDates);

    if (combinedRemaining.length > 0) {
      this._saveState({ datesQueue: combinedRemaining, failedRetryMap: failedRetryMap });
      SheetManager.log('INFO', 'Backfill', 'Batch complete. ' + combinedRemaining.length + ' dates remaining. Triggering auto-continuation.');
      Triggers.scheduleBackfillContinuation();
      return { completed: false, remaining: combinedRemaining.length, newRows: gapRowsToAdd.length };
    } else {
      this._clearState();
      Triggers.removeContinuationTrigger();
      SheetManager.log('SUCCESS', 'Backfill', 'Historical 6-month backfill successfully completed 100%!');
      return { completed: true, remaining: 0, newRows: gapRowsToAdd.length };
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
