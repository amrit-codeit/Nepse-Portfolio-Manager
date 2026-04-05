"""
Dividend Scraper for NEPSE stocks via NepseAlpha.
Scrapes cash dividend data from the investment calendar endpoint,
calculates eligibility based on transaction history at book closure,
and saves results to the DividendIncome table.
"""

import re
import json
import time
import traceback
from datetime import datetime, date
from bs4 import BeautifulSoup
from curl_cffi import requests
from sqlalchemy.orm import Session
from sqlalchemy import func
from sqlalchemy.dialects.sqlite import insert

from app.models.company import Company
from app.models.transaction import Transaction, TransactionType
from app.models.dividend import DividendIncome


# --- Helper Functions ---

def clean_ordinal_date(raw_date: str) -> str:
    """
    Strips ordinal suffixes (st, nd, rd, th) from date strings.
    Example: '30th Nov 2025' -> '30 Nov 2025'
             '1st Jan 2024'  -> '1 Jan 2024'
    """
    if not raw_date:
        return ""
    # Remove ordinal suffixes attached to numbers
    cleaned = re.sub(r'(\d+)\s*(st|nd|rd|th)', r'\1', raw_date, flags=re.IGNORECASE)
    # Collapse extra whitespace
    cleaned = re.sub(r'\s+', ' ', cleaned).strip()
    return cleaned


def parse_book_close_date(raw_text: str):
    """
    Parse a book close date from NepseAlpha's messy HTML.
    Returns a datetime.date or None.
    """
    clean = clean_ordinal_date(raw_text)
    if not clean:
        return None

    # Try multiple date formats
    formats = ["%d %b %Y", "%d %B %Y", "%Y-%m-%d", "%d/%m/%Y"]
    for fmt in formats:
        try:
            return datetime.strptime(clean, fmt).date()
        except ValueError:
            continue
    return None


def extract_fsk_token(session, base_headers: dict) -> str:
    """
    Visit NepseAlpha to extract the global fsk/smx_passport token.
    The fsk token is embedded in the Inertia props on nepse-data page.
    """
    url = "https://nepsealpha.com/nepse-data"
    res = session.get(url, headers=base_headers, timeout=20)

    if res.status_code != 200:
        print(f"  [Init] Failed to load token page. Status: {res.status_code}")
        return None

    # Look in Inertia page data (data-page attribute)
    soup = BeautifulSoup(res.text, "html.parser")
    app_div = soup.find("div", id="nepse_app_content")
    if app_div and app_div.has_attr("data-page"):
        try:
            page_data = json.loads(app_div["data-page"])
            props = page_data.get("props", {})
            for key in ["smx_passport", "fsk", "_token"]:
                if key in props and props[key]:
                    return props[key]
        except (json.JSONDecodeError, KeyError):
            pass

    print("  [Init] Could not extract fsk token.")
    return None


def parse_dividend_table(html_content: str, symbol: str) -> list:
    """
    Parse the dividend HTML table from NepseAlpha's investment calendar response.
    
    Actual NepseAlpha table structure (verified April 2026):
    Col 0: Bonus %       e.g. "0 %"
    Col 1: Cash %        e.g. "12.5 %"
    Col 2: Total         e.g. "12.5 %"       (ignored — derived field)
    Col 3: Book Close    e.g. "31 st Dec 2025"
    Col 4: Fiscal Year   e.g. "2081/2082"
    Col 5: Status        e.g. "Closed"        (ignored)
    """
    if not html_content:
        return []

    soup = BeautifulSoup(html_content, "html.parser")
    table = soup.find("table")
    if not table:
        print(f"  [{symbol}] No dividend table found in HTML response.")
        return []

    tbody = table.find("tbody")
    if not tbody:
        return []

    results = []
    rows = tbody.find_all("tr")

    for row in rows:
        cols = row.find_all("td")
        if len(cols) < 5:
            continue

        try:
            # Correct column mapping per NepseAlpha's actual layout
            bonus_pct_str = cols[0].get_text(strip=True).replace("%", "").strip()
            cash_pct_str = cols[1].get_text(strip=True).replace("%", "").strip()
            # cols[2] is "Total" — skip (it's just cash+bonus)
            book_close_str = cols[3].get_text(separator=" ", strip=True)
            fy = cols[4].get_text(strip=True)

            # Parse Cash Dividend Percent
            try:
                cash_pct = float(cash_pct_str) if cash_pct_str and cash_pct_str not in ["-", "N/A", ""] else 0.0
            except ValueError:
                cash_pct = 0.0

            # Parse Bonus Dividend Percent
            try:
                bonus_pct = float(bonus_pct_str) if bonus_pct_str and bonus_pct_str not in ["-", "N/A", ""] else 0.0
            except ValueError:
                bonus_pct = 0.0

            if cash_pct == 0.0 and bonus_pct == 0.0:
                continue

            # Parse Book Close Date
            book_close_date = parse_book_close_date(book_close_str)
            if not book_close_date:
                print(f"  [{symbol}] Skipping FY {fy}: could not parse date '{book_close_str}'")
                continue

            results.append({
                "fiscal_year": fy,
                "cash_dividend_percent": cash_pct,
                "bonus_dividend_percent": bonus_pct,
                "book_close_date": book_close_date,
            })

        except (ValueError, IndexError) as e:
            print(f"  [{symbol}] Skipping row due to parse error: {e}")
            continue

    return results


def calculate_eligible_quantity(db: Session, member_id: int, symbol: str, book_close_date: date) -> int:
    """
    Calculate how many shares the user held strictly before the book closure date.
    eligible_qty = SUM(BUY quantities before date) - SUM(SELL quantities before date)
    """
    BUY_TYPES = [
        TransactionType.BUY.value, TransactionType.IPO.value,
        TransactionType.FPO.value, TransactionType.RIGHT.value,
        TransactionType.AUCTION.value, TransactionType.TRANSFER_IN.value,
        TransactionType.BONUS.value,
    ]
    SELL_TYPES = [
        TransactionType.SELL.value, TransactionType.TRANSFER_OUT.value,
    ]

    buy_qty = db.query(func.coalesce(func.sum(Transaction.quantity), 0)).filter(
        Transaction.member_id == member_id,
        Transaction.symbol == symbol,
        Transaction.txn_type.in_(BUY_TYPES),
        Transaction.txn_date < book_close_date,
    ).scalar()

    sell_qty = db.query(func.coalesce(func.sum(Transaction.quantity), 0)).filter(
        Transaction.member_id == member_id,
        Transaction.symbol == symbol,
        Transaction.txn_type.in_(SELL_TYPES),
        Transaction.txn_date < book_close_date,
    ).scalar()

    return max(int(buy_qty - sell_qty), 0)


# --- Main Scraper Function ---

def scrape_and_calculate_dividends(db: Session) -> dict:
    """
    Main entry point: scrapes dividend data for all portfolio symbols
    and calculates eligibility based on transaction history.
    """
    print("=" * 60)
    print("Starting Dividend Scraper & Eligibility Calculator...")
    print("=" * 60)

    # Step 1: Get all distinct member-symbol combinations from transactions
    unique_holdings = db.query(Transaction.symbol, Transaction.member_id).distinct().all()

    symbols = list(set([r[0] for r in unique_holdings if r[0]]))

    symbol_to_members = {}
    for sym, mem_id in unique_holdings:
        if sym:
            symbol_to_members.setdefault(sym, []).append(mem_id)

    print(f"Found {len(symbols)} unique symbols across {len(unique_holdings)} portfolios.")

    session = requests.Session(impersonate="chrome")
    base_headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                      "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-GB,en-US;q=0.9,en;q=0.8",
    }

    total_saved = 0
    total_eligible = 0
    errors = []

    # Step 2: Extract global fsk token once
    print("Fetching authorization token...")
    fsk = extract_fsk_token(session, base_headers)
    if not fsk:
        print("FATAL: Failed to get fsk token. Exiting scraper.")
        return {
            "symbols_processed": 0,
            "records_saved": 0,
            "eligible_records": 0,
            "errors": [{"symbol": "ALL", "error": "Could not extract global fsk token"}],
        }
    print(f"Token acquired successfully.\n")

    for i, symbol in enumerate(symbols):
        print(f"[{i+1}/{len(symbols)}] Processing {symbol}...")

        try:
            # Step 3: Fetch dividend data from investment calendar
            ajax_url = f"https://nepsealpha.com/ajax/investment_calander/{symbol}?fsk={fsk}"
            ajax_headers = base_headers.copy()
            ajax_headers.update({
                "X-Requested-With": "XMLHttpRequest",
                "Accept": "application/json",
                "Referer": "https://nepsealpha.com/",
            })

            res = session.get(ajax_url, headers=ajax_headers, timeout=20)

            if res.status_code != 200:
                print(f"  [{symbol}] Calendar API returned status {res.status_code}")
                errors.append({"symbol": symbol, "error": f"HTTP {res.status_code}"})
                time.sleep(2)
                continue

            response_json = res.json()
            html_content = response_json.get("html", "")

            if not html_content:
                print(f"  [{symbol}] No HTML content in response.")
                time.sleep(2)
                continue

            # Step 4: Parse the dividend table
            dividends = parse_dividend_table(html_content, symbol)
            if not dividends:
                print(f"  [{symbol}] No cash/bonus dividends found.")
                time.sleep(2)
                continue

            print(f"  [{symbol}] Found {len(dividends)} dividend record(s).")

            # Deduce face value based on instrument (once per symbol)
            instrument = db.query(Company.instrument).filter(
                Company.symbol == symbol
            ).scalar()
            face_value = 10 if instrument and "Mutual Fund" in instrument else 100

            # Step 5: For each member who trades this symbol, for each dividend row
            members_for_symbol = symbol_to_members.get(symbol, [])
            for mem_id in members_for_symbol:
                for div in dividends:
                    eligible_qty = calculate_eligible_quantity(
                        db, mem_id, symbol, div["book_close_date"]
                    )

                    # Cash amount: qty * face_value * (cash_pct/100) * 0.95 (5% TDS)
                    total_cash = 0.0
                    if eligible_qty > 0 and div["cash_dividend_percent"] > 0:
                        gross_cash = eligible_qty * face_value * (div["cash_dividend_percent"] / 100)
                        total_cash = gross_cash * 0.95
                        total_eligible += 1

                    # UPSERT — save all records for complete history
                    stmt = insert(DividendIncome).values(
                        member_id=mem_id,
                        symbol=symbol,
                        fiscal_year=div["fiscal_year"],
                        cash_dividend_percent=div["cash_dividend_percent"],
                        bonus_dividend_percent=div["bonus_dividend_percent"],
                        book_close_date=div["book_close_date"],
                        eligible_quantity=eligible_qty,
                        total_cash_amount=round(total_cash, 2),
                    )

                    upsert_stmt = stmt.on_conflict_do_update(
                        index_elements=["member_id", "symbol", "fiscal_year"],
                        set_={
                            "cash_dividend_percent": stmt.excluded.cash_dividend_percent,
                            "bonus_dividend_percent": stmt.excluded.bonus_dividend_percent,
                            "book_close_date": stmt.excluded.book_close_date,
                            "eligible_quantity": stmt.excluded.eligible_quantity,
                            "total_cash_amount": stmt.excluded.total_cash_amount,
                            "updated_at": datetime.now(),
                        },
                    )

                    db.execute(upsert_stmt)
                    total_saved += 1

                    if eligible_qty > 0:
                        status = f"Qty: {eligible_qty} → Rs. {total_cash:,.2f}"
                        if div["bonus_dividend_percent"] > 0:
                            bonus_units = round(eligible_qty * div["bonus_dividend_percent"] / 100)
                            status += f" + {bonus_units} bonus"
                        print(f"    FY {div['fiscal_year']} [M{mem_id}]: Cash {div['cash_dividend_percent']}% / Bonus {div['bonus_dividend_percent']}% | {status}")

            db.commit()

        except Exception as e:
            print(f"  [{symbol}] Unexpected error: {e}")
            traceback.print_exc()
            errors.append({"symbol": symbol, "error": str(e)})
            db.rollback()

        time.sleep(2)

    print(f"\n{'=' * 60}")
    print(f"Dividend scraping complete!")
    print(f"  Total records saved/updated: {total_saved}")
    print(f"  Records with eligibility > 0: {total_eligible}")
    print(f"  Errors: {len(errors)}")
    print(f"{'=' * 60}")

    return {
        "symbols_processed": len(symbols),
        "records_saved": total_saved,
        "eligible_records": total_eligible,
        "errors": errors,
    }
