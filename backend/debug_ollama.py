import httpx
import json

def test_ollama():
    url = "http://127.0.0.1:11434/api/generate"
    payload = {
        "model": "qwen2.5:3b-instruct-q4_0",
        "prompt": "Return JSON: {''test'': ''ok''}",
        "stream": False,
        "format": "json"
    }
    
    print(f"Calling Ollama at {url}...")
    try:
        r = httpx.post(url, json=payload, timeout=60.0)
        print(f"Status: {r.status_code}")
        print(f"Body: {r.text[:500]}...")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    test_ollama()
