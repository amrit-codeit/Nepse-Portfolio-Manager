"""
Executive Summary Engine — synthesizes technical, fundamental, and AI 
analysis into a single 'Complete Picture' for a NEPSE stock.
"""
import math
from datetime import datetime, timedelta, timezone
from sqlalchemy.orm import Session
from app.models.price import PriceHistory, LivePrice
from app.models.fundamental import StockOverview, FundamentalReport, QuarterlyGrowth
from app.models.company import Company
from app.models.dividend import DividendIncome
from app.models.holding import Holding
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


def calculate_executive_summary(db: Session, symbol: str, member_id: int | None = None) -> dict:
    """
    Core calculation engine. Produces all metrics for the Executive Summary tab.
    Includes sector-specific risk assessment for NEPSE and portfolio-aware Position Action.
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
        .limit(20)  # enough to grab metrics for the latest quarter
        .all()
    )
    growth_dict = {g.particulars: g.value for g in latest_growths if latest_growths and g.fiscal_year ==
                   latest_growths[0].fiscal_year and g.quarter == latest_growths[0].quarter}

    ltp_row = db.query(LivePrice).filter(LivePrice.symbol == symbol).first()
    ltp = float(ltp_row.ltp) if ltp_row and ltp_row.ltp else None
    price_timestamp = ltp_row.updated_at if ltp_row else None
    stale_price = True
    if price_timestamp:
        updated_dt = price_timestamp if price_timestamp.tzinfo else price_timestamp.replace(tzinfo=timezone.utc)
        stale_price = updated_dt < datetime.now(timezone.utc) - timedelta(hours=12)

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

        if pd.notna(bb_upper_val):
            bb_upper = round(float(bb_upper_val), 2)
        if pd.notna(bb_lower_val):
            bb_lower = round(float(bb_lower_val), 2)

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
                circuit_distance_pct = round(
                    ((circuit_high - ltp) / ltp) * 100, 2)

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
            placement_52w = round(
                ((ltp - low_52w) / (high_52w - low_52w)) * 100, 2)

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
            graham_discount_pct = round(
                ((graham_number - ltp) / graham_number) * 100, 3)

    # --- Growth Ratios (NPM, PEG, Revenue) ---
    npm = growth_dict.get('net_margin_ttm')
    revenue_ttm = growth_dict.get('revenue_ttm')
    peg_ratio = None
    eps_growth = growth_dict.get('eps_yoy_growth')
    if pe_ratio and eps_growth and eps_growth > 0:
        peg_ratio = round(pe_ratio / eps_growth, 3)

    # --- Sector-Specific Metrics ---
    # Extract from latest quarterly sector_metrics
    latest_sector = quarterly[0].sector_metrics if quarterly and quarterly[0].sector_metrics else {
    }

    # ── Banking / Finance / Microfinance ──
    npl = _parse_metric(latest_sector.get("NPL"), None)
    car = _parse_metric(latest_sector.get("CAR"), None)
    cost_of_funds = _parse_metric(latest_sector.get("Cost of funds"), None)
    cd_ratio = _parse_metric(latest_sector.get(
        "Credit To Deposit Ratio") or latest_sector.get("CD ratio"), None)
    base_rate = _parse_metric(latest_sector.get("Base Rate"), None)
    interest_spread = _parse_metric(
        latest_sector.get("Interest Spread Rate"), None)
    distributable_profit = _parse_metric(
        latest_sector.get("Distributable Profit"), None)
    deposits = _parse_metric(latest_sector.get(
        "Deposits from Customers"), None)
    loans_advances = _parse_metric(
        latest_sector.get("Loans and Advances to Customers") or latest_sector.get(
            "Loans and Advances"), None
    )
    net_interest_income = _parse_metric(
        latest_sector.get("Net Interest Income"), None)

    # ── Common across most sectors ──
    reserves = _parse_metric(
        latest_sector.get("Reserves and Surplus") or latest_sector.get(
            "Reserves") or latest_sector.get("Reserve and Surplus"),
        None
    )
    total_equity = _parse_metric(latest_sector.get("Total Equity"), None)
    total_assets = _parse_metric(latest_sector.get("Total Assets"), None)
    borrowings = _parse_metric(
        latest_sector.get("Borrowings") or latest_sector.get(
            "Loans and Borrowings"), None
    )
    current_assets = _parse_metric(latest_sector.get("Current Assets"), None)
    current_liabilities = _parse_metric(
        latest_sector.get("Current Liabilities"), None)

    # ── Insurance (Life + Non-Life) ──
    solvency_ratio = _parse_metric(latest_sector.get("Solvency Ratio"), None)
    net_premium = _parse_metric(latest_sector.get("Net Premium"), None)
    gross_premium = _parse_metric(
        latest_sector.get("Gross Premium Earned") or latest_sector.get(
            "Gross Premium"), None
    )
    net_claim = _parse_metric(latest_sector.get("Net Claim Payment"), None)
    insurance_fund = _parse_metric(latest_sector.get("Insurance Fund"), None)
    catastrophic_reserve = _parse_metric(
        latest_sector.get("Catastrophic Reserve"), None)
    total_investment = _parse_metric(
        latest_sector.get("Total Investment and Loans")
        or latest_sector.get("Long Term Investment and Loans"), None
    )
    investment_income = _parse_metric(
        latest_sector.get("Income From Investment Loans And Others")
        or latest_sector.get("Income from Investment")
        or latest_sector.get("Finance Income"), None
    )
    mgmt_expenses = _parse_metric(
        latest_sector.get("Management Expenses"), None)
    # Computed: Claim Ratio = Net Claim / Net Premium
    claim_ratio = round((net_claim / net_premium) * 100,
                        2) if net_claim and net_premium and net_premium > 0 else None

    # ── Hydro / Manufacturing / Investment ──
    revenue = _parse_metric(
        latest_sector.get("Revenue") or latest_sector.get(
            "Revenue from Operation")
        or latest_sector.get("Revenue from Contract with Customers")
        or latest_sector.get("Total Revenue"), None
    )
    gross_profit = _parse_metric(latest_sector.get("Gross Profit"), None)
    operating_profit = _parse_metric(
        latest_sector.get("Operating Profit") or latest_sector.get(
            "Total Operating Profit"), None
    )
    # Computed: Gross Margin = Gross Profit / Revenue
    gross_margin = round((gross_profit / revenue) * 100,
                         2) if gross_profit is not None and revenue and revenue > 0 else None
    # Computed: Current Ratio = Current Assets / Current Liabilities
    current_ratio = round(current_assets / current_liabilities,
                          2) if current_assets and current_liabilities and current_liabilities > 0 else None
    # Computed: Debt-to-Equity = Borrowings / Total Equity
    debt_to_equity = round(borrowings / total_equity,
                           2) if borrowings is not None and total_equity and total_equity > 0 else None

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
    dividend_yield = round((cash_div_npr / ltp) * 100,
                           3) if ltp and ltp > 0 else 0
    np_growth = growth_dict.get('netprofitqtrly_yoy_growth')
    bvps_growth = growth_dict.get('bvps_yoy_growth')

    # =========================================================
    # --- Fundamental Health Scoring Engine (0-100) ---
    # =========================================================
    score = 0
    score_breakdown = []

    # Helper for Percentile-based Sector Ranking
    def get_sector_percentile(metric_extractor, is_lower_better=False):
        try:
            target_val = metric_extractor(latest_sector)
            if target_val is None:
                return None, None

            companies_in_sector = db.query(Company).filter(
                Company.sector == sector).all()
            syms = [c.symbol for c in companies_in_sector]
            reps = db.query(FundamentalReport).filter(
                FundamentalReport.symbol.in_(syms)).all()

            latest_reps = {}
            for r in reps:
                if r.symbol not in latest_reps or r.id > latest_reps[r.symbol].id:
                    latest_reps[r.symbol] = r

            vals = []
            for s, r in latest_reps.items():
                if r.sector_metrics:
                    val = metric_extractor(r.sector_metrics)
                    if val is not None:
                        vals.append(val)

            if not vals:
                return None, target_val

            vals.sort()
            # Find index
            # If there are duplicates, index() returns the first, which is fine
            idx = vals.index(target_val)
            pct = (idx / max(1, len(vals) - 1)) * 100
            if is_lower_better:
                pct = 100 - pct
            return pct, target_val
        except Exception:
            return None, None

    # 1. DIVIDEND CAPACITY (20 pts) - The "NEPSE Fuel"
    if dividend_yield > 5 or (roe_ttm and roe_ttm > 0.12):
        score += 20
        score_breakdown.append(
            {"label": "High Dividend Capacity/ROE", "pts": 20, "met": True})
    else:
        score_breakdown.append(
            {"label": "Low Dividend Capacity", "pts": 0, "met": False})

    # 2. SECTOR QUALITY (25 pts)
    if any(x in sector_lower for x in ["bank", "finance", "microfinance"]):
        npl_pct, npl_val = get_sector_percentile(
            lambda m: _parse_metric(m.get("NPL"), None), is_lower_better=True)
        if npl_pct is not None:
            if npl_pct >= 80:
                score += 25
                score_breakdown.append(
                    {"label": f"Top 20% NPL ({npl_val}%)", "pts": 25, "met": True})
            elif npl_pct >= 50:
                score += 12
                score_breakdown.append(
                    {"label": f"Above Avg NPL ({npl_val}%)", "pts": 12, "met": True})
            else:
                score_breakdown.append(
                    {"label": f"Below Avg NPL ({npl_val}%)", "pts": 0, "met": False})
        else:
            score_breakdown.append(
                {"label": "NPL Data Missing", "pts": 0, "met": False})

    elif "hydro" in sector_lower:
        # Hydro: Reserves Percentile
        res_pct, res_val = get_sector_percentile(
            lambda m: _parse_metric(m.get("Reserves and Surplus") or m.get(
                "Reserves") or m.get("Reserve and Surplus"), None),
            is_lower_better=False
        )
        if res_pct is not None and res_val > 0:
            if res_pct >= 70:
                score += 25
                score_breakdown.append(
                    {"label": "Top 30% Reserves (Hydro)", "pts": 25, "met": True})
            else:
                score += 12
                score_breakdown.append(
                    {"label": "Positive Reserves (Hydro)", "pts": 12, "met": True})
        else:
            score_breakdown.append(
                {"label": "Negative/Missing Reserves", "pts": 0, "met": False})

    elif "insurance" in sector_lower:
        # Insurance: Solvency Percentile
        sol_pct, sol_val = get_sector_percentile(lambda m: _parse_metric(
            m.get("Solvency Ratio"), None), is_lower_better=False)
        clm_pct, clm_val = get_sector_percentile(lambda m: round((_parse_metric(m.get("Net Claim Payment"), 0) / _parse_metric(
            m.get("Net Premium"), 1)) * 100, 2) if _parse_metric(m.get("Net Premium"), 0) > 0 else None, is_lower_better=True)

        if sol_pct is not None:
            if sol_pct >= 70:
                score += 15
                score_breakdown.append(
                    {"label": f"Top 30% Solvency ({sol_val}x)", "pts": 15, "met": True})
            elif sol_val > 1.5:
                score += 8
                score_breakdown.append(
                    {"label": f"Adequate Solvency ({sol_val}x)", "pts": 8, "met": True})
            else:
                score_breakdown.append(
                    {"label": f"Low Solvency ({sol_val}x)", "pts": 0, "met": False})

        if clm_pct is not None:
            if clm_pct >= 50:
                score += 10
                score_breakdown.append(
                    {"label": f"Above Avg Claim Ratio ({clm_val}%)", "pts": 10, "met": True})
            else:
                score_breakdown.append(
                    {"label": f"Below Avg Claim Ratio ({clm_val}%)", "pts": 0, "met": False})
        # If neither metric available, use profit growth fallback
        if sol_val is None and clm_val is None:
            net_profit_yoy = growth_dict.get('netprofitqtrly_yoy_growth')
            if net_profit_yoy is not None and net_profit_yoy > 0:
                score += 25
                score_breakdown.append(
                    {"label": f"Profit Growth ({round(net_profit_yoy, 1)}%)", "pts": 25, "met": True})
            else:
                score_breakdown.append(
                    {"label": "No Sector Data", "pts": 0, "met": False})
    elif any(x in sector_lower for x in ["manufacturing", "processing"]):
        # Manufacturing: Gross Margin + Current Ratio
        gm_val = gross_margin
        cr_val = current_ratio
        if gm_val is not None and gm_val > 20:
            score += 15
            score_breakdown.append(
                {"label": f"Strong Gross Margin ({gm_val}%)", "pts": 15, "met": True})
        elif gm_val is not None:
            score_breakdown.append(
                {"label": f"Weak Gross Margin ({gm_val}%)", "pts": 0, "met": False})
        if cr_val is not None and cr_val > 1.5:
            score += 10
            score_breakdown.append(
                {"label": f"Current Ratio OK ({cr_val}x)", "pts": 10, "met": True})
        elif cr_val is not None:
            score_breakdown.append(
                {"label": f"Low Current Ratio ({cr_val}x)", "pts": 0, "met": False})
        # Fallback
        if gm_val is None and cr_val is None:
            net_profit_yoy = growth_dict.get('netprofitqtrly_yoy_growth')
            if net_profit_yoy is not None and net_profit_yoy > 0:
                score += 25
                score_breakdown.append(
                    {"label": f"Profit Growth ({round(net_profit_yoy, 1)}%)", "pts": 25, "met": True})
            else:
                score_breakdown.append(
                    {"label": "No Sector Data", "pts": 0, "met": False})
    else:
        # Generic: Hotels, Tourism, Tradings, Investment, Others
        # Use profit growth as primary metric
        net_profit_yoy = growth_dict.get('netprofitqtrly_yoy_growth')
        if net_profit_yoy is not None:
            if net_profit_yoy > 5:
                score += 25
                score_breakdown.append(
                    {"label": f"Strong Profit Growth ({round(net_profit_yoy, 1)}%)", "pts": 25, "met": True})
            elif net_profit_yoy > 0:
                score += 12
                score_breakdown.append(
                    {"label": f"Modest Profit Growth ({round(net_profit_yoy, 1)}%)", "pts": 12, "met": True})
            else:
                score_breakdown.append(
                    {"label": f"Declining Profit ({round(net_profit_yoy, 1)}%)", "pts": 0, "met": False})
        elif len(quarterly) >= 2 and quarterly[0].net_profit and quarterly[1].net_profit and quarterly[0].net_profit > quarterly[1].net_profit:
            score += 25
            score_breakdown.append(
                {"label": "Growing Net Profit", "pts": 25, "met": True})
        else:
            score_breakdown.append(
                {"label": "Stagnant/Declining Profit", "pts": 0, "met": False})

    # 3. VALUATION FIT (20 pts) - Sector Dependent, with Graham as secondary only
    pbv = (ltp / bvps) if ltp and bvps else 5
    if any(x in sector_lower for x in ["bank", "finance", "microfinance"]):
        # PBV vs ROE scatter approach
        roe_val = roe_ttm if roe_ttm is not None else 0
        if pbv < 1.5 and roe_val > 0.10:
            score += 20
            score_breakdown.append(
                {"label": f"Strong PBV ({round(pbv, 2)}) vs ROE", "pts": 20, "met": True})
        elif pbv < 2.5 and roe_val > 0.05:
            score += 10
            score_breakdown.append(
                {"label": f"Fair PBV ({round(pbv, 2)}) vs ROE", "pts": 10, "met": True})
        else:
            score_breakdown.append(
                {"label": f"Overvalued PBV ({round(pbv, 2)})", "pts": 0, "met": False})
    elif "hydro" in sector_lower:
        if pbv < 2:
            score += 20
            score_breakdown.append(
                {"label": f"PBV < 2x ({round(pbv, 2)})", "pts": 20, "met": True})
        else:
            score_breakdown.append(
                {"label": f"High PBV ({round(pbv, 2)})", "pts": 0, "met": False})
    elif "insurance" in sector_lower:
        roe_val = roe_ttm if roe_ttm is not None else 0
        if pbv < 2.5 and roe_val > 0.12:
            score += 20
            score_breakdown.append(
                {"label": f"Strong PBV ({round(pbv, 2)}) vs ROE", "pts": 20, "met": True})
        elif pbv < 3.5 and roe_val > 0.08:
            score += 10
            score_breakdown.append(
                {"label": f"Fair PBV ({round(pbv, 2)}) vs ROE", "pts": 10, "met": True})
        else:
            score_breakdown.append(
                {"label": f"Rich Insurance Valuation ({round(pbv, 2)})", "pts": 0, "met": False})
    else:
        pe_val = pe_ratio if pe_ratio and pe_ratio > 0 else None
        roe_val = roe_ttm if roe_ttm is not None else 0
        if pe_val is not None and pe_val <= 12 and (roe_val > 0.12 or (np_growth is not None and np_growth > 10)):
            score += 20
            score_breakdown.append(
                {"label": f"Strong Earnings Valuation (P/E {round(pe_val, 2)})", "pts": 20, "met": True})
        elif pbv < 1.8 and roe_val > 0.10:
            score += 20
            score_breakdown.append(
                {"label": f"Strong PBV ({round(pbv, 2)}) vs ROE", "pts": 20, "met": True})
        elif pe_val is not None and pe_val <= 18 and (roe_val > 0.08 or (npm is not None and npm > 0.10)):
            score += 10
            score_breakdown.append(
                {"label": f"Fair Earnings Valuation (P/E {round(pe_val, 2)})", "pts": 10, "met": True})
        elif graham_number and ltp and ltp < graham_number and (pe_val is None or pe_val <= 20):
            score += 10
            score_breakdown.append(
                {"label": "Below Graham Value (secondary check)", "pts": 10, "met": True})
        else:
            score_breakdown.append(
                {"label": "Valuation Not Yet Compelling", "pts": 0, "met": False})

    # 4. EARNINGS TRAJECTORY (20 pts)
    if np_growth is not None:
        if np_growth > 15:
            score += 20
            score_breakdown.append(
                {"label": f"Strong Earnings Trajectory ({round(np_growth, 1)}%)", "pts": 20, "met": True})
        elif np_growth > 0:
            score += 10
            score_breakdown.append(
                {"label": f"Positive Earnings Trajectory ({round(np_growth, 1)}%)", "pts": 10, "met": True})
        else:
            score_breakdown.append(
                {"label": f"Weak Earnings Trajectory ({round(np_growth, 1)}%)", "pts": 0, "met": False})
    else:
        profit_values = [q.net_profit for q in quarterly if q.net_profit is not None]
        fallback_profit_trend = "Weak"
        if len(profit_values) >= 4:
            recent_half = profit_values[:len(profit_values) // 2]
            older_half = profit_values[len(profit_values) // 2:]
            avg_recent = sum(recent_half) / len(recent_half)
            avg_older = sum(older_half) / len(older_half) if older_half and sum(older_half) != 0 else 1
            change_pct = ((avg_recent - avg_older) / abs(avg_older)) * 100 if avg_older != 0 else 0

            if change_pct > 15:
                fallback_profit_trend = "Improving"
            elif change_pct > -5:
                fallback_profit_trend = "Stable"
        elif len(profit_values) >= 2 and profit_values[0] > profit_values[-1]:
            fallback_profit_trend = "Improving"

        if fallback_profit_trend == "Improving":
            score += 20
            score_breakdown.append(
                {"label": "Improving Profit Trend", "pts": 20, "met": True})
        elif fallback_profit_trend == "Stable":
            score += 10
            score_breakdown.append(
                {"label": "Stable Profit Trend", "pts": 10, "met": True})
        else:
            score_breakdown.append(
                {"label": "Weak Profit Trend", "pts": 0, "met": False})

    # 5. CAPITAL STRENGTH (15 pts)
    capital_strength_pts = 0
    capital_strength_label = None
    if bvps_growth is not None:
        if bvps_growth > 8:
            capital_strength_pts = 15
            capital_strength_label = f"Strong Book Value Growth ({round(bvps_growth, 1)}%)"
        elif bvps_growth > 0:
            capital_strength_pts = 8
            capital_strength_label = f"Positive Book Value Growth ({round(bvps_growth, 1)}%)"
    elif reserves is not None and total_equity:
        reserve_ratio = reserves / total_equity if total_equity else 0
        if reserve_ratio > 0.4:
            capital_strength_pts = 15
            capital_strength_label = f"Strong Reserve Base ({round(reserve_ratio * 100, 1)}%)"
        elif reserve_ratio > 0.15:
            capital_strength_pts = 8
            capital_strength_label = f"Adequate Reserve Base ({round(reserve_ratio * 100, 1)}%)"
    elif current_ratio is not None:
        if current_ratio > 1.5:
            capital_strength_pts = 15
            capital_strength_label = f"Healthy Liquidity ({round(current_ratio, 2)}x)"
        elif current_ratio > 1.0:
            capital_strength_pts = 8
            capital_strength_label = f"Adequate Liquidity ({round(current_ratio, 2)}x)"

    if capital_strength_pts:
        score += capital_strength_pts
        score_breakdown.append(
            {"label": capital_strength_label, "pts": capital_strength_pts, "met": True})
    else:
        score_breakdown.append(
            {"label": "Weak Capital Strength", "pts": 0, "met": False})

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
            q_reserves = q.sector_metrics.get("Reserves and Surplus") or q.sector_metrics.get(
                "Reserves") or q.sector_metrics.get("Reserve and Surplus")
        quarterly_reserves.append(
            {"quarter": q.quarter, "value": _parse_metric(q_reserves, None)})

    # Prefer accurate metrics from scraper if available
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
        profit_values = [p["value"]
                         for p in quarterly_profits if p["value"] is not None]
        if len(profit_values) >= 4:
            recent_half = profit_values[:len(profit_values) // 2]
            older_half = profit_values[len(profit_values) // 2:]
            avg_recent = sum(recent_half) / len(recent_half)
            avg_older = sum(older_half) / \
                len(older_half) if sum(older_half) != 0 else 1
            change_pct = ((avg_recent - avg_older) / abs(avg_older)
                          ) * 100 if avg_older != 0 else 0

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

    if bvps_growth is not None:
        bvps_growth_fmt = round(bvps_growth, 3)
        capital_trend = f"Growing (+{bvps_growth_fmt}%)" if bvps_growth > 5 else f"Stable ({bvps_growth_fmt}%)" if bvps_growth > - \
            5 else f"Declining ({bvps_growth_fmt}%)"
    else:
        reserve_vals = [r["value"]
                        for r in quarterly_reserves if r["value"] is not None]
        if len(reserve_vals) >= 2:
            reserve_growth = ((reserve_vals[0] - reserve_vals[-1]) / abs(
                reserve_vals[-1])) * 100 if reserve_vals[-1] else 0
            capital_trend = "Growing" if reserve_growth > 5 else "Stable" if reserve_growth > -5 else "Declining"

    ext_tech = get_extended_stock_technicals(symbol, db)

    # --- Separate technical timing disclaimer (not part of health score) ---
    technical_timing_signal = "WAIT"
    technical_timing_reasoning = []
    if stale_price or ext_tech.get("stale_price"):
        technical_timing_signal = "WAIT"
        technical_timing_reasoning.append("Refresh live price and technicals before acting.")
    else:
        bullish_trend = bool(ltp and ema_50 and ema_200 and ltp > ema_50 and ltp > ema_200)
        bullish_momentum = bool(macd_hist is not None and macd_hist > 0)
        rsi_entry_zone = bool(rsi_14 and 40 <= rsi_14 <= 60)
        overbought = bool(rsi_14 and rsi_14 > 70)
        bearish_break = bool(ltp and ema_50 and ema_200 and ltp < ema_50 and ltp < ema_200 and macd_hist is not None and macd_hist < 0)
        volume_confirm = bool(vol_ratio and vol_ratio >= 1.2)

        if bearish_break:
            technical_timing_signal = "EXIT WATCH"
            technical_timing_reasoning.extend([
                "Price is below both 50 EMA and 200 EMA.",
                "MACD momentum is bearish."
            ])
        elif bullish_trend and bullish_momentum and rsi_entry_zone and volume_confirm:
            technical_timing_signal = "ENTRY OK"
            technical_timing_reasoning.extend([
                "Trend is supportive above both 50 EMA and 200 EMA.",
                "Momentum is positive and RSI is in a healthier accumulation range.",
                f"Volume is confirming at {vol_ratio}x average."
            ])
        elif overbought:
            technical_timing_signal = "WAIT"
            technical_timing_reasoning.extend([
                "RSI is overheated.",
                "Prefer a pullback or reset before fresh buying."
            ])
        elif bullish_trend and bullish_momentum:
            technical_timing_signal = "WAIT"
            technical_timing_reasoning.extend([
                "Trend is constructive, but entry timing is not ideal yet.",
                "Wait for RSI to cool into the 40-60 zone or for a cleaner pullback toward support."
            ])
        else:
            technical_timing_signal = "WAIT"
            technical_timing_reasoning.extend([
                "Technical confirmation is incomplete.",
                "Wait for either trend reclaim or stronger momentum confirmation."
            ])

    technical_timing_guidance = {
        "signal": technical_timing_signal,
        "disclaimer": "Technical timing note only. This does not change the fundamental health score.",
        "reasons": technical_timing_reasoning,
    }

    # --- Final Valuation Conclusion ---
    action = "Fairly Priced"
    if score >= 80:
        action = "Deep Value"
    elif score <= 20 and (profit_trend in ["Declining", "Volatile"] or capital_trend == "Declining"):
        action = "Speculative Premium"
    elif score > 60:
        action = "Undervalued"
    elif score < 40:
        action = "Overvalued"

    # --- Unified Position Action Logic ---
    action_verdict = "AVOID"
    action_reasoning = []
    portfolio_context = None

    if member_id:
        holding = db.query(Holding).filter(
            Holding.symbol == symbol, Holding.member_id == member_id).first()
        if holding and holding.current_qty > 0:
            current_value = holding.current_qty * ltp if ltp else 0
            unrealized_pnl = current_value - holding.total_investment
            pnl_pct = (unrealized_pnl / holding.total_investment) * \
                100 if holding.total_investment > 0 else 0

            # Calculate concentration (safe — handles missing LivePrice gracefully)
            all_holdings = db.query(Holding).filter(
                Holding.member_id == member_id, Holding.current_qty > 0
            ).all()
            total_portfolio_value = 0
            for h in all_holdings:
                if h.symbol == symbol:
                    total_portfolio_value += h.current_qty * (ltp or 0)
                else:
                    lp_row = db.query(LivePrice).filter_by(
                        symbol=h.symbol).first()
                    h_price = lp_row.ltp if lp_row and lp_row.ltp else 0
                    total_portfolio_value += h.current_qty * h_price
            concentration = (current_value / total_portfolio_value) * \
                100 if total_portfolio_value > 0 else 0

            # Calculate XIRR and dividend income for the AI context
            from app.services.portfolio_engine import get_xirr_for_holding
            xirr = get_xirr_for_holding(db, member_id, symbol, current_value)

            from sqlalchemy import func
            div_income = db.query(func.sum(DividendIncome.total_cash_amount)).filter(
                DividendIncome.member_id == member_id,
                DividendIncome.symbol == symbol,
                DividendIncome.eligible_quantity > 0
            ).scalar() or 0.0

            portfolio_context = {
                "current_qty": holding.current_qty,
                "wacc": holding.wacc,
                "total_investment": holding.total_investment,
                "unrealized_pnl": unrealized_pnl,
                "pnl_pct": pnl_pct,
                "concentration_pct": concentration,
                "xirr": xirr,
                "dividend_income": div_income,
            }

            # Portfolio Management Mode
            if score < 30:
                action_verdict = "EXIT" if concentration > 5 else "REDUCE"
                action_reasoning.append(
                    f"Poor fundamental health (Score: {score}). Capital at risk.")
                if npl and npl > 8:
                    action_reasoning.append(f"Critical NPL levels ({npl}%).")
            elif score >= 65:
                if pnl_pct < -10 and concentration < 10:
                    action_verdict = "ACCUMULATE"
                    action_reasoning.append(
                        f"High health score ({score}). Opportunity to average down WACC.")
                elif concentration > 15:
                    action_verdict = "HOLD"
                    action_reasoning.append(
                        f"High portfolio concentration ({round(concentration, 1)}%). Avoid over-exposure.")
                else:
                    action_verdict = "HOLD"
                    action_reasoning.append(
                        "Strong fundamentals intact. Let profits run.")
            else:
                # Average score (30 - 64)
                if pnl_pct > 20:
                    action_verdict = "REDUCE"
                    action_reasoning.append(
                        "Average fundamentals. Consider booking partial profits.")
                else:
                    action_verdict = "HOLD"
                    action_reasoning.append(
                        "Fundamentals stable. No immediate action required.")

            if dividend_yield > 6:
                action_reasoning.append(
                    f"Attractive dividend yield ({round(dividend_yield, 1)}%) providing downside protection.")

        else:
            # Discovery Mode (Not held)
            if score >= 60:
                action_verdict = "BUY"
                action_reasoning.append(
                    f"Strong fundamental health (Score: {score}).")
                if graham_discount_pct and graham_discount_pct > 15:
                    action_reasoning.append(
                        f"Trading at {round(graham_discount_pct, 1)}% discount to Graham Number.")
            else:
                action_verdict = "AVOID"
                action_reasoning.append(
                    f"Weak fundamental health (Score: {score}). Better opportunities exist.")
                if score_breakdown and len(score_breakdown) > 0 and not score_breakdown[0].get("met"):
                    action_reasoning.append(score_breakdown[0].get("label"))
    else:
        # Discovery Mode (No member context)
        if score >= 60:
            action_verdict = "BUY"
            action_reasoning.append(
                f"Strong fundamental health (Score: {score}).")
            if graham_discount_pct and graham_discount_pct > 15:
                action_reasoning.append(
                    f"Trading at {round(graham_discount_pct, 1)}% discount to Graham Number.")
        else:
            action_verdict = "AVOID"
            action_reasoning.append(
                f"Weak fundamental health (Score: {score}). Better opportunities exist.")
            if score_breakdown and len(score_breakdown) > 0 and not score_breakdown[-1].get("met"):
                action_reasoning.append(score_breakdown[-1].get("label"))

    return {
        "symbol": symbol,
        "sector": sector,
        "instrument": instrument,
        "ltp": ltp,
        "price_timestamp": price_timestamp.isoformat() if price_timestamp else None,
        "stale_price": stale_price,
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
        # Scoring & Action
        "health_score": score,
        "score_breakdown": score_breakdown,
        "action": action,  # Kept for backward compatibility
        "action_verdict": action_verdict,
        "action_reasoning": action_reasoning,
        "technical_timing_guidance": technical_timing_guidance,
        "portfolio_context": portfolio_context,
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
        "ext_tech": ext_tech
    }


async def get_value_ai_verdict(summary_data: dict, model_name: str = None) -> dict:
    """
    Value Investing AI session.
    Builds a fundamental-heavy payload with light technical timing context.
    """
    input_data = _build_value_input(summary_data)
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

def _categorize_peg(peg_ratio: float | None) -> str:
    if peg_ratio is None or peg_ratio <= 0:
        return "N/A"
    if peg_ratio < 0.8:
        return "Cheap growth"
    if peg_ratio <= 1.5:
        return "Fair growth"
    return "Expensive growth"


def _build_distribution_context(summary_data: dict) -> dict:
    cash_pct = summary_data.get("cash_dividend_pct") or 0
    bonus_pct = summary_data.get("bonus_dividend_pct") or 0
    cash_yield = summary_data.get("dividend_yield") or 0
    total_distribution_pct = cash_pct + bonus_pct
    bonus_heavy = bonus_pct > 0 and bonus_pct >= max(cash_pct, 10)

    if cash_pct > 0 and bonus_pct == 0:
        profile = "Cash-led"
    elif bonus_pct > 0 and cash_pct == 0:
        profile = "Bonus-only / dilution-heavy"
    elif bonus_heavy:
        profile = "Bonus-heavy, cash-light"
    elif cash_pct > 0 and bonus_pct > 0:
        profile = "Mixed payout"
    else:
        profile = "No recent distribution"

    return {
        "cash_dividend_yield_pct": round(cash_yield, 3),
        "dilution_aware_yield_pct": round(cash_yield, 3),
        "cash_dividend_pct": cash_pct,
        "bonus_dividend_pct": bonus_pct,
        "headline_distribution_pct": total_distribution_pct,
        "bonus_heavy_distribution": bonus_heavy,
        "distribution_profile": profile,
    }


def _estimate_valuation_change_potential(summary_data: dict) -> dict:
    sector_lower = (summary_data.get("sector") or "").lower()
    pe = summary_data.get("pe_ratio")
    pb = summary_data.get("pb_ratio")
    peg = summary_data.get("peg_ratio")
    roe_pct = summary_data.get("roe_ttm")
    eps_growth = summary_data.get("eps_growth_yoy")
    graham_discount = summary_data.get("graham_discount_pct")

    potential = None
    basis = "Insufficient valuation context"
    anchor_family = "No defined sector anchor"
    anchor_low = None
    anchor_base = None
    anchor_high = None
    assumption_note = "Use conservative sector anchoring; avoid false precision."
    peg_precedence = False

    if "microfinance" in sector_lower and pb and pb > 0:
        anchor_family = "Microfinance P/B anchored to ROE with provisioning-cycle caution"
        if roe_pct is None:
            anchor_low, anchor_base, anchor_high = 0.9, 1.2, 1.5
        elif roe_pct >= 20:
            anchor_low, anchor_base, anchor_high = 1.8, 2.2, 2.6
        elif roe_pct >= 15:
            anchor_low, anchor_base, anchor_high = 1.4, 1.8, 2.2
        elif roe_pct >= 10:
            anchor_low, anchor_base, anchor_high = 1.0, 1.3, 1.6
        else:
            anchor_low, anchor_base, anchor_high = 0.7, 0.9, 1.1
        potential = ((anchor_base / pb) - 1) * 100
        basis = f"Microfinance P/B normalization toward {round(anchor_base, 2)}x"
        assumption_note = "Microfinance valuations can compress quickly when credit costs or provisioning rise."
    elif any(x in sector_lower for x in ["bank", "finance"]) and pb and pb > 0:
        anchor_family = "Bank/finance P/B anchored to sustainable ROE"
        if roe_pct is None:
            anchor_low, anchor_base, anchor_high = 1.0, 1.2, 1.4
        elif roe_pct >= 18:
            anchor_low, anchor_base, anchor_high = 1.6, 1.9, 2.2
        elif roe_pct >= 14:
            anchor_low, anchor_base, anchor_high = 1.3, 1.6, 1.9
        elif roe_pct >= 10:
            anchor_low, anchor_base, anchor_high = 1.0, 1.3, 1.6
        elif roe_pct >= 7:
            anchor_low, anchor_base, anchor_high = 0.9, 1.1, 1.3
        else:
            anchor_low, anchor_base, anchor_high = 0.7, 0.9, 1.1
        potential = ((anchor_base / pb) - 1) * 100
        basis = f"PBV vs sustainable ROE normalization toward {round(anchor_base, 2)}x"
        assumption_note = "Use conservative bank anchors when deposit competition, NPL risk, or spread pressure is rising."
    elif "insurance" in sector_lower and pb and pb > 0:
        anchor_family = "Insurance P/B anchored to ROE and solvency"
        if roe_pct is None:
            anchor_low, anchor_base, anchor_high = 1.5, 1.8, 2.1
        elif roe_pct >= 16:
            anchor_low, anchor_base, anchor_high = 2.4, 2.8, 3.2
        elif roe_pct >= 12:
            anchor_low, anchor_base, anchor_high = 2.0, 2.4, 2.8
        elif roe_pct >= 9:
            anchor_low, anchor_base, anchor_high = 1.6, 2.0, 2.4
        else:
            anchor_low, anchor_base, anchor_high = 1.2, 1.5, 1.8
        potential = ((anchor_base / pb) - 1) * 100
        basis = f"Insurance PBV normalization toward {round(anchor_base, 2)}x"
        assumption_note = "Insurance multiples should be discounted when reported profit is investment-cycle driven rather than underwriting durable."
    elif "hydro" in sector_lower and pb and pb > 0:
        anchor_family = "Hydro P/B band reversion"
        peg_precedence = peg is not None and peg > 0
        if eps_growth is not None and eps_growth > 12:
            anchor_low, anchor_base, anchor_high = 1.5, 1.9, 2.3
        elif eps_growth is not None and eps_growth > 0:
            anchor_low, anchor_base, anchor_high = 1.2, 1.5, 1.8
        else:
            anchor_low, anchor_base, anchor_high = 0.9, 1.2, 1.5
        potential = ((anchor_base / pb) - 1) * 100
        basis = f"Hydro PB band reversion toward {round(anchor_base, 2)}x"
        assumption_note = "Hydro anchors are fragile when earnings are project-timing driven or cash generation trails accounting profit."
    elif any(x in sector_lower for x in ["manufacturing", "processing"]) and pe and pe > 0:
        anchor_family = "Manufacturing earnings-multiple cycle"
        peg_precedence = peg is not None and peg > 0
        if eps_growth is not None and eps_growth >= 15:
            anchor_low, anchor_base, anchor_high = 10.0, 13.0, 16.0
        elif eps_growth is not None and eps_growth >= 8:
            anchor_low, anchor_base, anchor_high = 8.0, 11.0, 14.0
        elif eps_growth is not None and eps_growth > 0:
            anchor_low, anchor_base, anchor_high = 7.0, 9.0, 11.0
        else:
            anchor_low, anchor_base, anchor_high = 5.0, 7.0, 9.0
        potential = ((anchor_base / pe) - 1) * 100
        basis = f"Earnings-multiple normalization toward {round(anchor_base, 2)}x P/E"
        assumption_note = "Manufacturing rerating depends on margin durability and cash conversion, not just revenue growth."
    elif pe and pe > 0:
        anchor_family = "Generic earnings-multiple cycle"
        peg_precedence = peg is not None and peg > 0
        if eps_growth is not None and eps_growth >= 15:
            anchor_low, anchor_base, anchor_high = 11.0, 14.0, 17.0
        elif eps_growth is not None and eps_growth >= 8:
            anchor_low, anchor_base, anchor_high = 9.0, 12.0, 15.0
        elif eps_growth is not None and eps_growth > 0:
            anchor_low, anchor_base, anchor_high = 7.0, 10.0, 12.0
        else:
            anchor_low, anchor_base, anchor_high = 5.0, 8.0, 10.0
        potential = ((anchor_base / pe) - 1) * 100
        basis = f"P/E normalization toward {round(anchor_base, 2)}x"
        assumption_note = "Use generic P/E anchors conservatively for cyclical or low-liquidity names."
    elif graham_discount is not None:
        potential = graham_discount
        basis = "Graham discount fallback"
        anchor_family = "Graham fallback only"
        assumption_note = "Graham should be treated as low-confidence fallback, not a primary anchor."

    if potential is None:
        return {
            "valuation_change_potential_pct": None,
            "basis": basis,
            "anchor_family": anchor_family,
            "anchor_low": anchor_low,
            "anchor_base": anchor_base,
            "anchor_high": anchor_high,
            "assumption_note": assumption_note,
            "peg_precedence": peg_precedence,
        }

    potential = max(-40.0, min(40.0, potential))
    return {
        "valuation_change_potential_pct": round(potential, 3),
        "basis": basis,
        "anchor_family": anchor_family,
        "anchor_low": round(anchor_low, 2) if anchor_low is not None else None,
        "anchor_base": round(anchor_base, 2) if anchor_base is not None else None,
        "anchor_high": round(anchor_high, 2) if anchor_high is not None else None,
        "assumption_note": assumption_note,
        "peg_precedence": peg_precedence,
    }


def _estimate_expected_return_proxy(summary_data: dict) -> dict:
    distribution = _build_distribution_context(summary_data)
    valuation_ctx = _estimate_valuation_change_potential(summary_data)
    eps_growth = summary_data.get("eps_growth_yoy")
    profit_trend = summary_data.get("profit_trend")

    if eps_growth is not None:
        growth_component = round(eps_growth, 3)
        growth_basis = "EPS growth YoY"
    elif isinstance(profit_trend, str) and "Strong Growth" in profit_trend:
        growth_component = 18.0
        growth_basis = "Profit trend fallback"
    elif isinstance(profit_trend, str) and ("Growing" in profit_trend or "Increasing" in profit_trend):
        growth_component = 10.0
        growth_basis = "Profit trend fallback"
    elif profit_trend == "Stable":
        growth_component = 4.0
        growth_basis = "Stable profit trend fallback"
    elif isinstance(profit_trend, str) and ("Declining" in profit_trend or "Volatile" in profit_trend):
        growth_component = -5.0
        growth_basis = "Weak profit trend fallback"
    else:
        growth_component = 0.0
        growth_basis = "No clear growth signal"

    cash_yield = distribution["dilution_aware_yield_pct"]
    valuation_component = valuation_ctx["valuation_change_potential_pct"] or 0.0
    rough_forward_return = round(growth_component + cash_yield + valuation_component, 3)

    return {
        "growth_component_pct": growth_component,
        "growth_basis": growth_basis,
        "cash_yield_component_pct": cash_yield,
        "valuation_change_component_pct": valuation_component,
        "valuation_change_basis": valuation_ctx["basis"],
        "valuation_anchor": {
            "family": valuation_ctx.get("anchor_family"),
            "low": valuation_ctx.get("anchor_low"),
            "base": valuation_ctx.get("anchor_base"),
            "high": valuation_ctx.get("anchor_high"),
            "assumption_note": valuation_ctx.get("assumption_note"),
            "peg_precedence": valuation_ctx.get("peg_precedence", False),
        },
        "rough_forward_return_proxy_pct": rough_forward_return,
        "forward_return_band": (
            "Attractive" if rough_forward_return >= 15
            else "Workable" if rough_forward_return >= 8
            else "Low" if rough_forward_return >= 0
            else "Negative"
        ),
        "horizon_note": "Rough 12-24 month forward return proxy, not a forecast",
    }


def _estimate_liquidity_slippage_buffer(summary_data: dict, ext_tech: dict) -> dict:
    liquidity_grade = str(ext_tech.get("liquidity_grade") or "").upper()
    grade_buffers = {
        "A+": 0.35,
        "A": 0.5,
        "B": 0.9,
        "C": 1.5,
        "D": 2.5,
    }

    base_buffer = 1.25
    for grade, pct in grade_buffers.items():
        if liquidity_grade.startswith(grade):
            base_buffer = pct
            break

    ltp = summary_data.get("ltp")
    atr_14 = ext_tech.get("atr_14")
    atr_pct = round((atr_14 / ltp) * 100, 3) if atr_14 and ltp else None
    volatility_buffer = min((atr_pct or 0) * 0.35, 3.5)
    buffer_pct = round(max(base_buffer, volatility_buffer), 3)

    return {
        "buffer_pct": buffer_pct,
        "buffer_basis": f"Liquidity grade {ext_tech.get('liquidity_grade') or 'N/A'} with ATR overlay",
        "atr_pct_of_price": atr_pct,
    }


def _build_value_decision_framework(summary_data: dict, expected_return_ctx: dict) -> dict:
    sector_metrics = summary_data.get("sector_metrics", {}) or {}
    health_score = summary_data.get("health_score") or 0
    profit_trend = str(summary_data.get("profit_trend") or "")
    capital_trend = str(summary_data.get("capital_trend") or "")
    forward_return = expected_return_ctx.get("rough_forward_return_proxy_pct")
    quality_reasons = []

    if health_score < 35:
        quality_reasons.append("Low fundamental-health score")
    if "Declining" in profit_trend or "Volatile" in profit_trend:
        quality_reasons.append("Weak profit trajectory")
    if "Declining" in capital_trend:
        quality_reasons.append("Weak capital trend")
    if sector_metrics.get("npl") is not None and sector_metrics.get("npl") > 8:
        quality_reasons.append("Critical NPL stress")
    if sector_metrics.get("solvency_ratio") is not None and sector_metrics.get("solvency_ratio") < 1.5:
        quality_reasons.append("Weak solvency cover")
    if sector_metrics.get("current_ratio") is not None and sector_metrics.get("current_ratio") < 1:
        quality_reasons.append("Tight liquidity position")

    if quality_reasons:
        quality_gate = "FAIL" if health_score < 35 or len(quality_reasons) >= 2 else "CAUTION"
    else:
        quality_gate = "PASS" if health_score >= 60 else "CAUTION"

    if forward_return is None:
        return_gate = "UNKNOWN"
    elif forward_return >= 15:
        return_gate = "STRONG"
    elif forward_return >= 8:
        return_gate = "ACCEPTABLE"
    elif forward_return >= 0:
        return_gate = "WEAK"
    else:
        return_gate = "NEGATIVE"

    peg_category = _categorize_peg(summary_data.get("peg_ratio"))
    growth_sector = any(x in (summary_data.get("sector") or "").lower() for x in ["hydro", "manufacturing", "processing", "hotel", "tourism", "investment"])

    return {
        "decision_hierarchy": [
            "1. Business quality, survival, and cash generation",
            "2. Forward expected return",
            "3. Valuation anchored by sector norms",
            "4. Cash dividend quality",
            "5. Technical timing overlay only",
        ],
        "quality_gate": quality_gate,
        "quality_gate_reasons": quality_reasons or ["No immediate quality failure detected"],
        "forward_return_gate": return_gate,
        "reconciliation_rule": (
            "Verdict must follow quality gate plus forward return gate. Cheap valuation alone cannot override a failed quality gate."
        ),
        "peg_vs_graham_rule": (
            "Use PEG over Graham for growth/cyclical sectors when PEG is available."
            if growth_sector and peg_category != "N/A"
            else "Graham remains secondary to sector valuation anchors."
        ),
        "peg_category": peg_category,
    }


def _build_trading_decision_framework(summary_data: dict, ext_tech: dict, active_setup: dict, slippage_ctx: dict) -> dict:
    vol_ratio = summary_data.get("vol_ratio", 0) or 0
    obv_trend = summary_data.get("obv_status") or "N/A"
    ltp = summary_data.get("ltp")
    ema_50 = summary_data.get("ema_50")
    ema_200 = summary_data.get("ema_200")
    macd_hist = summary_data.get("macd_hist")
    liquidity_grade = str(ext_tech.get("liquidity_grade") or "").upper()
    stale = bool(summary_data.get("stale_price") or ext_tech.get("stale_price"))

    if not liquidity_grade:
        liquidity_gate = "CAUTION"
    elif liquidity_grade.startswith(("A", "B")) and vol_ratio >= 0.8:
        liquidity_gate = "PASS"
    elif liquidity_grade.startswith(("A", "B", "C")):
        liquidity_gate = "CAUTION"
    else:
        liquidity_gate = "FAIL"

    obv_gate = "BLOCK_BULLISH" if obv_trend == "Distribution" else "SUPPORTIVE" if obv_trend == "Accumulation" else "NEUTRAL"

    if ltp and ema_50 and ema_200 and ltp > ema_50 and ltp > ema_200 and (macd_hist is None or macd_hist >= 0):
        trend_integrity_status = "INTACT"
    elif ltp and ema_50 and ema_200 and ltp < ema_50 and ltp < ema_200 and macd_hist is not None and macd_hist < 0:
        trend_integrity_status = "BROKEN"
    else:
        trend_integrity_status = "WEAKENING"

    if stale:
        execution_status = "STALE"
    elif liquidity_gate == "FAIL":
        execution_status = "BLOCKED"
    elif vol_ratio >= 1.2 and obv_gate == "SUPPORTIVE":
        execution_status = "READY"
    elif trend_integrity_status == "INTACT":
        execution_status = "WAIT"
    else:
        execution_status = "POOR"

    stop = active_setup.get("current_stop_loss") or active_setup.get("stop_loss")
    stop_hit = bool(stop and ltp and ltp <= stop)
    support_break = bool(ltp and ema_50 and ltp < ema_50 and obv_gate == "BLOCK_BULLISH")
    setup_invalidated = bool(stop_hit or (trend_integrity_status == "BROKEN" and support_break))

    rr_gate = "N/A"
    slippage_rr = None
    if active_setup:
        entry = active_setup.get("entry_price")
        target = active_setup.get("target_1") or active_setup.get("target_price")
        if entry and target and stop:
            gross_reward = target - entry
            commission_drag = (entry + target) * 0.008
            cgt_drag = max(gross_reward, 0) * 0.075
            net_reward = gross_reward - commission_drag - cgt_drag
            risk = entry - stop
            slippage_pct = slippage_ctx.get("buffer_pct", 0) / 100
            slippage_drag = ((entry + target) * slippage_pct) if slippage_pct else 0
            slippage_risk = (stop * slippage_pct) if slippage_pct else 0
            if risk > 0:
                slippage_rr = round((net_reward - slippage_drag) / (risk + slippage_risk), 3)
                rr_gate = "PASS" if slippage_rr >= 1.5 else "FAIL"

    return {
        "decision_hierarchy": [
            "1. Data freshness and liquidity gate",
            "2. OBV/volume confirmation gate",
            "3. Trend integrity",
            "4. Execution timing",
            "5. Slippage-adjusted reward/risk",
        ],
        "liquidity_gate": liquidity_gate,
        "obv_gate": obv_gate,
        "trend_integrity_status": trend_integrity_status,
        "execution_status": execution_status,
        "setup_invalidated": setup_invalidated,
        "invalidation_reasons": [
            reason for reason, flag in [
                ("Stop loss breached", stop_hit),
                ("Support failure with OBV distribution", support_break),
                ("Trend integrity broken", trend_integrity_status == "BROKEN"),
            ] if flag
        ] or ["No hard invalidation trigger detected"],
        "slippage_rr_gate": rr_gate,
        "slippage_adjusted_rr": slippage_rr,
        "hard_rules": {
            "bullish_signals_blocked_if": "liquidity_gate=FAIL or obv_gate=BLOCK_BULLISH",
            "stop_loss_trigger_if": "setup_invalidated=true or stop breached",
            "wait_default_if": "trend intact but execution_status is WAIT/POOR or slippage_rr_gate=FAIL",
        },
    }


def _build_value_input(summary_data: dict) -> dict:
    """Shared helper: builds value-focused input payload from summary data."""
    strengths = [item['label'] for item in summary_data.get(
        'score_breakdown', []) if item['met']]
    risks = [item['label'] for item in summary_data.get(
        'score_breakdown', []) if not item['met']]
    distribution_ctx = _build_distribution_context(summary_data)
    expected_return_ctx = _estimate_expected_return_proxy(summary_data)
    value_decision_framework = _build_value_decision_framework(summary_data, expected_return_ctx)

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
        "instrument": summary_data.get("instrument"),
        "ltp": summary_data["ltp"],
        "pe": summary_data["pe_ratio"],
        "pb": summary_data["pb_ratio"],
        "peg": summary_data["peg_ratio"],
        "peg_category": _categorize_peg(summary_data.get("peg_ratio")),
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
        "distribution_profile": distribution_ctx["distribution_profile"],
        "dilution_aware_yield_pct": distribution_ctx["dilution_aware_yield_pct"],
        "bonus_heavy_distribution": distribution_ctx["bonus_heavy_distribution"],
        "headline_distribution_pct": distribution_ctx["headline_distribution_pct"],
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
        "action_verdict": summary_data.get("action_verdict", "HOLD"),
        "scoring_action": summary_data.get("action", "HOLD"),
        "action_reasoning": summary_data.get("action_reasoning", []),
        "technical_timing_guidance": summary_data.get("technical_timing_guidance"),
        "expected_return_framework": expected_return_ctx,
        "value_decision_framework": value_decision_framework,
        "strengths": strengths,
        "risks": risks,
    }

    sm = summary_data.get("sector_metrics", {})
    sector_ctx = {k: v for k, v in sm.items() if v is not None}
    if sector_ctx:
        input_data["sector_data"] = sector_ctx

    if summary_data.get("portfolio_context"):
        input_data["portfolio_context"] = summary_data["portfolio_context"]

    return input_data


def _build_trading_input(summary_data: dict) -> dict:
    """Shared helper: builds trading-focused input payload from summary data."""
    ext_tech = summary_data.get("ext_tech", {}) or {}
    portfolio_context = summary_data.get("portfolio_context") or {}
    active_setup = summary_data.get("active_trade_setup") or {}
    slippage_ctx = _estimate_liquidity_slippage_buffer(summary_data, ext_tech)
    trading_decision_framework = _build_trading_decision_framework(summary_data, ext_tech, active_setup, slippage_ctx)
    has_holding = bool(portfolio_context.get("current_qty", 0) > 0)
    has_active_setup = bool(active_setup)
    position_mode = "active_trade" if has_active_setup else "held_no_setup" if has_holding else "watching"

    input_data = {
        "symbol": summary_data["symbol"],
        "instrument": summary_data.get("instrument"),
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
        "volume_ratio_raw": summary_data.get("vol_ratio", 0),
        "volume_ratio": f"{summary_data.get('vol_ratio', 0)}x of 20-day average",
        "obv_trend": summary_data.get("obv_status", "N/A"),
        "bollinger_upper": summary_data.get("bb_upper"),
        "bollinger_lower": summary_data.get("bb_lower"),
        "bollinger_position": (
            "Above Upper Band (overbought)" if summary_data.get("ltp") and summary_data.get("bb_upper") and summary_data["ltp"] > summary_data["bb_upper"]
            else "Below Lower Band (oversold)" if summary_data.get("ltp") and summary_data.get("bb_lower") and summary_data["ltp"] < summary_data["bb_lower"]
            else "Inside Bands"
        ),
        "bollinger_squeeze": ext_tech.get("bb_squeeze", False),
        "rs_vs_nepse_trend": ext_tech.get("rs_trend", "N/A"),
        "adt_20_days": ext_tech.get("adt_20", 0),
        "vsa_reversal": ext_tech.get("vsa_reversal", None),
        "adx_14": ext_tech.get("adx_14", None),
        "atr_14": ext_tech.get("atr_14", None),
        "pivot_points": ext_tech.get("pivot_points", None),
        "data_freshness": {
            "insights_price_timestamp": summary_data.get("price_timestamp"),
            "stale_price": summary_data.get("stale_price"),
            "ext_price_timestamp": ext_tech.get("price_timestamp"),
            "stale_technicals": ext_tech.get("stale_price"),
        },
        "position_mode": position_mode,
        "circuit_distance_pct": summary_data.get("circuit_distance_pct"),
        "turnover_120d": summary_data.get("turnover_120d"),
        "liquidity_grade": ext_tech.get("liquidity_grade"),
        "volatility_risk_tag": ext_tech.get("volatility_risk_tag"),
        "liquidity_adjusted_slippage_buffer": slippage_ctx,
        "trading_decision_framework": trading_decision_framework,
        "signal_hierarchy": {
            "primary": "Liquidity and volume confirmation",
            "secondary": "Trend integrity and higher timeframe structure",
            "tertiary": "Execution timing around ATR, breakout strength, and key levels",
            "last_check": "Oscillators like RSI should refine timing, not drive the thesis alone",
        },
        "trend_integrity": {
            "ema_structure": "Bullish" if summary_data.get("ltp") and summary_data.get("ema_50") and summary_data.get("ema_200") and summary_data["ltp"] > summary_data["ema_50"] and summary_data["ltp"] > summary_data["ema_200"] else "Weak/Mixed",
            "higher_timeframe_bias": summary_data.get("ema_200_status"),
            "relative_strength_vs_nepse": ext_tech.get("rs_trend", "N/A"),
            "adx_14": ext_tech.get("adx_14"),
        },
        "execution_timing": {
            "volume_ratio_raw": summary_data.get("vol_ratio", 0),
            "obv_trend": summary_data.get("obv_status", "N/A"),
            "atr_14": ext_tech.get("atr_14"),
            "vsa_reversal": ext_tech.get("vsa_reversal"),
            "bollinger_squeeze": ext_tech.get("bb_squeeze", False),
            "circuit_distance_pct": summary_data.get("circuit_distance_pct"),
        },
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
        },
        "portfolio_action_context": {
            "value_engine_action": summary_data.get("action_verdict"),
            "value_engine_reasoning": summary_data.get("action_reasoning", []),
        },
    }

    if portfolio_context:
        input_data["portfolio_context"] = portfolio_context
        wacc = portfolio_context.get("wacc")
        ltp = summary_data.get("ltp")
        if ltp and wacc:
            input_data["distance_to_wacc_pct"] = round(((ltp - wacc) / wacc) * 100, 3)
        input_data["holding_context"] = {
            "current_qty": portfolio_context.get("current_qty"),
            "wacc": portfolio_context.get("wacc"),
            "total_investment": portfolio_context.get("total_investment"),
            "unrealized_pnl": portfolio_context.get("unrealized_pnl"),
            "pnl_pct": portfolio_context.get("pnl_pct"),
            "concentration_pct": portfolio_context.get("concentration_pct"),
            "xirr": portfolio_context.get("xirr"),
            "dividend_income": portfolio_context.get("dividend_income"),
        }

    if active_setup:
        input_data["active_trade_setup"] = active_setup
        entry = active_setup.get("entry_price")
        target = active_setup.get("target_1") or active_setup.get("target_price")
        target_2 = active_setup.get("target_2")
        stop = active_setup.get("current_stop_loss") or active_setup.get("stop_loss")
        trailing_stop = active_setup.get("trailing_stop")
        ltp = summary_data.get("ltp")
        qty = active_setup.get("allocated_qty") or portfolio_context.get("current_qty")

        if ltp is not None and entry:
            input_data["position_pnl_pct"] = round(((ltp - entry) / entry) * 100, 3)
        if ltp is not None and target:
            input_data["distance_to_target_pct"] = round(((target - ltp) / ltp) * 100, 3)
        if ltp is not None and stop:
            input_data["distance_to_stop_pct"] = round(((ltp - stop) / ltp) * 100, 3)
        if trailing_stop is not None:
            input_data["trailing_stop"] = trailing_stop
        if entry and stop and qty:
            input_data["capital_at_risk"] = round(abs(entry - stop) * qty, 3)
        input_data["setup_quality"] = active_setup.get("setup_quality")
        input_data["strategy_type"] = active_setup.get("strategy_type")
        input_data["setup_thesis"] = active_setup.get("thesis") or active_setup.get("strategy_note")
        input_data["entry_zone"] = {
            "low": active_setup.get("entry_zone_low"),
            "high": active_setup.get("entry_zone_high"),
        }
        input_data["targets"] = [value for value in [active_setup.get("target_1"), active_setup.get("target_2")] if value is not None]
        if entry and target and stop:
            gross_reward_per_share = target - entry
            commission_drag_per_share = (entry + target) * 0.008
            cgt_drag_per_share = max(gross_reward_per_share, 0) * 0.075
            net_reward_per_share = gross_reward_per_share - commission_drag_per_share - cgt_drag_per_share
            risk_per_share = entry - stop
            slippage_pct = slippage_ctx.get("buffer_pct", 0) / 100
            slippage_drag_per_share = ((entry + target) * slippage_pct) if slippage_pct else 0
            stop_slippage_risk_per_share = (stop * slippage_pct) if slippage_pct else 0
            slippage_adjusted_net_reward = net_reward_per_share - slippage_drag_per_share
            slippage_adjusted_risk = risk_per_share + stop_slippage_risk_per_share
            input_data["trade_plan_metrics"] = {
                "entry_price": entry,
                "target_1": target,
                "target_2": target_2,
                "stop_loss": stop,
                "trailing_stop": trailing_stop,
                "allocated_qty": qty,
                "gross_reward_per_share": round(gross_reward_per_share, 3),
                "net_reward_per_share_after_costs": round(net_reward_per_share, 3),
                "risk_per_share": round(risk_per_share, 3),
                "projected_rr_after_costs": round(net_reward_per_share / risk_per_share, 3) if risk_per_share > 0 else None,
                "slippage_buffer_pct": slippage_ctx.get("buffer_pct"),
                "slippage_buffer_basis": slippage_ctx.get("buffer_basis"),
                "slippage_drag_per_share": round(slippage_drag_per_share, 3),
                "slippage_adjusted_net_reward_per_share": round(slippage_adjusted_net_reward, 3),
                "slippage_adjusted_risk_per_share": round(slippage_adjusted_risk, 3),
                "slippage_adjusted_rr_after_costs": round(slippage_adjusted_net_reward / slippage_adjusted_risk, 3) if slippage_adjusted_risk > 0 else None,
                "capital_allocated": active_setup.get("capital_allocated"),
                "risk_amount": active_setup.get("risk_amount"),
            }

    return input_data


async def get_value_ai_verdict_cloud(summary_data: dict, provider: str = "groq") -> dict:
    """Value Investing via Cloud API (Groq or Nvidia)."""
    input_data = _build_value_input(summary_data)
    return await AIService.get_value_verdict_cloud(input_data, provider=provider)


async def get_trading_ai_verdict_cloud(summary_data: dict, provider: str = "groq") -> dict:
    """Trading analysis via Cloud API (Groq or Nvidia)."""
    input_data = _build_trading_input(summary_data)
    return await AIService.get_trading_verdict_cloud(input_data, provider=provider)


def get_frontier_prompt(mode: str, summary_data: dict) -> str:
    """Generates a copy-paste prompt for frontier model web UIs."""
    if mode.lower() == "trading":
        input_data = _build_trading_input(summary_data)
    else:
        input_data = _build_value_input(summary_data)
    return AIService.generate_frontier_prompt(mode, input_data)
