"""
Live Price Scraper for Commodities (Gold & Silver).
Fetches current and historical prices from nepsealpha.com via secure session.
Updates the local database with new prices.
"""

import time
from datetime import datetime, timezone
from typing import List, Dict, Optional
from curl_cffi import requests
from sqlalchemy.orm import Session
from sqlalchemy.dialects.sqlite import insert

from app.models.price import CommodityPrice

# ----------------------------------------------------------------------
# Configuration
# ----------------------------------------------------------------------
METALS = ["gold", "silver"]

# Headers mimicking a real browser
HEADERS = {
    "accept": "application/json, text/plain, */*",
    "referer": "https://nepsealpha.com/gold-price",
    "x-requested-with": "XMLHttpRequest",
}

# ----------------------------------------------------------------------
# Helper functions
# ----------------------------------------------------------------------
def generate_fsk() -> str:
    """Generate a cache-busting timestamp in milliseconds (13 digits)."""
    return str(int(time.time() * 1000))

def generate_fs() -> str:
    """Generate the 'fs' parameter: current date in YYYYMMDD followed by 'am' or 'pm'."""
    now = datetime.now()
    date_str = now.strftime("%Y%m%d")
    am_pm = "am" if now.hour < 12 else "pm"
    return f"{date_str}{am_pm}"

def fetch_prices(metal: str) -> Optional[List[Dict]]:
    """
    Fetch historical prices for a given metal (gold or silver).
    Returns a list of dicts with 'date' and 'price', or None on failure.
    """
    url = f"https://nepsealpha.com/ajax/{metal}-price"
    params = {
        "fsk": generate_fsk(),
        "range": "5y",
        "fs": generate_fs(),
    }

    try:
        print(f"Fetching {metal} prices from {url} ...")
        # Use curl_cffi to impersonate a real browser (chrome)
        resp = requests.get(url, headers=HEADERS, params=params, timeout=30, impersonate="chrome")
        resp.raise_for_status()

        data = resp.json()
        if not isinstance(data, list):
            print(f"Unexpected response format for {metal}: {type(data)}")
            return None

        print(f"Received {len(data)} records for {metal}")
        return data

    except Exception as e:
        print(f"Error fetching {metal}: {e}")
        return None

def merge_prices(gold_data: List[Dict], silver_data: List[Dict]) -> List[Dict]:
    """
    Merge gold and silver price lists into a single list of dictionaries.
    Each dictionary contains: date, gold_price, silver_price.
    """
    gold_by_date = {item["date"]: item["price"] for item in gold_data if "date" in item and "price" in item}
    silver_by_date = {item["date"]: item["price"] for item in silver_data if "date" in item and "price" in item}

    # Get the union of all dates from both datasets
    all_dates = sorted(set(gold_by_date.keys()) | set(silver_by_date.keys()))

    merged = []
    for date in all_dates:
        merged.append({
            "date": date,
            "gold_price": gold_by_date.get(date, ""),
            "silver_price": silver_by_date.get(date, ""),
        })
    return merged

def scrape_commodity_prices(db: Session) -> dict:
    """
    Scrape commodity prices (Gold, Silver) from NepseAlpha and upsert into DB.
    Returns counts of created/updated price records.
    """
    gold_prices = fetch_prices("gold")
    time.sleep(2)
    silver_prices = fetch_prices("silver")
    
    if not gold_prices and not silver_prices:
        print("Failed to fetch both gold and silver prices.")
        return {"total_scraped": 0, "created": 0, "updated": 0}

    # If one fails, we can still process the other
    gold_prices = gold_prices or []
    silver_prices = silver_prices or []
    
    merged_data = merge_prices(gold_prices, silver_prices)
    
    created = 0
    updated = 0
    
    for item in merged_data:
        try:
            date_obj = datetime.strptime(item["date"], '%Y-%m-%d').date()
        except ValueError:
            continue
            
        gold_val = item["gold_price"]
        silver_val = item["silver_price"]
        
        gold_price = float(gold_val) if gold_val else None
        silver_price = float(silver_val) if silver_val else None
        
        record = {
            "date": date_obj,
            "gold_price": gold_price,
            "silver_price": silver_price
        }
        
        stmt = insert(CommodityPrice).values(record)
        on_conflict_stmt = stmt.on_conflict_do_update(
            index_elements=['date'],
            set_={
                'gold_price': stmt.excluded.gold_price,
                'silver_price': stmt.excluded.silver_price,
                'updated_at': datetime.now(timezone.utc)
            }
        )
        
        db.execute(on_conflict_stmt)
        updated += 1
        
    db.commit()
    print(f"Commodity prices done — processed: {len(merged_data)}")
    
    return {
        "total_scraped": len(merged_data),
        "created": 0, 
        "updated": updated,
    }
