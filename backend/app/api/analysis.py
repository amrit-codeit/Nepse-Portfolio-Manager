"""API routes for the Executive Summary analysis endpoint."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.services.analysis.executive_summary import calculate_executive_summary, get_ai_verdict
from app.services.analysis.ai_service import AIService

router = APIRouter(prefix="/api/analysis", tags=["Analysis"])

@router.get("/models")
async def list_available_models():
    """Returns the list of installed local AI models from Ollama."""
    models = await AIService.get_available_models()
    return {"status": "success", "models": models}


@router.get("/summary/{symbol}")
def get_executive_summary(symbol: str, db: Session = Depends(get_db)):
    """
    Returns the full executive summary for a stock: Graham valuation,
    health score, dividend yield, 8-quarter trajectories, and action badge.
    """
    try:
        result = calculate_executive_summary(db, symbol.upper())
        if not result:
             raise HTTPException(status_code=404, detail="No data found for the provided symbol.")
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/summary/{symbol}/ai-verdict")
async def get_executive_ai_verdict(symbol: str, model: str = None, db: Session = Depends(get_db)):
    """
    Runs a local gemma inference on the executive summary data.
    Separated from the GET endpoint so the main summary loads instantly.
    """
    try:
        summary_data = calculate_executive_summary(db, symbol.upper())
        if not summary_data:
             return {
                "status": "error",
                "verdict": "UNKNOWN",
                "logic": "No underlying fundamental data available for analysis.",
                "foundation": "Missing Data",
                "timing": "N/A"
            }

        verdict = await get_ai_verdict(summary_data, model_name=model)
        
        # Ensure a status key exists for frontend parsing
        if "status" not in verdict:
            verdict["status"] = "success"
            
        return verdict
        
    except Exception as e:
        # Fallback dictionary ensures the UI doesn't break if the AI fails
        return {
            "status": "error",
            "verdict": "HOLD", 
            "logic": f"Local AI inference failed: {str(e)}",
            "foundation": "Calculation Error",
            "timing": "N/A"
        }