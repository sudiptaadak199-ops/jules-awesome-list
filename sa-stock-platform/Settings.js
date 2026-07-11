/**
 * SA Stock Research & Backtest Platform - Phase 1 (Foundation)
 *
 * Cached Settings Service with Self-Healing Validation
 *
 * Transparently manages configuration readings and mutations.
 * If a required system setting is deleted or missing from the spreadsheet, it automatically heals and regenerates it.
 */

class Settings {
  /**
   * Initializes the settings repository cache.
   * Compares the settings sheet records with Config.DEFAULT_SETTINGS, auto-healing missing variables.
   */
  static init() {
    this._cache = {};
    try {
      const ss = SheetManager.getActiveSpreadsheet();
      const sheet = ss.getSheetByName(Config.SHEETS.SETTINGS);

      if (!sheet) {
        this.loadFromDefaults();
        return;
      }

      const lastRow = sheet.getLastRow();
      if (lastRow <= 1) {
        this.repairAllSettings(sheet);
        return;
      }

      // Read current values
      const data = sheet.getRange(2, 1, lastRow - 1, 3).getValues();
      const currentKeys = {};

      for (let i = 0; i < data.length; i++) {
        const key = String(data[i][0]).trim();
        const value = String(data[i][1]).trim();
        if (key) {
          this._cache[key] = value;
          currentKeys[key] = true;
        }
      }

      // Check for missing keys against Config defaults to trigger self-healing
      let repairNeeded = false;
      const defaults = Config.DEFAULT_SETTINGS;
      for (let i = 1; i < defaults.length; i++) {
        const defaultKey = defaults[i][0];
        if (!currentKeys[defaultKey]) {
          repairNeeded = true;
          this._cache[defaultKey] = defaults[i][1];
          // Append the missing key row
          const nowStr = PlatformUtils.formatDate(new Date());
          sheet.appendRow([defaultKey, defaults[i][1], defaults[i][2], nowStr]);
        }
      }

      if (repairNeeded) {
        console.log("Settings module detected missing variables and completed dynamic self-repair.");
      }

    } catch (e) {
      this.loadFromDefaults();
    }
  }

  /**
   * Forces complete sheet settings rebuild.
   * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
   */
  static repairAllSettings(sheet) {
    this.loadFromDefaults();
    const rows = [];
    const defaults = Config.DEFAULT_SETTINGS;
    const nowStr = PlatformUtils.formatDate(new Date());

    for (let i = 1; i < defaults.length; i++) {
      rows.push([defaults[i][0], defaults[i][1], defaults[i][2], nowStr]);
    }

    if (rows.length > 0) {
      sheet.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
    }
  }

  /**
   * populates active local memory cache from configuration defaults.
   */
  static loadFromDefaults() {
    this._cache = {};
    const defaults = Config.DEFAULT_SETTINGS;
    for (let i = 1; i < defaults.length; i++) {
      this._cache[defaults[i][0]] = defaults[i][1];
    }
  }

  /**
   * Retrieves a setting key.
   * @param {string} key - Setting name.
   * @param {any} defaultValue - Fallback.
   * @returns {string} String configuration.
   */
  static get(key, defaultValue = "") {
    if (!this._cache || Object.keys(this._cache).length === 0) {
      this.init();
    }
    return this._cache[key] !== undefined ? this._cache[key] : defaultValue;
  }

  /**
   * Numeric settings parsed getter.
   * @param {string} key - Setting name.
   * @param {number} defaultValue - Fallback.
   * @returns {number}
   */
  static getNum(key, defaultValue = 0) {
    const val = parseFloat(this.get(key));
    return isNaN(val) ? defaultValue : val;
  }

  /**
   * Boolean settings parsed getter.
   * @param {string} key - Setting name.
   * @param {boolean} defaultValue - Fallback.
   * @returns {boolean}
   */
  static getBool(key, defaultValue = false) {
    return PlatformUtils.toBool(this.get(key, defaultValue));
  }

  /**
   * Sets / writes system configuration both in runtime memory cache and persistent sheet cell.
   * @param {string} key - Setting name.
   * @param {string} value - Value representation.
   */
  static set(key, value) {
    if (!this._cache) {
      this._cache = {};
    }
    this._cache[key] = String(value);

    try {
      const ss = SheetManager.getActiveSpreadsheet();
      const sheet = ss.getSheetByName(Config.SHEETS.SETTINGS);
      if (!sheet) return;

      const lastRow = sheet.getLastRow();
      let found = false;

      if (lastRow > 1) {
        const range = sheet.getRange(2, 1, lastRow - 1, 2);
        const data = range.getValues();
        for (let i = 0; i < data.length; i++) {
          if (String(data[i][0]).trim() === key) {
            sheet.getRange(i + 2, 2, 1, 3).setValues([[String(value), "Updated on flow runtime.", PlatformUtils.formatDate(new Date())]]);
            found = true;
            break;
          }
        }
      }

      if (!found) {
        sheet.appendRow([key, String(value), "Dynamic runtime key addition.", PlatformUtils.formatDate(new Date())]);
      }
    } catch (e) {
      // safe fallback for mock unit tests
    }
  }
}

// Export to Node environment for local CI/CD testing
if (typeof exports !== 'undefined') {
  exports.Settings = Settings;
}
