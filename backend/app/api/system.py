import os
import json
import zipfile
import tempfile
from datetime import date, datetime

from fastapi import APIRouter, Depends, UploadFile, File, HTTPException, BackgroundTasks
from fastapi.responses import FileResponse
from starlette.background import BackgroundTask
from sqlalchemy.orm import Session
from sqlalchemy import select
from sqlalchemy.dialects.sqlite import insert as sqlite_insert

from app.database import get_db, SessionLocal
from app.models.company import Company
from app.models.price import (
    LivePrice, NavValue, PriceHistory, IndexHistory, 
    CommodityPrice, MacroData, EconomicIndicator
)
from app.models.fundamental import StockOverview, FundamentalReport, QuarterlyGrowth

router = APIRouter(prefix="/api/system", tags=["System"])

# We define the models to export and their unique constraints for upserting
# (Model, index_elements)
EXPORT_MODELS = [
    (Company, ["symbol"]),
    (MacroData, ["date"]),
    (EconomicIndicator, ["indicator_name", "date_label"]),
    (CommodityPrice, ["date"]),
    (IndexHistory, ["index_name", "date"]),
    (StockOverview, ["symbol"]),
    (FundamentalReport, ["symbol", "quarter"]),
    (QuarterlyGrowth, ["symbol", "particulars", "fiscal_year", "quarter"]),
    (PriceHistory, ["symbol", "date"]),
    (LivePrice, ["company_id"]),
    (NavValue, ["company_id"]),
]

def serialize_row(row):
    d = {}
    for col in row.__table__.columns:
        val = getattr(row, col.name)
        if isinstance(val, (date, datetime)):
            d[col.name] = val.isoformat()
        else:
            d[col.name] = val
    return d

@router.get("/export-market-data")
def export_market_data(db: Session = Depends(get_db)):
    """Exports all global market data as a ZIP of JSONL files."""
    
    temp_zip = tempfile.NamedTemporaryFile(delete=False, suffix=".zip")
    temp_zip_path = temp_zip.name
    temp_zip.close() 
    
    try:
        with zipfile.ZipFile(temp_zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
            for model, _ in EXPORT_MODELS:
                table_name = model.__tablename__
                
                with tempfile.NamedTemporaryFile(mode="w", delete=False, suffix=".jsonl", encoding="utf-8") as temp_jsonl:
                    temp_jsonl_path = temp_jsonl.name
                    
                    rows_query = db.execute(select(model)).scalars()
                    for row in rows_query:
                        temp_jsonl.write(json.dumps(serialize_row(row)) + "\n")
                        
                zf.write(temp_jsonl_path, f"{table_name}.jsonl")
                os.remove(temp_jsonl_path)
                
        return FileResponse(
            temp_zip_path,
            media_type="application/zip",
            filename="market_data_export.zip",
            background=BackgroundTask(os.remove, temp_zip_path)
        )
    except Exception as e:
        if os.path.exists(temp_zip_path):
            os.remove(temp_zip_path)
        raise HTTPException(status_code=500, detail=f"Export failed: {str(e)}")


def _insert_chunk(db, model, chunk, unique_cols):
    stmt = sqlite_insert(model).values(chunk)
    update_dict = {c.name: c for c in stmt.excluded if c.name not in unique_cols and c.name != 'id'}
    if update_dict:
        stmt = stmt.on_conflict_do_update(index_elements=unique_cols, set_=update_dict)
    else:
        stmt = stmt.on_conflict_do_nothing(index_elements=unique_cols)
    db.execute(stmt)
    db.commit()

def process_market_data_import(zip_file_path: str):
    """Background task to parse JSONL files from a ZIP and upsert them in batches."""
    db = SessionLocal()
    try:
        with zipfile.ZipFile(zip_file_path, "r") as zf:
            company_map = {}
            companies = db.query(Company.symbol, Company.id).all()
            company_map = {c.symbol: c.id for c in companies}
            
            for model, unique_cols in EXPORT_MODELS:
                table_name = model.__tablename__
                filename = f"{table_name}.jsonl"
                
                if filename not in zf.namelist():
                    continue
                    
                date_cols = [c.name for c in model.__table__.columns if str(c.type) in ('DATE', 'DATETIME')]
                num_cols = len(model.__table__.columns)
                # Keep variables well below SQLite's 999 limit
                chunk_size = max(1, 500 // num_cols)
                
                with zf.open(filename, "r") as f:
                    chunk = []
                    for line in f:
                        if not line.strip(): continue
                        row = json.loads(line.decode("utf-8"))
                        row.pop("id", None)
                        
                        if table_name in ("live_prices", "nav_values"):
                            symbol = row.get("symbol")
                            if symbol in company_map:
                                row["company_id"] = company_map[symbol]
                            else:
                                comp_id = db.query(Company.id).filter(Company.symbol == symbol).scalar()
                                if comp_id:
                                    company_map[symbol] = comp_id
                                    row["company_id"] = comp_id
                                else:
                                    continue
                                    
                        for col in date_cols:
                            if row.get(col):
                                try:
                                    if len(row[col]) > 10:
                                        row[col] = datetime.fromisoformat(row[col])
                                    else:
                                        row[col] = date.fromisoformat(row[col])
                                except ValueError:
                                    row[col] = None
                                    
                        chunk.append(row)
                        
                        if len(chunk) >= chunk_size:
                            _insert_chunk(db, model, chunk, unique_cols)
                            chunk = []
                            
                    if chunk:
                        _insert_chunk(db, model, chunk, unique_cols)
                        
                if table_name == "companies":
                    companies = db.query(Company.symbol, Company.id).all()
                    company_map = {c.symbol: c.id for c in companies}
                    
    except Exception as e:
        print(f"Background import failed: {e}")
    finally:
        db.close()
        if os.path.exists(zip_file_path):
            os.remove(zip_file_path)

@router.post("/import-market-data")
async def import_market_data(background_tasks: BackgroundTasks, file: UploadFile = File(...)):
    """Imports market data from a ZIP of JSONL files in the background."""
    if not file.filename.endswith(".zip"):
        raise HTTPException(400, "File must be a .zip containing JSONL files")
        
    temp_zip = tempfile.NamedTemporaryFile(delete=False, suffix=".zip")
    temp_zip_path = temp_zip.name
    
    content = await file.read()
    temp_zip.write(content)
    temp_zip.close()
    
    background_tasks.add_task(process_market_data_import, temp_zip_path)
    
    return {"message": "Import started in background. Please wait a few moments for data to reflect.", "success": True}
