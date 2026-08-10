/**
 * SA Stock Research & Backtest Platform - Phase 1 (Foundation)
 *
 * Decoupled Enterprise DataProvider Module
 *
 * Manages raw external data ingestion and handles stock updates safely in high-performance batches.
 * Utilizes UrlFetchApp.fetchAll() to execute requests in parallel, and incorporates
 * incremental data loading to minimize network overhead.
 *
 * Fully supports provider fallback hierarchy (Primary -> Secondary -> Local Cache) and strict quality filters.
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
   * Uses double-provider fallback logic (Primary Query -> Secondary Query) with automatic rate-limit recovery.
   * NEVER fabricates prices or volume in LIVE mode.
   * @param {Array<string>} symbols - List of active symbols to process.
   * @param {object} lastDatesMap - Mapping of symbol to its last recorded date string in the sheet.
   * @param {object} monitorStats - System monitor tracker object to record diagnostics.
   * @returns {object} Mapping of symbol to its array of validated historical price rows.
   */
  static fetchAndStoreStockDataBatch(symbols, lastDatesMap, monitorStats) {
    var dataMode = Settings.get("Data Mode", "LIVE").toUpperCase().trim();

    // Set default values for data status tracking
    monitorStats.dataSource = "Yahoo Finance (Primary)";
    monitorStats.lastSuccessfulUpdate = new Date();
    monitorStats.symbolsUpdated = 0;
    monitorStats.failedSymbolsCount = 0;
    monitorStats.dateRange = "N/A";

    // ==========================================
    // 1. MOCK DATA MODE (SEPARATE & EXPLICIT)
    // ==========================================
    if (dataMode === "MOCK") {
      monitorStats.dataSource = "Yahoo Finance MOCK";
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
        monitorStats.symbolsUpdated++;
      }
      monitorStats.dateRange = todayStr + " to " + todayStr;
      return mockResults;
    }

    // ==========================================
    // 2. LIVE BATCH MARKET DATA INGESTION
    // ==========================================
    var results = {};
    var requestDelay = Settings.getNum("Request Delay", 50);
    var today = new Date();

    // Check if we can collect a global date range of available historical data
    var minDateStr = null;
    var maxDateStr = null;

    // Helper method to process a batch of queries with a specific host (Primary vs Secondary)
    var tryFetchBatch = function(symbolsToFetch, hostUrl, resultsCollector) {
      var requests = [];
      var fetchSymbolsList = [];

      for (var i = 0; i < symbolsToFetch.length; i++) {
        var sym = symbolsToFetch[i];
        var lastDateStr = lastDatesMap[sym];
        var range = "3mo"; // Default fetch window for indicator calculation

        if (lastDateStr) {
          var lastDateObj = new Date(lastDateStr);
          if (!isNaN(lastDateObj.getTime())) {
            var diffDays = (today.getTime() - lastDateObj.getTime()) / (1000 * 60 * 60 * 24);
            // If we have data within the last 5 days, perform incremental fetch of 5 days EOD
            if (diffDays <= 5.0) {
              range = "5d";
            }
          }
        }

        var yahooSym = DataProvider.getYahooSymbol(sym);
        var url = hostUrl + encodeURIComponent(yahooSym) + "?interval=1d&range=" + range;

        requests.push({
          url: url,
          method: "get",
          muteHttpExceptions: true
        });
        fetchSymbolsList.push(sym);
      }

      var chunkRequests = requests;
      var chunkSymbols = fetchSymbolsList;
      var responses = [];

      try {
        monitorStats.apiRequests += chunkRequests.length;
        responses = UrlFetchApp.fetchAll(chunkRequests);
      } catch (fetchAllErr) {
        console.warn("UrlFetchApp.fetchAll failed for host: " + hostUrl + ". Retrying sequentially...");
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

      var failedSymbolsList = [];

      for (var r = 0; r < responses.length; r++) {
        var sym = chunkSymbols[r];
        var response = responses[r];

        try {
          if (!response) {
            throw new Error("No response returned from server.");
          }

          var responseCode = response.getResponseCode();
          if (responseCode !== 200) {
            throw new Error("HTTP Status Error " + responseCode);
          }

          var json = JSON.parse(response.getContentText());
          if (!json || !json.chart || !json.chart.result || json.chart.result.length === 0) {
            throw new Error("Malformed or empty JSON paylod.");
          }

          var resultObj = json.chart.result[0];
          var timestamps = resultObj.timestamp;
          var indicators = resultObj.indicators;

          if (!timestamps || !indicators || !indicators.quote || indicators.quote.length === 0) {
            throw new Error("Missing timestamp or quote records.");
          }

          var quote = indicators.quote[0];
          var adjclose = (indicators.adjclose && indicators.adjclose.length > 0) ? indicators.adjclose[0].adjclose : null;

          var validRecords = [];
          var seenDates = {};
          var prevValidClose = null;

          for (var k = 0; k < timestamps.length; k++) {
            var t = timestamps[k];
            if (t === null || t === undefined) continue;

            var dateObj = new Date(t * 1000);
            var dateStr = PlatformUtils.formatDate(dateObj);

            // A. Validate Date formatting
            if (isNaN(dateObj.getTime()) || dateStr === "NaN-NaN-NaN" || dateStr.length !== 10) {
              continue;
            }

            // B. Prevent duplicate records for the same day
            if (seenDates[dateStr]) {
              continue;
            }

            var openVal = quote.open ? quote.open[k] : null;
            var highVal = quote.high ? quote.high[k] : null;
            var lowVal = quote.low ? quote.low[k] : null;
            var closeVal = quote.close ? quote.close[k] : null;
            var volumeVal = quote.volume ? quote.volume[k] : null;
            var adjCloseVal = adjclose ? adjclose[k] : closeVal;

            // C. Reject missing values (Close and Volume are strictly required)
            if (openVal === null || highVal === null || lowVal === null || closeVal === null || volumeVal === null) {
              continue;
            }

            var o = parseFloat(openVal);
            var h = parseFloat(highVal);
            var l = parseFloat(lowVal);
            var c = parseFloat(closeVal);
            var v = parseFloat(volumeVal);
            var ac = parseFloat(adjCloseVal !== null ? adjCloseVal : closeVal);

            // D. Reject non-numeric values
            if (isNaN(o) || isNaN(h) || isNaN(l) || isNaN(c) || isNaN(v) || isNaN(ac)) {
              continue;
            }

            // E. Reject obviously invalid prices/volume (Ensure zero price fabrication!)
            if (o <= 0 || h <= 0 || l <= 0 || c <= 0 || v < 0 || o > 1500000 || c > 1500000) {
              continue;
            }

            // F. Suspicious price jump filter (> 300% surge or 75% plunge in a single trading session)
            if (prevValidClose !== null) {
              var ratio = c / prevValidClose;
              if (ratio > 3.0 || ratio < 0.25) {
                console.warn("Discarding suspicious price jump anomaly for [" + sym + "]: " + prevValidClose + " -> " + c);
                continue;
              }
            }

            seenDates[dateStr] = true;
            prevValidClose = c;

            // Track min/max global date range
            if (!minDateStr || dateStr < minDateStr) minDateStr = dateStr;
            if (!maxDateStr || dateStr > maxDateStr) maxDateStr = dateStr;

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
            throw new Error("No EOD rows passed data quality filtration rules.");
          }

          resultsCollector[sym] = validRecords;
          monitorStats.symbolsUpdated++;

        } catch (symError) {
          console.warn("Fetch failed via URL host (" + hostUrl + ") for [" + sym + "]: " + symError.message);
          failedSymbolsList.push(sym);
        }
      }

      return failedSymbolsList;
    };

    // Host APIs priority
    var primaryHost = "https://query1.finance.yahoo.com/v8/finance/chart/";
    var secondaryHost = "https://query2.finance.yahoo.com/v8/finance/chart/";

    // 1. Try Primary URL
    var failedPrimary = tryFetchBatch(symbols, primaryHost, results);

    // 2. Try Secondary URL fallback for any failed symbols
    if (failedPrimary.length > 0) {
      console.log("Falling back to Secondary API for " + failedPrimary.length + " failed symbols: " + failedPrimary.join(", "));
      monitorStats.dataSource = "Yahoo Finance (Secondary / Fallback)";
      var failedSecondary = tryFetchBatch(failedPrimary, secondaryHost, results);
      monitorStats.failedSymbolsCount = failedSecondary.length;
      monitorStats.failedRequests += failedSecondary.length;

      // 3. Fallback to Local previously downloaded data in sheet
      if (failedSecondary.length > 0) {
        console.warn("Could not fetch new data for " + failedSecondary.length + " symbols. Retaining local downloaded data in Historical Data sheet.");
        for (var f = 0; f < failedSecondary.length; f++) {
          var sym = failedSecondary[f];
          // Local cache alert indicator on dashboard
          Logger.warning("DataProvider.fetchAndStoreStockDataBatch", 0, "Stock [" + sym + "] fetch failed on all hosts. Using local history.");
        }
      }
    }

    if (minDateStr && maxDateStr) {
      monitorStats.dateRange = minDateStr + " to " + maxDateStr;
    }

    return results;
  }
}
