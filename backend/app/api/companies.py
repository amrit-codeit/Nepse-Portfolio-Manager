"""Company management API routes."""

from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.company import Company
from app.schemas.company import CompanyResponse, CompanyListResponse

router = APIRouter(prefix="/api/companies", tags=["Companies"])


@router.get("", response_model=CompanyListResponse)
def list_companies(
    search: str = Query(None, description="Search by symbol or name"),
    sector: str = Query(None, description="Filter by sector"),
    instrument: str = Query(None, description="Filter by instrument type"),
    limit: int = Query(500, le=1000),
    offset: int = Query(0),
    db: Session = Depends(get_db),
):
    """List companies with optional search and filters."""
    query = db.query(Company)

    if search:
        search_term = f"%{search}%"
        query = query.filter(
            (Company.symbol.ilike(search_term)) | (Company.name.ilike(search_term))
        )
    if sector:
        query = query.filter(Company.sector == sector)
    if instrument:
        query = query.filter(Company.instrument == instrument)

    total = query.count()
    companies = query.order_by(Company.symbol).offset(offset).limit(limit).all()

    return CompanyListResponse(
        companies=[CompanyResponse.model_validate(c) for c in companies],
        total=total,
    )


@router.get("/sectors", response_model=list[str])
def list_sectors(db: Session = Depends(get_db)):
    """Get unique sectors."""
    sectors = db.query(Company.sector).distinct().filter(Company.sector.isnot(None)).all()
    return sorted([s[0] for s in sectors])


@router.get("/{symbol}", response_model=CompanyResponse)
def get_company(symbol: str, db: Session = Depends(get_db)):
    """Get company by symbol."""
    company = db.query(Company).filter(Company.symbol == symbol.upper()).first()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    return CompanyResponse.model_validate(company)
