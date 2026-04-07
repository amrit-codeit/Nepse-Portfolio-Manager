"""
Executive Summary Engine — synthesizes technical, fundamental, and AI 
analysis into a single 'Complete Picture' for a NEPSE stock.
"""
import math
import re
import json
import httpx
from sqlalchemy.orm import Session
from app.models.price import PriceHistory, LivePrice
from app.models.fundamental import StockOverview, FundamentalReport
from app.models.company import Company
from app.models.dividend import DividendIncome
import pandas as pd
import pandas_ta as ta

OLLAMA_URL = "http://127.0.0.1:11434/api/generate"
MODEL_NAME = "qwen2.5:3b-instruct-q4_0"

def _parse_metric(val, default=0):
    """Safely parse a metric that may be a string with % or commas."""
    if val is None:
        return default
    if isinstance(val, (int, float)):
        return float(val)
    if isinstance(val, str):
        val = val.replace(",", "").replace("%", "").strip()
        try:
            return float(val)
        except ValueError:
            return default
    return default

def calculate_executive_summary(db: Session, symbol: str) -> dict:
    """
    Core calculation engine. Produces all metrics for the Executive Summary tab.
    Includes sector-specific risk assessment for NEPSE.
    """
    symbol = symbol.upper()

    company = db.query(Company).filter(Company.symbol == symbol).first()
    sector = company.sector if company else ""
    sector_lower = sector.lower() if sector else ""
    instrument = company.instrument if company else "Equity"
    face_value = 10 if instrument and "Mutual Fund" in instrument else 100

    overview = db.query(StockOverview).filter_by(symbol=symbol).first()
    quarterly = (
        db.query(FundamentalReport)
        .filter_by(symbol=symbol)
        .order_by(FundamentalReport.quarter.desc())
        .limit(8)
        .all()
    )

    ltp_row = db.query(LivePrice).filter(LivePrice.symbol == symbol).first()
    ltp = float(ltp_row.ltp) if ltp_row and ltp_row.ltp else None

    if ltp is None:
        latest_ph = (
            db.query(PriceHistory)
            .filter(PriceHistory.symbol == symbol)
            .order_by(PriceHistory.date.desc())
            .first()
        )
        ltp = float(latest_ph.close) if latest_ph else None

    prices = (
        db.query(PriceHistory)
        .filter(PriceHistory.symbol == symbol)
        .order_by(PriceHistory.date.desc())
        .limit(250)
        .all()
    )

    # --- Technical Calculations ---
    rsi_14 = None
    sma_200 = None
    sma_50 = None
    ema_200_status = None

    if prices and len(prices) >= 50:
        prices_chrono = prices[::-1]
        df = pd.DataFrame([{
            "close": float(p.close),
            "high": float(p.high),
            "low": float(p.low),
        } for p in prices_chrono])

        df.ta.rsi(length=14, append=True)
        df.ta.sma(length=200, append=True)
        df.ta.sma(length=50, append=True) # Added SMA 50 for the new scoring engine

        latest = df.iloc[-1]
        rsi_val = latest.get("RSI_14")
        sma_200_val = latest.get("SMA_200")
        sma_50_val = latest.get("SMA_50")

        if pd.notna(rsi_val):
            rsi_14 = round(float(rsi_val), 2)
        if pd.notna(sma_200_val):
            sma_200 = round(float(sma_200_val), 2)
        if pd.notna(sma_50_val):
            sma_50 = round(float(sma_50_val), 2)

    if ltp and sma_200:
        ema_200_status = "Bullish" if ltp > sma_200 else "Bearish"

    # --- Fundamental Calculations ---
    eps = overview.eps_ttm if overview else None
    bvps = overview.book_value if overview else None
    roe_ttm = overview.roe_ttm if overview else None
    pe_ratio = overview.pe_ratio if overview else None

    graham_number = None
    graham_discount_pct = None

    if eps and bvps and eps > 0 and bvps > 0:
        graham_number = round(math.sqrt(22.5 * eps * bvps), 2)
        if ltp and graham_number > 0:
            graham_discount_pct = round(((graham_number - ltp) / graham_number) * 100, 2)

    # --- Dividend History & Yield ---
    div_records = (
        db.query(DividendIncome)
        .filter(DividendIncome.symbol == symbol)
        .order_by(DividendIncome.book_close_date.desc())
        .limit(5)
        .all()
    )

    dividend_history = [
        {
            "fy": r.fiscal_year,
            "cash": r.cash_dividend_percent,
            "bonus": r.bonus_dividend_percent,
            "date": r.book_close_date.isoformat() if r.book_close_date else None
        }
        for r in div_records
    ]

    latest_div = div_records[0] if div_records else None
    cash_div_pct = latest_div.cash_dividend_percent if latest_div else 0
    bonus_div_pct = latest_div.bonus_dividend_percent if latest_div else 0
    cash_div_npr = (cash_div_pct / 100.0) * face_value
    dividend_yield = round((cash_div_npr / ltp) * 100, 2) if ltp and ltp > 0 else 0

    # =========================================================
    # --- Professional NEPSE Scoring Engine (0-100) ---
    # =========================================================
    score = 0
    score_breakdown = []

    # 1. DIVIDEND CAPACITY (25 pts) - The "NEPSE Fuel"
    if dividend_yield > 5 or (roe_ttm and roe_ttm > 0.12):
        score += 25
        score_breakdown.append({"label": "High Dividend Capacity/ROE", "pts": 25, "met": True})
    else:
        score_breakdown.append({"label": "Low Dividend Capacity", "pts": 0, "met": False})

    # 2. SECTOR QUALITY (20 pts)
    if any(x in sector_lower for x in ["bank", "finance", "microfinance"]):
        npl = _parse_metric(quarterly[0].sector_metrics.get("Non Performing Loan (NPL)") if quarterly and quarterly[0].sector_metrics else None, 99)
        if npl < 3:
            score += 20
            score_breakdown.append({"label": f"NPL Quality ({npl}%)", "pts": 20, "met": True})
        else:
            score_breakdown.append({"label": "High NPL Risk", "pts": 0, "met": False})
    elif "hydro" in sector_lower:
        res_val = _parse_metric(quarterly[0].sector_metrics.get("Reserves and Surplus") if quarterly and quarterly[0].sector_metrics else None, -1)
        if res_val > 0:
            score += 20
            score_breakdown.append({"label": "Positive Reserves (Hydro)", "pts": 20, "met": True})
        else:
            score_breakdown.append({"label": "Negative Reserves (Hydro)", "pts": 0, "met": False})
    else:
        # Others: Check for Profit Growth (Safe handling for None types)
        if len(quarterly) >= 2 and quarterly[0].net_profit and quarterly[1].net_profit and quarterly[0].net_profit > quarterly[1].net_profit:
            score += 20
            score_breakdown.append({"label": "Growing Net Profit", "pts": 20, "met": True})
        else:
            score_breakdown.append({"label": "Stagnant Profit", "pts": 0, "met": False})

    # 3. VALUATION FIT (20 pts) - Sector Dependent
    if any(x in sector_lower for x in ["bank", "finance", "microfinance"]):
        # Banks/Finance: Use Graham's Number
        if graham_number and ltp and ltp < graham_number:
            score += 20
            score_breakdown.append({"label": "Below Graham Value", "pts": 20, "met": True})
        else:
            score_breakdown.append({"label": "Above Graham Value", "pts": 0, "met": False})
    else:
        # Hydro/Others: Use Price-to-Book (PBV)
        pbv = (ltp / bvps) if ltp and bvps else 5
        if pbv < 2.5:
            score += 20
            score_breakdown.append({"label": f"PBV Ratio < 2.5 ({round(pbv,2)})", "pts": 20, "met": True})
        else:
            score_breakdown.append({"label": f"High PBV ({round(pbv,2)})", "pts": 0, "met": False})

    # 4. TREND MASTERY (20 pts) - 200 SMA (10) + 50 SMA (10)
    if ltp and sma_200 and ltp > sma_200:
        score += 10
        if ltp and sma_50 and ltp > sma_50:
            score += 10
            score_breakdown.append({"label": "Full Bullish Trend (50 & 200 SMA)", "pts": 20, "met": True})
        else:
            score_breakdown.append({"label": "Long-term Bullish Only", "pts": 10, "met": True})
    else:
        score_breakdown.append({"label": "Bearish Trend", "pts": 0, "met": False})

    # 5. ENTRY TIMING (15 pts) - The RSI Sweet Spot
    if rsi_14:
        if 40 <= rsi_14 <= 65: # The "Accumulation" Zone
            score += 15
            score_breakdown.append({"label": "RSI Sweet Spot (40-65)", "pts": 15, "met": True})
        elif rsi_14 < 40: # Oversold - Good but risky
            score += 7
            score_breakdown.append({"label": "RSI Oversold (Early)", "pts": 7, "met": True})
        else:
            score_breakdown.append({"label": "RSI Overbought", "pts": 0, "met": False})

    # =========================================================
    
    # --- Trajectory Analysis ---
    profit_trend = "N/A"
    capital_trend = "N/A"
    quarterly_profits = []
    quarterly_reserves = []

    for q in quarterly:
        quarterly_profits.append({"quarter": q.quarter, "value": q.net_profit})
        reserves = None
        if q.sector_metrics:
            reserves = q.sector_metrics.get("Reserves and Surplus") or q.sector_metrics.get("Reserve and Surplus")
        quarterly_reserves.append({"quarter": q.quarter, "value": _parse_metric(reserves, None)})

    profit_values = [p["value"] for p in quarterly_profits if p["value"] is not None]
    if len(profit_values) >= 4:
        recent_half = profit_values[:len(profit_values) // 2]
        older_half = profit_values[len(profit_values) // 2:]
        avg_recent = sum(recent_half) / len(recent_half)
        avg_older = sum(older_half) / len(older_half) if sum(older_half) != 0 else 1

        change_pct = ((avg_recent - avg_older) / abs(avg_older)) * 100 if avg_older != 0 else 0

        if change_pct > 15:
            profit_trend = "Increasing"
        elif change_pct > -5:
            profit_trend = "Stable"
        elif change_pct > -20:
            profit_trend = "Declining"
        else:
            profit_trend = "Volatile"
    elif len(profit_values) >= 2:
        profit_trend = "Increasing" if profit_values[0] > profit_values[-1] else "Declining"

    reserve_vals = [r["value"] for r in quarterly_reserves if r["value"] is not None]
    if len(reserve_vals) >= 2:
        reserve_growth = ((reserve_vals[0] - reserve_vals[-1]) / abs(reserve_vals[-1])) * 100 if reserve_vals[-1] else 0
        capital_trend = "Growing" if reserve_growth > 5 else "Stable" if reserve_growth > -5 else "Declining"

    # --- Final Action Logic ---
    action = "Hold"
    if score >= 80:
        action = "Strong Buy"
    elif score <= 20 and ema_200_status == "Bearish":
        action = "Strong Sell"
    elif score > 60 and ema_200_status == "Bullish":
        action = "Accumulate"
    elif score < 40:
        action = "Avoid/Reduce"

    return {
        "symbol": symbol,
        "sector": sector,
        "ltp": ltp,
        "graham_number": graham_number,
        "graham_discount_pct": graham_discount_pct,
        "eps_ttm": eps,
        "bvps": bvps,
        "pe_ratio": pe_ratio,
        "roe_ttm": round(roe_ttm * 100, 2) if roe_ttm else None,
        "dividend_yield": dividend_yield,
        "cash_dividend_pct": cash_div_pct,
        "bonus_dividend_pct": bonus_div_pct,
        "dividend_history": dividend_history,
        "face_value": face_value,
        "rsi_14": rsi_14,
        "sma_200": sma_200,
        "sma_50": sma_50,
        "ema_200_status": ema_200_status,
        "health_score": score,
        "score_breakdown": score_breakdown,
        "profit_trend": profit_trend,
        "capital_trend": capital_trend,
        "quarterly_profits": quarterly_profits[:8],
        "quarterly_reserves": quarterly_reserves[:8],
        "action": action,
    }

async def get_ai_verdict(summary_data: dict) -> dict:
    """
    Calls local Ollama (qwen) to synthesize deep observations into a structured JSON verdict.
    Optimized to feed specific fundamental strengths, risks, and raw quarterly data to the AI.
    """
    sym = summary_data["symbol"]
    sector = summary_data.get("sector", "N/A")
    
    # 1. Extract Exact Strengths and Risks from our Scoring Engine
    # This is the "secret sauce" - we tell the AI exactly what is fundamentally good or bad.
    strengths = [item['label'] for item in summary_data.get('score_breakdown', []) if item['met']]
    risks = [item['label'] for item in summary_data.get('score_breakdown', []) if not item['met']]
    
    # 2. Build Quarterly Profit Context
    q_profits = summary_data.get("quarterly_profits", [])
    if len(q_profits) >= 2:
        latest_profit = q_profits[0]['value']
        oldest_profit = q_profits[-1]['value']
        profit_context = f"Latest Quarter Net Profit: {latest_profit:,.2f}. Oldest Recorded Quarter: {oldest_profit:,.2f}."
    else:
        profit_context = "Insufficient historical quarterly profit data."

    # 3. Calculate Price-to-Book for context
    if summary_data.get("ltp") and summary_data.get("bvps") and summary_data["bvps"] != 0:
        pbv = round(summary_data["ltp"] / summary_data["bvps"], 2)
    else:
        pbv = "N/A"

    # 4. Data-Rich Feed for 3B GPU Model
    user_prompt = (
        f"Symbol: {sym} ({sector}). LTP: Rs {summary_data.get('ltp')}.\n"
        f"Metrics: PE:{summary_data.get('pe_ratio')}, RSI:{summary_data.get('rsi_14')}, "
        f"Graham Disc:{summary_data.get('graham_discount_pct')}%, PBV:{pbv}.\n"
        f"Strengths: {', '.join(strengths)}. Risks: {', '.join(risks)}.\n"
        f"Trajectories: Profit:{summary_data.get('profit_trend')}, Capital:{summary_data.get('capital_trend')}."
    )

    # 5. Descriptive Instructions
    system_prompt = (
        "You are an elite NEPSE Portfolio Manager. Analyze the metrics and generate a structured summary. "
        "Explicitly reference P/E, RSI, or Graham Numbers to justify your points. "
        "Respond ONLY in valid JSON. Keys: verdict (BUY|SELL|HOLD|ACCUMULATE), logic, foundation, timing."
    )

    payload = {
        "model": MODEL_NAME,
        "prompt": f"{system_prompt}\n\n{user_prompt}",
        "stream": False,
        "format": "json" 
    }

    try:
        async with httpx.AsyncClient() as client:
            # High timeout for memory-strained systems
            response = await client.post(OLLAMA_URL, json=payload, timeout=180.0) 
            if response.status_code != 200:
                raise ValueError(f"Ollama server error ({response.status_code})")

            result = response.json()
            raw_text = result.get("response", "").strip()

            if not raw_text:
                raise ValueError("AI returned blank. System may be out of memory.")

            # Step 1: Clean out reasoning/<think> tags
            clean_text = re.sub(r'<think>.*?</think>', '', raw_text, flags=re.DOTALL).strip()
            
            # Step 2: Strip markdown fences if present
            clean_text = re.sub(r'```(?:json)?\s*(.*?)\s*```', r'\1', clean_text, flags=re.DOTALL)

            try:
                verdict = json.loads(clean_text)
            except json.JSONDecodeError:
                # Last resort: extract first JSON object
                match = re.search(r'(\{.*\})', clean_text, re.DOTALL)
                if match:
                    try:
                        verdict = json.loads(match.group(1))
                    except:
                        verdict = None
                else: verdict = None

            if not verdict:
                return {
                    "status": "error",
                    "logic": "Analysis completed, but the AI response was in an unreadable format.",
                    "verdict": "N/A",
                    "foundation": "N/A",
                    "timing": "N/A"
                }

            # Step 3: Normalize keys (case-insensitive) to protect against 2B variability
            required_keys = ["verdict", "logic", "foundation", "timing"]
            normalized_verdict = {}
            for target_key in required_keys:
                # Find the key in the returned dict regardless of case
                actual_key = next((k for k in verdict.keys() if k.lower() == target_key), None)
                if actual_key:
                    normalized_verdict[target_key] = verdict[actual_key]
                else:
                    normalized_verdict[target_key] = "Information not provided by AI."

            return {"status": "success", **normalized_verdict}

    except httpx.ReadTimeout:
        return {
            "status": "error",
            "logic": "AI generation timed out. Your system might be low on memory/RAM.",
            "verdict": "TIMEOUT",
            "foundation": "N/A",
            "timing": "N/A"
        }
    except Exception as e:
        return {
            "status": "error",
            "verdict": "ERROR",
            "logic": f"Local AI Error: {str(e)}",
            "foundation": "System error.",
            "timing": "N/A"
        }