# SA Stock Research & Backtest Platform (Phase 1 - Foundation)

Welcome to the **SA Stock Research & Backtest Platform**! This is the Phase 1 Foundation release. This codebase establishes an enterprise-grade, high-performance, modular architectural backbone on top of Google Sheets using Google Apps Script (GAS) to power professional stock analytics, data feeds, strategy metrics, and backtesting simulations.

---

## 📂 Project Structure

The project code is divided into modular, specialized files located within the `sa-stock-platform/` directory:

1. **`appsscript.json`**
   - The manifest file declaring runtime metadata, timezone (`Asia/Kolkata`), and required standard execution scopes.
2. **`Config.js`**
   - Central repository for constants, active sheets naming, a curated "Cool Tech Theme" professional color palette, and default fallback system settings. **Zero Hardcoding.**
3. **`Utilities.js`**
   - Safe utility helpers, date string formatters, and custom retry runners to encapsulate single responsibilities.
4. **`ErrorHandler.js`**
   - Decoupled error handler for classifying, wrapping, and reporting errors so we never stop execution because of a single stock failure.
5. **`SheetManager.js`**
   - The spreadsheet operations controller. It manages auto-creation of database sheets, professional column styling, frozen header boundaries, and batch read/write blocks to minimize spreadsheet interactions and ensure optimal execution speed.
6. **`Settings.js`**
   - A robust configuration loading layer. Loads settings from the `Settings` sheet, caches them in run-time execution memory to prevent recurring read-overhead, and supports type-safe parsed getters (`getNum()`, `getBool()`) and live cell-targeted setting overrides.
7. **`Logger.js`**
   - A highly performant structured execution logger. Keeps track of running execution statistics (function names, status, duration, errors) and buffers logs locally, flushing them onto the spreadsheet database in a single high-efficiency bulk operation upon completion.
8. **`Cache.js`**
   - A reusable, persistent sheet-backed key-value cache system complete with configurable TTL (Time to Live) expiration controls. Ideal for caching high-latency stock API response footprints. Bypasses automatically if caching is disabled.
9. **`DataProvider.js`**
   - A decoupled market data ingestion provider, outlining complete Yahoo Finance and NSE India ingestion paths.
10. **`StrategyEngine.js`**
    - Analytical strategy executor for Moving Averages, breakout patterns, CPR, Pivot Points, and multi-timeframe analysis.
11. **`ReportEngine.js`**
    - Reporting suite managing dynamic performance metrics compilation, dashboard charts rendering, AI analysis summaries, and Markdown exporting for Obsidian.
12. **`Menu.js`**
    - Binds platform execution routines to Google Sheets UI menu items ("SA Platform"), streamlining control and configuration workflows, including the primary entry point `InitializeProject()`.
13. **`Main.js`**
    - The core platform Orchestrator. Defines top-level workflows and wraps processes in error-resistant boundaries so that an individual stock error logs a neat warning block but *never* terminates the entire process execution.

---

## 🛠️ Step-by-Step Copy-Paste Installation Guide

Follow these steps to copy and deploy the platform inside your personal Google Account:

### Step 1: Create a New Google Sheet
1. Navigate to [Google Sheets](https://sheets.google.com).
2. Create a blank spreadsheet and name it (e.g., `My SA Stock Platform`).

### Step 2: Open the Apps Script Editor
1. In your newly created spreadsheet, click on the **Extensions** menu at the top.
2. Choose **Apps Script** from the dropdown options. This opens the GAS development environment.

### Step 3: Copy the Files
1. By default, you will see a single file named `Code.gs`. Rename it to `Main.gs` and replace its contents with the code inside `sa-stock-platform/Main.js`.
2. Create ten (10) more script files in the editor sidebar (by clicking the **`+`** icon and choosing **Script**):
   - `Config` (Paste contents of `sa-stock-platform/Config.js`)
   - `Utilities` (Paste contents of `sa-stock-platform/Utilities.js`)
   - `ErrorHandler` (Paste contents of `sa-stock-platform/ErrorHandler.js`)
   - `SheetManager` (Paste contents of `sa-stock-platform/SheetManager.js`)
   - `Settings` (Paste contents of `sa-stock-platform/Settings.js`)
   - `Logger` (Paste contents of `sa-stock-platform/Logger.js`)
   - `Cache` (Paste contents of `sa-stock-platform/Cache.js`)
   - `DataProvider` (Paste contents of `sa-stock-platform/DataProvider.js`)
   - `StrategyEngine` (Paste contents of `sa-stock-platform/StrategyEngine.js`)
   - `ReportEngine` (Paste contents of `sa-stock-platform/ReportEngine.js`)
   - `Menu` (Paste contents of `sa-stock-platform/Menu.js`)
3. Save the script project by clicking the **Save Project** (floppy disk) icon or pressing `Ctrl + S` / `Cmd + S`.

---

## 🔑 Authorization & Initialization Process

The setup process requires only one script execution:

1. Inside the Google Apps Script editor, locate the function selection toolbar dropdown at the top.
2. Select **`InitializeProject`** from the dropdown.
3. Click the **Run** button.
4. An **Authorization Required** dialog will pop up. Click **Continue**.
5. Select your active Google Account.
6. Click on **Advanced** (at the bottom) and choose **Go to Untitled project (unsafe)**.
7. Review the requested permissions (accessing and managing spreadsheet sheets) and click **Allow**.
8. After authorization, the script will execute automatically, programmatically building and styling all required sheets.
9. **Reload the Google Sheet tab in your browser.** A custom menu option called **SA Platform** will appear on your top toolbar!

---

## 🚀 Running and Auto-Repairing the Project

Once the system is authorized, you can run all updates and repairs directly from the Sheets UI:

1. **Perform Self-Healing / Auto-Repair:**
   - If you or a user accidentally deletes one of the required sheets (e.g., `Historical Data` or `Logs`), simply select **SA Platform** ➔ **Initialize / Repair Project** (or run `InitializeProject()` from the script editor).
   - The platform will programmatically detect the missing sheets and automatically recreate and restyle them, while safely preserving data in all other sheets!

2. **Run Data Updates:**
   - Select **SA Platform** ➔ **Update Data Engine**.
   - The engine reads the active stock symbols listed inside the `Stock Master` sheet (preloaded with `"RELIANCE"`, `"TCS"`, and `"INFY"` as initial placeholders) and downloads dummy daily rows to the `Historical Data` sheet.
   - Any single symbol failures are logged beautifully, but the pipeline continues smoothly.

3. **Explore System Settings:**
   - Click on **SA Platform** ➔ **Configure System Settings** to navigate immediately to the `Settings` sheet.
   - You can toggle system features like enabling/disabling caching (`Cache Enabled`), enabling debugging traces (`Debug Mode`), or tweaking batch size performance ranges.

4. **Review System Diagnostics:**
   - Click on **SA Platform** ➔ **View System Logs** to view execution logs, containing precise durations and exit statuses for every routine.

---

## 🎨 Professional Color & Design Integration

Every programmatically built sheet comes pre-styled with a professional **Cool Tech** design theme. Headings use Deep Navy backgrounds, clean white text, medium solid borders, frozen headers, adjusted column alignments, and a hidden gridline layout on the dashboard. This ensures the spreadsheet feels like a dedicated analytics app instead of a standard raw grid.

---

## 🔌 Architecture Blueprint: Adding Future Modules

This Phase 1 release is designed for extensibility. Future analytics engines can be written as lightweight classes and plugged into the main framework:

### Hooking up the "NSE Data Engine"
To transition from Yahoo Finance mock logs to active NSE live fetching, you only need to update the fetching module. Inside `DataProvider.fetchFromFeed()`, replace the standard Mock sleep timer block with:
```javascript
const response = UrlFetchApp.fetch(`https://api.nseindia.com/api/historical/cm/equity?symbol=${symbol}`);
const jsonData = JSON.parse(response.getContentText());
// Format and write the data via SheetManager.batchAppend()
```

### Hooking up "Moving Average / Breakout Research"
You can easily register a secondary analysis run directly inside the `MainOrchestrator.runBacktest()` chain:
```javascript
static runBacktest() {
  const start = new Date().getTime();
  Settings.init();
  Logger.init();

  try {
    // 1. Fetch relevant historical quotes
    const rawQuotes = SheetManager.batchRead(Config.SHEETS.HISTORICAL_DATA, 2, 1, 100, 10);

    // 2. Pass quotes to your breakout analysis class (e.g. BreakoutEngine)
    const indicators = BreakoutEngine.calculate(rawQuotes);

    // 3. Batch save metrics
    SheetManager.batchWrite(Config.SHEETS.REPORTS, indicators);

    Logger.success("MainOrchestrator.runBacktest", new Date().getTime() - start);
  } catch(e) {
    Logger.error("MainOrchestrator.runBacktest", new Date().getTime() - start, e);
  } finally {
    Logger.flush();
  }
}
```
This architecture keeps dependencies separated, making it incredibly easy to scale up to Phase 2. Enjoy building your backtesting engine!
