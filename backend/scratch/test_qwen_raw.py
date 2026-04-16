import asyncio
import httpx

async def test_qwen_raw():
    url = "http://localhost:11434/api/chat"
    payload = {
        "model": "qwen3:4b",
        "messages": [
            {"role": "user", "content": "Reply with a simple JSON object: {'status': 'ok'}"}
        ],
        "stream": True,
        "options": {
            "temperature": 0.3
        }
    }
    
    print(f"Connecting to Ollama for qwen3:4b (streaming)...")
    try:
        async with httpx.AsyncClient() as client:
            async with client.stream("POST", url, json=payload, timeout=60.0) as response:
                print("Status:", response.status_code)
                async for chunk in response.aiter_text():
                    print("CHUNK:", chunk.strip())
    except Exception as e:
        print("Error:", e.__class__.__name__, str(e))

if __name__ == "__main__":
    asyncio.run(test_qwen_raw())

