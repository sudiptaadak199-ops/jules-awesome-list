const fs = require('fs');

// 1. Mock Google Apps Script Global Context
global.Logger = {
  log: (...args) => console.log('[GAS Logger]', ...args),
  init: () => {},
  success: () => {},
  warning: () => {},
  error: () => {},
  flush: () => {}
};

global.Utilities = {
  sleep: (ms) => {}
};

global.CacheService = {
  getScriptCache: () => ({
    get: () => null,
    put: () => {}
  })
};

// Mock ScriptApp
global.ScriptApp = {
  getProjectTriggers: () => [],
  newTrigger: () => ({
    timeBased: () => ({
      everyDays: () => ({
        atHour: () => ({
          create: () => {}
        })
      })
    })
  })
};

// Mock Utilities/SpreadsheetApp
class MockRange {
  constructor(values = [[]]) {
    this.values = values;
  }
  getValues() {
    return this.values;
  }
  setValues(vals) {
    this.values = vals;
    return this;
  }
  merge() { return this; }
  setValue() { return this; }
  setBackground() { return this; }
  setFontColor() { return this; }
  setFontWeight() { return this; }
  setFontFamily() { return this; }
  setFontSize() { return this; }
  setFontStyle() { return this; }
  setHorizontalAlignment() { return this; }
  setVerticalAlignment() { return this; }
  setWrap() { return this; }
  setBorder() { return this; }
  clearContent() { return this; }
}

class MockSheet {
  constructor(name, values = []) {
    this.name = name;
    this.values = values;
    this.frozenRows = 0;
    this.gridlines = true;
    this.columnWidths = {};
    this.rowHeights = {};
  }
  getLastRow() {
    return this.values.length;
  }
  getLastColumn() {
    return this.values[0] ? this.values[0].length : 0;
  }
  getRange(row, col, numRows, numCols) {
    const startRow = row - 1;
    const startCol = col - 1;
    const endRow = numRows ? startRow + numRows : this.values.length;
    const endCol = numCols ? startCol + numCols : (this.values[0] ? this.values[0].length : 0);

    const sliced = [];
    for (let r = startRow; r < endRow; r++) {
      const rowArr = this.values[r] || [];
      const colArr = [];
      for (let c = startCol; c < endCol; c++) {
        colArr.push(rowArr[c] !== undefined ? rowArr[c] : "");
      }
      sliced.push(colArr);
    }
    return new MockRange(sliced);
  }
  clear() {}
  setGridlines(g) { this.gridlines = g; }
  setFrozenRows(fr) { this.frozenRows = fr; }
  setColumnWidth(col, width) { this.columnWidths[col] = width; }
  setRowHeight(row, height) { this.rowHeights[row] = height; }
  appendRow(row) {
    this.values.push(row);
  }
  deleteRow(idx) {
    this.values.splice(idx - 1, 1);
  }
}

class MockSpreadsheet {
  constructor() {
    this.sheets = {};
  }
  getSheetByName(name) {
    return this.sheets[name] || null;
  }
  insertSheet(name) {
    const s = new MockSheet(name);
    this.sheets[name] = s;
    return s;
  }
}

global.SpreadsheetApp = {
  getActiveSpreadsheet: () => global.activeSpreadsheet,
  BorderStyle: { SOLID: 'SOLID' }
};

// 2. Load and Concatenate GAS Source Files (evaluating them in node global context)
const gsFiles = [
  'Config.gs',
  'Utilities.gs',
  'Settings.gs',
  'Cache.gs',
  'SheetManager.gs',
  'DataProvider.gs',
  'SectorEngine.gs',
  'Main.gs'
];

let sourceCode = '';
for (const file of gsFiles) {
  sourceCode += fs.readFileSync('sa-stock-platform/' + file, 'utf8') + '\n';
}

// Convert "var Config =" to "global.Config ="
sourceCode = sourceCode.replace('var Config =', 'global.Config =');

// Append global bindings so the evaluated classes are placed into the node global context
sourceCode += `
global.PlatformUtils = PlatformUtils;
global.Settings = Settings;
global.Cache = Cache;
global.SheetManager = SheetManager;
global.DataProvider = DataProvider;
global.SectorEngine = SectorEngine;
global.MainOrchestrator = MainOrchestrator;
`;

// Evaluate the code in global context
eval(sourceCode);

// Intercept Sectors List during pipeline execution
const originalRenderDashboardLayout = SectorEngine.renderDashboardLayout;
let capturedSectorsList = null;
SectorEngine.renderDashboardLayout = function(sectorsList, activeAlerts, monitorStats) {
  capturedSectorsList = sectorsList;
  return originalRenderDashboardLayout.call(this, sectorsList, activeAlerts, monitorStats);
};

// 3. Prepare Mock Spreadsheet and Run Pipeline
const ss = new MockSpreadsheet();
global.activeSpreadsheet = ss;

// Create required sheet structures with mock data
const stockMasterValues = [
  ["Stock Symbol", "Company Name", "Exchange", "Sector", "Industry", "Status", "Last Processed", "Added Date"],
  ["RELIANCE", "Reliance Industries Ltd.", "NSE", "Energy", "Oil & Gas", "Active", "", "2024-01-01"],
  ["ONGC", "Oil and Natural Gas Corp.", "NSE", "Energy", "Oil & Gas", "Active", "", "2024-01-01"],
  ["TCS", "Tata Consultancy Services Ltd.", "NSE", "Technology", "IT Services", "Active", "", "2024-01-01"],
  ["INFY", "Infosys Ltd.", "NSE", "Technology", "IT Services", "Active", "", "2024-01-01"]
];
ss.insertSheet("Stock Master").values = stockMasterValues;

// Generate Mock Historical Data (50 Days for each stock + NIFTY)
const histSheet = ss.insertSheet("Historical Data");
histSheet.values = [
  ["Symbol", "Date", "Open", "High", "Low", "Close", "Adj Close", "Volume", "Source", "Updated At"]
];

const symbols = ["RELIANCE", "ONGC", "TCS", "INFY", "NIFTY"];
const now = new Date();

for (let d = 60; d >= 1; d--) {
  const dateObj = new Date(now.getTime() - d * 24 * 60 * 60 * 1000);
  const dateStr = PlatformUtils.formatDate(dateObj);
  for (const sym of symbols) {
    const base = sym === "NIFTY" ? 22000 : 1000;
    const closePrice = base * (1 + (Math.sin(d) * 0.02));
    histSheet.appendRow([
      sym,
      dateStr,
      closePrice - 2,
      closePrice + 5,
      closePrice - 5,
      closePrice,
      closePrice,
      500000 + Math.round(Math.random() * 100000),
      "MOCK",
      new Date()
    ]);
  }
}

// Add a dummy Sector History to simulate previous runs
const sHistSheet = ss.insertSheet("Sector History");
sHistSheet.values = [
  ["Date", "Sector Name", "Sector Score", "Rank", "Current Stage", "Money Inflow", "Sector Breadth (%)", "RS vs Nifty (%)", "Generated Alerts"],
  ["2026-08-01", "Energy", "55.0", "1", "LEADING", "🔥 STRONG (75 | RVOL=1.25)", "100.0", "2.5", "None"],
  ["2026-08-01", "Technology", "42.0", "2", "BOTTOMING", "❄️ FLAT/OUT (35 | RVOL=0.85)", "0.0", "-4.5", "None"]
];

// Initialize Settings
Settings.init();

// Mock Monitor Stats
const monitorStats = {
  executionTime: 0,
  stocksProcessed: 0,
  sectorsProcessed: 0,
  dataRowsUpdated: 0,
  apiRequests: 0,
  failedRequests: 0
};

console.log('--- RUNNING SECTOR PIPELINE SIMULATION ---');
SectorEngine.runSectorPipeline(monitorStats);
console.log('--- PIPELINE EXECUTION COMPLETED ---');

// Validate results
console.log('\n--- DETAILED SECTOR METRICS & CHANGES ---');
for (const sector of capturedSectorsList) {
  console.log(`Sector: ${sector.name}`);
  console.log(`  Score: ${sector.score.toFixed(2)}`);
  console.log(`  Money Inflow Score: ${sector.moneyInflowScore.toFixed(2)}`);
  console.log(`  Money Score Change: ${sector.moneyScoreChange.toFixed(2)}`);
  console.log(`  RVOL Change: ${sector.rvolChange.toFixed(4)}`);
  console.log(`  Breadth Change: ${sector.breadthChange.toFixed(2)}%`);
  console.log(`  Rank Change: ${sector.rankChange}`);
  console.log(`  Stage: ${sector.stage}`);
}

// Assertions to check that previous values were parsed correctly (meaning, moneyScoreChange is not just using a 50.0 fallback)
const energySector = capturedSectorsList.find(s => s.name === 'Energy');
const techSector = capturedSectorsList.find(s => s.name === 'Technology');

// Since the mock historical value for Energy is 75 and for Tech is 35, let's verify if they were subtracted correctly:
console.log('\n--- ASSERTING REGEX ACCURACY ---');
if (energySector) {
  const expectedChange = energySector.moneyInflowScore - 75.0;
  const actualChange = energySector.moneyScoreChange;
  console.log(`Energy expected change (vs 75.0): ${expectedChange.toFixed(4)} | Actual change: ${actualChange.toFixed(4)}`);
  if (Math.abs(expectedChange - actualChange) < 0.0001) {
    console.log('✅ Energy Inflow Score Change correctly computed from parsed history (not defaulting to 50.0)!');
  } else {
    console.error('❌ Regex parse failed: Energy change is not matched!');
    process.exit(1);
  }
}

if (techSector) {
  const expectedChange = techSector.moneyInflowScore - 35.0;
  const actualChange = techSector.moneyScoreChange;
  console.log(`Technology expected change (vs 35.0): ${expectedChange.toFixed(4)} | Actual change: ${actualChange.toFixed(4)}`);
  if (Math.abs(expectedChange - actualChange) < 0.0001) {
    console.log('✅ Technology Inflow Score Change correctly computed from parsed history (not defaulting to 50.0)!');
  } else {
    console.error('❌ Regex parse failed: Technology change is not matched!');
    process.exit(1);
  }
}

console.log('\nSUCCESS: All assertions passed completely!');
