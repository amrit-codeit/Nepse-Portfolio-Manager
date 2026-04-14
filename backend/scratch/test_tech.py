from app.database import SessionLocal
from app.api.insights import get_insights

db = SessionLocal()
try:
    res = get_insights("NABIL", db)
    if "error" in res and res["error"]:
        print(f"Error: {res['error']}")
    else:
        tech = res["technicals"]
        print(f"LTP: {tech['ltp']}")
        print(f"Vol: {tech['volume']} | Vol SMA: {tech['vol_sma_20']} | Ratio: {tech['vol_ratio']}")
        print(f"MACD Hist: {tech['macd_hist']} | Status: {tech['macd_status']}")
        print(f"BB Lower: {tech['bb_lower']} | BB Upper: {tech['bb_upper']}")
        print(f"OBV Status: {tech['obv_status']}")
finally:
    db.close()
print("Success!")
