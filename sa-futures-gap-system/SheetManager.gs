/**
 * SA Automatic Futures Gap Analysis System
 * SheetManager.gs - Complete self-healing sheet creation, styling, and schema formatting.
 * Creates tabs:
 * 1. Symbols - Minimal user input sheet (User only adds/changes Symbols here)
 * 2. Futures Gap Analysis - Required 10 columns storing contract-level gap history
 * 3. Dashboard - Executive real-time summary, latest gap signals, expiry countdown
 * 4. Settings - Configurable runtime properties
 * 5. Logs - Execution and recovery audit trail
 */

var SheetManager = {
  /**
   * Initialize or verify all required sheets in the active spreadsheet
   */
  initializeSheets: function() {
    if (typeof SpreadsheetApp === 'undefined') return;

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!ss) return;

    this.ensureSymbolsSheet(ss);
    this.ensureGapAnalysisSheet(ss);
    this.ensureDashboardSheet(ss);
    this.ensureSettingsSheet(ss);
    this.ensureLogsSheet(ss);
  },

  /**
   * 1. Symbols Sheet: User ONLY enters symbols here.
   */
  ensureSymbolsSheet: function(ss) {
    var sheet = ss.getSheetByName(CONFIG.SHEETS.SYMBOLS);
    if (!sheet) {
      sheet = ss.insertSheet(CONFIG.SHEETS.SYMBOLS, 0);
    }

    var lastRow = sheet.getLastRow();
    if (lastRow === 0) {
      // Header
      var headers = [['Symbol', 'Status', 'Last Updated', 'Notes']];
      var range = sheet.getRange(1, 1, 1, 4);
      range.setValues(headers);
      range.setBackground(CONFIG.COLORS.HEADER_BG);
      range.setFontColor(CONFIG.COLORS.HEADER_FG);
      range.setFontWeight('bold');
      sheet.setFrozenRows(1);

      // Default sample symbols
      var defaultRows = CONFIG.DEFAULT_SYMBOLS.map(function(s) {
        return [s, 'ACTIVE', '', 'Default initial symbol'];
      });
      sheet.getRange(2, 1, defaultRows.length, 4).setValues(defaultRows);
      sheet.autoResizeColumns(1, 4);
    }
    return sheet;
  },

  /**
   * 2. Futures Gap Analysis Sheet: Exactly the 10 required columns
   */
  ensureGapAnalysisSheet: function(ss) {
    var sheet = ss.getSheetByName(CONFIG.SHEETS.GAP_ANALYSIS);
    if (!sheet) {
      sheet = ss.insertSheet(CONFIG.SHEETS.GAP_ANALYSIS);
    }

    var lastRow = sheet.getLastRow();
    if (lastRow === 0) {
      var headers = [CONFIG.GAP_ANALYSIS_COLUMNS];
      var range = sheet.getRange(1, 1, 1, CONFIG.GAP_ANALYSIS_COLUMNS.length);
      range.setValues(headers);
      range.setBackground(CONFIG.COLORS.HEADER_BG);
      range.setFontColor(CONFIG.COLORS.HEADER_FG);
      range.setFontWeight('bold');
      sheet.setFrozenRows(1);

      // Set number formats
      // Col 1: Date (YYYY-MM-DD), Col 2: Text, Col 3-5: Prices (0.00), Col 6-7: Gaps, Col 8-9: Spot Gaps, Col 10: Date
      sheet.getRange('A:A').setNumberFormat('@');
      sheet.getRange('B:B').setNumberFormat('@');
      sheet.getRange('C:E').setNumberFormat('#,##0.00');
      sheet.getRange('F:F').setNumberFormat('#,##0.00');
      sheet.getRange('G:G').setNumberFormat('0.000"%"');
      sheet.getRange('H:H').setNumberFormat('#,##0.00');
      sheet.getRange('I:I').setNumberFormat('0.000"%"');
      sheet.getRange('J:J').setNumberFormat('@');

      sheet.autoResizeColumns(1, CONFIG.GAP_ANALYSIS_COLUMNS.length);
    }
    return sheet;
  },

  /**
   * 3. Dashboard Sheet: High-level overview and real-time gap monitor
   */
  ensureDashboardSheet: function(ss) {
    var sheet = ss.getSheetByName(CONFIG.SHEETS.DASHBOARD);
    if (!sheet) {
      sheet = ss.insertSheet(CONFIG.SHEETS.DASHBOARD, 1);
    }

    var lastRow = sheet.getLastRow();
    if (lastRow === 0) {
      // Title
      sheet.getRange('A1:J1').merge();
      var titleCell = sheet.getRange('A1');
      titleCell.setValue('⚡ SA AUTOMATIC FUTURES GAP ANALYSIS DASHBOARD');
      titleCell.setBackground(CONFIG.COLORS.HEADER_BG);
      titleCell.setFontColor('#ffffff');
      titleCell.setFontSize(14);
      titleCell.setFontWeight('bold');
      titleCell.setHorizontalAlignment('center');

      // Metric Cards row
      sheet.getRange('A3').setValue('Active Symbols:');
      sheet.getRange('B3').setFormula('=COUNTA(Symbols!A2:A)');
      sheet.getRange('D3').setValue('Total Historical Records:');
      sheet.getRange('E3').setFormula('=COUNTA(\'Futures Gap Analysis\'!A2:A)');
      sheet.getRange('G3').setValue('Last Sync Status:');
      sheet.getRange('H3').setValue('Ready');

      // Summary table headers
      var summaryHeaders = [
        ['Symbol', 'Latest Date', 'Spot Price', 'Current Fut', 'Next Fut', 'Cur-Next Gap', 'Cur-Next Gap %', 'Spot-Fut Gap', 'Spot-Fut Gap %', 'Expiry Date']
      ];
      var sRange = sheet.getRange(5, 1, 1, 10);
      sRange.setValues(summaryHeaders);
      sRange.setBackground('#334155');
      sRange.setFontColor('#ffffff');
      sRange.setFontWeight('bold');
      sheet.setFrozenRows(5);
    }
    return sheet;
  },

  /**
   * 4. Settings Sheet
   */
  ensureSettingsSheet: function(ss) {
    var sheet = ss.getSheetByName(CONFIG.SHEETS.SETTINGS);
    if (!sheet) {
      sheet = ss.insertSheet(CONFIG.SHEETS.SETTINGS);
    }

    var lastRow = sheet.getLastRow();
    if (lastRow === 0) {
      var rows = CONFIG.DEFAULT_SETTINGS;
      var range = sheet.getRange(1, 1, rows.length, 3);
      range.setValues(rows);
      var headerRange = sheet.getRange(1, 1, 1, 3);
      headerRange.setBackground(CONFIG.COLORS.HEADER_BG);
      headerRange.setFontColor('#ffffff');
      headerRange.setFontWeight('bold');
      sheet.setFrozenRows(1);
      sheet.autoResizeColumns(1, 3);
    }
    return sheet;
  },

  /**
   * 5. Logs Sheet
   */
  ensureLogsSheet: function(ss) {
    var sheet = ss.getSheetByName(CONFIG.SHEETS.LOGS);
    if (!sheet) {
      sheet = ss.insertSheet(CONFIG.SHEETS.LOGS);
    }

    var lastRow = sheet.getLastRow();
    if (lastRow === 0) {
      var headers = [['Timestamp', 'Level', 'Action', 'Message']];
      var range = sheet.getRange(1, 1, 1, 4);
      range.setValues(headers);
      range.setBackground(CONFIG.COLORS.HEADER_BG);
      range.setFontColor('#ffffff');
      range.setFontWeight('bold');
      sheet.setFrozenRows(1);
      sheet.autoResizeColumns(1, 4);
    }
    return sheet;
  },

  /**
   * Log action to Logs sheet and GAS Logger
   */
  log: function(level, action, message) {
    var timeStr = new Date().toISOString();
    if (typeof Logger !== 'undefined') {
      Logger.log('[' + level + '] ' + action + ': ' + message);
    }

    if (typeof SpreadsheetApp === 'undefined') return;
    try {
      var ss = SpreadsheetApp.getActiveSpreadsheet();
      if (!ss) return;
      var sheet = ss.getSheetByName(CONFIG.SHEETS.LOGS);
      if (!sheet) return;

      sheet.appendRow([timeStr, level, action, message]);
      // Trim logs if exceeding limit
      var lastRow = sheet.getLastRow();
      if (lastRow > 1000) {
        sheet.deleteRows(2, lastRow - 1000);
      }
    } catch (e) {
      // Ignore logging failure to prevent blocking execution
    }
  },

  /**
   * Get active symbols list from 'Symbols' tab
   */
  getActiveSymbols: function() {
    if (typeof SpreadsheetApp === 'undefined') return CONFIG.DEFAULT_SYMBOLS;

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!ss) return CONFIG.DEFAULT_SYMBOLS;

    var sheet = ss.getSheetByName(CONFIG.SHEETS.SYMBOLS);
    if (!sheet) return CONFIG.DEFAULT_SYMBOLS;

    var lastRow = sheet.getLastRow();
    if (lastRow <= 1) return [];

    var values = sheet.getRange(2, 1, lastRow - 1, 2).getValues();
    var activeSymbols = [];

    for (var i = 0; i < values.length; i++) {
      var sym = String(values[i][0] || '').trim().toUpperCase();
      var status = String(values[i][1] || 'ACTIVE').trim().toUpperCase();
      if (sym && (status === 'ACTIVE' || status === '')) {
        if (activeSymbols.indexOf(sym) === -1) {
          activeSymbols.push(sym);
        }
      }
    }

    return activeSymbols;
  },

  /**
   * Read existing records in 'Futures Gap Analysis' to build set of existing keys
   * Key: Date|Symbol|HistoricalExpiryDate
   */
  getExistingRecordKeys: function() {
    var set = {};
    if (typeof SpreadsheetApp === 'undefined') return set;

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!ss) return set;

    var sheet = ss.getSheetByName(CONFIG.SHEETS.GAP_ANALYSIS);
    if (!sheet) return set;

    var lastRow = sheet.getLastRow();
    if (lastRow <= 1) return set;

    // Read Date (col 1), Symbol (col 2), Historical Expiry Date (col 10)
    var dates = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    var symbols = sheet.getRange(2, 2, lastRow - 1, 1).getValues();
    var expiries = sheet.getRange(2, 10, lastRow - 1, 1).getValues();

    for (var i = 0; i < dates.length; i++) {
      var d = Utils.formatDateKey(dates[i][0]);
      var s = String(symbols[i][0] || '').trim().toUpperCase();
      var exp = Utils.formatDateKey(expiries[i][0]);
      if (d && s) {
        var key = Utils.makeRecordKey(d, s, exp);
        set[key] = true;
      }
    }

    return set;
  },

  /**
   * Bulk append new analysis rows to 'Futures Gap Analysis' sheet
   */
  appendAnalysisRows: function(rows) {
    if (!rows || rows.length === 0) return 0;
    if (typeof SpreadsheetApp === 'undefined') return rows.length;

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!ss) return 0;

    var sheet = ss.getSheetByName(CONFIG.SHEETS.GAP_ANALYSIS);
    if (!sheet) return 0;

    var startRow = sheet.getLastRow() + 1;
    var range = sheet.getRange(startRow, 1, rows.length, rows[0].length);
    range.setValues(rows);

    return rows.length;
  },

  /**
   * Update Dashboard summary card and latest gap table
   */
  refreshDashboardSummary: function() {
    if (typeof SpreadsheetApp === 'undefined') return;
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!ss) return;

    var dashSheet = ss.getSheetByName(CONFIG.SHEETS.DASHBOARD);
    var gapSheet = ss.getSheetByName(CONFIG.SHEETS.GAP_ANALYSIS);
    if (!dashSheet || !gapSheet) return;

    var lastRow = gapSheet.getLastRow();
    if (lastRow <= 1) return;

    // Read all records
    var data = gapSheet.getRange(2, 1, lastRow - 1, 10).getValues();
    // Map latest row per symbol
    var latestBySymbol = {};
    for (var i = 0; i < data.length; i++) {
      var row = data[i];
      var sym = String(row[1] || '').trim().toUpperCase();
      var dateKey = Utils.formatDateKey(row[0]);
      if (!sym || !dateKey) continue;

      if (!latestBySymbol[sym] || dateKey > latestBySymbol[sym].dateKey) {
        latestBySymbol[sym] = {
          dateKey: dateKey,
          row: row
        };
      }
    }

    var summaryRows = [];
    var symbols = Object.keys(latestBySymbol).sort();
    for (var j = 0; j < symbols.length; j++) {
      var symName = symbols[j];
      var r = latestBySymbol[symName].row;
      // [Symbol, Latest Date, Spot Price, Current Fut, Next Fut, Cur-Next Gap, Cur-Next Gap %, Spot-Fut Gap, Spot-Fut Gap %, Expiry Date]
      summaryRows.push([
        r[1], // Symbol
        Utils.formatDateKey(r[0]), // Date
        r[2], // Spot
        r[3], // Cur Fut
        r[4], // Next Fut
        r[5], // Cur-Next Gap
        r[6], // Cur-Next Gap %
        r[7], // Spot-Fut Gap
        r[8], // Spot-Fut Gap %
        Utils.formatDateKey(r[9]) // Expiry
      ]);
    }

    // Clear old table from row 6 down
    var maxRows = dashSheet.getMaxRows();
    if (maxRows > 5) {
      dashSheet.getRange(6, 1, maxRows - 5, 10).clearContent();
    }

    if (summaryRows.length > 0) {
      dashSheet.getRange(6, 1, summaryRows.length, 10).setValues(summaryRows);
      dashSheet.getRange(6, 3, summaryRows.length, 3).setNumberFormat('#,##0.00');
      dashSheet.getRange(6, 6, summaryRows.length, 1).setNumberFormat('#,##0.00');
      dashSheet.getRange(6, 7, summaryRows.length, 1).setNumberFormat('0.000"%"');
      dashSheet.getRange(6, 8, summaryRows.length, 1).setNumberFormat('#,##0.00');
      dashSheet.getRange(6, 9, summaryRows.length, 1).setNumberFormat('0.000"%"');
    }

    dashSheet.getRange('H3').setValue('Updated ' + new Date().toLocaleTimeString());
  }
};
