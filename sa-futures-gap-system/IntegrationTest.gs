/**
 * SA Automatic Futures Gap Analysis System
 * IntegrationTest.gs - Standalone Google Apps Script integration test for the hardened Cloudflare Worker.
 *
 * IMPORTANT:
 * - This is an isolated integration test file.
 * - Does NOT modify any production files (DataProvider.gs, BackfillEngine.gs, etc.).
 * - Does NOT install triggers or modify production sheets.
 * - Reads WORKER_URL and API_TOKEN securely from Script Properties.
 * - NEVER hardcodes, exposes, or logs API_TOKEN.
 *
 * Setup Instructions:
 * 1. Open Google Sheets > Extensions > Apps Script.
 * 2. In Project Settings (gear icon) > Script Properties > Add script property:
 *    - Property: WORKER_URL -> Value: https://<your-worker-subdomain>.workers.dev
 *    - Property: API_TOKEN  -> Value: <your-secure-token>
 * 3. Select function `testCloudflareWorkerIntegration` from the editor toolbar and click Run.
 */

function testCloudflareWorkerIntegration() {
  Logger.log('=== STARTING CLOUDFLARE WORKER GAS INTEGRATION TEST ===');

  // 1. Read Worker URL and API_TOKEN from Script Properties
  var scriptProperties = PropertiesService.getScriptProperties();
  var rawWorkerUrl = scriptProperties.getProperty('WORKER_URL');
  var apiToken = scriptProperties.getProperty('API_TOKEN');

  if (!rawWorkerUrl || !rawWorkerUrl.trim()) {
    Logger.log('[FAIL] Missing Script Property: "WORKER_URL". Please add it in Project Settings > Script Properties.');
    return { success: false, error: 'Missing WORKER_URL property' };
  }

  if (!apiToken || !apiToken.trim()) {
    Logger.log('[FAIL] Missing Script Property: "API_TOKEN". Please add it in Project Settings > Script Properties.');
    return { success: false, error: 'Missing API_TOKEN property' };
  }

  var trimmedWorkerUrl = rawWorkerUrl.trim();

  // 2. Validate that WORKER_URL uses HTTPS before making the request
  if (!/^https:\/\//i.test(trimmedWorkerUrl)) {
    Logger.log('[FAIL] Insecure or invalid WORKER_URL: URL must strictly use HTTPS protocol.');
    return { success: false, error: 'WORKER_URL must use HTTPS protocol' };
  }

  // Sanitize URL (strip trailing slash)
  var workerBaseUrl = trimmedWorkerUrl.replace(/\/+$/, '');
  var testDate = '20261106';
  var requestUrl = workerBaseUrl + '/?date=' + testDate;

  Logger.log('Target URL: ' + requestUrl);
  Logger.log('Auth: Bearer token provided (credentials concealed)');

  // 3. Send authenticated GET request for date 20261106
  var options = {
    method: 'get',
    muteHttpExceptions: true,
    headers: {
      'Authorization': 'Bearer ' + apiToken.trim(),
      'Accept': 'application/zip'
    }
  };

  var startTime = new Date().getTime();
  var response = null;

  try {
    response = UrlFetchApp.fetch(requestUrl, options);
  } catch (e) {
    var errElapsed = new Date().getTime() - startTime;
    // Ensure error message does not leak tokens
    var safeErrorMsg = (e.message || 'Network fetch error').replace(/Bearer\s+[A-Za-z0-9_.~+-]+/gi, 'Bearer [REDACTED]');
    Logger.log('[FAIL] Fetch threw exception after ' + errElapsed + 'ms: ' + safeErrorMsg);
    return { success: false, error: safeErrorMsg, elapsedMs: errElapsed };
  }

  var elapsedMs = new Date().getTime() - startTime;
  var statusCode = response.getResponseCode();
  var headers = response.getHeaders();
  var contentType = headers['Content-Type'] || headers['content-type'] || '';

  Logger.log('Response Status: ' + statusCode);
  Logger.log('Elapsed Time: ' + elapsedMs + 'ms');
  Logger.log('Content-Type: ' + contentType);

  // 4. Verify HTTP status 200 (Do not log response body to avoid leaking sensitive information)
  if (statusCode !== 200) {
    Logger.log('[FAIL] Expected status 200, got: ' + statusCode);
    return { success: false, statusCode: statusCode, error: 'Non-200 status code', elapsedMs: elapsedMs };
  }

  // 5. Verify Content-Type application/zip
  if (contentType.toLowerCase().indexOf('zip') === -1) {
    Logger.log('[FAIL] Expected Content-Type containing zip, got: ' + contentType);
    return { success: false, error: 'Invalid Content-Type', contentType: contentType, elapsedMs: elapsedMs };
  }

  // 6. Verify response starts with valid PK ZIP signature (0x50, 0x4B, 0x03, 0x04)
  var blob = response.getBlob();
  var bytes = blob.getBytes();
  var sizeBytes = bytes.length;
  var sizeMB = (sizeBytes / (1024 * 1024)).toFixed(2);

  Logger.log('Download Size: ' + sizeBytes + ' bytes (~' + sizeMB + ' MB)');

  if (sizeBytes < 4) {
    Logger.log('[FAIL] Response payload too small for a ZIP file: ' + sizeBytes + ' bytes');
    return { success: false, error: 'Payload too small', elapsedMs: elapsedMs };
  }

  if (bytes[0] !== 0x50 || bytes[1] !== 0x4B || bytes[2] !== 0x03 || bytes[3] !== 0x04) {
    Logger.log('[FAIL] Invalid ZIP magic bytes. Expected [0x50, 0x4B, 0x03, 0x04], got: [' +
      bytes[0] + ', ' + bytes[1] + ', ' + bytes[2] + ', ' + bytes[3] + ']');
    return { success: false, error: 'Invalid ZIP signature', elapsedMs: elapsedMs };
  }
  Logger.log('[PASS] Valid PK ZIP magic bytes signature confirmed.');

  // 7. Decompress using Utilities.unzip()
  var unzippedBlobs = null;
  try {
    unzippedBlobs = Utilities.unzip(blob);
  } catch (unzipErr) {
    Logger.log('[FAIL] Utilities.unzip() threw error: ' + unzipErr.message);
    return { success: false, error: unzipErr.message, elapsedMs: elapsedMs };
  }

  if (!unzippedBlobs || unzippedBlobs.length === 0) {
    Logger.log('[FAIL] Decompressed archive is empty.');
    return { success: false, error: 'Empty decompressed archive', elapsedMs: elapsedMs };
  }

  var csvBlob = unzippedBlobs[0];
  var csvFileName = csvBlob.getName();
  Logger.log('Extracted File: ' + csvFileName);

  // 8. Verify official CSV filename: BhavCopy_NSE_FO_0_0_0_20261106_F_0000.csv
  var expectedFileName = 'BhavCopy_NSE_FO_0_0_0_' + testDate + '_F_0000.csv';
  if (csvFileName !== expectedFileName) {
    Logger.log('[FAIL] Expected filename "' + expectedFileName + '", got: "' + csvFileName + '"');
    return { success: false, error: 'Unexpected CSV filename', actual: csvFileName, expected: expectedFileName };
  }
  Logger.log('[PASS] Verified official CSV filename matches: ' + expectedFileName);

  // 9. Read CSV header and identify exact column indexes for TckrSymb and FinInstrmNm
  var csvText = csvBlob.getDataAsString();
  var lines = csvText.split(/\r?\n/);
  Logger.log('CSV Line Count: ' + lines.length);

  if (lines.length < 2) {
    Logger.log('[FAIL] CSV file has insufficient lines: ' + lines.length);
    return { success: false, error: 'Insufficient CSV lines' };
  }

  var headerLine = lines[0].trim();
  var headers = headerLine.split(',').map(function(h) { return h.trim(); });

  var tckrSymbIdx = headers.indexOf('TckrSymb');
  var finInstrmNmIdx = headers.indexOf('FinInstrmNm');

  if (tckrSymbIdx === -1) {
    Logger.log('[FAIL] Missing mandatory header column: TckrSymb');
    return { success: false, error: 'Missing header: TckrSymb' };
  }

  if (finInstrmNmIdx === -1) {
    Logger.log('[FAIL] Missing mandatory header column: FinInstrmNm');
    return { success: false, error: 'Missing header: FinInstrmNm' };
  }

  Logger.log('[PASS] Identified exact header column indexes: TckrSymb=' + tckrSymbIdx + ', FinInstrmNm=' + finInstrmNmIdx);

  // 10. Verify at least one row where TckrSymb = RELIANCE and FinInstrmNm = FUTSTK (without arbitrary substring matching)
  var relianceFutMatchCount = 0;
  var sampleMatchedLine = '';

  for (var r = 1; r < lines.length; r++) {
    var rawLine = lines[r].trim();
    if (!rawLine) continue;

    var cols = rawLine.split(',').map(function(c) { return c.trim(); });
    var sym = (cols[tckrSymbIdx] || '').toUpperCase();
    var instNm = (cols[finInstrmNmIdx] || '').toUpperCase();

    // Verify row where TckrSymb is RELIANCE and FinInstrmNm is strictly FUTSTK
    if (sym === 'RELIANCE' && instNm === 'FUTSTK') {
      relianceFutMatchCount++;
      if (!sampleMatchedLine) {
        sampleMatchedLine = rawLine;
      }
    }
  }

  Logger.log('Verified RELIANCE futures records count: ' + relianceFutMatchCount);
  if (relianceFutMatchCount === 0) {
    Logger.log('[FAIL] No matching row found where TckrSymb = RELIANCE and FinInstrmNm = FUTSTK.');
    return { success: false, error: 'Missing RELIANCE FUTSTK records' };
  }

  Logger.log('Sample Matched Record: ' + sampleMatchedLine.slice(0, 150));
  Logger.log('[PASS] Exact column index validation succeeded for RELIANCE futures.');

  Logger.log('=== CLOUDFLARE WORKER GAS INTEGRATION TEST PASSED ===');
  return {
    success: true,
    statusCode: 200,
    downloadSizeBytes: sizeBytes,
    downloadSizeMB: sizeMB,
    elapsedMs: elapsedMs,
    fileName: csvFileName,
    lineCount: lines.length,
    relianceContracts: relianceFutMatchCount
  };
}
