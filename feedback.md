# Nepal Portfolio Manager - Product Feedback and Implementation Roadmap

## Perspective

This review is written from the perspective of a seasoned NEPSE investor and short-term trader.

Assumption:

- investing and wealth compounding remain the core use case
- trading is a separate short-term sleeve meant to use roughly 20% of total capital
- the app should become a complete daily operating system for a normal Nepal stock market user

The goal is not only to track a portfolio, but to help a user make better decisions, manage risk, stay aware of events, and maintain discipline across both investing and trading.

---

## Executive View

The project already has a strong foundation. It is materially better than a typical retail tracking tool because it understands the user's actual portfolio book and cost basis instead of showing only generic market data.

Current strengths:

- strong accounting layer with true WACC and tax WACC
- good support for Nepal-specific workflows like MeroShare sync and DP statement imports
- multi-member family portfolio support
- useful portfolio analytics against NEPSE benchmark
- stock-level research combining fundamentals, technicals, and portfolio context
- early but promising trading workflow support
- AI analysis that can become powerful when grounded in real position context

Current gap:

The app feels like a powerful toolkit, but not yet a complete daily command center.

To become a complete solution for a normal NEPSE user, it should fully support five jobs:

1. capital and cash management
2. decision support
3. execution discipline
4. portfolio and trade lifecycle tracking
5. yearly reporting and tax visibility

---

## What Is Already Good

### 1. Portfolio Accounting

The dual WACC system is one of the strongest parts of the app.

Why it matters:

- Nepal investors often get confused between actual cost and tax cost
- bonus, right shares, and different transaction types create messy book values
- the current engine solves a real local pain point

Strong existing pieces:

- true WACC
- tax WACC
- holdings recalculation
- XIRR
- dividend yield and benchmark comparison

### 2. Nepal Market Workflow Fit

The app already respects the way a real Nepal investor operates.

Strong existing pieces:

- MeroShare sync
- encrypted credential storage
- IPO application support
- issue price tracking
- DP statement reconciliation
- dividend handling

### 3. Research Experience

The Insights and Stock 360 experience is already a meaningful differentiator.

Strong existing pieces:

- technical indicators
- fundamental summaries
- executive summary
- trade intel
- portfolio-aware stock view

### 4. Trading Foundation

The Trading Desk has the right skeleton.

Strong existing pieces:

- watchlist and setups
- active positions
- journal
- risk calculator
- technical screener
- strategy tester
- buy/sell calculator

This is enough to build on. It does not need reinvention, only expansion and tighter workflow logic.

---

## What Is Missing for a Complete User Solution

The app now needs to evolve from "analysis and record-keeping" into a "daily operating cockpit."

### 1. Cash and Capital Allocation Engine

This is the biggest missing layer.

A normal user needs to know:

- how much total capital they have
- how much cash is free
- how much is reserved for IPOs
- how much is locked in settlement
- how much is allocated to long-term investing
- how much is allocated to the short-term trading sleeve
- whether the trading sleeve is exceeding policy

For a user following a 20% trading sleeve model, this should be explicit in the app.

Recommended features:

- capital policy settings
- trading sleeve allocation
- investing sleeve allocation
- deployable cash tracker
- reserved cash tracker
- idle cash tracker
- member-wise and consolidated cash view

Data required:

- manual cash ledger at minimum
- optional bank deposit/withdrawal input
- settlement-aware cash movement logic

### 2. Trade Lifecycle and Discipline Engine

At the moment the app helps the user analyze and store setups, but it should also enforce a clean trading process.

Recommended features:

- setup lifecycle:
  - idea
  - watchlist
  - ready
  - entered
  - scaled
  - partial exit
  - fully exited
  - reviewed
- pre-trade checklist
- post-trade review checklist
- rule-violation logging
- scale-in support
- scale-out support
- trailing stop logic
- time stop logic
- max risk-per-trade enforcement
- daily loss limit and weekly loss limit

Why it matters:

- most retail traders lose not because they lack indicators
- they lose because they lack process and discipline

### 3. Alerts and Market Watch

A normal user will not stare at the screen all day.

The app should tell the user what matters now.

Recommended alerts:

- LTP enters planned buy zone
- stop loss is close
- stop loss is broken
- target is hit
- unusual volume spike
- RSI or EMA trigger
- large drawdown in a position
- concentration breach
- dividend/book closure reminder
- rights/FPO/IPO deadline reminder

Recommended outputs:

- today's actions
- this week's events
- triggered watchlist items
- risk warnings

Data required:

- fresh price data
- event/corporate action data
- user-defined rules

### 4. Corporate Action and Event Calendar

This is essential in Nepal and should be first-class, not hidden.

Recommended features:

- dividend calendar
- book closure calendar
- AGM/EGM reminder system
- rights issue window tracking
- FPO and auction window tracking
- IPO schedule dashboard
- symbol-level event history

Why it matters:

- a lot of Nepal investing returns and decisions are event-driven
- users often miss book closures, application windows, and entitlement logic

Data required:

- structured corporate action data from reliable sources
- dates, eligibility rules, face value logic, and status

### 5. Annual Tax and Reporting Center

Normal users eventually want formal answers, not just dashboards.

Recommended features:

- fiscal-year realized gains report
- dividend income report
- member-wise annual statement
- combined family statement
- sell-side tax summary
- export for accountant use
- capital deployed vs realized return report

Why it matters:

- users want confidence at year-end
- trust increases sharply when the app can produce clean summaries

Data required:

- full transaction history
- reconciled dividend records
- fiscal-year mapping rules
- realized gain logic by sell date and hold period

---

## Additional Features That Would Make the App Feel Premium

### 1. Portfolio Rebalancing Assistant

For long-term investing:

- target sector weight
- target symbol weight
- current vs target deviation
- suggested buy or reduce actions

### 2. Market Breadth Dashboard

For overall market context:

- advance/decline
- sector leaders and laggards
- turnover regime
- broad risk-on vs risk-off conditions
- index breadth and participation

### 3. Valuation Watchlist

For investors:

- buy-below price
- fair value range
- accumulate range
- overvalued warning

### 4. Trade Playbook Library

For traders:

- breakout playbook
- pullback playbook
- mean reversion playbook
- trend continuation playbook
- dividend capture playbook
- result-season momentum playbook

### 5. Data Freshness and Confidence Layer

Every important widget should show:

- source
- last updated time
- stale warning
- confidence level if scraped

This is especially important in Nepal because data reliability varies by source.

### 6. Mobile-Oriented Daily Action Center

A compact daily page should answer:

- what needs action today
- which positions need review
- which watchlist stocks triggered
- which events are upcoming

---

## Features That Need More Data

Some future features are mostly product and UI work.
Others will depend on a stronger data layer.

### A. Features needing better price and market coverage

- near-real-time alerting
- intraday action cues
- market breadth dashboard
- sector rotation analytics
- stronger active-position monitoring

Required data:

- reliable frequent LTP updates
- turnover and volume refresh
- broader symbol coverage across market
- sector index history

### B. Features needing better corporate action coverage

- event calendar
- book closure reminders
- rights/FPO/auction workflow
- dividend expectation engine

Required data:

- structured corporate action feed
- event dates
- eligibility dates
- action type
- entitlement ratio
- issue price / face value rules

### C. Features needing richer execution data

- partial exits
- position scaling
- expectancy and slippage analysis
- better trader scorecards

Required data:

- execution timestamps
- partial fill records
- per-leg buy/sell breakdown
- fees per trade leg

### D. Features needing richer cash and banking data

- free cash visibility
- capital sleeve management
- settlement-aware deployment
- return on idle cash

Required data:

- cash inflow/outflow records
- account-level cash balances
- reserve buckets
- settlement status

### E. Features needing reporting-grade data quality

- tax center
- yearly reports
- accountant exports

Required data:

- complete transaction history
- accurate dates
- reconciled dividends
- finalized realized P&L logic

---

## Recommended Product Priorities

This is the order that would create the most user value with the least waste.

### Phase 1 - Trust, clarity, and operating visibility

Goal:

Turn the app into a reliable daily overview for both investors and traders.

Build:

1. cash ledger and capital allocation policy
2. data freshness labels everywhere important
3. unified corporate action calendar
4. consistent reporting of realized and unrealized values across pages
5. dashboard "today's actions" module

Expected benefit:

- users understand where they stand
- fewer missed events
- stronger confidence in the app as a daily tool

### Phase 2 - Trader discipline system

Goal:

Make the trading workflow operational rather than only analytical.

Build:

1. expanded setup lifecycle
2. scale-in and partial-exit support
3. stop-loss and target alerts
4. trailing stop logic
5. rule-violation tracking
6. expectancy, average R, and setup quality metrics

Expected benefit:

- improves actual trading behavior
- reduces emotional decision-making
- turns the trading desk into a proper short-term system

### Phase 3 - Investor completeness

Goal:

Cover the full long-term investor lifecycle.

Build:

1. rebalancing assistant
2. valuation watchlist
3. family-level consolidated statements
4. annual reporting center
5. goal or strategy tagging per holding

Expected benefit:

- app becomes useful for both active users and quieter long-term investors
- more complete portfolio management experience

### Phase 4 - Market intelligence

Goal:

Make the app useful even before a user chooses a stock.

Build:

1. breadth dashboard
2. sector rotation view
3. regime dashboard
4. top movers with context
5. market watch summary

Expected benefit:

- improves idea generation
- gives context before trade or investment decisions

### Phase 5 - Automation and polish

Goal:

Reduce friction and make the app habit-forming.

Build:

1. scheduled sync jobs with retries
2. notification channels
3. better onboarding
4. mobile-first quick action view
5. cleaner document and export workflows

Expected benefit:

- turns utility into habit
- lowers maintenance burden on users

---

## Suggested Implementation Blueprint

This section is meant to be reused in the future as a development guide.

### Step 1 - Strengthen the data model

Add the missing entities first.

Recommended new tables or equivalents:

- `cash_accounts`
- `cash_ledger`
- `capital_policy`
- `alerts`
- `alert_rules`
- `corporate_actions`
- `execution_events`
- `trade_checklists`
- `report_snapshots`

Extend existing models:

- `TradeSetup`
- `TradeJournal`
- `PortfolioSnapshot`

### Step 2 - Build the missing services

Recommended service modules:

- cash engine
- capital allocation engine
- alert evaluation engine
- corporate action normalizer
- report generator
- trade discipline / checklist engine
- market breadth aggregator

### Step 3 - Expose backend APIs

Recommended API families:

- `/api/cash`
- `/api/capital-policy`
- `/api/alerts`
- `/api/calendar`
- `/api/reports`
- `/api/trading/executions`
- `/api/market/breadth`

### Step 4 - Upgrade the frontend in the right order

Recommended order:

1. Dashboard
2. Trading Desk
3. Insights / Stock Explorer
4. Settings
5. Reporting center

Why this order:

- Dashboard creates daily utility
- Trading Desk improves active behavior
- Insights becomes stronger after operating context exists

### Step 5 - Improve AI only after operational data improves

AI should sit on top of a strong operating system, not compensate for missing workflow.

Recommended AI expansion after core workflow is stable:

- portfolio rebalance assistant
- event-driven watchlist assistant
- trade checklist reviewer
- "what changed today" summary
- post-trade coaching summary

---

## Specific Product Recommendations by User Type

### A. Long-term investor

Needs:

- cost basis clarity
- dividend visibility
- valuation watchlist
- annual reporting
- rebalancing help

Current status:

- already partly served

Main missing pieces:

- cash layer
- rebalancing assistant
- reporting center

### B. Active trader using 20% capital

Needs:

- strict risk controls
- clean setup lifecycle
- alerts
- execution discipline
- review loop

Current status:

- partially served

Main missing pieces:

- capital sleeve control
- alerting
- partial exits
- trailing logic
- rule tracking

### C. Normal family user

Needs:

- simple status
- event reminders
- easy imports
- member-wise visibility
- annual summary

Current status:

- decent base exists

Main missing pieces:

- event calendar
- yearly reports
- daily action center

---

## Final Assessment

This project is already strong in three areas:

- portfolio accounting
- Nepal-specific workflow support
- analytical depth

Its next leap should not be more scattered indicators or more AI for the sake of it.

Its next leap should be:

- capital control
- event awareness
- trader discipline
- yearly reporting
- daily decision support

That is what will transform it from a powerful portfolio tool into a complete Nepal stock market operating system.

---

## Recommended Next Deliverable

The most useful next artifact after this file would be a structured implementation spec with:

- database changes
- service modules
- API routes
- frontend sections
- rollout order
- dependencies and data requirements per feature

That should be prepared before major feature expansion begins.
