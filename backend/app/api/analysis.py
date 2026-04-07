"""API routes for the Executive Summary analysis endpoint."""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.database import get_db
from app.services.analysis.executive_summary import calculate_executive_summary, get_ai_verdict

router = APIRouter(prefix="/api/analysis", tags=["Analysis"])


@router.get("/summary/{symbol}")
def get_executive_summary(symbol: str, db: Session = Depends(get_db)):
    """
    Returns the full executive summary for a stock: Graham valuation,
    health score, dividend yield, 8-quarter trajectories, and action badge.
    """
    try:
        result = calculate_executive_summary(db, symbol)
        return result
    except Exception as e:
        return {"error": str(e), "symbol": symbol.upper()}


@router.post("/summary/{symbol}/ai-verdict")
async def get_executive_ai_verdict(symbol: str, db: Session = Depends(get_db)):
    """
    Runs a local DeepSeek-R1 analysis on the executive summary data.
    Separated from the GET endpoint so the main summary loads instantly.
    """
    try:
        summary_data = calculate_executive_summary(db, symbol)
        verdict = await get_ai_verdict(summary_data)
        return verdict
    except Exception as e:
        return {
            "status": "error",
            "verdict": "HOLD",
            "logic": f"Analysis failed: {str(e)}",
            "foundation": "Error during calculation.",
            "timing": "N/A"
        }
