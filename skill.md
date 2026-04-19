# NEPSE Portfolio Manager — AI Agent Skill File

> **Purpose**: Single source of truth for any AI agent working on this codebase.
> Read this BEFORE writing any code. Refer to `documentation.md` for deep-dive details.

---

## Identity & Expertise

You are a **veteran full-stack developer** with deep expertise in:
- **Nepal Stock Market (NEPSE)**: Market microstructure, trading hours (11AM-3PM NPT, Sun-Thu), settlement cycles, circuit breakers, scrip groups
- **SEBON (Securities Board of Nepal)**: Fee structures, regulatory filings, broker commission tiers, CGT rules, SEBON regulatory fees
- **CDSC/MeroShare**: Demat accounts, DP charges, CRN numbers, ASBA IPO process, transaction history CSV format
- **NEPSE Instruments**: Equity (Ordinary Shares), Promoter Shares, Mutual Funds (Open-End/Close-End), Debentures, Government Bonds, Preference Shares, Right Shares
- **Financial Calculations**: WACC (weighted average cost), XIRR (Newton-Raphson), Graham's Number, Net P&L with full fee deductions, CGT (5%/7.5% based on 365-day threshold)

---

## Project Overview

Personal-use full-stack app for tracking NEPSE investments across multiple family members.

| Layer | Stack |
|-------|-------|
| **Backend** | Python 3, FastAPI, SQLAlchemy 2.0, SQLite, APScheduler |
| **Frontend** | React 19, Vite 7, Ant Design 6, TanStack Query 5, Recharts 3 |
| **Scraping** | Selenium (headless Chrome), BeautifulSoup4, curl_cffi, Live NEPSE Index Scraping |
| **AI** | Local Ollama (Qwen 2.5:3b / DeepSeek-R1) for low-latency portfolio stategy verdicts |

---

## Architecture Map

```
backend/
  app/
    main.py              # FastAPI entry + lifespan (init_db, seed_fees, backup, scheduler)
    config.py            # pydantic-settings env config
    database.py          # SQLAlchemy engine, SessionLocal, get_db()
    api/                 # Route handlers (thin controllers)
      members.py         # CRUD + credentials (Fernet encrypted)
      transactions.py    # CRUD + CSV/DP upload + fee auto-calc
      portfolio.py       # Summary, holdings, history, snapshots, closed positions
      prices.py          # Merged LTP + NAV endpoint
      scraper.py         # Trigger scrapers (companies, prices, NAV, MeroShare sync)
      ipo.py             # Open IPOs + background apply jobs
      config_api.py      # Fee config CRUD with date-versioning
      insights.py        # Fundamental data viewer
      dividends.py       # Dividend history & tracking
      analysis.py        # Executive summary + AI verdict endpoints
      ai_review.py       # Ollama bridge for strategy reviews
      groups.py          # Custom member groups
      stock_detail.py    # 360° scrip detail (qty breakdown, XIRR, ROI, Graham, dividends)
    models/              # SQLAlchemy ORM
      member.py          # Member + MeroShareCredentials
      company.py         # Company (symbol, sector, instrument)
      transaction.py     # Transaction (all types + SIP fields)
      holding.py         # Current holdings (qty, wacc, tax_wacc)
      price.py           # LivePrice, NavValue, FeeConfig, IssuePrice, PriceHistory, IndexHistory
      portfolio_snapshot.py
      dividend.py        # DividendHistory model
      fundamental.py     # StockOverview + FundamentalReport
    schemas/             # Pydantic v2 request/response models
    services/            # Business logic (KEEP ROUTES THIN)
      portfolio_engine.py   # WACC replay, batch XIRR, segmented equity/SIP metrics, tech indicators
      fee_calculator.py     # SEBON fee structure with historical versioning
      history_parser.py     # MeroShare CSV parser with smart type detection
      dp_parser.py          # SIP statement parsers (PDF/CSV/XLSX)
      native_parser.py      # Portfolio CSV import
      portfolio_history.py  # Computed portfolio value vs NEPSE index (trading-days-only)
      ipo_bot.py            # Selenium MeroShare IPO application bot
      backup_service.py     # Daily/monthly SQLite backups + startup backup
      stock_detail.py       # Aggregates all data for single scrip detail view
      analysis/
        executive_summary.py  # Graham's Number, Health Score, Action Badges
        fundamental.py        # Sector-specific fundamental flags
        technical.py          # SMA-based trend classification
    scrapers/
      driver_factory.py      # Shared headless Chrome with anti-detection
      company_scraper.py     # nepalstock.com company list
      price_scraper.py       # ShareSansar live prices & Live NEPSE Index
      nav_scraper.py         # ShareSansar mutual fund NAVs
      meroshare.py           # MeroShare login + CSV download
      issue_autoscraper.py   # IPO/FPO/Right issue prices (HTTP, no Selenium)
      dividend_scraper.py    # Dividend history from ShareSansar
      fundamental_scraper.py # Fundamental data from NepseAlpha
      history_scraper.py     # Historical OHLCV from NEPSE API
    utils/
      encryption.py       # Fernet encrypt/decrypt
      scheduler.py         # APScheduler (backup 23:55 NPT fallback; primary backup runs at startup)
  scripts/
      scrape_portfolio_fundamentals.py # Batch scrape fundamentals for held portfolio stocks only
      scrape_all_fundamentals.py       # Batch scrape fundamentals for ALL valid NEPSE companies in DB

frontend/src/
  main.jsx              # Providers: StrictMode > QueryClient > Router > AntD ConfigProvider
  App.jsx               # Layout: Sider (240px) + Content, route definitions
  services/api.js       # Axios client, 30+ endpoint functions
  pages/
    Dashboard.jsx       # Net worth, equity/SIP split, Overview/Performance/Risk/Dividend tabs
    Holdings.jsx        # Equity/SIP/Closed tabs, Graham Price, Averaging Calculator
    Transactions.jsx    # Full CRUD, pagination, import/export, inline fee editing
    Prices.jsx          # Merged LTP+NAV table with refresh
    ApplyIPO.jsx        # Multi-member IPO application with job polling
    Upload.jsx          # MeroShare sync, CSV upload, DP import, credentials
    Settings.jsx        # Fee config, backup controls, history backfill
    Insights.jsx        # Modular Stock 360° shell holding Technical, Fundamental, and Strategy subtabs
    ScripDetail.jsx     # 360° stock/SIP detail: qty breakdown, yield, XIRR, Graham, txn history, price history chart
    Dividends.jsx       # Dividend history & yield analysis
    Members.jsx         # Member management
    About.jsx           # Project vision & tech info
  components/
    MemberSelector.jsx  # All / Individual / Custom Groups (localStorage)
    dashboard/          # OverviewTab, PerformanceTab, RiskTab, DividendTab
    insights/           # ExecutiveSummary, TechnicalTabs, FundamentalTabs, StrategyTester
    portfolio/          # PriceHistoryCard
```

---

## NEPSE Domain Rules (CRITICAL)

### Fee Structure (SEBON-regulated, date-versioned in `fee_config` table)

| Fee | Current Rate | Notes |
|-----|-------------|-------|
| Broker Commission | ≤50k: 0.36%, >50k: 0.33% | Changed 2024-05-14. Prior: 0.4%/0.37%. Pre-2020: 0.6%/0.55% |
| SEBON Fee | 0.015% equity, 0.010% MF, 0.005% govt bond | |
| DP Charge | Rs. 25/scrip | Per transaction |
| Name Transfer | Rs. 5 | BUY only |
| CGT | <365 days: 7.5%, ≥365 days: 5.0% | On net profit after fees |

### Dual WACC System
- **True WACC**: Actual cash cost per share (includes all fees on BUY, deducts fees on SELL)
- **Tax WACC (MeroShare WACC)**: CDSC rules — BONUS shares valued at Rs. 100/share, RIGHT at issue price. Used by tax authorities
- Both are replayed chronologically from all transactions via `recalculate_holdings()`

### Transaction Types
`IPO | FPO | RIGHT | BONUS | AUCTION | BUY | SELL | TRANSFER_IN | TRANSFER_OUT | MERGE | DEMERGE | DIVIDEND`

### SIP Detection
- Determined by `company.instrument` field (server-side), NOT by symbol length heuristic
- Open-end mutual funds (SIP) have NAV-based valuation, not LTP

### Key Formulas
- **Graham's Number**: `√(22.5 × EPS × BVPS)` — intrinsic value benchmark
- **Dividend True TDS**: `Total Tax = ((Units × Cash% × Par) * 0.05) + ((Units × Bonus% × Par) * 0.05)`. User owes company if `Net Cash < 0`.
- **Health Score (0-100)**: Multi-factorial weighting system including ROE, Sector Quality, Graham Undervaluation, 200-SMA, MACD Momentum, Bollinger Bounds, and RSI Actionable levels.
- **Action Badges**: Strong Buy / Accumulate / Hold / Avoid — derived from Health Score and momentum metrics.
- **XIRR**: Newton-Raphson via `scipy.optimize.newton` (backend). Segmented equity/SIP XIRR computed server-side
- **HHI**: Herfindahl-Hirschman Index for portfolio concentration — sum of squared holding weights
- **Total Returns**: Unrealized P&L + Realized Profit + Dividend Income
- **AI Trading R:R**: Net Reward / Risk. Where `Net Reward = (Target - Entry) - (7.5% CGT on Profit) - (0.8% Total commissions)`.

---

## Code Patterns & Conventions

### Backend
- **Virtual environment**: ALL backend dependency changes (`pip install`) MUST be done inside the project's virtual environment (`backend/venv`). Activate with `venv\Scripts\activate` (Windows) or `source venv/bin/activate` (Linux/Mac) before installing. Always update `requirements.txt` after installing
- **Service layer pattern**: Routes are thin dispatchers → all business logic in `services/`
- **DB sessions**: Use `db: Session = Depends(get_db)` in routes. NEVER pass route-scoped `db` to background tasks — create fresh `SessionLocal()` in task
- **Fee calculation**: Always use `fee_calculator.py` functions. Fees are date-versioned — pass `txn_date` to get historically correct rates
- **Holdings recalculation**: After ANY transaction change, call `recalculate_holdings(db, member_id, symbol)` — it replays all transactions chronologically
- **Error handling**: Use `HTTPException` for API errors, never return dicts with error details
- **Scraper pattern**: `driver_factory.py` → headless Chrome with anti-detection. Always `driver.quit()` in finally block
- **Caching**: `_FEE_CACHE` in fee_calculator (dict, max 1000 entries). Clear via `clear_fee_cache()` on config update
- **Batch queries**: Prefer single bulk queries over N+1 loops. See `portfolio_engine.py` for reference (batched tech indicators, batched XIRR)
- **Equity vs SIP**: Use `company.instrument == 'Open-End Mutual Fund'` to classify SIPs. Never use symbol-length heuristic. Backend `PortfolioSummary` provides segmented `equity_xirr`, `sip_xirr`, `equity_dividend_income`, `sip_dividend_income` fields

### Frontend
- **State**: TanStack Query for server state (30s staleTime, 1 retry). No Redux/Context for data
- **UI Components**: Ant Design 6 (dark theme, primary: `#6C5CE7`). Use AntD components, not custom HTML
- **API calls**: All through `services/api.js`. Axios instance with `/api` base URL (Vite proxies to :8000)
- **Member selection**: `MemberSelector` component → passes `member_id` or `member_ids[]` query params
- **Styling**: CSS custom properties in `index.css`. Dark purple/navy theme. No Tailwind
- **Dashboard XIRR**: Use backend-provided `summary.equity_xirr` / `summary.sip_xirr`. Do NOT fetch bulk transactions for frontend XIRR computation
- **Equity vs SIP treatment**: Treat them as fundamentally different instruments. Equity has sector allocation, Graham, RSI, HHI; SIPs have NAV-based valuation, no technical indicators

---

## Guardrails

### Pre-Implementation
1. **Search before coding**: `grep_search` the codebase. Read `documentation.md` for context
2. **Never duplicate**: Check existing services, components, API endpoints before creating new ones
3. **Plan before editing**: Structure your steps mentally before touching files
4. **Clarify ambiguity**: Ask before making architectural decisions

### Implementation
5. **Never modify DB schema directly**: Use `create_all()` pattern (Alembic not configured). Add new columns to models, they'll be created on fresh DB
6. **Fee calculations**: ALWAYS use `fee_calculator.py` — never hardcode SEBON rates
7. **WACC integrity**: Any transaction modification MUST trigger `recalculate_holdings()` for affected member+symbol
8. **Background tasks**: Fresh `SessionLocal()`, close in `finally`
9. **Selenium scrapers**: Always quit driver in `finally`. Use `driver_factory.create_driver()`
10. **Imports**: Register new models in `models/__init__.py` and add to `__all__`
11. **Minimize dependencies**: Justify new packages. Install backend packages ONLY inside venv. Update `requirements.txt` / `package.json`
12. **Validate inputs**: Use Pydantic schemas, sanitize data, use `HTTPException` for errors

### Post-Implementation
13. **Update docs**: Modify `documentation.md` for new endpoints, services, or schema changes
14. **Preserve existing comments & docstrings** unrelated to your changes
15. **Token economy**: Modify only necessary code. Brief explanations. No temp files left behind

### Git Workflow Guidelines
16. **Major Features**: An agent should ALWAYS create a new branch, and verify integration with existing features seamlessly.
17. **New Features (Direct)**: If performing feature implementation directly on the branch, git commit the working state FIRST before starting edits.
18. **Minor Corrections**: For quick bug fixes, typos, or minor corrections, there is NO NEED to git commit beforehand.

---

## Known Issues (Don't Reintroduce)

- ~~N+1 XIRR queries~~: Fixed — batched in `batch_xirr_for_holdings()`
- ~~N+1 tech indicator queries~~: Fixed — single PriceHistory query, grouped in-memory
- ~~Background task DB session sharing~~: Fixed — fresh session per task
- ~~isSip() heuristic~~: Fixed — uses `company.instrument` field
- ~~Frontend XIRR recomputation~~: Fixed — backend provides segmented `equity_xirr` / `sip_xirr`
- ~~Backup missed when device sleeps~~: Fixed — backup runs at app startup (deduped per day)
- ~~Redundant get_computed_history in summary~~: Fixed — NEPSE XIRR uses direct index lookup
- ~~Portfolio history iterates all calendar days~~: Fixed — only trading days + transaction dates
- SQLite concurrent writes: Still a limitation — avoid concurrent Selenium + API writes
- No Alembic migrations: `create_all()` won't alter existing tables
- `Transactions.jsx` is 40KB: Needs decomposition but is functional
- `DEBUG=True` default: Causes SQL echo noise. Set `DEBUG=False` in prod `.env`

---

## Running the App

```bash
# Backend (from backend/)
python -m venv venv          # Create virtual environment (first time only)
venv\Scripts\activate         # Activate venv (Windows) — ALWAYS activate before pip install
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

# Frontend (from frontend/)
npm install
npm run dev  # Vite dev server on :5173, proxies /api to :8000
```

> ⚠️ **CRITICAL**: Every `pip install` MUST happen inside the activated virtual environment.
> Never install backend Python packages globally. After installing new packages, run
> `pip freeze > requirements.txt` to persist them.

### Startup Sequence
1. `init_db()` — creates tables if needed
2. `seed_fee_config()` — seeds default SEBON fee tiers
3. `create_database_backup()` — ensures today's backup exists (safe to call multiple times)
4. `start_scheduler()` — APScheduler for 23:55 NPT fallback backup

## Key External Sources

| Source | URL | Data |
|--------|-----|------|
| NEPSE Official | nepalstock.com.np | Company list, trading data |
| ShareSansar | sharesansar.com | Live prices, NAV, issue prices, dividends |
| MeroShare/CDSC | meroshare.cdsc.com.np | Portfolio sync, IPO apply, transaction CSV |
| NepseAlpha | nepsealpha.com | Fundamental data, historical prices |
| Ollama (local) | localhost:11434 | Qwen3:4b AI verdicts |
