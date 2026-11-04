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
 * Never permanently save incomplete records as successful.
 */

var GapEngine = {
  /**
   * Calculate all gap fields given raw prices.
   * Returns an object containing calculated values and completeness flag.
   */
  calculateGaps: function(spot, currentFuture, nextFuture) {
    var spotVal = Utils.safeFloat(spot);
    var curVal = Utils.safeFloat(currentFuture);
    var nextVal = Utils.safeFloat(nextFuture);

    // Current - Next Gap = Current Future - Next Future
    var curNextGap = null;
    var curNextGapPct = null;

    if (curVal !== null && nextVal !== null) {
      curNextGap = Utils.round(curVal - nextVal, 4);
      if (curVal !== 0) {
        curNextGapPct = Utils.round(((curVal - nextVal) / curVal) * 100, 4);
      }
    }

    // Spot - Current Future Gap = Spot - Current Future
    var spotCurGap = null;
    var spotCurGapPct = null;

    if (spotVal !== null && curVal !== null) {
      spotCurGap = Utils.round(spotVal - curVal, 4);
      if (spotVal !== 0) {
        spotCurGapPct = Utils.round(((spotVal - curVal) / spotVal) * 100, 4);
      }
    }

    // Strict Completeness Flag: Spot, Current Future, and Next Future must all be valid (> 0)
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
   * Build the exact 10-column row array for 'Futures Gap Analysis' sheet.
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
  }
};
