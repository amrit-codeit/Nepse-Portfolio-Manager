from sqlalchemy import Column, Integer, String, Float, DateTime, JSON, UniqueConstraint
from datetime import datetime, timezone
from app.database import Base

class StockOverview(Base):
    """TTM Data for a specific stock."""
    __tablename__ = "stock_overview"

    symbol = Column(String, primary_key=True, index=True)
    pe_ratio = Column(Float, nullable=True)
    pb_ratio = Column(Float, nullable=True)
    roe_ttm = Column(Float, nullable=True)
    net_profit_ttm = Column(Float, nullable=True)
    eps_ttm = Column(Float, nullable=True)
    book_value = Column(Float, nullable=True)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


class FundamentalReport(Base):
    """Detailed Quarterly financials for a stock."""
    __tablename__ = "fundamental_report"
    __table_args__ = (
        UniqueConstraint('symbol', 'quarter', name='uix_symbol_quarter'),
    )

    id = Column(Integer, primary_key=True, index=True)
    symbol = Column(String, index=True, nullable=False)
    quarter = Column(String, nullable=False)  # e.g., '081-082Q4'
    paid_up_capital = Column(Float, nullable=True)
    net_profit = Column(Float, nullable=True)
    sector_metrics = Column(JSON, nullable=True)  # Store dynamic rows here
