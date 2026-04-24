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
from app.scrapers.fundamental_scraper import scrape_fundamentals
from app.scrapers.index_scraper import scrape_nepse_index, scrape_sector_indices, scrape_all_indices
from app.models.holding import Holding
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


@router.post("/index")
def trigger_index_sync(db: Session = Depends(get_db)):
    """Trigger an immediate fetch of NEPSE Index data."""
    try:
        result = scrape_nepse_index(db)
        return {"status": "success", "message": f"NEPSE Index synced with {result} records", "data": result}
    except Exception as e:
        traceback.print_exc()
        return {"status": "failed", "error": repr(e)}


@router.post("/sector-indices")
def trigger_sector_index_sync(db: Session = Depends(get_db)):
    """Scrape ALL sector sub-index historical data from ShareSansar."""
    try:
        result = scrape_sector_indices(db)
        return {"status": "success", "message": f"Sector indices synced with {result} records", "data": result}
    except Exception as e:
        traceback.print_exc()
        return {"status": "failed", "error": repr(e)}


@router.post("/all-indices")
def trigger_all_index_sync(db: Session = Depends(get_db)):
    """Scrape NEPSE Index + ALL sector sub-indices."""
    try:
        result = scrape_all_indices(db)
        return {"status": "success", "message": f"All indices synced with {result} records", "data": result}
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


@router.post("/fundamentals/{symbol}")
async def trigger_fundamental_sync(symbol: str, db: Session = Depends(get_db)):
    """Scrape fundamental data for a specific symbol."""
    try:
        await scrape_fundamentals(symbol, db)
        return {
            "status": "success",
            "message": f"Fundamental sync completed for {symbol.upper()}.",
        }
    except Exception as e:
        traceback.print_exc()
        return {"status": "failed", "error": str(e)}


@router.post("/insights/{symbol}")
async def trigger_insights_sync(symbol: str, db: Session = Depends(get_db)):
    """Trigger fundamental, history, and dividend sync exclusively for a specific symbol."""
    try:
        symbol = symbol.upper()
        # 1. Scrape Fundamentals
        await scrape_fundamentals(symbol, db)
        
        # 2. Scrape History (OHLCV prices needed for technicals)
        scrape_historical_prices(db, target_symbol=symbol)
        
        # 3. Scrape Dividends
        scrape_and_calculate_dividends(db, target_symbol=symbol)
        
        # 4. Scrape Live Prices (To get latest LTP for calculations)
        scrape_live_prices(db)
        
        return {"status": "success", "message": f"Successfully updated insights data for {symbol}"}
    except Exception as e:
        traceback.print_exc()
        return {"status": "failed", "error": str(e)}


@router.post("/technicals/{symbol}")
def trigger_technical_scrape(symbol: str, db: Session = Depends(get_db)):
    """Scrape ONLY technical-relevant data (History + Live Prices)."""
    try:
        symbol = symbol.upper()
        # 1. Scrape History (OHLCV prices needed for technicals)
        scrape_historical_prices(db, target_symbol=symbol)
        # 2. Scrape Live Prices
        scrape_live_prices(db)
        return {"status": "success", "message": f"Technical data refreshed for {symbol}"}
    except Exception as e:
        traceback.print_exc()
        return {"status": "failed", "error": str(e)}


@router.post("/fundamentals")
async def trigger_total_fundamental_sync(db: Session = Depends(get_db)):
    """Scrape fundamental data for ALL symbols in the portfolio holdings."""
    try:
        portfolio_symbols = db.query(Holding.symbol).filter(Holding.current_qty > 0).distinct().all()
        symbols = [s[0] for s in portfolio_symbols if s[0]]
        
        if not symbols:
            return {"status": "success", "message": "No active holdings found to scrape."}

        # We trigger this as a background task if we had one, 
        # but for simplicity in this dev environment we'll just loop.
        # Use await since they are async
        for symbol in symbols:
            try:
                await scrape_fundamentals(symbol, db)
            except Exception as e:
                print(f"Error scraping {symbol}: {e}")
        
        return {
            "status": "success",
            "message": f"Bulk fundamental sync completed for {len(symbols)} symbols.",
        }
    except Exception as e:
        traceback.print_exc()
        return {"status": "failed", "error": str(e)}
