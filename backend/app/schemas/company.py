"""Pydantic schemas for Company."""

from pydantic import BaseModel
from datetime import datetime
from typing import Optional


class CompanyResponse(BaseModel):
    id: int
    symbol: str
    name: str
    sector: Optional[str] = None
    instrument: Optional[str] = None
    status: Optional[str] = None

    model_config = {"from_attributes": True}


class CompanyListResponse(BaseModel):
    companies: list[CompanyResponse]
    total: int
