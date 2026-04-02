from curl_cffi import requests
import html
import re

session = requests.Session(impersonate='chrome')
base_headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
}

print("Fetching main page...")
res = session.get('https://nepsealpha.com/live-market', headers=base_headers, timeout=20)
unescaped = html.unescape(res.text)

print("\nSearching unescaped text for common metric patterns...")
# Let's search for "pointChange" or "percentChange" relative to "NABIL"
idx = unescaped.find("NABIL")
if idx != -1:
    print(f"Context for NABIL (Length 1000):")
    print(unescaped[idx:idx+1000])

# Look for all keys that have words like Change or Pcnt or Difference
keys = re.findall(r'\"([a-zA-Z0-9_]*change[a-zA-Z0-9_]*?)\"', unescaped, re.IGNORECASE)
print(f"\nUnique 'change' related keys found: {set(keys)}")

keys = re.findall(r'\"(p|pd)\"', unescaped)
print(f"\nShort keys found: {set(keys)}")

keys = re.findall(r'\"([a-zA-Z0-9_]*diff[a-zA-Z0-9_]*?)\"', unescaped, re.IGNORECASE)
print(f"\n'diff' related keys found: {set(keys)}")
