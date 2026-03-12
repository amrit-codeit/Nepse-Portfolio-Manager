
from app.database import SessionLocal
from app.services.portfolio_engine import recalculate_holdings
from app.models.holding import Holding
from app.models.transaction import Transaction

def resync_all():
    db = SessionLocal()
    try:
        # Get all member/symbol pairs from transactions
        pairs = db.query(Transaction.member_id, Transaction.symbol).distinct().all()
        print(f"Found {len(pairs)} unique member/symbol pairs in transactions.")
        
        for mid, sym in pairs:
            print(f"Recalculating {sym} for member {mid}...")
            try:
                recalculate_holdings(db, mid, sym)
            except Exception as e:
                print(f"  Error recalculating {sym} for member {mid}: {e}")
        
        # Also find all holdings and verify they have transactions
        holdings = db.query(Holding).all()
        for h in holdings:
            count = db.query(Transaction).filter(Transaction.member_id == h.member_id, Transaction.symbol == h.symbol).count()
            if count == 0:
                print(f"Deleting ghost holding: {h.symbol} for member {h.member_id} (No transactions found)")
                db.delete(h)
        
        db.commit()
        print("Resync complete.")
    finally:
        db.close()

if __name__ == "__main__":
    resync_all()
