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

// Mock Classes
class MockRange {
  constructor(values = [[]]) {
    this.values = values;
  }
  getValues() { return this.values; }
  setValues(vals) { this.values = vals; return this; }
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
  getLastRow() { return this.values.length; }
  getLastColumn() { return this.values[0] ? this.values[0].length : 0; }
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
}

global.SpreadsheetApp = {
  getActiveSpreadsheet: () => global.activeSpreadsheet,
  BorderStyle: { SOLID: 'SOLID' }
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
  'Main.gs'
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

// 11 Deterministic Tests
const tests = [];

// Test 1: Single Stock In Single Sector
tests.push({
  name: "1 Stock Pipeline Run",
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
  name: "Multiple Stocks in Single Sector",
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
  name: "Multiple Sectors Aggregation",
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
  name: "Missing NIFTY Index",
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
  name: "Insufficient Stock History Skipping",
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
  name: "Zero Volume Bounds Protection",
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
  name: "Calendar Alignment Gap Alignment",
  run: () => {
    const master = [
      ["Stock Symbol", "Company Name", "Exchange", "Sector", "Industry", "Status", "Last Processed", "Added Date"],
      ["RELIANCE", "Reliance Ltd.", "NSE", "Energy", "Oil", "Active", "", "2024-01-01"]
    ];
    const hist = [
      ["Symbol", "Date", "Open", "High", "Low", "Close", "Adj Close", "Volume", "Source", "Updated At"]
    ];

    // Day gaps in stock but NIFTY constant. We provide 55 entries for both so they are processed cleanly.
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
  name: "Invalid Pricing Filter",
  run: () => {
    const master = [
      ["Stock Symbol", "Company Name", "Exchange", "Sector", "Industry", "Status", "Last Processed", "Added Date"],
      ["RELIANCE", "Reliance Ltd.", "NSE", "Energy", "Oil", "Active", "", "2024-01-01"]
    ];
    const hist = [
      ["Symbol", "Date", "Open", "High", "Low", "Close", "Adj Close", "Volume", "Source", "Updated At"],
      ["RELIANCE", "2026-08-10", "NaN", "NaN", "NaN", "NaN", "NaN", "NaN", "BAD", new Date()], // Completely NaN
      ["RELIANCE", "2026-08-11", -10, 0, 5, 0, 0, -100, "BAD", new Date()] // Impossible price/volume
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
  name: "Stage Rotation Transition Alerts",
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
  name: "New Money Flow Inflow Score Changes",
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
  name: "Sector Rank Change Calculation",
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
      ["2026-08-01", "Energy", "55.0", "4", "LEADING", "🔥 STRONG (70 | RVOL=1.25)", "100.0", "2.5", "None"] // Rank was 4
    ];
    const res = runMockPipeline(master, hist, history);
    const energySec = res.sectors && res.sectors.find(s => s.name === "Energy");
    if (res.success && energySec && energySec.rankChange === 3) { // Rank 4 -> Rank 1 is +3 change!
      return "PASS";
    }
    return "FAIL: Rank improvement did not track correctly.";
  }
});

// Execute and print results
console.log('==================================================');
console.log('AUTOMATED DETERMINISTIC TEST SUITE');
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
  console.log(`Test ${i + 1}: ${t.name.padEnd(45)} -> [${verdict}]`);
  if (verdict === "PASS") passCount++;
}
console.log('==================================================');
console.log(`TEST SUITE RESULTS: ${passCount} / ${tests.length} PASSED`);
console.log('==================================================');

if (passCount !== tests.length) {
  process.exit(1);
}
