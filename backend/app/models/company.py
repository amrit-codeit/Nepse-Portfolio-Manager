"""Company model — master list of NEPSE-listed companies."""

from sqlalchemy import Column, Integer, String, DateTime
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
from app.database import Base


class Company(Base):
    """A company listed on NEPSE."""
    __tablename__ = "companies"

    id = Column(Integer, primary_key=True, index=True)
    symbol = Column(String(20), nullable=False, unique=True, index=True)
    name = Column(String(300), nullable=False)
    sector = Column(String(100), nullable=True)
    instrument = Column(String(50), nullable=True)  # e.g., Equity, Mutual Fund, Debenture
    status = Column(String(20), nullable=True)       # Active, Suspended, etc.
    email = Column(String(200), nullable=True)
    website = Column(String(200), nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    # Relationships
    holdings = relationship("Holding", back_populates="company")
    transactions = relationship("Transaction", back_populates="company")
    live_price = relationship("LivePrice", back_populates="company", uselist=False)
    nav_value = relationship("NavValue", back_populates="company", uselist=False)

    def __repr__(self):
        return f"<Company(symbol='{self.symbol}', name='{self.name}')>"
