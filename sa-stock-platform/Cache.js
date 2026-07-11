/**
 * SA Stock Research & Backtest Platform - Phase 1 (Foundation)
 *
 * Generic Sheet Cache Layer
 *
 * A robust, reliable sheet-based caching tier. If global settings disable
 * caching, reads automatically bypass and return null. Supports custom TTL.
 */

class Cache {
  /**
   * Retrieves a value from the cache.
   * If cache is disabled in settings, returns null immediately.
   * Expired keys are automatically filtered/ignored and removed on request or purge.
   * @param {string} key - The unique cache identifier.
   * @returns {string|null} The cached string representation of data, or null if miss/expired.
   */
  static get(key) {
    if (!Settings.getBool("Cache Enabled", true)) {
      return null;
    }

    try {
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const sheet = ss.getSheetByName(Config.SHEETS.CACHE);
      if (!sheet) return null;

      const lastRow = sheet.getLastRow();
      if (lastRow <= 1) return null;

      const data = sheet.getRange(2, 1, lastRow - 1, 3).getValues();
      const now = new Date().getTime();

      for (let i = 0; i < data.length; i++) {
        const cachedKey = String(data[i][0]).trim();
        if (cachedKey === key) {
          const val = data[i][1];
          const expTime = new Date(data[i][2]).getTime();

          if (expTime > now) {
            return typeof val === "string" ? val : JSON.stringify(val);
          } else {
            // Expired cache key - clean up on the fly in the sheet
            sheet.deleteRow(i + 2);
            return null;
          }
        }
      }
    } catch (e) {
      if (Settings.getBool("Debug Mode", false)) {
        console.error("Cache read failed: " + e.message);
      }
    }
    return null;
  }

  /**
   * Writes a key-value pair to the persistent Cache sheet.
   * Overwrites if the key already exists.
   * @param {string} key - Cache lookup key.
   * @param {any} value - Value to cache (will be converted to JSON/string if object).
   * @param {number} ttlMinutes - Expiration lifespan of this cache in minutes (default is 60).
   */
  static put(key, value, ttlMinutes = 60) {
    if (!Settings.getBool("Cache Enabled", true)) {
      return;
    }

    const valueStr = typeof value === "object" ? JSON.stringify(value) : String(value);
    const expirationDate = new Date(new Date().getTime() + ttlMinutes * 60 * 1000);

    try {
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const sheet = ss.getSheetByName(Config.SHEETS.CACHE);
      if (!sheet) return;

      const lastRow = sheet.getLastRow();
      let found = false;

      if (lastRow > 1) {
        const range = sheet.getRange(2, 1, lastRow - 1, 1);
        const keys = range.getValues();
        for (let i = 0; i < keys.length; i++) {
          if (String(keys[i][0]).trim() === key) {
            sheet.getRange(i + 2, 2, 1, 2).setValues([[valueStr, expirationDate]]);
            found = true;
            break;
          }
        }
      }

      if (!found) {
        sheet.appendRow([key, valueStr, expirationDate]);
      }
    } catch (e) {
      if (Settings.getBool("Debug Mode", false)) {
        console.error("Cache write failed: " + e.message);
      }
    }
  }

  /**
   * Deletes a specific key from the cache.
   * @param {string} key - The key to evict.
   */
  static remove(key) {
    try {
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const sheet = ss.getSheetByName(Config.SHEETS.CACHE);
      if (!sheet) return;

      const lastRow = sheet.getLastRow();
      if (lastRow <= 1) return;

      const keys = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
      for (let i = 0; i < keys.length; i++) {
        if (String(keys[i][0]).trim() === key) {
          sheet.deleteRow(i + 2);
          break;
        }
      }
    } catch (e) {
      if (Settings.getBool("Debug Mode", false)) {
        console.error("Cache remove failed: " + e.message);
      }
    }
  }

  /**
   * Scans and deletes all expired cache entries in bulk to optimize spreadsheet space and keep queries fast.
   */
  static purgeExpired() {
    try {
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const sheet = ss.getSheetByName(Config.SHEETS.CACHE);
      if (!sheet) return;

      const lastRow = sheet.getLastRow();
      if (lastRow <= 1) return;

      const data = sheet.getRange(2, 1, lastRow - 1, 3).getValues();
      const now = new Date().getTime();

      // Delete rows backwards to maintain index integrity
      for (let i = data.length - 1; i >= 0; i--) {
        const expTime = new Date(data[i][2]).getTime();
        if (expTime <= now) {
          sheet.deleteRow(i + 2);
        }
      }
    } catch (e) {
      if (Settings.getBool("Debug Mode", false)) {
        console.error("Cache purge failed: " + e.message);
      }
    }
  }

  /**
   * Clears all cached content in the sheet.
   */
  static clearAll() {
    try {
      SheetManager.clearDataBelowHeaders(Config.SHEETS.CACHE);
    } catch (e) {
      if (Settings.getBool("Debug Mode", false)) {
        console.error("Cache clear failed: " + e.message);
      }
    }
  }
}

// Expose Cache globally if context allows
if (typeof exports !== 'undefined') {
  exports.Cache = Cache;
}
