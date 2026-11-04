/**
 * SA Automatic Futures Gap Analysis System
 * ContractMapper.gs - Accurately identify Current (near-month) and Next (far-month) futures contracts
 * AS OF EACH HISTORICAL DATE, respecting expiry dates and rollover rules.
 */

var ContractMapper = {
  /**
   * Determine Current Future and Next Future contract for a given stock symbol on a specific date.
   *
   * Rule:
   * - Filter available contracts for the symbol where contract.expiryDate >= tradeDate (unexpired contracts).
   * - Sort valid unexpired contracts ascending by expiry date.
   * - The earliest unexpired contract is the "Current Future" (near month).
   * - The second earliest unexpired contract is the "Next Future" (far month).
   * - Historical Expiry Date corresponds to the Current Future's actual expiration date.
   * - Rollover logic: On tradeDate <= Expiry Date 1, Contract 1 is Current.
   *   Once tradeDate > Expiry Date 1, Contract 1 is expired, and Contract 2 automatically rolls over to become the Current Future.
   *
   * Returns: {
   *   currentContract: { expiryStr, expiryDate, closePrice, settlePrice, underlyingPrice } | null,
   *   nextContract: { expiryStr, expiryDate, closePrice, settlePrice, underlyingPrice } | null,
   *   spotPrice: number | null,
   *   historicalExpiryDate: string (YYYY-MM-DD) | null
   * }
   */
  mapContractsForDate: function(tradeDate, stockData) {
    if (!stockData || !stockData.contracts || stockData.contracts.length === 0) {
      return {
        currentContract: null,
        nextContract: null,
        spotPrice: stockData ? stockData.spotPrice : null,
        historicalExpiryDate: null
      };
    }

    var tradeDateObj = (tradeDate instanceof Date) ? tradeDate : Utils.parseDate(tradeDate);
    if (!tradeDateObj) {
      return { currentContract: null, nextContract: null, spotPrice: null, historicalExpiryDate: null };
    }

    // Normalize tradeDate to start of day (midnight)
    var tradeMidnight = new Date(tradeDateObj.getFullYear(), tradeDateObj.getMonth(), tradeDateObj.getDate());

    // Deduplicate contracts by expiryStr if multiple entries exist
    var uniqueContractsMap = {};
    for (var i = 0; i < stockData.contracts.length; i++) {
      var c = stockData.contracts[i];
      if (!c.expiryDate) {
        c.expiryDate = Utils.parseDate(c.expiryStr);
      }
      if (!c.expiryDate) continue;

      var expKey = c.expiryStr || Utils.formatDateKey(c.expiryDate);
      if (!uniqueContractsMap[expKey]) {
        uniqueContractsMap[expKey] = c;
      }
    }

    var contractsList = Object.keys(uniqueContractsMap).map(function(k) {
      return uniqueContractsMap[k];
    });

    // Filter unexpired contracts: contract expiryDate >= tradeDate
    var unexpired = contractsList.filter(function(c) {
      var expMidnight = new Date(c.expiryDate.getFullYear(), c.expiryDate.getMonth(), c.expiryDate.getDate());
      return expMidnight >= tradeMidnight;
    });

    // Sort ascending by expiry date (earliest expiry first)
    unexpired.sort(function(a, b) {
      return a.expiryDate.getTime() - b.expiryDate.getTime();
    });

    var current = unexpired.length > 0 ? unexpired[0] : null;
    var next = unexpired.length > 1 ? unexpired[1] : null;

    var histExpiryDate = null;
    if (current && current.expiryDate) {
      histExpiryDate = Utils.formatDateKey(current.expiryDate);
    }

    // Prefer spotPrice on stockData, else underlyingPrice from current contract
    var resolvedSpot = (stockData.spotPrice !== null && stockData.spotPrice !== undefined)
      ? stockData.spotPrice
      : (current && current.underlyingPrice !== null && current.underlyingPrice !== undefined ? current.underlyingPrice : null);

    return {
      currentContract: current,
      nextContract: next,
      spotPrice: resolvedSpot,
      historicalExpiryDate: histExpiryDate
    };
  }
};
