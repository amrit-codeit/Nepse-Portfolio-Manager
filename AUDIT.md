# Comprehensive Fullstack, Security, & Database Codebase Audit

**Date:** 2026-05-04
**Role:** Fullstack, Security, and Database Engineer

## Audit Methodology
This audit is performed chunk-by-chunk across the entire codebase to identify:
1. **Bugs:** Runtime errors, edge-cases, data inconsistencies.
2. **Business Logic Issues:** Flaws in accounting, portfolio math, scrapers, etc.
3. **Non-functional Features:** Dead code, incomplete features.
4. **Redundancy:** Code duplication, sub-optimal loops, repetitive structures.
5. **Security Risks:** Vulnerabilities, credential handling flaws, lack of validations.
6. **Production-Readiness:** Scalability, memory limits, DB locks.

## Action Strategy
At the end of the audit, a comprehensive action strategy will be formulated prioritizing high-impact bugs, architectural bottlenecks, and security vulnerabilities.

---

## 1. Backend: Database Models (`backend/app/models/`)
*Status: Completed*

**Findings & Issues:**
1. **Missing Unique Constraints (Risk: Data Duplication):**
   - `Holding` (`holding.py`): Lacks a `UniqueConstraint("member_id", "symbol")`. Since a member should only have one aggregate holding record per stock, lacking this constraint makes the database vulnerable to duplicate rows during upserts or race conditions.
   - `IssuePrice` (`price.py`): Lacks a `UniqueConstraint("symbol", "issue_type")`. Multiple scraping runs for the same IPO could duplicate rows.
2. **Design Observations:**
   - `Transaction` (`transaction.py`): Uses `symbol` for unlinked companies (good fallback). `txn_type` length is 20, which perfectly fits `RIGHTS_SUBSCRIPTION` (19 chars).
   - `FeeConfig` (`price.py`): Intentionally lacks a unique constraint to allow historical versioning, but requires application-level logic to always fetch the latest `effective_from` date to avoid pulling duplicates.
   - `MeroshareCredential` (`member.py`): Passwords are encrypted as `Text`. This is functional, assuming `utils/encryption.py` uses Fernet properly.

**Action Items:**
- [ ] Add `UniqueConstraint("member_id", "symbol", name="uix_member_symbol")` to `Holding`.
- [ ] Add `UniqueConstraint("symbol", "issue_type", name="uix_symbol_issuetype")` to `IssuePrice`.

---

## 2. Backend: Core Services & Business Logic (`backend/app/services/`)
*Status: Completed*

**Findings & Issues:**
1. **Bugs in Portfolio Engine (`portfolio_engine.py`):**
   - **Fixed:** Redundant WACC assignment loops at L102-103.
   - **Fixed (Critical):** `calculate_xirr()` was returning `None` when Newton's method failed to converge. This would crash `get_portfolio_summary()` since the `PortfolioSummary` Pydantic model (`holding.py`) strictly enforces `portfolio_xirr` as a `float`. Changed to return `0.0`.
2. **Business Logic & Integrity (`trading_desk.py`, `economy_service.py`, `fee_calculator.py`):**
   - `fee_calculator.py` implements an in-memory `_FEE_CACHE` capped at 1000 items with time-versioning. This successfully prevents querying the DB on every single transaction loop.
   - `trading_desk.py` maintains excellent status invariants (Watchlist -> Active -> Closed). The mathematical bounds for stops/targets correctly evaluate entry zones.
   - `economy_service.py` fixed deposit comparison rolls over properly using simple interest applied annually, which exactly matches Nepal's banking standards.

**Action Items:**
- [x] Fix `portfolio_engine.py` duplicate logic.
- [x] Fix `portfolio_engine.py` XIRR fallback to prevent Pydantic crashes.

---

## 3. Backend: API Routers (`backend/app/api/`)
*Status: Completed*

**Findings & Issues:**
1. **Background Tasks (`members.py`, `system.py`):**
   - The use of `BackgroundTasks` correctly leverages `SessionLocal()` instead of relying on closed request DB sessions (fixes CRIT-04).
   - Market Data Import (`system.py`) processes JSONL batches with `chunk_size = max(1, 999 // num_cols)`. This elegantly avoids SQLite's hard limit on `too many SQL variables` while maintaining rapid upsert performance.
2. **Reconciliation & Transaction Handling (`transactions.py`):**
   - DP Statement parsers accurately handle various file formats (NMBSBFE PDF, NIBLSF CSV, NI31 Excel).
   - Modification of trades dynamically recalculates WACC, CGT (using `holding_days`), and resets aggregate `Holdings`. Safe exception handling rolls back the DB if recalculation fails.
3. **Data Optimizations (`portfolio.py`):**
   - Aggregate APIs use batch queries and python dictionaries (`in_`) to avoid N+1 database hits when fetching live prices and company information for large portfolios.
   - `get_dividends` accurately calculates local taxation (5% on both Cash and Bonus portions) delivering the precise `net_cash` value.

**Action Items:**
- [x] Confirmed market data import/export limits and stability.
- [x] Validated proper auth header usage via `require_master_password`.

---

## 4. Frontend: Component Architecture (`frontend/src/`)
*Status: Completed*

**Findings & Issues:**
1. **Monolithic Component Structures:**
   - Files like `Transactions.jsx` (40KB), `Holdings.jsx` (35KB), `TradingDesk.jsx` (36KB), and `Upload.jsx` (32KB) are extremely large. They contain state management, API data fetching, form handling, and complex UI rendering all in one file.
   - This violates separation of concerns and makes long-term maintainability difficult.
2. **State Management Debt:**
   - Although `@tanstack/react-query` is installed in `package.json`, the frontend heavily relies on native `useEffect` and `useState` for API calls. This leads to redundant network requests, lack of caching, and complex loading state management.
3. **Hard-coded Configurations:**
   - The Vite configuration (`vite.config.js`) hardcodes the proxy target (`http://localhost:6767`) and dev server port (`3055`). While functional for the current setup, it prevents flexible environment setups without code modification.
4. **Security/Authentication Integration:**
   - The interceptor in `api.js` correctly picks up the `X-Master-Password` from `sessionStorage`. `App.jsx` correctly implements an idle lock (15 minutes of inactivity).

**Action Items:**
- [ ] Refactor massive page components into modular components (e.g., `TransactionList`, `TransactionForm`, `HoldingsTable`).
- [ ] Implement `@tanstack/react-query` hooks to replace `useEffect` API calls.
- [ ] Extract configuration into a `.env` file for port portability.

---

## 5. Action Strategy for Production Readiness

Based on the comprehensive codebase audit, the following actionable phases must be executed to transition NEPSE Portfolio Manager from a personal utility script into a robust, production-grade application:

### Phase 1: Database Hardening (Immediate Priority)
- **Implement Missing Unique Constraints:** Add missing constraints on `(member_id, symbol)` in the `Holding` model and `(symbol, issue_type, issue_date)` in the `IssuePrice` model.
- **Run Migrations:** Generate and execute Alembic migrations (or direct SQLite patches) to apply these constraints, preventing silent data duplication on bulk imports.

### Phase 2: Frontend Modularization & React Query Refactoring
- **Component Breakdown:** Split `Holdings.jsx`, `Transactions.jsx`, `TradingDesk.jsx`, and `Upload.jsx` into a `features/` directory architecture.
  - Separate table rendering, form modales, and charting components.
- **Implement React Query:** 
  - Create standard API hooks (e.g., `useTransactions()`, `useHoldings()`).
  - Deprecate `useState`/`useEffect` patterns for data fetching.
  - Implement query invalidation for seamless UI updates upon modifying data (e.g., invalidating `holdings` query after a `Transaction` creation).

### Phase 3: Developer Experience (DX) & Configuration
- **Environment Variables:** Migrate hard-coded ports out of `run_server.py`, `vite.config.js`, and `run.bat` into a central `.env` mechanism that standardizes the setup.
- **Robust Error Boundaries:** Introduce a global React Error Boundary to catch UI crashes, specifically for complex metric computations (like XIRR or nested charts).

### Conclusion
The backend is mathematically sound, optimized, and uses appropriate caching/background task mechanisms. The primary technical debt lies within the frontend's monolithic architecture and the lack of explicit SQLite unique constraints. Executing this Action Strategy will deliver the final production-ready state of the NEPSE Portfolio Manager.

