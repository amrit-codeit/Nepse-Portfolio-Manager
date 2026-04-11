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
    
    # 52-week high/low from the dataset (assuming ~250 trading days in a year)
    high_52w = df['high'].max()
    low_52w = df['low'].min()
    
    latest_row = df.iloc[-1]
    
    ltp = latest_row['close']
    ema_50 = latest_row.get('EMA_50')
    ema_200 = latest_row.get('EMA_200')
    rsi_14 = latest_row.get('RSI_14')
    
    ema_50_status = "Bullish" if ema_50 and ltp > ema_50 else "Bearish"
    ema_200_status = "Bullish" if ema_200 and ltp > ema_200 else "Bearish"
    
    if pd.isna(ema_50): ema_50 = None
    if pd.isna(ema_200): ema_200 = None
    if pd.isna(rsi_14): rsi_14 = None
    
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
        "rsi_14": float(rsi_14) if rsi_14 else None
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
