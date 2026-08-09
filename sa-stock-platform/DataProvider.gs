/**
 * SA Stock Research & Backtest Platform - Phase 1 (Foundation)
 *
 * Decoupled Enterprise DataProvider Module
 *
 * Manages raw external data ingestion and handles stock updates safely in high-performance batches.
 * Utilizes UrlFetchApp.fetchAll() to execute requests in parallel, and incorporates
 * incremental data loading to minimize network overhead.
 */

class DataProvider {
  /**
   * Formats internal symbols into standard Yahoo Finance tags.
   * Maps indices (NIFTY -> ^NSEI) and appends '.NS' suffix for NSE equities.
   * @param {string} symbol
   * @returns {string} Formatted symbol.
   */
  static getYahooSymbol(symbol) {
    var sym = String(symbol).toUpperCase().trim();
    if (sym === "NIFTY" || sym === "NIFTY50") {
      return "^NSEI";
    }
    if (sym.indexOf(".") !== -1 || sym.indexOf("^") !== -1) {
      return sym;
    }
    return sym + ".NS";
  }

  /**
   * Batch fetches end-of-day daily market data for a list of symbols in parallel using UrlFetchApp.fetchAll().
   * Implements strict validation and incremental data windowing to optimize performance.
   * @param {Array<string>} symbols - List of active symbols to process.
   * @param {object} lastDatesMap - Mapping of symbol to its last recorded date string in the sheet.
   * @param {object} monitorStats - System monitor tracker object to record diagnostics.
   * @returns {object} Mapping of symbol to its array of validated historical price rows.
   */
  static fetchAndStoreStockDataBatch(symbols, lastDatesMap, monitorStats) {
    var dataMode = Settings.get("Data Mode", "LIVE").toUpperCase().trim();

    // ==========================================
    // 1. MOCK DATA MODE (SEPARATE & EXPLICIT)
    // ==========================================
    if (dataMode === "MOCK") {
      var mockResults = {};
      var todayStr = PlatformUtils.formatDate(new Date());
      var basePrices = {
        "RELIANCE": 2400, "ONGC": 260, "TCS": 3500, "INFY": 1450, "WIPRO": 450,
        "HDFCBANK": 1600, "ICICIBANK": 1000, "SBIN": 750, "ITC": 420, "HINDUNILVR": 2500,
        "TATAMOTORS": 950, "M&M": 1900, "MARUTI": 11000, "TATASTEEL": 150, "HINDALCO": 500,
        "JSWSTEEL": 800, "SUNPHARMA": 1500, "CIPLA": 1350, "DRREDDY": 6000, "LT": 3200,
        "NIFTY": 22000
      };

      for (var i = 0; i < symbols.length; i++) {
        var sym = symbols[i];
        var base = basePrices[sym] || 150.00;
        var dev = (Math.sin(new Date().getSeconds() + sym.charCodeAt(0)) * 1.2) / 100;
        var closePrice = base * (1.0 + dev);
        var openPrice = closePrice * (1.0 - (Math.random() - 0.5) * 0.5 / 100);
        var highPrice = Math.max(openPrice, closePrice) * (1.0 + Math.random() * 0.3 / 100);
        var lowPrice = Math.min(openPrice, closePrice) * (1.0 - Math.random() * 0.3 / 100);
        var volume = Math.round((sym === "NIFTY" ? 12000000 : 750000) * (0.9 + Math.random() * 0.3));

        mockResults[sym] = [[
          sym,
          todayStr,
          parseFloat(openPrice.toFixed(2)),
          parseFloat(highPrice.toFixed(2)),
          parseFloat(lowPrice.toFixed(2)),
          parseFloat(closePrice.toFixed(2)),
          parseFloat(closePrice.toFixed(2)),
          volume,
          "Yahoo Finance MOCK",
          new Date()
        ]];
      }
      return mockResults;
    }

    // ==========================================
    // 2. LIVE BATCH MARKET DATA INGESTION
    // ==========================================
    var results = {};
    var requests = [];
    var fetchSymbols = [];
    var requestDelay = Settings.getNum("Request Delay", 50);

    // Determine fetch range for each stock (incremental window)
    var today = new Date();
    for (var i = 0; i < symbols.length; i++) {
      var sym = symbols[i];
      var lastDateStr = lastDatesMap[sym];
      var range = "3mo"; // Default full fetch window for indicators

      if (lastDateStr) {
        var lastDateObj = new Date(lastDateStr);
        if (!isNaN(lastDateObj.getTime())) {
          var diffDays = (today.getTime() - lastDateObj.getTime()) / (1000 * 60 * 60 * 24);
          // If we have fresh data within the last 5 days, only fetch the latest 5 days EOD data (Incremental Fetch!)
          if (diffDays <= 5.0) {
            range = "5d";
          }
        }
      }

      var yahooSym = DataProvider.getYahooSymbol(sym);
      var url = "https://query1.finance.yahoo.com/v8/finance/chart/" + encodeURIComponent(yahooSym) + "?interval=1d&range=" + range;

      requests.push({
        url: url,
        method: "get",
        muteHttpExceptions: true
      });
      fetchSymbols.push(sym);
    }

    // Process parallel requests in chunks of 30 to stay well within Google quotas and prevent rate blocks
    var chunkSize = 30;
    for (var c = 0; c < requests.length; c += chunkSize) {
      var chunkRequests = requests.slice(c, c + chunkSize);
      var chunkSymbols = fetchSymbols.slice(c, c + chunkSize);

      if (chunkRequests.length === 0) break;

      var responses = [];
      try {
        monitorStats.apiRequests += chunkRequests.length;
        responses = UrlFetchApp.fetchAll(chunkRequests);
      } catch (fetchAllErr) {
        // Fallback sequentially in case UrlFetchApp.fetchAll throws a global outage
        console.warn("fetchAll failed: " + fetchAllErr.message + ". Retrying sequentially...");
        responses = [];
        for (var k = 0; k < chunkRequests.length; k++) {
          try {
            PlatformUtils.sleep(requestDelay);
            responses.push(UrlFetchApp.fetch(chunkRequests[k].url, chunkRequests[k]));
          } catch (seqErr) {
            responses.push(null);
          }
        }
      }

      // Parse and strictly validate each response
      for (var r = 0; r < responses.length; r++) {
        var sym = chunkSymbols[r];
        var response = responses[r];

        try {
          if (!response) {
            throw new Error("Outage: No response received from server.");
          }

          var responseCode = response.getResponseCode();
          if (responseCode !== 200) {
            throw new Error("HTTP Error " + responseCode);
          }

          var json = JSON.parse(response.getContentText());
          if (!json || !json.chart || !json.chart.result || json.chart.result.length === 0) {
            throw new Error("Malformed or empty JSON payload.");
          }

          var resultObj = json.chart.result[0];
          var timestamps = resultObj.timestamp;
          var indicators = resultObj.indicators;

          if (!timestamps || !indicators || !indicators.quote || indicators.quote.length === 0) {
            throw new Error("Missing timestamp or indicators quote data.");
          }

          var quote = indicators.quote[0];
          var adjclose = (indicators.adjclose && indicators.adjclose.length > 0) ? indicators.adjclose[0].adjclose : null;

          var validRecords = [];
          var seenDates = {};

          for (var k = 0; k < timestamps.length; k++) {
            var t = timestamps[k];
            if (t === null || t === undefined) continue;

            var dateObj = new Date(t * 1000);
            var dateStr = PlatformUtils.formatDate(dateObj);

            // A. Validate Date
            if (isNaN(dateObj.getTime()) || dateStr === "NaN-NaN-NaN" || dateStr.length !== 10) {
              continue; // Reject invalid dates
            }

            // B. Prevent duplicate records for the same day
            if (seenDates[dateStr]) {
              continue; // Reject duplicate records
            }

            var openVal = quote.open ? quote.open[k] : null;
            var highVal = quote.high ? quote.high[k] : null;
            var lowVal = quote.low ? quote.low[k] : null;
            var closeVal = quote.close ? quote.close[k] : null;
            var volumeVal = quote.volume ? quote.volume[k] : null;
            var adjCloseVal = adjclose ? adjclose[k] : closeVal;

            // C. Reject missing values (Close and Volume are strictly required)
            if (openVal === null || highVal === null || lowVal === null || closeVal === null || volumeVal === null) {
              continue; // Reject rows with missing data
            }

            var o = parseFloat(openVal);
            var h = parseFloat(highVal);
            var l = parseFloat(lowVal);
            var c = parseFloat(closeVal);
            var v = parseFloat(volumeVal);
            var ac = parseFloat(adjCloseVal !== null ? adjCloseVal : closeVal);

            // D. Reject non-numeric values
            if (isNaN(o) || isNaN(h) || isNaN(l) || isNaN(c) || isNaN(v) || isNaN(ac)) {
              continue; // Reject non-numeric
            }

            // E. Reject obviously invalid prices/volume (Ensure zero price fabrication!)
            if (o <= 0 || h <= 0 || l <= 0 || c <= 0 || v < 0 || o > 200000 || c > 200000) {
              continue; // Reject toxic EOD records
            }

            seenDates[dateStr] = true;
            validRecords.push([
              sym,
              dateStr,
              parseFloat(o.toFixed(2)),
              parseFloat(h.toFixed(2)),
              parseFloat(l.toFixed(2)),
              parseFloat(c.toFixed(2)),
              parseFloat(ac.toFixed(2)),
              Math.round(v),
              "Yahoo Finance LIVE",
              new Date()
            ]);
          }

          if (validRecords.length === 0) {
            throw new Error("Zero rows remaining after data quality validation.");
          }

          results[sym] = validRecords;

        } catch (symError) {
          monitorStats.failedRequests += 1;
          console.error("API failed for stock [" + sym + "]: " + symError.message);
          // ZERO Price fabrication: We do NOT generate fake prices.
          // The orchestrator main pipeline will look up cached data or record the failure correctly.
        }
      }
    }

    return results;
  }
}
