"""
Service to handle Buy/Sell calculator logic with proper fee deductions and FIFO CGT.
"""

from datetime import date
from sqlalchemy.orm import Session
from app.models.transaction import Transaction, TransactionType
from app.models.holding import Holding
from app.models.company import Company
from app.services.fee_calculator import (
    calculate_buy_costs,
    calculate_broker_commission,
    calculate_dp_charge,
    calculate_sebon_fee,
    get_fee_value,
)

def calculate_buy_simulation(db: Session, amount: float, instrument: str, txn_date: date = None):
    if not txn_date:
        txn_date = date.today()
    return calculate_buy_costs(db, amount, instrument, txn_date)

def calculate_sell_simulation(db: Session, member_id: int, symbol: str, sell_qty: float, sell_rate: float, txn_date: date = None):
    if not txn_date:
        txn_date = date.today()

    sell_amount = sell_qty * sell_rate

    # Get the Holding to get current WACC
    holding = db.query(Holding).filter(Holding.member_id == member_id, Holding.symbol == symbol).first()
    if not holding or holding.current_qty < sell_qty:
        raise ValueError(f"Not enough quantity. Available: {holding.current_qty if holding else 0}")
    
    company = db.query(Company).filter(Company.symbol == symbol).first()
    instrument = company.instrument if company else "equity"

    wacc = holding.tax_wacc if holding.tax_wacc > 0 else holding.wacc

    # To calculate CGT with FIFO, we need all transactions
    txns = db.query(Transaction).filter(
        Transaction.member_id == member_id,
        Transaction.symbol == symbol
    ).order_by(Transaction.txn_date.asc(), Transaction.id.asc()).all()

    # Rebuild FIFO queue
    fifo_queue = [] # list of dicts: {"qty": float, "date": date}
    
    BUY_TYPES = {
        TransactionType.BUY.value, TransactionType.IPO.value,
        TransactionType.FPO.value, TransactionType.RIGHT.value,
        TransactionType.RIGHTS_SUBSCRIPTION.value,
        TransactionType.AUCTION.value, TransactionType.TRANSFER_IN.value,
        TransactionType.BONUS.value
    }
    SELL_TYPES = {
        TransactionType.SELL.value, TransactionType.TRANSFER_OUT.value
    }

    for t in txns:
        # Ignore future transactions if any
        if t.txn_date and t.txn_date > txn_date:
            continue

        if t.txn_type in BUY_TYPES:
            fifo_queue.append({"qty": t.quantity, "date": t.txn_date or date.today()})
        elif t.txn_type in SELL_TYPES:
            sq = t.quantity
            # consume from fifo_queue
            idx = 0
            while sq > 0 and idx < len(fifo_queue):
                cq = fifo_queue[idx]["qty"]
                if cq <= sq:
                    sq -= cq
                    fifo_queue[idx]["qty"] = 0
                else:
                    fifo_queue[idx]["qty"] -= sq
                    sq = 0
                idx += 1
            # remove empty
            fifo_queue = [q for q in fifo_queue if q["qty"] > 0]

    # Now we have the remaining chunks
    # Consume sell_qty
    remaining_sell = sell_qty
    chunks_sold = []
    
    idx = 0
    while remaining_sell > 0 and idx < len(fifo_queue):
        cq = fifo_queue[idx]["qty"]
        c_date = fifo_queue[idx]["date"]
        
        if cq <= remaining_sell:
            chunks_sold.append({"qty": cq, "date": c_date})
            remaining_sell -= cq
            fifo_queue[idx]["qty"] = 0
        else:
            chunks_sold.append({"qty": remaining_sell, "date": c_date})
            fifo_queue[idx]["qty"] -= remaining_sell
            remaining_sell = 0
        idx += 1

    # In case there are some weird mismatch, remaining_sell might be > 0.
    # We assign them a date of today to be safe (short term).
    if remaining_sell > 0:
        chunks_sold.append({"qty": remaining_sell, "date": txn_date})

    # Now calculate fees to get net_profit
    # Then split net_profit proportionally by chunks_sold
    from app.services.fee_calculator import calculate_broker_commission, calculate_sebon_fee, calculate_dp_charge, calculate_cgt
    
    broker = calculate_broker_commission(db, sell_amount, txn_date)
    sebon = calculate_sebon_fee(db, sell_amount, instrument, txn_date)
    dp = calculate_dp_charge(db, txn_date)

    total_buy_cost = wacc * sell_qty
    gross_profit = sell_amount - total_buy_cost
    net_profit = gross_profit - broker - sebon - dp
    
    cgt_total = 0.0
    cgt_threshold = int(float(get_fee_value(db, "cgt_threshold_days", txn_date)))
    cgt_short_rate = float(get_fee_value(db, "cgt_short_term_rate", txn_date)) / 100.0
    cgt_long_rate = float(get_fee_value(db, "cgt_long_term_rate", txn_date)) / 100.0

    cgt_breakdown = []

    if net_profit > 0:
        for ch in chunks_sold:
            profit_share = net_profit * (ch["qty"] / sell_qty)
            holding_days = (txn_date - ch["date"]).days
            
            rate_used = cgt_long_rate if holding_days >= cgt_threshold else cgt_short_rate
            cgt_amt = profit_share * rate_used
            cgt_total += cgt_amt
            
            cgt_breakdown.append({
                "qty": ch["qty"],
                "buy_date": ch["date"].isoformat(),
                "holding_days": holding_days,
                "profit_share": round(profit_share, 3),
                "cgt_rate": round(rate_used * 100, 2),
                "cgt_amount": round(cgt_amt, 3)
            })

    total_deductions = broker + sebon + dp + cgt_total
    net_received = sell_amount - total_deductions

    return {
        "amount": round(sell_amount, 3),
        "sell_qty": sell_qty,
        "sell_rate": sell_rate,
        "wacc": round(wacc, 3),
        "total_buy_cost": round(total_buy_cost, 3),
        "gross_profit": round(gross_profit, 3),
        "net_profit": round(net_profit, 3),
        "broker_commission": broker,
        "sebon_fee": sebon,
        "dp_charge": dp,
        "total_deductions": round(total_deductions, 3),
        "cgt": round(cgt_total, 3),
        "cgt_breakdown": cgt_breakdown,
        "net_received": round(net_received, 3)
    }


def calculate_hypothetical_sell(
    db: Session,
    symbol: str,
    sell_qty: float,
    sell_rate: float,
    cost_basis_per_share: float,
    instrument: str = "equity",
    txn_date: date | None = None,
):
    """Sell simulation that does not depend on an existing holding."""
    if not txn_date:
        txn_date = date.today()

    sell_amount = sell_qty * sell_rate
    total_buy_cost = cost_basis_per_share * sell_qty

    broker = calculate_broker_commission(db, sell_amount, txn_date)
    sebon = calculate_sebon_fee(db, sell_amount, instrument, txn_date)
    dp = calculate_dp_charge(db, txn_date)

    gross_profit = sell_amount - total_buy_cost
    net_profit_before_cgt = gross_profit - broker - sebon - dp

    cgt_total = 0.0
    if net_profit_before_cgt > 0:
        short_rate = float(get_fee_value(db, "cgt_short_term_rate", txn_date)) / 100.0
        cgt_total = net_profit_before_cgt * short_rate

    total_deductions = broker + sebon + dp + cgt_total
    net_received = sell_amount - total_deductions

    return {
        "amount": round(sell_amount, 3),
        "sell_qty": sell_qty,
        "sell_rate": sell_rate,
        "wacc": round(cost_basis_per_share, 3),
        "total_buy_cost": round(total_buy_cost, 3),
        "gross_profit": round(gross_profit, 3),
        "net_profit": round(net_profit_before_cgt - cgt_total, 3),
        "broker_commission": round(broker, 3),
        "sebon_fee": round(sebon, 3),
        "dp_charge": round(dp, 3),
        "cgt": round(cgt_total, 3),
        "total_deductions": round(total_deductions, 3),
        "net_received": round(net_received, 3),
    }


def calculate_trade_plan(
    db: Session,
    symbol: str,
    capital_base: float,
    sleeve_pct: float,
    risk_pct: float,
    entry_rate: float,
    stop_loss: float,
    target_price: float | None,
    instrument: str = "equity",
    txn_date: date | None = None,
):
    """Fee-aware swing-trade sizing without relying on an existing holding."""
    if not txn_date:
        txn_date = date.today()

    sleeve_capital = capital_base * (sleeve_pct / 100.0)
    max_risk_amount = capital_base * (risk_pct / 100.0)
    risk_per_share = entry_rate - stop_loss
    if risk_per_share <= 0:
        raise ValueError("Stop loss must be below entry price for a long trade")

    estimated_qty = int(max_risk_amount // risk_per_share)
    if estimated_qty <= 0:
        raise ValueError("Risk settings are too tight to buy even one share")

    buy_cost_one = calculate_buy_costs(db, entry_rate, instrument, txn_date)["total_cost"]
    max_by_capital = int(sleeve_capital // buy_cost_one) if buy_cost_one > 0 else 0
    qty = min(estimated_qty, max_by_capital)
    if qty <= 0:
        raise ValueError("Trade exceeds the allowed 20% trading sleeve")

    while qty > 0:
        gross_cost = qty * entry_rate
        buy_result = calculate_buy_costs(db, gross_cost, instrument, txn_date)
        total_buy_cost = buy_result["total_cost"]
        if total_buy_cost > sleeve_capital:
            qty -= 1
            continue

        effective_wacc = total_buy_cost / qty
        stop_result = calculate_hypothetical_sell(
            db=db,
            symbol=symbol,
            sell_qty=qty,
            sell_rate=stop_loss,
            cost_basis_per_share=effective_wacc,
            instrument=instrument,
            txn_date=txn_date,
        )
        net_risk = total_buy_cost - stop_result["net_received"]
        if net_risk > max_risk_amount:
            qty -= 1
            continue

        target_result = None
        net_reward = None
        true_rr = None
        if target_price and target_price > entry_rate:
            target_result = calculate_hypothetical_sell(
                db=db,
                symbol=symbol,
                sell_qty=qty,
                sell_rate=target_price,
                cost_basis_per_share=effective_wacc,
                instrument=instrument,
                txn_date=txn_date,
            )
            net_reward = round(target_result["net_received"] - total_buy_cost, 3)
            true_rr = round(net_reward / net_risk, 3) if net_risk > 0 else None

        return {
            "symbol": symbol.upper(),
            "quantity": qty,
            "capital_base": round(capital_base, 3),
            "sleeve_pct": sleeve_pct,
            "sleeve_capital": round(sleeve_capital, 3),
            "risk_pct": risk_pct,
            "max_risk_amount": round(max_risk_amount, 3),
            "gross_cost": round(gross_cost, 3),
            "total_cost": round(total_buy_cost, 3),
            "effective_wacc": round(effective_wacc, 3),
            "net_risk": round(net_risk, 3),
            "net_reward": net_reward,
            "true_rr": true_rr,
            "entry_rate": entry_rate,
            "stop_loss": stop_loss,
            "target_price": target_price,
            "capital_within_sleeve": total_buy_cost <= sleeve_capital,
            "rr_meets_threshold": true_rr is None or true_rr >= 1.5,
            "buy_breakdown": buy_result,
            "stop_breakdown": stop_result,
            "target_breakdown": target_result,
        }

    raise ValueError("No position size satisfies both risk and capital constraints")
