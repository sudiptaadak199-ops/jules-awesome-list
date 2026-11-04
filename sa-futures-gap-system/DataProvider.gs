/**
 * SA Automatic Futures Gap Analysis System
 * DataProvider.gs - Download and parse NSE UDiFF FO Bhavcopy, legacy FO Bhavcopy, and historical Spot Bhavcopies.
 *
 * Rules:
 * 1. Strictly official historical archives. NEVER use current prices (such as Yahoo regularMarketPrice) for past dates.
 * 2. Shared daily Bhavcopy downloaded once per date and cached in memory across symbols.
 * 3. Categorize results: SUCCESS, HOLIDAY, UNPUBLISHED, NETWORK_ERROR, PARSING_ERROR.
 * 4. Never permanently skip dates after temporary network/HTTP failures.
 */

var DataProvider = {
  // In-memory cache for the current script execution to prevent downloading the same date multiple times
  _dailyBhavcopyCache: {},

  // Result status codes
  STATUS: {
    SUCCESS: 'SUCCESS',
    HOLIDAY: 'HOLIDAY',                 // Confirmed non-trading day (weekend or NSE market holiday)
    UNPUBLISHED: 'UNPUBLISHED',         // Current trading day not yet published (before ~18:00 IST)
    NETWORK_ERROR: 'NETWORK_ERROR',     // 5xx or connection timeout / fetch failure (transient)
    PARSING_ERROR: 'PARSING_ERROR'      // Response received but corrupted or unexpected schema
  },

  /**
   * Fetch daily Bhavcopy data for a specific date and a target list of symbols.
   * Returns: {
   *   dateStr: 'YYYY-MM-DD',
   *   status: 'SUCCESS' | 'HOLIDAY' | 'UNPUBLISHED' | 'NETWORK_ERROR' | 'PARSING_ERROR',
   *   isTradingDay: boolean,
   *   symbolsData: {
   *     'RELIANCE': {
   *       spotPrice: number | null,
   *       contracts: [ { expiryStr: 'YYYY-MM-DD', expiryDate: Date, closePrice: number, settlePrice: number, underlyingPrice: number } ]
   *     }
   *   },
   *   errorMsg: string | null
   * }
   */
  fetchDailyDataForDate: function(dateObj, targetSymbols) {
    var dateKey = Utils.formatDateKey(dateObj);
    if (this._dailyBhavcopyCache[dateKey]) {
      return this._filterForSymbols(this._dailyBhavcopyCache[dateKey], targetSymbols);
    }

    // Check if weekend
    if (Utils.isWeekend(dateObj)) {
      var holidayRes = {
        dateStr: dateKey,
        status: this.STATUS.HOLIDAY,
        isTradingDay: false,
        symbolsData: {},
        errorMsg: 'Weekend (Saturday/Sunday)'
      };
      this._dailyBhavcopyCache[dateKey] = holidayRes;
      return holidayRes;
    }

    var parsedData = null;
    var fetchStatus = this.STATUS.NETWORK_ERROR;
    var errorMsg = null;

    // 1. Try NSE UDiFF FO Bhavcopy (ZIP)
    var udiffRes = this._fetchNSEUdiffFO(dateObj);
    if (udiffRes.status === this.STATUS.SUCCESS && udiffRes.data) {
      parsedData = udiffRes.data;
      fetchStatus = this.STATUS.SUCCESS;
    } else {
      fetchStatus = udiffRes.status;
      errorMsg = udiffRes.error;
    }

    // 2. If UDiFF failed with 404/holiday or network error, check Legacy NSE FO Bhavcopy (for older dates)
    if (!parsedData) {
      var legacyRes = this._fetchNSELegacyFO(dateObj);
      if (legacyRes.status === this.STATUS.SUCCESS && legacyRes.data) {
        parsedData = legacyRes.data;
        fetchStatus = this.STATUS.SUCCESS;
        errorMsg = null;
      }
    }

    // 3. If derivative data found but spot price (undrlygPric) is missing, enrich strictly from historical Cash Bhavcopy
    if (parsedData && parsedData.isTradingDay) {
      this._enrichSpotPrices(dateObj, parsedData);
    }

    var finalResult;
    if (parsedData && fetchStatus === this.STATUS.SUCCESS) {
      finalResult = {
        dateStr: dateKey,
        status: this.STATUS.SUCCESS,
        isTradingDay: true,
        symbolsData: parsedData.symbolsData,
        errorMsg: null
      };
    } else {
      // Determine if it was an unpublished today or a holiday
      var isTodayOrFuture = this._isTodayOrFuture(dateObj);
      if (fetchStatus === this.STATUS.HOLIDAY && isTodayOrFuture) {
        fetchStatus = this.STATUS.UNPUBLISHED;
      }

      finalResult = {
        dateStr: dateKey,
        status: fetchStatus,
        isTradingDay: false,
        symbolsData: {},
        errorMsg: errorMsg || ('Failed with status: ' + fetchStatus)
      };
    }

    // Only cache definitive results (SUCCESS or confirmed past HOLIDAY), never cache transient errors permanently
    if (finalResult.status === this.STATUS.SUCCESS || (finalResult.status === this.STATUS.HOLIDAY && !this._isTodayOrFuture(dateObj))) {
      this._dailyBhavcopyCache[dateKey] = finalResult;
    }

    return this._filterForSymbols(finalResult, targetSymbols);
  },

  _isTodayOrFuture: function(dateObj) {
    var today = new Date();
    var dMidnight = new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate());
    var tMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    return dMidnight >= tMidnight;
  },

  /**
   * Fetch and parse NSE UDiFF FO Bhavcopy (ZIP format).
   */
  _fetchNSEUdiffFO: function(dateObj) {
    var ymd = Utils.formatYYYYMMDD(dateObj);
    var dateKey = Utils.formatDateKey(dateObj);
    var url = CONFIG.URLS.NSE_UDIFF_FO.replace('{YYYYMMDD}', ymd);

    var res = this._fetchAndUnzipCsv(url);
    if (res.status !== this.STATUS.SUCCESS) {
      // Try alt URL
      var altUrl = CONFIG.URLS.NSE_UDIFF_FO_ALT.replace('{YYYYMMDD}', ymd);
      var altRes = this._fetchAndUnzipCsv(altUrl);
      if (altRes.status === this.STATUS.SUCCESS) {
        res = altRes;
      }
    }

    if (res.status !== this.STATUS.SUCCESS) {
      return { status: res.status, data: null, error: res.error };
    }

    var parsed = this.parseUdiffFOCsv(res.csvText, dateKey);
    if (!parsed) {
      return { status: this.STATUS.PARSING_ERROR, data: null, error: 'Failed to parse UDiFF CSV structure' };
    }

    return { status: this.STATUS.SUCCESS, data: parsed, error: null };
  },

  /**
   * Parse CSV content of modern NSE UDiFF FO Bhavcopy.
   */
  parseUdiffFOCsv: function(csvText, dateKey) {
    if (!csvText) return null;
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
      var settlePrice = (colIdx.sttlmPric !== -1) ? Utils.safeFloat(cols[colIdx.sttlmPric]) : null;
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

    var res = this._fetchAndUnzipCsv(url);
    if (res.status !== this.STATUS.SUCCESS) {
      return { status: res.status, data: null, error: res.error };
    }

    var parsed = this.parseLegacyFOCsv(res.csvText, dateKey);
    if (!parsed) {
      return { status: this.STATUS.PARSING_ERROR, data: null, error: 'Failed to parse legacy CSV structure' };
    }

    return { status: this.STATUS.SUCCESS, data: parsed, error: null };
  },

  /**
   * Parse CSV content of legacy NSE FO Bhavcopy.
   */
  parseLegacyFOCsv: function(csvText, dateKey) {
    if (!csvText) return null;
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
          spotPrice: null,
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
   * Enrich missing Spot prices using historical NSE CM / Sec Bhavcopy archives only
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
    var cmRes = this._fetchHttpText(cmUrl);
    if (cmRes.status !== this.STATUS.SUCCESS || !cmRes.text) {
      var cmAltUrl = CONFIG.URLS.NSE_CM_SEC_ALT.replace('{DDMMYYYY}', ddmmyyyy);
      cmRes = this._fetchHttpText(cmAltUrl);
    }

    if (cmRes.status === this.STATUS.SUCCESS && cmRes.text) {
      this._parseAndApplySpotFromCmSec(cmRes.text, parsedData, symbolsNeedingSpot);
      return;
    }

    // If still missing, try legacy CM bhavcopy (ZIP)
    var yyyy = dateObj.getFullYear();
    var mmm = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'][dateObj.getMonth()];
    var dd = ('0' + dateObj.getDate()).slice(-2);
    var legacyCmUrl = CONFIG.URLS.NSE_LEGACY_CM
      .replace('{YYYY}', yyyy)
      .replace('{MMM}', mmm)
      .replace('{DD}', dd)
      .replace('{MMM}', mmm)
      .replace('{YYYY}', yyyy);

    var legRes = this._fetchAndUnzipCsv(legacyCmUrl);
    if (legRes.status === this.STATUS.SUCCESS && legRes.csvText) {
      this._parseAndApplySpotFromLegacyCm(legRes.csvText, parsedData, symbolsNeedingSpot);
    }
  },

  /**
   * Parse NSE CM sec_bhavdata_full CSV and apply Spot (Close) prices for series EQ
   */
  _parseAndApplySpotFromCmSec: function(cmText, parsedData, targetSymbols) {
    var lines = cmText.split(/\r?\n/);
    if (lines.length < 2) return;

    var headers = lines[0].split(',').map(function(h) { return h.trim().toUpperCase(); });
    var symIdx = headers.indexOf('SYMBOL');
    var seriesIdx = headers.indexOf('SERIES');
    var closeIdx = headers.indexOf('CLOSE_PRICE');

    if (symIdx === -1 || closeIdx === -1) return;

    var targetSet = {};
    for (var k = 0; k < targetSymbols.length; k++) {
      targetSet[targetSymbols[k].toUpperCase()] = true;
    }

    for (var i = 1; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line) continue;
      var cols = line.split(',').map(function(c) { return c.trim(); });
      var sym = (cols[symIdx] || '').toUpperCase();
      var series = (seriesIdx !== -1 && cols[seriesIdx]) ? cols[seriesIdx].toUpperCase() : 'EQ';

      if (targetSet[sym] && (series === 'EQ' || series === 'BE')) {
        var spot = Utils.safeFloat(cols[closeIdx]);
        if (spot !== null && parsedData.symbolsData[sym]) {
          parsedData.symbolsData[sym].spotPrice = spot;
        }
      }
    }
  },

  /**
   * Parse Legacy CM bhavcopy CSV and apply Spot (Close) prices for series EQ
   */
  _parseAndApplySpotFromLegacyCm: function(cmText, parsedData, targetSymbols) {
    var lines = cmText.split(/\r?\n/);
    if (lines.length < 2) return;

    var headers = lines[0].split(',').map(function(h) { return h.trim().toUpperCase(); });
    var symIdx = headers.indexOf('SYMBOL');
    var seriesIdx = headers.indexOf('SERIES');
    var closeIdx = headers.indexOf('CLOSE');

    if (symIdx === -1 || closeIdx === -1) return;

    var targetSet = {};
    for (var k = 0; k < targetSymbols.length; k++) {
      targetSet[targetSymbols[k].toUpperCase()] = true;
    }

    for (var i = 1; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line) continue;
      var cols = line.split(',').map(function(c) { return c.trim(); });
      var sym = (cols[symIdx] || '').toUpperCase();
      var series = (seriesIdx !== -1 && cols[seriesIdx]) ? cols[seriesIdx].toUpperCase() : 'EQ';

      if (targetSet[sym] && (series === 'EQ' || series === 'BE')) {
        var spot = Utils.safeFloat(cols[closeIdx]);
        if (spot !== null && parsedData.symbolsData[sym]) {
          parsedData.symbolsData[sym].spotPrice = spot;
        }
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
    var symKeys = Object.keys(dailyData.symbolsData || {});
    for (var j = 0; j < symKeys.length; j++) {
      var s = symKeys[j];
      if (targetSet[s]) {
        filteredSymbols[s] = dailyData.symbolsData[s];
      }
    }

    return {
      dateStr: dailyData.dateStr,
      status: dailyData.status,
      isTradingDay: dailyData.isTradingDay,
      symbolsData: filteredSymbols,
      errorMsg: dailyData.errorMsg
    };
  },

  /**
   * Helper to fetch HTTP text safely (in GAS via UrlFetchApp)
   */
  _fetchHttpText: function(url) {
    if (typeof UrlFetchApp === 'undefined') {
      return { status: this.STATUS.NETWORK_ERROR, text: null, error: 'UrlFetchApp unavailable' };
    }
    try {
      var resp = UrlFetchApp.fetch(url, {
        muteHttpExceptions: true,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': '*/*'
        }
      });
      var code = resp.getResponseCode();
      if (code === 200) {
        return { status: this.STATUS.SUCCESS, text: resp.getContentText(), error: null };
      } else if (code === 404) {
        return { status: this.STATUS.HOLIDAY, text: null, error: 'HTTP 404 Not Found' };
      } else {
        return { status: this.STATUS.NETWORK_ERROR, text: null, error: 'HTTP ' + code };
      }
    } catch (e) {
      return { status: this.STATUS.NETWORK_ERROR, text: null, error: e.message };
    }
  },

  /**
   * Helper to fetch ZIP file and extract primary CSV (in GAS via Utilities.unzip)
   */
  _fetchAndUnzipCsv: function(url) {
    if (typeof UrlFetchApp === 'undefined' || typeof Utilities === 'undefined') {
      return { status: this.STATUS.NETWORK_ERROR, csvText: null, error: 'GAS services unavailable' };
    }
    try {
      var resp = UrlFetchApp.fetch(url, {
        muteHttpExceptions: true,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': '*/*'
        }
      });
      var code = resp.getResponseCode();
      if (code === 200) {
        var blob = resp.getBlob();
        var unzippedBlobs = Utilities.unzip(blob);
        if (unzippedBlobs && unzippedBlobs.length > 0) {
          return { status: this.STATUS.SUCCESS, csvText: unzippedBlobs[0].getDataAsString(), error: null };
        }
        return { status: this.STATUS.PARSING_ERROR, csvText: null, error: 'Empty zip file' };
      } else if (code === 404) {
        return { status: this.STATUS.HOLIDAY, csvText: null, error: 'HTTP 404 (Holiday or unavailable)' };
      } else {
        return { status: this.STATUS.NETWORK_ERROR, csvText: null, error: 'HTTP ' + code };
      }
    } catch (e) {
      return { status: this.STATUS.NETWORK_ERROR, csvText: null, error: e.message };
    }
  }
};
