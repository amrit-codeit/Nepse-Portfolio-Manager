"""Transaction model — all share transactions (IPO, buy, sell, bonus, etc.)."""

from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, Date, Boolean
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
from app.database import Base
import enum


class TransactionType(str, enum.Enum):
    """Types of share transactions in Nepal market."""
    IPO = "IPO"
    FPO = "FPO"
    RIGHT = "RIGHT"
    BONUS = "BONUS"
    AUCTION = "AUCTION"
    BUY = "BUY"
    SELL = "SELL"
    TRANSFER_IN = "TRANSFER_IN"
    TRANSFER_OUT = "TRANSFER_OUT"
    MERGE = "MERGE"
    DEMERGE = "DEMERGE"
    DIVIDEND = "DIVIDEND"


class TransactionSource(str, enum.Enum):
    """Source of the transaction record."""
    MEROSHARE = "MEROSHARE"     # Parsed from MeroShare history CSV
    MANUAL = "MANUAL"           # Manually entered by user
    # System-generated (e.g., from merger calculation)
    SYSTEM = "SYSTEM"


class Transaction(Base):
    """A single share transaction."""
    __tablename__ = "transactions"

    id = Column(Integer, primary_key=True, index=True)
    member_id = Column(Integer, ForeignKey(
        "members.id", ondelete="CASCADE"), nullable=False, index=True)
    company_id = Column(Integer, ForeignKey(
        "companies.id"), nullable=True, index=True)
    # Keep symbol for unlinked companies
    symbol = Column(String(20), nullable=False, index=True)

    txn_type = Column(String(20), nullable=False)  # TransactionType enum value
    quantity = Column(Float, nullable=False, default=0)
    # Price per unit (for buy/sell)
    rate = Column(Float, nullable=True)
    # Total amount (quantity * rate)
    amount = Column(Float, nullable=True)

    # Fee breakdown (computed by fee_calculator for BUY/SELL)
    broker_commission = Column(Float, default=0)
    sebon_fee = Column(Float, default=0)
    dp_charge = Column(Float, default=0)
    name_transfer_fee = Column(Float, default=0)     # Rs. 5 for buy
    # Capital gains tax (sell only)
    cgt = Column(Float, default=0)
    # Amount + all fees (buy) or Amount - all fees (sell)
    total_cost = Column(Float, default=0)
    # Average cost per unit after this transaction
    wacc = Column(Float, nullable=True)
    # MeroShare-matched WACC after this transaction
    tax_wacc = Column(Float, nullable=True)

    # DP Reconciliation Fields (SIPs/Mutual Funds)
    actual_date = Column(Date, nullable=True)
    actual_units = Column(Float, nullable=True)
    nav = Column(Float, nullable=True)
    charge = Column(Float, nullable=True)
    is_reconciled = Column(Boolean, default=False)


    txn_date = Column(Date, nullable=True)
    source = Column(String(20), default=TransactionSource.MANUAL.value)
    # MeroShare history remarks / user notes
    remarks = Column(String(500), nullable=True)

    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    # Relationships
    member = relationship("Member", back_populates="transactions")
    company = relationship("Company", back_populates="transactions")

    def __repr__(self):
        return f"<Transaction(id={self.id}, member={self.member_id}, symbol='{self.symbol}', type='{self.txn_type}', qty={self.quantity})>"
