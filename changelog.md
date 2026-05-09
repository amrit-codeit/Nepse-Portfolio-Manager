# Change Log

All notable changes to this project will be documented in this file.

## [1.8.0] - 2026-05-09
### Added
- **Global Data Import/Export**: Introduced a chunked ZIP-of-JSONL import/export system in `system.py` for infinite SQLite scalability and easy bootstrap/sharing of market data.
- **Transaction Expression Engine**: Added support for math expressions in transaction amounts (e.g., `=3*4`) and auto-filling from previous entries.
- **Improved UI/UX**: Redesigned transaction history actions with intuitive icons, merged Calculator directly into the Trading Desk, and decoupled auth guards that broke Dashboard stability.

### Changed
- **Unified Application Port**: Moved the default proxy application port from 8000/5173 to `8080` to prevent local environment conflicts.
- **NEPSE Health Scoring**: Re-architected the fundamental scoring engine with sector P/E bands, dividend quality limits, and forward return proxies to prevent overvalued stocks from achieving high scores.

### Fixed
- **Dashboard Performance**: Removed O(N) fundamental analysis loop in `get_portfolio_summary`, reducing DB queries by over 250+ per load and significantly speeding up the dashboard.
- **Transaction DB Conflicts**: Refactored `get_next_transaction_id` to reliably calculate global maximums, resolving `UNIQUE constraint failed` errors on bulk operations.
- **CGT Calculation**: Corrected logic to use tax-adjusted WACC instead of standard WACC for tax calculations on loss-making trades.

## [1.7.0] - 2026-05-03
### Added
- **Economy & Alternatives Dashboard**: New global dashboard tracking macroeconomic indicators, monetary regime signals, and sector rotation advice based on interest rates.
- **Alternatives Comparison Tool**: A dedicated tool to benchmark hypothetical principal investments between NEPSE, Fixed Deposits, Gold, and Silver starting from 2020.
- **AI Macro Intelligence**: Integrated real-time macroeconomic context (CPI, FD Rates, GDP growth) into AI Value and Trading verdicts for grounded decision making.

## [1.6.0] - 2026-04-28
### Added
- **AI Portfolio Context Awareness**: Upgraded the AI Analysts (both Value and Trading) to be fully portfolio-aware. The AI now evaluates stocks differently depending on whether they are new discoveries or existing holdings in a specific member's portfolio.
- **Position-Aware Verdicts**: The Trading Copilot now utilizes active trade setup data (Entry Price, Target, Stop Loss, Quantity) to issue specific `EXIT`, `WAIT`, or `STOP_LOSS` commands for existing holdings, instead of generic advice.
- **Trade Intel Integration**: Activated the Trade Intel dashboard within Stock 360 by registering backend epoch-generation and AI-review API routes, enabling retrospective trade analysis.
- **Action Center Enhancements**: Enhanced the main Dashboard's Action Center to explicitly surface XIRR, Absolute Profit, and Dividend Yield for immediate performance visibility.

### Changed
- **Trading Desk UI**: Unified the Live Technicals and AI Copilot into a single `StockAnalysis` component with a shared stock and portfolio member selector.
- **Value AI Prompts**: Enriched the Value Investing AI context with granular portfolio metrics, including XIRR, WACC, Unrealized PnL, and Concentration (HHI).

## [1.5.0] - 2026-04-26
### Added
- **Nvidia AI Integration**: Integrated Nvidia's AI API (DeepSeek V4 Pro) across the web application, providing an alternative to local Ollama and Groq models for high-quality market analysis.
- **Multi-Provider Cloud AI**: Refactored the AI service to support dynamic switching between Groq and Nvidia cloud providers in Executive Summary and Trading Copilot views.

### Changed
- **Backend Architecture**: Updated `AIService` to handle OpenAI-compatible Nvidia endpoints with specialized thinking-token suppression for DeepSeek models.
- **Frontend UI**: Enhanced AI Analyst panels with provider selection dropdowns and improved loading states for cloud inference.

### Fixed
- **Authentication Resilience**: Resolved a critical backend startup crash related to missing `MASTER_PASSWORD` environment variables.
- **Market Data Refresh**: Fixed a 422 Unprocessable Entity error on the scraping router, enabling seamless on-demand market data updates for all sessions.

## [1.4.0] - 2026-04-25
### Added
- **Institutional Portfolio Metrics**: Integrated Sharpe Ratio, Maximum Drawdown, and Portfolio Beta tracking into the main dashboard for professional performance ranking.
- **Volatility-Based Risk Management**: Added Average True Range (ATR) to the Technical Screener and implemented an automated 1.5x ATR trailing stop-loss suggestion in the Risk Calculator.
- **DCF Scaffolding**: Prepared backend models for Discounted Cash Flow (DCF) valuation, laying the groundwork for multi-year fundamental ingestion.
- **Security Hardening Phase 1-5**: Upgraded master password to `bcrypt` hashing, implemented `Fernet` encryption for MeroShare credentials (CRN/PIN), and added a 15-minute frontend inactivity auto-lock.

### Changed
- **WACC Engine**: Refined the portfolio engine to correctly apply face value rules for Mutual Funds (Rs. 10) vs Equities (Rs. 100) when calculating bonus WACC.
- **XIRR Robustness**: Improved the XIRR Newton-Raphson solver to handle extreme market volatility using multiple convergence guesses.
- **CGT Calculation**: Accurately computes holding days based on precise transaction timestamps rather than defaulting to zero days.

### Fixed
- **Upload Resilience**: Added strict 5MB size limits and structural try/except error boundaries on all file upload endpoints (MeroShare CSV, DP statements).
- **Selenium Automation Risks**: Disabled insecure browser flags and enforced randomized debugging ports to prevent potential local DevTools exploits.


## [1.3.0] - 2026-04-19
### Added
- **Dynamic Trade Executor**: Interactive position sizing tool with Capital and Risk sliders, calculating ATR-based Entry, Stop Loss, and Targets.
- **Strategy Tester**: Vectorized backtesting engine to evaluate algorithmic strategies (EMA Crossover, RSI Mean Reversion) over historical price data.
- **Advanced Technical Indicators**: Integrated Bollinger Band Squeeze detection and Relative Strength (RS Alpha) vs NEPSE index in the underlying analysis engine.
- **Modular Subtabs**: Decomposed the monolithic Stock Explorer view into streamlined Technical, Fundamental, and Strategy subtabs for better data consumption.

### Changed
- **UI Architecture**: Refactored `Insights.jsx` (1000+ lines) into clean, focused sub-components (`TechnicalTabs`, `FundamentalTabs`, `StrategyTester`).
- **Component Reusability**: Extracted unified `PriceHistoryCard` into a shared portfolio component for consistent historical charting across the application.


## [1.2.0] - 2026-04-10
### Added
- **Buy/Sell Calculator**: Real-time trade simulator with full SEBON fee breakdown and FIFO-based Capital Gains Tax (CGT) estimation.
- **Scrip Detail Dashboard**: Dedicated page for individual stock analysis featuring historical price charts with interactive transaction markers (Buy/Sell dots).
- **Advanced Portfolio Metrics**: Integrated Herfindahl-Hirschman Index (HHI) for concentration risk, Realized Profit tracking, and Yield on Cost (YOC) metrics.
- **Startup Maintenance**: Automated database backup trigger on application startup to ensure data safety regardless of uptime.
- **Enhanced Dashboard**: Segmented Equity vs. SIP performance metrics including XIRR and dividend income.

### Changed
- **Engine Optimization**: Significant performance overhaul of technical indicator computation (batched database queries).
- **History Speed**: Refactored portfolio history generator to use trading-day iteration, resulting in 5x faster chart rendering.
- **Refactored Dashboard**: Migrated client-side heavy metrics to the backend for improved initial load stability.

### Fixed
- **Rules of Hooks**: Resolved a critical UI crash in the Dividend Yield tab caused by conditional hook calls.
- **Performance Lag**: Fixed frontend stuttering when switching between dashboard tabs by optimizing data synchronization.

## [1.1.0] - 2026-04-09
### Added
- **Targeted Insights Scraping**: Added "Scrape Latest Data" button in Insights tab to fetch history, fundamentals, and dividends for a specific symbol.
- **Historical Data Sub-pages**: Structured Historical Data into Price, Issues, and NEPSE Index sub-tabs.
- **Issues Management**: Implementation of Issues (IPO/FPO/Right) table with company name joining.
- **Unified Live Fetching**: Real-time ticker now fetches both Equity prices and Mutual Fund NAVs sequentially from Sharesansar.

### Changed
- **Market Data Source**: Migrated live pride scraping from NepseAlpha to Sharesansar for improved reliability (LTP availability).
- **Prices Tab UI**: Refocused "Live Market" on real-time data and renamed "Historical Prices" to "Historical Data".
- **Insights Integration**: Moved Dividend History from a standalone tab into the Market Insights dashboard for better context.
- **Scraper Efficiency**: Modified backend scrapers to support symbol-specific extraction, reducing unnecessary load and improving speed.

### Fixed
- **AI Analysis Errors**: Resolved `NameError` in executive summary generation and improved fallback logic for missing fundamental data.
- **Frontend Stability**: Fixed UI crashes during AI summary generation and improved loading states.

## [1.0.0] - 2026-04-01
### Added
- Initial release of Nepal Portfolio Manager.
- Core portfolio tracking and transaction management.
- Basic AI executive summary for stock analysis.
- Initial scraper implementation for NepseAlpha.
