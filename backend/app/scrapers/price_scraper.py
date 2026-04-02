"""
Live Price Scraper for NEPSE stocks.
Fetches current trading prices from NepseAlpha's main page via secure session.
Parses stock data directly from HTML (headless mode).
"""

import re
import html
import json
import time
from curl_cffi import requests
from sqlalchemy.orm import Session
from datetime import datetime, timezone

from app.models.price import LivePrice
from app.models.company import Company


def fetch_nepsealpha_live_data():
    """
    Fetches raw stock data by parsing the unescaped JSON embedded in the HTML.
    This bypasses 403 issues from direct API calls and handles fragile fsk tokens.
    """
    session = requests.Session(impersonate="chrome")
    
    base_headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-GB,en-US;q=0.9,en;q=0.8"
    }

    print("Step 1: Visiting main page to extract embedded JSON data...")
    res = session.get("https://nepsealpha.com/live-market", headers=base_headers, timeout=30)
    
    if res.status_code != 200:
        raise Exception(f"Failed to load main page. Status: {res.status_code}")

    # Data is HTML encoded inside the script blocks or divs.
    # Unescape first to get clean JSON strings
    unescaped = html.unescape(res.text)

    # Aggressive per-object regex extraction to capture all stocks regardless of block fragmentation.
    # Matches: {"symbol":"SYMBOL", "key":value, ...}
    pattern = r'\{"symbol":"[A-Z0-9_\ ]+",".*?\}'
    matches = re.finditer(pattern, unescaped)

    all_stocks = {}
    for match in matches:
        try:
            obj = json.loads(match.group(0))
            if 'symbol' in obj:
                # Store unique symbols (keeping the latest occurrence)
                # Normalizing key to handle potential case variations
                all_stocks[obj['symbol'].upper()] = obj
        except:
            continue

    if not all_stocks:
        raise Exception("Failed to extract any stock data from the main page.")

    return list(all_stocks.values())


def scrape_live_prices(db: Session) -> dict:
    """
    Scrape live prices from NepseAlpha and upsert into DB.
    Returns counts of created/updated price records.
    """
    data = []
    
    try:
        items = fetch_nepsealpha_live_data()
        
        # Helper to parse values safely
        def safe_float(v):
            if v is None: return None
            if isinstance(v, (int, float)): return float(v)
            if isinstance(v, str):
                clean = v.replace(",", "").strip()
                if clean in ["-", "N/A", ""]: return None
                try:
                    return float(clean)
                except ValueError:
                    return None
            return None

        # Map to expected structure
        for info in items:
            symbol = info.get("symbol")
            if not symbol: continue

            # Map NepseAlpha fields based on direct inspection of the unescaped HTML content.
            # pointChange and percentageChange are the active keys in their direct response objects.
            ltp = safe_float(info.get('ltp') or info.get('close') or info.get('closingPrice'))
            change = safe_float(info.get('pointChange') or info.get('point_change') or info.get('pd') or info.get('diff'))
            change_pct = safe_float(info.get('percentageChange') or info.get('percent_change') or info.get('p') or info.get('diff_pct'))
            high = safe_float(info.get('high') or info.get('h') or info.get('maxPrice'))
            low = safe_float(info.get('low') or info.get('l') or info.get('minPrice'))
            open_price = safe_float(info.get('open_price') or info.get('openPrice') or info.get('open'))
            volume = safe_float(info.get('volume') or info.get('vol') or info.get('v') or info.get('shareTraded'))
            prev_close = safe_float(info.get('previous_close') or info.get('previousClose') or info.get('prev_close'))
            
            if ltp is not None:
                data.append({
                    "symbol": symbol.upper(),
                    "ltp": ltp,
                    "change": change,
                    "change_pct": change_pct,
                    "high": high,
                    "low": low,
                    "open_price": open_price,
                    "volume": volume,
                    "prev_close": prev_close,
                })
                
    except Exception as e:
        print(f"Error scraping live prices: {e}")
        import traceback
        traceback.print_exc()
        raise

    # ── Database upsert ──────────────────────────────────────────────
    updated = 0
    created = 0

    for item in data:
        company = db.query(Company).filter(Company.symbol == item["symbol"]).first()
        if not company:
            continue

        price_record = db.query(LivePrice).filter(LivePrice.company_id == company.id).first()

        if price_record:
            # Update existing record
            price_record.ltp = item["ltp"]
            if item["change"] is not None: price_record.change = item["change"]
            if item["change_pct"] is not None: price_record.change_pct = item["change_pct"]
            if item["high"] is not None: price_record.high = item["high"]
            if item["low"] is not None: price_record.low = item["low"]
            if item["open_price"] is not None: price_record.open_price = item["open_price"]
            if item["volume"] is not None: price_record.volume = int(item["volume"])
            if item["prev_close"] is not None: price_record.prev_close = item["prev_close"]
            price_record.updated_at = datetime.now(timezone.utc)
            updated += 1
        else:
            # Create new record
            price_record = LivePrice(
                company_id=company.id,
                symbol=company.symbol,
                ltp=item["ltp"],
                change=item["change"],
                change_pct=item["change_pct"],
                high=item["high"],
                low=item["low"],
                open_price=item["open_price"],
                volume=int(item["volume"]) if item["volume"] else 0,
                prev_close=item["prev_close"],
                updated_at=datetime.now(timezone.utc)
            )
            db.add(price_record)
            created += 1

    db.commit()

    result = {
        "total_scraped": len(data),
        "created": created,
        "updated": updated,
    }
    print(f"Prices done — scraped: {len(data)}, created: {created}, updated: {updated}")
    return result

def _parse_float(val: str):
    pass

def _parse_int(val: str):
    pass
