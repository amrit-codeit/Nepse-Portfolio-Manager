import urllib.request
import json
import os

req = urllib.request.Request('http://127.0.0.1:6767/api/members/export-credentials', headers={'X-Master-Password': 'admin123'})
try:
    with urllib.request.urlopen(req) as response:
        print('Success:', response.read().decode('utf-8'))
except urllib.error.HTTPError as e:
    print('HTTP Error:', e.code, e.read().decode('utf-8'))
except Exception as e:
    print('Error:', e)
