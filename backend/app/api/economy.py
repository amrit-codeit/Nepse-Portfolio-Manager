"""API routes for Economy & Alternatives data."""

import datetime
from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db, SessionLocal
from app.services.economy_service import (
    get_latest_macro_snapshot,
    get_alternatives_comparison,
)

router = APIRouter(prefix="/api/economy", tags=["Economy"])


@router.get("/macro")
def macro_snapshot(db: Session = Depends(get_db)):
    """Get the latest macroeconomic indicator snapshot with regime and sector signals."""
    result = get_latest_macro_snapshot(db)
    if not result.get("available"):
        raise HTTPException(status_code=404, detail=result.get("message", "No macro data available."))
    return result


@router.post("/macro/scrape")
def trigger_macro_scrape():
    """Manually trigger the NepseAlpha macro data scraper."""
    from app.scrapers.nepsealpha_macro_scraper import scrape_nepsealpha_macro
    try:
        scrape_nepsealpha_macro()
        return {"status": "success", "message": "Macro data scraped successfully."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Scrape failed: {str(e)}")


@router.get("/alternatives")
def alternatives_comparison(
    principal: float = Query(..., ge=1000, le=50_000_000, description="Principal amount in NPR"),
    start_date: str = Query(..., description="Start date in YYYY-MM-DD format"),
    db: Session = Depends(get_db),
):
    """Compare investment alternatives: NEPSE, FD, Gold, Silver."""
    try:
        parsed_date = datetime.date.fromisoformat(start_date)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD.")

    min_date = datetime.date(2020, 1, 1)
    if parsed_date < min_date:
        raise HTTPException(status_code=400, detail="Start date must be on or after 2020-01-01.")

    if parsed_date >= datetime.date.today():
        raise HTTPException(status_code=400, detail="Start date must be in the past.")

    results = get_alternatives_comparison(db, principal, parsed_date)
    return {
        "principal": principal,
        "start_date": start_date,
        "results": results,
    }
