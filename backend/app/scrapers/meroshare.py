"""
MeroShare auto-sync scraper using Selenium.
Downloads transaction history CSV for members from MeroShare.
Runs in HEADLESS mode.

Key insight: MeroShare uses a custom <SELECT2> web component for DP selection.
The real <select> is hidden with class 'select2-hidden-accessible'.
In headless mode, the Select2 dropdown popup doesn't render, so we interact
with Select2 through its actual search UI:
  1. click the #selectBranch trigger to open the dropdown
  2. type the DP name into the rendered .select2-search__field
  3. press Enter to confirm
This fires Select2's internal (select2:select) event which Angular's adapter
listens for — keeping ngModel in sync. Direct JS manipulation of the hidden
<select> bypasses this event and leaves the form invalid.
"""

from datetime import datetime, timezone, timedelta
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.common.keys import Keys
from selenium.common.exceptions import TimeoutException, NoSuchElementException
from sqlalchemy.orm import Session
from app.models.member import Member, MeroshareCredential
from app.utils.encryption import decrypt_value
from app.services.history_parser import parse_meroshare_csv
from app.scrapers.driver_factory import create_headless_driver
import os
import time
import tempfile

DIAG_LOG = os.path.join(tempfile.gettempdir(), "meroshare_diag.log")


def log_diag(msg):
    timestamp = time.strftime("%H:%M:%S")
    with open(DIAG_LOG, "a", encoding="utf-8") as f:
        f.write(f"[{timestamp}] {msg}\n")
    print(f"[{timestamp}] {msg}")


# Initialize log
with open(DIAG_LOG, "w", encoding="utf-8") as f:
    f.write("--- MeroShare Diagnostic Log ---\n")


def sync_meroshare_for_member(db: Session, member: Member) -> dict:
    """Sync transaction history for a single member from MeroShare."""

    # Check 6-hour cooldown
    if member.last_sync_at:
        last_sync = member.last_sync_at
        if last_sync.tzinfo is None:
            last_sync = last_sync.replace(tzinfo=timezone.utc)

        if datetime.now(timezone.utc) - last_sync < timedelta(hours=6):
            log_diag(
                f"Skipping sync for {member.name}: Last sync was less than 6 hours ago.")
            return {
                "id": member.id,
                "name": member.name,
                "status": "success",
                "skipped": 0,
                "created": 0,
                "message": "Skipped (Last sync was less than 6 hours ago)",
            }

    cred = member.credentials
    if not cred:
        return {
            "id": member.id,
            "name": member.name,
            "status": "failed",
            "reason": "No credentials configured",
        }

    dp = cred.dp
    username = cred.username

    try:
        password = decrypt_value(cred.password_encrypted)
    except Exception as e:
        return {
            "id": member.id,
            "name": member.name,
            "status": "failed",
            "reason": f"Failed to decrypt password: {e}",
        }

    download_dir = os.path.join(os.getcwd(), "tmp_downloads")
    os.makedirs(download_dir, exist_ok=True)

    # Clean up any previous CSV files in the download directory
    for f in os.listdir(download_dir):
        if f.lower().endswith(".csv"):
            try:
                os.remove(os.path.join(download_dir, f))
            except OSError:
                pass

    driver = create_headless_driver(download_dir=download_dir)

    try:
        log_diag(f"Logging into MeroShare for {member.name} (DP: {dp})...")
        driver.get("https://meroshare.cdsc.com.np/#/login")
        wait = WebDriverWait(driver, 25)

        # ── Select DP ─────────────────────────────────────────────────
        # Wait for the page to fully render (selectBranch is a custom <SELECT2> tag)
        wait.until(EC.presence_of_element_located((By.ID, "selectBranch")))
        time.sleep(3)  # Allow Angular + Select2 to fully initialize

        # Interact with the Select2 widget through its actual UI.
        # This is the only approach that works in headless mode because it
        # fires Select2's internal (select2:select) event, which is what
        # Angular's ngModel adapter listens for. Manipulating the hidden
        # <select> directly does not fire this event.
        select_branch = driver.find_element(By.ID, "selectBranch")
        select_branch.click()

        dp_search = wait.until(
            EC.presence_of_element_located(
                (By.CLASS_NAME, "select2-search__field"))
        )
        dp_search.send_keys(dp)
        time.sleep(1)  # Allow Select2 filter to settle
        dp_search.send_keys(Keys.ENTER)
        log_diag(f"  DP selected: {dp}")

        # ── Enter credentials ─────────────────────────────────────────
        un_field = wait.until(
            EC.presence_of_element_located((By.ID, "username")))
        pw_field = wait.until(
            EC.presence_of_element_located((By.ID, "password")))

        un_field.send_keys(username)
        pw_field.send_keys(password)

        log_diag(f"  Actual UN: {un_field.get_attribute('value')}")
        log_diag(
            f"  Input Classes: UN={un_field.get_attribute('class')}, PW={pw_field.get_attribute('class')}")

        # Click login button
        driver.save_screenshot("meroshare_before_login.png")
        login_btn = wait.until(EC.element_to_be_clickable(
            (By.CSS_SELECTOR, "button[type='submit']")))

        log_diag(f"  Clicking login button...")
        try:
            login_btn.click()
        except Exception as e:
            log_diag(f"  Native click failed: {e}. Falling back to JS click.")
            driver.execute_script("arguments[0].click();", login_btn)

        log_diag(f"  Login submitted. Waiting for navigation...")
        driver.save_screenshot("meroshare_after_login.png")

        # ── Navigate to Transaction History ───────────────────────────
        # Wait for successful login (URL should change)
        time.sleep(5)

        if "/login" in driver.current_url:
            log_diag("  Still on login page. Checking for errors...")
            driver.save_screenshot("meroshare_login_stuck.png")

        try:
            transaction_tab = wait.until(
                EC.presence_of_element_located(
                    (By.XPATH, "//a[@href='#/transaction']"))
            )
        except TimeoutException:
            # Check if there are any error messages on the page
            # MED-09: Save diagnostics to temp directory
            ss_path = os.path.join(tempfile.gettempdir(), "meroshare_login_failed.png")
            html_path = os.path.join(tempfile.gettempdir(), "meroshare_page.html")
            
            driver.save_screenshot(ss_path)
            with open(html_path, "w", encoding="utf-8") as f:
                f.write(driver.page_source)
            
            print(f"Diagnostics saved to {ss_path} and {html_path}")
            error_msg = driver.execute_script("""
                var alerts = document.querySelectorAll('.alert, .error-msg, .toast-message, .invalid-feedback, .text-danger');
                return Array.from(alerts).map(a => a.innerText.trim()).filter(a => a).join(' | ') || 'No specific error message found on page';
            """)
            raise Exception(
                f"Login failed or took too long. Current URL: {driver.current_url}. Page error: {error_msg}")

        driver.execute_script("arguments[0].click();", transaction_tab)
        wait.until(EC.url_contains("/transaction"))
        print(f"  Transaction history page loaded")

        # ── Filter by Date ────────────────────────────────────────────
        time.sleep(2)
        try:
            date_filter = driver.find_element(
                By.XPATH, "//input[@id='radio-range' and @name='dateFilter']"
            )
            driver.execute_script("arguments[0].click();", date_filter)
        except NoSuchElementException:
            print("  Date filter not found, proceeding with default")

        # ── Download CSV ──────────────────────────────────────────────
        time.sleep(2)
        csv_button = wait.until(
            EC.presence_of_element_located((
                By.XPATH,
                "//button[contains(@class, 'btn-outline') and contains(text(), 'CSV')]",
            ))
        )
        driver.execute_script("arguments[0].click();", csv_button)
        print(f"  CSV download triggered for {member.name}")

        # Wait for file to appear in download dir
        downloaded_file = None
        start_time = time.time()
        while time.time() - start_time < 30:
            for f in os.listdir(download_dir):
                if f.lower().endswith(".csv") and not f.endswith(".crdownload"):
                    downloaded_file = f
                    break
            if downloaded_file:
                break
            time.sleep(1)

        if not downloaded_file:
            raise TimeoutException("CSV download timed out after 30 seconds")

        full_path = os.path.join(download_dir, downloaded_file)
        with open(full_path, "r", encoding="utf-8") as fh:
            csv_content = fh.read()

        # Parse and store
        parse_result = parse_meroshare_csv(db, csv_content, member.id)

        # Update last sync time
        member.last_sync_at = datetime.now(timezone.utc)
        db.commit()

        # Cleanup
        if os.path.exists(full_path):
            os.remove(full_path)

        return {
            "id": member.id,
            "name": member.name,
            "status": "success",
            "created": parse_result["created"],
            "skipped": parse_result["skipped"],
            "message": f"Processed {parse_result['created']} new, skipped {parse_result['skipped']} duplicates",
        }

    except Exception as e:
        import traceback
        err_msg = traceback.format_exc()
        print(f"Error syncing {member.name}: {e}\n{err_msg}")
        return {
            "id": member.id,
            "name": member.name,
            "status": "failed",
            "reason": err_msg,
        }
    finally:
        driver.quit()


def sync_all_meroshare(db: Session, member_ids=None) -> list:
    """Sync transaction history for all members with credentials."""
    query = (
        db.query(Member)
        .join(MeroshareCredential, Member.id == MeroshareCredential.member_id)
        .filter(Member.is_active == True)
    )
    if member_ids:
        query = query.filter(Member.id.in_(member_ids))

    members = query.all()
    results = []

    for member in members:
        res = sync_meroshare_for_member(db, member)
        results.append(res)
        time.sleep(1)

    return results
