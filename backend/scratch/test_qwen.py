import sys
import os
import requests
import json
sys.path.append(os.getcwd())
from app.services.analysis.ai_service import AIService

url = 'http://127.0.0.1:11434/api/chat'

def test_model(model):
    print(f"\n--- Testing {model} ---")
    
    # Mock realistic input data
    input_data = {
        "symbol": "NABIL",
        "health_score": 62,
        "scoring_action": "HOLD",
        "ttm": {"eps": 18.2, "bvps": 210.5},
        "indicators": {"rsi": 54, "sma_50": 510, "sma_200": 480, "ltp": 505},
        "sector_metrics": {"npl": 4.1, "car": 12.5}
    }
    
    system_prompt = (
            "You are a NEPSE stock analyst. TASK: Return ONLY a raw JSON object. NO CONVERSATION.\n"
            "VERDICT CONTEXT: Scoring engine rated this stock as HOLD (62/100).\n\n"
            "JSON STRUCTURE:\n"
            "{\n"
            ' "verdict": "BUY|SELL|HOLD|ACCUMULATE",\n'
            ' "logic": "2-3 professional sentences",\n'
            ' "foundation": "Fundamental analysis points",\n'
            ' "timing": "Technical analysis/Entry point"\n'
            "}"
        )
    
    user_prompt = f"Data:\n{json.dumps(input_data, indent=None, default=str)}"

    data = {
        'model': model,
        'messages': [
            {'role': 'system', 'content': system_prompt},
            {'role': 'user', 'content': user_prompt}
        ],
        'stream': False,
        'format': 'json',
        'options': {'temperature': 0.1, 'num_predict': 1024, 'num_ctx': 4096}
    }
    try:
        r = requests.post(url, json=data, timeout=120)
        if r.status_code == 200:
            content = r.json().get('message', {}).get('content', '')
            print("RAW CONTENT RECEIVED")
            print(repr(content))
            
            # Test the new robust parsing
            clean = AIService._strip_thinking(content)
            parsed = AIService._parse_robust_json(clean)
            if parsed:
                print("PARSE SUCCESSFUL")
                print(json.dumps(parsed, indent=2))
            else:
                print("PARSE FAILED")
        else:
            print("Error:", r.text)
    except Exception as e:
        print(f"Exception: {e}")

# test_model('qwen3:4b') # slow
test_model('qwen2.5:3b-instruct-q4_0')
test_model('gemma3:4b')
