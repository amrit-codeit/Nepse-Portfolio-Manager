import csv
import io
import re
import math
import pdfplumber
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

def reconcile_dp_statement(db: Session, member_id: int, symbol: str, records: list):
    """
    Inserts newly parsed DP records for the member/symbol. 
    Does not attempt to reconcile with MeroShare history.
    """
    new_added = 0
    
    for rec in records:
        dp_units = rec["units"]
        # Treat DP statements as BUYs unless negative, though parses mostly extract positive units for purchases.
        txn_type = 'BUY'
        
        new_txn = Transaction(
            member_id=member_id,
            symbol=symbol,
            txn_type=txn_type,
            quantity=dp_units,
            rate=rec["nav"],
            amount=dp_units * rec["nav"],
            dp_charge=rec["charge"],
            total_cost=(dp_units * rec["nav"]) + rec["charge"],
            txn_date=rec["date"],
            actual_date=rec["date"],
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
        "matched": 0,
        "new_added": new_added
    }
