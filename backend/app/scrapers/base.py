"""
Scraper base utilities — shared result type, retry decorator, and staleness helpers.

C-4: Provides structured error handling and staleness tracking for all scrapers.
M-6: ScraperResult is the documented data contract between scrapers and the service layer.
"""

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Optional
import time


@dataclass
class ScraperResult:
    """Standardised return type for all scraper functions.

    Every scraper should return a ScraperResult so the scheduler and
    API layer can uniformly track health, duration, and error context.
    """
    source: str
    status: str = "success"  # "success" | "partial" | "failed"
    records_upserted: int = 0
    error_message: Optional[str] = None
    duration_seconds: float = 0.0
    started_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))

    def fail(self, message: str) -> "ScraperResult":
        self.status = "failed"
        self.error_message = str(message)[:500]
        return self

    def partial(self, message: str) -> "ScraperResult":
        self.status = "partial"
        self.error_message = str(message)[:500]
        return self

    def finish(self) -> "ScraperResult":
        self.duration_seconds = round(
            (datetime.now(timezone.utc) - self.started_at).total_seconds(), 2
        )
        return self


def staleness_badge(last_scraped_at: Optional[datetime], threshold_hours: float = 2.0) -> str:
    """Return a staleness label for frontend display.

    Args:
        last_scraped_at: UTC timestamp of the most recent successful scrape.
        threshold_hours: Number of hours after which data is considered stale.

    Returns:
        "fresh", "stale", or "unknown"
    """
    if last_scraped_at is None:
        return "unknown"
    age = (datetime.now(timezone.utc) - last_scraped_at).total_seconds()
    if age > threshold_hours * 3600:
        return "stale"
    return "fresh"
