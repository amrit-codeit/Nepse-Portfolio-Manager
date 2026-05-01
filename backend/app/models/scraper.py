from sqlalchemy import Column, Integer, String, DateTime, Text
from datetime import datetime, timezone
from app.database import Base

class ScraperRun(Base):
    """Audit log for scraper executions."""
    __tablename__ = "scraper_runs"
    
    id = Column(Integer, primary_key=True)
    scraper_name = Column(String, nullable=False)  # e.g. "price_scraper"
    triggered_by = Column(String, default="scheduler")  # "scheduler" or "manual"
    started_at = Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))
    finished_at = Column(DateTime, nullable=True)
    status = Column(String, nullable=False)  # "running" | "success" | "failure"
    rows_affected = Column(Integer, nullable=True)
    error_message = Column(Text, nullable=True)

    def __repr__(self):
        return f"<ScraperRun(scraper='{self.scraper_name}', status='{self.status}', started='{self.started_at}')>"
