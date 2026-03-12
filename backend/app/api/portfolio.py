"""Portfolio and Holdings API routes."""

from typing import Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from app.database import get_db
from app.schemas.holding import HoldingResponse, PortfolioSummary
from app.services.portfolio_engine import get_portfolio_summary
from app.models.holding import Holding

router = APIRouter(prefix="/api/portfolio", tags=["Portfolio"])


@router.get("/summary", response_model=PortfolioSummary)
def portfolio_summary(
    member_id: Optional[int] = Query(
        None, description="Filter by single member"),
    member_ids: Optional[str] = Query(
        None, description="Comma-separated member IDs for group view"),
    db: Session = Depends(get_db),
):
    """
    Get portfolio summary with P&L.
    Supports: single member_id, comma-separated member_ids (group), or all members.
    """
    ids_list = None
    if member_ids:
        ids_list = [int(x.strip()) for x in member_ids.split(',') if x.strip()]
    return get_portfolio_summary(db, member_id, member_ids=ids_list)


@router.get("/holdings", response_model=list[HoldingResponse])
def list_holdings(
    member_id: int = Query(None),
    symbol: str = Query(None),
    db: Session = Depends(get_db),
):
    """List holdings with optional filters."""
    query = db.query(Holding)

    if member_id:
        query = query.filter(Holding.member_id == member_id)
    if symbol:
        query = query.filter(Holding.symbol == symbol.upper())

    holdings = query.all()

    # Optimization: Bulk fetch related data
    all_symbols = list(set(h.symbol for h in holdings))
    all_member_ids = list(set(h.member_id for h in holdings))

    from app.models.price import LivePrice, NavValue
    from app.models.company import Company
    from app.models.member import Member

    prices_map = {p.symbol: p.ltp for p in db.query(
        LivePrice).filter(LivePrice.symbol.in_(all_symbols)).all()}
    navs_map = {p.symbol: p.nav for p in db.query(
        NavValue).filter(NavValue.symbol.in_(all_symbols)).all()}

    # Merge: prioritizing Nav if LTP is missing
    for sym, nav in navs_map.items():
        if sym not in prices_map or prices_map[sym] is None:
            prices_map[sym] = nav
    companies_map = {c.symbol: (c.name, c.sector) for c in db.query(
        Company).filter(Company.symbol.in_(all_symbols)).all()}
    members_map = {m.id: m.name for m in db.query(
        Member).filter(Member.id.in_(all_member_ids)).all()}

    result = []
    for h in holdings:
        ltp = prices_map.get(h.symbol)
        comp_info = companies_map.get(h.symbol) or (h.symbol, "")
        company_name, sector = comp_info
        member_name = members_map.get(h.member_id) or ""

        current_value = h.current_qty * ltp if ltp is not None else None
        unrealized_pnl = (
            current_value - h.total_investment) if current_value is not None else None
        pnl_pct = (unrealized_pnl / h.total_investment *
                   100) if unrealized_pnl is not None and h.total_investment > 0 else None

        tax_profit = 0
        if current_value is not None:
            tax_profit = current_value - (h.current_qty * h.tax_wacc)

        from app.services.portfolio_engine import get_xirr_for_holding
        xirr_val = get_xirr_for_holding(db, h.member_id, h.symbol, current_value or 0)

        result.append(HoldingResponse(
            id=h.id,
            member_id=h.member_id,
            member_name=member_name,
            symbol=h.symbol,
            company_name=company_name,
            sector=sector,
            current_qty=h.current_qty,
            wacc=h.wacc,
            tax_wacc=h.tax_wacc,
            total_investment=h.total_investment,
            ltp=ltp,
            current_value=round(
                current_value, 2) if current_value is not None else None,
            unrealized_pnl=round(
                unrealized_pnl, 2) if unrealized_pnl is not None else None,
            pnl_pct=round(pnl_pct, 2) if pnl_pct is not None else None,
            tax_profit=round(tax_profit, 2),
            xirr=xirr_val
        ))

    return result


@router.get("/history")
def portfolio_history(
    member_id: Optional[int] = Query(None),
    member_ids: Optional[str] = Query(
        None, description="Comma-separated member IDs"),
    days: int = Query(90, description="Number of days of history"),
    db: Session = Depends(get_db),
):
    """Get portfolio value history for charting."""
    from datetime import date, timedelta
    from app.models.portfolio_snapshot import PortfolioSnapshot

    cutoff = date.today() - timedelta(days=days)
    query = db.query(PortfolioSnapshot).filter(
        PortfolioSnapshot.date >= cutoff)

    if member_ids:
        ids_list = [int(x.strip()) for x in member_ids.split(',') if x.strip()]
        query = query.filter(PortfolioSnapshot.member_id.in_(ids_list))
    elif member_id:
        query = query.filter(PortfolioSnapshot.member_id == member_id)

    snapshots = query.order_by(PortfolioSnapshot.date).all()

    return [
        {
            "member_id": s.member_id,
            "date": s.date.isoformat(),
            "total_investment": s.total_investment,
            "current_value": s.current_value,
            "unrealized_pnl": s.unrealized_pnl,
            "holdings_count": s.holdings_count,
        }
        for s in snapshots
    ]


@router.post("/snapshot")
def take_snapshot_now(db: Session = Depends(get_db)):
    """Manually trigger a portfolio snapshot for today."""
    from datetime import date as date_type
    from app.models.member import Member
    from app.models.portfolio_snapshot import PortfolioSnapshot
    from app.services.portfolio_engine import get_portfolio_summary

    today = date_type.today()
    members = db.query(Member).filter(Member.is_active == True).all()
    count = 0

    for member in members:
        existing = db.query(PortfolioSnapshot).filter(
            PortfolioSnapshot.member_id == member.id,
            PortfolioSnapshot.date == today
        ).first()
        if existing:
            continue

        summary = get_portfolio_summary(db, member.id)
        snapshot = PortfolioSnapshot(
            member_id=member.id,
            date=today,
            total_investment=summary.total_investment,
            current_value=summary.current_value,
            unrealized_pnl=summary.unrealized_pnl,
            holdings_count=summary.holdings_count,
        )
        db.add(snapshot)
        count += 1

    db.commit()
    return {"status": "ok", "snapshots_created": count, "date": today.isoformat()}
