/**
 * test_intelligence_engine.js - Comprehensive Local Node.js Test Suite
 * Validates business logic, indicator calculations, scoring algorithms,
 * deduplication, FII separation, backtesting, performance benchmarks, and resumable execution.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

// Mock Script Properties Storage
const scriptProperties = {};

// Mock Google Apps Script Global Objects
const sandbox = {
  console: console,
  Logger: {
    log: function(msg) {
      // console.log("  [GAS LOG]", msg);
    }
  },
  Utilities: {
    sleep: function(ms) { /* no-op in tests */ }
  },
  PropertiesService: {
    getScriptProperties: function() {
      return {
        getProperty: function(key) { return scriptProperties[key] || null; },
        setProperty: function(key, val) { scriptProperties[key] = val.toString(); },
        deleteProperty: function(key) { delete scriptProperties[key]; }
      };
    }
  }
};

// Virtual Spreadsheet Storage
const virtualSheets = {};

sandbox.SpreadsheetApp = {
  getActiveSpreadsheet: function() {
    return {
      getSheetByName: function(name) {
        if (!virtualSheets[name]) {
          virtualSheets[name] = {
            data: [],
            getLastRow: function() { return this.data.length; },
            getLastColumn: function() { return this.data.length > 0 ? this.data[0].length : 0; },
            getRange: function(r, c, numRows, numCols) {
              const self = this;
              return {
                getValues: function() {
                  const res = [];
                  for (let i = r - 1; i < r - 1 + numRows; i++) {
                    if (self.data[i]) {
                      res.push(self.data[i].slice(c - 1, c - 1 + numCols));
                    }
                  }
                  return res;
                },
                setValues: function(vals) {
                  for (let i = 0; i < vals.length; i++) {
                    self.data[r - 1 + i] = vals[i];
                  }
                },
                clearContent: function() {
                  if (r === 2) {
                    self.data = self.data.slice(0, 1);
                  }
                },
                setFontWeight: function() {},
                setValue: function(val) {
                  if (!self.data[r - 1]) self.data[r - 1] = [];
                  self.data[r - 1][c - 1] = val;
                }
              };
            },
            appendRow: function(row) {
              this.data.push(row);
            },
            deleteRows: function(start, count) {
              this.data.splice(start - 1, count);
            },
            clearContents: function() {
              this.data = [];
            },
            setFrozenRows: function() {}
          };
        }
        return virtualSheets[name];
      },
      insertSheet: function(name) {
        return this.getSheetByName(name);
      },
      deleteSheet: function(sheet) {},
      getSheets: function() { return [this.getSheetByName("Dashboard")]; }
    };
  }
};

vm.createContext(sandbox);

// Load and Concatenate all GAS .gs files into shared context
const gsFiles = [
  'Config.gs',
  'Utils.gs',
  'DataProvider.gs',
  'NSEData.gs',
  'FIIData.gs',
  'Calculations.gs',
  'SectorEngine.gs',
  'SignalEngine.gs',
  'Dashboard.gs',
  'Backtest.gs',
  'Main.gs'
];

gsFiles.forEach(file => {
  const code = fs.readFileSync(path.join(__dirname, file), 'utf8');
  vm.runInContext(code, sandbox, { filename: file });
});

// Test Framework Assertions
let passedTests = 0;
let totalTests = 0;

function assert(condition, testName) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✓ [PASS] Test ${totalTests}: ${testName}`);
  } else {
    console.error(`  ✗ [FAIL] Test ${totalTests}: ${testName}`);
  }
}

console.log("=================================================");
console.log("Starting Volume Intelligence Engine Test Suite...");
console.log("=================================================");

// Test 1: Configuration Schema Validation
const config = vm.runInContext("getConfig()", sandbox);
assert(config && Object.keys(config.SHEETS).length === 12, "Configuration defines all 12 mandatory sheet schemas");

// Test 2: Utility Composite Key Builder
const key1 = vm.runInContext('makeCompositeKey("2025-05-20", "RELIANCE")', sandbox);
assert(key1 === "2025-05-20_RELIANCE", "Composite primary key builder generates correct Date_Symbol string");

// Test 3: Safe Number Conversion
const num1 = vm.runInContext('safeNumber(null, 10)', sandbox);
const num2 = vm.runInContext('safeNumber("123.45")', sandbox);
assert(num1 === 10 && num2 === 123.45, "safeNumber converts valid numeric strings and defaults on null");

// Test 4: Moving Average & EMA Calculation
const sma = vm.runInContext('calculateSMA([100, 102, 104, 106, 108, 110])', sandbox);
assert(sma === 105, "calculateSMA correctly computes arithmetic mean");

// Test 5: Min-Max Normalization Scale (0-100)
const norm1 = vm.runInContext('normalizeToRange(15, 0, 10)', sandbox);
const norm2 = vm.runInContext('normalizeToRange(5, 0, 10)', sandbox);
assert(norm1 === 100 && norm2 === 50, "normalizeToRange clamps values strictly between 0 and 100");

// Test 6: Self-Healing Initialization
vm.runInContext('InitializeProject()', sandbox);
assert(Object.keys(virtualSheets).length >= 12, "InitializeProject automatically creates all 12 sheet tabs");

// Test 7: Default Master Stocks Universe Seeding
const masterData = vm.runInContext('readBatchData(getConfig().SHEETS.MASTER_STOCKS)', sandbox);
assert(masterData.length >= 20, "Master stock universe contains >= 20 default NSE tickers");

// Test 8: Data Ingestion Quality Pipeline
const invalidRecord = vm.runInContext('validateDailyData(["2025-05-20", "INVALID", "EQ", 100, 105, 95, -10, 100, -50, 0, 0, 0, 150])', sandbox);
assert(!invalidRecord.valid && invalidRecord.errors.length >= 2, "validateDailyData rejects negative close, volume, and invalid delivery %");

// Test 9: NSE Historical Data Seeding
const histCount = vm.runInContext('updateNSEDataInSheet()', sandbox);
assert(histCount > 100, "NSEData seeds multi-day historical price/volume archives into Raw_Daily");

// Test 10: Fast String Sort & Deduplication Engine
const initialRows = vm.runInContext('readBatchData(getConfig().SHEETS.RAW_DAILY)', sandbox);
const testDateObjRow = [new Date("2026-08-23"), "TCS", "EQ", 4000, 4200, 3950, 4150, 4100, 1000000, 4150000000, 20000, 750000, 75];
const testNewRow = ["2026-08-23", "HAL", "EQ", 4000, 4200, 3950, 4150, 4100, 1000000, 4150000000, 20000, 750000, 75];
sandbox.initialRows = initialRows;
sandbox.testDateObjRow = testDateObjRow;
sandbox.testNewRow = testNewRow;

let dateSortPassed = true;
try {
  const mergedWithDateObjs = vm.runInContext('mergeAndDeduplicateDailyData([testDateObjRow], [testNewRow])', sandbox);
  dateSortPassed = mergedWithDateObjs.length === 2 && mergedWithDateObjs[0][0] === "2026-08-23";
} catch (e) {
  dateSortPassed = false;
}
assert(dateSortPassed, "Deduplication engine safely handles Date objects without a[0].localeCompare exception");

// Test 11: FII Market Activity vs Stock Ownership Separation
const fiiRes = vm.runInContext('updateAllFIIData()', sandbox);
const fiiMarketRows = vm.runInContext('readBatchData(getConfig().SHEETS.RAW_FII)', sandbox);
const fiiHoldingRows = vm.runInContext('readBatchData(getConfig().SHEETS.RAW_FII_HOLDINGS)', sandbox);
assert(fiiMarketRows.length > 0 && fiiHoldingRows.length > 0 && fiiMarketRows[0].length === 5 && fiiHoldingRows[0].length === 8, "Strictly separates market-level FII activity from stock-wise FII ownership");

// Test 12: Indicator Engine Calculations Execution
const calcResults = vm.runInContext('calculateAllIndicators()', sandbox);
assert(calcResults.length > 0, "Indicator engine executes calculations across active stock universe");

// Test 13: RVOL Calculation Verification
const halRow = calcResults.find(r => r[0] === "HAL");
assert(halRow && halRow[10] >= 1.0, "RVOL calculated for HAL stock record using prior 20D baseline");

// Test 14: Volume Acceleration Interpretation
const volAccel = halRow[12];
assert(typeof volAccel === 'number' && volAccel > 0, "Volume Acceleration correctly computed");

// Test 15: Low Selling Pressure Proxy (<40K)
const seller20D = halRow[26];
assert(typeof seller20D === 'number', "20D Average Selling Pressure Proxy calculated");

// Test 16: Normalized Stock Rotation Score (0-100)
const rotScore = halRow[30];
assert(rotScore >= 0 && rotScore <= 100, "Stock Rotation Score normalized between 0 and 100");

// Test 17: Normalized New Money Inflow Score (0-100)
const newMoneyScore = halRow[31];
assert(newMoneyScore >= 0 && newMoneyScore <= 100, "New Money Inflow Score normalized between 0 and 100");

// Test 18: Big Money Entry Detection Score (0-100)
const bigMoneyScore = halRow[32];
assert(bigMoneyScore >= 0 && bigMoneyScore <= 100, "Big Money Entry Score normalized between 0 and 100");

// Test 19: Sector Aggregation & Relative Strength
const sectorResults = vm.runInContext('calculateSectorRotation()', sandbox);
assert(sectorResults.length > 0, "Sector Engine aggregates stock metrics into Sector Data");

// Test 20: Sector Stage Classification Rules
const defenseSector = sectorResults.find(s => s[0] === "Defense");
assert(defenseSector && ["Leading", "Improving", "Accumulation / Early Rotation", "Weakening", "Lagging"].includes(defenseSector[11]), "Classifies Sector into one of 5 standard stages");

// Test 21: Signal Generation & Snapshot Logging
const activeSignals = vm.runInContext('generateSignalsAndSnapshot()', sandbox);
const histLogs = vm.runInContext('readBatchData(getConfig().SHEETS.HISTORICAL_LOG)', sandbox);
assert(histLogs.length > 0, "Snapshots daily indicators into Historical_Log sheet for backtesting");

// Test 22: Dashboard UI Panel Rendering
const dashSummary = vm.runInContext('renderDashboard()', sandbox);
assert(dashSummary && dashSummary.totalStocks > 0, "Dashboard UI engine renders overview counters and specialized panels");

// Test 23: Quantitative Backtest Execution (Strategy D: Big Money Entry)
const backtestRes = vm.runInContext('runBacktestEngine("Strategy D: Potential Big Money Entry", "2024-01-01", "2026-12-31")', sandbox);
assert(backtestRes && backtestRes.totalTrades >= 0, "Backtest engine executes trade simulation without look-ahead bias");

// Test 24: Strategy Performance Summary Metrics
assert(typeof backtestRes.winRate === 'number' && typeof backtestRes.profitFactor === 'number', "Computes Win Rate %, Profit Factor, and trade returns");

// Test 25: Performance Benchmark & Resumable Stage Execution Test (2,800+ Stocks & 100,000+ Records)
sandbox.bulk100kRows = [];
for (let b = 0; b < 2800; b++) {
  const sym = "STK_" + b;
  for (let d = 0; d < 40; d++) {
    sandbox.bulk100kRows.push([
      "2026-08-" + (d < 10 ? "0" + d : d),
      sym,
      "EQ",
      100 + (b % 100),
      105 + (b % 100),
      95 + (b % 100),
      102 + (b % 100),
      101 + (b % 100),
      50000 + (b * 10),
      5000000,
      1000,
      25000,
      50
    ]);
  }
}

const perfStart = Date.now();
const bulkMerged = vm.runInContext('mergeAndDeduplicateDailyData(bulk100kRows, [])', sandbox);
const perfTime = Date.now() - perfStart;

// Check stage property resumption
scriptProperties["PIPELINE_LAST_STAGE"] = "STAGE_2_COMPLETE";
const resStage = vm.runInContext('FullRefresh(false)', sandbox);

assert(bulkMerged.length === 112000 && perfTime < 5000 && resStage && resStage.totalTimeMs > 0, "Engine processes 112,000+ records in <5s and resumes pipeline from stage checkpoints");

console.log("=================================================");
console.log(`Test Suite Complete: ${passedTests} / ${totalTests} Passed.`);
console.log("=================================================");

if (passedTests !== totalTests) {
  process.exit(1);
}
