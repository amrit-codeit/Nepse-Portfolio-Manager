"""
NRB Monthly Statistics - Macroeconomic Data Scraper
- Fetches the Monthly Statistics listing page from NRB.
- Finds the latest .xlsx download link.
- Extracts the C15 sheet and inserts Fixed Deposit Interest Rates into the database.
"""

import re
import datetime
from io import BytesIO

from bs4 import BeautifulSoup
from curl_cffi import requests
import zipfile
import xml.etree.ElementTree as ET

from sqlalchemy.exc import IntegrityError
from app.database import SessionLocal
from app.models.price import MacroData

# ---------- CONSTANTS ----------
LISTING_URL = "https://www.nrb.org.np/category/monthly-statistics/?department=bfr"

MONTHS_MAP = {
    "jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "jun": 6,
    "jul": 7, "aug": 8, "sep": 9, "oct": 10, "nov": 11, "dec": 12,
    "jly": 7, "sept": 9, "march": 3, "april": 4, "june": 6, "july": 7, "august": 8
}
# ---------------------------------

def get_latest_xlsx_url() -> str:
    print("  Fetching listing page...")
    resp = requests.get(LISTING_URL, impersonate="chrome", timeout=30)
    resp.raise_for_status()
    soup = BeautifulSoup(resp.text, "html.parser")

    # Strategy 1: Direct .xlsx links on the listing page
    xlsx_links = []
    for a in soup.find_all("a", href=True):
        href = a["href"]
        if href.lower().endswith(".xlsx"):
            xlsx_links.append(href)

    if xlsx_links:
        print(f"  Found {len(xlsx_links)} .xlsx links on listing page.")
        return xlsx_links[0]  # first = latest

    # Strategy 2: Article pages fallback
    print("  No direct .xlsx on listing page, checking article pages...")
    article_links = []
    for a in soup.find_all("a", href=True):
        href = a["href"]
        if "/bfr/" in href and href != LISTING_URL and "category" not in href:
            article_links.append(href)

    seen = set()
    unique_articles = []
    for url in article_links:
        if url not in seen:
            seen.add(url)
            unique_articles.append(url)

    for article_url in unique_articles[:5]:
        try:
            print(f"  Checking {article_url} ...")
            r2 = requests.get(article_url, impersonate="chrome", timeout=20)
            r2.raise_for_status()
            soup2 = BeautifulSoup(r2.text, "html.parser")
            for a2 in soup2.find_all("a", href=True):
                if a2["href"].lower().endswith(".xlsx"):
                    return a2["href"]
        except Exception:
            continue

    raise RuntimeError("Could not find any .xlsx download link on the NRB site.")

def download_xlsx(url: str) -> bytes:
    print(f"  Downloading {url} ...")
    resp = requests.get(url, impersonate="chrome", timeout=120)
    resp.raise_for_status()
    print(f"  Downloaded {len(resp.content):,} bytes.")
    return resp.content

def parse_date_str(date_str: str) -> datetime.date:
    """Parse '(Mid Jul, 2013)' to a datetime.date object."""
    m = re.search(r'Mid\s+([A-Za-z]+),?\s+(\d{4})', date_str, re.IGNORECASE)
    if m:
        month_str, year_str = m.groups()
        month_val = MONTHS_MAP.get(month_str.lower(), 1)
        return datetime.date(int(year_str), month_val, 15)
    return None

def extract_c15_to_db(excel_bytes: bytes) -> int:
    NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
    RELS_NS = "http://schemas.openxmlformats.org/package/2006/relationships"

    zf = zipfile.ZipFile(BytesIO(excel_bytes))

    shared_strings = []
    if "xl/sharedStrings.xml" in zf.namelist():
        ss_tree = ET.parse(zf.open("xl/sharedStrings.xml"))
        for si in ss_tree.findall(f"{{{NS}}}si"):
            parts = []
            t_el = si.find(f"{{{NS}}}t")
            if t_el is not None and t_el.text:
                parts.append(t_el.text)
            else:
                for r in si.findall(f".//{{{NS}}}t"):
                    if r.text:
                        parts.append(r.text)
            shared_strings.append("".join(parts))

    wb_tree = ET.parse(zf.open("xl/workbook.xml"))
    sheets_el = wb_tree.findall(f".//{{{NS}}}sheet")

    rid_to_name = {}
    for s in sheets_el:
        rid = s.attrib.get(f"{{{RELS_NS.replace('/package/', '/officeDocument/')}}}"
                           "id", s.attrib.get("r:id", ""))
        if not rid:
            for k, v in s.attrib.items():
                if k.endswith("}id") or k == "r:id":
                    rid = v
                    break
        rid_to_name[rid] = s.attrib["name"]

    rels_tree = ET.parse(zf.open("xl/_rels/workbook.xml.rels"))
    rid_to_file = {}
    for rel in rels_tree.findall(f"{{{RELS_NS}}}Relationship"):
        rid_to_file[rel.attrib["Id"]] = "xl/" + rel.attrib["Target"]

    name_to_file = {}
    for rid, name in rid_to_name.items():
        if rid in rid_to_file:
            name_to_file[name] = rid_to_file[rid]

    target_name = None
    for name in name_to_file:
        if name.strip().upper() == "C15":
            target_name = name
            break
    if target_name is None:
        for name in name_to_file:
            if "c15" in name.lower():
                target_name = name
                break
    if target_name is None:
        raise ValueError(f"Sheet 'C15' not found. Available sheets: {list(name_to_file.keys())}")

    sheet_file = name_to_file[target_name]
    print(f"  Sheet found: '{target_name}' -> {sheet_file}")

    sheet_tree = ET.parse(zf.open(sheet_file))
    sheet_data = sheet_tree.findall(f".//{{{NS}}}sheetData/{{{NS}}}row")

    def cell_value(cell_el):
        v_el = cell_el.find(f"{{{NS}}}v")
        is_el = cell_el.find(f"{{{NS}}}is")
        cell_type = cell_el.attrib.get("t", "")
        if cell_type == "s" and v_el is not None and v_el.text is not None:
            idx = int(v_el.text)
            return shared_strings[idx] if idx < len(shared_strings) else ""
        elif cell_type == "inlineStr" and is_el is not None:
            t_el = is_el.find(f"{{{NS}}}t")
            return t_el.text if t_el is not None else ""
        elif v_el is not None and v_el.text is not None:
            return v_el.text
        return ""

    def col_letter_to_index(col_str):
        result = 0
        for ch in col_str:
            result = result * 26 + (ord(ch.upper()) - ord('A') + 1)
        return result - 1

    rows = []
    max_col = 0
    for row_el in sheet_data:
        cells = row_el.findall(f"{{{NS}}}c")
        row_dict = {}
        for c in cells:
            ref = c.attrib.get("r", "")
            col_letters = re.match(r"([A-Z]+)", ref)
            if col_letters:
                col_idx = col_letter_to_index(col_letters.group(1))
                row_dict[col_idx] = cell_value(c)
                if col_idx + 1 > max_col:
                    max_col = col_idx + 1
        rows.append(row_dict)

    date_row = None
    fixed_row = None
    for r in rows:
        row = [r.get(i, "") for i in range(max_col)]
        if not date_row:
            if len([str(c) for c in row if "(Mid" in str(c)]) > 5:
                date_row = row
        if not fixed_row:
            if len(row) > 2 and "Fixed:" in str(row[2]):
                fixed_row = row

    if not date_row or not fixed_row:
        raise ValueError("Could not find the date row or the 'Fixed:' interest rate row.")

    extracted_data = []
    for i in range(3, len(date_row), 2):
        date_str = str(date_row[i]).strip()
        rate_str = str(fixed_row[i]).strip()
        if not date_str or not rate_str:
            continue
        try:
            rate = float(rate_str)
            parsed_date = parse_date_str(date_str)
            if parsed_date:
                extracted_data.append((parsed_date, parsed_date.year, rate))
        except ValueError:
            continue

    db = SessionLocal()
    inserted_count = 0
    seen_dates = set()
    try:
        for dt, yr, rate in extracted_data:
            # Skip if we already processed this date in this batch
            if dt in seen_dates:
                continue
            seen_dates.add(dt)
            
            existing = db.query(MacroData).filter(MacroData.date == dt).first()
            if not existing:
                md = MacroData(date=dt, year=yr, fixed_deposit_rate=rate)
                db.add(md)
                db.flush()  # Flush so the next iteration sees it if queried
                inserted_count += 1
            else:
                if existing.fixed_deposit_rate != rate:
                    existing.fixed_deposit_rate = rate
                    inserted_count += 1
        db.commit()
    except Exception as e:
        db.rollback()
        print(f"Error saving to DB: {e}")
    finally:
        db.close()

    print(f"  Saved/Updated {inserted_count} new records in the database.")
    return inserted_count

def scrape_nrb_macro_data():
    print("=" * 55)
    print("NRB Macro Data Scraper - Starting")
    print("=" * 55)
    xlsx_url = get_latest_xlsx_url()
    xlsx_bytes = download_xlsx(xlsx_url)
    extract_c15_to_db(xlsx_bytes)
    print("Done.\n")

if __name__ == "__main__":
    scrape_nrb_macro_data()
