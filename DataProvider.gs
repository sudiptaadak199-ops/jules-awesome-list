/**
 * DataProvider.gs - Centralized Network Engine, Quality Pipeline & Incremental Deduplication
 * Author: Quantitative Trading System Architect
 */

/**
 * Robust HTTP client with exponential backoff and rate limit handling.
 */
function fetchWithRetry(url, options, maxRetries) {
  if (!maxRetries) maxRetries = 3;
  if (!options) options = {};

  options.muteHttpExceptions = true;
  options.headers = options.headers || {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5"
  };

  var lastException = null;
  for (var attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      if (typeof UrlFetchApp !== "undefined" && UrlFetchApp.fetch) {
        var response = UrlFetchApp.fetch(url, options);
        var statusCode = response.getResponseCode();

        if (statusCode === 200) {
          return response.getContentText();
        } else if (statusCode === 429 || statusCode >= 500) {
          logSystem("WARN", "DataProvider", "HTTP " + statusCode + " on attempt " + attempt + " for " + url, null);
          Utilities.sleep(Math.pow(2, attempt) * 1000);
        } else {
          logSystem("ERROR", "DataProvider", "HTTP Error " + statusCode + " for " + url, null);
          return null;
        }
      } else {
        return null;
      }
    } catch (e) {
      lastException = e;
      logSystem("WARN", "DataProvider", "Fetch exception attempt " + attempt + ": " + e.message, null);
      if (typeof Utilities !== "undefined" && Utilities.sleep) {
        Utilities.sleep(Math.pow(2, attempt) * 1000);
      }
    }
  }

  logSystem("ERROR", "DataProvider", "Failed to fetch after " + maxRetries + " attempts: " + url, lastException ? lastException.message : "");
  return null;
}

/**
 * Validates daily price/volume/delivery record quality before processing.
 */
function validateDailyData(record) {
  var errors = [];

  if (!record) return { valid: false, errors: ["Null record"] };

  var date = record[0] || record.date;
  var symbol = record[1] || record.symbol;
  var close = safeNumber(record[6] || record.close, 0);
  var volume = safeNumber(record[8] || record.volume, -1);
  var delQty = safeNumber(record[11] || record.deliverableQty, 0);
  var delPct = safeNumber(record[12] || record.deliveryPct, 0);

  if (!date) errors.push("Missing Date");
  if (!symbol) errors.push("Missing Symbol");
  if (close <= 0) errors.push("Invalid Close price: " + close);
  if (volume < 0) errors.push("Invalid Volume: " + volume);
  if (delQty > volume && volume > 0) errors.push("Deliverable Qty > Volume");
  if (delPct < 0 || delPct > 100) errors.push("Invalid Delivery %: " + delPct);

  if (errors.length > 0) {
    logSystem("WARN", "DataValidation", "Quality check failed for " + symbol + " (" + formatDateKey(date) + "): " + errors.join(", "), null);
  }

  return {
    valid: errors.length === 0,
    errors: errors
  };
}

/**
 * High-Performance Incremental Deduplication Engine.
 * Pre-normalizes all records so sorting uses direct string comparisons (< / >)
 * without re-parsing dates or calling localeCompare in O(N log N) sort loops.
 */
function mergeAndDeduplicateDailyData(existingRows, newRows) {
  var recordsMap = {};
  var config = getConfig();

  // 1. Pre-normalize existing records into memory map
  for (var i = 0; i < existingRows.length; i++) {
    var row = existingRows[i];
    if (row && row.length >= 13) {
      var existingDateStr = formatDateKey(row[0]);
      var existingSymbolStr = (row[1] || "").toString().trim().toUpperCase();
      var key = row[13] || makeCompositeKey(existingDateStr, existingSymbolStr);

      row[0] = existingDateStr;
      row[1] = existingSymbolStr;
      row[13] = key;
      recordsMap[key] = row;
    }
  }

  var addedCount = 0;
  var updatedCount = 0;

  // 2. Pre-normalize and merge new incoming records
  for (var j = 0; j < newRows.length; j++) {
    var nRow = newRows[j];
    var validation = validateDailyData(nRow);
    if (!validation.valid) continue;

    var dateStr = formatDateKey(nRow[0]);
    var symbolStr = (nRow[1] || "").toString().trim().toUpperCase();
    var compKey = makeCompositeKey(dateStr, symbolStr);

    var formattedRow = [
      dateStr,
      symbolStr,
      nRow[2] || "EQ",
      safeNumber(nRow[3], 0),  // Open
      safeNumber(nRow[4], 0),  // High
      safeNumber(nRow[5], 0),  // Low
      safeNumber(nRow[6], 0),  // Close
      safeNumber(nRow[7], 0),  // VWAP
      safeNumber(nRow[8], 0),  // Volume
      safeNumber(nRow[9], 0),  // Turnover
      safeNumber(nRow[10], 0), // Trades
      safeNumber(nRow[11], 0), // Deliverable Qty
      safeNumber(nRow[12], 0), // Delivery %
      compKey
    ];

    if (recordsMap[compKey]) {
      updatedCount++;
    } else {
      addedCount++;
    }
    recordsMap[compKey] = formattedRow;
  }

  // 3. Extract merged list
  var mergedList = [];
  for (var k in recordsMap) {
    mergedList.push(recordsMap[k]);
  }

  // 4. Fast direct string comparison sort O(N log N) without function overhead inside comparator
  mergedList.sort(function(a, b) {
    var dA = a[0];
    var dB = b[0];
    if (dA < dB) return -1;
    if (dA > dB) return 1;
    var sA = a[1];
    var sB = b[1];
    if (sA < sB) return -1;
    if (sA > sB) return 1;
    return 0;
  });

  logSystem("INFO", "DataProvider", "Deduplication completed. Total: " + mergedList.length + " (New: " + addedCount + ", Updated: " + updatedCount + ")", null);
  return mergedList;
}
