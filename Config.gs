/**
 * Config.gs - Configuration & Schema Engine for NSE Volume Intelligence Platform
 * Author: Quantitative Trading System Architect
 */

// In-memory cache for loaded settings
var _SETTINGS_CACHE = null;

/**
 * Returns configuration schemas and constants for the platform.
 */
function getConfig() {
  return {
    PROJECT_NAME: "NSE Volume, Delivery & Big Money Intelligence Platform",
    VERSION: "2.0.0",
    DEFAULT_TIMEZONE: "Asia/Kolkata",

    // Centralized Official NSE Data Endpoints
    ENDPOINTS: {
      NSE_BHAVCOPY_URL: "https://archives.nseindia.com/products/content/sec_bhavdata_full_{DDMMYYYY}.csv",
      NSE_FII_ACTIVITY_URL: "https://www.nseindia.com/api/fiidiiTradeReact",
      NSE_HOME_URL: "https://www.nseindia.com"
    },

    // 12 Mandatory Sheets Definition
    SHEETS: {
      DASHBOARD: "Dashboard",
      MASTER_STOCKS: "Master_Stocks",
      RAW_DAILY: "Raw_Daily",
      RAW_FII: "Raw_FII",
      RAW_FII_HOLDINGS: "Raw_FII_Holdings",
      CALCULATIONS: "Calculations",
      SECTOR_DATA: "Sector_Data",
      SIGNALS: "Signals",
      HISTORICAL_LOG: "Historical_Log",
      BACKTEST: "Backtest",
      SETTINGS: "Settings",
      SYSTEM_LOG: "System_Log"
    },

    // Sheet Headers Definition
    HEADERS: {
      MASTER_STOCKS: [
        "Symbol", "Company Name", "Sector", "Industry", "Series", "Active/Inactive", "Market Cap", "Last Updated"
      ],
      RAW_DAILY: [
        "Date", "Symbol", "Series", "Open", "High", "Low", "Close", "VWAP", "Volume", "Turnover", "Number of Trades", "Deliverable Qty", "Delivery %", "Key"
      ],
      RAW_FII: [
        "Date", "FII Buy", "FII Sell", "Net FII", "Source"
      ],
      RAW_FII_HOLDINGS: [
        "Stock", "Previous FII %", "Current FII %", "Change in FII %", "Previous Quarter", "Current Quarter", "FII Trend", "Last Updated"
      ],
      CALCULATIONS: [
        "Symbol", "Company Name", "Sector", "Current Price", "Previous Close", "Price Change %",
        "Volume", "Avg Vol 5D", "Avg Vol 20D", "Avg Vol 50D", "RVOL", "Volume Spike %", "Volume Acceleration",
        "Delivery Qty", "Delivery %", "Avg Delivery 5D", "Avg Delivery 20D", "Delivery Acceleration",
        "5D Return", "20D Return", "EMA20", "EMA50", "Price vs EMA20 %", "Price vs EMA50 %", "EMA Trend",
        "RS vs Nifty", "20D Avg Seller", "5D Avg Seller", "Seller Trend", "FII Holding Change",
        "Stock Rotation Score", "New Money Inflow Score", "Big Money Entry Score", "Final Signal", "Signal Date"
      ],
      SECTOR_DATA: [
        "Sector", "Total Stocks", "Advancing Stocks", "Declining Stocks", "Breadth %",
        "Avg RVOL", "Avg Vol Accel", "Avg 20D Return", "Sector RS vs Nifty", "Avg Delivery %",
        "Sector New Money Score", "Sector Stage", "Last Updated"
      ],
      SIGNALS: [
        "Signal ID", "Date", "Symbol", "Company", "Sector", "Signal Type", "Trigger Price",
        "RVOL", "Delivery %", "Vol Accel", "20D Avg Seller", "Rotation Score", "New Money Score", "Big Money Score", "Status"
      ],
      HISTORICAL_LOG: [
        "Date", "Symbol", "Price", "Price Change %", "Volume", "RVOL", "Delivery Qty", "Delivery %",
        "Vol Accel", "20D Avg Seller", "RS vs Nifty", "Sector", "Sector Stage", "Rotation Score", "New Money Score", "Big Money Score", "Signals Generated"
      ],
      BACKTEST: [
        "Trade ID", "Strategy", "Symbol", "Entry Date", "Entry Price", "Exit Date", "Exit Price",
        "Return %", "Max Favorable Excursion %", "Max Adverse Excursion %", "Outcome", "Holding Days", "Signal Score"
      ],
      SETTINGS: [
        "Parameter", "Value", "Description", "Category"
      ],
      SYSTEM_LOG: [
        "Timestamp", "Level", "Module", "Message", "Details"
      ]
    },

    // Default Configuration Key-Value Pairs
    DEFAULT_SETTINGS: [
      ["RVOL_THRESHOLD_NORMAL", 1.0, "RVOL normal threshold lower bound", "RVOL"],
      ["RVOL_THRESHOLD_ELEVATED", 1.5, "RVOL elevated threshold", "RVOL"],
      ["RVOL_THRESHOLD_HIGH", 2.0, "RVOL high threshold", "RVOL"],
      ["RVOL_THRESHOLD_VERY_HIGH", 5.0, "RVOL very high threshold", "RVOL"],
      ["RVOL_THRESHOLD_EXTREME", 10.0, "RVOL extreme threshold", "RVOL"],
      ["RVOL_THRESHOLD_ULTRA_EXTREME", 20.0, "RVOL scanner threshold (20x+)", "RVOL"],

      ["SELLER_THRESHOLD", 40000, "20D Average Seller pressure threshold (Max allowed)", "Seller System"],
      ["DELIVERY_ACCEL_STRONG", 1.2, "Strong delivery acceleration threshold", "Delivery"],
      ["VOL_ACCEL_INCREASING", 1.1, "Volume acceleration increasing threshold", "Volume"],
      ["VOL_ACCEL_STRONG", 1.3, "Volume acceleration strong threshold", "Volume"],

      ["STOCK_ROTATION_W_RETURN20D", 0.40, "Stock Rotation weight: 20D Return", "Stock Rotation Weights"],
      ["STOCK_ROTATION_W_RS", 0.30, "Stock Rotation weight: RS vs Nifty", "Stock Rotation Weights"],
      ["STOCK_ROTATION_W_RVOL", 0.20, "Stock Rotation weight: RVOL", "Stock Rotation Weights"],
      ["STOCK_ROTATION_W_EMA_TREND", 0.10, "Stock Rotation weight: EMA Trend", "Stock Rotation Weights"],

      ["NEW_MONEY_W_RVOL", 0.40, "New Money Score weight: RVOL", "New Money Weights"],
      ["NEW_MONEY_W_VOL_ACCEL", 0.30, "New Money Score weight: Volume Acceleration", "New Money Weights"],
      ["NEW_MONEY_W_DELIVERY_ACCEL", 0.20, "New Money Score weight: Delivery Acceleration", "New Money Weights"],
      ["NEW_MONEY_W_RS", 0.10, "New Money Score weight: RS vs Nifty", "New Money Weights"],

      ["BIG_MONEY_W_RVOL", 0.20, "Big Money Entry weight: RVOL", "Big Money Weights"],
      ["BIG_MONEY_W_VOL_ACCEL", 0.15, "Big Money Entry weight: Volume Acceleration", "Big Money Weights"],
      ["BIG_MONEY_W_DELIVERY", 0.20, "Big Money Entry weight: Delivery Quantity/Ratio", "Big Money Weights"],
      ["BIG_MONEY_W_PRICE_TREND", 0.15, "Big Money Entry weight: Price Trend (above EMA)", "Big Money Weights"],
      ["BIG_MONEY_W_RS", 0.10, "Big Money Entry weight: Relative Strength", "Big Money Weights"],
      ["BIG_MONEY_W_LOW_SELLER", 0.10, "Big Money Entry weight: Low Seller Pressure (<40K)", "Big Money Weights"],
      ["BIG_MONEY_W_SECTOR", 0.05, "Big Money Entry weight: Sector Strength", "Big Money Weights"],
      ["BIG_MONEY_W_FII_HOLDING", 0.05, "Big Money Entry weight: FII Holding Increase", "Big Money Weights"],

      ["BACKTEST_START_DATE", "2024-01-01", "Default backtest start date", "Backtest"],
      ["BACKTEST_END_DATE", "2026-12-31", "Default backtest end date", "Backtest"],
      ["BACKTEST_HOLDING_DAYS", 10, "Default holding period in trading days", "Backtest"],
      ["BACKTEST_STOP_LOSS_PCT", 5.0, "Stop loss percentage threshold", "Backtest"],
      ["BACKTEST_TARGET_PCT", 15.0, "Profit target percentage threshold", "Backtest"],
      ["BACKTEST_POSITION_SIZE", 100000, "Position size in INR per trade", "Backtest"],

      ["DELIVERY_FILTER_MODE", "Top 20", "Dashboard delivery filter (Top 10, Top 20, Top 50, All)", "Dashboard"],
      ["DATA_SOURCE_NAME", "NSE Official Archives & Bhavcopy", "Primary Data Source Label", "System"]
    ],

    // Default Universe of Active NSE Stocks across major sectors
    DEFAULT_MASTER_STOCKS: [
      ["RELIANCE", "Reliance Industries Ltd", "Energy", "Oil & Gas", "EQ", "ACTIVE", 2000000, new Date()],
      ["TCS", "Tata Consultancy Services Ltd", "IT", "Software", "EQ", "ACTIVE", 1400000, new Date()],
      ["HDFCBANK", "HDFC Bank Ltd", "Financial Services", "Private Bank", "EQ", "ACTIVE", 1200000, new Date()],
      ["ICICIBANK", "ICICI Bank Ltd", "Financial Services", "Private Bank", "EQ", "ACTIVE", 800000, new Date()],
      ["INFY", "Infosys Ltd", "IT", "Software", "EQ", "ACTIVE", 700000, new Date()],
      ["BHARTIARTL", "Bharti Airtel Ltd", "Telecom", "Telecom Services", "EQ", "ACTIVE", 750000, new Date()],
      ["ITC", "ITC Ltd", "FMCG", "Tobacco & FMCG", "EQ", "ACTIVE", 600000, new Date()],
      ["SBIN", "State Bank of India", "Financial Services", "Public Bank", "EQ", "ACTIVE", 700000, new Date()],
      ["LTIM", "LTIMindtree Ltd", "IT", "Software", "EQ", "ACTIVE", 180000, new Date()],
      ["LT", "Larsen & Toubro Ltd", "Capital Goods", "Engineering", "EQ", "ACTIVE", 500000, new Date()],
      ["TATASTEEL", "Tata Steel Ltd", "Metals", "Steel", "EQ", "ACTIVE", 200000, new Date()],
      ["NTPC", "NTPC Ltd", "Power", "Power Generation", "EQ", "ACTIVE", 350000, new Date()],
      ["ONGC", "Oil & Natural Gas Corp Ltd", "Energy", "Oil Exploration", "EQ", "ACTIVE", 320000, new Date()],
      ["TATAMOTORS", "Tata Motors Ltd", "Automobile", "Auto - Passenger", "EQ", "ACTIVE", 330000, new Date()],
      ["SUNPHARMA", "Sun Pharmaceutical Industries", "Healthcare", "Pharmaceuticals", "EQ", "ACTIVE", 400000, new Date()],
      ["MARUTI", "Maruti Suzuki India Ltd", "Automobile", "Auto - Passenger", "EQ", "ACTIVE", 380000, new Date()],
      ["M&M", "Mahindra & Mahindra Ltd", "Automobile", "Auto - Passenger", "EQ", "ACTIVE", 350000, new Date()],
      ["AXISBANK", "Axis Bank Ltd", "Financial Services", "Private Bank", "EQ", "ACTIVE", 360000, new Date()],
      ["KOTAKBANK", "Kotak Mahindra Bank Ltd", "Financial Services", "Private Bank", "EQ", "ACTIVE", 340000, new Date()],
      ["BAJFINANCE", "Bajaj Finance Ltd", "Financial Services", "NBFC", "EQ", "ACTIVE", 420000, new Date()],
      ["COALINDIA", "Coal India Ltd", "Mining", "Coal", "EQ", "ACTIVE", 280000, new Date()],
      ["HAL", "Hindustan Aeronautics Ltd", "Defense", "Aerospace & Defense", "EQ", "ACTIVE", 310000, new Date()],
      ["BEL", "Bharat Electronics Ltd", "Defense", "Defense Electronics", "EQ", "ACTIVE", 220000, new Date()],
      ["TRENT", "Trent Ltd", "Retail", "Specialty Retail", "EQ", "ACTIVE", 240000, new Date()],
      ["NIFTY", "Nifty 50 Index Benchmark", "Benchmark", "Index", "INDEX", "ACTIVE", 0, new Date()]
    ]
  };
}

/**
 * Reads settings from the Settings sheet and returns a key-value object.
 * Utilizes in-memory caching to optimize performance.
 */
function getSettings(forceRefresh) {
  if (_SETTINGS_CACHE && !forceRefresh) {
    return _SETTINGS_CACHE;
  }

  var config = getConfig();
  var settings = {};

  // Populate default settings first
  for (var i = 0; i < config.DEFAULT_SETTINGS.length; i++) {
    var item = config.DEFAULT_SETTINGS[i];
    settings[item[0]] = item[1];
  }

  try {
    if (typeof SpreadsheetApp !== "undefined" && SpreadsheetApp.getActiveSpreadsheet) {
      var ss = SpreadsheetApp.getActiveSpreadsheet();
      if (ss) {
        var sheet = ss.getSheetByName(config.SHEETS.SETTINGS);
        if (sheet && sheet.getLastRow() > 1) {
          var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).getValues();
          for (var r = 0; r < data.length; r++) {
            var key = data[r][0];
            var val = data[r][1];
            if (key) {
              if (!isNaN(val) && val !== "" && val !== null && typeof val !== "boolean") {
                val = Number(val);
              }
              settings[key] = val;
            }
          }
        }
      }
    }
  } catch (e) {
    // Fall back to defaults
  }

  _SETTINGS_CACHE = settings;
  return settings;
}

/**
 * Invalidates the in-memory settings cache.
 */
function clearSettingsCache() {
  _SETTINGS_CACHE = null;
}
