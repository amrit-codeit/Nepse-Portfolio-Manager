
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

# Search for the slider or container that holds indices
# Usually it's in a div with id like "market-index" or similar
# Let's look for tags that contain "NEPSE Index"
nepse_tag = soup.find(string=re.compile("NEPSE Index", re.IGNORECASE))
if nepse_tag:
    print(f"Found NEPSE Index: {nepse_tag}")
    # Walk up to find the container
    curr = nepse_tag.parent
    for i in range(5):
        print(f"Level {i}: {curr.name}, class: {curr.get('class')}")
        # Print children to see where the value is
        for child in curr.children:
            if child.name:
                print(f"  Child: {child.name}, class: {child.get('class')}, text: {child.text.strip()}")
        curr = curr.parent
        print("-" * 20)
else:
    print("Not found")
