/**
 * SA Stock Research & Backtest Platform - Phase 1 (Foundation)
 *
 * Custom Menus and UI Module
 *
 * Sets up custom menus in the Google Sheet UI, binding platform commands to script entry points.
 */

/**
 * Triggered automatically when the spreadsheet is opened.
 * Dynamically builds and mounts the professional 'SA Platform' menu interface.
 */
function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu("SA Platform")
    .addItem("Initialize Project", "triggerInitializeProject")
    .addSeparator()
    .addItem("Update Data", "triggerUpdateData")
    .addItem("Run Backtest (Placeholder)", "triggerRunBacktest")
    .addItem("Generate Report (Placeholder)", "triggerGenerateReport")
    .addSeparator()
    .addItem("Configure Settings", "triggerConfigureSettings")
    .addItem("View Logs", "triggerViewLogs")
    .addToUi();
}

/**
 * Custom UI button or action callback to initialize database sheets.
 */
function triggerInitializeProject() {
  try {
    MainOrchestrator.initializeProject();
    SpreadsheetApp.getUi().alert("SA Stock Research Platform: Initialization Successful!\nAll required sheets created, styled, and loaded with defaults.");
  } catch (e) {
    SpreadsheetApp.getUi().alert("Error during project initialization:\n" + e.message);
  }
}

/**
 * Custom UI button callback to execute data updating sequence.
 */
function triggerUpdateData() {
  try {
    MainOrchestrator.updateData();
    SpreadsheetApp.getUi().alert("Data Update Completed! Check 'Logs' and 'Historical Data' sheets for records.");
  } catch (e) {
    SpreadsheetApp.getUi().alert("Error during data update:\n" + e.message);
  }
}

/**
 * Custom UI callback for backtesting simulation.
 */
function triggerRunBacktest() {
  try {
    MainOrchestrator.runBacktest();
    SpreadsheetApp.getUi().alert("Backtest completed (Phase 1 Placeholder run). See logs.");
  } catch (e) {
    SpreadsheetApp.getUi().alert("Error during backtest:\n" + e.message);
  }
}

/**
 * Custom UI callback for report compilation.
 */
function triggerGenerateReport() {
  try {
    MainOrchestrator.generateReport();
    SpreadsheetApp.getUi().alert("Report generation complete (Phase 1 Placeholder run). New report appended to 'Reports'.");
  } catch (e) {
    SpreadsheetApp.getUi().alert("Error during report generation:\n" + e.message);
  }
}

/**
 * Utility to redirect user focus to the settings sheet.
 */
function triggerConfigureSettings() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(Config.SHEETS.SETTINGS);
  if (sheet) {
    ss.setActiveSheet(sheet);
  } else {
    SpreadsheetApp.getUi().alert("Settings sheet not initialized. Run 'Initialize Project' first.");
  }
}

/**
 * Utility to redirect user focus to the execution logs sheet.
 */
function triggerViewLogs() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(Config.SHEETS.LOGS);
  if (sheet) {
    ss.setActiveSheet(sheet);
  } else {
    SpreadsheetApp.getUi().alert("Logs sheet not initialized. Run 'Initialize Project' first.");
  }
}
