from sqlalchemy import Column, Integer, String, Float, DateTime, Enum, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base
import enum

class TradeStatus(str, enum.Enum):
    WATCHLIST = "WATCHLIST"
    ACTIVE = "ACTIVE"
    CLOSED = "CLOSED"

class TradeSetup(Base):
    __tablename__ = "trade_setups"

    id = Column(Integer, primary_key=True, index=True)
    symbol = Column(String, index=True, nullable=False)
    status = Column(Enum(TradeStatus), default=TradeStatus.WATCHLIST, nullable=False)
    
    # Trade Plan
    entry_price = Column(Float, nullable=True)
    target_price = Column(Float, nullable=True)
    stop_loss = Column(Float, nullable=True)
    trailing_stop = Column(Float, nullable=True)
    
    # Risk Management
    risk_percent = Column(Float, nullable=True) # E.g., 1% of total portfolio
    allocated_qty = Column(Integer, nullable=True)
    
    # Context
    strategy_note = Column(String, nullable=True)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    # Optional link to member if it's a multi-member environment
    member_id = Column(Integer, ForeignKey("members.id", ondelete="CASCADE"), nullable=True)

class TradeJournal(Base):
    __tablename__ = "trade_journals"

    id = Column(Integer, primary_key=True, index=True)
    setup_id = Column(Integer, ForeignKey("trade_setups.id", ondelete="SET NULL"), nullable=True)
    symbol = Column(String, index=True, nullable=False)
    
    # Execution
    buy_date = Column(DateTime(timezone=True), nullable=True)
    sell_date = Column(DateTime(timezone=True), nullable=True)
    buy_price = Column(Float, nullable=False)
    sell_price = Column(Float, nullable=True)
    quantity = Column(Integer, nullable=False)
    
    # Outcomes
    realized_pnl = Column(Float, nullable=True)
    realized_rr = Column(Float, nullable=True) # Realized Risk-to-Reward ratio
    fees_paid = Column(Float, nullable=True)
    
    # Review
    post_trade_note = Column(String, nullable=True)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
