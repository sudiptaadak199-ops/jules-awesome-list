/**
 * SA Futures Gap Analysis System - Hardened Cloudflare Worker Edge Relay
 *
 * Hardened Security & Operating Rules:
 * 1. Secure API Token Authentication using Worker Secret `API_TOKEN`.
 *    Requests without a valid `Authorization: Bearer <API_TOKEN>` return 401 Unauthorized.
 * 2. Method Validation: Accepts ONLY GET requests. Rejects all other methods with 405.
 * 3. Path Validation: Accepts ONLY `/`, `/health`, and `/ping`. Rejects other paths with 404.
 * 4. Strict Query Validation: Rejects unexpected query parameters. On `/`, only `?date=YYYYMMDD` is accepted.
 * 5. Real Calendar Date Validation: Validates that YYYYMMDD represents a real calendar date
 *    (e.g., rejects 20260230 / Feb 30 with 400 Bad Request).
 * 6. Fallback Behavior: If primary NSE archive URL returns 404 or fails, tries alternate URL before erroring.
 * 7. Genuine ZIP Validation: Verifies standard PK ZIP signature (0x04034b50) to prevent serving HTML/WAF error pages.
 * 8. Pure Binary Streaming: Preserves original binary ZIP bytes without alteration.
 * 9. Removed unnecessary wildcard CORS headers.
 * 10. Maintains diagnostic headers: X-NSE-Status, X-NSE-Source, X-Elapsed-Time-Ms.
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

    // Health / Ping public probe endpoints
    if (url.pathname === '/health' || url.pathname === '/ping') {
      return new Response(JSON.stringify({
        status: 'OK',
        service: 'NSE-FO-Bhavcopy-Relay-Worker',
        timestamp: new Date().toISOString()
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 3. API Token Authentication: require valid Bearer token matching env.API_TOKEN
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

    // 4. Query Parameter Validation: Reject unexpected query parameters
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

    // 5. Strict Real Calendar Date Validation (e.g. rejects 20260230)
    const year = parseInt(dateParam.slice(0, 4), 10);
    const month = parseInt(dateParam.slice(4, 6), 10);
    const day = parseInt(dateParam.slice(6, 8), 10);

    if (year < 2000 || year > 2099 || month < 1 || month > 12 || day < 1 || day > 31) {
      return new Response(JSON.stringify({ error: 'Date value out of range', date: dateParam }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Check calendar validity using Date constructor
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

    // Internal URL Construction - never accept arbitrary external URLs
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

    // 6. Primary and Alternate URL Fallback
    // If primary returns 404 or any non-200 failure, try alternate before returning an error!
    try {
      nseResponse = await fetch(primaryUrl, {
        headers: requestHeaders,
        cf: { cacheTtl: 86400, cacheEverything: true }
      });

      if (!nseResponse.ok) {
        usedSource = 'archives.nseindia.com';
        const altResponse = await fetch(altUrl, {
          headers: requestHeaders,
          cf: { cacheTtl: 86400, cacheEverything: true }
        });
        if (altResponse.ok || nseResponse.status === 404) {
          nseResponse = altResponse;
        }
      }
    } catch (err) {
      // If primary threw a network error, try alternate
      try {
        usedSource = 'archives.nseindia.com';
        nseResponse = await fetch(altUrl, {
          headers: requestHeaders,
          cf: { cacheTtl: 86400, cacheEverything: true }
        });
      } catch (altErr) {
        const elapsed = Date.now() - startTime;
        return new Response(JSON.stringify({
          error: 'Fetch failure connecting to official NSE archives',
          details: altErr.message,
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
          'X-NSE-Source': usedSource,
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
          'X-NSE-Source': usedSource,
          'X-Elapsed-Time-Ms': String(elapsed)
        }
      });
    }

    // 7. Genuine ZIP Validation:
    // Read the body buffer to verify standard PK zip magic bytes (0x04034b50 / "PK\x03\x04")
    // This prevents returning an HTML error/WAF challenge page disguised as 200 OK.
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
          'X-NSE-Source': usedSource,
          'X-Elapsed-Time-Ms': String(elapsed)
        }
      });
    }

    // 8. Stream unaltered original binary ZIP
    return new Response(zipArrayBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="BhavCopy_NSE_FO_0_0_0_${dateParam}_F_0000.csv.zip"`,
        'X-NSE-Status': '200',
        'X-NSE-Source': usedSource,
        'X-Elapsed-Time-Ms': String(elapsed),
        'Cache-Control': 'public, max-age=86400, immutable'
      }
    });
  }
};
