/**
 * Local JS Test Suite for Sector Rotation Engine
 *
 * Runs via Bun or Node.js. Mocks the Google Apps Script environment,
 * evaluates the actual .gs files, and runs thorough assertions on:
 * - Multi-Factor Scoring Formula
 * - Rotation Stage Classification (Stages 1-5)
 * - Sorting & Ranking priorities
 * - lookback alerts (Money Flow Shifts & Rotation Alerts)
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

// 1. Setup Mock GAS Environment
const mockSpreadsheet = {
  clear: () => {},
  setGridlines: () => {},
  setColumnWidth: () => {},
  getRange: () => ({
    merge: function() { return this; },
    setValue: function() { return this; },
    setFontSize: function() { return this; },
    setFontWeight: function() { return this; },
    setFontColor: function() { return this; },
    setFontStyle: function() { return this; },
    setHorizontalAlignment: function() { return this; },
    setVerticalAlignment: function() { return this; },
    setBackground: function() { return this; },
    setBorder: function() { return this; },
    setValues: function() { return this; },
    setFontFamily: function() { return this; },
    getValues: () => [[]]
  }),
  setRowHeight: () => {},
  getLastRow: () => 0,
  getLastColumn: () => 0
};

const mockSpreadsheetApp = {
  getActiveSpreadsheet: () => ({
    getSheetByName: (name) => mockSpreadsheet,
    insertSheet: () => mockSpreadsheet
  }),
  BorderStyle: { SOLID: 'SOLID' }
};

const mockUtilities = {
  sleep: () => {}
};

// Create sandbox context with mocked globals
const sandbox = {
  SpreadsheetApp: mockSpreadsheetApp,
  Utilities: mockUtilities,
  console: console,
  Math: Math,
  Date: Date,
  parseFloat: parseFloat,
  isNaN: isNaN,
  String: String,
  Object: Object,
  Array: Array,
  globalThis: {}
};

// Bind globalThis back to sandbox
sandbox.globalThis = sandbox;

// 2. Load and concatenate the Google Apps Script source files
const gsFiles = [
  'Config.gs',
  'Utilities.gs',
  'ErrorHandler.gs',
  'Logger.gs',
  'Settings.gs',
  'SheetManager.gs',
  'SectorEngine.gs'
];

console.log("Concatenating and loading GAS files into Node/Bun vm sandbox...");
let combinedCode = "";
gsFiles.forEach(file => {
  const filePath = path.join(__dirname, 'sa-stock-platform', file);
  combinedCode += fs.readFileSync(filePath, 'utf8') + "\n";
});

// Explicitly bind the ES6 classes to the context global scope
combinedCode += `
globalThis.Config = Config;
globalThis.PlatformUtils = PlatformUtils;
globalThis.ErrorHandler = ErrorHandler;
globalThis.Logger = Logger;
globalThis.Settings = Settings;
globalThis.SheetManager = SheetManager;
globalThis.SectorEngine = SectorEngine;
`;

vm.runInNewContext(combinedCode, sandbox);

console.log("GAS files loaded successfully. Running unit tests...\n");

const SectorEngine = sandbox.SectorEngine;

let totalTests = 0;
let passedTests = 0;

function assert(condition, message) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`✅ PASS: ${message}`);
  } else {
    console.error(`❌ FAIL: ${message}`);
    process.exitCode = 1;
  }
}

// ================= TEST CASES =================

// Test Case 1: Multi-Factor scoring behaves correctly
console.log("--- Test Case 1: New Money Inflow Score ---");
const score1 = SectorEngine.calculateNewMoneyScore(20, 3, 1.5, 75, 1.3);
assert(score1 > 50 && score1 < 95, `Composite score should be high-medium for strong parameters (got ${score1})`);

const scoreLow = SectorEngine.calculateNewMoneyScore(-40, -4, -4.5, 20, 0.6);
assert(scoreLow < 30, `Composite score should be very low for weak parameters (got ${scoreLow})`);

const scorePerfect = SectorEngine.calculateNewMoneyScore(100, 10, 5, 100, 2.0);
assert(scorePerfect === 100, `Perfect indicators should result in exactly 100 score (got ${scorePerfect})`);


// Test Case 2: Rotation Stage Classification rules
console.log("\n--- Test Case 2: Rotation Stage Classifier ---");
// Stage 3: Strong volume + price + breadth + relative strength
const stage3 = SectorEngine.classifyRotationStage(1.5, 25, 3.2, 75, 2.1, 85);
assert(stage3.includes("Stage 3"), `Should classify as Stage 3: CONFIRMED ROTATION (got ${stage3})`);

// Stage 2: Volume + price + breadth improving
const stage2 = SectorEngine.classifyRotationStage(1.1, 5, 1.5, 55, -0.5, 65);
assert(stage2.includes("Stage 2"), `Should classify as Stage 2: ACCELERATING INFLOW (got ${stage2})`);

// Stage 1: Volume starting to expand (or RVOL >= 1.0)
const stage1 = SectorEngine.classifyRotationStage(1.0, 2, -1.0, 35, -2.0, 48);
assert(stage1.includes("Stage 1"), `Should classify as Stage 1: EARLY INFLOW (got ${stage1})`);

// Stage 4: Still strong but volume acceleration slowing
const stage4 = SectorEngine.classifyRotationStage(1.2, -5, 0.5, 65, 1.0, 60);
assert(stage4.includes("Stage 4"), `Should classify as Stage 4: MATURE LEADER (got ${stage4})`);

// Stage 5: Price/breadth deteriorating / Outflow
const stage5 = SectorEngine.classifyRotationStage(0.6, -15, -2.5, 25, -3.5, 30);
assert(stage5.includes("Stage 5"), `Should classify as Stage 5: OUTFLOW / DISTRIBUTION (got ${stage5})`);


// Test Case 3: Sorting of Sector Leaderboard (Score Change DESC, then New Money Inflow Score DESC)
console.log("\n--- Test Case 3: Leaderboard Sorting Priorities ---");
const sectors = [
  { sector: "Sector A", score: 60, scoreChange: 5 },
  { sector: "Sector B", score: 85, scoreChange: 2 },
  { sector: "Sector C", score: 50, scoreChange: 5 }, // Sector C has same Score Change as A, but lower Score
  { sector: "Sector D", score: 40, scoreChange: -3 }
];

SectorEngine.sortSectorMetrics(sectors);

assert(sectors[0].sector === "Sector A", `Rank 1 should be Sector A (Score Change: 5, Score: 60) (got ${sectors[0].sector})`);
assert(sectors[1].sector === "Sector C", `Rank 2 should be Sector C (Score Change: 5, Score: 50) (got ${sectors[1].sector})`);
assert(sectors[2].sector === "Sector B", `Rank 3 should be Sector B (Score Change: 2, Score: 85) (got ${sectors[2].sector})`);
assert(sectors[3].sector === "Sector D", `Rank 4 should be Sector D (Score Change: -3) (got ${sectors[3].sector})`);
assert(sectors[0].rank === 1 && sectors[3].rank === 4, "Ranks should be updated sequentially (1-4)");


// Test Case 4: Alerts triggers
console.log("\n--- Test Case 4: Lookback Alerts detection ---");
// MONEY FLOW SHIFT triggers when: Rank improved by >= 5, Volume Accel > 15%, 5D Return > 0, Breadth improved
const sectorMetricsList = [
  {
    sector: "Auto",
    rank: 3,
    prevRank5D: 9, // Rank improved by 6 (>= 5)
    volAccel: 28,  // > 15%
    return5d: 2.8, // > 0
    breadthPct: 72,
    prevBreadthPct5D: 55, // Breadth improved (72 > 55)
    rvol: 1.74,
    stage: "Stage 2\n\n🔥 ACCELERATING INFLOW",
    score: 75,
    scoreChange5D: 15
  },
  {
    sector: "Banking",
    rank: 4,
    prevRank5D: 10, // Rank improved by 6
    volAccel: 5,    // Vol Accel too low (< 15%) -> Should trigger standard ROTATION_ALERT instead of MONEY_FLOW_SHIFT
    return5d: 1.5,
    breadthPct: 65,
    prevBreadthPct5D: 60,
    rvol: 1.1,
    stage: "Stage 2\n\n🔥 ACCELERATING INFLOW",
    score: 68,
    scoreChange5D: 10
  }
];

const alerts = SectorEngine.detectAlerts(sectorMetricsList);

assert(alerts.length === 2, `Should detect exactly 2 alerts (got ${alerts.length})`);
assert(alerts[0].type === "MONEY_FLOW_SHIFT", `First alert should be MONEY_FLOW_SHIFT (got ${alerts[0].type})`);
assert(alerts[0].sector === "Auto", `MONEY_FLOW_SHIFT sector should be Auto (got ${alerts[0].sector})`);
assert(alerts[1].type === "ROTATION_ALERT", `Second alert should be ROTATION_ALERT (got ${alerts[1].type})`);
assert(alerts[1].sector === "Banking", `ROTATION_ALERT sector should be Banking (got ${alerts[1].sector})`);

console.log(`\n===================================`);
console.log(`Test Execution Finished: ${passedTests}/${totalTests} Passed.`);
console.log(`===================================`);
if (passedTests !== totalTests) {
  process.exit(1);
} else {
  process.exit(0);
}
