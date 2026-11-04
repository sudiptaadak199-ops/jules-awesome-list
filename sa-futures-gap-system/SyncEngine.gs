/**
 * SA Automatic Futures Gap Analysis System
 * SyncEngine.gs - Automatic symbol change detection, daily EOD update, missing dates recovery, and duplicate prevention.
 */

var SyncEngine = {
  /**
   * Run synchronization cycle:
   * 1. Detect if user added new symbols or modified existing symbols.
   *    If new symbols found, initiate backfill specifically for those symbols.
   * 2. Perform daily EOD update for today / latest trading day.
   * 3. Check for any missing historical dates and recover them.
   */
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

    // 3. Scan and recover missing dates
    this.recoverMissingDates(activeSymbols);

    // Refresh dashboard overview
    SheetManager.refreshDashboardSummary();
  },

  /**
   * Detect symbols in 'Symbols' sheet that have zero historical records in 'Futures Gap Analysis'
   * and automatically backfill history for them.
   */
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
      SheetManager.log('INFO', 'SymbolDetection', 'Detected ' + newSymbols.length + ' new symbol(s): ' + newSymbols.join(', ') + '. Starting backfill.');
      // Run backfill specifically for these symbols
      BackfillEngine.runBackfill();
    }
  },

  /**
   * Perform daily update for today (or last trading day if today is weekend / after hours).
   */
  runDailyUpdate: function(activeSymbols) {
    var today = new Date();
    // If weekend, get most recent Friday
    var targetDate = new Date(today);
    if (targetDate.getDay() === 0) { // Sunday -> Friday
      targetDate.setDate(targetDate.getDate() - 2);
    } else if (targetDate.getDay() === 6) { // Saturday -> Friday
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

    if (!dailyData || !dailyData.isTradingDay || Object.keys(dailyData.symbolsData).length === 0) {
      SheetManager.log('INFO', 'DailyUpdate', 'No market data available for ' + dateStr + ' (likely holiday or not yet published).');
      return;
    }

    var rowsToAdd = [];
    for (var j = 0; j < symbolsToUpdate.length; j++) {
      var symbol = symbolsToUpdate[j];
      var stockData = dailyData.symbolsData[symbol];
      if (!stockData) {
        SheetManager.log('WARN', 'DailyUpdate', 'Missing Bhavcopy data for symbol ' + symbol + ' on ' + dateStr);
        continue;
      }

      var mapped = ContractMapper.mapContractsForDate(targetDate, stockData);
      if (!mapped.currentContract) {
        SheetManager.log('WARN', 'DailyUpdate', 'No active futures contracts for ' + symbol + ' on ' + dateStr);
        continue;
      }

      var curPrice = mapped.currentContract.closePrice;
      var nextPrice = mapped.nextContract ? mapped.nextContract.closePrice : null;
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
      SheetManager.log('SUCCESS', 'DailyUpdate', 'Appended ' + rowsToAdd.length + ' daily records for ' + dateStr);
    }
  },

  /**
   * Scan past trading days (e.g. last 30 trading days) to find and recover any missing dates
   */
  recoverMissingDates: function(activeSymbols) {
    var tradingDays = Utils.getHistoricalTradingDays(1); // Last 1 month (~22 trading days)
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

    if (missingDays.length === 0) return;

    SheetManager.log('INFO', 'Recovery', 'Found ' + missingDays.length + ' missing dates to recover.');
    // Process up to 5 missing dates per run to stay well within GAS execution limits
    var recoveryBatch = missingDays.slice(0, 5);
    var recoveredRows = [];

    for (var m = 0; m < recoveryBatch.length; m++) {
      var mDate = recoveryBatch[m];
      var mDateStr = Utils.formatDateKey(mDate);
      var dailyData = DataProvider.fetchDailyDataForDate(mDate, activeSymbols);
      if (!dailyData || !dailyData.isTradingDay) continue;

      for (var n = 0; n < activeSymbols.length; n++) {
        var sym = activeSymbols[n];
        var sData = dailyData.symbolsData[sym];
        if (!sData) continue;

        var mapped = ContractMapper.mapContractsForDate(mDate, sData);
        if (!mapped.currentContract) continue;

        var cur = mapped.currentContract.closePrice;
        var nxt = mapped.nextContract ? mapped.nextContract.closePrice : null;
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
      SheetManager.log('SUCCESS', 'Recovery', 'Successfully recovered ' + recoveredRows.length + ' missing historical records.');
    }
  }
};
