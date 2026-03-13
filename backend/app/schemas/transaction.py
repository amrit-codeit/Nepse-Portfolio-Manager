"""Pydantic schemas for Transactions."""

from pydantic import BaseModel
from datetime import date, datetime
from typing import Optional


class TransactionCreate(BaseModel):
    member_id: int
    symbol: str
    txn_type: str       # IPO, BUY, SELL, BONUS, RIGHT, etc.
    quantity: float
    rate: Optional[float] = None      # Price per unit (required for BUY/SELL)
    txn_date: Optional[date] = None
    remarks: Optional[str] = None
    dp_charge: Optional[float] = None
    cgt: Optional[float] = None
    broker_commission: Optional[float] = None
    sebon_fee: Optional[float] = None


class TransactionUpdate(BaseModel):
    member_id: Optional[int] = None
    symbol: Optional[str] = None
    txn_type: Optional[str] = None
    quantity: Optional[float] = None
    rate: Optional[float] = None
    txn_date: Optional[date] = None
    remarks: Optional[str] = None
    dp_charge: Optional[float] = None
    cgt: Optional[float] = None
    broker_commission: Optional[float] = None
    sebon_fee: Optional[float] = None


class TransactionResponse(BaseModel):
    id: int
    member_id: int
    symbol: str
    txn_type: str
    quantity: float
    rate: Optional[float] = None
    amount: Optional[float] = None
    broker_commission: float = 0
    sebon_fee: float = 0
    dp_charge: float = 0
    name_transfer_fee: float = 0
    cgt: float = 0
    total_cost: float = 0
    wacc: Optional[float] = None
    # MeroShare-matched WACC after this txn
    tax_wacc: Optional[float] = None
    txn_date: Optional[date] = None
    # SIP Reconciliation Fields
    actual_date: Optional[date] = None
    actual_units: Optional[float] = None
    nav: Optional[float] = None
    charge: Optional[float] = None
    is_reconciled: bool = False
    
    source: str
    remarks: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class TransactionListResponse(BaseModel):
    transactions: list[TransactionResponse]
    total: int
