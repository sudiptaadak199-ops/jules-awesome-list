/**
 * Utils.gs - General Utility Functions, Math Normalization, Logging & Batch I/O
 * Author: Quantitative Trading System Architect
 */

/**
 * Appends a log entry to the System_Log sheet and outputs to Logger.
 */
function logSystem(level, moduleName, message, details) {
  var timestamp = new Date();
  var detailsStr = typeof details === "object" ? JSON.stringify(details) : (details || "");

  Logger.log("[" + level + "] [" + moduleName + "] " + message + (detailsStr ? " | " + detailsStr : ""));

  try {
    if (typeof SpreadsheetApp !== "undefined" && SpreadsheetApp.getActiveSpreadsheet) {
      var ss = SpreadsheetApp.getActiveSpreadsheet();
      if (ss) {
        var logSheet = ss.getSheetByName(getConfig().SHEETS.SYSTEM_LOG);
        if (logSheet) {
          logSheet.appendRow([timestamp, level, moduleName, message, detailsStr]);
          // Prune old logs if row count exceeds 2000
          if (logSheet.getLastRow() > 2000) {
            logSheet.deleteRows(2, 100);
          }
        }
      }
    }
  } catch (e) {
    // Prevent logging failures from interrupting primary execution
  }
}

/**
 * Builds composite primary key "Date + Symbol".
 */
function makeCompositeKey(dateObjOrStr, symbol) {
  var dateStr = formatDateKey(dateObjOrStr);
  var cleanSymbol = (symbol || "").toString().trim().toUpperCase();
  return dateStr + "_" + cleanSymbol;
}

/**
 * Formats Date object into YYYY-MM-DD format.
 */
function formatDateKey(dateInput) {
  if (!dateInput) return "";
  var d = new Date(dateInput);
  if (isNaN(d.getTime())) {
    return dateInput.toString().substring(0, 10);
  }
  var year = d.getFullYear();
  var month = ("0" + (d.getMonth() + 1)).slice(-2);
  var day = ("0" + d.getDate()).slice(-2);
  return year + "-" + month + "-" + day;
}

/**
 * Safely parses numbers, returning defaultValue if invalid.
 */
function safeNumber(val, defaultValue) {
  if (defaultValue === undefined) defaultValue = 0;
  if (val === null || val === undefined || val === "") return defaultValue;
  var num = Number(val);
  return isNaN(num) ? defaultValue : num;
}

/**
 * Calculates Simple Moving Average of an array.
 */
function calculateSMA(arr) {
  if (!arr || arr.length === 0) return 0;
  var sum = 0;
  var count = 0;
  for (var i = 0; i < arr.length; i++) {
    var v = safeNumber(arr[i], null);
    if (v !== null) {
      sum += v;
      count++;
    }
  }
  return count > 0 ? sum / count : 0;
}

/**
 * Calculates Exponential Moving Average forward in time from oldest (index 0) to newest (index length-1).
 */
function calculateEMA(prices, period) {
  if (!prices || prices.length === 0) return 0;
  if (prices.length < period) {
    return calculateSMA(prices);
  }
  var k = 2 / (period + 1);
  // Start with SMA of the initial period (oldest prices)
  var initialSlice = prices.slice(0, period);
  var ema = calculateSMA(initialSlice);

  // Progress forward in time to the latest price
  for (var i = period; i < prices.length; i++) {
    var p = safeNumber(prices[i], ema);
    ema = (p * k) + (ema * (1 - k));
  }
  return ema;
}

/**
 * Min-Max normalization scaling values into a 0-100 range.
 */
function normalizeToRange(val, minBound, maxBound) {
  var v = safeNumber(val, 0);
  if (maxBound === minBound) return 50;
  var norm = ((v - minBound) / (maxBound - minBound)) * 100;
  return Math.min(100, Math.max(0, norm));
}

/**
 * High-performance bulk array writer for Google Sheets.
 */
function writeBatchData(sheetName, startRow, startCol, dataArray, clearExisting) {
  if (typeof SpreadsheetApp === "undefined" || !SpreadsheetApp.getActiveSpreadsheet) {
    return;
  }
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    throw new Error("Sheet not found: " + sheetName);
  }

  if (clearExisting && sheet.getLastRow() > 1) {
    var lastRow = sheet.getLastRow();
    var lastCol = sheet.getLastColumn() || 1;
    sheet.getRange(2, 1, lastRow - 1, lastCol).clearContent();
  }

  if (!dataArray || dataArray.length === 0) {
    return;
  }

  var numRows = dataArray.length;
  var numCols = dataArray[0].length;
  sheet.getRange(startRow, startCol, numRows, numCols).setValues(dataArray);
}

/**
 * Reads range values efficiently into 2D memory array.
 */
function readBatchData(sheetName) {
  if (typeof SpreadsheetApp === "undefined" || !SpreadsheetApp.getActiveSpreadsheet) {
    return [];
  }
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) return [];

  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  if (lastRow < 2 || lastCol < 1) return [];

  return sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
}

/**
 * Color Themes for UI Formatting ("Cool Tech Trading UI")
 */
function getUITheme() {
  return {
    HEADER_BG: "#1A202C",       // Dark slate header
    HEADER_FG: "#FFFFFF",       // White bold text
    CARD_BG: "#2D3748",         // Container background
    BORDER_COLOR: "#CBD5E0",    // Soft border gray
    ACCENT_GREEN: "#28A745",    // Strong bullish green
    ACCENT_RED: "#DC3545",      // Strong bearish red
    ACCENT_YELLOW: "#FFC107",   // Warning/Neutral yellow
    ACCENT_BLUE: "#007BFF",     // Metric highlight blue
    ZEBRA_LIGHT: "#F8F9FA",     // Zebra row light
    ZEBRA_ALT: "#FFFFFF"        // Zebra row white
  };
}
