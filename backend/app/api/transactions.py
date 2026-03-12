"""Transaction management API routes."""

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from sqlalchemy.orm import Session
from datetime import date
from app.database import get_db
from app.models.transaction import Transaction, TransactionType, TransactionSource
from app.models.company import Company
from app.schemas.transaction import TransactionCreate, TransactionUpdate, TransactionResponse, TransactionListResponse
from app.services.fee_calculator import calculate_buy_costs, calculate_sell_costs, get_fee_value
from app.services.portfolio_engine import recalculate_holdings

router = APIRouter(prefix="/api/transactions", tags=["Transactions"])


@router.get("", response_model=TransactionListResponse)
def list_transactions(
    member_id: int = Query(None),
    member_ids: str = Query(None),
    symbol: str = Query(None),
    txn_type: str = Query(None),
    limit: int = Query(100, le=10000),
    offset: int = Query(0),
    db: Session = Depends(get_db),
):
    """List transactions with optional filters."""
    query = db.query(Transaction)

    if member_id:
        query = query.filter(Transaction.member_id == member_id)
    if member_ids:
        try:
            ids_list = [int(id_str.strip()) for id_str in member_ids.split(
                ",") if id_str.strip().isdigit()]
            if ids_list:
                query = query.filter(Transaction.member_id.in_(ids_list))
        except ValueError:
            pass
    if symbol:
        query = query.filter(Transaction.symbol == symbol.upper())
    if txn_type:
        query = query.filter(Transaction.txn_type == txn_type)

    total = query.count()
    transactions = (
        query.order_by(Transaction.txn_date.desc(), Transaction.id.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )

    return TransactionListResponse(
        transactions=[TransactionResponse.model_validate(
            t) for t in transactions],
        total=total,
    )


@router.post("", response_model=TransactionResponse, status_code=201)
def create_transaction(data: TransactionCreate, db: Session = Depends(get_db)):
    """
    Add a manual transaction (BUY/SELL with price).
    Automatically computes fees for BUY and SELL transactions.
    """
    symbol = data.symbol.upper()

    # Link to company
    company = db.query(Company).filter(Company.symbol == symbol).first()
    company_id = company.id if company else None
    instrument = company.instrument if company else "equity"

    amount = (data.quantity * data.rate) if data.rate else None

    # Calculate fees
    fees = {
        "broker_commission": 0,
        "sebon_fee": 0,
        "dp_charge": 0,
        "name_transfer_fee": 0,
        "cgt": 0,
        "total_cost": amount or 0,
    }

    manual_dp = data.dp_charge
    txn_type_up = data.txn_type.upper()

    if txn_type_up == TransactionType.BUY.value and amount:
        fees = calculate_buy_costs(
            db, amount, instrument or "equity", txn_date=data.txn_date, 
            manual_dp=manual_dp, manual_broker=data.broker_commission, manual_sebon=data.sebon_fee)

    elif txn_type_up == TransactionType.SELL.value and amount:
        from app.models.holding import Holding
        holding = db.query(Holding).filter(
            Holding.member_id == data.member_id, Holding.symbol == symbol).first()
        wacc = holding.wacc if holding else 0
        fees = calculate_sell_costs(
            db, amount, wacc, data.quantity, 0, instrument or "equity",
            txn_date=data.txn_date, manual_dp=manual_dp, manual_cgt=data.cgt)
    else:
        # Defaults for IPO, RIGHT, BONUS, FPO, etc.
        if manual_dp is not None:
            dp_charge = manual_dp
        else:
            if txn_type_up in ("IPO", "FPO", "RIGHT"):
                dp_charge = 5.0
            elif txn_type_up == "BONUS":
                dp_charge = 0.0
            else:
                dp_charge = 25.0

        fees["dp_charge"] = dp_charge
        fees["total_cost"] = (amount or 0) + dp_charge

    txn = Transaction(
        member_id=data.member_id,
        company_id=company_id,
        symbol=symbol,
        txn_type=txn_type_up,
        quantity=data.quantity,
        rate=data.rate,
        amount=amount,
        broker_commission=fees["broker_commission"],
        sebon_fee=fees["sebon_fee"],
        dp_charge=fees["dp_charge"],
        name_transfer_fee=fees["name_transfer_fee"],
        cgt=fees["cgt"],
        total_cost=fees["total_cost"],
        txn_date=data.txn_date,
        remarks=data.remarks,
        source=TransactionSource.MANUAL.value,
    )
    db.add(txn)
    db.commit()
    db.refresh(txn)

    # Recalculate holdings
    recalculate_holdings(db, data.member_id, symbol)

    return TransactionResponse.model_validate(txn)


@router.post("/upload")
async def upload_history(
    member_id: int = Query(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    """Upload a MeroShare history CSV file for a member."""
    if not file.filename.endswith(".csv"):
        raise HTTPException(status_code=400, detail="File must be a CSV")

    content = await file.read()
    csv_content = content.decode("utf-8")

    from app.services.history_parser import parse_meroshare_csv
    result = parse_meroshare_csv(db, csv_content, member_id)

    return {
        "message": f"Processed {result['created']} transactions, skipped {result['skipped']} duplicates",
        **result,
    }


@router.post("/upload-dp")
async def upload_dp_statement(
    member_id: int = Query(...),
    symbol: str = Query(...),
    dp_format: str = Query(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    """Upload a DP statement (PDF or CSV) to reconcile SIP transactions."""
    content = await file.read()
    
    from app.services.dp_parser import parse_nmbsbfe_pdf, parse_niblsf_csv, parse_NI31_excel, reconcile_dp_statement
    
    if dp_format == "NMBSBFE":
        if not file.filename.lower().endswith(".pdf"):
             raise HTTPException(status_code=400, detail="NMBSBFE format requires a PDF file.")
        records = parse_nmbsbfe_pdf(content)
    elif dp_format == "NIBLSF":
        if not file.filename.lower().endswith(".csv"):
             raise HTTPException(status_code=400, detail="NIBLSF format requires a CSV file.")
        csv_content = content.decode("utf-8", errors="ignore")
        records = parse_niblsf_csv(csv_content)
    elif dp_format == "NEW_NI31":
        if not file.filename.lower().endswith(".xlsx"):
             raise HTTPException(status_code=400, detail="NI31 format requires an XLSX file.")
        records = parse_NI31_excel(content)
    else:
        raise HTTPException(status_code=400, detail=f"Unsupported format: {dp_format}")
        
    result = reconcile_dp_statement(db, member_id, symbol, records)
    
    recalculate_holdings(db, member_id, symbol)
    
    return {
        "message": f"Matched {result['matched']} records, Added {result['new_added']} new.",
        **result
    }

@router.put("/{txn_id}", response_model=TransactionResponse)
def update_transaction(txn_id: int, data: TransactionUpdate, db: Session = Depends(get_db)):
    """Update a transaction and recalculate everything."""
    try:
        txn = db.query(Transaction).filter(Transaction.id == txn_id).first()
        if not txn:
            raise HTTPException(
                status_code=404, detail="Transaction not found")

        # Remember old state to recalculate holdings correctly
        old_member_id = txn.member_id
        old_symbol = txn.symbol

        # Update base fields if present in input
        if data.member_id is not None:
            txn.member_id = data.member_id
        if data.symbol is not None:
            txn.symbol = data.symbol
        if data.txn_type is not None:
            txn.txn_type = data.txn_type
        if data.quantity is not None:
            txn.quantity = data.quantity
        if data.rate is not None:
            txn.rate = data.rate
        if data.txn_date is not None:
            txn.txn_date = data.txn_date
        if data.remarks is not None:
            txn.remarks = data.remarks

        # Recalculate amount
        if txn.rate is not None:
            txn.amount = txn.quantity * txn.rate
        else:
            txn.amount = 0

        # Fetch instrument
        company = db.query(Company).filter(
            Company.symbol == txn.symbol).first()
        instrument = company.instrument if company else "equity"

        # Recalculate fees based on NEW date and data
        manual_dp = data.dp_charge
        if txn.txn_type == TransactionType.BUY.value:
            fees = calculate_buy_costs(
                db, txn.amount, instrument, txn_date=txn.txn_date, 
                manual_dp=manual_dp, manual_broker=data.broker_commission, manual_sebon=data.sebon_fee)
            txn.broker_commission = fees["broker_commission"]
            txn.sebon_fee = fees["sebon_fee"]
            txn.dp_charge = fees["dp_charge"]
            txn.cgt = 0
            txn.total_cost = fees["total_cost"]
        elif txn.txn_type == TransactionType.SELL.value:
            from app.models.holding import Holding
            holding = db.query(Holding).filter(
                Holding.member_id == txn.member_id,
                Holding.symbol == txn.symbol
            ).first()
            wacc = holding.wacc if holding else 0
            fees = calculate_sell_costs(db, txn.amount, wacc, txn.quantity, 0, instrument,
                                        txn_date=txn.txn_date, manual_dp=manual_dp, manual_cgt=data.cgt,
                                        manual_broker=data.broker_commission, manual_sebon=data.sebon_fee)
            txn.broker_commission = fees["broker_commission"]
            txn.sebon_fee = fees["sebon_fee"]
            txn.dp_charge = fees["dp_charge"]
            txn.cgt = fees.get("cgt", 0)
            txn.total_cost = fees["total_cost"]
        else:
            # Corporate actions or others (IPO, RIGHT, BONUS, FPO)
            if manual_dp is not None:
                dp_charge = manual_dp
            else:
                if txn.txn_type in ("IPO", "FPO", "RIGHT"):
                    dp_charge = 5.0
                elif txn.txn_type == "BONUS":
                    dp_charge = 0.0
                else:
                    dp_charge = 25.0

            txn.broker_commission = 0
            txn.sebon_fee = 0
            txn.dp_charge = dp_charge
            txn.cgt = 0
            # For these, total_cost = amount + dp_charge
            txn.total_cost = (txn.amount or 0) + dp_charge

        db.commit()
        db.refresh(txn)

        # Recalculate holdings for BOTH old and new (if they changed)
        recalculate_holdings(db, old_member_id, old_symbol)
        if txn.member_id != old_member_id or txn.symbol != old_symbol:
            recalculate_holdings(db, txn.member_id, txn.symbol)

        return TransactionResponse.model_validate(txn)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{txn_id}", status_code=204)
def delete_transaction(txn_id: int, db: Session = Depends(get_db)):
    """Delete a transaction and recalculate holdings."""
    txn = db.query(Transaction).filter(Transaction.id == txn_id).first()
    if not txn:
        raise HTTPException(status_code=404, detail="Transaction not found")

    member_id = txn.member_id
    symbol = txn.symbol

    db.delete(txn)
    db.commit()

    # Recalculate holdings
    recalculate_holdings(db, member_id, symbol)
