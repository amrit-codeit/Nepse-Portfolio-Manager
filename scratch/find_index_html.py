
from bs4 import BeautifulSoup
import re

html_path = r"C:\Users\Personal\.gemini\antigravity\brain\9d53e62b-5010-4875-8ca4-b746c62e16c7\.system_generated\steps\66\content.md"
# Wait, this is markdown, not HTML. I need the original HTML.
# But read_url_content said it saved the content. 
# Usually it's converted to markdown.

# Let's try to fetch the HTML directly in a script.
import requests

url = "https://www.sharesansar.com/live-trading"
headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
}

res = requests.get(url, headers=headers)
soup = BeautifulSoup(res.text, 'html.parser')

# Search for "NEPSE Index" text
nepse_text = soup.find(string=re.compile("NEPSE Index", re.IGNORECASE))
if nepse_text:
    print(f"Found NEPSE Index text: {nepse_text}")
    parent = nepse_text.parent
    print(f"Parent tag: {parent.name}, classes: {parent.get('class')}")
    # Look around the parent
    grandparent = parent.parent
    print(f"Grandparent HTML: {grandparent.prettify()[:500]}")
else:
    print("NEPSE Index text not found in HTML.")

# Common Sharesansar index pattern:
# Usually it's in a slider or a top bar.
# Check for "index-value" or similar classes.
for tag in soup.find_all(class_=re.compile("index", re.IGNORECASE)):
    print(f"Tag with index class: {tag.name}, class: {tag.get('class')}, text: {tag.text.strip()}")
