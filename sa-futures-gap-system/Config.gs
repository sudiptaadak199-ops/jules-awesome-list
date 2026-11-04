/**
 * SA Automatic Futures Gap Analysis System
 * Config.gs - System constants, sheet definitions, column mappings, and configuration.
 */

var CONFIG = {
  PROJECT_NAME: 'SA Futures Gap System',
  VERSION: '1.1.0',
  TIMEZONE: 'Asia/Kolkata',

  // Sheet Names
  SHEETS: {
    SYMBOLS: 'Symbols',
    GAP_ANALYSIS: 'Futures Gap Analysis',
    DASHBOARD: 'Dashboard',
    SETTINGS: 'Settings',
    LOGS: 'Logs'
  },

  // Required 10 Columns for 'Futures Gap Analysis' tab
  GAP_ANALYSIS_COLUMNS: [
    'Date',
    'Symbol',
    'Spot Price',
    'Current Future Price',
    'Next Future Price',
    'Current−Next Gap',
    'Current−Next Gap %',
    'Spot−Current Future Gap',
    'Spot-Future Gap %',
    'Historical Expiry Date'
  ],

  // Default initial symbols if user sheet is empty
  DEFAULT_SYMBOLS: [
    'RELIANCE',
    'TCS',
    'INFY',
    'HDFCBANK',
    'ICICIBANK'
  ],

  // System settings defaults
  DEFAULT_SETTINGS: [
    ['Setting', 'Value', 'Description'],
    ['BACKFILL_MONTHS', 6, 'Number of months of trading days to backfill historically (default: 6)'],
    ['MAX_DAYS_PER_BATCH', 15, 'Maximum trading days processed per backfill trigger iteration to prevent GAS timeouts'],
    ['ENABLE_AUTO_TRIGGERS', 'TRUE', 'Whether daily automatic 18:30 IST market close trigger is enabled'],
    ['DATA_SOURCE_MODE', 'LIVE', 'Data source mode: LIVE (NSE Bhavcopy archives)'],
    ['MAX_RETRIES_PER_DATE', 3, 'Maximum retry attempts for transient errors before queuing for scheduled recovery'],
    ['MAX_LOG_ROWS', 1000, 'Maximum log rows to retain in Logs sheet']
  ],

  // Free Data Sources URLs (Strictly official historical archives - no current price fallbacks for past dates)
  URLS: {
    // Modern NSE UDiFF FO Bhavcopy (ZIP)
    NSE_UDIFF_FO: 'https://nsearchives.nseindia.com/content/fo/BhavCopy_NSE_FO_0_0_0_{YYYYMMDD}_F_0000.csv.zip',
    NSE_UDIFF_FO_ALT: 'https://archives.nseindia.com/content/fo/BhavCopy_NSE_FO_0_0_0_{YYYYMMDD}_F_0000.csv.zip',

    // Legacy NSE FO Bhavcopy (ZIP)
    NSE_LEGACY_FO: 'https://archives.nseindia.com/content/historical/DERIVATIVES/{YYYY}/{MMM}/fo{DD}{MMM}{YYYY}bhav.csv.zip',

    // NSE CM Bhavcopy (Cash market / Spot fallback if UDiFF UndrlygPric missing)
    NSE_CM_SEC: 'https://nsearchives.nseindia.com/products/content/sec_bhavdata_full_{DDMMYYYY}.csv',
    NSE_CM_SEC_ALT: 'https://archives.nseindia.com/products/content/sec_bhavdata_full_{DDMMYYYY}.csv',
    NSE_LEGACY_CM: 'https://archives.nseindia.com/content/historical/EQUITIES/{YYYY}/{MMM}/cm{DD}{MMM}{YYYY}bhav.csv.zip'
  },

  // Color Palette ('Cool Tech' Professional Theme)
  COLORS: {
    HEADER_BG: '#1e293b',         // Slate 800
    HEADER_FG: '#ffffff',
    ROW_ALT: '#f8fafc',           // Slate 50
    BORDER: '#e2e8f0',            // Slate 200
    ACCENT_BLUE: '#2563eb',       // Blue 600
    SUCCESS_GREEN: '#16a34a',     // Green 600
    WARNING_AMBER: '#d97706',     // Amber 600
    DANGER_RED: '#dc2626',        // Red 600
    CARD_BG: '#ffffff',
    TEXT_MUTED: '#64748b'
  }
};
