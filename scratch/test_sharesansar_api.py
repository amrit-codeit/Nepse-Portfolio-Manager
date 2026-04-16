
import requests
import json

urls = [
    "https://www.sharesansar.com/index-list",
    "https://www.sharesansar.com/live-trading-data",
    "https://www.sharesansar.com/market-update"
]

headers = {
    "X-Requested-With": "XMLHttpRequest",
    "Accept": "application/json",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36"
}

for url in urls:
    try:
        print(f"Testing {url}...")
        res = requests.get(url, headers=headers, timeout=10)
        print(f"Status: {res.status_code}")
        if res.status_code == 200:
            try:
                data = res.json()
                print(f"JSON Data (first 200 chars): {str(data)[:200]}")
            except:
                print(f"Not JSON response. First 100 chars: {res.text[:100]}")
    except Exception as e:
        print(f"Error testing {url}: {e}")
