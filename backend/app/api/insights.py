from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.price import PriceHistory
from app.models.fundamental import StockOverview, FundamentalReport, QuarterlyGrowth
import pandas as pd
import pandas_ta as ta

router = APIRouter(prefix="/api/insights", tags=["Insights"])

@router.get("/{symbol}")
def get_insights(symbol: str, db: Session = Depends(get_db)):
    """Get technical and fundamental insights for a given symbol."""
    symbol = symbol.upper()
    
    # 1. Fetch historical prices (at least 200 days for 200 EMA)
    prices = db.query(PriceHistory).filter(PriceHistory.symbol == symbol).order_by(PriceHistory.date.desc()).limit(250).all()
    
    if not prices or len(prices) < 50:
        return {
            "symbol": symbol,
            "error": "Insufficient historical data. Please sync historical prices first.",
            "technicals": None,
            "fundamentals": None
        }

    # Reverse to chronological order
    prices = prices[::-1]
    
    # Convert to DataFrame
    df = pd.DataFrame([{
        "date": p.date, 
        "open": p.open, 
        "high": p.high, 
        "low": p.low, 
        "close": p.close, 
        "volume": p.volume
    } for p in prices])
    
    # Calculate indicators
    df.ta.ema(length=50, append=True)
    df.ta.ema(length=200, append=True)
    df.ta.rsi(length=14, append=True)
    df.ta.macd(fast=12, slow=26, signal=9, append=True)
    df.ta.bbands(length=20, std=2, append=True)
    df.ta.obv(append=True)
    
    # Volume SMA (20 days)
    df.ta.sma(close='volume', length=20, append=True, prefix='VOL')
    
    # 52-week high/low from the dataset (assuming ~250 trading days in a year)
    high_52w = df['high'].max()
    low_52w = df['low'].min()
    
    latest_row = df.iloc[-1]
    prev_row = df.iloc[-2] if len(df) > 1 else latest_row
    
    ltp = latest_row['close']
    ema_50 = latest_row.get('EMA_50')
    ema_200 = latest_row.get('EMA_200')
    rsi_14 = latest_row.get('RSI_14')
    
    # New indicators
    volume = latest_row.get('volume', 0)
    vol_sma_20 = latest_row.get('VOL_SMA_20')
    vol_ratio = (volume / vol_sma_20) if pd.notna(vol_sma_20) and vol_sma_20 > 0 else 0
    
    macd = latest_row.get('MACD_12_26_9')
    macd_signal = latest_row.get('MACDs_12_26_9')
    macd_hist = latest_row.get('MACDh_12_26_9')
    macd_status = "Bullish" if pd.notna(macd_hist) and macd_hist > 0 else "Bearish"
    
    bb_upper = latest_row.get('BBU_20_2.0_2.0')
    bb_lower = latest_row.get('BBL_20_2.0_2.0')
    bb_mid = latest_row.get('BBM_20_2.0_2.0')
    
    obv = latest_row.get('OBV')
    obv_prev = prev_row.get('OBV')
    obv_status = "Accumulation" if pd.notna(obv) and pd.notna(obv_prev) and obv > obv_prev else "Distribution"
    
    ema_50_status = "Bullish" if ema_50 and ltp > ema_50 else "Bearish"
    ema_200_status = "Bullish" if ema_200 and ltp > ema_200 else "Bearish"
    
    if pd.isna(ema_50): ema_50 = None
    if pd.isna(ema_200): ema_200 = None
    if pd.isna(rsi_14): rsi_14 = None
    if pd.isna(macd): macd = None
    if pd.isna(macd_signal): macd_signal = None
    if pd.isna(macd_hist): macd_hist = None
    if pd.isna(bb_upper): bb_upper = None
    if pd.isna(bb_lower): bb_lower = None
    if pd.isna(vol_sma_20): vol_sma_20 = None
    if pd.isna(obv): obv = None
    
    # 52w placement percentage (0 = at low, 100 = at high)
    placement_52w = 0
    if high_52w > low_52w:
        placement_52w = ((ltp - low_52w) / (high_52w - low_52w)) * 100
        
    technicals = {
        "ltp": float(ltp),
        "high_52w": float(high_52w),
        "low_52w": float(low_52w),
        "placement_52w": float(placement_52w),
        "ema_50": float(ema_50) if ema_50 else None,
        "ema_50_status": ema_50_status,
        "ema_200": float(ema_200) if ema_200 else None,
        "ema_200_status": ema_200_status,
        "rsi_14": float(rsi_14) if rsi_14 else None,
        # New technicals
        "volume": float(volume),
        "vol_sma_20": float(vol_sma_20) if vol_sma_20 else None,
        "vol_ratio": float(vol_ratio),
        "obv": float(obv) if obv else None,
        "obv_status": obv_status,
        "macd": float(macd) if macd else None,
        "macd_signal": float(macd_signal) if macd_signal else None,
        "macd_hist": float(macd_hist) if macd_hist else None,
        "macd_status": macd_status,
        "bb_upper": float(bb_upper) if bb_upper else None,
        "bb_lower": float(bb_lower) if bb_lower else None
    }
    
    # 2. Fetch fundamental data from scraped tables
    overview = db.query(StockOverview).filter_by(symbol=symbol).first()
    quarterly = (db.query(FundamentalReport)
                 .filter_by(symbol=symbol)
                 .order_by(FundamentalReport.quarter.desc())
                 .all())

    growths = (db.query(QuarterlyGrowth)
               .filter_by(symbol=symbol)
               .order_by(QuarterlyGrowth.fiscal_year.desc(), QuarterlyGrowth.quarter.desc())
               .all())

    fundamentals = None
    if overview or quarterly:
        fundamentals = {
            "overview": {
                "pe_ratio": overview.pe_ratio if overview else None,
                "pb_ratio": overview.pb_ratio if overview else None,
                "roe_ttm": overview.roe_ttm if overview else None,
                "eps_ttm": overview.eps_ttm if overview else None,
                "book_value": overview.book_value if overview else None,
                "net_profit_ttm": overview.net_profit_ttm if overview else None,
                "updated_at": overview.updated_at.isoformat() if overview and overview.updated_at else None,
            },
            "quarterly": [
                {
                    "quarter": r.quarter,
                    "paid_up_capital": r.paid_up_capital,
                    "net_profit": r.net_profit,
                    "sector_metrics": r.sector_metrics or {},
                }
                for r in quarterly
            ],
            "growths": [
                {
                    "particulars": g.particulars,
                    "fiscal_year": g.fiscal_year,
                    "quarter": g.quarter,
                    "value": g.value,
                    "financial_date": g.financial_date
                }
                for g in growths
            ]
        }

    return {
        "symbol": symbol,
        "technicals": technicals,
        "fundamentals": fundamentals
    }
