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
 * Safety Rule:
 * Handle zero or missing prices safely; NEVER substitute zero for missing data.
 * If denominator is zero or values are missing/null, output empty string or null.
 */

var GapEngine = {
  /**
   * Calculate all gap fields given raw prices.
   * Returns an object containing calculated values.
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
      // Denominator check: Current Future != 0
      if (curVal !== 0) {
        curNextGapPct = Utils.round(((curVal - nextVal) / curVal) * 100, 4);
      }
    }

    // Spot - Current Future Gap = Spot - Current Future
    var spotCurGap = null;
    var spotCurGapPct = null;

    if (spotVal !== null && curVal !== null) {
      spotCurGap = Utils.round(spotVal - curVal, 4);
      // Denominator check: Spot != 0
      if (spotVal !== 0) {
        spotCurGapPct = Utils.round(((spotVal - curVal) / spotVal) * 100, 4);
      }
    }

    return {
      spotPrice: spotVal,
      currentFuturePrice: curVal,
      nextFuturePrice: nextVal,
      currentNextGap: curNextGap,
      currentNextGapPct: curNextGapPct,
      spotCurrentFutureGap: spotCurGap,
      spotFutureGapPct: spotCurGapPct
    };
  },

  /**
   * Build the exact 10-column row array for 'Futures Gap Analysis' sheet.
   *
   * Columns:
   * [Date, Symbol, Spot Price, Current Future Price, Next Future Price,
   *  Current−Next Gap, Current−Next Gap %, Spot−Current Future Gap, Spot-Future Gap %, Historical Expiry Date]
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
