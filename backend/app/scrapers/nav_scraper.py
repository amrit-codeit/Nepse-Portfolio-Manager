"""
Scraper for open-ended mutual fund NAVs.
Scrapes from ShareSansar's mutual fund NAVs page.
Runs in HEADLESS mode.
"""

from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from bs4 import BeautifulSoup
from sqlalchemy.orm import Session
from app.models.price import NavValue
from app.models.company import Company
from app.scrapers.driver_factory import create_headless_driver
from datetime import datetime, timezone
import time


def scrape_nav(db: Session) -> dict:
    """
    Scrape open-ended mutual fund NAVs from ShareSansar and upsert into DB.
    """
    url = "https://www.sharesansar.com/mutual-fund-navs"
    data = []

    driver = create_headless_driver()

    try:
        driver.get(url)

        wait = WebDriverWait(driver, 25)

        # Click the "Open End" tab via JS
        opened_tab = wait.until(
            EC.presence_of_element_located(
                (By.XPATH,
                 "//ul[@class='nav nav-tabs']/li/a[text()='Open End']")
            )
        )
        driver.execute_script("arguments[0].click();", opened_tab)

        # Wait for the table to load
        wait.until(EC.presence_of_element_located((By.ID, "myTableO")))
        time.sleep(5)

        # Parse with BeautifulSoup
        html = driver.page_source
        soup = BeautifulSoup(html, "html.parser")
        open_ended_tab = soup.find("div", id="opened")

        if open_ended_tab:
            table = open_ended_tab.find("table", id="myTableO")
            if table:
                for row in table.find("tbody").find_all("tr"):
                    cols = [td.text.strip() for td in row.find_all("td")]
                    if len(cols) >= 4:
                        scheme_name = cols[2].strip()
                        symbol = cols[1].strip()

                        # Legacy fix: NMBSBF → NMBSBFE
                        if symbol == "NMBSBF":
                            symbol = "NMBSBFE"

                        nav_val = cols[4].strip()
                        if nav_val and nav_val != "-":
                            try:
                                nav_float = float(nav_val.replace(",", ""))
                                data.append({
                                    "symbol": symbol,
                                    "name": scheme_name,
                                    "nav": nav_float
                                })
                            except ValueError:
                                pass

    except Exception as e:
        print(f"Error scraping NAV: {e}")
        raise
    finally:
        driver.quit()

    # ── Database upsert ──────────────────────────────────────────────
    updated = 0
    created_companies = 0
    created_navs = 0

    for item in data:
        company = db.query(Company).filter(
            Company.symbol == item["symbol"]).first()

        if not company:
            # If it's an open-ended fund, it might not be in NEPSE list
            company = Company(
                symbol=item["symbol"],
                name=item["name"],
                instrument="Open-End Mutual Fund",
                sector="Mutual Fund",
                status="Active"
            )
            db.add(company)
            db.flush()  # Get ID
            created_companies += 1

        nav_record = db.query(NavValue).filter(
            NavValue.company_id == company.id).first()

        if nav_record:
            nav_record.nav = item["nav"]
            nav_record.updated_at = datetime.now(timezone.utc)
            updated += 1
        else:
            nav_record = NavValue(
                company_id=company.id,
                symbol=company.symbol,
                nav=item["nav"],
            )
            db.add(nav_record)
            created_navs += 1

    db.commit()

    result = {
        "total_scraped": len(data),
        "created_companies": created_companies,
        "created_navs": created_navs,
        "updated": updated,
    }
    print(
        f"NAV done — scraped: {len(data)}, created cos: {created_companies}, created navs: {created_navs}, updated: {updated}")
    return result
