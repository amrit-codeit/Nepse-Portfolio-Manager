# NEPSE Portfolio Manager - Agent Skill File

> Purpose: quick operational map for AI agents working in this repo.
> For fuller context, read [documentation.md](D:/Projects/Portfolio/documentation.md).

---

## Identity and domain context

Assume this codebase is a personal-use NEPSE portfolio manager with:

- multi-member portfolio accounting
- MeroShare sync and encrypted credential storage
- dual cost-basis tracking: true WACC and tax WACC
- dividend, issue-price, fundamentals, price, and index scraping
- local and cloud AI analysis
- trading helpers, portfolio review, and IPO automation

Key domain concepts already encoded in code:

- SEBON fee rules are date-versioned
- CGT depends on holding period
- bonus and right shares affect tax logic differently from cash buys
- mutual funds/NAV-based instruments are handled differently from equity

---

## Current stack

| Layer | Stack |
|-------|-------|
| Backend | Python, FastAPI, SQLAlchemy 2, SQLite, APScheduler |
| Frontend | React 19, Vite 7, Ant Design 6, React Query 5 |
| Scraping | Selenium, BeautifulSoup4, `curl_cffi` |
| AI | Ollama local models, Groq cloud, Nvidia cloud |

---

## Current architecture map

```text
backend/
  app/
    main.py              FastAPI entry, startup validation, backup, scheduler
    config.py            settings and AI provider config
    database.py          engine, SessionLocal, init_db, get_db
    api/
      members.py         members, credentials, master-password verification
      companies.py       company list, sectors, single company lookup
      transactions.py    CRUD plus CSV/native/DP imports
      portfolio.py       summary, holdings, history, dividends, AI review
      scraper.py         manual scraper triggers
      config_api.py      fee config endpoints
      prices.py          prices, issues, historical price and index data
      economy.py         macro snapshot, scrape triggers, and alternatives comparison
      ipo.py             open issues, apply, status
      insights.py        symbol-level insights payload
      dividends.py       dividend records and summary
      groups.py          saved member groups
      analysis.py        executive summary and AI verdict endpoints
      stock_detail.py    360-degree stock detail and symbols list
      calculator.py      buy/sell simulation
      screener.py        screener payload
      market_context.py  market context, extended technicals, backtests
      trading.py         trade setups, signals, journal, stats
      notifications.py   unread notifications and mark-as-read status
      system.py          import/export system for market data
    models/
      member.py          Member, MeroshareCredential, MemberGroup
      company.py         Company
      transaction.py     Transaction and enums
      holding.py         Holding
      price.py           LivePrice, NavValue, FeeConfig, IssuePrice, history tables
      portfolio_snapshot.py
      dividend.py        DividendIncome
      fundamental.py     StockOverview, FundamentalReport, QuarterlyGrowth
      trading.py         TradeSetup, TradeJournal
      notification.py    Notification
    services/
      portfolio_engine.py
      fee_calculator.py
      history_parser.py
      dp_parser.py
      native_parser.py
      portfolio_history.py
      stock_detail.py
      trade_intel.py
      economy_service.py
      calculator_service.py
      backup_service.py
      ipo_bot.py
      alert_service.py
      analysis/
        executive_summary.py
        fundamental.py
        technical.py
        ai_service.py
    scrapers/
      company_scraper.py
      price_scraper.py
      nav_scraper.py
      meroshare.py
      issue_autoscraper.py
      history_scraper.py
      dividend_scraper.py
      fundamental_scraper.py
      index_scraper.py
      driver_factory.py
    utils/
      encryption.py
      scheduler.py

frontend/src/
  main.jsx              React Query + Router + AntD providers
  App.jsx               live nav and route shell (includes NotificationBell)
  services/api.js       axios client with X-Master-Password header
  pages/
    Dashboard.jsx
    Holdings.jsx
    Transactions.jsx
    Prices.jsx
    Insights.jsx
    TradingDesk.jsx
    Economy.jsx
    ApplyIPO.jsx
    Upload.jsx
    Settings.jsx
    About.jsx
    Calculator.jsx      present, not currently routed
    Members.jsx         present, not currently routed
    ScripDetail.jsx     present, not currently routed
```

---

## Code truths to trust

### Startup and ops

- `main.py` validates `MASTER_PASSWORD` at startup and exits if it is not a bcrypt hash.
- A database backup runs on startup through `create_database_backup()`.
- APScheduler starts and registers active cron jobs for price scraping (market hours), NAV, index snapshots, dividends, and fundamentals.
- The backend can serve `frontend/dist` when it exists.

### Frontend shell

- The current live routes are only:
  - `/`
  - `/holdings`
  - `/transactions`
  - `/prices`
  - `/insights`
  - `/trading`
  - `/economy`
  - `/apply-ipo`
  - `/upload`
  - `/settings`
  - `/about`
- `Calculator.jsx`, `Members.jsx`, and `ScripDetail.jsx` exist but are not mounted in `App.jsx`.

### Auth and sensitive actions

- The frontend stores a verified secret in `sessionStorage.masterAuth`.
- `frontend/src/services/api.js` sends that value as `X-Master-Password`.
- Sensitive credential endpoints rely on that header.
- MeroShare passwords are encrypted with Fernet on the backend.

### API breadth

Do not assume the app only has the early core routers. The active backend includes:

- portfolio AI review endpoints
- trade-intel review endpoints
- market context and backtesting endpoints
- trading setup and journal endpoints
- dividend and member-group endpoints
- index and fundamentals scraper endpoints

---

## Working rules for this repo

### Backend rules

- Keep route handlers thin. Put logic in `services/`.
- Use `db: Session = Depends(get_db)` for request-scoped DB access.
- Never hardcode fees. Use `fee_calculator.py`.
- After transaction changes, make sure holdings are recalculated.
- For background-style work, create a fresh `SessionLocal()` instead of reusing a request-scoped session.
- Use existing scrapers and service helpers before adding new ones.

### Frontend rules

- Use existing Ant Design patterns and the current dark theme unless the task explicitly changes UI direction.
- Use `services/api.js` instead of ad hoc fetch calls.
- Treat routed and unrouted pages differently. If you add a feature to an unrouted page, confirm whether it also needs route wiring.
- The app already uses React Query. Prefer that for server state.
- Use `<SectionErrorBoundary>` to wrap complex subcomponents (like charts) for UI resilience.
- Use `<FreshnessTag>` to expose data recency on data-heavy dashboards.

### Documentation rules

- If you change routes, startup behavior, model names, or page wiring, update `documentation.md` and this file in the same pass.
- Treat older prose with caution and trust the code first.

---

## Practical hotspots

- [backend/app/main.py](D:/Projects/Portfolio/backend/app/main.py): startup behavior, mounted routers, static serving
- [backend/app/api/portfolio.py](D:/Projects/Portfolio/backend/app/api/portfolio.py): summary/history/dividend/trade-intel/portfolio-AI endpoints
- [backend/app/api/scraper.py](D:/Projects/Portfolio/backend/app/api/scraper.py): manual scraper trigger surface
- [backend/app/services/portfolio_engine.py](D:/Projects/Portfolio/backend/app/services/portfolio_engine.py): accounting and metrics core
- [backend/app/services/analysis/ai_service.py](D:/Projects/Portfolio/backend/app/services/analysis/ai_service.py): AI provider routing and prompt generation
- [frontend/src/App.jsx](D:/Projects/Portfolio/frontend/src/App.jsx): what the user can actually navigate to
- [frontend/src/services/api.js](D:/Projects/Portfolio/frontend/src/services/api.js): frontend contract with the backend

---

## Current repo caveats

- No automated test suite is present.
- SQLite is the only database and may lock under heavier concurrent writes.
- Scrapers are fragile by nature because they depend on external site structure.
- Several large frontend files are still monolithic.

When in doubt, read the code path end to end before making assumptions.

---

## Update Practices

To keep the repository clean and version numbers meaningful, follow these practices when applying updates:

1. **Avoid Minor Version Bumps for Trivial Changes**: Do not bump versions in `changelog.md` or `documentation.md` for simple bug fixes, typo corrections, or small refactors. Reserve version bumps for grouped, significant feature additions or major architectural shifts.
2. **Batch Documentation Updates**: When performing multi-step tasks, update `documentation.md`, `skill.md`, and `changelog.md` only once at the end of the feature development cycle, rather than sequentially after every minor step.
3. **Keep `skill.md` Concise**: `skill.md` is meant to be a quick operational map. When adding new modules, ensure they fit the brief format (e.g., just the file name and a 3-5 word description).
4. **Use "Unreleased" in Changelog**: For ongoing development, log changes under an `## [Unreleased]` block at the top of `changelog.md`. Only convert this to a versioned release (e.g., `## [1.9.0]`) when finalizing a major milestone.
5. **Sync Architecture Diagrams**: When introducing a new top-level router, service, or model, update both `documentation.md`'s API table and `skill.md`'s architecture map simultaneously.
