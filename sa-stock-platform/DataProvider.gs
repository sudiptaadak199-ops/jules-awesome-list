/**
 * SA Stock Research & Backtest Platform - Phase 1 (Foundation)
 *
 * Decoupled Enterprise DataProvider Module
 *
 * Manages raw external data ingestion and handles stock updates safely.
 * Returns raw records to be batched and stored by the Orchestrator to minimize spreadsheet calls.
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
   * Internal delegate containing mock/live feeds mapping.
   * Dynamically tracks realistic stock prices and indices to keep data trends continuous.
   * @param {string} symbol - Target symbol.
   * @param {string} source - Active configuration engine.
   * @returns {Array<Array<any>>} Organized matrix representing historical prices.
   */
  static fetchFromFeed(symbol, source) {
    if (symbol === "FAIL_STOCK") {
      throw new Error("Simulated feed response failure (Rate limit exceeded / Timeout).");
    }

    var todayStr = PlatformUtils.formatDate(new Date());

    var basePrices = {
      "RELIANCE": 2400, "ONGC": 260, "TCS": 3500, "INFY": 1450, "WIPRO": 450,
      "HDFCBANK": 1600, "ICICIBANK": 1000, "SBIN": 750, "ITC": 420, "HINDUNILVR": 2500,
      "TATAMOTORS": 950, "M&M": 1900, "MARUTI": 11000, "TATASTEEL": 150, "HINDALCO": 500,
      "JSWSTEEL": 800, "SUNPHARMA": 1500, "CIPLA": 1350, "DRREDDY": 6000, "LT": 3200,
      "NIFTY": 22000
    };

    var base = basePrices[symbol] || 150.00;
    // Walk price slightly by +/- 1% to simulate modern live ticks
    var deviation = (Math.sin(new Date().getSeconds() + symbol.charCodeAt(0)) * 1.2) / 100;
    var closePrice = base * (1.0 + deviation);
    var openPrice = closePrice * (1.0 - (Math.random() - 0.5) * 0.5 / 100);
    var highPrice = Math.max(openPrice, closePrice) * (1.0 + Math.random() * 0.3 / 100);
    var lowPrice = Math.min(openPrice, closePrice) * (1.0 - Math.random() * 0.3 / 100);

    var baseVolume = symbol === "NIFTY" ? 12000000 : 750000;
    var volume = Math.round(baseVolume * (0.9 + Math.random() * 0.3));

    return [
      [symbol, todayStr, parseFloat(openPrice.toFixed(2)), parseFloat(highPrice.toFixed(2)), parseFloat(lowPrice.toFixed(2)), parseFloat(closePrice.toFixed(2)), parseFloat(closePrice.toFixed(2)), volume, source, new Date()]
    ];
  }
}
