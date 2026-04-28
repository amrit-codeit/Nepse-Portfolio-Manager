"""
Trade Intel Service — Retrospective portfolio analysis engine.

Builds 'Holding Epochs' from transaction history, enriches them with
fundamental snapshots and current metrics, then feeds them to the AI
analysis pipeline for post-mortem investment review.
"""

from datetime import datetime, date
from sqlalchemy.orm import Session
from app.models.transaction import Transaction
from app.models.holding import Holding
from app.models.price import LivePrice
from app.models.fundamental import StockOverview
from app.services.analysis.executive_summary import calculate_executive_summary


def build_holding_epochs(db: Session, symbol: str, member_id: int) -> dict:
    """
    Groups transactions for a (symbol, member_id) pair into continuous
    'holding epochs' — periods where the user held shares (qty > 0).

    Returns a dict with:
      - epochs: list of epoch dicts
      - current_holding: current Holding snapshot
      - fundamental_snapshot: current Graham/PE/health data
    """
    symbol = symbol.upper()

    # 1. Fetch all transactions for this member + symbol, ordered by date
    txns = (
        db.query(Transaction)
        .filter(Transaction.symbol == symbol, Transaction.member_id == member_id)
        .order_by(Transaction.txn_date.asc(), Transaction.id.asc())
        .all()
    )

    if not txns:
        return {"epochs": [], "current_holding": None, "fundamental_snapshot": None}

    # 2. Build epochs — an epoch starts when qty goes from 0 → positive
    #    and ends when qty drops back to 0 (or is still open)
    epochs = []
    current_epoch = None
    running_qty = 0
    running_cost = 0  # total cost basis for the epoch

    INFLOW_TYPES = {"BUY", "IPO", "FPO", "RIGHT", "BONUS", "AUCTION", "TRANSFER_IN", "MERGE"}
    OUTFLOW_TYPES = {"SELL", "TRANSFER_OUT", "DEMERGE"}

    for txn in txns:
        txn_type = (txn.txn_type or "").upper()
        qty = txn.quantity or 0
        rate = txn.rate or 0
        total_cost = txn.total_cost or 0

        if txn_type in INFLOW_TYPES:
            if running_qty == 0:
                # Start a new epoch
                current_epoch = {
                    "epoch_start": txn.txn_date,
                    "epoch_end": None,
                    "is_open": True,
                    "transactions": [],
                    "total_bought_qty": 0,
                    "total_bought_cost": 0,
                    "total_sold_qty": 0,
                    "total_sold_proceeds": 0,
                    "total_cgt_paid": 0,
                    "avg_buy_price": 0,
                    "avg_sell_price": 0,
                    "realized_pnl": 0,
                    "unrealized_pnl": 0,
                    "holding_days": 0,
                }

            running_qty += qty
            if txn_type != "BONUS":
                running_cost += total_cost
                current_epoch["total_bought_qty"] += qty
                current_epoch["total_bought_cost"] += total_cost
            else:
                # Bonus shares have zero cost
                current_epoch["total_bought_qty"] += qty

        elif txn_type in OUTFLOW_TYPES:
            running_qty -= qty
            if txn_type == "SELL":
                proceeds = (txn.amount or 0) - (txn.broker_commission or 0) - (txn.sebon_fee or 0) - (txn.dp_charge or 0)
                current_epoch["total_sold_qty"] += qty
                current_epoch["total_sold_proceeds"] += proceeds
                current_epoch["total_cgt_paid"] += (txn.cgt or 0)

        # Record the transaction summary
        if current_epoch:
            current_epoch["transactions"].append({
                "id": txn.id,
                "date": str(txn.txn_date) if txn.txn_date else None,
                "type": txn_type,
                "qty": qty,
                "rate": rate,
                "total_cost": total_cost,
                "wacc_after": txn.wacc,
            })

        # Check if epoch closed
        if running_qty <= 0 and current_epoch:
            running_qty = max(running_qty, 0)  # clamp
            current_epoch["is_open"] = False
            current_epoch["epoch_end"] = txn.txn_date

            # Calculate epoch metrics
            _finalize_epoch(current_epoch, ltp=None)
            epochs.append(current_epoch)
            current_epoch = None
            running_cost = 0

    # Handle still-open epoch
    if current_epoch and running_qty > 0:
        ltp_row = db.query(LivePrice).filter_by(symbol=symbol).first()
        current_ltp = ltp_row.ltp if ltp_row and ltp_row.ltp else 0

        current_epoch["is_open"] = True
        current_epoch["epoch_end"] = date.today()
        _finalize_epoch(current_epoch, ltp=current_ltp, remaining_qty=running_qty)
        epochs.append(current_epoch)

    # 3. Current holding snapshot
    holding = db.query(Holding).filter(
        Holding.symbol == symbol, Holding.member_id == member_id
    ).first()
    holding_snapshot = None
    if holding and holding.current_qty > 0:
        ltp_row = db.query(LivePrice).filter_by(symbol=symbol).first()
        current_ltp = ltp_row.ltp if ltp_row and ltp_row.ltp else 0
        holding_snapshot = {
            "symbol": symbol,
            "current_qty": holding.current_qty,
            "wacc": holding.wacc,
            "total_investment": holding.total_investment,
            "current_value": holding.current_qty * current_ltp,
            "unrealized_pnl": (holding.current_qty * current_ltp) - holding.total_investment,
            "ltp": current_ltp,
        }

    # 4. Fundamental snapshot (lightweight — reuse exec summary engine)
    fundamental_snapshot = None
    try:
        exec_data = calculate_executive_summary(db, symbol)
        if exec_data:
            fundamental_snapshot = {
                "health_score": exec_data.get("health_score"),
                "action": exec_data.get("action"),
                "graham_number": exec_data.get("graham_number"),
                "graham_discount_pct": exec_data.get("graham_discount_pct"),
                "pe_ratio": exec_data.get("pe_ratio"),
                "pb_ratio": exec_data.get("pb_ratio"),
                "eps_ttm": exec_data.get("eps_ttm"),
                "roe_ttm": exec_data.get("roe_ttm"),
                "dividend_yield": exec_data.get("dividend_yield"),
                "profit_trend": exec_data.get("profit_trend"),
                "sector": exec_data.get("sector"),
                "ltp": exec_data.get("ltp"),
            }
    except Exception:
        pass  # Don't let fundamental lookup crash Trade Intel

    return {
        "symbol": symbol,
        "member_id": member_id,
        "total_epochs": len(epochs),
        "epochs": epochs,
        "current_holding": holding_snapshot,
        "fundamental_snapshot": fundamental_snapshot,
    }


def _finalize_epoch(epoch: dict, ltp: float | None = None, remaining_qty: float = 0):
    """Calculate derived metrics for an epoch."""
    bought = epoch["total_bought_qty"]
    epoch["avg_buy_price"] = (
        epoch["total_bought_cost"] / bought if bought > 0 else 0
    )

    sold_qty = epoch["total_sold_qty"]
    epoch["avg_sell_price"] = (
        epoch["total_sold_proceeds"] / sold_qty if sold_qty > 0 else 0
    )

    # Realized P&L = proceeds - proportional cost
    if sold_qty > 0 and bought > 0:
        cost_of_sold = (epoch["total_bought_cost"] / bought) * sold_qty
        epoch["realized_pnl"] = epoch["total_sold_proceeds"] - cost_of_sold
    else:
        epoch["realized_pnl"] = 0

    # Unrealized P&L (open epochs only)
    if epoch["is_open"] and ltp and remaining_qty > 0:
        cost_of_remaining = (epoch["total_bought_cost"] / bought) * remaining_qty if bought > 0 else 0
        epoch["unrealized_pnl"] = (remaining_qty * ltp) - cost_of_remaining
        epoch["remaining_qty"] = remaining_qty
        epoch["current_ltp"] = ltp
    else:
        epoch["unrealized_pnl"] = 0
        epoch["remaining_qty"] = 0
        epoch["current_ltp"] = None

    # Holding duration
    start = epoch.get("epoch_start")
    end = epoch.get("epoch_end")
    if start and end:
        try:
            if isinstance(start, str):
                start = datetime.strptime(start, "%Y-%m-%d").date()
            if isinstance(end, str):
                end = datetime.strptime(end, "%Y-%m-%d").date()
            epoch["holding_days"] = (end - start).days
        except Exception:
            epoch["holding_days"] = 0

    # Serialise dates
    epoch["epoch_start"] = str(epoch["epoch_start"]) if epoch["epoch_start"] else None
    epoch["epoch_end"] = str(epoch["epoch_end"]) if epoch["epoch_end"] else None
