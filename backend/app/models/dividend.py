"""DividendIncome model — tracks cash dividend eligibility and amounts per symbol/fiscal year."""

from sqlalchemy import Column, Integer, String, Float, Date, DateTime, UniqueConstraint, ForeignKey
from datetime import datetime, timezone
from app.database import Base


class DividendIncome(Base):
    """
    Stores scraped cash dividend data and calculated eligibility
    based on the user's transaction history at book closure.
    """
    __tablename__ = "dividend_income"

    id = Column(Integer, primary_key=True, index=True)
    member_id = Column(Integer, ForeignKey("members.id", ondelete="CASCADE"), nullable=False, index=True)
    symbol = Column(String(20), nullable=False, index=True)
    fiscal_year = Column(String(20), nullable=False)               # e.g. "2081/2082"
    cash_dividend_percent = Column(Float, nullable=False, default=0)
    bonus_dividend_percent = Column(Float, nullable=False, default=0)
    book_close_date = Column(Date, nullable=False)
    eligible_quantity = Column(Integer, nullable=False, default=0)
    total_cash_amount = Column(Float, nullable=False, default=0)   # Rs.

    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc),
                        onupdate=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        UniqueConstraint("member_id", "symbol", "fiscal_year", name="uix_dividend_member_symbol_fy"),
    )

    def __repr__(self):
        return (f"<DividendIncome(member={self.member_id}, symbol='{self.symbol}', fy='{self.fiscal_year}', "
                f"cash%={self.cash_dividend_percent}, bonus%={self.bonus_dividend_percent}, eligible={self.eligible_quantity}, "
                f"amount={self.total_cash_amount})>")
