"""
Shared headless Chrome driver factory for all scrapers.
Provides a properly configured driver that:
- Runs in headless mode (no visible browser window)
- Has a real user-agent to avoid bot detection
- Removes webdriver fingerprint flags
- Supports optional download directory for CSV downloads
"""

from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.chrome.options import Options
from webdriver_manager.chrome import ChromeDriverManager


def create_headless_driver(download_dir: str = None) -> webdriver.Chrome:
    """
    Create a headless Chrome WebDriver instance with anti-detection measures.

    Args:
        download_dir: Optional directory for file downloads (used by MeroShare CSV)

    Returns:
        A configured Chrome WebDriver instance
    """
    options = Options()
    options.add_argument("--headless=new")
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    options.add_argument("--disable-gpu")
    options.add_argument("--window-size=1920,1080")
    # Real user-agent to prevent bot detection
    options.add_argument(
        "user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
    )
    # Remove automation flags
    options.add_experimental_option("excludeSwitches", ["enable-automation"])
    options.add_experimental_option("useAutomationExtension", False)

    if download_dir:
        prefs = {
            "download.default_directory": download_dir,
            "download.prompt_for_download": False,
            "download.directory_upgrade": True,
            "safebrowsing.enabled": True,
        }
        options.add_experimental_option("prefs", prefs)

    driver = webdriver.Chrome(
        service=Service(ChromeDriverManager().install()), options=options
    )
    # Remove webdriver flag (navigator.webdriver = undefined)
    driver.execute_cdp_cmd(
        "Page.addScriptToEvaluateOnNewDocument",
        {
            "source": "Object.defineProperty(navigator, 'webdriver', {get: () => undefined})"
        },
    )
    return driver
