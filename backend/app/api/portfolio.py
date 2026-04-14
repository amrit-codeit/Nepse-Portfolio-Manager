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
    companies_map = {c.symbol: (c.name, c.sector, c.instrument) for c in db.query(
        Company).filter(Company.symbol.in_(all_symbols)).all()}
    members_map = {m.id: m.name for m in db.query(
        Member).filter(Member.id.in_(all_member_ids)).all()}

    from app.services.portfolio_engine import batch_xirr_for_holdings
    xirrs_map = batch_xirr_for_holdings(db, holdings, prices_map)

    result = []
    for h in holdings:
        ltp = prices_map.get(h.symbol)
        comp_info = companies_map.get(h.symbol) or (h.symbol, "", "")
        company_name, sector, instrument = comp_info
        member_name = members_map.get(h.member_id) or ""

        current_value = h.current_qty * ltp if ltp is not None else None
        unrealized_pnl = (
            current_value - h.total_investment) if current_value is not None else None
        pnl_pct = (unrealized_pnl / h.total_investment *
                   100) if unrealized_pnl is not None and h.total_investment > 0 else None

        tax_profit = 0
        if current_value is not None:
            tax_profit = current_value - (h.current_qty * h.tax_wacc)

        xirr_val = xirrs_map.get((h.member_id, h.symbol), 0.0)

        result.append(HoldingResponse(
            id=h.id,
            member_id=h.member_id,
            member_name=member_name,
            symbol=h.symbol,
            company_name=company_name,
            sector=sector,
            instrument=instrument,
            current_qty=h.current_qty,
            wacc=h.wacc,
            tax_wacc=h.tax_wacc,
            total_investment=h.total_investment,
            ltp=ltp,
            current_value=round(
                current_value, 3) if current_value is not None else None,
            unrealized_pnl=round(
                unrealized_pnl, 3) if unrealized_pnl is not None else None,
            pnl_pct=round(pnl_pct, 3) if pnl_pct is not None else None,
            tax_profit=round(tax_profit, 3),
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


@router.get("/closed-positions")
def closed_positions(
    member_id: Optional[int] = Query(None),
    member_ids: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    """
    Get fully liquidated (closed) positions — symbols where the user once held
    shares but has since sold everything (current_qty = 0).
    Computes realized P&L, holding period, and XIRR for each.
    """
    from datetime import date as date_type
    from sqlalchemy import func, distinct
    from app.models.transaction import Transaction, TransactionType
    from app.models.company import Company
    from app.models.member import Member
    from app.services.portfolio_engine import calculate_xirr

    # Determine member filter
    ids_list = None
    if member_ids:
        ids_list = [int(x.strip()) for x in member_ids.split(',') if x.strip()]

    # Step 1: Find all (member_id, symbol) pairs that have transactions
    txn_query = db.query(Transaction)
    if ids_list:
        txn_query = txn_query.filter(Transaction.member_id.in_(ids_list))
    elif member_id:
        txn_query = txn_query.filter(Transaction.member_id == member_id)

    all_txns = txn_query.order_by(Transaction.txn_date.asc()).all()

    # Step 2: Group transactions by (member_id, symbol)
    from collections import defaultdict
    groups = defaultdict(list)
    for t in all_txns:
        groups[(t.member_id, t.symbol)].append(t)

    # Step 3: Find which (member, symbol) pairs have zero current holdings
    held_symbols = set()
    holdings_query = db.query(Holding)
    if ids_list:
        holdings_query = holdings_query.filter(Holding.member_id.in_(ids_list))
    elif member_id:
        holdings_query = holdings_query.filter(Holding.member_id == member_id)

    for h in holdings_query.all():
        if h.current_qty > 0:
            held_symbols.add((h.member_id, h.symbol))

    # Fetch company and member info
    all_symbols = list(set(sym for _, sym in groups.keys()))
    all_member_ids = list(set(mid for mid, _ in groups.keys()))
    companies_map = {c.symbol: (c.name, c.sector) for c in db.query(
        Company).filter(Company.symbol.in_(all_symbols)).all()} if all_symbols else {}
    members_map = {m.id: m.name for m in db.query(
        Member).filter(Member.id.in_(all_member_ids)).all()} if all_member_ids else {}

    BUY_TYPES = {
        TransactionType.BUY.value, TransactionType.IPO.value,
        TransactionType.FPO.value, TransactionType.RIGHT.value,
        TransactionType.AUCTION.value, TransactionType.TRANSFER_IN.value,
    }
    SELL_TYPES = {TransactionType.SELL.value, TransactionType.TRANSFER_OUT.value}

    results = []
    for (mid, sym), txns in groups.items():
        # Skip if currently held
        if (mid, sym) in held_symbols:
            continue

        # Must have at least one sell to be a "closed position"
        has_sell = any(t.txn_type in SELL_TYPES for t in txns)
        if not has_sell:
            continue

        total_buy_cost = 0.0
        total_buy_qty = 0.0
        total_sell_proceeds = 0.0
        total_sell_qty = 0.0
        dividend_income = 0.0
        first_buy_date = None
        last_sell_date = None
        cashflows = []

        for t in txns:
            cost = t.total_cost if t.total_cost else ((t.rate or 0) * t.quantity)

            if t.txn_type in BUY_TYPES:
                total_buy_cost += cost
                total_buy_qty += t.quantity
                if not first_buy_date and t.txn_date:
                    first_buy_date = t.txn_date
                if cost > 0 and t.txn_date:
                    cashflows.append((t.txn_date, -cost))

            elif t.txn_type in SELL_TYPES:
                if cost > 0:
                    total_sell_proceeds += cost
                    total_sell_qty += t.quantity
                    if t.txn_date:
                        last_sell_date = t.txn_date
                        cashflows.append((t.txn_date, cost))

            elif t.txn_type == TransactionType.BONUS.value:
                total_buy_qty += t.quantity
                # Bonus has no cash outflow

            elif t.txn_type == TransactionType.DIVIDEND.value:
                dividend_income += (t.amount or 0)
                if t.amount and t.txn_date:
                    cashflows.append((t.txn_date, t.amount))

        net_pnl = total_sell_proceeds - total_buy_cost + dividend_income
        pnl_pct = (net_pnl / total_buy_cost * 100) if total_buy_cost > 0 else 0.0

        holding_days = 0
        if first_buy_date and last_sell_date:
            holding_days = (last_sell_date - first_buy_date).days

        xirr_val = calculate_xirr(cashflows) if len(cashflows) >= 2 else 0.0

        comp_info = companies_map.get(sym, (sym, ""))
        results.append({
            "member_id": mid,
            "member_name": members_map.get(mid, ""),
            "symbol": sym,
            "company_name": comp_info[0],
            "sector": comp_info[1],
            "total_buy_qty": round(total_buy_qty, 4),
            "total_buy_cost": round(total_buy_cost, 3),
            "total_sell_qty": round(total_sell_qty, 4),
            "total_sell_proceeds": round(total_sell_proceeds, 3),
            "dividend_income": round(dividend_income, 3),
            "net_pnl": round(net_pnl, 3),
            "pnl_pct": round(pnl_pct, 3),
            "first_buy_date": first_buy_date.isoformat() if first_buy_date else None,
            "last_sell_date": last_sell_date.isoformat() if last_sell_date else None,
            "holding_days": holding_days,
            "xirr": xirr_val,
        })

    # Sort by net P&L descending (best trades first)
    results.sort(key=lambda x: x["net_pnl"], reverse=True)
    return results



@router.get("/computed-history")
def computed_history(
    member_id: Optional[int] = Query(None),
    member_ids: Optional[str] = Query(None),
    is_sip: Optional[bool] = Query(None),
    days: int = Query(365),
    db: Session = Depends(get_db)
):
    """
    Returns a daily series of portfolio value vs investment cost vs NEPSE index.
    Crucial for performance charts.
    """
    from app.services.portfolio_history import PortfolioHistoryService
    
    # Parse member IDs
    ids_list = None
    if member_ids:
        ids_list = [int(x.strip()) for x in member_ids.split(',') if x.strip()]
        
    service = PortfolioHistoryService(db)
    history = service.get_computed_history(
        member_id=member_id,
        member_ids=ids_list,
        days=days,
        is_sip=is_sip
    )
    
    return history
@router.get("/dividends")
def get_dividends(
    member_id: Optional[int] = Query(None),
    member_ids: Optional[str] = Query(None),
    db: Session = Depends(get_db)
):
    """Get dividend income history table."""
    from app.models.dividend import DividendIncome
    from app.models.member import Member
    from app.models.company import Company
    
    query = db.query(DividendIncome, Member.name.label("member_name"), Company.instrument).join(
        Member, DividendIncome.member_id == Member.id
    ).outerjoin(
        Company, DividendIncome.symbol == Company.symbol
    )
    
    if member_ids:
        ids_list = [int(x.strip()) for x in member_ids.split(',') if x.strip()]
        query = query.filter(DividendIncome.member_id.in_(ids_list))
    elif member_id:
        query = query.filter(DividendIncome.member_id == member_id)
        
    records = query.order_by(DividendIncome.book_close_date.desc()).all()
    
    res = []
    for r in records:
        div = r.DividendIncome
        qty = div.eligible_quantity
        
        # Par value is 10 for Mutual Funds, 100 for Equities
        fv = 10 if r.instrument and "Mutual Fund" in r.instrument else 100
        
        cash_pct = div.cash_dividend_percent / 100.0
        bonus_pct = div.bonus_dividend_percent / 100.0
        
        gross_cash = qty * cash_pct * fv
        tax_on_cash = gross_cash * 0.05
        tax_on_bonus = (qty * bonus_pct * fv) * 0.05
        
        total_tax = tax_on_cash + tax_on_bonus
        net_cash = gross_cash - total_tax
        
        res.append({
            "id": div.id,
            "member_id": div.member_id,
            "member_name": r.member_name,
            "symbol": div.symbol,
            "fiscal_year": div.fiscal_year,
            "cash_dividend_percent": div.cash_dividend_percent,
            "bonus_dividend_percent": div.bonus_dividend_percent,
            "book_close_date": div.book_close_date.isoformat() if div.book_close_date else None,
            "eligible_quantity": qty,
            # We overwrite total_cash_amount to represent the dynamic net cash
            "total_cash_amount": round(net_cash, 3),
            "gross_cash": round(gross_cash, 3),
            "total_tax": round(total_tax, 3),
            "tax_owed": round(abs(net_cash), 3) if net_cash <= -1.0 else 0,
            "bonus_shares": round(qty * bonus_pct, 4)
        })
    return res
