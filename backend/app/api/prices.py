"""API routes for combined price and NAV data."""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import or_
from app.database import get_db
from app.models.company import Company
from app.models.price import LivePrice, NavValue, IssuePrice, PriceHistory
from app.schemas.price import MergedPriceResponse, PriceHistoryResponse
from typing import List, Optional
from datetime import date as date_type

router = APIRouter(prefix="/api/prices", tags=["Prices"])


@router.get("/issue-price")
def get_issue_price(symbol: str, issue_type: Optional[str] = Query(None), db: Session = Depends(get_db)):
    """Fetch stored IPO/Right/FPO price for a symbol."""
    query = db.query(IssuePrice).filter(IssuePrice.symbol == symbol.upper())
    
    if issue_type:
        query = query.filter(IssuePrice.issue_type == issue_type.upper())
    
    record = query.first()
    if record:
        return {
            "symbol": record.symbol,
            "price": record.price,
            "type": record.issue_type,
            "updated_at": record.updated_at
        }
    return None


@router.get("", response_model=List[MergedPriceResponse])
def get_merged_prices(
    search: str = Query(None),
    instrument: str = Query(None),
    db: Session = Depends(get_db)
):
    """
    Get merged price data from both LivePrice (ShareSansar today's price)
    and NavValue (ShareSansar mutual fund NAVs).
    """
    query = db.query(
        Company.symbol,
        Company.name,
        Company.sector,
        Company.instrument,
        LivePrice.ltp,
        LivePrice.change,
        LivePrice.change_pct,
        LivePrice.high,
        LivePrice.low,
        LivePrice.open_price,
        LivePrice.prev_close,
        LivePrice.volume,
        LivePrice.updated_at.label("live_updated_at"),
        NavValue.nav,
        NavValue.updated_at.label("nav_updated_at")
    ).outerjoin(LivePrice, Company.id == LivePrice.company_id)\
     .outerjoin(NavValue, Company.id == NavValue.company_id)

    if search:
        search_term = f"%{search}%"
        query = query.filter(or_(Company.symbol.ilike(
            search_term), Company.name.ilike(search_term)))

    if instrument:
        query = query.filter(Company.instrument == instrument)

    results = query.all()

    merged_data = []
    for r in results:
        # Business logic: Use LTP if available, otherwise NAV
        price = r.ltp
        # If LTP is null, try NAV (common for mutual funds)
        if price is None or price == 0:
            price = r.nav

        # Only include if we have a price OR it's a known company we want to list
        if price is None and not search:
            continue

        # Updated at timing
        updated_at = r.live_updated_at
        if updated_at is None:
            updated_at = r.nav_updated_at

        merged_data.append({
            "symbol": r.symbol,
            "name": r.name,
            "sector": r.sector,
            "instrument": r.instrument or "Equity",
            "price": price,
            "change": r.change,
            "change_pct": r.change_pct,
            "high": r.high,
            "low": r.low,
            "open_price": r.open_price,
            "prev_close": r.prev_close,
            "volume": r.volume,
            "updated_at": updated_at
        })

    return merged_data


@router.get("/historical", response_model=List[PriceHistoryResponse])
def get_historical_prices(
    symbol: str = Query(...),
    start_date: Optional[date_type] = Query(None),
    end_date: Optional[date_type] = Query(None),
    db: Session = Depends(get_db)
):
    """Fetch historical OHLCV data for a symbol."""
    query = db.query(PriceHistory).filter(PriceHistory.symbol == symbol.upper())
    
    if start_date:
        query = query.filter(PriceHistory.date >= start_date)
    if end_date:
        query = query.filter(PriceHistory.date <= end_date)
        
    return query.order_by(PriceHistory.date.desc()).all()
