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
    sheet.clear();

    // Title Section
    var titleRange = sheet.getRange("B2:H2");
    titleRange.merge()
              .setValue(Config.METADATA.NAME.toUpperCase())
              .setFontSize(Config.THEME.FONTS.SIZE_TITLE)
              .setFontWeight("bold")
              .setFontColor(Config.THEME.COLORS.PRIMARY_DARK)
              .setFontFamily(Config.THEME.FONTS.FAMILY)
              .setHorizontalAlignment("center");

    var subtitleRange = sheet.getRange("B3:H3");
    subtitleRange.merge()
                 .setValue("Sector Rotation & Institutional Money Flow Analyzer • Real-Time Core Platform")
                 .setFontSize(Config.THEME.FONTS.SIZE_SUBTITLE)
                 .setFontStyle("italic")
                 .setFontColor(Config.THEME.COLORS.ACCENT)
                 .setFontFamily(Config.THEME.FONTS.FAMILY)
                 .setHorizontalAlignment("center");

    // Documentation Container
    var infoBox = sheet.getRange("B5:C13");
    infoBox.merge()
           .setValue("ZERO-MANUAL-WORK PRINCIPLE:\n\n" +
                     "• Open this Dashboard to instantly check where institutional capital is entering NSE.\n" +
                     "• The platform automatically tracks prices, computes RVOL, ranks sectors, and triggers alerts.\n" +
                     "• Change update delays or trigger periods inside the Settings sheet.\n" +
                     "• Under the hood, the calculation engine runs on pure in-memory matrix computations for rapid speed.")
           .setBackground(Config.THEME.COLORS.INFO_BOX_BG)
           .setFontColor(Config.THEME.COLORS.TEXT_DARK)
           .setFontFamily(Config.THEME.FONTS.FAMILY)
           .setFontSize(Config.THEME.FONTS.SIZE_BODY)
           .setVerticalAlignment("top")
           .setWrap(true);

    infoBox.setBorder(true, true, true, true, false, false, Config.THEME.COLORS.ACCENT, SpreadsheetApp.BorderStyle.SOLID);
  }

  /**
   * Pre-loads 30 days of high-fidelity daily price rows for each of our default stocks,
   * plus the NIFTY benchmark index, ensuring our Sector Pipeline is instantly functional
   * and demonstrates rich, realistic sector trends and rankings.
   * @returns {number} The total number of rows generated and appended.
   */
  static preloadHistoricalData() {
    var defaultStocks = Config.SHEETS_DEFINITION["Stock Master"].defaultRows;
    var symbols = defaultStocks.map(function(r) { return r[0]; });
    symbols.push("NIFTY"); // Add benchmark

    var basePrices = {
      "RELIANCE": 2400, "ONGC": 260, "TCS": 3500, "INFY": 1450, "WIPRO": 450,
      "HDFCBANK": 1600, "ICICIBANK": 1000, "SBIN": 750, "ITC": 420, "HINDUNILVR": 2500,
      "TATAMOTORS": 950, "M&M": 1900, "MARUTI": 11000, "TATASTEEL": 150, "HINDALCO": 500,
      "JSWSTEEL": 800, "SUNPHARMA": 1500, "CIPLA": 1350, "DRREDDY": 6000, "LT": 3200,
      "NIFTY": 22000
    };

    var preloadedRows = [];
    var now = new Date();

    // Loop backwards for 60 trading days to construct historical prices (sufficient for 50D history limit!)
    for (var d = 60; d >= 1; d--) {
      var dateObj = new Date(now.getTime() - d * 24 * 60 * 60 * 1000);
      var dateStr = PlatformUtils.formatDate(dateObj);

      for (var i = 0; i < symbols.length; i++) {
        var sym = symbols[i];
        var base = basePrices[sym] || 100;

        // Apply a realistic trending random-walk variation
        // Some sectors perform well, some poorly to show stage rotations!
        var sectorTrend = 0;
        if (sym === "RELIANCE" || sym === "ONGC") sectorTrend = 0.3; // Energy outperforming
        if (sym === "TCS" || sym === "INFY" || sym === "WIPRO") sectorTrend = -0.15; // Tech lagging
        if (sym === "HDFCBANK" || sym === "ICICIBANK" || sym === "SBIN") sectorTrend = 0.1; // Financials improving
        if (sym === "TATAMOTORS" || sym === "M&M") sectorTrend = 0.4; // Auto leading

        var changeFactor = 1.0 + (sectorTrend * (60 - d) / 100) + (Math.sin(d + i) * 1.5 / 100);
        var closePrice = base * changeFactor;
        var openPrice = closePrice * (1.0 - (Math.random() - 0.5) * 1.0 / 100);
        var highPrice = Math.max(openPrice, closePrice) * (1.0 + Math.random() * 0.5 / 100);
        var lowPrice = Math.min(openPrice, closePrice) * (1.0 - Math.random() * 0.5 / 100);

        // Volume: add a huge volume spike (institutional buying) to Energy and Auto near day 29-30 to trigger money flow shifts!
        var baseVolume = sym === "NIFTY" ? 10000000 : 500000;
        var volMultiplier = 1.0;
        if (d <= 2 && (sym === "RELIANCE" || sym === "TATAMOTORS")) {
          volMultiplier = 2.5; // Big volume surge!
        } else {
          volMultiplier = 0.8 + Math.random() * 0.4;
        }
        var volume = Math.round(baseVolume * volMultiplier);

        preloadedRows.push([
          sym,
          dateStr,
          parseFloat(openPrice.toFixed(2)),
          parseFloat(highPrice.toFixed(2)),
          parseFloat(lowPrice.toFixed(2)),
          parseFloat(closePrice.toFixed(2)),
          parseFloat(closePrice.toFixed(2)),
          volume,
          "Preload Data Feed",
          new Date()
        ]);
      }
    }

    if (preloadedRows.length > 0) {
      this.batchAppend(Config.SHEETS.HISTORICAL_DATA, preloadedRows);
    }
    return preloadedRows.length;
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
