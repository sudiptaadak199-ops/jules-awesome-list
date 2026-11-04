/**
 * SA Automatic Futures Gap Analysis System
 * Main.gs - Top-level global execution entry points and custom spreadsheet menu.
 *
 * Top-level global functions are required by Google Apps Script editor dropdown and triggers.
 */

/**
 * onOpen hook to build custom UI menu when spreadsheet is opened
 */
function onOpen() {
  if (typeof SpreadsheetApp === 'undefined') return;
  try {
    var ui = SpreadsheetApp.getUi();
    ui.createMenu('🚀 Futures Gap System')
      .addItem('⚡ Initialize / Repair Platform', 'InitializeProject')
      .addSeparator()
      .addItem('🔄 Run Full Sync (Today + Missing)', 'RunFullSync')
      .addItem('⏳ Run Historical 6M Backfill', 'RunHistoricalBackfill')
      .addItem('📊 Refresh Dashboard', 'RefreshDashboard')
      .addSeparator()
      .addItem('⏰ Install Daily Auto-Trigger (18:30 IST)', 'InstallDailyTrigger')
      .addToUi();
  } catch (e) {
    // SpreadsheetApp.getUi() may fail in headless execution
  }
}

/**
 * Top-level initialization routine
 */
function InitializeProject() {
  SheetManager.initializeSheets();
  Triggers.setupDailyTrigger();
  SheetManager.refreshDashboardSummary();
  SheetManager.log('SUCCESS', 'Init', 'Project initialized successfully. Sheets created, headers styled, and triggers configured.');
}

/**
 * Top-level menu callback: Run Full Sync
 */
function RunFullSync() {
  SyncEngine.syncAll();
}

/**
 * Top-level menu callback: Run Historical 6M Backfill batch
 */
function RunHistoricalBackfill() {
  var res = BackfillEngine.runBackfill();
  if (!res.completed) {
    SheetManager.log('INFO', 'Backfill', 'Batch processed. Remaining: ' + res.remaining + ' dates. Run again or allow trigger to complete.');
  } else {
    SheetManager.log('SUCCESS', 'Backfill', 'Backfill complete.');
  }
}

/**
 * Top-level menu callback: Refresh Dashboard
 */
function RefreshDashboard() {
  SheetManager.refreshDashboardSummary();
}

/**
 * Top-level menu callback: Install Daily Trigger
 */
function InstallDailyTrigger() {
  Triggers.setupDailyTrigger();
}
