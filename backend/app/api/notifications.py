"""Notifications API — in-app alerts for price targets, scraper failures, etc."""

import traceback
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.notification import Notification

router = APIRouter(prefix="/api/v1/notifications", tags=["Notifications"])


@router.get("/unread")
def get_unread_notifications(db: Session = Depends(get_db)):
    """Get count and list of unread notifications."""
    try:
        unread = db.query(Notification).filter(
            Notification.is_read == False
        ).order_by(Notification.created_at.desc()).limit(50).all()
        
        return {
            "status": "success",
            "count": len(unread),
            "data": [{
                "id": n.id,
                "type": n.type,
                "title": n.title,
                "message": n.message,
                "symbol": n.symbol,
                "created_at": n.created_at.isoformat() if n.created_at else None,
            } for n in unread]
        }
    except Exception as e:
        traceback.print_exc()
        return {"status": "failed", "count": 0, "data": [], "error": repr(e)}


@router.post("/read/{notification_id}")
def mark_notification_read(notification_id: int, db: Session = Depends(get_db)):
    """Mark a single notification as read."""
    n = db.query(Notification).filter(Notification.id == notification_id).first()
    if n:
        n.is_read = True
        db.commit()
    return {"status": "success"}


@router.post("/read-all")
def mark_all_read(db: Session = Depends(get_db)):
    """Mark all notifications as read."""
    db.query(Notification).filter(Notification.is_read == False).update({"is_read": True})
    db.commit()
    return {"status": "success"}
