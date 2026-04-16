
from bs4 import BeautifulSoup
import re
import requests

url = "https://www.sharesansar.com/live-trading"
headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
}

res = requests.get(url, headers=headers)
soup = BeautifulSoup(res.text, 'html.parser')

nepse_tag = soup.find(string=re.compile("NEPSE Index", re.IGNORECASE))
if nepse_tag:
    container = nepse_tag.find_parent('div', class_='mu-list')
    print(container.prettify())
else:
    print("Not found")
