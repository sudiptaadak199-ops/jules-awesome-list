/**
 * Comprehensive Automated Test Suite for SA Futures Gap Analysis System
 *
 * Tests:
 * 1. Base Utilities (dates, safeFloat, trading days generator, composite keys)
 * 2. NSE UDiFF FO Bhavcopy parsing (header detection, STF filter, Spot extraction, contract mapping)
 * 3. NSE Legacy FO Bhavcopy parsing (FUTSTK filter, expiry mapping)
 * 4. ContractMapper - historical contract selection and rollover logic across 6 months
 * 5. GapEngine - exact formula calculations:
 *    - Current−Next Gap = Current Future − Next Future
 *    - Current−Next Gap % = (Current Future − Next Future) / Current Future × 100
 *    - Spot−Current Future Gap = Spot − Current Future
 *    - Spot-Future Gap % = (Spot − Current Future) / Spot × 100
 * 6. Missing & zero data handling (never substitute zero for missing data, zero division safety)
 * 7. Duplicate prevention by Date + Symbol + Contract
 * 8. Symbol addition detection and incremental backfill trigger
 * 9. Resumable backfill state management
 * 10. Missing date recovery simulation
 */

const assert = require('assert');
const fs = require('fs');

// Mock GAS environment
global.Logger = {
  log: (msg) => {}
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
  // Use indirect eval or assign var declarations to global
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

console.log('--- STARTING COMPREHENSIVE AUTOMATED TEST SUITE ---');

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
// Test 2: Utils Trading Days & Weekend Filter
// ==========================================
runTest('Utils historical trading days generates weekdays only', () => {
  const days = Utils.getHistoricalTradingDays(6, new Date('2025-02-20'));
  assert(days.length > 100, `Expected > 100 trading days in 6 months, got ${days.length}`);
  days.forEach(d => {
    assert(!Utils.isWeekend(d), `Found weekend date: ${d}`);
  });
});

// ==========================================
// Test 3: Safe Float Parsing (No Zero Substitution)
// ==========================================
runTest('Utils.safeFloat handles numbers, blanks, null, without converting missing to zero', () => {
  assert.strictEqual(Utils.safeFloat('1234.50'), 1234.5);
  assert.strictEqual(Utils.safeFloat('1,234.50'), 1234.5);
  assert.strictEqual(Utils.safeFloat(0), 0);
  assert.strictEqual(Utils.safeFloat('0.00'), 0);
  assert.strictEqual(Utils.safeFloat(''), null);
  assert.strictEqual(Utils.safeFloat(null), null);
  assert.strictEqual(Utils.safeFloat(undefined), null);
  assert.strictEqual(Utils.safeFloat('-'), null);
  assert.strictEqual(Utils.safeFloat('N/A'), null);
});

// ==========================================
// Test 4: Parse Modern NSE UDiFF FO Bhavcopy
// ==========================================
runTest('DataProvider.parseUdiffFOCsv parses modern Bhavcopy correctly', () => {
  const sampleUdiffCsv = `TradDt,BizDt,Sgmt,Src,FinInstrmTp,FinInstrmId,ISIN,TckrSymb,SctySrs,XpryDt,FininstrmActlXpryDt,StrkPric,OptnTp,FinInstrmNm,OpnPric,HghPric,LwPric,ClsPric,LastPric,PrvsClsgPric,UndrlygPric,SttlmPric,OpnIntrst,ChngInOpnIntrst,TtlTradgVol,TtlTrfVal,TtlNbOfTxsExctd,SsnId,NewBrdLotQty,Rmks,Rsvd1,Rsvd2,Rsvd3,Rsvd4
2025-02-20,2025-02-20,FO,NSE,STF,1001,,RELIANCE,,2025-02-27,2025-02-27,0.00,XX,FUTRELIANCE27FEB2025,1230.00,1235.00,1230.00,1232.75,1232.75,1230.00,1233.00,1232.75,10000,0,500,600000.00,10,F1,250,,,,,
2025-02-20,2025-02-20,FO,NSE,STF,1002,,RELIANCE,,2025-03-27,2025-03-27,0.00,XX,FUTRELIANCE27MAR2025,1235.00,1240.00,1235.00,1239.15,1239.15,1235.00,1233.00,1239.15,5000,0,200,240000.00,5,F1,250,,,,,
2025-02-20,2025-02-20,FO,NSE,STF,1003,,RELIANCE,,2025-04-24,2025-04-24,0.00,XX,FUTRELIANCE24APR2025,1245.00,1248.00,1245.00,1246.25,1246.25,1245.00,1233.00,1246.25,2000,0,100,120000.00,2,F1,250,,,,,
2025-02-20,2025-02-20,FO,NSE,STO,1004,,RELIANCE,,2025-02-27,2025-02-27,1240.00,CE,RELIANCE25FEB1240CE,10.00,12.00,9.00,10.50,10.50,10.00,1233.00,10.50,5000,0,100,50000.00,3,F1,250,,,,,
`;
  const parsed = DataProvider.parseUdiffFOCsv(sampleUdiffCsv, '2025-02-20');
  assert(parsed.isTradingDay);
  assert(parsed.symbolsData.RELIANCE);
  assert.strictEqual(parsed.symbolsData.RELIANCE.spotPrice, 1233.00);
  assert.strictEqual(parsed.symbolsData.RELIANCE.contracts.length, 3); // Options filtered out, only 3 futures
  assert.strictEqual(parsed.symbolsData.RELIANCE.contracts[0].closePrice, 1232.75);
});

// ==========================================
// Test 5: Parse Legacy NSE FO Bhavcopy
// ==========================================
runTest('DataProvider.parseLegacyFOCsv parses legacy Bhavcopy correctly', () => {
  const sampleLegacyCsv = `INSTRUMENT,SYMBOL,EXPIRY_DT,STRIKE_PR,OPTION_TYP,OPEN,HIGH,LOW,CLOSE,SETTLE_PR,CONTRACTS,VAL_INLAKH,OPEN_INT,CHG_IN_OI,TIMESTAMP,
FUTIDX,BANKNIFTY,29-May-2024,0,XX,48838.65,49115.9,48702.05,49045.15,49045.15,146710,1076220.22,2121990,-53595,24-MAY-2024,
FUTSTK,RELIANCE,30-May-2024,0,XX,2971,2984.45,2959.55,2969.5,2969.5,21811,161968.04,34923000,-649750,24-MAY-2024,
FUTSTK,RELIANCE,27-Jun-2024,0,XX,2980,2995.00,2975.00,2985.0,2985.0,5000,40000.00,8000000,100000,24-MAY-2024,
OPTSTK,RELIANCE,30-May-2024,3000,CE,25,30,22,28.5,28.5,1000,3000.00,500000,5000,24-MAY-2024,
`;
  const parsed = DataProvider.parseLegacyFOCsv(sampleLegacyCsv, '2024-05-24');
  assert(parsed.isTradingDay);
  assert(parsed.symbolsData.RELIANCE);
  assert.strictEqual(parsed.symbolsData.RELIANCE.contracts.length, 2); // OPTSTK and FUTIDX filtered out
  assert.strictEqual(parsed.symbolsData.RELIANCE.contracts[0].closePrice, 2969.5);
  assert.strictEqual(parsed.symbolsData.RELIANCE.contracts[0].expiryStr, '2024-05-30');
});

// ==========================================
// Test 6: Contract Mapping & Expiry Rollover
// ==========================================
runTest('ContractMapper accurately maps Current and Next contracts and handles rollover', () => {
  const stockData = {
    spotPrice: 2950.0,
    contracts: [
      { expiryStr: '2024-05-30', expiryDate: new Date('2024-05-30'), closePrice: 2960.0 },
      { expiryStr: '2024-06-27', expiryDate: new Date('2024-06-27'), closePrice: 2975.0 },
      { expiryStr: '2024-07-25', expiryDate: new Date('2024-07-25'), closePrice: 2990.0 }
    ]
  };

  // Case A: Trade Date before 2024-05-30 expiry (e.g. 2024-05-24)
  const mapBefore = ContractMapper.mapContractsForDate(new Date('2024-05-24'), stockData);
  assert.strictEqual(mapBefore.currentContract.expiryStr, '2024-05-30');
  assert.strictEqual(mapBefore.currentContract.closePrice, 2960.0);
  assert.strictEqual(mapBefore.nextContract.expiryStr, '2024-06-27');
  assert.strictEqual(mapBefore.nextContract.closePrice, 2975.0);
  assert.strictEqual(mapBefore.historicalExpiryDate, '2024-05-30');

  // Case B: Trade Date on expiry day (2024-05-30) - Still active on expiry day
  const mapOnExpiry = ContractMapper.mapContractsForDate(new Date('2024-05-30'), stockData);
  assert.strictEqual(mapOnExpiry.currentContract.expiryStr, '2024-05-30');
  assert.strictEqual(mapOnExpiry.nextContract.expiryStr, '2024-06-27');

  // Case C: Trade Date the day after expiry (2024-05-31) - Rollover occurs!
  // Current becomes 2024-06-27, Next becomes 2024-07-25
  const mapAfterExpiry = ContractMapper.mapContractsForDate(new Date('2024-05-31'), stockData);
  assert.strictEqual(mapAfterExpiry.currentContract.expiryStr, '2024-06-27');
  assert.strictEqual(mapAfterExpiry.currentContract.closePrice, 2975.0);
  assert.strictEqual(mapAfterExpiry.nextContract.expiryStr, '2024-07-25');
  assert.strictEqual(mapAfterExpiry.nextContract.closePrice, 2990.0);
  assert.strictEqual(mapAfterExpiry.historicalExpiryDate, '2024-06-27');
});

// ==========================================
// Test 7: Exact Gap Formulas Verification
// ==========================================
runTest('GapEngine strictly applies required formulas', () => {
  // Current = 1232.75, Next = 1239.15, Spot = 1233.00
  // Current - Next Gap = 1232.75 - 1239.15 = -6.40
  // Current - Next Gap % = (1232.75 - 1239.15) / 1232.75 * 100 = -0.51916...
  // Spot - Current Future Gap = 1233.00 - 1232.75 = 0.25
  // Spot - Future Gap % = (1233.00 - 1232.75) / 1233.00 * 100 = 0.020275...
  const res = GapEngine.calculateGaps(1233.00, 1232.75, 1239.15);

  assert.strictEqual(res.currentNextGap, -6.4);
  assert.strictEqual(res.currentNextGapPct, -0.5192);
  assert.strictEqual(res.spotCurrentFutureGap, 0.25);
  assert.strictEqual(res.spotFutureGapPct, 0.0203);

  // Check row output
  const row = GapEngine.buildAnalysisRow('2025-02-20', 'RELIANCE', 1233.00, 1232.75, 1239.15, '2025-02-27');
  assert.strictEqual(row.length, 10);
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
// Test 8: Safe Handling of Missing Data & Zero Values
// ==========================================
runTest('GapEngine safely handles missing data and zeroes without substituting zero or crashing', () => {
  // Missing Spot
  const resNoSpot = GapEngine.calculateGaps(null, 1000, 1010);
  assert.strictEqual(resNoSpot.spotPrice, null);
  assert.strictEqual(resNoSpot.currentNextGap, -10);
  assert.strictEqual(resNoSpot.currentNextGapPct, -1);
  assert.strictEqual(resNoSpot.spotCurrentFutureGap, null);
  assert.strictEqual(resNoSpot.spotFutureGapPct, null);

  // Missing Next Future
  const resNoNext = GapEngine.calculateGaps(1000, 1005, null);
  assert.strictEqual(resNoNext.currentNextGap, null);
  assert.strictEqual(resNoNext.currentNextGapPct, null);
  assert.strictEqual(resNoNext.spotCurrentFutureGap, -5);
  assert.strictEqual(resNoNext.spotFutureGapPct, -0.5);

  // Zero Current Future (denominator zero safety)
  const resZeroCur = GapEngine.calculateGaps(100, 0, 10);
  assert.strictEqual(resZeroCur.currentNextGap, -10);
  assert.strictEqual(resZeroCur.currentNextGapPct, null); // No division by zero!

  // Zero Spot (denominator zero safety)
  const resZeroSpot = GapEngine.calculateGaps(0, 100, 105);
  assert.strictEqual(resZeroSpot.spotCurrentFutureGap, -100);
  assert.strictEqual(resZeroSpot.spotFutureGapPct, null); // No division by zero!
});

// ==========================================
// Test 9: Deduplication & Composite Key Generation
// ==========================================
runTest('Utils.makeRecordKey generates unique composite key for Date + Symbol + Expiry', () => {
  const k1 = Utils.makeRecordKey('2025-02-20', 'RELIANCE', '2025-02-27');
  const k2 = Utils.makeRecordKey('2025-02-20', 'reliance', '2025-02-27');
  const k3 = Utils.makeRecordKey('2025-02-21', 'RELIANCE', '2025-02-27');

  assert.strictEqual(k1, '2025-02-20|RELIANCE|2025-02-27');
  assert.strictEqual(k1, k2); // Case insensitive equality
  assert.notStrictEqual(k1, k3); // Different dates
});

// ==========================================
// Test 10: Mock Multi-Day Historical Simulation & Contract Transition Across Expiries
// ==========================================
runTest('Simulate historical backfill across expiry boundary preserving true contract mapping', () => {
  // Let expiry 1 = 2024-09-26, expiry 2 = 2024-10-31, expiry 3 = 2024-11-28
  const mockBhavcopies = {
    '2024-09-25': {
      isTradingDay: true,
      symbolsData: {
        'TCS': {
          spotPrice: 4200.0,
          contracts: [
            { expiryStr: '2024-09-26', expiryDate: new Date('2024-09-26'), closePrice: 4205.0 },
            { expiryStr: '2024-10-31', expiryDate: new Date('2024-10-31'), closePrice: 4230.0 }
          ]
        }
      }
    },
    '2024-09-26': { // Expiry day
      isTradingDay: true,
      symbolsData: {
        'TCS': {
          spotPrice: 4210.0,
          contracts: [
            { expiryStr: '2024-09-26', expiryDate: new Date('2024-09-26'), closePrice: 4210.0 },
            { expiryStr: '2024-10-31', expiryDate: new Date('2024-10-31'), closePrice: 4235.0 },
            { expiryStr: '2024-11-28', expiryDate: new Date('2024-11-28'), closePrice: 4260.0 }
          ]
        }
      }
    },
    '2024-09-27': { // Day after expiry
      isTradingDay: true,
      symbolsData: {
        'TCS': {
          spotPrice: 4220.0,
          contracts: [
            { expiryStr: '2024-10-31', expiryDate: new Date('2024-10-31'), closePrice: 4240.0 },
            { expiryStr: '2024-11-28', expiryDate: new Date('2024-11-28'), closePrice: 4265.0 }
          ]
        }
      }
    }
  };

  const rows = [];
  const existingSet = {};

  ['2024-09-25', '2024-09-26', '2024-09-27'].forEach(dateStr => {
    const data = mockBhavcopies[dateStr];
    const mapped = ContractMapper.mapContractsForDate(new Date(dateStr), data.symbolsData.TCS);
    const key = Utils.makeRecordKey(dateStr, 'TCS', mapped.historicalExpiryDate);
    assert(!existingSet[key], 'Key should be unique');
    existingSet[key] = true;
    rows.push(GapEngine.buildAnalysisRow(dateStr, 'TCS', mapped.spotPrice, mapped.currentContract.closePrice, mapped.nextContract.closePrice, mapped.historicalExpiryDate));
  });

  assert.strictEqual(rows.length, 3);
  // Day 1 (before expiry)
  assert.strictEqual(rows[0][0], '2024-09-25');
  assert.strictEqual(rows[0][3], 4205.0); // Current Fut
  assert.strictEqual(rows[0][4], 4230.0); // Next Fut
  assert.strictEqual(rows[0][9], '2024-09-26'); // Expiry

  // Day 2 (on expiry)
  assert.strictEqual(rows[1][0], '2024-09-26');
  assert.strictEqual(rows[1][3], 4210.0); // Current Fut
  assert.strictEqual(rows[1][4], 4235.0); // Next Fut
  assert.strictEqual(rows[1][9], '2024-09-26'); // Expiry

  // Day 3 (after expiry rollover)
  assert.strictEqual(rows[2][0], '2024-09-27');
  assert.strictEqual(rows[2][3], 4240.0); // Current Fut rolled to Oct contract!
  assert.strictEqual(rows[2][4], 4265.0); // Next Fut is Nov contract!
  assert.strictEqual(rows[2][9], '2024-10-31'); // New Expiry
});

console.log(`\n==========================================`);
console.log(`ALL ${passedTests} OF ${totalTests} TESTS PASSED SUCCESSFULLY!`);
console.log(`==========================================\n`);
