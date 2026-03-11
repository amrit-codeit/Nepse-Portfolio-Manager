"""
ShareSansar Existing Issues — downloads all 8 tables to CSV using Selenium.

Requires:
    pip install selenium
    ChromeDriver matching your Chrome version (or use webdriver-manager):
    pip install webdriver-manager

Usage:
    python fetch_issues_csv.py                  # saves to ./csv_output/
    python fetch_issues_csv.py --out /my/path   # saves to a custom directory
"""

import csv
import re
import time
import argparse
from pathlib import Path

from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.chrome.service import Service
from webdriver_manager.chrome import ChromeDriverManager

URL = "https://www.sharesansar.com/existing-issues"

# (tab href, issue name, table DOM id)
TABS = [
    ("#ipo",         "IPO",         "myTableEip"),
    ("#rightshare",  "RIGHT",       "myTableErs"),
    ("#fpo",         "FPO",         "myTableEfp"),
    ("#ipolocal",    "IPO_LOCAL",   "myTableEipl"),
    ("#mutualfund",  "MUTUAL_FUND", "myTableEmf"),
    ("#bondsAndDeb", "BOND",        "myTableEbd"),
    ("#ipomigrant",  "IPO_MIGRANT", "myTableEim"),
    ("#ipoqiis",     "IPO_QIIS",    "myTableQiis"),
]

_HTML_TAG_RE = re.compile(r"<[^>]+>")


def _make_driver() -> webdriver.Chrome:
    options = webdriver.ChromeOptions()
    options.add_argument("--headless=new")
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    options.add_argument("--window-size=1920,1080")
    driver = webdriver.Chrome(
        service=Service(ChromeDriverManager().install()),
        options=options,
    )
    return driver


def _set_show_all(driver, wait: WebDriverWait, table_id: str) -> None:
    """Force DataTable to show all rows by injecting JS — avoids pagination."""
    try:
        driver.execute_script(f"$('#{table_id}').DataTable().page.len(-1).draw();")
        wait.until(EC.invisibility_of_element_located((By.ID, f"{table_id}_processing")))
        time.sleep(1)
    except Exception:
        pass  # Table may not support 'All' — pagination fallback will handle it


def _scrape_table(driver, table_id: str) -> list[list[str]]:
    """Extract all rows from a visible DataTable, handling pagination."""
    rows_data = []

    while True:
        # Wait for processing spinner to clear
        try:
            WebDriverWait(driver, 10).until(
                EC.invisibility_of_element_located((By.ID, f"{table_id}_processing"))
            )
        except Exception:
            pass

        # Scrape current page
        rows = driver.find_elements(By.CSS_SELECTOR, f"#{table_id} tbody tr")
        for row in rows:
            cols = row.find_elements(By.TAG_NAME, "td")
            if len(cols) < 2:
                continue
            text = [_HTML_TAG_RE.sub("", c.get_attribute("innerHTML") or "").strip() for c in cols]
            # Skip "No data available" placeholder rows
            if any("No data" in t for t in text):
                continue
            rows_data.append(text)

        # Try next page button
        try:
            next_btn = driver.find_element(By.CSS_SELECTOR, f"#{table_id}_next")
            if "disabled" in (next_btn.get_attribute("class") or ""):
                break
            driver.execute_script("arguments[0].click();", next_btn)
            time.sleep(1.5)
        except Exception:
            break

    return rows_data


def _get_headers(driver, table_id: str) -> list[str]:
    """Extract column headers from the table <thead>."""
    try:
        ths = driver.find_elements(By.CSS_SELECTOR, f"#{table_id} thead th")
        return [th.text.strip() for th in ths if th.text.strip()]
    except Exception:
        return []


def fetch_all_tables(driver) -> dict[str, tuple[list, list]]:
    """Returns {name: (headers, rows)} for each tab."""
    wait = WebDriverWait(driver, 20)
    driver.get(URL)
    time.sleep(2)  # Let page JS fully initialise

    results = {}

    for tab_href, name, table_id in TABS:
        print(f"Fetching {name} ({tab_href})...")
        try:
            # Click the tab
            tab = wait.until(EC.element_to_be_clickable(
                (By.CSS_SELECTOR, f"a[href='{tab_href}']")
            ))
            driver.execute_script("arguments[0].click();", tab)
            wait.until(EC.visibility_of_element_located((By.ID, table_id)))
            time.sleep(1)

            # Try to show all rows at once via DataTables JS API
            _set_show_all(driver, wait, table_id)

            headers = _get_headers(driver, table_id)
            rows    = _scrape_table(driver, table_id)

            results[name] = (headers, rows)
            print(f"  ✓ {len(rows)} rows, {len(headers)} columns")

        except Exception as e:
            print(f"  ✗ Failed: {e}")
            results[name] = ([], [])

    return results


def save_csv(path: Path, headers: list[str], rows: list[list[str]]) -> None:
    with open(path, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        if headers:
            writer.writerow(headers)
        writer.writerows(rows)


def main(out_dir: Path) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    print(f"Output directory: {out_dir.resolve()}\n")

    driver = _make_driver()
    try:
        tables = fetch_all_tables(driver)
    finally:
        driver.quit()

    summary = []
    for name, (headers, rows) in tables.items():
        csv_path = out_dir / f"{name}.csv"
        save_csv(csv_path, headers, rows)
        summary.append((name, len(rows), csv_path))
        print(f"Saved {name} → {csv_path.name} ({len(rows)} rows)")

    print("\n" + "─" * 52)
    print(f"{'Table':<15} {'Rows':>6}  {'File'}")
    print("─" * 52)
    for name, count, path in summary:
        print(f"{name:<15} {count:>6}  {path.name}")
    print("─" * 52)
    print(f"{'TOTAL':<15} {sum(c for _, c, _ in summary):>6}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Scrape ShareSansar tables to CSV.")
    parser.add_argument("--out", type=Path, default=Path("csv_output"))
    main(parser.parse_args().out)