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
from app.models.price import IndexHistory, PriceHistory, LivePrice, NavValue
from app.models.company import Company
from datetime import datetime
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

    company = db.query(Company).filter(Company.symbol == symbol).first()
    if company:
        live = db.query(LivePrice).filter(LivePrice.company_id == company.id).first()
        live_price, live_vol, live_open, live_high, live_low, updated_at = None, 0, None, None, None, None
        
        if live and live.ltp and live.ltp > 0:
            live_price = live.ltp
            live_vol = live.volume
            live_open = live.open_price or live.ltp
            live_high = live.high or live.ltp
            live_low = live.low or live.ltp
            updated_at = live.updated_at
        else:
            nav = db.query(NavValue).filter(NavValue.company_id == company.id).first()
            if nav and nav.nav:
                live_price = nav.nav
                live_vol = 0
                live_open, live_high, live_low = live_price, live_price, live_price
                updated_at = nav.updated_at
                
        if live_price and not df.empty:
            live_date = updated_at.date() if updated_at else datetime.today().date()
            last_hist_date = df.iloc[-1]['date']
            
            if live_date > last_hist_date:
                new_row = pd.DataFrame([{
                    "date": live_date,
                    "open": live_open,
                    "high": live_high,
                    "low": live_low,
                    "close": live_price,
                    "volume": live_vol or 0
                }])
                df = pd.concat([df, new_row], ignore_index=True)
            elif live_date == last_hist_date:
                df.at[df.index[-1], 'close'] = live_price
                if live_vol is not None and pd.notna(live_vol):
                    df.at[df.index[-1], 'volume'] = live_vol
                if live_high is not None and pd.notna(live_high):
                    df.at[df.index[-1], 'high'] = max(live_high, df.at[df.index[-1], 'high'])
                if live_low is not None and pd.notna(live_low):
                    df.at[df.index[-1], 'low'] = min(live_low, df.at[df.index[-1], 'low'])


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

    # VSA: High Volume Reversal
    vsa_reversal = None
    open_p = float(latest["open"])
    body = abs(close - open_p)
    upper_wick = high - max(open_p, close)
    lower_wick = min(open_p, close) - low
    
    if vol_ratio and vol_ratio >= 1.5:
        prev_open = float(prev["open"])
        prev_close = float(prev["close"])
        # Bullish reversal: long lower wick, small body
        if lower_wick > (2 * body) and upper_wick < body:
            vsa_reversal = "Bullish Reversal (Hammer)"
        # Bearish reversal: long upper wick, small body
        elif upper_wick > (2 * body) and lower_wick < body:
            vsa_reversal = "Bearish Reversal (Shooting Star)"
        # Bullish Engulfing
        elif close > open_p and prev_close < prev_open and close > prev_open and open_p < prev_close:
            vsa_reversal = "Bullish Engulfing (High Vol)"
        # Bearish Engulfing
        elif close < open_p and prev_close > prev_open and close < prev_open and open_p > prev_close:
            vsa_reversal = "Bearish Engulfing (High Vol)"

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

    # Bollinger Squeeze (if current bandwidth is within 5% of its 120-day minimum)
    df['bb_bandwidth'] = (df['BBU_20_2.0_2.0'] - df['BBL_20_2.0_2.0']) / df['SMA_20']
    bb_squeeze = False
    if len(df) >= 120:
        min_bw_120 = df['bb_bandwidth'].tail(120).min()
        current_bw = float(df['bb_bandwidth'].iloc[-1])
        bb_squeeze = bool(current_bw <= (min_bw_120 * 1.05))

    # Relative Strength (RS) vs NEPSE (60-Day Alpha)
    rs_trend = "UNKNOWN"
    rs_alpha = None
    nepse_prices = db.query(IndexHistory).filter(IndexHistory.index_id == 12).order_by(IndexHistory.date.desc()).limit(250).all()
    if len(df) >= 60 and len(nepse_prices) >= 60:
        nepse_prices = nepse_prices[::-1]
        stock_rtn_60d = (close - float(df.iloc[-60]['close'])) / float(df.iloc[-60]['close'])
        nepse_rtn_60d = (float(nepse_prices[-1].close) - float(nepse_prices[-60].close)) / float(nepse_prices[-60].close)
        rs_alpha = stock_rtn_60d - nepse_rtn_60d
        rs_trend = "Outperforming" if rs_alpha > 0.05 else "Underperforming" if rs_alpha < -0.05 else "Market Performer"

    # ------- TRADING GATE VERDICTS -------
    # GATE 1: Liquidity (ADT > Rs. 50 Lakhs = 5,000,000)
    gate1_liquidity = "PASS" if adt_20 and adt_20 > 5_000_000 else "FAIL"

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
        "bb_squeeze": bb_squeeze,
        "rs_trend": rs_trend,
        "rs_alpha": round(rs_alpha * 100, 2) if rs_alpha else None,
        "vsa_reversal": vsa_reversal,
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

@router.get("/backtest/{symbol}")
def run_backtest(symbol: str, strategy: str = "ema_cross", db: Session = Depends(get_db)):
    """
    Runs a vectorized backtest for a given symbol and strategy with realistic constraints.
    Features: 2% Position Sizing, ATR Trailing Stop Loss, NEPSE Fees, CGT, Expectancy.
    """
    symbol = symbol.upper()
    prices = (
        db.query(PriceHistory)
        .filter(PriceHistory.symbol == symbol)
        .order_by(PriceHistory.date.asc())
        .all()
    )
    if not prices or len(prices) < 200:
        return {"error": "Insufficient price history for backtesting"}
        
    df = pd.DataFrame([{
        "date": p.date.isoformat() if hasattr(p.date, 'isoformat') else p.date,
        "close": float(p.close),
        "high": float(p.high or p.close),
        "low": float(p.low or p.close),
    } for p in prices])
    
    # Calculate indicators
    df.ta.atr(length=14, append=True)
    if strategy == "ema_cross":
        df.ta.ema(length=50, append=True)
        df.ta.ema(length=200, append=True)
    elif strategy == "rsi_bounce":
        df.ta.rsi(length=14, append=True)
    df.dropna(inplace=True)
    
    initial_capital = 500000.0  # 5 Lakhs default capital
    capital = initial_capital
    position = 0
    buy_price = 0
    stop_loss = 0
    highest_price_since_entry = 0
    trades = []
    
    for i in range(1, len(df)):
        prev = df.iloc[i-1]
        curr = df.iloc[i]
        
        # 1. Check Stop Loss / Trailing Stop FIRST
        if position > 0:
            highest_price_since_entry = max(highest_price_since_entry, curr['high'])
            current_atr = curr.get('ATRr_14', 0)
            
            if current_atr > 0:
                # 2x ATR Trailing Stop
                trailing_sl = highest_price_since_entry - (2 * current_atr)
                stop_loss = max(stop_loss, trailing_sl)
                
            if curr['low'] < stop_loss:
                # Sell at stop loss price (or open if gap down)
                sell_p = min(curr['close'], stop_loss)
                revenue = position * sell_p
                fee = revenue * 0.00415 + 25  # Broker + SEBON + DP
                net_revenue = revenue - fee
                gross_profit = net_revenue - (position * buy_price)
                cgt = gross_profit * 0.075 if gross_profit > 0 else 0
                net_profit = gross_profit - cgt
                
                capital += (net_revenue - cgt)
                trades.append({"type": "Sell (Stop Loss)", "date": curr['date'], "price": round(sell_p, 2), "shares": position, "profit": round(net_profit, 2)})
                position = 0
                continue

        # 2. Strategy Logic
        buy_signal = False
        sell_signal = False
        
        if strategy == "ema_cross":
            buy_signal = prev['EMA_50'] <= prev['EMA_200'] and curr['EMA_50'] > curr['EMA_200']
            sell_signal = prev['EMA_50'] >= prev['EMA_200'] and curr['EMA_50'] < curr['EMA_200']
        elif strategy == "rsi_bounce":
            buy_signal = prev['RSI_14'] <= 30 and curr['RSI_14'] > 30
            sell_signal = prev['RSI_14'] >= 70 and curr['RSI_14'] < 70

        if buy_signal and position == 0:
            current_atr = curr.get('ATRr_14', 0)
            if current_atr > 0:
                # Position Sizing: Risk exactly 2% of capital
                risk_per_share = 2 * current_atr
                max_risk = capital * 0.02
                shares = int(max_risk // risk_per_share)
                
                # Cannot buy more than capital allows
                max_shares_capital = int(capital // curr['close'])
                shares = min(shares, max_shares_capital)
                
                if shares > 0:
                    cost = shares * curr['close']
                    fee = cost * 0.00415 + 25
                    total_cost = cost + fee
                    
                    if capital >= total_cost:
                        capital -= total_cost
                        position = shares
                        buy_price = total_cost / shares
                        stop_loss = curr['close'] - risk_per_share
                        highest_price_since_entry = curr['close']
                        trades.append({"type": "Buy", "date": curr['date'], "price": round(curr['close'], 2), "shares": shares})
                        
        elif sell_signal and position > 0:
            revenue = position * curr['close']
            fee = revenue * 0.00415 + 25
            net_revenue = revenue - fee
            gross_profit = net_revenue - (position * buy_price)
            cgt = gross_profit * 0.075 if gross_profit > 0 else 0
            net_profit = gross_profit - cgt
            
            capital += (net_revenue - cgt)
            trades.append({"type": "Sell (Signal)", "date": curr['date'], "price": round(curr['close'], 2), "shares": position, "profit": round(net_profit, 2)})
            position = 0

    # Force close position at the end of backtest
    if position > 0:
        curr = df.iloc[-1]
        revenue = position * curr['close']
        fee = revenue * 0.00415 + 25
        net_revenue = revenue - fee
        gross_profit = net_revenue - (position * buy_price)
        cgt = gross_profit * 0.075 if gross_profit > 0 else 0
        net_profit = gross_profit - cgt
        
        capital += (net_revenue - cgt)
        trades.append({"type": "Sell (End)", "date": curr['date'], "price": round(curr['close'], 2), "shares": position, "profit": round(net_profit, 2)})
        position = 0

    final_equity = capital
    total_return = ((final_equity - initial_capital) / initial_capital) * 100
    
    sell_trades = [t for t in trades if t['type'].startswith('Sell')]
    winning_trades = len([t for t in sell_trades if t.get('profit', 0) > 0])
    win_rate = (winning_trades / len(sell_trades)) * 100 if sell_trades else 0
    
    gross_winning = sum([t['profit'] for t in sell_trades if t.get('profit', 0) > 0])
    gross_losing = abs(sum([t['profit'] for t in sell_trades if t.get('profit', 0) < 0]))
    profit_factor = round(gross_winning / gross_losing, 2) if gross_losing > 0 else round(gross_winning, 2)
    
    expectancy = 0
    if len(sell_trades) > 0:
        avg_win = gross_winning / winning_trades if winning_trades > 0 else 0
        avg_loss = gross_losing / (len(sell_trades) - winning_trades) if (len(sell_trades) - winning_trades) > 0 else 0
        win_rate_frac = winning_trades / len(sell_trades)
        expectancy = (win_rate_frac * avg_win) - ((1 - win_rate_frac) * avg_loss)

    return {
        "symbol": symbol,
        "strategy": strategy,
        "initial_capital": initial_capital,
        "final_equity": round(final_equity, 2),
        "total_return_pct": round(total_return, 2),
        "total_trades": len(sell_trades),
        "win_rate_pct": round(win_rate, 2),
        "profit_factor": profit_factor,
        "expectancy": round(expectancy, 2),
        "trades": trades[-30:] # Return last 30 for UI
    }
