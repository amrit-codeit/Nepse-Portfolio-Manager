# NEPSE Portfolio Manager: Comprehensive Financial Review & Feature Roadmap

This document provides a holistic review of the current metrics utilized in the Nepali Portfolio Manager web application, offering professional financial feedback, suggested enhancements, and a proposed roadmap for transforming the app into a full-fledged investment management platform tailored to the unique dynamics of the Nepal Stock Exchange (NEPSE).

---

## 1. Review of Existing Dashboard Metrics

The dashboard currently utilizes an excellent foundation of metrics across the Overview, Performance, and Risk tabs. However, it can be refined to better reflect the realities of NEPSE, such as high transaction costs, varying Capital Gains Tax (CGT), and a heavy reliance on dividend investing.

### 1.1 Overview Tab
**Current State:** Tracks Total Investment, Current Value, Unrealized P&L, Sector Allocation, Top Gainers/Losers, and Top Holdings. 
**Feedback & Recommendations:**
*   **Net Unrealized P&L (Post-Tax & Fees):** Currently, Unrealized P&L is likely purely `(LTP * Qty) - WACC`. In NEPSE, selling incurs 5% (long-term) or 7.5% (short-term) CGT, DP charges (Rs. 25), Sebon fee (0.015%), and Broker Commission (0.27% - 0.40%). Providing a *Net* P&L that estimates these exit costs will give users their true liquidating value.
*   **Day's Gain/Loss (Today's P&L):** Active Nepali investors check the market daily. Adding a metric showing the absolute and percentage change from the *previous day's closing price* is crucial for daily engagement.
*   **WACC Breakdown Context:** Ensure the WACC explicitly displays whether it has been adjusted for bonus shares, right shares, and historical cash dividends.

### 1.2 Performance Tab
**Current State:** Excellent use of XIRR, Realized Profit, Dividend Income, Portfolio Age, and Benchmarking against the NEPSE Index.
**Feedback & Recommendations:**
*   **Dividend Yield & Composition:** While absolute "Dividend Income" is great, showing the *Dividend Yield* (Total Dividend / Total Investment) provides a better gauge of cash flow efficiency. Furthermore, separate out **Bonus Shares vs. Cash Dividends**. In NEPSE, bonus share compounding is a primary wealth generator.
*   **Alpha and Beta vs. NEPSE:** Since you are already tracking the NEPSE curve, add a literal "Alpha" (outperformance against index) and "Beta" (portfolio volatility compared to the index). 
*   **Realized Profit Accuracy Check:** Ensure "Realized Profit" uses the actual sell execution price minus all TMS fees, rather than just raw `(Sell Rate - Buy Rate) * Qty`.

### 1.3 Risk Tab
**Current State:** Robust automated insights focusing on single-stock concentration (>30%), sector over-concentration (>40%), and cross-member dominance.
**Feedback & Recommendations:**
*   **Market Cap Exposure (Large/Mid/Small):** NEPSE is heavily divided by sector volatility. Commercial Banks act as Large Cap/Defensive stocks, while Hydropower and Microfinance act as highly volatile Mid/Small Caps. Displaying the portfolio's split across these classifications provides better risk context than just "sectors".
*   **Holding Period Risk (Taxation):** Highlight stocks grouped by holding period (e.g., < 1 year vs > 1 year). Stocks held under a year carry a 7.5% CGT risk, which is a tangible financial drag.
*   **Promoter vs. Ordinary Share Ratio:** If applicable, differentiating these is vital due to the lock-in periods and liquidity constraints of promoter shares in Nepal.

---

## 2. Proposed "Insights & Analysis" Tab

To retain power users, the app should allow them to analyze stocks internally without switching to external sites like ShareSansar or Merolagani. This new tab should allow users to search a symbol and instantly view a tear-sheet.

### 2.1 Fundamental Analysis Component
Tailored directly to what matters in the Nepali macroeconomic environment:
*   **Core Ratios:** PE Ratio, PBV (Price to Book Value), and EPS (Trailing vs. Annualized).
*   **Banking & Finance Specifics:** For banks and microfinance institutions, **NPL (Non-Performing Loans)**, **CD Ratio**, and **Capital Adequacy Ratio (CAR)** are non-negotiable. High NPL currently dictates dividend capacity in NEPSE.
*   **Dividend History & Capacity:** A historical chart showing Cash vs. Bonus dividend distribution over the last 5 years. Add an "Estimated Dividend Capacity" metric based on the latest quarterly report's distributable profit.
*   **Quarterly YoY Growth:** Sparklines showing Q1/Q2/Q3/Q4 Year-over-Year growth in Net Profit and Reserves & Surplus. 

### 2.2 Technical Analysis Component
A simplified, actionable technical view:
*   **Trend Indicators:** 50-day and 200-day Exponential Moving Averages (EMA). Display straightforward "Bullish" or "Bearish" badges based on golden/crosses.
*   **Momentum:** 14-day RSI (Relative Strength Index). Flag stocks clearly if they are Oversold (<30) or Overbought (>70).
*   **52-Week Range Proximity:** A visual slider showing where the Current Price sits between the 52-week High and 52-week Low. Many NEPSE retail investors buy strictly based on heavy drawdowns from the 52-week high.
*   **Volume Anomalies:** Flag stocks exhibiting trading volume > 200% of their 30-day average, indicating institutional accumulation or distribution.

---

## 3. Holistic Features for an Enterprise-Grade Portfolio Manager

To elevate the app from a simple tracking dashboard to a **Holistic Investment Management Platform**, consider prioritizing the following epic features:

### 3.1 Corporate Action Center & Alerts
Nepali investors frequently miss critical dates.
*   **Book Closure Alerts:** Automated notifications (email/in-app) for upcoming book closures on stocks in the user's holdings.
*   **Right Share & AGM Tracking:** Notifications about impending Right Share open/close dates and AGM schedules.
*   **IPO/FPO Tracker:** A dedicated widget showing current, upcoming, and recently closed IPOs/FPOs, alongside predicted allotment dates.

### 3.2 True Cost of Investing Tracker
*   **AMC & Fee Timeline:** Allow users to log their annual Demat MeroShare renewal fees (AMC).
*   **Broker Commission Sandbox:** A calculator that takes an intended trade quantity and rate, and spits out the *exact* net receivable/payable amount including CGT, DP, SEBON, and tier-based broker commission.

### 3.3 Advanced Mutual Fund Management
NEPSE has unique dynamics with Mutual Funds:
*   **Close-Ended NAV Arbitrage:** Close-ended funds in NEPSE traditionally trade at a 15% to 30% discount to their NAV. Implement a specific tracker showing a fund's `Traded Price vs. Weekly NAV`, allowing users to spot deep discount opportunities.

### 3.4 TMS (Trade Management System) Integration & Import
*   **Frictionless Sync:** Since automated API access is restricted by NEPSE, build a robust bulk-import pipeline where users can simply export their `Trade History Excel/CSV` from the TMS and drop it into the app. The app should automatically parse Buy/Sell, adjust WACC, and calculate realized profit without manual data entry.

### 3.5 Goal-Based Wealth Projections
*   Allow users or family groups to set financial goals (e.g., "Retirement Fund Rs. 1 Crore by 2035", "Child Education").
*   Use the portfolio's current XIRR and monthly SIP/buy rate to project a Monte Carlo-style timeline of when the goal will be achieved.

### 3.6 Tax Optimization Reporting (Fiscal Year)
*   At the end of the Nepali Fiscal Year (Mid-July / Asadh End), generate a clean, downloadable PDF report detailing exactly how much CGT was paid, total realized losses (harvesting), and total dividend tax deducted at source. This is incredibly useful for high net-worth individuals maintaining ledgers.
