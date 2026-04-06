"""
Portfolio Engine — WACC calculation and portfolio summary generation.

Handles the core business logic of computing weighted average cost of capital,
unrealized P&L, and aggregating holdings across members.
"""

from datetime import date
from scipy.optimize import newton
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.models.holding import Holding
from app.models.transaction import Transaction, TransactionType
from app.models.price import LivePrice, NavValue
from app.models.company import Company
from app.models.member import Member
from app.models.dividend import DividendIncome
from app.schemas.holding import HoldingResponse, PortfolioSummary
from app.services.analysis.fundamental import calculate_graham_number, is_overvalued, analyze_sector_risk
from app.services.analysis.technical import is_technical_downtrend
import pandas as pd
import pandas_ta as ta


def recalculate_holdings(db: Session, member_id: int, symbol: str):
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
        # Capture state BEFORE this transaction
        prev_wacc = total_cost / current_qty if current_qty > 0 else 0.0
        prev_tax_wacc = tax_total_cost / current_qty if current_qty > 0 else 0.0
        
        if txn.txn_type in (
            TransactionType.BUY.value,
            TransactionType.IPO.value,
            TransactionType.FPO.value,
            TransactionType.RIGHT.value,
            TransactionType.AUCTION.value,
            TransactionType.TRANSFER_IN.value,
        ):
            txn_cost = float(txn.total_cost) if txn.total_cost else float(txn.amount or 0)
            current_qty += float(txn.quantity)
            total_cost += txn_cost
            tax_total_cost += txn_cost

        elif txn.txn_type == TransactionType.BONUS.value:
            current_qty += float(txn.quantity)
            tax_total_cost += (float(txn.quantity) * 100.0)

        elif txn.txn_type in (
            TransactionType.SELL.value,
            TransactionType.TRANSFER_OUT.value,
        ):
            if current_qty > 0:
                # Store the WACC used for this exit
                txn.wacc = round(prev_wacc, 2)
                txn.tax_wacc = round(prev_tax_wacc, 2)
                
                sell_qty = float(txn.quantity)
                # Pro-rata reduce the cost basis
                total_cost = prev_wacc * (current_qty - sell_qty)
                tax_total_cost = prev_tax_wacc * (current_qty - sell_qty)
                current_qty -= sell_qty
            else:
                txn.wacc = 0.0
                txn.tax_wacc = 0.0

        elif txn.txn_type == TransactionType.DIVIDEND.value:
            pass

        # For non-sell transactions, update the WACC after the transaction
        if txn.txn_type not in (TransactionType.SELL.value, TransactionType.TRANSFER_OUT.value):
            txn.wacc = round(total_cost / current_qty, 2) if current_qty > 0 else 0.0
            txn.tax_wacc = round(tax_total_cost / current_qty, 2) if current_qty > 0 else 0.0

    # Round final values for DB
    current_qty = round(float(current_qty), 4)
    total_cost = round(float(total_cost), 2)
    tax_total_cost = round(float(tax_total_cost), 2)

    wacc = round(total_cost / current_qty, 2) if current_qty > 0 else 0.0
    tax_wacc = round(tax_total_cost / current_qty, 2) if current_qty > 0 else 0.0

    company = db.query(Company).filter(Company.symbol == symbol).first()
    company_id = company.id if company else None

    holding = (
        db.query(Holding)
        .filter(Holding.member_id == member_id, Holding.symbol == symbol)
        .first()
    )

    if current_qty <= 0:
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


def calculate_xirr(cashflows: list[tuple[date, float]]) -> float:
    """
    Calculate XIRR from a list of (date, amount) tuples.
    Amount: negative for investment (cash out), positive for returns/current value (cash in).
    """
    if not cashflows or len(cashflows) < 2:
        return 0.0

    # Group by date to handle multiple transactions on same day
    grouped = {}
    for d, a in cashflows:
        grouped[d] = grouped.get(d, 0.0) + a

    cf = sorted(grouped.items())

    # Ensure there's at least one negative and one positive
    has_pos = any(a > 0 for _, a in cf)
    has_neg = any(a < 0 for _, a in cf)
    if not (has_pos and has_neg):
        return 0.0

    d0 = cf[0][0]

    def npv(r):
        total = 0.0
        for d, a in cf:
            total += a / (1 + r)**((d - d0).days / 365.25)
        return total

    try:
        # Newton-Raphson solver. Guessing 10% annual return.
        result = newton(npv, 0.1, maxiter=100)
        # Convert decimal rate to percent and round
        return round(float(result) * 100, 2)
    except Exception:
        # If it fails to converge, return 0 (could be extreme losses/gains)
        return 0.0


def get_xirr_for_holding(db: Session, member_id: int, symbol: str, current_value: float) -> float:
    """Calculate XIRR for a specific member's holding including all historical transactions."""
    from datetime import date as date_type
    txns = db.query(Transaction).filter(
        Transaction.member_id == member_id,
        Transaction.symbol == symbol
    ).all()

    if not txns:
        return 0.0

    cashflows = _build_cashflows_from_txns(txns)

    # Add final market value as today's cash flow
    if current_value > 0:
        cashflows.append((date_type.today(), current_value))

    return calculate_xirr(cashflows)


def _build_cashflows_from_txns(txns: list) -> list[tuple]:
    """Extract cashflow tuples from a list of Transaction objects.
    Shared helper used by both single and batch XIRR computation."""
    cashflows = []
    for t in txns:
        if not t.txn_date:
            continue
        # User Invests: (BUY / IPO / ...) -> Negative cash flow
        if t.txn_type in (
            TransactionType.BUY.value,
            TransactionType.IPO.value,
            TransactionType.FPO.value,
            TransactionType.RIGHT.value,
            TransactionType.AUCTION.value,
            TransactionType.TRANSFER_IN.value,
        ):
            cost = t.total_cost if t.total_cost else (t.amount or 0)
            if cost > 0:
                cashflows.append((t.txn_date, -cost))

        elif t.txn_type in (
            TransactionType.SELL.value,
            TransactionType.TRANSFER_OUT.value,
        ):
            receivable = t.total_cost if t.total_cost else ((t.rate or 0) * t.quantity)
            # Fallback to cost basis if sell price is missing to prevent XIRR from crashing
            if receivable <= 0 and t.wacc:
                receivable = t.quantity * t.wacc
                
            if receivable > 0:
                cashflows.append((t.txn_date, receivable))

        # Cash Dividend (If implemented/tracked)
        elif t.txn_type == TransactionType.DIVIDEND.value:
            if t.amount:
                cashflows.append((t.txn_date, t.amount))

    return cashflows


def batch_xirr_for_holdings(
    db: Session,
    holdings: list,
    prices_map: dict[str, float],
) -> dict[tuple[int, str], float]:
    """
    HIGH-01/PERF-01 fix: Compute XIRR for ALL holdings in a single batch.
    
    Instead of N individual queries (one per holding), this:
    1. Fetches ALL transactions for all relevant (member_id, symbol) pairs in ONE query
    2. Groups them in-memory by (member_id, symbol)
    3. Computes XIRR for each group
    
    Returns: dict mapping (member_id, symbol) -> xirr_value
    """
    from datetime import date as date_type
    from collections import defaultdict

    if not holdings:
        return {}

    # Collect all (member_id, symbol) pairs
    all_member_ids = list(set(h.member_id for h in holdings))
    all_symbols = list(set(h.symbol for h in holdings))

    # SINGLE query: fetch all transactions for these members and symbols
    all_txns = (
        db.query(Transaction)
        .filter(
            Transaction.member_id.in_(all_member_ids),
            Transaction.symbol.in_(all_symbols),
        )
        .all()
    )

    # Group transactions by (member_id, symbol) in memory
    txn_groups: dict[tuple[int, str], list] = defaultdict(list)
    for t in all_txns:
        txn_groups[(t.member_id, t.symbol)].append(t)

    # Compute XIRR for each holding
    result = {}
    today = date_type.today()
    for h in holdings:
        key = (h.member_id, h.symbol)
        txns = txn_groups.get(key, [])
        if not txns:
            result[key] = 0.0
            continue

        cashflows = _build_cashflows_from_txns(txns)

        # Add current market value as terminal cashflow
        ltp = prices_map.get(h.symbol)
        current_value = h.current_qty * ltp if ltp is not None else 0
        if current_value > 0:
            cashflows.append((today, current_value))

        result[key] = calculate_xirr(cashflows)

    return result


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

    # Fetch all companies into a dict (MED-02 fix)
    companies_map = {c.symbol: (c.name, c.sector, c.instrument) for c in db.query(
        Company).filter(Company.symbol.in_(all_symbols)).all()}

    # Fetch all members into a dict
    members_map = {m.id: m.name for m in db.query(
        Member).filter(Member.id.in_(all_member_ids)).all()}

    # Batch fetch technical indicators (SMA/RSI) from PriceHistory
    from app.models.price import PriceHistory
    # We need ~250 trading days for 200 EMA
    import datetime
    
    # Pre-fetch technicals for all symbols
    tech_map = {}
    for sym in all_symbols:
        # Fetching 250 rows for each might be slow in a loop, but better than query per holding
        # A truly optimized version would use a subquery/window function for all symbols at once.
        # But since holdings_count is usually ~20-30, we'll do this.
        prices = db.query(PriceHistory).filter(PriceHistory.symbol==sym).order_by(PriceHistory.date.desc()).limit(250).all()
        if len(prices) >= 50:
            pdf = pd.DataFrame([{"close": p.close} for p in prices[::-1]])
            pdf.ta.ema(length=50, append=True)
            pdf.ta.ema(length=200, append=True)
            pdf.ta.rsi(length=14, append=True)
            row = pdf.iloc[-1]
            tech_map[sym] = {
                "sma_50": float(row.get('EMA_50')) if not pd.isna(row.get('EMA_50')) else None,
                "sma_200": float(row.get('EMA_200')) if not pd.isna(row.get('EMA_200')) else None,
                "rsi_14": float(row.get('RSI_14')) if not pd.isna(row.get('RSI_14')) else None
            }

    # Batch fetch fundamental reports
    from app.models.fundamental import StockOverview, FundamentalReport
    overview_map = {o.symbol: o for o in db.query(StockOverview).filter(StockOverview.symbol.in_(all_symbols)).all()}
    
    # Group quarterly reports by symbol
    q_reports_all = db.query(FundamentalReport).filter(FundamentalReport.symbol.in_(all_symbols)).order_by(FundamentalReport.quarter.desc()).all()
    q_map = {}
    for r in q_reports_all:
        if r.symbol not in q_map: q_map[r.symbol] = []
        q_map[r.symbol].append({
            "quarter": r.quarter,
            "paid_up_capital": r.paid_up_capital,
            "net_profit": r.net_profit,
            "sector_metrics": r.sector_metrics or {}
        })

    # HIGH-01: Precompute XIRR for all holdings in a single batch query
    xirr_map = batch_xirr_for_holdings(db, holdings, prices_map)

    holding_responses = []
    total_investment = 0.0
    total_current_value = 0.0

    for h in holdings:
        # Get from maps instead of individual queries
        ltp = prices_map.get(h.symbol)
        comp_info = companies_map.get(h.symbol) or (h.symbol, "", "")
        company_name, sector, instrument = comp_info
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
                instrument=instrument,
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
                tax_profit=round(tax_profit, 2),
                xirr=xirr_map.get((h.member_id, h.symbol), 0.0),
                
                # New Analysis Metrics
                sma_50=tech_map.get(h.symbol, {}).get("sma_50"),
                sma_200=tech_map.get(h.symbol, {}).get("sma_200"),
                rsi_14=tech_map.get(h.symbol, {}).get("rsi_14"),
                is_technical_downtrend=is_technical_downtrend(ltp, tech_map.get(h.symbol, {}).get("sma_200")),
                
                graham_number=calculate_graham_number(
                    overview_map.get(h.symbol).eps_ttm if overview_map.get(h.symbol) else None,
                    overview_map.get(h.symbol).book_value if overview_map.get(h.symbol) else None
                ),
                price_to_graham_ratio=round(ltp / calculate_graham_number(
                    overview_map.get(h.symbol).eps_ttm if overview_map.get(h.symbol) else None,
                    overview_map.get(h.symbol).book_value if overview_map.get(h.symbol) else None
                ), 2) if ltp and calculate_graham_number(
                    overview_map.get(h.symbol).eps_ttm if overview_map.get(h.symbol) else None,
                    overview_map.get(h.symbol).book_value if overview_map.get(h.symbol) else None
                ) else None,
                
                is_fundamental_risk=analyze_sector_risk(
                    sector,
                    {}, # Reserved
                    q_map.get(h.symbol, [])
                )
            )
        )

    # Calculate realized profit and dividend income from transactions
    txns_query = db.query(Transaction)
    if member_ids:
        txns_query = txns_query.filter(Transaction.member_id.in_(member_ids))
    elif member_id:
        txns_query = txns_query.filter(Transaction.member_id == member_id)
    
    all_txns = txns_query.all()
    realized_profit = 0.0
    dividend_income = 0.0
    
    for t in all_txns:
        if t.txn_type in (TransactionType.SELL.value, TransactionType.TRANSFER_OUT.value):
            net_received = t.total_cost if t.total_cost else ((t.rate or 0) * t.quantity)
            # If sell price is completely missing/zero, skip to avoid treating the whole cost basis as a massive loss
            if net_received <= 0:
                continue
            
            # Profit = Net Received - (Quantity * WACC at time of sell)
            cost_basis = t.quantity * (t.wacc or 0)
            realized_profit += (net_received - cost_basis)

    # Calculate dividend income accurately from DividendIncome table
    div_query = db.query(func.coalesce(func.sum(DividendIncome.total_cash_amount), 0))
    if member_ids:
        div_query = div_query.filter(DividendIncome.member_id.in_(member_ids))
    elif member_id:
        div_query = div_query.filter(DividendIncome.member_id == member_id)
        
    dividend_income = div_query.scalar() or 0.0

    # Sort by unrealized P&L descending
    holding_responses.sort(key=lambda x: x.unrealized_pnl or 0, reverse=True)

    overall_pnl = total_current_value - \
        total_investment if total_current_value > 0 else 0
    overall_pnl_pct = (overall_pnl / total_investment *
                       100) if total_investment > 0 else 0

    summary_member_name = "All Members"
    if member_ids:
        summary_member_name = f"Group ({len(member_ids)} members)"
    elif member_id:
        member = db.query(Member).filter(Member.id == member_id).first()
        summary_member_name = member.name if member else "Unknown"

    summary = PortfolioSummary(
        member_id=member_id,
        member_name=summary_member_name,
        total_investment=round(total_investment, 2),
        current_value=round(total_current_value, 2),
        unrealized_pnl=round(overall_pnl, 2),
        pnl_pct=round(overall_pnl_pct, 2),
        realized_profit=round(realized_profit, 2),
        dividend_income=round(dividend_income, 2),
        holdings_count=len(holding_responses),
        portfolio_xirr=0, # Computed below
        nepse_xirr=0,     # Computed below
        market_alpha=0,   # Computed below
        holdings=holding_responses,
    )

    # Compute Benchmark Comparison
    from app.services.portfolio_history import PortfolioHistoryService
    history_svc = PortfolioHistoryService(db)
    hist = history_svc.get_computed_history(member_id, member_ids, days=365)
    
    if len(hist) >= 2:
        p_cashflows = []
        for t in all_txns:
            if not t.txn_date: continue
            cost = t.total_cost if t.total_cost else (t.amount or 0)
            if t.txn_type in (TransactionType.BUY.value, TransactionType.IPO.value, TransactionType.FPO.value, TransactionType.RIGHT.value, TransactionType.AUCTION.value, TransactionType.TRANSFER_IN.value):
                p_cashflows.append((t.txn_date, -cost))
            elif t.txn_type in (TransactionType.SELL.value, TransactionType.TRANSFER_OUT.value):
                p_cashflows.append((t.txn_date, cost))
            elif t.txn_type == TransactionType.DIVIDEND.value and t.amount:
                p_cashflows.append((t.txn_date, t.amount))
                
        if total_current_value > 0:
            p_cashflows.append((date.today(), total_current_value))
            
        summary.portfolio_xirr = calculate_xirr(p_cashflows)
        
        # Benchmark cashflows
        bn_cashflows = []
        from app.models.price import IndexHistory
        
        # Load all index history into memory for O(1) lookup
        all_indices = db.query(IndexHistory.date, IndexHistory.close).order_by(IndexHistory.date.desc()).all()
        idx_today_val = all_indices[0].close if all_indices else 2000
        
        # Helper for closest date index
        def get_index_close(target_date):
            for d, c in all_indices:
                if d <= target_date:
                    return c
            return 2000
        
        units = 0
        for t_date, amt in p_cashflows:
            if amt < 0: # Investment
                inv_amt = abs(amt)
                idx_at_val = get_index_close(t_date)
                units += inv_amt / idx_at_val
                bn_cashflows.append((t_date, -inv_amt))
        
        
        bn_cashflows.append((date.today(), units * idx_today_val))
        summary.nepse_xirr = calculate_xirr(bn_cashflows)
        summary.market_alpha = round(summary.portfolio_xirr - summary.nepse_xirr, 2)
        
    return summary
