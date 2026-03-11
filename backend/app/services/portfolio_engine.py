"""
Portfolio Engine — WACC calculation and portfolio summary generation.

Handles the core business logic of computing weighted average cost of capital,
unrealized P&L, and aggregating holdings across members.
"""

from sqlalchemy.orm import Session
from app.models.holding import Holding
from app.models.transaction import Transaction, TransactionType
from app.models.price import LivePrice, NavValue
from app.models.company import Company
from app.models.member import Member
from app.schemas.holding import HoldingResponse, PortfolioSummary


def recalculate_holdings(db: Session, member_id: int, symbol: str):
    """
    Recalculate the holding (quantity, WACC, total_investment) for a specific
    member + symbol based on all transactions.

    WACC Logic:
    - BUY / IPO / FPO / RIGHT / AUCTION: Add to position
      WACC = (old_total_cost + new_total_cost) / (old_qty + new_qty)
    - BONUS: Add quantity at zero cost (WACC decreases)
      WACC = old_total_cost / (old_qty + bonus_qty)
    - SELL: Reduce quantity, keep WACC unchanged
      total_cost = old_wacc * remaining_qty
    - TRANSFER_IN: Treat like buy at WACC=0 if no cost info
    - TRANSFER_OUT: Treat like sell (reduce qty)
    - MERGE / DEMERGE: Special handling (TODO)
    """
    # Get all transactions for this member+symbol, ordered by date
    txns = (
        db.query(Transaction)
        .filter(
            Transaction.member_id == member_id,
            Transaction.symbol == symbol,
        )
        .order_by(Transaction.txn_date.asc(), Transaction.id.asc())
        .all()
    )

    current_qty = 0.0
    total_cost = 0.0          # Actual cash flow (True Cost)
    tax_total_cost = 0.0      # MeroShare logic (Accounting Cost)

    for txn in txns:
        if txn.txn_type in (
            TransactionType.BUY.value,
            TransactionType.IPO.value,
            TransactionType.FPO.value,
            TransactionType.RIGHT.value,
            TransactionType.AUCTION.value,
            TransactionType.TRANSFER_IN.value,
        ):
            # Add to position
            txn_cost = txn.total_cost if txn.total_cost else (txn.amount or 0)
            current_qty += txn.quantity
            total_cost += txn_cost
            tax_total_cost += txn_cost

        elif txn.txn_type == TransactionType.BONUS.value:
            # Bonus shares:
            current_qty += txn.quantity
            # True total_cost stays the same (no cash left bank)
            # Tax cost increases by par value (usually 100) per share
            # Note: For some scrips like SOHL this is 10, but 100 is the market default.
            tax_total_cost += (txn.quantity * 100.0)

        elif txn.txn_type in (
            TransactionType.SELL.value,
            TransactionType.TRANSFER_OUT.value,
        ):
            # Reduce position
            if current_qty > 0:
                wacc = total_cost / current_qty
                tax_wacc = tax_total_cost / current_qty

                current_qty -= txn.quantity
                total_cost = wacc * current_qty if current_qty > 0 else 0
                tax_total_cost = tax_wacc * current_qty if current_qty > 0 else 0

        elif txn.txn_type == TransactionType.DIVIDEND.value:
            # Cash dividend — doesn't affect holding quantity or WACC
            pass

        elif txn.txn_type in (TransactionType.MERGE.value, TransactionType.DEMERGE.value):
            # TODO: Handle mergers/demergers (requires ratio info)
            pass

        # Save the WACC states at this point in time
        txn.wacc = round(total_cost / current_qty, 2) if current_qty > 0 else 0
        txn.tax_wacc = round(tax_total_cost / current_qty,
                             2) if current_qty > 0 else 0

    # Round final values
    current_qty = round(current_qty, 4)
    total_cost = round(total_cost, 2)
    tax_total_cost = round(tax_total_cost, 2)

    wacc = round(total_cost / current_qty, 2) if current_qty > 0 else 0
    tax_wacc = round(tax_total_cost / current_qty, 2) if current_qty > 0 else 0

    # Upsert holding
    company = db.query(Company).filter(Company.symbol == symbol).first()
    company_id = company.id if company else None

    holding = (
        db.query(Holding)
        .filter(Holding.member_id == member_id, Holding.symbol == symbol)
        .first()
    )

    if current_qty <= 0:
        # No holding — remove if exists
        if holding:
            db.delete(holding)
    else:
        if holding:
            holding.current_qty = current_qty
            holding.wacc = wacc
            holding.tax_wacc = tax_wacc
            holding.total_investment = total_cost
            holding.company_id = company_id
        else:
            holding = Holding(
                member_id=member_id,
                company_id=company_id,
                symbol=symbol,
                current_qty=current_qty,
                wacc=wacc,
                tax_wacc=tax_wacc,
                total_investment=total_cost,
            )
            db.add(holding)

    db.commit()


def get_portfolio_summary(
    db: Session, member_id: int | None = None, member_ids: list[int] | None = None
) -> PortfolioSummary:
    """
    Get portfolio summary with P&L for a specific member, group of members, or all.
    member_ids takes priority over member_id when both are provided.
    """
    query = db.query(Holding)
    if member_ids:
        query = query.filter(Holding.member_id.in_(member_ids))
    elif member_id:
        query = query.filter(Holding.member_id == member_id)

    holdings = query.all()

    # Optimization: Bulk fetch related data
    all_symbols = list(set(h.symbol for h in holdings))
    all_member_ids = list(set(h.member_id for h in holdings))

    # Fetch all prices into a dict (LTP and NAV)
    prices_map = {p.symbol: p.ltp for p in db.query(
        LivePrice).filter(LivePrice.symbol.in_(all_symbols)).all()}
    navs_map = {p.symbol: p.nav for p in db.query(
        NavValue).filter(NavValue.symbol.in_(all_symbols)).all()}

    # Merge: prioritizing Nav if LTP is missing
    for sym, nav in navs_map.items():
        if sym not in prices_map or prices_map[sym] is None:
            prices_map[sym] = nav

    # Fetch all companies into a dict
    companies_map = {c.symbol: (c.name, c.sector) for c in db.query(
        Company).filter(Company.symbol.in_(all_symbols)).all()}

    # Fetch all members into a dict
    members_map = {m.id: m.name for m in db.query(
        Member).filter(Member.id.in_(all_member_ids)).all()}

    holding_responses = []
    total_investment = 0.0
    total_current_value = 0.0

    for h in holdings:
        # Get from maps instead of individual queries
        ltp = prices_map.get(h.symbol)
        comp_info = companies_map.get(h.symbol) or (h.symbol, "")
        company_name, sector = comp_info
        member_name = members_map.get(h.member_id) or ""

        # Calculate P&L
        current_value = h.current_qty * ltp if ltp is not None else None

        # True P&L (Cash basis)
        unrealized_pnl = (
            current_value - h.total_investment) if current_value is not None else None
        pnl_pct = (unrealized_pnl / h.total_investment *
                   100) if unrealized_pnl is not None and h.total_investment > 0 else None

        # Taxable P&L (SEBON WACC basis)
        taxable_basis = h.current_qty * h.tax_wacc
        tax_profit = (current_value -
                      taxable_basis) if current_value is not None else 0

        total_investment += h.total_investment
        if current_value is not None:
            total_current_value += current_value

        holding_responses.append(
            HoldingResponse(
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
                    current_value, 2) if current_value else None,
                unrealized_pnl=round(
                    unrealized_pnl, 2) if unrealized_pnl else None,
                pnl_pct=round(pnl_pct, 2) if pnl_pct else None,
                tax_profit=round(tax_profit, 2)
            )
        )

    # Sort by unrealized P&L descending
    holding_responses.sort(key=lambda x: x.unrealized_pnl or 0, reverse=True)

    overall_pnl = total_current_value - \
        total_investment if total_current_value > 0 else 0
    overall_pnl_pct = (overall_pnl / total_investment *
                       100) if total_investment > 0 else 0

    member_name = "All Members"
    if member_ids:
        member_name = f"Group ({len(member_ids)} members)"
    elif member_id:
        member = db.query(Member).filter(Member.id == member_id).first()
        member_name = member.name if member else "Unknown"

    return PortfolioSummary(
        member_id=member_id,
        member_name=member_name,
        total_investment=round(total_investment, 2),
        current_value=round(total_current_value, 2),
        unrealized_pnl=round(overall_pnl, 2),
        pnl_pct=round(overall_pnl_pct, 2),
        holdings_count=len(holding_responses),
        holdings=holding_responses,
    )
