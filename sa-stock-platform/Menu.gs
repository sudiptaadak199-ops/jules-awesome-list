/**
 * SA Stock Research & Backtest Platform - Phase 1 (Foundation)
 *
 * Dynamic Custom Spreadsheet Menu and UI Core Module
 *
 * Dynamically constructs UI menus from Config parameters without hardcoding.
 * Exposes the exact InitializeProject() global function to complete authorization and auto-setup in one click.
 */

/**
 * Triggered automatically when the spreadsheet is opened.
 * Builds and mounts the menu bar.
 */
function onOpen() {
  var ui = SpreadsheetApp.getUi();
  var menuConfig = Config.MENU;
  var menu = ui.createMenu(menuConfig.MAIN_TITLE);

  for (var i = 0; i < menuConfig.ITEMS.length; i++) {
    var item = menuConfig.ITEMS[i];
    if (item.separator) {
      menu.addSeparator();
    } else {
      menu.addItem(item.name, item.method);
    }
  }

  menu.addToUi();
}

/**
 * Enterprise Initializer & Auto-Repair Routine.
 * Setup and validation are fully handled automatically.
 */
function InitializeProject() {
  try {
    MainOrchestrator.initializeProject();

    try {
      SpreadsheetApp.getUi().alert(
        "Initialization Complete",
        "SA Platform has successfully validated and structured your database!\n\n" +
        "• Created and styled all required sheets with Cool Tech headers.\n" +
        "• Configured baseline default settings.\n" +
        "• Set up system logging and transaction caches.\n\n" +
        "Please reload your browser tab to refresh active menus.",
        SpreadsheetApp.getUi().ButtonSet.OK
      );
    } catch (uiErr) {
      console.log("InitializeProject run success. Database sheets initialized and formatted with defaults.");
    }
  } catch (e) {
    ErrorHandler.displayUserAlert("Project Initialization", e);
  }
}

/**
 * Menu wrapper to execute stock data updates.
 */
function triggerUpdateData() {
  try {
    MainOrchestrator.updateData();
    SpreadsheetApp.getUi().alert("Data Update Complete", "Synchronized all active master equities successfully.", SpreadsheetApp.getUi().ButtonSet.OK);
  } catch (e) {
    ErrorHandler.displayUserAlert("Data Update Engine", e);
  }
}

/**
 * Menu wrapper to execute sector rotation analysis.
 */
function triggerRunSectorAnalysis() {
  try {
    MainOrchestrator.runSectorAnalysis();
    SpreadsheetApp.getUi().alert("Sector Analysis Complete", "Executed sector rotation analysis successfully and updated Dashboard.", SpreadsheetApp.getUi().ButtonSet.OK);
  } catch (e) {
    ErrorHandler.displayUserAlert("Sector Rotation Engine", e);
  }
}

/**
 * Menu wrapper to execute backtesting analysis.
 */
function triggerRunBacktest() {
  try {
    MainOrchestrator.runBacktest();
    SpreadsheetApp.getUi().alert("Backtest Successful", "Executed backtest simulation (Phase 1 Placeholder run). Checked Logs.", SpreadsheetApp.getUi().ButtonSet.OK);
  } catch (e) {
    ErrorHandler.displayUserAlert("Strategy Engine Backtest", e);
  }
}

/**
 * Menu wrapper to generate analysis report compilations.
 */
function triggerGenerateReport() {
  try {
    MainOrchestrator.generateReport();
    SpreadsheetApp.getUi().alert("Reports Generated", "Analytical performance metrics suite appended successfully to Reports.", SpreadsheetApp.getUi().ButtonSet.OK);
  } catch (e) {
    ErrorHandler.displayUserAlert("Report Engine Compilation", e);
  }
}

/**
 * Redirects UI focus straight to the System Settings sheet tab.
 */
function triggerConfigureSettings() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(Config.SHEETS.SETTINGS);
  if (sheet) {
    ss.setActiveSheet(sheet);
  } else {
    SpreadsheetApp.getUi().alert("System Error", "Settings sheet is missing. Please run Initialize Project to restore.", SpreadsheetApp.getUi().ButtonSet.OK);
  }
}

/**
 * Redirects UI focus straight to the System Logs sheet tab.
 */
function triggerViewLogs() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(Config.SHEETS.LOGS);
  if (sheet) {
    ss.setActiveSheet(sheet);
  } else {
    SpreadsheetApp.getUi().alert("System Error", "Logs sheet is missing. Please run Initialize Project to restore.", SpreadsheetApp.getUi().ButtonSet.OK);
  }
}
