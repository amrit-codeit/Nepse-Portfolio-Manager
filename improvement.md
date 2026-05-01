# Nepal Portfolio Manager — Improvement Plan

> Prepared for AI agent implementation. Each item includes context, rationale, and concrete implementation guidance.
> Items are grouped by category and tagged with priority: 🔴 High · 🟡 Medium · 🟢 Low

---

## Table of Contents

1. [What is already good — preserve and build on](#1-what-is-already-good)
2. [Features that need improvement](#2-features-that-need-improvement)
3. [Features that need to be added](#3-features-that-need-to-be-added)

---

## 1. What Is Already Good

These are well-designed features. Do not refactor them unless a specific bug is found. They should be used as reference patterns for new work.

### 1.1 WACC and Tax WACC Distinction

The portfolio engine correctly maintains two separate cost bases per holding: the true WACC (actual cash paid per unit, including all purchases) and the tax WACC (adjusted for bonus shares received without cash outflow). This is the correct treatment for NEPSE because bonus shares inflate unit count without any cash consideration, which creates a tax event at a different cost basis than the accounting cost. This logic lives in `portfolio_engine.py` and should not be touched unless a calculation bug is confirmed with a test case.

### 1.2 Date-Versioned Fee Configuration

The `FeeConfig` model and `fee_calculator.py` service store broker fee schedules with effective dates and look up the correct fee rate for each transaction's date. SEBON and broker fee structures have changed multiple times. Any tool that applies today's fee rate to a 2018 transaction produces incorrect P&L. This design is correct and should be the pattern for any future configuration that changes over time.

### 1.3 XIRR Per Holding

Using XIRR (internal rate of return for irregular cash flows) rather than simple annualised return correctly handles partial sells, bonus share receipts, rights subscriptions, and dividend reinvestment — all common NEPSE events. This produces a time-weighted return that is directly comparable across holdings of different durations. The implementation should be preserved as-is.

### 1.4 Dividend Eligibility Calculation

The `dividend_scraper.py` tracks book closure dates and computes whether a member's holding qualifies for a given dividend. This is the most frequent source of investor confusion in NEPSE — many retail investors buy stock after book closure and expect a dividend. Having this computed and surfaced in the portfolio is high-value and correct.

### 1.5 Multi-Format Transaction Import

Supporting MeroShare CSV, DP PDF/XLSX/CSV, and native CSV import covers the realistic set of sources a NEPSE investor has access to. The type-detection logic that infers transaction types (purchase, sale, IPO allotment, bonus credit, rights) from raw row content is the correct approach given NEPSE's lack of a standardised statement format.

### 1.6 Multi-Provider AI with Local Fallback

The three-tier AI provider setup (Ollama local → Groq cloud → Nvidia cloud) gives resilience and cost control. The frontier prompt generation for copy-paste into external AI tools is a practical escape hatch. This architecture is correct and should be maintained as the pattern for all new AI features.

### 1.7 Fernet Encryption for MeroShare Credentials

Storing MeroShare passwords encrypted at rest with Fernet (AES-128-CBC + HMAC) and decrypting on demand is the correct approach for a local app. The 15-minute session inactivity timeout on `sessionStorage.masterAuth` adds a reasonable second layer. This design is sound.

### 1.8 Holdings XIRR and Portfolio Summary Enrichment

The portfolio engine enriches each holding with technical, valuation, dividend, and risk fields in a single pass. This single-pass enrichment pattern is efficient for SQLite and should be preserved for any new holding-level fields that are added.

### 1.9 SQLite WAL Mode Configuration

SQLite is configured with WAL (Write-Ahead Logging) and a 5000ms busy timeout. This allows concurrent readers alongside a single writer without throwing "database is locked" errors, safely supporting API threads and background scraper threads simultaneously.

### 1.10 Unified Trading Desk & Journal

The Trading Desk successfully combines live technical analysis, an AI copilot, an actionable watchlist (with entry zones, targets, and stops), and an integrated Trade Journal. This closes the feedback loop for active traders directly within the dashboard.

### 1.11 Institutional-Grade Analytics

The inclusion of Sharpe Ratio, Max Drawdown, Beta, and ATR-based volatility management elevates the tool beyond simple bookkeeping into professional-grade risk management.

---

## 2. Features That Need Improvement

These features exist but have correctness, reliability, or usability issues that limit their value.

---

### 2.1 No Data Freshness Signals in UI 🔴 [COMPLETED]

**Current state:** The frontend displays scraped values (prices, NAV, fundamentals) with a `<FreshnessTag />` component indicating when they were last updated.

**Problem:** A user cannot tell whether the price shown is from the current session or three days ago. During NEPSE maintenance windows, public holidays, or scraper failures, stale data looks identical to fresh data.

**What to do:**

Backend: Add a `last_scraped_at` timestamp column to `LivePrice`, `NavValue`, `FundamentalReport`, and `IndexHistory`. Update this on every successful scrape.

Frontend: Add a small timestamp badge next to any value sourced from scraping. Use colour to signal freshness:

- Fresh (< 6 hours): muted text, no icon
- Stale (6–48 hours): amber warning icon + timestamp
- Very stale (> 48 hours): red icon + timestamp

A single reusable `<FreshnessTag lastUpdated={timestamp} />` component handles all three cases. Place it in the Holdings table header, the Prices page header, and the Dashboard overview card.

---

### 2.2 Unrouted Pages: Members, ScripDetail 🔴

**Current state:** `Members.jsx`, and `ScripDetail.jsx` exist in `src/pages` but are not registered in `App.jsx`. (Note: `Calculator.jsx` is successfully integrated into the Trading Desk).

**Problem:** These pages are unreachable.

**What to do:**

Add the routes to `App.jsx`:

```jsx
<Route path="/members" element={<Members />} />
<Route path="/scrip/:symbol" element={<ScripDetail />} />
```

Members can be accessible from the Settings page as a section or a link, not necessarily a top-level sidebar item — it is a low-frequency management task. ScripDetail should be reachable by clicking a symbol anywhere in the app (Holdings table, Prices table, Insights page) — use `useNavigate('/scrip/NABIL')` on symbol clicks.

---

### 2.3 Monolithic Frontend Component Files 🟡

**Current state:** `Dashboard.jsx`, `Holdings.jsx`, `Transactions.jsx`, `Prices.jsx`, and `TradingDesk.jsx` are described as monolithic.

**Problem:** Large files are hard to debug, slow to parse in IDEs, and make it difficult to reuse sub-components. When a bug is in a 1500-line file, the fix is harder to isolate and test.

**What to do — Holdings.jsx first (highest complexity/value):**

Split into:
- `HoldingsTable.jsx` — the Ant Design table with columns definition
- `HoldingFilters.jsx` — sector filter, member selector, search input
- `HoldingRow.jsx` — single row with expandable details
- `HoldingDetailDrawer.jsx` — the right-side drawer for a selected holding (trade intel, AI review)
- `useHoldings.js` — the React Query hook and data transformation logic

This split means each file has one responsibility. Do the same for Dashboard.jsx (each tab is already a component; extract the data-fetching logic into `useDashboardData.js`). Do not refactor all files at once — do one per sprint and test after each.

---

### 2.4 No Error Boundaries Around AI and Scraper Calls 🟡 [COMPLETED]

**Current state:** React error boundaries (`<SectionErrorBoundary>`) have been successfully integrated.

**Problem:** AI model calls can time out. Scrapers can fail. A single unhandled promise rejection in the Dashboard's AI Analyst panel should not blank the entire dashboard. Currently, a JavaScript error in any component propagates to the root and may unmount the entire page.

**What to do:**

Create a reusable `<SectionErrorBoundary>` component:

```jsx
class SectionErrorBoundary extends React.Component {
  state = { hasError: false, error: null };
  static getDerivedStateFromError(error) { return { hasError: true, error }; }
  render() {
    if (this.state.hasError) {
      return (
        <Alert
          type="error"
          message="This section failed to load"
          description={this.state.error?.message}
          action={<Button onClick={() => this.setState({ hasError: false })}>Retry</Button>}
        />
      );
    }
    return this.props.children;
  }
}
```

Wrap these sections specifically:
- `<AIPortfolioAnalyst>` in Dashboard
- `<AITradingCopilot>` in Trading Desk
- `<TradeIntelTab>` in Insights
- Each chart component that fetches independently

---

### 2.5 Master Password Sent on Every Request 🟡

**Current state:** The master password (or its hash) is stored in `sessionStorage` and injected as an HTTP header on every Axios request via the interceptor.

**Problem:** Sending a credential on every request increases the surface area for accidental exposure (logging, browser dev tools, network inspector). It also means the credential is in every request regardless of whether that request actually requires it.

**What to do:**

Issue a short-lived signed token on successful master password verification:

1. Backend: on `POST /api/members/verify`, if the password is correct, return a JWT or HMAC-signed token with a 15-minute expiry.
2. Frontend: store this token in `sessionStorage` instead of the password.
3. Backend: validate the token on protected endpoints instead of comparing the password directly.
4. The inactivity timeout logic remains the same — clear `sessionStorage` after 15 minutes of inactivity, which forces re-entry.

This is a small security improvement with no user-visible change. The master password itself never travels in request headers after the initial login.

---

### 2.6 Scraper Failures Are Silent 🟡 [COMPLETED]

**Current state:** Scraper failures are fully logged in the `ScraperRun` database table and are visually represented in the Settings > Data Sources tab.

**Problem:** Silent failures mean the user has no way to know their data is stale. This is the most operationally dangerous issue in the app because it is invisible.

**What to do:**

Add a `ScraperRun` table (see §3.1 for full spec). At minimum, track: scraper name, run timestamp, status (success/failure), rows affected, and error message if failed.

In the Settings page, add a "Data Sources" section that shows a table of all scrapers with their last run time and status. A red row means the scraper failed on its last run. This is purely a display of existing data — no complex new UI needed.

---

## 3. Features That Need to Be Added

These are net-new features. Each one is scoped to be implementable without external dependencies beyond what already exists in the stack.

---

### 3.1 Scraper Run Log (`ScraperRun` Table) 🔴 [COMPLETED]

**What it is:** A simple audit log for every scraper execution.

**Why it matters:** Without this, scraper failures are invisible. With it, the UI can show data freshness, the user can diagnose issues, and the app can alert on repeated failures.

**Model:**

```python
class ScraperRun(Base):
    __tablename__ = "scraper_runs"
    id = Column(Integer, primary_key=True)
    scraper_name = Column(String, nullable=False)  # e.g. "price_scraper"
    triggered_by = Column(String, default="scheduler")  # "scheduler" or "manual"
    started_at = Column(DateTime, nullable=False)
    finished_at = Column(DateTime, nullable=True)
    status = Column(String, nullable=False)  # "running" | "success" | "failure"
    rows_affected = Column(Integer, nullable=True)
    error_message = Column(Text, nullable=True)
```

**API:** `GET /api/scraper/runs?limit=50` — returns the most recent runs, newest first. Used by the Settings page data sources table.

**Usage pattern in scrapers:**

```python
run = ScraperRun(scraper_name="price_scraper", triggered_by="manual", started_at=datetime.utcnow(), status="running")
db.add(run); db.commit()
try:
    count = do_scrape()
    run.status = "success"; run.rows_affected = count
except Exception as e:
    run.status = "failure"; run.error_message = str(e)
finally:
    run.finished_at = datetime.utcnow(); db.commit()
```

---

### 3.2 Tax Liability Summary Per Member 🔴 [CANCELLED]

**What it is:** A computed view of estimated capital gains tax and dividend tax owed for the current or selected Nepali fiscal year.
**Status:** Cancelled. CGT and dividend tax are deducted at source by the broker/company, rendering this largely unnecessary for most retail scenarios.

**Why it matters:** NEPSE investors must pay capital gains tax annually. The data to compute this already exists in `Transaction` (buy/sell history), `DividendIncome`, and `FeeConfig`. This is the most practically valuable financial output the app does not currently produce.

**Tax rules to implement (Nepal, as of FY 2080/81):**

| Gain type | Rate |
|-----------|------|
| Short-term capital gain (held < 365 days) | 7.5% for individuals |
| Long-term capital gain (held ≥ 365 days) | 5% for individuals |
| Dividend received | 5% (already withheld, show for reconciliation) |

**Computation logic:**

For each completed sell transaction in the fiscal year:
1. Identify the corresponding buy lot(s) using FIFO matching (already implied by the portfolio engine's WACC replay).
2. Compute holding period: sell date − buy date.
3. Compute gain: (sell price × units) − (buy cost including fee) − sell fee.
4. Classify as short-term or long-term.
5. Apply the applicable rate.

Aggregate per member per fiscal year. Present as:

- Total short-term gains (taxable) · estimated tax
- Total long-term gains (taxable) · estimated tax
- Total dividends received · tax withheld (informational)
- Net estimated tax liability

**Where to show it:** Add a "Tax Summary" tab to the Dashboard (alongside Overview, Performance, Risk, Dividend). A `GET /api/portfolio/tax-summary?member_id=X&fiscal_year=2081` endpoint computes and returns the data.

**Important note:** Label this "Estimated tax — consult a tax advisor for filing." Do not claim accuracy for edge cases (demutualization, rights, mergers).

---

### 3.3 Price Alerts (Target Price Notifications) 🟡 [COMPLETED]

**What it is:** When the price scraper runs and a live price crosses an active watchlist target or stop-loss, it shows a notification badge in the app header.

**Why it matters:** Without alerts, the user must manually check whether a target has been hit. With the watchlist feature already integrated into the Trading Desk, this is a natural next step.

**How to implement:**

This does not require push notifications or a notification service. Use a simple in-app badge:

1. Add a `price_alerts_triggered` field to `WatchlistItem` / `TradeSetup` (boolean, resets when the user dismisses).
2. The price scraper checks all active trade setups: if current price ≤ stop loss or ≥ target price, set it to True and write a row to a `Notification` table.
3. Frontend: `GET /api/notifications/unread` is called periodically. If count > 0, show a red badge on the header bell icon.
4. Clicking the bell opens a drawer listing triggered alerts. Dismissing sets `price_alerts_triggered` back to False.

**Notification model:**

```python
class Notification(Base):
    __tablename__ = "notifications"
    id = Column(Integer, primary_key=True)
    member_id = Column(Integer, ForeignKey("members.id"))
    type = Column(String)  # "price_alert" | "dividend_closure" | "scraper_failure"
    message = Column(Text)
    is_read = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
```

This same `Notification` model can later be used for dividend book-closure reminders and scraper failure alerts without changing the schema.

---

### 3.4 Sector Allocation View 🟡 [COMPLETED]

**What it is:** A chart on the Dashboard Overview tab showing the portfolio's allocation by NEPSE sector, by market value.

**Why it matters:** NEPSE is structurally dominated by the banking sector. Many retail investors are heavily concentrated in Banking + Development Bank + Finance without realising it. A sector view makes over-concentration visible at a glance.

**Implementation:**

The `Company` model already stores sector information (implied by the company scraper). The `Holding` model stores current value. The computation is:

```python
SELECT c.sector, SUM(h.current_value) as total_value
FROM holdings h
JOIN companies c ON h.symbol = c.symbol
WHERE h.member_id = :member_id
GROUP BY c.sector
ORDER BY total_value DESC
```

Add a `GET /api/portfolio/sector-allocation?member_id=X` endpoint. On the frontend, render a Recharts `PieChart` (already a dependency) with a simple legend. Place it on the Dashboard Overview tab below the summary cards. No new dependencies needed.

---

### 3.5 Dividend Book-Closure Calendar 🟡 [COMPLETED]

**What it is:** A simple list view (not a full calendar component) of upcoming dividend book closure dates for stocks the user holds or watches.

**Why it matters:** Missing a book closure date means missing the dividend. The data already exists in `DividendIncome` (scraped by `dividend_scraper.py`). Surfacing upcoming closures in a discoverable place is the missing step.

**Implementation:**

Add a `GET /api/dividends/upcoming?days=30` endpoint that queries `DividendIncome` for book closure dates within the next N days, filtered to symbols in the member's current holdings and active trade setups.

On the Dashboard's Dividend tab (which already exists as `DividendTab`), add an "Upcoming book closures" card at the top — a simple ordered list of symbol, company name, book closure date, and proposed dividend rate. Mark holdings the user currently owns in green; watchlist items in amber; everything else unlisted.

---

### 3.6 Rights Share Transaction Type 🟡 [COMPLETED]

**What it is:** Support for rights issuance as a distinct transaction type in the portfolio engine.

**Why it matters:** Rights issuance is frequent in NEPSE, especially in banking stocks. When a company issues rights shares, the holder can subscribe at the rights price. If modelled as a plain "buy" transaction, the WACC calculation is correct. However, the event should be tagged as `RIGHTS_SUBSCRIPTION` so that:

1. The portfolio history correctly shows the cash outflow date.
2. The import parsers can detect and classify rights credits in DP statements (which use a different description than market purchases).
3. The tax summary (§3.2) can correctly classify the holding period from the rights subscription date.

**What to add:**

Add `RIGHTS_SUBSCRIPTION` to the transaction type enum alongside existing types. Update `history_parser.py` and `dp_parser.py` to detect rights-related descriptions in DP statements (common keywords: "rights", "हकप्रद"). The portfolio engine treatment is the same as a purchase for WACC purposes — the only change is the type tag and the import detection.

---

### 3.7 IRD Capital Gains Export (Excel) 🟢 [CANCELLED]

**What it is:** A downloadable Excel file containing the user's realised capital gains for a selected fiscal year.
**Status:** Cancelled. CGT is deducted at source and reported by brokers.

**Why it matters:** NEPSE investors must self-declare capital gains annually. Currently they would need to manually extract this from the app. The data already exists in closed positions and fee calculations.

**Implementation:** Use `openpyxl` (already a dependency) to generate the file. Add a `GET /api/portfolio/export/capital-gains?member_id=X&fiscal_year=2081` endpoint that streams the xlsx file. Add a download button to the Tax Summary tab.

---

### 3.8 Settings Page: Data Sources Status Panel 🟢 [COMPLETED]

**What it is:** A section within the existing Settings page that shows the last run time and status of each scraper, and the schedule of upcoming runs.

**Why it matters:** Currently the user has no visibility into whether data is fresh.

**Implementation:**

Use the `ScraperRun` table (§3.1) and `GET /api/scraper/runs` endpoint. Render a simple Ant Design Table in Settings with columns: scraper name, last run time, status (green tick / red cross), rows updated. No new backend logic — this is a read-only display of already-computed data.

---

## Implementation Order Summary

The following order minimises dependency conflicts and maximises user-visible value at each step.

| Step | Item | Type | Effort |
|------|------|------|--------|
| 1 | ScraperRun log table (§3.1) | New feature | 2–3 h |
| 2 | Data freshness UI (§2.1) | Improvement | 2–3 h |
| 3 | Wire unrouted pages (§2.2) | Improvement | 2–4 h |
| 4 | Settings data sources panel (§3.8) | New feature | 2–3 h |
| 5 | Tax liability summary (§3.2) | New feature | 1–2 days |
| 6 | Price alerts (§3.3) | New feature | 4–6 h |
| 7 | Sector allocation view (§3.4) | New feature | 3–4 h |
| 8 | Dividend book-closure calendar (§3.5) | New feature | 3–4 h |
| 9 | Rights transaction type (§3.6) | New feature | 4–6 h |
| 10 | Error boundaries (§2.4) | Improvement | 2–3 h |
| 11 | Frontend component refactor (§2.3) | Improvement | Ongoing |
| 12 | IRD capital gains export (§3.7) | New feature | 4–6 h |
| 13 | Auth token instead of password header (§2.5) | Improvement | 4–6 h |

---

## What Not to Build (Intentionally Excluded)

The following were considered and excluded because they require heavy external data, add significant complexity for marginal gain, or are out of scope for a personal local-first app.

- **Always-on Scheduled Jobs (Cron)** — As a local-first personal app, the device is not expected to be 24/7 online. Forcing continuous background scrapers is inefficient; relying on manual triggers, on-load updates, or targeted startup jobs (like DB backups) is more reliable for this architecture.
- **Floorsheet scraping** — nepalstock.com floorsheet requires Selenium session management per member and produces enormous data volume with limited actionable insight for a portfolio tracker.
- **Real-time WebSocket price feed** — NEPSE does not provide an official WebSocket API. Polling every 5 minutes when the user is active is sufficient and avoids Selenium overhead.
- **Merger/acquisition handling** — Modelling a full merger transaction (share swap, effective date, cost basis migration) requires significant portfolio engine changes and is only relevant for a small number of historical events.
- **Mobile app** — Out of scope for a local-first personal app. Improving the existing web UI's responsive layout within Ant Design is sufficient.
- **Multi-user / cloud deployment** — The design intent is personal use. SQLite and master-password auth are correct for this scope.
- **Correlation heatmap** — Requires historical price matrix computation across all holdings simultaneously. Moderately complex with SQLite and adds limited practical guidance beyond the sector allocation view (§3.4).
- **Broker performance tracking** — Broker data is not consistently captured in DP statements. Insufficient reliable data for meaningful analysis.

---

*End of improvement plan.*
