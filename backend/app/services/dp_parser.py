import csv
import io
import re
import pdfplumber
import pandas as pd
from datetime import datetime
from sqlalchemy.orm import Session
from app.models.transaction import Transaction

def parse_nmbsbfe_pdf(file_bytes: bytes):
    """Parses NMBSBFE PDF statement using pdfplumber."""
    import tempfile
    records = []
    
    # regex to match: YYYY-MM-DD Unit Purchased (< YYYY-MM-DD >,<211 @ 9.33+25 >)
    # Group 1: Date
    # Group 2: Units
    # Group 3: NAV
    # Group 4: Charge
    pattern = re.compile(r"Unit Purchased\s*\(<\s*([\d-]+)\s*>,\s*<([\d.]+)\s*@\s*([\d.]+)\+([\d.]+)\s*>\)")
    
    with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as temp_pdf:
        temp_pdf.write(file_bytes)
        temp_path = temp_pdf.name

    try:
        with pdfplumber.open(temp_path) as pdf:
            for page in pdf.pages:
                text = page.extract_text()
                if not text:
                    continue
                for line in text.split('\n'):
                    if "Unit Purchased" in line:
                        match = pattern.search(line)
                        if match:
                            date_str = match.group(1).strip()
                            units = float(match.group(2).strip())
                            nav = float(match.group(3).strip())
                            charge = float(match.group(4).strip())
                            
                            try:
                                parsed_date = datetime.strptime(date_str, "%Y-%m-%d").date()
                            except ValueError:
                                parsed_date = None
                                
                            records.append({
                                "date": parsed_date,
                                "units": units,
                                "nav": nav,
                                "charge": charge
                            })
    finally:
        import os
        os.remove(temp_path)
        
    return records

def parse_niblsf_csv(csv_content: str):
    """Parses NIBLSF structured CSV."""
    records = []
    reader = csv.reader(io.StringIO(csv_content))
    for row in reader:
        if not row or len(row) < 7:
            continue
        col1 = row[0].strip().upper()
        if col1 in ("P", "A", "PURCHASE", "AUTO-ALLOTMENT"):
            # Format varies, but user said: 
            # Col 2 (Date), Col 3 (NAV), Col 4 (Exact Units), Col 6 (Charge)
            try:
                # Assuming 0-indexed columns: Col 2 is row[1], Col 3 is row[2], etc.
                # Actually user said "Col 1 is P...". So 1-indexed.
                # Col 2 -> row[1], Col 3 -> row[2], Col 4 -> row[3], Col 6 -> row[5]
                date_str = row[1].strip()
                # Try parsing date MM/DD/YYYY or YYYY-MM-DD
                parsed_date = None
                for fmt in ("%Y-%m-%d", "%m/%d/%Y", "%d/%m/%Y"):
                    try:
                        parsed_date = datetime.strptime(date_str, fmt).date()
                        break
                    except ValueError:
                        pass
                
                nav = float(row[2].strip().replace(",", ""))
                units = float(row[3].strip().replace(",", ""))
                charge = float(row[5].strip().replace(",", ""))
                
                records.append({
                    "date": parsed_date,
                    "units": units,
                    "nav": nav,
                    "charge": charge
                })
            except (ValueError, IndexError):
                continue
                
    return records

def parse_NI31_excel(file_bytes: bytes):
    """Parses NI31 structured Excel."""
    df = pd.read_excel(io.BytesIO(file_bytes))
    records = []
    
    # Iterate through rows
    # Columns: Date, Type, Units, NAV, DP Fee
    for _, row in df.iterrows():
        txn_type = str(row.get('Type', '')).strip().upper()
        # We only care about purchase types for now
        if txn_type in ('SIP INSTALLMENT', 'IPO', 'FRACTIONAL ALLOTMENT'):
            try:
                date_val = row.get('Date')
                # Handle different date formats in pandas
                if isinstance(date_val, str):
                    parsed_date = datetime.strptime(date_val, "%d-%m-%Y").date()
                else:
                    parsed_date = date_val.date()
                
                records.append({
                    "date": parsed_date,
                    "units": float(row.get('Units', 0)),
                    "nav": float(row.get('NAV', 0)),
                    "charge": float(row.get('DP Fee', 0))
                })
            except (ValueError, AttributeError, TypeError):
                continue
    
    return records

def reconcile_dp_statement(db: Session, member_id: int, symbol: str, records: list):
    """
    Inserts newly parsed DP records for the member/symbol. 
    Prevents duplicates by checking existing transactions.
    """
    new_added = 0
    matched = 0

    for rec in records:
        dp_units = rec["units"]
        txn_date = rec["date"]
        # Treat DP statements as BUYs for now
        txn_type = 'BUY'

        # Duplicate check: member, symbol, date, and quantity
        existing = db.query(Transaction).filter(
            Transaction.member_id == member_id,
            Transaction.symbol == symbol,
            Transaction.txn_date == txn_date,
            Transaction.quantity == dp_units,
            Transaction.txn_type == txn_type
        ).first()

        if existing:
            matched += 1
            # Optional: update rate/cost if they were missing or zero
            if not existing.rate or existing.rate == 0:
                 existing.rate = rec["nav"]
                 existing.amount = dp_units * rec["nav"]
                 existing.dp_charge = rec["charge"]
                 existing.total_cost = (dp_units * rec["nav"]) + rec["charge"]
                 existing.source = 'SYSTEM' # Upgrade source to SYSTEM if we have better data
            continue

        new_txn = Transaction(
            member_id=member_id,
            symbol=symbol,
            txn_type=txn_type,
            quantity=dp_units,
            rate=rec["nav"],
            amount=dp_units * rec["nav"],
            dp_charge=rec["charge"],
            total_cost=(dp_units * rec["nav"]) + rec["charge"],
            txn_date=txn_date,
            actual_date=txn_date,
            actual_units=dp_units,
            nav=rec["nav"],
            charge=rec["charge"],
            is_reconciled=True,
            source='SYSTEM',
            remarks='CA-Rearrangement DP Statement'
        )
        db.add(new_txn)
        new_added += 1

    db.commit()

    return {
        "matched": matched,
        "new_added": new_added
    }
