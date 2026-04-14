"""
Stock Detail Service — aggregates all data for a single scrip (stock/SIP)
for a given member. Provides a comprehensive 360° view including:
  - Transaction history with running WACC
  - Quantity breakdown (current, liquidated, bonus, IPO, etc.)
  - Dividend history and yield comparison (market yield vs cost yield)
  - XIRR, ROI, Graham's Number, dual WACC
  - Executive summary metrics (if available)
"""

from datetime import date as date_type
from collections import defaultdict
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.models.transaction import Transaction, TransactionType
from app.models.holding import Holding
from app.models.company import Company
from app.models.price import LivePrice, NavValue
from app.models.dividend import DividendIncome
from app.models.fundamental import StockOverview
from app.services.portfolio_engine import calculate_xirr, _build_cashflows_from_txns


# Transaction type groupings (reuse across functions)
BUY_TYPES = {
    TransactionType.BUY.value, TransactionType.IPO.value,
    TransactionType.FPO.value, TransactionType.RIGHT.value,
    TransactionType.AUCTION.value, TransactionType.TRANSFER_IN.value,
}
SELL_TYPES = {TransactionType.SELL.value, TransactionType.TRANSFER_OUT.value}


def get_stock_detail(
    db: Session,
    symbol: str,
    member_id: int | None = None,
    member_ids: list[int] | None = None,
) -> dict:
    """
    Main entry point. Produces the complete stock detail payload.
    Supports single member, group of members, or all members.
    """
    symbol = symbol.upper()

    # --- Company info ---
    company = db.query(Company).filter(Company.symbol == symbol).first()
    company_name = company.name if company else symbol
    sector = company.sector if company else ""
    instrument = company.instrument if company else "Equity"
    face_value = 10 if instrument and "Mutual Fund" in instrument else 100

    # --- LTP / NAV ---
    ltp_row = db.query(LivePrice).filter(LivePrice.symbol == symbol).first()
    ltp = float(ltp_row.ltp) if ltp_row and ltp_row.ltp else None

    nav_row = db.query(NavValue).filter(NavValue.symbol == symbol).first()
    nav = float(nav_row.nav) if nav_row and nav_row.nav else None

    # For SIPs, use NAV as the price if no LTP
    price = ltp if ltp is not None else nav

    # --- Transactions ---
    txn_query = db.query(Transaction).filter(Transaction.symbol == symbol)
    if member_ids:
        txn_query = txn_query.filter(Transaction.member_id.in_(member_ids))
    elif member_id:
        txn_query = txn_query.filter(Transaction.member_id == member_id)

    txns = txn_query.order_by(Transaction.txn_date.asc(), Transaction.id.asc()).all()

    # --- Quantity breakdown ---
    qty_breakdown = _compute_quantity_breakdown(txns)

    # --- Transaction history (formatted) ---
    txn_history = _format_transactions(txns)

    # --- Current holding ---
    holding_query = db.query(Holding).filter(Holding.symbol == symbol)
    if member_ids:
        holding_query = holding_query.filter(Holding.member_id.in_(member_ids))
    elif member_id:
        holding_query = holding_query.filter(Holding.member_id == member_id)

    holdings = holding_query.all()

    current_qty = sum(h.current_qty for h in holdings)
    total_investment = sum(h.total_investment for h in holdings)
    # Weighted average of WACC across member holdings
    wacc = (total_investment / current_qty) if current_qty > 0 else 0
    tax_wacc = (
        sum(h.current_qty * h.tax_wacc for h in holdings) / current_qty
        if current_qty > 0 else 0
    )

    # --- P&L ---
    current_value = current_qty * price if price is not None and current_qty > 0 else None
    unrealized_pnl = (current_value - total_investment) if current_value is not None else None
    pnl_pct = (unrealized_pnl / total_investment * 100) if unrealized_pnl is not None and total_investment > 0 else None
    tax_profit = (current_value - (current_qty * tax_wacc)) if current_value is not None else None

    # --- Realized P&L ---
    realized_profit = 0.0
    for t in txns:
        if t.txn_type in SELL_TYPES:
            net_received = t.total_cost if t.total_cost else ((t.rate or 0) * t.quantity)
            if net_received <= 0:
                continue
            cost_basis = t.quantity * (t.wacc or 0)
            realized_profit += (net_received - cost_basis)

    # --- Total ROI (includes realized + unrealized + dividends) ---
    total_cash_invested = qty_breakdown["total_buy_cost"]

    # --- XIRR ---
    cashflows = _build_cashflows_from_txns(txns)
    if current_value and current_value > 0:
        cashflows.append((date_type.today(), current_value))
    xirr_val = calculate_xirr(cashflows)

    # --- Dividend data ---
    div_query = db.query(DividendIncome).filter(DividendIncome.symbol == symbol)
    if member_ids:
        div_query = div_query.filter(DividendIncome.member_id.in_(member_ids))
    elif member_id:
        div_query = div_query.filter(DividendIncome.member_id == member_id)

    div_records = div_query.order_by(DividendIncome.book_close_date.desc()).all()

    total_cash_dividend = 0.0
    total_tax_deducted = 0.0
    total_bonus_shares = 0.0
    dividend_history = []
    
    for r in div_records:
        if r.eligible_quantity <= 0:
            continue
            
        qty = r.eligible_quantity
        cash_pct = r.cash_dividend_percent / 100.0
        bonus_pct = r.bonus_dividend_percent / 100.0
        
        gross_cash = qty * cash_pct * face_value
        tax_on_cash = gross_cash * 0.05
        tax_on_bonus = (qty * bonus_pct * face_value) * 0.05
        total_tax = tax_on_cash + tax_on_bonus
        net_cash = gross_cash - total_tax
        bonus_shares = qty * bonus_pct
        
        total_cash_dividend += max(net_cash, 0) # Only count positive net cash as "received"
        total_tax_deducted += total_tax
        total_bonus_shares += bonus_shares
        
        dividend_history.append({
            "fiscal_year": r.fiscal_year,
            "cash_pct": r.cash_dividend_percent,
            "bonus_pct": r.bonus_dividend_percent,
            "book_close_date": r.book_close_date.isoformat() if r.book_close_date else None,
            "eligible_qty": qty,
            # Maintain backward compatibility, replace cash_amount with net_cash
            "cash_amount": round(net_cash, 3), 
            "gross_cash": round(gross_cash, 3),
            "total_tax": round(total_tax, 3),
            "tax_owed": round(abs(net_cash), 3) if net_cash <= -1.0 else 0,
            "bonus_shares": round(bonus_shares, 3),
        })

    # --- Dividend Yield comparison ---
    latest_div = div_records[0] if div_records else None
    latest_cash_pct = latest_div.cash_dividend_percent if latest_div else 0
    latest_cash_npr = (latest_cash_pct / 100.0) * face_value

    # Market yield = cash dividend per share / LTP
    market_yield = round((latest_cash_npr / price) * 100, 3) if price and price > 0 else 0
    # Cost yield = cash dividend per share / WACC (your actual yield)
    cost_yield = round((latest_cash_npr / wacc) * 100, 3) if wacc and wacc > 0 else 0

    # --- Total ROI ---
    total_returns = (unrealized_pnl or 0) + realized_profit + total_cash_dividend
    roi_pct = round((total_returns / total_cash_invested) * 100, 3) if total_cash_invested > 0 else 0

    # --- Graham's Number ---
    overview = db.query(StockOverview).filter_by(symbol=symbol).first()
    eps = overview.eps_ttm if overview else None
    bvps = overview.book_value if overview else None
    pe_ratio = overview.pe_ratio if overview else None
    roe_ttm = overview.roe_ttm if overview else None

    import math
    graham_number = None
    graham_discount_pct = None
    if eps and bvps and eps > 0 and bvps > 0:
        graham_number = round(math.sqrt(22.5 * eps * bvps), 3)
        if price and graham_number > 0:
            graham_discount_pct = round(((graham_number - price) / graham_number) * 100, 3)

    # --- First/Last transaction dates ---
    first_txn_date = txns[0].txn_date.isoformat() if txns and txns[0].txn_date else None
    last_txn_date = txns[-1].txn_date.isoformat() if txns and txns[-1].txn_date else None
    holding_days = (date_type.today() - txns[0].txn_date).days if txns and txns[0].txn_date else 0

    return {
        # Company Info
        "symbol": symbol,
        "company_name": company_name,
        "sector": sector,
        "instrument": instrument,
        "face_value": face_value,

        # Price
        "ltp": ltp,
        "nav": nav,
        "price": price,

        # Holdings
        "current_qty": round(current_qty, 4),
        "wacc": round(wacc, 3),
        "tax_wacc": round(tax_wacc, 3),
        "total_investment": round(total_investment, 3),
        "is_active": current_qty > 0,

        # P&L
        "current_value": round(current_value, 3) if current_value is not None else None,
        "unrealized_pnl": round(unrealized_pnl, 3) if unrealized_pnl is not None else None,
        "pnl_pct": round(pnl_pct, 3) if pnl_pct is not None else None,
        "tax_profit": round(tax_profit, 3) if tax_profit is not None else None,
        "realized_profit": round(realized_profit, 3),

        # ROI & Performance
        "total_returns": round(total_returns, 3),
        "roi_pct": roi_pct,
        "xirr": xirr_val,

        # Quantity Breakdown
        "qty_breakdown": qty_breakdown,

        # Graham & Fundamentals
        "graham_number": graham_number,
        "graham_discount_pct": graham_discount_pct,
        "eps_ttm": eps,
        "bvps": bvps,
        "pe_ratio": pe_ratio,
        "roe_ttm": round(roe_ttm * 100, 3) if roe_ttm else None,

        # Dividends
        "total_cash_dividend": round(total_cash_dividend, 3),
        "total_tax_deducted": round(total_tax_deducted, 3),
        "total_bonus_shares": round(total_bonus_shares, 3),
        "market_yield": market_yield,
        "cost_yield": cost_yield,
        "latest_cash_div_pct": latest_cash_pct,
        "dividend_history": dividend_history,

        # Timeline
        "first_txn_date": first_txn_date,
        "last_txn_date": last_txn_date,
        "holding_days": holding_days,

        # Transactions
        "transaction_count": len(txns),
        "transactions": txn_history,
    }


def _compute_quantity_breakdown(txns: list) -> dict:
    """Breakdown of quantity by transaction type."""
    breakdown = {
        "total_bought": 0,
        "total_sold": 0,
        "total_bonus": 0,
        "total_ipo": 0,
        "total_right": 0,
        "total_transferred_in": 0,
        "total_transferred_out": 0,
        "total_buy_cost": 0,  # Total cash invested (BUY + IPO + RIGHT + FPO etc.)
        "total_sell_proceeds": 0,
        "net_shares": 0,
    }

    for t in txns:
        qty = float(t.quantity or 0)
        cost = float(t.total_cost or t.amount or 0)

        if t.txn_type == TransactionType.BUY.value:
            breakdown["total_bought"] += qty
            breakdown["total_buy_cost"] += cost
        elif t.txn_type == TransactionType.IPO.value:
            breakdown["total_ipo"] += qty
            breakdown["total_buy_cost"] += cost
        elif t.txn_type == TransactionType.FPO.value:
            breakdown["total_bought"] += qty
            breakdown["total_buy_cost"] += cost
        elif t.txn_type == TransactionType.RIGHT.value:
            breakdown["total_right"] += qty
            breakdown["total_buy_cost"] += cost
        elif t.txn_type == TransactionType.AUCTION.value:
            breakdown["total_bought"] += qty
            breakdown["total_buy_cost"] += cost
        elif t.txn_type == TransactionType.BONUS.value:
            breakdown["total_bonus"] += qty
        elif t.txn_type == TransactionType.SELL.value:
            breakdown["total_sold"] += qty
            breakdown["total_sell_proceeds"] += cost
        elif t.txn_type == TransactionType.TRANSFER_IN.value:
            breakdown["total_transferred_in"] += qty
            breakdown["total_buy_cost"] += cost
        elif t.txn_type == TransactionType.TRANSFER_OUT.value:
            breakdown["total_transferred_out"] += qty

    breakdown["net_shares"] = (
        breakdown["total_bought"] + breakdown["total_ipo"] +
        breakdown["total_right"] + breakdown["total_bonus"] +
        breakdown["total_transferred_in"] -
        breakdown["total_sold"] - breakdown["total_transferred_out"]
    )

    # Round all values
    for key in breakdown:
        breakdown[key] = round(breakdown[key], 4) if isinstance(breakdown[key], float) else breakdown[key]

    return breakdown


def _format_transactions(txns: list) -> list[dict]:
    """Format transactions for frontend display."""
    return [
        {
            "id": t.id,
            "txn_type": t.txn_type,
            "txn_date": t.txn_date.isoformat() if t.txn_date else None,
            "quantity": float(t.quantity),
            "rate": float(t.rate) if t.rate else None,
            "amount": float(t.amount) if t.amount else None,
            "broker_commission": float(t.broker_commission or 0),
            "sebon_fee": float(t.sebon_fee or 0),
            "dp_charge": float(t.dp_charge or 0),
            "cgt": float(t.cgt or 0),
            "total_cost": float(t.total_cost or 0),
            "wacc": float(t.wacc) if t.wacc else None,
            "tax_wacc": float(t.tax_wacc) if t.tax_wacc else None,
            "source": t.source,
            "remarks": t.remarks,
        }
        for t in txns
    ]
