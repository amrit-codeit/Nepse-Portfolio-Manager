# Nepal Portfolio Manager — Agent Remediation Guide

> **Purpose:** This document is a task guide for AI coding agents working on the Nepal Portfolio Manager codebase. Each section maps a specific gap to its root cause, the standard industry practice for addressing it, and concrete actionable tasks. Work through sections in priority order unless instructed otherwise.
>
> **Base documentation:** `documentation.md` (last audited 2026-04-28)
> **Stack:** FastAPI + SQLAlchemy 2 + SQLite (backend) / React 19 + Ant Design 6 + TanStack Query 5 (frontend)

---

## How to Use This Guide

Each remediation item follows this structure:

- **What is missing** — the specific gap
- **Why it matters** — consequence in this financial domain
- **Standard practice** — the industry-accepted pattern to solve it
- **Tasks** — concrete work items for the agent

Items are grouped by priority tier. Complete all 🔴 Critical items before moving to 🟠 High, and so on.

---

## 🔴 CRITICAL — Address First

---

### C-1 · No Test Suite

**What is missing:** There are zero automated tests anywhere in the repository. No unit tests, no integration tests, no fixtures.

**Why it matters:** This is a financial ledger. Silent bugs in WACC calculation, fee lookup, or transaction parsing produce wrong cost-basis figures that compound silently across every portfolio computation. There is no safety net for refactoring.

**Standard practice:**
- Use **pytest** as the test runner for the backend. It is the de facto standard for FastAPI/SQLAlchemy projects.
- Organise tests to mirror the source tree: `backend/tests/unit/services/`, `backend/tests/integration/api/`, etc.
- Use **pytest fixtures** with an in-memory SQLite database (`:memory:`) for isolation. Every test that touches the DB gets a fresh session via a fixture; no test shares state with another.
- Use **`httpx.AsyncClient`** with FastAPI's `app` object for integration tests — this is the FastAPI-recommended approach and does not require a running server.
- Target **100% coverage on financial calculation functions** (WACC, tax WACC, fee lookup, XIRR). Use `pytest-cov` to measure and enforce a coverage floor in CI.
- Use **parameterised tests** (`@pytest.mark.parametrize`) for edge cases: zero-quantity holdings, same-day buy/sell, rights issue followed by sell, bonus shares, single-transaction portfolio.
- For parsers (`history_parser.py`, `dp_parser.py`, `native_parser.py`), maintain a folder of anonymised sample files (`backend/tests/fixtures/`) covering every known format variant. Each parser test loads a fixture and asserts the resulting transaction list exactly.

**Tasks:**
1. Create `backend/tests/` directory with `conftest.py` defining: `db_session` fixture (in-memory SQLite), `test_client` fixture (AsyncClient wrapping the FastAPI app), and a `seed_companies` fixture with a small set of known NEPSE symbols.
2. Write unit tests for `portfolio_engine.py` covering: empty portfolio, single buy, buy then partial sell, buy then full sell, bonus share credit, rights issue, WACC drift across multiple buys at different prices.
3. Write unit tests for `fee_calculator.py` covering: date-range boundary conditions, known historical fee rates (verify against SEBON schedule), cache invalidation behaviour.
4. Write unit tests for `history_parser.py` and `dp_parser.py` using fixture files for each supported import format.
5. Write integration tests for `/api/portfolio/summary` and `/api/portfolio/holdings` using a seeded in-memory database. Assert key fields: `wacc`, `tax_wacc`, `total_investment`, `current_value`, `gain_loss_pct`.
6. Add `pytest-cov` to `requirements.txt` and configure a minimum coverage threshold of 80% for `services/` in `pytest.ini` or `pyproject.toml`.
7. Document the test-running command in the README.

---

### C-2 · Master Password Transmitted on Every Request

**What is missing:** The raw master password (retrieved from `sessionStorage.masterAuth`) is injected into the `X-Master-Password` header by Axios on every outgoing API call — including price fetches, scraper triggers, and AI calls.

**Why it matters:** The password travels the network on every request, appears in browser DevTools, and is logged by any standard HTTP access log unless explicitly stripped. A single compromised log file exposes the credential.

**Standard practice:**
- **Token exchange pattern:** The password should travel exactly once — at login verification. The backend verifies the bcrypt hash and responds with a short-lived signed token (e.g., a JWT with a 15-minute expiry, or a `secrets.token_urlsafe(32)` stored server-side in memory with a TTL).
- Subsequent requests send only the token in an `Authorization: Bearer <token>` header.
- The token is stored in `sessionStorage` (acceptable for a local single-user app) and cleared on inactivity timeout (already implemented at 15 minutes — keep this).
- The backend validates the token on protected routes using a FastAPI dependency (`Depends(verify_token)`).
- The password itself never appears in any log. Configure Uvicorn's access log format to exclude request headers, or use a middleware that strips the `Authorization` header before logging.
- For a local-first single-user app, a simple in-memory token store (a dict with `{token: expiry}`) is sufficient — no Redis required.

**Tasks:**
1. Add a `POST /api/auth/login` endpoint that accepts the password, verifies the bcrypt hash, and returns a signed token with an expiry timestamp.
2. Add a `POST /api/auth/logout` endpoint that invalidates the token server-side.
3. Create a FastAPI dependency `verify_token(token: str = Depends(oauth2_scheme))` and apply it to all protected routers (members, transactions, portfolio mutations, scraper triggers, IPO bot).
4. Update `frontend/src/services/api.js` to store the token (not the password) in `sessionStorage`, and send it as `Authorization: Bearer <token>` instead of `X-Master-Password`.
5. Update the existing 15-minute inactivity handler to call `/api/auth/logout` before clearing `sessionStorage`.
6. Configure Uvicorn middleware or logging filters to exclude the `Authorization` header from access logs.

---

### C-3 · No Database Migration System

**What is missing:** Schema changes are applied by `init_db()` which only creates missing tables. There is no migration history, no rollback path, and no record of what schema version the current `portfolio.db` is at.

**Why it matters:** The first time a developer adds a non-nullable column to `Transaction` or `Holding`, existing databases either break silently or fail to start. Live financial history cannot be recreated; it must be migrated safely.

**Standard practice:**
- **Alembic** is the standard migration tool for SQLAlchemy projects. It generates versioned migration scripts that can be applied forward (upgrade) or reversed (downgrade).
- Initialise Alembic with `alembic init alembic` in the `backend/` directory.
- Configure `alembic.ini` to read `DATABASE_URL` from the same `.env` the app uses (via `env.py`).
- Set `target_metadata = Base.metadata` in `alembic/env.py` so Alembic can auto-generate migration scripts with `alembic revision --autogenerate`.
- Every schema change goes through a migration script — never modify `init_db()` directly for structural changes.
- Add a startup check that verifies the database is at the latest migration revision. If not, log a clear error and refuse to start (prevents running stale schema silently).
- Keep `init_db()` only for development convenience (fresh databases). In any environment with an existing `portfolio.db`, Alembic migrations are the path.
- Store migration scripts in version control (`backend/alembic/versions/`).

**Tasks:**
1. Add `alembic` to `backend/requirements.txt`.
2. Run `alembic init alembic` and configure `env.py` to use the app's `DATABASE_URL` and `Base.metadata`.
3. Generate an initial migration from the current models: `alembic revision --autogenerate -m "initial_schema"`. Review and commit the generated script.
4. Add a startup check in `main.py` lifespan that runs `alembic upgrade head` or at minimum checks that `alembic current` matches `alembic heads`.
5. Document the migration workflow in the README: how to create a migration after a model change, how to apply it, how to roll back.

---

### C-4 · Scraper Failures Are Silent

**What is missing:** There is no error handling, retry logic, staleness tracking, or user-facing indication of scraper health. When `nepalstock.com` or `sharesansar.com` change their HTML, scrapers return nothing and the app continues displaying stale data.

**Why it matters:** A NEPSE investor making position decisions on prices that are three days stale because a scraper silently died is materially worse than seeing no data at all. Silent failure is the worst failure mode for a data-driven financial tool.

**Standard practice:**
- Add a `last_scraped_at` timestamp and `scrape_status` (enum: `success`, `partial`, `failed`) column to every table populated by scrapers (`LivePrice`, `NavValue`, `PriceHistory`, `IndexHistory`, `FundamentalReport`, `DividendIncome`). This is the foundation — nothing else works without it.
- In each scraper, wrap the main logic in try/except, catch both HTTP and parse errors separately, and write the outcome to the status columns regardless of success or failure.
- Implement **exponential backoff with jitter** for HTTP-level retries (e.g., 3 attempts, delays of 2s, 4s, 8s + random jitter). The `tenacity` library makes this trivial in Python.
- For Selenium-based scrapers, add a timeout on the `WebDriverWait` and catch `TimeoutException` explicitly — do not let it propagate uncaught.
- Expose scraper health via the existing `GET /api/health` endpoint: return the most recent `last_scraped_at` and `scrape_status` per data source.
- On the frontend, the price/NAV display components should read `last_scraped_at` and show a visible staleness badge if data is older than a configurable threshold (e.g., 2 hours for prices, 7 days for fundamentals).
- Add structured logging for every scraper run: source, start time, end time, records upserted, errors encountered.

**Tasks:**
1. Add migration to add `last_scraped_at` (DateTime, nullable) and `scrape_status` (String, default `"pending"`) to `LivePrice`, `NavValue`, `FundamentalReport`, `DividendIncome`, `IndexHistory`.
2. Create a shared `ScraperResult` dataclass in `backend/app/scrapers/base.py` with fields: `source`, `status`, `records_upserted`, `error_message`, `duration_seconds`. All scrapers return this.
3. Add `tenacity` to `requirements.txt` and wrap HTTP calls in each scraper with `@retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=2, max=10))`.
4. Update `GET /api/health` to include a `scrapers` section showing the latest `last_scraped_at` and `scrape_status` per data type.
5. In the frontend price display components, show a `<Tag color="warning">Stale</Tag>` indicator when `last_scraped_at` is older than 2 hours for live prices and 24 hours for NAV.
6. Add a `ScraperLog` model (scraper name, run timestamp, status, records, error) and persist each run. Expose recent scraper logs in the Settings page.

---

## 🟠 HIGH — Address After Critical

---

### H-1 · Backup Strategy Is Primitive

**What is missing:** The database backup runs once at startup only. APScheduler is running but has no active jobs. There is no backup rotation, no integrity check, and no restore procedure.

**Standard practice:**
- Schedule a nightly backup using APScheduler's `CronTrigger`. For a local app, `02:00` daily is a sensible default (after market close and data scraping).
- Implement **backup rotation**: keep the last N backups (configurable, default 7). On each backup run, delete the oldest file if the count exceeds N.
- After writing a backup, validate it by opening it with SQLite's `PRAGMA integrity_check`. Log the result. If integrity check fails, do not delete the previous backup.
- Store backups in a configurable `BACKUP_DIR` path (default: `backend/backups/`). Make this a config setting in `.env`.
- Document a restore procedure in the README: stop the app, copy the backup file over `portfolio.db`, restart.
- Optionally expose `GET /api/config/backups` to list available backup files with timestamps and sizes, and `POST /api/config/restore` to trigger a restore from a selected backup (with master password gate).

**Tasks:**
1. Add `BACKUP_DIR` and `BACKUP_RETENTION_DAYS` (default 7) to `config.py`.
2. Add a nightly cron job in `scheduler.py` using `CronTrigger(hour=2, minute=0)` calling `create_database_backup()`.
3. Update `backup_service.py` to: (a) run `PRAGMA integrity_check` on the new backup file before finalising, (b) enumerate existing backups and delete oldest when count exceeds `BACKUP_RETENTION_DAYS`.
4. Add a `GET /api/config/backups` endpoint listing backup files (name, size, created_at).
5. Add restore procedure to `README.md`.

---

### H-2 · No Concurrency or Race Condition Handling

**What is missing:** Transaction mutations are expected to be followed by holdings recalculation, but there is no documented lock or queue preventing concurrent mutations. Scraper jobs have no idempotency guard. The IPO bot can launch multiple Chrome instances.

**Standard practice:**
- Enable **SQLite WAL mode** explicitly at connection time: `PRAGMA journal_mode=WAL`. WAL allows concurrent reads with a single writer and is the correct mode for this use case. Add it as a connection event listener in SQLAlchemy.
- For the recalculation-after-mutation flow, use a **database-level advisory lock pattern**: begin the transaction, perform the mutation, recalculate holdings within the same transaction, commit atomically. Never split mutation and recalculation into two separate database round-trips.
- For scraper jobs, implement a **job lock table** or an in-memory set of currently-running scraper names. If a scraper job is triggered while the same scraper is already running, the new trigger should return a `409 Conflict` response rather than launching a duplicate.
- For the IPO bot, use a **semaphore** (Python's `asyncio.Semaphore` or a `threading.Semaphore` depending on execution model) to limit concurrent Chrome instances. Default limit of 1 is safest; make it configurable.

**Tasks:**
1. Add a SQLAlchemy `event.listen(engine, "connect", ...)` hook that sets `PRAGMA journal_mode=WAL` and `PRAGMA foreign_keys=ON` on every new connection.
2. Refactor `transactions.py` API endpoints to perform mutation + holdings recalculation inside a single SQLAlchemy transaction (either use `session.begin()` context manager or ensure rollback on recalculation failure).
3. Add an in-memory `set` of active scraper names in `scheduler.py` or a new `scraper_lock.py` module. The scraper API endpoints check this set before launching and return `409` if already running.
4. Add a semaphore in `ipo_bot.py` limiting concurrent Selenium sessions.

---

### H-3 · No Structured Audit Logging

**What is missing:** There is no audit trail for financial mutations (transaction create/update/delete), scraper runs, AI calls, or MeroShare syncs.

**Standard practice:**
- Use Python's **`structlog`** library for structured JSON logging. It is compatible with standard `logging` and produces machine-readable output suitable for later querying.
- Define log levels clearly: `DEBUG` for internal state, `INFO` for normal operations (scraper completed, transaction created), `WARNING` for recoverable issues (scraper returned partial data, retry triggered), `ERROR` for failures.
- For financial mutations specifically, log: who triggered it (session context), what model was affected, what the before/after state was (for updates), and the timestamp. This is the minimum audit trail.
- Log AI calls with: provider (Ollama/Groq/Nvidia), model name, prompt template name, approximate token count if available, response time, and whether it succeeded.
- Write logs to a rotating file (`logs/app.log`) with `RotatingFileHandler` (max 10MB, keep 5 files). Also output to stdout for development visibility.
- Do not log sensitive values: the master password, MeroShare passwords (even encrypted), or the `ENCRYPTION_KEY`.

**Tasks:**
1. Add `structlog` to `requirements.txt`.
2. Configure `structlog` in `main.py` with JSON output to `logs/app.log` and pretty output to stdout when `DEBUG=True`.
3. Add audit log statements to: transaction create/update/delete endpoints, MeroShare sync completion, each scraper run (start, end, record count, status), each AI call (provider, model, duration, success).
4. Ensure `logs/` is in `.gitignore`.
5. Add `LOG_LEVEL` and `LOG_FILE` settings to `config.py`.

---

### H-4 · Unwired Pages Have No Disposition

**What is missing:** `Calculator.jsx`, `Members.jsx`, and `ScripDetail.jsx` exist in `src/pages/` but are not in the router. Their status is undocumented.

**Standard practice:**
- Every file in the repository should have a clear, documented status: **active**, **in progress** (with a linked task), or **deprecated** (scheduled for deletion by a specific date or milestone).
- Dead code left indefinitely without documentation is technical debt that misleads future developers.
- For pages that are in progress, add a route behind a feature flag or a dev-only route so they can be tested in context.
- For deprecated files, create a deletion task and set a deadline. Until deleted, add a comment at the top of the file explaining its status.

**Tasks:**
1. For each unwired page, make a decision and document it: route it now, mark it in-progress with a `// TODO:` comment block at the file top, or delete it.
2. If `ScripDetail.jsx` is intended as a symbol drill-down page (which is the obvious intent), wire it as a dynamic route: `/scrip/:symbol`. Update the `Insights` page and `Holdings` table to link to it.
3. If `Members.jsx` is intended as a member management page, wire it as `/members`. Update the sidebar navigation.
4. If `Calculator.jsx` is intended as the position sizing calculator, wire it as `/calculator`. Update the sidebar.
5. Update `App.jsx` router and sidebar navigation accordingly.

---

### H-5 · No Global Frontend Error Boundary

**What is missing:** The React provider stack has no `ErrorBoundary`. A render-time crash in any component (chart rendering, AI response parsing, malformed price data) takes down the entire app with a blank screen.

**Standard practice:**
- Wrap the app in a **class-based `ErrorBoundary`** component (React requires class components for `componentDidCatch`). Place it just inside `StrictMode` so it catches the entire tree.
- The fallback UI should show a friendly error message, the error detail (in development), and a "Reload app" button.
- For critical dashboard panels that display live financial data, use **per-panel error boundaries** so a crash in one chart does not take down the whole dashboard. Wrap each tab content in its own boundary.
- Use **React Query's `onError` callbacks** and `useQuery`'s `error` state for network errors — these are handled gracefully already if configured. Error boundaries handle render-time errors that React Query cannot catch.
- Optionally integrate with a local error logging endpoint: `POST /api/health/frontend-error` that stores client-side errors for debugging.

**Tasks:**
1. Create `frontend/src/components/ErrorBoundary.jsx` with `componentDidCatch` logging and a fallback UI.
2. Wrap the `App` component in `main.jsx` with `<ErrorBoundary>`.
3. Add per-panel error boundaries around `AIPortfolioAnalyst`, `StrategyTester`, `AITradingCopilot`, and any component consuming live price WebSocket or chart data.
4. Add a user-visible error notification (Ant Design `Alert` component) in the fallback UI with a "Copy error details" button to help the user report the issue.

---

## 🟡 MEDIUM — Address After High

---

### M-1 · Monolithic Frontend Page Components

**What is missing:** `Dashboard.jsx`, `Holdings.jsx`, `Transactions.jsx`, `Prices.jsx`, and `TradingDesk.jsx` are described as monolithic. Large single-file components in React hurt performance, readability, and testability.

**Standard practice:**
- Apply **React.lazy + Suspense** for heavy tab panels. A tab that is not currently visible should not render or fetch data until the user activates it.
- Split each page into: a thin page shell (layout, routing, top-level state), individual tab/panel components (each in its own file), and presentational sub-components (tables, charts, stat cards).
- Co-locate the React Query `useQuery` call with the component that consumes the data. Avoid passing raw data down many levels of props (prop drilling). Use React Query's `queryClient.prefetchQuery` for tabs that are likely to be viewed next.
- Target a maximum of ~300 lines per component file. If a file exceeds this, it is doing too many things.
- For `TradingDesk.jsx` specifically, the sub-components (`StockAnalysis`, `AITradingCopilot`, `LiveTechnicals`, `TechnicalScreener`, `RiskCalculator`) already exist — the task is to ensure each is a lazy-loaded, independently-fetching component, not a child that blocks on the parent's data load.

**Tasks:**
1. Audit `Dashboard.jsx` and extract each tab (`OverviewTab`, `PerformanceTab`, `RiskTab`, `DividendTab`, `ActionCenterTab`, `AIPortfolioAnalyst`) into separate files under `components/dashboard/`. Apply `React.lazy` to `AIPortfolioAnalyst` as it is the heaviest.
2. In `Holdings.jsx`, separate: the holdings table, the closed positions table, the snapshot chart, and the member filter/group selector. Each should manage its own data fetching.
3. In `Transactions.jsx`, separate the import modal, the filter toolbar, and the editable table into distinct components.
4. Ensure all lazy-loaded components are wrapped in `<Suspense fallback={<Skeleton />}>` using Ant Design's `Skeleton` component.

---

### M-2 · No API Versioning

**What is missing:** All routes are at `/api/` with no version prefix.

**Standard practice:**
- Add a version prefix to all routes: `/api/v1/`. This is a single-line change in `main.py` per router mount and costs nothing now.
- Maintain the old unversioned routes as deprecated aliases for one release cycle if needed, then remove them.
- Document the versioning policy in the README: the API version is bumped when a response schema changes in a breaking way (field removed or renamed). Adding fields is non-breaking and does not require a version bump.

**Tasks:**
1. Update all `include_router` calls in `main.py` to use `prefix="/api/v1/..."` instead of `"/api/..."`.
2. Update `frontend/src/services/api.js` Axios base URL to `/api/v1`.
3. Update the `GET /api/health` route to remain at `/api/health` (unversioned, standard convention).
4. Document the versioning policy in README.

---

### M-3 · React Query staleTime Is Uniform Across All Data Types

**What is missing:** A single 30-second `staleTime` is applied globally. This is inappropriate for data with vastly different update frequencies.

**Standard practice:**
- Define `staleTime` per query key family based on how frequently the underlying data changes. A sensible scheme for this app:

| Data type | Recommended staleTime |
|---|---|
| Live prices (market hours) | 30 seconds |
| Live prices (after hours) | 5 minutes |
| NEPSE index | 60 seconds |
| NAV | 24 hours |
| Company master list | 7 days |
| Fundamental reports | 24 hours |
| Dividend records | 7 days |
| Portfolio summary/holdings | 60 seconds (changes on transaction mutations) |
| Historical OHLCV | `Infinity` (append-only, never stale) |

- Use React Query's `QueryClient` default options for the most common case, and override `staleTime` per `useQuery` call for outliers.
- Consider using **`gcTime`** (formerly `cacheTime`) to control how long inactive query results stay in memory. Historical data can have a long `gcTime`; real-time data should be shorter.

**Tasks:**
1. Define a `STALE_TIMES` constant object in `frontend/src/services/queryConfig.js` with values as described above.
2. Update `main.jsx` `QueryClient` `defaultOptions` to set `staleTime` to 60 seconds (the most common case).
3. Override `staleTime` in each `useQuery` call for live prices (30s), historical OHLCV (`Infinity`), NAV (24h), and fundamentals (24h).
4. Add a `refetchInterval` of 30 seconds to live price queries when the current time is within NEPSE trading hours (Sunday–Thursday, 11:00–15:00 NPT). Pause `refetchInterval` outside trading hours.

---

### M-4 · No Nepali Calendar / Trading Day Awareness

**What is missing:** NEPSE uses the Bikram Sambat (BS) calendar and trades Sunday–Thursday. There is no documented utility for BS↔AD conversion or trading day detection.

**Standard practice:**
- Use the **`bikram-sambat`** or **`nepalify`** npm package for BS↔AD conversion in the frontend. Do not implement this manually — the BS calendar has irregular month lengths that change each year.
- Create a `frontend/src/utils/nepaliDate.js` utility module that exports: `adToBS(date)`, `bsToAD(bsYear, bsMonth, bsDay)`, `isTradingDay(date)`, `isMarketOpen()`, `nextTradingDay(date)`.
- Trading day rule: NEPSE is open Sunday through Thursday, closed Friday and Saturday, and closed on public holidays. Maintain a hardcoded list of annual public holidays (update yearly) or fetch from a public API.
- Use BS dates when displaying dividend book closure dates, fiscal year labels, and transaction dates sourced from MeroShare (which uses BS internally).
- Show the current Nepali date prominently in the Dashboard header.

**Tasks:**
1. Add `bikram-sambat` (or equivalent) to `frontend/package.json`.
2. Create `frontend/src/utils/nepaliDate.js` with the utility functions listed above.
3. Add a `isMarketOpen()` check to the live price component — show a "Market Open" / "Market Closed" badge using Ant Design `Badge`.
4. Update dividend display to show book closure dates in BS format with AD in a tooltip.
5. Update the `refetchInterval` logic from M-3 to use `isMarketOpen()` from this utility.

---

### M-5 · AI Provider Governance Is Absent

**What is missing:** No retry/fallback chain, no rate limit handling, no cost tracking, and no indication to the user when an AI call fails silently.

**Standard practice:**
- Implement a **provider fallback chain** in `ai_service.py`: if the primary provider (Groq or Nvidia) fails or rate-limits, automatically retry with the next provider (Ollama local as the final fallback since it has no rate limits).
- Use `tenacity` for retry logic with `retry_if_exception_type(RateLimitError)` and exponential backoff.
- For cloud providers, parse the `Retry-After` header from 429 responses and honour it.
- Track token usage per AI call if the provider API returns usage metadata. Store in a lightweight `AIUsageLog` table (provider, model, prompt_tokens, completion_tokens, timestamp). Expose a monthly usage summary in Settings.
- On the frontend, AI verdict panels should have explicit loading, success, and error states. Never show a stale previous verdict without indicating it is stale. Show the provider and model name that generated the verdict.
- Add a configurable AI timeout (default 30 seconds) in `config.py`. If the provider does not respond within the timeout, fail fast and show an error — do not leave the UI hanging indefinitely.

**Tasks:**
1. Add `AI_TIMEOUT_SECONDS` (default 30) and `AI_FALLBACK_ORDER` (default `["groq", "nvidia", "ollama"]`) to `config.py`.
2. Refactor `ai_service.py` to iterate through `AI_FALLBACK_ORDER` on failure, logging each attempt.
3. Add a `AIUsageLog` model and persist usage metadata (provider, model, token counts, duration) after each successful call.
4. Add `GET /api/analysis/usage` endpoint returning monthly AI usage summary. Surface in the Settings page.
5. Update AI verdict frontend components to show: current loading state with provider name, error state with retry button, and the provider+model that generated the displayed result.

---

### M-6 · No Documented Data Contracts Between Scrapers and Services

**What is missing:** Scrapers write raw data to the database and the service layer reads it, but there are no Pydantic schemas defining the expected shape of scraped data.

**Standard practice:**
- Define a **Pydantic schema** for the output of each scraper (e.g., `ScrapedPrice`, `ScrapedFundamental`, `ScrapedDividend`). These are the contracts between the scraper and the service layer.
- Scrapers validate their output against the schema before writing to the database. If a field that was previously present is now missing (HTML structure changed), the schema validation error is caught, logged, and reported as a `partial` or `failed` scrape status — not silently ignored.
- Place these schemas in `backend/app/scrapers/schemas.py`.
- This also makes unit-testing scrapers easier: a scraper test can mock HTTP responses and assert the returned schema matches expectations.

**Tasks:**
1. Create `backend/app/scrapers/schemas.py` with Pydantic models for each scraper's output.
2. Update each scraper to validate its parsed output against the schema using `model.model_validate(data)` before upserting to the database.
3. Catch `ValidationError` in each scraper, log the error with field details, and set `scrape_status = "partial"` if some records validated and others did not.

---

## 🔵 DOCUMENTATION — Address Continuously

---

### D-1 · No Data Flow Diagram

**What is missing:** There is no diagram showing which scrapers write to which models, which services read which models, and which API endpoints expose which data.

**Tasks:**
1. Create `docs/data-flow.md` with a Mermaid diagram (renders in GitHub/GitLab) showing: each scraper → the models it writes → the services that read those models → the API endpoints that expose the data.
2. Update this diagram whenever a new scraper, model, or service is added.

---

### D-2 · No Failure Mode Documentation

**What is missing:** There is no documented behaviour for common failure scenarios.

**Tasks:**
Create `docs/failure-modes.md` documenting what happens and what to do when:
- MeroShare is unreachable during sync (expected behaviour, error message shown, no data loss)
- Chrome/Selenium fails to launch (error logged, endpoint returns 503, user sees error in UI)
- Ollama is not running (AI features disabled, clear message shown, no crash)
- SQLite file is locked (startup error with actionable message)
- A scraper returns partial data (partial status logged, existing data retained, staleness badge shown)
- The backup disk is full (startup backup skipped with warning log, app continues)

---

### D-3 · No Changelog or Architectural Decision Log

**What is missing:** There is no record of why key architectural decisions were made.

**Tasks:**
1. Create `docs/decisions/` directory.
2. Create an ADR (Architectural Decision Record) for each key decision: SQLite over PostgreSQL, three AI providers, local-first architecture, single master password auth model, APScheduler over Celery. Each ADR should document: context, decision, consequences, and alternatives considered. Use the lightweight ADR template (Status / Context / Decision / Consequences).
3. Create `CHANGELOG.md` at the repo root using Keep a Changelog format. Start from the current state and add entries going forward.

---

### D-4 · Input Validation Not Documented

**What is missing:** The API surface is documented (what endpoints exist) but the request validation rules are not documented anywhere.

**Tasks:**
1. For each mutating endpoint (transaction create/update, member create, IPO apply), document the Pydantic request schema in the docstring or in `docs/api-contracts.md`: field names, types, nullable status, and validation constraints (min/max values, allowed enums).
2. Ensure every transaction mutation validates: quantity > 0, price > 0, date not in the future, symbol exists in `Company` table. Add these as Pydantic validators if not already present.
3. Expose FastAPI's auto-generated OpenAPI docs (`/docs`) in development mode. Confirm the schemas shown there match the documented contracts.

---

## Reference: Priority Summary

| ID | Gap | Priority | Effort |
|----|-----|----------|--------|
| C-1 | No test suite | 🔴 Critical | High |
| C-2 | Password in every request header | 🔴 Critical | Medium |
| C-3 | No database migration system | 🔴 Critical | Medium |
| C-4 | Silent scraper failures | 🔴 Critical | Medium |
| H-1 | Primitive backup strategy | 🟠 High | Low |
| H-2 | No concurrency handling | 🟠 High | Medium |
| H-3 | No audit logging | 🟠 High | Low |
| H-4 | Unwired pages undocumented | 🟠 High | Low |
| H-5 | No global error boundary | 🟠 High | Low |
| M-1 | Monolithic page components | 🟡 Medium | High |
| M-2 | No API versioning | 🟡 Medium | Low |
| M-3 | Uniform React Query staleTime | 🟡 Medium | Low |
| M-4 | No BS calendar / trading day utility | 🟡 Medium | Low |
| M-5 | AI provider governance absent | 🟡 Medium | Medium |
| M-6 | No scraper data contracts | 🟡 Medium | Low |
| D-1 | No data flow diagram | 🔵 Docs | Low |
| D-2 | No failure mode documentation | 🔵 Docs | Low |
| D-3 | No changelog or ADR log | 🔵 Docs | Low |
| D-4 | Input validation undocumented | 🔵 Docs | Low |

---

## Agent Working Rules

Follow these rules when implementing any item in this guide:

1. **Never break the transaction ledger.** Any change to `portfolio_engine.py`, `fee_calculator.py`, or any model under `Transaction`, `Holding`, or `PortfolioSnapshot` must include or update tests before the change is merged.

2. **Schema changes always go through Alembic** (after C-3 is complete). Never use `init_db()` or `ALTER TABLE` directly.

3. **One concern per commit.** Keep commits atomic and scoped to a single remediation item or sub-task. Use the item ID in the commit message (e.g., `[C-1] Add pytest fixtures and portfolio_engine unit tests`).

4. **Do not change financial calculation logic while adding tests.** First add tests against the current behaviour to establish a baseline, then make changes if needed in a subsequent commit.

5. **Preserve existing API response shapes** when adding the `/api/v1/` prefix (M-2). The frontend migration and the backend route change should be a single coordinated commit.

6. **Log at the right level.** Financial mutations → `INFO`. Scraper errors → `WARNING` (recoverable) or `ERROR` (failed completely). Debug internals → `DEBUG`. Never use `print()` statements in production code paths.

7. **Do not store secrets in logs.** Before adding any log statement that touches a config value, verify it is not in the sensitive list: `MASTER_PASSWORD`, `ENCRYPTION_KEY`, `GROQ_API_KEY`, `NVIDIA_API_KEY`, MeroShare credentials.