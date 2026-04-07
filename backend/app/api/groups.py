from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import select
from typing import List

from app.database import get_db
from app.models.member import MemberGroup, Member
from app.schemas.member import MemberGroupCreate, MemberGroupUpdate, MemberGroupResponse

router = APIRouter(prefix="/api/groups", tags=["groups"])

@router.get("/", response_model=List[MemberGroupResponse])
def get_groups(db: Session = Depends(get_db)):
    groups = db.query(MemberGroup).all()
    # Map relationship to member_ids for schema
    results = []
    for g in groups:
        results.append({
            "id": g.id,
            "name": g.name,
            "member_ids": [m.id for m in g.members]
        })
    return results

@router.post("/", response_model=MemberGroupResponse)
def create_group(group_data: MemberGroupCreate, db: Session = Depends(get_db)):
    members = db.query(Member).filter(Member.id.in_(group_data.member_ids)).all()
    if not members:
        raise HTTPException(status_code=400, detail="No valid members found")
    
    new_group = MemberGroup(name=group_data.name)
    new_group.members = members
    db.add(new_group)
    db.commit()
    db.refresh(new_group)
    
    return {
        "id": new_group.id,
        "name": new_group.name,
        "member_ids": [m.id for m in new_group.members]
    }

@router.put("/{group_id}", response_model=MemberGroupResponse)
def update_group(group_id: int, group_data: MemberGroupUpdate, db: Session = Depends(get_db)):
    group = db.query(MemberGroup).filter(MemberGroup.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
        
    if group_data.name is not None:
        group.name = group_data.name
        
    if group_data.member_ids is not None:
        members = db.query(Member).filter(Member.id.in_(group_data.member_ids)).all()
        group.members = members
        
    db.commit()
    db.refresh(group)
    
    return {
        "id": group.id,
        "name": group.name,
        "member_ids": [m.id for m in group.members]
    }

@router.delete("/{group_id}")
def delete_group(group_id: int, db: Session = Depends(get_db)):
    group = db.query(MemberGroup).filter(MemberGroup.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
        
    db.delete(group)
    db.commit()
    return {"status": "success"}
