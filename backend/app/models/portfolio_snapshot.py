"""Portfolio daily snapshot model for historical charting."""

from datetime import datetime, timezone, date
from sqlalchemy import Column, Integer, Float, Date, DateTime, ForeignKey, UniqueConstraint
from app.database import Base


class PortfolioSnapshot(Base):
    """Stores a daily snapshot of each member's portfolio value for historical charting."""
    __tablename__ = "portfolio_snapshots"
    __table_args__ = (
        UniqueConstraint("member_id", "date", name="uix_member_date"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    member_id = Column(Integer, ForeignKey("members.id"), nullable=False)
    date = Column(Date, nullable=False)

    total_investment = Column(Float, nullable=False, default=0)
    current_value = Column(Float, nullable=False, default=0)
    unrealized_pnl = Column(Float, nullable=False, default=0)
    holdings_count = Column(Integer, nullable=False, default=0)

    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
