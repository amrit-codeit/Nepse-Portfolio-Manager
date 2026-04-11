# Change Log

All notable changes to this project will be documented in this file.

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
