/**
 * SA Stock Research & Backtest Platform - Phase 1 (Foundation)
 *
 * Settings Service
 *
 * Manages configuration reading, writing, and transactional caching.
 */

class Settings {
  /**
   * Initializes the Settings cache from the active Settings sheet.
   */
  static init() {
    this._cache = {};
    try {
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const sheet = ss.getSheetByName(Config.SHEETS.SETTINGS);
      if (!sheet) {
        // Fall back to default config if sheet does not exist yet (e.g., pre-initialization)
        this.loadFromDefaults();
        return;
      }

      const lastRow = sheet.getLastRow();
      if (lastRow <= 1) {
        this.loadFromDefaults();
        return;
      }

      const data = sheet.getRange(2, 1, lastRow - 1, 2).getValues();
      for (let i = 0; i < data.length; i++) {
        const key = String(data[i][0]).trim();
        const value = String(data[i][1]).trim();
        if (key) {
          this._cache[key] = value;
        }
      }
    } catch (e) {
      // In case of any read exception, fallback to defaults
      this.loadFromDefaults();
    }
  }

  /**
   * Internal routine to populate cache with standard definitions when sheet reads fail/pre-init.
   */
  static loadFromDefaults() {
    this._cache = {};
    const defaults = Config.DEFAULT_SETTINGS;
    for (let i = 1; i < defaults.length; i++) {
      this._cache[defaults[i][0]] = defaults[i][1];
    }
  }

  /**
   * Retrieves a setting value by key with optional fallback.
   * @param {string} key - The setting name.
   * @param {any} defaultValue - Default value if not found.
   * @returns {string} Setting value.
   */
  static get(key, defaultValue = "") {
    if (!this._cache) {
      this.init();
    }
    return this._cache[key] !== undefined ? this._cache[key] : defaultValue;
  }

  /**
   * Retrieves a numeric setting.
   * @param {string} key - Setting key.
   * @param {number} defaultValue - Default fallback.
   * @returns {number} Numeric parsed setting.
   */
  static getNum(key, defaultValue = 0) {
    const val = this.get(key);
    const parsed = parseFloat(val);
    return isNaN(parsed) ? defaultValue : parsed;
  }

  /**
   * Retrieves a boolean setting.
   * @param {string} key - Setting key.
   * @param {boolean} defaultValue - Default fallback.
   * @returns {boolean} Boolean value.
   */
  static getBool(key, defaultValue = false) {
    const val = String(this.get(key)).toUpperCase();
    if (val === "TRUE" || val === "1" || val === "YES") return true;
    if (val === "FALSE" || val === "0" || val === "NO") return false;
    return defaultValue;
  }

  /**
   * Updates a setting value both in active memory and in the persistent Sheet store.
   * Performs an efficient row scan to avoid complete sheet rebuild.
   * @param {string} key - Setting key.
   * @param {string} value - New value.
   */
  static set(key, value) {
    if (!this._cache) {
      this.init();
    }
    this._cache[key] = String(value);

    try {
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const sheet = ss.getSheetByName(Config.SHEETS.SETTINGS);
      if (!sheet) return;

      const lastRow = sheet.getLastRow();
      if (lastRow > 1) {
        const range = sheet.getRange(2, 1, lastRow - 1, 2);
        const data = range.getValues();
        let found = false;

        for (let i = 0; i < data.length; i++) {
          if (String(data[i][0]).trim() === key) {
            sheet.getRange(i + 2, 2).setValue(value);
            found = true;
            break;
          }
        }

        if (!found) {
          sheet.appendRow([key, value, "Custom dynamic platform setting."]);
        }
      } else {
        sheet.appendRow([key, value, "Custom dynamic platform setting."]);
      }
    } catch (e) {
      // In non-sheets environments (e.g. testing context), ignore write errors
    }
  }
}

// Expose Settings globally if context allows
if (typeof exports !== 'undefined') {
  exports.Settings = Settings;
}
