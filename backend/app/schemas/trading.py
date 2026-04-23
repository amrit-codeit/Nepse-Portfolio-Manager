"""Pydantic schemas for the Trading Desk feature."""
from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime
from enum import Enum


class TradeStatusEnum(str, Enum):
    WATCHLIST = "WATCHLIST"
    ACTIVE = "ACTIVE"
    CLOSED = "CLOSED"


# ── Trade Setup Schemas ──

class TradeSetupCreate(BaseModel):
    symbol: str
    status: TradeStatusEnum = TradeStatusEnum.WATCHLIST
    entry_price: Optional[float] = None
    target_price: Optional[float] = None
    stop_loss: Optional[float] = None
    trailing_stop: Optional[float] = None
    risk_percent: Optional[float] = None
    allocated_qty: Optional[int] = None
    strategy_note: Optional[str] = None
    member_id: Optional[int] = None


class TradeSetupUpdate(BaseModel):
    status: Optional[TradeStatusEnum] = None
    entry_price: Optional[float] = None
    target_price: Optional[float] = None
    stop_loss: Optional[float] = None
    trailing_stop: Optional[float] = None
    risk_percent: Optional[float] = None
    allocated_qty: Optional[int] = None
    strategy_note: Optional[str] = None


class TradeSetupResponse(BaseModel):
    id: int
    symbol: str
    status: str
    entry_price: Optional[float] = None
    target_price: Optional[float] = None
    stop_loss: Optional[float] = None
    trailing_stop: Optional[float] = None
    risk_percent: Optional[float] = None
    allocated_qty: Optional[int] = None
    strategy_note: Optional[str] = None
    member_id: Optional[int] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# ── Trade Journal Schemas ──

class TradeJournalCreate(BaseModel):
    setup_id: Optional[int] = None
    symbol: str
    buy_date: Optional[datetime] = None
    sell_date: Optional[datetime] = None
    buy_price: float
    sell_price: Optional[float] = None
    quantity: int
    realized_pnl: Optional[float] = None
    realized_rr: Optional[float] = None
    fees_paid: Optional[float] = None
    post_trade_note: Optional[str] = None


class TradeJournalResponse(BaseModel):
    id: int
    setup_id: Optional[int] = None
    symbol: str
    buy_date: Optional[datetime] = None
    sell_date: Optional[datetime] = None
    buy_price: float
    sell_price: Optional[float] = None
    quantity: int
    realized_pnl: Optional[float] = None
    realized_rr: Optional[float] = None
    fees_paid: Optional[float] = None
    post_trade_note: Optional[str] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True
