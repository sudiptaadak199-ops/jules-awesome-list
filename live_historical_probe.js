/**
 * live_historical_probe.js
 *
 * Genuine historical NSE probe testing every expected trading date in the rolling
 * 6-month period (May 4, 2026 – November 4, 2026) across target symbols:
 * RELIANCE, TCS, INFY, HDFCBANK, ICICIBANK.
 *
 * Strict Production-Parity Validation Rules:
 * 1. Spot Price: Fetched EXCLUSIVELY from official NSE Cash Market Bhavcopies (sec_bhavdata_full / CM).
 *    Never substitute or fallback to Futures UndrlygPric! If CM Spot is unavailable, record remains INCOMPLETE.
 * 2. ClsPric only: Never substitute SttlmPric. If ClsPric is missing or <= 0, contract is rejected early.
 * 3. FinInstrmNm only: Never guess or synthesize fake symbols like `${sym}_FUT`. Never substitute FinInstrmId.
 * 4. Exact column count validation on every row (cols.length === expectedColCount).
 * 5. Strict date validation: Validate every row's TradDt against requested date.
 *
 * Outputs:
 * - live_probe_results.csv
 * - live_probe_summary.json
 */

const https = require('https');
const zlib = require('zlib');
const fs = require('fs');

const OFFICIAL_HOLIDAYS_MAP = {
  '2026-05-01': 'Maharashtra Day',
  '2026-05-28': 'Bakri Id',
  '2026-06-26': 'Muharram',
  '2026-08-15': 'Independence Day',
  '2026-09-14': 'Ganesh Chaturthi',
  '2026-10-02': 'Mahatma Gandhi Jayanti',
  '2026-10-20': 'Dussehra',
  '2026-11-08': 'Diwali Laxmi Pujan*',
  '2026-11-10': 'Diwali-Balipratipada',
  '2026-11-24': 'Guru Nanak Jayanti',
  '2026-12-25': 'Christmas'
};

const SYMBOLS = ['RELIANCE', 'TCS', 'INFY', 'HDFCBANK', 'ICICIBANK'];

function formatDateKey(d) {
  const y = d.getFullYear();
  const m = ('0' + (d.getMonth() + 1)).slice(-2);
  const day = ('0' + d.getDate()).slice(-2);
  return `${y}-${m}-${day}`;
}

function formatYYYYMMDD(d) {
  const y = d.getFullYear();
  const m = ('0' + (d.getMonth() + 1)).slice(-2);
  const day = ('0' + d.getDate()).slice(-2);
  return `${y}${m}${day}`;
}

function formatDDMMYYYY(d) {
  const y = d.getFullYear();
  const m = ('0' + (d.getMonth() + 1)).slice(-2);
  const day = ('0' + d.getDate()).slice(-2);
  return `${day}${m}${y}`;
}

function getWeekdays(startDate, endDate) {
  const list = [];
  const curr = new Date(startDate);
  while (curr <= endDate) {
    const day = curr.getDay();
    if (day !== 0 && day !== 6) { // Monday-Friday
      list.push(new Date(curr));
    }
    curr.setDate(curr.getDate() + 1);
  }
  return list;
}

function parseCsvLine(line) {
  if (line === null || line === undefined) return null;
  if (line.charCodeAt(0) === 0xFEFF) {
    line = line.substring(1);
  }
  const len = line.length;
  const fields = [];
  let i = 0;

  while (i < len) {
    while (i < len && (line[i] === ' ' || line[i] === '\t')) i++;
    if (i >= len) {
      fields.push('');
      break;
    }

    if (line[i] === '"') {
      i++;
      let cur = '';
      let closedQuote = false;
      while (i < len) {
        const c = line[i];
        if (c === '"') {
          if (i + 1 < len && line[i + 1] === '"') {
            cur += '"';
            i += 2;
          } else {
            closedQuote = true;
            i++;
            break;
          }
        } else {
          cur += c;
          i++;
        }
      }
      if (!closedQuote) return null;
      while (i < len && (line[i] === ' ' || line[i] === '\t')) i++;
      if (i < len && line[i] !== ',') return null;
      fields.push(cur.trim());
      if (i < len && line[i] === ',') {
        i++;
        if (i === len) fields.push('');
      }
    } else {
      const start = i;
      while (i < len && line[i] !== ',') {
        if (line[i] === '"') return null;
        i++;
      }
      fields.push(line.substring(start, i).trim());
      if (i < len && line[i] === ',') {
        i++;
        if (i === len) fields.push('');
      }
    }
  }
  return fields;
}

function fetchBuffer(url) {
  return new Promise((resolve) => {
    const req = https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': '*/*'
      },
      timeout: 10000
    }, (res) => {
      if (res.statusCode === 200) {
        const chunks = [];
        res.on('data', chunk => chunks.push(chunk));
        res.on('end', () => resolve({ status: 200, buffer: Buffer.concat(chunks) }));
      } else {
        res.resume();
        resolve({ status: res.statusCode, buffer: null });
      }
    });

    req.on('error', (err) => resolve({ status: 0, error: err.message, buffer: null }));
    req.on('timeout', () => {
      req.destroy();
      resolve({ status: 0, error: 'TIMEOUT', buffer: null });
    });
  });
}

function unzipBuffer(zipBuf) {
  try {
    let offset = 0;
    while (offset < zipBuf.length - 4) {
      if (zipBuf.readUInt32LE(offset) === 0x04034b50) {
        const compressionMethod = zipBuf.readUInt16LE(offset + 8);
        const compSize = zipBuf.readUInt32LE(offset + 18);
        const fnLen = zipBuf.readUInt16LE(offset + 26);
        const extraFieldLen = zipBuf.readUInt16LE(offset + 28);
        const dataOffset = offset + 30 + fnLen + extraFieldLen;

        const compData = zipBuf.slice(dataOffset, dataOffset + compSize);
        if (compressionMethod === 8) {
          return zlib.inflateRawSync(compData).toString('utf-8');
        } else if (compressionMethod === 0) {
          return compData.toString('utf-8');
        }
      }
      offset++;
    }
  } catch (e) {
    return null;
  }
  return null;
}

/**
 * Parses UDiFF FO CSV strictly according to production rules.
 * Does NOT set spot price from UndrlygPric. Stores underlyingPrice strictly as diagnostic metadata.
 */
function parseUdiffFOCsv(csvText, expectedDateKey) {
  const lines = csvText.split(/\r?\n/);
  if (lines.length < 2) return null;

  const headers = parseCsvLine(lines[0]);
  if (!headers || headers.length === 0) return null;
  const expectedColCount = headers.length;

  const colIdx = {
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

  if (colIdx.tradDt === -1 || colIdx.tckrSymb === -1 || colIdx.finInstrmTp === -1 ||
      colIdx.finInstrmNm === -1 || colIdx.xpryDt === -1 || colIdx.clsPric === -1) {
    return null;
  }

  const contractsBySymbol = {};
  SYMBOLS.forEach(s => contractsBySymbol[s] = { contracts: [], underlyingPrice: null, spotPrice: null });

  let matchedDateCount = 0;

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const cols = parseCsvLine(line);
    if (!cols || cols.length !== expectedColCount) continue;

    if (expectedDateKey && colIdx.tradDt !== -1) {
      const rowDt = cols[colIdx.tradDt];
      if (rowDt !== expectedDateKey) continue;
      matchedDateCount++;
    }

    const inst = (cols[colIdx.finInstrmTp] || '').toUpperCase();
    if (inst !== 'STF' && inst !== 'FUTSTK') continue;

    const sym = (cols[colIdx.tckrSymb] || '').toUpperCase();
    if (!contractsBySymbol[sym]) continue;

    const contractNm = (colIdx.finInstrmNm !== -1 && cols[colIdx.finInstrmNm]) ? cols[colIdx.finInstrmNm].trim() : '';
    const instrumentId = (colIdx.finInstrmId !== -1 && cols[colIdx.finInstrmId]) ? cols[colIdx.finInstrmId].trim() : '';

    if (!contractNm) continue;

    const rawClose = parseFloat(cols[colIdx.clsPric]);
    if (isNaN(rawClose) || rawClose <= 0) continue; // Reject non-positive close price early

    const rawExpiry = (colIdx.actlXpryDt !== -1 && cols[colIdx.actlXpryDt]) ? cols[colIdx.actlXpryDt].trim() : cols[colIdx.xpryDt].trim();
    const expDate = new Date(rawExpiry);
    if (isNaN(expDate.getTime())) continue;

    const rawSettle = parseFloat(cols[colIdx.sttlmPric]);
    const rawUndrlyg = parseFloat(cols[colIdx.undrlygPric]);
    const undrlyg = (!isNaN(rawUndrlyg) && rawUndrlyg > 0) ? rawUndrlyg : null;

    if (undrlyg !== null && contractsBySymbol[sym].underlyingPrice === null) {
      contractsBySymbol[sym].underlyingPrice = undrlyg; // Diagnostic only
    }

    contractsBySymbol[sym].contracts.push({
      contractSymbol: contractNm,
      instrumentId: instrumentId,
      expiryStr: rawExpiry,
      expiryDate: expDate,
      closePrice: rawClose,
      settlePrice: !isNaN(rawSettle) ? rawSettle : null,
      priceSource: 'ClsPric'
    });
  }

  if (expectedDateKey && matchedDateCount === 0) return null;
  return contractsBySymbol;
}

/**
 * Fetches official NSE Cash Market Bhavcopy (sec_bhavdata_full) and extracts Spot Closing Price.
 * Strictly verifies date, EQ/BE series, and positive price.
 */
async function fetchOfficialCashSpot(dateObj, targetSymbols) {
  const ddmmyyyy = formatDDMMYYYY(dateObj);
  const dateKey = formatDateKey(dateObj);

  const cmUrl1 = `https://nsearchives.nseindia.com/products/content/sec_bhavdata_full_${ddmmyyyy}.csv`;
  let res = await fetchBuffer(cmUrl1);
  if (res.status !== 200 || !res.buffer) {
    const cmUrl2 = `https://archives.nseindia.com/products/content/sec_bhavdata_full_${ddmmyyyy}.csv`;
    res = await fetchBuffer(cmUrl2);
  }

  const spots = {};
  targetSymbols.forEach(s => spots[s] = null);

  if (res.status === 200 && res.buffer) {
    const text = res.buffer.toString('utf-8');
    const lines = text.split(/\r?\n/);
    if (lines.length >= 2) {
      const headers = parseCsvLine(lines[0]);
      if (headers) {
        const expectedColCount = headers.length;
        const upHeaders = headers.map(h => h.toUpperCase());
        const symIdx = upHeaders.indexOf('SYMBOL');
        const seriesIdx = upHeaders.indexOf('SERIES');
        const closeIdx = upHeaders.indexOf('CLOSE_PRICE');
        const date1Idx = upHeaders.indexOf('DATE1');
        const tsIdx = upHeaders.indexOf('TIMESTAMP');
        const dateColIdx = date1Idx !== -1 ? date1Idx : tsIdx;

        if (symIdx !== -1 && closeIdx !== -1 && dateColIdx !== -1) {
          const targetSet = new Set(targetSymbols);

          for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;
            const cols = parseCsvLine(line);
            if (!cols || cols.length !== expectedColCount) continue;

            const rowDate = cols[dateColIdx];
            const parsedDt = new Date(rowDate);
            if (isNaN(parsedDt.getTime()) || formatDateKey(parsedDt) !== dateKey) continue;

            const sym = (cols[symIdx] || '').toUpperCase();
            const series = (seriesIdx !== -1 && cols[seriesIdx]) ? cols[seriesIdx].toUpperCase() : 'EQ';

            if (targetSet.has(sym) && (series === 'EQ' || series === 'BE')) {
              const spot = parseFloat(cols[closeIdx]);
              if (!isNaN(spot) && spot > 0) {
                spots[sym] = spot;
              }
            }
          }
        }
      }
    }
  }

  return spots;
}

async function runProbe() {
  console.log('=== STARTING STRICT OFFICIAL NSE PROBE WITH VERIFIED CASH SPOT (MAY 4 - NOV 4, 2026) ===');

  const startDate = new Date(2026, 4, 4);
  const endDate = new Date(2026, 10, 4);
  const weekdays = getWeekdays(startDate, endDate);

  console.log(`Evaluating all ${weekdays.length} weekdays across symbols: ${SYMBOLS.join(', ')}`);

  const summary = {
    probe_start_date: '2026-05-04',
    probe_end_date: '2026-11-04',
    target_symbols: SYMBOLS,
    total_weekdays_evaluated: weekdays.length,
    confirmed_holidays_count: 0,
    expected_trading_days_count: 0,
    downloaded_fo_archives_count: 0,
    failed_fo_archive_dates_count: 0,
    total_potential_symbol_records: 0,
    complete_records_count: 0,
    incomplete_records_count: 0,
    missing_cash_spot_count: 0,
    missing_futures_contracts_count: 0,
    historical_coverage_percentage: 0.0,
    spot_source: 'Official NSE CM Bhavcopy (sec_bhavdata_full)',
    futures_price_source: 'ClsPric',
    undrlyg_pric_as_spot_used: false,
    settlement_fallback_used: false,
    synthetic_symbol_generation_used: false,
    symbol_breakdown: {},
    confirmed_holidays_list: [],
    failed_dates_list: []
  };

  SYMBOLS.forEach(s => {
    summary.symbol_breakdown[s] = {
      complete: 0,
      incomplete: 0,
      missing_cash_spot: 0,
      missing_futures: 0,
      coverage_percentage: 0.0
    };
  });

  const csvRows = [
    [
      'Date',
      'Symbol',
      'Spot Price',
      'Current Futures Price',
      'Next Futures Price',
      'Current Contract Symbol',
      'Current Expiry',
      'Next Contract Symbol',
      'Next Expiry',
      'Spot Source',
      'Futures Price Field Used',
      'HTTP Status',
      'Completeness Status'
    ].join(',')
  ];

  for (let i = 0; i < weekdays.length; i++) {
    const dt = weekdays[i];
    const dateStr = formatDateKey(dt);
    const ymd = formatYYYYMMDD(dt);

    if (OFFICIAL_HOLIDAYS_MAP[dateStr]) {
      summary.confirmed_holidays_count++;
      summary.confirmed_holidays_list.push({ date: dateStr, description: OFFICIAL_HOLIDAYS_MAP[dateStr] });
      SYMBOLS.forEach(sym => {
        csvRows.push([
          dateStr,
          sym,
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          'CONFIRMED_HOLIDAY',
          'NONE',
          'HOLIDAY',
          'CONFIRMED_HOLIDAY'
        ].join(','));
      });
      continue;
    }

    summary.expected_trading_days_count++;

    // 1. Fetch FO Bhavcopy Archive
    const primaryUrl = `https://nsearchives.nseindia.com/content/fo/BhavCopy_NSE_FO_0_0_0_${ymd}_F_0000.csv.zip`;
    let res = await fetchBuffer(primaryUrl);
    if (res.status !== 200) {
      const altUrl = `https://archives.nseindia.com/content/fo/BhavCopy_NSE_FO_0_0_0_${ymd}_F_0000.csv.zip`;
      const altRes = await fetchBuffer(altUrl);
      if (altRes.status === 200) res = altRes;
    }

    if (res.status !== 200 || !res.buffer) {
      summary.failed_fo_archive_dates_count++;
      summary.failed_dates_list.push({ date: dateStr, status: res.status });
      SYMBOLS.forEach(sym => {
        summary.incomplete_records_count++;
        summary.symbol_breakdown[sym].incomplete++;
        csvRows.push([
          dateStr,
          sym,
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          'NONE',
          'NONE',
          res.status || 'ERROR',
          'INCOMPLETE'
        ].join(','));
      });
      continue;
    }

    summary.downloaded_fo_archives_count++;
    const csvText = unzipBuffer(res.buffer);
    if (!csvText) {
      summary.failed_fo_archive_dates_count++;
      summary.failed_dates_list.push({ date: dateStr, status: 'ZIP_PARSE_ERROR' });
      continue;
    }

    const contractsBySym = parseUdiffFOCsv(csvText, dateStr);
    if (!contractsBySym) {
      summary.failed_fo_archive_dates_count++;
      summary.failed_dates_list.push({ date: dateStr, status: 'CSV_VALIDATION_ERROR' });
      continue;
    }

    // 2. Fetch Official Cash Market Spot Prices strictly from CM Bhavcopy
    const officialCashSpots = await fetchOfficialCashSpot(dt, SYMBOLS);

    const tradeMidnight = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate());

    SYMBOLS.forEach(sym => {
      const symData = contractsBySym[sym] || { contracts: [], underlyingPrice: null, spotPrice: null };
      const rawContracts = symData.contracts || [];
      const validContracts = [];

      for (let c of rawContracts) {
        if (!c.expiryStr || !c.contractSymbol) continue;
        const expMidnight = new Date(c.expiryDate.getFullYear(), c.expiryDate.getMonth(), c.expiryDate.getDate());
        if (expMidnight >= tradeMidnight && c.closePrice !== null && c.closePrice > 0) {
          validContracts.push(c);
        }
      }

      validContracts.sort((a, b) => a.expiryDate - b.expiryDate);

      const curContract = validContracts.length > 0 ? validContracts[0] : null;
      let nxtContract = null;
      if (curContract && validContracts.length > 1) {
        for (let k = 1; k < validContracts.length; k++) {
          if (validContracts[k].expiryDate.getTime() > curContract.expiryDate.getTime()) {
            nxtContract = validContracts[k];
            break;
          }
        }
      }

      // Strictly verify official Cash Market spot price
      const verifiedSpot = officialCashSpots[sym];
      if (verifiedSpot === null || verifiedSpot <= 0) {
        summary.missing_cash_spot_count++;
        summary.symbol_breakdown[sym].missing_cash_spot++;
      }

      if (!curContract || !nxtContract) {
        summary.missing_futures_contracts_count++;
        summary.symbol_breakdown[sym].missing_futures++;
      }

      const isComplete = (verifiedSpot !== null && verifiedSpot > 0) &&
                         (curContract !== null && curContract.closePrice > 0 && curContract.contractSymbol) &&
                         (nxtContract !== null && nxtContract.closePrice > 0 && nxtContract.contractSymbol) &&
                         (curContract.expiryStr !== nxtContract.expiryStr);

      const status = isComplete ? 'COMPLETE' : 'INCOMPLETE';

      if (isComplete) {
        summary.complete_records_count++;
        summary.symbol_breakdown[sym].complete++;
      } else {
        summary.incomplete_records_count++;
        summary.symbol_breakdown[sym].incomplete++;
      }

      csvRows.push([
        dateStr,
        sym,
        verifiedSpot !== null ? verifiedSpot : '',
        curContract ? curContract.closePrice : '',
        nxtContract ? nxtContract.closePrice : '',
        curContract ? curContract.contractSymbol : '',
        curContract ? curContract.expiryStr : '',
        nxtContract ? nxtContract.contractSymbol : '',
        nxtContract ? nxtContract.expiryStr : '',
        verifiedSpot !== null ? 'Official NSE CM Bhavcopy' : 'NONE',
        'ClsPric',
        200,
        status
      ].join(','));
    });

    if ((i + 1) % 25 === 0 || i === weekdays.length - 1) {
      console.log(`Processed ${i + 1}/${weekdays.length} dates (Complete records: ${summary.complete_records_count})...`);
    }
  }

  summary.total_potential_symbol_records = summary.expected_trading_days_count * SYMBOLS.length;
  summary.historical_coverage_percentage = parseFloat(((summary.complete_records_count / summary.total_potential_symbol_records) * 100).toFixed(2));

  SYMBOLS.forEach(sym => {
    const sCount = summary.symbol_breakdown[sym];
    sCount.coverage_percentage = parseFloat(((sCount.complete / summary.expected_trading_days_count) * 100).toFixed(2));
  });

  fs.writeFileSync('live_probe_results.csv', csvRows.join('\n'));
  fs.writeFileSync('live_probe_summary.json', JSON.stringify(summary, null, 2));

  console.log('\n================ STRICT LIVE PROBE RESULTS SUMMARY ================');
  console.log(`Total Weekdays Evaluated:             ${summary.total_weekdays_evaluated}`);
  console.log(`Confirmed Official Holidays:          ${summary.confirmed_holidays_count}`);
  console.log(`Expected Trading Days:                ${summary.expected_trading_days_count}`);
  console.log(`Bhavcopy Archives Downloaded:         ${summary.downloaded_fo_archives_count}/${summary.expected_trading_days_count}`);
  console.log(`Failed FO Archive Dates:              ${summary.failed_fo_archive_dates_count}`);
  console.log(`Total Potential Symbol Records:       ${summary.total_potential_symbol_records}`);
  console.log(`Verified COMPLETE Records:            ${summary.complete_records_count}`);
  console.log(`Incomplete Records:                   ${summary.incomplete_records_count}`);
  console.log(`Missing Official Cash Spot Records:   ${summary.missing_cash_spot_count}`);
  console.log(`Missing Futures Contract Records:     ${summary.missing_futures_contracts_count}`);
  console.log(`Spot Source:                          ${summary.spot_source}`);
  console.log(`Futures Price Field Used:             ${summary.futures_price_source}`);
  console.log(`Futures UndrlygPric As Spot:          ${summary.undrlyg_pric_as_spot_used}`);
  console.log(`Settlement Fallback Used:             ${summary.settlement_fallback_used}`);
  console.log(`Synthetic Symbol Generation Used:     ${summary.synthetic_symbol_generation_used}`);
  console.log(`Actual Historical Coverage:           ${summary.historical_coverage_percentage}%`);
  console.log('Saved detailed results to live_probe_results.csv and summary to live_probe_summary.json.\n');
}

runProbe().catch(console.error);
