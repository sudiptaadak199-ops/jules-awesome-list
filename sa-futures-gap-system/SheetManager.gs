/**
 * SA Automatic Futures Gap Analysis System
 * SheetManager.gs - Complete self-healing sheet creation, styling, and schema formatting.
 * Creates tabs:
 * 1. Symbols - Minimal user input sheet
 * 2. Futures Gap Analysis - Required 10 columns storing contract-level gap history (UNCHANGED)
 * 3. Contract_Mapping - Hidden dual-contract mapping sheet (10 columns)
 * 4. Dashboard - Executive summary, gap signals, expiry countdown
 * 5. Settings - Configurable runtime properties
 * 6. Logs - Audit trail
 */

var SheetManager = {
  initializeSheets: function() {
    if (typeof SpreadsheetApp === 'undefined') return;

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!ss) return;

    this.ensureSymbolsSheet(ss);
    this.ensureGapAnalysisSheet(ss);
    this.ensureContractMappingSheet(ss);
    this.ensureDashboardSheet(ss);
    this.ensureSettingsSheet(ss);
    this.ensureLogsSheet(ss);
  },

  ensureSymbolsSheet: function(ss) {
    var sheet = ss.getSheetByName(CONFIG.SHEETS.SYMBOLS);
    if (!sheet) {
      sheet = ss.insertSheet(CONFIG.SHEETS.SYMBOLS, 0);
    }

    var lastRow = sheet.getLastRow();
    if (lastRow === 0) {
      var headers = [['Symbol', 'Status', 'Last Updated', 'Notes']];
      var range = sheet.getRange(1, 1, 1, 4);
      range.setValues(headers);
      range.setBackground(CONFIG.COLORS.HEADER_BG);
      range.setFontColor(CONFIG.COLORS.HEADER_FG);
      range.setFontWeight('bold');
      sheet.setFrozenRows(1);

      var defaultRows = CONFIG.DEFAULT_SYMBOLS.map(function(s) {
        return [s, 'ACTIVE', '', 'Default initial symbol'];
      });
      sheet.getRange(2, 1, defaultRows.length, 4).setValues(defaultRows);
      sheet.autoResizeColumns(1, 4);
    }
    return sheet;
  },

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
   * Hidden Contract_Mapping sheet storing dual contract mapping permanently.
   */
  ensureContractMappingSheet: function(ss) {
    var sheet = ss.getSheetByName(CONFIG.SHEETS.CONTRACT_MAPPING);
    if (!sheet) {
      sheet = ss.insertSheet(CONFIG.SHEETS.CONTRACT_MAPPING);
      sheet.hideSheet(); // Kept hidden as requested
    }

    var lastRow = sheet.getLastRow();
    if (lastRow === 0) {
      var headers = [CONFIG.CONTRACT_MAPPING_COLUMNS];
      var range = sheet.getRange(1, 1, 1, CONFIG.CONTRACT_MAPPING_COLUMNS.length);
      range.setValues(headers);
      range.setBackground(CONFIG.COLORS.HEADER_BG);
      range.setFontColor(CONFIG.COLORS.HEADER_FG);
      range.setFontWeight('bold');
      sheet.setFrozenRows(1);

      sheet.getRange('A:A').setNumberFormat('@');
      sheet.getRange('B:F').setNumberFormat('@');
      sheet.getRange('G:H').setNumberFormat('#,##0.00');
      sheet.getRange('I:J').setNumberFormat('@');

      sheet.autoResizeColumns(1, CONFIG.CONTRACT_MAPPING_COLUMNS.length);
    }
    return sheet;
  },

  ensureDashboardSheet: function(ss) {
    var sheet = ss.getSheetByName(CONFIG.SHEETS.DASHBOARD);
    if (!sheet) {
      sheet = ss.insertSheet(CONFIG.SHEETS.DASHBOARD, 1);
    }

    var lastRow = sheet.getLastRow();
    if (lastRow === 0) {
      sheet.getRange('A1:J1').merge();
      var titleCell = sheet.getRange('A1');
      titleCell.setValue('⚡ SA AUTOMATIC FUTURES GAP ANALYSIS DASHBOARD');
      titleCell.setBackground(CONFIG.COLORS.HEADER_BG);
      titleCell.setFontColor('#ffffff');
      titleCell.setFontSize(14);
      titleCell.setFontWeight('bold');
      titleCell.setHorizontalAlignment('center');

      sheet.getRange('A3').setValue('Active Symbols:');
      sheet.getRange('B3').setFormula('=COUNTA(Symbols!A2:A)');
      sheet.getRange('D3').setValue('Total Historical Records:');
      sheet.getRange('E3').setFormula('=COUNTA(\'Futures Gap Analysis\'!A2:A)');
      sheet.getRange('G3').setValue('Last Sync Status:');
      sheet.getRange('H3').setValue('Ready');

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
      var lastRow = sheet.getLastRow();
      if (lastRow > 1000) {
        sheet.deleteRows(2, lastRow - 1000);
      }
    } catch (e) {
      // Ignore
    }
  },

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

  getExistingRecordKeys: function() {
    var set = {};
    if (typeof SpreadsheetApp === 'undefined') return set;

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!ss) return set;

    var sheet = ss.getSheetByName(CONFIG.SHEETS.GAP_ANALYSIS);
    if (!sheet) return set;

    var lastRow = sheet.getLastRow();
    if (lastRow <= 1) return set;

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
   * Read existing mapping keys from 'Contract_Mapping' sheet to prevent duplicates
   */
  getExistingMappingKeys: function() {
    var set = {};
    if (typeof SpreadsheetApp === 'undefined') return set;

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!ss) return set;

    var sheet = ss.getSheetByName(CONFIG.SHEETS.CONTRACT_MAPPING);
    if (!sheet) return set;

    var lastRow = sheet.getLastRow();
    if (lastRow <= 1) return set;

    var dates = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    var symbols = sheet.getRange(2, 2, lastRow - 1, 1).getValues();
    var curExpiries = sheet.getRange(2, 4, lastRow - 1, 1).getValues();

    for (var i = 0; i < dates.length; i++) {
      var d = Utils.formatDateKey(dates[i][0]);
      var s = String(symbols[i][0] || '').trim().toUpperCase();
      var exp = Utils.formatDateKey(curExpiries[i][0]);
      if (d && s) {
        var key = Utils.makeRecordKey(d, s, exp);
        set[key] = true;
      }
    }

    return set;
  },

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

  appendMappingRows: function(rows) {
    if (!rows || rows.length === 0) return 0;
    if (typeof SpreadsheetApp === 'undefined') return rows.length;

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!ss) return 0;

    var sheet = ss.getSheetByName(CONFIG.SHEETS.CONTRACT_MAPPING);
    if (!sheet) return 0;

    var startRow = sheet.getLastRow() + 1;
    var range = sheet.getRange(startRow, 1, rows.length, rows[0].length);
    range.setValues(rows);

    return rows.length;
  },

  refreshDashboardSummary: function() {
    if (typeof SpreadsheetApp === 'undefined') return;
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!ss) return;

    var dashSheet = ss.getSheetByName(CONFIG.SHEETS.DASHBOARD);
    var gapSheet = ss.getSheetByName(CONFIG.SHEETS.GAP_ANALYSIS);
    if (!dashSheet || !gapSheet) return;

    var lastRow = gapSheet.getLastRow();
    if (lastRow <= 1) return;

    var data = gapSheet.getRange(2, 1, lastRow - 1, 10).getValues();
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
      summaryRows.push([
        r[1],
        Utils.formatDateKey(r[0]),
        r[2],
        r[3],
        r[4],
        r[5],
        r[6],
        r[7],
        r[8],
        Utils.formatDateKey(r[9])
      ]);
    }

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
