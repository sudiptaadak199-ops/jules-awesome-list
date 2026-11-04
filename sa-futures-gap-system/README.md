# SA Automatic Futures Gap Analysis System

A fast, lightweight, fully automated Google Sheets + Google Apps Script system for NSE stock futures gap analysis.

---

## 1. Core Rule & User Experience

The user **ONLY** adds or changes stock symbols in the **Symbols** sheet (e.g. `RELIANCE`, `TCS`, `INFY`, `HDFCBANK`, `ICICIBANK`).
All other operations—historical backfill, dual contract mapping, expiry rollover, gap calculations, daily updates, error logs, starvation-free recovery, and trigger scheduling—are **100% automated** with zero manual intervention required.

---

## 2. Free Data Sources & Historical Integrity

* **Primary Modern FO Data**: Official NSE UDiFF FO Bhavcopy (`BhavCopy_NSE_FO_0_0_0_YYYYMMDD_F_0000.csv.zip`) from official archives.
* **Legacy FO Data**: Official historical NSE derivatives bhavcopy (`foDDMMMYYYYbhav.csv.zip`) for dates prior to the UDiFF migration.
* **Spot Price Integrity**: Spot prices are strictly historical as of each historical trade date. They are extracted directly from the official Bhavcopy `UndrlygPric` field or official NSE Cash Market Bhavcopy (`sec_bhavdata_full_ddMMyyyy.csv` / `cm bhavcopy`).
* **Zero Fabrication / No Current Price Fallback**: Yahoo regularMarketPrice current quote fallback was completely eliminated. The system **never** uses today's price for past dates and **never** substitutes 0 for missing data.
* **Shared Daily Download**: Each daily Bhavcopy is downloaded **only once per date**, and shared across all active symbols in execution memory, saving bandwidth and Google Apps Script execution time.

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
| 3 | **Current Contract Symbol** | Near-month contract trading symbol (e.g., `RELIANCE26MAYFUT`) |
| 4 | **Current Expiry Date** | Near-month contract expiry (`YYYY-MM-DD`) |
| 5 | **Next Contract Symbol** | Far-month contract trading symbol (e.g., `RELIANCE26JUNFUT`) |
| 6 | **Next Expiry Date** | Far-month contract expiry (`YYYY-MM-DD`) |
| 7 | **Current Futures Price** | Near-month contract close price |
| 8 | **Next Futures Price** | Far-month contract close price |
| 9 | **Last Updated** | Timestamp of record write |
| 10 | **Data Status** | Record completeness status (`COMPLETE`) |

- **Strict Completeness & Dual Synchronization**: Both sheets are updated simultaneously. Records are treated as complete only when Spot > 0, Current Future > 0, and Next Future > 0. Incomplete records are rejected and never permanently stored.
- Missing values remain blank or null; never substituted with 0.

---

## 4. Starvation-Free Recovery & Execution Architecture

- **Queue Rotation & Starvation Prevention**: In `BackfillEngine.gs`, transiently failing dates are rotated to the end of the queue so they never block subsequent dates.
- **Cursor Pagination & Exponential Backoff**: In `SyncEngine.recoverMissingDates`, a persistent circular cursor offset ensures missing dates are processed round-robin. Failing dates enter an exponential backoff cool-down (up to 24h) to avoid wasteful re-fetching while allowing remaining missing dates to proceed.
- **Resumable Auto-Continuing Batches**: Checkpoints in `PropertiesService` combined with single-execution continuation triggers (`ScriptApp.newTrigger().after(60000)`) allow large historical runs to resume automatically without human intervention.
- **Confirmed Holidays vs Archive 404 Distinction**:
  - `HOLIDAY`: Confirmed weekend or official NSE Holiday Master calendar entry.
  - `ARCHIVE_UNAVAILABLE`: An HTTP 404 on an expected trading weekday is **not** assumed to be a holiday. It is preserved in the recovery queue.
  - `UNPUBLISHED`: Current trading day file not yet released; queued for the next scheduled trigger.

---

## 5. Live Rolling 6-Month NSE Probe (May 4, 2026 – Nov 4, 2026)

A genuine historical NSE probe covering every weekday across the rolling 6-month window (May 4, 2026 to Nov 4, 2026) was executed against the official NSE UDiFF archives across the 5 default symbols (`RELIANCE`, `TCS`, `INFY`, `HDFCBANK`, `ICICIBANK`).

### Probe Statistics:
* **Total Weekdays Evaluated**: 133
* **Confirmed Official NSE Holidays**: 5
  - `2026-05-28`: Bakri Id
  - `2026-06-26`: Muharram
  - `2026-09-14`: Ganesh Chaturthi
  - `2026-10-02`: Mahatma Gandhi Jayanti
  - `2026-10-20`: Dussehra
  *(Note: Maharashtra Day May 1 and Independence Day Aug 15 fell on non-trading/weekend days)*
* **Expected Trading Days**: 128
* **Bhavcopy Archives Successfully Downloaded**: 128 / 128 (100.0%)
* **Bhavcopy Archives Missing**: 0
* **Total Potential Symbol Records**: 640 (128 trading days × 5 symbols)
* **Successful COMPLETE Records (Valid Spot + CurFut + NxtFut)**: 640
* **Incomplete Records**: 0
* **Failed / Missing Records**: 0
* **Actual Historical Coverage**: **100.00%** (640 / 640)

Detailed evidence is saved in:
- `live_probe_results.csv` (all 640 records with spot, futures, symbols, expiries)
- `live_probe_summary.json` (machine-readable metrics)

---

## 6. Remaining Limitations

1. **Intraday Live Ticks**: This system is designed for End-of-Day (EOD) Bhavcopy analysis. NSE publishes official EOD Bhavcopy archives each trading day between 18:00 and 19:30 IST. Prior to file publication on the current trading day, the status is marked `UNPUBLISHED` and evaluated on the 18:30 IST trigger.
2. **Newly Listed F&O Stocks**: Stocks newly admitted to the F&O segment within the last 6 months will only have records starting from their official F&O inclusion date.
3. **Google Apps Script Triggers Quota**: Google accounts have a limit of 20 total active triggers per user. The system maintains clean trigger hygiene, keeping at most 1 daily trigger and 1 transient continuation trigger.

---

## 7. Setup & Installation Instructions

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
4. Click **Save** (`Ctrl+S`).
5. In the function dropdown, select `InitializeProject` and click **Run**.
6. Grant permissions when prompted. The script will:
   - Create and format the tabs (`Symbols`, `Futures Gap Analysis`, `Contract_Mapping`, `Dashboard`, `Settings`, `Logs`).
   - Setup the daily automated 18:30 IST time-driven trigger.
   - Populate default symbols and render the dashboard.
7. To run the historical 6-month backfill, use the custom menu:
   - **🚀 Futures Gap System > ⏳ Run Historical 6M Backfill**
   - The backfill will automatically chain continuation triggers until 100% complete.
8. Add your custom symbols into the `Symbols` tab; the system detects additions automatically and handles the rest.
