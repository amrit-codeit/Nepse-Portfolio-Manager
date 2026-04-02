"""Service for computing historical portfolio values from transactions and price history."""

import logging
from datetime import date, timedelta
from typing import List, Dict, Any, Optional
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.models.transaction import Transaction, TransactionType
from app.models.price import PriceHistory, IndexHistory

logger = logging.getLogger(__name__)

class PortfolioHistoryService:
    def __init__(self, db: Session):
        self.db = db

    def get_computed_history(
        self, 
        member_id: Optional[int] = None, 
        member_ids: Optional[List[int]] = None,
        days: int = 365
    ) -> List[Dict[str, Any]]:
        """
        Computes daily portfolio value, investment cost, and NEPSE index benchmarking.
        Returns a list of daily data points.
        """
        end_date = date.today()
        start_date = end_date - timedelta(days=days)

        # 1. Fetch all transactions up to end_date
        query = self.db.query(Transaction)
        if member_ids:
            query = query.filter(Transaction.member_id.in_(member_ids))
        elif member_id:
            query = query.filter(Transaction.member_id == member_id)
        
        all_transactions = query.order_by(Transaction.txn_date.asc()).all()
        if not all_transactions:
            return []

        # 2. Group transactions by date
        txns_by_date = {}
        for t in all_transactions:
            d = t.txn_date
            if d not in txns_by_date:
                txns_by_date[d] = []
            txns_by_date[d].append(t)

        # 3. Get all price history and index history for the range
        symbols = list(set(t.symbol for t in all_transactions))
        prices = self.db.query(PriceHistory).filter(PriceHistory.date >= start_date).all()
        # Organize prices: prices_map[date][symbol] = close
        prices_map = {}
        for p in prices:
            if p.date not in prices_map:
                prices_map[p.date] = {}
            prices_map[p.date][p.symbol] = p.close

        indices = self.db.query(IndexHistory).filter(
            IndexHistory.index_name == "NEPSE Index",
            IndexHistory.date >= start_date
        ).all()
        index_map = {idx.date: idx.close for idx in indices}

        # 4. Iterate through every day from first transaction to end_date
        first_txn_date = all_transactions[0].txn_date
        current_date = first_txn_date
        
        holdings = {} # symbol -> quantity
        investment_cost = 0.0
        
        history = []
        
        # Track last known prices for symbols (for holidays/missing data)
        last_known_prices = {}
        last_known_index = None

        BUY_TYPES = {
            TransactionType.BUY.value, TransactionType.IPO.value, 
            TransactionType.FPO.value, TransactionType.RIGHT.value, 
            TransactionType.AUCTION.value, TransactionType.TRANSFER_IN.value
        }
        SELL_TYPES = {TransactionType.SELL.value, TransactionType.TRANSFER_OUT.value}

        while current_date <= end_date:
            # Process transactions for this day
            day_txns = txns_by_date.get(current_date, [])
            for t in day_txns:
                qty = t.quantity or 0
                cost = t.total_cost or 0
                
                if t.txn_type in BUY_TYPES:
                    holdings[t.symbol] = holdings.get(t.symbol, 0) + qty
                    investment_cost += cost
                elif t.txn_type in SELL_TYPES:
                    holdings[t.symbol] = holdings.get(t.symbol, 0) - qty
                    # Simple realization for investment costtracking
                    # (Note: In a true cost basis model you'd deduct proportional WACC,
                    # but for 'total cash in' net-investment is also a valid metric)
                    investment_cost -= cost # Using sell proceeds as 'cash out'
                elif t.txn_type == TransactionType.BONUS.value:
                    holdings[t.symbol] = holdings.get(t.symbol, 0) + qty
                # Dividends don't change quantity or cost basis for "portfolio value" usually
                # but they affect realized profit which we can add later if wanted

            # Only record if within the requested 'history' range
            if current_date >= start_date:
                # Update last known prices from today's actual data
                todays_prices = prices_map.get(current_date, {})
                for sym, price in todays_prices.items():
                    last_known_prices[sym] = price
                
                if current_date in index_map:
                    last_known_index = index_map[current_date]

                # Compute portfolio value using today's prices (or last known)
                portfolio_value = 0.0
                for sym, qty in holdings.items():
                    if qty > 0:
                        price = last_known_prices.get(sym, 0) # Fallback to 0 if never seen
                        portfolio_value += (qty * price)

                history.append({
                    "date": current_date.isoformat(),
                    "portfolio_value": round(portfolio_value, 2),
                    "investment_cost": round(investment_cost, 2),
                    "nepse_index": last_known_index,
                    "unrealized_pnl": round(portfolio_value - investment_cost, 2)
                })

            current_date += timedelta(days=1)

        return history
