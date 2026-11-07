# SA Automatic Futures Gap Analysis System

A fast, lightweight, fully automated Google Sheets + Google Apps Script system for NSE stock futures gap analysis.

---

## 1. Technical Diagnosis: UrlFetchApp vs Browser Download

### The Issue
- In standard web browsers (like Chrome), requesting NSE UDiFF archives from `nsearchives.nseindia.com` or `archives.nseindia.com` succeeds in <500ms.
- In Google Apps Script, direct `UrlFetchApp.fetch()` or `UrlFetchApp.fetchAll()` originates from Google Cloud Platform shared IP pools (such as `35.x.x.x`), which can be aggressively throttled, rate-limited, or blocked by NSE's Akamai Web Application Firewall (WAF), leading to prolonged connections hanging until the 360-second execution quota is exhausted.

### The Architectural Solution
1. **Cloudflare Worker Edge Relay Integration (`DataProvider.gs`)**:
   - `DataProvider.gs` dynamically reads `WORKER_URL` and `API_TOKEN` from Google Apps Script **Script Properties** (`PropertiesService.getScriptProperties()`).
   - If configured, requests are relayed via `GET {WORKER_URL}/?date={YYYYMMDD}` with header `Authorization: Bearer {API_TOKEN}`.
   - Tested and verified with live Worker endpoint:
     `https://sa-futures-gap-proxy.sudiptaadak199.workers.dev`
   - Bypasses Google Cloud IP throttling, fetching authentic NSE archives in **~400ms**.
   - If the worker is unconfigured or encounters a transient issue, the system gracefully falls back to direct official NSE archive endpoints.
2. **Strict Execution Time Budgeting & Safe Early Exit**:
   - `BackfillEngine.gs` and `SyncEngine.gs` enforce an explicit execution time budget of 240 seconds (`EXECUTION_TIME_BUDGET_MS = 240000`).
   - If a batch approaches the budget, it immediately stops processing new dates, checkpoints unreached dates in `PropertiesService`, and schedules an automated continuation trigger (`scheduledBackfillContinuation`) to resume safely in 60 seconds without timing out.
3. **URL Non-Repetition & Circuit Breakers**:
   - `DataProvider.gs` maintains an in-memory `_attemptedUrls` cache during script execution. A slow or hanging URL is **never** retried repeatedly within the same execution run.
   - If an endpoint times out twice, a circuit breaker trips (`STATUS.CIRCUIT_BROKEN`), failing fast to prevent hanging the rest of the batch.
4. **Elapsed Time & Diagnostic Logging**:
   - Every HTTP call logs its exact source endpoint, response code, and elapsed time in milliseconds to the `Logs` sheet (e.g. `[HTTP_DIAGNOSTIC] [CLOUDFLARE_WORKER_RELAY] Status 200 in 434ms`), providing complete audit visibility without ever leaking or logging the API token.
5. **Official Free Data Sources Only**:
   - Primary: Official NSE UDiFF FO Bhavcopy (`https://nsearchives.nseindia.com/content/fo/BhavCopy_NSE_FO_0_0_0_{YYYYMMDD}_F_0000.csv.zip`).
   - Alternate: Official NSE Archives FO Bhavcopy (`https://archives.nseindia.com/content/fo/BhavCopy_NSE_FO_0_0_0_{YYYYMMDD}_F_0000.csv.zip`).
   - Cash Market / Spot: Official NSE Sec Bhavdata (`sec_bhavdata_full_{DDMMYYYY}.csv`) and CM Bhavcopy archives.
   - Zero synthetic prices, zero fake symbols, and zero Yahoo Finance fallbacks.

---

## 2. Core Rule & User Experience

The user **ONLY** adds or changes stock symbols in the **Symbols** sheet (e.g. `RELIANCE`, `TCS`, `INFY`, `HDFCBANK`, `ICICIBANK`).
All other operations—historical backfill, dual contract mapping, expiry rollover, gap calculations, daily updates, error logs, starvation-free recovery, and trigger scheduling—are **100% automated** with zero manual intervention required.

**Note on Historical Backfill**:
The historical backfill is **not** started automatically upon project initialization. To start the historical backfill, the user manually initiates it from the custom menu:
**🚀 Futures Gap System > ⏳ Run Historical 6M Backfill**. Once approved and triggered, it automatically continues batches via safe time-driven triggers until complete.

---

## 3. Required Output Columns & Dual Contract Mapping

### A. Main Sheet: 'Futures Gap Analysis' (Original 10 Columns UNCHANGED)
| Column | Name | Formula / Description |
|---|---|---|
| A | **Date** | Trading date (`YYYY-MM-DD`) |
| B | **Symbol** | NSE Stock Symbol (e.g., `RELIANCE`) |
| C | **Spot Price** | Underlying Spot Close Price |
| D | **Current Future Price** | Near-month contract close price |
| E | **Next Future Price** | Far-month contract close price |
| F | **Current−Next Gap** | `Current Future − Next Future` |
| G | **Current−Next Gap %** | `(Current Future − Next Future) / Current Future × 100` |
| H | **Spot−Current Future Gap** | `Spot − Current Future` |
| I | **Spot-Future Gap %** | `(Spot − Current Future) / Spot × 100` |
| J | **Historical Expiry Date** | Expiration date of the Current Future contract (`YYYY-MM-DD`) |

### B. Dual Contract Mapping Sheet: 'Contract_Mapping' (Hidden Sheet)
| Column | Name | Description |
|---|---|---|
| 1 | **Date** | Historical trading date (`YYYY-MM-DD`) |
| 2 | **Symbol** | Stock symbol |
| 3 | **Current Contract Symbol** | Near-month contract official identifier (strictly from `FinInstrmNm`) |
| 4 | **Current Expiry Date** | Near-month contract expiry (`YYYY-MM-DD`) |
| 5 | **Next Contract Symbol** | Far-month contract official identifier (strictly from `FinInstrmNm`) |
| 6 | **Next Expiry Date** | Far-month contract expiry (`YYYY-MM-DD`) |
| 7 | **Current Futures Price** | Near-month contract closing price (`ClsPric`) |
| 8 | **Next Futures Price** | Far-month contract closing price (`ClsPric`) |
| 9 | **Last Updated** | Timestamp of record write |
| 10 | **Data Status** | Record completeness status (`COMPLETE` vs `INCOMPLETE`) |

---

## 4. Closing Price vs Settlement Price Policy

* **Futures Price Field Used**: Official Futures Closing Price (`ClsPric` in UDiFF / `CLOSE` in legacy).
* **No Silent Substitution**: The system **never** silently substitutes Settlement Price (`SttlmPric`) for Closing Price.
* **Missing Closing Price Handling**: If `ClsPric` is missing or `<= 0`, the record's `closePrice` remains `null`. The mapping is marked `INCOMPLETE` and retained for subsequent recovery cycles.

---

## 5. Contract Identifier Extraction & Strict Completeness

* **Actual NSE Contract Identifiers**: Extracted directly from official `FinInstrmNm` (e.g. `RELIANCE26MAYFUT`, `TCS26JUNFUT`). Identifiers are never guessed or synthesized from tickers and expiry dates. Numeric `FinInstrmId` is stored separately and never substituted for `FinInstrmNm`. Blank contract symbols are strictly rejected.
* **Distinct Expiries**: Current and Next contracts must have distinct expiry dates (`Current Expiry < Next Expiry`).
* **Strict Completeness**: A record is considered complete **only when Spot > 0, Current Future ClsPric > 0, Next Future ClsPric > 0, and both contract symbols are non-blank actual FinInstrmNm**. Incomplete records are rejected and never saved to the main sheet.

---

## 6. Standalone Google Apps Script Integration Test (`IntegrationTest.gs`)

`IntegrationTest.gs` provides an isolated, standalone end-to-end integration test for the hardened Cloudflare Worker without modifying production pipeline files or installing triggers:

### Setup Instructions for Script Properties:
1. Open Google Sheets > **Extensions > Apps Script**.
2. Click **Project Settings** (gear icon on the left sidebar).
3. Scroll down to **Script Properties** and click **Add script property**:
   - **Property**: `WORKER_URL`
   - **Value**: `https://sa-futures-gap-proxy.sudiptaadak199.workers.dev`
   - Click **Add script property** again:
   - **Property**: `API_TOKEN`
   - **Value**: `<your-secure-token>` (matching `env.API_TOKEN` in Cloudflare)
4. Click **Save script properties**.
5. In the Apps Script code editor toolbar, select `testCloudflareWorkerIntegration` from the function dropdown.
6. Click **Run**.

---

## 7. Remaining Limitations

1. **Legacy Format Contract Identifiers**: Historical derivative bhavcopies prior to the NSE UDiFF transition (pre-July 2024) do not publish `FinInstrmNm`. In strict adherence to our zero-synthetic-identifier policy, legacy records without actual contract names cannot be marked `COMPLETE` and remain `INCOMPLETE`.
2. **Intraday Live Ticks**: This system is designed for End-of-Day (EOD) Bhavcopy analysis. NSE publishes official EOD Bhavcopy archives each trading day between 18:00 and 19:30 IST. Prior to file publication on the current trading day, the status is marked `UNPUBLISHED` and evaluated on the 18:30 IST trigger.
3. **Google Apps Script Triggers Quota**: Google accounts have a limit of 20 total active triggers per user. The system maintains clean trigger hygiene, keeping at most 1 daily trigger and 1 transient continuation trigger.

---

## 8. Setup & Installation Instructions

1. Open [Google Sheets](https://sheets.new) and create a new blank spreadsheet.
2. Go to **Extensions > Apps Script**.
3. Copy all files from `sa-futures-gap-system/` (or extract `sa-futures-gap-system.zip`) into the Apps Script editor:
   - `appsscript.json` (Project Settings)
   - `Config.gs`
   - `Utils.gs`
   - `DataProvider.gs`
   - `ContractMapper.gs`
   - `GapEngine.gs`
   - `SheetManager.gs`
   - `BackfillEngine.gs`
   - `SyncEngine.gs`
   - `Triggers.gs`
   - `Main.gs`
   - `IntegrationTest.gs`
4. Configure Script Properties under Project Settings:
   - `WORKER_URL`: `https://sa-futures-gap-proxy.sudiptaadak199.workers.dev`
   - `API_TOKEN`: `<your-token>`
5. Click **Save** (`Ctrl+S`).
6. In the function dropdown, select `InitializeProject` and click **Run**.
7. Grant permissions when prompted. The script will:
   - Create and format the tabs (`Symbols`, `Futures Gap Analysis`, `Contract_Mapping`, `Dashboard`, `Settings`, `Logs`).
   - Setup the daily automated 18:30 IST time-driven trigger.
   - Populate default symbols and render the dashboard.
8. To run the historical 6-month backfill when ready, use the custom menu:
   - **🚀 Futures Gap System > ⏳ Run Historical 6M Backfill**
   - The backfill will automatically chain continuation triggers until 100% complete.
9. Add your custom symbols into the `Symbols` tab; the system detects additions automatically and handles the rest.
