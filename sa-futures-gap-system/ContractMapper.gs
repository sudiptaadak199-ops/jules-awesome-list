/**
 * SA Automatic Futures Gap Analysis System
 * ContractMapper.gs - Accurately identify Current (near-month) and Next (far-month) futures contracts
 * AS OF EACH HISTORICAL DATE, respecting expiry dates and rollover rules.
 *
 * Rules:
 * 1. Filter available contracts where expiryDate >= tradeDate (unexpired contracts).
 * 2. Reject contracts with missing, zero, or invalid closing prices BEFORE sorting/selecting.
 * 3. Preserve BOTH Current Contract Expiry and Next Contract Expiry mappings for historical precision.
 */

var ContractMapper = {
  /**
   * Determine Current Future and Next Future contract for a given stock symbol on a specific date.
   *
   * Returns: {
   *   currentContract: { expiryStr, expiryDate, closePrice, settlePrice, underlyingPrice } | null,
   *   nextContract: { expiryStr, expiryDate, closePrice, settlePrice, underlyingPrice } | null,
   *   spotPrice: number | null,
   *   historicalExpiryDate: string (YYYY-MM-DD) | null,
   *   nextExpiryDate: string (YYYY-MM-DD) | null
   * }
   */
  mapContractsForDate: function(tradeDate, stockData) {
    if (!stockData || !stockData.contracts || stockData.contracts.length === 0) {
      return {
        currentContract: null,
        nextContract: null,
        spotPrice: stockData ? stockData.spotPrice : null,
        historicalExpiryDate: null,
        nextExpiryDate: null
      };
    }

    var tradeDateObj = (tradeDate instanceof Date) ? tradeDate : Utils.parseDate(tradeDate);
    if (!tradeDateObj) {
      return { currentContract: null, nextContract: null, spotPrice: null, historicalExpiryDate: null, nextExpiryDate: null };
    }

    var tradeMidnight = new Date(tradeDateObj.getFullYear(), tradeDateObj.getMonth(), tradeDateObj.getDate());

    // Filter valid contracts:
    // - Must have valid expiryDate >= tradeMidnight
    // - Must have a valid positive closing/settle price (reject zero, negative, or missing prices)
    var validContracts = [];
    var seenExpiries = {};

    for (var i = 0; i < stockData.contracts.length; i++) {
      var c = stockData.contracts[i];
      var expDate = c.expiryDate || Utils.parseDate(c.expiryStr);
      if (!expDate) continue;

      var expMidnight = new Date(expDate.getFullYear(), expDate.getMonth(), expDate.getDate());
      if (expMidnight < tradeMidnight) {
        continue; // Expired contract
      }

      // Validate price: must have valid positive price (> 0)
      var price = (c.closePrice !== null && c.closePrice !== undefined && c.closePrice > 0)
        ? c.closePrice
        : ((c.settlePrice !== null && c.settlePrice !== undefined && c.settlePrice > 0) ? c.settlePrice : null);

      if (price === null || price <= 0) {
        continue; // REJECT contracts with zero, negative, or missing price!
      }

      var expKey = c.expiryStr || Utils.formatDateKey(expDate);
      if (!seenExpiries[expKey]) {
        seenExpiries[expKey] = true;
        validContracts.push({
          expiryStr: expKey,
          expiryDate: expDate,
          closePrice: price,
          settlePrice: c.settlePrice,
          underlyingPrice: c.underlyingPrice
        });
      }
    }

    // Sort ascending by expiry date (earliest unexpired contract first)
    validContracts.sort(function(a, b) {
      return a.expiryDate.getTime() - b.expiryDate.getTime();
    });

    var current = validContracts.length > 0 ? validContracts[0] : null;
    var next = validContracts.length > 1 ? validContracts[1] : null;

    var histExpiryDate = current ? Utils.formatDateKey(current.expiryDate) : null;
    var nextExpiryDate = next ? Utils.formatDateKey(next.expiryDate) : null;

    var resolvedSpot = (stockData.spotPrice !== null && stockData.spotPrice !== undefined && stockData.spotPrice > 0)
      ? stockData.spotPrice
      : (current && current.underlyingPrice !== null && current.underlyingPrice > 0 ? current.underlyingPrice : null);

    return {
      currentContract: current,
      nextContract: next,
      spotPrice: resolvedSpot,
      historicalExpiryDate: histExpiryDate,
      nextExpiryDate: nextExpiryDate
    };
  }
};
