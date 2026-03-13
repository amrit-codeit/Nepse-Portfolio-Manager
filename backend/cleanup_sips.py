
from app.database import SessionLocal
from app.models.transaction import Transaction, TransactionSource
from app.models.company import Company
from app.services.portfolio_engine import recalculate_holdings

def cleanup_corrupted_sips():
    db = SessionLocal()
    try:
        # 1. Identify all SIP/Open-End symbols
        sip_symbols = [c.symbol for c in db.query(Company).filter(Company.instrument == 'Open-End Mutual Fund').all()]
        
        # 2. Find transactions from MEROSHARE source for these symbols or with REARRANGEMENT remarks
        # These are "low quality" entries that mess up the SIP tab
        corrupted_txns = db.query(Transaction).filter(
            Transaction.source == TransactionSource.MEROSHARE.value
        ).filter(
            (Transaction.symbol.in_(sip_symbols)) | 
            (Transaction.remarks.like('%REARRANGEMENT%'))
        ).all()
        
        print(f"Found {len(corrupted_txns)} corrupted SIP transactions created by MeroShare sync.")
        
        affected_pairs = set()
        for t in corrupted_txns:
            print(f"  Deleting corrupted {t.txn_type} for {t.symbol} (ID: {t.id}, Qty: {t.quantity})")
            affected_pairs.add((t.member_id, t.symbol))
            db.delete(t)
            
        db.commit()
        
        # 3. Recalculate affected holdings
        for mid, sym in affected_pairs:
            print(f"Recalculating {sym} for member {mid}...")
            recalculate_holdings(db, mid, sym)
            
        db.commit()
        print("Cleanup complete. SIP tab should now only show data from official DP Statements.")
        
    except Exception as e:
        print(f"Error during cleanup: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    cleanup_corrupted_sips()
