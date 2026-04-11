import time
import json
from datetime import datetime, date, timedelta
from curl_cffi import requests
from sqlalchemy.orm import Session
from sqlalchemy import func
from sqlalchemy.dialects.sqlite import insert

from app.models.price import IndexHistory

def scrape_nepse_index(db: Session):
    """
    Scrapes the COMPLETE historical data for the NEPSE Index from Sharesansar.com,
    covering trading days from Jan 1, 2020 to today.
    """
    print("Starting NEPSE Index data extraction (Phase 1)...")
    
    # Calculate incremental date range
    latest_date = db.query(func.max(IndexHistory.date)).filter(IndexHistory.index_id == 12).scalar()
    
    if latest_date:
        start_date = latest_date + timedelta(days=1)
    else:
        start_date = date(2020, 1, 1)
        
    start_date_str = start_date.strftime("%Y-%m-%d")
    today = datetime.now().date()
    today_str = today.strftime("%Y-%m-%d")
    
    if start_date > today:
        print("NEPSE Index data is already up to date.")
        return 0

    print(f"Fetching Index data from {start_date_str} to {today_str}")

    base_url = "https://www.sharesansar.com/index-history-data"
    
    headers = {
        "X-Requested-With": "XMLHttpRequest",
        "Referer": "https://www.sharesansar.com/index-history-data",
        "Accept": "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36"
    }

    def get_params(draw, start, length):
        return {
            "index_id": "12",
            "from": start_date_str,
            "to": today_str,
            "draw": str(draw),
            "start": str(start),
            "length": str(length),
            "_": str(int(time.time() * 1000))
        }

    session = requests.Session(impersonate="chrome")

    # Phase 1: Discover Total Records
    initial_params = get_params(draw=1, start=0, length=10)
    
    try:
        res = session.get(base_url, headers=headers, params=initial_params, timeout=20)
        res.raise_for_status()
        data = res.json()
        records_total = int(data.get("recordsTotal", 0))
    except Exception as e:
        print(f"Failed to fetch initial NEPSE index metadata: {e}")
        return 0

    if records_total == 0:
        print("No NEPSE index records found.")
        return 0

    print(f"Found {records_total} total records. Starting Phase 2 & 3: Paginated Fetching...")

    # Phase 2 & 3: Execute Paginated Fetching
    batch_size = 50
    all_data = []
    
    draw = 2
    for start in range(0, records_total, batch_size):
        print(f"Fetching batch: start={start}")
        params = get_params(draw=draw, start=start, length=batch_size)
        
        try:
            res = session.get(base_url, headers=headers, params=params, timeout=20)
            res.raise_for_status()
            batch_json = res.json()
            records = batch_json.get("data", [])
            all_data.extend(records)
        except Exception as e:
            print(f"Failed to fetch batch {start}: {e}")
        
        draw += 1
        # Phase 4: Rate Limiting
        time.sleep(0.5)

    print(f"Completed fetching {len(all_data)} total rows. Processing and saving to database...")

    # Phase 5: Collect and Save
    insert_batch = []
    for row in all_data:
        # 12 is NEPSE, Sharesansar typically returns HTML string in the first col and other data
        # Data example:
        # "data": [
        #   [
        #     "1",                         # SN
        #     "2020-01-01",                # Date (Wait, depends on order)
        #     "1166.03",                   # Open
        #     "1175.05",                   # High
        #     ...                          # Low, Close, Volume...
        #   ]
        # ]
        # Wait, the structure in Sharesansar indices history datatable:
        # S.No., Published Date, Open, High, Low, Close, Change, % Change, Turnover
        
        try:
            # The response is now a list of dictionaries
            pub_date_str = str(row.get('published_date', '')).strip()
            
            # Use current for index value
            close_price_val = row.get('current')
            if close_price_val is None:
                continue

            # Safely Parse published date
            if '<' in pub_date_str:
                import re
                pub_date_str = re.sub('<[^<]+>', '', pub_date_str).strip()
            
            pub_date = datetime.strptime(pub_date_str, "%Y-%m-%d").date()
            
            close_price = float(str(close_price_val).replace(',', '').strip())
            open_price = float(str(row.get('open', 0)).replace(',', '').strip()) if row.get('open') else None
            high_price = float(str(row.get('high', 0)).replace(',', '').strip()) if row.get('high') else None
            low_price = float(str(row.get('low', 0)).replace(',', '').strip()) if row.get('low') else None
            change = float(str(row.get('change_', 0)).replace(',', '').strip()) if row.get('change_') else None
            pct_change = float(str(row.get('per_change', 0)).replace(',', '').strip()) if row.get('per_change') else None
            turnover = float(str(row.get('turnover', 0)).replace(',', '').strip()) if row.get('turnover') else None

            insert_batch.append({
                "index_name": "NEPSE Index",
                "index_id": 12,
                "date": pub_date,
                "close": close_price,
                "open": open_price,
                "high": high_price,
                "low": low_price,
                "change": change,
                "percent_change": pct_change,
                "turnover": turnover
            })
        except Exception as e:
            # Skip rows with parsing issues quietly
            continue

    if insert_batch:
        stmt = insert(IndexHistory).values(insert_batch)
        on_conflict_stmt = stmt.on_conflict_do_update(
            index_elements=['index_name', 'date'],
            set_={
                'close': stmt.excluded.close,
                'open': stmt.excluded.open,
                'high': stmt.excluded.high,
                'low': stmt.excluded.low,
                'change': stmt.excluded.change,
                'percent_change': stmt.excluded.percent_change,
                'turnover': stmt.excluded.turnover,
                'updated_at': datetime.now()
            }
        )
        db.execute(on_conflict_stmt)
        db.commit()
    
    print(f"Successfully processed and saved {len(insert_batch)} NEPSE Index daily records.")
    return len(insert_batch)
