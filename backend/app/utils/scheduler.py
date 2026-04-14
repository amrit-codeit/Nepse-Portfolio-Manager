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
    # Note: Automated scheduled backup was removed.
    # Backups now run exactly once upon application STARTUP.
    # This is better for a local application where the device is not 24/7 online.

    scheduler.start()
    print("[OK] Background scheduler started (No active jobs yet)")


def stop_scheduler():
    """Stop the scheduler gracefully."""
    if scheduler.running:
        scheduler.shutdown()
        print("[EXIT] Background scheduler stopped")
