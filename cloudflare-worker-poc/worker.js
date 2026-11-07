/**
 * SA Futures Gap Analysis System - Cloudflare Worker Proof of Concept
 *
 * Purpose:
 * Standalone, secure, zero-cost edge relay to fetch official NSE UDiFF FO Bhavcopy ZIPs.
 * Bypasses Akamai/WAF IP blocks on Google Cloud Platform / Google Apps Script UrlFetchApp ranges.
 *
 * Security & Design Rules:
 * 1. Accepts ONLY parameter `date` conforming strictly to 8-digit format YYYYMMDD.
 * 2. URL is constructed INTERNALLY from verified official NSE archive domains.
 *    Never accepts or proxies arbitrary external URLs (not an open proxy).
 * 3. Returns the original raw binary ZIP payload without alteration or conversion.
 * 4. Adds diagnostic headers: X-NSE-Status, X-NSE-Source, X-Elapsed-Time-Ms.
 */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const dateParam = url.searchParams.get('date');

    // Health check endpoint
    if (url.pathname === '/health' || url.pathname === '/ping') {
      return new Response(JSON.stringify({ status: 'OK', service: 'NSE-FO-Bhavcopy-Relay-Worker' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Input Validation: strictly 8 digits YYYYMMDD
    if (!dateParam || !/^\d{8}$/.test(dateParam)) {
      return new Response(JSON.stringify({
        error: 'Invalid or missing date parameter',
        expected_format: 'YYYYMMDD (e.g. ?date=20261106)'
      }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }

    // Date sanity check (year 2000 - 2099, month 01-12, day 01-31)
    const year = parseInt(dateParam.slice(0, 4), 10);
    const month = parseInt(dateParam.slice(4, 6), 10);
    const day = parseInt(dateParam.slice(6, 8), 10);

    if (year < 2000 || year > 2099 || month < 1 || month > 12 || day < 1 || day > 31) {
      return new Response(JSON.stringify({ error: 'Date value out of range', date: dateParam }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    const primaryUrl = `https://nsearchives.nseindia.com/content/fo/BhavCopy_NSE_FO_0_0_0_${dateParam}_F_0000.csv.zip`;
    const altUrl = `https://archives.nseindia.com/content/fo/BhavCopy_NSE_FO_0_0_0_${dateParam}_F_0000.csv.zip`;

    const requestHeaders = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': '*/*',
      'Accept-Language': 'en-US,en;q=0.9',
      'Connection': 'keep-alive'
    };

    const startTime = Date.now();
    let nseResponse = null;
    let usedSource = 'nsearchives.nseindia.com';

    // 1. Try Primary Archive URL
    try {
      nseResponse = await fetch(primaryUrl, {
        headers: requestHeaders,
        cf: {
          cacheTtl: 86400, // Cache immutable historical archives at Cloudflare edge for 24h
          cacheEverything: true
        }
      });

      // 2. If primary returns 404 or fails, try alternate archive mirror
      if (!nseResponse.ok && nseResponse.status !== 404) {
        usedSource = 'archives.nseindia.com';
        nseResponse = await fetch(altUrl, {
          headers: requestHeaders,
          cf: { cacheTtl: 86400, cacheEverything: true }
        });
      }
    } catch (err) {
      const elapsed = Date.now() - startTime;
      return new Response(JSON.stringify({
        error: 'Fetch failure connecting to official NSE archives',
        details: err.message,
        elapsed_ms: elapsed
      }), {
        status: 502,
        headers: {
          'Content-Type': 'application/json',
          'X-Elapsed-Time-Ms': String(elapsed),
          'Access-Control-Allow-Origin': '*'
        }
      });
    }

    const elapsed = Date.now() - startTime;

    // Handle 404 / Holiday / Unpublished
    if (nseResponse.status === 404) {
      return new Response(JSON.stringify({
        status: 404,
        message: 'Bhavcopy archive not found for requested date (Likely weekend, market holiday, or unpublished date)',
        date: dateParam,
        elapsed_ms: elapsed
      }), {
        status: 404,
        headers: {
          'Content-Type': 'application/json',
          'X-NSE-Status': '404',
          'X-NSE-Source': usedSource,
          'X-Elapsed-Time-Ms': String(elapsed),
          'Access-Control-Allow-Origin': '*'
        }
      });
    }

    if (!nseResponse.ok) {
      return new Response(JSON.stringify({
        status: nseResponse.status,
        message: 'NSE archive returned non-200 status',
        date: dateParam,
        elapsed_ms: elapsed
      }), {
        status: nseResponse.status,
        headers: {
          'Content-Type': 'application/json',
          'X-NSE-Status': String(nseResponse.status),
          'X-NSE-Source': usedSource,
          'X-Elapsed-Time-Ms': String(elapsed),
          'Access-Control-Allow-Origin': '*'
        }
      });
    }

    // Return the original ZIP binary with intact byte-for-byte stream
    const zipBlob = await nseResponse.blob();

    return new Response(zipBlob, {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="BhavCopy_NSE_FO_0_0_0_${dateParam}_F_0000.csv.zip"`,
        'X-NSE-Status': '200',
        'X-NSE-Source': usedSource,
        'X-Elapsed-Time-Ms': String(elapsed),
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=86400, immutable'
      }
    });
  }
};
