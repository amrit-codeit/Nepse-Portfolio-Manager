"""
Pydantic schemas defining the data contracts between scrapers and the service layer.

M-6: These schemas validate scraper output before it is written to the database.
If a field that was previously present is now missing (HTML structure changed),
the ValidationError is caught and reported as a 'partial' scrape status.
"""

from datetime import date, datetime
from typing import Optional
from pydantic import BaseModel, Field, field_validator


class ScrapedPrice(BaseModel):
    """Contract for live price scraper output (price_scraper.py)."""
    symbol: str = Field(..., min_length=1, max_length=20)
    price: float = Field(..., gt=0)
    change: Optional[float] = None
    change_pct: Optional[float] = None
    high: Optional[float] = None
    low: Optional[float] = None
    open: Optional[float] = None
    volume: Optional[int] = None
    prev_close: Optional[float] = None


class ScrapedNAV(BaseModel):
    """Contract for mutual fund NAV scraper output (nav_scraper.py)."""
    symbol: str = Field(..., min_length=1, max_length=20)
    nav: float = Field(..., gt=0)
    fund_name: Optional[str] = None
    nav_date: Optional[date] = None


class ScrapedFundamental(BaseModel):
    """Contract for fundamental data scraper output (fundamental_scraper.py)."""
    symbol: str = Field(..., min_length=1, max_length=20)
    sector: Optional[str] = None
    eps: Optional[float] = None
    pe_ratio: Optional[float] = None
    book_value: Optional[float] = None
    pb_ratio: Optional[float] = None
    roe: Optional[float] = None
    market_cap: Optional[float] = None
    dividend_yield: Optional[float] = None


class ScrapedDividend(BaseModel):
    """Contract for dividend scraper output (dividend_scraper.py)."""
    symbol: str = Field(..., min_length=1, max_length=20)
    fiscal_year: str
    bonus_pct: Optional[float] = Field(default=None, ge=0)
    cash_pct: Optional[float] = Field(default=None, ge=0)
    total_pct: Optional[float] = Field(default=None, ge=0)
    book_closure_date: Optional[date] = None


class ScrapedIndex(BaseModel):
    """Contract for NEPSE index scraper output (index_scraper.py)."""
    index_date: date
    index_value: float = Field(..., gt=0)
    change: Optional[float] = None
    change_pct: Optional[float] = None
    high: Optional[float] = None
    low: Optional[float] = None
    turnover: Optional[float] = None
    volume: Optional[int] = None


class ScrapedHistoricalPrice(BaseModel):
    """Contract for historical OHLCV scraper output."""
    symbol: str = Field(..., min_length=1, max_length=20)
    trade_date: date
    open: float = Field(..., ge=0)
    high: float = Field(..., ge=0)
    low: float = Field(..., ge=0)
    close: float = Field(..., gt=0)
    volume: int = Field(..., ge=0)

    @field_validator("high")
    @classmethod
    def high_gte_low(cls, v, info):
        if "low" in info.data and info.data["low"] is not None and v < info.data["low"]:
            raise ValueError("high must be >= low")
        return v
