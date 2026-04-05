"""API routes for dividend income data."""

from typing import Optional, List
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.database import get_db
from app.models.dividend import DividendIncome
from app.models.price import LivePrice, NavValue
from app.models.holding import Holding
from app.models.company import Company

router = APIRouter(prefix="/api/dividends", tags=["Dividends"])


@router.get("")
def get_dividends(
    symbol: Optional[str] = Query(None),
    member_id: Optional[int] = Query(None),
    fiscal_year: Optional[str] = Query(None),
    eligible_only: bool = Query(False, description="Only return records where user is eligible"),
    db: Session = Depends(get_db),
):
    """Get all dividend income records, optionally filtered."""
    query = db.query(DividendIncome)

    if symbol:
        query = query.filter(DividendIncome.symbol == symbol.upper())
    if member_id:
        query = query.filter(DividendIncome.member_id == member_id)
    if fiscal_year:
        query = query.filter(DividendIncome.fiscal_year == fiscal_year)
    if eligible_only:
        query = query.filter(DividendIncome.eligible_quantity > 0)

    records = query.order_by(DividendIncome.book_close_date.desc()).all()

    return [
        {
            "id": r.id,
            "member_id": r.member_id,
            "symbol": r.symbol,
            "fiscal_year": r.fiscal_year,
            "cash_dividend_percent": r.cash_dividend_percent,
            "bonus_dividend_percent": r.bonus_dividend_percent,
            "book_close_date": r.book_close_date.isoformat() if r.book_close_date else None,
            "eligible_quantity": r.eligible_quantity,
            "total_cash_amount": r.total_cash_amount,
            "total_bonus_shares": round(r.eligible_quantity * (r.bonus_dividend_percent / 100), 2),
            "updated_at": r.updated_at.isoformat() if r.updated_at else None,
        }
        for r in records
    ]


@router.get("/summary")
def dividend_summary(member_id: Optional[int] = Query(None), db: Session = Depends(get_db)):
    """Get a summary of total dividend income across all symbols."""
    query_total = db.query(func.coalesce(func.sum(DividendIncome.total_cash_amount), 0)).filter(DividendIncome.eligible_quantity > 0)
    query_count = db.query(func.count(DividendIncome.id)).filter(DividendIncome.eligible_quantity > 0)
    query_unique = db.query(func.count(func.distinct(DividendIncome.symbol))).filter(DividendIncome.eligible_quantity > 0)
    
    if member_id:
        query_total = query_total.filter(DividendIncome.member_id == member_id)
        query_count = query_count.filter(DividendIncome.member_id == member_id)
        query_unique = query_unique.filter(DividendIncome.member_id == member_id)

    total_amount = query_total.scalar()
    total_records = query_count.scalar()
    unique_symbols = query_unique.scalar()
    
    # Calculate bonus shares sum by iterating overall eligible
    # Or using a database func: SUM(eligible_quantity * bonus_percent / 100)
    query_bonus = db.query(func.coalesce(func.sum(DividendIncome.eligible_quantity * DividendIncome.bonus_dividend_percent / 100.0), 0)).filter(DividendIncome.eligible_quantity > 0)
    if member_id:
        query_bonus = query_bonus.filter(DividendIncome.member_id == member_id)
        
    total_bonus_shares = query_bonus.scalar()

    by_symbol_query = db.query(
        DividendIncome.symbol,
        func.sum(DividendIncome.total_cash_amount).label("total"),
        func.sum(DividendIncome.eligible_quantity * DividendIncome.bonus_dividend_percent / 100.0).label("bonus_shares_total"),
        func.count(DividendIncome.id).label("count"),
    ).filter(DividendIncome.eligible_quantity > 0)

    if member_id:
        by_symbol_query = by_symbol_query.filter(DividendIncome.member_id == member_id)

    by_symbol = by_symbol_query.group_by(DividendIncome.symbol).order_by(
        func.sum(DividendIncome.total_cash_amount + DividendIncome.eligible_quantity * DividendIncome.bonus_dividend_percent).desc()
    ).all()

    # Get LTP and Average Cost (WACC) for these symbols
    symbols_list = [s.symbol for s in by_symbol]
    prices_map = {p.symbol: p.ltp for p in db.query(LivePrice).filter(LivePrice.symbol.in_(symbols_list)).all()}
    navs_map = {n.symbol: n.nav for n in db.query(NavValue).filter(NavValue.symbol.in_(symbols_list)).all()}
    
    # Merge LTP/Nav
    for s, nav in navs_map.items():
        if s not in prices_map or not prices_map[s]:
            prices_map[s] = nav

    # Get WACC per symbol (averaged across members if no member_id provided)
    if member_id:
        wacc_map = {h.symbol: h.wacc for h in db.query(Holding).filter(Holding.symbol.in_(symbols_list), Holding.member_id == member_id).all()}
    else:
        # Compute simple average of WACC across members holding it
        wacc_map = {}
        h_data = db.query(Holding.symbol, func.avg(Holding.wacc)).filter(Holding.symbol.in_(symbols_list)).group_by(Holding.symbol).all()
        for s, avg_w in h_data:
            wacc_map[s] = avg_w
            
    # Get Instrument to determine Face Value
    inst_map = {c.symbol: c.instrument for c in db.query(Company).filter(Company.symbol.in_(symbols_list)).all()}

    summary_by_symbol = []
    for s in by_symbol:
        ltp = prices_map.get(s.symbol)
        wacc = wacc_map.get(s.symbol)
        inst = inst_map.get(s.symbol) or "Equity"
        face_value = 10 if "Mutual Fund" in inst else 100
        
        # Latest cash dividend for yield calculation
        latest_div = db.query(DividendIncome).filter(DividendIncome.symbol == s.symbol).order_by(DividendIncome.book_close_date.desc()).first()
        latest_cash_pct = latest_div.cash_dividend_percent if latest_div else 0
        latest_cash_npr = (latest_cash_pct / 100.0) * face_value
        
        div_yield = (latest_cash_npr / ltp * 100.0) if ltp and ltp > 0 else 0
        yield_on_cost = (latest_cash_npr / wacc * 100.0) if wacc and wacc > 0 else 0
        
        summary_by_symbol.append({
            "symbol": s.symbol,
            "total_cash": round(float(s.total), 2),
            "total_bonus": round(float(s.bonus_shares_total), 2),
            "payout_count": s.count,
            "ltp": ltp,
            "average_cost": round(float(wacc), 2) if wacc else None,
            "dividend_yield": round(float(div_yield), 2),
            "yield_on_cost": round(float(yield_on_cost), 2),
        })

    return {
        "total_dividend_income": round(float(total_amount), 2),
        "total_bonus_shares": round(float(total_bonus_shares), 2),
        "total_eligible_records": total_records,
        "unique_symbols": unique_symbols,
        "by_symbol": summary_by_symbol
    }
