/**
 * SA Automatic Futures Gap Analysis System
 * Utils.gs - Date formatting, trading day logic, batch array helpers, math utilities.
 */

var Utils = {
  /**
   * Format Date object as YYYY-MM-DD
   */
  formatDateKey: function(d) {
    if (!d) return '';
    var dateObj = (d instanceof Date) ? d : new Date(d);
    if (isNaN(dateObj.getTime())) return String(d);
    var y = dateObj.getFullYear();
    var m = ('0' + (dateObj.getMonth() + 1)).slice(-2);
    var day = ('0' + dateObj.getDate()).slice(-2);
    return y + '-' + m + '-' + day;
  },

  /**
   * Format Date object as DD-MMM-YYYY (e.g. 24-MAY-2024)
   */
  formatDateNSE: function(d) {
    if (!d) return '';
    var dateObj = (d instanceof Date) ? d : new Date(d);
    var months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    var day = ('0' + dateObj.getDate()).slice(-2);
    var m = months[dateObj.getMonth()];
    var y = dateObj.getFullYear();
    return day + '-' + m + '-' + y;
  },

  /**
   * Format Date object as YYYYMMDD
   */
  formatYYYYMMDD: function(d) {
    var dateObj = (d instanceof Date) ? d : new Date(d);
    var y = dateObj.getFullYear();
    var m = ('0' + (dateObj.getMonth() + 1)).slice(-2);
    var day = ('0' + dateObj.getDate()).slice(-2);
    return '' + y + m + day;
  },

  /**
   * Format Date object as DDMMYYYY
   */
  formatDDMMYYYY: function(d) {
    var dateObj = (d instanceof Date) ? d : new Date(d);
    var y = dateObj.getFullYear();
    var m = ('0' + (dateObj.getMonth() + 1)).slice(-2);
    var day = ('0' + dateObj.getDate()).slice(-2);
    return '' + day + m + y;
  },

  /**
   * Parse various date formats (YYYY-MM-DD, DD-MMM-YYYY, DD/MM/YYYY) into Date object
   */
  parseDate: function(str) {
    if (!str) return null;
    if (str instanceof Date) return isNaN(str.getTime()) ? null : str;
    var s = String(str).trim();
    if (!s) return null;

    // Format YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
      var parts = s.split('-');
      return new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    }

    // Format DD-MMM-YYYY (e.g. 30-MAY-2024 or 30-May-2024)
    if (/^\d{1,2}-[A-Za-z]{3}-\d{4}$/.test(s)) {
      var p = s.split('-');
      var months = {'JAN':0, 'FEB':1, 'MAR':2, 'APR':3, 'MAY':4, 'JUN':5, 'JUL':6, 'AUG':7, 'SEP':8, 'OCT':9, 'NOV':10, 'DEC':11};
      var m = months[p[1].toUpperCase()];
      if (m !== undefined) {
        return new Date(parseInt(p[2], 10), m, parseInt(p[0], 10));
      }
    }

    // Fallback standard parse
    var d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  },

  /**
   * Check if a given Date is a weekend (Saturday or Sunday)
   */
  isWeekend: function(dateObj) {
    var day = dateObj.getDay();
    return day === 0 || day === 6; // 0=Sunday, 6=Saturday
  },

  /**
   * Generate list of trading days (weekdays) backwards from an end date for N months
   * Default ~6 months = ~125-130 trading days
   */
  getHistoricalTradingDays: function(monthsBack, endDate) {
    var months = monthsBack || 6;
    var end = endDate ? new Date(endDate) : new Date();
    // Normalize to midnight
    end = new Date(end.getFullYear(), end.getMonth(), end.getDate());

    var start = new Date(end);
    start.setMonth(start.getMonth() - months);

    var tradingDays = [];
    var curr = new Date(start);

    while (curr <= end) {
      if (!this.isWeekend(curr)) {
        tradingDays.push(new Date(curr));
      }
      curr.setDate(curr.getDate() + 1);
    }
    return tradingDays;
  },

  /**
   * Safely parse float numbers, returning null if invalid or blank
   * Never converts missing/blank to zero!
   */
  safeFloat: function(val) {
    if (val === null || val === undefined || val === '') return null;
    var s = String(val).trim().replace(/,/g, '');
    if (s === '' || s === '-' || s === 'NA' || s === 'N/A' || s === 'null') return null;
    var num = parseFloat(s);
    return isNaN(num) ? null : num;
  },

  /**
   * Safe number formatting for display or calculation
   */
  round: function(num, decimals) {
    if (num === null || num === undefined || isNaN(num)) return null;
    var dec = (decimals !== undefined) ? decimals : 2;
    var factor = Math.pow(10, dec);
    return Math.round(num * factor) / factor;
  },

  /**
   * Chunk an array into smaller batches
   */
  chunkArray: function(array, size) {
    var chunks = [];
    for (var i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  },

  /**
   * Create unique composite key for a record: Date + Symbol + Expiry
   */
  makeRecordKey: function(dateStr, symbol, expiryStr) {
    return (dateStr || '').trim().toUpperCase() + '|' +
           (symbol || '').trim().toUpperCase() + '|' +
           (expiryStr || '').trim().toUpperCase();
  }
};
