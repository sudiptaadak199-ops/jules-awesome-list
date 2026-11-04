/**
 * SA Automatic Futures Gap Analysis System
 * SyncEngine.gs - Automatic symbol change detection, daily EOD update, 6-month missing dates recovery, and duplicate prevention.
 *
 * Rules:
 * 1. Strict completeness: ONLY valid complete records (Spot > 0, CurFut > 0, NxtFut > 0) are saved.
 * 2. Recovery batch starvation prevention: rotates failed dates to the back of the queue and uses a sliding offset so earlier failing dates never block later missing dates from being recovered.
 * 3. Differentiates holidays from archive 404/unavailable dates.
 */

var SyncEngine = {
  RECOVERY_OFFSET_KEY: 'RECOVERY_OFFSET',

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
    var existingKeys = SheetManager.getExistingRecordKeys();

    var symbolsToUpdate = [];
    for (var i = 0; i < activeSymbols.length; i++) {
      var sym = activeSymbols[i];
      var prefix = dateStr + '|' + sym + '|';
      var found = false;
      var keys = Object.keys(existingKeys);
      for (var k = 0; k < keys.length; k++) {
        if (keys[k].indexOf(prefix) === 0) {
          found = true;
          break;
        }
      }
      if (!found) {
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

    var rowsToAdd = [];
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

      var recKey = Utils.makeRecordKey(dateStr, symbol, histExpiry);
      if (existingKeys[recKey]) continue;

      var row = GapEngine.buildAnalysisRow(dateStr, symbol, spot, curPrice, nextPrice, histExpiry);
      rowsToAdd.push(row);
      existingKeys[recKey] = true;
    }

    if (rowsToAdd.length > 0) {
      SheetManager.appendAnalysisRows(rowsToAdd);
      SheetManager.log('SUCCESS', 'DailyUpdate', 'Appended ' + rowsToAdd.length + ' complete daily records for ' + dateStr);
    }
  },

  /**
   * Scan past trading days across the entire configured 6-month history (~125-130 trading days)
   * to detect and safely recover any missing dates.
   * STARVATION-FREE: Uses a rotating offset so early failing dates do not prevent subsequent missing dates
   * from being processed.
   */
  recoverMissingDates: function(activeSymbols) {
    var tradingDays = Utils.getHistoricalTradingDays(6);
    var existingKeys = SheetManager.getExistingRecordKeys();

    var missingDays = [];
    for (var i = 0; i < tradingDays.length; i++) {
      var dStr = Utils.formatDateKey(tradingDays[i]);
      var anyMissing = false;
      for (var s = 0; s < activeSymbols.length; s++) {
        var prefix = dStr + '|' + activeSymbols[s] + '|';
        var found = false;
        var keys = Object.keys(existingKeys);
        for (var k = 0; k < keys.length; k++) {
          if (keys[k].indexOf(prefix) === 0) {
            found = true;
            break;
          }
        }
        if (!found) {
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

    // Starvation Prevention: Read previous offset and slice batch with circular wrap-around
    var offset = this._loadOffset();
    if (offset >= missingDays.length) {
      offset = 0;
    }

    var batchSize = 10;
    var recoveryBatch = [];
    for (var b = 0; b < batchSize && b < missingDays.length; b++) {
      var idx = (offset + b) % missingDays.length;
      recoveryBatch.push(missingDays[idx]);
    }

    // Save next offset for the following cycle
    var nextOffset = (offset + recoveryBatch.length) % missingDays.length;
    this._saveOffset(nextOffset);

    var recoveredRows = [];

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
        SheetManager.log('WARN', 'Recovery', 'Temporary error recovering ' + mDateStr + ' (' + dailyData.status + ': ' + dailyData.errorMsg + '). Kept in queue.');
        continue;
      }

      if (!dailyData.isTradingDay || Object.keys(dailyData.symbolsData).length === 0) {
        continue;
      }

      for (var n = 0; n < activeSymbols.length; n++) {
        var sym = activeSymbols[n];
        var sData = dailyData.symbolsData[sym];
        if (!sData) continue;

        var mapped = ContractMapper.mapContractsForDate(mDate, sData);
        // STRICT COMPLETENESS
        if (!mapped.currentContract || !mapped.nextContract || mapped.spotPrice === null || mapped.spotPrice <= 0) {
          continue;
        }

        var cur = mapped.currentContract.closePrice;
        var nxt = mapped.nextContract.closePrice;
        var sp = mapped.spotPrice;
        var exp = mapped.historicalExpiryDate;

        var rKey = Utils.makeRecordKey(mDateStr, sym, exp);
        if (existingKeys[rKey]) continue;

        var row = GapEngine.buildAnalysisRow(mDateStr, sym, sp, cur, nxt, exp);
        recoveredRows.push(row);
        existingKeys[rKey] = true;
      }
    }

    if (recoveredRows.length > 0) {
      SheetManager.appendAnalysisRows(recoveredRows);
      SheetManager.log('SUCCESS', 'Recovery', 'Successfully recovered ' + recoveredRows.length + ' complete historical records across 6 months.');
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
  }
};
