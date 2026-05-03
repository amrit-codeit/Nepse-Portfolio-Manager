"""
NEPSE Alpha Macro-Economic Data Scraper
- Fetches the Nepal Economy page from NEPSE Alpha.
- Extracts macroeconomic indicators (Real Sector, Price Change, etc.).
- Saves/updates the data in the database.
"""

import datetime
import re
from bs4 import BeautifulSoup
from curl_cffi import requests
from sqlalchemy.exc import IntegrityError

from app.database import SessionLocal
from app.models.price import EconomicIndicator

NEPSEALPHA_MACRO_URL = "https://nepsealpha.com/nepal-economy"

MONTHS_MAP = {
    "january": 1, "february": 2, "march": 3, "april": 4, "may": 5, "june": 6,
    "july": 7, "august": 8, "september": 9, "october": 10, "november": 11, "december": 12,
    "jan": 1, "feb": 2, "mar": 3, "apr": 4, "jun": 6, "jul": 7, "aug": 8, "sep": 9, "oct": 10, "nov": 11, "dec": 12
}

def parse_date_label(label: str) -> datetime.date:
    """Parses 'Mid March 2026' or 'Last March 2025' to a valid datetime.date."""
    label_lower = label.lower()
    year_match = re.search(r'\b(\d{4})\b', label)
    if not year_match:
        return None
    year = int(year_match.group(1))
    
    month = 1
    for m_name, m_val in MONTHS_MAP.items():
        if re.search(r'\b' + m_name + r'\b', label_lower):
            month = m_val
            break
            
    # Default to 15th for 'Mid'
    return datetime.date(year, month, 15)

from app.scrapers.driver_factory import create_headless_driver
import time

# ... [imports and constants remain unchanged above this block]

def scrape_nepsealpha_macro():
    print("=" * 55)
    print("NEPSE Alpha Macro-Economic Data Scraper")
    print("=" * 55)
    
    print(f"Fetching {NEPSEALPHA_MACRO_URL} via headless browser...")
    driver = None
    try:
        driver = create_headless_driver()
        driver.get(NEPSEALPHA_MACRO_URL)
        time.sleep(5)  # wait for javascript to render the table
        page_source = driver.page_source
    except Exception as e:
        raise RuntimeError(f"Failed to fetch page using Selenium: {e}")
    finally:
        if driver:
            driver.quit()
    
    soup = BeautifulSoup(page_source, "html.parser")
    target_table = None
    for tbl in soup.find_all("table"):
        if "Real GDP" in tbl.text:
            target_table = tbl
            break
            
    if not target_table:
        raise ValueError("Could not find the target table containing 'Real GDP'.")
        
    tbody = target_table.find("tbody")
    if not tbody:
        raise ValueError("Table does not contain a tbody.")
        
    header_rows = tbody.find_all("tr", class_="bg-heading-color")
    if not header_rows:
        raise ValueError("Could not find header rows with month labels.")
    
    db = SessionLocal()
    inserted_count = 0
    updated_count = 0
    
    current_category = "Unknown"
    month_labels = []
    
    try:
        rows = tbody.find_all("tr")
        for row in rows:
            if "bg-heading-color" in row.get("class", []):
                # Update category and month labels
                tds = row.find_all("td")
                if len(tds) >= 6:
                    current_category = tds[1].get_text(strip=True)
                    # Exclude the last TD which is typically 'YOY TREND'
                    month_labels = [td.get_text(strip=True) for td in tds[2:-1]]
                continue
                
            # It's a data row
            tds = row.find_all("td")
            if len(tds) < len(month_labels) + 2:
                continue
                
            indicator_name = tds[1].get_text(strip=True)
            if not indicator_name:
                continue
                
            # For each month column, parse the value
            for idx, label in enumerate(month_labels):
                col_idx = 2 + idx
                if col_idx < len(tds):
                    val_str = tds[col_idx].get_text(strip=True).replace(",", "")
                    if val_str and val_str != "-":
                        try:
                            val = float(val_str)
                            dt_val = parse_date_label(label)
                            
                            existing = db.query(EconomicIndicator).filter_by(
                                indicator_name=indicator_name,
                                date_label=label
                            ).first()
                            
                            if not existing:
                                ind = EconomicIndicator(
                                    category=current_category,
                                    indicator_name=indicator_name,
                                    date_label=label,
                                    date_value=dt_val,
                                    value=val
                                )
                                db.add(ind)
                                db.flush()
                                inserted_count += 1
                            else:
                                if existing.value != val:
                                    existing.value = val
                                    updated_count += 1
                                    
                        except ValueError:
                            # Cannot parse float (e.g. empty cell), skip
                            continue
        db.commit()
    except Exception as e:
        db.rollback()
        print(f"Error during scraping/saving: {e}")
    finally:
        db.close()
        
    print(f"Completed! Inserted {inserted_count} new records, updated {updated_count} records.")

if __name__ == "__main__":
    scrape_nepsealpha_macro()
