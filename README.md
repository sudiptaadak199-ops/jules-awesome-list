# NSE Volume, Delivery & Big Money Intelligence Dashboard

Production-ready Google Sheets + Google Apps Script quantitative trading intelligence platform designed for NSE-listed stocks. The system ingests official NSE market archives, tracks institutional FII flows, detects extreme volume expansion (RVOL up to 20x+), identifies low selling pressure accumulation (20D Avg Seller < 40K), monitors sector rotation stages, and executes look-ahead bias-free backtesting.

---

## 🌟 Key Features

1. **Official NSE Data Ingestion Pipeline**: Ingests Bhavcopy, UDiFF, and Security-wise Delivery archives into `Raw_Daily` with composite primary key (`Date_Symbol`) deduplication and quality validation.
2. **Institutional FII Tracking**:
   - **Module A (Market Activity)**: Stores daily FII Buy, FII Sell, and Net FII flow in `Raw_FII`.
   - **Module B (Stock Ownership)**: Tracks quarterly stock-wise FII holding % changes in `Raw_FII_Holdings`.
3. **Multi-Factor Quantitative Indicator Engine**:
   - **RVOL Scanner**: Categorizes relative volume from <1 (below avg) to >=20x (ultra extreme).
   - **Volume Acceleration**: Computes 5D Avg Vol / Prev 5D Avg Vol ratio.
   - **Low Selling Pressure Proxy**: Identifies non-delivery selling pressure trends (20D Avg Seller < 40,000 threshold).
   - **Normalized Scores (0–100 Scale)**: Stock Rotation Score, New Money Inflow Score, and Big Money Initial Entry Score.
4. **Sector Rotation Engine**: Classifies sectors into 5 stages (`Leading`, `Improving`, `Accumulation / Early Rotation`, `Weakening`, `Lagging`) based on Breadth, RVOL, Volume Acceleration, and RS vs Nifty.
5. **Trader-Centric Dashboard UI**: Features Market Overview metrics, 6 specialized intelligence panels (Highest Delivery Volume, 20x+ Volume, Low Selling Pressure, FII Activity, Big Money Entry, Sector Rotation), and a searchable Master Stock Scanner.
6. **Look-Ahead Bias-Free Backtest Engine**: Simulates Strategies A–E over customizable holding periods and stop loss/target thresholds, reporting Win Rate %, Profit Factor, MFE, MAE, and Drawdown.
7. **Self-Healing Architecture & Automation**: Automatically detects spreadsheet context, initializes missing tabs/headers, repairs damaged settings, and provides headless automated time-driven triggers.

---

## 📁 System Architecture

| File | Purpose |
| :--- | :--- |
| `appsscript.json` | Google Apps Script runtime manifest & required OAuth scopes. |
| `Config.gs` | Central configuration, schema definitions for all 12 sheets, default settings & stock universe. |
| `Utils.gs` | High-performance batch I/O, math normalization, EMA/SMA calculators, system logger & theme formatting. |
| `DataProvider.gs` | Centralized network fetcher with retries, exponential backoff, data quality validator & deduplication. |
| `NSEData.gs` | Ingestion engine for official NSE daily Bhavcopy & Security-wise Delivery data. |
| `FIIData.gs` | Separate modules for Market-level FII activity and Stock-wise FII ownership shareholding. |
| `Calculations.gs` | Core analytics engine computing 30+ indicators, RVOL, EMAs, RS vs Nifty, and 0-100 normalized scores. |
| `SectorEngine.gs` | Sector aggregation engine computing Sector RS, Breadth %, Money Score, and Stage Classifications. |
| `SignalEngine.gs` | Active signal scanner and end-of-day snapshot engine for historical backtesting. |
| `Dashboard.gs` | UI rendering engine building overview cards, 6 intelligence panels, and Master Stock Scanner. |
| `Backtest.gs` | Quantitative strategy backtesting engine simulating trades without look-ahead bias. |
| `Main.gs` | Master orchestrator building the custom menu `📊 Volume Intelligence`, self-healing repair, and triggers. |
| `test_intelligence_engine.js` | Local Node.js test suite running 25 assertions across all modules. |

---

## 📊 12 Required Sheets Schema

1. `Dashboard` - Primary user interface & specialized scanner panels.
2. `Master_Stocks` - Master universe of active NSE stock tickers.
3. `Raw_Daily` - Daily price, volume, VWAP, turnover, trades, and delivery archives.
4. `Raw_FII` - Market-level FII Buy, Sell, and Net flow amounts.
5. `Raw_FII_Holdings` - Stock-wise quarterly FII shareholding ownership % data.
6. `Calculations` - Calculated stock indicators, moving averages, and normalized scores.
7. `Sector_Data` - Sector-level metrics, Breadth %, and Rotation Stage classifications.
8. `Signals` - Actionable active trading intelligence signals.
9. `Historical_Log` - Daily snapshots of all indicators for historical backtesting.
10. `Backtest` - Quantitative trade execution log and summary performance statistics.
11. `Settings` - Configurable thresholds, scoring weights, and strategy settings.
12. `System_Log` - Transactional system logs, warning messages, and error traces.

---

## 🚀 Quick Setup & Usage Guide

1. **Open Google Sheet**: Create a new Google Sheet or open your existing trading spreadsheet.
2. **Access Apps Script**: Click `Extensions` -> `Apps Script`.
3. **Copy Code Files**: Copy the complete contents of all `.gs` files and `appsscript.json` into the editor.
4. **Save & Reload**: Save the script project and reload the Google Sheet tab.
5. **Run Initialization**:
   - Click the newly appeared menu `📊 Volume Intelligence` -> `🚀 Initialize Project`.
   - Authorize Google Apps Script when prompted.
6. **Execute Full Refresh**:
   - Click `📊 Volume Intelligence` -> `🔄 Full Refresh`.
   - The platform will automatically populate all 12 sheets, compute indicators, aggregate sectors, generate signals, and render the complete Dashboard UI.
7. **Automate Updates**: Click `📊 Volume Intelligence` -> `⏰ Start Auto Update` to enable automated background updates.

---

## 🧪 Local Testing

Run the 25-assertion Node.js test suite locally to verify code integrity and mathematical precision:

```bash
node test_intelligence_engine.js
```

---



<p align="center">
  <img src="assets/jules-readme.png" alt="Jules Awesome List" width="600">
</p>

<div align="center">
  <h1>Awesome Jules Prompts 🌟</h1>
  <p>Curated prompts for Jules, an async coding agent from Google Labs.</p>
  <br>
  <a href="https://jules.google.com">Visit Jules</a> •
  <a href="#contributing">Contribute</a>
</div>



## Table of Contents

- [Table of Contents](#table-of-contents)
- [Everyday Dev Tasks](#everyday-dev-tasks)
- [Debugging](#debugging)
- [Documentation](#documentation)
- [Testing](#testing)
- [Package Management](#package-management)
- [AI-Native Tasks](#ai-native-tasks)
- [Context](#context)
- [Fun \& Experimental](#fun--experimental)
- [Start from Scratch](#start-from-scratch)
- [Trading & Financial Engineering](#trading--financial-engineering)
- [Contributing](#contributing)



## Everyday Dev Tasks

- `// Refactor {a specific} file from {x} to {y}...`
  <sub>General-purpose, applies to any language or repo.</sub>

- `// Add a test suite...`
  <sub>Useful for repos lacking test coverage.</sub>

- `// Add type hints to {a specific} Python function...`
  <sub>Python codebases transitioning to typed code.</sub>

- `// Generate mock data for {a specific} schema...`
  <sub>APIs, frontends, or test-heavy environments.</sub>

- `// Convert these commonJS modules to ES modules...`
  <sub>JS/TS projects modernizing legacy code.</sub>

- `// Turn this callback-based code into async/await...`
  <sub>JavaScript or Python codebases improving async logic.</sub>

- `// Implement a data class for this dictionary structure...`
  <sub>Useful for Python projects moving towards more structured data handling with `dataclasses` or Pydantic.</sub>



## Debugging

- `// Help me fix {a specific} error...`
  <sub>For any repo where you're stuck on a runtime or build error.</sub>

- `// Why is {this specific snippet of code} slow?`
  <sub>Performance profiling for loops, functions, or queries.</sub>

- `// Trace why this value is undefined...`
  <sub>Frontend and backend JS/TS bugs.</sub>

- `// Diagnose this memory leak...`
  <sub>Server-side apps or long-running processes.</sub>

- `// Add logging to help debug this issue...`
  <sub>Useful when troubleshooting silent failures.</sub>

- `// Find race conditions in this async code`
  <sub>Concurrent systems in JS, Python, Go, etc.</sub>

- `// Add print statements to trace the execution flow of this Python script...`
  <sub>For debugging complex Python scripts or understanding unexpected behavior.</sub>



## Documentation

- `// Write a README for this project`
  <sub>Any repo lacking a basic project overview.</sub>

- `// Add comments to this code`
  <sub>Improves maintainability of complex logic.</sub>

- `// Write API docs for this endpoint`
  <sub>REST or GraphQL backends.</sub>

- `// Generate Sphinx-style docstrings for this Python module/class/function...`
  <sub>Ideal for Python projects using Sphinx for documentation generation.</sub>



## Testing

- `// Add integration tests for this API endpoint`
  <sub>Express, FastAPI, Django, Flask apps.</sub>

- `// Write a test that mocks fetch`
  <sub>Browser-side fetch or axios logic.</sub>

- `// Convert this test from Mocha to Jest`
  <sub>JS test suite migrations.</sub>

- `// Generate property-based tests for this function`
  <sub>Functional or logic-heavy code.</sub>

- `// Simulate slow network conditions in this test suite`
  <sub>Web and mobile apps.</sub>

- `// Write a test to ensure backward compatibility for this function`
  <sub>Library or SDK maintainers.</sub>

- `// Write a Pytest fixture to mock this external API call...`
  <sub>For Python projects using Pytest and needing robust mocking for testing.</sub>



## Package Management

- `// Upgrade my linter and autofix breaking config changes`
  <sub>JS/TS repos using ESLint or Prettier.</sub>

- `// Show me the changelog for React 19`
  <sub>Web frontend apps using React.</sub>

- `// Which dependencies can I safely remove?`
  <sub>Bloated or legacy codebases.</sub>

- `// Check if these packages are still maintained`
  <sub>Security-conscious or long-term projects.</sub>

- `// Set up Renovate or Dependabot for auto-updates`
  <sub>Best for active projects with CI/CD.</sub>



## AI-Native Tasks

- `// Analyze this repo and generate 3 feature ideas`
  <sub>Vision-stage or greenfield products.</sub>

- `// Identify tech debt in this file`
  <sub>Codebases with messy or fragile logic.</sub>

- `// Find duplicate logic across files`
  <sub>Sprawling repos lacking DRY practices.</sub>

- `// Cluster related functions and suggest refactors`
  <sub>Projects with lots of utils or helpers.</sub>

- `// Help me scope this issue so Jules can solve it`
  <sub>For working with Jules on real issues.</sub>

- `// Convert this function into a reusable plugin/module`
  <sub>Componentizing logic-heavy code.</sub>

- `// Refactor this Python function to be more amenable to parallel processing (e.g., using multiprocessing or threading)...`
  <sub>For optimizing performance in computationally intensive Python applications.</sub>



## Context

- `// Write a status update based on recent commits`
  <sub>Managerial and async communication.</sub>

- `// Summarize all changes in the last 7 days`
  <sub>Catching up after time off.</sub>



## Fun & Experimental

- `// Add a confetti animation when {a specific} action succeeds`
  <sub>Frontend web apps with user delight moments.</sub>

- `// Inject a developer joke when {a specific} build finishes`
  <sub>Personal projects or team tools.</sub>

- `// Build a mini CLI game that runs in the terminal`
  <sub>For learning or community fun.</sub>

- `// Add a dark mode Easter egg to this UI`
  <sub>Design-heavy frontend projects.</sub>

- `// Turn this tool into a GitHub App`
  <sub>Reusable, platform-integrated tools.</sub>



## Start from Scratch

- `// What's going on in this repo?`
  <sub>Great for legacy repos or onboarding onto unfamiliar code.</sub>

- `// Initialize a new Express app with CORS enabled`
  <sub>Web backend projects using Node.js and Express.</sub>

- `// Set up a monorepo using Turborepo and PNPM`
  <sub>Multi-package JS/TS projects with shared dependencies.</sub>

- `// Bootstrap a Python project with Poetry and Pytest`
  <sub>Python repos aiming for clean dependency and test setup.</sub>

- `// Create a starter template for a Chrome extension`
  <sub>Browser extension development.</sub>

- `// I want to build a web scraper—start me off`
  <sub>Data scraping or automation tools using Python/Node.</sub>



## Trading & Financial Engineering

- `// Build an NSE Volume, Delivery & Big Money Intelligence Dashboard...`
  <sub>Production-ready Google Sheets + Google Apps Script platform for stock delivery, volume expansion, low selling pressure, FII flow tracking, and sector rotation backtesting.</sub>



## Contributing

Your contributions are welcome! Add new prompts, fix formatting, or suggest categories.

- 📄 [Contributing Guide](contributing.md)
- 🪄 Open a [Pull Request](https://github.com/YOUR_REPO/pulls)
