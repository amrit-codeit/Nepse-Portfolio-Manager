"""
IPO Bot Service — cleaned-up port of legacy driver.py.
Uses Selenium headless Chrome to interact with MeroShare for IPO applications.
"""

import logging
import time
from typing import Optional
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.common.exceptions import (
    NoSuchElementException,
    StaleElementReferenceException,
    TimeoutException,
    WebDriverException,
)

logger = logging.getLogger(__name__)

MEROSHARE_URL = "https://meroshare.cdsc.com.np/#/{}"
IGNORED_EXCEPTIONS = (NoSuchElementException, StaleElementReferenceException)


def get_chrome_driver():
    """Create a headless Chrome WebDriver instance."""
    chrome_options = Options()
    chrome_options.add_argument("--headless")
    chrome_options.add_argument("--no-sandbox")
    chrome_options.add_argument("--disable-dev-shm-usage")
    chrome_options.add_argument("--disable-gpu")
    chrome_options.add_argument("--window-size=1280,720")
    chrome_options.add_argument("--log-level=3")

    try:
        from webdriver_manager.chrome import ChromeDriverManager
        service = Service(ChromeDriverManager().install())
        return webdriver.Chrome(service=service, options=chrome_options)
    except Exception:
        # Fallback: try system Chrome
        return webdriver.Chrome(options=chrome_options)


class IpoBot:
    """Headless bot for MeroShare IPO operations."""

    def __init__(self):
        self._driver = None
        self.open_issues = []

    def _ensure_driver(self):
        if not self._driver:
            self._driver = get_chrome_driver()
            self._driver.get(MEROSHARE_URL.format("login"))
        return self._driver

    def login(self, dp: str, username: str, password: str, max_retry: int = 3) -> bool:
        """Login to MeroShare with given credentials."""
        driver = self._ensure_driver()

        for attempt in range(max_retry):
            try:
                driver.get(MEROSHARE_URL.format("login"))
                WebDriverWait(driver, 30).until(
                    EC.presence_of_all_elements_located((By.NAME, "loginForm"))
                )

                # DP selection
                driver.find_element(By.ID, "selectBranch").click()
                dp_input = driver.find_element(
                    By.CLASS_NAME, "select2-search__field")
                dp_input.click()
                dp_input.send_keys(dp)
                time.sleep(0.5)
                dp_input.send_keys(Keys.ENTER)

                # Username & Password
                driver.find_element(By.ID, "username").send_keys(username)
                driver.find_element(By.ID, "password").send_keys(password)

                # Submit
                driver.find_element(
                    By.XPATH, "//button[text()='Login']").click()
                driver.implicitly_wait(2)

                # Check for errors
                if driver.find_elements(By.CLASS_NAME, "toast-error"):
                    error_text = driver.find_element(
                        By.CLASS_NAME, "toast-error").text
                    logger.warning(
                        f"Login attempt {attempt + 1} failed: {error_text}")
                    continue

                # Wait for dashboard
                WebDriverWait(driver, 30).until(
                    EC.presence_of_element_located(
                        (By.TAG_NAME, "app-dashboard"))
                )
                logger.info("Login successful")
                return True

            except TimeoutException:
                logger.warning(f"Login attempt {attempt + 1} timed out")
                continue

        return False

    def fetch_open_issues(self) -> list[dict]:
        """Navigate to ASBA and fetch available IPOs."""
        driver = self._driver
        if not driver:
            return []

        try:
            driver.get(MEROSHARE_URL.format("asba"))
            WebDriverWait(driver, 30).until(
                EC.presence_of_element_located((By.TAG_NAME, "app-asba"))
            )
            driver.implicitly_wait(3)
            WebDriverWait(driver, 30, ignored_exceptions=IGNORED_EXCEPTIONS).until(
                EC.presence_of_element_located(
                    (By.TAG_NAME, "app-applicable-issue"))
            )

            issue_elements = driver.find_elements(
                By.CLASS_NAME, "company-list")
            issues = []

            for idx, el in enumerate(issue_elements, start=1):
                try:
                    parts = el.text.split('\n')
                    if not parts or not parts[0]:
                        continue

                    issue_name = parts[0].strip() if len(
                        parts) > 0 else "Unknown"
                    issue_for = ""
                    ticker = ""
                    if len(parts) > 2:
                        issue_for = parts[2].split('(')[0].strip()
                        ticker = parts[2].split('(')[1].strip(
                            ')') if '(' in parts[2] else ""

                    issue_type = parts[3].strip() if len(parts) > 3 else ""
                    share_type = parts[4].strip() if len(parts) > 4 else ""
                    mode = parts[5].strip() if len(parts) > 5 else ""

                    can_apply = mode.lower() in ["apply", "reapply"]

                    issues.append({
                        "index": idx,
                        "name": issue_name,
                        "issued_for": issue_for,
                        "ticker": ticker.strip(),
                        "issue_type": issue_type,
                        "share_type": share_type,
                        "mode": mode,
                        "can_apply": can_apply,
                    })
                except Exception as e:
                    logger.warning(f"Failed to parse issue {idx}: {e}")

            self.open_issues = issues
            logger.info(f"Found {len(issues)} open issues")
            return issues

        except TimeoutException:
            logger.error("Timeout fetching open issues")
            return []
        except Exception as e:
            logger.error(f"Error fetching issues: {e}")
            return []

    def apply_for_issue(self, index: int, crn: str, txn_pin: str, units: int = 10) -> dict:
        """Apply for a specific IPO by index."""
        driver = self._driver
        if not driver:
            return {"status": "error", "message": "No active session"}

        try:
            # Re-navigate to ASBA to refresh
            driver.get(MEROSHARE_URL.format("asba"))
            WebDriverWait(driver, 30).until(
                EC.presence_of_element_located(
                    (By.TAG_NAME, "app-applicable-issue"))
            )
            driver.implicitly_wait(2)

            issue_elements = driver.find_elements(
                By.CLASS_NAME, "company-list")
            if index < 1 or index > len(issue_elements):
                return {"status": "error", "message": f"Invalid index {index}"}

            target = issue_elements[index - 1]
            target_text = target.text
            last_line = target_text.split('\n')[-1].strip().lower()

            if last_line not in ["apply", "reapply"]:
                return {"status": "skipped", "message": "Already applied or not available"}

            # Click Apply
            target.find_element(By.CLASS_NAME, "btn-issue").click()
            WebDriverWait(driver, 30).until(
                EC.presence_of_element_located((By.TAG_NAME, "app-issue"))
            )

            # Select bank (first available)
            driver.find_element(
                By.XPATH, '//*[@id="selectBank"]/option[2]').click()
            WebDriverWait(driver, 30).until(
                EC.presence_of_element_located(
                    (By.XPATH, '//*[@id="accountNumber"]'))
            )
            driver.find_element(
                By.XPATH, '//*[@id="accountNumber"]/option[2]').click()

            # Enter units
            units_field = driver.find_element(By.ID, "appliedKitta")
            units_field.clear()
            units_field.send_keys(str(units))
            driver.implicitly_wait(2)

            # Enter CRN
            crn_field = driver.find_element(By.ID, "crnNumber")
            crn_field.send_keys(crn)

            # Accept terms
            driver.find_element(By.ID, "disclaimer").click()

            # Proceed
            proceed_xpath = '//*[@id="main"]/div/app-issue/div/wizard/div/wizard-step[1]/form/div[2]/div/div[5]/div[2]/div/button[1]'
            WebDriverWait(driver, 30).until(
                EC.element_to_be_clickable((By.XPATH, proceed_xpath)))
            driver.find_element(By.XPATH, proceed_xpath).click()

            # Enter Transaction PIN
            WebDriverWait(driver, 30).until(
                EC.presence_of_element_located((By.ID, "transactionPIN"))
            )
            driver.find_element(By.ID, "transactionPIN").send_keys(txn_pin)

            # Apply
            apply_xpath = '//*[@id="main"]/div/app-issue/div/wizard/div/wizard-step[2]/div[2]/div/form/div[2]/div/div/div/button[1]'
            WebDriverWait(driver, 30).until(
                EC.element_to_be_clickable((By.XPATH, apply_xpath)))
            driver.find_element(By.XPATH, apply_xpath).click()

            driver.implicitly_wait(2)

            # Check result
            if driver.find_elements(By.CLASS_NAME, "toast-error"):
                error_text = driver.find_element(
                    By.CLASS_NAME, "toast-error").text
                return {"status": "error", "message": error_text}

            if driver.find_elements(By.CLASS_NAME, "toast-message"):
                msg = driver.find_element(By.CLASS_NAME, "toast-message").text
                if "successfully" in msg.lower():
                    return {"status": "success", "message": msg}

            return {"status": "unknown", "message": "Could not determine result. Please verify manually."}

        except TimeoutException:
            return {"status": "error", "message": "Operation timed out"}
        except Exception as e:
            return {"status": "error", "message": str(e)}

    def quit(self):
        """Clean up the browser session."""
        if self._driver:
            try:
                self._driver.quit()
            except Exception:
                pass
            self._driver = None
