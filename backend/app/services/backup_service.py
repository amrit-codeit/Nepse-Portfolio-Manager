import os
import shutil
from datetime import datetime
import glob
from app.config import settings

def create_database_backup():
    """
    Creates a backup of the database.
    Retains the last 14 daily backups.
    Retains the 1st of every month indefinitely for monthly backups.
    """
    db_path = settings.DATABASE_URL.replace("sqlite:///", "")
    if not os.path.exists(db_path):
        print(f"[Backup] Database file not found at {db_path}")
        return

    backup_dir = os.path.join(os.getcwd(), "backups")
    os.makedirs(backup_dir, exist_ok=True)

    now = datetime.now()
    date_str = now.strftime("%Y%m%d")
    is_first_of_month = now.day == 1

    # Format: portfolio_YYYYMMDD.db or portfolio_YYYYMMDD_monthly.db
    if is_first_of_month:
        backup_filename = f"portfolio_{date_str}_monthly.db"
    else:
        backup_filename = f"portfolio_{date_str}.db"

    backup_path = os.path.join(backup_dir, backup_filename)
    
    # Don't backup multiple times on the same day unless it's a manual trigger that forces it
    if not os.path.exists(backup_path):
        shutil.copy2(db_path, backup_path)
        print(f"[Backup] Successfully created database backup: {backup_filename}")
    else:
        print(f"[Backup] Backup for today already exists: {backup_filename}")

    # Cleanup old daily backups (older than 14 days)
    cleanup_old_backups(backup_dir, retention_days=14)

def cleanup_old_backups(backup_dir, retention_days=14):
    """
    Deletes daily backups older than retention_days.
    Monthly backups (containing '_monthly') are skipped and kept forever.
    """
    now = datetime.now()
    search_pattern = os.path.join(backup_dir, "portfolio_*.db")
    
    for file_path in glob.glob(search_pattern):
        # Skip monthly backups
        if "_monthly" in file_path:
            continue
            
        file_time = datetime.fromtimestamp(os.path.getmtime(file_path))
        age_in_days = (now - file_time).days
        
        if age_in_days > retention_days:
            try:
                os.remove(file_path)
                print(f"[Backup] Cleaned up old backup: {os.path.basename(file_path)}")
            except Exception as e:
                print(f"[Backup] Failed to remove old backup {file_path}: {e}")
