/**
 * SA Stock Research & Backtest Platform - Phase 1 (Foundation)
 *
 * Global Configuration and Constants
 *
 * This file contains global configuration definitions, sheet names,
 * and default settings. All other modules refer to this configuration.
 */

// Global constant object to hold all configuration values and namespace constants
const Config = {
  // Version info
  VERSION: "1.0.0-Phase1",

  // Sheet Name Definitions
  SHEETS: {
    DASHBOARD: "Dashboard",
    SETTINGS: "Settings",
    STOCK_MASTER: "Stock Master",
    HISTORICAL_DATA: "Historical Data",
    REPORTS: "Reports",
    LOGS: "Logs",
    CACHE: "Cache"
  },

  // Color Palette for professional look (Cool Tech Theme)
  COLORS: {
    PRIMARY_DARK: "#1b263b",   // Deep Navy for headers
    PRIMARY_LIGHT: "#e0e1dd",  // Light Cool Grey for subtle headers or alternates
    ACCENT: "#415a77",         // Slate Blue for borders or highlight headers
    TEXT_LIGHT: "#ffffff",     // White text on dark headers
    TEXT_DARK: "#0d1b2a",      // Charcoal black for dark text
    ALERT_SUCCESS: "#d8f3dc",  // Soft Green
    ALERT_ERROR: "#f8d7da",    // Soft Red
    ZEBRA_LIGHT: "#f8f9fa"     // Very light gray for zebra rows
  },

  // Default Settings to initialize if the Settings sheet is empty
  DEFAULT_SETTINGS: [
    ["Setting Key", "Value", "Description"],
    ["Data Source", "Yahoo Finance", "Source engine for fetching historical and real-time stock data (e.g. Yahoo Finance, NSE)."],
    ["Update Mode", "Delta", "Update strategy: 'Full' for complete download, 'Delta' for appending new data since last run."],
    ["Retry Count", "3", "Number of retry attempts if an API call or spreadsheet operation fails."],
    ["Batch Size", "100", "Maximum number of stocks processed or written in a single batch operation."],
    ["Cache Enabled", "TRUE", "Toggle to enable/disable sheet and runtime memory caching (TRUE/FALSE)."],
    ["Request Delay", "500", "Delay (in milliseconds) between API requests to prevent rate-limiting or IP blocks."],
    ["Debug Mode", "FALSE", "Toggle detailed logging and execution diagnostics (TRUE/FALSE)."]
  ]
};

// Expose Config as a global variable if needed in normal Apps Script environment
if (typeof exports !== 'undefined') {
  exports.Config = Config;
}
