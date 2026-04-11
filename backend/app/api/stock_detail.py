"""API route for the Stock Detail (Scrip 360°) page."""

from typing import Optional
from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.services.stock_detail import get_stock_detail
from app.models.transaction import Transaction
from app.models.holding import Holding

router = APIRouter(prefix="/api/stock-detail", tags=["Stock Detail"])


@router.get("/symbols/list")
def list_traded_symbols(
    member_id: Optional[int] = Query(None),
    member_ids: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    """
    List all symbols that a member has ever traded or currently holds.
    Used to populate the symbol selector on the Stock Detail page.
    Must be defined BEFORE /{symbol} to avoid FastAPI matching 'symbols' as a symbol.
    """
    ids_list = None
    if member_ids:
        ids_list = [int(x.strip()) for x in member_ids.split(',') if x.strip()]

    # Get symbols from transactions
    txn_query = db.query(Transaction.symbol).distinct()
    if ids_list:
        txn_query = txn_query.filter(Transaction.member_id.in_(ids_list))
    elif member_id:
        txn_query = txn_query.filter(Transaction.member_id == member_id)

    txn_symbols = {row.symbol for row in txn_query.all()}

    # Get symbols from holdings (for SIPs that might not have transactions)
    hold_query = db.query(Holding.symbol).distinct()
    if ids_list:
        hold_query = hold_query.filter(Holding.member_id.in_(ids_list))
    elif member_id:
        hold_query = hold_query.filter(Holding.member_id == member_id)

    hold_symbols = {row.symbol for row in hold_query.all()}

    all_symbols = sorted(txn_symbols | hold_symbols)

    # Mark which ones are currently held
    active_query = db.query(Holding.symbol).filter(Holding.current_qty > 0)
    if ids_list:
        active_query = active_query.filter(Holding.member_id.in_(ids_list))
    elif member_id:
        active_query = active_query.filter(Holding.member_id == member_id)

    active_symbols = {row.symbol for row in active_query.all()}

    return [
        {"symbol": s, "is_active": s in active_symbols}
        for s in all_symbols
    ]


@router.get("/{symbol}")
def stock_detail(
    symbol: str,
    member_id: Optional[int] = Query(None, description="Filter by single member"),
    member_ids: Optional[str] = Query(None, description="Comma-separated member IDs"),
    db: Session = Depends(get_db),
):
    """
    Get comprehensive 360° detail for a single stock/SIP.
    Includes: transaction history, quantity breakdown, dividends,
    yield comparison, XIRR, ROI, Graham's Number, WACC details.
    """
    ids_list = None
    if member_ids:
        ids_list = [int(x.strip()) for x in member_ids.split(',') if x.strip()]

    return get_stock_detail(db, symbol, member_id, member_ids=ids_list)
