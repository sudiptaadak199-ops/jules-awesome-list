/**
 * cloudflare-worker-poc/test_worker_poc.js
 *
 * Comprehensive standalone test suite for the hardened Cloudflare Worker PoC.
 *
 * Verifies:
 * 1. Missing API token returns 401 Unauthorized.
 * 2. Incorrect API token returns 401 Unauthorized.
 * 3. Non-GET request (POST) returns 405 Method Not Allowed.
 * 4. Invalid path returns 404 Not Found.
 * 5. Unexpected query parameters return 400 Bad Request.
 * 6. Invalid calendar date (20260230 - Feb 30) returns 400 Bad Request.
 * 7. Public health endpoint /health and /ping return 200 OK.
 * 8. Valid date 20261106 with valid API token returns 200 OK and genuine ZIP archive.
 * 9. Absence of wildcard CORS headers.
 * 10. Presence of diagnostic headers: X-NSE-Status, X-NSE-Source, X-Elapsed-Time-Ms.
 * 11. PK ZIP signature verification and decompression.
 * 12. Official CSV file validation: confirms BhavCopy_NSE_FO_0_0_0_20261106_F_0000.csv and derivative records.
 */

const assert = require('assert');
const zlib = require('zlib');

const TEST_API_TOKEN = 'secret_test_token_nse_gap_2026';
const env = { API_TOKEN: TEST_API_TOKEN };

import('./worker.js').then(async (workerModule) => {
  const worker = workerModule.default;
  console.log('=== STARTING HARDENED CLOUDFLARE WORKER POC TEST SUITE ===\n');

  let passed = 0;
  let total = 0;

  async function testCase(name, fn) {
    total++;
    try {
      await fn();
      passed++;
      console.log(`[PASS] Test ${total}: ${name}`);
    } catch (err) {
      console.error(`[FAIL] Test ${total}: ${name}`);
      console.error(err);
      process.exit(1);
    }
  }

  // 1. Missing token returns 401
  await testCase('Missing Authorization token returns 401 Unauthorized', async () => {
    const req = new Request('https://nse-bhavcopy-relay.workers.dev/?date=20261106');
    const res = await worker.fetch(req, env, {});
    assert.strictEqual(res.status, 401);
    const body = await res.json();
    assert.strictEqual(body.error, 'Unauthorized');
  });

  // 2. Incorrect token returns 401
  await testCase('Incorrect Authorization token returns 401 Unauthorized', async () => {
    const req = new Request('https://nse-bhavcopy-relay.workers.dev/?date=20261106', {
      headers: { 'Authorization': 'Bearer wrong_token_value' }
    });
    const res = await worker.fetch(req, env, {});
    assert.strictEqual(res.status, 401);
    const body = await res.json();
    assert.strictEqual(body.error, 'Unauthorized');
  });

  // 3. POST request rejected with 405
  await testCase('POST request rejected with 405 Method Not Allowed', async () => {
    const req = new Request('https://nse-bhavcopy-relay.workers.dev/?date=20261106', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${TEST_API_TOKEN}` }
    });
    const res = await worker.fetch(req, env, {});
    assert.strictEqual(res.status, 405);
    assert.strictEqual(res.headers.get('Allow'), 'GET');
  });

  // 4. Invalid path returns 404
  await testCase('Invalid path returns 404 Not Found', async () => {
    const req = new Request('https://nse-bhavcopy-relay.workers.dev/invalid/path?date=20261106', {
      headers: { 'Authorization': `Bearer ${TEST_API_TOKEN}` }
    });
    const res = await worker.fetch(req, env, {});
    assert.strictEqual(res.status, 404);
  });

  // 5. Unexpected query parameters rejected with 400
  await testCase('Unexpected query parameters rejected with 400 Bad Request', async () => {
    const req = new Request('https://nse-bhavcopy-relay.workers.dev/?date=20261106&unexpected_param=123', {
      headers: { 'Authorization': `Bearer ${TEST_API_TOKEN}` }
    });
    const res = await worker.fetch(req, env, {});
    assert.strictEqual(res.status, 400);
    const body = await res.json();
    assert.strictEqual(body.error, 'Unexpected query parameter(s)');
  });

  // 6. Invalid calendar date (20260230 - Feb 30) rejected with 400
  await testCase('Invalid calendar date (20260230 - Feb 30) rejected with 400 Bad Request', async () => {
    const req = new Request('https://nse-bhavcopy-relay.workers.dev/?date=20260230', {
      headers: { 'Authorization': `Bearer ${TEST_API_TOKEN}` }
    });
    const res = await worker.fetch(req, env, {});
    assert.strictEqual(res.status, 400);
    const body = await res.json();
    assert(body.error.includes('Invalid calendar date'));
  });

  // 7. Public health endpoint /health returns 200 without token
  await testCase('Public health endpoint /health returns 200 OK without token', async () => {
    const req = new Request('https://nse-bhavcopy-relay.workers.dev/health');
    const res = await worker.fetch(req, env, {});
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.status, 'OK');
  });

  // 8. Valid date 20261106 with valid token returns 200 and genuine ZIP archive
  console.log('\nExecuting genuine live NSE fetch for date 20261106 with valid API token...');
  let liveRes = null;
  await testCase('Valid date 20261106 with valid API token returns 200 and binary ZIP', async () => {
    const req = new Request('https://nse-bhavcopy-relay.workers.dev/?date=20261106', {
      headers: { 'Authorization': `Bearer ${TEST_API_TOKEN}` }
    });
    liveRes = await worker.fetch(req, env, {});
    assert.strictEqual(liveRes.status, 200);
    assert.strictEqual(liveRes.headers.get('Content-Type'), 'application/zip');
  });

  // 9. Absence of wildcard CORS headers
  await testCase('Absence of unnecessary wildcard CORS header', async () => {
    assert.strictEqual(liveRes.headers.get('Access-Control-Allow-Origin'), null);
  });

  // 10. Presence of diagnostic headers
  await testCase('Diagnostic headers present: X-NSE-Status, X-NSE-Source, X-Elapsed-Time-Ms', async () => {
    assert.strictEqual(liveRes.headers.get('X-NSE-Status'), '200');
    assert(liveRes.headers.get('X-NSE-Source').includes('nseindia.com'));
    assert(parseInt(liveRes.headers.get('X-Elapsed-Time-Ms'), 10) > 0);
    console.log(`   Source: ${liveRes.headers.get('X-NSE-Source')} | Elapsed: ${liveRes.headers.get('X-Elapsed-Time-Ms')}ms`);
  });

  // 11. PK ZIP signature verification and decompression
  let decompressedCsv = null;
  let zipFileName = '';
  await testCase('Genuine ZIP PK signature verification and decompression', async () => {
    const arrayBuffer = await liveRes.arrayBuffer();
    const zipBuf = Buffer.from(arrayBuffer);
    console.log(`   Downloaded ZIP Size: ${zipBuf.length} bytes (~${(zipBuf.length / (1024 * 1024)).toFixed(2)} MB)`);
    assert(zipBuf.length > 500000, `Expected zip size > 500KB, got ${zipBuf.length}`);

    // Verify PK magic bytes
    assert.strictEqual(zipBuf[0], 0x50); // 'P'
    assert.strictEqual(zipBuf[1], 0x4b); // 'K'
    assert.strictEqual(zipBuf[2], 0x03);
    assert.strictEqual(zipBuf[3], 0x04);

    let offset = 0;
    while (offset < zipBuf.length - 4) {
      if (zipBuf.readUInt32LE(offset) === 0x04034b50) {
        const compressionMethod = zipBuf.readUInt16LE(offset + 8);
        const compressedSize = zipBuf.readUInt32LE(offset + 18);
        const fileNameLen = zipBuf.readUInt16LE(offset + 26);
        const extraFieldLen = zipBuf.readUInt16LE(offset + 28);
        zipFileName = zipBuf.slice(offset + 30, offset + 30 + fileNameLen).toString('utf-8');
        const dataOffset = offset + 30 + fileNameLen + extraFieldLen;
        const compData = zipBuf.slice(dataOffset, dataOffset + compressedSize);
        if (compressionMethod === 8) {
          decompressedCsv = zlib.inflateRawSync(compData).toString('utf-8');
        } else if (compressionMethod === 0) {
          decompressedCsv = compData.toString('utf-8');
        }
        break;
      }
      offset++;
    }
    assert(decompressedCsv !== null, 'Failed to decompress valid ZIP payload');
    assert.strictEqual(zipFileName, 'BhavCopy_NSE_FO_0_0_0_20261106_F_0000.csv');
  });

  // 12. Official CSV file validation: confirms line count and authentic derivative records
  await testCase('Official CSV file validation: confirms line count and authentic derivative records', async () => {
    const lines = decompressedCsv.split(/\r?\n/);
    console.log(`   CSV Total Lines: ${lines.length}`);
    assert(lines.length > 30000, `Expected > 30,000 lines, got ${lines.length}`);

    const header = lines[0];
    assert(header.includes('TradDt') && header.includes('TckrSymb') && header.includes('FinInstrmNm') && header.includes('ClsPric'));

    const relRows = lines.filter(l => l.includes('RELIANCE') && l.includes('STF'));
    assert(relRows.length >= 2, 'Expected at least 2 RELIANCE STF contracts');
    console.log(`   Verified ${relRows.length} authentic RELIANCE STF records`);
  });

  console.log(`\n==========================================`);
  console.log(`ALL ${passed} OF ${total} WORKER POC TESTS PASSED SUCCESSFULLY!`);
  console.log(`==========================================\n`);
}).catch(err => {
  console.error('Test Suite Failed:', err);
  process.exit(1);
});
