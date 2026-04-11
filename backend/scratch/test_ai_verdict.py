import httpx
import json
import asyncio

async def test_ai():
    url = "http://localhost:8000/api/analysis/summary/NABIL/ai-verdict"
    print(f"Testing {url} with qwen2.5:3b-instruct-q4_0")
    
    async with httpx.AsyncClient() as client:
        response = await client.post(url, params={"model": "qwen2.5:3b-instruct-q4_0"}, timeout=120)
        print(f"Status: {response.status_code}")
        print(json.dumps(response.json(), indent=2))
        
        print("\n\nTesting with gemma3:4b")
        response_gemma = await client.post(url, params={"model": "gemma3:4b"}, timeout=120)
        print(f"Status: {response_gemma.status_code}")
        print(json.dumps(response_gemma.json(), indent=2))

asyncio.run(test_ai())
