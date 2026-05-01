"""Database engine and session setup for SQLite."""

from sqlalchemy import create_engine, event, text
from sqlalchemy.orm import sessionmaker, DeclarativeBase
from app.config import settings


# SQLite needs check_same_thread=False for FastAPI
connect_args = {}
if settings.DATABASE_URL.startswith("sqlite"):
    connect_args["check_same_thread"] = False

engine = create_engine(
    settings.DATABASE_URL,
    connect_args=connect_args,
    # Only echo SQL in DEBUG mode — disabled by default to avoid log noise (LOW-01)
    echo=False,
)


# CRIT-03: Enable WAL mode and busy_timeout for SQLite to handle concurrent
# access from the API thread and background scheduler/scraper threads.
# WAL allows concurrent readers alongside a single writer without "database is locked".
if settings.DATABASE_URL.startswith("sqlite"):
    @event.listens_for(engine, "connect")
    def _set_sqlite_pragmas(dbapi_conn, connection_record):
        cursor = dbapi_conn.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA busy_timeout=5000")
        cursor.execute("PRAGMA synchronous=NORMAL")
        cursor.close()


SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    """Base class for all SQLAlchemy models."""
    pass


def get_db():
    """Dependency that provides a database session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    """Create all tables. Called on startup."""
    Base.metadata.create_all(bind=engine)
    _ensure_sqlite_compatibility()


def _ensure_sqlite_compatibility():
    """Apply lightweight additive schema upgrades for existing SQLite DBs."""
    if not settings.DATABASE_URL.startswith("sqlite"):
        return

    trade_setup_columns = {
        "entry_zone_low": "FLOAT",
        "entry_zone_high": "FLOAT",
        "target_1": "FLOAT",
        "target_2": "FLOAT",
        "initial_stop_loss": "FLOAT",
        "current_stop_loss": "FLOAT",
        "capital_allocated": "FLOAT",
        "risk_amount": "FLOAT",
        "setup_quality": "VARCHAR(50)",
        "strategy_type": "VARCHAR(50)",
        "thesis": "TEXT",
        "invalidated_at": "DATETIME",
        "activated_at": "DATETIME",
        "closed_at": "DATETIME",
    }
    trade_journal_columns = {
        "planned_entry": "FLOAT",
        "planned_stop": "FLOAT",
        "planned_target": "FLOAT",
        "exit_reason": "VARCHAR(50)",
        "setup_grade": "VARCHAR(50)",
        "rule_followed": "BOOLEAN",
        "mistake_tag": "VARCHAR(100)",
        "lesson_learned": "TEXT",
        "hold_days": "INTEGER",
    }

    with engine.begin() as conn:
        _ensure_columns(conn, "trade_setups", trade_setup_columns)
        _ensure_columns(conn, "trade_journals", trade_journal_columns)
        
        _ensure_columns(conn, "live_prices", {"last_scraped_at": "DATETIME"})
        _ensure_columns(conn, "nav_values", {"last_scraped_at": "DATETIME"})
        _ensure_columns(conn, "index_history", {"last_scraped_at": "DATETIME"})
        _ensure_columns(conn, "fundamental_report", {"last_scraped_at": "DATETIME"})
        _ensure_columns(conn, "stock_overview", {"last_scraped_at": "DATETIME"})

        conn.execute(text("""
            UPDATE trade_setups
            SET entry_zone_low = COALESCE(entry_zone_low, entry_price),
                entry_zone_high = COALESCE(entry_zone_high, entry_price),
                target_1 = COALESCE(target_1, target_price),
                initial_stop_loss = COALESCE(initial_stop_loss, stop_loss),
                current_stop_loss = COALESCE(current_stop_loss, stop_loss)
        """))


def _ensure_columns(conn, table_name: str, columns: dict[str, str]):
    existing_cols = {
        row[1]
        for row in conn.execute(text(f"PRAGMA table_info({table_name})")).fetchall()
    }
    for col_name, col_type in columns.items():
        if col_name not in existing_cols:
            conn.execute(text(f"ALTER TABLE {table_name} ADD COLUMN {col_name} {col_type}"))
