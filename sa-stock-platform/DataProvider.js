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
    const start = new Date().getTime();
    const retryCount = Settings.getNum("Retry Count", 3);
    const delay = Settings.getNum("Request Delay", 500);
    const source = Settings.get("Data Source", "Yahoo Finance");

    return ErrorHandler.runSafe(`DataProvider.fetchAndStoreStockData[${symbol}]`, () => {
      // Simulate external delay to respect rate limit margins
      PlatformUtils.sleep(delay);

      // Wrapper to fetch stock using PlatformUtils retry mechanism
      const rawRecords = PlatformUtils.retry(() => {
        return this.fetchFromFeed(symbol, source);
      }, retryCount, 300);

      const elapsed = new Date().getTime() - start;
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
   * @param {string} symbol - Target symbol.
   * @param {string} source - Active configuration engine.
   * @returns {Array<Array<any>>} Organized matrix representing historical prices.
   */
  static fetchFromFeed(symbol, source) {
    if (symbol === "FAIL_STOCK") {
      throw new Error("Simulated feed response failure (Rate limit exceeded / Timeout).");
    }

    const todayStr = PlatformUtils.formatDate(new Date());

    // Simulate Yahoo Finance data mapping structure
    if (source === "Yahoo Finance") {
      return [
        [symbol, todayStr, 2520.00, 2560.40, 2515.10, 2552.15, 2552.15, 1420000, "Yahoo Finance", new Date()]
      ];
    }

    // Simulate NSE India data mapping structure
    if (source === "NSE Data Engine") {
      return [
        [symbol, todayStr, 2530.00, 2570.00, 2525.00, 2560.00, 2560.00, 1500000, "NSE Data Engine", new Date()]
      ];
    }

    // Default basic structure fallback
    return [
      [symbol, todayStr, 100.00, 105.00, 99.00, 104.00, 104.00, 100000, "Default Engine", new Date()]
    ];
  }
}

// Export to Node environment for local CI/CD testing
if (typeof exports !== 'undefined') {
  exports.DataProvider = DataProvider;
}
