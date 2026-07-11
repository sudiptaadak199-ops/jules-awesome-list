/**
 * SA Stock Research & Backtest Platform - Phase 1 (Foundation)
 *
 * Logging Service
 *
 * A professional, high-performance structured execution logger.
 * Implements a buffer so that sequential logs during a process run can be written
 * in one single spreadsheet transaction at the end, or written immediately if needed.
 */

class Logger {
  /**
   * Initializes the logger log buffer.
   */
  static init() {
    this._buffer = [];
  }

  /**
   * Logs a message with "SUCCESS" status.
   * @param {string} functionName - Name of the executing routine.
   * @param {number} durationMs - Execution time in milliseconds.
   */
  static success(functionName, durationMs = 0) {
    this.log(functionName, "SUCCESS", durationMs, "");
  }

  /**
   * Logs a message with "ERROR" status.
   * @param {string} functionName - Name of the executing routine.
   * @param {number} durationMs - Execution time in milliseconds.
   * @param {string|Error} error - Error message or object.
   */
  static error(functionName, durationMs = 0, error = "") {
    const errorMsg = error instanceof Error ? error.message + "\nStack: " + error.stack : String(error);
    this.log(functionName, "ERROR", durationMs, errorMsg);
  }

  /**
   * Appends an execution entry to the local buffer.
   * @param {string} functionName - Name of the executing routine.
   * @param {string} status - SUCCESS, ERROR, or WARNING.
   * @param {number} durationMs - Execution time in milliseconds.
   * @param {string} errorMessage - Error details if status is ERROR.
   */
  static log(functionName, status, durationMs, errorMessage = "") {
    if (!this._buffer) {
      this.init();
    }

    const now = new Date();
    // Format Date: YYYY-MM-DD
    const dateStr = now.getFullYear() + "-" +
                    String(now.getMonth() + 1).padStart(2, '0') + "-" +
                    String(now.getDate()).padStart(2, '0');

    // Format Time: HH:MM:SS
    const timeStr = String(now.getHours()).padStart(2, '0') + ":" +
                    String(now.getMinutes()).padStart(2, '0') + ":" +
                    String(now.getSeconds()).padStart(2, '0');

    this._buffer.push([
      dateStr,
      timeStr,
      functionName,
      status,
      durationMs,
      errorMessage
    ]);

    // If Debug Mode setting is active, also print to Stackdriver/Apps Script Execution Logs
    if (Settings.getBool("Debug Mode", false)) {
      const consoleLogMsg = `[${status}] ${functionName} (${durationMs}ms) - ${errorMessage || "OK"}`;
      if (status === "ERROR") {
        console.error(consoleLogMsg);
      } else {
        console.log(consoleLogMsg);
      }
    }
  }

  /**
   * Flushes the buffer by writing all accumulated log rows to the Google Sheet in a single batch operation.
   * Clears the buffer.
   */
  static flush() {
    if (!this._buffer || this._buffer.length === 0) return;
    try {
      SheetManager.batchAppend(Config.SHEETS.LOGS, this._buffer);
    } catch (e) {
      // Emergency console logs if Sheet writes fail
      console.error("Failed to write buffer logs to spreadsheet: " + e.message);
      console.log("Buffered logs: " + JSON.stringify(this._buffer));
    } finally {
      this.clear();
    }
  }

  /**
   * Clears current log buffer.
   */
  static clear() {
    this._buffer = [];
  }
}

// Expose Logger globally if context allows
if (typeof exports !== 'undefined') {
  exports.Logger = Logger;
}
