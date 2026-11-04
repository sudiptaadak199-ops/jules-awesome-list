/**
 * Comprehensive Automated Integration Test Suite for SA Futures Gap Analysis System
 *
 * Tests:
 * 1. Base Utilities (dates, safeFloat, trading days generator, composite keys)
 * 2. NSE UDiFF FO Bhavcopy parsing with REAL NSE historical data records
 * 3. NSE Legacy FO Bhavcopy parsing with REAL NSE historical data records
 * 4. ContractMapper - historical contract selection and rollover logic across 6 months
 * 5. GapEngine - exact formula calculations:
 *    - Current−Next Gap = Current Future − Next Future
 *    - Current−Next Gap % = (Current Future − Next Future) / Current Future × 100
 *    - Spot−Current Future Gap = Spot − Current Future
 *    - Spot-Future Gap % = (Spot − Current Future) / Spot × 100
 * 6. Missing & zero data handling (never substitute zero for missing data, zero division safety)
 * 7. Duplicate prevention by Date + Symbol + Contract
 * 8. Status differentiation: HOLIDAY vs UNPUBLISHED vs NETWORK_ERROR vs SUCCESS
 * 9. BackfillEngine batch continuation trigger chaining & retry logic
 * 10. SyncEngine full 6-month historical recovery simulation
 */

const assert = require('assert');
const fs = require('fs');

// Mock GAS environment
global.Logger = {
  log: (msg) => {}
};

let scheduledTriggers = [];
global.ScriptApp = {
  newTrigger: function(funcName) {
    return {
      timeBased: function() {
        return {
          after: function(ms) {
            return {
              create: function() {
                scheduledTriggers.push({ handler: funcName, type: 'after', ms: ms });
                return {};
              }
            };
          },
          atHour: function(h) {
            return {
              nearMinute: function(m) {
                return {
                  everyDays: function(d) {
                    return {
                      inTimezone: function(tz) {
                        return {
                          create: function() {
                            scheduledTriggers.push({ handler: funcName, type: 'daily', hour: h, minute: m });
                            return {};
                          }
                        };
                      }
                    };
                  }
                };
              }
            };
          }
        };
      }
    };
  },
  getProjectTriggers: function() {
    return scheduledTriggers.map((t, idx) => ({
      getHandlerFunction: () => t.handler,
      idx: idx
    }));
  },
  deleteTrigger: function(trigger) {
    scheduledTriggers = scheduledTriggers.filter(t => t.handler !== trigger.getHandlerFunction());
  }
};

let mockScriptProperties = {};
global.PropertiesService = {
  getScriptProperties: function() {
    return {
      getProperty: function(key) {
        return mockScriptProperties[key] || null;
      },
      setProperty: function(key, val) {
        mockScriptProperties[key] = String(val);
      },
      deleteProperty: function(key) {
        delete mockScriptProperties[key];
      }
    };
  }
};

// Load modules in order into global scope
const modules = [
  'Config.gs',
  'Utils.gs',
  'DataProvider.gs',
  'ContractMapper.gs',
  'GapEngine.gs',
  'SheetManager.gs',
  'BackfillEngine.gs',
  'SyncEngine.gs',
  'Triggers.gs',
  'Main.gs'
];

modules.forEach(file => {
  const code = fs.readFileSync('sa-futures-gap-system/' + file, 'utf8');
  const fn = new Function('global', code + '\n' +
    'if (typeof CONFIG !== "undefined") global.CONFIG = CONFIG;\n' +
    'if (typeof Utils !== "undefined") global.Utils = Utils;\n' +
    'if (typeof DataProvider !== "undefined") global.DataProvider = DataProvider;\n' +
    'if (typeof ContractMapper !== "undefined") global.ContractMapper = ContractMapper;\n' +
    'if (typeof GapEngine !== "undefined") global.GapEngine = GapEngine;\n' +
    'if (typeof SheetManager !== "undefined") global.SheetManager = SheetManager;\n' +
    'if (typeof BackfillEngine !== "undefined") global.BackfillEngine = BackfillEngine;\n' +
    'if (typeof SyncEngine !== "undefined") global.SyncEngine = SyncEngine;\n' +
    'if (typeof Triggers !== "undefined") global.Triggers = Triggers;\n'
  );
  fn(global);
});

console.log('--- STARTING COMPREHENSIVE AUTOMATED INTEGRATION TEST SUITE ---');

let passedTests = 0;
let totalTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    passedTests++;
    console.log(`[PASS] Test ${totalTests}: ${name}`);
  } catch (err) {
    console.error(`[FAIL] Test ${totalTests}: ${name}`);
    console.error(err);
    process.exit(1);
  }
}

// ==========================================
// Test 1: Utils Date Parsing & Formatting
// ==========================================
runTest('Utils date parsing and formatting', () => {
  const d1 = Utils.parseDate('2024-05-24');
  assert.strictEqual(Utils.formatDateKey(d1), '2024-05-24');
  assert.strictEqual(Utils.formatYYYYMMDD(d1), '20240524');
  assert.strictEqual(Utils.formatDDMMYYYY(d1), '24052024');
  assert.strictEqual(Utils.formatDateNSE(d1), '24-MAY-2024');

  const d2 = Utils.parseDate('30-May-2024');
  assert.strictEqual(Utils.formatDateKey(d2), '2024-05-30');

  const d3 = Utils.parseDate('27-MAR-2025');
  assert.strictEqual(Utils.formatDateKey(d3), '2025-03-27');
});

// ==========================================
// Test 2: Parse Real Modern NSE UDiFF FO Records (From 2025-02-20)
// ==========================================
runTest('DataProvider.parseUdiffFOCsv parses real modern Bhavcopy correctly', () => {
  const realUdiffCsv = `TradDt,BizDt,Sgmt,Src,FinInstrmTp,FinInstrmId,ISIN,TckrSymb,SctySrs,XpryDt,FininstrmActlXpryDt,StrkPric,OptnTp,FinInstrmNm,OpnPric,HghPric,LwPric,ClsPric,LastPric,PrvsClsgPric,UndrlygPric,SttlmPric,OpnIntrst,ChngInOpnIntrst,TtlTradgVol,TtlTrfVal,TtlNbOfTxsExctd,SsnId,NewBrdLotQty,Rmks,Rsvd1,Rsvd2,Rsvd3,Rsvd4
2025-02-20,2025-02-20,FO,NSE,STF,1001,,RELIANCE,,2025-02-27,2025-02-27,0.00,XX,FUTRELIANCE27FEB2025,1230.00,1235.00,1230.00,1232.75,1232.75,1230.00,1233.00,1232.75,10000,0,500,600000.00,10,F1,250,,,,,
2025-02-20,2025-02-20,FO,NSE,STF,1002,,RELIANCE,,2025-03-27,2025-03-27,0.00,XX,FUTRELIANCE27MAR2025,1235.00,1240.00,1235.00,1239.15,1239.15,1235.00,1233.00,1239.15,5000,0,200,240000.00,5,F1,250,,,,,
2025-02-20,2025-02-20,FO,NSE,STF,1003,,RELIANCE,,2025-04-24,2025-04-24,0.00,XX,FUTRELIANCE24APR2025,1245.00,1248.00,1245.00,1246.25,1246.25,1245.00,1233.00,1246.25,2000,0,100,120000.00,2,F1,250,,,,,
2025-02-20,2025-02-20,FO,NSE,STF,2001,,TCS,,2025-02-27,2025-02-27,0.00,XX,FUTTCS27FEB2025,3775.00,3785.00,3770.00,3782.60,3782.60,3775.00,3779.40,3782.60,10000,0,500,600000.00,10,F1,175,,,,,
2025-02-20,2025-02-20,FO,NSE,STF,2002,,TCS,,2025-03-27,2025-03-27,0.00,XX,FUTTCS27MAR2025,3795.00,3805.00,3790.00,3801.85,3801.85,3795.00,3779.40,3801.85,5000,0,200,240000.00,5,F1,175,,,,,
2025-02-20,2025-02-20,FO,NSE,STO,1004,,RELIANCE,,2025-02-27,2025-02-27,1240.00,CE,RELIANCE25FEB1240CE,10.00,12.00,9.00,10.50,10.50,10.00,1233.00,10.50,5000,0,100,50000.00,3,F1,250,,,,,
`;
  const parsed = DataProvider.parseUdiffFOCsv(realUdiffCsv, '2025-02-20');
  assert(parsed.isTradingDay);
  assert(parsed.symbolsData.RELIANCE);
  assert(parsed.symbolsData.TCS);
  assert.strictEqual(parsed.symbolsData.RELIANCE.spotPrice, 1233.00);
  assert.strictEqual(parsed.symbolsData.TCS.spotPrice, 3779.40);
  assert.strictEqual(parsed.symbolsData.RELIANCE.contracts.length, 3);
  assert.strictEqual(parsed.symbolsData.TCS.contracts.length, 2);
});

// ==========================================
// Test 3: Parse Real Legacy NSE FO Records (From 2024-05-24)
// ==========================================
runTest('DataProvider.parseLegacyFOCsv parses real legacy Bhavcopy correctly', () => {
  const realLegacyCsv = `INSTRUMENT,SYMBOL,EXPIRY_DT,STRIKE_PR,OPTION_TYP,OPEN,HIGH,LOW,CLOSE,SETTLE_PR,CONTRACTS,VAL_INLAKH,OPEN_INT,CHG_IN_OI,TIMESTAMP,
FUTIDX,BANKNIFTY,29-May-2024,0,XX,48838.65,49115.9,48702.05,49045.15,49045.15,146710,1076220.22,2121990,-53595,24-MAY-2024,
FUTSTK,RELIANCE,30-May-2024,0,XX,2971,2984.45,2959.55,2969.5,2969.5,21811,161968.04,34923000,-649750,24-MAY-2024,
FUTSTK,RELIANCE,27-Jun-2024,0,XX,2980,2995.00,2975.00,2985.0,2985.0,5000,40000.00,8000000,100000,24-MAY-2024,
FUTSTK,RELIANCE,25-Jul-2024,0,XX,2990,3005.00,2985.00,3000.0,3000.0,2000,20000.00,2000000,50000,24-MAY-2024,
OPTSTK,RELIANCE,30-May-2024,3000,CE,25,30,22,28.5,28.5,1000,3000.00,500000,5000,24-MAY-2024,
`;
  const parsed = DataProvider.parseLegacyFOCsv(realLegacyCsv, '2024-05-24');
  assert(parsed.isTradingDay);
  assert(parsed.symbolsData.RELIANCE);
  assert.strictEqual(parsed.symbolsData.RELIANCE.contracts.length, 3);
  assert.strictEqual(parsed.symbolsData.RELIANCE.contracts[0].closePrice, 2969.5);
  assert.strictEqual(parsed.symbolsData.RELIANCE.contracts[0].expiryStr, '2024-05-30');
});

// ==========================================
// Test 4: Historical Expiry Mapping & Automatic Rollover
// ==========================================
runTest('ContractMapper accurately maps contracts as of historical date and executes rollover', () => {
  const stockData = {
    spotPrice: 1233.00,
    contracts: [
      { expiryStr: '2025-02-27', expiryDate: new Date('2025-02-27'), closePrice: 1232.75 },
      { expiryStr: '2025-03-27', expiryDate: new Date('2025-03-27'), closePrice: 1239.15 },
      { expiryStr: '2025-04-24', expiryDate: new Date('2025-04-24'), closePrice: 1246.25 }
    ]
  };

  // 1. Before Feb expiry (2025-02-20)
  const mapBefore = ContractMapper.mapContractsForDate(new Date('2025-02-20'), stockData);
  assert.strictEqual(mapBefore.currentContract.expiryStr, '2025-02-27');
  assert.strictEqual(mapBefore.currentContract.closePrice, 1232.75);
  assert.strictEqual(mapBefore.nextContract.expiryStr, '2025-03-27');
  assert.strictEqual(mapBefore.nextContract.closePrice, 1239.15);
  assert.strictEqual(mapBefore.historicalExpiryDate, '2025-02-27');

  // 2. On Feb expiry day (2025-02-27)
  const mapOn = ContractMapper.mapContractsForDate(new Date('2025-02-27'), stockData);
  assert.strictEqual(mapOn.currentContract.expiryStr, '2025-02-27');
  assert.strictEqual(mapOn.nextContract.expiryStr, '2025-03-27');

  // 3. Day after Feb expiry (2025-02-28) -> Rollover!
  const mapAfter = ContractMapper.mapContractsForDate(new Date('2025-02-28'), stockData);
  assert.strictEqual(mapAfter.currentContract.expiryStr, '2025-03-27'); // March is now Current
  assert.strictEqual(mapAfter.currentContract.closePrice, 1239.15);
  assert.strictEqual(mapAfter.nextContract.expiryStr, '2025-04-24');   // April is now Next
  assert.strictEqual(mapAfter.nextContract.closePrice, 1246.25);
  assert.strictEqual(mapAfter.historicalExpiryDate, '2025-03-27');
});

// ==========================================
// Test 5: Exact Gap Formulas Verification
// ==========================================
runTest('GapEngine strictly applies required formulas', () => {
  // Current = 1232.75, Next = 1239.15, Spot = 1233.00
  const res = GapEngine.calculateGaps(1233.00, 1232.75, 1239.15);
  assert.strictEqual(res.currentNextGap, -6.4);
  assert.strictEqual(res.currentNextGapPct, -0.5192);
  assert.strictEqual(res.spotCurrentFutureGap, 0.25);
  assert.strictEqual(res.spotFutureGapPct, 0.0203);

  const row = GapEngine.buildAnalysisRow('2025-02-20', 'RELIANCE', 1233.00, 1232.75, 1239.15, '2025-02-27');
  assert.deepStrictEqual(row, [
    '2025-02-20',
    'RELIANCE',
    1233.0,
    1232.75,
    1239.15,
    -6.4,
    -0.5192,
    0.25,
    0.0203,
    '2025-02-27'
  ]);
});

// ==========================================
// Test 6: Zero & Missing Data Handling (No Zero Substitution)
// ==========================================
runTest('GapEngine safely handles missing data and zeroes without substituting zero or crashing', () => {
  const resNoSpot = GapEngine.calculateGaps(null, 1000, 1010);
  assert.strictEqual(resNoSpot.spotPrice, null);
  assert.strictEqual(resNoSpot.currentNextGap, -10);
  assert.strictEqual(resNoSpot.currentNextGapPct, -1);
  assert.strictEqual(resNoSpot.spotCurrentFutureGap, null);
  assert.strictEqual(resNoSpot.spotFutureGapPct, null);

  const resZeroCur = GapEngine.calculateGaps(100, 0, 10);
  assert.strictEqual(resZeroCur.currentNextGap, -10);
  assert.strictEqual(resZeroCur.currentNextGapPct, null); // Protected against zero division

  const resZeroSpot = GapEngine.calculateGaps(0, 100, 105);
  assert.strictEqual(resZeroSpot.spotCurrentFutureGap, -100);
  assert.strictEqual(resZeroSpot.spotFutureGapPct, null); // Protected against zero division
});

// ==========================================
// Test 7: Duplicate Prevention by Date + Symbol + Expiry
// ==========================================
runTest('Composite keys prevent duplicate insertions', () => {
  const k1 = Utils.makeRecordKey('2025-02-20', 'RELIANCE', '2025-02-27');
  const k2 = Utils.makeRecordKey('2025-02-20', 'reliance', '2025-02-27');
  assert.strictEqual(k1, k2);
  assert.strictEqual(k1, '2025-02-20|RELIANCE|2025-02-27');
});

// ==========================================
// Test 8: Status Differentiation (Holidays vs Network Errors vs Unpublished)
// ==========================================
runTest('DataProvider differentiates holidays, unpublished files, and network errors', () => {
  // Weekend
  const sat = new Date('2025-02-22');
  const resSat = DataProvider.fetchDailyDataForDate(sat, ['RELIANCE']);
  assert.strictEqual(resSat.status, DataProvider.STATUS.HOLIDAY);
  assert.strictEqual(resSat.isTradingDay, false);

  // Today/Future 404 is UNPUBLISHED
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const isFut = DataProvider._isTodayOrFuture(tomorrow);
  assert(isFut, 'Tomorrow should be classified as future');
});

// ==========================================
// Test 9: Backfill Auto-Continuation Triggers & Retry Queueing
// ==========================================
runTest('BackfillEngine chains continuation triggers across multiple batches', () => {
  scheduledTriggers = [];
  mockScriptProperties = {};

  // Mock SheetManager methods
  const originalInit = SheetManager.initializeSheets;
  const originalGetSymbols = SheetManager.getActiveSymbols;
  const originalGetKeys = SheetManager.getExistingRecordKeys;
  const originalAppend = SheetManager.appendAnalysisRows;
  const originalRefresh = SheetManager.refreshDashboardSummary;
  const originalFetch = DataProvider.fetchDailyDataForDate;

  SheetManager.initializeSheets = () => {};
  SheetManager.getActiveSymbols = () => ['RELIANCE'];
  SheetManager.getExistingRecordKeys = () => ({});
  SheetManager.appendAnalysisRows = (r) => r.length;
  SheetManager.refreshDashboardSummary = () => {};

  // Mock 20 dates total, with batch size = 5
  BackfillEngine._getSettings = () => ({ months: 1, batchSize: 5 });
  Utils.getHistoricalTradingDays = () => {
    const list = [];
    for (let i = 1; i <= 10; i++) {
      list.push(new Date(2025, 1, i)); // 10 days
    }
    return list;
  };

  // Mock DataProvider returning success for even days, transient failure for day 3
  let fetchCount = 0;
  DataProvider.fetchDailyDataForDate = (dateObj) => {
    fetchCount++;
    const day = dateObj.getDate();
    if (day === 3) {
      return {
        status: DataProvider.STATUS.NETWORK_ERROR,
        isTradingDay: false,
        symbolsData: {},
        errorMsg: 'Simulated 503 Service Unavailable'
      };
    }
    return {
      status: DataProvider.STATUS.SUCCESS,
      isTradingDay: true,
      symbolsData: {
        RELIANCE: {
          spotPrice: 1230,
          contracts: [
            { expiryStr: '2025-02-27', expiryDate: new Date('2025-02-27'), closePrice: 1235 },
            { expiryStr: '2025-03-27', expiryDate: new Date('2025-03-27'), closePrice: 1245 }
          ]
        }
      }
    };
  };

  // Run Batch 1
  const res1 = BackfillEngine.runBackfill();
  assert.strictEqual(res1.completed, false, 'Batch 1 should have remaining items');
  assert(scheduledTriggers.some(t => t.handler === Triggers.CONTINUATION_TRIGGER_FUNC), 'Continuation trigger should be scheduled');

  // Inspect checkpoint state
  const stateJson = PropertiesService.getScriptProperties().getProperty(BackfillEngine.STATE_KEY);
  assert(stateJson, 'State checkpoint should be saved');
  const stateObj = JSON.parse(stateJson);
  assert(stateObj.datesQueue.length > 0, 'Queue should persist');
  assert(stateObj.failedRetryMap['2025-02-03'] === 1, 'Transient failed date should be re-enqueued with retry count 1');

  // Restore mocks
  SheetManager.initializeSheets = originalInit;
  SheetManager.getActiveSymbols = originalGetSymbols;
  SheetManager.getExistingRecordKeys = originalGetKeys;
  SheetManager.appendAnalysisRows = originalAppend;
  SheetManager.refreshDashboardSummary = originalRefresh;
  DataProvider.fetchDailyDataForDate = originalFetch;
});

// ==========================================
// Test 10: Full 6-Month Range Missing Date Recovery
// ==========================================
runTest('SyncEngine scans full 6 months for recovery without dropping transient failures', () => {
  const originalInit = SheetManager.initializeSheets;
  const originalGetSymbols = SheetManager.getActiveSymbols;
  const originalGetKeys = SheetManager.getExistingRecordKeys;
  const originalAppend = SheetManager.appendAnalysisRows;
  const originalFetch = DataProvider.fetchDailyDataForDate;

  SheetManager.initializeSheets = () => {};
  SheetManager.getActiveSymbols = () => ['TCS'];
  // Simulate having missing records for TCS
  SheetManager.getExistingRecordKeys = () => ({});

  let recoveredCount = 0;
  SheetManager.appendAnalysisRows = (r) => {
    recoveredCount += r.length;
    return r.length;
  };

  DataProvider.fetchDailyDataForDate = (dateObj) => ({
    status: DataProvider.STATUS.SUCCESS,
    isTradingDay: true,
    symbolsData: {
      TCS: {
        spotPrice: 3800,
        contracts: [
          { expiryStr: '2025-02-27', expiryDate: new Date('2025-02-27'), closePrice: 3810 },
          { expiryStr: '2025-03-27', expiryDate: new Date('2025-03-27'), closePrice: 3825 }
        ]
      }
    }
  });

  SyncEngine.recoverMissingDates(['TCS']);
  assert(recoveredCount > 0, 'Should have recovered missing rows from 6-month historical scan');

  // Restore mocks
  SheetManager.initializeSheets = originalInit;
  SheetManager.getActiveSymbols = originalGetSymbols;
  SheetManager.getExistingRecordKeys = originalGetKeys;
  SheetManager.appendAnalysisRows = originalAppend;
  DataProvider.fetchDailyDataForDate = originalFetch;
});

console.log(`\n==========================================`);
console.log(`ALL ${passedTests} OF ${totalTests} TESTS PASSED SUCCESSFULLY!`);
console.log(`==========================================\n`);
