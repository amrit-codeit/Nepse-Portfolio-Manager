"""Stock Screener API: cached fundamentals plus strategy-aware trading filters."""

from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.company import Company
from app.models.fundamental import StockOverview
from app.models.price import LivePrice, PriceHistory
import pandas as pd
import pandas_ta as ta
from app.scrapers.screener_scraper import NepseAlphaScreenerScraper

router = APIRouter(prefix="/api/v1/screener", tags=["Screener"])

STALE_TECHNICAL_HOURS = 12


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
            df.ta.atr(length=14, append=True)
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
        atr_14 = safe_float(latest.get("ATRr_14"))

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

        adt_20 = float((df["close"] * df["volume"]).tail(20).mean()) if len(df) >= 20 else None
        liquidity_grade = "A" if adt_20 and adt_20 >= 50_000_000 else "B" if adt_20 and adt_20 >= 20_000_000 else "C" if adt_20 and adt_20 >= 5_000_000 else "D"
        volatility_risk_tag = "HIGH" if atr_14 and ltp and atr_14 / ltp >= 0.08 else "MEDIUM" if atr_14 and ltp and atr_14 / ltp >= 0.04 else "LOW"
        setup_type_tags = []
        if macd_hist and macd_hist > 0 and rsi_14 and 50 <= rsi_14 <= 68 and (ema_50 and ltp > ema_50):
            setup_type_tags.append("Momentum continuation")
        if vol_ratio and vol_ratio >= 1.5 and placement_52w >= 75:
            setup_type_tags.append("Breakout candidate")
        if ema_50 and ltp > ema_50 and rsi_14 and 40 <= rsi_14 <= 55:
            setup_type_tags.append("Pullback in bullish trend")
        if rsi_14 and rsi_14 <= 35 and vsa_reversal and "Bullish" in vsa_reversal:
            setup_type_tags.append("Mean-reversion bounce")
        if not setup_type_tags:
            setup_type_tags.append("Avoid / weak structure")

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
            "atr_14": round(atr_14, 2) if atr_14 else None,
            "vsa_reversal": vsa_reversal,
            "adt_20": round(adt_20, 2) if adt_20 else None,
            "liquidity_grade": liquidity_grade,
            "setup_type_tags": setup_type_tags,
            "volatility_risk_tag": volatility_risk_tag,
            "suggested_stop_loss": round(ltp - 1.5 * atr_14, 2) if atr_14 else None,
            "suggested_target_1": round(ltp + 2.0 * atr_14, 2) if atr_14 else None,
            "data_points": len(prices),
        }

    # 4. Build response
    results = []
    for c in companies:
        ov = overviews.get(c.symbol)
        lp = live_prices.get(c.symbol)
        tech = technicals_map.get(c.symbol)

        ltp = None
        stale_technical_data = True
        if lp and lp.ltp:
            ltp = lp.ltp
            updated_at = lp.updated_at
            if updated_at:
                updated_dt = updated_at if updated_at.tzinfo else updated_at.replace(tzinfo=timezone.utc)
                stale_technical_data = updated_dt < datetime.now(timezone.utc) - timedelta(hours=STALE_TECHNICAL_HOURS)
        elif tech:
            ltp = tech.get("ltp")
            stale_technical_data = False

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
            "atr_14": tech["atr_14"] if tech else None,
            "vsa_reversal": tech["vsa_reversal"] if tech else None,
            "adt_20": tech["adt_20"] if tech else None,
            "liquidity_grade": tech["liquidity_grade"] if tech else None,
            "setup_type_tags": tech["setup_type_tags"] if tech else [],
            "volatility_risk_tag": tech["volatility_risk_tag"] if tech else None,
            "suggested_stop_loss": tech["suggested_stop_loss"] if tech else None,
            "suggested_target_1": tech["suggested_target_1"] if tech else None,
            "high_52w": tech["high_52w"] if tech else None,
            "low_52w": tech["low_52w"] if tech else None,
            "placement_52w": tech["placement_52w"] if tech else None,
            "stale_technical_data": stale_technical_data,
            "has_technicals": tech is not None,
            "has_fundamentals": ov is not None,
        })

    return {"stocks": results, "total": len(results)}


@router.get("/fundamental")
def get_fundamental_screener(
    pe_ratio: str = None,
    pb_ratio: str = None,
    peg_ratio: str = None,
    roe: str = None,
    roa: str = None,
    total_dividend_to_ltp: str = None,
    ltp: str = None,
    graham_num: str = None,
    shares_outstnading: str = None,
    eps: str = None,
    book_value: str = None,
    sector: str = None,
    yoy_growth: str = None,
    d_eqty_min: str = None,
    d_eqty_max: str = None,
    payout_ratio_min: str = None,
    payout_ratio_max: str = None,
):
    """
    On-demand fundamental screening via NepseAlpha.
    Scrapes live data based on user-provided parameters.
    """
    filters = {
        'pe_ratio': pe_ratio,
        'pb_ratio': pb_ratio,
        'peg_ratio': peg_ratio,
        'roe': roe,
        'roa': roa,
        'total_dividend_to_ltp': total_dividend_to_ltp,
        'ltp': ltp,
        'graham_num': graham_num,
        'shares_outstnading': shares_outstnading,
        'eps': eps,
        'book_value': book_value,
        'sector': sector,
        'yoy_growth': yoy_growth,
        'd_eqty_min': d_eqty_min,
        'd_eqty_max': d_eqty_max,
        'payout_ratio_min': payout_ratio_min,
        'payout_ratio_max': payout_ratio_max,
    }
    
    # Remove None values
    filters = {k: v for k, v in filters.items() if v is not None}
    
    scraper = NepseAlphaScreenerScraper()
    raw_data = scraper.scrape_fundamental_screener(filters)
    processed_data = scraper.process_data(raw_data)
    
    return {
        "stocks": processed_data,
        "total": len(processed_data),
        "filters_applied": filters
    }

@router.get("/technical")
def get_technical_screener(
    rsi: str = None,
    rsi_min: str = None,
    rsi_max: str = None,
    macd: str = None,
    sma_200: str = None,
    sma_520: str = None,
    bollinger_band: str = None,
    stochastic_14: str = None,
    sma_20: str = None,
    sma_50: str = None,
    mfi_14: str = None,
    ltp: str = None,
    beta_3m: str = None,
    sector: str = None,
):
    """
    On-demand technical screening via NepseAlpha.
    Scrapes live data based on user-provided parameters.
    """
    filters = {
        'rsi': rsi,
        'rsi_min': rsi_min,
        'rsi_max': rsi_max,
        'macd': macd,
        'sma_200': sma_200,
        'sma_520': sma_520,
        'bollinger_band': bollinger_band,
        'stochastic_14': stochastic_14,
        'sma_20': sma_20,
        'sma_50': sma_50,
        'mfi_14': mfi_14,
        'ltp': ltp,
        'beta_3m': beta_3m,
        'sector': sector,
    }
    
    # Remove None values
    filters = {k: v for k, v in filters.items() if v is not None}
    
    scraper = NepseAlphaScreenerScraper()
    raw_data = scraper.scrape_technical_screener(filters)
    processed_data = scraper.process_technical_data(raw_data)
    
    return {
        "stocks": processed_data,
        "total": len(processed_data),
        "filters_applied": filters
    }
