/**
 * SA Stock Research & Backtest Platform - Phase 1 (Foundation)
 *
 * Generic Persistent Sheet Cache Layer
 *
 * Supports reading, writing, purging, and clearing cache entries.
 * Features customizable TTL (Time to Live) thresholds and respects active system configuration bypasses.
 */

class Cache {
  /**
   * Retrieves an item from the cache.
   * Automatically clears and deletes expired items on-the-fly.
   * @param {string} key - Cache lookup ID.
   * @returns {string|null} Cached data string, or null on expired or missing keys.
   */
  static get(key) {
    if (!Settings.getBool("Cache Enabled", true)) {
      return null;
    }

    try {
      const ss = SheetManager.getActiveSpreadsheet();
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
            return String(val);
          } else {
            // Delete expired key
            sheet.deleteRow(i + 2);
            return null;
          }
        }
      }
    } catch (e) {
      if (Settings.getBool("Debug Mode", false)) {
        console.error(`Cache read operation failure for [${key}]: ${e.message}`);
      }
    }
    return null;
  }

  /**
   * Writes/overwrites a key-value pair in the cache database tab with customizable TTL.
   * @param {string} key - Lookup ID.
   * @param {any} value - Cache payload.
   * @param {number} ttlMinutes - Expiration threshold in minutes.
   */
  static put(key, value, ttlMinutes = 60) {
    if (!Settings.getBool("Cache Enabled", true)) {
      return;
    }

    const payload = typeof value === "object" ? JSON.stringify(value) : String(value);
    const expiration = new Date(new Date().getTime() + ttlMinutes * 60 * 1000);

    try {
      const ss = SheetManager.getActiveSpreadsheet();
      const sheet = ss.getSheetByName(Config.SHEETS.CACHE);
      if (!sheet) return;

      const lastRow = sheet.getLastRow();
      let found = false;

      if (lastRow > 1) {
        const keys = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
        for (let i = 0; i < keys.length; i++) {
          if (String(keys[i][0]).trim() === key) {
            sheet.getRange(i + 2, 2, 1, 2).setValues([[payload, expiration]]);
            found = true;
            break;
          }
        }
      }

      if (!found) {
        sheet.appendRow([key, payload, expiration]);
      }
    } catch (e) {
      if (Settings.getBool("Debug Mode", false)) {
        console.error(`Cache write operation failure for [${key}]: ${e.message}`);
      }
    }
  }

  /**
   * Deletes a specific key-value pair from the cache immediately.
   * @param {string} key - Lookup ID.
   */
  static remove(key) {
    try {
      const ss = SheetManager.getActiveSpreadsheet();
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
        console.error(`Cache removal operation failure for [${key}]: ${e.message}`);
      }
    }
  }

  /**
   * Automatically scans and purges all expired keys to optimize sheet storage density.
   */
  static purgeExpired() {
    try {
      const ss = SheetManager.getActiveSpreadsheet();
      const sheet = ss.getSheetByName(Config.SHEETS.CACHE);
      if (!sheet) return;

      const lastRow = sheet.getLastRow();
      if (lastRow <= 1) return;

      const data = sheet.getRange(2, 1, lastRow - 1, 3).getValues();
      const now = new Date().getTime();

      // Scan backwards to maintain row index alignment during deletion
      for (let i = data.length - 1; i >= 0; i--) {
        const expirationTime = new Date(data[i][2]).getTime();
        if (expirationTime <= now) {
          sheet.deleteRow(i + 2);
        }
      }
    } catch (e) {
      if (Settings.getBool("Debug Mode", false)) {
        console.error(`Cache sweep purge operation failure: ${e.message}`);
      }
    }
  }

  /**
   * Resets and clears the cache entirely.
   */
  static clearAll() {
    try {
      SheetManager.clearDataBelowHeaders(Config.SHEETS.CACHE);
    } catch (e) {
      if (Settings.getBool("Debug Mode", false)) {
        console.error("Cache flush clear failure: " + e.message);
      }
    }
  }
}

// Export to Node environment for local CI/CD testing
if (typeof exports !== 'undefined') {
  exports.Cache = Cache;
}
