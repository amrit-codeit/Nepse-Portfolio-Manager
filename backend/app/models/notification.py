"""Notification model — in-app alerts for price targets, scraper failures, etc."""

from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime, ForeignKey
from datetime import datetime, timezone
from app.database import Base


class Notification(Base):
    """A user-facing notification (price alert, scraper failure, dividend closure)."""
    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True, index=True)
    member_id = Column(Integer, ForeignKey("members.id", ondelete="CASCADE"), nullable=True, index=True)
    type = Column(String(50), nullable=False)  # "price_alert" | "dividend_closure" | "scraper_failure"
    title = Column(String(200), nullable=False)
    message = Column(Text, nullable=True)
    symbol = Column(String(20), nullable=True, index=True)
    is_read = Column(Boolean, default=False, index=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    def __repr__(self):
        return f"<Notification(id={self.id}, type='{self.type}', title='{self.title}', read={self.is_read})>"
