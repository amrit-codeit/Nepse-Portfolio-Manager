"""API routes for fee configuration with versioning support."""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_
from app.database import get_db
from app.models.price import FeeConfig
from app.services.fee_calculator import clear_fee_cache
from pydantic import BaseModel
from datetime import date

router = APIRouter(prefix="/api/config", tags=["Configuration"])


class FeeConfigUpdate(BaseModel):
    value: str


class FeeConfigVersionCreate(BaseModel):
    """Create a new version of a fee config with an effective date."""
    key: str
    value: str
    effective_from: date
    description: str | None = None


@router.get("/fees")
def get_fee_configs(db: Session = Depends(get_db)):
    """
    Get all fee configuration parameters.
    Returns the CURRENT (latest) value for each key.
    """
    # Get all unique keys
    all_keys = [row[0] for row in db.query(FeeConfig.key).distinct().all()]

    result = []
    for key in sorted(all_keys):
        # Get the most recent config for this key
        config = (
            db.query(FeeConfig)
            .filter(FeeConfig.key == key)
            .order_by(FeeConfig.effective_from.desc().nullslast())
            .first()
        )
        if config:
            result.append({
                "id": config.id,
                "key": config.key,
                "value": config.value,
                "description": config.description,
                "effective_from": str(config.effective_from) if config.effective_from else None,
            })

    return result


@router.get("/fees/history/{key}")
def get_fee_config_history(key: str, db: Session = Depends(get_db)):
    """Get all versions (history) of a specific fee config key."""
    configs = (
        db.query(FeeConfig)
        .filter(FeeConfig.key == key)
        .order_by(FeeConfig.effective_from.desc().nullslast())
        .all()
    )
    return [
        {
            "id": c.id,
            "key": c.key,
            "value": c.value,
            "description": c.description,
            "effective_from": str(c.effective_from) if c.effective_from else None,
        }
        for c in configs
    ]


@router.put("/fees/{key}")
def update_fee_config(key: str, data: FeeConfigUpdate, db: Session = Depends(get_db)):
    """
    Update the current (latest) value of a fee config.
    This modifies the existing row — use POST /fees/version to add a new effective-date version.
    """
    config = (
        db.query(FeeConfig)
        .filter(FeeConfig.key == key)
        .order_by(FeeConfig.effective_from.desc().nullslast())
        .first()
    )
    if config:
        config.value = data.value
        db.commit()
        clear_fee_cache()
    return {"status": "ok"}


@router.post("/fees/version")
def add_fee_config_version(data: FeeConfigVersionCreate, db: Session = Depends(get_db)):
    """
    Add a new version of a fee config with an effective_from date.
    Old versions are preserved so historical transactions use the correct rates.

    Example: When SEBON changes broker commission from 0.36% to 0.34%,
    add a new version with effective_from = date the new rate starts.
    """
    new_config = FeeConfig(
        key=data.key,
        value=data.value,
        description=data.description,
        effective_from=data.effective_from,
    )
    db.add(new_config)
    db.commit()
    db.refresh(new_config)
    clear_fee_cache()

    return {
        "status": "ok",
        "message": f"New version of '{data.key}' effective from {data.effective_from}",
        "id": new_config.id,
    }
