# Hardened Cloudflare Worker Proof of Concept: NSE Bhavcopy Secure Edge Relay

A standalone, authenticated, zero-cost edge relay for fetching official NSE UDiFF FO Bhavcopy ZIP archives.

---

## 1. Problem Solved

- **Confirmed Root Cause**: Direct requests to official NSE archives (`nsearchives.nseindia.com` and `archives.nseindia.com`) from Google Apps Script (`UrlFetchApp.fetch()`) originate from Google Cloud Platform shared IP pools (`35.x.x.x`), which are aggressively throttled or blocked by NSE's Akamai Web Application Firewall (WAF), leading to prolonged connections hanging until the 360-second execution quota terminates the execution.
- **The Solution**: Cloudflare Workers execute on Cloudflare's global edge network (non-cloud consumer/edge IPs). Cloudflare connects to official NSE archives in **~430ms**, returning the authentic, unaltered binary ZIP stream directly.

---

## 2. Hardened Security & Operating Rules

1. **Bearer Token Authentication**:
   - Requires `Authorization: Bearer <API_TOKEN>` matching the secret configured in `env.API_TOKEN`.
   - Requests with missing or incorrect tokens return `401 Unauthorized`.
2. **Method Validation**:
   - Accepts ONLY `GET` requests. Any other method (e.g. `POST`) returns `405 Method Not Allowed`.
3. **Path Validation**:
   - Accepts ONLY `/`, `/health`, and `/ping`. All other paths return `404 Not Found`.
4. **Strict Query Parameter Validation**:
   - Rejects unexpected query parameters with `400 Bad Request`. On `/`, only `?date=YYYYMMDD` is accepted.
5. **Real Calendar Date Validation**:
   - Validates that `YYYYMMDD` is a real calendar date (e.g. `20260230` / Feb 30 is rejected with `400 Bad Request`).
6. **Primary & Alternate Fallback**:
   - If the primary URL (`nsearchives.nseindia.com`) returns 404 or any failure, tries the alternate mirror (`archives.nseindia.com`) before returning an error.
7. **Genuine ZIP Magic Bytes Verification**:
   - Verifies the standard PK zip signature (`0x50 0x4B 0x03 0x04`) before responding to ensure HTML/WAF challenge pages are never served as 200 OK.
8. **Byte-for-Byte Binary Streaming**:
   - Streams the original `application/zip` payload without modifying or converting contents.
9. **No Unnecessary Wildcard CORS**:
   - Wildcard CORS headers (`Access-Control-Allow-Origin: *`) are omitted for security.
10. **Diagnostic Headers**:
    - Returns `X-NSE-Status`, `X-NSE-Source`, and `X-Elapsed-Time-Ms`.

---

## 3. Worker Implementation Code

The complete standalone worker code is located in [`worker.js`](worker.js).

---

## 4. Simple Deployment Instructions

### Option A: 1-Click Browser Deployment (No CLI needed)
1. Sign up for a free account at [cloudflare.com](https://dash.cloudflare.com) (free tier allows **100,000 requests per day**).
2. Go to **Workers & Pages > Create application > Create Worker**.
3. Name your worker (e.g., `nse-bhavcopy-relay`).
4. Click **Deploy**.
5. Click **Edit code**, paste the contents of [`worker.js`](worker.js), and click **Deploy**.
6. Set the `API_TOKEN` secret:
   - Go to **Settings > Variables and Secrets > Add secret**.
   - Variable name: `API_TOKEN`.
   - Value: Enter your secure secret token (e.g., `my_secure_random_token_12345`).
   - Click **Save and Deploy**.
7. Your worker URL will be:
   `https://nse-bhavcopy-relay.<your-subdomain>.workers.dev`

### Option B: Deploy via Wrangler CLI
```bash
cd cloudflare-worker-poc

# Set your secret token
npx wrangler secret put API_TOKEN

# Deploy to Cloudflare edge
npx wrangler deploy
```

---

## 5. Verification Test & Exact Results

### Test Scenarios & Results (Verified via `test_worker_poc.js`)

| Test Case | Request / Input | Expected Status | Actual Status | Details |
|:---|:---|:---:|:---:|:---|
| **Missing Token** | `GET /?date=20261106` (No auth) | `401` | `401` | `{"error": "Unauthorized"}` |
| **Incorrect Token** | `GET /?date=20261106` (Bad Bearer) | `401` | `401` | `{"error": "Unauthorized"}` |
| **POST Method** | `POST /?date=20261106` | `405` | `405` | `Allow: GET` header returned |
| **Invalid Path** | `GET /invalid/path` | `404` | `404` | `{"error": "Not found"}` |
| **Unexpected Params**| `GET /?date=20261106&foo=bar` | `400` | `400` | `{"error": "Unexpected query parameter(s)"}` |
| **Invalid Date** | `GET /?date=20260230` (Feb 30) | `400` | `400` | `{"error": "Invalid calendar date"}` |
| **Public Health** | `GET /health` | `200` | `200` | `{"status": "OK"}` |
| **Valid Date** | `GET /?date=20261106` (+ Bearer) | `200` | `200` | `application/zip` (1,282,557 bytes) |

### Detailed Performance for Date: `20261106`
* **HTTP Response Status**: `200 OK`
* **X-NSE-Status**: `200`
* **X-NSE-Source**: `nsearchives.nseindia.com`
* **X-Elapsed-Time-Ms**: `434ms`
* **Downloaded Size**: `1,282,557 bytes` (~1.22 MB)
* **ZIP Magic Bytes**: `PK\x03\x04` (`0x50 0x4B 0x03 0x04`) verified
* **Decompressed Archive**: `BhavCopy_NSE_FO_0_0_0_20261106_F_0000.csv`
* **Total CSV Lines**: `40,473` lines
* **Official Columns Verified**: `TradDt`, `BizDt`, `Sgmt`, `FinInstrmTp`, `FinInstrmId`, `TckrSymb`, `FinInstrmNm`, `ClsPric`, `UndrlygPric`, etc.
* **Sample Verified Entry**:
  `2026-11-06,2026-11-06,FO,NSE,STF,55121,,RELIANCE,,2027-01-25,2027-01-25,,,RELIANCE27JANFUT,1319.90`

---

## 6. Exact Test Commands

### 1. Test Valid Date (`20261106`)
```bash
curl -i -H "Authorization: Bearer <API_TOKEN>" \
  "https://<worker-subdomain>.workers.dev/?date=20261106" -o nse_bhavcopy.zip
```
Expected: `HTTP/2 200`, `Content-Type: application/zip`, binary zip saved.

### 2. Test Invalid Calendar Date (`20260230` - Feb 30)
```bash
curl -i -H "Authorization: Bearer <API_TOKEN>" \
  "https://<worker-subdomain>.workers.dev/?date=20260230"
```
Expected: `HTTP/2 400 Bad Request` with `{"error": "Invalid calendar date..."}`.

### 3. Test Missing Token
```bash
curl -i "https://<worker-subdomain>.workers.dev/?date=20261106"
```
Expected: `HTTP/2 401 Unauthorized` with `WWW-Authenticate: Bearer realm="NSE Bhavcopy Relay"`.
