from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import date
from pydantic import BaseModel, Field

from app.database import get_db
from app.services.calculator_service import calculate_buy_simulation, calculate_sell_simulation

router = APIRouter(prefix="/api/calculator", tags=["Calculator"])

class BuyRequest(BaseModel):
    quantity: float = Field(..., gt=0)
    rate: float = Field(..., gt=0)
    instrument: str = "equity"
    txn_date: date | None = None

class SellRequest(BaseModel):
    member_id: int
    symbol: str
    quantity: float = Field(..., gt=0)
    rate: float = Field(..., gt=0)
    txn_date: date | None = None

@router.post("/buy")
def simulate_buy(req: BuyRequest, db: Session = Depends(get_db)):
    try:
        amount = req.quantity * req.rate
        res = calculate_buy_simulation(db, amount, req.instrument, req.txn_date)
        # Add rate/qty to result
        res["buy_qty"] = req.quantity
        res["buy_rate"] = req.rate
        return res
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/sell")
def simulate_sell(req: SellRequest, db: Session = Depends(get_db)):
    try:
        res = calculate_sell_simulation(
            db=db,
            member_id=req.member_id,
            symbol=req.symbol.upper(),
            sell_qty=req.quantity,
            sell_rate=req.rate,
            txn_date=req.txn_date
        )
        return res
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
