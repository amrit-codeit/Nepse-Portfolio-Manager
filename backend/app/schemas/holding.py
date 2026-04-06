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
    instrument: str = ""
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
    realized_profit: Optional[float] = None
    # Advanced Technicals
    sma_50: Optional[float] = None
    sma_200: Optional[float] = None
    rsi_14: Optional[float] = None
    is_technical_downtrend: bool = False
    
    # Advanced Fundamentals
    is_fundamental_risk: bool = False
    graham_number: Optional[float] = None
    price_to_graham_ratio: Optional[float] = None
    
    # Performance
    xirr: Optional[float] = None

    model_config = {"from_attributes": True}


class PortfolioSummary(BaseModel):
    member_id: Optional[int] = None
    member_name: str = "All Members"
    total_investment: float = 0
    current_value: float = 0
    unrealized_pnl: float = 0
    pnl_pct: float = 0
    realized_profit: float = 0
    dividend_income: float = 0
    holdings_count: int = 0
    portfolio_xirr: float = 0
    nepse_xirr: float = 0
    market_alpha: float = 0
    holdings: list[HoldingResponse] = []
