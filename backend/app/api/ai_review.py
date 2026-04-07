"""
API routes for AI-driven portfolio review using DeepSeek-R1 (Ollama).
"""
import httpx
import json
import re
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from app.database import get_db
from app.services.portfolio_engine import get_portfolio_summary

router = APIRouter(prefix="/api/ai-review", tags=["AI Review"])

OLLAMA_URL = "http://localhost:11434/api/generate"
MODEL_NAME = "qwen3.5:4b" # Changed from deepseek to qwen3.5:4b based on local setup

@router.post("/portfolio")
async def review_portfolio(
    member_id: int = Query(None),
    member_ids: str = Query(None),
    db: Session = Depends(get_db)
):
    """
    Perform an AI analysis of the portfolio using DeepSeek-R1.
    """
    ids_list = None
    if member_ids:
        ids_list = [int(x.strip()) for x in member_ids.split(',') if x.strip()]
        
    summary = get_portfolio_summary(db, member_id, member_ids=ids_list)
    
    # Prepare data for AI
    holdings_data = []
    for h in summary.holdings:
        holdings_data.append({
            "symbol": h.symbol,
            "sector": h.sector,
            "ltp": h.ltp,
            "unrealized_pnl_pct": h.pnl_pct,
            "graham_number": h.graham_number,
            "price_to_graham": h.price_to_graham_ratio,
            "fundamental_risk": h.is_fundamental_risk,
            "technical_downtrend": h.is_technical_downtrend
        })

    system_prompt = (
        "You are a NEPSE (Nepal Stock Market) specialist. Analyze the provided portfolio "
        "containing LTP, Sector-specific risks, and Graham's Number. "
        "Identify which sectors (e.g., Banking vs Hydro) are dragging the portfolio down. "
        "Provide a 3-paragraph strategy focusing on capital preservation and sector rotation. "
        "Keep the language professional but actionable."
    )

    user_prompt = f"Portfolio Data: {json.dumps(holdings_data)}"

    payload = {
        "model": MODEL_NAME,
        "prompt": f"{system_prompt}\n\n{user_prompt}",
        "stream": False
    }

    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(OLLAMA_URL, json=payload, timeout=60.0)
            result = response.json()
            full_text = result.get("response", "")
            
            # Extract thinking process and final answer
            # DeepSeek uses <think>...</think> tags
            thinking = ""
            final_answer = full_text
            
            think_match = re.search(r'<think>(.*?)</think>', full_text, re.DOTALL)
            if think_match:
                thinking = think_match.group(1).strip()
                final_answer = re.sub(r'<think>.*?</think>', '', full_text, flags=re.DOTALL).strip()
            
            return {
                "status": "success",
                "thinking": thinking,
                "analysis": final_answer
            }
            
    except Exception as e:
        return {
            "status": "error",
            "message": f"Could not connect to Ollama: {str(e)}"
        }
