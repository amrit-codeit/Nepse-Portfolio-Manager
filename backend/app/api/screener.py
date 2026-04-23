"""Stock Screener API — returns all companies with cached fundamentals + technicals for frontend filtering."""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.company import Company
from app.models.fundamental import StockOverview
from app.models.price import LivePrice, PriceHistory
import pandas as pd
import pandas_ta as ta

router = APIRouter(prefix="/api/screener", tags=["Screener"])


@router.get("")
def get_screener_data(db: Session = Depends(get_db)):
    """
    Returns a flat list of all equity companies with their latest fundamental
    overview + key technicals pre-computed. Designed for frontend-side filtering.
    """
    # 1. Fetch all non-MF companies
    companies = (
        db.query(Company)
        .filter(Company.instrument != "Open-End Mutual Fund")
        .filter(Company.status != "DELISTED")
        .order_by(Company.symbol)
        .all()
    )

    # 2. Bulk-fetch fundamentals (StockOverview) and live prices
    overviews = {o.symbol: o for o in db.query(StockOverview).all()}
    live_prices = {lp.symbol: lp for lp in db.query(LivePrice).all()}

    # 3. Pre-compute technicals for all symbols that have price history
    #    We batch-query the latest 250 rows per symbol to compute RSI, EMA, MACD etc.
    all_symbols = [c.symbol for c in companies]

    # Fetch all price history in one query, grouped by symbol
    all_prices = (
        db.query(PriceHistory)
        .filter(PriceHistory.symbol.in_(all_symbols))
        .order_by(PriceHistory.symbol, PriceHistory.date.desc())
        .all()
    )

    # Group by symbol
    price_map = {}
    for p in all_prices:
        if p.symbol not in price_map:
            price_map[p.symbol] = []
        if len(price_map[p.symbol]) < 250:
            price_map[p.symbol].append(p)

    # Compute technicals per symbol
    technicals_map = {}
    for symbol, prices in price_map.items():
        if len(prices) < 20:
            continue

        prices_chrono = prices[::-1]  # Reverse to chronological
        df = pd.DataFrame([{
            "close": p.close,
            "open": p.open or p.close,
            "high": p.high or p.close,
            "low": p.low or p.close,
            "volume": p.volume or 0,
        } for p in prices_chrono])

        try:
            df.ta.rsi(length=14, append=True)
            df.ta.ema(length=20, append=True)
            df.ta.ema(length=50, append=True)
            df.ta.ema(length=200, append=True)
            df.ta.macd(fast=12, slow=26, signal=9, append=True)
            df.ta.bbands(length=20, std=2, append=True)
            df.ta.sma(close='volume', length=20, append=True, prefix='VOL')
        except Exception:
            continue

        latest = df.iloc[-1]

        def safe_float(val):
            try:
                v = float(val)
                return v if pd.notna(v) else None
            except (TypeError, ValueError):
                return None

        high_52w = float(df["high"].max())
        low_52w = float(df["low"].min())
        ltp = float(latest["close"])
        placement_52w = ((ltp - low_52w) / (high_52w - low_52w) * 100) if high_52w > low_52w else 0

        ema_20 = safe_float(latest.get("EMA_20"))
        ema_50 = safe_float(latest.get("EMA_50"))
        ema_200 = safe_float(latest.get("EMA_200"))
        rsi_14 = safe_float(latest.get("RSI_14"))
        macd_hist = safe_float(latest.get("MACDh_12_26_9"))
        bb_upper = safe_float(latest.get("BBU_20_2.0_2.0"))
        bb_lower = safe_float(latest.get("BBL_20_2.0_2.0"))
        vol_sma_20 = safe_float(latest.get("VOL_SMA_20"))
        volume = safe_float(latest.get("volume"))
        vol_ratio = (volume / vol_sma_20) if volume and vol_sma_20 and vol_sma_20 > 0 else None

        vsa_reversal = None
        open_p = safe_float(latest.get("open"))
        close_p = safe_float(latest.get("close"))
        high_p = safe_float(latest.get("high"))
        low_p = safe_float(latest.get("low"))

        if open_p is not None and close_p is not None and high_p is not None and low_p is not None:
            body = abs(close_p - open_p)
            upper_wick = high_p - max(open_p, close_p)
            lower_wick = min(open_p, close_p) - low_p
            
            if vol_ratio and vol_ratio >= 1.5 and len(df) > 1:
                prev = df.iloc[-2]
                prev_open = safe_float(prev.get("open"))
                prev_close = safe_float(prev.get("close"))
                if prev_open is not None and prev_close is not None:
                    if lower_wick > (2 * body) and upper_wick < body:
                        vsa_reversal = "Bullish Reversal (Hammer)"
                    elif upper_wick > (2 * body) and lower_wick < body:
                        vsa_reversal = "Bearish Reversal (Shooting Star)"
                    elif close_p > open_p and prev_close < prev_open and close_p > prev_open and open_p < prev_close:
                        vsa_reversal = "Bullish Engulfing (High Vol)"
                    elif close_p < open_p and prev_close > prev_open and close_p < prev_open and open_p > prev_close:
                        vsa_reversal = "Bearish Engulfing (High Vol)"

        technicals_map[symbol] = {
            "ltp": ltp,
            "high_52w": high_52w,
            "low_52w": low_52w,
            "placement_52w": round(placement_52w, 2),
            "ema_20": ema_20,
            "ema_50": ema_50,
            "ema_200": ema_200,
            "ema_20_status": "Bullish" if ema_20 and ltp > ema_20 else "Bearish",
            "ema_50_status": "Bullish" if ema_50 and ltp > ema_50 else "Bearish",
            "ema_200_status": "Bullish" if ema_200 and ltp > ema_200 else "Bearish",
            "rsi_14": round(rsi_14, 2) if rsi_14 else None,
            "macd_hist": round(macd_hist, 2) if macd_hist else None,
            "bb_upper": bb_upper,
            "bb_lower": bb_lower,
            "volume": volume,
            "vol_sma_20": vol_sma_20,
            "vol_ratio": round(vol_ratio, 2) if vol_ratio else None,
            "vsa_reversal": vsa_reversal,
            "data_points": len(prices),
        }

    # 4. Build response
    results = []
    for c in companies:
        ov = overviews.get(c.symbol)
        lp = live_prices.get(c.symbol)
        tech = technicals_map.get(c.symbol)

        ltp = None
        if lp and lp.ltp:
            ltp = lp.ltp
        elif tech:
            ltp = tech.get("ltp")

        results.append({
            "symbol": c.symbol,
            "name": c.name,
            "sector": c.sector,
            "instrument": c.instrument,
            # Fundamentals
            "pe_ratio": ov.pe_ratio if ov else None,
            "pb_ratio": ov.pb_ratio if ov else None,
            "eps_ttm": ov.eps_ttm if ov else None,
            "roe_ttm": ov.roe_ttm if ov else None,
            "book_value": ov.book_value if ov else None,
            "net_profit_ttm": ov.net_profit_ttm if ov else None,
            # LTP
            "ltp": ltp,
            # Technicals (from computed cache)
            "rsi_14": tech["rsi_14"] if tech else None,
            "ema_20": tech["ema_20"] if tech else None,
            "ema_50": tech["ema_50"] if tech else None,
            "ema_200": tech["ema_200"] if tech else None,
            "ema_20_status": tech["ema_20_status"] if tech else None,
            "ema_50_status": tech["ema_50_status"] if tech else None,
            "ema_200_status": tech["ema_200_status"] if tech else None,
            "macd_hist": tech["macd_hist"] if tech else None,
            "bb_upper": tech["bb_upper"] if tech else None,
            "bb_lower": tech["bb_lower"] if tech else None,
            "volume": tech["volume"] if tech else None,
            "vol_sma_20": tech["vol_sma_20"] if tech else None,
            "vol_ratio": tech["vol_ratio"] if tech else None,
            "vsa_reversal": tech["vsa_reversal"] if tech else None,
            "high_52w": tech["high_52w"] if tech else None,
            "low_52w": tech["low_52w"] if tech else None,
            "placement_52w": tech["placement_52w"] if tech else None,
            "has_technicals": tech is not None,
            "has_fundamentals": ov is not None,
        })

    return {"stocks": results, "total": len(results)}
