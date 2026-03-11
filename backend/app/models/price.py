"""Price-related models — live prices, NAV values, and fee configuration."""

from sqlalchemy import Column, Integer, String, Float, DateTime, Date, ForeignKey, Text
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
from app.database import Base


class LivePrice(Base):
    """Latest trading price for a company."""
    __tablename__ = "live_prices"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"),
                        nullable=False, unique=True, index=True)
    symbol = Column(String(20), nullable=False, index=True)

    ltp = Column(Float, nullable=True)          # Last Traded Price
    change = Column(Float, nullable=True)       # Price change
    change_pct = Column(Float, nullable=True)   # % change
    high = Column(Float, nullable=True)
    low = Column(Float, nullable=True)
    open_price = Column(Float, nullable=True)
    volume = Column(Integer, nullable=True)
    prev_close = Column(Float, nullable=True)

    updated_at = Column(DateTime, default=lambda: datetime.now(
        timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    # Relationships
    company = relationship("Company", back_populates="live_price")

    def __repr__(self):
        return f"<LivePrice(symbol='{self.symbol}', ltp={self.ltp})>"


class NavValue(Base):
    """Net Asset Value for open-ended mutual funds."""
    __tablename__ = "nav_values"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"),
                        nullable=False, unique=True, index=True)
    symbol = Column(String(20), nullable=False, index=True)

    nav = Column(Float, nullable=True)
    repurchase_price = Column(Float, nullable=True)
    sale_price = Column(Float, nullable=True)
    scheme_name = Column(String(300), nullable=True)

    updated_at = Column(DateTime, default=lambda: datetime.now(
        timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    # Relationships
    company = relationship("Company", back_populates="nav_value")

    def __repr__(self):
        return f"<NavValue(symbol='{self.symbol}', nav={self.nav})>"


class FeeConfig(Base):
    """
    Configurable fee parameters. Stored as key-value so they can be updated
    when SEBON changes rates, without code changes.
    """
    __tablename__ = "fee_config"

    id = Column(Integer, primary_key=True, index=True)
    # No unique constraint — versioned rows
    key = Column(String(50), nullable=False, index=True)
    value = Column(String(100), nullable=False)
    description = Column(Text, nullable=True)
    # NULL = initial/default; set date when rates change
    effective_from = Column(Date, nullable=True)
    updated_at = Column(DateTime, default=lambda: datetime.now(
        timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    def __repr__(self):
        return f"<FeeConfig(key='{self.key}', value='{self.value}', effective_from={self.effective_from})>"


class IssuePrice(Base):
    """Cached prices for IPO, Right Share, and FPO issues."""
    __tablename__ = "issue_prices"

    id = Column(Integer, primary_key=True, index=True)
    symbol = Column(String(20), nullable=False, index=True)
    issue_type = Column(String(20), nullable=False)  # IPO, RIGHT, FPO
    price = Column(Float, nullable=False)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    def __repr__(self):
        return f"<IssuePrice(symbol='{self.symbol}', type='{self.issue_type}', price={self.price})>"
