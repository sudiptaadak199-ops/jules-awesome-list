/**
 * SA Stock Research & Backtest Platform - Phase 1 (Foundation)
 *
 * Decoupled Enterprise DataProvider Module
 *
 * Manages raw external data ingestion and handles stock updates safely.
 * Returns raw records to be batched and stored by the Orchestrator to minimize spreadsheet calls.
 * Incorporates strict data quality validation, rejecting dirty, missing, or malformed records.
 */

class DataProvider {
  /**
   * Safe data update execution for an individual stock.
   * Leverages exponential retry, request delay configurations, and reports exit status and rows.
   * @param {string} symbol - Equity symbol to fetch.
   * @returns {object} Standardized result object with status, records, and analytics.
   */
  static fetchAndStoreStockData(symbol) {
    var start = new Date().getTime();
    var retryCount = Settings.getNum("Retry Count", 3);
    var delay = Settings.getNum("Request Delay", 50);
    var source = Settings.get("Data Source", "Yahoo Finance");

    return ErrorHandler.runSafe("DataProvider.fetchAndStoreStockData[" + symbol + "]", function() {
      // Simulate external delay to respect rate limit margins
      PlatformUtils.sleep(delay);

      // Wrapper to fetch stock using PlatformUtils retry mechanism
      var rawRecords = PlatformUtils.retry(function() {
        return DataProvider.fetchFromFeed(symbol, source);
      }, retryCount, 100);

      var elapsed = new Date().getTime() - start;
      return {
        symbol: symbol,
        status: "SUCCESS",
        recordsCount: rawRecords ? rawRecords.length : 0,
        records: rawRecords || [],
        duration: elapsed
      };
    }, { symbol: symbol, status: "ERROR", recordsCount: 0, records: [], duration: new Date().getTime() - start });
  }

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
   * Fetches historical data from live/mock endpoints based on configuration settings.
   * @param {string} symbol - Target symbol.
   * @param {string} source - Active configuration engine.
   * @returns {Array<Array<any>>} Organized matrix representing validated historical prices.
   */
  static fetchFromFeed(symbol, source) {
    if (symbol === "FAIL_STOCK") {
      throw new Error("Simulated feed response failure (Rate limit exceeded / Timeout).");
    }

    var dataMode = Settings.get("Data Mode", "LIVE").toUpperCase().trim();

    // ==========================================
    // 1. LIVE DATA INGESTION MODE
    // ==========================================
    if (dataMode === "LIVE") {
      var yahooSym = DataProvider.getYahooSymbol(symbol);
      var url = "https://query1.finance.yahoo.com/v8/finance/chart/" + encodeURIComponent(yahooSym) + "?interval=1d&range=3mo";

      var response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
      var responseCode = response.getResponseCode();

      if (responseCode !== 200) {
        throw new Error("HTTP Error " + responseCode + " while fetching live data for symbol [" + symbol + "]");
      }

      var json = JSON.parse(response.getContentText());
      if (!json || !json.chart || !json.chart.result || json.chart.result.length === 0) {
        throw new Error("Malformed or empty JSON API response for symbol [" + symbol + "]");
      }

      var resultObj = json.chart.result[0];
      var timestamps = resultObj.timestamp;
      var indicators = resultObj.indicators;

      if (!timestamps || !indicators || !indicators.quote || indicators.quote.length === 0) {
        throw new Error("Missing timestamps or quote indicator fields for symbol [" + symbol + "]");
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

        // E. Reject obviously invalid prices / volumes
        if (o <= 0 || h <= 0 || l <= 0 || c <= 0 || v < 0 || o > 200000 || c > 200000) {
          continue; // Reject toxic rows
        }

        seenDates[dateStr] = true;
        validRecords.push([
          symbol,
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
        throw new Error("Zero valid rows survived data validation checks for [" + symbol + "]");
      }

      return validRecords;
    }

    // ==========================================
    // 2. MOCK DATA SIMULATION FALLBACK MODE
    // ==========================================
    var todayStr = PlatformUtils.formatDate(new Date());
    var basePrices = {
      "RELIANCE": 2400, "ONGC": 260, "TCS": 3500, "INFY": 1450, "WIPRO": 450,
      "HDFCBANK": 1600, "ICICIBANK": 1000, "SBIN": 750, "ITC": 420, "HINDUNILVR": 2500,
      "TATAMOTORS": 950, "M&M": 1900, "MARUTI": 11000, "TATASTEEL": 150, "HINDALCO": 500,
      "JSWSTEEL": 800, "SUNPHARMA": 1500, "CIPLA": 1350, "DRREDDY": 6000, "LT": 3200,
      "NIFTY": 22000
    };

    var base = basePrices[symbol] || 150.00;
    var deviation = (Math.sin(new Date().getSeconds() + symbol.charCodeAt(0)) * 1.2) / 100;
    var closePrice = base * (1.0 + deviation);
    var openPrice = closePrice * (1.0 - (Math.random() - 0.5) * 0.5 / 100);
    var highPrice = Math.max(openPrice, closePrice) * (1.0 + Math.random() * 0.3 / 100);
    var lowPrice = Math.min(openPrice, closePrice) * (1.0 - Math.random() * 0.3 / 100);

    var baseVolume = symbol === "NIFTY" ? 12000000 : 750000;
    var volume = Math.round(baseVolume * (0.9 + Math.random() * 0.3));

    return [
      [symbol, todayStr, parseFloat(openPrice.toFixed(2)), parseFloat(highPrice.toFixed(2)), parseFloat(lowPrice.toFixed(2)), parseFloat(closePrice.toFixed(2)), parseFloat(closePrice.toFixed(2)), volume, "Yahoo Finance MOCK", new Date()]
    ];
  }
}
