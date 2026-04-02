import json
from bs4 import BeautifulSoup
from curl_cffi import requests

session = requests.Session(impersonate="chrome")
base_headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-GB,en-US;q=0.9,en;q=0.8"
}

res = session.get("https://nepsealpha.com/nepse-data", headers=base_headers, timeout=20)
soup = BeautifulSoup(res.text, "html.parser")
app_div = soup.find("div", id="nepse_app_content")
page_data = json.loads(app_div["data-page"])
_token = page_data.get("props", {}).get("smx_passport")
print("Token:", _token)

post_headers = base_headers.copy()
post_headers.update({
    "X-Requested-With": "XMLHttpRequest",
    "Accept": "application/json",
    "Referer": "https://nepsealpha.com/nepse-data"
})

payload = {
    "symbol": "ADBL",
    "specific_date": "2026-04-02",
    "start_date": "2026-03-01",
    "end_date": "2026-04-02",
    "filter_type": "date-range",
    "price_type": "unadjusted",
    "time_frame": "daily",
    "_token": _token
}

post_res = session.post(
    "https://nepsealpha.com/nepse-data", 
    headers=post_headers, 
    data=payload,
    timeout=30
)

print("Status:", post_res.status_code)
try:
    data = post_res.json()
    print("Keys:", data.keys())
    if 'data' in data:
        print("Data length:", len(data['data']))
        if data['data']:
            print("Sample:", data['data'][0])
except Exception as e:
    print("Err:", e)
    print("Text:", post_res.text[:200])
