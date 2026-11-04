/**
 * SA Automatic Futures Gap Analysis System
 * GapEngine.gs - Calculate required futures gap metrics conforming strictly to formulas.
 *
 * Required Columns & Formulas:
 * 1. Date
 * 2. Symbol
 * 3. Spot Price
 * 4. Current Future Price
 * 5. Next Future Price
 * 6. Current−Next Gap = Current Future − Next Future
 * 7. Current−Next Gap % = (Current Future − Next Future) / Current Future × 100
 * 8. Spot−Current Future Gap = Spot − Current Future
 * 9. Spot-Future Gap % = (Spot − Current Future) / Spot × 100
 * 10. Historical Expiry Date
 *
 * Strict Completeness Rule:
 * A record is treated as complete ONLY when Spot, Current Future, and Next Future prices are all valid (> 0).
 * Incomplete records are rejected and never saved.
 */

var GapEngine = {
  calculateGaps: function(spot, currentFuture, nextFuture) {
    var spotVal = Utils.safeFloat(spot);
    var curVal = Utils.safeFloat(currentFuture);
    var nextVal = Utils.safeFloat(nextFuture);

    var curNextGap = null;
    var curNextGapPct = null;

    if (curVal !== null && nextVal !== null) {
      curNextGap = Utils.round(curVal - nextVal, 4);
      if (curVal !== 0) {
        curNextGapPct = Utils.round(((curVal - nextVal) / curVal) * 100, 4);
      }
    }

    var spotCurGap = null;
    var spotCurGapPct = null;

    if (spotVal !== null && curVal !== null) {
      spotCurGap = Utils.round(spotVal - curVal, 4);
      if (spotVal !== 0) {
        spotCurGapPct = Utils.round(((spotVal - curVal) / spotVal) * 100, 4);
      }
    }

    var isComplete = (spotVal !== null && spotVal > 0) &&
                     (curVal !== null && curVal > 0) &&
                     (nextVal !== null && nextVal > 0);

    return {
      spotPrice: spotVal,
      currentFuturePrice: curVal,
      nextFuturePrice: nextVal,
      currentNextGap: curNextGap,
      currentNextGapPct: curNextGapPct,
      spotCurrentFutureGap: spotCurGap,
      spotFutureGapPct: spotCurGapPct,
      isComplete: isComplete
    };
  },

  /**
   * Build the exact 10-column row array for 'Futures Gap Analysis' sheet (UNCHANGED).
   */
  buildAnalysisRow: function(dateStr, symbol, spot, currentFuture, nextFuture, histExpiryDate) {
    var gaps = this.calculateGaps(spot, currentFuture, nextFuture);

    return [
      dateStr,
      symbol,
      gaps.spotPrice !== null ? gaps.spotPrice : '',
      gaps.currentFuturePrice !== null ? gaps.currentFuturePrice : '',
      gaps.nextFuturePrice !== null ? gaps.nextFuturePrice : '',
      gaps.currentNextGap !== null ? gaps.currentNextGap : '',
      gaps.currentNextGapPct !== null ? gaps.currentNextGapPct : '',
      gaps.spotCurrentFutureGap !== null ? gaps.spotCurrentFutureGap : '',
      gaps.spotFutureGapPct !== null ? gaps.spotFutureGapPct : '',
      histExpiryDate || ''
    ];
  },

  /**
   * Build the exact 10-column row array for 'Contract_Mapping' sheet.
   * Columns:
   * 1. Date
   * 2. Symbol
   * 3. Current Contract Symbol
   * 4. Current Expiry Date
   * 5. Next Contract Symbol
   * 6. Next Expiry Date
   * 7. Current Futures Price
   * 8. Next Futures Price
   * 9. Last Updated
   * 10. Data Status
   */
  buildMappingRow: function(dateStr, symbol, curContractSymbol, curExpiryDate, nextContractSymbol, nextExpiryDate, curPrice, nextPrice, dataStatus) {
    return [
      dateStr,
      symbol,
      curContractSymbol || '',
      curExpiryDate || '',
      nextContractSymbol || '',
      nextExpiryDate || '',
      curPrice !== null && curPrice !== undefined ? curPrice : '',
      nextPrice !== null && nextPrice !== undefined ? nextPrice : '',
      new Date().toISOString(),
      dataStatus || 'COMPLETE'
    ];
  }
};
