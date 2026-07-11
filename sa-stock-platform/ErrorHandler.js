/**
 * SA Stock Research & Backtest Platform - Phase 1 (Foundation)
 *
 * Decoupled Enterprise Error Handling Module
 *
 * Centralizes error categorization, user-friendly messaging, and diagnostic compilation.
 * Prevents system halt states and ensures continuous operation during batch processing.
 */

class ErrorHandler {
  /**
   * Safe wrapper that executes a routine. If it fails, logs the error,
   * compiles statistics, and returns null instead of throwing an unhandled exception.
   * @param {string} scopeName - Description of the execution context.
   * @param {Function} delegate - Code execution block.
   * @param {any} fallbackValue - Value to return if execution fails.
   * @returns {any} Result of the delegate or the fallback value.
   */
  static runSafe(scopeName, delegate, fallbackValue = null) {
    const start = new Date().getTime();
    try {
      return delegate();
    } catch (e) {
      const elapsed = new Date().getTime() - start;
      const parsedError = this.parse(e);

      // Attempt to append to Logger
      try {
        Logger.error(scopeName, elapsed, parsedError.message);
      } catch (logErr) {
        console.error(`ErrorHandler Logger bypass for [${scopeName}]: ${parsedError.message}. Logger error: ${logErr.message}`);
      }

      return fallbackValue;
    }
  }

  /**
   * Structure parsing for error objects, converting stack traces into structured objects.
   * @param {any} err - Error object or string message.
   * @returns {object} Standardized error structure.
   */
  static parse(err) {
    if (err instanceof Error) {
      return {
        message: err.message || "Unknown error",
        stack: err.stack || "No stack trace available",
        type: err.name || "RuntimeError"
      };
    }

    return {
      message: String(err),
      stack: "Constructed string error",
      type: "GenericError"
    };
  }

  /**
   * Renders a human-readable alert message box for UI interactions.
   * @param {string} context - Source operation.
   * @param {any} err - Error object.
   */
  static displayUserAlert(context, err) {
    const info = this.parse(err);
    const friendlyMessage = `An operation error occurred: ${context}\n\n` +
                            `Details: ${info.message}\n\n` +
                            `Please review the System Logs sheet for details and diagnosis.`;
    try {
      SpreadsheetApp.getUi().alert("SA Platform Warning", friendlyMessage, SpreadsheetApp.getUi().ButtonSet.OK);
    } catch (uiErr) {
      // Non-interactive fallback
      console.warn("User alert bypassed (No UI context): " + friendlyMessage);
    }
  }
}

// Export to Node environment for local CI/CD testing
if (typeof exports !== 'undefined') {
  exports.ErrorHandler = ErrorHandler;
}
