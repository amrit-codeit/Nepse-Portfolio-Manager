
import pandas as pd
import io
from sqlalchemy.orm import Session
from app.models.transaction import Transaction, TransactionSource
from app.models.member import Member
from app.models.company import Company
from app.services.portfolio_engine import recalculate_holdings
from datetime import datetime

def parse_native_csv(db: Session, csv_content: str):
    df = pd.read_csv(io.StringIO(csv_content))
    
    # Mapping CSV columns to DB fields
    col_map = {
        'Date': 'txn_date',
        'Symbol': 'symbol',
        'Type': 'txn_type',
        'Quantity': 'quantity',
        'Rate': 'rate',
        'Broker Commission': 'broker_commission',
        'SEBON Fee': 'sebon_fee',
        'DP Charge': 'dp_charge',
        'Name Transfer Fee': 'name_transfer_fee',
        'CGT': 'cgt',
        'Total Cost/Received': 'total_cost',
        'Actual Date': 'actual_date',
        'Actual Units': 'actual_units',
        'NAV': 'nav',
        'SIP Charge': 'charge',
        'Is Reconciled': 'is_reconciled',
        'Source': 'source',
        'Remarks': 'remarks'
    }

    members = db.query(Member).all()
    member_map = {m.name: m.id for m in members}
    
    created = 0
    skipped = 0
    symbols_affected = set()

    for _, row in df.iterrows():
        try:
            member_name = str(row.get('Member', '')).strip()
            member_id = member_map.get(member_name)
            if not member_id:
                continue

            symbol = str(row.get('Symbol', '')).strip().upper()
            txn_type = str(row.get('Type', '')).strip().upper()
            quantity = float(row.get('Quantity', 0))
            
            # Parse Date
            dt_str = str(row.get('Date', '')).strip()
            txn_date = None
            if dt_str and dt_str != 'nan':
                try:
                    txn_date = pd.to_datetime(dt_str).date()
                except:
                    pass

            # Check for duplicates
            existing = db.query(Transaction).filter(
                Transaction.member_id == member_id,
                Transaction.symbol == symbol,
                Transaction.txn_type == txn_type,
                Transaction.quantity == quantity,
                Transaction.txn_date == txn_date
            ).first()

            if existing:
                skipped += 1
                continue

            # Create transaction
            txn_data = {}
            for csv_col, db_field in col_map.items():
                val = row.get(csv_col)
                if pd.isna(val) or val == 'nan':
                    val = None
                
                # Handle dates
                if db_field in ('txn_date', 'actual_date') and val:
                    try:
                        val = pd.to_datetime(str(val)).date()
                    except:
                        val = None
                
                # Handle floats
                if db_field in ('quantity', 'rate', 'broker_commission', 'sebon_fee', 'dp_charge', 
                               'name_transfer_fee', 'cgt', 'total_cost', 'actual_units', 'nav', 'charge'):
                    try:
                        val = float(val) if val is not None else 0
                    except:
                        val = 0
                
                # Handle boolean
                if db_field == 'is_reconciled':
                    val = bool(val)

                txn_data[db_field] = val

            # Link company
            company = db.query(Company).filter(Company.symbol == symbol).first()
            company_id = company.id if company else None

            txn = Transaction(
                member_id=member_id,
                company_id=company_id,
                **txn_data
            )
            db.add(txn)
            created += 1
            symbols_affected.add((member_id, symbol))

        except Exception as e:
            print(f"Error parsing row: {e}")
            continue

    db.commit()
    
    # Recalculate holdings
    for mid, sym in symbols_affected:
        recalculate_holdings(db, mid, sym)
    
    db.commit()
    
    return {
        "created": created,
        "skipped": skipped,
        "total": len(df)
    }
