
from app.database import SessionLocal
from app.models.transaction import Transaction
from app.services.portfolio_engine import recalculate_holdings

def run():
    db = SessionLocal()
    try:
        # Get all unique (member_id, symbol) pairs from transactions
        pairs = db.query(Transaction.member_id, Transaction.symbol).distinct().all()
        
        print(f"Recalculating holdings for {len(pairs)} member-symbol combinations...")
        
        for mid, sym in pairs:
            print(f"  - Member {mid}: {sym}")
            recalculate_holdings(db, mid, sym)
            
        print("Done!")
    finally:
        db.close()

if __name__ == "__main__":
    run()
