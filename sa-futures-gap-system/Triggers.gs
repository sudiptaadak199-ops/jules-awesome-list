/**
 * SA Automatic Futures Gap Analysis System
 * Triggers.gs - Time-driven automated triggers and menu callbacks.
 */

var Triggers = {
  TRIGGER_FUNC: 'scheduledDailyFuturesUpdate',

  /**
   * Setup daily automated trigger to run every trading day after NSE market close (e.g. 18:30 IST)
   */
  setupDailyTrigger: function() {
    if (typeof ScriptApp === 'undefined') return;

    this.removeTriggers();

    ScriptApp.newTrigger(this.TRIGGER_FUNC)
      .timeBased()
      .atHour(18) // 18:30 IST
      .nearMinute(30)
      .everyDays(1)
      .inTimezone(CONFIG.TIMEZONE)
      .create();

    SheetManager.log('SUCCESS', 'Triggers', 'Installed automated daily time-driven trigger for 18:30 IST.');
  },

  /**
   * Remove any existing triggers to prevent duplicate executions
   */
  removeTriggers: function() {
    if (typeof ScriptApp === 'undefined') return;

    var triggers = ScriptApp.getProjectTriggers();
    for (var i = 0; i < triggers.length; i++) {
      if (triggers[i].getHandlerFunction() === this.TRIGGER_FUNC) {
        ScriptApp.deleteTrigger(triggers[i]);
      }
    }
  }
};

/**
 * Headless callback for daily automated time-driven trigger.
 * Never call SpreadsheetApp.getUi() in headless context!
 */
function scheduledDailyFuturesUpdate() {
  try {
    SyncEngine.syncAll();
  } catch (e) {
    SheetManager.log('ERROR', 'ScheduledTrigger', 'Error during scheduled update: ' + e.message);
  }
}
