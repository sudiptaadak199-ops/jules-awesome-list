/**
 * Dashboard.gs - Trader-Centric UI Dashboard Rendering & Master Stock Scanner
 * Author: Quantitative Trading System Architect
 */

/**
 * Renders the primary Dashboard user interface including Market Overview,
 * 6 Specialized Intelligence Panels, Master Stock Scanner, and System Data Freshness metrics.
 * Uses high-performance single-pass array filters and bulk block writes.
 */
function renderDashboard() {
  var config = getConfig();
  var settings = getSettings();

  logSystem("INFO", "Dashboard", "Rendering primary trading intelligence dashboard...", null);

  var calcData = readBatchData(config.SHEETS.CALCULATIONS);
  var sectorData = readBatchData(config.SHEETS.SECTOR_DATA);
  var fiiMarketData = readBatchData(config.SHEETS.RAW_FII);

  if (calcData.length === 0) {
    calcData = calculateAllIndicators();
  }
  if (sectorData.length === 0) {
    sectorData = calculateSectorRotation();
  }

  // 1. Single Pass Overview Counters & Panel Filtering
  var totalStocks = calcData.length;
  var rvol2Count = 0;
  var rvol5Count = 0;
  var rvol20Count = 0;
  var strongDeliveryCount = 0;
  var bigMoneyCount = 0;
  var advancingCount = 0;

  var sellerThreshold = settings["SELLER_THRESHOLD"] || 40000;
  var ultraExtremeThreshold = settings["RVOL_THRESHOLD_ULTRA_EXTREME"] || 20;

  var volume20xRows = [];
  var lowSellerRows = [];
  var bigMoneyRows = [];

  for (var i = 0; i < calcData.length; i++) {
    var row = calcData[i];
    var rvol = safeNumber(row[10], 0);
    var delPct = safeNumber(row[14], 0);
    var changePct = safeNumber(row[5], 0);
    var bmScore = safeNumber(row[32], 0);
    var seller20D = safeNumber(row[26], 999999);

    if (rvol >= 2.0) rvol2Count++;
    if (rvol >= 5.0) rvol5Count++;
    if (rvol >= 20.0) rvol20Count++;
    if (delPct >= 50 && rvol >= 1.5) strongDeliveryCount++;
    if (bmScore >= 75) bigMoneyCount++;
    if (changePct > 0) advancingCount++;

    if (rvol >= ultraExtremeThreshold) {
      volume20xRows.push(row);
    }
    if (seller20D < sellerThreshold) {
      lowSellerRows.push(row);
    }
    if (bmScore >= 65) {
      bigMoneyRows.push(row);
    }
  }

  var marketBreadthPct = totalStocks > 0 ? Math.round((advancingCount / totalStocks) * 100) : 0;

  // 2. Fast direct sorting for panel outputs
  var deliveryFilter = settings["DELIVERY_FILTER_MODE"] || "Top 20";
  var deliveryLimit = deliveryFilter === "Top 10" ? 10 : (deliveryFilter === "Top 50" ? 50 : (deliveryFilter === "All" ? totalStocks : 20));

  var deliverySorted = calcData.slice().sort(function(a, b) {
    return safeNumber(b[13], 0) - safeNumber(a[13], 0);
  });
  var panel1Rows = deliverySorted.slice(0, deliveryLimit).map(function(r, idx) {
    return [idx + 1, r[0], r[3], r[13], r[14], r[6], r[10], r[5], r[16], r[17], r[2]];
  });

  volume20xRows.sort(function(a, b) { return b[10] - a[10]; });
  var panel2Rows = volume20xRows.map(function(r, idx) {
    return [idx + 1, r[0], r[1], r[3], r[5], r[6], r[8], r[10], r[13], r[14], r[2], r[31]];
  });

  lowSellerRows.sort(function(a, b) { return a[26] - b[26]; });
  var panel3Rows = lowSellerRows.map(function(r) {
    return [r[0], r[3], r[26], r[6], r[8], r[14], r[5], r[2], r[31]];
  });

  var latestFII = fiiMarketData.length > 0 ? fiiMarketData[fiiMarketData.length - 1] : ["N/A", 0, 0, 0];

  bigMoneyRows.sort(function(a, b) { return b[32] - a[32]; });
  var panel5Rows = bigMoneyRows.map(function(r, idx) {
    return [idx + 1, r[0], r[1], r[2], r[3], r[10], r[12], r[14], r[26], r[32], r[33]];
  });

  var sectorPanelRows = sectorData.slice(0, 10).map(function(s) {
    return [s[0], s[11], s[8], s[4], s[5], s[6], s[10]];
  });

  // 3. High-Performance Bulk Range Writes
  if (typeof SpreadsheetApp !== "undefined" && SpreadsheetApp.getActiveSpreadsheet) {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var dashSheet = ss.getSheetByName(config.SHEETS.DASHBOARD);
    if (dashSheet) {
      dashSheet.clearContents();

      // Top Header & System Overview (Exactly 8 columns wide across all rows)
      var headerData = [
        ["NSE VOLUME, DELIVERY & BIG MONEY INTELLIGENCE DASHBOARD", "", "", "", "", "", "", ""],
        ["Data Source:", settings["DATA_SOURCE_NAME"] || "NSE Official Archives", "Last Updated:", new Date().toLocaleString(), "Tracked Stocks:", totalStocks, "Market Breadth:", marketBreadthPct + "%"],
        ["RVOL >= 2x:", rvol2Count, "RVOL >= 5x:", rvol5Count, "20x+ Volume Stocks:", rvol20Count, "Big Money Candidates:", bigMoneyCount]
      ];
      dashSheet.getRange(1, 1, headerData.length, headerData[0].length).setValues(headerData);

      var currentRow = 5;

      // Panel 1: Highest Delivery Volume
      dashSheet.getRange(currentRow, 1).setValue("🔥 HIGHEST DELIVERY VOLUME STOCKS (" + deliveryFilter + ")");
      currentRow++;
      var p1Headers = [["Rank", "Symbol", "Price", "Delivery Qty", "Delivery %", "Total Vol", "RVOL", "Change %", "20D Avg Del", "Del Accel", "Sector"]];
      dashSheet.getRange(currentRow, 1, 1, p1Headers[0].length).setValues(p1Headers);
      currentRow++;
      if (panel1Rows.length > 0) {
        dashSheet.getRange(currentRow, 1, panel1Rows.length, panel1Rows[0].length).setValues(panel1Rows);
        currentRow += panel1Rows.length + 2;
      }

      // Panel 2: 20x+ Volume Scanner
      dashSheet.getRange(currentRow, 1).setValue("🚀 20×+ VOLUME EXPANSION SCANNER");
      currentRow++;
      var p2Headers = [["Rank", "Symbol", "Company", "Price", "Change %", "Volume", "Avg 20D Vol", "RVOL", "Delivery Qty", "Delivery %", "Sector", "New Money Score"]];
      dashSheet.getRange(currentRow, 1, 1, p2Headers[0].length).setValues(p2Headers);
      currentRow++;
      if (panel2Rows.length > 0) {
        dashSheet.getRange(currentRow, 1, panel2Rows.length, panel2Rows[0].length).setValues(panel2Rows);
        currentRow += panel2Rows.length + 2;
      } else {
        dashSheet.getRange(currentRow, 1).setValue("No 20x+ Volume spikes detected on current trading date.");
        currentRow += 2;
      }

      // Panel 3: Low Selling Pressure
      dashSheet.getRange(currentRow, 1).setValue("👀 LOW SELLING PRESSURE STOCKS (20D Avg Selling Pressure Proxy < " + sellerThreshold.toLocaleString() + ")");
      currentRow++;
      var p3Headers = [["Symbol", "Price", "20D Avg Selling Pressure Proxy", "Volume", "Avg 20D Vol", "Delivery %", "Change %", "Sector", "New Money Score"]];
      dashSheet.getRange(currentRow, 1, 1, p3Headers[0].length).setValues(p3Headers);
      currentRow++;
      if (panel3Rows.length > 0) {
        dashSheet.getRange(currentRow, 1, panel3Rows.length, panel3Rows[0].length).setValues(panel3Rows);
        currentRow += panel3Rows.length + 2;
      }

      // Panel 4: FII Activity
      dashSheet.getRange(currentRow, 1).setValue("🏦 FII / INSTITUTIONAL ACTIVITY MONITOR");
      currentRow++;
      dashSheet.getRange(currentRow, 1).setValue("Market Activity Date: " + latestFII[0] + " | Buy: ₹" + latestFII[1] + " Cr | Sell: ₹" + latestFII[2] + " Cr | Net FII: ₹" + latestFII[3] + " Cr (Stock-wise holdings available in Raw_FII_Holdings)");
      currentRow += 2;

      // Panel 5: Big Money Entry
      dashSheet.getRange(currentRow, 1).setValue("💰 POTENTIAL BIG MONEY INITIAL ENTRY");
      currentRow++;
      var p5Headers = [["Rank", "Symbol", "Company", "Sector", "Price", "RVOL", "Vol Accel", "Delivery %", "20D Selling Pressure Proxy", "Big Money Score", "Signal Status"]];
      dashSheet.getRange(currentRow, 1, 1, p5Headers[0].length).setValues(p5Headers);
      currentRow++;
      if (panel5Rows.length > 0) {
        dashSheet.getRange(currentRow, 1, panel5Rows.length, panel5Rows[0].length).setValues(panel5Rows);
        currentRow += panel5Rows.length + 2;
      }

      // Panel 6: Sector Rotation
      dashSheet.getRange(currentRow, 1).setValue("🔄 SECTOR ROTATION MONITOR");
      currentRow++;
      var p6Headers = [["Sector", "Stage", "Sector RS", "Breadth %", "Avg RVOL", "Vol Accel", "Money Score"]];
      dashSheet.getRange(currentRow, 1, 1, p6Headers[0].length).setValues(p6Headers);
      currentRow++;
      if (sectorPanelRows.length > 0) {
        dashSheet.getRange(currentRow, 1, sectorPanelRows.length, sectorPanelRows[0].length).setValues(sectorPanelRows);
        currentRow += sectorPanelRows.length + 2;
      }

      // Master Stock Scanner Table
      dashSheet.getRange(currentRow, 1).setValue("📊 MASTER STOCK INTELLIGENCE SCANNER (ALL TRACKED STOCKS)");
      currentRow++;
      var scannerHeaders = [config.HEADERS.CALCULATIONS];
      dashSheet.getRange(currentRow, 1, 1, scannerHeaders[0].length).setValues(scannerHeaders);
      currentRow++;
      if (calcData.length > 0) {
        dashSheet.getRange(currentRow, 1, calcData.length, calcData[0].length).setValues(calcData);
      }
    }
  }

  logSystem("INFO", "Dashboard", "Dashboard UI rendering complete.", null);
  return {
    totalStocks: totalStocks,
    rvol20Count: rvol20Count,
    bigMoneyCount: bigMoneyCount,
    marketBreadthPct: marketBreadthPct
  };
}
