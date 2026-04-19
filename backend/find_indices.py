from curl_cffi import requests
from bs4 import BeautifulSoup

session = requests.Session(impersonate="chrome")
res = session.get("https://www.sharesansar.com/index-history-data", timeout=20)
soup = BeautifulSoup(res.text, "html.parser")

for s in soup.find_all("select"):
    name = s.get("name", s.get("id", "unknown"))
    print(f"=== SELECT: {name} ===")
    for opt in s.find_all("option"):
        val = opt.get("value", "?")
        txt = opt.text.strip()
        if val and val != "?":
            print(f"  {val} -> {txt}")
