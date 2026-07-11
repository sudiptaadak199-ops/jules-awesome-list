# SA Stock Research & Backtest Platform (Phase 1 - Foundation)

Welcome to the **SA Stock Research & Backtest Platform**! This is the Phase 1 Foundation release. This codebase establishes a clean, high-performance, modular architectural backbone on top of Google Sheets using Google Apps Script (GAS) to power professional stock analytics and automated backtesting platforms.

---

## 📂 Project Structure

The project code is divided into modular, specialized files located within the `sa-stock-platform/` directory:

1. **`appsscript.json`**
   - The manifest file declaring runtime metadata, timezone (`Asia/Kolkata`), and required standard execution scopes.
2. **`Config.js`**
   - Central repository for constants, active sheets naming, a curated "Cool Tech Theme" professional color palette, and default fallback system settings.
3. **`SheetManager.js`**
   - The spreadsheet operations controller. It manages auto-creation of database sheets, professional column styling, frozen header boundaries, and batch read/write blocks to minimize spreadsheet interactions and ensure optimal execution speed.
4. **`Settings.js`**
   - A robust configuration loading layer. Loads settings from the `Settings` sheet, caches them in run-time execution memory to prevent recurring read-overhead, and supports type-safe parsed getters (`getNum()`, `getBool()`) and live cell-targeted setting overrides.
5. **`Logger.js`**
   - A highly performant structured execution logger. Keeps track of running execution statistics (function names, status, duration, errors) and buffers logs locally, flushing them onto the spreadsheet database in a single high-efficiency bulk operation upon completion.
6. **`Cache.js`**
   - A reusable, persistent sheet-backed key-value cache system complete with configurable TTL (Time to Live) expiration controls. Ideal for caching high-latency stock API response footprints. Bypasses automatically if caching is disabled.
7. **`PlaceholderEngine.js`**
   - Houses the integration interface designs. Provides ready-to-plug skeletons and helper methods (e.g. robust stock-by-stock retry wrappers) to show how future analytic and data retrieval modules will hook cleanly into the architecture.
8. **`Menu.js`**
   - Binds platform execution routines to Google Sheets UI menu items ("SA Platform"), streamlining control and configuration workflows.
9. **`Main.js`**
   - The core platform Orchestrator. Defines top-level workflows and wraps processes in error-resistant boundaries so that an individual stock error logs a neat warning block but *never* terminates the entire process execution.

---

## 🛠️ Step-by-Step Installation Guide

Follow these steps to copy and deploy the platform inside your personal Google Account:

### Step 1: Create a New Google Sheet
1. Navigate to [Google Sheets](https://sheets.google.com).
2. Create a blank spreadsheet and name it (e.g., `My SA Stock Platform`).

### Step 2: Open the Apps Script Editor
1. In your newly created spreadsheet, click on the **Extensions** menu at the top.
2. Choose **Apps Script** from the dropdown options. This opens the GAS development environment.

### Step 3: Copy the Files
1. By default, you will see a single file named `Code.gs`. Rename it to `Main.gs` and replace its contents with the code inside `sa-stock-platform/Main.js`.
2. Create seven (7) more script files in the editor sidebar (by clicking the **`+`** icon and choosing **Script**):
   - `Config` (Paste contents of `sa-stock-platform/Config.js`)
   - `SheetManager` (Paste contents of `sa-stock-platform/SheetManager.js`)
   - `Settings` (Paste contents of `sa-stock-platform/Settings.js`)
   - `Logger` (Paste contents of `sa-stock-platform/Logger.js`)
   - `Cache` (Paste contents of `sa-stock-platform/Cache.js`)
   - `PlaceholderEngine` (Paste contents of `sa-stock-platform/PlaceholderEngine.js`)
   - `Menu` (Paste contents of `sa-stock-platform/Menu.js`)
3. Save the script project by clicking the **Save Project** (floppy disk) icon or pressing `Ctrl + S` / `Cmd + S`.

---

## 🔑 Authorization Process

When running the platform workflows for the first time, Google requires you to grant security clearances to access the active spreadsheet:

1. In the Google Sheets tab, refresh the page. After a few seconds, a custom menu option called **SA Platform** will appear on your top toolbar.
2. Click on **SA Platform** ➔ **Initialize Project**.
3. An **Authorization Required** dialog will pop up. Click **Continue**.
4. Select your active Google Account.
5. You may receive an "unverified app" screen. Click on **Advanced** (at the bottom) and choose **Go to Untitled project (unsafe)**.
6. Review the requested permissions (accessing and managing spreadsheet sheets) and click **Allow**.

---

## 🚀 Initializing and Running the Project

Now that the system is authorized, follow these simple control steps:

1. **Perform Initial Setup:**
   - Go to **SA Platform** ➔ **Initialize Project**.
   - The platform will programmatically check for the existence of the required database sheets: `Dashboard`, `Settings`, `Stock Master`, `Historical Data`, `Reports`, `Logs`, and `Cache`. If any do not exist, it will create and style them.
   - Once completed, you will receive a success popup alert.

2. **Run Data Updates (Mock Historical Appends):**
   - Select **SA Platform** ➔ **Update Data**.
   - The engine reads the active stock symbols listed inside the `Stock Master` sheet (preloaded with `"RELIANCE"` as an initial placeholder) and downloads dummy daily rows to the `Historical Data` sheet.
   - Any single symbol failures are logged beautifully, but the pipeline continues smoothly.

3. **Explore System Settings:**
   - Click on **SA Platform** ➔ **Configure Settings** to navigate immediately to the `Settings` sheet.
   - You can toggle system features like enabling/disabling caching (`Cache Enabled`), enabling debugging traces (`Debug Mode`), or tweaking batch size performance ranges.

4. **Review System Diagnostics:**
   - Click on **SA Platform** ➔ **View Logs** to view execution logs, containing precise durations and exit statuses for every routine.

---

## 🎨 Professional Color & Design Integration

Every programmatically built sheet comes pre-styled with a professional **Cool Tech** design theme. Headings use Deep Navy backgrounds, clean white text, medium solid borders, frozen headers, adjusted column alignments, and a hidden gridline layout on the dashboard. This ensures the spreadsheet feels like a dedicated analytics app instead of a standard raw grid.

---

## 🔌 Architecture Blueprint: Adding Future Modules

This Phase 1 release is designed for extensibility. Future analytics engines can be written as lightweight classes and plugged into the main framework:

### Hooking up the "NSE Data Engine"
To transition from Yahoo Finance mock logs to active NSE live fetching, you only need to update the fetching module. Inside `PlaceholderEngine.processStockData()`, replace the standard Mock sleep timer block with:
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
