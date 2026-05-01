"""
APScheduler integration for automatic background tasks.
Limited to essential maintenance only.
"""

import asyncio
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from app.services.backup_service import create_database_backup
from app.database import SessionLocal

# Import scrapers
from app.scrapers.price_scraper import scrape_live_prices
from app.scrapers.nav_scraper import scrape_nav
from app.scrapers.index_scraper import scrape_nepse_index
from app.scrapers.history_scraper import scrape_historical_prices
from app.scrapers.dividend_scraper import scrape_and_calculate_dividends
from app.scrapers.fundamental_scraper import scrape_fundamentals
from app.models.holding import Holding
from app.models.scraper import ScraperRun
from datetime import datetime, timezone

scheduler = BackgroundScheduler()

def run_with_db(func, *args, scraper_name=None, **kwargs):
    """Helper to run a synchronous task with a database session and log to ScraperRun."""
    db = SessionLocal()
    if scraper_name is None:
        scraper_name = func.__name__
        
    run = ScraperRun(scraper_name=scraper_name, triggered_by="scheduler", status="running", started_at=datetime.now(timezone.utc))
    db.add(run)
    db.commit()
    
    try:
        result = func(db, *args, **kwargs)
        run.status = "success"
        if isinstance(result, dict) and "updated" in result:
            run.rows_affected = result.get("updated", 0) + result.get("created", 0)
        elif isinstance(result, int):
            run.rows_affected = result
    except Exception as e:
        run.status = "failure"
        run.error_message = str(e)
        print(f"Scheduler job failed for {func.__name__}: {e}")
    finally:
        run.finished_at = datetime.now(timezone.utc)
        db.commit()
        db.close()

def scheduled_price_scrape():
    run_with_db(scrape_live_prices)

def scheduled_nepse_index_scrape():
    run_with_db(scrape_nepse_index)

def scheduled_nav_scrape():
    run_with_db(scrape_nav)

def scheduled_index_history_scrape():
    run_with_db(scrape_historical_prices)

def scheduled_dividend_scrape():
    run_with_db(scrape_and_calculate_dividends)

def scheduled_fundamentals_bulk_scrape():
    db = SessionLocal()
    run = ScraperRun(scraper_name="scrape_fundamentals", triggered_by="scheduler", status="running", started_at=datetime.now(timezone.utc))
    db.add(run)
    db.commit()
    count = 0
    try:
        portfolio_symbols = db.query(Holding.symbol).filter(Holding.current_qty > 0).distinct().all()
        symbols = [s[0] for s in portfolio_symbols if s[0]]
        if symbols:
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            for symbol in symbols:
                try:
                    loop.run_until_complete(scrape_fundamentals(symbol, db))
                    count += 1
                except Exception as e:
                    print(f"Failed bulk fundamental scrape for {symbol}: {e}")
            loop.close()
        run.status = "success"
        run.rows_affected = count
    except Exception as e:
        run.status = "failure"
        run.error_message = str(e)
        print(f"Scheduler bulk fundamentals failed: {e}")
    finally:
        run.finished_at = datetime.now(timezone.utc)
        db.commit()
        db.close()

def start_scheduler():
    """Start the background scheduler with NEPSE trading hours jobs."""
    ktm_tz = 'Asia/Kathmandu'
    
    # Price scrape: Every 5 min, Sun-Thu 10:55-15:05 NPT
    # hour='10-15' covers 10:00 to 15:59. It's wider but captures the open/close reliably.
    scheduler.add_job(scheduled_price_scrape, CronTrigger(
        day_of_week='sun,mon,tue,wed,thu', hour='10-15', minute='*/5', timezone=ktm_tz
    ), id="price_scrape", replace_existing=True)
    
    # NEPSE index snapshot: Every 15 min, same window
    scheduler.add_job(scheduled_nepse_index_scrape, CronTrigger(
        day_of_week='sun,mon,tue,wed,thu', hour='10-15', minute='*/15', timezone=ktm_tz
    ), id="index_scrape", replace_existing=True)
    
    # NAV scrape: Daily 17:30 NPT
    scheduler.add_job(scheduled_nav_scrape, CronTrigger(
        hour=17, minute=30, timezone=ktm_tz
    ), id="nav_scrape", replace_existing=True)
    
    # Index history: Daily 16:30 NPT
    scheduler.add_job(scheduled_index_history_scrape, CronTrigger(
        hour=16, minute=30, timezone=ktm_tz
    ), id="history_scrape", replace_existing=True)
    
    # Dividend scrape: Weekly, Sunday 22:00 NPT
    scheduler.add_job(scheduled_dividend_scrape, CronTrigger(
        day_of_week='sun', hour=22, minute=0, timezone=ktm_tz
    ), id="dividend_scrape", replace_existing=True)
    
    # Fundamentals bulk: Weekly, Sunday 23:00 NPT
    scheduler.add_job(scheduled_fundamentals_bulk_scrape, CronTrigger(
        day_of_week='sun', hour=23, minute=0, timezone=ktm_tz
    ), id="fundamentals_scrape", replace_existing=True)

    scheduler.start()
    print("[OK] Background scheduler started with NEPSE trading hours jobs")

def stop_scheduler():
    """Stop the scheduler gracefully."""
    if scheduler.running:
        scheduler.shutdown()
        print("[EXIT] Background scheduler stopped")
