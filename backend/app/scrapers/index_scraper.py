"""
Index History Scraper — NEPSE Composite + Sector Sub-Indices.

Scrapes historical index data from ShareSansar's DataTable API.
The same paginated API is used for all indices — only `index_id` differs.
"""

import time
import json
from datetime import datetime, date, timedelta
from curl_cffi import requests
from sqlalchemy.orm import Session
from sqlalchemy import func
from sqlalchemy.dialects.sqlite import insert

from app.models.price import IndexHistory

# ---------------------------------------------------------------------------
# ShareSansar sector sub-index IDs (stable, well-known)
# ---------------------------------------------------------------------------
SECTOR_INDICES = {
    12: "NEPSE Index",
    58: "Banking",
    60: "Hotels And Tourism",
    62: "Hydro Power",
    64: "Development Banks",
    66: "Finance",
    68: "Non Life Insurance",
    70: "Manufacturing And Processing",
    72: "Others",
    74: "Microfinance",
    76: "Life Insurance",
    78: "Investment",
    80: "Tradings",
    # Sensitive index (composite of BFIs)
    54: "Sensitive Index",
    # Float index
    56: "Float Index",
}

# Map ShareSansar index names → Company.sector values for cross-referencing
INDEX_TO_SECTOR = {
    "Banking": "Commercial Banks",
    "Hotels And Tourism": "Hotels And Tourism",
    "Hydro Power": "Hydro Power",
    "Development Banks": "Development Banks",
    "Finance": "Finance",
    "Non Life Insurance": "Non Life Insurance",
    "Manufacturing And Processing": "Manufacturing And Processing",
    "Others": "Others",
    "Microfinance": "Microfinance",
    "Life Insurance": "Life Insurance",
    "Investment": "Investment",
    "Tradings": "Tradings",
}


def _fetch_index_data(session, index_id, index_name, start_date_str, today_str):
    """Fetch paginated index history from ShareSansar for a single index."""
    base_url = "https://www.sharesansar.com/index-history-data"
    headers = {
        "X-Requested-With": "XMLHttpRequest",
        "Referer": "https://www.sharesansar.com/index-history-data",
        "Accept": "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
    }

    def get_params(draw, start, length):
        return {
            "index_id": str(index_id),
            "from": start_date_str,
            "to": today_str,
            "draw": str(draw),
            "start": str(start),
            "length": str(length),
            "_": str(int(time.time() * 1000))
        }

    # Phase 1: Discover total records
    try:
        res = session.get(base_url, headers=headers, params=get_params(1, 0, 10), timeout=30)
        res.raise_for_status()
        data = res.json()
        records_total = int(data.get("recordsTotal", 0))
    except Exception as e:
        print(f"  [FAIL] {index_name}: {e}")
        return []

    if records_total == 0:
        return []

    # Phase 2: Paginated fetch
    batch_size = 100
    all_data = []
    draw = 2

    for start in range(0, records_total, batch_size):
        try:
            res = session.get(base_url, headers=headers, params=get_params(draw, start, batch_size), timeout=30)
            res.raise_for_status()
            batch = res.json().get("data", [])
            all_data.extend(batch)
        except Exception as e:
            print(f"  [WARN] {index_name} batch {start}: {e}")
        draw += 1
        time.sleep(0.3)

    return all_data


def _parse_rows(raw_data, index_name, index_id):
    """Parse raw ShareSansar response rows into insert-ready dicts."""
    import re
    parsed = []
    for row in raw_data:
        try:
            pub_date_str = str(row.get('published_date', '')).strip()
            close_val = row.get('current')
            if close_val is None:
                continue

            if '<' in pub_date_str:
                pub_date_str = re.sub('<[^<]+>', '', pub_date_str).strip()

            pub_date = datetime.strptime(pub_date_str, "%Y-%m-%d").date()
            close_price = float(str(close_val).replace(',', '').strip())

            def safe_float(v):
                if v is None:
                    return None
                try:
                    return float(str(v).replace(',', '').strip())
                except (ValueError, TypeError):
                    return None

            parsed.append({
                "index_name": index_name,
                "index_id": index_id,
                "date": pub_date,
                "close": close_price,
                "open": safe_float(row.get('open')),
                "high": safe_float(row.get('high')),
                "low": safe_float(row.get('low')),
                "change": safe_float(row.get('change_')),
                "percent_change": safe_float(row.get('per_change')),
                "turnover": safe_float(row.get('turnover')),
            })
        except Exception:
            continue
    return parsed


def scrape_nepse_index(db: Session):
    """Scrape NEPSE Index history only (backward compat)."""
    return scrape_indices(db, index_ids=[12])


def scrape_sector_indices(db: Session):
    """Scrape ALL sector sub-indices (excluding NEPSE main — that's scraped separately)."""
    sector_ids = [k for k in SECTOR_INDICES if k != 12]
    return scrape_indices(db, index_ids=sector_ids)


def scrape_all_indices(db: Session):
    """Scrape NEPSE Index + ALL sector sub-indices."""
    return scrape_indices(db, index_ids=list(SECTOR_INDICES.keys()))


def scrape_indices(db: Session, index_ids: list[int] = None):
    """
    Generic index scraper. Fetches historical data for specified index IDs
    from ShareSansar and upserts into the IndexHistory table.
    """
    if index_ids is None:
        index_ids = list(SECTOR_INDICES.keys())

    today = datetime.now().date()
    today_str = today.strftime("%Y-%m-%d")

    session = requests.Session(impersonate="chrome")
    total_saved = 0

    for idx_id in index_ids:
        index_name = SECTOR_INDICES.get(idx_id, f"Index_{idx_id}")

        # Incremental: find latest date for this index
        latest_date = db.query(func.max(IndexHistory.date)).filter(
            IndexHistory.index_id == idx_id
        ).scalar()

        start_date = (latest_date + timedelta(days=1)) if latest_date else date(2020, 1, 1)
        if start_date > today:
            print(f"  [SKIP] {index_name} — already up-to-date")
            continue

        start_date_str = start_date.strftime("%Y-%m-%d")
        print(f"  [FETCH] {index_name} (ID={idx_id}) from {start_date_str} to {today_str}")

        raw_data = _fetch_index_data(session, idx_id, index_name, start_date_str, today_str)
        if not raw_data:
            continue

        parsed = _parse_rows(raw_data, index_name, idx_id)
        if not parsed:
            continue

        # Bulk upsert
        stmt = insert(IndexHistory).values(parsed)
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
        total_saved += len(parsed)
        print(f"  [OK] {index_name}: {len(parsed)} records saved")

    return total_saved
