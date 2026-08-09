/**
 * SA Stock Research & Backtest Platform - Phase 1 (Foundation)
 *
 * General Purpose Utility Helpers Module
 *
 * Includes date string formatters, generic retry wrappers, and custom numeric and sleep logic.
 */

class PlatformUtils {
  /**
   * Suspends execution flow safely.
   * Ensures sleep runs gracefully even if custom limits are hit.
   * @param {number} ms - Delay in milliseconds.
   */
  static sleep(ms) {
    if (ms <= 0) return;
    try {
      Utilities.sleep(ms);
    } catch (e) {
      // Fallback loop if script execution environment restricts sleep directly
      var start = new Date().getTime();
      while (new Date().getTime() - start < ms) {
        // busy wait as emergency fallback
      }
    }
  }

  /**
   * Formats a given Date object into 'YYYY-MM-DD' representation.
   * @param {Date} dateObj - The date to format.
   * @returns {string} Formatted string.
   */
  static formatDate(dateObj) {
    var d = dateObj instanceof Date ? dateObj : new Date();
    var yyyy = d.getFullYear();
    var mm = String(d.getMonth() + 1).padStart(2, "0");
    var dd = String(d.getDate()).padStart(2, "0");
    return yyyy + "-" + mm + "-" + dd;
  }

  /**
   * Formats a given Date object into 'HH:MM:SS' representation.
   * @param {Date} dateObj - The date to format.
   * @returns {string} Formatted string.
   */
  static formatTime(dateObj) {
    var d = dateObj instanceof Date ? dateObj : new Date();
    var hh = String(d.getHours()).padStart(2, "0");
    var mm = String(d.getMinutes()).padStart(2, "0");
    var ss = String(d.getSeconds()).padStart(2, "0");
    return hh + ":" + mm + ":" + ss;
  }

  /**
   * A resilient retry wrapper that executes a functional delegate up to N times.
   * @param {Function} action - Function to attempt.
   * @param {number} maxAttempts - Number of retries allowed.
   * @param {number} backoffMs - Delay backoff to prevent API blockages.
   * @returns {any} Result of the action execution.
   */
  static retry(action, maxAttempts, backoffMs) {
    if (maxAttempts === undefined) maxAttempts = 3;
    if (backoffMs === undefined) backoffMs = 500;

    var lastError = null;
    for (var attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return action();
      } catch (err) {
        lastError = err;
        if (attempt < maxAttempts) {
          this.sleep(backoffMs * attempt); // exponential backoff
        }
      }
    }
    throw lastError;
  }

  /**
   * Converts variable safely into a boolean.
   * @param {any} val - Value to check.
   * @returns {boolean}
   */
  static toBool(val) {
    if (val === undefined || val === null) return false;
    var s = String(val).toUpperCase().trim();
    return s === "TRUE" || s === "1" || s === "YES" || s === "Y";
  }
}
