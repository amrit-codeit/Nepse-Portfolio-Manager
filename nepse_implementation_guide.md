# NEPSE Portfolio Manager: Local Implementation & Data Sourcing Guide

Since this application is intended as a personal passion project running locally for a few users, we must minimize heavy infrastructure, avoid paid APIs, and prioritize features that offer the highest value with the least maintenance. 

The major challenges are reliably sourcing NEPSE data (since official APIs are restricted) and managing time-sensitive calculations (like Capital Gains Tax holding periods). 

---

## 1. Feature Priority Matrix

### 🔴 Extremely Important (Implement Now)
These features fundamentally fix the accuracy of the portfolio valuation and ease user onboarding.

1.  **True Cost & Net Unrealized P&L:** Without accounting for SEBON, DP fees, Broker Commission, and CGT, the portfolio's total value is an illusion in NEPSE.
2.  **Today's Gain/Loss:** Essential for daily tracking. Users need to see how much their portfolio moved *today* against yesterday's close.
3.  **Capital Gains Tax (CGT) Timer:** Tracking whether a holding has crossed the 365-day threshold (5% vs 7.5% tax chunk).
4.  **TMS Trade Book Import (CSV/Excel):** The single best way to onboard local users. No one wants to manually punch in 50 past trades.

### 🟡 Good to Have (Implement Later / Iteratively)
These provide analytical value but require more complex scraping and data storage.

1.  **Insights Tab (Fundamentals):** PE, NPL, EPS, and Dividend History.
2.  **Insights Tab (Technicals):** Moving Averages, RSI, 52-Week Range.
3.  **Mutual Fund NAV Tracker:** Tracking close-ended Mutual Funds' discount/premium.
4.  **Corporate Action Alerts:** Requires constant automated scraping of ShareSansar notices, which can be hard to maintain for a local app.

---

## 2. Data Sourcing Strategy (Free/Local Methods)

Because the app runs locally and backend services won't be running 24/7, we must use an **On-Demand / Lazy-Loading** strategy. We only fetch data exactly when the user requests it or when the backend starts up, rather than relying on heavy cron jobs.

### 2.1 Live Market Data (LTP, Day's Gain/Loss)
*   **Source:** `nepsealpha.com/api/smx9156/live_data` (Check network tab on NepseAlpha for public endpoints) or lightly scraping the `nepalstock.com.np` live market HTML table using Python's `BeautifulSoup`.
*   **Implementation:** 
    *   Create a caching layer in your database (`market_quotes` table).
    *   When the UI requests prices, check if the data in the DB is older than 5 minutes (and check if the current time is between 11 AM - 3 PM NPT).
    *   If expired, trigger a background fetch, update the DB, and return the fresh prices.
    *   **Data to store:** Symbol, LTP, Previous Close, % Change.

### 2.2 Historical Price Data (For XIRR, Charts, MAs, RSI)
*   **Source:** NepseAlpha's TradingView history endpoint (e.g., `nepsealpha.com/trading/1/history?symbol=XYZ&resolution=1D`).
*   **Implementation:**
    *   For technical indicators, you need at least 200 days of history. 
    *   Only fetch history for symbols the user *actually holds* or explicitly searches for. Store this in a local SQLite/PostgreSQL `price_history` table.

### 2.3 Fundamental & Corporate Data (PE, NPL, Dividends)
*   **Source:** Scraping ShareSansar's company proxy pages (e.g., `sharesansar.com/company/NABIL`). 
*   **Implementation:**
    *   Fundamental data only changes quarterly. When a user requests "Insights" for a symbol, scrape it and cache the HTML parsed data in the DB with a **Time-To-Live (TTL) of 7 days**.

---

## 3. Implementation Blueprint: Backend & Frontend

### 3.1 True Cost & Net Unrealized P&L
**Backend (Python/FastAPI):**
*   **The FIFO Challenge:** To determine the holding period (365 days), implement a First-In, First-Out (FIFO) queue for trades.
*   When calculating `Net P&L`, cycle through active `BUY` transactions.
*   If `(Current Date - Buy Date) > 365`, CGT = 5% of Profit. Else, CGT = 7.5%.
*   `Broker Commission` tiers (e.g., > 50 Lakhs is 0.27%, < 50,000 is 0.40%). Write a helper utility `calculate_exit_load(qty, rate)` that deducts Rs. 25 (DP), 0.015% (SEBON), Broker Comm, and CGT.

**Frontend:**
*   In `OverviewTab.jsx`, replace the raw P&L with `Net P&L`. Add a tooltip detailing the exact estimated fees deducted.

### 3.2 TMS File Import Integration
**Backend (Python/FastAPI):**
*   Create an endpoint: `POST /api/portfolio/tms-import`.
*   Use `pandas` to read the uploaded CSV. NEPSE TMS format is standard. 
*   **Mapping logic:** Extract `Symbol`, `Transaction Date`, `Quantity`, `Rate`, and `Transaction Type` (Buy/Sell).
*   Automatically check for duplicates to prevent double-counting if the user uploads the file again next month.

**Frontend (React/Vite):**
*   In `Transactions.jsx` or a new `Settings.jsx` tab, use an Ant Design `<Upload.Dragger>` component. 
*   Show a summary modal before committing: *"Found 12 Buys and 4 Sells. Import?"*

### 3.3 Today's Gain/Loss Feature
**Backend:**
*   Expose a `today_pnl` field alongside `unrealized_pnl` for each holding. 
*   `today_pnl = (LTP - Previous_Close) * Current_Qty`.

**Frontend:**
*   In the `Dashboard.jsx` top overview cards, add a metric: `"Today's Change: Rs. +5,400 (+1.2%)"` colored securely in green/red to fulfill immediate user dopamine/curiosity upon opening the app.

### 3.4 The "Insights" Tab (Fundamental & Technical)
**Frontend (React/Vite):**
*   Create `InsightsTab.jsx`.
*   Add a prominent Search Bar (AutoComplete listing all NEPSE tickers).
*   **UI Layout:** 
    *   **Left Column (Fundamentals):** Use an Ant Design `<Descriptions>` component to cleanly list PE, PBV, EPS, NPL, and Dividend History.
    *   **Right Column (Technicals):** 
        *   Show 52-Week High and Low with a progress bar (`<Progress percent={...} />`) indicating exactly where the LTP sits.
        *   Display Simple/Exponential Moving Average statuses (e.g., `<Tag color="green">Bullish (Above 50 EMA)</Tag>`).

**Backend (Python/FastAPI):**
*   Create a dedicated `/api/insights/{symbol}` endpoint.
*   Instead of importing heavy machine learning libraries, use `pandas-ta` to calculate the 50/200 MA and RSI on the fly using the local `price_history` table.
*   Return a neat JSON format mixing scraped fundamental data and computed offline technical data.
