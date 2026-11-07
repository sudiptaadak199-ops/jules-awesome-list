/**
 * SA Automatic Futures Gap Analysis System
 * Config.gs - System constants, sheet definitions, column mappings, and configuration.
 */

var CONFIG = {
  PROJECT_NAME: 'SA Futures Gap System',
  VERSION: '1.3.0',
  TIMEZONE: 'Asia/Kolkata',

  // Sheet Names
  SHEETS: {
    SYMBOLS: 'Symbols',
    GAP_ANALYSIS: 'Futures Gap Analysis',
    CONTRACT_MAPPING: 'Contract_Mapping', // Hidden dual-contract mapping sheet
    DASHBOARD: 'Dashboard',
    SETTINGS: 'Settings',
    LOGS: 'Logs'
  },

  // Required 10 Columns for 'Futures Gap Analysis' tab (UNCHANGED)
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

  // Required 10 Columns for 'Contract_Mapping' tab
  CONTRACT_MAPPING_COLUMNS: [
    'Date',
    'Symbol',
    'Current Contract Symbol',
    'Current Expiry Date',
    'Next Contract Symbol',
    'Next Expiry Date',
    'Current Futures Price',
    'Next Futures Price',
    'Last Updated',
    'Data Status'
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

  // Free Data Sources URLs
  URLS: {
    NSE_UDIFF_FO: 'https://nsearchives.nseindia.com/content/fo/BhavCopy_NSE_FO_0_0_0_{YYYYMMDD}_F_0000.csv.zip',
    NSE_UDIFF_FO_ALT: 'https://archives.nseindia.com/content/fo/BhavCopy_NSE_FO_0_0_0_{YYYYMMDD}_F_0000.csv.zip',
    NSE_LEGACY_FO: 'https://archives.nseindia.com/content/historical/DERIVATIVES/{YYYY}/{MMM}/fo{DD}{MMM}{YYYY}bhav.csv.zip',
    NSE_CM_SEC: 'https://nsearchives.nseindia.com/products/content/sec_bhavdata_full_{DDMMYYYY}.csv',
    NSE_CM_SEC_ALT: 'https://archives.nseindia.com/products/content/sec_bhavdata_full_{DDMMYYYY}.csv',
    NSE_LEGACY_CM: 'https://archives.nseindia.com/content/historical/EQUITIES/{YYYY}/{MMM}/cm{DD}{MMM}{YYYY}bhav.csv.zip',
    NSE_HOLIDAY_MASTER: 'https://www.nseindia.com/api/holiday-master?type=trading'
  },

  // Known official NSE trading holidays (Calendar master)
  OFFICIAL_HOLIDAYS_MAP: {
    '2026-01-15': 'Municipal Corporation Election',
    '2026-01-26': 'Republic Day',
    '2026-02-15': 'Mahashivratri',
    '2026-03-03': 'Holi',
    '2026-03-21': 'Id-Ul-Fitr',
    '2026-03-26': 'Shri Ram Navami',
    '2026-03-31': 'Shri Mahavir Jayanti',
    '2026-04-03': 'Good Friday',
    '2026-04-14': 'Dr. Ambedkar Jayanti',
    '2026-05-01': 'Maharashtra Day',
    '2026-05-28': 'Bakri Id',
    '2026-06-26': 'Muharram',
    '2026-08-15': 'Independence Day',
    '2026-09-14': 'Ganesh Chaturthi',
    '2026-10-02': 'Mahatma Gandhi Jayanti',
    '2026-10-20': 'Dussehra',
    '2026-11-08': 'Diwali Laxmi Pujan*',
    '2026-11-10': 'Diwali-Balipratipada',
    '2026-11-24': 'Guru Nanak Jayanti',
    '2026-12-25': 'Christmas',
    '2024-11-20': 'Maharashtra Assembly Election'
  },

  COLORS: {
    HEADER_BG: '#1e293b',
    HEADER_FG: '#ffffff',
    ROW_ALT: '#f8fafc',
    BORDER: '#e2e8f0',
    ACCENT_BLUE: '#2563eb',
    SUCCESS_GREEN: '#16a34a',
    WARNING_AMBER: '#d97706',
    DANGER_RED: '#dc2626',
    CARD_BG: '#ffffff',
    TEXT_MUTED: '#64748b'
  }
};
