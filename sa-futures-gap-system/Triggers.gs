/**
 * SA Automatic Futures Gap Analysis System
 * Triggers.gs - Time-driven automated triggers and menu callbacks.
 */

var Triggers = {
  DAILY_TRIGGER_FUNC: 'scheduledDailyFuturesUpdate',
  CONTINUATION_TRIGGER_FUNC: 'scheduledBackfillContinuation',

  /**
   * Setup daily automated trigger to run every trading day after NSE market close (18:30 IST)
   */
  setupDailyTrigger: function() {
    if (typeof ScriptApp === 'undefined') return;

    this.removeDailyTrigger();

    ScriptApp.newTrigger(this.DAILY_TRIGGER_FUNC)
      .timeBased()
      .atHour(18) // 18:30 IST
      .nearMinute(30)
      .everyDays(1)
      .inTimezone(CONFIG.TIMEZONE)
      .create();

    SheetManager.log('SUCCESS', 'Triggers', 'Installed automated daily time-driven trigger for 18:30 IST.');
  },

  /**
   * Setup single-execution continuation trigger to safely resume historical backfill
   * in ~1 minute, chaining execution until backfill queue is empty.
   */
  scheduleBackfillContinuation: function() {
    if (typeof ScriptApp === 'undefined') return;

    this.removeContinuationTrigger();

    // Schedule 1 minute from now
    ScriptApp.newTrigger(this.CONTINUATION_TRIGGER_FUNC)
      .timeBased()
      .after(60 * 1000)
      .create();

    SheetManager.log('INFO', 'Triggers', 'Scheduled backfill continuation trigger in 1 minute.');
  },

  /**
   * Remove continuation trigger once backfill is completed
   */
  removeContinuationTrigger: function() {
    if (typeof ScriptApp === 'undefined') return;

    var triggers = ScriptApp.getProjectTriggers();
    for (var i = 0; i < triggers.length; i++) {
      if (triggers[i].getHandlerFunction() === this.CONTINUATION_TRIGGER_FUNC) {
        ScriptApp.deleteTrigger(triggers[i]);
      }
    }
  },

  /**
   * Remove daily trigger
   */
  removeDailyTrigger: function() {
    if (typeof ScriptApp === 'undefined') return;

    var triggers = ScriptApp.getProjectTriggers();
    for (var i = 0; i < triggers.length; i++) {
      if (triggers[i].getHandlerFunction() === this.DAILY_TRIGGER_FUNC) {
        ScriptApp.deleteTrigger(triggers[i]);
      }
    }
  }
};

/**
 * Headless callback for daily automated time-driven trigger (18:30 IST).
 */
function scheduledDailyFuturesUpdate() {
  try {
    SyncEngine.syncAll();
  } catch (e) {
    SheetManager.log('ERROR', 'ScheduledTrigger', 'Error during scheduled update: ' + e.message);
  }
}

/**
 * Headless callback for backfill continuation trigger.
 */
function scheduledBackfillContinuation() {
  try {
    SheetManager.log('INFO', 'ScheduledContinuation', 'Resuming historical backfill batch via automated trigger.');
    BackfillEngine.runBackfill();
  } catch (e) {
    SheetManager.log('ERROR', 'ScheduledContinuation', 'Error during backfill continuation: ' + e.message);
  }
}
