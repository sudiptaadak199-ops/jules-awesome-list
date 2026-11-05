/**
 * SA Automatic Futures Gap Analysis System
 * ContractMapper.gs - Accurately identify Current (near-month) and Next (far-month) futures contracts
 * AS OF EACH HISTORICAL DATE, respecting expiry dates and rollover rules.
 *
 * Rules:
 * 1. Filter available contracts where expiryDate >= tradeDate (unexpired contracts).
 * 2. Reject contracts with:
 *    - Blank or missing contractSymbol
 *    - Invalid or unparseable expiry dates
 *    - Zero, negative, or missing Closing Price (closePrice <= 0)
 * 3. Never substitute Settlement Price for Closing Price.
 * 4. Distinct Expiry Rule: Current and Next contracts MUST have distinct expiry dates (current.expiryDate < next.expiryDate).
 * 5. Completeness: A mapping is marked COMPLETE only when:
 *    - Spot price > 0
 *    - Current futures price > 0 AND Current contract symbol is non-blank AND Current expiry date is valid
 *    - Next futures price > 0 AND Next contract symbol is non-blank AND Next expiry date is valid
 *    - Expiries are distinct
 *    Otherwise, mapping status is marked INCOMPLETE.
 */

var ContractMapper = {
  mapContractsForDate: function(tradeDate, stockData) {
    if (!stockData || !stockData.contracts || stockData.contracts.length === 0) {
      return {
        currentContract: null,
        nextContract: null,
        spotPrice: stockData ? stockData.spotPrice : null,
        historicalExpiryDate: null,
        nextExpiryDate: null,
        currentContractSymbol: null,
        nextContractSymbol: null,
        mappingStatus: 'INCOMPLETE',
        priceSource: 'NONE'
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
        nextContractSymbol: null,
        mappingStatus: 'INCOMPLETE',
        priceSource: 'NONE'
      };
    }

    var tradeMidnight = new Date(tradeDateObj.getFullYear(), tradeDateObj.getMonth(), tradeDateObj.getDate());

    var validContracts = [];
    var seenExpiries = {};

    for (var i = 0; i < stockData.contracts.length; i++) {
      var c = stockData.contracts[i];

      // 1. Must have valid non-blank contract symbol
      var sym = (c.contractSymbol || '').trim();
      if (!sym) {
        continue; // REJECT blank contract symbols
      }

      // 2. Must have valid unexpired expiryDate
      var expDate = c.expiryDate || Utils.parseDate(c.expiryStr);
      if (!expDate || isNaN(expDate.getTime())) {
        continue; // REJECT invalid expiry
      }

      var expMidnight = new Date(expDate.getFullYear(), expDate.getMonth(), expDate.getDate());
      if (expMidnight < tradeMidnight) {
        continue; // Expired
      }

      // 3. Strict Close Price rule:
      // Must have valid positive official Closing Price (> 0)
      // NEVER silently accept Settlement Price as Closing Price!
      var closePr = Utils.safeFloat(c.closePrice);
      if (closePr === null || closePr <= 0) {
        continue; // REJECT missing or non-positive Close Price!
      }

      var expKey = c.expiryStr || Utils.formatDateKey(expDate);
      if (!seenExpiries[expKey]) {
        seenExpiries[expKey] = true;
        validContracts.push({
          contractSymbol: sym,
          expiryStr: expKey,
          expiryDate: expDate,
          closePrice: closePr,
          settlePrice: c.settlePrice,
          priceSource: c.priceSource || 'ClsPric',
          underlyingPrice: c.underlyingPrice
        });
      }
    }

    // Sort ascending by expiry date (earliest unexpired contract first)
    validContracts.sort(function(a, b) {
      return a.expiryDate.getTime() - b.expiryDate.getTime();
    });

    var current = validContracts.length > 0 ? validContracts[0] : null;
    var next = null;

    // Find the next contract with a DISTINCT expiry date
    if (current && validContracts.length > 1) {
      for (var k = 1; k < validContracts.length; k++) {
        if (validContracts[k].expiryDate.getTime() > current.expiryDate.getTime()) {
          next = validContracts[k];
          break;
        }
      }
    }

    var histExpiryDate = current ? Utils.formatDateKey(current.expiryDate) : null;
    var nextExpiryDate = next ? Utils.formatDateKey(next.expiryDate) : null;
    var curContractSymbol = current ? current.contractSymbol : null;
    var nextContractSymbol = next ? next.contractSymbol : null;

    var resolvedSpot = (stockData.spotPrice !== null && stockData.spotPrice !== undefined && stockData.spotPrice > 0)
      ? stockData.spotPrice
      : (current && current.underlyingPrice !== null && current.underlyingPrice > 0 ? current.underlyingPrice : null);

    // Completeness validation:
    var isComplete = (resolvedSpot !== null && resolvedSpot > 0) &&
                     (current !== null && current.closePrice > 0 && curContractSymbol) &&
                     (next !== null && next.closePrice > 0 && nextContractSymbol) &&
                     (histExpiryDate !== null && nextExpiryDate !== null && histExpiryDate !== nextExpiryDate);

    var status = isComplete ? 'COMPLETE' : 'INCOMPLETE';

    return {
      currentContract: current,
      nextContract: next,
      spotPrice: resolvedSpot,
      historicalExpiryDate: histExpiryDate,
      nextExpiryDate: nextExpiryDate,
      currentContractSymbol: curContractSymbol,
      nextContractSymbol: nextContractSymbol,
      mappingStatus: status,
      priceSource: current ? current.priceSource : 'NONE'
    };
  }
};
