/**
 * Main.gs - Master Orchestrator, Self-Healing Initialization & Automated Triggers
 * Author: Quantitative Trading System Architect
 */

/**
 * Creates custom spreadsheet menu on Google Sheet open event.
 */
function onOpen() {
  if (typeof SpreadsheetApp !== "undefined" && SpreadsheetApp.getUi) {
    try {
      var ui = SpreadsheetApp.getUi();
      ui.createMenu("📊 Volume Intelligence")
        .addItem("🚀 Initialize Project", "InitializeProject")
        .addItem("📈 Update NSE Data", "UpdateNSEData")
        .addItem("🏦 Update FII Data", "UpdateFIIData")
        .addItem("🧮 Calculate Indicators", "CalculateIndicators")
        .addItem("📺 Update Dashboard", "UpdateDashboard")
        .addItem("🧪 Run Backtest", "RunBacktest")
        .addSeparator()
        .addItem("🔄 Full Refresh", "FullRefresh")
        .addItem("🔍 Validate Data", "ValidateData")
        .addItem("📋 View System Logs", "ViewSystemLogs")
        .addItem("🛠️ Repair Sheets", "RepairSheets")
        .addSeparator()
        .addItem("⏰ Start Auto Update", "StartAutoUpdate")
        .addItem("🛑 Stop Auto Update", "StopAutoUpdate")
        .addToUi();
    } catch (e) {
      logSystem("WARN", "Main", "UI Menu Creation skipped in headless context: " + e.message, null);
    }
  }
}

/**
 * Self-healing project initialization engine.
 * Automatically creates all 12 required sheets, populates default headers and settings,
 * and builds initial master stock universe.
 */
function InitializeProject() {
  var config = getConfig();
  logSystem("INFO", "Main", "Initializing project self-healing setup...", null);

  if (typeof SpreadsheetApp === "undefined" || !SpreadsheetApp.getActiveSpreadsheet) {
    logSystem("INFO", "Main", "Running in headless / test environment. Initializing default structures.", null);
    return true;
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheetNames = config.SHEETS;

  for (var key in sheetNames) {
    var sName = sheetNames[key];
    var sheet = ss.getSheetByName(sName);

    if (!sheet) {
      sheet = ss.insertSheet(sName);
      logSystem("INFO", "Main", "Created missing sheet tab: " + sName, null);
    }

    // Repair Headers if missing
    var headerDef = config.HEADERS[key];
    if (headerDef && sheet.getLastRow() === 0) {
      sheet.getRange(1, 1, 1, headerDef.length).setValues([headerDef]);
      sheet.getRange(1, 1, 1, headerDef.length).setFontWeight("bold");
      sheet.setFrozenRows(1);
    }
  }

  // Populate Default Settings if empty
  var setSheet = ss.getSheetByName(config.SHEETS.SETTINGS);
  if (setSheet && setSheet.getLastRow() <= 1) {
    writeBatchData(config.SHEETS.SETTINGS, 2, 1, config.DEFAULT_SETTINGS, false);
  }

  // Populate Default Master Stocks if empty
  var masterSheet = ss.getSheetByName(config.SHEETS.MASTER_STOCKS);
  if (masterSheet && masterSheet.getLastRow() <= 1) {
    writeBatchData(config.SHEETS.MASTER_STOCKS, 2, 1, config.DEFAULT_MASTER_STOCKS, false);
  }

  // Remove default 'Sheet1' if present
  var defaultSheet1 = ss.getSheetByName("Sheet1");
  if (defaultSheet1 && ss.getSheets().length > 1) {
    try { ss.deleteSheet(defaultSheet1); } catch(e) {}
  }

  clearSettingsCache();
  logSystem("INFO", "Main", "Project initialization & self-healing complete.", null);
  return true;
}

/**
 * Menu Item Wrapper: Ingestion of NSE Data
 */
function UpdateNSEData() {
  var count = updateNSEDataInSheet();
  logSystem("INFO", "Main", "Updated " + count + " NSE daily records.", null);
}

/**
 * Menu Item Wrapper: Ingestion of FII Data
 */
function UpdateFIIData() {
  var res = updateAllFIIData();
  logSystem("INFO", "Main", "Updated FII data. Market records: " + res.marketRecords + ", Holdings: " + res.stockHoldings, null);
}

/**
 * Menu Item Wrapper: Indicator Calculations
 */
function CalculateIndicators() {
  var results = calculateAllIndicators();
  calculateSectorRotation();
  generateSignalsAndSnapshot();
  logSystem("INFO", "Main", "Calculated indicators for " + results.length + " stocks.", null);
}

/**
 * Menu Item Wrapper: Dashboard Rendering
 */
function UpdateDashboard() {
  renderDashboard();
}

/**
 * Menu Item Wrapper: Quantitative Backtesting
 */
function RunBacktest() {
  runBacktestEngine("Strategy D: Potential Big Money Entry", null, null);
}

/**
 * Menu Item Wrapper: Full System Refresh Pipeline
 */
function FullRefresh() {
  logSystem("INFO", "Main", "Starting Full Refresh Pipeline...", null);
  InitializeProject();
  UpdateNSEData();
  UpdateFIIData();
  CalculateIndicators();
  UpdateDashboard();
  generateSignalsAndSnapshot();
  logSystem("INFO", "Main", "Full Refresh Pipeline finished successfully.", null);
}

/**
 * Menu Item Wrapper: Data Quality Validation
 */
function ValidateData() {
  var config = getConfig();
  var rawData = readBatchData(config.SHEETS.RAW_DAILY);
  var validCount = 0;
  var invalidCount = 0;

  for (var i = 0; i < rawData.length; i++) {
    var res = validateDailyData(rawData[i]);
    if (res.valid) validCount++;
    else invalidCount++;
  }

  logSystem("INFO", "Main", "Data Validation finished. Valid: " + validCount + ", Invalid: " + invalidCount, null);
}

/**
 * Menu Item Wrapper: View System Logs
 */
function ViewSystemLogs() {
  if (typeof SpreadsheetApp !== "undefined" && SpreadsheetApp.getActiveSpreadsheet) {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var logSheet = ss.getSheetByName(getConfig().SHEETS.SYSTEM_LOG);
    if (logSheet) ss.setActiveSheet(logSheet);
  }
}

/**
 * Menu Item Wrapper: Repair Sheets Structure
 */
function RepairSheets() {
  InitializeProject();
}

/**
 * Menu Item Wrapper: Start Automated Time-Driven Triggers
 */
function StartAutoUpdate() {
  StopAutoUpdate(); // Clear existing triggers first
  if (typeof ScriptApp !== "undefined" && ScriptApp.newTrigger) {
    ScriptApp.newTrigger("scheduledUpdateData")
      .timeBased()
      .everyHours(2)
      .create();
    logSystem("INFO", "Main", "Started automated 2-hour update trigger.", null);
  }
}

/**
 * Menu Item Wrapper: Stop Automated Time-Driven Triggers
 */
function StopAutoUpdate() {
  if (typeof ScriptApp !== "undefined" && ScriptApp.getProjectTriggers) {
    var triggers = ScriptApp.getProjectTriggers();
    for (var i = 0; i < triggers.length; i++) {
      if (triggers[i].getHandlerFunction() === "scheduledUpdateData") {
        ScriptApp.deleteTrigger(triggers[i]);
      }
    }
    logSystem("INFO", "Main", "Stopped automated update triggers.", null);
  }
}

/**
 * Headless Execution Entry Point for Automated Time-Driven Triggers
 */
function scheduledUpdateData() {
  logSystem("INFO", "Main", "Executing scheduled automated update...", null);
  try {
    FullRefresh();
  } catch (e) {
    logSystem("ERROR", "Main", "Scheduled update failed: " + e.message, e.stack);
  }
}
