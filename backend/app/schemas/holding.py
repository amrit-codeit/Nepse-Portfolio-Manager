"""Pydantic schemas for Holdings."""

from pydantic import BaseModel
from typing import Optional


class HoldingResponse(BaseModel):
    id: int
    member_id: int
    member_name: str = ""
    symbol: str
    company_name: str = ""
    sector: str = ""
    current_qty: float
    # Weighted avg cost per unit (including fees)
    wacc: float
    tax_wacc: float                 # MeroShare-style WACC (bonus @ 100)
    total_investment: float         # Total cost basis (True investment)
    # Latest traded price (joined from live_prices)
    ltp: Optional[float] = None
    current_value: Optional[float] = None   # current_qty * ltp
    # True P&L (Current Value - True Investment)
    unrealized_pnl: Optional[float] = None
    # unrealized_pnl / total_investment * 100
    pnl_pct: Optional[float] = None
    # Taxable Profit (Current Value - (Qty * Tax WACC))
    tax_profit: Optional[float] = None
    xirr: Optional[float] = None

    model_config = {"from_attributes": True}


class PortfolioSummary(BaseModel):
    member_id: Optional[int] = None
    member_name: str = "All Members"
    total_investment: float = 0
    current_value: float = 0
    unrealized_pnl: float = 0
    pnl_pct: float = 0
    holdings_count: int = 0
    holdings: list[HoldingResponse] = []
