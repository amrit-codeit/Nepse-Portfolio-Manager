"""
Live Price Scraper for NEPSE stocks.
Fetches current trading prices from sharesanar live trading page via secure session.
Parses stock data directly from HTML (headless mode).
"""

import re
import html
import json
import time
from curl_cffi import requests
from sqlalchemy.orm import Session
from datetime import datetime, timezone

from app.models.price import LivePrice, IndexHistory
from app.models.company import Company
from sqlalchemy.dialects.sqlite import insert as sqlite_insert


from bs4 import BeautifulSoup

def fetch_sharesansar_live_data():
    """
    Extract live stock trading data from Sharesansar's live trading page.
    """
    session = requests.Session(impersonate="chrome")
    
    base_headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
    }

    print("Step 1: Visiting Sharesansar live trading page...")
    res = session.get("https://www.sharesansar.com/live-trading", headers=base_headers, timeout=30)
    
    if res.status_code != 200:
        raise Exception(f"Failed to load main page. Status: {res.status_code}")

    soup = BeautifulSoup(res.text, 'html.parser')
    table = soup.find('table', id='headFixed')
    if not table:
        raise Exception("Table with id 'headFixed' not found on the page.")

    tbody = table.find('tbody')
    if not tbody:
        raise Exception("tbody not found inside the live trading table.")

    rows = tbody.find_all('tr')
    
    all_stocks = []
    for row in rows:
        tds = row.find_all('td')
        if len(tds) < 10:
            continue
            
        a_tag = tds[1].find('a')
        if not a_tag: continue
        symbol = a_tag.text.strip()
        ltp = tds[2].text.strip()
        point_change = tds[3].text.strip()
        percent_change = tds[4].text.strip()
        open_price = tds[5].text.strip()
        high = tds[6].text.strip()
        low = tds[7].text.strip()
        volume = tds[8].text.strip()
        prev_close = tds[9].text.strip()
        
        movement = "UNCHANGED"
        td_class = tds[0].get('class', [])
        if 'success-index' in td_class:
            movement = "UP"
        elif 'danger-index' in td_class:
            movement = "DOWN"
            
        all_stocks.append({
            "symbol": symbol,
            "ltp": ltp,
            "change": point_change,
            "change_pct": percent_change,
            "open_price": open_price,
            "high": high,
            "low": low,
            "volume": volume,
            "prev_close": prev_close,
            "movement": movement
        })
        
    return all_stocks


def fetch_nepse_index():
    """
    Extract live NEPSE Index data from Sharesansar's live trading page.
    """
    session = requests.Session(impersonate="chrome")
    
    base_headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
    }

    try:
        res = session.get("https://www.sharesansar.com/live-trading", headers=base_headers, timeout=30)
        if res.status_code != 200:
            return None

        soup = BeautifulSoup(res.text, 'html.parser')
        
        # Look for "NEPSE Index" in the market update slider
        nepse_tag = soup.find(string=re.compile(r"^NEPSE Index$", re.IGNORECASE))
        if not nepse_tag:
            # Fallback if the regex is too strict
            nepse_tag = soup.find(string=re.compile("NEPSE Index", re.IGNORECASE))
            
        if not nepse_tag:
            return None
            
        container = nepse_tag.find_parent('div', class_='mu-list')
        if not container:
            return None
            
        # Turnover (mu-price)
        turnover_tag = container.find('p', class_='mu-price')
        turnover = 0
        if turnover_tag:
            turnover = float(turnover_tag.text.strip().replace(',', ''))
        
        # Index Value and Percentage Change
        # They are usually in the second <p> tag within mu-list
        p_tags = container.find_all('p')
        if len(p_tags) < 2:
            return None
            
        info_text = p_tags[1].get_text(strip=True, separator=" ")
        # Expected format: "2,829.41 -1.30%"
        parts = info_text.split()
        if len(parts) >= 2:
            try:
                close = float(parts[0].replace(',', ''))
                pct_change = float(parts[1].replace('%', '').replace('(', '').replace(')', ''))
                
                # Calculate point change (approximate from percentage if not available)
                # change = close - prev_close; pct = (change / prev_close) * 100
                # prev_close = close / (1 + pct/100)
                # change = close - (close / (1 + pct/100))
                change = close - (close / (1 + pct_change / 100))
                
                return {
                    "close": close,
                    "change": change,
                    "percent_change": pct_change,
                    "turnover": turnover,
                    "date": datetime.now().date()
                }
            except (ValueError, IndexError):
                return None
    except Exception as e:
        print(f"Error fetching live NEPSE index: {e}")
        return None
        
    return None



def scrape_live_prices(db: Session) -> dict:
    """
    Scrape live prices from NepseAlpha and upsert into DB.
    Returns counts of created/updated price records.
    """
    data = []
    
    try:
        items = fetch_sharesansar_live_data()
        
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

            ltp = safe_float(info.get('ltp'))
            change = safe_float(info.get('change'))
            change_pct = safe_float(info.get('change_pct'))
            high = safe_float(info.get('high'))
            low = safe_float(info.get('low'))
            open_price = safe_float(info.get('open_price'))
            volume = safe_float(info.get('volume'))
            prev_close = safe_float(info.get('prev_close'))
            
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

    # ── NEPSE Index update ──────────────────────────────────────────
    try:
        index_data = fetch_nepse_index()
        if index_data:
            stmt = sqlite_insert(IndexHistory).values({
                "index_name": "NEPSE Index",
                "index_id": 12,
                "date": index_data["date"],
                "close": index_data["close"],
                "change": index_data["change"],
                "percent_change": index_data["percent_change"],
                "turnover": index_data["turnover"],
                "updated_at": datetime.now()
            })
            
            # Update values if it already exists for today
            on_conflict_stmt = stmt.on_conflict_do_update(
                index_elements=['index_name', 'date'],
                set_={
                    'close': stmt.excluded.close,
                    'change': stmt.excluded.change,
                    'percent_change': stmt.excluded.percent_change,
                    'turnover': stmt.excluded.turnover,
                    'updated_at': datetime.now()
                }
            )
            db.execute(on_conflict_stmt)
            db.commit()
            print(f"Live NEPSE Index updated: {index_data['close']} ({index_data['percent_change']}%)")
    except Exception as e:
        print(f"Failed to update live NEPSE index: {e}")

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
