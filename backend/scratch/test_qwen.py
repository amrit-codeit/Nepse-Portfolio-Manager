import asyncio
import json
import sys
import os

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from app.services.analysis.ai_service import AIService

VALUE_DATA = {
    "symbol": "NABIL",
    "sector": "Commercial Banks",
    "pe": 18.4,
    "profit_trend": "Improving",
    "health_score": 78
}

async def run_test():
    model = "qwen3:4b"
    print(f"\n[Value] Calling get_value_verdict for {model}...")
    res_v = await AIService.get_value_verdict(VALUE_DATA, model_name=model)
    print(f"VERDICT: {res_v.get('verdict')}")
    print(f"ANALYSIS: {res_v.get('analysis')}")

if __name__ == "__main__":
    asyncio.run(run_test())
