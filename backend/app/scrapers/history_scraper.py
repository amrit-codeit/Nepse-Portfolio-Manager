"""
Historical Price Scraper for NEPSE stocks via NepseAlpha.
Follows the pattern of grabbing the CSRF token from the React/Inertia state 
and requesting historical OHLCV data to backfill our PriceHistory table.
"""

import json
import time
import asyncio
from datetime import datetime, timedelta, date
from bs4 import BeautifulSoup
from curl_cffi import requests
from sqlalchemy.orm import Session
from sqlalchemy import func
from sqlalchemy.dialects.sqlite import insert

from app.models.transaction import Transaction
from app.models.price import PriceHistory

def scrape_historical_prices(db: Session, target_symbol: str = None):
    """
    Scrapes historical price data for all unique symbols tracked in the portfolio,
    or just for a specific target_symbol.
    """
    print("Starting historical price backfill...")
    
    # Step 1 & 2: Determine Date Ranges
    if target_symbol:
        symbols_to_process = [target_symbol.upper()]
    else:
        unique_symbols = db.query(Transaction.symbol).distinct().all()
        symbols_to_process = [r[0] for r in unique_symbols if r[0]]

    
    today = datetime.now().date()
    today_str = today.strftime("%Y-%m-%d")
    
    # Initialize a global session to retain cookies and Cloudflare clearance
    session = requests.Session(impersonate="chrome")
    
    base_headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-GB,en-US;q=0.9,en;q=0.8"
    }

    scraped_count = 0
    
    for symbol in symbols_to_process:
        # Find latest date for this symbol in PriceHistory
        latest_date = db.query(func.max(PriceHistory.date)).filter(PriceHistory.symbol == symbol).scalar()
        
        if latest_date:
            start_date = latest_date + timedelta(days=1)
        else:
            start_date = date(2021, 4, 1)
            
        if start_date > today:
            print(f"[{symbol}] Already up to date. Skipping.")
            continue
            
        start_date_str = start_date.strftime("%Y-%m-%d")
        
        print(f"[{symbol}] Fetching historical data from {start_date_str} to {today_str}...")
        
        # Step 3: Extract CSRF token
        try:
            # 1. GET request for the token
            res = session.get("https://nepsealpha.com/nepse-data", headers=base_headers, timeout=20)
            if res.status_code != 200:
                print(f"[{symbol}] Failed to load token page. Status: {res.status_code}")
                time.sleep(3)
                continue
                
            soup = BeautifulSoup(res.text, "html.parser")
            app_div = soup.find("div", id="nepse_app_content")
            
            if not app_div or not app_div.has_attr("data-page"):
                print(f"[{symbol}] Could not find token data in HTML.")
                time.sleep(3)
                continue
                
            page_data = json.loads(app_div["data-page"])
            _token = page_data.get("props", {}).get("smx_passport")
            
            if not _token:
                print(f"[{symbol}] Could not extract smx_passport token.")
                time.sleep(3)
                continue
                
            # 2. POST request with the token
            post_headers = base_headers.copy()
            post_headers.update({
                "X-Requested-With": "XMLHttpRequest",
                "Accept": "application/json",
                "Referer": "https://nepsealpha.com/nepse-data"
            })
            
            payload = {
                "symbol": symbol,
                "specific_date": today_str,
                "start_date": start_date_str,
                "end_date": today_str,
                "filter_type": "date-range",
                "price_type": "unadjusted",
                "time_frame": "daily",
                "_token": _token
            }
            
            post_res = session.post(
                "https://nepsealpha.com/nepse-data", 
                headers=post_headers, 
                data=payload,
                timeout=30
            )
            
            if post_res.status_code != 200:
                print(f"[{symbol}] Data API returned status {post_res.status_code}")
                time.sleep(3)
                continue
                
            # Step 4: Parse and Save Data
            # NepseAlpha returns historical data inside 'data' -> 'data' (paginated or tabular)
            # Typically {"data": {"data": [{"date": "...", "open": ..., "close": ...}, ...]}}
            # Let's inspect safety
            try:
                response_json = post_res.json()
                # Often it is in data -> data, sometimes directly in data or html. 
                # According to typical NepseAlpha structure:
                records = response_json.get("data", [])
                # If they paginate it:
                if isinstance(records, dict) and "data" in records:
                    records = records["data"]
            except Exception as e:
                print(f"[{symbol}] Failed to parse JSON response: {e}")
                time.sleep(3)
                continue
                
            if not records:
                print(f"[{symbol}] No historical data found for this range.")
                time.sleep(3)
                continue
                
            insert_batch = []
            for row in records:
                # Row format example: {'date': '2021-04-01', 'open': 100, ...} or {'f_date': ...}
                row_date_str = row.get('date') or row.get('f_date')
                if not row_date_str:
                    continue
                    
                # Convert date string to python date object
                try:
                    row_date = datetime.strptime(row_date_str, "%Y-%m-%d").date()
                except ValueError:
                    continue
                    
                insert_batch.append({
                    "symbol": symbol,
                    "date": row_date,
                    "open": float(row.get('open') or 0),
                    "high": float(row.get('high') or 0),
                    "low": float(row.get('low') or 0),
                    "close": float(row.get('close') or 0),
                    "volume": float(row.get('volume') or row.get('vol') or 0),
                })
                
            if insert_batch:
                stmt = insert(PriceHistory).values(insert_batch)
                
                # Configure ON CONFLICT DO NOTHING
                # SQLite syntax
                on_conflict_stmt = stmt.on_conflict_do_nothing(
                    index_elements=['symbol', 'date']
                )
                
                db.execute(on_conflict_stmt)
                db.commit()
                scraped_count += len(insert_batch)
                print(f"[{symbol}] Saved {len(insert_batch)} historical records.")
            
        except Exception as e:
            print(f"[{symbol}] Unexpected error: {e}")
            import traceback
            traceback.print_exc()
        
        # Sleep to avoid rate limiting
        time.sleep(3)
        
    print(f"Historical backfill complete. Total new records inserted: {scraped_count}")
    return scraped_count
