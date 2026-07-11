/**
 * SA Stock Research & Backtest Platform - Phase 1 (Foundation)
 *
 * Buffered Enterprise Execution Logger
 *
 * Provides professional logging metrics including execution timestamps, durations, and status codes.
 * Uses local list buffering to execute exactly one Spreadsheet append transaction at completion.
 */

class Logger {
  /**
   * Initializes the logger transaction buffer array.
   */
  static init() {
    this._buffer = [];
  }

  /**
   * Logs a successful operation run.
   * @param {string} functionName - Scope function.
   * @param {number} durationMs - Spent time in ms.
   */
  static success(functionName, durationMs) {
    if (durationMs === undefined) durationMs = 0;
    this.appendEntry(functionName, "SUCCESS", durationMs, "");
  }

  /**
   * Logs a warning operation run.
   * @param {string} functionName - Scope function.
   * @param {number} durationMs - Spent time in ms.
   * @param {string} warningMsg - Custom diagnostic context.
   */
  static warning(functionName, durationMs, warningMsg) {
    if (durationMs === undefined) durationMs = 0;
    if (warningMsg === undefined) warningMsg = "";
    this.appendEntry(functionName, "WARNING", durationMs, warningMsg);
  }

  /**
   * Logs a failed operation run.
   * @param {string} functionName - Scope function.
   * @param {number} durationMs - Spent time in ms.
   * @param {string|Error} err - Error object or string message.
   */
  static error(functionName, durationMs, err) {
    if (durationMs === undefined) durationMs = 0;
    if (err === undefined) err = "";
    var errorMsg = "";
    if (err instanceof Error) {
      errorMsg = err.message + " | Stack: " + err.stack;
    } else {
      errorMsg = String(err);
    }
    this.appendEntry(functionName, "ERROR", durationMs, errorMsg);
  }

  /**
   * Compiles and appends logs into the active memory array.
   * @param {string} functionName - Scope function.
   * @param {string} status - SUCCESS, WARNING, or ERROR.
   * @param {number} durationMs - Process length.
   * @param {string} description - Detail context.
   */
  static appendEntry(functionName, status, durationMs, description) {
    if (description === undefined) description = "";
    if (!this._buffer) {
      this.init();
    }

    var now = new Date();
    var dateStr = PlatformUtils.formatDate(now);
    var timeStr = PlatformUtils.formatTime(now);

    this._buffer.push([
      dateStr,
      timeStr,
      functionName,
      status,
      durationMs,
      description
    ]);

    // Stackdriver integration if system debug setting is enabled
    if (Settings.getBool("Debug Mode", false)) {
      var consoleMsg = "[SA PLATFORM LOG] [" + status + "] " + functionName + " (" + durationMs + "ms) - " + (description || "OK");
      if (status === "ERROR") {
        console.error(consoleMsg);
      } else if (status === "WARNING") {
        console.warn(consoleMsg);
      } else {
        console.log(consoleMsg);
      }
    }
  }

  /**
   * Writes all locally buffered operational rows directly to the Logs database tab in one batch operation.
   * Wipes memory array afterwards.
   */
  static flush() {
    if (!this._buffer || this._buffer.length === 0) return;
    try {
      SheetManager.batchAppend(Config.SHEETS.LOGS, this._buffer);
    } catch (e) {
      console.error("Critical failure during batch logging transaction: " + e.message);
      console.log("Buffered logs: " + JSON.stringify(this._buffer));
    } finally {
      this.clear();
    }
  }

  /**
   * Clears the current transaction buffer.
   */
  static clear() {
    this._buffer = [];
  }
}
