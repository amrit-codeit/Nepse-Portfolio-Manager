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


OLLAMA_URL = "http://localhost:11434/api/generate"
MODEL_NAME = "deepseek-r1:1.5b"


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
    Reuses existing fundamental.py helpers where possible.
    """
    symbol = symbol.upper()

    # --- Fetch data in bulk (single query each, no N+1) ---
    company = db.query(Company).filter(Company.symbol == symbol).first()
    sector = company.sector if company else ""
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

    # Get LTP from live_prices table first, fallback to price_history
    ltp_row = db.query(LivePrice).filter(LivePrice.symbol == symbol).first()
    ltp = float(ltp_row.ltp) if ltp_row and ltp_row.ltp else None

    # If no live price, use latest historical close
    if ltp is None:
        latest_ph = (
            db.query(PriceHistory)
            .filter(PriceHistory.symbol == symbol)
            .order_by(PriceHistory.date.desc())
            .first()
        )
        ltp = float(latest_ph.close) if latest_ph else None

    # --- Technical indicators from price history ---
    prices = (
        db.query(PriceHistory)
        .filter(PriceHistory.symbol == symbol)
        .order_by(PriceHistory.date.desc())
        .limit(250)
        .all()
    )

    rsi_14 = None
    sma_200 = None
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

        latest = df.iloc[-1]
        rsi_val = latest.get("RSI_14")
        sma_val = latest.get("SMA_200")

        if pd.notna(rsi_val):
            rsi_14 = round(float(rsi_val), 2)
        if pd.notna(sma_val):
            sma_200 = round(float(sma_val), 2)

    if ltp and sma_200:
        ema_200_status = "Bullish" if ltp > sma_200 else "Bearish"

    # --- Graham's Number ---
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

    # --- Dividend Yield ---
    latest_div = (
        db.query(DividendIncome)
        .filter(DividendIncome.symbol == symbol)
        .order_by(DividendIncome.book_close_date.desc())
        .first()
    )
    cash_div_pct = latest_div.cash_dividend_percent if latest_div else 0
    bonus_div_pct = latest_div.bonus_dividend_percent if latest_div else 0
    cash_div_npr = (cash_div_pct / 100.0) * face_value
    dividend_yield = round((cash_div_npr / ltp) * 100, 2) if ltp and ltp > 0 else 0

    # --- Techno-Fundamental Score (0-100) ---
    score = 0
    score_breakdown = []

    # +20: ROE > 15%
    if roe_ttm and roe_ttm > 0.15:
        score += 20
        score_breakdown.append({"label": "ROE > 15%", "pts": 20, "met": True})
    else:
        score_breakdown.append({"label": "ROE > 15%", "pts": 0, "met": False})

    # +20: Sector-specific quality check
    is_bank = any(x in (sector or "").lower() for x in ["bank", "finance"])
    if is_bank and quarterly:
        npl = _parse_metric(quarterly[0].sector_metrics.get("Non Performing Loan (NPL)") if quarterly[0].sector_metrics else None)
        if npl < 2:
            score += 20
            score_breakdown.append({"label": "NPL < 2%", "pts": 20, "met": True})
        else:
            score_breakdown.append({"label": "NPL < 2%", "pts": 0, "met": False})
    else:
        # Non-bank: Profit Growth > 10%
        if len(quarterly) >= 2 and quarterly[0].net_profit and quarterly[1].net_profit and quarterly[1].net_profit > 0:
            growth = ((quarterly[0].net_profit - quarterly[1].net_profit) / abs(quarterly[1].net_profit)) * 100
            if growth > 10:
                score += 20
                score_breakdown.append({"label": "Profit Growth > 10%", "pts": 20, "met": True})
            else:
                score_breakdown.append({"label": "Profit Growth > 10%", "pts": 0, "met": False})
        else:
            score_breakdown.append({"label": "Profit Growth > 10%", "pts": 0, "met": False})

    # +20: LTP < Graham's Number (Undervalued)
    if graham_number and ltp and ltp < graham_number:
        score += 20
        score_breakdown.append({"label": "LTP < Graham Number", "pts": 20, "met": True})
    else:
        score_breakdown.append({"label": "LTP < Graham Number", "pts": 0, "met": False})

    # +20: LTP > 200-day SMA (Bullish Trend)
    if ltp and sma_200 and ltp > sma_200:
        score += 20
        score_breakdown.append({"label": "Price > 200 SMA", "pts": 20, "met": True})
    else:
        score_breakdown.append({"label": "Price > 200 SMA", "pts": 0, "met": False})

    # +20: RSI < 40 (Oversold/Value Zone)
    if rsi_14 and rsi_14 < 40:
        score += 20
        score_breakdown.append({"label": "RSI < 40 (Value Zone)", "pts": 20, "met": True})
    else:
        score_breakdown.append({"label": "RSI < 40 (Value Zone)", "pts": 0, "met": False})

    # --- Foundation Trajectories (8-quarter trend analysis) ---
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

    # Determine profit trend from available data
    profit_values = [p["value"] for p in quarterly_profits if p["value"] is not None]
    if len(profit_values) >= 4:
        recent_half = profit_values[:len(profit_values) // 2]
        older_half = profit_values[len(profit_values) // 2:]
        avg_recent = sum(recent_half) / len(recent_half)
        avg_older = sum(older_half) / len(older_half) if sum(older_half) != 0 else 1

        if avg_older != 0:
            change_pct = ((avg_recent - avg_older) / abs(avg_older)) * 100
        else:
            change_pct = 0

        if change_pct > 15:
            profit_trend = "Increasing"
        elif change_pct > -5:
            profit_trend = "Stable"
        elif change_pct > -20:
            profit_trend = "Declining"
        else:
            profit_trend = "Volatile"
    elif len(profit_values) >= 2:
        if profit_values[0] > profit_values[-1]:
            profit_trend = "Increasing"
        else:
            profit_trend = "Declining"

    # Capital trend: Are reserves growing faster than paid-up capital?
    reserve_vals = [r["value"] for r in quarterly_reserves if r["value"] is not None]
    if len(reserve_vals) >= 2:
        reserve_growth = ((reserve_vals[0] - reserve_vals[-1]) / abs(reserve_vals[-1])) * 100 if reserve_vals[-1] else 0
        capital_trend = "Growing" if reserve_growth > 5 else "Stable" if reserve_growth > -5 else "Declining"

    # --- Action Badge ---
    action = "Hold"
    if score > 70 and rsi_14 and rsi_14 < 40:
        action = "Strong Buy"
    elif is_bank and quarterly and quarterly[0].sector_metrics:
        npl_check = _parse_metric(quarterly[0].sector_metrics.get("Non Performing Loan (NPL)"))
        if npl_check > 5:
            action = "Avoid"
    elif score < 40 and ema_200_status == "Bearish":
        action = "Avoid"
    elif score > 60 and ema_200_status == "Bullish":
        action = "Accumulate"

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
        "face_value": face_value,
        "rsi_14": rsi_14,
        "sma_200": sma_200,
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
    Calls local Ollama (DeepSeek-R1:1.5b) to synthesize observations into
    a structured JSON verdict. Reuses the existing Ollama bridge pattern
    from ai_review.py.
    """
    # Build observation strings from the calculcated summary
    observations = []
    sym = summary_data["symbol"]

    if summary_data.get("graham_number") and summary_data.get("graham_discount_pct"):
        disc = summary_data["graham_discount_pct"]
        if disc > 0:
            observations.append(f"{sym} is trading at a {disc:.1f}% DISCOUNT to Graham Number ({summary_data['graham_number']})")
        else:
            observations.append(f"{sym} is trading at a {abs(disc):.1f}% PREMIUM to Graham Number ({summary_data['graham_number']})")
    else:
        observations.append(f"Graham Number is N/A (negative EPS or Book Value)")

    if summary_data.get("roe_ttm"):
        observations.append(f"ROE (TTM) is {summary_data['roe_ttm']:.1f}%")

    if summary_data.get("rsi_14"):
        rsi = summary_data["rsi_14"]
        zone = "oversold" if rsi < 30 else "value zone" if rsi < 40 else "neutral" if rsi < 60 else "overbought"
        observations.append(f"RSI ({rsi:.0f}) is in the {zone}")

    if summary_data.get("ema_200_status"):
        observations.append(f"Price is {summary_data['ema_200_status']} relative to 200-SMA")

    observations.append(f"Profit Trend (8Q): {summary_data.get('profit_trend', 'N/A')}")
    observations.append(f"Capital Trend: {summary_data.get('capital_trend', 'N/A')}")
    observations.append(f"Health Score: {summary_data.get('health_score', 0)}/100")
    observations.append(f"Dividend Yield: {summary_data.get('dividend_yield', 0):.1f}%")

    system_prompt = (
        "You are a Senior NEPSE Equity Researcher. Use the provided trend observations "
        "to generate a synthesis. Return ONLY valid JSON, no markdown, no extra text."
    )

    user_prompt = (
        f'Analyze {sym}: '
        f'Trajectories: {summary_data.get("profit_trend")}, {summary_data.get("capital_trend")}. '
        f'Technicals: RSI={summary_data.get("rsi_14")}, SMA200={summary_data.get("ema_200_status")}. '
        f'Valuation: Graham discount={summary_data.get("graham_discount_pct")}%, '
        f'PE={summary_data.get("pe_ratio")}. '
        f'Observations: {"; ".join(observations)}. '
        f'Output format: {{"verdict": "BUY/SELL/HOLD/ACCUMULATE", '
        f'"logic": "2-sentence reasoning", '
        f'"foundation": "1-sentence on company health", '
        f'"timing": "1-sentence on entry point"}}'
    )

    payload = {
        "model": MODEL_NAME,
        "prompt": f"{system_prompt}\n\n{user_prompt}",
        "stream": False,
        "format": "json",
    }

    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(OLLAMA_URL, json=payload, timeout=90.0)
            result = response.json()
            raw_text = result.get("response", "")

            # Clean DeepSeek's <think>...</think> reasoning tags
            cleaned = re.sub(r"<think>.*?</think>", "", raw_text, flags=re.DOTALL).strip()

            try:
                verdict = json.loads(cleaned)
            except json.JSONDecodeError:
                # Fallback: try to extract JSON from the text
                json_match = re.search(r'\{.*\}', cleaned, re.DOTALL)
                if json_match:
                    verdict = json.loads(json_match.group())
                else:
                    verdict = {
                        "verdict": "HOLD",
                        "logic": "AI response could not be parsed. Manual review recommended.",
                        "foundation": "Insufficient AI output.",
                        "timing": "N/A"
                    }

            return {"status": "success", **verdict}

    except Exception as e:
        return {
            "status": "error",
            "verdict": "HOLD",
            "logic": f"Could not connect to Ollama: {str(e)}",
            "foundation": "AI analysis unavailable.",
            "timing": "N/A"
        }
