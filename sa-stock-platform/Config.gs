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
    VERSION: "1.0.0-Phase1-Enterprise",
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
    ROTATION_HISTORY: "Rotation History"
  },

  // Menu configuration
  MENU: {
    MAIN_TITLE: "SA Platform",
    ITEMS: [
      { name: "Initialize / Repair Project", method: "InitializeProject" },
      { separator: true },
      { name: "Update Data Engine", method: "triggerUpdateData" },
      { name: "Run Sector Rotation Analysis", method: "triggerRunSectorAnalysis" },
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
      INFO_BOX_BG: "#eaf2f8"     // Accent container background
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
    ["Data Source", "Yahoo Finance", "Historical market feed engine (e.g. Yahoo Finance, NSE).", "2024-01-01"],
    ["Update Mode", "Delta", "Stock sync strategy: 'Full' or incremental 'Delta'.", "2024-01-01"],
    ["Retry Count", "3", "Maximum execution attempts before recording failure.", "2024-01-01"],
    ["Batch Size", "100", "Execution chunks for Google Sheets memory protection.", "2024-01-01"],
    ["Cache Enabled", "TRUE", "Toggle sheet-backed caching to reduce latency (TRUE/FALSE).", "2024-01-01"],
    ["Request Delay", "500", "Rate limit delay in milliseconds between stock processing.", "2024-01-01"],
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
        ["TCS", "Tata Consultancy Services Ltd.", "NSE", "Technology", "IT Services", "Active", "", "2024-01-01"],
        ["INFY", "Infosys Ltd.", "NSE", "Technology", "IT Services", "Active", "", "2024-01-01"]
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
    "Rotation History": {
      gridlines: true,
      frozenRows: 1,
      columnsWidths: [100, 140, 120, 110, 110, 90, 140, 100, 100, 130, 90, 160, 120, 120, 120],
      headers: [
        "Date", "Sector", "New Money Score", "Previous Score", "Score Change",
        "RVOL", "Volume Acceleration", "5D Return", "20D Return", "Relative Strength",
        "Breadth", "Rotation Stage", "Score Change 1D", "Score Change 5D", "Score Change 20D"
      ]
    }
  }
};
