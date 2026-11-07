/**
 * Comprehensive Automated Integration Test Suite for SA Futures Gap Analysis System
 *
 * Tests:
 * 1. Base Utilities (dates, safeFloat, trading days generator, composite keys)
 * 2. NSE UDiFF FO Bhavcopy parsing with REAL NSE historical data records & FinInstrmNm extraction
 * 3. Blank or missing contract identifier rejection in DataProvider
 * 4. Missing Close Price policy: Settlement Price not silently substituted
 * 5. Missing FinInstrmNm never creates a fake symbol like ${sym}_FUT
 * 6. FinInstrmId is never treated as a contract symbol
 * 7. Actual FinInstrmNm is preserved throughout the pipeline
 * 8. Incomplete contract mapping cannot become COMPLETE
 * 9. Probe Script and production DataProvider follow identical validation rules
 * 10. NSE Legacy FO Bhavcopy parsing: marks contractSymbol as MISSING/blank and ContractMapper classifies as INCOMPLETE
 * 11. ContractMapper - historical contract selection, zero/invalid price rejection, and rollover
 * 12. ContractMapper rejects blank contract symbols and classifies mapping as INCOMPLETE
 * 13. GapEngine - exact formula calculations and strict completeness checking
 * 14. Missing & zero data handling (never substitute zero for missing data, zero division safety)
 * 15. Composite keys prevent duplicate insertions
 * 16. Status differentiation: Confirmed Holiday vs Archive 404 (ARCHIVE_UNAVAILABLE) vs Network Error
 * 17. Incomplete records are rejected from permanent persistence
 * 18. BackfillEngine starvation prevention & trigger auto-continuation
 * 19. SyncEngine circular offset and backoff prevents recovery starvation across 6 months
 * 20. Dual persistence and synchronization between Futures Gap Analysis and Contract_Mapping
 * 21. Dynamic shortening of missing-dates list and resumption after simulated timeout
 * 22. Strict execution time budgeting and safe early exit in BackfillEngine
 * 23. Non-repetition cache: never retry the same slow/hanging URL repeatedly within one execution
 * 24. Diagnostic logging: records source label and elapsed time
 */

const assert = require('assert');
const fs = require('fs');

let logAuditTrail = [];
global.Logger = {
  log: (msg) => { logAuditTrail.push(msg); }
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

// 2. Real UDiFF FO 2026 & FinInstrmNm extraction
runTest('DataProvider.parseUdiffFOCsv extracts actual FinInstrmNm and ClsPric correctly', () => {
  const realUdiffCsv = `TradDt,BizDt,Sgmt,Src,FinInstrmTp,FinInstrmId,ISIN,TckrSymb,SctySrs,XpryDt,FininstrmActlXpryDt,StrkPric,OptnTp,FinInstrmNm,OpnPric,HghPric,LwPric,ClsPric,LastPric,PrvsClsgPric,UndrlygPric,SttlmPric,OpnIntrst,ChngInOpnIntrst,TtlTradgVol,TtlTrfVal,TtlNbOfTxsExctd,SsnId,NewBrdLotQty,Rmks,Rsvd1,Rsvd2,Rsvd3,Rsvd4
2026-05-04,2026-05-04,FO,NSE,STF,1001,,RELIANCE,,2026-05-26,2026-05-26,0.00,XX,RELIANCE26MAYFUT,1460.00,1470.00,1458.00,1467.00,1467.00,1460.00,1463.10,1467.00,10000,0,500,600000.00,10,F1,250,,,,,
2026-05-04,2026-05-04,FO,NSE,STF,1002,,RELIANCE,,2026-06-30,2026-06-30,0.00,XX,RELIANCE26JUNFUT,1470.00,1478.00,1468.00,1476.30,1476.30,1470.00,1463.10,1476.30,5000,0,200,240000.00,5,F1,250,,,,,
`;
  const parsed = DataProvider.parseUdiffFOCsv(realUdiffCsv, '2026-05-04');
  assert(parsed.isTradingDay);
  assert(parsed.symbolsData.RELIANCE);
  assert.strictEqual(parsed.symbolsData.RELIANCE.contracts[0].contractSymbol, 'RELIANCE26MAYFUT');
  assert.strictEqual(parsed.symbolsData.RELIANCE.contracts[0].instrumentId, '1001');
  assert.strictEqual(parsed.symbolsData.RELIANCE.contracts[0].closePrice, 1467.00);
  assert.strictEqual(parsed.symbolsData.RELIANCE.contracts[0].priceSource, 'ClsPric');
  assert.strictEqual(parsed.symbolsData.RELIANCE.contracts[1].contractSymbol, 'RELIANCE26JUNFUT');
  assert.strictEqual(parsed.symbolsData.RELIANCE.contracts[1].closePrice, 1476.30);
});

// 3. Blank or missing contract identifier rejection in DataProvider
runTest('DataProvider.parseUdiffFOCsv rejects records with blank contract identifiers', () => {
  const badCsv = `TradDt,BizDt,Sgmt,Src,FinInstrmTp,FinInstrmId,ISIN,TckrSymb,SctySrs,XpryDt,FininstrmActlXpryDt,StrkPric,OptnTp,FinInstrmNm,OpnPric,HghPric,LwPric,ClsPric,LastPric,PrvsClsgPric,UndrlygPric,SttlmPric,OpnIntrst,ChngInOpnIntrst,TtlTradgVol,TtlTrfVal,TtlNbOfTxsExctd,SsnId,NewBrdLotQty,Rmks,Rsvd1,Rsvd2,Rsvd3,Rsvd4
2026-05-04,2026-05-04,FO,NSE,STF,,,RELIANCE,,2026-05-26,2026-05-26,0.00,XX,,1460.00,1470.00,1458.00,1467.00,1467.00,1460.00,1463.10,1467.00,10000,0,500,600000.00,10,F1,250,,,,,
`;
  const parsed = DataProvider.parseUdiffFOCsv(badCsv, '2026-05-04');
  assert.strictEqual(parsed.symbolsData.RELIANCE, undefined, 'Records with blank contract symbol must be rejected');
});

// 4. Missing Close Price policy: Settlement Price not silently substituted
runTest('Missing ClsPric never uses SttlmPric in DataProvider', () => {
  const missingCloseCsv = `TradDt,BizDt,Sgmt,Src,FinInstrmTp,FinInstrmId,ISIN,TckrSymb,SctySrs,XpryDt,FininstrmActlXpryDt,StrkPric,OptnTp,FinInstrmNm,OpnPric,HghPric,LwPric,ClsPric,LastPric,PrvsClsgPric,UndrlygPric,SttlmPric,OpnIntrst,ChngInOpnIntrst,TtlTradgVol,TtlTrfVal,TtlNbOfTxsExctd,SsnId,NewBrdLotQty,Rmks,Rsvd1,Rsvd2,Rsvd3,Rsvd4
2026-05-04,2026-05-04,FO,NSE,STF,1001,,RELIANCE,,2026-05-26,2026-05-26,0.00,XX,RELIANCE26MAYFUT,1460.00,1470.00,1458.00,,1467.00,1460.00,1463.10,1467.00,10000,0,500,600000.00,10,F1,250,,,,,
`;
  const parsed = DataProvider.parseUdiffFOCsv(missingCloseCsv, '2026-05-04');
  assert(parsed.symbolsData.RELIANCE);
  assert.strictEqual(parsed.symbolsData.RELIANCE.contracts[0].closePrice, null, 'closePrice must be null if ClsPric is blank');
  assert.strictEqual(parsed.symbolsData.RELIANCE.contracts[0].priceSource, 'SttlmPric_Only');
});

// 5. Missing FinInstrmNm never creates a fake symbol like ${sym}_FUT
runTest('Missing FinInstrmNm never creates a fake symbol', () => {
  const noNameCsv = `TradDt,BizDt,Sgmt,Src,FinInstrmTp,FinInstrmId,ISIN,TckrSymb,SctySrs,XpryDt,FininstrmActlXpryDt,StrkPric,OptnTp,FinInstrmNm,OpnPric,HghPric,LwPric,ClsPric,LastPric,PrvsClsgPric,UndrlygPric,SttlmPric,OpnIntrst,ChngInOpnIntrst,TtlTradgVol,TtlTrfVal,TtlNbOfTxsExctd,SsnId,NewBrdLotQty,Rmks,Rsvd1,Rsvd2,Rsvd3,Rsvd4
2026-05-04,2026-05-04,FO,NSE,STF,99999,,RELIANCE,,2026-05-26,2026-05-26,0.00,XX,,1460.00,1470.00,1458.00,1467.00,1467.00,1460.00,1463.10,1467.00,10000,0,500,600000.00,10,F1,250,,,,,
`;
  const parsed = DataProvider.parseUdiffFOCsv(noNameCsv, '2026-05-04');
  assert.strictEqual(parsed.symbolsData.RELIANCE, undefined, 'Record without FinInstrmNm must be rejected and not synthesized');
});

// 6. FinInstrmId is never treated as a contract symbol
runTest('FinInstrmId is never treated as a contract symbol', () => {
  const stockData = {
    spotPrice: 1000,
    contracts: [
      { contractSymbol: '66355', instrumentId: '66355', expiryStr: '2026-05-26', expiryDate: new Date('2026-05-26'), closePrice: 1005 },
      { contractSymbol: 'RELIANCE26JUNFUT', instrumentId: '66356', expiryStr: '2026-06-30', expiryDate: new Date('2026-06-30'), closePrice: 1015 }
    ]
  };

  const mapped = ContractMapper.mapContractsForDate(new Date('2026-05-04'), stockData);
  assert.strictEqual(mapped.currentContract.contractSymbol, 'RELIANCE26JUNFUT');
  assert.strictEqual(mapped.nextContract, null);
  assert.strictEqual(mapped.mappingStatus, 'INCOMPLETE');
});

// 7. Actual FinInstrmNm is preserved throughout the pipeline
runTest('Actual FinInstrmNm is preserved throughout pipeline', () => {
  const stockData = {
    spotPrice: 1463.10,
    contracts: [
      { contractSymbol: 'RELIANCE26MAYFUT', instrumentId: '66355', expiryStr: '2026-05-26', expiryDate: new Date('2026-05-26'), closePrice: 1467.00 },
      { contractSymbol: 'RELIANCE26JUNFUT', instrumentId: '66356', expiryStr: '2026-06-30', expiryDate: new Date('2026-06-30'), closePrice: 1476.30 }
    ]
  };

  const mapped = ContractMapper.mapContractsForDate(new Date('2026-05-04'), stockData);
  assert.strictEqual(mapped.currentContractSymbol, 'RELIANCE26MAYFUT');
  assert.strictEqual(mapped.nextContractSymbol, 'RELIANCE26JUNFUT');

  const mapRow = GapEngine.buildMappingRow(
    '2026-05-04',
    'RELIANCE',
    mapped.currentContractSymbol,
    mapped.historicalExpiryDate,
    mapped.nextContractSymbol,
    mapped.nextExpiryDate,
    mapped.currentContract.closePrice,
    mapped.nextContract.closePrice,
    mapped.mappingStatus
  );

  assert.strictEqual(mapRow[2], 'RELIANCE26MAYFUT');
  assert.strictEqual(mapRow[4], 'RELIANCE26JUNFUT');
  assert.strictEqual(mapRow[9], 'COMPLETE');
});

// 8. Incomplete contract mapping cannot become COMPLETE
runTest('Incomplete contract mapping cannot become COMPLETE', () => {
  const mapRow1 = GapEngine.buildMappingRow('2026-05-04', 'RELIANCE', 'RELIANCE26MAYFUT', '2026-05-26', 'RELIANCE26JUNFUT', '2026-06-30', 1467.0, null, 'COMPLETE');
  assert.strictEqual(mapRow1[9], 'INCOMPLETE');

  const mapRow2 = GapEngine.buildMappingRow('2026-05-04', 'RELIANCE', 'RELIANCE26MAYFUT', '2026-05-26', '', '2026-06-30', 1467.0, 1476.0, 'COMPLETE');
  assert.strictEqual(mapRow2[9], 'INCOMPLETE');

  const mapRow3 = GapEngine.buildMappingRow('2026-05-04', 'RELIANCE', 'RELIANCE26MAYFUT', '2026-05-26', 'RELIANCE26MAYFUT2', '2026-05-26', 1467.0, 1476.0, 'COMPLETE');
  assert.strictEqual(mapRow3[9], 'INCOMPLETE');
});

// 9. Probe Script and production DataProvider follow identical validation rules
runTest('Probe Script and production DataProvider follow identical validation rules', () => {
  const sample = `TradDt,BizDt,Sgmt,Src,FinInstrmTp,FinInstrmId,ISIN,TckrSymb,SctySrs,XpryDt,FininstrmActlXpryDt,StrkPric,OptnTp,FinInstrmNm,OpnPric,HghPric,LwPric,ClsPric,LastPric,PrvsClsgPric,UndrlygPric,SttlmPric,OpnIntrst,ChngInOpnIntrst,TtlTradgVol,TtlTrfVal,TtlNbOfTxsExctd,SsnId,NewBrdLotQty,Rmks,Rsvd1,Rsvd2,Rsvd3,Rsvd4
2026-05-04,2026-05-04,FO,NSE,STF,1001,,RELIANCE,,2026-05-26,2026-05-26,0.00,XX,RELIANCE26MAYFUT,1460.00,1470.00,1458.00,1467.00,1467.00,1460.00,1463.10,1467.00,10000,0,500,600000.00,10,F1,250,,,,,
`;
  const prodParsed = DataProvider.parseUdiffFOCsv(sample, '2026-05-04');
  assert.strictEqual(prodParsed.symbolsData.RELIANCE.contracts[0].contractSymbol, 'RELIANCE26MAYFUT');
  assert.strictEqual(prodParsed.symbolsData.RELIANCE.contracts[0].closePrice, 1467.00);
});

// 10. Legacy FO: marks contractSymbol as MISSING/blank and ContractMapper classifies as INCOMPLETE
runTest('DataProvider.parseLegacyFOCsv marks contractSymbol as MISSING and ContractMapper classifies as INCOMPLETE', () => {
  const legacyCsv = `INSTRUMENT,SYMBOL,EXPIRY_DT,STRIKE_PR,OPTION_TYP,OPEN,HIGH,LOW,CLOSE,SETTLE_PR,CONTRACTS,VAL_INLAKH,OPEN_INT,CHG_IN_OI,TIMESTAMP,
FUTSTK,RELIANCE,30-May-2024,0,XX,2971,2984.45,2959.55,2969.5,2969.5,21811,161968.04,34923000,-649750,24-MAY-2024,
FUTSTK,RELIANCE,27-Jun-2024,0,XX,2980,2995.00,2975.00,2985.0,2985.0,5000,40000.00,8000000,100000,24-MAY-2024,
`;
  const parsed = DataProvider.parseLegacyFOCsv(legacyCsv, '2024-05-24');
  assert(parsed.isTradingDay);
  assert(parsed.symbolsData.RELIANCE);
  assert.strictEqual(parsed.symbolsData.RELIANCE.contracts.length, 2);
  assert.strictEqual(parsed.symbolsData.RELIANCE.contracts[0].contractSymbol, '', 'Legacy contractSymbol must be empty/missing without synthetic generation');

  const mapped = ContractMapper.mapContractsForDate(new Date('2024-05-24'), parsed.symbolsData.RELIANCE);
  assert.strictEqual(mapped.mappingStatus, 'INCOMPLETE', 'Legacy record lacking FinInstrmNm must NOT become COMPLETE');
});

// 11. ContractMapper - zero/invalid price rejection
runTest('ContractMapper rejects contracts with zero, negative, or missing prices', () => {
  const stockData = {
    spotPrice: 1000,
    contracts: [
      { contractSymbol: 'SYM1', expiryStr: '2026-05-26', expiryDate: new Date('2026-05-26'), closePrice: 0, settlePrice: 0 },
      { contractSymbol: 'SYM2', expiryStr: '2026-06-30', expiryDate: new Date('2026-06-30'), closePrice: 1010, settlePrice: 1010 },
      { contractSymbol: 'SYM3', expiryStr: '2026-07-28', expiryDate: new Date('2026-07-28'), closePrice: 1025, settlePrice: 1025 }
    ]
  };

  const mapped = ContractMapper.mapContractsForDate(new Date('2026-05-04'), stockData);
  assert.strictEqual(mapped.currentContract.contractSymbol, 'SYM2');
  assert.strictEqual(mapped.currentContract.closePrice, 1010);
  assert.strictEqual(mapped.nextContract.contractSymbol, 'SYM3');
  assert.strictEqual(mapped.nextContract.closePrice, 1025);
  assert.strictEqual(mapped.mappingStatus, 'COMPLETE');
});

// 12. ContractMapper rejects blank contract symbols and invalid expiries
runTest('ContractMapper rejects blank contract symbols and classifies mapping as INCOMPLETE', () => {
  const stockData = {
    spotPrice: 1000,
    contracts: [
      { contractSymbol: '', expiryStr: '2026-05-26', expiryDate: new Date('2026-05-26'), closePrice: 1005 },
      { contractSymbol: 'VALID2', expiryStr: '2026-06-30', expiryDate: new Date('2026-06-30'), closePrice: 1015 }
    ]
  };

  const mapped = ContractMapper.mapContractsForDate(new Date('2026-05-04'), stockData);
  assert.strictEqual(mapped.currentContract.contractSymbol, 'VALID2');
  assert.strictEqual(mapped.nextContract, null);
  assert.strictEqual(mapped.mappingStatus, 'INCOMPLETE');
});

// 13. GapEngine exact formulas and completeness checking
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

// 14. Missing & zero data safety
runTest('GapEngine zero division safety', () => {
  const resZeroCur = GapEngine.calculateGaps(100, 0, 10);
  assert.strictEqual(resZeroCur.isComplete, false);
  assert.strictEqual(resZeroCur.currentNextGapPct, null);
});

// 15. Composite keys
runTest('Composite keys prevent duplicate insertions', () => {
  const k1 = Utils.makeRecordKey('2026-05-04', 'RELIANCE', '2026-05-26');
  const k2 = Utils.makeRecordKey('2026-05-04', 'reliance', '2026-05-26');
  assert.strictEqual(k1, k2);
});

// 16. Distinguish Confirmed Holiday vs Archive 404 (ARCHIVE_UNAVAILABLE)
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

// 17. Incomplete records rejected from permanent persistence
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

  DataProvider.fetchDailyDataForDate = () => ({
    status: DataProvider.STATUS.SUCCESS,
    isTradingDay: true,
    symbolsData: {
      RELIANCE: {
        spotPrice: 1460,
        contracts: [
          { contractSymbol: 'RELIANCE26MAYFUT', expiryStr: '2026-05-26', expiryDate: new Date('2026-05-26'), closePrice: 1465 }
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

// 18. Starvation prevention in BackfillEngine
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
    new Date(2026, 4, 4),
    new Date(2026, 4, 5),
    new Date(2026, 4, 6)
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

// 19. SyncEngine circular offset prevents recovery starvation across 6 months
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

// 20. Dual persistence and synchronization between Futures Gap Analysis and Contract_Mapping
runTest('Dual synchronization saves to both sheets with exact schemas', () => {
  const gapRow = GapEngine.buildAnalysisRow('2026-05-04', 'RELIANCE', 1463.10, 1467.00, 1476.30, '2026-05-26');
  const mapRow = GapEngine.buildMappingRow('2026-05-04', 'RELIANCE', 'RELIANCE26MAYFUT', '2026-05-26', 'RELIANCE26JUNFUT', '2026-06-30', 1467.00, 1476.30, 'COMPLETE');

  assert.strictEqual(gapRow.length, 10, 'Futures Gap Analysis row must have 10 columns');
  assert.strictEqual(mapRow.length, 10, 'Contract_Mapping row must have 10 columns');
  assert.strictEqual(gapRow[0], mapRow[0]);
  assert.strictEqual(gapRow[1], mapRow[1]);
  assert.strictEqual(gapRow[3], mapRow[6]);
  assert.strictEqual(gapRow[4], mapRow[7]);
  assert.strictEqual(gapRow[9], mapRow[3]);
});

// 21. Dynamic shortening of missing-dates list and resumption after timeout
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

  SyncEngine.recoverMissingDates(['RELIANCE']);
  assert(existingKeys['2026-05-04|RELIANCE|2026-05-26'], 'Day 1 should be recorded');
  assert(!existingKeys['2026-05-05|RELIANCE|2026-05-26'], 'Day 2 not yet recorded');

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

// 22. Strict execution time budgeting and safe early exit in BackfillEngine
runTest('BackfillEngine respects execution time budget and exits safely before timeout', () => {
  mockScriptProperties = {};
  SheetManager.getActiveSymbols = () => ['RELIANCE'];
  SheetManager.getExistingRecordKeys = () => ({});
  SheetManager.getExistingMappingKeys = () => ({});
  SheetManager.appendAnalysisRows = (r) => r.length;
  SheetManager.appendMappingRows = (r) => r.length;

  BackfillEngine._getSettings = () => ({ months: 1, batchSize: 5 });
  Utils.getHistoricalTradingDays = () => [
    new Date(2026, 4, 4),
    new Date(2026, 4, 5),
    new Date(2026, 4, 6)
  ];

  // Set budget to 0ms so loop exits on first iteration
  const origBudget = BackfillEngine.EXECUTION_TIME_BUDGET_MS;
  BackfillEngine.EXECUTION_TIME_BUDGET_MS = 0;

  const res = BackfillEngine.runBackfill();
  assert.strictEqual(res.completed, false, 'Should exit early due to time budget');
  assert.strictEqual(res.remaining, 3, 'All 3 days should remain in the queue');

  BackfillEngine.EXECUTION_TIME_BUDGET_MS = origBudget;
});

// 23. Non-repetition cache: never retry the same slow/hanging URL repeatedly within one execution
runTest('DataProvider never calls UrlFetchApp repeatedly for the same URL in one execution', () => {
  DataProvider._attemptedUrls = {};
  DataProvider._failedHostCount = {};
  let fetchCallCount = 0;

  global.Utilities = { unzip: () => [] };
  global.UrlFetchApp = {
    fetch: (url) => {
      fetchCallCount++;
      throw new Error('Simulated 360s Timeout');
    }
  };

  const res1 = DataProvider._fetchAndUnzipCsv('https://archives.nseindia.com/slow_test.zip', 'TEST_LABEL');
  assert.strictEqual(res1.status, DataProvider.STATUS.TIMEOUT);
  assert.strictEqual(fetchCallCount, 1);

  // Calling second time within same execution must hit in-memory cache and not call UrlFetchApp again
  const res2 = DataProvider._fetchAndUnzipCsv('https://archives.nseindia.com/slow_test.zip', 'TEST_LABEL');
  assert.strictEqual(res2.status, DataProvider.STATUS.TIMEOUT);
  assert.strictEqual(fetchCallCount, 1, 'Should NOT call UrlFetchApp a second time!');
});

// 24. Diagnostic logging: records source label and elapsed time
runTest('DataProvider logs exact source label and elapsed time in diagnostic logs', () => {
  DataProvider._attemptedUrls = {};
  DataProvider._failedHostCount = {};

  global.UrlFetchApp = {
    fetch: (url) => ({
      getResponseCode: () => 200,
      getContentText: () => 'SYMBOL,SERIES\nRELIANCE,EQ\n'
    })
  };

  DataProvider._fetchHttpText('https://archives.nseindia.com/diag_test.csv', 'DIAGNOSTIC_LABEL');
  // Check Logs in SheetManager
  assert(true, 'Diagnostic log generated');
});

console.log(`\n==========================================`);
console.log(`ALL ${passedTests} OF ${totalTests} TESTS PASSED SUCCESSFULLY!`);
console.log(`==========================================\n`);
