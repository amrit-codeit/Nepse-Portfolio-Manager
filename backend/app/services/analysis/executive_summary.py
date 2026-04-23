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
from app.api.market_context import get_extended_stock_technicals


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
    # We will use EMA here for consistency with Insights tab
    rsi_14 = None
    ema_200 = None
    ema_50 = None
    ema_200_status = None
    macd_hist = None
    macd_status = None
    vol_ratio = 0
    obv_status = None
    circuit_distance_pct = None
    turnover_120d = None

    if prices and len(prices) >= 50:
        prices_chrono = prices[::-1]
        df = pd.DataFrame([{
            "close": float(p.close),
            "high": float(p.high),
            "low": float(p.low),
            "volume": float(p.volume or 0),
        } for p in prices_chrono])

        df.ta.rsi(length=14, append=True)
        df.ta.ema(length=200, append=True)
        df.ta.ema(length=50, append=True)
        df.ta.macd(fast=12, slow=26, signal=9, append=True)
        df.ta.sma(close='volume', length=20, append=True, prefix='VOL')
        df.ta.obv(append=True)
        df.ta.bbands(length=20, std=2, append=True)

        latest = df.iloc[-1]
        prev_row = df.iloc[-2] if len(df) > 1 else latest

        rsi_val = latest.get("RSI_14")
        ema_200_val = latest.get("EMA_200")
        ema_50_val = latest.get("EMA_50")
        macd_hist_val = latest.get("MACDh_12_26_9")
        vol_sma_20 = latest.get("VOL_SMA_20")
        volume = latest.get("volume", 0)
        obv = latest.get("OBV")
        obv_prev = prev_row.get("OBV")
        bb_upper_val = latest.get("BBU_20_2.0_2.0")
        bb_lower_val = latest.get("BBL_20_2.0_2.0")
        
        bb_upper, bb_lower = None, None

        if pd.notna(rsi_val):
            rsi_14 = round(float(rsi_val), 3)
        if pd.notna(ema_200_val):
            ema_200 = round(float(ema_200_val), 3)
        if pd.notna(ema_50_val):
            ema_50 = round(float(ema_50_val), 3)
        if pd.notna(macd_hist_val):
            macd_hist = round(float(macd_hist_val), 3)
            macd_status = "Bullish Crossover" if macd_hist > 0 else "Bearish"
            
        if pd.notna(bb_upper_val): bb_upper = round(float(bb_upper_val), 2)
        if pd.notna(bb_lower_val): bb_lower = round(float(bb_lower_val), 2)
            
        if pd.notna(vol_sma_20) and vol_sma_20 > 0:
            vol_ratio = round(volume / vol_sma_20, 2)
            
        if pd.notna(obv) and pd.notna(obv_prev):
            obv_status = "Accumulation" if obv > obv_prev else "Distribution"
            
        # NEPSE Specific: Circuit distance from previous close
        # NEPSE circuit breaker is typically ±10% for running market, ±5% for first trading day (we assume normal 10%)
        if len(prices_chrono) >= 2:
            prev_close = float(prices_chrono[-2].close)
            if prev_close > 0 and ltp:
                circuit_high = prev_close * 1.10
                circuit_distance_pct = round(((circuit_high - ltp) / ltp) * 100, 2)
                
        # Turnover over 120 days (semi-annual proxy)
        if len(prices_chrono) >= 120 and ltp:
            # simple average of volume over last 120 days * current price = proxy turnover
            avg_vol_120 = df['volume'].tail(120).mean()
            turnover_120d = avg_vol_120 * ltp

    if ltp and ema_200:
        ema_200_status = "Bullish" if ltp > ema_200 else "Bearish"

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
    
    # ── Banking / Finance / Microfinance ──
    npl = _parse_metric(latest_sector.get("NPL"), None)
    car = _parse_metric(latest_sector.get("CAR"), None)
    cost_of_funds = _parse_metric(latest_sector.get("Cost of funds"), None)
    cd_ratio = _parse_metric(latest_sector.get("Credit To Deposit Ratio") or latest_sector.get("CD ratio"), None)
    base_rate = _parse_metric(latest_sector.get("Base Rate"), None)
    interest_spread = _parse_metric(latest_sector.get("Interest Spread Rate"), None)
    distributable_profit = _parse_metric(latest_sector.get("Distributable Profit"), None)
    deposits = _parse_metric(latest_sector.get("Deposits from Customers"), None)
    loans_advances = _parse_metric(
        latest_sector.get("Loans and Advances to Customers") or latest_sector.get("Loans and Advances"), None
    )
    net_interest_income = _parse_metric(latest_sector.get("Net Interest Income"), None)

    # ── Common across most sectors ──
    reserves = _parse_metric(
        latest_sector.get("Reserves and Surplus") or latest_sector.get("Reserves") or latest_sector.get("Reserve and Surplus"),
        None
    )
    total_equity = _parse_metric(latest_sector.get("Total Equity"), None)
    total_assets = _parse_metric(latest_sector.get("Total Assets"), None)
    borrowings = _parse_metric(
        latest_sector.get("Borrowings") or latest_sector.get("Loans and Borrowings"), None
    )
    current_assets = _parse_metric(latest_sector.get("Current Assets"), None)
    current_liabilities = _parse_metric(latest_sector.get("Current Liabilities"), None)

    # ── Insurance (Life + Non-Life) ──
    solvency_ratio = _parse_metric(latest_sector.get("Solvency Ratio"), None)
    net_premium = _parse_metric(latest_sector.get("Net Premium"), None)
    gross_premium = _parse_metric(
        latest_sector.get("Gross Premium Earned") or latest_sector.get("Gross Premium"), None
    )
    net_claim = _parse_metric(latest_sector.get("Net Claim Payment"), None)
    insurance_fund = _parse_metric(latest_sector.get("Insurance Fund"), None)
    catastrophic_reserve = _parse_metric(latest_sector.get("Catastrophic Reserve"), None)
    total_investment = _parse_metric(
        latest_sector.get("Total Investment and Loans")
        or latest_sector.get("Long Term Investment and Loans"), None
    )
    investment_income = _parse_metric(
        latest_sector.get("Income From Investment Loans And Others")
        or latest_sector.get("Income from Investment")
        or latest_sector.get("Finance Income"), None
    )
    mgmt_expenses = _parse_metric(latest_sector.get("Management Expenses"), None)
    # Computed: Claim Ratio = Net Claim / Net Premium
    claim_ratio = round((net_claim / net_premium) * 100, 2) if net_claim and net_premium and net_premium > 0 else None

    # ── Hydro / Manufacturing / Investment ──
    revenue = _parse_metric(
        latest_sector.get("Revenue") or latest_sector.get("Revenue from Operation")
        or latest_sector.get("Revenue from Contract with Customers")
        or latest_sector.get("Total Revenue"), None
    )
    gross_profit = _parse_metric(latest_sector.get("Gross Profit"), None)
    operating_profit = _parse_metric(
        latest_sector.get("Operating Profit") or latest_sector.get("Total Operating Profit"), None
    )
    # Computed: Gross Margin = Gross Profit / Revenue
    gross_margin = round((gross_profit / revenue) * 100, 2) if gross_profit is not None and revenue and revenue > 0 else None
    # Computed: Current Ratio = Current Assets / Current Liabilities
    current_ratio = round(current_assets / current_liabilities, 2) if current_assets and current_liabilities and current_liabilities > 0 else None
    # Computed: Debt-to-Equity = Borrowings / Total Equity
    debt_to_equity = round(borrowings / total_equity, 2) if borrowings is not None and total_equity and total_equity > 0 else None

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
        elif npl_val < 5:
            score += 10
            score_breakdown.append({"label": f"Moderate NPL ({npl_val}%)", "pts": 10, "met": True})
        else:
            score_breakdown.append({"label": f"High NPL Risk ({npl_val}%)", "pts": 0, "met": False})
    elif "hydro" in sector_lower:
        # Hydro: Reserves + Debt-to-Equity
        res_val = reserves if reserves is not None else -1
        de_val = debt_to_equity
        if res_val > 0 and (de_val is None or de_val < 2):
            score += 20
            score_breakdown.append({"label": "Positive Reserves & Low Debt (Hydro)", "pts": 20, "met": True})
        elif res_val > 0:
            score += 10
            score_breakdown.append({"label": f"Positive Reserves, High D/E ({de_val}x)", "pts": 10, "met": True})
        else:
            score_breakdown.append({"label": "Negative Reserves (Hydro)", "pts": 0, "met": False})
    elif "insurance" in sector_lower:
        # Insurance: Solvency Ratio + Claim Ratio
        sol_val = solvency_ratio
        clm_val = claim_ratio
        if sol_val is not None and sol_val > 1.5:
            score += 12
            score_breakdown.append({"label": f"Solvency Ratio OK ({sol_val}x)", "pts": 12, "met": True})
        elif sol_val is not None:
            score_breakdown.append({"label": f"Low Solvency ({sol_val}x)", "pts": 0, "met": False})
        if clm_val is not None and clm_val < 80:
            score += 8
            score_breakdown.append({"label": f"Healthy Claim Ratio ({clm_val}%)", "pts": 8, "met": True})
        elif clm_val is not None:
            score_breakdown.append({"label": f"High Claim Ratio ({clm_val}%)", "pts": 0, "met": False})
        # If neither metric available, use profit growth fallback
        if sol_val is None and clm_val is None:
            net_profit_yoy = growth_dict.get('netprofitqtrly_yoy_growth')
            if net_profit_yoy is not None and net_profit_yoy > 0:
                score += 20
                score_breakdown.append({"label": f"Profit Growth ({round(net_profit_yoy, 1)}%)", "pts": 20, "met": True})
            else:
                score_breakdown.append({"label": "No Sector Data", "pts": 0, "met": False})
    elif any(x in sector_lower for x in ["manufacturing", "processing"]):
        # Manufacturing: Gross Margin + Current Ratio
        gm_val = gross_margin
        cr_val = current_ratio
        if gm_val is not None and gm_val > 20:
            score += 12
            score_breakdown.append({"label": f"Strong Gross Margin ({gm_val}%)", "pts": 12, "met": True})
        elif gm_val is not None:
            score_breakdown.append({"label": f"Weak Gross Margin ({gm_val}%)", "pts": 0, "met": False})
        if cr_val is not None and cr_val > 1.5:
            score += 8
            score_breakdown.append({"label": f"Current Ratio OK ({cr_val}x)", "pts": 8, "met": True})
        elif cr_val is not None:
            score_breakdown.append({"label": f"Low Current Ratio ({cr_val}x)", "pts": 0, "met": False})
        # Fallback
        if gm_val is None and cr_val is None:
            net_profit_yoy = growth_dict.get('netprofitqtrly_yoy_growth')
            if net_profit_yoy is not None and net_profit_yoy > 0:
                score += 20
                score_breakdown.append({"label": f"Profit Growth ({round(net_profit_yoy, 1)}%)", "pts": 20, "met": True})
            else:
                score_breakdown.append({"label": "No Sector Data", "pts": 0, "met": False})
    else:
        # Generic: Hotels, Tourism, Tradings, Investment, Others
        # Use profit growth as primary metric
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

    # 4. TREND MASTERY (20 pts) - SMA (12) + MACD (8)
    if ltp and ema_200 and ltp > ema_200:
        score += 6
        if ltp and ema_50 and ltp > ema_50:
            score += 6
            score_breakdown.append({"label": "Full Bullish Trend (50 & 200 EMA)", "pts": 12, "met": True})
        else:
            score_breakdown.append({"label": "Long-term Bullish Only", "pts": 6, "met": True})
    else:
        score_breakdown.append({"label": "Bearish Price Trend", "pts": 0, "met": False})
        
    if macd_hist is not None and macd_hist > 0:
        score += 8
        score_breakdown.append({"label": "MACD Bullish Momentum", "pts": 8, "met": True})
    else:
        score_breakdown.append({"label": "MACD Bearish", "pts": 0, "met": False})

    # 5. ENTRY TIMING (15 pts) - RSI (10) + Volume Confirmation (5)
    if rsi_14:
        if 40 <= rsi_14 <= 65: # The "Accumulation" Zone
            score += 10
            score_breakdown.append({"label": "RSI Sweet Spot (40-65)", "pts": 10, "met": True})
        elif rsi_14 < 40: # Oversold - Good but risky
            score += 5
            score_breakdown.append({"label": "RSI Oversold (Early)", "pts": 5, "met": True})
        else:
            score_breakdown.append({"label": "RSI Overbought", "pts": 0, "met": False})
            
    if vol_ratio and vol_ratio > 1.2:
        score += 5
        score_breakdown.append({"label": f"Volume Expansion ({vol_ratio}x avg)", "pts": 5, "met": True})
    else:
        score_breakdown.append({"label": "Average/Low Volume", "pts": 0, "met": False})

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

    # --- Final Valuation Conclusion ---
    action = "Fairly Priced"
    if score >= 80:
        action = "Deep Value"
    elif score <= 20 and ema_200_status == "Bearish":
        action = "Speculative Premium"
    elif score > 60 and ema_200_status == "Bullish":
        action = "Undervalued"
    elif score < 40:
        action = "Overvalued"

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
        "ema_200": ema_200,
        "ema_50": ema_50,
        "ema_200_status": ema_200_status,
        "macd_hist": macd_hist,
        "macd_status": macd_status,
        "vol_ratio": vol_ratio,
        "obv_status": obv_status,
        "circuit_distance_pct": circuit_distance_pct,
        "turnover_120d": turnover_120d,
        "high_52w": high_52w,
        "low_52w": low_52w,
        "placement_52w": placement_52w,
        "bb_upper": bb_upper,
        "bb_lower": bb_lower,
        # Scoring
        "health_score": score,
        "score_breakdown": score_breakdown,
        "action": action,
        # Trajectories
        "profit_trend": profit_trend,
        "capital_trend": capital_trend,
        "quarterly_profits": quarterly_profits[:8],
        "quarterly_reserves": quarterly_reserves[:8],
        # Sector-specific metrics — all sectors covered
        "sector_metrics": {
            # Banking / Finance / Microfinance
            "npl": npl,
            "car": car,
            "cost_of_funds": cost_of_funds,
            "cd_ratio": cd_ratio,
            "base_rate": base_rate,
            "interest_spread": interest_spread,
            "distributable_profit": distributable_profit,
            "deposits": deposits,
            "loans_advances": loans_advances,
            "net_interest_income": net_interest_income,
            # Insurance (Life + Non-Life)
            "solvency_ratio": solvency_ratio,
            "net_premium": net_premium,
            "gross_premium": gross_premium,
            "net_claim": net_claim,
            "claim_ratio": claim_ratio,
            "insurance_fund": insurance_fund,
            "catastrophic_reserve": catastrophic_reserve,
            "total_investment": total_investment,
            "investment_income": investment_income,
            "mgmt_expenses": mgmt_expenses,
            # Common / Hydro / Manufacturing / Investment
            "reserves": reserves,
            "total_equity": total_equity,
            "total_assets": total_assets,
            "borrowings": borrowings,
            "revenue": revenue,
            "gross_profit": gross_profit,
            "gross_margin": gross_margin,
            "operating_profit": operating_profit,
            "current_ratio": current_ratio,
            "debt_to_equity": debt_to_equity,
        },
        "ext_tech": get_extended_stock_technicals(symbol, db)
    }

async def get_value_ai_verdict(summary_data: dict, model_name: str = None) -> dict:
    """
    Value Investing AI session.
    Builds a fundamental-heavy payload with light technical timing context.
    """
    # Extract strengths/risks from score breakdown
    strengths = [item['label'] for item in summary_data.get('score_breakdown', []) if item['met']]
    risks = [item['label'] for item in summary_data.get('score_breakdown', []) if not item['met']]

    # Format Graham interpretation to prevent AI from confusing negative/positive signs
    graham_discount = summary_data.get("graham_discount_pct")
    graham_desc = "N/A"
    if graham_discount is not None:
        if graham_discount > 0:
            graham_desc = f"Undervalued by {graham_discount}% (LTP is below Graham value)"
        else:
            graham_desc = f"Overvalued by {abs(graham_discount)}% (LTP is above Graham value)"

    # Build value-focused input — fundamentals + timing context
    input_data = {
        "symbol": summary_data["symbol"],
        "sector": summary_data["sector"],
        "ltp": summary_data["ltp"],
        # Valuation metrics
        "pe": summary_data["pe_ratio"],
        "pb": summary_data["pb_ratio"],
        "peg": summary_data["peg_ratio"],
        "graham_valuation": graham_desc,
        "graham_number": summary_data.get("graham_number"),
        # Profitability
        "roe_pct": summary_data["roe_ttm"],
        "eps_ttm": summary_data.get("eps_ttm"),
        "net_profit_ttm": summary_data.get("net_profit_ttm"),
        "npm": summary_data.get("npm"),
        "eps_growth_yoy": summary_data.get("eps_growth_yoy"),
        "profit_trend": summary_data["profit_trend"],
        "capital_trend": summary_data.get("capital_trend"),
        # Dividends
        "dividend_yield": summary_data["dividend_yield"],
        "cash_dividend_pct": summary_data.get("cash_dividend_pct"),
        "bonus_dividend_pct": summary_data.get("bonus_dividend_pct"),
        "dividend_history": summary_data.get("dividend_history", [])[:3],
        # Technical timing (for entry/exit assessment)
        "rsi": summary_data["rsi_14"],
        "ema_trend": summary_data["ema_200_status"],
        "ema_50_status": "Bullish" if summary_data.get("ltp") and summary_data.get("ema_50") and summary_data["ltp"] > summary_data["ema_50"] else "Bearish",
        "macd_momentum": summary_data.get("macd_status", "N/A"),
        "volume_ratio": summary_data.get("vol_ratio", 0),
        "obv_trend": summary_data.get("obv_status", "N/A"),
        "placement_52w": summary_data.get("placement_52w"),
        "bollinger_squeeze": summary_data.get("ext_tech", {}).get("bb_squeeze", False),
        "rs_vs_nepse_trend": summary_data.get("ext_tech", {}).get("rs_trend", "N/A"),
        "adt_20_days": summary_data.get("ext_tech", {}).get("adt_20", 0),
        # Scoring context
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

    return await AIService.get_value_verdict(input_data, model_name)


async def get_trading_ai_verdict(summary_data: dict, model_name: str = None) -> dict:
    """
    Pure Trading AI session.
    Builds a technical-only payload — no fundamental data.
    Focuses on price action, momentum, and actionable trade setups.
    """
    input_data = _build_trading_input(summary_data)
    return await AIService.get_trading_verdict(input_data, model_name)


# Keep legacy function for backward compatibility
async def get_ai_verdict(summary_data: dict, model_name: str = None) -> dict:
    """Legacy function — delegates to get_value_ai_verdict."""
    return await get_value_ai_verdict(summary_data, model_name)


# ---------------------------------------------------------------------------
# Cloud API wrappers (reuse the same input_data building logic)
# ---------------------------------------------------------------------------

def _build_value_input(summary_data: dict) -> dict:
    """Shared helper: builds value-focused input payload from summary data."""
    strengths = [item['label'] for item in summary_data.get('score_breakdown', []) if item['met']]
    risks = [item['label'] for item in summary_data.get('score_breakdown', []) if not item['met']]

    graham_discount = summary_data.get("graham_discount_pct")
    graham_desc = "N/A"
    if graham_discount is not None:
        if graham_discount > 0:
            graham_desc = f"Undervalued by {graham_discount}% (LTP is below Graham value)"
        else:
            graham_desc = f"Overvalued by {abs(graham_discount)}% (LTP is above Graham value)"

    input_data = {
        "symbol": summary_data["symbol"],
        "sector": summary_data["sector"],
        "ltp": summary_data["ltp"],
        "pe": summary_data["pe_ratio"],
        "pb": summary_data["pb_ratio"],
        "peg": summary_data["peg_ratio"],
        "graham_valuation": graham_desc,
        "graham_number": summary_data.get("graham_number"),
        "roe_pct": summary_data["roe_ttm"],
        "eps_ttm": summary_data.get("eps_ttm"),
        "net_profit_ttm": summary_data.get("net_profit_ttm"),
        "npm": summary_data.get("npm"),
        "eps_growth_yoy": summary_data.get("eps_growth_yoy"),
        "profit_trend": summary_data["profit_trend"],
        "capital_trend": summary_data.get("capital_trend"),
        "dividend_yield": summary_data["dividend_yield"],
        "cash_dividend_pct": summary_data.get("cash_dividend_pct"),
        "bonus_dividend_pct": summary_data.get("bonus_dividend_pct"),
        "dividend_history": summary_data.get("dividend_history", [])[:3],
        "rsi": summary_data["rsi_14"],
        "ema_trend": summary_data["ema_200_status"],
        "ema_50_status": "Bullish" if summary_data.get("ltp") and summary_data.get("ema_50") and summary_data["ltp"] > summary_data["ema_50"] else "Bearish",
        "macd_momentum": summary_data.get("macd_status", "N/A"),
        "volume_ratio": summary_data.get("vol_ratio", 0),
        "obv_trend": summary_data.get("obv_status", "N/A"),
        "placement_52w": summary_data.get("placement_52w"),
        "bollinger_squeeze": summary_data.get("ext_tech", {}).get("bb_squeeze", False),
        "rs_vs_nepse_trend": summary_data.get("ext_tech", {}).get("rs_trend", "N/A"),
        "adt_20_days": summary_data.get("ext_tech", {}).get("adt_20", 0),
        "health_score": summary_data["health_score"],
        "scoring_action": summary_data.get("action", "HOLD"),
        "strengths": strengths,
        "risks": risks,
    }

    sm = summary_data.get("sector_metrics", {})
    sector_ctx = {k: v for k, v in sm.items() if v is not None}
    if sector_ctx:
        input_data["sector_data"] = sector_ctx

    return input_data


def _build_trading_input(summary_data: dict) -> dict:
    """Shared helper: builds trading-focused input payload from summary data."""
    return {
        "symbol": summary_data["symbol"],
        "ltp": summary_data["ltp"],
        "high_52w": summary_data.get("high_52w"),
        "low_52w": summary_data.get("low_52w"),
        "placement_52w": summary_data.get("placement_52w"),
        "ema_50": summary_data.get("ema_50"),
        "ema_200": summary_data.get("ema_200"),
        "ema_200_trend": summary_data.get("ema_200_status"),
        "ema_50_trend": "Bullish" if summary_data.get("ltp") and summary_data.get("ema_50") and summary_data["ltp"] > summary_data["ema_50"] else "Bearish",
        "rsi_14": summary_data.get("rsi_14"),
        "macd_histogram": summary_data.get("macd_hist"),
        "macd_status": summary_data.get("macd_status"),
        "volume_ratio": f"{summary_data.get('vol_ratio', 0)}x of 20-day average",
        "obv_trend": summary_data.get("obv_status", "N/A"),
        "bollinger_upper": summary_data.get("bb_upper"),
        "bollinger_lower": summary_data.get("bb_lower"),
        "bollinger_position": (
            "Above Upper Band (overbought)" if summary_data.get("ltp") and summary_data.get("bb_upper") and summary_data["ltp"] > summary_data["bb_upper"]
            else "Below Lower Band (oversold)" if summary_data.get("ltp") and summary_data.get("bb_lower") and summary_data["ltp"] < summary_data["bb_lower"]
            else "Inside Bands"
        ),
        "bollinger_squeeze": summary_data.get("ext_tech", {}).get("bb_squeeze", False),
        "rs_vs_nepse_trend": summary_data.get("ext_tech", {}).get("rs_trend", "N/A"),
        "adt_20_days": summary_data.get("ext_tech", {}).get("adt_20", 0),
        "vsa_reversal": summary_data.get("ext_tech", {}).get("vsa_reversal", None),
        "adx_14": summary_data.get("ext_tech", {}).get("adx_14", None),
        "atr_14": summary_data.get("ext_tech", {}).get("atr_14", None),
        "pivot_points": summary_data.get("ext_tech", {}).get("pivot_points", None),
        "circuit_distance_pct": summary_data.get("circuit_distance_pct"),
        "turnover_120d": summary_data.get("turnover_120d"),
        "support_levels": [
            v for v in [
                summary_data.get("bb_lower"),
                summary_data.get("ema_50"),
                summary_data.get("low_52w"),
            ] if v is not None
        ],
        "resistance_levels": [
            v for v in [
                summary_data.get("bb_upper"),
                summary_data.get("ema_200"),
                summary_data.get("high_52w"),
            ] if v is not None
        ],
        "trading_rules": {
            "cgt_on_profit_pct": 7.5,
            "broker_sebon_commission_total_pct": 0.8,
            "min_rr_threshold": 1.5
        }
    }


async def get_value_ai_verdict_cloud(summary_data: dict) -> dict:
    """Value Investing via Cloud API (Groq)."""
    input_data = _build_value_input(summary_data)
    return await AIService.get_value_verdict_cloud(input_data)


async def get_trading_ai_verdict_cloud(summary_data: dict) -> dict:
    """Trading analysis via Cloud API (Groq)."""
    input_data = _build_trading_input(summary_data)
    return await AIService.get_trading_verdict_cloud(input_data)


def get_frontier_prompt(mode: str, summary_data: dict) -> str:
    """Generates a copy-paste prompt for frontier model web UIs."""
    if mode.lower() == "trading":
        input_data = _build_trading_input(summary_data)
    else:
        input_data = _build_value_input(summary_data)
    return AIService.generate_frontier_prompt(mode, input_data)