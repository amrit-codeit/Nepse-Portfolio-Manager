"""Holding model — current share holdings per member."""

from sqlalchemy import Column, Integer, Float, DateTime, ForeignKey, String
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
from app.database import Base


class Holding(Base):
    """Current holding of a specific scrip by a member."""
    __tablename__ = "holdings"

    id = Column(Integer, primary_key=True, index=True)
    member_id = Column(Integer, ForeignKey(
        "members.id", ondelete="CASCADE"), nullable=False, index=True)
    company_id = Column(Integer, ForeignKey(
        "companies.id"), nullable=True, index=True)
    symbol = Column(String(20), nullable=False, index=True)

    current_qty = Column(Float, nullable=False, default=0)
    # Weighted avg cost (including fees) per unit
    wacc = Column(Float, nullable=False, default=0)
    # MeroShare-matched WACC (Bonus shares @ 100)
    tax_wacc = Column(Float, nullable=False, default=0)
    total_investment = Column(Float, nullable=False,
                              default=0)  # Total cost basis

    updated_at = Column(DateTime, default=lambda: datetime.now(
        timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    # Relationships
    member = relationship("Member", back_populates="holdings")
    company = relationship("Company", back_populates="holdings")

    def __repr__(self):
        return f"<Holding(member={self.member_id}, symbol='{self.symbol}', qty={self.current_qty}, wacc={self.wacc})>"
