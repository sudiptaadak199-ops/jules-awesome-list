/**
 * SA Automatic Futures Gap Analysis System
 * DataProvider.gs - Download and parse NSE UDiFF FO Bhavcopy, legacy FO Bhavcopy, Spot data, and Yahoo fallback.
 * Speed & Efficiency: Downloads each shared daily Bhavcopy file only once per date, not once per Symbol.
 */

var DataProvider = {
  // In-memory cache for the current script execution to prevent downloading the same date multiple times
  _dailyBhavcopyCache: {},

  /**
   * Fetch daily Bhavcopy data for a specific date and a target list of symbols.
   * Returns: {
   *   dateStr: 'YYYY-MM-DD',
   *   isTradingDay: boolean,
   *   symbolsData: {
   *     'RELIANCE': {
   *       spotPrice: number | null,
   *       contracts: [ { expiryStr: 'YYYY-MM-DD', expiryDate: Date, closePrice: number, settlePrice: number, underlyingPrice: number } ]
   *     }
   *   }
   * }
   */
  fetchDailyDataForDate: function(dateObj, targetSymbols) {
    var dateKey = Utils.formatDateKey(dateObj);
    if (this._dailyBhavcopyCache[dateKey]) {
      return this._filterForSymbols(this._dailyBhavcopyCache[dateKey], targetSymbols);
    }

    var parsedData = null;

    // 1. Try NSE UDiFF FO Bhavcopy (ZIP)
    try {
      parsedData = this._fetchNSEUdiffFO(dateObj);
    } catch (e) {
      // Logger.log('UDiFF fetch error: ' + e);
    }

    // 2. If UDiFF failed, try Legacy NSE FO Bhavcopy (ZIP)
    if (!parsedData || Object.keys(parsedData.symbolsData).length === 0) {
      try {
        parsedData = this._fetchNSELegacyFO(dateObj);
      } catch (e) {
        // Logger.log('Legacy FO fetch error: ' + e);
      }
    }

    // 3. If market day but spot prices are missing from FO bhavcopy, attempt Spot enrichment
    if (parsedData && parsedData.isTradingDay) {
      this._enrichSpotPrices(dateObj, parsedData);
    }

    if (parsedData) {
      this._dailyBhavcopyCache[dateKey] = parsedData;
      return this._filterForSymbols(parsedData, targetSymbols);
    }

    return {
      dateStr: dateKey,
      isTradingDay: false,
      symbolsData: {}
    };
  },

  /**
   * Fetch and parse NSE UDiFF FO Bhavcopy (ZIP format).
   * File URL pattern: https://nsearchives.nseindia.com/content/fo/BhavCopy_NSE_FO_0_0_0_YYYYMMDD_F_0000.csv.zip
   */
  _fetchNSEUdiffFO: function(dateObj) {
    var ymd = Utils.formatYYYYMMDD(dateObj);
    var dateKey = Utils.formatDateKey(dateObj);
    var url = CONFIG.URLS.NSE_UDIFF_FO.replace('{YYYYMMDD}', ymd);
    var csvText = this._fetchAndUnzipCsv(url);

    if (!csvText) {
      // Try alt URL
      var altUrl = CONFIG.URLS.NSE_UDIFF_FO_ALT.replace('{YYYYMMDD}', ymd);
      csvText = this._fetchAndUnzipCsv(altUrl);
    }

    if (!csvText) return null;

    return this.parseUdiffFOCsv(csvText, dateKey);
  },

  /**
   * Parse CSV content of modern NSE UDiFF FO Bhavcopy.
   */
  parseUdiffFOCsv: function(csvText, dateKey) {
    var lines = csvText.split(/\r?\n/);
    if (lines.length < 2) return null;

    var headerLine = lines[0].trim();
    var headers = headerLine.split(',').map(function(h) { return h.trim(); });

    var colIdx = {
      tradDt: headers.indexOf('TradDt'),
      tckrSymb: headers.indexOf('TckrSymb'),
      finInstrmTp: headers.indexOf('FinInstrmTp'),
      xpryDt: headers.indexOf('XpryDt'),
      actlXpryDt: headers.indexOf('FininstrmActlXpryDt'),
      clsPric: headers.indexOf('ClsPric'),
      sttlmPric: headers.indexOf('SttlmPric'),
      undrlygPric: headers.indexOf('UndrlygPric')
    };

    if (colIdx.tckrSymb === -1 || colIdx.xpryDt === -1) {
      return null;
    }

    var result = {
      dateStr: dateKey,
      isTradingDay: true,
      symbolsData: {}
    };

    for (var i = 1; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line) continue;
      var cols = line.split(',');

      var instType = (cols[colIdx.finInstrmTp] || '').trim().toUpperCase();
      // Filter for stock futures: STF (Stock Futures in UDiFF) or FUTSTK
      if (instType !== 'STF' && instType !== 'FUTSTK') {
        continue;
      }

      var symbol = (cols[colIdx.tckrSymb] || '').trim().toUpperCase();
      if (!symbol) continue;

      var rawExpiry = (colIdx.actlXpryDt !== -1 && cols[colIdx.actlXpryDt]) ? cols[colIdx.actlXpryDt].trim() : cols[colIdx.xpryDt].trim();
      var expiryDate = Utils.parseDate(rawExpiry);
      if (!expiryDate) continue;
      var expiryKey = Utils.formatDateKey(expiryDate);

      var closePrice = Utils.safeFloat(cols[colIdx.clsPric]);
      var settlePrice = Utils.safeFloat(cols[colIdx.sttlmPric]);
      // Use closePrice if available, else settlePrice
      var futurePrice = (closePrice !== null) ? closePrice : settlePrice;

      var undrlygPrice = (colIdx.undrlygPric !== -1) ? Utils.safeFloat(cols[colIdx.undrlygPric]) : null;

      if (!result.symbolsData[symbol]) {
        result.symbolsData[symbol] = {
          spotPrice: undrlygPrice,
          contracts: []
        };
      } else if (undrlygPrice !== null && result.symbolsData[symbol].spotPrice === null) {
        result.symbolsData[symbol].spotPrice = undrlygPrice;
      }

      result.symbolsData[symbol].contracts.push({
        expiryStr: expiryKey,
        expiryDate: expiryDate,
        closePrice: futurePrice,
        settlePrice: settlePrice,
        underlyingPrice: undrlygPrice
      });
    }

    return result;
  },

  /**
   * Fetch and parse Legacy NSE FO Bhavcopy (ZIP format).
   * URL format: https://archives.nseindia.com/content/historical/DERIVATIVES/YYYY/MMM/foDDMMMYYYYbhav.csv.zip
   */
  _fetchNSELegacyFO: function(dateObj) {
    var dateKey = Utils.formatDateKey(dateObj);
    var yyyy = dateObj.getFullYear();
    var mmm = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'][dateObj.getMonth()];
    var dd = ('0' + dateObj.getDate()).slice(-2);

    var url = CONFIG.URLS.NSE_LEGACY_FO
      .replace('{YYYY}', yyyy)
      .replace('{MMM}', mmm)
      .replace('{DD}', dd)
      .replace('{MMM}', mmm)
      .replace('{YYYY}', yyyy);

    var csvText = this._fetchAndUnzipCsv(url);
    if (!csvText) return null;

    return this.parseLegacyFOCsv(csvText, dateKey);
  },

  /**
   * Parse CSV content of legacy NSE FO Bhavcopy.
   */
  parseLegacyFOCsv: function(csvText, dateKey) {
    var lines = csvText.split(/\r?\n/);
    if (lines.length < 2) return null;

    var headerLine = lines[0].trim();
    var headers = headerLine.split(',').map(function(h) { return h.trim(); });

    var colIdx = {
      instrument: headers.indexOf('INSTRUMENT'),
      symbol: headers.indexOf('SYMBOL'),
      expiryDt: headers.indexOf('EXPIRY_DT'),
      close: headers.indexOf('CLOSE'),
      settlePr: headers.indexOf('SETTLE_PR')
    };

    if (colIdx.symbol === -1 || colIdx.expiryDt === -1) {
      return null;
    }

    var result = {
      dateStr: dateKey,
      isTradingDay: true,
      symbolsData: {}
    };

    for (var i = 1; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line) continue;
      var cols = line.split(',');

      var inst = (cols[colIdx.instrument] || '').trim().toUpperCase();
      if (inst !== 'FUTSTK') {
        continue;
      }

      var symbol = (cols[colIdx.symbol] || '').trim().toUpperCase();
      if (!symbol) continue;

      var rawExpiry = cols[colIdx.expiryDt].trim();
      var expiryDate = Utils.parseDate(rawExpiry);
      if (!expiryDate) continue;
      var expiryKey = Utils.formatDateKey(expiryDate);

      var closePrice = Utils.safeFloat(cols[colIdx.close]);
      var settlePrice = (colIdx.settlePr !== -1) ? Utils.safeFloat(cols[colIdx.settlePr]) : null;
      var futurePrice = (closePrice !== null) ? closePrice : settlePrice;

      if (!result.symbolsData[symbol]) {
        result.symbolsData[symbol] = {
          spotPrice: null, // Legacy FO bhavcopy does not include spot price
          contracts: []
        };
      }

      result.symbolsData[symbol].contracts.push({
        expiryStr: expiryKey,
        expiryDate: expiryDate,
        closePrice: futurePrice,
        settlePrice: settlePrice,
        underlyingPrice: null
      });
    }

    return result;
  },

  /**
   * Enrich missing Spot prices using NSE CM / Sec Bhavcopy or Yahoo Finance fallback
   */
  _enrichSpotPrices: function(dateObj, parsedData) {
    var symbolsNeedingSpot = [];
    var symKeys = Object.keys(parsedData.symbolsData);
    for (var i = 0; i < symKeys.length; i++) {
      var s = symKeys[i];
      if (parsedData.symbolsData[s].spotPrice === null) {
        symbolsNeedingSpot.push(s);
      }
    }

    if (symbolsNeedingSpot.length === 0) return;

    // Try NSE CM Sec Bhavcopy
    var ddmmyyyy = Utils.formatDDMMYYYY(dateObj);
    var cmUrl = CONFIG.URLS.NSE_CM_SEC.replace('{DDMMYYYY}', ddmmyyyy);
    var cmText = this._fetchHttpText(cmUrl);
    if (!cmText) {
      var cmAltUrl = CONFIG.URLS.NSE_CM_SEC_ALT.replace('{DDMMYYYY}', ddmmyyyy);
      cmText = this._fetchHttpText(cmAltUrl);
    }

    if (cmText) {
      this._parseAndApplySpotFromCmSec(cmText, parsedData, symbolsNeedingSpot);
    }

    // If still missing and Yahoo fallback enabled, try Yahoo chart fallback
    // (Only if single date or daily trigger run)
    var stillMissing = [];
    for (var j = 0; j < symbolsNeedingSpot.length; j++) {
      var sym = symbolsNeedingSpot[j];
      if (parsedData.symbolsData[sym].spotPrice === null) {
        stillMissing.push(sym);
      }
    }

    if (stillMissing.length > 0) {
      this._applyYahooSpotFallback(dateObj, parsedData, stillMissing);
    }
  },

  /**
   * Parse NSE CM sec_bhavdata_full CSV and apply Spot (Close) prices for series EQ
   */
  _parseAndApplySpotFromCmSec: function(cmText, parsedData, targetSymbols) {
    var lines = cmText.split(/\r?\n/);
    if (lines.length < 2) return;

    var headers = lines[0].split(',').map(function(h) { return h.trim(); });
    var symIdx = headers.indexOf('SYMBOL');
    var seriesIdx = headers.indexOf('SERIES');
    var closeIdx = headers.indexOf('CLOSE_PRICE');

    if (symIdx === -1 || closeIdx === -1) return;

    var targetSet = {};
    for (var k = 0; k < targetSymbols.length; k++) {
      targetSet[targetSymbols[k]] = true;
    }

    for (var i = 1; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line) continue;
      var cols = line.split(',');
      var sym = (cols[symIdx] || '').trim().toUpperCase();
      var series = (seriesIdx !== -1 && cols[seriesIdx]) ? cols[seriesIdx].trim().toUpperCase() : 'EQ';

      if (targetSet[sym] && (series === 'EQ' || series === 'BE')) {
        var spot = Utils.safeFloat(cols[closeIdx]);
        if (spot !== null && parsedData.symbolsData[sym]) {
          parsedData.symbolsData[sym].spotPrice = spot;
        }
      }
    }
  },

  /**
   * Fallback for spot prices using Yahoo Finance chart endpoint
   */
  _applyYahooSpotFallback: function(dateObj, parsedData, symbols) {
    if (typeof UrlFetchApp === 'undefined') return;
    for (var i = 0; i < symbols.length; i++) {
      var sym = symbols[i];
      try {
        var url = CONFIG.URLS.YAHOO_CHART.replace('{SYMBOL}', encodeURIComponent(sym));
        var resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
        if (resp.getResponseCode() === 200) {
          var data = JSON.parse(resp.getContentText());
          var result = data.chart && data.chart.result && data.chart.result[0];
          if (result && result.meta && result.meta.regularMarketPrice !== undefined) {
            var spot = Utils.safeFloat(result.meta.regularMarketPrice);
            if (spot !== null && parsedData.symbolsData[sym]) {
              parsedData.symbolsData[sym].spotPrice = spot;
            }
          }
        }
      } catch (e) {
        // Fallback error, leave null
      }
    }
  },

  /**
   * Filter loaded daily bhavcopy to only return data for target symbols
   */
  _filterForSymbols: function(dailyData, targetSymbols) {
    if (!targetSymbols || targetSymbols.length === 0) {
      return dailyData;
    }

    var targetSet = {};
    for (var i = 0; i < targetSymbols.length; i++) {
      targetSet[targetSymbols[i].trim().toUpperCase()] = true;
    }

    var filteredSymbols = {};
    var symKeys = Object.keys(dailyData.symbolsData);
    for (var j = 0; j < symKeys.length; j++) {
      var s = symKeys[j];
      if (targetSet[s]) {
        filteredSymbols[s] = dailyData.symbolsData[s];
      }
    }

    return {
      dateStr: dailyData.dateStr,
      isTradingDay: dailyData.isTradingDay,
      symbolsData: filteredSymbols
    };
  },

  /**
   * Helper to fetch HTTP text safely (in GAS via UrlFetchApp)
   */
  _fetchHttpText: function(url) {
    if (typeof UrlFetchApp === 'undefined') return null;
    try {
      var resp = UrlFetchApp.fetch(url, {
        muteHttpExceptions: true,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': '*/*'
        }
      });
      if (resp.getResponseCode() === 200) {
        return resp.getContentText();
      }
    } catch (e) {
      return null;
    }
    return null;
  },

  /**
   * Helper to fetch ZIP file and extract the primary CSV inside (in GAS via Utilities.unzip)
   */
  _fetchAndUnzipCsv: function(url) {
    if (typeof UrlFetchApp === 'undefined' || typeof Utilities === 'undefined') return null;
    try {
      var resp = UrlFetchApp.fetch(url, {
        muteHttpExceptions: true,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': '*/*'
        }
      });
      if (resp.getResponseCode() === 200) {
        var blob = resp.getBlob();
        var unzippedBlobs = Utilities.unzip(blob);
        if (unzippedBlobs && unzippedBlobs.length > 0) {
          return unzippedBlobs[0].getDataAsString();
        }
      }
    } catch (e) {
      return null;
    }
    return null;
  }
};
