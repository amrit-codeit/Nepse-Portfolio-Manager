"""Trading desk service helpers for validation, signals, and journaling."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.company import Company
from app.models.price import LivePrice
from app.models.trading import TradeJournal, TradeSetup, TradeStatus
from app.services.calculator_service import calculate_hypothetical_sell


STALE_PRICE_HOURS = 12
TIGHTEN_STOP_PROGRESS_PCT = 70.0


def normalize_setup_payload(payload: dict[str, Any], existing: TradeSetup | None = None) -> dict[str, Any]:
    """Normalize compatibility fields into the richer trade-plan shape."""
    data = dict(payload)

    if data.get("symbol"):
        data["symbol"] = str(data["symbol"]).upper()
    elif existing:
        data["symbol"] = existing.symbol

    entry_price = data.get("entry_price")
    entry_zone_low = data.get("entry_zone_low")
    entry_zone_high = data.get("entry_zone_high")
    target_price = data.get("target_price")
    target_1 = data.get("target_1")
    stop_loss = data.get("stop_loss")
    initial_stop = data.get("initial_stop_loss")
    current_stop = data.get("current_stop_loss")
    thesis = data.get("thesis")
    strategy_note = data.get("strategy_note")

    if entry_zone_low is None and entry_price is not None:
        data["entry_zone_low"] = entry_price
    if entry_zone_high is None and entry_price is not None:
        data["entry_zone_high"] = entry_price
    if data.get("entry_zone_low") is not None and data.get("entry_zone_high") is None:
        data["entry_zone_high"] = data["entry_zone_low"]
    if data.get("entry_zone_high") is not None and data.get("entry_zone_low") is None:
        data["entry_zone_low"] = data["entry_zone_high"]

    if data.get("entry_price") is None and data.get("entry_zone_low") is not None and data.get("entry_zone_high") is not None:
        data["entry_price"] = round((data["entry_zone_low"] + data["entry_zone_high"]) / 2, 3)

    if target_1 is None and target_price is not None:
        data["target_1"] = target_price
    if data.get("target_price") is None and data.get("target_1") is not None:
        data["target_price"] = data["target_1"]

    if initial_stop is None and stop_loss is not None:
        data["initial_stop_loss"] = stop_loss
    if current_stop is None and stop_loss is not None:
        data["current_stop_loss"] = stop_loss
    if data.get("stop_loss") is None and data.get("current_stop_loss") is not None:
        data["stop_loss"] = data["current_stop_loss"]

    if thesis is None and strategy_note:
        data["thesis"] = strategy_note
    if strategy_note is None and thesis:
        data["strategy_note"] = thesis

    effective_stop = data.get("current_stop_loss") or data.get("initial_stop_loss") or data.get("stop_loss")
    entry_ref = data.get("entry_price")
    qty = data.get("allocated_qty")
    if data.get("capital_allocated") is None and entry_ref is not None and qty:
        data["capital_allocated"] = round(entry_ref * qty, 3)
    if data.get("risk_amount") is None and entry_ref is not None and effective_stop is not None and qty:
        data["risk_amount"] = round(abs(entry_ref - effective_stop) * qty, 3)

    return data


def validate_setup_payload(data: dict[str, Any], existing: TradeSetup | None = None) -> None:
    """Validate long-only swing-trade invariants and status transitions."""
    status = str(data.get("status") or (existing.status.value if existing and hasattr(existing.status, "value") else existing.status if existing else TradeStatus.WATCHLIST.value))
    previous_status = str(existing.status.value if existing and hasattr(existing.status, "value") else existing.status) if existing else None

    allowed_transitions = {
        TradeStatus.WATCHLIST.value: {TradeStatus.WATCHLIST.value, TradeStatus.ACTIVE.value},
        TradeStatus.ACTIVE.value: {TradeStatus.ACTIVE.value, TradeStatus.CLOSED.value},
        TradeStatus.CLOSED.value: {TradeStatus.CLOSED.value},
    }
    if previous_status and status not in allowed_transitions.get(previous_status, {previous_status}):
        raise HTTPException(status_code=400, detail=f"Invalid status transition: {previous_status} -> {status}")

    positive_fields = [
        "entry_price", "entry_zone_low", "entry_zone_high", "target_price", "target_1",
        "target_2", "stop_loss", "initial_stop_loss", "current_stop_loss", "trailing_stop",
        "risk_percent", "capital_allocated", "risk_amount",
    ]
    for field in positive_fields:
        value = data.get(field)
        if value is not None and value <= 0:
            raise HTTPException(status_code=400, detail=f"{field} must be positive")

    qty = data.get("allocated_qty")
    if qty is not None and qty <= 0:
        raise HTTPException(status_code=400, detail="allocated_qty must be positive")

    low = data.get("entry_zone_low")
    high = data.get("entry_zone_high")
    if low is not None and high is not None and low > high:
        raise HTTPException(status_code=400, detail="entry_zone_low cannot be above entry_zone_high")

    entry_low = low or data.get("entry_price")
    entry_high = high or data.get("entry_price")
    stop = data.get("current_stop_loss") or data.get("initial_stop_loss") or data.get("stop_loss")
    target = data.get("target_1") or data.get("target_price")

    if stop is not None and entry_low is not None and stop >= entry_low:
        raise HTTPException(status_code=400, detail="Stop loss must be below the entry zone")
    if target is not None and entry_high is not None and target <= entry_high:
        raise HTTPException(status_code=400, detail="Target must be above the entry zone")

    has_position_sizing = bool(qty or data.get("risk_amount") or data.get("risk_percent"))
    required_for_discipline = [entry_low, entry_high, stop, target, data.get("thesis")]
    if (existing is None or status == TradeStatus.ACTIVE.value) and (not all(v is not None for v in required_for_discipline) or not has_position_sizing):
        raise HTTPException(
            status_code=400,
            detail="Disciplined trade plans require entry zone, stop loss, target, thesis, and quantity or risk settings.",
        )


def apply_setup_updates(setup: TradeSetup, data: dict[str, Any]) -> None:
    """Apply normalized updates and lifecycle timestamps to a setup."""
    previous_status = setup.status.value if hasattr(setup.status, "value") else str(setup.status)
    new_status = str(data.get("status") or previous_status)

    for field, value in data.items():
        if hasattr(setup, field):
            setattr(setup, field, value)

    now = datetime.now(timezone.utc)
    if previous_status == TradeStatus.WATCHLIST.value and new_status == TradeStatus.ACTIVE.value:
        setup.activated_at = now
        if not setup.entry_price and setup.entry_zone_low is not None and setup.entry_zone_high is not None:
            setup.entry_price = round((setup.entry_zone_low + setup.entry_zone_high) / 2, 3)
        if not setup.initial_stop_loss:
            setup.initial_stop_loss = setup.current_stop_loss or setup.stop_loss
        if not setup.current_stop_loss:
            setup.current_stop_loss = setup.initial_stop_loss or setup.stop_loss
        if not setup.target_1:
            setup.target_1 = setup.target_price
        if not setup.stop_loss:
            setup.stop_loss = setup.current_stop_loss or setup.initial_stop_loss
        if not setup.target_price:
            setup.target_price = setup.target_1
        if not setup.capital_allocated and setup.entry_price and setup.allocated_qty:
            setup.capital_allocated = round(setup.entry_price * setup.allocated_qty, 3)
        if not setup.risk_amount and setup.entry_price and (setup.current_stop_loss or setup.stop_loss) and setup.allocated_qty:
            effective_stop = setup.current_stop_loss or setup.stop_loss
            setup.risk_amount = round(abs(setup.entry_price - effective_stop) * setup.allocated_qty, 3)

    if new_status == TradeStatus.CLOSED.value and not setup.closed_at:
        setup.closed_at = now


def trade_setup_to_dict(setup: TradeSetup) -> dict[str, Any]:
    """Serialize setup with compatibility aliases intact."""
    status = setup.status.value if hasattr(setup.status, "value") else str(setup.status)
    target_1 = setup.target_1 if setup.target_1 is not None else setup.target_price
    current_stop = setup.current_stop_loss if setup.current_stop_loss is not None else setup.stop_loss
    initial_stop = setup.initial_stop_loss if setup.initial_stop_loss is not None else setup.stop_loss
    entry_low = setup.entry_zone_low if setup.entry_zone_low is not None else setup.entry_price
    entry_high = setup.entry_zone_high if setup.entry_zone_high is not None else setup.entry_price

    return {
        "id": setup.id,
        "symbol": setup.symbol,
        "status": status,
        "entry_price": setup.entry_price,
        "entry_zone_low": entry_low,
        "entry_zone_high": entry_high,
        "target_price": setup.target_price if setup.target_price is not None else target_1,
        "target_1": target_1,
        "target_2": setup.target_2,
        "stop_loss": setup.stop_loss if setup.stop_loss is not None else current_stop,
        "initial_stop_loss": initial_stop,
        "current_stop_loss": current_stop,
        "trailing_stop": setup.trailing_stop,
        "risk_percent": setup.risk_percent,
        "allocated_qty": setup.allocated_qty,
        "capital_allocated": setup.capital_allocated,
        "risk_amount": setup.risk_amount,
        "strategy_note": setup.strategy_note,
        "setup_quality": setup.setup_quality,
        "strategy_type": setup.strategy_type,
        "thesis": setup.thesis if setup.thesis is not None else setup.strategy_note,
        "member_id": setup.member_id,
        "created_at": setup.created_at,
        "updated_at": setup.updated_at,
        "invalidated_at": setup.invalidated_at,
        "activated_at": setup.activated_at,
        "closed_at": setup.closed_at,
    }


def get_trade_signals(db: Session) -> list[dict[str, Any]]:
    """Build deterministic active-position signals with diagnostics."""
    setups = db.query(TradeSetup).filter(TradeSetup.status == TradeStatus.ACTIVE).all()
    if not setups:
        return []

    symbols = sorted({s.symbol for s in setups})
    prices = db.query(LivePrice).filter(LivePrice.symbol.in_(symbols)).all()
    price_map = {p.symbol: p for p in prices}

    results: list[dict[str, Any]] = []
    now = datetime.now(timezone.utc)
    stale_cutoff_seconds = STALE_PRICE_HOURS * 3600

    for setup in setups:
        price_row = price_map.get(setup.symbol)
        ltp = float(price_row.ltp) if price_row and price_row.ltp is not None else None
        price_timestamp = price_row.updated_at if price_row else None
        stale_price = True
        if price_timestamp is not None:
            if price_timestamp.tzinfo is None:
                price_timestamp = price_timestamp.replace(tzinfo=timezone.utc)
            stale_price = (now - price_timestamp).total_seconds() > stale_cutoff_seconds

        entry = setup.entry_price or (round(((setup.entry_zone_low or 0) + (setup.entry_zone_high or 0)) / 2, 3) if setup.entry_zone_low and setup.entry_zone_high else None)
        stop = setup.trailing_stop or setup.current_stop_loss or setup.stop_loss or setup.initial_stop_loss
        target = setup.target_1 or setup.target_price
        qty = setup.allocated_qty or 0

        live_pnl = None
        live_pnl_pct = None
        live_rr = None
        target_progress_pct = None
        distance_to_stop_pct = None
        distance_to_target_pct = None
        capital_at_risk = None
        risk_amount = setup.risk_amount
        signal = "INVALID_DATA"
        signal_reason = "Missing live price data."

        if ltp is not None and entry:
            live_pnl = round((ltp - entry) * qty, 2)
            live_pnl_pct = round(((ltp - entry) / entry) * 100, 2)
        if ltp is not None and stop:
            distance_to_stop_pct = round(((ltp - stop) / ltp) * 100, 2)
            capital_at_risk = round(max(ltp - stop, 0) * qty, 2)
        if ltp is not None and target:
            distance_to_target_pct = round(((target - ltp) / ltp) * 100, 2)
        if ltp is not None and entry and target and stop and target > entry:
            target_progress_pct = round(((ltp - entry) / (target - entry)) * 100, 2)
            risk = ltp - stop
            reward = target - ltp
            if risk > 0:
                live_rr = round(reward / risk, 2)
        if risk_amount is None and entry and stop and qty:
            risk_amount = round(abs(entry - stop) * qty, 2)

        if ltp is not None and stale_price:
            signal_reason = "Price data is stale. Refresh live prices before acting."
        elif ltp is None:
            signal_reason = "Live price unavailable for this symbol."
        elif stop is not None and ltp <= stop:
            signal = "EXIT"
            signal_reason = "Price breached the active stop level."
        elif target is not None and ltp >= target:
            signal = "TAKE_PROFIT"
            signal_reason = "Target 1 has been reached."
        elif target_progress_pct is not None and target_progress_pct >= TIGHTEN_STOP_PROGRESS_PCT:
            signal = "TIGHTEN_STOP"
            signal_reason = "Trade has progressed more than 70% to target. Protect gains."
        else:
            signal = "HOLD"
            signal_reason = "Trade remains between stop and target with valid data."

        results.append({
            **trade_setup_to_dict(setup),
            "ltp": ltp,
            "price_timestamp": price_timestamp.isoformat() if price_timestamp else None,
            "stale_price": stale_price,
            "live_pnl": live_pnl,
            "live_pnl_pct": live_pnl_pct,
            "live_rr": live_rr,
            "signal": signal,
            "signal_reason": signal_reason,
            "target_progress_pct": target_progress_pct,
            "distance_to_stop_pct": distance_to_stop_pct,
            "distance_to_target_pct": distance_to_target_pct,
            "risk_amount": risk_amount,
            "capital_at_risk": capital_at_risk,
        })

    return results


def close_trade_setup(db: Session, setup_id: int, payload: dict[str, Any]) -> TradeJournal:
    """Close an active trade setup and create a review-ready journal entry."""
    setup = db.query(TradeSetup).filter(TradeSetup.id == setup_id).first()
    if not setup:
        raise HTTPException(status_code=404, detail="Trade setup not found")
    if setup.status != TradeStatus.ACTIVE:
        raise HTTPException(status_code=400, detail="Only ACTIVE setups can be closed")

    sell_dt = payload.get("sell_date") or datetime.now(timezone.utc)
    if sell_dt.tzinfo is None:
        sell_dt = sell_dt.replace(tzinfo=timezone.utc)

    price_row = db.query(LivePrice).filter(LivePrice.symbol == setup.symbol).first()
    sell_price = payload.get("sell_price")
    if sell_price is None and price_row and price_row.ltp is not None:
        sell_price = float(price_row.ltp)
    if sell_price is None:
        raise HTTPException(status_code=400, detail="Sell price is required when no live price is available")

    entry_price = setup.entry_price or setup.entry_zone_high or setup.entry_zone_low
    qty = setup.allocated_qty or 0
    if not entry_price or qty <= 0:
        raise HTTPException(status_code=400, detail="Setup is missing entry price or quantity")

    company = db.query(Company).filter(Company.symbol == setup.symbol).first()
    instrument = company.instrument if company else "equity"
    sell_result = calculate_hypothetical_sell(
        db=db,
        symbol=setup.symbol,
        sell_qty=qty,
        sell_rate=sell_price,
        cost_basis_per_share=entry_price,
        instrument=instrument,
        txn_date=sell_dt.date(),
    )

    planned_stop = setup.current_stop_loss or setup.stop_loss or setup.initial_stop_loss
    planned_target = setup.target_1 or setup.target_price
    risk_basis = setup.risk_amount
    if risk_basis is None and planned_stop is not None:
        risk_basis = abs(entry_price - planned_stop) * qty
    realized_rr = None
    if risk_basis and risk_basis > 0:
        realized_rr = round((sell_result["net_received"] - sell_result["total_buy_cost"]) / risk_basis, 3)

    start_dt = setup.activated_at or setup.created_at or sell_dt
    if start_dt.tzinfo is None:
        start_dt = start_dt.replace(tzinfo=timezone.utc)
    hold_days = max((sell_dt.date() - start_dt.date()).days, 0)

    journal = TradeJournal(
        setup_id=setup.id,
        symbol=setup.symbol,
        buy_date=start_dt,
        sell_date=sell_dt,
        buy_price=entry_price,
        sell_price=sell_price,
        quantity=qty,
        realized_pnl=round(sell_result["net_received"] - sell_result["total_buy_cost"], 2),
        realized_rr=realized_rr,
        fees_paid=round(sell_result["total_deductions"], 2),
        planned_entry=entry_price,
        planned_stop=planned_stop,
        planned_target=planned_target,
        exit_reason=payload.get("exit_reason") or "Manual Close",
        setup_grade=payload.get("setup_grade") or setup.setup_quality,
        rule_followed=payload.get("rule_followed"),
        mistake_tag=payload.get("mistake_tag"),
        lesson_learned=payload.get("lesson_learned"),
        hold_days=hold_days,
        post_trade_note=payload.get("post_trade_note"),
    )
    db.add(journal)

    setup.status = TradeStatus.CLOSED
    setup.closed_at = sell_dt

    db.commit()
    db.refresh(journal)
    return journal


def get_trade_journal_stats(db: Session) -> dict[str, Any]:
    """Calculate review-oriented trading metrics."""
    entries = db.query(TradeJournal).filter(TradeJournal.sell_price.isnot(None)).all()
    if not entries:
        return {
            "total_trades": 0,
            "win_rate": 0,
            "avg_rr": 0,
            "expectancy": 0,
            "avg_win": 0,
            "avg_loss": 0,
            "profit_factor": 0,
            "total_pnl": 0,
            "best_trade": 0,
            "worst_trade": 0,
            "average_hold_days": 0,
            "rule_violation_count": 0,
        }

    total = len(entries)
    pnls = [e.realized_pnl or 0 for e in entries]
    winners = [p for p in pnls if p > 0]
    losers = [p for p in pnls if p < 0]
    rr_values = [e.realized_rr for e in entries if e.realized_rr is not None]
    hold_days = [e.hold_days for e in entries if e.hold_days is not None]
    violation_count = len([e for e in entries if e.rule_followed is False])

    gross_wins = sum(winners)
    gross_losses = abs(sum(losers))
    avg_win = gross_wins / len(winners) if winners else 0
    avg_loss = abs(sum(losers) / len(losers)) if losers else 0
    win_rate = (len(winners) / total) * 100 if total else 0
    expectancy = (win_rate / 100 * avg_win) - ((1 - win_rate / 100) * avg_loss)

    return {
        "total_trades": total,
        "win_rate": round(win_rate, 2),
        "avg_rr": round(sum(rr_values) / len(rr_values), 2) if rr_values else 0,
        "expectancy": round(expectancy, 2),
        "avg_win": round(avg_win, 2),
        "avg_loss": round(avg_loss, 2),
        "profit_factor": round(gross_wins / gross_losses, 2) if gross_losses > 0 else round(gross_wins, 2),
        "total_pnl": round(sum(pnls), 2),
        "best_trade": round(max(pnls), 2),
        "worst_trade": round(min(pnls), 2),
        "average_hold_days": round(sum(hold_days) / len(hold_days), 2) if hold_days else 0,
        "rule_violation_count": violation_count,
    }
