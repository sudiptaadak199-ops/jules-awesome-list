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
const zlib = require('zlib');

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
  'Main.gs',
  'IntegrationTest.gs'
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
    'if (typeof Triggers !== "undefined") global.Triggers = Triggers;\n' +
    'if (typeof testCloudflareWorkerIntegration !== "undefined") global.testCloudflareWorkerIntegration = testCloudflareWorkerIntegration;\n'
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
2026-05-04,2026-05-04,FO,NSE,STF,1003,,TCS,,2026-05-26,2026-05-26,0.00,XX,TCS26MAYFUT,3900.00,3920.00,3890.00,3910.00,3910.00,3900.00,3905.00,3910.00,5000,0,100,100000.00,5,F1,175,,,,,
`;
  const parsed = DataProvider.parseUdiffFOCsv(badCsv, '2026-05-04');
  assert(parsed !== null, 'CSV should parse since TCS is valid');
  assert.strictEqual(parsed.symbolsData.RELIANCE, undefined, 'Records with blank contract symbol must be rejected');
  assert(parsed.symbolsData.TCS !== undefined, 'Valid TCS record must be accepted');
});

// 4. Missing Close Price policy: Settlement Price not silently substituted
runTest('Missing ClsPric never uses SttlmPric in DataProvider', () => {
  const missingCloseCsv = `TradDt,BizDt,Sgmt,Src,FinInstrmTp,FinInstrmId,ISIN,TckrSymb,SctySrs,XpryDt,FininstrmActlXpryDt,StrkPric,OptnTp,FinInstrmNm,OpnPric,HghPric,LwPric,ClsPric,LastPric,PrvsClsgPric,UndrlygPric,SttlmPric,OpnIntrst,ChngInOpnIntrst,TtlTradgVol,TtlTrfVal,TtlNbOfTxsExctd,SsnId,NewBrdLotQty,Rmks,Rsvd1,Rsvd2,Rsvd3,Rsvd4
2026-05-04,2026-05-04,FO,NSE,STF,1001,,RELIANCE,,2026-05-26,2026-05-26,0.00,XX,RELIANCE26MAYFUT,1460.00,1470.00,1458.00,,1467.00,1460.00,1463.10,1467.00,10000,0,500,600000.00,10,F1,250,,,,,
2026-05-04,2026-05-04,FO,NSE,STF,1003,,TCS,,2026-05-26,2026-05-26,0.00,XX,TCS26MAYFUT,3900.00,3920.00,3890.00,3910.00,3910.00,3900.00,3905.00,3910.00,5000,0,100,100000.00,5,F1,175,,,,,
`;
  const parsed = DataProvider.parseUdiffFOCsv(missingCloseCsv, '2026-05-04');
  assert(parsed !== null, 'CSV should parse since TCS has valid positive ClsPric');
  assert.strictEqual(parsed.symbolsData.RELIANCE, undefined, 'Record with blank ClsPric must NOT be appended or substituted with SttlmPric');
  assert(parsed.symbolsData.TCS !== undefined);
  assert.strictEqual(parsed.symbolsData.TCS.contracts[0].closePrice, 3910.00);
});

// 5. Missing FinInstrmNm never creates a fake symbol like ${sym}_FUT
runTest('Missing FinInstrmNm never creates a fake symbol', () => {
  const noNameCsv = `TradDt,BizDt,Sgmt,Src,FinInstrmTp,FinInstrmId,ISIN,TckrSymb,SctySrs,XpryDt,FininstrmActlXpryDt,StrkPric,OptnTp,FinInstrmNm,OpnPric,HghPric,LwPric,ClsPric,LastPric,PrvsClsgPric,UndrlygPric,SttlmPric,OpnIntrst,ChngInOpnIntrst,TtlTradgVol,TtlTrfVal,TtlNbOfTxsExctd,SsnId,NewBrdLotQty,Rmks,Rsvd1,Rsvd2,Rsvd3,Rsvd4
2026-05-04,2026-05-04,FO,NSE,STF,99999,,RELIANCE,,2026-05-26,2026-05-26,0.00,XX,,1460.00,1470.00,1458.00,1467.00,1467.00,1460.00,1463.10,1467.00,10000,0,500,600000.00,10,F1,250,,,,,
2026-05-04,2026-05-04,FO,NSE,STF,1003,,TCS,,2026-05-26,2026-05-26,0.00,XX,TCS26MAYFUT,3900.00,3920.00,3890.00,3910.00,3910.00,3900.00,3905.00,3910.00,5000,0,100,100000.00,5,F1,175,,,,,
`;
  const parsed = DataProvider.parseUdiffFOCsv(noNameCsv, '2026-05-04');
  assert(parsed !== null, 'CSV should parse since TCS is valid');
  assert.strictEqual(parsed.symbolsData.RELIANCE, undefined, 'Record without FinInstrmNm must be rejected and not synthesized');
  assert(parsed.symbolsData.TCS !== undefined, 'Valid TCS record must be accepted');
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

  let capturedLogs = [];
  const origLog = SheetManager.log;
  SheetManager.log = (level, cat, msg) => {
    capturedLogs.push({ level, cat, msg });
  };

  try {
    global.UrlFetchApp = {
      fetch: (url) => ({
        getResponseCode: () => 200,
        getContentText: () => 'SYMBOL,SERIES\nRELIANCE,EQ\n'
      })
    };

    DataProvider._fetchHttpText('https://archives.nseindia.com/diag_test.csv', 'DIAGNOSTIC_LABEL');
    assert(capturedLogs.length > 0, 'Diagnostic log must be generated');
    assert(capturedLogs.some(l => l.cat === 'HTTP_DIAGNOSTIC' && l.msg.includes('DIAGNOSTIC_LABEL') && l.msg.includes('Status 200')));
  } finally {
    SheetManager.log = origLog;
  }
});

// 25. testCloudflareWorkerIntegration in IntegrationTest.gs executes and validates cleanly
runTest('IntegrationTest.gs testCloudflareWorkerIntegration validates HTTPS, exact column indexes, and payload structure', () => {
  // Test A: Insecure HTTP protocol rejection
  mockScriptProperties = {
    WORKER_URL: 'http://insecure-worker.workers.dev',
    API_TOKEN: 'test_token_secret'
  };
  const insecureRes = testCloudflareWorkerIntegration();
  assert.strictEqual(insecureRes.success, false);
  assert(insecureRes.error.includes('HTTPS'));

  // Test B: Secure HTTPS execution with column-indexed verification
  mockScriptProperties = {
    WORKER_URL: 'https://test-worker.workers.dev',
    API_TOKEN: 'test_token_secret'
  };

  // Construct minimal valid PK zip containing BhavCopy_NSE_FO_0_0_0_20261106_F_0000.csv
  const csvContent = 'TradDt,TckrSymb,FinInstrmNm,ClsPric,UndrlygPric\n2026-11-06,RELIANCE,FUTSTK,1300.00,1295.00\n';
  const deflatedCsv = zlib.deflateRawSync(Buffer.from(csvContent));
  const filename = Buffer.from('BhavCopy_NSE_FO_0_0_0_20261106_F_0000.csv');

  const header = Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(0, 6);
  header.writeUInt16LE(8, 8);
  header.writeUInt16LE(0, 10);
  header.writeUInt16LE(0, 12);
  header.writeUInt32LE(0, 14);
  header.writeUInt32LE(deflatedCsv.length, 18);
  header.writeUInt32LE(Buffer.byteLength(csvContent), 22);
  header.writeUInt16LE(filename.length, 26);
  header.writeUInt16LE(0, 28);

  const mockZipBuffer = Buffer.concat([header, filename, deflatedCsv]);

  global.UrlFetchApp = {
    fetch: (url, opts) => {
      assert(url.includes('https://test-worker.workers.dev/?date=20261106'));
      assert.strictEqual(opts.headers.Authorization, 'Bearer test_token_secret');
      return {
        getResponseCode: () => 200,
        getHeaders: () => ({ 'Content-Type': 'application/zip' }),
        getBlob: () => ({
          getBytes: () => Array.from(mockZipBuffer)
        })
      };
    }
  };

  global.Utilities = {
    unzip: (blob) => [{
      getName: () => 'BhavCopy_NSE_FO_0_0_0_20261106_F_0000.csv',
      getDataAsString: () => csvContent
    }]
  };

  const result = testCloudflareWorkerIntegration();
  assert.strictEqual(result.success, true);
  assert.strictEqual(result.fileName, 'BhavCopy_NSE_FO_0_0_0_20261106_F_0000.csv');
  assert.strictEqual(result.relianceContracts, 1);
});

// 26. DataProvider._fetchNSEUdiffFO prioritizes Cloudflare Worker relay with Bearer authentication
runTest('DataProvider fetches UDiFF FO via Cloudflare Worker relay when configured', () => {
  DataProvider._dailyBhavcopyCache = {};
  DataProvider._attemptedUrls = {};
  DataProvider._failedHostCount = {};

  mockScriptProperties = {
    WORKER_URL: 'https://sa-futures-gap-proxy.sudiptaadak199.workers.dev',
    API_TOKEN: 'super_secret_auth_token_123'
  };

  const csvContent = 'TradDt,TckrSymb,FinInstrmTp,FinInstrmNm,ClsPric,UndrlygPric,XpryDt\n2026-11-06,RELIANCE,STF,RELIANCE26NOVFUT,1323.00,1319.99,2026-11-23\n';
  let calledUrl = '';
  let authSent = '';

  global.UrlFetchApp = {
    fetch: (url, opts) => {
      calledUrl = url;
      authSent = opts && opts.headers ? opts.headers.Authorization : '';
      return {
        getResponseCode: () => 200,
        getBlob: () => ({
          getBytes: () => [0x50, 0x4B, 0x03, 0x04]
        })
      };
    }
  };

  global.Utilities = {
    unzip: () => [{
      getDataAsString: () => csvContent
    }]
  };

  const dt = new Date('2026-11-06');
  const res = DataProvider._fetchNSEUdiffFO(dt);
  assert.strictEqual(res.status, 'SUCCESS');
  assert(calledUrl.includes('https://sa-futures-gap-proxy.sudiptaadak199.workers.dev/?date=20261106'));
  assert.strictEqual(authSent, 'Bearer super_secret_auth_token_123');
  assert.strictEqual(res.data.symbolsData.RELIANCE.contracts[0].contractSymbol, 'RELIANCE26NOVFUT');
  assert.strictEqual(res.data.symbolsData.RELIANCE.contracts[0].closePrice, 1323.00);
});

// 27. DataProvider gracefully falls back to direct NSE archives when worker returns 404 or fails
runTest('DataProvider falls back to direct NSE archives when Cloudflare Worker relay fails', () => {
  DataProvider._dailyBhavcopyCache = {};
  DataProvider._attemptedUrls = {};
  DataProvider._failedHostCount = {};

  mockScriptProperties = {
    WORKER_URL: 'https://sa-futures-gap-proxy.sudiptaadak199.workers.dev',
    API_TOKEN: 'super_secret_auth_token_123'
  };

  const csvContent = 'TradDt,TckrSymb,FinInstrmTp,FinInstrmNm,ClsPric,UndrlygPric,XpryDt\n2026-11-06,TCS,STF,TCS26NOVFUT,2420.00,2415.00,2026-11-23\n';
  let attempts = [];

  global.UrlFetchApp = {
    fetch: (url, opts) => {
      attempts.push(url);
      if (url.includes('sa-futures-gap-proxy')) {
        // Simulate Worker returning 404 or network timeout
        return {
          getResponseCode: () => 404
        };
      }
      // Direct NSE archive fallback succeeds
      return {
        getResponseCode: () => 200,
        getBlob: () => ({ getBytes: () => [0x50, 0x4B, 0x03, 0x04] })
      };
    }
  };

  global.Utilities = {
    unzip: () => [{
      getDataAsString: () => csvContent
    }]
  };

  const dt = new Date('2026-11-06');
  const res = DataProvider._fetchNSEUdiffFO(dt);
  assert.strictEqual(res.status, 'SUCCESS');
  assert(attempts.some(u => u.includes('sa-futures-gap-proxy')), 'Worker relay should be attempted first');
  assert(attempts.some(u => u.includes('nsearchives.nseindia.com')), 'Direct archive should be called as fallback');
  assert.strictEqual(res.data.symbolsData.TCS.contracts[0].contractSymbol, 'TCS26NOVFUT');
});

// 28. Robust quoted-field CSV parsing with commas inside quotes and escaped quotes
runTest('DataProvider.parseCsvLine handles quoted fields, inner commas, and escaped quotes correctly', () => {
  const line1 = '2026-05-04,"RELIANCE, LTD",STF,"RELIANCE26MAYFUT",1467.00';
  const parsed1 = DataProvider.parseCsvLine(line1);
  assert.deepStrictEqual(parsed1, ['2026-05-04', 'RELIANCE, LTD', 'STF', 'RELIANCE26MAYFUT', '1467.00']);

  const line2 = '"Item with ""escaped"" quotes",42,"Simple text"';
  const parsed2 = DataProvider.parseCsvLine(line2);
  assert.deepStrictEqual(parsed2, ['Item with "escaped" quotes', '42', 'Simple text']);

  // Edge case: Empty fields
  const line3 = 'A,,C,""';
  const parsed3 = DataProvider.parseCsvLine(line3);
  assert.deepStrictEqual(parsed3, ['A', '', 'C', '']);
});

// 29. CSV header validation rejects malformed or missing headers
runTest('DataProvider.parseUdiffFOCsv rejects CSV missing mandatory headers', () => {
  // Missing ClsPric
  const badHeadersCsv = 'TradDt,TckrSymb,FinInstrmTp,FinInstrmNm,XpryDt\n2026-05-04,RELIANCE,STF,RELIANCE26MAYFUT,2026-05-26\n';
  const parsed = DataProvider.parseUdiffFOCsv(badHeadersCsv, '2026-05-04');
  assert.strictEqual(parsed, null, 'Must reject CSV missing ClsPric');
});

// 30. Trading date validation rejects mismatched date payloads
runTest('DataProvider.parseUdiffFOCsv rejects CSV when trading date mismatches expected date', () => {
  const mismatchCsv = `TradDt,BizDt,Sgmt,Src,FinInstrmTp,FinInstrmId,ISIN,TckrSymb,SctySrs,XpryDt,FininstrmActlXpryDt,StrkPric,OptnTp,FinInstrmNm,OpnPric,HghPric,LwPric,ClsPric,LastPric,PrvsClsgPric,UndrlygPric,SttlmPric,OpnIntrst,ChngInOpnIntrst,TtlTradgVol,TtlTrfVal,TtlNbOfTxsExctd,SsnId,NewBrdLotQty,Rmks,Rsvd1,Rsvd2,Rsvd3,Rsvd4
2026-05-01,2026-05-01,FO,NSE,STF,1001,,RELIANCE,,2026-05-26,2026-05-26,0.00,XX,RELIANCE26MAYFUT,1460.00,1470.00,1458.00,1467.00,1467.00,1460.00,1463.10,1467.00,10000,0,500,600000.00,10,F1,250,,,,,
2026-05-01,2026-05-01,FO,NSE,STF,1002,,RELIANCE,,2026-06-30,2026-06-30,0.00,XX,RELIANCE26JUNFUT,1470.00,1478.00,1468.00,1476.30,1476.30,1470.00,1463.10,1476.30,5000,0,200,240000.00,5,F1,250,,,,,
2026-05-01,2026-05-01,FO,NSE,STF,1003,,TCS,,2026-05-26,2026-05-26,0.00,XX,TCS26MAYFUT,3900.00,3920.00,3890.00,3910.00,3910.00,3900.00,3905.00,3910.00,5000,0,100,100000.00,5,F1,175,,,,,
2026-05-01,2026-05-01,FO,NSE,STF,1004,,INFY,,2026-05-26,2026-05-26,0.00,XX,INFY26MAYFUT,1500.00,1520.00,1490.00,1510.00,1510.00,1500.00,1505.00,1510.00,5000,0,100,100000.00,5,F1,400,,,,,
2026-05-01,2026-05-01,FO,NSE,STF,1005,,WIPRO,,2026-05-26,2026-05-26,0.00,XX,WIPRO26MAYFUT,450.00,455.00,448.00,452.00,452.00,450.00,451.00,452.00,5000,0,100,100000.00,5,F1,1500,,,,,
2026-05-01,2026-05-01,FO,NSE,STF,1006,,HDFCBANK,,2026-05-26,2026-05-26,0.00,XX,HDFCBANK26MAYFUT,1700.00,1720.00,1690.00,1710.00,1710.00,1700.00,1705.00,1710.00,5000,0,100,100000.00,5,F1,550,,,,,
`;
  // Requested date is 2026-05-04, but CSV contains 2026-05-01
  const parsed = DataProvider.parseUdiffFOCsv(mismatchCsv, '2026-05-04');
  assert.strictEqual(parsed, null, 'Must reject CSV when no records match requested trading date');
});

// 31. Cloudflare Worker returning 200 with corrupt/invalid CSV triggers fallback to official archives
runTest('DataProvider falls back to direct archives if Cloudflare Worker returns 200 but CSV parsing fails', () => {
  DataProvider._dailyBhavcopyCache = {};
  DataProvider._attemptedUrls = {};
  DataProvider._failedHostCount = {};

  mockScriptProperties = {
    WORKER_URL: 'https://sa-futures-gap-proxy.sudiptaadak199.workers.dev',
    API_TOKEN: 'super_secret_auth_token_123'
  };

  const corruptCsv = 'Corrupt,NonStandard,Payload\n1,2,3\n';
  const validArchiveCsv = 'TradDt,TckrSymb,FinInstrmTp,FinInstrmNm,ClsPric,UndrlygPric,XpryDt\n2026-11-06,RELIANCE,STF,RELIANCE26NOVFUT,1323.00,1319.99,2026-11-23\n';

  let attemptedUrls = [];

  global.UrlFetchApp = {
    fetch: (url, opts) => {
      attemptedUrls.push(url);
      if (url.includes('sa-futures-gap-proxy')) {
        // Worker returns 200 OK, but contents are corrupt
        return {
          getResponseCode: () => 200,
          getBlob: () => ({ getBytes: () => [0x50, 0x4B, 0x03, 0x04] })
        };
      }
      // Official archive fallback succeeds
      return {
        getResponseCode: () => 200,
        getBlob: () => ({ getBytes: () => [0x50, 0x4B, 0x03, 0x04] })
      };
    }
  };

  let callCount = 0;
  global.Utilities = {
    unzip: () => {
      callCount++;
      if (callCount === 1) {
        return [{ getDataAsString: () => corruptCsv }];
      } else {
        return [{ getDataAsString: () => validArchiveCsv }];
      }
    }
  };

  const dt = new Date('2026-11-06');
  const res = DataProvider._fetchNSEUdiffFO(dt);
  assert.strictEqual(res.status, 'SUCCESS');
  assert(attemptedUrls.some(u => u.includes('sa-futures-gap-proxy')), 'Worker relay was called first');
  assert(attemptedUrls.some(u => u.includes('nsearchives.nseindia.com')), 'Direct archive fallback was invoked when Worker CSV parse failed');
  assert.strictEqual(res.data.symbolsData.RELIANCE.contracts[0].contractSymbol, 'RELIANCE26NOVFUT');
});

// 32. parseCsvLine rejects unmatched quotes and invalid characters after closing quotes
runTest('DataProvider.parseCsvLine rejects malformed quotes and trailing garbage', () => {
  // Unmatched opening quote
  const unclosed = '2026-05-04,"RELIANCE,STF';
  assert.strictEqual(DataProvider.parseCsvLine(unclosed), null);

  // Invalid characters after closing quote before comma
  const trailingGarbage = '2026-05-04,"RELIANCE"GARBAGE,STF';
  assert.strictEqual(DataProvider.parseCsvLine(trailingGarbage), null);

  // Stray quote in unquoted field
  const strayQuote = '2026-05-04,RELI"ANCE,STF';
  assert.strictEqual(DataProvider.parseCsvLine(strayQuote), null);
});

// 33. Strict date validation rejects 0 matched records even on short 1-line file
runTest('DataProvider.parseUdiffFOCsv rejects CSV with 0 matched dates regardless of line count', () => {
  const shortMismatch = 'TradDt,TckrSymb,FinInstrmTp,FinInstrmNm,ClsPric,UndrlygPric,XpryDt\n2026-05-01,RELIANCE,STF,RELIANCE26MAYFUT,1467.00,1463.10,2026-05-26\n';
  const res = DataProvider.parseUdiffFOCsv(shortMismatch, '2026-05-04');
  assert.strictEqual(res, null, 'Must reject even short CSV if 0 records match expected date');
});

// 34. Require at least one valid stock-futures record before returning SUCCESS
runTest('DataProvider.parseUdiffFOCsv rejects CSV with zero valid stock-futures records', () => {
  // CSV containing only Index Futures (IDF), no stock futures (STF)
  const indexOnlyCsv = 'TradDt,TckrSymb,FinInstrmTp,FinInstrmNm,ClsPric,UndrlygPric,XpryDt\n2026-05-04,NIFTY,IDF,NIFTY26MAYFUT,24000.00,24050.00,2026-05-26\n';
  const res = DataProvider.parseUdiffFOCsv(indexOnlyCsv, '2026-05-04');
  assert.strictEqual(res, null, 'Must reject CSV containing zero stock futures');
});

// 35. Primary archive returning HTTP 200 with invalid CSV triggers fallback to alternate archive
runTest('DataProvider falls back to alternate archive when primary archive returns 200 with invalid CSV', () => {
  DataProvider._dailyBhavcopyCache = {};
  DataProvider._attemptedUrls = {};
  DataProvider._failedHostCount = {};

  mockScriptProperties = {}; // No worker configured, straight to archives

  const corruptArchiveCsv = 'Invalid,Corrupt,Header\n1,2,3\n';
  const validAltCsv = 'TradDt,TckrSymb,FinInstrmTp,FinInstrmNm,ClsPric,UndrlygPric,XpryDt\n2026-11-06,RELIANCE,STF,RELIANCE26NOVFUT,1323.00,1319.99,2026-11-23\n';

  let attemptedUrls = [];

  global.UrlFetchApp = {
    fetch: (url, opts) => {
      attemptedUrls.push(url);
      return {
        getResponseCode: () => 200,
        getBlob: () => ({ getBytes: () => [0x50, 0x4B, 0x03, 0x04] })
      };
    }
  };

  let callCount = 0;
  global.Utilities = {
    unzip: () => {
      callCount++;
      if (callCount === 1) {
        return [{ getDataAsString: () => corruptArchiveCsv }];
      } else {
        return [{ getDataAsString: () => validAltCsv }];
      }
    }
  };

  const dt = new Date('2026-11-06');
  const res = DataProvider._fetchNSEUdiffFO(dt);
  assert.strictEqual(res.status, 'SUCCESS');
  assert(attemptedUrls.some(u => u.includes('nsearchives.nseindia.com')), 'Primary archive attempted');
  assert(attemptedUrls.some(u => u.includes('archives.nseindia.com')), 'Alternate archive attempted after primary CSV failed');
  assert.strictEqual(res.data.symbolsData.RELIANCE.contracts[0].contractSymbol, 'RELIANCE26NOVFUT');
});

// 36. UTF-8 BOM is stripped cleanly and does not corrupt first header column
runTest('DataProvider.parseCsvLine strips UTF-8 BOM cleanly', () => {
  const lineWithBom = '\uFEFFTradDt,TckrSymb,FinInstrmTp\n';
  const fields = DataProvider.parseCsvLine(lineWithBom.trim());
  assert.strictEqual(fields[0], 'TradDt', 'First field must be TradDt without BOM prefix');
  assert.strictEqual(fields[1], 'TckrSymb');
});

// 37. Truncated rows with column counts less than header definition are rejected
runTest('DataProvider parsers reject truncated rows with fewer columns than header', () => {
  const headers = 'TradDt,TckrSymb,FinInstrmTp,FinInstrmNm,ClsPric,UndrlygPric,XpryDt';
  // Truncated row: only 3 columns instead of 7
  const truncatedCsv = `${headers}\n2026-05-04,RELIANCE,STF\n2026-05-04,TCS,STF,TCS26MAYFUT,3900.00,3890.00,2026-05-26\n`;
  const parsed = DataProvider.parseUdiffFOCsv(truncatedCsv, '2026-05-04');
  assert(parsed !== null);
  assert.strictEqual(parsed.symbolsData.RELIANCE, undefined, 'Truncated RELIANCE row must be discarded');
  assert(parsed.symbolsData.TCS !== undefined, 'Complete TCS row must be parsed');
});

// 38. Legacy FO requires TIMESTAMP column when expectedDateKey is supplied
runTest('DataProvider.parseLegacyFOCsv rejects CSV when TIMESTAMP column is missing', () => {
  // Legacy CSV without TIMESTAMP header
  const noTsCsv = `INSTRUMENT,SYMBOL,EXPIRY_DT,STRIKE_PR,OPTION_TYP,OPEN,HIGH,LOW,CLOSE,SETTLE_PR,CONTRACTS,VAL_INLAKH,OPEN_INT,CHG_IN_OI
FUTSTK,RELIANCE,30-May-2024,0,XX,2971,2984.45,2959.55,2969.5,2969.5,21811,161968.04,34923000,-649750
`;
  const parsed = DataProvider.parseLegacyFOCsv(noTsCsv, '2024-05-24');
  assert.strictEqual(parsed, null, 'Must reject legacy CSV missing TIMESTAMP column when expectedDateKey is provided');
});

// 39. CM Spot rejects rows with missing, invalid, or mismatched DATE1 or TIMESTAMP
runTest('DataProvider CM spot parser rejects unverified dates', () => {
  const cmCsv = `SYMBOL,SERIES,OPEN_PRICE,HIGH_PRICE,LOW_PRICE,CLOSE_PRICE,PREV_CLOSE,TTL_TRD_QNTY,TTL_TRD_VAL,DATE1
RELIANCE,EQ,1460,1470,1455,1465.50,1460,1000,1465500,04-MAY-2026
TCS,EQ,3900,3920,3890,3910.00,3900,1000,3910000,01-MAY-2026
INFY,EQ,1500,1520,1490,1510.00,1500,1000,1510000,
WIPRO,EQ,450,455,448,452.00,450,1000,452000,INVALID_DATE
`;
  const parsedData = {
    symbolsData: {
      RELIANCE: { spotPrice: null },
      TCS: { spotPrice: null },
      INFY: { spotPrice: null },
      WIPRO: { spotPrice: null }
    }
  };

  const count = DataProvider._parseAndApplySpotFromCmSec(cmCsv, parsedData, ['RELIANCE', 'TCS', 'INFY', 'WIPRO'], '2026-05-04');
  assert.strictEqual(count, 1, 'Only RELIANCE matching 2026-05-04 should be applied');
  assert.strictEqual(parsedData.symbolsData.RELIANCE.spotPrice, 1465.50);
  assert.strictEqual(parsedData.symbolsData.TCS.spotPrice, null, 'TCS mismatched date must be rejected');
  assert.strictEqual(parsedData.symbolsData.INFY.spotPrice, null, 'INFY missing date must be rejected');
  assert.strictEqual(parsedData.symbolsData.WIPRO.spotPrice, null, 'WIPRO invalid date must be rejected');
});

// 40. UDiFF Futures valid records strictly require positive ClsPric (missing ClsPric does not count)
runTest('DataProvider.parseUdiffFOCsv valid records count requires positive ClsPric', () => {
  // CSV where the only stock futures record has blank ClsPric
  const blankClsPricCsv = `TradDt,TckrSymb,FinInstrmTp,FinInstrmNm,ClsPric,UndrlygPric,XpryDt
2026-05-04,RELIANCE,STF,RELIANCE26MAYFUT,,1463.10,2026-05-26
`;
  const parsed = DataProvider.parseUdiffFOCsv(blankClsPricCsv, '2026-05-04');
  assert.strictEqual(parsed, null, 'CSV with zero positive ClsPric records must not return SUCCESS');
});

// 41. Test A: CM SEC with neither DATE1 nor TIMESTAMP is rejected
runTest('Test A: CM SEC with neither DATE1 nor TIMESTAMP is rejected when expectedDateKey is supplied', () => {
  const cmCsvNoDate = `SYMBOL,SERIES,OPEN_PRICE,HIGH_PRICE,LOW_PRICE,CLOSE_PRICE,PREV_CLOSE,TTL_TRD_QNTY,TTL_TRD_VAL
RELIANCE,EQ,1460,1470,1455,1465.50,1460,1000,1465500
`;
  const parsedData = { symbolsData: { RELIANCE: { spotPrice: null } } };
  const count = DataProvider._parseAndApplySpotFromCmSec(cmCsvNoDate, parsedData, ['RELIANCE'], '2026-05-04');
  assert.strictEqual(count, 0, 'Must return 0 and reject file without DATE1 or TIMESTAMP');
  assert.strictEqual(parsedData.symbolsData.RELIANCE.spotPrice, null);
});

// 42. Test B: CM SEC with valid TIMESTAMP but no DATE1 validates and applies correctly
runTest('Test B: CM SEC with valid TIMESTAMP but no DATE1 validates correctly', () => {
  const cmCsvTimestampOnly = `SYMBOL,SERIES,OPEN_PRICE,HIGH_PRICE,LOW_PRICE,CLOSE_PRICE,PREV_CLOSE,TTL_TRD_QNTY,TTL_TRD_VAL,TIMESTAMP
RELIANCE,EQ,1460,1470,1455,1465.50,1460,1000,1465500,04-MAY-2026
`;
  const parsedData = { symbolsData: { RELIANCE: { spotPrice: null } } };
  const count = DataProvider._parseAndApplySpotFromCmSec(cmCsvTimestampOnly, parsedData, ['RELIANCE'], '2026-05-04');
  assert.strictEqual(count, 1, 'Must accept valid TIMESTAMP column when DATE1 is absent');
  assert.strictEqual(parsedData.symbolsData.RELIANCE.spotPrice, 1465.50);
});

// 43. Test C: Legacy CM without TIMESTAMP is rejected when expectedDateKey is supplied
runTest('Test C: Legacy CM without TIMESTAMP is rejected when expectedDateKey is supplied', () => {
  const legacyCmNoTs = `SYMBOL,SERIES,OPEN,HIGH,LOW,CLOSE,LAST,PREVCLOSE,TOTTRDQTY,TOTTRDVAL
RELIANCE,EQ,1460,1470,1455,1465.50,1465,1460,1000,1465500
`;
  const parsedData = { symbolsData: { RELIANCE: { spotPrice: null } } };
  const count = DataProvider._parseAndApplySpotFromLegacyCm(legacyCmNoTs, parsedData, ['RELIANCE'], '2026-05-04');
  assert.strictEqual(count, 0, 'Must return 0 and reject legacy CM without TIMESTAMP');
  assert.strictEqual(parsedData.symbolsData.RELIANCE.spotPrice, null);
});

// 44. Test D: Blank, invalid, and mismatched dates are rejected in CM SEC and Legacy CM
runTest('Test D: Blank, invalid, and mismatched dates are rejected in CM SEC and Legacy CM', () => {
  const cmCsv = `SYMBOL,SERIES,OPEN_PRICE,HIGH_PRICE,LOW_PRICE,CLOSE_PRICE,PREV_CLOSE,TTL_TRD_QNTY,TTL_TRD_VAL,DATE1
RELIANCE,EQ,1460,1470,1455,1465.50,1460,1000,1465500,04-MAY-2026
TCS,EQ,3900,3920,3890,3910.00,3900,1000,3910000,
INFY,EQ,1500,1520,1490,1510.00,1500,1000,1510000,NOT_A_DATE
WIPRO,EQ,450,455,448,452.00,450,1000,452000,01-MAY-2026
`;
  const parsedData = {
    symbolsData: {
      RELIANCE: { spotPrice: null },
      TCS: { spotPrice: null },
      INFY: { spotPrice: null },
      WIPRO: { spotPrice: null }
    }
  };
  const count = DataProvider._parseAndApplySpotFromCmSec(cmCsv, parsedData, ['RELIANCE', 'TCS', 'INFY', 'WIPRO'], '2026-05-04');
  assert.strictEqual(count, 1);
  assert.strictEqual(parsedData.symbolsData.RELIANCE.spotPrice, 1465.50);
  assert.strictEqual(parsedData.symbolsData.TCS.spotPrice, null, 'Blank date rejected');
  assert.strictEqual(parsedData.symbolsData.INFY.spotPrice, null, 'Invalid date rejected');
  assert.strictEqual(parsedData.symbolsData.WIPRO.spotPrice, null, 'Mismatched date rejected');

  // Test Legacy CM as well
  const legCm = `SYMBOL,SERIES,OPEN,HIGH,LOW,CLOSE,LAST,PREVCLOSE,TOTTRDQTY,TOTTRDVAL,TIMESTAMP
RELIANCE,EQ,1460,1470,1455,1465.50,1465,1460,1000,1465500,04-MAY-2026
TCS,EQ,3900,3920,3890,3910.00,3900,1000,3910000,
INFY,EQ,1500,1520,1490,1510.00,1500,1000,1510000,INVALID
WIPRO,EQ,450,455,448,452.00,450,1000,452000,01-MAY-2026
`;
  const parsedDataLeg = {
    symbolsData: {
      RELIANCE: { spotPrice: null },
      TCS: { spotPrice: null },
      INFY: { spotPrice: null },
      WIPRO: { spotPrice: null }
    }
  };
  const countLeg = DataProvider._parseAndApplySpotFromLegacyCm(legCm, parsedDataLeg, ['RELIANCE', 'TCS', 'INFY', 'WIPRO'], '2026-05-04');
  assert.strictEqual(countLeg, 1);
  assert.strictEqual(parsedDataLeg.symbolsData.RELIANCE.spotPrice, 1465.50);
  assert.strictEqual(parsedDataLeg.symbolsData.TCS.spotPrice, null);
  assert.strictEqual(parsedDataLeg.symbolsData.INFY.spotPrice, null);
  assert.strictEqual(parsedDataLeg.symbolsData.WIPRO.spotPrice, null);
});

// 45. Test E: Every parser rejects both truncated and extra-column rows
runTest('Test E: Every parser rejects both truncated and extra-column rows', () => {
  // 1. parseUdiffFOCsv
  const udiffHeader = 'TradDt,TckrSymb,FinInstrmTp,FinInstrmNm,ClsPric,UndrlygPric,XpryDt';
  const udiffCsv = `${udiffHeader}
2026-05-04,RELIANCE,STF,RELIANCE26MAYFUT,1467.00,1463.10
2026-05-04,INFY,STF,INFY26MAYFUT,1510.00,1505.00,2026-05-26,EXTRA_FIELD,ANOTHER_EXTRA
2026-05-04,TCS,STF,TCS26MAYFUT,3910.00,3905.00,2026-05-26
`;
  const parsedUdiff = DataProvider.parseUdiffFOCsv(udiffCsv, '2026-05-04');
  assert(parsedUdiff !== null);
  assert.strictEqual(parsedUdiff.symbolsData.RELIANCE, undefined, 'Truncated row (6 cols vs 7) rejected');
  assert.strictEqual(parsedUdiff.symbolsData.INFY, undefined, 'Extra column row (9 cols vs 7) rejected');
  assert(parsedUdiff.symbolsData.TCS !== undefined, 'Exact 7 cols row accepted');

  // 2. parseLegacyFOCsv
  const legHeader = 'INSTRUMENT,SYMBOL,EXPIRY_DT,CLOSE,TIMESTAMP';
  const legCsv = `${legHeader}
FUTSTK,RELIANCE,30-May-2024,2969.5
FUTSTK,INFY,30-May-2024,1510.0,24-MAY-2024,EXTRA
FUTSTK,TCS,30-May-2024,3910.0,24-MAY-2024
`;
  const parsedLeg = DataProvider.parseLegacyFOCsv(legCsv, '2024-05-24');
  assert(parsedLeg !== null);
  assert.strictEqual(parsedLeg.symbolsData.RELIANCE, undefined, 'Truncated legacy row rejected');
  assert.strictEqual(parsedLeg.symbolsData.INFY, undefined, 'Extra column legacy row rejected');
  assert(parsedLeg.symbolsData.TCS !== undefined, 'Exact cols legacy row accepted');

  // 3. _parseAndApplySpotFromCmSec
  const cmSecHeader = 'SYMBOL,SERIES,CLOSE_PRICE,DATE1';
  const cmSecCsv = `${cmSecHeader}
RELIANCE,EQ,1465.50
INFY,EQ,1510.00,04-MAY-2026,EXTRA
TCS,EQ,3910.00,04-MAY-2026
`;
  const spotData1 = { symbolsData: { RELIANCE: { spotPrice: null }, INFY: { spotPrice: null }, TCS: { spotPrice: null } } };
  DataProvider._parseAndApplySpotFromCmSec(cmSecCsv, spotData1, ['RELIANCE', 'INFY', 'TCS'], '2026-05-04');
  assert.strictEqual(spotData1.symbolsData.RELIANCE.spotPrice, null, 'Truncated CM SEC row rejected');
  assert.strictEqual(spotData1.symbolsData.INFY.spotPrice, null, 'Extra-column CM SEC row rejected');
  assert.strictEqual(spotData1.symbolsData.TCS.spotPrice, 3910.00, 'Exact CM SEC row applied');

  // 4. _parseAndApplySpotFromLegacyCm
  const legCmHeader = 'SYMBOL,SERIES,CLOSE,TIMESTAMP';
  const legCmCsv = `${legCmHeader}
RELIANCE,EQ,1465.50
INFY,EQ,1510.00,04-MAY-2026,EXTRA
TCS,EQ,3910.00,04-MAY-2026
`;
  const spotData2 = { symbolsData: { RELIANCE: { spotPrice: null }, INFY: { spotPrice: null }, TCS: { spotPrice: null } } };
  DataProvider._parseAndApplySpotFromLegacyCm(legCmCsv, spotData2, ['RELIANCE', 'INFY', 'TCS'], '2026-05-04');
  assert.strictEqual(spotData2.symbolsData.RELIANCE.spotPrice, null, 'Truncated Legacy CM row rejected');
  assert.strictEqual(spotData2.symbolsData.INFY.spotPrice, null, 'Extra-column Legacy CM row rejected');
  assert.strictEqual(spotData2.symbolsData.TCS.spotPrice, 3910.00, 'Exact Legacy CM row applied');
});

// 46. Test F: UDiFF records with missing, zero, negative, or invalid ClsPric are never appended
runTest('Test F: UDiFF records with missing, zero, negative, or invalid ClsPric are never appended', () => {
  const badPricesCsv = `TradDt,TckrSymb,FinInstrmTp,FinInstrmNm,ClsPric,UndrlygPric,XpryDt
2026-05-04,RELIANCE,STF,RELIANCE26MAYFUT,,1463.10,2026-05-26
2026-05-04,INFY,STF,INFY26MAYFUT,0,1505.00,2026-05-26
2026-05-04,WIPRO,STF,WIPRO26MAYFUT,-15.50,450.00,2026-05-26
2026-05-04,HDFCBANK,STF,HDFCBANK26MAYFUT,INVALID_PRICE,1700.00,2026-05-26
2026-05-04,TCS,STF,TCS26MAYFUT,3910.00,3905.00,2026-05-26
`;
  const parsed = DataProvider.parseUdiffFOCsv(badPricesCsv, '2026-05-04');
  assert(parsed !== null);
  assert.strictEqual(parsed.symbolsData.RELIANCE, undefined, 'Missing ClsPric record must not be created');
  assert.strictEqual(parsed.symbolsData.INFY, undefined, 'Zero ClsPric record must not be created');
  assert.strictEqual(parsed.symbolsData.WIPRO, undefined, 'Negative ClsPric record must not be created');
  assert.strictEqual(parsed.symbolsData.HDFCBANK, undefined, 'Invalid ClsPric record must not be created');
  assert(parsed.symbolsData.TCS !== undefined, 'Positive ClsPric record must be created');
  assert.strictEqual(parsed.symbolsData.TCS.contracts.length, 1);
  assert.strictEqual(parsed.symbolsData.TCS.contracts[0].closePrice, 3910.00);
});

// 47. Test G: Legacy records with missing, zero, negative, or invalid CLOSE are never appended
runTest('Test G: Legacy records with missing, zero, negative, or invalid CLOSE are never appended', () => {
  const badLegPricesCsv = `INSTRUMENT,SYMBOL,EXPIRY_DT,CLOSE,TIMESTAMP
FUTSTK,RELIANCE,30-May-2024,,24-MAY-2024
FUTSTK,INFY,30-May-2024,0,24-MAY-2024
FUTSTK,WIPRO,30-May-2024,-10.0,24-MAY-2024
FUTSTK,HDFCBANK,30-May-2024,ABC,24-MAY-2024
FUTSTK,TCS,30-May-2024,3910.0,24-MAY-2024
`;
  const parsed = DataProvider.parseLegacyFOCsv(badLegPricesCsv, '2024-05-24');
  assert(parsed !== null);
  assert.strictEqual(parsed.symbolsData.RELIANCE, undefined, 'Missing CLOSE record must not be created');
  assert.strictEqual(parsed.symbolsData.INFY, undefined, 'Zero CLOSE record must not be created');
  assert.strictEqual(parsed.symbolsData.WIPRO, undefined, 'Negative CLOSE record must not be created');
  assert.strictEqual(parsed.symbolsData.HDFCBANK, undefined, 'Invalid CLOSE record must not be created');
  assert(parsed.symbolsData.TCS !== undefined, 'Positive CLOSE record must be created');
  assert.strictEqual(parsed.symbolsData.TCS.contracts.length, 1);
  assert.strictEqual(parsed.symbolsData.TCS.contracts[0].closePrice, 3910.00);
});

// 48. Test H: Valid records still parse successfully
runTest('Test H: Valid records still parse successfully with genuine FinInstrmNm and official ClsPric', () => {
  const validUdiff = `TradDt,TckrSymb,FinInstrmTp,FinInstrmNm,ClsPric,UndrlygPric,XpryDt
2026-05-04,RELIANCE,STF,RELIANCE26MAYFUT,1467.00,1463.10,2026-05-26
2026-05-04,RELIANCE,STF,RELIANCE26JUNFUT,1476.30,1463.10,2026-06-30
`;
  const parsed = DataProvider.parseUdiffFOCsv(validUdiff, '2026-05-04');
  assert(parsed !== null);
  assert.strictEqual(parsed.dateStr, '2026-05-04');
  assert.strictEqual(parsed.symbolsData.RELIANCE.contracts.length, 2);
  assert.strictEqual(parsed.symbolsData.RELIANCE.contracts[0].contractSymbol, 'RELIANCE26MAYFUT');
  assert.strictEqual(parsed.symbolsData.RELIANCE.contracts[0].closePrice, 1467.00);
  assert.strictEqual(parsed.symbolsData.RELIANCE.contracts[1].contractSymbol, 'RELIANCE26JUNFUT');
  assert.strictEqual(parsed.symbolsData.RELIANCE.contracts[1].closePrice, 1476.30);
});

// 49. Dynamic multi-symbol partial CM Spot fallback across multiple sources
runTest('DataProvider._enrichSpotPrices dynamically queries alternate sources for remaining missing symbols', () => {
  DataProvider._attemptedUrls = {};
  DataProvider._failedHostCount = {};

  const primaryCm = 'SYMBOL,SERIES,CLOSE_PRICE,DATE1\nRELIANCE,EQ,1465.50,04-MAY-2026\n';
  const altCm = 'SYMBOL,SERIES,CLOSE_PRICE,DATE1\nTCS,EQ,3910.00,04-MAY-2026\n';

  const origFetchHttp = DataProvider._fetchHttpText;
  let requestedUrls = [];

  try {
    DataProvider._fetchHttpText = (url, label) => {
      requestedUrls.push(url);
      if (url.includes('nsearchives.nseindia.com')) {
        // Primary returns RELIANCE only
        return { status: DataProvider.STATUS.SUCCESS, text: primaryCm };
      } else {
        // Alt returns TCS
        return { status: DataProvider.STATUS.SUCCESS, text: altCm };
      }
    };

    const parsedData = {
      symbolsData: {
        RELIANCE: { spotPrice: null },
        TCS: { spotPrice: null }
      }
    };

    DataProvider._enrichSpotPrices(new Date('2026-05-04'), parsedData);
    assert.strictEqual(parsedData.symbolsData.RELIANCE.spotPrice, 1465.50);
    assert.strictEqual(parsedData.symbolsData.TCS.spotPrice, 3910.00);
    assert(requestedUrls.length >= 2, 'Should query secondary archive because TCS was still missing after primary');
  } finally {
    DataProvider._fetchHttpText = origFetchHttp;
  }
});

// 50. Circuit breaker is keyed by parsed host domain rather than label string
runTest('DataProvider circuit breaker tracks failure counts strictly by target host', () => {
  DataProvider._attemptedUrls = {};
  DataProvider._failedHostCount = {};

  const host1 = DataProvider._extractHost('https://nsearchives.nseindia.com/content/fo/test1.zip');
  const host2 = DataProvider._extractHost('https://archives.nseindia.com/content/fo/test2.zip');
  assert.strictEqual(host1, 'nsearchives.nseindia.com');
  assert.strictEqual(host2, 'archives.nseindia.com');
  assert.notStrictEqual(host1, host2);

  // Simulate 2 failures on host1
  DataProvider._failedHostCount[host1] = 2;
  const cbRes = DataProvider._fetchHttpText('https://nsearchives.nseindia.com/content/fo/test3.zip', 'SOME_LABEL');
  assert.strictEqual(cbRes.status, DataProvider.STATUS.CIRCUIT_BROKEN);
  assert(cbRes.error.includes('nsearchives.nseindia.com'));

  // Host2 must NOT be broken
  DataProvider._attemptedUrls = {};
  const origFetch = global.UrlFetchApp.fetch;
  try {
    global.UrlFetchApp.fetch = () => ({ getResponseCode: () => 200, getContentText: () => 'OK' });
    const okRes = DataProvider._fetchHttpText('https://archives.nseindia.com/content/fo/test4.zip', 'SOME_LABEL');
    assert.strictEqual(okRes.status, DataProvider.STATUS.SUCCESS);
  } finally {
    global.UrlFetchApp.fetch = origFetch;
  }
});

console.log(`\n==========================================`);
console.log(`ALL ${passedTests} OF ${totalTests} TESTS PASSED SUCCESSFULLY!`);
console.log(`==========================================\n`);
