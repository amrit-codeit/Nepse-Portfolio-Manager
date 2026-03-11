"""Member management API routes."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.member import Member, MeroshareCredential
from app.utils.encryption import encrypt_value, decrypt_value
from app.config import settings
from app.schemas.member import (
    MemberCreate, MemberUpdate, MemberResponse,
    CredentialCreate, CredentialUpdate, CredentialResponse,
    BulkImportRequest, MemberCredentialBulk, VerifyPasswordRequest
)
from app.scrapers.meroshare import sync_meroshare_for_member
from fastapi import BackgroundTasks

router = APIRouter(prefix="/api/members", tags=["Members"])


@router.get("", response_model=list[MemberResponse])
def list_members(db: Session = Depends(get_db)):
    """List all family members."""
    members = db.query(Member).order_by(Member.name).all()
    result = []
    for m in members:
        resp = MemberResponse.model_validate(m)
        resp.has_credentials = m.credentials is not None
        result.append(resp)
    return result


@router.post("", response_model=MemberResponse, status_code=201)
def create_member(data: MemberCreate, db: Session = Depends(get_db)):
    """Add a new family member."""
    existing = db.query(Member).filter(Member.name == data.name).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"Member '{data.name}' already exists")

    member = Member(name=data.name, display_name=data.display_name)
    db.add(member)
    db.commit()
    db.refresh(member)
    return MemberResponse.model_validate(member)


@router.get("/{member_id}", response_model=MemberResponse)
def get_member(member_id: int, db: Session = Depends(get_db)):
    """Get a specific member."""
    member = db.query(Member).filter(Member.id == member_id).first()
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")
    resp = MemberResponse.model_validate(member)
    resp.has_credentials = member.credentials is not None
    return resp


@router.put("/{member_id}", response_model=MemberResponse)
def update_member(member_id: int, data: MemberUpdate, db: Session = Depends(get_db)):
    """Update a member."""
    member = db.query(Member).filter(Member.id == member_id).first()
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")

    if data.name is not None:
        member.name = data.name
    if data.display_name is not None:
        member.display_name = data.display_name
    if data.is_active is not None:
        member.is_active = data.is_active

    db.commit()
    db.refresh(member)
    resp = MemberResponse.model_validate(member)
    resp.has_credentials = member.credentials is not None
    return resp


@router.delete("/{member_id}", status_code=204)
def delete_member(member_id: int, db: Session = Depends(get_db)):
    """Delete a member and all associated data."""
    member = db.query(Member).filter(Member.id == member_id).first()
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")
    db.delete(member)
    db.commit()


@router.post("/verify-password")
def verify_password(data: VerifyPasswordRequest):
    """Verify master password before allowing credential edits."""
    if data.password == settings.MASTER_PASSWORD:
        return {"status": "success", "message": "Password verified"}
    raise HTTPException(status_code=401, detail="Invalid master password")


@router.get("/export-credentials", response_model=list[MemberCredentialBulk])
def export_credentials(db: Session = Depends(get_db)):
    """Export all members and their credentials for backup."""
    members = db.query(Member).all()
    result = []
    for member in members:
        if member.credentials:
            c = member.credentials
            result.append(MemberCredentialBulk(
                owner=member.name,
                dp=c.dp,
                username=c.username,
                password=decrypt_value(c.password_encrypted),
                crn=c.crn,
                txn_pin=c.txn_pin,
                apply_unit=c.apply_unit
            ))
    return result


@router.post("/import-credentials")
def import_credentials(data: BulkImportRequest, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    """Import members and credentials bulk (from credentials.csv)."""
    count = 0
    for item in data.credentials:
        # Create or update member
        member = db.query(Member).filter(Member.name == item.owner).first()
        if not member:
            member = Member(name=item.owner)
            db.add(member)
            db.flush()
        
        # Create or update credentials
        existing_cred = db.query(MeroshareCredential).filter(MeroshareCredential.member_id == member.id).first()
        if existing_cred:
            existing_cred.dp = item.dp
            existing_cred.username = item.username
            existing_cred.password_encrypted = encrypt_value(item.password)
            existing_cred.crn = item.crn
            existing_cred.txn_pin = item.txn_pin
            existing_cred.apply_unit = item.apply_unit
        else:
            new_cred = MeroshareCredential(
                member_id=member.id,
                dp=item.dp,
                username=item.username,
                password_encrypted=encrypt_value(item.password),
                crn=item.crn,
                txn_pin=item.txn_pin,
                apply_unit=item.apply_unit
            )
            db.add(new_cred)
        
        count += 1
        # Trigger sync in background for each member imported/updated
        background_tasks.add_task(sync_meroshare_for_member, db, member.id)

    db.commit()
    return {"status": "success", "message": f"Successfully imported/updated {count} member(s)"}


# --- Credential Endpoints ---

@router.post("/{member_id}/credentials", response_model=CredentialResponse, status_code=201)
def set_credentials(member_id: int, data: CredentialCreate, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    """Set MeroShare credentials for a member."""
    member = db.query(Member).filter(Member.id == member_id).first()
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")

    # Remove existing credentials if any
    existing = db.query(MeroshareCredential).filter(MeroshareCredential.member_id == member_id).first()
    if existing:
        db.delete(existing)
        db.flush()

    cred = MeroshareCredential(
        member_id=member_id,
        dp=data.dp,
        username=data.username,
        password_encrypted=encrypt_value(data.password),
        crn=data.crn,
        txn_pin=data.txn_pin,
        apply_unit=data.apply_unit,
    )
    db.add(cred)
    db.commit()
    db.refresh(cred)

    # After saving credentials, automatically trigger historical download
    background_tasks.add_task(sync_meroshare_for_member, db, member_id)

    return CredentialResponse.model_validate(cred)


@router.get("/{member_id}/credentials", response_model=CredentialResponse)
def get_credentials(member_id: int, db: Session = Depends(get_db)):
    """Get credentials for a member."""
    cred = db.query(MeroshareCredential).filter(MeroshareCredential.member_id == member_id).first()
    if not cred:
        raise HTTPException(status_code=404, detail="No credentials found for this member")
    
    # Decrypt password for editing (only because user requested)
    resp = CredentialResponse.model_validate(cred)
    # We add password manually to the response or just allow it in Edit view
    return resp


@router.get("/{member_id}/credentials/decrypted")
def get_decrypted_credentials(member_id: int, db: Session = Depends(get_db)):
    """Get full credentials including decrypted password for editing."""
    cred = db.query(MeroshareCredential).filter(MeroshareCredential.member_id == member_id).first()
    if not cred:
        raise HTTPException(status_code=404, detail="No credentials found")
    
    return {
        "dp": cred.dp,
        "username": cred.username,
        "password": decrypt_value(cred.password_encrypted),
        "crn": cred.crn,
        "txn_pin": cred.txn_pin,
        "apply_unit": cred.apply_unit
    }


@router.delete("/{member_id}/credentials", status_code=204)
def delete_credentials(member_id: int, db: Session = Depends(get_db)):
    """Delete credentials for a member."""
    cred = db.query(MeroshareCredential).filter(MeroshareCredential.member_id == member_id).first()
    if not cred:
        raise HTTPException(status_code=404, detail="No credentials found")
    db.delete(cred)
    db.commit()
