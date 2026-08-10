/**
 * SA Stock Research & Backtest Platform - Phase 1 (Foundation)
 *
 * Central Enterprise Configuration Module
 *
 * Houses all settings, design tokens, sheet configurations, menu templates,
 * and defaults. This ensures ZERO hard-coding in functional modules.
 */

var Config = {
  // System metadata
  METADATA: {
    NAME: "SA Stock Research & Backtest Platform",
    VERSION: "2.0.0-EarlySectorRotation",
    AUTHOR: "Senior Software Architect & GAS Engineer",
    TIMEZONE: "Asia/Kolkata"
  },

  // Central Sheet Names (Bypasses any hard-coding of spreadsheet tabs)
  SHEETS: {
    DASHBOARD: "Dashboard",
    SETTINGS: "Settings",
    STOCK_MASTER: "Stock Master",
    HISTORICAL_DATA: "Historical Data",
    REPORTS: "Reports",
    LOGS: "Logs",
    CACHE: "Cache",
    SECTOR_HISTORY: "Sector History",
    BACKTESTS: "Backtests"
  },

  // Configurable Benchmark symbol
  BENCHMARK_SYMBOL: "NIFTY",

  // Central configurable sector mapping to their corresponding index symbols
  SECTOR_INDEX_MAP: {
    "Energy": "^CNXENERGY",
    "Technology": "^CNXIT",
    "Financials": "NIFTY_FIN_SERVICE.NS",
    "FMCG": "^CNXFMCG",
    "Automobile": "^CNXAUTO",
    "Metals": "^CNXMETAL",
    "Healthcare": "^CNXPHARMA",
    "Industrials": "^CNXINFRA"
  },

  // Menu configuration
  MENU: {
    MAIN_TITLE: "SA Platform",
    ITEMS: [
      { name: "Initialize / Repair Project", method: "InitializeProject" },
      { separator: true },
      { name: "Update Data Engine", method: "triggerUpdateData" },
      { name: "Run Historical Backtest", method: "triggerRunBacktest" },
      { name: "Generate Report Suite", method: "triggerGenerateReport" },
      { separator: true },
      { name: "Configure System Settings", method: "triggerConfigureSettings" },
      { name: "View System Logs", method: "triggerViewLogs" }
    ]
  },

  // Theme Design Tokens (Professional Cool Tech Palette)
  THEME: {
    COLORS: {
      PRIMARY_DARK: "#1b263b",   // Deep Navy for main headers
      PRIMARY_LIGHT: "#e0e1dd",  // Ice Blue for alternate panels
      ACCENT: "#415a77",         // Slate Blue for secondary headings and borders
      TEXT_LIGHT: "#ffffff",     // White text for dark headers
      TEXT_DARK: "#0d1b2a",      // Jet black for high-readability body text
      BG_ALT: "#f8f9fa",         // Very light grey for zebra-striping rows
      ALERT_SUCCESS: "#d8f3dc",  // Light Mint Green for success alerts
      ALERT_ERROR: "#f8d7da",    // Soft Red for errors
      INFO_BOX_BG: "#eaf2f8",    // Accent container background
      GOLD_GOLD: "#fcf6bd",      // Warm light gold for highlighting top ranks

      // SIX REFINED ROTATION STATE COLORS
      STATE_EARLY_INFLOW: "#e2eafc",     // Soft blue-blue
      STATE_CONFIRMED_INFLOW: "#b7e4c7", // Medium mint green
      STATE_LEADING: "#d8f3dc",          // Bright green
      STATE_WEAKENING: "#fff3b0",        // Soft light yellow
      STATE_OUTFLOW: "#f8d7da",          // Soft red alert
      STATE_BOTTOMING: "#f0e6ef"         // Soft purple-lavender
    },
    FONTS: {
      FAMILY: "Roboto",
      SIZE_TITLE: 18,
      SIZE_SUBTITLE: 11,
      SIZE_HEADER: 10,
      SIZE_BODY: 9
    }
  },

  // Metadata describing the default configuration variables
  DEFAULT_SETTINGS: [
    ["Setting Key", "Value", "Description", "Last Updated"],
    ["Data Mode", "LIVE", "Market data ingestion mode: 'LIVE' (real-time UrlFetchApp) or 'MOCK' (simulated).", "2024-01-01"],
    ["Data Source", "Yahoo Finance", "Historical market feed engine (e.g. Yahoo Finance, NSE).", "2024-01-01"],
    ["Update Mode", "Delta", "Stock sync strategy: 'Full' or incremental 'Delta'.", "2024-01-01"],
    ["Retry Count", "3", "Maximum execution attempts before recording failure.", "2024-01-01"],
    ["Batch Size", "100", "Execution chunks for Google Sheets memory protection.", "2024-01-01"],
    ["Cache Enabled", "TRUE", "Toggle sheet-backed caching to reduce latency (TRUE/FALSE).", "2024-01-01"],
    ["Request Delay", "50", "Rate limit delay in milliseconds between stock processing.", "2024-01-01"],
    ["Debug Mode", "FALSE", "Dumps runtime diagnostics directly to the GAS console log (TRUE/FALSE).", "2024-01-01"],

    // Configurable Scoring Weights (Early Accumulation Score: 50% Volume, 50% Confirmation)
    ["Weight Relative Volume", "20", "Weight (out of 100) for Relative Volume (RVOL). Default 20.", "2026-08-11"],
    ["Weight Volume Acceleration", "15", "Weight (out of 100) for Volume Acceleration. Default 15.", "2026-08-11"],
    ["Weight Volume Persistence", "10", "Weight (out of 100) for Volume Persistence. Default 10.", "2026-08-11"],
    ["Weight Up Down Volume", "5", "Weight (out of 100) for Up vs Down Volume Pressure. Default 5.", "2026-08-11"],
    ["Weight Absorption Proxy", "10", "Weight (out of 100) for Price-Volume Absorption Proxy. Default 10.", "2026-08-11"],
    ["Weight Sector Breadth", "10", "Weight (out of 100) for Sector Breadth. Default 10.", "2026-08-11"],
    ["Weight RS Improvement", "10", "Weight (out of 100) for Relative Strength vs NIFTY. Default 10.", "2026-08-11"],
    ["Weight Momentum Acceleration", "10", "Weight (out of 100) for Momentum Acceleration. Default 10.", "2026-08-11"],
    ["Weight Compression Expansion", "5", "Weight (out of 100) for Compression-to-Expansion. Default 5.", "2026-08-11"],
    ["Weight Futures OI Delivery", "5", "Weight (out of 100) for Futures/OI and Delivery Proxy. Default 5.", "2026-08-11"],

    // Lookback parameter settings
    ["RVOL Lookback Short", "5", "Short RVOL moving window size. Default 5 days.", "2026-08-11"],
    ["RVOL Lookback Medium", "10", "Medium RVOL moving window size. Default 10 days.", "2026-08-11"],
    ["RVOL Lookback Long", "20", "Long RVOL moving window size (baseline). Default 20 days.", "2026-08-11"],

    // Transaction & Liquidity settings
    ["Min Traded Value", "1000000", "Minimum average traded value (Volume * Close) to participate. Default 1,000,000.", "2026-08-11"],
    ["Min Traded Price", "5", "Minimum price to filter out penny stocks. Default 5 INR.", "2026-08-11"],
    ["Slippage Pct", "0.05", "Slippage assumption per transaction in %. Default 0.05.", "2026-08-11"],
    ["Brokerage Fees Pct", "0.03", "Brokerage and tax percentage per transaction. Default 0.03.", "2026-08-11"],

    // Backtest configurations
    ["Backtest Start Date", "2026-07-01", "Backtest start date (YYYY-MM-DD). Default 2026-07-01.", "2026-08-11"],
    ["Backtest End Date", "2026-08-30", "Backtest end date (YYYY-MM-DD). Default 2026-08-30.", "2026-08-11"],
    ["Backtest Holding Period", "15", "Holding window in days (5, 10, 15, 20, 30). Default 15.", "2026-08-11"],
    ["Backtest Top N Sectors", "3", "Number of top sectors to allocate capital to. Default 3.", "2026-08-11"],
    ["Backtest Top N Stocks", "2", "Number of top stocks per sector to simulate. Default 2.", "2026-08-11"],
    ["Backtest Min Score", "60", "Minimum score required to trigger a backtest entry signal. Default 60.", "2026-08-11"]
  ],

  // Structures for each sheet for dynamic creation & automatic repair
  SHEETS_DEFINITION: {
    "Dashboard": {
      gridlines: false,
      columnsWidths: [40, 220, 180, 120, 120, 120, 120, 120]
    },
    "Settings": {
      gridlines: true,
      columnsWidths: [180, 200, 380, 140],
      headers: ["Setting Key", "Value", "Description", "Last Updated"]
    },
    "Stock Master": {
      gridlines: true,
      frozenRows: 1,
      columnsWidths: [120, 220, 90, 130, 150, 100, 140, 140],
      headers: ["Stock Symbol", "Company Name", "Exchange", "Sector", "Industry", "Status", "Last Processed", "Added Date"],
      defaultRows: [
        ["RELIANCE", "Reliance Industries Ltd.", "NSE", "Energy", "Oil & Gas", "Active", "", "2024-01-01"],
        ["ONGC", "Oil and Natural Gas Corp.", "NSE", "Energy", "Oil & Gas", "Active", "", "2024-01-01"],
        ["TCS", "Tata Consultancy Services Ltd.", "NSE", "Technology", "IT Services", "Active", "", "2024-01-01"],
        ["INFY", "Infosys Ltd.", "NSE", "Technology", "IT Services", "Active", "", "2024-01-01"],
        ["WIPRO", "Wipro Ltd.", "NSE", "Technology", "IT Services", "Active", "", "2024-01-01"],
        ["HDFCBANK", "HDFC Bank Ltd.", "NSE", "Financials", "Banking", "Active", "", "2024-01-01"],
        ["ICICIBANK", "ICICI Bank Ltd.", "NSE", "Financials", "Banking", "Active", "", "2024-01-01"],
        ["SBIN", "State Bank of India", "NSE", "Financials", "Banking", "Active", "", "2024-01-01"],
        ["ITC", "ITC Ltd.", "NSE", "FMCG", "Tobacco & Consumer Goods", "Active", "", "2024-01-01"],
        ["HINDUNILVR", "Hindustan Unilever Ltd.", "NSE", "FMCG", "Household Products", "Active", "", "2024-01-01"],
        ["TATAMOTORS", "Tata Motors Ltd.", "NSE", "Automobile", "Auto Manufacturers", "Active", "", "2024-01-01"],
        ["M&M", "Mahindra & Mahindra Ltd.", "NSE", "Automobile", "Auto Manufacturers", "Active", "", "2024-01-01"],
        ["MARUTI", "Maruti Suzuki India Ltd.", "NSE", "Automobile", "Auto Manufacturers", "Active", "", "2024-01-01"],
        ["TATASTEEL", "Tata Steel Ltd.", "NSE", "Metals", "Steel Production", "Active", "", "2024-01-01"],
        ["HINDALCO", "Hindalco Industries Ltd.", "NSE", "Metals", "Aluminum Production", "Active", "", "2024-01-01"],
        ["JSWSTEEL", "JSW Steel Ltd.", "NSE", "Metals", "Steel Production", "Active", "", "2024-01-01"],
        ["SUNPHARMA", "Sun Pharmaceutical Industries Ltd.", "NSE", "Healthcare", "Pharmaceuticals", "Active", "", "2024-01-01"],
        ["CIPLA", "Cipla Ltd.", "NSE", "Healthcare", "Pharmaceuticals", "Active", "", "2024-01-01"],
        ["DRREDDY", "Dr. Reddy's Laboratories Ltd.", "NSE", "Healthcare", "Pharmaceuticals", "Active", "", "2024-01-01"],
        ["LT", "Larsen & Toubro Ltd.", "NSE", "Industrials", "Construction & Engineering", "Active", "", "2024-01-01"]
      ]
    },
    "Historical Data": {
      gridlines: true,
      frozenRows: 1,
      columnsWidths: [100, 110, 90, 90, 90, 90, 100, 120, 120, 140],
      headers: ["Symbol", "Date", "Open", "High", "Low", "Close", "Adj Close", "Volume", "Source", "Updated At"]
    },
    "Reports": {
      gridlines: true,
      frozenRows: 1,
      columnsWidths: [150, 150, 150, 300, 200],
      headers: ["Report ID", "Generated At", "Report Type", "Metrics Summary", "Download/View Link"]
    },
    "Logs": {
      gridlines: true,
      frozenRows: 1,
      columnsWidths: [100, 90, 180, 100, 120, 350],
      headers: ["Date", "Time", "Function Name", "Status", "Duration (ms)", "Error Message"]
    },
    "Cache": {
      gridlines: true,
      frozenRows: 1,
      columnsWidths: [200, 450, 180],
      headers: ["Key", "Value", "Expiration Date"]
    },
    "Sector History": {
      gridlines: true,
      frozenRows: 1,
      columnsWidths: [100, 150, 100, 80, 160, 120, 150, 180, 250],
      headers: ["Date", "Sector Name", "Sector Score", "Rank", "Current Stage", "Money Inflow", "Sector Breadth (%)", "RS vs Nifty (%)", "Generated Alerts"]
    },
    "Backtests": {
      gridlines: true,
      frozenRows: 1,
      columnsWidths: [120, 120, 120, 120, 120, 120, 120, 120, 120, 120, 120],
      headers: ["Metric / Strategy", "Volume-First Early Rotation", "Simple Price Momentum", "Broad Market Benchmark", "Difference / Alpha", "Win Rate (%)", "Total Trades", "Average Return (%)", "Max Drawdown (%)", "Profit Factor", "Holding Period"]
    }
  }
};
