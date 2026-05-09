"""
Tests for fee_calculator.py — SEBON fee schedule, date-range versioning,
buy/sell cost breakdowns, CGT, and cache behaviour.
"""
import pytest
from datetime import date
from app.services.fee_calculator import (
    calculate_broker_commission,
    calculate_sebon_fee,
    calculate_dp_charge,
    calculate_name_transfer_fee,
    calculate_cgt,
    calculate_buy_costs,
    calculate_sell_costs,
    get_fee_value,
    seed_fee_config,
    clear_fee_cache,
)


@pytest.fixture(autouse=True)
def setup_fees(db_session):
    seed_fee_config(db_session)
    clear_fee_cache()


# ---- Broker Commission (date-range versioning) ----

class TestBrokerCommission:
    """Verify broker commission brackets across all three SEBON rate eras."""

    def test_pre_2020_low_bracket(self, db_session):
        assert calculate_broker_commission(db_session, 50000, date(2020, 1, 1)) == 300.0  # 0.6%

    def test_pre_2020_high_bracket(self, db_session):
        assert calculate_broker_commission(db_session, 100000, date(2020, 1, 1)) == 550.0  # 0.55%

    def test_mid_period_low_bracket(self, db_session):
        assert calculate_broker_commission(db_session, 50000, date(2022, 1, 1)) == 200.0  # 0.4%

    def test_mid_period_high_bracket(self, db_session):
        assert calculate_broker_commission(db_session, 100000, date(2022, 1, 1)) == 370.0  # 0.37%

    def test_current_low_bracket(self, db_session):
        assert calculate_broker_commission(db_session, 50000, date(2025, 1, 1)) == 180.0  # 0.36%

    def test_current_high_bracket(self, db_session):
        assert calculate_broker_commission(db_session, 100000, date(2025, 1, 1)) == 330.0  # 0.33%

    def test_zero_amount(self, db_session):
        assert calculate_broker_commission(db_session, 0, date(2025, 1, 1)) == 0.0

    def test_negative_amount(self, db_session):
        assert calculate_broker_commission(db_session, -1000, date(2025, 1, 1)) == 0.0

    def test_boundary_date_2020_12_28(self, db_session):
        # Exactly on the boundary — should use mid-period rates
        assert calculate_broker_commission(db_session, 50000, date(2020, 12, 28)) == 200.0

    def test_boundary_date_2024_05_14(self, db_session):
        # Exactly on the boundary — should use current rates
        assert calculate_broker_commission(db_session, 50000, date(2024, 5, 14)) == 180.0

    def test_no_date_uses_latest(self, db_session):
        # Without a date, should use the most recent (current) rate
        result = calculate_broker_commission(db_session, 50000)
        assert result == 180.0

    def test_string_date_coercion(self, db_session):
        """The function should accept date strings and parse them."""
        result = calculate_broker_commission(db_session, 50000, "2025-01-01")
        assert result == 180.0


# ---- SEBON Fee ----

class TestSebonFee:
    def test_equity(self, db_session):
        assert calculate_sebon_fee(db_session, 100000, "equity") == 15.0

    def test_mutual_fund(self, db_session):
        assert calculate_sebon_fee(db_session, 100000, "mutual fund") == 10.0

    def test_mutual_fund_underscore(self, db_session):
        assert calculate_sebon_fee(db_session, 100000, "mutual_fund") == 10.0

    def test_govt_bond(self, db_session):
        assert calculate_sebon_fee(db_session, 100000, "government bond") == 5.0

    def test_default_instrument(self, db_session):
        # Unknown instrument should use equity rate
        assert calculate_sebon_fee(db_session, 100000, "preferred") == 15.0


# ---- DP Charge ----

class TestDPCharge:
    def test_default(self, db_session):
        assert calculate_dp_charge(db_session) == 25.0


# ---- Name Transfer Fee ----

class TestNameTransferFee:
    def test_default(self, db_session):
        assert calculate_name_transfer_fee(db_session) == 5.0


# ---- Capital Gains Tax ----

class TestCGT:
    def test_short_term_profit(self, db_session):
        assert calculate_cgt(db_session, 1000, 300) == 75.0  # 7.5%

    def test_long_term_profit(self, db_session):
        assert calculate_cgt(db_session, 1000, 400) == 50.0  # 5.0%

    def test_no_tax_on_loss(self, db_session):
        assert calculate_cgt(db_session, -100, 400) == 0.0

    def test_no_tax_on_zero_profit(self, db_session):
        assert calculate_cgt(db_session, 0, 100) == 0.0

    def test_boundary_365_days(self, db_session):
        # Exactly 365 days → long term
        assert calculate_cgt(db_session, 1000, 365) == 50.0  # 5.0%

    def test_boundary_364_days(self, db_session):
        # 364 days → short term
        assert calculate_cgt(db_session, 1000, 364) == 75.0  # 7.5%


# ---- Buy Costs ----

class TestBuyCosts:
    def test_basic_buy(self, db_session):
        result = calculate_buy_costs(db_session, 100000, "equity", date(2025, 1, 1))
        assert result["amount"] == 100000.0
        assert result["broker_commission"] == 330.0  # 0.33% for > 50k
        assert result["sebon_fee"] == 15.0
        assert result["dp_charge"] == 25.0
        assert result["name_transfer_fee"] == 5.0
        assert result["cgt"] == 0
        assert result["total_cost"] == 100375.0

    def test_manual_overrides(self, db_session):
        result = calculate_buy_costs(
            db_session, 50000, "equity",
            manual_dp=0, manual_broker=100, manual_sebon=5,
        )
        assert result["broker_commission"] == 100
        assert result["sebon_fee"] == 5
        assert result["dp_charge"] == 0
        # total = 50000 + 100 + 5 + 0 + 5(name transfer)
        assert result["total_cost"] == 50110.0


# ---- Sell Costs ----

class TestSellCosts:
    def test_profitable_sell(self, db_session):
        result = calculate_sell_costs(
            db_session, sell_amount=60000, buy_cost_per_unit=500,
            quantity=100, holding_days=100, instrument="equity",
            txn_date=date(2025, 1, 1),
        )
        assert result["amount"] == 60000.0
        assert result["broker_commission"] > 0
        assert result["sebon_fee"] > 0
        assert result["dp_charge"] == 25.0
        assert result["cgt"] > 0  # Profitable short-term → CGT
        assert result["net_received"] < 60000.0

    def test_loss_sell(self, db_session):
        result = calculate_sell_costs(
            db_session, sell_amount=40000, buy_cost_per_unit=500,
            quantity=100, holding_days=100,
        )
        # Sell at 400/share vs 500/share cost → loss → no CGT
        assert result["cgt"] == 0

    def test_manual_cgt_override(self, db_session):
        result = calculate_sell_costs(
            db_session, sell_amount=60000, buy_cost_per_unit=500,
            quantity=100, holding_days=100, manual_cgt=999.0,
        )
        assert result["cgt"] == 999.0

    def test_long_term_sell(self, db_session):
        result = calculate_sell_costs(
            db_session, sell_amount=60000, buy_cost_per_unit=500,
            quantity=100, holding_days=400, instrument="equity",
            txn_date=date(2025, 1, 1),
        )
        # Long-term rate (5%) should apply, not short-term (7.5%)
        short_term = calculate_sell_costs(
            db_session, sell_amount=60000, buy_cost_per_unit=500,
            quantity=100, holding_days=100, instrument="equity",
            txn_date=date(2025, 1, 1),
        )
        assert result["cgt"] < short_term["cgt"]


# ---- Fee Value Lookup ----

class TestGetFeeValue:
    def test_default_fallback(self, db_session):
        # A key that has no DB entry should use DEFAULT_FEES
        clear_fee_cache()
        val = get_fee_value(db_session, "nonexistent_key")
        assert val == "0"  # DEFAULT_FEES default

    def test_string_date(self, db_session):
        val = get_fee_value(db_session, "broker_rate_low", "2025-01-01")
        assert val == "0.36"


# ---- Cache ----

class TestCache:
    def test_cache_invalidation(self, db_session):
        val1 = calculate_dp_charge(db_session)
        clear_fee_cache()
        val2 = calculate_dp_charge(db_session)
        assert val1 == val2

    def test_cache_does_not_grow_unbounded(self, db_session):
        """Fill cache past MAX_FEE_CACHE_SIZE and verify it resets."""
        from app.services.fee_calculator import _FEE_CACHE, _MAX_FEE_CACHE_SIZE
        clear_fee_cache()
        # Stuff enough entries to exceed limit
        for i in range(_MAX_FEE_CACHE_SIZE + 5):
            _FEE_CACHE[(f"fake_key_{i}", None)] = "0"
        # Next get_fee_value call should clear and rebuild
        get_fee_value(db_session, "dp_charge_per_scrip")
        assert len(_FEE_CACHE) < _MAX_FEE_CACHE_SIZE
