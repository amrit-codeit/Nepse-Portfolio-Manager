"""Service for checking price alerts and creating notifications."""

from datetime import datetime, timezone
from sqlalchemy.orm import Session
from app.models.trading import TradeSetup, TradeStatus
from app.models.price import LivePrice
from app.models.notification import Notification


def check_price_alerts(db: Session):
    """
    Check all active TradeSetups against current LivePrices.
    Generate notifications if target or stop loss is hit.
    """
    active_setups = db.query(TradeSetup).filter(
        TradeSetup.status == TradeStatus.ACTIVE
    ).all()

    if not active_setups:
        return

    # Fetch latest prices for symbols in active setups
    symbols = list(set(setup.symbol for setup in active_setups))
    prices = db.query(LivePrice).filter(LivePrice.symbol.in_(symbols)).all()
    price_map = {p.symbol: p.ltp for p in prices if p.ltp is not None}

    now = datetime.now(timezone.utc)
    new_alerts = 0

    for setup in active_setups:
        ltp = price_map.get(setup.symbol)
        if not ltp:
            continue

        alert_type = None
        alert_title = None
        alert_msg = None

        # Check Stop Loss
        if setup.current_stop_loss and ltp <= setup.current_stop_loss:
            alert_type = "price_alert"
            alert_title = f"Stop Loss Hit: {setup.symbol}"
            alert_msg = f"LTP (Rs. {ltp}) dropped below stop loss (Rs. {setup.current_stop_loss})."
            
        # Check Target
        elif setup.target_price and ltp >= setup.target_price:
            alert_type = "price_alert"
            alert_title = f"Target Price Hit: {setup.symbol}"
            alert_msg = f"LTP (Rs. {ltp}) reached target price (Rs. {setup.target_price})."

        # Check Trailing Stop (Dynamic adjustment)
        # Assuming trailing_stop stores the trailing % or distance.
        # If it's implemented differently, we adjust this logic.
        
        if alert_type:
            # Prevent spam: check if we already notified for this condition today
            existing = db.query(Notification).filter(
                Notification.member_id == setup.member_id,
                Notification.symbol == setup.symbol,
                Notification.title == alert_title,
                Notification.is_read == False
            ).first()

            if not existing:
                notif = Notification(
                    member_id=setup.member_id,
                    type=alert_type,
                    title=alert_title,
                    message=alert_msg,
                    symbol=setup.symbol,
                    created_at=now
                )
                db.add(notif)
                new_alerts += 1

    if new_alerts > 0:
        db.commit()
