"""
Tests for portfolio_engine.py — WACC recalculation, XIRR, and portfolio summary.
"""
import pytest
from datetime import date, timedelta
from app.services.portfolio_engine import (
    recalculate_holdings,
    calculate_xirr,
    get_portfolio_summary,
    get_xirr_for_holding,
    batch_xirr_for_holdings,
)
from app.services.fee_calculator import seed_fee_config, clear_fee_cache
from app.models.transaction import Transaction, TransactionType
from app.models.holding import Holding
from app.models.member import Member
from app.models.company import Company
from app.models.price import LivePrice


@pytest.fixture(autouse=True)
def setup_fees(db_session):
    seed_fee_config(db_session)
    clear_fee_cache()


# ============================================================
# WACC Recalculation tests
# ============================================================

class TestRecalculateHoldings:
    def test_empty_portfolio(self, db_session):
        member = Member(id=1, name="Test Member")
        db_session.add(member)
        db_session.commit()

        summary = get_portfolio_summary(db_session, member_id=1)
        assert summary.holdings_count == 0
        assert summary.total_investment == 0.0

    def test_single_buy(self, db_session, seed_companies):
        member = Member(id=1, name="Test")
        db_session.add(member)
        db_session.commit()

        txn = Transaction(
            member_id=1, symbol="NABIL",
            txn_type=TransactionType.BUY.value,
            quantity=100, rate=500.0, amount=50000.0,
            total_cost=50100.0,
            txn_date=date.today(),
        )
        db_session.add(txn)
        db_session.commit()

        recalculate_holdings(db_session, 1, "NABIL")

        holding = db_session.query(Holding).filter_by(member_id=1, symbol="NABIL").first()
        assert holding is not None
        assert holding.current_qty == 100
        assert holding.total_investment == 50100.0
        assert holding.wacc == 501.0
        assert holding.tax_wacc == 501.0

    def test_buy_then_partial_sell(self, db_session, seed_companies):
        member = Member(id=1, name="Test")
        db_session.add(member)
        db_session.commit()

        t1 = Transaction(
            member_id=1, symbol="NABIL", txn_type=TransactionType.BUY.value,
            quantity=100, rate=500.0, amount=50000.0, total_cost=50100.0,
            txn_date=date.today(),
        )
        t2 = Transaction(
            member_id=1, symbol="NABIL", txn_type=TransactionType.SELL.value,
            quantity=50, rate=600.0, amount=30000.0, total_cost=29800.0,
            txn_date=date.today(),
        )
        db_session.add_all([t1, t2])
        db_session.commit()

        recalculate_holdings(db_session, 1, "NABIL")

        holding = db_session.query(Holding).filter_by(member_id=1, symbol="NABIL").first()
        assert holding is not None
        assert holding.current_qty == 50
        assert holding.wacc == 501.0

    def test_buy_then_full_sell_deletes_holding(self, db_session, seed_companies):
        member = Member(id=1, name="Test")
        db_session.add(member)
        db_session.commit()

        t1 = Transaction(
            member_id=1, symbol="NABIL", txn_type=TransactionType.BUY.value,
            quantity=100, total_cost=50000.0, txn_date=date.today(),
        )
        t2 = Transaction(
            member_id=1, symbol="NABIL", txn_type=TransactionType.SELL.value,
            quantity=100, total_cost=60000.0, txn_date=date.today(),
        )
        db_session.add_all([t1, t2])
        db_session.commit()

        recalculate_holdings(db_session, 1, "NABIL")

        holding = db_session.query(Holding).filter_by(member_id=1, symbol="NABIL").first()
        assert holding is None

    def test_bonus_share_credit(self, db_session, seed_companies):
        member = Member(id=1, name="Test")
        db_session.add(member)
        db_session.commit()

        t1 = Transaction(
            member_id=1, symbol="NABIL", txn_type=TransactionType.BUY.value,
            quantity=100, total_cost=50000.0, txn_date=date.today(),
        )
        t2 = Transaction(
            member_id=1, symbol="NABIL", txn_type=TransactionType.BONUS.value,
            quantity=50, total_cost=0.0, txn_date=date.today(),
        )
        db_session.add_all([t1, t2])
        db_session.commit()

        recalculate_holdings(db_session, 1, "NABIL")

        holding = db_session.query(Holding).filter_by(member_id=1, symbol="NABIL").first()
        assert holding.current_qty == 150
        assert holding.total_investment == 50000.0
        assert holding.wacc == round(50000.0 / 150, 3)
        # Tax wacc adds face value (Rs 100) for bonus shares
        assert holding.tax_wacc == round((50000.0 + 50 * 100) / 150, 3)

    def test_wacc_drift_multiple_buys(self, db_session, seed_companies):
        member = Member(id=1, name="Test")
        db_session.add(member)
        db_session.commit()

        t1 = Transaction(
            member_id=1, symbol="NABIL", txn_type=TransactionType.BUY.value,
            quantity=100, total_cost=50000.0, txn_date=date.today(),
        )
        t2 = Transaction(
            member_id=1, symbol="NABIL", txn_type=TransactionType.BUY.value,
            quantity=100, total_cost=40000.0, txn_date=date.today(),
        )
        db_session.add_all([t1, t2])
        db_session.commit()

        recalculate_holdings(db_session, 1, "NABIL")

        holding = db_session.query(Holding).filter_by(member_id=1, symbol="NABIL").first()
        assert holding.current_qty == 200
        assert holding.wacc == 450.0  # (50000 + 40000) / 200

    def test_rights_issue(self, db_session, seed_companies):
        member = Member(id=1, name="Test")
        db_session.add(member)
        db_session.commit()

        t1 = Transaction(
            member_id=1, symbol="NABIL", txn_type=TransactionType.BUY.value,
            quantity=100, total_cost=50000.0, txn_date=date.today(),
        )
        t2 = Transaction(
            member_id=1, symbol="NABIL", txn_type=TransactionType.RIGHT.value,
            quantity=20, total_cost=2000.0, txn_date=date.today(),
        )
        db_session.add_all([t1, t2])
        db_session.commit()

        recalculate_holdings(db_session, 1, "NABIL")

        holding = db_session.query(Holding).filter_by(member_id=1, symbol="NABIL").first()
        assert holding.current_qty == 120
        assert holding.total_investment == 52000.0
        expected_wacc = round(52000.0 / 120, 3)
        assert holding.wacc == expected_wacc

    def test_ipo_allocation(self, db_session, seed_companies):
        member = Member(id=1, name="Test")
        db_session.add(member)
        db_session.commit()

        txn = Transaction(
            member_id=1, symbol="NABIL", txn_type=TransactionType.IPO.value,
            quantity=10, rate=100.0, amount=1000.0, total_cost=1030.0,
            txn_date=date.today(),
        )
        db_session.add(txn)
        db_session.commit()

        recalculate_holdings(db_session, 1, "NABIL")

        holding = db_session.query(Holding).filter_by(member_id=1, symbol="NABIL").first()
        assert holding.current_qty == 10
        assert holding.total_investment == 1030.0

    def test_transfer_in(self, db_session, seed_companies):
        member = Member(id=1, name="Test")
        db_session.add(member)
        db_session.commit()

        txn = Transaction(
            member_id=1, symbol="NABIL", txn_type=TransactionType.TRANSFER_IN.value,
            quantity=50, total_cost=25000.0, txn_date=date.today(),
        )
        db_session.add(txn)
        db_session.commit()

        recalculate_holdings(db_session, 1, "NABIL")

        holding = db_session.query(Holding).filter_by(member_id=1, symbol="NABIL").first()
        assert holding.current_qty == 50
        assert holding.total_investment == 25000.0

    def test_transfer_out(self, db_session, seed_companies):
        member = Member(id=1, name="Test")
        db_session.add(member)
        db_session.commit()

        t1 = Transaction(
            member_id=1, symbol="NABIL", txn_type=TransactionType.BUY.value,
            quantity=100, total_cost=50000.0, txn_date=date.today(),
        )
        t2 = Transaction(
            member_id=1, symbol="NABIL", txn_type=TransactionType.TRANSFER_OUT.value,
            quantity=30, total_cost=15000.0, txn_date=date.today(),
        )
        db_session.add_all([t1, t2])
        db_session.commit()

        recalculate_holdings(db_session, 1, "NABIL")

        holding = db_session.query(Holding).filter_by(member_id=1, symbol="NABIL").first()
        assert holding.current_qty == 70


# ============================================================
# XIRR Calculation tests (pure function)
# ============================================================

class TestCalculateXIRR:
    def test_empty_cashflows(self):
        assert calculate_xirr([]) == 0.0

    def test_single_cashflow(self):
        assert calculate_xirr([(date.today(), -10000)]) == 0.0

    def test_only_negative_cashflows(self):
        # All outflows, no inflows → can't compute
        result = calculate_xirr([
            (date(2024, 1, 1), -10000),
            (date(2024, 6, 1), -5000),
        ])
        assert result == 0.0

    def test_only_positive_cashflows(self):
        result = calculate_xirr([
            (date(2024, 1, 1), 10000),
            (date(2024, 6, 1), 5000),
        ])
        assert result == 0.0

    def test_simple_positive_return(self):
        # Invest 10k, get 11k back after 1 year → ~10% return
        result = calculate_xirr([
            (date(2024, 1, 1), -10000),
            (date(2025, 1, 1), 11000),
        ])
        assert 8.0 < result < 12.0  # ~10% annualized

    def test_simple_negative_return(self):
        # Invest 10k, get 9k back after 1 year → ~-10%
        result = calculate_xirr([
            (date(2024, 1, 1), -10000),
            (date(2025, 1, 1), 9000),
        ])
        assert -12.0 < result < -8.0

    def test_same_day_grouping(self):
        # Multiple cash flows on the same day should be grouped
        result = calculate_xirr([
            (date(2024, 1, 1), -5000),
            (date(2024, 1, 1), -5000),
            (date(2025, 1, 1), 11000),
        ])
        assert 8.0 < result < 12.0

    def test_high_return(self):
        # Invest 10k, get 20k back after 1 year → ~100%
        result = calculate_xirr([
            (date(2024, 1, 1), -10000),
            (date(2025, 1, 1), 20000),
        ])
        assert 95.0 < result < 105.0

    def test_multi_buy_single_terminal(self):
        # Two buys and one terminal value
        result = calculate_xirr([
            (date(2024, 1, 1), -10000),
            (date(2024, 7, 1), -10000),
            (date(2025, 1, 1), 22000),
        ])
        assert result > 0


# ============================================================
# Portfolio Summary tests
# ============================================================

class TestPortfolioSummary:
    def test_summary_with_holding(self, db_session, seed_companies):
        member = Member(id=1, name="Test Member")
        db_session.add(member)
        db_session.commit()

        holding = Holding(
            member_id=1, company_id=seed_companies[0].id,
            symbol="NABIL", current_qty=100,
            wacc=500.0, tax_wacc=500.0,
            total_investment=50000.0,
        )
        db_session.add(holding)

        price = LivePrice(symbol="NABIL", ltp=600.0, company_id=seed_companies[0].id)
        db_session.add(price)
        db_session.commit()

        summary = get_portfolio_summary(db_session, member_id=1)
        assert summary.member_id == 1
        assert summary.holdings_count == 1
        assert summary.total_investment == 50000.0
        assert summary.current_value == 60000.0
        assert summary.unrealized_pnl == 10000.0
        assert summary.pnl_pct == 20.0

    def test_summary_multi_holding(self, db_session, seed_companies):
        member = Member(id=1, name="Test")
        db_session.add(member)
        db_session.commit()

        h1 = Holding(
            member_id=1, company_id=seed_companies[0].id,
            symbol="NABIL", current_qty=100,
            wacc=500.0, tax_wacc=500.0, total_investment=50000.0,
        )
        h2 = Holding(
            member_id=1, company_id=seed_companies[1].id,
            symbol="NTC", current_qty=200,
            wacc=800.0, tax_wacc=800.0, total_investment=160000.0,
        )
        db_session.add_all([h1, h2])

        p1 = LivePrice(symbol="NABIL", ltp=600.0, company_id=seed_companies[0].id)
        p2 = LivePrice(symbol="NTC", ltp=900.0, company_id=seed_companies[1].id)
        db_session.add_all([p1, p2])
        db_session.commit()

        summary = get_portfolio_summary(db_session, member_id=1)
        assert summary.holdings_count == 2
        assert summary.total_investment == 210000.0
        # NABIL: 100*600=60000, NTC: 200*900=180000
        assert summary.current_value == 240000.0
        assert summary.unrealized_pnl == 30000.0

    def test_summary_no_price(self, db_session, seed_companies):
        """Holding without a matching price should not crash."""
        member = Member(id=1, name="Test")
        db_session.add(member)
        db_session.commit()

        h = Holding(
            member_id=1, company_id=seed_companies[0].id,
            symbol="NABIL", current_qty=100,
            wacc=500.0, tax_wacc=500.0, total_investment=50000.0,
        )
        db_session.add(h)
        db_session.commit()

        summary = get_portfolio_summary(db_session, member_id=1)
        assert summary.holdings_count == 1
        # current_value should be 0 since there's no price
        assert summary.current_value == 0

    def test_summary_member_ids_filter(self, db_session, seed_companies):
        m1 = Member(id=1, name="Alice")
        m2 = Member(id=2, name="Bob")
        db_session.add_all([m1, m2])
        db_session.commit()

        h1 = Holding(
            member_id=1, company_id=seed_companies[0].id,
            symbol="NABIL", current_qty=100,
            wacc=500.0, tax_wacc=500.0, total_investment=50000.0,
        )
        h2 = Holding(
            member_id=2, company_id=seed_companies[1].id,
            symbol="NTC", current_qty=50,
            wacc=800.0, tax_wacc=800.0, total_investment=40000.0,
        )
        db_session.add_all([h1, h2])

        p1 = LivePrice(symbol="NABIL", ltp=600.0, company_id=seed_companies[0].id)
        p2 = LivePrice(symbol="NTC", ltp=900.0, company_id=seed_companies[1].id)
        db_session.add_all([p1, p2])
        db_session.commit()

        # Fetch only member 1
        summary = get_portfolio_summary(db_session, member_ids=[1])
        assert summary.holdings_count == 1
        assert summary.total_investment == 50000.0

        # Fetch both members
        summary_all = get_portfolio_summary(db_session, member_ids=[1, 2])
        assert summary_all.holdings_count == 2
        assert summary_all.total_investment == 90000.0


# ============================================================
# Batch XIRR tests
# ============================================================

class TestBatchXIRR:
    def test_empty_holdings(self, db_session):
        result = batch_xirr_for_holdings(db_session, [], {})
        assert result == {}

    def test_holding_with_no_transactions(self, db_session, seed_companies):
        member = Member(id=1, name="Test")
        db_session.add(member)
        db_session.commit()

        h = Holding(
            member_id=1, company_id=seed_companies[0].id,
            symbol="NABIL", current_qty=100,
            wacc=500.0, tax_wacc=500.0, total_investment=50000.0,
        )
        db_session.add(h)
        db_session.commit()

        result = batch_xirr_for_holdings(db_session, [h], {"NABIL": 600.0})
        assert (1, "NABIL") in result
        assert result[(1, "NABIL")] == 0.0  # No transactions → 0

    def test_holding_with_transaction(self, db_session, seed_companies):
        member = Member(id=1, name="Test")
        db_session.add(member)
        db_session.commit()

        buy_date = date.today() - timedelta(days=365)
        txn = Transaction(
            member_id=1, symbol="NABIL", txn_type=TransactionType.BUY.value,
            quantity=100, rate=500.0, amount=50000.0, total_cost=50000.0,
            txn_date=buy_date,
        )
        db_session.add(txn)

        h = Holding(
            member_id=1, company_id=seed_companies[0].id,
            symbol="NABIL", current_qty=100,
            wacc=500.0, tax_wacc=500.0, total_investment=50000.0,
        )
        db_session.add(h)
        db_session.commit()

        result = batch_xirr_for_holdings(db_session, [h], {"NABIL": 600.0})
        xirr_val = result[(1, "NABIL")]
        # Bought at 500, now at 600, ~1 year → ~20% return
        assert xirr_val > 10.0
