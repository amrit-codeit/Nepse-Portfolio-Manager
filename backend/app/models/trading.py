from sqlalchemy import Column, Integer, String, Float, DateTime, Enum, ForeignKey, Boolean, Text
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
    entry_zone_low = Column(Float, nullable=True)
    entry_zone_high = Column(Float, nullable=True)
    target_price = Column(Float, nullable=True)
    target_1 = Column(Float, nullable=True)
    target_2 = Column(Float, nullable=True)
    stop_loss = Column(Float, nullable=True)
    initial_stop_loss = Column(Float, nullable=True)
    current_stop_loss = Column(Float, nullable=True)
    trailing_stop = Column(Float, nullable=True)
    
    # Risk Management
    risk_percent = Column(Float, nullable=True) # E.g., 1% of total portfolio
    allocated_qty = Column(Integer, nullable=True)
    capital_allocated = Column(Float, nullable=True)
    risk_amount = Column(Float, nullable=True)
    
    # Context
    strategy_note = Column(String, nullable=True)
    setup_quality = Column(String, nullable=True)
    strategy_type = Column(String, nullable=True)
    thesis = Column(Text, nullable=True)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    invalidated_at = Column(DateTime(timezone=True), nullable=True)
    activated_at = Column(DateTime(timezone=True), nullable=True)
    closed_at = Column(DateTime(timezone=True), nullable=True)
    
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
    planned_entry = Column(Float, nullable=True)
    planned_stop = Column(Float, nullable=True)
    planned_target = Column(Float, nullable=True)
    exit_reason = Column(String, nullable=True)
    setup_grade = Column(String, nullable=True)
    rule_followed = Column(Boolean, nullable=True)
    mistake_tag = Column(String, nullable=True)
    lesson_learned = Column(Text, nullable=True)
    hold_days = Column(Integer, nullable=True)
    
    # Review
    post_trade_note = Column(String, nullable=True)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
