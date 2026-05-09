# Data Flow & Scraper Staleness Contracts

## Overview
This document describes the flow of financial data from external sources (NEPSE, ShareSansar, NRB) into the Portfolio Manager's analytical engines.

## 1. Scraper Execution & Staleness (C-4/M-6)
To prevent the analytical engines from generating verdicts based on stale or missing data, we introduced the `ScraperResult` contract and the `ScraperRun` audit log.

### The Contract (`ScraperResult`)
Every scraper must return a `ScraperResult` containing:
- `status`: `success` | `partial` | `failed`
- `records_upserted`: integer count of rows affected
- `error_message`: if `failed` or `partial`
- `duration_seconds`: how long the scrape took

### Pydantic Validation (M-6)
All scraped data is passed through Pydantic schemas (e.g., `ScrapedPrice`, `ScrapedFundamental`) *before* being written to the database.
If external HTML structures change and a critical field is missing, Pydantic raises a `ValidationError`. The scraper catches this, logs a `partial` or `failed` state, and prevents corrupted `NULL` values from breaking the portfolio engine.

### The Staleness Heartbeat
The `ScraperRun` table tracks the `last_scraped_at` timestamp for every scraper.
The `/api/health` endpoint exposes a `scrapers` object detailing the last successful run for every active scraper.
The frontend React Query configurations use this data to determine if a hard manual refresh is necessary or if background polling is sufficient.

## 2. In-Memory Concurrency Locks (M-3)
Scrapers are triggered by the APscheduler (`app/utils/scheduler.py`). Because scrapers are IO-bound and can take several minutes (especially `fundamental_scraper`), cron jobs could overlap, leading to duplicate database writes and database locks (`SQLite Database is Locked`).

We implemented an in-memory concurrency lock:
```python
_active_scrapers = set()

if scraper_name in _active_scrapers:
    logger.warning("scraper.already_running")
    return
_active_scrapers.add(scraper_name)
try:
    execute()
finally:
    _active_scrapers.discard(scraper_name)
```

## 3. Market-Aware Polling (H-2)
The frontend `queryConfig.js` implements a dynamic polling strategy:
- **Trading Hours**: Sunday–Thursday, 11:00 AM – 3:00 PM NPT.
- **Behavior**: Live prices and Index data are polled every 30 seconds during trading hours. Outside of trading hours, polling stops entirely to conserve system resources.
- **Fundamentals**: Refetched once every 24 hours.
