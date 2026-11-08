/**
 * SA Automatic Futures Gap Analysis System
 * DataProvider.gs - Download and parse NSE UDiFF FO Bhavcopy, legacy FO Bhavcopy, and historical Spot Bhavcopies.
 *
 * Hardened Production Architecture:
 * 1. Cloudflare Worker Edge Relay Integration:
 *    - Dynamically reads WORKER_URL and API_TOKEN from PropertiesService.getScriptProperties().
 *    - Prioritizes secure authenticated relay: GET {WORKER_URL}/?date={YYYYMMDD} with Authorization: Bearer {API_TOKEN}.
 *    - Never hardcodes or logs API_TOKEN. Enforces HTTPS on WORKER_URL.
 *    - If Worker returns HTTP 200 but ZIP extraction, CSV validation, or parsing fails, falls back to official archives.
 * 2. Robust & Strict RFC-4180 CSV Parsing:
 *    - Handles UTF-8 BOM (\uFEFF) in headers.
 *    - Custom RFC-4180 parser rejecting unmatched quotes, malformed quoted fields, and invalid characters after closing quotes.
 *    - Enforces exact row column counts against header definitions (cols.length !== expectedColCount), rejecting both truncated and extra-column rows.
 * 3. Strict CSV Header & Trading Date Validation:
 *    - CM SEC Spot: Detects DATE1 and TIMESTAMP. Requires at least one when expectedDateKey is supplied; rejects the file if neither exists. Rejects blank/invalid/mismatched row dates.
 *    - Legacy CM Spot: Requires TIMESTAMP when expectedDateKey is supplied; rejects the file if missing. Rejects blank/invalid/mismatched row dates.
 *    - Legacy FO: Requires TIMESTAMP column when expectedDateKey is supplied. Never bypasses date validation.
 *    - UDiFF Futures & Legacy FO: Contracts with missing, invalid, zero, or negative closing prices are rejected BEFORE creating symbolsData or pushing to contracts.
 *      Never appends contracts with null/invalid closePrice. Never substitutes SttlmPric/SETTLE_PR.
 * 4. Multi-Tier Archive Fallback:
 *    - If primary official archive returns HTTP 200 but CSV is invalid/unparseable, automatically attempts alternate official archive.
 * 5. Free Official Sources Only:
 *    - Modern UDiFF FO Bhavcopy via Cloudflare Worker or direct official archives.
 *    - Legacy FO Bhavcopy.
 *    - Official CM Bhavcopy (sec_bhavdata_full and legacy CM) for spot fallback.
 *    - Zero Yahoo Finance fallback, zero synthetic futures prices.
 * 6. Separate FinInstrmNm from FinInstrmId:
 *    - contractSymbol = FinInstrmNm only. Blank when unavailable. Never synthesize fake identifiers.
 *    - instrumentId = FinInstrmId.
 * 7. Strict ClsPric policy:
 *    - Uses official Futures Closing Price (ClsPric/CLOSE) only. Never substitutes SttlmPric/SETTLE_PR.
 * 8. Non-repetition & Circuit Breaker:
 *    - Tracks attempted URLs and fails fast if an endpoint repeatedly hangs or fails.
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

  /**
   * Strict RFC-4180 compliant CSV line parser.
   * Handles commas within quotes, escaped double quotes (""), and trims outer whitespace.
   * Strips UTF-8 BOM (\uFEFF) if present.
   * Returns null if line is malformed (unmatched quotes, invalid characters after closing quotes, etc.).
   */
  parseCsvLine: function(line) {
    if (line === null || line === undefined) return null;
    if (line.charCodeAt(0) === 0xFEFF) {
      line = line.substring(1);
    }
    var len = line.length;
    var fields = [];
    var i = 0;

    while (i < len) {
      // Skip leading spaces before field content if any
      while (i < len && (line[i] === ' ' || line[i] === '\t')) {
        i++;
      }

      if (i >= len) {
        fields.push('');
        break;
      }

      if (line[i] === '"') {
        // Quoted field
        i++; // skip opening quote
        var cur = '';
        var closedQuote = false;

        while (i < len) {
          var c = line[i];
          if (c === '"') {
            if (i + 1 < len && line[i + 1] === '"') {
              cur += '"';
              i += 2; // skip escaped quote
            } else {
              closedQuote = true;
              i++; // skip closing quote
              break;
            }
          } else {
            cur += c;
            i++;
          }
        }

        if (!closedQuote) {
          // Unmatched quote: malformed CSV line
          return null;
        }

        // Check for trailing characters after closing quote up to comma or end of line
        while (i < len && (line[i] === ' ' || line[i] === '\t')) {
          i++;
        }

        if (i < len && line[i] !== ',') {
          // Characters immediately after closing quote without a comma separator: malformed
          return null;
        }

        fields.push(cur.trim());
        if (i < len && line[i] === ',') {
          i++; // skip comma
          if (i === len) {
            fields.push(''); // trailing comma implies empty final field
          }
        }
      } else {
        // Unquoted field
        var start = i;
        while (i < len && line[i] !== ',') {
          if (line[i] === '"') {
            // Stray quote inside unquoted field: malformed
            return null;
          }
          i++;
        }
        var rawField = line.substring(start, i);
        fields.push(rawField.trim());
        if (i < len && line[i] === ',') {
          i++; // skip comma
          if (i === len) {
            fields.push(''); // trailing comma implies empty final field
          }
        }
      }
    }

    return fields;
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

  /**
   * Fetch and parse NSE UDiFF FO Bhavcopy.
   * Multi-Tier Priority & Fallback Logic:
   * 1. If WORKER_URL and API_TOKEN are configured, fetch through Cloudflare Worker relay.
   *    If Worker succeeds and CSV parses cleanly, return SUCCESS.
   *    If Worker fails or CSV validation fails, continue to official archives.
   * 2. Attempt primary official NSE archive endpoint (NSE_UDIFF_FO).
   *    If primary succeeds and CSV parses cleanly, return SUCCESS.
   *    If primary returns 200 but CSV validation fails OR primary fails with network/404,
   *    attempt alternate official archive (NSE_UDIFF_FO_ALT).
   * 3. Return parsed data or failure status.
   */
  _fetchNSEUdiffFO: function(dateObj) {
    var ymd = Utils.formatYYYYMMDD(dateObj);
    var dateKey = Utils.formatDateKey(dateObj);

    var workerRes = null;

    // 1. Attempt Cloudflare Worker relay if configured
    var workerConfig = this._getWorkerConfig();
    if (workerConfig && workerConfig.workerUrl && workerConfig.apiToken) {
      var relayUrl = workerConfig.workerUrl + '/?date=' + ymd;
      var authHeaders = {
        'Authorization': 'Bearer ' + workerConfig.apiToken,
        'Accept': 'application/zip'
      };
      workerRes = this._fetchAndUnzipCsv(relayUrl, 'CLOUDFLARE_WORKER_RELAY', authHeaders);

      if (workerRes.status === this.STATUS.SUCCESS && workerRes.csvText) {
        var parsedWorker = this.parseUdiffFOCsv(workerRes.csvText, dateKey);
        if (parsedWorker) {
          return { status: this.STATUS.SUCCESS, data: parsedWorker, error: null };
        } else {
          SheetManager.log('WARN', 'DATA_PROVIDER', 'Worker returned 200 but CSV parsing/validation failed for date ' + dateKey + '. Falling back to official archives.');
        }
      } else {
        SheetManager.log('WARN', 'DATA_PROVIDER', 'Worker relay request failed for date ' + dateKey + ' (' + (workerRes.error || workerRes.status) + '). Falling back to official archives.');
      }
    }

    // 2. Primary official NSE archive
    var primaryUrl = CONFIG.URLS.NSE_UDIFF_FO.replace('{YYYYMMDD}', ymd);
    var directRes = this._fetchAndUnzipCsv(primaryUrl, 'NSE_UDIFF_PRIMARY');

    if (directRes.status === this.STATUS.SUCCESS && directRes.csvText) {
      var parsedPrimary = this.parseUdiffFOCsv(directRes.csvText, dateKey);
      if (parsedPrimary) {
        return { status: this.STATUS.SUCCESS, data: parsedPrimary, error: null };
      }
      SheetManager.log('WARN', 'DATA_PROVIDER', 'Primary NSE archive returned 200 but CSV parsing failed for date ' + dateKey + '. Attempting alternate archive.');
    }

    // 3. Alternate official NSE archive fallback (if primary failed OR returned invalid CSV)
    if (directRes.status !== this.STATUS.CIRCUIT_BROKEN) {
      var altUrl = CONFIG.URLS.NSE_UDIFF_FO_ALT.replace('{YYYYMMDD}', ymd);
      var altRes = this._fetchAndUnzipCsv(altUrl, 'NSE_UDIFF_ALT');
      if (altRes.status === this.STATUS.SUCCESS && altRes.csvText) {
        var parsedAlt = this.parseUdiffFOCsv(altRes.csvText, dateKey);
        if (parsedAlt) {
          return { status: this.STATUS.SUCCESS, data: parsedAlt, error: null };
        }
        return { status: this.STATUS.PARSING_ERROR, data: null, error: 'Alternate archive returned 200 but CSV parsing/validation failed' };
      }
      if (altRes.status !== this.STATUS.SUCCESS) {
        directRes = altRes;
      }
    }

    if (directRes.status === this.STATUS.SUCCESS) {
      // Arrived here because 200 was received but CSV was invalid and alternate also failed
      return { status: this.STATUS.PARSING_ERROR, data: null, error: 'Failed to parse UDiFF CSV from official archives' };
    }

    var finalErrorStatus = directRes.status !== this.STATUS.SUCCESS ? directRes.status : (workerRes ? workerRes.status : this.STATUS.NETWORK_ERROR);
    var finalErrorMsg = directRes.error || (workerRes ? workerRes.error : 'Fetch failed');
    return { status: finalErrorStatus, data: null, error: finalErrorMsg };
  },

  /**
   * Read WORKER_URL and API_TOKEN from Script Properties.
   * Enforces HTTPS protocol on WORKER_URL. Never logs API_TOKEN.
   */
  _getWorkerConfig: function() {
    if (typeof PropertiesService === 'undefined') return null;
    try {
      var props = PropertiesService.getScriptProperties();
      var rawUrl = props.getProperty('WORKER_URL');
      var token = props.getProperty('API_TOKEN');

      if (!rawUrl || !rawUrl.trim() || !token || !token.trim()) {
        return null;
      }

      var trimmedUrl = rawUrl.trim();
      if (!/^https:\/\//i.test(trimmedUrl)) {
        SheetManager.log('WARN', 'CONFIG', 'WORKER_URL is invalid or insecure (must use HTTPS). Skipping worker relay.');
        return null;
      }

      return {
        workerUrl: trimmedUrl.replace(/\/+$/, ''),
        apiToken: token.trim()
      };
    } catch (e) {
      return null;
    }
  },

  /**
   * Parses official NSE UDiFF FO Bhavcopy CSV text with robust quoted-field parsing,
   * strict header validation, trading date matching, and strict ClsPric policy.
   * Enforces exact column count per row (cols.length === expectedColCount).
   * Rejects contracts BEFORE creating symbolsData or pushing to contracts if ClsPric
   * is missing, invalid, zero, or negative. Never appends invalid contracts. Never substitutes SttlmPric.
   */
  parseUdiffFOCsv: function(csvText, expectedDateKey) {
    if (!csvText) return null;
    var lines = csvText.split(/\r?\n/);
    if (lines.length < 2) return null;

    var headers = this.parseCsvLine(lines[0]);
    if (!headers || headers.length === 0) return null;
    var expectedColCount = headers.length;

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

    // Strict header validation: UDiFF FO Bhavcopy must contain core contract columns
    if (colIdx.tradDt === -1 || colIdx.tckrSymb === -1 || colIdx.finInstrmTp === -1 ||
        colIdx.finInstrmNm === -1 || colIdx.xpryDt === -1 || colIdx.clsPric === -1) {
      SheetManager.log('WARN', 'CSV_PARSE', 'UDiFF CSV header missing mandatory columns');
      return null;
    }

    var result = {
      dateStr: expectedDateKey,
      isTradingDay: true,
      symbolsData: {}
    };

    var matchedDateCount = 0;
    var validRecords = 0;

    for (var i = 1; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line) continue;
      var cols = this.parseCsvLine(line);
      // Exact column-count validation: reject malformed rows with missing OR extra columns
      if (!cols || cols.length !== expectedColCount) continue;

      // Trading date validation: verify file contains data matching the expected date
      if (expectedDateKey && colIdx.tradDt !== -1) {
        var rawTradDt = cols[colIdx.tradDt];
        if (!rawTradDt) continue;
        var rowTradDt = Utils.parseDate(rawTradDt);
        if (!rowTradDt) continue;
        var rowDateKey = Utils.formatDateKey(rowTradDt);
        if (rowDateKey !== expectedDateKey) {
          continue; // strictly ignore records not matching target date
        }
        matchedDateCount++;
      }

      var instType = (cols[colIdx.finInstrmTp] || '').trim().toUpperCase();
      // Strictly process stock futures (STF in modern UDiFF, FUTSTK in legacy)
      if (instType !== 'STF' && instType !== 'FUTSTK') {
        continue;
      }

      var symbol = (cols[colIdx.tckrSymb] || '').trim().toUpperCase();
      if (!symbol) continue;

      // Genuine FinInstrmNm only. Never synthesize or substitute with FinInstrmId.
      var contractSymbol = (colIdx.finInstrmNm !== -1 && cols[colIdx.finInstrmNm]) ? cols[colIdx.finInstrmNm].trim() : '';
      var instrumentId = (colIdx.finInstrmId !== -1 && cols[colIdx.finInstrmId]) ? cols[colIdx.finInstrmId].trim() : '';

      if (!contractSymbol) {
        continue;
      }

      var rawExpiry = (colIdx.actlXpryDt !== -1 && cols[colIdx.actlXpryDt]) ? cols[colIdx.actlXpryDt].trim() : cols[colIdx.xpryDt].trim();
      var expiryDate = Utils.parseDate(rawExpiry);
      if (!expiryDate) continue;
      var expiryKey = Utils.formatDateKey(expiryDate);

      // Official ClsPric policy: closing price only. Never substitute SttlmPric.
      // Reject early before creating symbolsData or pushing to contracts if ClsPric is missing, invalid, zero, or negative.
      var rawClose = Utils.safeFloat(cols[colIdx.clsPric]);
      if (rawClose === null || rawClose <= 0) {
        continue;
      }
      var closePrice = rawClose;

      // Supplementary settlement price only for otherwise valid contracts
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
        priceSource: 'ClsPric',
        underlyingPrice: undrlygPrice
      });

      validRecords++;
    }

    // Strict trading date validation: if expectedDateKey specified, reject if 0 matched records
    if (expectedDateKey && matchedDateCount === 0) {
      SheetManager.log('WARN', 'CSV_PARSE', 'UDiFF CSV date validation failed: 0 records matched expected date ' + expectedDateKey);
      return null;
    }

    // Require at least one valid stock-futures record with positive ClsPric before returning SUCCESS
    if (validRecords === 0) {
      SheetManager.log('WARN', 'CSV_PARSE', 'UDiFF CSV contains zero valid stock-futures records with positive closing price');
      return null;
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

  /**
   * Parses official NSE Legacy FO Bhavcopy CSV text with robust quoted-field parsing,
   * header validation, strict date matching, and requiring at least 1 valid stock-futures record.
   * Enforces exact column count per row (cols.length === expectedColCount).
   * Requires TIMESTAMP column when expectedDateKey is supplied. Never bypasses date validation.
   * Rejects contracts BEFORE creating symbolsData or pushing to contracts if CLOSE is missing,
   * invalid, zero, or negative. Never appends invalid contracts. Never substitutes SETTLE_PR.
   */
  parseLegacyFOCsv: function(csvText, expectedDateKey) {
    if (!csvText) return null;
    var lines = csvText.split(/\r?\n/);
    if (lines.length < 2) return null;

    var headers = this.parseCsvLine(lines[0]);
    if (!headers || headers.length === 0) return null;
    var expectedColCount = headers.length;

    var colIdx = {
      instrument: headers.indexOf('INSTRUMENT'),
      symbol: headers.indexOf('SYMBOL'),
      expiryDt: headers.indexOf('EXPIRY_DT'),
      close: headers.indexOf('CLOSE'),
      settlePr: headers.indexOf('SETTLE_PR'),
      timestamp: headers.indexOf('TIMESTAMP')
    };

    // Strict header validation for legacy FO Bhavcopy
    if (colIdx.instrument === -1 || colIdx.symbol === -1 || colIdx.expiryDt === -1 || colIdx.close === -1) {
      SheetManager.log('WARN', 'CSV_PARSE', 'Legacy FO CSV header missing mandatory columns');
      return null;
    }

    // Require TIMESTAMP column when expectedDateKey is supplied. Never bypass date validation.
    if (expectedDateKey && colIdx.timestamp === -1) {
      SheetManager.log('WARN', 'CSV_PARSE', 'Legacy FO CSV missing required TIMESTAMP column for date validation');
      return null;
    }

    var result = {
      dateStr: expectedDateKey,
      isTradingDay: true,
      symbolsData: {}
    };

    var matchedDateCount = 0;
    var validRecords = 0;

    for (var i = 1; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line) continue;
      var cols = this.parseCsvLine(line);
      // Exact column-count validation: reject malformed rows with missing OR extra columns
      if (!cols || cols.length !== expectedColCount) continue;

      if (expectedDateKey && colIdx.timestamp !== -1) {
        var rawTs = cols[colIdx.timestamp];
        if (!rawTs) continue;
        var rowDt = Utils.parseDate(rawTs);
        if (!rowDt) continue;
        var rowKey = Utils.formatDateKey(rowDt);
        if (rowKey !== expectedDateKey) {
          continue; // strictly ignore records not matching target date
        }
        matchedDateCount++;
      }

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

      // In legacy bhavcopy, official FinInstrmNm is not provided.
      // Do NOT synthesize fake identifiers. Mark contractSymbol as '' (MISSING).
      var contractSymbol = '';

      // Reject early before creating symbolsData or pushing to contracts if CLOSE is missing, invalid, zero, or negative.
      var rawClose = Utils.safeFloat(cols[colIdx.close]);
      if (rawClose === null || rawClose <= 0) {
        continue;
      }
      var closePrice = rawClose;

      // Supplementary settlement price only
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
        closePrice: closePrice, // Strictly CLOSE price; never SETTLE_PR
        settlePrice: settlePrice,
        priceSource: 'CLOSE',
        underlyingPrice: null
      });

      validRecords++;
    }

    if (expectedDateKey && matchedDateCount === 0) {
      SheetManager.log('WARN', 'CSV_PARSE', 'Legacy FO CSV date validation failed: 0 records matched ' + expectedDateKey);
      return null;
    }

    if (validRecords === 0) {
      SheetManager.log('WARN', 'CSV_PARSE', 'Legacy FO CSV contains zero valid stock-futures records with positive closing price');
      return null;
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
    var dateKey = Utils.formatDateKey(dateObj);
    var cmUrl = CONFIG.URLS.NSE_CM_SEC.replace('{DDMMYYYY}', ddmmyyyy);
    var cmRes = this._fetchHttpText(cmUrl, 'NSE_CM_SEC');

    var appliedCount = 0;
    if (cmRes.status === this.STATUS.SUCCESS && cmRes.text) {
      appliedCount = this._parseAndApplySpotFromCmSec(cmRes.text, parsedData, symbolsNeedingSpot, dateKey);
    }

    if (appliedCount === 0) {
      var cmAltUrl = CONFIG.URLS.NSE_CM_SEC_ALT.replace('{DDMMYYYY}', ddmmyyyy);
      cmRes = this._fetchHttpText(cmAltUrl, 'NSE_CM_SEC_ALT');
      if (cmRes.status === this.STATUS.SUCCESS && cmRes.text) {
        appliedCount = this._parseAndApplySpotFromCmSec(cmRes.text, parsedData, symbolsNeedingSpot, dateKey);
      }
    }

    if (appliedCount > 0) return;

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
      this._parseAndApplySpotFromLegacyCm(legRes.csvText, parsedData, symbolsNeedingSpot, dateKey);
    }
  },

  /**
   * Parse and apply spot prices from official CM sec_bhavdata_full CSV.
   * Supported date columns: DATE1 or TIMESTAMP.
   * If expectedDateKey is supplied, at least one supported date column MUST exist.
   * If neither exists, reject the entire file and return 0.
   * Enforces exact row column count (cols.length === expectedColCount).
   * Validates every accepted row's date strictly. Rejects blank, invalid, or mismatched dates.
   * Never applies unverified spot prices.
   */
  _parseAndApplySpotFromCmSec: function(cmText, parsedData, targetSymbols, expectedDateKey) {
    if (!cmText) return 0;
    var lines = cmText.split(/\r?\n/);
    if (lines.length < 2) return 0;

    var rawHeaders = this.parseCsvLine(lines[0]);
    if (!rawHeaders || rawHeaders.length === 0) return 0;
    var expectedColCount = rawHeaders.length;
    var headers = rawHeaders.map(function(h) { return h.toUpperCase(); });

    var symIdx = headers.indexOf('SYMBOL');
    var seriesIdx = headers.indexOf('SERIES');
    var closeIdx = headers.indexOf('CLOSE_PRICE');

    // Detect DATE1 and TIMESTAMP as supported date columns
    var date1Idx = headers.indexOf('DATE1');
    var tsIdx = headers.indexOf('TIMESTAMP');
    var dateColIdx = date1Idx !== -1 ? date1Idx : tsIdx;

    if (symIdx === -1 || closeIdx === -1) return 0;

    // If expectedDateKey is supplied, at least one supported date column MUST exist
    if (expectedDateKey && dateColIdx === -1) {
      SheetManager.log('WARN', 'CSV_PARSE', 'CM SEC CSV missing required DATE1 or TIMESTAMP column for date validation');
      return 0;
    }

    var targetSet = {};
    for (var k = 0; k < targetSymbols.length; k++) {
      targetSet[targetSymbols[k].toUpperCase()] = true;
    }

    var applied = 0;

    for (var i = 1; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line) continue;
      var cols = this.parseCsvLine(line);
      // Exact column-count validation: reject malformed rows with missing OR extra columns
      if (!cols || cols.length !== expectedColCount) continue;

      // Strict row-level date validation
      if (expectedDateKey && dateColIdx !== -1) {
        var rawDate = cols[dateColIdx];
        if (!rawDate) continue; // reject blank date
        var rowDt = Utils.parseDate(rawDate);
        if (!rowDt) continue; // reject invalid date
        if (Utils.formatDateKey(rowDt) !== expectedDateKey) {
          continue; // reject mismatched date
        }
      }

      var sym = (cols[symIdx] || '').toUpperCase();
      var series = (seriesIdx !== -1 && cols[seriesIdx]) ? cols[seriesIdx].toUpperCase() : 'EQ';

      if (targetSet[sym] && (series === 'EQ' || series === 'BE')) {
        var spot = Utils.safeFloat(cols[closeIdx]);
        if (spot !== null && spot > 0 && parsedData.symbolsData[sym]) {
          parsedData.symbolsData[sym].spotPrice = spot;
          applied++;
        }
      }
    }

    return applied;
  },

  /**
   * Parse and apply spot prices from official legacy CM Bhavcopy CSV.
   * Requires TIMESTAMP column when expectedDateKey is supplied.
   * If missing, reject the entire file and return 0.
   * Enforces exact row column count (cols.length === expectedColCount).
   * Validates every accepted row's date strictly. Rejects blank, invalid, or mismatched dates.
   * Never applies unverified spot prices.
   */
  _parseAndApplySpotFromLegacyCm: function(cmText, parsedData, targetSymbols, expectedDateKey) {
    if (!cmText) return 0;
    var lines = cmText.split(/\r?\n/);
    if (lines.length < 2) return 0;

    var rawHeaders = this.parseCsvLine(lines[0]);
    if (!rawHeaders || rawHeaders.length === 0) return 0;
    var expectedColCount = rawHeaders.length;
    var headers = rawHeaders.map(function(h) { return h.toUpperCase(); });

    var symIdx = headers.indexOf('SYMBOL');
    var seriesIdx = headers.indexOf('SERIES');
    var closeIdx = headers.indexOf('CLOSE');
    var tsIdx = headers.indexOf('TIMESTAMP');

    if (symIdx === -1 || closeIdx === -1) return 0;

    // Require TIMESTAMP column when expectedDateKey is provided. If missing, reject entire file.
    if (expectedDateKey && tsIdx === -1) {
      SheetManager.log('WARN', 'CSV_PARSE', 'Legacy CM CSV missing required TIMESTAMP column for date validation');
      return 0;
    }

    var targetSet = {};
    for (var k = 0; k < targetSymbols.length; k++) {
      targetSet[targetSymbols[k].toUpperCase()] = true;
    }

    var applied = 0;

    for (var i = 1; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line) continue;
      var cols = this.parseCsvLine(line);
      // Exact column-count validation: reject malformed rows with missing OR extra columns
      if (!cols || cols.length !== expectedColCount) continue;

      // Strict row-level date validation
      if (expectedDateKey && tsIdx !== -1) {
        var rawTs = cols[tsIdx];
        if (!rawTs) continue; // reject blank date
        var rowDt = Utils.parseDate(rawTs);
        if (!rowDt) continue; // reject invalid date
        if (Utils.formatDateKey(rowDt) !== expectedDateKey) {
          continue; // reject mismatched date
        }
      }

      var sym = (cols[symIdx] || '').toUpperCase();
      var series = (seriesIdx !== -1 && cols[seriesIdx]) ? cols[seriesIdx].toUpperCase() : 'EQ';

      if (targetSet[sym] && (series === 'EQ' || series === 'BE')) {
        var spot = Utils.safeFloat(cols[closeIdx]);
        if (spot !== null && spot > 0 && parsedData.symbolsData[sym]) {
          parsedData.symbolsData[sym].spotPrice = spot;
          applied++;
        }
      }
    }

    return applied;
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
  _fetchHttpText: function(url, sourceLabel, customHeaders) {
    if (this._attemptedUrls[url]) {
      return this._attemptedUrls[url];
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

    var headers = customHeaders || {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': '*/*'
    };

    var startTime = new Date().getTime();
    try {
      var resp = UrlFetchApp.fetch(url, {
        muteHttpExceptions: true,
        headers: headers
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
      var safeError = (e.message || '').replace(/Bearer\s+[A-Za-z0-9_.~+-]+/gi, 'Bearer [REDACTED]');
      SheetManager.log('ERROR', 'HTTP_DIAGNOSTIC', '[' + label + '] Exception after ' + errElapsed + 'ms: ' + safeError);

      var isTimeout = safeError.indexOf('timed out') !== -1 || safeError.indexOf('Timeout') !== -1;
      var failRes = {
        status: isTimeout ? this.STATUS.TIMEOUT : this.STATUS.NETWORK_ERROR,
        text: null,
        error: safeError + ' (' + errElapsed + 'ms)'
      };
      this._attemptedUrls[url] = failRes;
      return failRes;
    }
  },

  /**
   * Safe ZIP download and unzip with circuit breaker, non-repetition, and timing diagnostic.
   */
  _fetchAndUnzipCsv: function(url, sourceLabel, customHeaders) {
    if (this._attemptedUrls[url]) {
      return this._attemptedUrls[url];
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

    var headers = customHeaders || {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': '*/*'
    };

    var startTime = new Date().getTime();
    try {
      var resp = UrlFetchApp.fetch(url, {
        muteHttpExceptions: true,
        headers: headers
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
      var safeError = (e.message || '').replace(/Bearer\s+[A-Za-z0-9_.~+-]+/gi, 'Bearer [REDACTED]');
      SheetManager.log('ERROR', 'HTTP_DIAGNOSTIC', '[' + label + '] Exception after ' + errElapsed + 'ms: ' + safeError);

      var isTimeout = safeError.indexOf('timed out') !== -1 || safeError.indexOf('Timeout') !== -1;
      var failRes = {
        status: isTimeout ? this.STATUS.TIMEOUT : this.STATUS.NETWORK_ERROR,
        csvText: null,
        error: safeError + ' (' + errElapsed + 'ms)'
      };
      this._attemptedUrls[url] = failRes;
      return failRes;
    }
  }
};
