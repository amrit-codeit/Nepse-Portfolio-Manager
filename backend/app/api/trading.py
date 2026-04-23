"""API routes for the Trading Desk feature — Trade Setups, Signals, and Journal."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Optional
from app.database import get_db
from app.models.trading import TradeSetup, TradeJournal, TradeStatus
from app.models.price import LivePrice
from app.schemas.trading import (
    TradeSetupCreate, TradeSetupUpdate, TradeSetupResponse,
    TradeJournalCreate, TradeJournalResponse,
)

router = APIRouter(prefix="/api/trading", tags=["Trading Desk"])


# ── Trade Setups CRUD ──

@router.get("/setups", response_model=list[TradeSetupResponse])
def list_setups(status: Optional[str] = None, db: Session = Depends(get_db)):
    """List trade setups, optionally filtered by status (WATCHLIST, ACTIVE, CLOSED)."""
    q = db.query(TradeSetup)
    if status:
        q = q.filter(TradeSetup.status == status)
    return q.order_by(TradeSetup.created_at.desc()).all()


@router.post("/setups", response_model=TradeSetupResponse)
def create_setup(setup: TradeSetupCreate, db: Session = Depends(get_db)):
    """Create a new trade setup (watchlist or active position)."""
    new_setup = TradeSetup(
        symbol=setup.symbol.upper(),
        status=setup.status,
        entry_price=setup.entry_price,
        target_price=setup.target_price,
        stop_loss=setup.stop_loss,
        trailing_stop=setup.trailing_stop,
        risk_percent=setup.risk_percent,
        allocated_qty=setup.allocated_qty,
        strategy_note=setup.strategy_note,
        member_id=setup.member_id,
    )
    db.add(new_setup)
    db.commit()
    db.refresh(new_setup)
    return new_setup


@router.put("/setups/{setup_id}", response_model=TradeSetupResponse)
def update_setup(setup_id: int, updates: TradeSetupUpdate, db: Session = Depends(get_db)):
    """Update an existing trade setup (adjust SL, target, status, etc.)."""
    setup = db.query(TradeSetup).filter(TradeSetup.id == setup_id).first()
    if not setup:
        raise HTTPException(status_code=404, detail="Trade setup not found")

    for field, value in updates.model_dump(exclude_unset=True).items():
        setattr(setup, field, value)

    db.commit()
    db.refresh(setup)
    return setup


@router.delete("/setups/{setup_id}")
def delete_setup(setup_id: int, db: Session = Depends(get_db)):
    """Delete a trade setup."""
    setup = db.query(TradeSetup).filter(TradeSetup.id == setup_id).first()
    if not setup:
        raise HTTPException(status_code=404, detail="Trade setup not found")
    db.delete(setup)
    db.commit()
    return {"status": "deleted", "id": setup_id}


# ── Live Signals ──

@router.get("/setups/signals")
def get_live_signals(db: Session = Depends(get_db)):
    """
    For all ACTIVE setups, fetch live LTP and compute:
    - live_pnl: (LTP - entry) * qty
    - live_rr: (target - LTP) / (LTP - stop_loss)
    - signal: HOLD | TIGHTEN_STOP | EXIT
    """
    setups = db.query(TradeSetup).filter(TradeSetup.status == TradeStatus.ACTIVE).all()

    # Batch fetch live prices
    symbols = list(set(s.symbol for s in setups))
    prices = db.query(LivePrice).filter(LivePrice.symbol.in_(symbols)).all()
    price_map = {p.symbol: float(p.ltp) if p.ltp else None for p in prices}

    results = []
    for s in setups:
        ltp = price_map.get(s.symbol)
        entry = s.entry_price or 0
        target = s.target_price
        sl = s.stop_loss
        qty = s.allocated_qty or 0

        live_pnl = (ltp - entry) * qty if ltp and entry else None
        live_rr = None
        signal = "HOLD"

        if ltp and target and sl:
            risk = ltp - sl
            reward = target - ltp
            if risk > 0:
                live_rr = round(reward / risk, 2)

            # Signal logic
            if ltp <= sl:
                signal = "EXIT"
            elif ltp >= target:
                signal = "TAKE_PROFIT"
            elif target and ltp > entry and (ltp - entry) / (target - entry) > 0.7:
                signal = "TIGHTEN_STOP"
        elif ltp and sl and ltp <= sl:
            signal = "EXIT"

        results.append({
            "id": s.id,
            "symbol": s.symbol,
            "entry_price": entry,
            "target_price": target,
            "stop_loss": sl,
            "trailing_stop": s.trailing_stop,
            "allocated_qty": qty,
            "strategy_note": s.strategy_note,
            "member_id": s.member_id,
            "ltp": ltp,
            "live_pnl": round(live_pnl, 2) if live_pnl is not None else None,
            "live_rr": live_rr,
            "signal": signal,
            "created_at": s.created_at,
        })

    return results


# ── Trade Journal ──

@router.get("/journal", response_model=list[TradeJournalResponse])
def list_journal(db: Session = Depends(get_db)):
    """List trade journal entries (closed trades)."""
    return db.query(TradeJournal).order_by(TradeJournal.created_at.desc()).all()


@router.post("/journal", response_model=TradeJournalResponse)
def create_journal_entry(entry: TradeJournalCreate, db: Session = Depends(get_db)):
    """Log a closed trade to the journal."""
    new_entry = TradeJournal(
        setup_id=entry.setup_id,
        symbol=entry.symbol.upper(),
        buy_date=entry.buy_date,
        sell_date=entry.sell_date,
        buy_price=entry.buy_price,
        sell_price=entry.sell_price,
        quantity=entry.quantity,
        realized_pnl=entry.realized_pnl,
        realized_rr=entry.realized_rr,
        fees_paid=entry.fees_paid,
        post_trade_note=entry.post_trade_note,
    )
    db.add(new_entry)
    db.commit()
    db.refresh(new_entry)
    return new_entry


@router.get("/journal/stats")
def get_journal_stats(db: Session = Depends(get_db)):
    """Summary stats for the trade journal — win rate, profit factor, avg R:R."""
    entries = db.query(TradeJournal).filter(TradeJournal.sell_price.isnot(None)).all()
    if not entries:
        return {"total_trades": 0, "win_rate": 0, "avg_rr": 0, "profit_factor": 0, "total_pnl": 0}

    total = len(entries)
    winners = [e for e in entries if e.realized_pnl and e.realized_pnl > 0]
    losers = [e for e in entries if e.realized_pnl and e.realized_pnl <= 0]

    gross_wins = sum(e.realized_pnl for e in winners) if winners else 0
    gross_losses = abs(sum(e.realized_pnl for e in losers)) if losers else 0

    return {
        "total_trades": total,
        "win_rate": round((len(winners) / total) * 100, 2) if total else 0,
        "avg_rr": round(sum(e.realized_rr for e in entries if e.realized_rr) / total, 2) if total else 0,
        "profit_factor": round(gross_wins / gross_losses, 2) if gross_losses > 0 else float("inf"),
        "total_pnl": round(sum(e.realized_pnl or 0 for e in entries), 2),
    }
