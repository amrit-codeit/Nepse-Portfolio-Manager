"""
APScheduler integration for automatic background tasks.

Jobs:
- Live price refresh every 5 minutes during NEPSE market hours (11:00-15:15 NPT)
- NAV refresh daily at 18:00 NPT
"""

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from datetime import datetime
from app.database import SessionLocal
from app.scrapers.price_scraper import scrape_live_prices
from app.scrapers.nav_scraper import scrape_nav

scheduler = BackgroundScheduler()


def _refresh_prices():
    """Background job to refresh live prices."""
    db = SessionLocal()
    try:
        print(f"[Scheduler] Refreshing live prices at {datetime.now()}")
        scrape_live_prices(db)
    except Exception as e:
        print(f"[Scheduler] Price refresh failed: {e}")
    finally:
        db.close()


def _refresh_nav():
    """Background job to refresh mutual fund NAVs."""
    db = SessionLocal()
    try:
        print(f"[Scheduler] Refreshing NAVs at {datetime.now()}")
        scrape_nav(db)
    except Exception as e:
        print(f"[Scheduler] NAV refresh failed: {e}")
    finally:
        db.close()


def _take_portfolio_snapshot():
    """Background job to record daily portfolio values for each member."""
    from app.models.member import Member
    from app.models.portfolio_snapshot import PortfolioSnapshot
    from app.services.portfolio_engine import get_portfolio_summary

    db = SessionLocal()
    try:
        today = datetime.now().date()
        members = db.query(Member).filter(Member.is_active == True).all()
        count = 0
        for member in members:
            # Skip if snapshot already taken today
            existing = db.query(PortfolioSnapshot).filter(
                PortfolioSnapshot.member_id == member.id,
                PortfolioSnapshot.date == today
            ).first()
            if existing:
                continue

            summary = get_portfolio_summary(db, member.id)
            snapshot = PortfolioSnapshot(
                member_id=member.id,
                date=today,
                total_investment=summary.total_investment,
                current_value=summary.current_value,
                unrealized_pnl=summary.unrealized_pnl,
                holdings_count=summary.holdings_count,
            )
            db.add(snapshot)
            count += 1

        db.commit()
        print(
            f"[Scheduler] Portfolio snapshots saved for {count} members on {today}")
    except Exception as e:
        print(f"[Scheduler] Snapshot failed: {e}")
        db.rollback()
    finally:
        db.close()


def start_scheduler():
    """Start the background scheduler with configured jobs."""
    # Refresh prices every 5 minutes, Sun-Thu 11:00-15:15 NPT
    # Using timezone="Asia/Kathmandu" - hours should be local.
    # day_of_week="sun-thu" fails because Sun(6) > Thu(3). Correct: "sun,mon,tue,wed,thu"
    scheduler.add_job(
        _refresh_prices,
        CronTrigger(
            day_of_week="sun,mon,tue,wed,thu",
            hour="11-15",
            minute="*/5",
            timezone="Asia/Kathmandu",
        ),
        id="refresh_prices",
        name="Refresh live prices",
        replace_existing=True,
    )

    # Refresh NAVs daily at 18:00 NPT (12:15 UTC)
    scheduler.add_job(
        _refresh_nav,
        CronTrigger(
            hour=18,
            minute=0,
            timezone="Asia/Kathmandu",
        ),
        id="refresh_nav",
        name="Refresh mutual fund NAVs",
        replace_existing=True,
    )

    # Backup daily at 23:55 NPT
    from app.services.backup_service import create_database_backup
    scheduler.add_job(
        create_database_backup,
        CronTrigger(
            hour=23,
            minute=55,
            timezone="Asia/Kathmandu",
        ),
        id="daily_backup",
        name="Daily Database Backup",
        replace_existing=True,
    )

    # Take daily portfolio snapshot at 15:30 NPT (after market close)
    scheduler.add_job(
        _take_portfolio_snapshot,
        CronTrigger(
            day_of_week="sun,mon,tue,wed,thu",
            hour=15,
            minute=30,
            timezone="Asia/Kathmandu",
        ),
        id="portfolio_snapshot",
        name="Daily Portfolio Snapshot",
        replace_existing=True,
    )

    scheduler.start()
    print("✅ Background scheduler started")
    print(f"   - Price refresh: every 5 min, Sun-Thu 11:00-15:15 NPT")
    print(f"   - NAV refresh: daily at 18:00 NPT")
    print(f"   - Database backup: daily at 23:55 NPT")
    print(f"   - Portfolio snapshot: daily at 15:30 NPT (market close)")


def stop_scheduler():
    """Stop the scheduler gracefully."""
    if scheduler.running:
        scheduler.shutdown()
        print("⏹️ Background scheduler stopped")
