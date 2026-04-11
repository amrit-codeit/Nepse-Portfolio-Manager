"""
Executive Summary Engine — synthesizes technical, fundamental, and AI 
analysis into a single 'Complete Picture' for a NEPSE stock.
"""
import math
from sqlalchemy.orm import Session
from app.models.price import PriceHistory, LivePrice
from app.models.fundamental import StockOverview, FundamentalReport, QuarterlyGrowth
from app.models.company import Company
from app.models.dividend import DividendIncome
from app.services.analysis.ai_service import AIService
from app.config import settings
import pandas as pd
import pandas_ta as ta


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

    # Fetch latest growths to get the most recent quarter's growth metrics
    latest_growths = (
        db.query(QuarterlyGrowth)
        .filter_by(symbol=symbol)
        .order_by(QuarterlyGrowth.fiscal_year.desc(), QuarterlyGrowth.quarter.desc())
        .limit(20) # enough to grab metrics for the latest quarter
        .all()
    )
    growth_dict = {g.particulars: g.value for g in latest_growths if latest_growths and g.fiscal_year == latest_growths[0].fiscal_year and g.quarter == latest_growths[0].quarter}

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
        df.ta.sma(length=50, append=True)

        latest = df.iloc[-1]
        rsi_val = latest.get("RSI_14")
        sma_200_val = latest.get("SMA_200")
        sma_50_val = latest.get("SMA_50")

        if pd.notna(rsi_val):
            rsi_14 = round(float(rsi_val), 3)
        if pd.notna(sma_200_val):
            sma_200 = round(float(sma_200_val), 3)
        if pd.notna(sma_50_val):
            sma_50 = round(float(sma_50_val), 3)

    if ltp and sma_200:
        ema_200_status = "Bullish" if ltp > sma_200 else "Bearish"

    # --- 52-Week Range ---
    high_52w = None
    low_52w = None
    placement_52w = None
    if prices and len(prices) > 0 and ltp is not None:
        high_52w = max(float(p.high or p.close) for p in prices)
        low_52w = min(float(p.low or p.close) for p in prices)
        if high_52w > low_52w:
            placement_52w = round(((ltp - low_52w) / (high_52w - low_52w)) * 100, 2)

    # --- Fundamental Calculations ---
    eps = overview.eps_ttm if overview else None
    bvps = overview.book_value if overview else None
    roe_ttm = overview.roe_ttm if overview else None
    pe_ratio = overview.pe_ratio if overview else None
    pb_ratio = overview.pb_ratio if overview else None
    net_profit_ttm = overview.net_profit_ttm if overview else None

    graham_number = None
    graham_discount_pct = None

    if eps and bvps and eps > 0 and bvps > 0:
        graham_number = round(math.sqrt(22.5 * eps * bvps), 3)
        if ltp and graham_number > 0:
            graham_discount_pct = round(((graham_number - ltp) / graham_number) * 100, 3)

    # --- Growth Ratios (NPM, PEG, Revenue) ---
    npm = growth_dict.get('net_margin_ttm')
    revenue_ttm = growth_dict.get('revenue_ttm')
    peg_ratio = None
    eps_growth = growth_dict.get('eps_yoy_growth')
    if pe_ratio and eps_growth and eps_growth > 0:
        peg_ratio = round(pe_ratio / eps_growth, 3)

    # --- Sector-Specific Metrics ---
    # Extract from latest quarterly sector_metrics
    latest_sector = quarterly[0].sector_metrics if quarterly and quarterly[0].sector_metrics else {}
    
    npl = _parse_metric(latest_sector.get("NPL"), None)
    car = _parse_metric(latest_sector.get("CAR"), None)
    cost_of_funds = _parse_metric(latest_sector.get("Cost of funds"), None)
    cd_ratio = _parse_metric(latest_sector.get("Credit To Deposit Ratio"), None)
    base_rate = _parse_metric(latest_sector.get("Base Rate"), None)
    interest_spread = _parse_metric(latest_sector.get("Interest Spread Rate"), None)
    distributable_profit = _parse_metric(latest_sector.get("Distributable Profit"), None)
    reserves = _parse_metric(
        latest_sector.get("Reserves and Surplus") or latest_sector.get("Reserves") or latest_sector.get("Reserve and Surplus"),
        None
    )

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
    dividend_yield = round((cash_div_npr / ltp) * 100, 3) if ltp and ltp > 0 else 0

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
        npl_val = npl if npl is not None else 99
        if npl_val < 3:
            score += 20
            score_breakdown.append({"label": f"NPL Quality ({npl_val}%)", "pts": 20, "met": True})
        else:
            score_breakdown.append({"label": f"High NPL Risk ({npl_val}%)", "pts": 0, "met": False})
    elif "hydro" in sector_lower:
        res_val = reserves if reserves is not None else -1
        if res_val > 0:
            score += 20
            score_breakdown.append({"label": "Positive Reserves (Hydro)", "pts": 20, "met": True})
        else:
            score_breakdown.append({"label": "Negative Reserves (Hydro)", "pts": 0, "met": False})
    else:
        # Others: Check for Profit Growth (Safe handling for None types)
        net_profit_yoy = growth_dict.get('netprofitqtrly_yoy_growth')
        if net_profit_yoy is not None:
            if net_profit_yoy > 5:
                score += 20
                score_breakdown.append({"label": f"Strong Profit Growth ({round(net_profit_yoy, 1)}%)", "pts": 20, "met": True})
            elif net_profit_yoy > 0:
                score += 10
                score_breakdown.append({"label": f"Modest Profit Growth ({round(net_profit_yoy, 1)}%)", "pts": 10, "met": True})
            else:
                score_breakdown.append({"label": f"Declining Profit ({round(net_profit_yoy, 1)}%)", "pts": 0, "met": False})
        elif len(quarterly) >= 2 and quarterly[0].net_profit and quarterly[1].net_profit and quarterly[0].net_profit > quarterly[1].net_profit:
            score += 20
            score_breakdown.append({"label": "Growing Net Profit", "pts": 20, "met": True})
        else:
            score_breakdown.append({"label": "Stagnant/Declining Profit", "pts": 0, "met": False})

    # 3. VALUATION FIT (20 pts) - Sector Dependent
    if any(x in sector_lower for x in ["bank", "finance", "microfinance"]):
        if graham_number and ltp and ltp < graham_number:
            score += 20
            score_breakdown.append({"label": "Below Graham Value", "pts": 20, "met": True})
        else:
            score_breakdown.append({"label": "Above Graham Value", "pts": 0, "met": False})
    else:
        pbv = (ltp / bvps) if ltp and bvps else 5
        if pbv < 2.5:
            score += 20
            score_breakdown.append({"label": f"PBV Ratio < 2.5 ({round(pbv, 3)})", "pts": 20, "met": True})
        else:
            score_breakdown.append({"label": f"High PBV ({round(pbv, 3)})", "pts": 0, "met": False})

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
        q_reserves = None
        if q.sector_metrics:
            q_reserves = q.sector_metrics.get("Reserves and Surplus") or q.sector_metrics.get("Reserves") or q.sector_metrics.get("Reserve and Surplus")
        quarterly_reserves.append({"quarter": q.quarter, "value": _parse_metric(q_reserves, None)})

    # Prefer accurate metrics from scraper if available
    np_growth = growth_dict.get('netprofitqtrly_yoy_growth')
    if np_growth is not None:
        np_growth_fmt = round(np_growth, 3)
        if np_growth > 15:
            profit_trend = f"Strong Growth (+{np_growth_fmt}%)"
        elif np_growth > 0:
            profit_trend = f"Growing (+{np_growth_fmt}%)"
        elif np_growth > -15:
            profit_trend = f"Slight Decline ({np_growth_fmt}%)"
        else:
            profit_trend = f"Declining ({np_growth_fmt}%)"
    else:
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

    bvps_growth = growth_dict.get('bvps_yoy_growth')
    if bvps_growth is not None:
        bvps_growth_fmt = round(bvps_growth, 3)
        capital_trend = f"Growing (+{bvps_growth_fmt}%)" if bvps_growth > 5 else f"Stable ({bvps_growth_fmt}%)" if bvps_growth > -5 else f"Declining ({bvps_growth_fmt}%)"
    else:
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
        "instrument": instrument,
        "ltp": ltp,
        # Valuation
        "graham_number": graham_number,
        "graham_discount_pct": graham_discount_pct,
        "eps_ttm": eps,
        "bvps": bvps,
        "pe_ratio": pe_ratio,
        "pb_ratio": pb_ratio,
        "peg_ratio": peg_ratio,
        "roe_ttm": round(roe_ttm * 100, 3) if roe_ttm else None,
        # Profitability
        "npm": npm,
        "net_profit_ttm": net_profit_ttm,
        "revenue_ttm": revenue_ttm,
        "eps_growth_yoy": eps_growth,
        # Dividends
        "dividend_yield": dividend_yield,
        "cash_dividend_pct": cash_div_pct,
        "bonus_dividend_pct": bonus_div_pct,
        "dividend_history": dividend_history,
        "face_value": face_value,
        # Technical
        "rsi_14": rsi_14,
        "sma_200": sma_200,
        "sma_50": sma_50,
        "ema_200_status": ema_200_status,
        "high_52w": high_52w,
        "low_52w": low_52w,
        "placement_52w": placement_52w,
        # Scoring
        "health_score": score,
        "score_breakdown": score_breakdown,
        "action": action,
        # Trajectories
        "profit_trend": profit_trend,
        "capital_trend": capital_trend,
        "quarterly_profits": quarterly_profits[:8],
        "quarterly_reserves": quarterly_reserves[:8],
        # Sector-specific (banks: NPL/CAR/CD, hydro: reserves, all: distributable profit)
        "sector_metrics": {
            "npl": npl,
            "car": car,
            "cost_of_funds": cost_of_funds,
            "cd_ratio": cd_ratio,
            "base_rate": base_rate,
            "interest_spread": interest_spread,
            "distributable_profit": distributable_profit,
            "reserves": reserves,
        }
    }


async def get_ai_verdict(summary_data: dict, model_name: str = None) -> dict:
    """
    Calls unified AIService to provide a NEPSE-expert analysis.
    Builds a compact, focused data payload optimized for small (<4B) models.
    """
    # Extract strengths/risks from score breakdown
    strengths = [item['label'] for item in summary_data.get('score_breakdown', []) if item['met']]
    risks = [item['label'] for item in summary_data.get('score_breakdown', []) if not item['met']]

    # Build compact input — small models need focused, flat context
    input_data = {
        "symbol": summary_data["symbol"],
        "sector": summary_data["sector"],
        "ltp": summary_data["ltp"],
        "pe": summary_data["pe_ratio"],
        "pb": summary_data["pb_ratio"],
        "roe_pct": summary_data["roe_ttm"],
        "graham_disc_pct": summary_data["graham_discount_pct"],
        "peg": summary_data["peg_ratio"],
        "rsi": summary_data["rsi_14"],
        "sma_trend": summary_data["ema_200_status"],
        "dividend_yield": summary_data["dividend_yield"],
        "profit_trend": summary_data["profit_trend"],
        "health_score": summary_data["health_score"],
        "scoring_action": summary_data.get("action", "HOLD"),
        "strengths": strengths,
        "risks": risks,
    }
    
    # Add sector-specific context (only non-null values)
    sm = summary_data.get("sector_metrics", {})
    sector_ctx = {k: v for k, v in sm.items() if v is not None}
    if sector_ctx:
        input_data["sector_data"] = sector_ctx

    return await AIService.get_verdict(input_data, model_name)