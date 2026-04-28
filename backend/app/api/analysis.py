"""API routes for the Executive Summary analysis endpoint."""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from app.database import get_db
from app.services.analysis.executive_summary import (
    calculate_executive_summary,
    get_value_ai_verdict,
    get_trading_ai_verdict,
    get_value_ai_verdict_cloud,
    get_trading_ai_verdict_cloud,
    get_frontier_prompt,
)
from app.services.analysis.ai_service import AIService

router = APIRouter(prefix="/api/analysis", tags=["Analysis"])


def _attach_active_trade_setup(summary_data: dict, symbol: str, member_id: int | None, db: Session) -> None:
    """Attach the best available active trade setup to the summary payload."""
    from app.models.trading import TradeSetup, TradeStatus

    setup = None

    if member_id is not None:
        setup = (
            db.query(TradeSetup)
            .filter(
                TradeSetup.symbol == symbol.upper(),
                TradeSetup.status == TradeStatus.ACTIVE,
                TradeSetup.member_id == member_id,
            )
            .first()
        )

    if setup is None:
        setup = (
            db.query(TradeSetup)
            .filter(
                TradeSetup.symbol == symbol.upper(),
                TradeSetup.status == TradeStatus.ACTIVE,
            )
            .first()
        )

    if setup:
        summary_data["active_trade_setup"] = {
            "entry_price": setup.entry_price,
            "entry_zone_low": setup.entry_zone_low,
            "entry_zone_high": setup.entry_zone_high,
            "target_price": setup.target_price or setup.target_1,
            "target_1": setup.target_1 or setup.target_price,
            "target_2": setup.target_2,
            "stop_loss": setup.stop_loss or setup.current_stop_loss,
            "initial_stop_loss": setup.initial_stop_loss or setup.stop_loss,
            "current_stop_loss": setup.current_stop_loss or setup.stop_loss,
            "trailing_stop": setup.trailing_stop,
            "allocated_qty": setup.allocated_qty,
            "strategy_note": setup.strategy_note,
            "setup_quality": setup.setup_quality,
            "strategy_type": setup.strategy_type,
            "thesis": setup.thesis or setup.strategy_note,
            "capital_allocated": setup.capital_allocated,
            "risk_amount": setup.risk_amount,
            "member_id": setup.member_id,
        }

@router.get("/models")
async def list_available_models():
    """Returns the list of installed local AI models from Ollama."""
    models = await AIService.get_available_models()
    return {"status": "success", "models": models}


@router.get("/summary/{symbol}")
def get_executive_summary(symbol: str, member_id: int = Query(None), db: Session = Depends(get_db)):
    """
    Returns the full executive summary for a stock: Graham valuation,
    health score, dividend yield, 8-quarter trajectories, and action badge.
    """
    try:
        result = calculate_executive_summary(db, symbol.upper(), member_id=member_id)
        if not result:
             raise HTTPException(status_code=404, detail="No data found for the provided symbol.")
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/summary/{symbol}/ai-verdict")
async def get_executive_ai_verdict(symbol: str, model: str = None, member_id: int = Query(None), db: Session = Depends(get_db)):
    """
    Value Investing AI analysis (Local Ollama).
    Combines fundamental metrics with technical timing for long-term value assessment.
    """
    try:
        summary_data = calculate_executive_summary(db, symbol.upper(), member_id=member_id)
        if not summary_data:
             return {
                "status": "error",
                "verdict": "No underlying data available for analysis.",
                "analysis": "Missing fundamental or price data for this symbol.",
            }

        verdict = await get_value_ai_verdict(summary_data, model_name=model)
        
        if "status" not in verdict:
            verdict["status"] = "success"
            
        return verdict
        
    except Exception as e:
        return {
            "status": "error",
            "verdict": "Analysis failed",
            "analysis": f"Local AI inference failed: {str(e)}",
        }


@router.post("/summary/{symbol}/ai-trading-verdict")
async def get_executive_ai_trading_verdict(symbol: str, model: str = None, member_id: int = Query(None), db: Session = Depends(get_db)):
    """
    Pure Trading AI analysis (Local Ollama).
    Focuses on price action, momentum, entry/exit targets, and stop loss strategy.
    """
    try:
        summary_data = calculate_executive_summary(db, symbol.upper(), member_id=member_id)
        if not summary_data:
             return {
                "status": "error",
                "verdict": "No underlying data available for analysis.",
                "analysis": "Missing price history data for this symbol.",
            }

        _attach_active_trade_setup(summary_data, symbol, member_id, db)

        verdict = await get_trading_ai_verdict(summary_data, model_name=model)
        
        if "status" not in verdict:
            verdict["status"] = "success"
            
        return verdict
        
    except Exception as e:
        return {
            "status": "error",
            "verdict": "Analysis failed",
            "analysis": f"Local AI inference failed: {str(e)}",
        }


# ---------------------------------------------------------------------------
# Cloud API endpoints (Groq)
# ---------------------------------------------------------------------------

@router.post("/summary/{symbol}/ai-verdict-cloud")
async def get_executive_ai_verdict_cloud(symbol: str, provider: str = Query("groq"), member_id: int = Query(None), db: Session = Depends(get_db)):
    """Value Investing AI analysis via Cloud API (Groq or Nvidia)."""
    try:
        summary_data = calculate_executive_summary(db, symbol.upper(), member_id=member_id)
        if not summary_data:
            return {
                "status": "error",
                "verdict": "No underlying data available.",
                "analysis": "Missing fundamental or price data for this symbol.",
            }

        verdict = await get_value_ai_verdict_cloud(summary_data, provider=provider)
        if "status" not in verdict:
            verdict["status"] = "success"
        return verdict

    except Exception as e:
        return {
            "status": "error",
            "verdict": "Cloud analysis failed",
            "analysis": f"Cloud API error: {str(e)}",
        }


@router.post("/summary/{symbol}/ai-trading-verdict-cloud")
async def get_executive_ai_trading_verdict_cloud(symbol: str, provider: str = Query("groq"), member_id: int = Query(None), db: Session = Depends(get_db)):
    """Pure Trading AI analysis via Cloud API (Groq or Nvidia)."""
    try:
        summary_data = calculate_executive_summary(db, symbol.upper(), member_id=member_id)
        if not summary_data:
            return {
                "status": "error",
                "verdict": "No underlying data available.",
                "analysis": "Missing price history data for this symbol.",
            }

        _attach_active_trade_setup(summary_data, symbol, member_id, db)

        verdict = await get_trading_ai_verdict_cloud(summary_data, provider=provider)
        if "status" not in verdict:
            verdict["status"] = "success"
        return verdict

    except Exception as e:
        return {
            "status": "error",
            "verdict": "Cloud analysis failed",
            "analysis": f"Cloud API error: {str(e)}",
        }


# ---------------------------------------------------------------------------
# Frontier Prompt Generator (copy/paste)
# ---------------------------------------------------------------------------

@router.get("/summary/{symbol}/frontier-prompt")
def get_frontier_prompt_endpoint(symbol: str, mode: str = Query("value"), member_id: int = Query(None), db: Session = Depends(get_db)):
    """
    Returns a ready-to-paste prompt for frontier model web UIs.
    Mode: 'value' or 'trading'.
    """
    try:
        summary_data = calculate_executive_summary(db, symbol.upper(), member_id=member_id)
        if not summary_data:
            raise HTTPException(status_code=404, detail="No data found for the provided symbol.")

        if mode == "trading":
            _attach_active_trade_setup(summary_data, symbol, member_id, db)

        prompt = get_frontier_prompt(mode, summary_data)
        return {"status": "success", "prompt": prompt, "mode": mode, "symbol": symbol.upper()}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
