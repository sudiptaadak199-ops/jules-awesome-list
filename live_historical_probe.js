/**
 * live_historical_probe.js
 *
 * Genuine historical NSE probe testing every expected trading date in the rolling
 * 6-month period (May 4, 2026 – November 4, 2026) across target symbols:
 * RELIANCE, TCS, INFY, HDFCBANK, ICICIBANK.
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

function fetchBuffer(url) {
  return new Promise((resolve, reject) => {
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

/**
 * Minimal unzipper for single-file ZIP archives
 */
function unzipBuffer(zipBuf) {
  try {
    let offset = 0;
    while (offset < zipBuf.length - 4) {
      if (zipBuf.readUInt32LE(offset) === 0x04034b50) { // Local file header signature
        const compressionMethod = zipBuf.readUInt16LE(offset + 8);
        const compressedSize = zipBuf.readUInt32LE(offset + 18);
        const fileNameLen = zipBuf.readUInt16LE(offset + 26);
        const extraFieldLen = zipBuf.readUInt16LE(offset + 28);
        const dataOffset = offset + 30 + fileNameLen + extraFieldLen;

        const compData = zipBuf.slice(dataOffset, dataOffset + compressedSize);
        if (compressionMethod === 8) { // Deflate
          return zlib.inflateRawSync(compData).toString('utf-8');
        } else if (compressionMethod === 0) { // Stored
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

function parseUdiffFOCsv(csvText) {
  const lines = csvText.split(/\r?\n/);
  if (lines.length < 2) return null;

  const headers = lines[0].split(',').map(h => h.trim());
  const colIdx = {
    tradDt: headers.indexOf('TradDt'),
    tckrSymb: headers.indexOf('TckrSymb'),
    finInstrmTp: headers.indexOf('FinInstrmTp'),
    finInstrmNm: headers.indexOf('FinInstrmNm'),
    xpryDt: headers.indexOf('XpryDt'),
    actlXpryDt: headers.indexOf('FininstrmActlXpryDt'),
    clsPric: headers.indexOf('ClsPric'),
    sttlmPric: headers.indexOf('SttlmPric'),
    undrlygPric: headers.indexOf('UndrlygPric')
  };

  const contractsBySymbol = {};
  SYMBOLS.forEach(s => contractsBySymbol[s] = []);

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const cols = line.split(',').map(c => c.trim());
    const inst = (cols[colIdx.finInstrmTp] || '').toUpperCase();
    if (inst !== 'STF' && inst !== 'FUTSTK') continue;

    const sym = (cols[colIdx.tckrSymb] || '').toUpperCase();
    if (!contractsBySymbol[sym]) continue;

    const contractNm = (colIdx.finInstrmNm !== -1 && cols[colIdx.finInstrmNm]) ? cols[colIdx.finInstrmNm] : `${sym}_FUT`;
    const expStr = (colIdx.actlXpryDt !== -1 && cols[colIdx.actlXpryDt]) ? cols[colIdx.actlXpryDt] : cols[colIdx.xpryDt];
    const cls = parseFloat(cols[colIdx.clsPric]) || null;
    const sttl = parseFloat(cols[colIdx.sttlmPric]) || null;
    const spot = parseFloat(cols[colIdx.undrlygPric]) || null;

    contractsBySymbol[sym].push({
      contractSymbol: contractNm,
      expiryStr: expStr,
      closePrice: cls && cls > 0 ? cls : (sttl && sttl > 0 ? sttl : null),
      settlePrice: sttl,
      spotPrice: spot
    });
  }

  return contractsBySymbol;
}

async function runProbe() {
  console.log('=== STARTING GENUINE LIVE HISTORICAL NSE PROBE (MAY 4 - NOV 4, 2026) ===');

  const startDate = new Date(2026, 4, 4);  // May 4, 2026
  const endDate = new Date(2026, 10, 4);   // Nov 4, 2026
  const weekdays = getWeekdays(startDate, endDate);

  console.log(`Evaluating all ${weekdays.length} weekdays across symbols: ${SYMBOLS.join(', ')}`);

  const summary = {
    probe_start_date: '2026-05-04',
    probe_end_date: '2026-11-04',
    target_symbols: SYMBOLS,
    total_weekdays_evaluated: weekdays.length,
    confirmed_holidays_count: 0,
    expected_trading_days_count: 0,
    downloaded_archives_count: 0,
    unavailable_archive_dates_count: 0,
    total_potential_symbol_records: 0,
    complete_records_count: 0,
    incomplete_records_count: 0,
    failed_records_count: 0,
    historical_coverage_percentage: 0.0,
    symbol_breakdown: {},
    confirmed_holidays_list: [],
    unavailable_archive_dates_list: []
  };

  SYMBOLS.forEach(s => {
    summary.symbol_breakdown[s] = {
      complete: 0,
      incomplete: 0,
      failed: 0,
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
      'Data Source',
      'HTTP Status',
      'Parsing Status',
      'Completeness Status'
    ].join(',')
  ];

  for (let i = 0; i < weekdays.length; i++) {
    const dt = weekdays[i];
    const dateStr = formatDateKey(dt);
    const ymd = formatYYYYMMDD(dt);

    // Check confirmed official holiday
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
          'NSE UDiFF FO Archive',
          'HOLIDAY',
          'OFFICIAL_HOLIDAY',
          'CONFIRMED_HOLIDAY'
        ].join(','));
      });
      continue;
    }

    summary.expected_trading_days_count++;

    const primaryUrl = `https://nsearchives.nseindia.com/content/fo/BhavCopy_NSE_FO_0_0_0_${ymd}_F_0000.csv.zip`;
    let res = await fetchBuffer(primaryUrl);

    if (res.status !== 200) {
      const altUrl = `https://archives.nseindia.com/content/fo/BhavCopy_NSE_FO_0_0_0_${ymd}_F_0000.csv.zip`;
      const altRes = await fetchBuffer(altUrl);
      if (altRes.status === 200) {
        res = altRes;
      }
    }

    if (res.status !== 200 || !res.buffer) {
      summary.unavailable_archive_dates_count++;
      summary.unavailable_archive_dates_list.push({ date: dateStr, http_status: res.status });
      SYMBOLS.forEach(sym => {
        summary.failed_records_count++;
        summary.symbol_breakdown[sym].failed++;
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
          'NSE UDiFF FO Archive',
          res.status || 'ERROR',
          'ARCHIVE_UNAVAILABLE',
          'FAILED'
        ].join(','));
      });
      continue;
    }

    summary.downloaded_archives_count++;

    const csvText = unzipBuffer(res.buffer);
    if (!csvText) {
      SYMBOLS.forEach(sym => {
        summary.failed_records_count++;
        summary.symbol_breakdown[sym].failed++;
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
          'NSE UDiFF FO Archive',
          200,
          'PARSING_ERROR',
          'FAILED'
        ].join(','));
      });
      continue;
    }

    const contractsBySym = parseUdiffFOCsv(csvText);
    const tradeMidnight = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate());

    SYMBOLS.forEach(sym => {
      const rawContracts = contractsBySym[sym] || [];
      // Filter unexpired contracts with valid positive price (>0)
      const validContracts = [];
      let resolvedSpot = null;

      for (let c of rawContracts) {
        if (!c.expiryStr) continue;
        const expDate = new Date(c.expiryStr);
        if (isNaN(expDate.getTime())) continue;
        const expMidnight = new Date(expDate.getFullYear(), expDate.getMonth(), expDate.getDate());
        if (expMidnight >= tradeMidnight && c.closePrice !== null && c.closePrice > 0) {
          validContracts.push({
            contractSymbol: c.contractSymbol,
            expiryStr: c.expiryStr,
            expiryDate: expDate,
            price: c.closePrice
          });
        }
        if (resolvedSpot === null && c.spotPrice !== null && c.spotPrice > 0) {
          resolvedSpot = c.spotPrice;
        }
      }

      // Sort unexpired valid contracts ascending by expiry date
      validContracts.sort((a, b) => a.expiryDate - b.expiryDate);

      const curContract = validContracts.length > 0 ? validContracts[0] : null;
      const nxtContract = validContracts.length > 1 ? validContracts[1] : null;

      const isComplete = (resolvedSpot !== null && resolvedSpot > 0) &&
                         (curContract !== null && curContract.price > 0) &&
                         (nxtContract !== null && nxtContract.price > 0);

      const status = isComplete ? 'COMPLETE' : (curContract || resolvedSpot ? 'INCOMPLETE' : 'FAILED');

      if (isComplete) {
        summary.complete_records_count++;
        summary.symbol_breakdown[sym].complete++;
      } else if (status === 'INCOMPLETE') {
        summary.incomplete_records_count++;
        summary.symbol_breakdown[sym].incomplete++;
      } else {
        summary.failed_records_count++;
        summary.symbol_breakdown[sym].failed++;
      }

      csvRows.push([
        dateStr,
        sym,
        resolvedSpot !== null ? resolvedSpot : '',
        curContract ? curContract.price : '',
        nxtContract ? nxtContract.price : '',
        curContract ? curContract.contractSymbol : '',
        curContract ? curContract.expiryStr : '',
        nxtContract ? nxtContract.contractSymbol : '',
        nxtContract ? nxtContract.expiryStr : '',
        'NSE UDiFF FO Archive',
        200,
        'SUCCESS',
        status
      ].join(','));
    });

    if ((i + 1) % 25 === 0 || i === weekdays.length - 1) {
      console.log(`Processed ${i + 1}/${weekdays.length} dates...`);
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

  console.log('\n================ LIVE PROBE RESULTS SUMMARY ================');
  console.log(`Total Weekdays Evaluated:          ${summary.total_weekdays_evaluated}`);
  console.log(`Confirmed Official Holidays:       ${summary.confirmed_holidays_count}`);
  console.log(`Expected Trading Days:             ${summary.expected_trading_days_count}`);
  console.log(`Bhavcopy Archives Downloaded:      ${summary.downloaded_archives_count}/${summary.expected_trading_days_count}`);
  console.log(`Unavailable Archive Dates:         ${summary.unavailable_archive_dates_count}`);
  console.log(`Total Potential Symbol Records:    ${summary.total_potential_symbol_records}`);
  console.log(`Successful COMPLETE Records:       ${summary.complete_records_count}`);
  console.log(`Incomplete Records:                ${summary.incomplete_records_count}`);
  console.log(`Failed Records:                    ${summary.failed_records_count}`);
  console.log(`Actual Historical Coverage:        ${summary.historical_coverage_percentage}%`);
  console.log('Saved detailed results to live_probe_results.csv and summary to live_probe_summary.json.\n');
}

runProbe().catch(console.error);
