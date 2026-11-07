/**
 * SA Automatic Futures Gap Analysis System
 * DataProvider.gs - Download and parse NSE UDiFF FO Bhavcopy, legacy FO Bhavcopy, and historical Spot Bhavcopies.
 *
 * Hardened Architecture:
 * 1. Strict Execution Time Budgeting & Non-repetition:
 *    - Never retry the same slow/hanging URL repeatedly within one execution.
 *    - Tracks attempted URLs and fails fast if an endpoint previously hung or timed out.
 * 2. Clear Diagnostic Logs:
 *    - Logs exact source URL, HTTP status, and elapsed time in milliseconds.
 * 3. Free Official Sources Only:
 *    - Modern UDiFF FO Bhavcopy (primary and mirror archive).
 *    - Legacy FO Bhavcopy.
 *    - Official CM Bhavcopy (sec_bhavdata_full and legacy CM) for spot fallback.
 *    - Zero Yahoo Finance fallback, zero synthetic futures prices.
 * 4. Separate FinInstrmNm from FinInstrmId:
 *    - contractSymbol = FinInstrmNm only. Blank when unavailable.
 *    - instrumentId = FinInstrmId.
 * 5. Strict ClsPric policy:
 *    - Uses official Futures Closing Price (ClsPric) only. Never substitutes SttlmPric.
 */

var DataProvider = {
  _dailyBhavcopyCache: {},
  _attemptedUrls: {}, // Tracks URLs attempted in this execution to prevent repeated slow calls
  _failedHostCount: {}, // Counts timeouts per host to trigger circuit breaker if host is hanging

  STATUS: {
    SUCCESS: 'SUCCESS',
    HOLIDAY: 'HOLIDAY',
    UNPUBLISHED: 'UNPUBLISHED',
    ARCHIVE_UNAVAILABLE: 'ARCHIVE_UNAVAILABLE',
    NETWORK_ERROR: 'NETWORK_ERROR',
    TIMEOUT: 'TIMEOUT',
    CIRCUIT_BROKEN: 'CIRCUIT_BROKEN',
    PARSING_ERROR: 'PARSING_ERROR'
  },

  fetchDailyDataForDate: function(dateObj, targetSymbols) {
    var dateKey = Utils.formatDateKey(dateObj);
    if (this._dailyBhavcopyCache[dateKey]) {
      return this._filterForSymbols(this._dailyBhavcopyCache[dateKey], targetSymbols);
    }

    if (Utils.isWeekend(dateObj)) {
      var weekendRes = {
        dateStr: dateKey,
        status: this.STATUS.HOLIDAY,
        isTradingDay: false,
        symbolsData: {},
        errorMsg: 'Weekend (Saturday/Sunday)'
      };
      this._dailyBhavcopyCache[dateKey] = weekendRes;
      return weekendRes;
    }

    if (this._isOfficialHoliday(dateKey)) {
      var holidayRes = {
        dateStr: dateKey,
        status: this.STATUS.HOLIDAY,
        isTradingDay: false,
        symbolsData: {},
        errorMsg: 'Official NSE Trading Holiday (' + (CONFIG.OFFICIAL_HOLIDAYS_MAP[dateKey] || 'Confirmed Holiday') + ')'
      };
      this._dailyBhavcopyCache[dateKey] = holidayRes;
      return holidayRes;
    }

    var parsedData = null;
    var fetchStatus = this.STATUS.NETWORK_ERROR;
    var errorMsg = null;

    var udiffRes = this._fetchNSEUdiffFO(dateObj);
    if (udiffRes.status === this.STATUS.SUCCESS && udiffRes.data) {
      parsedData = udiffRes.data;
      fetchStatus = this.STATUS.SUCCESS;
    } else {
      fetchStatus = udiffRes.status;
      errorMsg = udiffRes.error;
    }

    if (!parsedData && fetchStatus !== this.STATUS.CIRCUIT_BROKEN) {
      var legacyRes = this._fetchNSELegacyFO(dateObj);
      if (legacyRes.status === this.STATUS.SUCCESS && legacyRes.data) {
        parsedData = legacyRes.data;
        fetchStatus = this.STATUS.SUCCESS;
        errorMsg = null;
      }
    }

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
      var isTodayOrFuture = this._isTodayOrFuture(dateObj);
      if (isTodayOrFuture && (fetchStatus === this.STATUS.ARCHIVE_UNAVAILABLE || fetchStatus === this.STATUS.HOLIDAY)) {
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

    if (finalResult.status === this.STATUS.SUCCESS || finalResult.status === this.STATUS.HOLIDAY) {
      this._dailyBhavcopyCache[dateKey] = finalResult;
    }

    return this._filterForSymbols(finalResult, targetSymbols);
  },

  _isOfficialHoliday: function(dateKey) {
    return Boolean(CONFIG.OFFICIAL_HOLIDAYS_MAP && CONFIG.OFFICIAL_HOLIDAYS_MAP[dateKey]);
  },

  _isTodayOrFuture: function(dateObj) {
    var today = new Date();
    var dMidnight = new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate());
    var tMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    return dMidnight >= tMidnight;
  },

  _fetchNSEUdiffFO: function(dateObj) {
    var ymd = Utils.formatYYYYMMDD(dateObj);
    var dateKey = Utils.formatDateKey(dateObj);
    var url = CONFIG.URLS.NSE_UDIFF_FO.replace('{YYYYMMDD}', ymd);

    var res = this._fetchAndUnzipCsv(url, 'NSE_UDIFF_PRIMARY');
    if (res.status !== this.STATUS.SUCCESS && res.status !== this.STATUS.CIRCUIT_BROKEN) {
      var altUrl = CONFIG.URLS.NSE_UDIFF_FO_ALT.replace('{YYYYMMDD}', ymd);
      var altRes = this._fetchAndUnzipCsv(altUrl, 'NSE_UDIFF_ALT');
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
      finInstrmNm: headers.indexOf('FinInstrmNm'),
      finInstrmId: headers.indexOf('FinInstrmId'),
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
      if (instType !== 'STF' && instType !== 'FUTSTK') {
        continue;
      }

      var symbol = (cols[colIdx.tckrSymb] || '').trim().toUpperCase();
      if (!symbol) continue;

      var contractSymbol = (colIdx.finInstrmNm !== -1 && cols[colIdx.finInstrmNm]) ? cols[colIdx.finInstrmNm].trim() : '';
      var instrumentId = (colIdx.finInstrmId !== -1 && cols[colIdx.finInstrmId]) ? cols[colIdx.finInstrmId].trim() : '';

      if (!contractSymbol) {
        continue;
      }

      var rawExpiry = (colIdx.actlXpryDt !== -1 && cols[colIdx.actlXpryDt]) ? cols[colIdx.actlXpryDt].trim() : cols[colIdx.xpryDt].trim();
      var expiryDate = Utils.parseDate(rawExpiry);
      if (!expiryDate) continue;
      var expiryKey = Utils.formatDateKey(expiryDate);

      var rawClose = Utils.safeFloat(cols[colIdx.clsPric]);
      var closePrice = (rawClose !== null && rawClose > 0) ? rawClose : null;
      var settlePrice = (colIdx.sttlmPric !== -1) ? Utils.safeFloat(cols[colIdx.sttlmPric]) : null;

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
        contractSymbol: contractSymbol,
        instrumentId: instrumentId,
        expiryStr: expiryKey,
        expiryDate: expiryDate,
        closePrice: closePrice,
        settlePrice: settlePrice,
        priceSource: closePrice !== null ? 'ClsPric' : (settlePrice !== null ? 'SttlmPric_Only' : 'NONE'),
        underlyingPrice: undrlygPrice
      });
    }

    return result;
  },

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

    var res = this._fetchAndUnzipCsv(url, 'NSE_LEGACY_FO');
    if (res.status !== this.STATUS.SUCCESS) {
      return { status: res.status, data: null, error: res.error };
    }

    var parsed = this.parseLegacyFOCsv(res.csvText, dateKey);
    if (!parsed) {
      return { status: this.STATUS.PARSING_ERROR, data: null, error: 'Failed to parse legacy CSV structure' };
    }

    return { status: this.STATUS.SUCCESS, data: parsed, error: null };
  },

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

      var contractSymbol = ''; // Missing in legacy bhavcopy

      var rawClose = Utils.safeFloat(cols[colIdx.close]);
      var closePrice = (rawClose !== null && rawClose > 0) ? rawClose : null;
      var settlePrice = (colIdx.settlePr !== -1) ? Utils.safeFloat(cols[colIdx.settlePr]) : null;

      if (!result.symbolsData[symbol]) {
        result.symbolsData[symbol] = {
          spotPrice: null,
          contracts: []
        };
      }

      result.symbolsData[symbol].contracts.push({
        contractSymbol: contractSymbol,
        instrumentId: '',
        expiryStr: expiryKey,
        expiryDate: expiryDate,
        closePrice: closePrice,
        settlePrice: settlePrice,
        priceSource: closePrice !== null ? 'CLOSE' : 'NONE',
        underlyingPrice: null
      });
    }

    return result;
  },

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

    var ddmmyyyy = Utils.formatDDMMYYYY(dateObj);
    var cmUrl = CONFIG.URLS.NSE_CM_SEC.replace('{DDMMYYYY}', ddmmyyyy);
    var cmRes = this._fetchHttpText(cmUrl, 'NSE_CM_SEC');
    if (cmRes.status !== this.STATUS.SUCCESS || !cmRes.text) {
      var cmAltUrl = CONFIG.URLS.NSE_CM_SEC_ALT.replace('{DDMMYYYY}', ddmmyyyy);
      cmRes = this._fetchHttpText(cmAltUrl, 'NSE_CM_SEC_ALT');
    }

    if (cmRes.status === this.STATUS.SUCCESS && cmRes.text) {
      this._parseAndApplySpotFromCmSec(cmRes.text, parsedData, symbolsNeedingSpot);
      return;
    }

    var yyyy = dateObj.getFullYear();
    var mmm = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'][dateObj.getMonth()];
    var dd = ('0' + dateObj.getDate()).slice(-2);
    var legacyCmUrl = CONFIG.URLS.NSE_LEGACY_CM
      .replace('{YYYY}', yyyy)
      .replace('{MMM}', mmm)
      .replace('{DD}', dd)
      .replace('{MMM}', mmm)
      .replace('{YYYY}', yyyy);

    var legRes = this._fetchAndUnzipCsv(legacyCmUrl, 'NSE_LEGACY_CM');
    if (legRes.status === this.STATUS.SUCCESS && legRes.csvText) {
      this._parseAndApplySpotFromLegacyCm(legRes.csvText, parsedData, symbolsNeedingSpot);
    }
  },

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
        if (spot !== null && spot > 0 && parsedData.symbolsData[sym]) {
          parsedData.symbolsData[sym].spotPrice = spot;
        }
      }
    }
  },

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
        if (spot !== null && spot > 0 && parsedData.symbolsData[sym]) {
          parsedData.symbolsData[sym].spotPrice = spot;
        }
      }
    }
  },

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
   * Safe HTTP text fetcher with circuit breaker, non-repetition, and timing diagnostic.
   */
  _fetchHttpText: function(url, sourceLabel) {
    if (this._attemptedUrls[url]) {
      return this._attemptedUrls[url]; // Never retry the same URL in the same execution!
    }

    var label = sourceLabel || url;
    if (this._failedHostCount[label] >= 2) {
      var cbRes = { status: this.STATUS.CIRCUIT_BROKEN, text: null, error: 'Circuit breaker open for ' + label };
      this._attemptedUrls[url] = cbRes;
      return cbRes;
    }

    if (typeof UrlFetchApp === 'undefined') {
      return { status: this.STATUS.NETWORK_ERROR, text: null, error: 'UrlFetchApp unavailable' };
    }

    var startTime = new Date().getTime();
    try {
      var resp = UrlFetchApp.fetch(url, {
        muteHttpExceptions: true,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': '*/*'
        }
      });
      var elapsed = new Date().getTime() - startTime;
      var code = resp.getResponseCode();
      SheetManager.log('INFO', 'HTTP_DIAGNOSTIC', '[' + label + '] Status ' + code + ' in ' + elapsed + 'ms');

      if (code === 200) {
        var successRes = { status: this.STATUS.SUCCESS, text: resp.getContentText(), error: null };
        this._attemptedUrls[url] = successRes;
        return successRes;
      } else if (code === 404) {
        var nfRes = { status: this.STATUS.ARCHIVE_UNAVAILABLE, text: null, error: 'HTTP 404 Not Found (' + elapsed + 'ms)' };
        this._attemptedUrls[url] = nfRes;
        return nfRes;
      } else {
        var errRes = { status: this.STATUS.NETWORK_ERROR, text: null, error: 'HTTP ' + code + ' (' + elapsed + 'ms)' };
        this._attemptedUrls[url] = errRes;
        return errRes;
      }
    } catch (e) {
      var errElapsed = new Date().getTime() - startTime;
      this._failedHostCount[label] = (this._failedHostCount[label] || 0) + 1;
      SheetManager.log('ERROR', 'HTTP_DIAGNOSTIC', '[' + label + '] Exception after ' + errElapsed + 'ms: ' + e.message);

      var isTimeout = e.message && (e.message.indexOf('timed out') !== -1 || e.message.indexOf('Timeout') !== -1);
      var failRes = {
        status: isTimeout ? this.STATUS.TIMEOUT : this.STATUS.NETWORK_ERROR,
        text: null,
        error: e.message + ' (' + errElapsed + 'ms)'
      };
      this._attemptedUrls[url] = failRes;
      return failRes;
    }
  },

  /**
   * Safe ZIP download and unzip with circuit breaker, non-repetition, and timing diagnostic.
   */
  _fetchAndUnzipCsv: function(url, sourceLabel) {
    if (this._attemptedUrls[url]) {
      return this._attemptedUrls[url]; // Never retry the same URL in the same execution!
    }

    var label = sourceLabel || url;
    if (this._failedHostCount[label] >= 2) {
      var cbRes = { status: this.STATUS.CIRCUIT_BROKEN, csvText: null, error: 'Circuit breaker open for ' + label };
      this._attemptedUrls[url] = cbRes;
      return cbRes;
    }

    if (typeof UrlFetchApp === 'undefined' || typeof Utilities === 'undefined') {
      return { status: this.STATUS.NETWORK_ERROR, csvText: null, error: 'GAS services unavailable' };
    }

    var startTime = new Date().getTime();
    try {
      var resp = UrlFetchApp.fetch(url, {
        muteHttpExceptions: true,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': '*/*'
        }
      });
      var elapsed = new Date().getTime() - startTime;
      var code = resp.getResponseCode();
      SheetManager.log('INFO', 'HTTP_DIAGNOSTIC', '[' + label + '] Status ' + code + ' in ' + elapsed + 'ms');

      if (code === 200) {
        var blob = resp.getBlob();
        var unzippedBlobs = Utilities.unzip(blob);
        if (unzippedBlobs && unzippedBlobs.length > 0) {
          var successRes = { status: this.STATUS.SUCCESS, csvText: unzippedBlobs[0].getDataAsString(), error: null };
          this._attemptedUrls[url] = successRes;
          return successRes;
        }
        var parseErr = { status: this.STATUS.PARSING_ERROR, csvText: null, error: 'Empty zip file (' + elapsed + 'ms)' };
        this._attemptedUrls[url] = parseErr;
        return parseErr;
      } else if (code === 404) {
        var nfRes = { status: this.STATUS.ARCHIVE_UNAVAILABLE, csvText: null, error: 'HTTP 404 Archive Unavailable (' + elapsed + 'ms)' };
        this._attemptedUrls[url] = nfRes;
        return nfRes;
      } else {
        var errRes = { status: this.STATUS.NETWORK_ERROR, csvText: null, error: 'HTTP ' + code + ' (' + elapsed + 'ms)' };
        this._attemptedUrls[url] = errRes;
        return errRes;
      }
    } catch (e) {
      var errElapsed = new Date().getTime() - startTime;
      this._failedHostCount[label] = (this._failedHostCount[label] || 0) + 1;
      SheetManager.log('ERROR', 'HTTP_DIAGNOSTIC', '[' + label + '] Exception after ' + errElapsed + 'ms: ' + e.message);

      var isTimeout = e.message && (e.message.indexOf('timed out') !== -1 || e.message.indexOf('Timeout') !== -1);
      var failRes = {
        status: isTimeout ? this.STATUS.TIMEOUT : this.STATUS.NETWORK_ERROR,
        csvText: null,
        error: e.message + ' (' + errElapsed + 'ms)'
      };
      this._attemptedUrls[url] = failRes;
      return failRes;
    }
  }
};
