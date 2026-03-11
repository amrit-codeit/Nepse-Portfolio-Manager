"""Pydantic schemas for Member and MeroShare credentials."""

from pydantic import BaseModel
from datetime import datetime
from typing import Optional


# --- Member Schemas ---

class MemberCreate(BaseModel):
    name: str
    display_name: Optional[str] = None


class MemberUpdate(BaseModel):
    name: Optional[str] = None
    display_name: Optional[str] = None
    is_active: Optional[bool] = None


class MemberResponse(BaseModel):
    id: int
    name: str
    display_name: Optional[str] = None
    is_active: bool
    created_at: datetime
    has_credentials: bool = False

    model_config = {"from_attributes": True}


# --- MeroShare Credential Schemas ---

class CredentialCreate(BaseModel):
    dp: str
    username: str
    password: str       # Plain text — will be encrypted before storage
    crn: Optional[str] = None
    txn_pin: Optional[str] = None
    apply_unit: int = 10


class CredentialUpdate(BaseModel):
    dp: Optional[str] = None
    username: Optional[str] = None
    password: Optional[str] = None
    crn: Optional[str] = None
    txn_pin: Optional[str] = None
    apply_unit: Optional[int] = None


class CredentialResponse(BaseModel):
    id: int
    member_id: int
    dp: str
    username: str
    crn: Optional[str] = None
    txn_pin: Optional[str] = None
    apply_unit: int

    model_config = {"from_attributes": True}


# --- Bulk Export/Import Schemas ---

class MemberCredentialBulk(BaseModel):
    owner: str          # Matches credentials.csv 'Owner'
    dp: str
    username: str
    password: str
    crn: Optional[str] = None
    txn_pin: Optional[str] = None
    apply_unit: int = 10


class BulkImportRequest(BaseModel):
    credentials: list[MemberCredentialBulk]


class VerifyPasswordRequest(BaseModel) :
    password: str

