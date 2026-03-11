
import requests
import time
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from app.models.price import IssuePrice
from app.database import SessionLocal

BASE_URL = "https://www.sharesansar.com/existing-issues"

# Maps issue type name (used in DB) to `type` query-param value (used by ShareSansar AJAX)
ISSUE_TYPES: dict[str, int] = {
    "IPO":         1,
    "FPO":         2,
    "RIGHT":       3,
    "IPO_LOCAL":   4,
    "MUTUAL_FUND": 5,
    "BOND":        6,
    "IPO_MIGRANT": 7,
    "IPO_QIIS":    8,
}


def _parse_float(val) -> float | None:
    if val is None:
        return None
    try:
        return float(str(val).replace(",", "").strip())
    except (ValueError, TypeError):
        return None


def fetch_and_update(db: Session = None):
    """Fetches the latest issue prices from ShareSansar and updates the local database."""
    session = requests.Session()
    session.headers.update({
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36",
        "Accept": "application/json, text/javascript, */*; q=0.01",
        "X-Requested-With": "XMLHttpRequest",
        "Referer": BASE_URL,
    })

    # Seed cookies by hitting the main page first
    try:
        session.get(BASE_URL, timeout=10)
    except Exception as e:
        print(f"Failed to connect to ShareSansar: {e}")
        return

    # Use existing DB or create new one
    own_db = False
    if db is None:
        db = SessionLocal()
        own_db = True

    try:
        total_created = 0
        total_updated = 0

        for type_name, type_id in ISSUE_TYPES.items():
            print(f"Fetching {type_name}...")

            # Use 50 instead of 100 to avoid 202 status codes from ShareSansar
            params = {
                "draw": 1,
                "start": 0,
                "length": 50,
                "type": type_id,
                "_": int(time.time() * 1000),
            }

            try:
                resp = session.get(BASE_URL, params=params, timeout=15)
                # If we still get 202, try a smaller length
                if resp.status_code == 202:
                    params["length"] = 10
                    resp = session.get(BASE_URL, params=params, timeout=15)

                if resp.status_code != 200:
                    print(
                        f"  Warning: Received status {resp.status_code} for {type_name}")
                    continue

                payload = resp.json()
                rows = payload.get("data", [])

                for row in rows:
                    # Symbol extraction from HTML string in 'company' object
                    # E.g. {'id': 932, 'symbol': "<a href='...'>SYMBOL</a>"}
                    company_data = row.get("company")
                    symbol = None
                    if isinstance(company_data, dict):
                        # Extract symbol from the <a> tag if needed, or check for it directly.
                        # Sometimes the API returns the HTML string for the symbol column.
                        # Using regex to clean HTML tags if needed.
                        import re
                        raw_sym = company_data.get("symbol", "")
                        symbol = re.sub(
                            '<[^<]+?>', '', raw_sym).strip().upper()

                    # If the above fails, check if there's a direct symbol field
                    if not symbol:
                        symbol = str(row.get("symbol", "")).strip().upper()

                    price = _parse_float(row.get("issue_price"))

                    if not symbol or price is None:
                        continue

                    # Perform Upsert
                    record = db.query(IssuePrice).filter(
                        IssuePrice.symbol == symbol,
                        IssuePrice.issue_type == type_name
                    ).first()

                    if record:
                        if record.price != price:
                            record.price = price
                            record.updated_at = datetime.now(timezone.utc)
                            total_updated += 1
                    else:
                        record = IssuePrice(
                            symbol=symbol,
                            issue_type=type_name,
                            price=price
                        )
                        db.add(record)
                        total_created += 1

                db.commit()
                print(f"  ✓ {type_name} sync complete.")

            except Exception as e:
                print(f"  ✗ Failed to fetch/parse {type_name}: {e}")
                db.rollback()

        # Phase 2: Update existing transactions that have missing rates
        print("\nUpdating transaction rates for all users...")
        from app.models.transaction import Transaction
        from app.services.portfolio_engine import recalculate_holdings

        # Get all transactions that might need an update
        # We look for rate 0, 100 or None
        txns = db.query(Transaction).filter(
            Transaction.txn_type.in_(['IPO', 'RIGHT', 'FPO']),
            (Transaction.rate == None) | (
                Transaction.rate == 0) | (Transaction.rate == 100.0)
        ).all()

        txns_updated = 0
        affected_pairs = set()

        # Load all issue prices to memory for fast lookup
        all_prices = db.query(IssuePrice).all()
        price_map = {(p.symbol, p.issue_type): p.price for p in all_prices}

        for t in txns:
            p = price_map.get((t.symbol.upper(), t.txn_type.upper()))
            if p and t.rate != p:
                t.rate = p
                t.amount = t.quantity * p
                t.total_cost = (t.amount or 0) + (t.dp_charge or 0)
                txns_updated += 1
                affected_pairs.add((t.member_id, t.symbol))

        if txns_updated > 0:
            db.commit()
            print(f"  ✓ Updated {txns_updated} historical transactions.")
            # Recalculate affected holdings
            for mid, sym in affected_pairs:
                recalculate_holdings(db, mid, sym)
            db.commit()
            print("  ✓ Holdings recalculation complete.")
        else:
            print("  ✓ No historical transactions needed updates.")

        print(
            f"\nAutomation complete: {total_created} new, {total_updated} updated.")

    finally:
        if own_db:
            db.close()


if __name__ == "__main__":
    fetch_and_update()
