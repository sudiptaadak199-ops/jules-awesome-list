/**
 * FIIData.gs - Institutional & Stock-wise FII Ownership Ingestion
 * Author: Quantitative Trading System Architect
 *
 * IMPORTANT ARCHITECTURAL DIRECTIVES:
 * 1. Never confuse market-level aggregate FII activity (Buy/Sell) with stock-wise FII ownership (%).
 * 2. FII data ingestion is OPTIONAL enrichment and MUST NEVER block or fail FullRefresh().
 */

/**
 * Ingests Module A: Market-Level FII / FPI Activity.
 * Fail-fast, time-budgeted, non-blocking fetch that preserves existing Raw_FII data on failure.
 */
function updateFIIMarketActivity() {
  var fiiStartTime = new Date().getTime();
  var config = getConfig();
  var todayStr = formatDateKey(new Date());
  var fiiStatus = "UNAVAILABLE";

  logSystem("INFO", "FIIData", "FII fetch started", null);

  var existingData = readBatchData(config.SHEETS.RAW_FII);
  var fiiMap = {};

  for (var i = 0; i < existingData.length; i++) {
    var row = existingData[i];
    if (row && row[0]) {
      var dKey = formatDateKey(row[0]);
      fiiMap[dKey] = row;
    }
  }

  var fiiUrl = (config.ENDPOINTS && config.ENDPOINTS.NSE_FII_ACTIVITY_URL) ?
    config.ENDPOINTS.NSE_FII_ACTIVITY_URL : "https://www.nseindia.com/api/fiidiiTradeReact";

  var jsonResponse = null;

  try {
    // Fail-fast fetch: 1 single attempt, zero retries, no sleep delays
    if (typeof fetchWithRetry !== "undefined") {
      jsonResponse = fetchWithRetry(fiiUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
          "Accept": "application/json",
          "Referer": "https://www.nseindia.com"
        }
      }, 1);
    }
  } catch (netErr) {
    logSystem("WARN", "FIIData", "FII network fetch error (fail-fast triggered): " + netErr.message, null);
  }

  if (jsonResponse) {
    try {
      var parsed = JSON.parse(jsonResponse);
      if (Array.isArray(parsed) && parsed.length > 0) {
        var fiiBuy = null;
        var fiiSell = null;

        for (var p = 0; p < parsed.length; p++) {
          var item = parsed[p];
          if (item && item.category && item.category.indexOf("FII") !== -1) {
            fiiBuy = safeNumber(item.buyValue, null);
            fiiSell = safeNumber(item.sellValue, null);
            break;
          }
        }

        if (fiiBuy !== null && fiiSell !== null) {
          fiiMap[todayStr] = [
            todayStr,
            fiiBuy,
            fiiSell,
            fiiBuy - fiiSell,
            "NSE Official FII/DII Feed"
          ];
          fiiStatus = "SUCCESS";
        } else {
          fiiStatus = "STALE";
        }
      } else {
        fiiStatus = "STALE";
      }
    } catch (e) {
      logSystem("WARN", "FIIData", "Unable to parse FII JSON feed: " + e.message, null);
      fiiStatus = "STALE";
    }
  } else {
    fiiStatus = Object.keys(fiiMap).length > 0 ? "STALE" : "UNAVAILABLE";
  }

  // Preserve existing records if current fetch failed
  var updatedRows = [];
  for (var k in fiiMap) {
    updatedRows.push(fiiMap[k]);
  }

  if (updatedRows.length > 0) {
    updatedRows.sort(function(a, b) {
      return a[0].localeCompare(b[0]);
    });
    writeBatchData(config.SHEETS.RAW_FII, 2, 1, updatedRows, true);
  }

  var fiiDurationMs = new Date().getTime() - fiiStartTime;
  logSystem("INFO", "FIIData", "FII fetch completed / timed out. Duration: " + fiiDurationMs + "ms | FII status: " + fiiStatus, {
    durationMs: fiiDurationMs,
    fiiStatus: fiiStatus,
    records: updatedRows.length
  });

  return updatedRows.length;
}

/**
 * Ingests Module B: Stock-Wise FII Ownership / Shareholding.
 * Non-blocking, un-fabricated stock-wise holdings mapping.
 */
function updateStockFIIHoldings() {
  var config = getConfig();
  var masterStocks = config.DEFAULT_MASTER_STOCKS;

  var fiiHoldingRows = [];

  for (var i = 0; i < masterStocks.length; i++) {
    var symbol = masterStocks[i][0];
    if (symbol === "NIFTY") continue;

    var row = [
      symbol,
      "N/A",  // Previous FII % (Unfabricated)
      "N/A",  // Current FII % (Unfabricated)
      0,      // Change in FII %
      "Q3 FY24",
      "Q4 FY24",
      "Awaiting Feed",
      formatDateKey(new Date())
    ];

    fiiHoldingRows.push(row);
  }

  writeBatchData(config.SHEETS.RAW_FII_HOLDINGS, 2, 1, fiiHoldingRows, true);
  return fiiHoldingRows.length;
}

/**
 * Combined launcher for all FII data ingestion tasks with full error isolation.
 */
function updateAllFIIData() {
  var countA = 0;
  var countB = 0;

  try {
    countA = updateFIIMarketActivity();
  } catch (e) {
    logSystem("WARN", "FIIData", "Module A FII market activity fetch failed safely: " + e.message, null);
  }

  try {
    countB = updateStockFIIHoldings();
  } catch (e) {
    logSystem("WARN", "FIIData", "Module B stock FII holdings update failed safely: " + e.message, null);
  }

  return { marketRecords: countA, stockHoldings: countB };
}
