import os
import sqlite3

db_path = "portfolio.db"
if not os.path.exists(db_path):
    print("Database not found!")
    exit(1)

size_mb = os.path.getsize(db_path) / (1024 * 1024)
print(f"Current DB Size: {size_mb:.2f} MB")

conn = sqlite3.connect(db_path)
c = conn.cursor()

# Get tables
c.execute("SELECT name FROM sqlite_master WHERE type='table'")
tables = [t[0] for t in c.fetchall()]

print("\nRow Counts by Table:")
for t in tables:
    c.execute(f"SELECT count(*) FROM {t}")
    count = c.fetchone()[0]
    print(f"  {t}: {count} rows")

c.execute("PRAGMA page_count")
page_count = c.fetchone()[0]
c.execute("PRAGMA page_size")
page_size = c.fetchone()[0]
c.execute("PRAGMA freelist_count")
freelist_count = c.fetchone()[0]

print(f"\nSQLite Stats: page_count={page_count}, page_size={page_size}, freelist_count={freelist_count}")
conn.close()
