"""API routes for the Trading Desk feature: setups, signals, and journal."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.members import require_master_password
from app.database import get_db
from app.models.trading import TradeJournal, TradeSetup
from app.schemas.trading import (
    TradeCloseRequest,
    TradeJournalCreate,
    TradeJournalResponse,
    TradeSetupCreate,
    TradeSetupResponse,
    TradeSetupUpdate,
)
from app.services.trading_desk import (
    apply_setup_updates,
    close_trade_setup,
    get_trade_journal_stats,
    get_trade_signals,
    normalize_setup_payload,
    trade_setup_to_dict,
    validate_setup_payload,
)


router = APIRouter(prefix="/api/trading", tags=["Trading Desk"])


@router.get("/setups", response_model=list[TradeSetupResponse])
def list_setups(status: str | None = None, db: Session = Depends(get_db)):
    """List trade setups, optionally filtered by status."""
    query = db.query(TradeSetup)
    if status:
        query = query.filter(TradeSetup.status == status.upper())
    setups = query.order_by(TradeSetup.created_at.desc()).all()
    return [trade_setup_to_dict(setup) for setup in setups]


@router.post("/setups", response_model=TradeSetupResponse)
def create_setup(setup: TradeSetupCreate, db: Session = Depends(get_db)):
    """Create a disciplined trade setup with compatibility normalization."""
    payload = normalize_setup_payload(setup.model_dump(exclude_unset=True))
    validate_setup_payload(payload)

    new_setup = TradeSetup()
    apply_setup_updates(new_setup, payload)
    db.add(new_setup)
    db.commit()
    db.refresh(new_setup)
    return trade_setup_to_dict(new_setup)


@router.put("/setups/{setup_id}", response_model=TradeSetupResponse)
def update_setup(setup_id: int, updates: TradeSetupUpdate, db: Session = Depends(get_db)):
    """Update an existing trade setup with lifecycle-aware validation."""
    setup = db.query(TradeSetup).filter(TradeSetup.id == setup_id).first()
    if not setup:
        raise HTTPException(status_code=404, detail="Trade setup not found")

    payload = normalize_setup_payload(updates.model_dump(exclude_unset=True), existing=setup)
    validate_setup_payload(payload, existing=setup)
    apply_setup_updates(setup, payload)

    db.commit()
    db.refresh(setup)
    return trade_setup_to_dict(setup)


@router.post("/setups/{setup_id}/close", response_model=TradeJournalResponse)
def close_setup(setup_id: int, close_req: TradeCloseRequest, db: Session = Depends(get_db)):
    """Close an active trade setup and write a structured journal entry."""
    return close_trade_setup(db, setup_id, close_req.model_dump(exclude_unset=True))


@router.delete("/setups/{setup_id}")
def delete_setup(
    setup_id: int,
    db: Session = Depends(get_db),
    _auth=Depends(require_master_password),
):
    """Delete a trade setup."""
    setup = db.query(TradeSetup).filter(TradeSetup.id == setup_id).first()
    if not setup:
        raise HTTPException(status_code=404, detail="Trade setup not found")
    db.delete(setup)
    db.commit()
    return {"status": "deleted", "id": setup_id}


@router.get("/setups/signals")
def list_live_signals(db: Session = Depends(get_db)):
    """Return active-position diagnostics and deterministic trade signals."""
    return get_trade_signals(db)


@router.get("/journal", response_model=list[TradeJournalResponse])
def list_journal(db: Session = Depends(get_db)):
    """List trade journal entries ordered by most recent review."""
    return db.query(TradeJournal).order_by(TradeJournal.created_at.desc()).all()


@router.post("/journal", response_model=TradeJournalResponse)
def create_journal_entry(entry: TradeJournalCreate, db: Session = Depends(get_db)):
    """Manually create a structured trade journal entry."""
    payload = entry.model_dump(exclude_unset=True)
    payload["symbol"] = payload["symbol"].upper()
    journal = TradeJournal(**payload)
    db.add(journal)
    db.commit()
    db.refresh(journal)
    return journal


@router.get("/journal/stats")
def get_journal_stats(db: Session = Depends(get_db)):
    """Return review-oriented trading metrics for the journal."""
    return get_trade_journal_stats(db)
