/**
 * SA Automatic Futures Gap Analysis System
 * ContractMapper.gs - Accurately identify Current (near-month) and Next (far-month) futures contracts
 * AS OF EACH HISTORICAL DATE, respecting expiry dates and rollover rules.
 *
 * Rules:
 * 1. Filter available contracts where expiryDate >= tradeDate (unexpired contracts).
 * 2. Reject contracts with missing, zero, or invalid closing prices BEFORE sorting/selecting.
 * 3. Capture real contract symbols (FinInstrmNm or ticker contract code).
 * 4. Preserve BOTH Current Contract Expiry and Next Contract Expiry mappings for permanent dual mapping.
 */

var ContractMapper = {
  /**
   * Determine Current Future and Next Future contract for a given stock symbol on a specific date.
   *
   * Returns: {
   *   currentContract: { contractSymbol, expiryStr, expiryDate, closePrice, settlePrice, underlyingPrice } | null,
   *   nextContract: { contractSymbol, expiryStr, expiryDate, closePrice, settlePrice, underlyingPrice } | null,
   *   spotPrice: number | null,
   *   historicalExpiryDate: string (YYYY-MM-DD) | null,
   *   nextExpiryDate: string (YYYY-MM-DD) | null,
   *   currentContractSymbol: string | null,
   *   nextContractSymbol: string | null
   * }
   */
  mapContractsForDate: function(tradeDate, stockData) {
    if (!stockData || !stockData.contracts || stockData.contracts.length === 0) {
      return {
        currentContract: null,
        nextContract: null,
        spotPrice: stockData ? stockData.spotPrice : null,
        historicalExpiryDate: null,
        nextExpiryDate: null,
        currentContractSymbol: null,
        nextContractSymbol: null
      };
    }

    var tradeDateObj = (tradeDate instanceof Date) ? tradeDate : Utils.parseDate(tradeDate);
    if (!tradeDateObj) {
      return {
        currentContract: null,
        nextContract: null,
        spotPrice: null,
        historicalExpiryDate: null,
        nextExpiryDate: null,
        currentContractSymbol: null,
        nextContractSymbol: null
      };
    }

    var tradeMidnight = new Date(tradeDateObj.getFullYear(), tradeDateObj.getMonth(), tradeDateObj.getDate());

    var validContracts = [];
    var seenExpiries = {};

    for (var i = 0; i < stockData.contracts.length; i++) {
      var c = stockData.contracts[i];
      var expDate = c.expiryDate || Utils.parseDate(c.expiryStr);
      if (!expDate) continue;

      var expMidnight = new Date(expDate.getFullYear(), expDate.getMonth(), expDate.getDate());
      if (expMidnight < tradeMidnight) {
        continue; // Expired
      }

      var price = (c.closePrice !== null && c.closePrice !== undefined && c.closePrice > 0)
        ? c.closePrice
        : ((c.settlePrice !== null && c.settlePrice !== undefined && c.settlePrice > 0) ? c.settlePrice : null);

      if (price === null || price <= 0) {
        continue; // Reject missing/zero/invalid prices
      }

      var expKey = c.expiryStr || Utils.formatDateKey(expDate);
      if (!seenExpiries[expKey]) {
        seenExpiries[expKey] = true;
        validContracts.push({
          contractSymbol: c.contractSymbol || (c.symbol ? c.symbol + '_' + expKey : ''),
          expiryStr: expKey,
          expiryDate: expDate,
          closePrice: price,
          settlePrice: c.settlePrice,
          underlyingPrice: c.underlyingPrice
        });
      }
    }

    // Sort ascending by expiry date
    validContracts.sort(function(a, b) {
      return a.expiryDate.getTime() - b.expiryDate.getTime();
    });

    var current = validContracts.length > 0 ? validContracts[0] : null;
    var next = validContracts.length > 1 ? validContracts[1] : null;

    var histExpiryDate = current ? Utils.formatDateKey(current.expiryDate) : null;
    var nextExpiryDate = next ? Utils.formatDateKey(next.expiryDate) : null;

    var curContractSymbol = current ? current.contractSymbol : null;
    var nextContractSymbol = next ? next.contractSymbol : null;

    var resolvedSpot = (stockData.spotPrice !== null && stockData.spotPrice !== undefined && stockData.spotPrice > 0)
      ? stockData.spotPrice
      : (current && current.underlyingPrice !== null && current.underlyingPrice > 0 ? current.underlyingPrice : null);

    return {
      currentContract: current,
      nextContract: next,
      spotPrice: resolvedSpot,
      historicalExpiryDate: histExpiryDate,
      nextExpiryDate: nextExpiryDate,
      currentContractSymbol: curContractSymbol,
      nextContractSymbol: nextContractSymbol
    };
  }
};
