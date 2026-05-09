from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import date
from pydantic import BaseModel, Field

from app.database import get_db
from app.services.calculator_service import (
    calculate_buy_simulation,
    calculate_hypothetical_sell,
    calculate_sell_simulation,
    calculate_trade_plan,
)

router = APIRouter(prefix="/api/v1/calculator", tags=["Calculator"])

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


class HypotheticalSellRequest(BaseModel):
    symbol: str
    quantity: float = Field(..., gt=0)
    rate: float = Field(..., gt=0)
    cost_basis_per_share: float = Field(..., gt=0)
    instrument: str = "equity"
    txn_date: date | None = None


class TradePlanRequest(BaseModel):
    symbol: str
    capital_base: float = Field(..., gt=0)
    sleeve_pct: float = Field(20.0, gt=0, le=100)
    risk_pct: float = Field(..., gt=0)
    entry_rate: float = Field(..., gt=0)
    stop_loss: float = Field(..., gt=0)
    target_price: float | None = Field(None, gt=0)
    instrument: str = "equity"
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


@router.post("/sell-hypothetical")
def simulate_hypothetical_sell(req: HypotheticalSellRequest, db: Session = Depends(get_db)):
    try:
        return calculate_hypothetical_sell(
            db=db,
            symbol=req.symbol.upper(),
            sell_qty=req.quantity,
            sell_rate=req.rate,
            cost_basis_per_share=req.cost_basis_per_share,
            instrument=req.instrument,
            txn_date=req.txn_date,
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/trade-plan")
def simulate_trade_plan(req: TradePlanRequest, db: Session = Depends(get_db)):
    try:
        return calculate_trade_plan(
            db=db,
            symbol=req.symbol.upper(),
            capital_base=req.capital_base,
            sleeve_pct=req.sleeve_pct,
            risk_pct=req.risk_pct,
            entry_rate=req.entry_rate,
            stop_loss=req.stop_loss,
            target_price=req.target_price,
            instrument=req.instrument,
            txn_date=req.txn_date,
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
