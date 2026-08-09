/**
 * SA Stock Research & Backtest Platform - Phase 1 (Foundation)
 *
 * Enterprise Sheet Manager & Auto-Repair Database Module
 *
 * High-performance batch read/write controller, formatting engine, and self-healing layout validation layer.
 * Zero hardcoding: structures and styling configurations are dynamically parsed from the central configuration definition.
 */

class SheetManager {
  /**
   * Safe getter for active Google Spreadsheet. Bypasses hardcoded IDs.
   * @returns {GoogleAppsScript.Spreadsheet.Spreadsheet}
   */
  static getActiveSpreadsheet() {
    return SpreadsheetApp.getActiveSpreadsheet();
  }

  /**
   * Initializes all sheets.
   * Repairs missing sheets or repairs missing headers/formats without wiping existing data.
   */
  static initializeAllSheets() {
    var ss = this.getActiveSpreadsheet();
    var sheetDefs = Config.SHEETS_DEFINITION;

    for (var sheetName in sheetDefs) {
      this.ensureAndRepairSheet(ss, sheetName, sheetDefs[sheetName]);
    }
  }

  /**
   * Creates sheet if missing, styles headers, sets gridlines, column widths, and freezes rows.
   * If the sheet exists but some headers or structure are corrupted, it safely repairs them.
   * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} ss - Spreadsheet object.
   * @param {string} sheetName - Target tab.
   * @param {object} def - Definition from Config.
   */
  static ensureAndRepairSheet(ss, sheetName, def) {
    var sheet = ss.getSheetByName(sheetName);
    var newlyCreated = false;

    if (!sheet) {
      sheet = ss.insertSheet(sheetName);
      newlyCreated = true;
    }

    // Apply configuration gridline toggle
    sheet.setGridlines(def.gridlines !== false);

    // Freeze rows if configured
    if (def.frozenRows) {
      sheet.setFrozenRows(def.frozenRows);
    }

    // Set professional column widths
    if (def.columnsWidths) {
      for (var i = 0; i < def.columnsWidths.length; i++) {
        sheet.setColumnWidth(i + 1, def.columnsWidths[i]);
      }
    }

    // Format headers and default rows if needed
    if (def.headers) {
      var currentHeaders = sheet.getLastRow() > 0 ? sheet.getRange(1, 1, 1, def.headers.length).getValues()[0] : [];
      var headersMatch = true;

      for (var i = 0; i < def.headers.length; i++) {
        if (String(currentHeaders[i]).trim() !== String(def.headers[i]).trim()) {
          headersMatch = false;
          break;
        }
      }

      // Overwrite/repair headers if they don't match or are empty
      if (!headersMatch || sheet.getLastRow() === 0) {
        var headerRange = sheet.getRange(1, 1, 1, def.headers.length);
        headerRange.setValues([def.headers]);
        this.applyHeaderStyle(headerRange);
        sheet.setRowHeight(1, 28);
      }
    }

    // Write default mockup datasets if sheet was newly created
    if (newlyCreated) {
      if (sheetName === Config.SHEETS.DASHBOARD) {
        this.buildDashboardLayout(sheet);
      } else if (def.defaultRows && def.defaultRows.length > 0) {
        var dataRange = sheet.getRange(2, 1, def.defaultRows.length, def.defaultRows[0].length);
        dataRange.setValues(def.defaultRows);
        this.applyBodyFormat(dataRange);
      }
    }
  }

  /**
   * Formats headers programmatically with the selected theme token colors.
   * @param {GoogleAppsScript.Spreadsheet.Range} range - The header range to format.
   */
  static applyHeaderStyle(range) {
    range.setBackground(Config.THEME.COLORS.PRIMARY_DARK)
         .setFontColor(Config.THEME.COLORS.TEXT_LIGHT)
         .setFontWeight("bold")
         .setFontFamily(Config.THEME.FONTS.FAMILY)
         .setFontSize(Config.THEME.FONTS.SIZE_HEADER)
         .setHorizontalAlignment("center")
         .setVerticalAlignment("middle");
  }

  /**
   * Formats the body data row ranges to look extremely clean and structured.
   * @param {GoogleAppsScript.Spreadsheet.Range} range - The data rows range to format.
   */
  static applyBodyFormat(range) {
    range.setFontFamily(Config.THEME.FONTS.FAMILY)
         .setFontSize(Config.THEME.FONTS.SIZE_BODY)
         .setVerticalAlignment("middle");
  }

  /**
   * Generates a dashboard layout layout programmatically.
   * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
   */
  static buildDashboardLayout(sheet) {
    SectorEngine.refreshDashboard();
  }

  /**
   * Reads data in batch from sheet.
   * @param {string} sheetName - Target tab.
   * @param {number} r - Row index.
   * @param {number} c - Column index.
   * @param {number} rowsCount - Row size.
   * @param {number} colsCount - Column size.
   * @returns {Array<Array<any>>} Double array grid of data.
   */
  static batchRead(sheetName, r, c, rowsCount, colsCount) {
    var ss = this.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(sheetName);
    if (!sheet) throw new Error("Operational sheet [" + sheetName + "] does not exist.");
    return sheet.getRange(r, c, rowsCount, colsCount).getValues();
  }

  /**
   * Writes data in batch to sheet.
   * @param {string} sheetName - Target tab.
   * @param {Array<Array<any>>} values - Two-dimensional values.
   * @param {number} r - Row index.
   * @param {number} c - Column index.
   */
  static batchWrite(sheetName, values, r, c) {
    if (r === undefined) r = 1;
    if (c === undefined) c = 1;
    if (!values || values.length === 0) return;
    var ss = this.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(sheetName);
    if (!sheet) throw new Error("Operational sheet [" + sheetName + "] does not exist.");

    var range = sheet.getRange(r, c, values.length, values[0].length);
    range.setValues(values);
    this.applyBodyFormat(range);
  }

  /**
   * High performance atomic append to optimize write execution cycles.
   * @param {string} sheetName - Target sheet.
   * @param {Array<Array<any>>} rows - Array of rows to write.
   */
  static batchAppend(sheetName, rows) {
    if (!rows || rows.length === 0) return;
    var ss = this.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(sheetName);
    if (!sheet) throw new Error("Operational sheet [" + sheetName + "] does not exist.");

    var startRow = sheet.getLastRow() + 1;
    this.batchWrite(sheetName, rows, startRow, 1);
  }

  /**
   * Wipes data rows below the designated frozen header.
   * @param {string} sheetName - Target sheet tab.
   */
  static clearDataBelowHeaders(sheetName) {
    var ss = this.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(sheetName);
    if (!sheet) return;
    var lastRow = sheet.getLastRow();
    if (lastRow > 1) {
      sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).clearContent();
    }
  }
}
