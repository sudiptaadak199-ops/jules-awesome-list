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
    VERSION: "1.1.0-Phase1-SectorRotation",
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
    SECTOR_HISTORY: "Sector History"
  },

  // Menu configuration
  MENU: {
    MAIN_TITLE: "SA Platform",
    ITEMS: [
      { name: "Initialize / Repair Project", method: "InitializeProject" },
      { separator: true },
      { name: "Update Data Engine", method: "triggerUpdateData" },
      { name: "Run Backtest Analysis", method: "triggerRunBacktest" },
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
      STAGE_LEADING: "#d8f3dc",   // Light Green
      STAGE_IMPROVING: "#e2eafc", // Light Blue
      STAGE_WEAKENING: "#fff3b0", // Light Yellow
      STAGE_LAGGING: "#f8d7da",   // Light Red
      STAGE_BOTTOMING: "#f0e6ef"  // Light Purple
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
    ["Debug Mode", "FALSE", "Dumps runtime diagnostics directly to the GAS console log (TRUE/FALSE).", "2024-01-01"]
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
    }
  }
};
