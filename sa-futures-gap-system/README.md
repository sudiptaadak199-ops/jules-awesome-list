# SA Automatic Futures Gap Analysis System

A fast, lightweight, fully automated Google Sheets + Google Apps Script system for NSE stock futures gap analysis.

---

## 1. Core Rule & User Experience

The user **ONLY** adds or changes stock symbols in the **Symbols** sheet (e.g. `RELIANCE`, `TCS`, `INFY`, `HDFCBANK`).
All other operations—historical backfill, contract mapping, expiry rollover, gap calculations, daily updates, error logs, and recovery—are **100% automated** with minimal manual maintenance.

---

## 2. Free Data Sources

* **Primary Modern FO Data**: Official NSE UDiFF FO Bhavcopy (`BhavCopy_NSE_FO_0_0_0_YYYYMMDD_F_0000.csv.zip`) from official archives.
* **Legacy FO Data**: Official historical NSE derivatives bhavcopy (`foDDMMMYYYYbhav.csv.zip`) for dates prior to the UDiFF migration.
* **Spot Price**: Parsed directly from the official Bhavcopy `UndrlygPric` field, or official NSE Cash Market Bhavcopy (`sec_bhavdata_full_ddMMyyyy.csv`), with a free Yahoo Finance Chart API (`query1.finance.yahoo.com`) fallback.
* **Zero Cost**: No paid API, broker subscription, or third-party paid key is required.
* **Shared Daily Download**: Each daily Bhavcopy is downloaded **only once per date**, and shared across all active symbols in execution memory, saving bandwidth and execution time.

---

## 3. Required Output Columns & Exact Formulas

The **Futures Gap Analysis** sheet contains the exact 10 required columns:

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

### Missing Data & Zero Safety Rule
- Never substitutes `0` for missing data. Missing values remain blank or null.
- Division by zero is safeguarded (if Current Future or Spot is 0, percentage gap outputs null instead of error).

---

## 4. Historical Contract Mapping & Expiry Rollover

- **Accurate Historical Mapping**: Contracts are evaluated **as of each historical date**. Past records preserve the exact contracts that were active on that date.
- **Rollover Logic**: On any historical trading day up to the expiry date (`tradeDate <= Expiry Date`), the near-month contract is selected as Current. On the next trading day (`tradeDate > Expiry Date`), the expired contract drops off, and the next contract automatically rolls over to become the Current Future.

---

## 5. Speed, Efficiency & Apps Script Quotas

- **Resumable Batches**: 6-month historical backfill (~125-130 trading days) is broken into quota-friendly batches (default 15 days/batch) checkpointed in `PropertiesService` to comfortably stay within Apps Script's 6-minute execution limit.
- **Deduplication**: Records are uniquely keyed by `Date + Symbol + Contract/Expiry`. Existing records are never duplicated.
- **Auto Recovery**: Automatically checks past trading days and recovers any missing dates on subsequent runs.
- **Automated Daily Trigger**: Configured to run automatically at 18:30 IST every trading day after NSE markets close.

---

## 6. Setup & Installation Instructions

1. Open [Google Sheets](https://sheets.new) and create a new blank spreadsheet.
2. Go to **Extensions > Apps Script**.
3. Copy all files from `sa-futures-gap-system/` into the Apps Script editor:
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
   - Create and format the tabs (`Symbols`, `Futures Gap Analysis`, `Dashboard`, `Settings`, `Logs`).
   - Setup the daily automated 18:30 IST time-driven trigger.
   - Populate default symbols and render the dashboard.
7. To run the historical 6-month backfill, use the custom menu:
   - **🚀 Futures Gap System > ⏳ Run Historical 6M Backfill**
8. Add your custom symbols into the `Symbols` tab; the system detects additions automatically and handles the rest!
