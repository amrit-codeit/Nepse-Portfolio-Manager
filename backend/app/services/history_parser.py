"""
MeroShare History CSV Parser.

Parses the transaction history CSV downloaded from MeroShare and converts
each row into a Transaction record.
"""

import pandas as pd
from io import StringIO
from datetime import datetime
from sqlalchemy.orm import Session
from app.models.transaction import Transaction, TransactionType, TransactionSource
from app.models.company import Company
from app.models.price import IssuePrice
from app.services.portfolio_engine import recalculate_holdings


# Mapping of MeroShare history descriptions to our transaction types
MEROSHARE_TYPE_MAP = {
    "INITIAL PUBLIC OFFERING": TransactionType.IPO.value,
    "IPO Share Allotment": TransactionType.IPO.value,
    "IPO": TransactionType.IPO.value,
    "FPO Share Allotment": TransactionType.FPO.value,
    "FPO": TransactionType.FPO.value,
    "RIGHT SHARE ALLOTMENT": TransactionType.RIGHT.value,
    "RIGHT SHARE": TransactionType.RIGHT.value,
    "CA-RIGHTS": TransactionType.RIGHT.value,
    "BONUS SHARE": TransactionType.BONUS.value,
    "CA-BONUS": TransactionType.BONUS.value,
    "BONUS": TransactionType.BONUS.value,
    "AUCTION": TransactionType.AUCTION.value,
    "SHARE BOUGHT": TransactionType.BUY.value,
    "BUY": TransactionType.BUY.value,
    "SHARE SOLD": TransactionType.SELL.value,
    "SELL": TransactionType.SELL.value,
    "ON-CR": TransactionType.BUY.value,
    "ON-DR": TransactionType.SELL.value,
    "ONLINE CREDIT": TransactionType.BUY.value,
    "ONLINE DEBIT": TransactionType.SELL.value,
    "TRANSFER IN": TransactionType.TRANSFER_IN.value,
    "RECEIVED": TransactionType.TRANSFER_IN.value,
    "TRANSFER OUT": TransactionType.TRANSFER_OUT.value,
    "SENT": TransactionType.TRANSFER_OUT.value,
    "MERGER": TransactionType.MERGE.value,
    "MERGE": TransactionType.MERGE.value,
    "DEMERGER": TransactionType.DEMERGE.value,
}


def detect_txn_type(description: str, credit_qty: float = 0, debit_qty: float = 0) -> str:
    """
    Detect transaction type from MeroShare description text or remark.
    Follows a strict priority order for robustness.
    """
    desc_upper = description.upper().strip()

    # Priority Order
    # 1. IPO
    # Keywords: "INITIAL PUBLIC OFFERING", exclusion: "FPO"
    if "INITIAL PUBLIC OFFERING" in desc_upper and "FPO" not in desc_upper:
        tag = TransactionType.IPO.value
        if debit_qty > 0 and credit_qty == 0:
            return TransactionType.SELL.value
        return tag

    # 2. FPO
    # Keywords: "INITIAL PUBLIC OFFERING" AND "FPO"
    if "INITIAL PUBLIC OFFERING" in desc_upper and "FPO" in desc_upper:
        tag = TransactionType.FPO.value
        if debit_qty > 0 and credit_qty == 0:
            return TransactionType.SELL.value
        return tag

    # 3. Bonus
    # Keywords: "CA-BONUS" OR "DREP"
    if "CA-BONUS" in desc_upper or "DREP" in desc_upper:
        tag = TransactionType.BONUS.value
        if debit_qty > 0 and credit_qty == 0:
            return TransactionType.SELL.value
        return tag

    # 4. Right
    # Keywords: "CA-RIGHTS"
    if "CA-RIGHTS" in desc_upper:
        tag = TransactionType.RIGHT.value
        if debit_qty > 0 and credit_qty == 0:
            return TransactionType.SELL.value
        return tag

    # 5. SIP / Open-Ended Mutual Funds
    # Buy: Starts with CA-Rearrangement AND ends with CREDIT.
    # Sell: Starts with CA-Rearrangement AND ends with DEBIT.
    if desc_upper.startswith("CA-REARRANGEMENT"):
        if desc_upper.endswith("CREDIT"):
            return TransactionType.BUY.value
        if desc_upper.endswith("DEBIT"):
            return TransactionType.SELL.value

    # 6. Secondary Market
    # Buy: Contains ON-CR (On-market Credit).
    if "ON-CR" in desc_upper:
        return TransactionType.BUY.value
    # Sell: Contains ON-DR (On-market Debit).
    if "ON-DR" in desc_upper:
        return TransactionType.SELL.value

    # 7. Merge
    # Keywords: Contains Merger, Swap, or Amalgamation.
    if any(k in desc_upper for k in ["MERGER", "SWAP", "AMALGAMATION"]):
        tag = TransactionType.MERGE.value
        if debit_qty > 0 and credit_qty == 0:
            return TransactionType.SELL.value
        return tag

    # Fallback to standard mapping for simpler keywords
    for key, txn_type in MEROSHARE_TYPE_MAP.items():
        if key in desc_upper:
            return txn_type

    # Force transaction type based on Credit/Debit quantity validation
    # Credit Quantity = Inflow (Buy)
    # Debit Quantity = Outflow (Sell)
    if debit_qty > 0 and credit_qty == 0:
        return TransactionType.SELL.value
    elif credit_qty > 0 and debit_qty == 0:
        return TransactionType.BUY.value

    return TransactionType.BUY.value  # Default fallback


def parse_meroshare_csv(
    db: Session,
    csv_content: str,
    member_id: int,
    skip_duplicates: bool = True,
) -> dict:
    """
    Parse MeroShare history CSV content and create transaction records.

    Returns a summary of what was processed.
    """
    df = pd.read_csv(StringIO(csv_content))

    # Normalize column names (MeroShare CSV can have varying column names)
    df.columns = [col.strip() for col in df.columns]

    # Common MeroShare CSV columns:
    # SN, History Description / Description, Script, Quantity / No. of Units,
    # Current Balance, Credit / Debit, Transaction Date

    # Try to identify columns
    symbol_col = _find_column(
        df, ["Script", "Symbol", "Scrip", "Company", "Script Name"])
    qty_col = _find_column(
        df, ["Quantity", "No. of Units", "Units", "Qty", "No. of Shares", "Total Units"])

    # Specific columns for some formats
    credit_qty_col = _find_column(df, ["Credit Quantity", "Credited Quantity"])
    debit_qty_col = _find_column(df, ["Debit Quantity", "Debited Quantity"])

    desc_col = _find_column(
        df, ["History Description", "Description", "Transaction Type", "Remarks", "Remark"])
    date_col = _find_column(
        df, ["Transaction Date", "Date", "Txn Date", "Entry Date"])
    balance_col = _find_column(
        df, ["Current Balance", "Balance", "Available Balance"])
    credit_debit_col = _find_column(
        df, ["Credit", "Debit", "Credit/Debit", "Type", "DC"])

    if not symbol_col or (not qty_col and not (credit_qty_col and debit_qty_col)):
        raise ValueError(
            f"Could not identify required columns in CSV. "
            f"Found columns: {list(df.columns)}"
        )

    created = 0
    skipped = 0
    errors = []
    symbols_affected = set()

    for idx, row in df.iterrows():
        try:
            # Determine quantity and type overrides from separate columns if they exist
            credit_val = 0
            debit_val = 0
            if credit_qty_col:
                cv = str(row[credit_qty_col]).replace(',', '').strip()
                if cv and cv != '-':
                    try:
                        credit_val = float(cv)
                    except:
                        pass

            if debit_qty_col:
                dv = str(row[debit_qty_col]).replace(',', '').strip()
                if dv and dv != '-':
                    try:
                        debit_val = float(dv)
                    except:
                        pass

            symbol = str(row[symbol_col]).strip().upper()
            description = str(row[desc_col]).strip(
            ) if desc_col and pd.notna(row[desc_col]) else ""

            # Primary quantity detection
            if qty_col and pd.notna(row[qty_col]) and str(row[qty_col]).strip() != '-':
                try:
                    quantity = abs(float(str(row[qty_col]).replace(',', '')))
                except:
                    quantity = 0
            else:
                quantity = credit_val if credit_val > 0 else debit_val

            # Robust type detection: check both symbol and description columns
            txn_type_from_desc = detect_txn_type(description, credit_val, debit_val)
            txn_type_from_sym = detect_txn_type(symbol, credit_val, debit_val)

            txn_type = txn_type_from_desc

            # If the 'symbol' column actually contains a transaction type keyword
            if txn_type_from_sym != TransactionType.BUY.value and txn_type_from_sym != TransactionType.SELL.value:
                # Basic check so we don't accidentally override with BUY/SELL based purely on credit/debit qty defaults inside the symbol check
                txn_type = txn_type_from_sym
                new_symbol = description.split()[0].upper()
                symbol = new_symbol

            if quantity <= 0:
                continue

            # Parse date
            txn_date = None
            if date_col and pd.notna(row[date_col]):
                try:
                    txn_date = pd.to_datetime(str(row[date_col])).date()
                except Exception:
                    txn_date = None

            # Skip duplicates
            if skip_duplicates:
                existing = (
                    db.query(Transaction)
                    .filter(
                        Transaction.member_id == member_id,
                        Transaction.symbol == symbol,
                        Transaction.txn_type == txn_type,
                        Transaction.quantity == quantity,
                        Transaction.txn_date == txn_date,
                    )
                    .first()
                )
                if existing:
                    skipped += 1
                    continue

            # Link to company
            company = db.query(Company).filter(
                Company.symbol == symbol).first()
            company_id = company.id if company else None

            # Apply Rate and DP Fee defaults
            rate = None
            dp_charge = 25.0

            if txn_type in (TransactionType.IPO.value, TransactionType.FPO.value, TransactionType.RIGHT.value):
                # Try to find price from the fetched issue_prices table
                issue_record = db.query(IssuePrice).filter(
                    IssuePrice.symbol == symbol,
                    IssuePrice.issue_type == txn_type
                ).first()

                if issue_record:
                    rate = issue_record.price
                else:
                    rate = 100.0  # Default fallback

                dp_charge = 5.0
            elif txn_type == TransactionType.BONUS.value:
                rate = 100.0
                dp_charge = 0.0
            elif txn_type in (TransactionType.BUY.value, TransactionType.SELL.value):
                # MeroShare doesn't provide rate/fees for buy/sell in history, usually
                dp_charge = 25.0

            amount = (quantity * rate) if rate else 0

            # Simple total_cost calculation for history import
            total_cost = amount + dp_charge if txn_type != TransactionType.SELL.value else dp_charge

            txn = Transaction(
                member_id=member_id,
                company_id=company_id,
                symbol=symbol,
                txn_type=txn_type,
                quantity=quantity,
                rate=rate,
                amount=amount,
                dp_charge=dp_charge,
                total_cost=total_cost,
                txn_date=txn_date,
                source=TransactionSource.MEROSHARE.value,
                remarks=description,
            )
            db.add(txn)
            created += 1
            symbols_affected.add(symbol)

        except Exception as e:
            errors.append(f"Row error: {e}")

    db.commit()

    # Recalculate holdings for affected symbols
    for symbol in symbols_affected:
        recalculate_holdings(db, member_id, symbol)

    return {
        "created": created,
        "skipped": skipped,
        "errors": errors,
        "symbols_affected": list(symbols_affected),
    }


def _find_column(df: pd.DataFrame, candidates: list[str]) -> str | None:
    """Find first matching column name from candidates with exact word boundaries."""
    # First try exact matches (case-insensitive)
    for candidate in candidates:
        for col in df.columns:
            if candidate.lower() == col.lower():
                return col

    # Then try word-boundary matches (e.g. 'Script' matches 'Script Name' but not 'Description')
    import re
    for candidate in candidates:
        pattern = re.compile(rf"\b{re.escape(candidate.lower())}\b")
        for col in df.columns:
            if pattern.search(col.lower()):
                return col

    return None
