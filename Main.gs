/**
 * Main.gs - Master Orchestrator, Stage-Based Resumable Execution & Execution Metrics
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
        .addItem("🔄 Full Refresh (Resumable Pipeline)", "FullRefresh")
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

    var headerDef = config.HEADERS[key];
    if (headerDef && sheet.getLastRow() === 0) {
      sheet.getRange(1, 1, 1, headerDef.length).setValues([headerDef]);
      sheet.getRange(1, 1, 1, headerDef.length).setFontWeight("bold");
      sheet.setFrozenRows(1);
    }
  }

  var setSheet = ss.getSheetByName(config.SHEETS.SETTINGS);
  if (setSheet && setSheet.getLastRow() <= 1) {
    writeBatchData(config.SHEETS.SETTINGS, 2, 1, config.DEFAULT_SETTINGS, false);
  }

  var masterSheet = ss.getSheetByName(config.SHEETS.MASTER_STOCKS);
  if (masterSheet && masterSheet.getLastRow() <= 1) {
    writeBatchData(config.SHEETS.MASTER_STOCKS, 2, 1, config.DEFAULT_MASTER_STOCKS, false);
  }

  var defaultSheet1 = ss.getSheetByName("Sheet1");
  if (defaultSheet1 && ss.getSheets().length > 1) {
    try { ss.deleteSheet(defaultSheet1); } catch(e) {}
  }

  clearSettingsCache();
  logSystem("INFO", "Main", "Project initialization & self-healing complete.", null);
  return true;
}

/**
 * Core FullRefresh Pipeline:
 * NSE Data -> Calculations -> Sector Engine -> Signal Engine -> Dashboard
 *
 * ARCHITECTURAL DIRECTIVE:
 * Blocking FII network fetching is EXPLICITLY REMOVED from the critical synchronous FullRefresh path.
 * FII enrichment is handled asynchronously/independently via UpdateFIIData() or scheduledFIIUpdate().
 */
function FullRefresh(forceFromStage1) {
  var startTime = new Date().getTime();
  var props = null;
  if (typeof PropertiesService !== "undefined" && PropertiesService.getScriptProperties) {
    props = PropertiesService.getScriptProperties();
  }

  if (forceFromStage1 && props) {
    props.deleteProperty("PIPELINE_LAST_STAGE");
  }

  var currentStage = props ? (props.getProperty("PIPELINE_LAST_STAGE") || "START") : "START";
  logSystem("INFO", "Main", "Starting Full Refresh Pipeline. Current Checkpoint Stage: " + currentStage, null);

  var tIngest = 0, tCalc = 0, tSector = 0, tSignal = 0, tDash = 0;
  var recordsProcessed = 0;
  var stocksProcessed = 0;

  try {
    // Stage 1: System Initialization & Core NSE Daily Data Ingestion
    if (currentStage === "START" || currentStage === "STAGE_1_COMPLETE") {
      var s1 = new Date().getTime();
      InitializeProject();
      recordsProcessed = updateNSEDataInSheet();

      // Log explicit notification regarding FII decoupled architecture
      logSystem("INFO", "FIIData", "FII enrichment skipped from synchronous FullRefresh.", null);
      logSystem("INFO", "FIIData", "Use UpdateFIIData() for independent FII refresh.", null);

      tIngest = new Date().getTime() - s1;

      if (props) props.setProperty("PIPELINE_LAST_STAGE", "STAGE_1_COMPLETE");
      currentStage = "STAGE_1_COMPLETE";
    }

    // Stage 2: Indicator Calculations Engine
    if (currentStage === "STAGE_1_COMPLETE" || currentStage === "STAGE_2_COMPLETE") {
      var s2 = new Date().getTime();
      var calcRes = calculateAllIndicators();
      stocksProcessed = calcRes.length;
      tCalc = new Date().getTime() - s2;

      if (props) props.setProperty("PIPELINE_LAST_STAGE", "STAGE_2_COMPLETE");
      currentStage = "STAGE_2_COMPLETE";
    }

    // Stage 3: Sector Rotation Aggregation
    if (currentStage === "STAGE_2_COMPLETE" || currentStage === "STAGE_3_COMPLETE") {
      var s3 = new Date().getTime();
      calculateSectorRotation();
      tSector = new Date().getTime() - s3;

      if (props) props.setProperty("PIPELINE_LAST_STAGE", "STAGE_3_COMPLETE");
      currentStage = "STAGE_3_COMPLETE";
    }

    // Stage 4: Signal Generation & Snapshot Logging
    if (currentStage === "STAGE_3_COMPLETE" || currentStage === "STAGE_4_COMPLETE") {
      var s4 = new Date().getTime();
      generateSignalsAndSnapshot();
      tSignal = new Date().getTime() - s4;

      if (props) props.setProperty("PIPELINE_LAST_STAGE", "STAGE_4_COMPLETE");
      currentStage = "STAGE_4_COMPLETE";
    }

    // Stage 5: Trader-Centric Dashboard UI Rendering
    if (currentStage === "STAGE_4_COMPLETE") {
      var s5 = new Date().getTime();
      renderDashboard();
      tDash = new Date().getTime() - s5;

      if (props) props.deleteProperty("PIPELINE_LAST_STAGE");
    }

    var totalTime = new Date().getTime() - startTime;

    var perfSummary = {
      totalTimeMs: totalTime,
      ingestTimeMs: tIngest,
      calcTimeMs: tCalc,
      sectorTimeMs: tSector,
      signalTimeMs: tSignal,
      dashTimeMs: tDash,
      recordsProcessed: recordsProcessed,
      stocksProcessed: stocksProcessed
    };

    logSystem("INFO", "Main", "Full Refresh Pipeline Completed Successfully in " + (totalTime / 1000).toFixed(2) + "s", perfSummary);
    return perfSummary;

  } catch (e) {
    logSystem("ERROR", "Main", "Full Refresh Pipeline failed at stage (" + currentStage + "): " + e.message, e.stack);
    throw e;
  }
}

/**
 * Independent FII Refresh Menu Command
 */
function UpdateFIIData() {
  logSystem("INFO", "Main", "Executing independent FII data refresh...", null);
  var res = updateAllFIIData();
  logSystem("INFO", "Main", "Independent FII update completed. Market records: " + res.marketRecords + ", Holdings: " + res.stockHoldings, null);
  return res;
}

/**
 * Dedicated Time-Driven Callback for Background FII Ingestion
 */
function scheduledFIIUpdate() {
  logSystem("INFO", "Main", "Executing scheduled background FII update...", null);
  try {
    UpdateFIIData();
  } catch (e) {
    logSystem("WARN", "Main", "Scheduled background FII update failed safely: " + e.message, null);
  }
}

function UpdateNSEData() {
  var count = updateNSEDataInSheet();
  logSystem("INFO", "Main", "Updated " + count + " NSE daily records.", null);
}

function CalculateIndicators() {
  var results = calculateAllIndicators();
  calculateSectorRotation();
  generateSignalsAndSnapshot();
  logSystem("INFO", "Main", "Calculated indicators for " + results.length + " stocks.", null);
}

function UpdateDashboard() {
  renderDashboard();
}

function RunBacktest() {
  runBacktestEngine("Strategy D: Potential Big Money Entry", null, null);
}

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

function ViewSystemLogs() {
  if (typeof SpreadsheetApp !== "undefined" && SpreadsheetApp.getActiveSpreadsheet) {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var logSheet = ss.getSheetByName(getConfig().SHEETS.SYSTEM_LOG);
    if (logSheet) ss.setActiveSheet(logSheet);
  }
}

function RepairSheets() {
  InitializeProject();
}

function StartAutoUpdate() {
  StopAutoUpdate();
  if (typeof ScriptApp !== "undefined" && ScriptApp.newTrigger) {
    ScriptApp.newTrigger("scheduledUpdateData")
      .timeBased()
      .everyHours(2)
      .create();

    // Optional independent daily FII background trigger
    ScriptApp.newTrigger("scheduledFIIUpdate")
      .timeBased()
      .everyDays(1)
      .atHour(18)
      .create();

    logSystem("INFO", "Main", "Started automated triggers: 2-hour NSE pipeline & daily 6 PM FII update.", null);
  }
}

function StopAutoUpdate() {
  if (typeof ScriptApp !== "undefined" && ScriptApp.getProjectTriggers) {
    var triggers = ScriptApp.getProjectTriggers();
    for (var i = 0; i < triggers.length; i++) {
      var handler = triggers[i].getHandlerFunction();
      if (handler === "scheduledUpdateData" || handler === "scheduledFIIUpdate") {
        ScriptApp.deleteTrigger(triggers[i]);
      }
    }
    logSystem("INFO", "Main", "Stopped automated update triggers.", null);
  }
}

function scheduledUpdateData() {
  logSystem("INFO", "Main", "Executing scheduled automated update...", null);
  try {
    FullRefresh(false);
  } catch (e) {
    logSystem("ERROR", "Main", "Scheduled update failed: " + e.message, e.stack);
  }
}
