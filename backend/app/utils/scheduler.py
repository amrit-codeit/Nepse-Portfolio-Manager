"""
APScheduler integration for automatic background tasks.
Limited to essential maintenance only.
"""

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from app.services.backup_service import create_database_backup

scheduler = BackgroundScheduler()

def start_scheduler():
    """Start the background scheduler with strictly necessary jobs."""
    
    # Backup daily at 23:55 NPT - Essential for data recovery
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

    scheduler.start()
    print("✅ Background scheduler started")
    print("   - Maintenance Mode: ACTIVE")
    print("   - Database backup: daily at 23:55 NPT (Asia/Kathmandu)")


def stop_scheduler():
    """Stop the scheduler gracefully."""
    if scheduler.running:
        scheduler.shutdown()
        print("⏹️ Background scheduler stopped")
