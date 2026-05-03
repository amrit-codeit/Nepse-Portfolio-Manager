# Economy & Alternatives — Implementation Spec

> **Purpose:** Guide an AI agent to implement the Economy & Alternatives feature in the
> Nepal Portfolio Manager from scratch, without ambiguity.
>
> **What this document contains:** Implementation steps, decisions, do's and don'ts.
> No code is provided. The agent writes all code after reading the existing codebase.
>
>
> **Key assumption:** Gold price history, silver price history, and FD rate data already
> exist in the database with their own models. The agent must discover the exact model
> names and column names by reading `backend/app/models/` before writing anything.

---

## Overview

This feature adds a new sidebar page called **Economy & Alternatives** with two sub-tabs:

**Macro pulse** — Displays the latest NepseAlpha macroeconomic indicators table (sourced
from NRB), interprets the current monetary regime, and shows sector-level signals mapped
to the user's holdings.

**Alternatives comparison** — Lets the user enter a principal amount and a start date, then
shows what that money would be worth today if invested in NEPSE index, fixed deposit, gold,
or silver. Uses data already in the database. No external calls needed for this tab.

Additionally, the latest macro snapshot is silently injected into  existing AI prompt of value investing and portfolio analysis
builders in `ai_service.py` so every AI verdict gains macro context without any UI changes. 

---

## Phase 0 — Read before writing anything

This phase is mandatory. The agent must not create or edit any file until all of these
readings are complete.

**Step 0.1 — Read all existing models**
Read every file in `backend/app/models/`. The goal is to find and note:
- The model name, table name, and relevant column names for gold price history.
- The model name, table name, and relevant column names for silver price history.
- The model name, table name, and relevant column names for FD rate data. Note whether
  FD rate is stored as a single current value or as a time series with dates.
- The model name, table name, and relevant column names for NEPSE index history.
  This is likely `IndexHistory` from `index_scraper.py` but confirm the exact date
  field name and closing value field name.

**Step 0.2 — Read the scraper patterns**
Read two existing scraper files — `price_scraper.py` and `nav_scraper.py` — to understand
how this codebase makes HTTP requests (curl_cffi vs requests vs Selenium), how it handles
errors, how it opens and commits database sessions, and what logging style it uses.
The new macro scraper must follow the same patterns exactly.

**Step 0.3 — Read the AI service**
Read `backend/app/services/analysis/ai_service.py` in full. Note the exact names of every
function that builds a prompt string. Note whether the db session is passed in or opened
internally. Note the string format used (f-string, template, etc.). The macro context
injection must match whatever pattern already exists.

**Step 0.4 — Read the scheduler**
Read `backend/app/utils/scheduler.py` to understand how APScheduler is configured and how
to register a new job. Note that this codebase currently starts the scheduler with no
active cron jobs — the macro job will be the first one.

**Step 0.5 — Read the API router pattern**
Read one existing small router file, such as `backend/app/api/dividends.py` or
`backend/app/api/groups.py`, to understand how routers are structured, how `get_db`
is injected, and how errors are raised.

**Step 0.6 — Inspect the NepseAlpha macro page**
Fetch `https://nepsealpha.com/macroeconomic-indicators` and inspect the raw HTML.
Confirm the exact URL (navigate from the NepseAlpha homepage if unsure — it is listed
under Alpha Screen > Macroeconomic Indicators). Note the HTML element type of the table,
the column order, and the exact text of the row labels. The label text in the spec below
is approximate — the real labels on the live page are authoritative.

---

## Phase 1 — Data model

**Step 1.1 — Create `MacroIndicator` model**
Create a new file `backend/app/models/macro_indicator.py`. The model stores macro
indicators as a flat key-value time series. Each row represents one indicator for one
time period. Required columns: a primary key, a human-readable period label string
(e.g. "Mid March 2026"), a parsed period date stored as a Date type (use the 15th of
the month as the representative day), the indicator key as a short string, the numeric
value as a Float (nullable — NepseAlpha sometimes shows dashes for missing data), and
the unit as a string.

Add a unique constraint on the combination of period_date and key so the scraper can
safely upsert without creating duplicates.

**Step 1.2 — Register the model**
Add an import of `MacroIndicator` to `backend/app/models/__init__.py` following the
same pattern as every other model import in that file. Do not add anything else. The
existing `init_db()` in `main.py` will create the table automatically on next startup
because it calls `Base.metadata.create_all` which covers all registered models.

**Do's:**
- Use a flat key-value design, not one column per indicator. This keeps the schema
  stable even if the list of captured indicators changes later.
- Make the value column nullable. NepseAlpha sometimes shows dashes.
- Store the human-readable period label alongside the parsed date so the frontend
  can display "Mid March 2026" without reformatting.

**Don'ts:**
- Do not create separate columns for each of the 20 indicators. That design breaks
  every time an indicator is added or removed.
- Do not use a migration script. The init_db pattern handles this automatically.
- Do not add any relationships or foreign keys. This model stands alone.

---

## Phase 2 — Scraper

**Step 2.1 — Create `macro_scraper.py`**
Create `backend/app/scrapers/macro_scraper.py`. This scraper fetches the NepseAlpha
macro indicators page and parses the HTML table into `MacroIndicator` rows.

**Step 2.2 — HTTP strategy**
Use `curl_cffi` with browser impersonation, consistent with how other scrapers in this
project make requests to third-party sites. Do not use Selenium — this page does not
require JavaScript rendering, it is a plain HTML table. Set a timeout of 30 seconds.

**Step 2.3 — Table parsing**
After fetching the page, parse with BeautifulSoup. Locate the macro table by searching
for a table element whose text contains known indicator strings like "Base Rate" and
"CPI". Do not rely on CSS class names or element IDs — NepseAlpha changes those. Use
content-based detection.

The table structure is: first row is a header containing period column labels (e.g.
"Last March 2025", "Mid January 2026", "Mid February 2026", "Mid March 2026"). The
first column of each subsequent row is the indicator label. Remaining columns are values
for each period. There may also be a YOY Trend column at the end — skip it.

**Step 2.4 — Label matching**
Match row labels to internal keys using substring matching on the lowercased label, not
exact matching. NepseAlpha adds asterisks, footnote markers, and extra whitespace to
some labels. The 20 internal keys to capture and their approximate NepseAlpha label
substrings are:

| Internal key | Match substring (lowercase) | Unit |
|---|---|---|
| `real_gdp_growth` | "real gdp at basic price" | percent |
| `nominal_gdp_growth` | "nominal gdp at producers" | percent |
| `cpi_yoy` | "cpi (yoy)" | percent |
| `food_cpi_yoy` | "food cpi (yoy)" | percent |
| `nonfood_cpi_yoy` | "non food cpi (yoy)" | percent |
| `base_rate` | "base rate" | percent |
| `lending_rate` | "weighted average lending rate of commercial banks" | percent |
| `deposit_rate` | "weighted average deposit rate of commercial banks" | percent |
| `interbank_rate` | "weighted average interbank rate of commercial banks" | percent |
| `tbill_91` | "91 day t bills rate" | percent |
| `m2_growth` | "broad money (m2) (yoy)" | percent |
| `private_credit_growth` | "claims on private sector (yoy)" | percent |
| `total_deposits` | "total deposits" | billion_npr |
| `market_cap_gdp` | "market capitalization/gdp" | percent |
| `remittance_inflow` | "workers' remittances" | billion_npr |
| `forex_reserves_usd` | "gross foreign exchange reserves (usd" | million_usd |
| `import_growth` | "import growth" | percent |
| `export_growth` | "export growth" | percent |
| `revenue_growth` | "revenue growth" | percent |
| `capex_gdp` | "capital expenditure / gdp" | percent |

Rows that do not match any internal key are silently skipped. Log the count of skipped
rows at DEBUG level.

**Step 2.5 — Period date parsing**
Convert period labels like "Mid March 2026" or "Last March 2025" to a Python date.
Strip the words "Mid", "End", and "Last" from the label. Parse the remaining month name
and four-digit year. Use the 15th of the parsed month as the representative date.
If parsing fails for any label, log a warning and skip that column — do not raise.

**Step 2.6 — Value parsing**
Strip commas, percent signs, and surrounding whitespace from each cell value. If the
result is an empty string, a dash, or any non-numeric token, store None. Convert valid
numeric strings to float.

**Step 2.7 — Upsert logic**
For each (period_date, key) pair, check if a row already exists. If it does, update
the value and scraped_at timestamp. If it does not, insert a new row. Commit once after
all rows are processed, not after each row.

**Step 2.8 — Return value**
The scraper function should return a plain dict summarising the operation: number of rows
upserted, number of rows skipped, and the list of period labels found. This dict is
returned directly by the API trigger endpoint.

**Do's:**
- Log at INFO level when the scrape starts and when it completes.
- Use `logging.getLogger(__name__)` — no print statements anywhere.
- Raise a descriptive exception if the table cannot be found on the page, so the API
  endpoint can return a useful 500 error.
- Commit after all inserts, not row by row.

**Don'ts:**
- Do not use Selenium. No browser automation needed here.
- Do not hardcode CSS classes or element IDs as selectors.
- Do not crash if a single row or column fails to parse. Skip and continue.
- Do not commit inside the per-row loop — one commit at the end.
- Do not store the YOY Trend column. Skip any column whose header contains "trend".

---

## Phase 3 — Scheduler

**Step 3.1 — Register a monthly cron job**
In `backend/app/utils/scheduler.py`, register a new APScheduler cron job that calls the
macro scraper function. Schedule it to run on the 18th of each month at 06:00. The 18th
is chosen because NRB data typically appears on NepseAlpha by the 15th. Running on the
18th adds a buffer for publication delays.

**Step 3.2 — Session handling in the job**
The job function must open its own database session using `SessionLocal`, call the scraper,
and close the session in a finally block. Wrap the call in try/except and log any exception
at ERROR level without re-raising — a failed scheduled scrape should not crash the scheduler.

**Do's:**
- Use `replace_existing=True` when adding the job so restarts do not duplicate it.
- Give the job a stable string id like `"macro_scrape_monthly"`.

**Don'ts:**
- Do not use an interval trigger. Use a cron trigger on a fixed day of month.
- Do not let an exception in the job propagate — catch it, log it, move on.

---

## Phase 4 — Service layer

**Step 4.1 — Create `economy_service.py`**
Create `backend/app/services/economy_service.py`. This file contains three functions:
`get_latest_macro_snapshot`, `get_alternatives_comparison`, and
`build_macro_context_string`. Do not put business logic in the API router — keep it here.

**Step 4.2 — `get_latest_macro_snapshot`**
This function takes a db session and returns a structured dict containing:
- The period label and date of the most recent available data.
- All 20 indicator values as a flat dict keyed by internal key name.
- Two derived values computed inside the function: real lending rate (lending_rate minus
  cpi_yoy) and real deposit return (deposit_rate minus cpi_yoy). Both can be None if
  either input indicator is missing.
- A regime assessment (see Step 4.3).
- A list of sector signals (see Step 4.4).

If no data exists yet (table is empty), return a dict with `available: False` and a
message telling the user to trigger a scrape. Do not raise an exception for this case.

**Step 4.3 — Regime assessment**
Determine the current monetary regime from the indicator values using these rules:

Easing regime: base_rate below 6.0, AND deposit_rate below 5.0, AND m2_growth above 10.0.
Tightening regime: base_rate above 8.0, AND lending_rate above 12.0, AND m2_growth below 5.0.
Neutral: neither condition fully met.

Return a regime dict with three fields: a short label string, a one-paragraph plain-English
description of what the regime means for NEPSE investors, and a bias string that is one of
"bullish", "bearish", or "neutral".

**Step 4.4 — Sector signals**
Evaluate four sectors against the current indicator values. For each sector, return a signal
of "favorable", "caution", or "neutral" based on the following logic:

BFI / Commercial Banks — favorable when base_rate is below 6.5 and m2_growth is above 10.0.
Caution when lending_rate is below 8.0 (NIM compression risk). Representative symbols:
NABIL, EBL, SANIMA, GBIME, NICA.

Hydro / Infrastructure — favorable when capex_gdp is above 5.0. Caution when capex_gdp
is below 4.0 (low government spending). Representative symbols: NIFRA, UPPER, NHPC, HIDCL.

Microfinance — favorable when remittance_inflow is above 1200.0 (billion NPR). No caution
condition. Representative symbols: SKBBL, CBBL, MLBBL.

Insurance — favorable when m2_growth is above 10.0 and cpi_yoy is below 6.0. No caution
condition. Representative symbols: NLIC, LICN, SJLIC.

If an indicator needed for a rule is None (missing data), treat the condition as not met
rather than raising an error.

**Step 4.5 — `get_alternatives_comparison`**
This function takes a db session, a principal amount (float), and a start date (Python date).
It returns what that principal would be worth today if invested in four alternatives.

For each alternative, compute: the starting value of the asset on or nearest to the start
date, the ending value (most recent available), the final rupee amount, the total return
percentage, and an annualised XIRR approximation using the simple compound formula
`((end/start) ^ (1/years)) - 1`.

The four alternatives are:

**NEPSE index** — query the existing index history model (confirmed in Phase 0) for the
closing value on the nearest date to start_date on or after it, and for the most recent
closing value available. The NEPSE investment is treated as a passive index investment
with no dividends.

**Fixed deposit** — read the FD rate from the existing FD model (confirmed in Phase 0).
If FD rate is stored as a time series, use the rate that was active on the start_date
and compound it forward. If stored as a single current rate, use that rate as a constant
and note it in the response. Compound annually.

**Gold** — query the existing gold price model (confirmed in Phase 0) for the price on
or nearest to start_date, and the most recent price. Units must be consistent — do not
convert between tola and gram. Use whatever unit the model stores and label it accordingly
in the response.

**Silver** — same approach as gold using the existing silver price model.

Sort the four results by final_amount descending before returning. Mark the top result
with `is_winner: true`. Include years_held as a float in the response so the frontend
can display it.

Handle edge cases cleanly: if historical data does not exist for the requested start_date
for any alternative, omit that alternative from results rather than returning a zero or
raising. The response should always contain at least one result to be useful.

**Step 4.6 — `build_macro_context_string`**
This function takes a db session and returns a single plain-English paragraph suitable
for prepending to an AI prompt. It should be concise — under 100 words. Include: the
period label, the regime label, base rate, lending rate, deposit rate, CPI, real deposit
return, M2 growth, and remittances. If no macro data is available, return an empty string.
Do not raise. Do not include any JSON, markdown, or structured formatting in the output —
it is plain prose that will be embedded inside a larger prompt.

**Do's:**
- Keep all three functions in one file. They are logically related.
- Handle None indicator values defensively in every calculation.
- Return plain Python dicts and lists, not Pydantic models — the router handles serialisation.

**Don'ts:**
- Do not open a new database session inside the service. Accept db as a parameter.
- Do not import from the API layer. Service imports from models only.
- Do not put regime or sector signal logic in the router. It belongs in the service.

---

## Phase 5 — AI prompt injection

**Step 5.1 — Identify prompt builder functions**
Re-read `ai_service.py` (already done in Phase 0). Identify every function that assembles
a prompt string that is later sent to Ollama, Groq, or Nvidia. There are likely separate
functions for portfolio analysis, stock value verdict, and trading verdict.

**Step 5.2 — Inject macro context**
In each prompt-building function, call `build_macro_context_string(db)` and prepend the
result to the prompt. If the result is an empty string, do not prepend anything — the
prompt should remain unchanged when no macro data is available.

**Step 5.3 — Session threading**
If the prompt-building functions do not currently accept a db session, add it as an
optional parameter defaulting to None. When None, open a local session inside the function
and close it in a finally block. Prefer passing the session from the caller if one is
already available.

**Do's:**
- Keep the injection minimal — one prepended paragraph, nothing else.
- Make the injection conditional on data availability so no regression occurs before
  the first scrape runs.

**Don'ts:**
- Do not restructure the existing prompt templates.
- Do not add macro data to the frontier prompt function (the one that generates
  copy-paste text for external LLMs) — it already has its own context format.
- Do not add a new API endpoint for AI with macro context. The existing endpoints
  already call ai_service.py — the injection is transparent.

---

## Phase 6 — API layer

**Step 6.1 — Create `backend/app/api/economy.py`**
This router uses prefix `/api/economy`. It exposes three endpoints:

`GET /api/economy/macro` — calls `get_latest_macro_snapshot`. Returns 404 with a clear
message if no data is available yet (not a 500 — missing data is a normal state before
the first scrape).

`POST /api/economy/macro/scrape` — manually triggers `scrape_macro_indicators`. Returns
the scraper's result dict on success, 500 with the exception message on failure. This
endpoint does not require any request body.

`GET /api/economy/alternatives` — accepts two query parameters: `principal` (float,
required, min 1000, max 50,000,000) and `start_date` (date string in YYYY-MM-DD format,
required). Validates that start_date is before today. Calls `get_alternatives_comparison`
and returns the result. Returns 400 for invalid parameters.

**Step 6.2 — Mount in `main.py`**
Import the economy router and mount it with `app.include_router(economy_router)` alongside
all other router registrations. Follow the exact same pattern used for every other router.

**Do's:**
- Return 404 (not 500) when no macro data exists. This is an expected state.
- Validate start_date server-side. Do not trust the client.

**Don'ts:**
- Do not add authentication beyond what other non-sensitive endpoints use. The master
  password header is already injected by the frontend Axios client globally.
- Do not put any business logic in the router. All logic lives in the service.
- Do not add a DELETE or PATCH endpoint. Macro data is append-only from the scraper.

---

## Phase 7 — Frontend

**Step 7.1 — Add API wrappers**
In `frontend/src/services/api.js`, add an `economyApi` object following the exact same
pattern as other API objects already in that file. It needs three methods corresponding
to the three backend endpoints: fetch macro snapshot, trigger scrape, and fetch alternatives
with principal and start_date parameters.

**Step 7.2 — Create `frontend/src/pages/Economy.jsx`**
This page contains a top-level Tabs component with two tab items. Follow the same page
structure as other pages in `src/pages/` — same padding, same title style, same import
patterns.

**Macro pulse tab** must show:
- The period label and a Refresh button that triggers the manual scrape endpoint.
- A prominent regime banner showing the regime label, bias (as an Ant Design Tag with
  appropriate color — green for bullish, red for bearish, default for neutral), and the
  regime description text.
- The real deposit return derived value with a contextual note when it is negative
  (e.g. "FD is losing purchasing power after inflation").
- Rate environment section: base rate, lending rate, deposit rate, interbank rate, 91-day
  T-bill rate displayed as Statistic components.
- Monetary section: CPI, M2 growth, private credit growth, market cap/GDP.
- External sector and public finance in a two-column layout.
- Sector signals table: four rows, one per sector, showing the sector name, representative
  symbols as small Tags, and the signal as a colored Tag.
- Loading state with Ant Design Spin while data is fetching.
- Empty/error state with an Ant Design Alert that prompts the user to click Refresh when
  no data is available yet. This is the expected first-run state.

**Alternatives comparison tab** must show:
- An input area with: a number input for principal (formatted with comma separators), a
  date picker for start_date (restricted to past dates only), and a Compare button.
- Do not auto-fetch on mount. Only fetch when the user clicks Compare.
- Results area showing one card per alternative, sorted best to worst, each with: the
  alternative label, a horizontal progress bar (width proportional to final amount relative
  to the winner), the final rupee amount, the total return percentage, and the annualised
  XIRR approximation. Mark the winner card distinctly.
- A contextual note below the results if equity beat FD, showing the rupee difference.
- If fewer than four alternatives are returned (missing historical data), show what is
  available without an error. Only show an error Alert if the API call itself fails.

**Step 7.3 — Wire into App.jsx**
Add a new route `/economy` pointing to the Economy page component. Add a sidebar menu
item after Trading Desk using an appropriate icon from `@ant-design/icons` — something
like `BarChartOutlined` or `GlobalOutlined`. Import the icon only if not already imported.

**Do's:**
- Use React Query for all data fetching. Set staleTime to 1 hour for macro data (it
  changes monthly) and 10 minutes for alternatives data.
- Show a loading indicator during scrape trigger mutations.
- Invalidate the macro query after a successful scrape mutation so the UI refreshes.
- Follow the dark theme — the app uses Ant Design dark algorithm globally, so components
  will inherit it automatically. Do not add any inline background colors that fight the
  theme.

**Don'ts:**
- Do not auto-trigger a scrape on page mount. The user clicks Refresh intentionally.
- Do not use any chart library for the alternatives comparison — the progress bar approach
  is sufficient and keeps the implementation simple.
- Do not add a separate Members or ScripDetail route — those pages exist in the repo but
  are intentionally unwired.
- Do not use `localStorage` or `sessionStorage` for any state in this page.
- Do not add the macro context string anywhere visible in the UI — it is a background AI
  enrichment only.

---

## Phase 8 — Verification steps

Complete these checks in order before considering the feature done.

1. Start the backend with `uvicorn app.main:app --reload --port 8000`. Confirm it starts
   without errors. The new `macro_indicators` table should be created automatically.

2. Call `POST /api/economy/macro/scrape` from a browser or curl. Confirm it returns a
   success dict with a non-zero `scraped` count and a list of period labels. If it returns
   an error, read the scraper log output and fix before continuing.

3. Call `GET /api/economy/macro`. Confirm it returns a full snapshot with `available: true`,
   a regime assessment, and sector signals. Confirm that derived real_deposit_return is
   computed correctly (deposit_rate minus cpi_yoy, both sourced from the latest period).

4. Call `GET /api/economy/alternatives?principal=100000&start_date=2022-01-01`. Confirm
   it returns results for at least two alternatives (NEPSE and FD are the most likely to
   have data). Confirm the results are sorted by final_amount descending.

5. Start the frontend with `npm run dev`. Navigate to `/economy`. Confirm the Macro pulse
   tab loads with a loading state, then displays data after the initial fetch. Confirm the
   Refresh button triggers a scrape and the UI updates.

6. On the Alternatives comparison tab, enter a principal and a past date and click Compare.
   Confirm results appear sorted with the winner marked.

7. Open the Dashboard or any stock in the Stock Explorer and trigger an AI analysis.
   Confirm the response implicitly reflects macro context (the regime description or rate
   environment should be referenced naturally in the verdict text).

---

## File change summary

| Action | Path |
|---|---|
| Create | `backend/app/models/macro_indicator.py` |
| Edit | `backend/app/models/__init__.py` |
| Create | `backend/app/scrapers/macro_scraper.py` |
| Edit | `backend/app/utils/scheduler.py` |
| Create | `backend/app/services/economy_service.py` |
| Edit | `backend/app/services/analysis/ai_service.py` |
| Create | `backend/app/api/economy.py` |
| Edit | `backend/app/main.py` |
| Create | `frontend/src/pages/Economy.jsx` |
| Edit | `frontend/src/App.jsx` |
| Edit | `frontend/src/services/api.js` |

No changes to `requirements.txt` — `curl_cffi`, `beautifulsoup4`, `sqlalchemy`, and
`fastapi` are already present.

No migration script needed — `init_db()` creates the new table automatically on startup.