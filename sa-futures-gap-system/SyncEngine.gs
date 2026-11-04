/**
 * SA Automatic Futures Gap Analysis System
 * SyncEngine.gs - Automatic symbol change detection, daily EOD update, 6-month missing dates recovery, and dual sheet synchronization.
 *
 * Rules:
 * 1. Synchronized Dual Insertion: Both 'Futures Gap Analysis' and 'Contract_Mapping' remain strictly synchronized.
 * 2. Strict completeness: ONLY valid complete records (Spot > 0, CurFut > 0, NxtFut > 0) are saved.
 * 3. Starvation prevention & Cursor pagination: Uses rotating cursor offset and exponential backoff so early failing dates never block subsequent missing dates.
 * 4. Missing date list becomes dynamically shorter as dates succeed.
 */

var SyncEngine = {
  RECOVERY_OFFSET_KEY: 'RECOVERY_OFFSET',
  RECOVERY_BACKOFF_KEY: 'RECOVERY_BACKOFF',

  syncAll: function() {
    SheetManager.initializeSheets();
    var activeSymbols = SheetManager.getActiveSymbols();

    if (activeSymbols.length === 0) {
      SheetManager.log('WARN', 'Sync', 'No active symbols in Symbols tab.');
      return;
    }

    // 1. Detect new symbols
    this.detectAndBackfillNewSymbols(activeSymbols);

    // 2. Perform daily update for today/latest trading day
    this.runDailyUpdate(activeSymbols);

    // 3. Scan and recover missing dates across full 6 months with starvation prevention
    this.recoverMissingDates(activeSymbols);

    // Refresh dashboard overview
    SheetManager.refreshDashboardSummary();
  },

  detectAndBackfillNewSymbols: function(activeSymbols) {
    var existingKeys = SheetManager.getExistingRecordKeys();
    var symbolsWithData = {};

    var keyList = Object.keys(existingKeys);
    for (var i = 0; i < keyList.length; i++) {
      var parts = keyList[i].split('|');
      if (parts.length >= 2) {
        symbolsWithData[parts[1]] = true;
      }
    }

    var newSymbols = [];
    for (var j = 0; j < activeSymbols.length; j++) {
      var s = activeSymbols[j];
      if (!symbolsWithData[s]) {
        newSymbols.push(s);
      }
    }

    if (newSymbols.length > 0) {
      SheetManager.log('INFO', 'SymbolDetection', 'Detected ' + newSymbols.length + ' new symbol(s): ' + newSymbols.join(', ') + '. Initiating backfill.');
      BackfillEngine.runBackfill();
    }
  },

  runDailyUpdate: function(activeSymbols) {
    var today = new Date();
    var targetDate = new Date(today);
    if (targetDate.getDay() === 0) {
      targetDate.setDate(targetDate.getDate() - 2);
    } else if (targetDate.getDay() === 6) {
      targetDate.setDate(targetDate.getDate() - 1);
    }

    var dateStr = Utils.formatDateKey(targetDate);
    var existingGapKeys = SheetManager.getExistingRecordKeys();
    var existingMapKeys = SheetManager.getExistingMappingKeys();

    var symbolsToUpdate = [];
    for (var i = 0; i < activeSymbols.length; i++) {
      var sym = activeSymbols[i];
      var prefix = dateStr + '|' + sym + '|';
      var foundGap = false;
      var foundMap = false;

      var gapKeys = Object.keys(existingGapKeys);
      for (var kg = 0; kg < gapKeys.length; kg++) {
        if (gapKeys[kg].indexOf(prefix) === 0) {
          foundGap = true;
          break;
        }
      }

      var mapKeys = Object.keys(existingMapKeys);
      for (var km = 0; km < mapKeys.length; km++) {
        if (mapKeys[km].indexOf(prefix) === 0) {
          foundMap = true;
          break;
        }
      }

      if (!foundGap || !foundMap) {
        symbolsToUpdate.push(sym);
      }
    }

    if (symbolsToUpdate.length === 0) {
      SheetManager.log('INFO', 'DailyUpdate', 'All symbols already up to date for ' + dateStr);
      return;
    }

    SheetManager.log('INFO', 'DailyUpdate', 'Fetching daily Bhavcopy for ' + dateStr + ' for ' + symbolsToUpdate.length + ' symbols.');
    var dailyData = DataProvider.fetchDailyDataForDate(targetDate, symbolsToUpdate);

    if (dailyData.status === DataProvider.STATUS.HOLIDAY) {
      SheetManager.log('INFO', 'DailyUpdate', dateStr + ' is a confirmed holiday/weekend.');
      return;
    }

    if (dailyData.status === DataProvider.STATUS.UNPUBLISHED) {
      SheetManager.log('INFO', 'DailyUpdate', 'Market data for ' + dateStr + ' is not yet published. Will retry on next scheduled trigger.');
      return;
    }

    if (dailyData.status === DataProvider.STATUS.NETWORK_ERROR || dailyData.status === DataProvider.STATUS.ARCHIVE_UNAVAILABLE) {
      SheetManager.log('WARN', 'DailyUpdate', 'Archive issue for ' + dateStr + ': ' + dailyData.errorMsg + '. Will be recovered in next run.');
      return;
    }

    if (!dailyData.isTradingDay || Object.keys(dailyData.symbolsData).length === 0) {
      SheetManager.log('INFO', 'DailyUpdate', 'No market data available for ' + dateStr);
      return;
    }

    var gapRowsToAdd = [];
    var mapRowsToAdd = [];

    for (var j = 0; j < symbolsToUpdate.length; j++) {
      var symbol = symbolsToUpdate[j];
      var stockData = dailyData.symbolsData[symbol];
      if (!stockData) continue;

      var mapped = ContractMapper.mapContractsForDate(targetDate, stockData);
      // STRICT COMPLETENESS
      if (!mapped.currentContract || !mapped.nextContract || mapped.spotPrice === null || mapped.spotPrice <= 0) {
        SheetManager.log('WARN', 'DailyUpdate', 'Incomplete data for ' + symbol + ' on ' + dateStr + '. Not saving.');
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

    if (gapRowsToAdd.length > 0) {
      SheetManager.appendAnalysisRows(gapRowsToAdd);
      SheetManager.log('SUCCESS', 'DailyUpdate', 'Appended ' + gapRowsToAdd.length + ' complete daily records to Futures Gap Analysis for ' + dateStr);
    }
    if (mapRowsToAdd.length > 0) {
      SheetManager.appendMappingRows(mapRowsToAdd);
      SheetManager.log('SUCCESS', 'DailyUpdate', 'Appended ' + mapRowsToAdd.length + ' synchronized records to Contract_Mapping for ' + dateStr);
    }
  },

  /**
   * Scan past trading days across the entire configured 6-month history (~125-130 trading days)
   * to detect and safely recover any missing dates.
   * STARVATION-FREE: Cursor pagination with exponential backoff for repeatedly failing dates.
   */
  recoverMissingDates: function(activeSymbols) {
    var tradingDays = Utils.getHistoricalTradingDays(6);
    var existingGapKeys = SheetManager.getExistingRecordKeys();
    var existingMapKeys = SheetManager.getExistingMappingKeys();

    var missingDays = [];
    for (var i = 0; i < tradingDays.length; i++) {
      var dStr = Utils.formatDateKey(tradingDays[i]);
      var anyMissing = false;
      for (var s = 0; s < activeSymbols.length; s++) {
        var prefix = dStr + '|' + activeSymbols[s] + '|';
        var foundGap = false;
        var foundMap = false;

        var gapKeys = Object.keys(existingGapKeys);
        for (var kg = 0; kg < gapKeys.length; kg++) {
          if (gapKeys[kg].indexOf(prefix) === 0) {
            foundGap = true;
            break;
          }
        }

        var mapKeys = Object.keys(existingMapKeys);
        for (var km = 0; km < mapKeys.length; km++) {
          if (mapKeys[km].indexOf(prefix) === 0) {
            foundMap = true;
            break;
          }
        }

        if (!foundGap || !foundMap) {
          anyMissing = true;
          break;
        }
      }
      if (anyMissing) {
        missingDays.push(tradingDays[i]);
      }
    }

    if (missingDays.length === 0) {
      this._saveOffset(0);
      return;
    }

    SheetManager.log('INFO', 'Recovery', 'Found ' + missingDays.length + ' missing historical dates across 6 months.');

    var now = new Date().getTime();
    var backoffMap = this._loadBackoff();

    // Filter out dates currently in backoff wait period
    var availableMissingDays = missingDays.filter(function(d) {
      var dKey = Utils.formatDateKey(d);
      var info = backoffMap[dKey];
      return !info || !info.nextRetryTime || info.nextRetryTime <= now;
    });

    if (availableMissingDays.length === 0) {
      SheetManager.log('INFO', 'Recovery', 'All ' + missingDays.length + ' missing dates are currently in backoff cool-down. Will resume on next cycle.');
      return;
    }

    // Cursor pagination across available missing dates
    var offset = this._loadOffset();
    if (offset >= availableMissingDays.length) {
      offset = 0;
    }

    var batchSize = 10;
    var recoveryBatch = [];
    for (var b = 0; b < batchSize && b < availableMissingDays.length; b++) {
      var idx = (offset + b) % availableMissingDays.length;
      recoveryBatch.push(availableMissingDays[idx]);
    }

    var nextOffset = (offset + recoveryBatch.length) % availableMissingDays.length;
    this._saveOffset(nextOffset);

    var recoveredGapRows = [];
    var recoveredMapRows = [];

    for (var m = 0; m < recoveryBatch.length; m++) {
      var mDate = recoveryBatch[m];
      var mDateStr = Utils.formatDateKey(mDate);
      var dailyData = DataProvider.fetchDailyDataForDate(mDate, activeSymbols);

      if (dailyData.status === DataProvider.STATUS.HOLIDAY) {
        continue;
      }

      if (dailyData.status === DataProvider.STATUS.NETWORK_ERROR ||
          dailyData.status === DataProvider.STATUS.ARCHIVE_UNAVAILABLE ||
          dailyData.status === DataProvider.STATUS.UNPUBLISHED ||
          dailyData.status === DataProvider.STATUS.PARSING_ERROR) {

        var count = (backoffMap[mDateStr] ? backoffMap[mDateStr].count : 0) + 1;
        var waitMs = Math.min(Math.pow(2, count) * 60000, 24 * 3600 * 1000); // Exponential backoff up to 24h
        backoffMap[mDateStr] = {
          count: count,
          nextRetryTime: now + waitMs
        };

        SheetManager.log('WARN', 'Recovery', 'Temporary error recovering ' + mDateStr + ' (' + dailyData.status + '). Scheduled backoff for ' + Math.round(waitMs / 60000) + ' min.');
        continue;
      }

      if (!dailyData.isTradingDay || Object.keys(dailyData.symbolsData).length === 0) {
        continue;
      }

      var daySuccess = true;
      for (var n = 0; n < activeSymbols.length; n++) {
        var sym = activeSymbols[n];
        var sData = dailyData.symbolsData[sym];
        if (!sData) {
          daySuccess = false;
          continue;
        }

        var mapped = ContractMapper.mapContractsForDate(mDate, sData);
        // STRICT COMPLETENESS
        if (!mapped.currentContract || !mapped.nextContract || mapped.spotPrice === null || mapped.spotPrice <= 0) {
          daySuccess = false;
          continue;
        }

        var cur = mapped.currentContract.closePrice;
        var nxt = mapped.nextContract.closePrice;
        var sp = mapped.spotPrice;
        var exp = mapped.historicalExpiryDate;
        var nxtExp = mapped.nextExpiryDate;
        var curSym = mapped.currentContractSymbol;
        var nxtSym = mapped.nextContractSymbol;

        var rKey = Utils.makeRecordKey(mDateStr, sym, exp);

        if (!existingGapKeys[rKey]) {
          var gapRow = GapEngine.buildAnalysisRow(mDateStr, sym, sp, cur, nxt, exp);
          recoveredGapRows.push(gapRow);
          existingGapKeys[rKey] = true;
        }

        if (!existingMapKeys[rKey]) {
          var mapRow = GapEngine.buildMappingRow(mDateStr, sym, curSym, exp, nxtSym, nxtExp, cur, nxt, 'COMPLETE');
          recoveredMapRows.push(mapRow);
          existingMapKeys[rKey] = true;
        }
      }

      if (daySuccess) {
        delete backoffMap[mDateStr]; // Date succeeded, remove from backoff!
      }
    }

    this._saveBackoff(backoffMap);

    if (recoveredGapRows.length > 0) {
      SheetManager.appendAnalysisRows(recoveredGapRows);
    }
    if (recoveredMapRows.length > 0) {
      SheetManager.appendMappingRows(recoveredMapRows);
    }

    if (recoveredGapRows.length > 0) {
      SheetManager.log('SUCCESS', 'Recovery', 'Successfully recovered ' + recoveredGapRows.length + ' complete synchronized records across both sheets.');
    }
  },

  _loadOffset: function() {
    if (typeof PropertiesService === 'undefined') return 0;
    try {
      var val = PropertiesService.getScriptProperties().getProperty(this.RECOVERY_OFFSET_KEY);
      return val ? parseInt(val, 10) : 0;
    } catch (e) {
      return 0;
    }
  },

  _saveOffset: function(offset) {
    if (typeof PropertiesService === 'undefined') return;
    try {
      PropertiesService.getScriptProperties().setProperty(this.RECOVERY_OFFSET_KEY, String(offset));
    } catch (e) {
      // Ignore
    }
  },

  _loadBackoff: function() {
    if (typeof PropertiesService === 'undefined') return {};
    try {
      var val = PropertiesService.getScriptProperties().getProperty(this.RECOVERY_BACKOFF_KEY);
      return val ? JSON.parse(val) : {};
    } catch (e) {
      return {};
    }
  },

  _saveBackoff: function(map) {
    if (typeof PropertiesService === 'undefined') return;
    try {
      PropertiesService.getScriptProperties().setProperty(this.RECOVERY_BACKOFF_KEY, JSON.stringify(map));
    } catch (e) {
      // Ignore
    }
  }
};
