
from app.database import SessionLocal
from app.models.transaction import Transaction
from app.services.portfolio_engine import recalculate_holdings

def fix_bonus_shares():
    db = SessionLocal()
    try:
        # 1. Find all BONUS transactions that either have rate=100 or dp_charge=25
        bonus_txns = db.query(Transaction).filter(
            Transaction.txn_type == 'BONUS'
        ).filter(
            (Transaction.rate == 100) | (Transaction.dp_charge == 25)
        ).all()
        
        print(f"Found {len(bonus_txns)} BONUS transactions to fix.")
        affected_pairs = set()

        for t in bonus_txns:
            print(f"  Fixing {t.symbol} for member {t.member_id} (ID: {t.id})")
            t.rate = 0
            t.amount = 0
            t.dp_charge = 0
            t.total_cost = 0
            affected_pairs.add((t.member_id, t.symbol))
        
        db.commit()

        # 2. Recalculate affected holdings
        for mid, sym in affected_pairs:
            print(f"Recalculating {sym} for member {mid}...")
            recalculate_holdings(db, mid, sym)
        
        db.commit()
        print("Fix complete.")
    except Exception as e:
        print(f"Error during fix: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    fix_bonus_shares()
