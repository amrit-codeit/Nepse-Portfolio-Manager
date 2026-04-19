"""
Market Context API — Conjunction Trading System.

Computes technicals (RSI, SMA, trend) for:
  1. NEPSE Composite Index (GATE 2 — Market Pulse)
  2. Sector Sub-Indices (GATE 3 — Sector Tailwind)
  3. Individual stock extended technicals (ATR, Pivots, ADT)

This powers the 3-layer conjunction check: Market → Sector → Stock.
"""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.database import get_db
from app.models.price import IndexHistory, PriceHistory
from app.models.company import Company
from app.models.fundamental import FundamentalReport
from app.scrapers.index_scraper import SECTOR_INDICES, INDEX_TO_SECTOR
import pandas as pd
import pandas_ta as ta

router = APIRouter(prefix="/api/market", tags=["Market Context"])


def _compute_index_technicals(rows):
    """Compute RSI, SMA, MACD, trend from a list of IndexHistory rows (chronological)."""
    if not rows or len(rows) < 20:
        return None

    df = pd.DataFrame([{
        "date": r.date,
        "close": r.close,
        "high": r.high or r.close,
        "low": r.low or r.close,
    } for r in rows])

    df.ta.rsi(length=14, append=True)
    df.ta.sma(length=20, append=True)
    df.ta.sma(length=50, append=True)
    df.ta.sma(length=200, append=True)
    df.ta.ema(length=20, append=True)
    df.ta.macd(fast=12, slow=26, signal=9, append=True)

    latest = df.iloc[-1]

    def sf(val):
        try:
            v = float(val)
            return round(v, 2) if pd.notna(v) else None
        except (TypeError, ValueError):
            return None

    close = float(latest["close"])
    sma_20 = sf(latest.get("SMA_20"))
    sma_50 = sf(latest.get("SMA_50"))
    sma_200 = sf(latest.get("SMA_200"))
    rsi_14 = sf(latest.get("RSI_14"))
    macd_hist = sf(latest.get("MACDh_12_26_9"))

    # Trend determination
    trend = "Neutral"
    if sma_50 and sma_200:
        if close > sma_50 > sma_200:
            trend = "Strong Uptrend"
        elif close > sma_50:
            trend = "Uptrend"
        elif close < sma_50 < sma_200:
            trend = "Strong Downtrend"
        elif close < sma_50:
            trend = "Downtrend"

    # Change calculations
    high_52w = float(df["high"].max())
    low_52w = float(df["low"].min())
    placement = ((close - low_52w) / (high_52w - low_52w) * 100) if high_52w > low_52w else 0

    # 1-day change
    prev_close = float(df.iloc[-2]["close"]) if len(df) > 1 else close
    day_change = close - prev_close
    day_change_pct = (day_change / prev_close * 100) if prev_close else 0

    return {
        "close": close,
        "day_change": round(day_change, 2),
        "day_change_pct": round(day_change_pct, 2),
        "sma_20": sma_20,
        "sma_50": sma_50,
        "sma_200": sma_200,
        "rsi_14": rsi_14,
        "macd_hist": macd_hist,
        "trend": trend,
        "above_sma_20": close > sma_20 if sma_20 else None,
        "above_sma_50": close > sma_50 if sma_50 else None,
        "above_sma_200": close > sma_200 if sma_200 else None,
        "high_52w": round(high_52w, 2),
        "low_52w": round(low_52w, 2),
        "placement_52w": round(placement, 2),
        "data_points": len(df),
    }


@router.get("/context")
def get_market_context(db: Session = Depends(get_db)):
    """
    Returns the full market conjunction context:
    - NEPSE Index technicals (GATE 2)
    - All sector sub-index technicals (GATE 3)
    - Market health verdict
    """
    # 1. NEPSE Composite Index
    nepse_rows = (
        db.query(IndexHistory)
        .filter(IndexHistory.index_id == 12)
        .order_by(IndexHistory.date.desc())
        .limit(250)
        .all()
    )
    nepse_rows = nepse_rows[::-1]  # chronological
    nepse_tech = _compute_index_technicals(nepse_rows)

    # Market health verdict (GATE 2)
    market_verdict = "NEUTRAL"
    if nepse_tech:
        bullish_signals = sum([
            nepse_tech.get("above_sma_50", False),
            nepse_tech.get("above_sma_200", False),
            (nepse_tech.get("rsi_14") or 50) > 45,
            (nepse_tech.get("macd_hist") or 0) > 0,
        ])
        if bullish_signals >= 3:
            market_verdict = "BULLISH"
        elif bullish_signals <= 1:
            market_verdict = "BEARISH"

    # 2. Sector Sub-Indices
    sectors = {}
    for idx_id, idx_name in SECTOR_INDICES.items():
        if idx_id == 12:
            continue  # Skip NEPSE composite

        rows = (
            db.query(IndexHistory)
            .filter(IndexHistory.index_id == idx_id)
            .order_by(IndexHistory.date.desc())
            .limit(250)
            .all()
        )
        if not rows:
            continue

        rows = rows[::-1]
        tech = _compute_index_technicals(rows)
        if tech:
            # Map to company sector name
            company_sector = INDEX_TO_SECTOR.get(idx_name, idx_name)
            sectors[company_sector] = {
                "index_name": idx_name,
                "index_id": idx_id,
                **tech
            }

    return {
        "nepse": {
            "index_name": "NEPSE Index",
            **(nepse_tech or {}),
        },
        "market_verdict": market_verdict,
        "sectors": sectors,
        "available_sectors": len(sectors),
    }


@router.get("/context/{sector}")
def get_sector_context(sector: str, db: Session = Depends(get_db)):
    """Get detailed technicals for a specific sector sub-index."""
    # Find matching index
    target_id = None
    target_name = None
    for idx_id, idx_name in SECTOR_INDICES.items():
        mapped_sector = INDEX_TO_SECTOR.get(idx_name, idx_name)
        if mapped_sector.lower() == sector.lower() or idx_name.lower() == sector.lower():
            target_id = idx_id
            target_name = idx_name
            break

    if not target_id:
        return {"error": f"No index found for sector: {sector}"}

    rows = (
        db.query(IndexHistory)
        .filter(IndexHistory.index_id == target_id)
        .order_by(IndexHistory.date.desc())
        .limit(250)
        .all()
    )
    if not rows:
        return {"error": f"No historical data for {target_name}. Run sector index sync first."}

    rows = rows[::-1]
    tech = _compute_index_technicals(rows)
    return {
        "index_name": target_name,
        "index_id": target_id,
        "sector": INDEX_TO_SECTOR.get(target_name, target_name),
        **(tech or {}),
    }


@router.get("/stock-technicals/{symbol}")
def get_extended_stock_technicals(symbol: str, db: Session = Depends(get_db)):
    """
    Extended technical indicators for a single stock:
    ATR(14), SMA(20/50), Pivot Points, ADT, and trading gate verdicts.
    This supplements the existing /api/insights/{symbol} endpoint.
    """
    symbol = symbol.upper()

    prices = (
        db.query(PriceHistory)
        .filter(PriceHistory.symbol == symbol)
        .order_by(PriceHistory.date.desc())
        .limit(250)
        .all()
    )

    if not prices or len(prices) < 20:
        return {"symbol": symbol, "error": "Insufficient price history"}

    prices = prices[::-1]
    df = pd.DataFrame([{
        "date": p.date,
        "close": p.close,
        "high": p.high or p.close,
        "low": p.low or p.close,
        "open": p.open or p.close,
        "volume": p.volume or 0,
    } for p in prices])

    # Compute all indicators
    df.ta.atr(length=14, append=True)
    df.ta.sma(length=20, append=True)
    df.ta.sma(length=50, append=True)
    df.ta.sma(length=200, append=True)
    df.ta.ema(length=20, append=True)
    df.ta.ema(length=50, append=True)
    df.ta.ema(length=200, append=True)
    df.ta.rsi(length=14, append=True)
    df.ta.macd(fast=12, slow=26, signal=9, append=True)
    df.ta.bbands(length=20, std=2, append=True)
    df.ta.adx(length=14, append=True)
    df.ta.obv(append=True)
    df.ta.sma(close='volume', length=20, append=True, prefix='VOL')

    latest = df.iloc[-1]
    prev = df.iloc[-2] if len(df) > 1 else latest

    def sf(val):
        try:
            v = float(val)
            return round(v, 2) if pd.notna(v) else None
        except (TypeError, ValueError):
            return None

    close = float(latest["close"])
    high = float(latest["high"])
    low = float(latest["low"])

    # Pivot Points (Classic Floor Trader Method)
    pivot = (high + low + close) / 3
    r1 = 2 * pivot - low
    s1 = 2 * pivot - high
    r2 = pivot + (high - low)
    s2 = pivot - (high - low)
    r3 = high + 2 * (pivot - low)
    s3 = low - 2 * (high - pivot)

    # Average Daily Turnover (ADT) — last 20 days
    df["turnover"] = df["close"] * df["volume"]
    adt_20 = float(df["turnover"].tail(20).mean()) if len(df) >= 20 else None

    # ATR
    atr_14 = sf(latest.get("ATRr_14"))

    # ADX
    adx_14 = sf(latest.get("ADX_14"))
    dmp = sf(latest.get("DMP_14"))
    dmn = sf(latest.get("DMN_14"))

    # Volume
    volume = sf(latest.get("volume"))
    vol_sma_20 = sf(latest.get("VOL_SMA_20"))
    vol_ratio = (volume / vol_sma_20) if volume and vol_sma_20 and vol_sma_20 > 0 else None

    # OBV
    obv = sf(latest.get("OBV"))
    obv_prev = sf(prev.get("OBV"))
    obv_status = "Accumulation" if obv and obv_prev and obv > obv_prev else "Distribution"

    # MACD
    macd_hist = sf(latest.get("MACDh_12_26_9"))

    # RSI
    rsi_14 = sf(latest.get("RSI_14"))

    # EMA status
    ema_20 = sf(latest.get("EMA_20"))
    ema_50 = sf(latest.get("EMA_50"))
    ema_200 = sf(latest.get("EMA_200"))

    # Bollinger
    bb_upper = sf(latest.get("BBU_20_2.0_2.0"))
    bb_lower = sf(latest.get("BBL_20_2.0_2.0"))

    # 52-week
    high_52w = float(df["high"].max())
    low_52w = float(df["low"].min())
    placement_52w = ((close - low_52w) / (high_52w - low_52w) * 100) if high_52w > low_52w else 0

    # ------- TRADING GATE VERDICTS -------
    # GATE 1: Liquidity (ADT > Rs. 15 Lakhs = 1,500,000)
    gate1_liquidity = "PASS" if adt_20 and adt_20 > 1_500_000 else "FAIL"

    # GATE 5: Technical Trigger
    bullish_count = sum([
        bool(ema_50 and close > ema_50),
        bool(rsi_14 and 40 < rsi_14 < 70),
        bool(macd_hist and macd_hist > 0),
        bool(vol_ratio and vol_ratio > 1.0),
        bool(adx_14 and adx_14 > 20),
    ])
    gate5_technical = "STRONG BUY" if bullish_count >= 4 else "BUY" if bullish_count >= 3 else "NEUTRAL" if bullish_count >= 2 else "AVOID"

    # Stop Loss calculations (ATR-based)
    atr_stop = None
    atr_target_1 = None
    atr_target_2 = None
    if atr_14:
        atr_stop = round(close - 1.5 * atr_14, 2)
        atr_target_1 = round(close + 2.0 * atr_14, 2)  # T1: 2x ATR
        atr_target_2 = round(close + 3.5 * atr_14, 2)  # T2: 3.5x ATR

    # Risk/Reward ratio
    risk_reward = None
    if atr_stop and atr_target_1:
        risk = close - atr_stop
        reward = atr_target_1 - close
        risk_reward = round(reward / risk, 2) if risk > 0 else None

    # Look up this stock's sector for sector context
    company = db.query(Company).filter(Company.symbol == symbol).first()
    sector = company.sector if company else None

    # ------- GATE 4: Fundamental Floors -------
    fund_report = db.query(FundamentalReport).filter(FundamentalReport.symbol == symbol).order_by(FundamentalReport.id.desc()).first()
    npl = None
    car = None
    eps = None
    gate4_fundamental = "UNKNOWN"
    
    if fund_report and fund_report.sector_metrics:
        metrics = fund_report.sector_metrics
        npl = metrics.get('NPL')
        car = metrics.get('CAR')
        eps = metrics.get('EPS Reported')

        is_bfi = sector and any(s in sector for s in ['Bank', 'Finance', 'Microfinance'])
        
        if is_bfi:
            if npl is not None and car is not None:
                gate4_fundamental = "PASS" if (npl < 5.0 and car > 11.0) else "FAIL"
        else:
            if eps is not None:
                gate4_fundamental = "PASS" if eps > 0 else "FAIL"

    return {
        "symbol": symbol,
        "sector": sector,
        "ltp": close,
        # Extended technicals
        "atr_14": atr_14,
        "adx_14": adx_14,
        "adx_dmp": dmp,
        "adx_dmn": dmn,
        "sma_20": sf(latest.get("SMA_20")),
        "sma_50": sf(latest.get("SMA_50")),
        "sma_200": sf(latest.get("SMA_200")),
        "ema_20": ema_20,
        "ema_50": ema_50,
        "ema_200": ema_200,
        "rsi_14": rsi_14,
        "macd_hist": macd_hist,
        "macd": sf(latest.get("MACD_12_26_9")),
        "macd_signal": sf(latest.get("MACDs_12_26_9")),
        "bb_upper": bb_upper,
        "bb_lower": bb_lower,
        "volume": volume,
        "vol_sma_20": vol_sma_20,
        "vol_ratio": round(vol_ratio, 2) if vol_ratio else None,
        "obv_status": obv_status,
        # 52-week
        "high_52w": round(high_52w, 2),
        "low_52w": round(low_52w, 2),
        "placement_52w": round(placement_52w, 2),
        # Pivot Points
        "pivot": round(pivot, 2),
        "resistance_1": round(r1, 2),
        "resistance_2": round(r2, 2),
        "resistance_3": round(r3, 2),
        "support_1": round(s1, 2),
        "support_2": round(s2, 2),
        "support_3": round(s3, 2),
        # ADT
        "adt_20": round(adt_20, 2) if adt_20 else None,
        # Trading Gates
        "gate1_liquidity": gate1_liquidity,
        "gate4_fundamental": gate4_fundamental,
        "gate5_technical": gate5_technical,
        "npl": npl,
        "car": car,
        "eps_reported": eps,
        # Risk Management (ATR-based)
        "stop_loss": atr_stop,
        "target_1": atr_target_1,
        "target_2": atr_target_2,
        "risk_reward": risk_reward,
        "data_points": len(df),
    }
