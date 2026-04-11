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
        days: int = 365,
        is_sip: Optional[bool] = None
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

        if is_sip is not None:
            from app.models.company import Company
            sip_companies = self.db.query(Company.symbol).filter(Company.instrument == 'Open-End Mutual Fund').all()
            sip_symbols = {c.symbol for c in sip_companies}
            
            filtered_txns = []
            for t in all_transactions:
                symbol_is_sip = t.symbol in sip_symbols or len(t.symbol) > 5
                if is_sip is True and not symbol_is_sip:
                    continue
                if is_sip is False and symbol_is_sip:
                    continue
                filtered_txns.append(t)
            all_transactions = filtered_txns

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

        # 4. Build the set of relevant dates (trading days + transaction days)
        # PERF FIX: Skip weekends/holidays — only iterate dates with actual data
        first_txn_date = all_transactions[0].txn_date
        
        relevant_dates = set()
        # Add all dates with price data
        for d in prices_map.keys():
            if d >= start_date:
                relevant_dates.add(d)
        # Add all transaction dates (so holdings are updated even if no price data that day)
        for d in txns_by_date.keys():
            if d >= start_date:
                relevant_dates.add(d)
        
        # Also need to process pre-start_date transactions to build holdings state
        pre_start_txn_dates = sorted(d for d in txns_by_date.keys() if d < start_date)
        
        holdings = {} # symbol -> quantity
        investment_cost = 0.0
        
        # Track last known prices for symbols (for holidays/missing data)
        last_known_prices = {}
        last_known_index = None

        BUY_TYPES = {
            TransactionType.BUY.value, TransactionType.IPO.value, 
            TransactionType.FPO.value, TransactionType.RIGHT.value, 
            TransactionType.AUCTION.value, TransactionType.TRANSFER_IN.value
        }
        SELL_TYPES = {TransactionType.SELL.value, TransactionType.TRANSFER_OUT.value}

        # Process pre-range transactions to build initial holdings state
        for d in pre_start_txn_dates:
            for t in txns_by_date[d]:
                qty = t.quantity or 0
                cost = t.total_cost or 0
                if t.txn_type in BUY_TYPES:
                    holdings[t.symbol] = holdings.get(t.symbol, 0) + qty
                    investment_cost += cost
                elif t.txn_type in SELL_TYPES:
                    holdings[t.symbol] = holdings.get(t.symbol, 0) - qty
                    investment_cost -= cost
                elif t.txn_type == TransactionType.BONUS.value:
                    holdings[t.symbol] = holdings.get(t.symbol, 0) + qty

        history = []
        
        for current_date in sorted(relevant_dates):
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
                    investment_cost -= cost
                elif t.txn_type == TransactionType.BONUS.value:
                    holdings[t.symbol] = holdings.get(t.symbol, 0) + qty

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
                    price = last_known_prices.get(sym, 0)
                    portfolio_value += (qty * price)

            history.append({
                "date": current_date.isoformat(),
                "portfolio_value": round(portfolio_value, 3),
                "investment_cost": round(investment_cost, 3),
                "nepse_index": last_known_index,
                "unrealized_pnl": round(portfolio_value - investment_cost, 3)
            })

        return history
