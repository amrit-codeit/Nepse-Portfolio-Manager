"""API routes to trigger background scraping tasks manually."""

from pydantic import BaseModel
from typing import Optional, List
from fastapi import APIRouter, Depends, BackgroundTasks
from sqlalchemy.orm import Session
from app.database import get_db
from app.scrapers.company_scraper import scrape_nepse_companies
from app.scrapers.nav_scraper import scrape_nav
from app.scrapers.price_scraper import scrape_live_prices
from app.scrapers.meroshare import sync_all_meroshare
from app.scrapers.issue_autoscraper import fetch_and_update as sync_issue_prices
from app.scrapers.history_scraper import scrape_historical_prices
from app.scrapers.dividend_scraper import scrape_and_calculate_dividends
import traceback

router = APIRouter(prefix="/api/scraper", tags=["Scraping"])


@router.post("/issues")
def trigger_issue_sync(db: Session = Depends(get_db)):
    """Trigger an immediate fetch of latest IPO/FPO/Right share prices."""
    try:
        result = sync_issue_prices(db)
        return {"status": "success", "message": "Issue prices synced", "data": result}
    except Exception as e:
        traceback.print_exc()
        return {"status": "failed", "error": repr(e)}


@router.post("/companies")
def trigger_company_scrape(db: Session = Depends(get_db)):
    """Trigger an immediate scrape of the NEPSE company list."""
    try:
        # FastAPI runs sync dependencies in a separate thread, so this is fine
        result = scrape_nepse_companies(db)
        return {"status": "success", "message": "Companies scraped successfully", "data": result}
    except Exception as e:
        traceback.print_exc()
        return {"status": "failed", "error": repr(e)}


@router.post("/nav")
def trigger_nav_scrape(db: Session = Depends(get_db)):
    """Trigger an immediate scrape of mutual fund NAVs."""
    try:
        result = scrape_nav(db)
        return {"status": "success", "message": "NAVs scraped successfully", "data": result}
    except Exception as e:
        traceback.print_exc()
        return {"status": "failed", "error": repr(e)}


@router.post("/prices")
def trigger_price_scrape(db: Session = Depends(get_db)):
    """Trigger an immediate scrape of live share prices."""
    try:
        result = scrape_live_prices(db)
        return {"status": "success", "message": "Prices refreshed successfully", "data": result}
    except Exception as e:
        traceback.print_exc()
        return {"status": "failed", "error": repr(e)}


class SyncRequest(BaseModel):
    member_ids: Optional[List[int]] = None


@router.post("/meroshare/sync")
def trigger_meroshare_sync(data: SyncRequest = None, db: Session = Depends(get_db)):
    """
    Trigger MeroShare sync for all members or specific members.
    """
    member_ids = data.member_ids if data else None
    try:
        # 1. Sync latest issue prices first so the parser has the right data
        print("Pre-syncing IPO/FPO/Right prices...")
        sync_issue_prices(db)

        # 2. Sync MeroShare history
        results = sync_all_meroshare(db, member_ids)

        failures = [r for r in results if r.get("status") == "failed"]
        if failures and len(failures) == len(results):
            status = "failed"
        elif failures:
            status = "partial_success"
        else:
            status = "success"

        return {
            "status": status,
            "message": f"Sync completed for {len(results)} members",
            "results": results
        }
    except Exception as e:
        traceback.print_exc()
        return {"status": "failed", "error": repr(e)}


@router.post("/history")
def trigger_history_sync(db: Session = Depends(get_db)):
    """Trigger background sync for historical OHLCV data."""
    try:
        # Since this takes a very long time (> 3 seconds per symbol),
        # we'll return immediately and run in backgroundTasks if we had them.
        # For now, let's just trigger it as a task.
        result = scrape_historical_prices(db)
        return {
            "status": "success", 
            "message": f"Historical data sync completed. Processed {result} records."
        }
    except Exception as e:
        traceback.print_exc()
        return {"status": "failed", "error": str(e)}


@router.post("/dividends")
def trigger_dividend_sync(db: Session = Depends(get_db)):
    """Scrape cash dividend data and calculate eligibility for all portfolio symbols."""
    try:
        result = scrape_and_calculate_dividends(db)
        return {
            "status": "success",
            "message": f"Dividend sync completed. {result['records_saved']} records saved, {result['eligible_records']} with eligibility.",
            "data": result,
        }
    except Exception as e:
        traceback.print_exc()
        return {"status": "failed", "error": str(e)}
