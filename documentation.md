# Nepal Portfolio Manager - Current Codebase Documentation

> Last updated from live code inspection on 2026-04-30.
> Scope checked against `backend/app/*`, `frontend/src/*`, `frontend/package.json`, and `backend/requirements.txt`.

---

## 1. What this project is

Nepal Portfolio Manager is a local-first full-stack app for tracking NEPSE investments across multiple members. It combines:

- Portfolio accounting with true WACC and tax WACC
- MeroShare sync and credential storage
- Dividend tracking
- Live price, index, NAV, and fundamentals scraping
- Stock-level analysis and portfolio-level AI review
- IPO application automation
- Trading workflow helpers such as position sizing, signals, and journaling

The app is built for personal use, not multi-tenant deployment.

---

## 2. Stack and runtime

| Layer | Current stack |
|-------|---------------|
| Backend | Python, FastAPI, SQLAlchemy 2, SQLite |
| Frontend | React 19, Vite 7, Ant Design 6 |
| Server state | TanStack React Query 5 |
| Charts | Recharts, `lightweight-charts` |
| Scraping | Selenium, BeautifulSoup4, `curl_cffi`, custom HTTP scraping |
| Files/parsing | `pdfplumber`, `pandas`, `openpyxl` |
| AI | Ollama local models, Groq cloud, Nvidia cloud |

Key manifests:

- Backend deps: [backend/requirements.txt](D:/Projects/Portfolio/backend/requirements.txt)
- Frontend deps: [frontend/package.json](D:/Projects/Portfolio/frontend/package.json)

---

## 3. Top-level architecture

```text
frontend (React/Vite)
  -> calls /api/*
backend (FastAPI)
  -> SQLAlchemy ORM
  -> SQLite portfolio.db
  -> scraper/services layer
  -> optional static serving of frontend/dist
```

### Runtime behavior

- In development, the frontend runs on `:3055` and the backend on `:6767`.
- In production-style local use, FastAPI can serve the built frontend from `frontend/dist` if that folder exists.
- The backend currently requires `MASTER_PASSWORD` to already be a bcrypt hash at startup. If it is missing or plaintext-like, the process exits.

Relevant files:

- App entry: [backend/app/main.py](D:/Projects/Portfolio/backend/app/main.py)
- Settings: [backend/app/config.py](D:/Projects/Portfolio/backend/app/config.py)
- Frontend bootstrap: [frontend/src/main.jsx](D:/Projects/Portfolio/frontend/src/main.jsx)

---

## 4. Backend startup and lifecycle

The FastAPI app uses a lifespan hook.

Startup sequence:

1. Validate that `MASTER_PASSWORD` looks like a bcrypt hash.
2. `init_db()` creates any missing tables.
3. `seed_fee_config()` inserts default fee records if needed.
4. `create_database_backup()` runs once on startup.
5. `start_scheduler()` starts APScheduler.

Shutdown sequence:

1. `stop_scheduler()`

Important correction from older docs:

- APScheduler manages active cron jobs for price scraping (every 5 min during market hours), index snapshots (every 15 min), daily NAV syncs, and weekly fundamental/dividend scrapes.
- The backup logic is startup-driven, not nightly scheduled.

Relevant files:

- [backend/app/main.py](D:/Projects/Portfolio/backend/app/main.py)
- [backend/app/utils/scheduler.py](D:/Projects/Portfolio/backend/app/utils/scheduler.py)
- [backend/app/services/backup_service.py](D:/Projects/Portfolio/backend/app/services/backup_service.py)

---

## 5. Configuration

Configuration is loaded from `backend/.env` through `pydantic-settings`.

Important settings in [backend/app/config.py](D:/Projects/Portfolio/backend/app/config.py):

- `APP_NAME`, `APP_VERSION`, `DEBUG`
- `DATABASE_URL`
- `ENCRYPTION_KEY`
- `MASTER_PASSWORD`
- `CORS_ORIGINS`
- `NEPSE_COMPANY_URL`, `NAV_URL`, `MEROSHARE_URL`
- `OLLAMA_URL`, `DEFAULT_OLLAMA_MODEL`, `AVAILABLE_OLLAMA_MODELS`
- `GROQ_API_KEY`, `GROQ_BASE_URL`, `GROQ_MODEL`
- `NVIDIA_API_KEY`, `NVIDIA_BASE_URL`, `NVIDIA_MODEL`

Notes:

- `DEBUG` defaults to `False` in code.
- `MASTER_PASSWORD` has no default and is mandatory.
- The app logs whether the Groq key was loaded, masking the value when present.

---

## 6. Data model

The ORM layer lives in `backend/app/models`.

### Core portfolio models

- `Member`
- `MeroshareCredential`
- `MemberGroup`
- `Company`
- `Transaction`
- `Holding`
- `PortfolioSnapshot`

### Market and configuration models

- `LivePrice`
- `NavValue`
- `FeeConfig`
- `IssuePrice`
- `PriceHistory`
- `IndexHistory`
- `Notification`

### Analysis and trading models

- `DividendIncome`
- `StockOverview`
- `FundamentalReport`
- `QuarterlyGrowth`
- `TradeSetup`
- `TradeJournal`

Notable corrections from the older audit:

- The dividend table/model is `DividendIncome`, not `DividendHistory`.
- Fundamentals also include `QuarterlyGrowth`.
- Trading data includes both setups and a journal.

---

## 7. API surface

All routers are mounted directly in [backend/app/main.py](D:/Projects/Portfolio/backend/app/main.py).

### Mounted routers

| Router file | Prefix | Purpose |
|------------|--------|---------|
| `members.py` | `/api/members` | Members, credential CRUD, master password verification |
| `companies.py` | `/api/companies` | Company list, sectors, single symbol lookup |
| `transactions.py` | `/api/transactions` | Manual CRUD plus CSV/native/DP imports |
| `portfolio.py` | `/api/portfolio` | Summary, holdings, history, snapshots, dividends, AI review |
| `scraper.py` | `/api/scraper` | Manual scraper triggers |
| `config_api.py` | `/api/config` | Fee config and fee history |
| `prices.py` | `/api/prices` | Prices, issue prices, historical price and index data |
| `economy.py` | `/api/economy` | Macroeconomic snapshot, scrape triggers, alternatives comparison |
| `ipo.py` | `/api/ipo` | Open IPOs, apply jobs, status polling |
| `insights.py` | `/api/insights` | Symbol-level insights payload |
| `dividends.py` | `/api/dividends` | Dividend table, summary, and upcoming book-closures |
| `groups.py` | `/api/groups` | Saved member groups |
| `analysis.py` | `/api/analysis` | Executive summary and AI verdicts |
| `stock_detail.py` | `/api/stock-detail` | 360-degree stock detail and symbol list |
| `calculator.py` | `/api/calculator` | Buy/sell simulations |
| `screener.py` | `/api/screener` | Screening data |
| `market_context.py` | `/api/market` | Market context, technicals, backtesting |
| `trading.py` | `/api/trading` | Trade setups, signals, journal, stats |
| `notifications.py` | `/api/notifications` | Unread notifications and mark-as-read status |

### Health and static routes

- `GET /api/health`
- Optional static frontend serving from `/assets` and a catch-all SPA route

### Portfolio endpoints worth knowing

[backend/app/api/portfolio.py](D:/Projects/Portfolio/backend/app/api/portfolio.py) currently exposes:

- `/summary`
- `/sector-allocation`
- `/holdings`
- `/history`
- `/snapshot`
- `/closed-positions`
- `/computed-history`
- `/dividends`
- `/trade-intel/{symbol}`
- `/trade-intel/{symbol}/ai-review-local`
- `/trade-intel/{symbol}/ai-review-cloud`
- `/trade-intel/{symbol}/frontier-prompt`
- `/analyze-local`
- `/analyze-cloud`
- `/analyze-frontier-prompt`

### Scraper trigger endpoints

[backend/app/api/scraper.py](D:/Projects/Portfolio/backend/app/api/scraper.py) currently exposes:

- `/issues`
- `/index`
- `/sector-indices`
- `/all-indices`
- `/companies`
- `/nav`
- `/prices`
- `/meroshare/sync`
- `/history`
- `/dividends`
- `/fundamentals/{symbol}`
- `/insights/{symbol}`
- `/technicals/{symbol}`
- `/fundamentals`

Important correction from older docs:

- The scraper API now covers index scraping, dividend scraping, symbol-specific insight refresh, and bulk fundamentals refresh.

---

## 8. Service layer

Most business logic lives in `backend/app/services`.

### Core portfolio/accounting services

- [portfolio_engine.py](D:/Projects/Portfolio/backend/app/services/portfolio_engine.py)
  - Replays transactions into holdings
  - Computes WACC and tax WACC
  - Computes holding XIRR and portfolio summary metrics
  - Enriches holdings with technical, valuation, dividend, and risk fields

- [fee_calculator.py](D:/Projects/Portfolio/backend/app/services/fee_calculator.py)
  - Historical fee lookup
  - Buy/sell fee simulation
  - Cache management
  - Fee config seeding

- [portfolio_history.py](D:/Projects/Portfolio/backend/app/services/portfolio_history.py)
  - Computes daily history against historical prices and NEPSE index

- [trade_intel.py](D:/Projects/Portfolio/backend/app/services/trade_intel.py)
  - Rebuilds holding epochs for retrospective trade review

### Import and parsing services

- [history_parser.py](D:/Projects/Portfolio/backend/app/services/history_parser.py)
  - Parses MeroShare CSV exports
  - Detects transaction types from raw rows

- [dp_parser.py](D:/Projects/Portfolio/backend/app/services/dp_parser.py)
  - Parses PDF, CSV, and XLSX statement formats
  - Reconciles imported SIP-like statement data

- [native_parser.py](D:/Projects/Portfolio/backend/app/services/native_parser.py)
  - Imports app-native CSV data

### Analysis and AI services

- [analysis/executive_summary.py](D:/Projects/Portfolio/backend/app/services/analysis/executive_summary.py)
  - Builds the executive summary used by the stock explorer and AI panels

- [analysis/ai_service.py](D:/Projects/Portfolio/backend/app/services/analysis/ai_service.py)
  - Lists available models
  - Calls Ollama, Groq, and Nvidia providers
  - Generates value, trading, trade-intel, and portfolio prompts/verdicts
  - Generates frontier copy/paste prompts

- [analysis/fundamental.py](D:/Projects/Portfolio/backend/app/services/analysis/fundamental.py)
- [analysis/technical.py](D:/Projects/Portfolio/backend/app/services/analysis/technical.py)

### Utility services

- [calculator_service.py](D:/Projects/Portfolio/backend/app/services/calculator_service.py)
- [stock_detail.py](D:/Projects/Portfolio/backend/app/services/stock_detail.py)
- [economy_service.py](D:/Projects/Portfolio/backend/app/services/economy_service.py)
  - Evaluates monetary regimes and aggregates macroeconomic data
- [backup_service.py](D:/Projects/Portfolio/backend/app/services/backup_service.py)
- [ipo_bot.py](D:/Projects/Portfolio/backend/app/services/ipo_bot.py)
- [alert_service.py](D:/Projects/Portfolio/backend/app/services/alert_service.py)
  - Checks live market prices against active TradeSetups and issues Notifications.

---

## 9. Scrapers and external data sources

Scrapers live under `backend/app/scrapers`.

| File | Purpose |
|------|---------|
| `company_scraper.py` | NEPSE company list |
| `price_scraper.py` | Live prices and current NEPSE index snapshot |
| `nav_scraper.py` | Mutual fund NAV data |
| `meroshare.py` | Member transaction sync from MeroShare |
| `issue_autoscraper.py` | Issue prices |
| `history_scraper.py` | Historical OHLCV |
| `dividend_scraper.py` | Dividend records plus eligibility calculations |
| `fundamental_scraper.py` | Fundamental data per symbol |
| `index_scraper.py` | NEPSE index and sector index history |
| `driver_factory.py` | Shared Selenium Chrome creation |

Main external systems:

- `nepalstock.com`
- `sharesansar.com`
- `meroshare.cdsc.com.np`
- local Ollama server
- Groq API
- Nvidia API

---

## 10. Frontend structure

The frontend is a React SPA using Ant Design dark theme and React Query.

### Provider stack

[frontend/src/main.jsx](D:/Projects/Portfolio/frontend/src/main.jsx):

1. `StrictMode`
2. `QueryClientProvider`
3. `BrowserRouter`
4. `ConfigProvider`

Current defaults:

- Query `staleTime`: 30 seconds
- Query retries: 1
- Theme: dark algorithm with a purple-led palette

### App shell and currently wired routes

[frontend/src/App.jsx](D:/Projects/Portfolio/frontend/src/App.jsx) defines the live navigation and routes.

Current sidebar routes:

- `/` -> Dashboard
- `/holdings` -> Holdings
- `/transactions` -> Transactions
- `/prices` -> Prices
- `/insights` -> Stock Explorer
- `/trading` -> Trading Desk
- `/economy` -> Economy & Alternatives
- `/apply-ipo` -> Apply IPO
- `/upload` -> Sync and Credentials
- `/settings` -> Settings
- `/about` -> About

Other current shell behavior:

- 240px dark sider
- inactivity timeout clears `sessionStorage.masterAuth` after 15 minutes
- version label in sidebar footer

### Page inventory

The `src/pages` folder contains both active and currently unwired pages.

Routed from `App.jsx`:

- `Dashboard.jsx`
- `Holdings.jsx`
- `Transactions.jsx`
- `Prices.jsx`
- `Insights.jsx`
- `TradingDesk.jsx`
- `Economy.jsx`
- `ApplyIPO.jsx`
- `Upload.jsx`
- `Settings.jsx`
- `About.jsx`

Present in the repo but not currently routed from `App.jsx`:

- `Calculator.jsx`
- `Members.jsx`
- `ScripDetail.jsx`

This is one of the main mismatches in the old documentation.

### Key component areas

- `components/dashboard`
  - `OverviewTab`
  - `PerformanceTab`
  - `RiskTab`
  - `DividendTab`
  - `ActionCenterTab`
  - `AIPortfolioAnalyst`

- `components/insights`
  - `ExecutiveSummary`
  - `FundamentalTabs`
  - `TechnicalTabs`
  - `StrategyTester`
  - `TradeIntelTab`
  - `StockScreener`

- `components/trading`
  - `StockAnalysis`
  - `AITradingCopilot`
  - `LiveTechnicals`
  - `TechnicalScreener`
  - `RiskCalculator`

### Frontend API client

[frontend/src/services/api.js](D:/Projects/Portfolio/frontend/src/services/api.js):

- Axios base URL: `/api`
- Automatically injects `X-Master-Password` from `sessionStorage.masterAuth`
- Exposes endpoint wrappers for members, portfolio, prices, scrapers, analysis, trading, market context, and IPO flows

---

## 11. Security and auth behavior

This app does not use multi-user auth. Instead, sensitive actions rely on a master-password gate.

Current behavior:

- Backend requires `MASTER_PASSWORD` to be a bcrypt hash in env.
- Frontend stores the verified secret in `sessionStorage` as `masterAuth`.
- Axios sends that value in the `X-Master-Password` header.
- Credential export and decrypted credential reads are protected through this flow.
- MeroShare passwords are encrypted using Fernet.

Relevant files:

- [backend/app/api/members.py](D:/Projects/Portfolio/backend/app/api/members.py)
- [backend/app/utils/encryption.py](D:/Projects/Portfolio/backend/app/utils/encryption.py)
- [frontend/src/services/api.js](D:/Projects/Portfolio/frontend/src/services/api.js)

---

## 12. What is operationally important for developers

### Accounting rules

- Fees are date-versioned and must come from `fee_calculator.py`.
- Any transaction mutation should be followed by holdings recalculation.
- The portfolio layer distinguishes true WACC from tax WACC.
- Rights Subscriptions (`RIGHTS_SUBSCRIPTION`) are explicitly treated as investment capital during WACC and P&L calculations.
- Mutual-fund-like instruments are treated differently from equity for valuation and analytics.

### Current limitations

- SQLite is still the only database.
- No automated test suite exists in the repository.
- Some large frontend files remain monolithic, especially `Transactions.jsx`, `Holdings.jsx`, `Prices.jsx`, `Dashboard.jsx`, and `TradingDesk.jsx`.
- Several pages and helpers exist but are not wired into the live app shell.
- Scraper reliability depends on third-party site structure.

---

## 13. Backend scripts and helper files

Current helper scripts/files visible in the repository:

- [backend/run_server.py](D:/Projects/Portfolio/backend/run_server.py)
- [backend/scripts/scrape_all_data.py](D:/Projects/Portfolio/backend/scripts/scrape_all_data.py)
- [backend/scripts/scrape_all_fundamentals.py](D:/Projects/Portfolio/backend/scripts/scrape_all_fundamentals.py)
- [backend/scripts/scrape_portfolio_fundamentals.py](D:/Projects/Portfolio/backend/scripts/scrape_portfolio_fundamentals.py)

Important correction from older docs:

- The repo does not currently contain the previously documented maintenance scripts like `recalculate_all.py`, `resync_holdings.py`, `fix_bonus_rates.py`, or `cleanup_sips.py`.

---

## 14. Quick run notes

Backend:

```powershell
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 6767
```

Frontend:

```powershell
cd frontend
npm install
npm run dev
```

If `frontend/dist/index.html` exists, the backend can also serve the built SPA directly.

---

## 15. Summary of major corrections made to this document

- Replaced the old audit snapshot with the current router and route inventory.
- Corrected startup behavior: startup backup still exists, scheduled jobs do not.
- Corrected config defaults and master-password handling.
- Corrected model names, especially dividends and fundamentals.
- Corrected frontend reality: only a subset of page files is currently routed.
- Added the current AI, trading, market context, and portfolio-analysis surfaces.
