/**
 * SA Futures Gap Analysis System - Hardened Cloudflare Worker Edge Relay
 *
 * Hardened Security & Operating Rules:
 * 1. Secure API Token Authentication using Worker Secret `API_TOKEN`.
 *    Requests without a valid `Authorization: Bearer <API_TOKEN>` return 401 Unauthorized.
 * 2. Method Validation: Accepts ONLY GET requests. Rejects all other methods with 405.
 * 3. Path Validation: Accepts ONLY `/`, `/health`, and `/ping`. Rejects other paths with 404.
 * 4. Strict Query Validation:
 *    - Rejects ALL query parameters on `/health` and `/ping` with 400 Bad Request.
 *    - On `/`, accepts ONLY a single `?date=YYYYMMDD`.
 *    - Rejects duplicate date parameters (e.g. `?date=20261106&date=20261107`) with 400 Bad Request.
 *    - Rejects unexpected query parameters with 400 Bad Request.
 * 5. Real Calendar Date Validation: Validates that YYYYMMDD represents a real calendar date
 *    (e.g., rejects 20260230 / Feb 30 with 400 Bad Request).
 * 6. Accurate Fallback Source Tracking:
 *    - `X-NSE-Source` strictly identifies the host whose response is actually being returned:
 *      `nsearchives.nseindia.com` if primary was returned, `archives.nseindia.com` if alternate was returned.
 * 7. Genuine ZIP Validation & Integrity Buffering:
 *    - The worker buffers the response via `arrayBuffer()` to verify standard PK zip magic bytes (0x50 0x4B 0x03 0x04)
 *      before returning it, guaranteeing that HTML error pages or WAF challenge pages are never served as 200 OK.
 * 8. Pure Binary Delivery: Returns unaltered raw binary ZIP bytes without modification.
 * 9. Maintains diagnostic headers: X-NSE-Status, X-NSE-Source, X-Elapsed-Time-Ms.
 */

export default {
  async fetch(request, env, ctx) {
    // 1. Method Validation: Accept ONLY GET requests
    if (request.method !== 'GET') {
      return new Response(JSON.stringify({ error: 'Method not allowed', allowed: ['GET'] }), {
        status: 405,
        headers: {
          'Content-Type': 'application/json',
          'Allow': 'GET'
        }
      });
    }

    const url = new URL(request.url);

    // 2. Path Validation: Accept ONLY root '/', '/health', and '/ping'
    const validPaths = ['/', '/health', '/ping'];
    if (!validPaths.includes(url.pathname)) {
      return new Response(JSON.stringify({ error: 'Not found', path: url.pathname }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 3. Health / Ping public probe endpoints: Reject ANY query parameters
    if (url.pathname === '/health' || url.pathname === '/ping') {
      if (url.searchParams.toString() !== '') {
        return new Response(JSON.stringify({
          error: 'Query parameters are not permitted on health/ping endpoints'
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      return new Response(JSON.stringify({
        status: 'OK',
        service: 'NSE-FO-Bhavcopy-Relay-Worker',
        timestamp: new Date().toISOString()
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 4. API Token Authentication: require valid Bearer token matching env.API_TOKEN
    const expectedToken = (env && env.API_TOKEN) ? env.API_TOKEN : null;
    const authHeader = request.headers.get('Authorization') || '';
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    const providedToken = match ? match[1].trim() : null;

    if (!expectedToken || !providedToken || providedToken !== expectedToken) {
      return new Response(JSON.stringify({
        error: 'Unauthorized',
        message: 'A valid Authorization Bearer token matching API_TOKEN is required.'
      }), {
        status: 401,
        headers: {
          'Content-Type': 'application/json',
          'WWW-Authenticate': 'Bearer realm="NSE Bhavcopy Relay"'
        }
      });
    }

    // 5. Query Parameter Validation on root '/':
    // Reject unexpected query parameters
    const paramKeys = Array.from(url.searchParams.keys());
    const unexpectedParams = paramKeys.filter(k => k !== 'date');
    if (unexpectedParams.length > 0) {
      return new Response(JSON.stringify({
        error: 'Unexpected query parameter(s)',
        unexpected: unexpectedParams,
        allowed_params: ['date']
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Reject duplicate date parameters (e.g. ?date=20261106&date=20261107)
    const allDateParams = url.searchParams.getAll('date');
    if (allDateParams.length > 1) {
      return new Response(JSON.stringify({
        error: 'Duplicate date parameter not allowed',
        provided: allDateParams
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const dateParam = url.searchParams.get('date');
    if (!dateParam || !/^\d{8}$/.test(dateParam)) {
      return new Response(JSON.stringify({
        error: 'Invalid or missing date parameter',
        expected_format: 'YYYYMMDD (e.g. ?date=20261106)'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 6. Strict Real Calendar Date Validation (e.g. rejects 20260230)
    const year = parseInt(dateParam.slice(0, 4), 10);
    const month = parseInt(dateParam.slice(4, 6), 10);
    const day = parseInt(dateParam.slice(6, 8), 10);

    if (year < 2000 || year > 2099 || month < 1 || month > 12 || day < 1 || day > 31) {
      return new Response(JSON.stringify({ error: 'Date value out of range', date: dateParam }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const testDate = new Date(Date.UTC(year, month - 1, day));
    if (testDate.getUTCFullYear() !== year || (testDate.getUTCMonth() + 1) !== month || testDate.getUTCDate() !== day) {
      return new Response(JSON.stringify({
        error: 'Invalid calendar date (day does not exist in given month/year)',
        date: dateParam
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Internal URL Construction
    const PRIMARY_HOST = 'nsearchives.nseindia.com';
    const ALT_HOST = 'archives.nseindia.com';
    const primaryUrl = `https://${PRIMARY_HOST}/content/fo/BhavCopy_NSE_FO_0_0_0_${dateParam}_F_0000.csv.zip`;
    const altUrl = `https://${ALT_HOST}/content/fo/BhavCopy_NSE_FO_0_0_0_${dateParam}_F_0000.csv.zip`;

    const requestHeaders = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': '*/*',
      'Accept-Language': 'en-US,en;q=0.9',
      'Connection': 'keep-alive'
    };

    const startTime = Date.now();
    let nseResponse = null;
    let returnedSource = PRIMARY_HOST;

    // 7. Primary and Alternate URL Fallback with Precise Source Tracking
    try {
      nseResponse = await fetch(primaryUrl, {
        headers: requestHeaders,
        cf: { cacheTtl: 86400, cacheEverything: true }
      });

      if (nseResponse.ok) {
        returnedSource = PRIMARY_HOST;
      } else {
        // Primary returned non-200 (including 404 or 5xx); try alternate mirror before returning
        try {
          const altResponse = await fetch(altUrl, {
            headers: requestHeaders,
            cf: { cacheTtl: 86400, cacheEverything: true }
          });

          // Always return the response from the server actually used
          nseResponse = altResponse;
          returnedSource = ALT_HOST;
        } catch (altErr) {
          // Alternate threw network error; keep primary response and primary host
          returnedSource = PRIMARY_HOST;
        }
      }
    } catch (err) {
      // Primary threw a network error; try alternate mirror
      try {
        nseResponse = await fetch(altUrl, {
          headers: requestHeaders,
          cf: { cacheTtl: 86400, cacheEverything: true }
        });
        returnedSource = ALT_HOST;
      } catch (altErr) {
        const elapsed = Date.now() - startTime;
        return new Response(JSON.stringify({
          error: 'Fetch failure connecting to official NSE archives',
          primary_error: err.message,
          alternate_error: altErr.message,
          elapsed_ms: elapsed
        }), {
          status: 502,
          headers: {
            'Content-Type': 'application/json',
            'X-Elapsed-Time-Ms': String(elapsed)
          }
        });
      }
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
          'X-NSE-Source': returnedSource,
          'X-Elapsed-Time-Ms': String(elapsed)
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
          'X-NSE-Source': returnedSource,
          'X-Elapsed-Time-Ms': String(elapsed)
        }
      });
    }

    // 8. Genuine ZIP Validation & Integrity Buffering:
    // Read the body buffer into memory to verify standard PK zip magic bytes (0x50 0x4B 0x03 0x04)
    // before returning, ensuring HTML error/WAF challenge pages are never served as 200 OK.
    const zipArrayBuffer = await nseResponse.arrayBuffer();
    const zipBytes = new Uint8Array(zipArrayBuffer);

    const isZip = zipBytes.length >= 4 &&
                  zipBytes[0] === 0x50 && // 'P'
                  zipBytes[1] === 0x4B && // 'K'
                  zipBytes[2] === 0x03 &&
                  zipBytes[3] === 0x04;

    if (!isZip) {
      return new Response(JSON.stringify({
        error: 'Invalid response from NSE archive: Payload is not a valid ZIP file',
        date: dateParam,
        byte_length: zipBytes.length,
        elapsed_ms: elapsed
      }), {
        status: 502,
        headers: {
          'Content-Type': 'application/json',
          'X-NSE-Status': '502',
          'X-NSE-Source': returnedSource,
          'X-Elapsed-Time-Ms': String(elapsed)
        }
      });
    }

    // Return unaltered raw binary ZIP payload
    return new Response(zipArrayBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="BhavCopy_NSE_FO_0_0_0_${dateParam}_F_0000.csv.zip"`,
        'X-NSE-Status': '200',
        'X-NSE-Source': returnedSource,
        'X-Elapsed-Time-Ms': String(elapsed),
        'Cache-Control': 'public, max-age=86400, immutable'
      }
    });
  }
};
