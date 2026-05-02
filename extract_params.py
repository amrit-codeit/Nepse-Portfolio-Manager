import re
from curl_cffi import requests
response = requests.get('https://nepsealpha.com/screener', impersonate='chrome')
html = response.text

with open('temp_screener_html.html', 'w', encoding='utf-8') as f:
    f.write(html)

matches = re.findall(r'name=["\']([^"\']+)["\']', html)
print('Names found:', matches)
