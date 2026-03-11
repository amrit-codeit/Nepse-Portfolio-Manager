"""Pydantic schemas for Prices and NAV."""

from pydantic import BaseModel
from datetime import datetime
from typing import Optional


class LivePriceResponse(BaseModel):
    symbol: str
    ltp: Optional[float] = None
    change: Optional[float] = None
    change_pct: Optional[float] = None
    high: Optional[float] = None
    low: Optional[float] = None
    open_price: Optional[float] = None
    volume: Optional[int] = None
    prev_close: Optional[float] = None
    updated_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class NavValueResponse(BaseModel):
    symbol: str
    scheme_name: Optional[str] = None
    nav: Optional[float] = None
    repurchase_price: Optional[float] = None
    sale_price: Optional[float] = None
    updated_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class FeeConfigResponse(BaseModel):
    key: str
    value: str
    description: Optional[str] = None

    model_config = {"from_attributes": True}


class FeeConfigUpdate(BaseModel):
    value: str


class MergedPriceResponse(BaseModel):
    symbol: str
    name: str
    sector: Optional[str] = None
    instrument: Optional[str] = None
    price: Optional[float] = None
    change: Optional[float] = None
    change_pct: Optional[float] = None
    high: Optional[float] = None
    low: Optional[float] = None
    volume: Optional[int] = None
    updated_at: Optional[datetime] = None

    model_config = {"from_attributes": True}
