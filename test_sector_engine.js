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

// Generate Mock Historical Data (60 Days for each stock + NIFTY)
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

// Generate rich mock timeline inside Sector History
// We populate 6 days of history backwards (Day -1, Day -2, Day -3, Day -4, Day -5, Day -6)
const sHistSheet = ss.insertSheet("Sector History");
sHistSheet.values = [
  ["Date", "Sector Name", "Sector Score", "Rank", "Current Stage", "Money Inflow", "Sector Breadth (%)", "RS vs Nifty (%)", "Generated Alerts"],

  // Day -6 (oldest)
  ["2026-08-01", "Energy", "50.0", "1", "OUTFLOW", "❄️ FLAT/OUT (50 | RVOL=0.90)", "50.0", "0.0", "None"],
  ["2026-08-01", "Technology", "40.0", "2", "OUTFLOW", "❄️ FLAT/OUT (40 | RVOL=0.80)", "50.0", "0.0", "None"],

  // Day -5
  ["2026-08-02", "Energy", "51.0", "1", "OUTFLOW", "❄️ FLAT/OUT (52 | RVOL=0.95)", "50.0", "0.5", "None"],
  ["2026-08-02", "Technology", "40.5", "2", "OUTFLOW", "❄️ FLAT/OUT (41 | RVOL=0.81)", "50.0", "-0.1", "None"],

  // Day -4
  ["2026-08-03", "Energy", "52.0", "1", "BOTTOMING", "❄️ FLAT/OUT (55 | RVOL=1.00)", "50.0", "1.0", "None"],
  ["2026-08-03", "Technology", "41.0", "2", "OUTFLOW", "❄️ FLAT/OUT (42 | RVOL=0.82)", "50.0", "-0.2", "None"],

  // Day -3
  ["2026-08-04", "Energy", "53.0", "1", "BOTTOMING", "❄️ FLAT/OUT (60 | RVOL=1.10)", "50.0", "1.5", "None"],
  ["2026-08-04", "Technology", "41.5", "2", "OUTFLOW", "❄️ FLAT/OUT (43 | RVOL=0.83)", "50.0", "-0.3", "None"],

  // Day -2
  ["2026-08-05", "Energy", "54.0", "1", "LEADING", "⚠️ RISING (65 | RVOL=1.15)", "100.0", "2.0", "None"],
  ["2026-08-05", "Technology", "42.0", "2", "BOTTOMING", "❄️ FLAT/OUT (44 | RVOL=0.84)", "50.0", "-0.4", "None"],

  // Day -1 (yesterday)
  ["2026-08-06", "Energy", "55.0", "1", "LEADING", "🔥 STRONG (70 | RVOL=1.20)", "100.0", "2.5", "None"],
  ["2026-08-06", "Technology", "42.5", "2", "BOTTOMING", "❄️ FLAT/OUT (45 | RVOL=0.85)", "50.0", "-0.5", "None"]
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

console.log('--- RUNNING UPGRADED SECTOR PIPELINE ---');
SectorEngine.runSectorPipeline(monitorStats);
console.log('--- PIPELINE EXECUTION COMPLETED ---');

// Validate results
console.log('\n--- UPGRADED DETAILED SECTOR METRICS & MULTI-PERIOD CHANGES ---');
for (const sector of capturedSectorsList) {
  console.log(`Sector: ${sector.name}`);
  console.log(`  Sector Money Score: ${sector.score.toFixed(2)}`);
  console.log(`  New Money Inflow Proxy Score: ${sector.moneyInflowScore.toFixed(2)}`);

  console.log(`  1D Inflow Change: ${sector.inflowChg1D.toFixed(2)} (Expected vs Day-1)`);
  console.log(`  3D Inflow Change: ${sector.inflowChg3D.toFixed(2)} (Expected vs Day-3)`);
  console.log(`  5D Inflow Change: ${sector.inflowChg5D.toFixed(2)} (Expected vs Day-5)`);

  console.log(`  1D Breadth Change: ${sector.breadthChg1D.toFixed(2)}%`);
  console.log(`  3D Breadth Change: ${sector.breadthChg3D.toFixed(2)}%`);
  console.log(`  5D Breadth Change: ${sector.breadthChg5D.toFixed(2)}%`);

  console.log(`  1D RVOL Change: ${sector.rvolChg1D.toFixed(4)}`);
  console.log(`  3D RVOL Change: ${sector.rvolChg3D.toFixed(4)}`);
  console.log(`  5D RVOL Change: ${sector.rvolChg5D.toFixed(4)}`);

  console.log(`  Capital Rotation Stage: ${sector.stage}`);
}

// Assertions to verify multi-period change mathematics
const energySector = capturedSectorsList.find(s => s.name === 'Energy');
const techSector = capturedSectorsList.find(s => s.name === 'Technology');

console.log('\n--- ASSERTING MULTI-PERIOD CHANGE ACCURACY ---');
if (energySector) {
  // Let's assert:
  // 1D Inflow Change: s.moneyInflowScore - Day-1 (which was 70.0)
  const expected1D = energySector.moneyInflowScore - 70.0;
  const actual1D = energySector.inflowChg1D;
  console.log(`Energy 1D Inflow Change: expected ${expected1D.toFixed(4)} | actual ${actual1D.toFixed(4)}`);
  if (Math.abs(expected1D - actual1D) < 0.0001) {
    console.log('✅ Energy 1D Change Assert Passed!');
  } else {
    console.error('❌ Energy 1D Change Assert Failed!');
    process.exit(1);
  }

  // 3D Inflow Change: s.moneyInflowScore - Day-3 (which was 60.0)
  const expected3D = energySector.moneyInflowScore - 60.0;
  const actual3D = energySector.inflowChg3D;
  console.log(`Energy 3D Inflow Change: expected ${expected3D.toFixed(4)} | actual ${actual3D.toFixed(4)}`);
  if (Math.abs(expected3D - actual3D) < 0.0001) {
    console.log('✅ Energy 3D Change Assert Passed!');
  } else {
    console.error('❌ Energy 3D Change Assert Failed!');
    process.exit(1);
  }

  // 5D Inflow Change: s.moneyInflowScore - Day-5 (which was 52.0)
  const expected5D = energySector.moneyInflowScore - 52.0;
  const actual5D = energySector.inflowChg5D;
  console.log(`Energy 5D Inflow Change: expected ${expected5D.toFixed(4)} | actual ${actual5D.toFixed(4)}`);
  if (Math.abs(expected5D - actual5D) < 0.0001) {
    console.log('✅ Energy 5D Change Assert Passed!');
  } else {
    console.error('❌ Energy 5D Change Assert Failed!');
    process.exit(1);
  }
}

if (techSector) {
  // 1D Inflow Change: s.moneyInflowScore - Day-1 (which was 45.0)
  const expected1D = techSector.moneyInflowScore - 45.0;
  const actual1D = techSector.inflowChg1D;
  console.log(`Technology 1D Inflow Change: expected ${expected1D.toFixed(4)} | actual ${actual1D.toFixed(4)}`);
  if (Math.abs(expected1D - actual1D) < 0.0001) {
    console.log('✅ Technology 1D Change Assert Passed!');
  } else {
    console.error('❌ Technology 1D Change Assert Failed!');
    process.exit(1);
  }

  // 3D Inflow Change: s.moneyInflowScore - Day-3 (which was 43.0)
  const expected3D = techSector.moneyInflowScore - 43.0;
  const actual3D = techSector.inflowChg3D;
  console.log(`Technology 3D Inflow Change: expected ${expected3D.toFixed(4)} | actual ${actual3D.toFixed(4)}`);
  if (Math.abs(expected3D - actual3D) < 0.0001) {
    console.log('✅ Technology 3D Change Assert Passed!');
  } else {
    console.error('❌ Technology 3D Change Assert Failed!');
    process.exit(1);
  }

  // 5D Inflow Change: s.moneyInflowScore - Day-5 (which was 41.0)
  const expected5D = techSector.moneyInflowScore - 41.0;
  const actual5D = techSector.inflowChg5D;
  console.log(`Technology 5D Inflow Change: expected ${expected5D.toFixed(4)} | actual ${actual5D.toFixed(4)}`);
  if (Math.abs(expected5D - actual5D) < 0.0001) {
    console.log('✅ Technology 5D Change Assert Passed!');
  } else {
    console.error('❌ Technology 5D Change Assert Failed!');
    process.exit(1);
  }
}

console.log('\nSUCCESS: Upgraded Sector Rotation Engine test passed flawlessly!');
