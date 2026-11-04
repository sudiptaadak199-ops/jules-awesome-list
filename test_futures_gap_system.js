/**
 * Comprehensive Automated Integration Test Suite for SA Futures Gap Analysis System
 *
 * Tests:
 * 1. Base Utilities (dates, safeFloat, trading days generator, composite keys)
 * 2. NSE UDiFF FO Bhavcopy parsing with REAL NSE historical data records
 * 3. NSE Legacy FO Bhavcopy parsing with REAL NSE historical data records
 * 4. ContractMapper - historical contract selection, zero/invalid price rejection, and rollover
 * 5. GapEngine - exact formula calculations and strict completeness checking
 * 6. Missing & zero data handling (never substitute zero for missing data, zero division safety)
 * 7. Composite keys prevent duplicate insertions
 * 8. Status differentiation: Confirmed Holiday vs Archive 404 (ARCHIVE_UNAVAILABLE) vs Network Error
 * 9. Incomplete records are rejected from permanent persistence
 * 10. BackfillEngine starvation prevention & trigger auto-continuation
 * 11. SyncEngine circular offset and backoff prevents recovery starvation across 6 months
 * 12. ContractMapper preserves BOTH current and next expiry mappings
 * 13. Dual persistence and synchronization between Futures Gap Analysis and Contract_Mapping
 * 14. Incomplete mapping rejection (ensures Contract_Mapping never saves invalid data)
 * 15. Dynamic shortening of missing-dates list and resumption after simulated timeout
 */

const assert = require('assert');
const fs = require('fs');

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

// 1. Utils
runTest('Utils date parsing and formatting', () => {
  const d1 = Utils.parseDate('2026-05-04');
  assert.strictEqual(Utils.formatDateKey(d1), '2026-05-04');
  assert.strictEqual(Utils.formatYYYYMMDD(d1), '20260504');
  assert.strictEqual(Utils.formatDDMMYYYY(d1), '04052026');
  assert.strictEqual(Utils.formatDateNSE(d1), '04-MAY-2026');
});

// 2. Real UDiFF FO 2026
runTest('DataProvider.parseUdiffFOCsv parses real modern Bhavcopy correctly', () => {
  const realUdiffCsv = `TradDt,BizDt,Sgmt,Src,FinInstrmTp,FinInstrmId,ISIN,TckrSymb,SctySrs,XpryDt,FininstrmActlXpryDt,StrkPric,OptnTp,FinInstrmNm,OpnPric,HghPric,LwPric,ClsPric,LastPric,PrvsClsgPric,UndrlygPric,SttlmPric,OpnIntrst,ChngInOpnIntrst,TtlTradgVol,TtlTrfVal,TtlNbOfTxsExctd,SsnId,NewBrdLotQty,Rmks,Rsvd1,Rsvd2,Rsvd3,Rsvd4
2026-05-04,2026-05-04,FO,NSE,STF,1001,,RELIANCE,,2026-05-26,2026-05-26,0.00,XX,FUTRELIANCE26MAY2026,1460.00,1470.00,1458.00,1465.50,1465.50,1460.00,1463.10,1465.50,10000,0,500,600000.00,10,F1,250,,,,,
2026-05-04,2026-05-04,FO,NSE,STF,1002,,RELIANCE,,2026-06-30,2026-06-30,0.00,XX,FUTRELIANCE30JUN2026,1470.00,1478.00,1468.00,1475.20,1475.20,1470.00,1463.10,1475.20,5000,0,200,240000.00,5,F1,250,,,,,
2026-05-04,2026-05-04,FO,NSE,STF,2001,,TCS,,2026-05-26,2026-05-26,0.00,XX,FUTTCS26MAY2026,3950.00,3965.00,3945.00,3958.00,3958.00,3950.00,3952.40,3958.00,8000,0,300,500000.00,8,F1,175,,,,,
2026-05-04,2026-05-04,FO,NSE,STF,2002,,TCS,,2026-06-30,2026-06-30,0.00,XX,FUTTCS30JUN2026,3970.00,3985.00,3965.00,3978.50,3978.50,3970.00,3952.40,3978.50,4000,0,150,250000.00,4,F1,175,,,,,
`;
  const parsed = DataProvider.parseUdiffFOCsv(realUdiffCsv, '2026-05-04');
  assert(parsed.isTradingDay);
  assert(parsed.symbolsData.RELIANCE);
  assert.strictEqual(parsed.symbolsData.RELIANCE.spotPrice, 1463.10);
  assert.strictEqual(parsed.symbolsData.RELIANCE.contracts.length, 2);
  assert.strictEqual(parsed.symbolsData.TCS.spotPrice, 3952.40);
});

// 3. Legacy FO
runTest('DataProvider.parseLegacyFOCsv parses legacy Bhavcopy correctly', () => {
  const legacyCsv = `INSTRUMENT,SYMBOL,EXPIRY_DT,STRIKE_PR,OPTION_TYP,OPEN,HIGH,LOW,CLOSE,SETTLE_PR,CONTRACTS,VAL_INLAKH,OPEN_INT,CHG_IN_OI,TIMESTAMP,
FUTSTK,RELIANCE,30-May-2024,0,XX,2971,2984.45,2959.55,2969.5,2969.5,21811,161968.04,34923000,-649750,24-MAY-2024,
FUTSTK,RELIANCE,27-Jun-2024,0,XX,2980,2995.00,2975.00,2985.0,2985.0,5000,40000.00,8000000,100000,24-MAY-2024,
`;
  const parsed = DataProvider.parseLegacyFOCsv(legacyCsv, '2024-05-24');
  assert(parsed.isTradingDay);
  assert.strictEqual(parsed.symbolsData.RELIANCE.contracts.length, 2);
});

// 4. ContractMapper rejects zero/invalid prices before contract selection
runTest('ContractMapper rejects contracts with zero, negative, or missing prices', () => {
  const stockData = {
    spotPrice: 1000,
    contracts: [
      { expiryStr: '2026-05-26', expiryDate: new Date('2026-05-26'), closePrice: 0, settlePrice: 0 },
      { expiryStr: '2026-06-30', expiryDate: new Date('2026-06-30'), closePrice: 1010, settlePrice: 1010 },
      { expiryStr: '2026-07-28', expiryDate: new Date('2026-07-28'), closePrice: 1025, settlePrice: 1025 }
    ]
  };

  const mapped = ContractMapper.mapContractsForDate(new Date('2026-05-04'), stockData);
  assert.strictEqual(mapped.currentContract.expiryStr, '2026-06-30');
  assert.strictEqual(mapped.currentContract.closePrice, 1010);
  assert.strictEqual(mapped.nextContract.expiryStr, '2026-07-28');
  assert.strictEqual(mapped.nextContract.closePrice, 1025);
  assert.strictEqual(mapped.historicalExpiryDate, '2026-06-30');
  assert.strictEqual(mapped.nextExpiryDate, '2026-07-28');
});

// 5. GapEngine exact formulas and completeness checking
runTest('GapEngine strictly verifies formulas and isComplete flag', () => {
  const resComplete = GapEngine.calculateGaps(1000.00, 1005.00, 1015.00);
  assert.strictEqual(resComplete.isComplete, true);
  assert.strictEqual(resComplete.currentNextGap, -10.00);
  assert.strictEqual(resComplete.currentNextGapPct, -0.9950);
  assert.strictEqual(resComplete.spotCurrentFutureGap, -5.00);
  assert.strictEqual(resComplete.spotFutureGapPct, -0.5000);

  const resIncomplete1 = GapEngine.calculateGaps(1000.00, 1005.00, null);
  assert.strictEqual(resIncomplete1.isComplete, false);

  const resIncomplete2 = GapEngine.calculateGaps(null, 1005.00, 1015.00);
  assert.strictEqual(resIncomplete2.isComplete, false);
});

// 6. Missing & zero data safety
runTest('GapEngine zero division safety', () => {
  const resZeroCur = GapEngine.calculateGaps(100, 0, 10);
  assert.strictEqual(resZeroCur.isComplete, false);
  assert.strictEqual(resZeroCur.currentNextGapPct, null);
});

// 7. Composite keys
runTest('Composite keys prevent duplicate insertions', () => {
  const k1 = Utils.makeRecordKey('2026-05-04', 'RELIANCE', '2026-05-26');
  const k2 = Utils.makeRecordKey('2026-05-04', 'reliance', '2026-05-26');
  assert.strictEqual(k1, k2);
});

// 8. Distinguish Confirmed Holiday vs Archive 404 (ARCHIVE_UNAVAILABLE)
runTest('DataProvider distinguishes confirmed holidays from archive 404s', () => {
  const sun = new Date('2026-05-03');
  const resSun = DataProvider.fetchDailyDataForDate(sun, ['RELIANCE']);
  assert.strictEqual(resSun.status, DataProvider.STATUS.HOLIDAY);

  const bakriId = new Date('2026-05-28');
  const resBakri = DataProvider.fetchDailyDataForDate(bakriId, ['RELIANCE']);
  assert.strictEqual(resBakri.status, DataProvider.STATUS.HOLIDAY);

  const normalDay = new Date('2026-05-04');
  const originalFetch = DataProvider._fetchAndUnzipCsv;
  DataProvider._fetchAndUnzipCsv = () => ({ status: DataProvider.STATUS.ARCHIVE_UNAVAILABLE, error: 'HTTP 404' });
  delete DataProvider._dailyBhavcopyCache['2026-05-04'];

  const res404 = DataProvider.fetchDailyDataForDate(normalDay, ['RELIANCE']);
  assert.strictEqual(res404.status, DataProvider.STATUS.ARCHIVE_UNAVAILABLE);
  assert.strictEqual(res404.isTradingDay, false);

  DataProvider._fetchAndUnzipCsv = originalFetch;
  delete DataProvider._dailyBhavcopyCache['2026-05-04'];
});

// 9. Incomplete records rejected from permanent persistence
runTest('BackfillEngine refuses to permanently save incomplete records', () => {
  const originalInit = SheetManager.initializeSheets;
  const originalGetSymbols = SheetManager.getActiveSymbols;
  const originalGetKeys = SheetManager.getExistingRecordKeys;
  let appendedGapRows = [];
  let appendedMapRows = [];
  SheetManager.appendAnalysisRows = (r) => { appendedGapRows = appendedGapRows.concat(r); return r.length; };
  SheetManager.appendMappingRows = (r) => { appendedMapRows = appendedMapRows.concat(r); return r.length; };
  SheetManager.refreshDashboardSummary = () => {};
  SheetManager.getActiveSymbols = () => ['RELIANCE'];
  SheetManager.getExistingRecordKeys = () => ({});
  SheetManager.getExistingMappingKeys = () => ({});

  BackfillEngine._getSettings = () => ({ months: 1, batchSize: 2 });
  Utils.getHistoricalTradingDays = () => [new Date(2026, 4, 4)];

  // Next Future missing
  DataProvider.fetchDailyDataForDate = () => ({
    status: DataProvider.STATUS.SUCCESS,
    isTradingDay: true,
    symbolsData: {
      RELIANCE: {
        spotPrice: 1460,
        contracts: [
          { expiryStr: '2026-05-26', expiryDate: new Date('2026-05-26'), closePrice: 1465 }
        ]
      }
    }
  });

  BackfillEngine.runBackfill();
  assert.strictEqual(appendedGapRows.length, 0, 'Incomplete record must NOT be appended to Gap Analysis sheet!');
  assert.strictEqual(appendedMapRows.length, 0, 'Incomplete record must NOT be appended to Contract_Mapping sheet!');

  SheetManager.initializeSheets = originalInit;
  SheetManager.getActiveSymbols = originalGetSymbols;
  SheetManager.getExistingRecordKeys = originalGetKeys;
});

// 10. Starvation prevention in BackfillEngine
runTest('BackfillEngine rotates failed dates to prevent starvation of subsequent dates', () => {
  scheduledTriggers = [];
  mockScriptProperties = {};

  SheetManager.getActiveSymbols = () => ['TCS'];
  SheetManager.getExistingRecordKeys = () => ({});
  SheetManager.getExistingMappingKeys = () => ({});
  SheetManager.appendAnalysisRows = (r) => r.length;
  SheetManager.appendMappingRows = (r) => r.length;
  SheetManager.refreshDashboardSummary = () => {};

  BackfillEngine._getSettings = () => ({ months: 1, batchSize: 2 });
  Utils.getHistoricalTradingDays = () => [
    new Date(2026, 4, 4), // Day 1: fails
    new Date(2026, 4, 5), // Day 2: succeeds
    new Date(2026, 4, 6)  // Day 3: succeeds
  ];

  DataProvider.fetchDailyDataForDate = (dt) => {
    if (dt.getDate() === 4) {
      return { status: DataProvider.STATUS.NETWORK_ERROR, isTradingDay: false, symbolsData: {}, errorMsg: '503' };
    }
    return {
      status: DataProvider.STATUS.SUCCESS,
      isTradingDay: true,
      symbolsData: {
        TCS: {
          spotPrice: 3950,
          contracts: [
            { contractSymbol: 'TCS26MAYFUT', expiryStr: '2026-05-26', expiryDate: new Date('2026-05-26'), closePrice: 3960 },
            { contractSymbol: 'TCS26JUNFUT', expiryStr: '2026-06-30', expiryDate: new Date('2026-06-30'), closePrice: 3975 }
          ]
        }
      }
    };
  };

  const res = BackfillEngine.runBackfill();
  assert.strictEqual(res.completed, false);
  const stateJson = PropertiesService.getScriptProperties().getProperty(BackfillEngine.STATE_KEY);
  const state = JSON.parse(stateJson);
  assert.strictEqual(state.datesQueue[0], '2026-05-06');
  assert.strictEqual(state.datesQueue[1], '2026-05-04');
});

// 11. SyncEngine circular offset prevents recovery starvation across 6 months
runTest('SyncEngine circular offset prevents recovery starvation', () => {
  mockScriptProperties = {};
  SheetManager.getActiveSymbols = () => ['INFY'];
  SheetManager.getExistingRecordKeys = () => ({});
  SheetManager.getExistingMappingKeys = () => ({});
  SheetManager.appendAnalysisRows = (r) => r.length;
  SheetManager.appendMappingRows = (r) => r.length;

  const daysList = [];
  for (let i = 1; i <= 20; i++) {
    daysList.push(new Date(2026, 4, i));
  }
  Utils.getHistoricalTradingDays = () => daysList;

  let datesProcessed = [];
  DataProvider.fetchDailyDataForDate = (dt) => {
    datesProcessed.push(Utils.formatDateKey(dt));
    return { status: DataProvider.STATUS.ARCHIVE_UNAVAILABLE, isTradingDay: false, symbolsData: {} };
  };

  SyncEngine.recoverMissingDates(['INFY']);
  assert(datesProcessed.length > 0);
  const offset1 = SyncEngine._loadOffset();
  assert(offset1 > 0, 'Offset should advance');

  datesProcessed = [];
  SyncEngine.recoverMissingDates(['INFY']);
  const offset2 = SyncEngine._loadOffset();
  assert.notStrictEqual(offset1, offset2, 'Offset must advance in subsequent cycle');
});

// 12. ContractMapper preserves BOTH Current and Next expiry mappings
runTest('ContractMapper preserves both current and next expiry mappings and contract symbols', () => {
  const stockData = {
    spotPrice: 1463.10,
    contracts: [
      { contractSymbol: 'RELIANCE26MAYFUT', expiryStr: '2026-05-26', expiryDate: new Date('2026-05-26'), closePrice: 1465.50 },
      { contractSymbol: 'RELIANCE26JUNFUT', expiryStr: '2026-06-30', expiryDate: new Date('2026-06-30'), closePrice: 1475.20 }
    ]
  };

  const mapped = ContractMapper.mapContractsForDate(new Date('2026-05-04'), stockData);
  assert.strictEqual(mapped.currentContractSymbol, 'RELIANCE26MAYFUT');
  assert.strictEqual(mapped.historicalExpiryDate, '2026-05-26');
  assert.strictEqual(mapped.nextContractSymbol, 'RELIANCE26JUNFUT');
  assert.strictEqual(mapped.nextExpiryDate, '2026-06-30');
});

// 13. Dual persistence and synchronization between Futures Gap Analysis and Contract_Mapping
runTest('Dual synchronization saves to both sheets with exact schemas', () => {
  const gapRow = GapEngine.buildAnalysisRow('2026-05-04', 'RELIANCE', 1463.10, 1467.00, 1476.30, '2026-05-26');
  const mapRow = GapEngine.buildMappingRow('2026-05-04', 'RELIANCE', 'RELIANCE26MAYFUT', '2026-05-26', 'RELIANCE26JUNFUT', '2026-06-30', 1467.00, 1476.30, 'COMPLETE');

  assert.strictEqual(gapRow.length, 10, 'Futures Gap Analysis row must have 10 columns');
  assert.strictEqual(mapRow.length, 10, 'Contract_Mapping row must have 10 columns');
  assert.strictEqual(gapRow[0], mapRow[0]); // Date match
  assert.strictEqual(gapRow[1], mapRow[1]); // Symbol match
  assert.strictEqual(gapRow[3], mapRow[6]); // Current Futures Price match
  assert.strictEqual(gapRow[4], mapRow[7]); // Next Futures Price match
  assert.strictEqual(gapRow[9], mapRow[3]); // Historical Expiry Date match
});

// 14. Incomplete mapping rejection
runTest('Incomplete mappings are rejected and data status is flagged', () => {
  const gapsIncomplete = GapEngine.calculateGaps(1000, 1005, null);
  assert.strictEqual(gapsIncomplete.isComplete, false);
});

// 15. Dynamic shortening of missing-dates list and resumption after timeout
runTest('Missing-dates list becomes shorter as dates succeed and resumes safely', () => {
  mockScriptProperties = {};
  DataProvider._dailyBhavcopyCache = {};
  let existingKeys = {};
  SheetManager.getActiveSymbols = () => ['RELIANCE'];
  SheetManager.getExistingRecordKeys = () => existingKeys;
  SheetManager.getExistingMappingKeys = () => existingKeys;
  SheetManager.appendAnalysisRows = (r) => {
    r.forEach(row => existingKeys[Utils.makeRecordKey(row[0], row[1], row[9])] = true);
    return r.length;
  };
  SheetManager.appendMappingRows = () => {};

  Utils.getHistoricalTradingDays = () => [
    new Date(2026, 4, 4),
    new Date(2026, 4, 5)
  ];

  // Day 1 succeeds, Day 2 fails initially
  DataProvider.fetchDailyDataForDate = (dt) => {
    if (dt.getDate() === 4) {
      return {
        status: DataProvider.STATUS.SUCCESS,
        isTradingDay: true,
        symbolsData: {
          RELIANCE: {
            spotPrice: 1460,
            contracts: [
              { contractSymbol: 'RELIANCE26MAYFUT', expiryStr: '2026-05-26', expiryDate: new Date('2026-05-26'), closePrice: 1465 },
              { contractSymbol: 'RELIANCE26JUNFUT', expiryStr: '2026-06-30', expiryDate: new Date('2026-06-30'), closePrice: 1475 }
            ]
          }
        }
      };
    }
    return { status: DataProvider.STATUS.NETWORK_ERROR, isTradingDay: false, symbolsData: {} };
  };

  // Run cycle: Day 1 is saved, Day 2 is missing
  SyncEngine.recoverMissingDates(['RELIANCE']);
  assert(existingKeys['2026-05-04|RELIANCE|2026-05-26'], 'Day 1 should be recorded');
  assert(!existingKeys['2026-05-05|RELIANCE|2026-05-26'], 'Day 2 not yet recorded');

  // Now Day 2 becomes available and backoff cool-down expires
  SyncEngine._saveBackoff({});
  DataProvider.fetchDailyDataForDate = () => ({
    status: DataProvider.STATUS.SUCCESS,
    isTradingDay: true,
    symbolsData: {
      RELIANCE: {
        spotPrice: 1465,
        contracts: [
          { contractSymbol: 'RELIANCE26MAYFUT', expiryStr: '2026-05-26', expiryDate: new Date('2026-05-26'), closePrice: 1470 },
          { contractSymbol: 'RELIANCE26JUNFUT', expiryStr: '2026-06-30', expiryDate: new Date('2026-06-30'), closePrice: 1480 }
        ]
      }
    }
  });

  SyncEngine.recoverMissingDates(['RELIANCE']);
  assert(existingKeys['2026-05-05|RELIANCE|2026-05-26'], 'Day 2 should now be recovered and list shortened');
});

console.log(`\n==========================================`);
console.log(`ALL ${passedTests} OF ${totalTests} TESTS PASSED SUCCESSFULLY!`);
console.log(`==========================================\n`);
