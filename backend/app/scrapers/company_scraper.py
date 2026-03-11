"""
Scraper for NEPSE company list.
Scrapes all listed companies from nepalstock.com.
Runs in HEADLESS mode with JS-based extraction for speed and reliability.
"""

from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import TimeoutException
from sqlalchemy.orm import Session
from app.models.company import Company
from app.scrapers.driver_factory import create_headless_driver
import time


def scrape_nepse_companies(db: Session) -> dict:
    """
    Scrape all listed companies from nepalstock.com and upsert into DB.
    Uses JS-side extraction for speed and reliability in headless mode.
    """
    url = "https://nepalstock.com/company"

    driver = create_headless_driver()

    data = []
    try:
        driver.get(url)
        wait = WebDriverWait(driver, 30)

        # Wait for the Angular app to mount and table to appear
        wait.until(EC.presence_of_element_located((By.TAG_NAME, "table")))
        print("Table found on NEPSE page")

        # Select 500 items per page and click Filter — all via JS
        # This bypasses any Angular rendering / click interception issues
        driver.execute_script("""
            var selects = document.querySelectorAll('select');
            for (var s of selects) {
                for (var i = 0; i < s.options.length; i++) {
                    if (s.options[i].value == '500') {
                        s.selectedIndex = i;
                        s.dispatchEvent(new Event('change', {bubbles: true}));
                        break;
                    }
                }
            }
            var btn = Array.from(document.querySelectorAll('button'))
                .find(b => b.innerText.trim() === 'Filter');
            if (btn) btn.click();
        """)

        # Wait for Angular to re-render
        time.sleep(5)

        # Fast extraction using JS — much faster than Selenium .text calls
        data = driver.execute_script("""
            const rows = document.querySelectorAll('table tbody tr');
            return Array.from(rows).map(row => {
                const cols = row.querySelectorAll('td');
                if (cols.length < 6) return null;
                return {
                    name: cols[1]?.innerText.trim(),
                    symbol: cols[2]?.innerText.trim(),
                    status: cols[3]?.innerText.trim(),
                    sector: cols[4]?.innerText.trim(),
                    instrument: cols[5]?.innerText.trim()
                };
            }).filter(item => item !== null && item.symbol !== "");
        """)
        print(f"Extracted {len(data)} companies from NEPSE")

    except (TimeoutException, Exception) as e:
        print(f"Company scraping failed: {str(e)}")
        raise
    finally:
        driver.quit()

    # ── Optimized Database Upsert ────────────────────────────────────
    # Fetch existing symbols into a dict for O(1) lookups
    existing_companies = {
        c.symbol: c
        for c in db.query(Company)
        .filter(Company.symbol.in_([d["symbol"] for d in data]))
        .all()
    }

    created = 0
    updated = 0

    for item in data:
        symbol = item["symbol"]
        if symbol in existing_companies:
            comp = existing_companies[symbol]
            if (
                comp.name != item["name"]
                or comp.sector != item["sector"]
                or comp.status != item["status"]
                or comp.instrument != item["instrument"]
            ):
                comp.name = item["name"]
                comp.sector = item["sector"]
                comp.instrument = item["instrument"]
                comp.status = item["status"]
                updated += 1
        else:
            new_company = Company(
                symbol=symbol,
                name=item["name"],
                sector=item["sector"],
                instrument=item["instrument"],
                status=item["status"],
            )
            db.add(new_company)
            created += 1

    db.commit()

    print(
        f"Companies done — total: {len(data)}, created: {created}, updated: {updated}")
    return {"total_scraped": len(data), "created": created, "updated": updated}
