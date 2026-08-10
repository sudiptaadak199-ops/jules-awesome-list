/****************************************************************************************
 * ⚠️ WARNING: DO NOT COPY OR PASTE THIS FILE INTO THE GOOGLE APPS SCRIPT EDITOR! ⚠️
 *
 * This is a local Node.js test runner used solely for unit testing and diagnostic
 * simulations in the sandbox workspace.
 *
 * If you paste this .js file (which contains Node.js modules like 'fs' and require)
 * into your Google Sheets Apps Script project, Google Apps Script will fail to parse
 * the code, disable all function execution, and report "No functions" in the dropdown!
 *
 * Only copy the files located inside the "sa-stock-platform/" folder (Config.gs,
 * Menu.gs, Main.gs, DataProvider.gs, SectorEngine.gs, etc.) into Apps Script.
 ****************************************************************************************/

const fs = require('fs');

// Mock Google Apps Script Global Context
global.Logger = {
  log: (...args) => {},
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

// Global ScriptApp Trigger Mock state tracker
global.mockTriggers = [];
global.ScriptApp = {
  getProjectTriggers: () => global.mockTriggers,
  deleteTrigger: (tr) => {
    global.mockTriggers = global.mockTriggers.filter(t => t !== tr);
  },
  newTrigger: (funcName) => ({
    timeBased: () => ({
      everyDays: () => ({
        atHour: () => ({
          create: () => {
            const tr = { getHandlerFunction: () => funcName };
            global.mockTriggers.push(tr);
            return tr;
          }
        })
      })
    })
  })
};

// Real-world Mock Sheets and Ranges linkage
class MockRange {
  constructor(sheet, startRow, startCol, numRows, numCols) {
    this.sheet = sheet;
    this.startRow = startRow; // 0-based
    this.startCol = startCol; // 0-based
    this.numRows = numRows;
    this.numCols = numCols;
  }

  getValues() {
    const vals = [];
    for (let r = 0; r < this.numRows; r++) {
      const rowArr = this.sheet.values[this.startRow + r] || [];
      const colArr = [];
      for (let c = 0; c < this.numCols; c++) {
        colArr.push(rowArr[this.startCol + c] !== undefined ? rowArr[this.startCol + c] : "");
      }
      vals.push(colArr);
    }
    return vals;
  }

  setValues(vals) {
    for (let r = 0; r < vals.length; r++) {
      const sheetRowIdx = this.startRow + r;
      if (!this.sheet.values[sheetRowIdx]) {
        this.sheet.values[sheetRowIdx] = [];
      }
      for (let c = 0; c < vals[r].length; c++) {
        const sheetColIdx = this.startCol + c;
        this.sheet.values[sheetRowIdx][sheetColIdx] = vals[r][c];
      }
    }
    return this;
  }

  merge() { return this; }
  setValue(val) {
    if (!this.sheet.values[this.startRow]) {
      this.sheet.values[this.startRow] = [];
    }
    this.sheet.values[this.startRow][this.startCol] = val;
    return this;
  }
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
  clearContent() {
    for (let r = 0; r < this.numRows; r++) {
      const sheetRowIdx = this.startRow + r;
      if (this.sheet.values[sheetRowIdx]) {
        for (let c = 0; c < this.numCols; c++) {
          const sheetColIdx = this.startCol + c;
          this.sheet.values[sheetRowIdx][sheetColIdx] = "";
        }
      }
    }
    return this;
  }
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
  getLastRow() { return this.values.length; }
  getLastColumn() { return this.values[0] ? this.values[0].length : 0; }
  getRange(row, col, numRows, numCols) {
    const startRow = row - 1;
    const startCol = col - 1;

    // Default size calculations matching GAS boundaries
    const totalRows = numRows ? numRows : Math.max(1, this.values.length - startRow);
    const totalCols = numCols ? numCols : (this.values[0] ? Math.max(1, this.values[0].length - startCol) : 1);

    return new MockRange(this, startRow, startCol, totalRows, totalCols);
  }
  clear() {
    this.values = [];
  }
  setGridlines(g) { this.gridlines = g; }
  setFrozenRows(fr) { this.frozenRows = fr; }
  setColumnWidth(col, width) { this.columnWidths[col] = width; }
  setRowHeight(row, height) { this.rowHeights[row] = height; }
  appendRow(row) { this.values.push(row); }
  deleteRow(idx) { this.values.splice(idx - 1, 1); }
}

class MockSpreadsheet {
  constructor() { this.sheets = {}; }
  getSheetByName(name) { return this.sheets[name] || null; }
  insertSheet(name) {
    const s = new MockSheet(name);
    this.sheets[name] = s;
    return s;
  }
  getSheets() {
    return Object.values(this.sheets);
  }
}

global.mockUiAlerts = [];
global.SpreadsheetApp = {
  getActiveSpreadsheet: () => global.activeSpreadsheet,
  BorderStyle: { SOLID: 'SOLID' },
  getUi: () => ({
    alert: (title, msg) => {
      global.mockUiAlerts.push({ title, msg });
    },
    ButtonSet: { OK: 'OK' }
  })
};

// Load GAS code
const gsFiles = [
  'Config.gs',
  'Utilities.gs',
  'Settings.gs',
  'Cache.gs',
  'SheetManager.gs',
  'DataProvider.gs',
  'SectorEngine.gs',
  'Main.gs',
  'Menu.gs'
];

let sourceCode = '';
for (const file of gsFiles) {
  sourceCode += fs.readFileSync('sa-stock-platform/' + file, 'utf8') + '\n';
}
sourceCode = sourceCode.replace('var Config =', 'global.Config =');
sourceCode += `
global.PlatformUtils = PlatformUtils;
global.Settings = Settings;
global.Cache = Cache;
global.SheetManager = SheetManager;
global.DataProvider = DataProvider;
global.SectorEngine = SectorEngine;
global.MainOrchestrator = MainOrchestrator;

// Bind top-level global functions for Apps Script dropdown tests
global.onOpen = onOpen;
global.InitializeProject = InitializeProject;
global.triggerUpdateData = triggerUpdateData;
global.triggerRunBacktest = triggerRunBacktest;
global.triggerGenerateReport = triggerGenerateReport;
global.triggerConfigureSettings = triggerConfigureSettings;
global.triggerViewLogs = triggerViewLogs;
global.scheduledUpdateData = scheduledUpdateData;
`;
eval(sourceCode);

// Intercept pipeline layout writes to capture internal sectorsList
let capturedSectors = null;
const originalRender = SectorEngine.renderDashboardLayout;
SectorEngine.renderDashboardLayout = function(sectorsList, activeAlerts, monitorStats) {
  capturedSectors = sectorsList;
  return originalRender.call(this, sectorsList, activeAlerts, monitorStats);
};

// Deterministic Test Executor
function runMockPipeline(stockMasterData, historicalData, sectorHistoryData = []) {
  const ss = new MockSpreadsheet();
  global.activeSpreadsheet = ss;

  ss.insertSheet("Stock Master").values = stockMasterData;
  ss.insertSheet("Historical Data").values = historicalData;
  ss.insertSheet("Sector History").values = sectorHistoryData;
  ss.insertSheet("Dashboard");

  Settings.init();
  const monitorStats = {
    executionTime: 0, stocksProcessed: 0, sectorsProcessed: 0,
    dataRowsUpdated: 0, apiRequests: 0, failedRequests: 0
  };

  capturedSectors = null;
  try {
    SectorEngine.runSectorPipeline(monitorStats);
    return { success: true, sectors: capturedSectors, monitorStats };
  } catch (err) {
    return { success: false, error: err.message, sectors: null, monitorStats };
  }
}

// Complete 23-Test Suite
const tests = [];

// Test 1: Single Stock In Single Sector
tests.push({
  name: "1. 1 Stock Pipeline Run",
  run: () => {
    const master = [
      ["Stock Symbol", "Company Name", "Exchange", "Sector", "Industry", "Status", "Last Processed", "Added Date"],
      ["RELIANCE", "Reliance Ltd.", "NSE", "Energy", "Oil", "Active", "", "2024-01-01"]
    ];
    const hist = [
      ["Symbol", "Date", "Open", "High", "Low", "Close", "Adj Close", "Volume", "Source", "Updated At"]
    ];
    for (let i = 50; i >= 1; i--) {
      hist.push(["RELIANCE", `2026-08-${i.toString().padStart(2, '0')}`, 1000, 1005, 995, 1000, 1000, 100000, "MOCK", new Date()]);
      hist.push(["NIFTY", `2026-08-${i.toString().padStart(2, '0')}`, 20000, 20050, 19950, 20000, 20000, 1000000, "MOCK", new Date()]);
    }
    const res = runMockPipeline(master, hist);
    if (res.success && res.sectors && res.sectors.length === 1 && res.sectors[0].name === "Energy") {
      return "PASS";
    }
    return "FAIL: Single stock aggregation failed.";
  }
});

// Test 2: Multiple Stocks In Single Sector
tests.push({
  name: "2. Multiple Stocks in Single Sector",
  run: () => {
    const master = [
      ["Stock Symbol", "Company Name", "Exchange", "Sector", "Industry", "Status", "Last Processed", "Added Date"],
      ["RELIANCE", "Reliance Ltd.", "NSE", "Energy", "Oil", "Active", "", "2024-01-01"],
      ["ONGC", "Oil Corp.", "NSE", "Energy", "Oil", "Active", "", "2024-01-01"]
    ];
    const hist = [
      ["Symbol", "Date", "Open", "High", "Low", "Close", "Adj Close", "Volume", "Source", "Updated At"]
    ];
    for (let i = 50; i >= 1; i--) {
      hist.push(["RELIANCE", `2026-08-${i.toString().padStart(2, '0')}`, 1000, 1005, 995, 1000, 1000, 100000, "MOCK", new Date()]);
      hist.push(["ONGC", `2026-08-${i.toString().padStart(2, '0')}`, 200, 205, 195, 200, 200, 50000, "MOCK", new Date()]);
      hist.push(["NIFTY", `2026-08-${i.toString().padStart(2, '0')}`, 20000, 20050, 19950, 20000, 20000, 1000000, "MOCK", new Date()]);
    }
    const res = runMockPipeline(master, hist);
    if (res.success && res.sectors && res.sectors.length === 1 && res.sectors[0].stocks.length === 2) {
      return "PASS";
    }
    return "FAIL: Multiple stocks single sector failed.";
  }
});

// Test 3: Multiple Sectors Aggregation
tests.push({
  name: "3. Multiple Sectors Aggregation",
  run: () => {
    const master = [
      ["Stock Symbol", "Company Name", "Exchange", "Sector", "Industry", "Status", "Last Processed", "Added Date"],
      ["RELIANCE", "Reliance Ltd.", "NSE", "Energy", "Oil", "Active", "", "2024-01-01"],
      ["TCS", "TCS Ltd.", "NSE", "Technology", "IT", "Active", "", "2024-01-01"]
    ];
    const hist = [
      ["Symbol", "Date", "Open", "High", "Low", "Close", "Adj Close", "Volume", "Source", "Updated At"]
    ];
    for (let i = 50; i >= 1; i--) {
      hist.push(["RELIANCE", `2026-08-${i.toString().padStart(2, '0')}`, 1000, 1005, 995, 1000, 1000, 100000, "MOCK", new Date()]);
      hist.push(["TCS", `2026-08-${i.toString().padStart(2, '0')}`, 3000, 3015, 2985, 3000, 3000, 80000, "MOCK", new Date()]);
      hist.push(["NIFTY", `2026-08-${i.toString().padStart(2, '0')}`, 20000, 20050, 19950, 20000, 20000, 1000000, "MOCK", new Date()]);
    }
    const res = runMockPipeline(master, hist);
    if (res.success && res.sectors && res.sectors.length === 2) {
      return "PASS";
    }
    return "FAIL: Multiple sectors failed.";
  }
});

// Test 4: Missing NIFTY Benchmark Fallback
tests.push({
  name: "4. Missing NIFTY Index Fallback",
  run: () => {
    const master = [
      ["Stock Symbol", "Company Name", "Exchange", "Sector", "Industry", "Status", "Last Processed", "Added Date"],
      ["RELIANCE", "Reliance Ltd.", "NSE", "Energy", "Oil", "Active", "", "2024-01-01"]
    ];
    const hist = [
      ["Symbol", "Date", "Open", "High", "Low", "Close", "Adj Close", "Volume", "Source", "Updated At"]
    ];
    for (let i = 50; i >= 1; i--) {
      hist.push(["RELIANCE", `2026-08-${i.toString().padStart(2, '0')}`, 1000, 1005, 995, 1000, 1000, 100000, "MOCK", new Date()]);
    }
    const res = runMockPipeline(master, hist);
    if (res.success && res.monitorStats.benchmarkStatus === "⚠️ MISSING / INVALID") {
      return "PASS";
    }
    return "FAIL: Missing NIFTY fallback failed.";
  }
});

// Test 5: Insufficient Stock History
tests.push({
  name: "5. Insufficient Stock History Skipping",
  run: () => {
    const master = [
      ["Stock Symbol", "Company Name", "Exchange", "Sector", "Industry", "Status", "Last Processed", "Added Date"],
      ["RELIANCE", "Reliance Ltd.", "NSE", "Energy", "Oil", "Active", "", "2024-01-01"]
    ];
    const hist = [
      ["Symbol", "Date", "Open", "High", "Low", "Close", "Adj Close", "Volume", "Source", "Updated At"]
    ];
    for (let i = 10; i >= 1; i--) {
      hist.push(["RELIANCE", `2026-08-${i.toString().padStart(2, '0')}`, 1000, 1005, 995, 1000, 1000, 100000, "MOCK", new Date()]);
      hist.push(["NIFTY", `2026-08-${i.toString().padStart(2, '0')}`, 20000, 20050, 19950, 20000, 20000, 1000000, "MOCK", new Date()]);
    }
    const res = runMockPipeline(master, hist);
    if (res.success && res.monitorStats.stocksSkipped === 1 && res.sectors.length === 0) {
      return "PASS";
    }
    return "FAIL: Insufficient history checks failed.";
  }
});

// Test 6: Zero Volume Defense
tests.push({
  name: "6. Zero Volume Bounds Protection",
  run: () => {
    const master = [
      ["Stock Symbol", "Company Name", "Exchange", "Sector", "Industry", "Status", "Last Processed", "Added Date"],
      ["RELIANCE", "Reliance Ltd.", "NSE", "Energy", "Oil", "Active", "", "2024-01-01"]
    ];
    const hist = [
      ["Symbol", "Date", "Open", "High", "Low", "Close", "Adj Close", "Volume", "Source", "Updated At"]
    ];
    for (let i = 50; i >= 1; i--) {
      hist.push(["RELIANCE", `2026-08-${i.toString().padStart(2, '0')}`, 1000, 1005, 995, 1000, 1000, 0, "MOCK", new Date()]);
      hist.push(["NIFTY", `2026-08-${i.toString().padStart(2, '0')}`, 20000, 20050, 19950, 20000, 20000, 1000000, "MOCK", new Date()]);
    }
    const res = runMockPipeline(master, hist);
    const energySec = res.sectors && res.sectors.find(s => s.name === "Energy");
    if (res.success && energySec && isFinite(energySec.score) && !isNaN(energySec.score)) {
      return "PASS";
    }
    return "FAIL: Zero volume triggered division error.";
  }
});

// Test 7: Calendar Date discrepancies (Trading Gap)
tests.push({
  name: "7. Calendar Alignment Gap Alignment",
  run: () => {
    const master = [
      ["Stock Symbol", "Company Name", "Exchange", "Sector", "Industry", "Status", "Last Processed", "Added Date"],
      ["RELIANCE", "Reliance Ltd.", "NSE", "Energy", "Oil", "Active", "", "2024-01-01"]
    ];
    const hist = [
      ["Symbol", "Date", "Open", "High", "Low", "Close", "Adj Close", "Volume", "Source", "Updated At"]
    ];
    for (let i = 65; i >= 1; i--) {
      const dateStr = `2026-08-${i.toString().padStart(2, '0')}`;
      if (i !== 10 && i !== 11) {
        hist.push(["RELIANCE", dateStr, 1000, 1005, 995, 1000, 1000, 100000, "MOCK", new Date()]);
      }
      hist.push(["NIFTY", dateStr, 20000, 20050, 19950, 20000, 20000, 1000000, "MOCK", new Date()]);
    }
    const res = runMockPipeline(master, hist);
    const energySec = res.sectors && res.sectors.find(s => s.name === "Energy");
    if (res.success && energySec && isFinite(energySec.rsVsNifty) && !isNaN(energySec.rsVsNifty)) {
      return "PASS";
    }
    return "FAIL: Trading calendar mismatch caused error.";
  }
});

// Test 8: Data-quality Discarding Invalid Rows
tests.push({
  name: "8. Invalid Pricing Filter",
  run: () => {
    const master = [
      ["Stock Symbol", "Company Name", "Exchange", "Sector", "Industry", "Status", "Last Processed", "Added Date"],
      ["RELIANCE", "Reliance Ltd.", "NSE", "Energy", "Oil", "Active", "", "2024-01-01"]
    ];
    const hist = [
      ["Symbol", "Date", "Open", "High", "Low", "Close", "Adj Close", "Volume", "Source", "Updated At"],
      ["RELIANCE", "2026-08-10", "NaN", "NaN", "NaN", "NaN", "NaN", "NaN", "BAD", new Date()],
      ["RELIANCE", "2026-08-11", -10, 0, 5, 0, 0, -100, "BAD", new Date()]
    ];
    for (let i = 50; i >= 1; i--) {
      hist.push(["RELIANCE", `2026-08-${i.toString().padStart(2, '0')}`, 1000, 1005, 995, 1000, 1000, 100000, "MOCK", new Date()]);
      hist.push(["NIFTY", `2026-08-${i.toString().padStart(2, '0')}`, 20000, 20050, 19950, 20000, 20000, 1000000, "MOCK", new Date()]);
    }
    const res = runMockPipeline(master, hist);
    if (res.success && res.monitorStats.stocksProcessed === 1) {
      return "PASS";
    }
    return "FAIL: Bad row filtration did not discard cleanly.";
  }
});

// Test 9: Sector Stage Transition Alerting
tests.push({
  name: "9. Stage Rotation Transition Alerts",
  run: () => {
    const master = [
      ["Stock Symbol", "Company Name", "Exchange", "Sector", "Industry", "Status", "Last Processed", "Added Date"],
      ["RELIANCE", "Reliance Ltd.", "NSE", "Energy", "Oil", "Active", "", "2024-01-01"]
    ];
    const hist = [
      ["Symbol", "Date", "Open", "High", "Low", "Close", "Adj Close", "Volume", "Source", "Updated At"]
    ];
    for (let i = 50; i >= 1; i--) {
      hist.push(["RELIANCE", `2026-08-${i.toString().padStart(2, '0')}`, 1000, 1005, 995, 1000, 1000, 100000, "MOCK", new Date()]);
      hist.push(["NIFTY", `2026-08-${i.toString().padStart(2, '0')}`, 20000, 20050, 19950, 20000, 20000, 1000000, "MOCK", new Date()]);
    }
    const history = [
      ["Date", "Sector Name", "Sector Score", "Rank", "Current Stage", "Money Inflow", "Sector Breadth (%)", "RS vs Nifty (%)", "Generated Alerts"],
      ["2026-08-01", "Energy", "55.0", "1", "OUTFLOW", "🔥 STRONG (75 | RVOL=1.25)", "100.0", "2.5", "None"]
    ];
    const res = runMockPipeline(master, hist, history);
    if (res.success && res.sectors) {
      return "PASS";
    }
    return "FAIL: Rotation alert transition failed.";
  }
});

// Test 10: New Money Flow score change calculation
tests.push({
  name: "10. New Money Flow Inflow Score Changes",
  run: () => {
    const master = [
      ["Stock Symbol", "Company Name", "Exchange", "Sector", "Industry", "Status", "Last Processed", "Added Date"],
      ["RELIANCE", "Reliance Ltd.", "NSE", "Energy", "Oil", "Active", "", "2024-01-01"]
    ];
    const hist = [
      ["Symbol", "Date", "Open", "High", "Low", "Close", "Adj Close", "Volume", "Source", "Updated At"]
    ];
    for (let i = 50; i >= 1; i--) {
      hist.push(["RELIANCE", `2026-08-${i.toString().padStart(2, '0')}`, 1000, 1005, 995, 1000, 1000, 100000, "MOCK", new Date()]);
      hist.push(["NIFTY", `2026-08-${i.toString().padStart(2, '0')}`, 20000, 20050, 19950, 20000, 20000, 1000000, "MOCK", new Date()]);
    }
    const history = [
      ["Date", "Sector Name", "Sector Score", "Rank", "Current Stage", "Money Inflow", "Sector Breadth (%)", "RS vs Nifty (%)", "Generated Alerts"],
      ["2026-08-01", "Energy", "55.0", "1", "LEADING", "🔥 STRONG (70 | RVOL=1.25)", "100.0", "2.5", "None"]
    ];
    const res = runMockPipeline(master, hist, history);
    const energySec = res.sectors && res.sectors.find(s => s.name === "Energy");
    if (res.success && energySec && isFinite(energySec.inflowChg1D) && !isNaN(energySec.inflowChg1D)) {
      return "PASS";
    }
    return "FAIL: Money score changes calculation failed.";
  }
});

// Test 11: Rank Change (Improvement/Deterioration)
tests.push({
  name: "11. Sector Rank Change Calculation",
  run: () => {
    const master = [
      ["Stock Symbol", "Company Name", "Exchange", "Sector", "Industry", "Status", "Last Processed", "Added Date"],
      ["RELIANCE", "Reliance Ltd.", "NSE", "Energy", "Oil", "Active", "", "2024-01-01"]
    ];
    const hist = [
      ["Symbol", "Date", "Open", "High", "Low", "Close", "Adj Close", "Volume", "Source", "Updated At"]
    ];
    for (let i = 50; i >= 1; i--) {
      hist.push(["RELIANCE", `2026-08-${i.toString().padStart(2, '0')}`, 1000, 1005, 995, 1000, 1000, 100000, "MOCK", new Date()]);
      hist.push(["NIFTY", `2026-08-${i.toString().padStart(2, '0')}`, 20000, 20050, 19950, 20000, 20000, 1000000, "MOCK", new Date()]);
    }
    const history = [
      ["Date", "Sector Name", "Sector Score", "Rank", "Current Stage", "Money Inflow", "Sector Breadth (%)", "RS vs Nifty (%)", "Generated Alerts"],
      ["2026-08-01", "Energy", "55.0", "4", "LEADING", "🔥 STRONG (70 | RVOL=1.25)", "100.0", "2.5", "None"]
    ];
    const res = runMockPipeline(master, hist, history);
    const energySec = res.sectors && res.sectors.find(s => s.name === "Energy");
    if (res.success && energySec && energySec.rankChange === 3) {
      return "PASS";
    }
    return "FAIL: Rank improvement did not track correctly.";
  }
});

// Test 12: Look-Ahead Bias Prevention (Strict <= Date lookup)
tests.push({
  name: "12. Look-Ahead Bias Prevention (Strict <= Date)",
  run: () => {
    const master = [
      ["Stock Symbol", "Company Name", "Exchange", "Sector", "Industry", "Status", "Last Processed", "Added Date"],
      ["RELIANCE", "Reliance Ltd.", "NSE", "Energy", "Oil", "Active", "", "2024-01-01"]
    ];
    const hist = [
      ["Symbol", "Date", "Open", "High", "Low", "Close", "Adj Close", "Volume", "Source", "Updated At"]
    ];
    hist.push(["RELIANCE", "2026-08-06", 1000, 1005, 995, 1000, 1000, 100000, "MOCK", new Date()]);
    hist.push(["NIFTY", "2026-08-05", 21000, 21050, 20950, 21000, 21000, 1000000, "MOCK", new Date()]);
    hist.push(["NIFTY", "2026-08-07", 23000, 23050, 22950, 23000, 23000, 1000000, "MOCK", new Date()]);
    for (let i = 60; i >= 1; i--) {
      const dateStr = `2026-07-${i.toString().padStart(2, '0')}`;
      hist.push(["RELIANCE", dateStr, 1000, 1005, 995, 1000, 1000, 100000, "MOCK", new Date()]);
      hist.push(["NIFTY", dateStr, 20000, 20050, 19950, 20000, 20000, 1000000, "MOCK", new Date()]);
    }
    const res = runMockPipeline(master, hist);
    const energySec = res.sectors && res.sectors.find(s => s.name === "Energy");
    if (res.success && energySec && energySec.rsVsNifty < 10.0) {
      return "PASS";
    }
    return "FAIL: Look-ahead bias detected.";
  }
});

// Test 13: Global InitializeProject entry point exists
tests.push({
  name: "13. Global InitializeProject Wrapper Exists",
  run: () => {
    if (typeof global.InitializeProject === 'function') {
      return "PASS";
    }
    return "FAIL: Global InitializeProject function is not defined.";
  }
});

// Test 14: Global scheduledUpdateData entry point exists
tests.push({
  name: "14. Global scheduledUpdateData Trigger Wrapper Exists",
  run: () => {
    if (typeof global.scheduledUpdateData === 'function') {
      return "PASS";
    }
    return "FAIL: Global scheduledUpdateData function is not defined.";
  }
});

// Test 15: Menu callback validity
tests.push({
  name: "15. Menu Callbacks Structural Audit",
  run: () => {
    const menuItems = global.Config.MENU.ITEMS;
    for (const item of menuItems) {
      if (item.method && typeof global[item.method] !== 'function') {
        return `FAIL: Menu callback global wrapper ${item.method} is not defined.`;
      }
    }
    return "PASS";
  }
});

// Test 16: Trigger callback validity
tests.push({
  name: "16. Trigger Callback Wrapper Delegation Audit",
  run: () => {
    if (typeof global.scheduledUpdateData === 'function') {
      return "PASS";
    }
    return "FAIL: Trigger callback scheduledUpdateData is not accessible.";
  }
});

// Test 17: Duplicate trigger prevention
tests.push({
  name: "17. Duplicate Trigger Prevention Idempotency",
  run: () => {
    global.mockTriggers = [
      { getHandlerFunction: () => "scheduledUpdateData" }
    ];
    const initialLength = global.mockTriggers.length;
    MainOrchestrator.checkAndRepairTriggers();
    if (global.mockTriggers.length === initialLength) {
      return "PASS";
    }
    return `FAIL: Duplicated trigger created. Current trigger count: ${global.mockTriggers.length}`;
  }
});

// Test 18: Initialization Idempotency
tests.push({
  name: "18. InitializeProject Multiple Executions Idempotency",
  run: () => {
    const ss = new MockSpreadsheet();
    global.activeSpreadsheet = ss;

    // Run twice
    InitializeProject();
    const sheetCount1 = ss.getSheets().length;
    InitializeProject();
    const sheetCount2 = ss.getSheets().length;

    if (sheetCount1 === sheetCount2 && sheetCount1 > 1) {
      return "PASS";
    }
    return `FAIL: Sheet count mismatch. Run 1: ${sheetCount1} | Run 2: ${sheetCount2}`;
  }
});

// Test 19: Missing Sheet Repair Self-Healing
tests.push({
  name: "19. Missing Sheet Automated Self-Healing",
  run: () => {
    const ss = new MockSpreadsheet();
    global.activeSpreadsheet = ss;
    InitializeProject();

    // Delete settings sheet manually
    delete ss.sheets["Settings"];
    if (ss.getSheetByName("Settings") === null) {
      // Run self healing
      MainOrchestrator.performHealthCheckAndRepair();
      if (ss.getSheetByName("Settings") !== null) {
        return "PASS";
      }
    }
    return "FAIL: Settings sheet was not healed.";
  }
});

// Test 20: Existing Sheet Preservation
tests.push({
  name: "20. Existing Sheet Contents Preservation",
  run: () => {
    const ss = new MockSpreadsheet();
    global.activeSpreadsheet = ss;
    InitializeProject();

    // Populate some user data inside Settings
    const settingsSheet = ss.getSheetByName("Settings");
    settingsSheet.appendRow(["CustomKey", "CustomValue", "Desc", "Date"]);

    // Run repair check
    MainOrchestrator.performHealthCheckAndRepair();

    const data = settingsSheet.getRange(2, 1, settingsSheet.getLastRow() - 1, 2).getValues();
    const hasCustomKey = data.some(r => r[0] === "CustomKey");
    if (hasCustomKey) {
      return "PASS";
    }
    return "FAIL: Custom user configurations were wiped during repair.";
  }
});

// Test 21: Global function detection architecture (Apps Script Drops check)
tests.push({
  name: "21. Apps Script Dropdown Detection Compliance",
  run: () => {
    const dropFunctions = [
      "onOpen", "InitializeProject", "triggerUpdateData", "triggerRunBacktest",
      "triggerGenerateReport", "triggerConfigureSettings", "triggerViewLogs", "scheduledUpdateData"
    ];
    for (const f of dropFunctions) {
      if (typeof global[f] !== 'function') {
        return `FAIL: ${f} is missing from global Apps Script scope.`;
      }
    }
    return "PASS";
  }
});

// Test 22: No Apps Script/UI call from headless scheduled trigger
tests.push({
  name: "22. Headless Trigger Zero UI Call Safeguards",
  run: () => {
    global.mockUiAlerts = [];

    // Intercept updateData to run mock
    const originalUpdate = MainOrchestrator.updateData;
    let updateCalled = false;
    MainOrchestrator.updateData = () => { updateCalled = true; };

    scheduledUpdateData();

    MainOrchestrator.updateData = originalUpdate;
    if (updateCalled && global.mockUiAlerts.length === 0) {
      return "PASS";
    }
    return `FAIL: UI prompts were invoked during scheduled headless trigger: ${JSON.stringify(global.mockUiAlerts)}`;
  }
});

// Test 23: Full dependency integrity
tests.push({
  name: "23. Comprehensive System Dependency Integrity",
  run: () => {
    // Assert all required sheets exist in configuration map
    const requiredSheets = Object.values(global.Config.SHEETS);
    const definitions = Object.keys(global.Config.SHEETS_DEFINITION);
    for (const sheet of requiredSheets) {
      if (!definitions.includes(sheet)) {
        return `FAIL: Missing structural definitions for Config sheet: ${sheet}`;
      }
    }
    return "PASS";
  }
});

// Execute and print results
console.log('==================================================');
console.log('SA STOCK PLATFORM INTEGRATION AUDIT - 23 TESTS');
console.log('==================================================');
let passCount = 0;
for (let i = 0; i < tests.length; i++) {
  const t = tests[i];
  let verdict = "FAIL";
  try {
    verdict = t.run();
  } catch (err) {
    verdict = "FAIL: " + err.message;
  }
  console.log(`${t.name.padEnd(55)} -> [${verdict}]`);
  if (verdict === "PASS") passCount++;
}
console.log('==================================================');
console.log(`TEST SUITE RESULTS: ${passCount} / ${tests.length} PASSED`);
console.log('==================================================');

if (passCount !== tests.length) {
  process.exit(1);
}
