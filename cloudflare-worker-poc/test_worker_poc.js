/**
 * cloudflare-worker-poc/test_worker_poc.js
 *
 * Tests the Cloudflare Worker PoC logic and verifies:
 * 1. Date parameter validation and non-URL acceptance.
 * 2. Real fetch to official NSE archive for date 20261106.
 * 3. HTTP response status 200, elapsed time, and byte size.
 * 4. Genuine ZIP decompression and verification of CSV file content and fields.
 */

const assert = require('assert');
const zlib = require('zlib');
const fs = require('fs');

// Import the worker fetch handler
import('./worker.js').then(async (workerModule) => {
  const worker = workerModule.default;

  console.log('=== STARTING CLOUDFLARE WORKER POC VERIFICATION (DATE: 20261106) ===');

  // Test 1: Reject missing date
  const reqMissing = new Request('https://nse-bhavcopy-relay.workers.dev/');
  const resMissing = await worker.fetch(reqMissing, {}, {});
  assert.strictEqual(resMissing.status, 400);
  console.log('[PASS] Test 1: Rejects missing date with 400 Bad Request');

  // Test 2: Reject invalid date format (non-8 digits)
  const reqBad = new Request('https://nse-bhavcopy-relay.workers.dev/?date=invalid-date');
  const resBad = await worker.fetch(reqBad, {}, {});
  assert.strictEqual(resBad.status, 400);
  console.log('[PASS] Test 2: Rejects arbitrary / non-8-digit date with 400 Bad Request');

  // Test 3: Reject arbitrary external URL query injection
  const reqInjection = new Request('https://nse-bhavcopy-relay.workers.dev/?url=http://example.com');
  const resInjection = await worker.fetch(reqInjection, {}, {});
  assert.strictEqual(resInjection.status, 400);
  console.log('[PASS] Test 3: Rejects external URL parameter (not an open proxy)');

  // Test 4: Genuine Live Fetch for date 20261106
  console.log('Initiating fetch for date=20261106...');
  const t0 = Date.now();
  const reqLive = new Request('https://nse-bhavcopy-relay.workers.dev/?date=20261106');
  const resLive = await worker.fetch(reqLive, {}, {});
  const elapsed = Date.now() - t0;

  console.log(`Response Status:      ${resLive.status}`);
  console.log(`X-NSE-Status:         ${resLive.headers.get('X-NSE-Status')}`);
  console.log(`X-NSE-Source:         ${resLive.headers.get('X-NSE-Source')}`);
  console.log(`X-Elapsed-Time-Ms:    ${resLive.headers.get('X-Elapsed-Time-Ms')}ms`);
  console.log(`Content-Type:         ${resLive.headers.get('Content-Type')}`);
  console.log(`Content-Disposition:  ${resLive.headers.get('Content-Disposition')}`);

  assert.strictEqual(resLive.status, 200, `Expected status 200, got ${resLive.status}`);
  assert.strictEqual(resLive.headers.get('Content-Type'), 'application/zip');
  assert.strictEqual(resLive.headers.get('X-NSE-Status'), '200');

  // Test 5: Validate Binary Payload and Decompress ZIP
  const arrayBuffer = await resLive.arrayBuffer();
  const zipBuf = Buffer.from(arrayBuffer);
  console.log(`Downloaded ZIP Size:  ${zipBuf.length} bytes (~${(zipBuf.length / (1024 * 1024)).toFixed(2)} MB)`);
  assert(zipBuf.length > 500000, `Expected zip size > 500KB, got ${zipBuf.length}`);

  // Decompress ZIP using native unzipping
  let offset = 0;
  let decompressedCsv = null;
  let zipFileName = '';

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

  assert(decompressedCsv, 'Failed to decompress ZIP payload');
  console.log(`Decompressed File:    ${zipFileName}`);
  assert.strictEqual(zipFileName, 'BhavCopy_NSE_FO_0_0_0_20261106_F_0000.csv');

  // Test 6: Verify CSV Content and Official UDiFF Headers
  const lines = decompressedCsv.split(/\r?\n/);
  console.log(`CSV Total Lines:      ${lines.length}`);
  const header = lines[0];
  console.log(`Header:               ${header.slice(0, 100)}...`);

  assert(header.includes('TradDt') && header.includes('TckrSymb') && header.includes('FinInstrmNm') && header.includes('ClsPric'),
    'CSV missing mandatory official NSE UDiFF columns');

  // Verify sample stock records (e.g. RELIANCE, TCS, INFY)
  const relianceRows = lines.filter(l => l.includes('RELIANCE') && l.includes('STF'));
  console.log(`RELIANCE STF rows:    ${relianceRows.length}`);
  assert(relianceRows.length >= 2, 'Expected at least 2 RELIANCE STF contracts');
  console.log('Sample RELIANCE line:', relianceRows[0].split(',').slice(0, 15).join(','));

  console.log('\n==========================================');
  console.log('CLOUDFLARE WORKER POC VALIDATION 100% SUCCESSFUL!');
  console.log('==========================================\n');
}).catch(err => {
  console.error('Test Failed:', err);
  process.exit(1);
});
