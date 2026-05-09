"""
Tests for calculator_service.py — Buy simulation, sell simulation with FIFO CGT,
hypothetical sell, and trade plan computation.
"""
import pytest
from datetime import date, timedelta
from app.services.calculator_service import (
    calculate_buy_simulation,
    calculate_sell_simulation,
    calculate_hypothetical_sell,
    calculate_trade_plan,
)
from app.services.fee_calculator import seed_fee_config, clear_fee_cache
from app.models.transaction import Transaction, TransactionType
from app.models.holding import Holding
from app.models.member import Member
from app.models.company import Company


@pytest.fixture(autouse=True)
def setup_fees(db_session):
    """Seed fee configuration for every test in this module."""
    seed_fee_config(db_session)
    clear_fee_cache()


@pytest.fixture
def member_with_holding(db_session, seed_companies):
    """Create a member with a simple NABIL holding and two buy transactions."""
    member = Member(id=1, name="Test")
    db_session.add(member)
    db_session.commit()

    buy_date = date(2024, 1, 15)
    t1 = Transaction(
        member_id=1, symbol="NABIL", txn_type=TransactionType.BUY.value,
        quantity=100, rate=500.0, amount=50000.0, total_cost=50210.0,
        txn_date=buy_date,
    )
    db_session.add(t1)

    holding = Holding(
        member_id=1,
        company_id=seed_companies[0].id,
        symbol="NABIL",
        current_qty=100,
        wacc=502.10,
        tax_wacc=502.10,
        total_investment=50210.0,
    )
    db_session.add(holding)
    db_session.commit()
    return member


# ---- Buy Simulation ----

class TestBuySimulation:
    def test_basic_equity_buy(self, db_session):
        result = calculate_buy_simulation(db_session, 100000.0, "equity", date(2025, 1, 1))
        assert result["amount"] == 100000.0
        assert result["broker_commission"] > 0
        assert result["sebon_fee"] > 0
        assert result["dp_charge"] == 25.0
        assert result["name_transfer_fee"] == 5.0
        assert result["total_cost"] > 100000.0

    def test_mutual_fund_buy(self, db_session):
        result = calculate_buy_simulation(db_session, 50000.0, "mutual fund", date(2025, 1, 1))
        # Mutual fund has lower SEBON fee (0.010% vs 0.015%)
        equity_result = calculate_buy_simulation(db_session, 50000.0, "equity", date(2025, 1, 1))
        assert result["sebon_fee"] < equity_result["sebon_fee"]

    def test_zero_amount(self, db_session):
        result = calculate_buy_simulation(db_session, 0, "equity")
        assert result["broker_commission"] == 0
        assert result["total_cost"] == 30.0  # dp + name_transfer only

    def test_default_date_is_today(self, db_session):
        result = calculate_buy_simulation(db_session, 50000.0, "equity")
        assert result["total_cost"] > 50000.0


# ---- Sell Simulation ----

class TestSellSimulation:
    def test_basic_sell(self, db_session, member_with_holding, seed_companies):
        result = calculate_sell_simulation(
            db_session, member_id=1, symbol="NABIL",
            sell_qty=50, sell_rate=600.0, txn_date=date(2025, 6, 1),
        )
        assert result["sell_qty"] == 50
        assert result["sell_rate"] == 600.0
        assert result["amount"] == 30000.0
        assert result["broker_commission"] > 0
        assert result["sebon_fee"] > 0
        assert result["dp_charge"] == 25.0
        assert result["net_received"] < result["amount"]

    def test_sell_more_than_available_raises(self, db_session, member_with_holding, seed_companies):
        with pytest.raises(ValueError, match="Not enough quantity"):
            calculate_sell_simulation(
                db_session, member_id=1, symbol="NABIL",
                sell_qty=200, sell_rate=600.0,
            )

    def test_sell_nonexistent_holding_raises(self, db_session, seed_companies):
        member = Member(id=99, name="NoHolding")
        db_session.add(member)
        db_session.commit()
        with pytest.raises(ValueError, match="Not enough quantity"):
            calculate_sell_simulation(
                db_session, member_id=99, symbol="NABIL",
                sell_qty=10, sell_rate=600.0,
            )

    def test_cgt_on_profit(self, db_session, member_with_holding, seed_companies):
        # Sell at a profit, within 365 days → short-term CGT
        sell_date = date(2024, 6, 1)  # ~5 months from buy
        result = calculate_sell_simulation(
            db_session, member_id=1, symbol="NABIL",
            sell_qty=50, sell_rate=700.0, txn_date=sell_date,
        )
        assert result["cgt"] > 0, "Should have CGT on profitable short-term sale"

    def test_no_cgt_on_loss(self, db_session, member_with_holding, seed_companies):
        # Sell at a loss
        result = calculate_sell_simulation(
            db_session, member_id=1, symbol="NABIL",
            sell_qty=50, sell_rate=100.0, txn_date=date(2025, 1, 1),
        )
        assert result["cgt"] == 0, "No CGT on loss-making trade"

    def test_fifo_cgt_multiple_lots(self, db_session, seed_companies):
        """When there are multiple buy lots, FIFO should consume the oldest first."""
        member = Member(id=2, name="FIFO Test")
        db_session.add(member)
        db_session.commit()

        # Lot 1: bought 1 year ago (long-term)
        t1 = Transaction(
            member_id=2, symbol="NABIL", txn_type=TransactionType.BUY.value,
            quantity=50, rate=400.0, amount=20000.0, total_cost=20100.0,
            txn_date=date(2023, 6, 1),
        )
        # Lot 2: bought recently (short-term)
        t2 = Transaction(
            member_id=2, symbol="NABIL", txn_type=TransactionType.BUY.value,
            quantity=50, rate=600.0, amount=30000.0, total_cost=30150.0,
            txn_date=date(2024, 10, 1),
        )
        db_session.add_all([t1, t2])

        holding = Holding(
            member_id=2, company_id=seed_companies[0].id, symbol="NABIL",
            current_qty=100, wacc=502.5, tax_wacc=502.5, total_investment=50250.0,
        )
        db_session.add(holding)
        db_session.commit()

        result = calculate_sell_simulation(
            db_session, member_id=2, symbol="NABIL",
            sell_qty=50, sell_rate=700.0, txn_date=date(2025, 1, 15),
        )
        # FIFO: first 50 shares from Lot 1 (bought 2023-06-01)
        # holding_days = (2025-01-15 - 2023-06-01) > 365 → long-term CGT rate
        assert result["cgt_breakdown"][0]["holding_days"] > 365
        assert result["cgt_breakdown"][0]["cgt_rate"] == 5.0


# ---- Hypothetical Sell ----

class TestHypotheticalSell:
    def test_basic(self, db_session):
        result = calculate_hypothetical_sell(
            db_session, symbol="NABIL", sell_qty=100,
            sell_rate=600.0, cost_basis_per_share=500.0,
        )
        assert result["amount"] == 60000.0
        assert result["wacc"] == 500.0
        assert result["total_buy_cost"] == 50000.0
        assert result["gross_profit"] == 10000.0
        assert result["net_received"] < 60000.0

    def test_loss_scenario(self, db_session):
        result = calculate_hypothetical_sell(
            db_session, symbol="NABIL", sell_qty=100,
            sell_rate=400.0, cost_basis_per_share=500.0,
        )
        assert result["gross_profit"] < 0
        assert result["cgt"] == 0

    def test_custom_instrument(self, db_session):
        result = calculate_hypothetical_sell(
            db_session, symbol="SBI", sell_qty=100,
            sell_rate=20.0, cost_basis_per_share=15.0,
            instrument="mutual fund",
        )
        assert result["net_received"] > 0


# ---- Trade Plan ----

class TestTradePlan:
    def test_basic_trade_plan(self, db_session):
        result = calculate_trade_plan(
            db_session, symbol="NABIL", capital_base=1000000.0,
            sleeve_pct=20.0, risk_pct=2.0, entry_rate=500.0,
            stop_loss=480.0, target_price=550.0,
        )
        assert result["symbol"] == "NABIL"
        assert result["quantity"] > 0
        assert result["effective_wacc"] > result["entry_rate"]  # includes fees
        assert result["net_risk"] > 0
        assert result["net_reward"] > 0
        assert result["true_rr"] is not None

    def test_stop_loss_above_entry_raises(self, db_session):
        with pytest.raises(ValueError, match="Stop loss must be below entry"):
            calculate_trade_plan(
                db_session, symbol="NABIL", capital_base=100000.0,
                sleeve_pct=20.0, risk_pct=2.0, entry_rate=500.0,
                stop_loss=510.0, target_price=600.0,
            )

    def test_no_target_price(self, db_session):
        result = calculate_trade_plan(
            db_session, symbol="NABIL", capital_base=500000.0,
            sleeve_pct=20.0, risk_pct=2.0, entry_rate=500.0,
            stop_loss=480.0, target_price=None,
        )
        assert result["net_reward"] is None
        assert result["true_rr"] is None

    def test_tight_risk_raises(self, db_session):
        """If risk_pct is so tight no shares can be bought, raise ValueError."""
        with pytest.raises(ValueError):
            calculate_trade_plan(
                db_session, symbol="NABIL", capital_base=100.0,
                sleeve_pct=1.0, risk_pct=0.01, entry_rate=5000.0,
                stop_loss=4999.0, target_price=6000.0,
            )
