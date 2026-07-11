/**
 * SA Stock Research & Backtest Platform - Phase 1 (Foundation)
 *
 * Spreadsheet Manager Module
 *
 * Handles high-performance operations, sheet auto-creation, structured formatting,
 * and batch read/write routines to respect execution limits and minimize round trips.
 */

class SheetManager {
  /**
   * Initializes all required sheets with beautiful formatting if they do not exist.
   * Does not recreate or clear sheets if they already exist.
   */
  static initializeAllSheets() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    // Ensure each sheet exists in order
    this.ensureSheetExists(ss, Config.SHEETS.DASHBOARD, this.formatDashboardSheet.bind(this));
    this.ensureSheetExists(ss, Config.SHEETS.SETTINGS, this.formatSettingsSheet.bind(this));
    this.ensureSheetExists(ss, Config.SHEETS.STOCK_MASTER, this.formatStockMasterSheet.bind(this));
    this.ensureSheetExists(ss, Config.SHEETS.HISTORICAL_DATA, this.formatHistoricalDataSheet.bind(this));
    this.ensureSheetExists(ss, Config.SHEETS.REPORTS, this.formatReportsSheet.bind(this));
    this.ensureSheetExists(ss, Config.SHEETS.LOGS, this.formatLogsSheet.bind(this));
    this.ensureSheetExists(ss, Config.SHEETS.CACHE, this.formatCacheSheet.bind(this));
  }

  /**
   * Checks for a sheet's existence. If not found, creates it and applies the formatting callback.
   * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} ss - Active Spreadsheet object.
   * @param {string} name - Name of the sheet.
   * @param {Function} formatCallback - Callback function to build/format the sheet.
   */
  static ensureSheetExists(ss, name, formatCallback) {
    let sheet = ss.getSheetByName(name);
    if (!sheet) {
      sheet = ss.insertSheet(name);
      if (formatCallback) {
        formatCallback(sheet);
      }
    }
  }

  /**
   * Applies clean styling to a table header range.
   * @param {GoogleAppsScript.Spreadsheet.Range} range - Header range to format.
   */
  static applyHeaderFormat(range) {
    range.setBackground(Config.COLORS.PRIMARY_DARK)
         .setFontColor(Config.COLORS.TEXT_LIGHT)
         .setFontWeight("bold")
         .setFontFamily("Roboto")
         .setFontSize(10)
         .setHorizontalAlignment("center")
         .setVerticalAlignment("middle");
  }

  /**
   * Formats the Dashboard sheet as a control center.
   * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
   */
  static formatDashboardSheet(sheet) {
    sheet.clear();
    sheet.setGridlines(false);

    // Title Banner
    sheet.getRange("B2:H2").merge()
         .setValue("SA STOCK RESEARCH & BACKTEST PLATFORM")
         .setFontSize(18)
         .setFontWeight("bold")
         .setFontColor(Config.COLORS.PRIMARY_DARK)
         .setFontFamily("Roboto")
         .setHorizontalAlignment("center");

    sheet.getRange("B3:H3").merge()
         .setValue("Control Center & Analytical Dashboard (Phase 1 Foundation)")
         .setFontSize(11)
         .setFontStyle("italic")
         .setFontColor(Config.COLORS.ACCENT)
         .setFontFamily("Roboto")
         .setHorizontalAlignment("center");

    // Help box and documentation pointer
    const infoRange = sheet.getRange("B5:H8");
    infoRange.merge()
             .setValue("Welcome to your Stock Backtesting and Analytics Platform.\n\n" +
                       "• Use the custom menu 'SA Platform' to perform system operations.\n" +
                       "• Complete instructions, installation guides, and extension documentation are detailed in the repository's README.md.\n" +
                       "• Configure data source, API credentials, and engine settings in the 'Settings' sheet.")
             .setBackground("#eaf2f8")
             .setFontColor(Config.COLORS.TEXT_DARK)
             .setFontSize(10)
             .setFontFamily("Roboto")
             .setVerticalAlignment("top")
             .setWrap(true);

    // Draw thin elegant borders around info box
    infoRange.setBorder(true, true, true, true, false, false, Config.COLORS.ACCENT, SpreadsheetApp.BorderStyle.SOLID_MEDIUM);

    // Platform State Block
    sheet.getRange("B10").setValue("Platform Configuration State:").setFontWeight("bold").setFontSize(11).setFontFamily("Roboto");
    sheet.getRange("B11").setValue("Version:");
    sheet.getRange("C11").setValue(Config.VERSION).setFontStyle("italic");
    sheet.getRange("B12").setValue("Database Initialization Status:");
    sheet.getRange("C12").setValue("Ready (Run 'Initialize Project')").setFontWeight("bold").setFontColor("#2d6a4f");

    // Basic Column Width adjustments for styling
    sheet.setColumnWidth(1, 40); // spacer column A
    sheet.setColumnWidth(2, 220);
    sheet.setColumnWidth(3, 180);
    sheet.setColumnWidth(4, 120);
    sheet.setColumnWidth(5, 120);
    sheet.setColumnWidth(6, 120);
    sheet.setColumnWidth(7, 120);
    sheet.setColumnWidth(8, 120);
  }

  /**
   * Formats the Settings sheet and loads default configurations.
   * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
   */
  static formatSettingsSheet(sheet) {
    sheet.clear();
    sheet.setGridlines(true);

    // Set Default settings with styled headers
    const defaults = Config.DEFAULT_SETTINGS;
    const range = sheet.getRange(1, 1, defaults.length, defaults[0].length);
    range.setValues(defaults);

    // Style Header Row
    this.applyHeaderFormat(sheet.getRange(1, 1, 1, defaults[0].length));
    sheet.setRowHeight(1, 28);
    sheet.getRange("A:A").setFontWeight("bold").setFontFamily("Roboto");
    sheet.getRange("B:C").setFontFamily("Roboto");

    // Auto-fit columns
    sheet.setColumnWidth(1, 160);
    sheet.setColumnWidth(2, 180);
    sheet.setColumnWidth(3, 350);
  }

  /**
   * Formats the Stock Master sheet.
   * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
   */
  static formatStockMasterSheet(sheet) {
    sheet.clear();
    const headers = [["Stock Symbol", "Company Name", "Exchange", "Sector", "Industry", "Status", "Last Processed", "Added Date"]];
    sheet.getRange(1, 1, 1, headers[0].length).setValues(headers);
    this.applyHeaderFormat(sheet.getRange(1, 1, 1, headers[0].length));
    sheet.setRowHeight(1, 28);
    sheet.setFrozenRows(1);

    // Initial placeholders
    const placeholderRow = [["RELIANCE", "Reliance Industries Ltd.", "NSE", "Energy", "Oil & Gas", "Active", "", new Date()]];
    sheet.getRange(2, 1, 1, placeholderRow[0].length).setValues(placeholderRow);

    sheet.setColumnWidth(1, 120);
    sheet.setColumnWidth(2, 220);
    sheet.setColumnWidth(3, 90);
    sheet.setColumnWidth(4, 130);
    sheet.setColumnWidth(5, 150);
    sheet.setColumnWidth(6, 100);
    sheet.setColumnWidth(7, 140);
    sheet.setColumnWidth(8, 140);
  }

  /**
   * Formats the Historical Data sheet.
   * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
   */
  static formatHistoricalDataSheet(sheet) {
    sheet.clear();
    const headers = [["Symbol", "Date", "Open", "High", "Low", "Close", "Adj Close", "Volume", "Source", "Updated At"]];
    sheet.getRange(1, 1, 1, headers[0].length).setValues(headers);
    this.applyHeaderFormat(sheet.getRange(1, 1, 1, headers[0].length));
    sheet.setRowHeight(1, 28);
    sheet.setFrozenRows(1);

    sheet.setColumnWidth(1, 100);
    sheet.setColumnWidth(2, 110);
    sheet.setColumnWidth(3, 90);
    sheet.setColumnWidth(4, 90);
    sheet.setColumnWidth(5, 90);
    sheet.setColumnWidth(6, 90);
    sheet.setColumnWidth(7, 100);
    sheet.setColumnWidth(8, 120);
    sheet.setColumnWidth(9, 120);
    sheet.setColumnWidth(10, 140);
  }

  /**
   * Formats the Reports sheet.
   * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
   */
  static formatReportsSheet(sheet) {
    sheet.clear();
    const headers = [["Report ID", "Generated At", "Report Type", "Metrics Summary", "Download/View Link"]];
    sheet.getRange(1, 1, 1, headers[0].length).setValues(headers);
    this.applyHeaderFormat(sheet.getRange(1, 1, 1, headers[0].length));
    sheet.setRowHeight(1, 28);
    sheet.setFrozenRows(1);

    sheet.setColumnWidth(1, 150);
    sheet.setColumnWidth(2, 150);
    sheet.setColumnWidth(3, 150);
    sheet.setColumnWidth(4, 300);
    sheet.setColumnWidth(5, 200);
  }

  /**
   * Formats the Logs sheet.
   * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
   */
  static formatLogsSheet(sheet) {
    sheet.clear();
    const headers = [["Date", "Time", "Function Name", "Status", "Duration (ms)", "Error Message"]];
    sheet.getRange(1, 1, 1, headers[0].length).setValues(headers);
    this.applyHeaderFormat(sheet.getRange(1, 1, 1, headers[0].length));
    sheet.setRowHeight(1, 28);
    sheet.setFrozenRows(1);

    sheet.setColumnWidth(1, 100);
    sheet.setColumnWidth(2, 90);
    sheet.setColumnWidth(3, 180);
    sheet.setColumnWidth(4, 100);
    sheet.setColumnWidth(5, 120);
    sheet.setColumnWidth(6, 350);
  }

  /**
   * Formats the Cache sheet.
   * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
   */
  static formatCacheSheet(sheet) {
    sheet.clear();
    const headers = [["Key", "Value", "Expiration Date"]];
    sheet.getRange(1, 1, 1, headers[0].length).setValues(headers);
    this.applyHeaderFormat(sheet.getRange(1, 1, 1, headers[0].length));
    sheet.setRowHeight(1, 28);
    sheet.setFrozenRows(1);

    sheet.setColumnWidth(1, 200);
    sheet.setColumnWidth(2, 450);
    sheet.setColumnWidth(3, 180);
  }

  /**
   * High-performance batch writing helper. Writes values to a sheet starting from row.
   * @param {string} sheetName - Target sheet name.
   * @param {Array<Array<any>>} values - Two-dimensional array representing grid data.
   * @param {number} startRow - Destination row (defaults to 1).
   * @param {number} startCol - Destination column (defaults to 1).
   */
  static batchWrite(sheetName, values, startRow = 1, startCol = 1) {
    if (!values || values.length === 0) return;
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      throw new Error(`Sheet with name "${sheetName}" does not exist.`);
    }
    const range = sheet.getRange(startRow, startCol, values.length, values[0].length);
    range.setValues(values);
  }

  /**
   * High-performance batch reading helper. Returns all values in a rectangular range.
   * @param {string} sheetName - Target sheet name.
   * @param {number} startRow - Starting row index.
   * @param {number} startCol - Starting column index.
   * @param {number} numRows - Number of rows to read.
   * @param {number} numCols - Number of columns to read.
   * @returns {Array<Array<any>>} Two-dimensional array of values.
   */
  static batchRead(sheetName, startRow, startCol, numRows, numCols) {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      throw new Error(`Sheet with name "${sheetName}" does not exist.`);
    }
    return sheet.getRange(startRow, startCol, numRows, numCols).getValues();
  }

  /**
   * Appends rows in batch to a target sheet using efficient array boundaries.
   * @param {string} sheetName - Target sheet name.
   * @param {Array<Array<any>>} rows - 2D matrix of row data.
   */
  static batchAppend(sheetName, rows) {
    if (!rows || rows.length === 0) return;
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      throw new Error(`Sheet with name "${sheetName}" does not exist.`);
    }
    const lastRow = sheet.getLastRow();
    const targetRow = lastRow + 1;
    this.batchWrite(sheetName, rows, targetRow, 1);
  }

  /**
   * Clears all content below the headers (row 1) of a specified sheet.
   * @param {string} sheetName - Target sheet name.
   */
  static clearDataBelowHeaders(sheetName) {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(sheetName);
    if (!sheet) return;
    const lastRow = sheet.getLastRow();
    if (lastRow > 1) {
      sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).clearContent();
    }
  }
}

// Expose SheetManager globally if context allows
if (typeof exports !== 'undefined') {
  exports.SheetManager = SheetManager;
}
