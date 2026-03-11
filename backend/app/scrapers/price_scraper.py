"""
Live Price Scraper for NEPSE stocks.
Scrapes current trading prices from ShareSansar's today's price page.
Runs in HEADLESS mode.
"""

from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from bs4 import BeautifulSoup
from sqlalchemy.orm import Session
from app.models.price import LivePrice
from app.models.company import Company
from app.scrapers.driver_factory import create_headless_driver
from datetime import datetime, timezone
import time


def scrape_live_prices(db: Session) -> dict:
    """
    Scrape today's share prices from ShareSansar and upsert into DB.
    Returns counts of created/updated price records.
    """
    url = "https://www.sharesansar.com/today-share-price"
    data = []

    driver = create_headless_driver()

    try:
        driver.get(url)

        wait = WebDriverWait(driver, 25)
        wait.until(EC.presence_of_element_located((By.ID, "headFixed")))
        time.sleep(3)

        html = driver.page_source
        soup = BeautifulSoup(html, "html.parser")

        table = soup.find("table", id="headFixed")
        if table:
            tbody = table.find("tbody")
            if tbody:
                for row in tbody.find_all("tr"):
                    cols = row.find_all("td")
                    if len(cols) >= 10:
                        try:
                            symbol = cols[1].text.strip()
                            ltp = _parse_float(cols[7].text.strip())
                            change = _parse_float(cols[8].text.strip())
                            change_pct = _parse_float(cols[9].text.strip())
                            high = _parse_float(cols[4].text.strip())
                            low = _parse_float(cols[5].text.strip())
                            open_price = _parse_float(cols[3].text.strip())
                            volume = _parse_int(cols[11].text.strip())
                            prev_close = _parse_float(cols[12].text.strip())

                            if symbol and ltp is not None:
                                data.append({
                                    "symbol": symbol,
                                    "ltp": ltp,
                                    "change": change,
                                    "change_pct": change_pct,
                                    "high": high,
                                    "low": low,
                                    "open_price": open_price,
                                    "volume": volume,
                                    "prev_close": prev_close,
                                })
                        except Exception:
                            continue

    except Exception as e:
        print(f"Error scraping live prices: {e}")
        raise
    finally:
        driver.quit()

    # ── Database upsert ──────────────────────────────────────────────
    updated = 0
    created = 0

    for item in data:
        company = db.query(Company).filter(
            Company.symbol == item["symbol"]).first()
        if not company:
            continue

        price_record = db.query(LivePrice).filter(
            LivePrice.company_id == company.id).first()

        if price_record:
            price_record.ltp = item["ltp"]
            price_record.change = item["change"]
            price_record.change_pct = item["change_pct"]
            price_record.high = item["high"]
            price_record.low = item["low"]
            price_record.open_price = item["open_price"]
            price_record.volume = item["volume"]
            price_record.prev_close = item["prev_close"]
            price_record.updated_at = datetime.now(timezone.utc)
            updated += 1
        else:
            price_record = LivePrice(
                company_id=company.id,
                symbol=company.symbol,
                ltp=item["ltp"],
                change=item["change"],
                change_pct=item["change_pct"],
                high=item["high"],
                low=item["low"],
                open_price=item["open_price"],
                volume=item["volume"],
                prev_close=item["prev_close"],
            )
            db.add(price_record)
            created += 1

    db.commit()

    result = {
        "total_scraped": len(data),
        "created": created,
        "updated": updated,
    }
    print(
        f"Prices done — scraped: {len(data)}, created: {created}, updated: {updated}")
    return result


def _parse_float(val: str) -> float | None:
    """Safely parse a float from a string, handling commas and dashes."""
    if not val or val == "-" or val == "N/A":
        return None
    try:
        return float(val.replace(",", ""))
    except ValueError:
        return None


def _parse_int(val: str) -> int | None:
    """Safely parse an int from a string."""
    if not val or val == "-" or val == "N/A":
        return None
    try:
        return int(val.replace(",", ""))
    except ValueError:
        return None
