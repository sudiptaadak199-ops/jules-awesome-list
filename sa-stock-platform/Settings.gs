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
      var ss = SheetManager.getActiveSpreadsheet();
      var sheet = ss.getSheetByName(Config.SHEETS.SETTINGS);

      if (!sheet) {
        this.loadFromDefaults();
        return;
      }

      var lastRow = sheet.getLastRow();
      if (lastRow <= 1) {
        this.repairAllSettings(sheet);
        return;
      }

      // Read current values
      var data = sheet.getRange(2, 1, lastRow - 1, 3).getValues();
      var currentKeys = {};

      for (var i = 0; i < data.length; i++) {
        var key = String(data[i][0]).trim();
        var value = String(data[i][1]).trim();
        if (key) {
          this._cache[key] = value;
          currentKeys[key] = true;
        }
      }

      // Check for missing keys against Config defaults to trigger self-healing
      var repairNeeded = false;
      var defaults = Config.DEFAULT_SETTINGS;
      for (var i = 1; i < defaults.length; i++) {
        var defaultKey = defaults[i][0];
        if (!currentKeys[defaultKey]) {
          repairNeeded = true;
          this._cache[defaultKey] = defaults[i][1];
          // Append the missing key row
          var nowStr = PlatformUtils.formatDate(new Date());
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
    var rows = [];
    var defaults = Config.DEFAULT_SETTINGS;
    var nowStr = PlatformUtils.formatDate(new Date());

    for (var i = 1; i < defaults.length; i++) {
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
    var defaults = Config.DEFAULT_SETTINGS;
    for (var i = 1; i < defaults.length; i++) {
      this._cache[defaults[i][0]] = defaults[i][1];
    }
  }

  /**
   * Retrieves a setting key.
   * @param {string} key - Setting name.
   * @param {any} defaultValue - Fallback.
   * @returns {string} String configuration.
   */
  static get(key, defaultValue) {
    if (defaultValue === undefined) defaultValue = "";
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
  static getNum(key, defaultValue) {
    if (defaultValue === undefined) defaultValue = 0;
    var val = parseFloat(this.get(key));
    return isNaN(val) ? defaultValue : val;
  }

  /**
   * Boolean settings parsed getter.
   * @param {string} key - Setting name.
   * @param {boolean} defaultValue - Fallback.
   * @returns {boolean}
   */
  static getBool(key, defaultValue) {
    if (defaultValue === undefined) defaultValue = false;
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
      var ss = SheetManager.getActiveSpreadsheet();
      var sheet = ss.getSheetByName(Config.SHEETS.SETTINGS);
      if (!sheet) return;

      var lastRow = sheet.getLastRow();
      var found = false;

      if (lastRow > 1) {
        var range = sheet.getRange(2, 1, lastRow - 1, 2);
        var data = range.getValues();
        for (var i = 0; i < data.length; i++) {
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
      // safe fallback
    }
  }
}
