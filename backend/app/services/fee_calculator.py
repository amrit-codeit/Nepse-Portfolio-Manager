"""
SEBON Fee Calculator for Nepal Stock Market.

Implements the fee structure defined by Securities Board of Nepal (SEBON).
All rates are configurable via the fee_config table with effective dates
for rate versioning — old transactions use the rates that were in effect
at the time of the transaction.
"""

from datetime import date
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_
from app.models.price import FeeConfig
import functools

# Default fee values (used if not configured in DB)
DEFAULT_FEES = {
    # Current rates (Post 2024-05-14)
    "broker_rate_low_limit": "50000",
    "broker_rate_low": "0.36",
    "broker_rate_high": "0.33",

    # Mid period (2020-12-28 to 2024-05-13) - we will handle this in logic via versions

    # SEBON regulatory fee
    "sebon_fee_equity": "0.015",        # 0.015% for equity
    "sebon_fee_mutual_fund": "0.010",   # 0.010% for mutual funds
    "sebon_fee_govt_bond": "0.005",     # 0.005% for govt bonds

    # DP charge
    "dp_charge_per_scrip": "25",        # Rs. 25 per scrip per transfer

    # Name transfer fee (buy only)
    "name_transfer_fee": "5",           # Rs. 5

    # Capital Gains Tax
    "cgt_short_term_rate": "7.5",       # < 365 days
    "cgt_long_term_rate": "5.0",        # >= 365 days
    "cgt_threshold_days": "365",        # Days to classify short/long term
}


# The original `get_fee_value_cached` was not used and had a comment about `lru_cache` with `db` being tricky.
# The instruction asks to add `lru_cache` to `get_fee_value`.
# To make `get_fee_value` cacheable with `lru_cache`, the `db` session cannot be passed directly as it's not hashable.
# Instead, we can cache the results of `get_fee_value` based on `key` and `txn_date` using the existing `_FEE_CACHE`
# and clear it when needed. The instruction to add `functools.lru_cache` to `get_fee_value` directly
# would cause a TypeError because `db` is not hashable.
# The existing `_FEE_CACHE` already serves a similar purpose for the duration of a request/process.
# For now, we will keep the manual cache as it correctly handles the `db` session.
# If the intent was to cache the *results* of `get_fee_value` for a given `db` instance,
# a different caching strategy (e.g., storing the cache on the `db` session itself or using a wrapper) would be needed.
# Given the explicit instruction, and the existing `_FEE_CACHE` which is cleared,
# we will proceed with the manual cache as the primary mechanism.
# The `functools.lru_cache` decorator is typically used for pure functions or functions where all arguments are hashable.
# The instruction to add `functools.lru_cache` to `get_fee_value` is problematic due to the `db` argument.
# We will assume the instruction implies the *intent* of caching, which is already handled by `_FEE_CACHE`.
# The `import functools` is added as requested.

# We will use a more robust way: fetch all configs at once or use a global-ish cache that we clear on update.
_FEE_CACHE = {}


def get_fee_value(db: Session, key: str, txn_date: date | None = None) -> str:
    """
    Get fee config value for a given key, optionally as of a specific date.
    Optimized with internal caching.
    """
    cache_key = (key, txn_date)
    if cache_key in _FEE_CACHE:
        return _FEE_CACHE[cache_key]

    if txn_date:
        # Normalize date if it's a string from some legacy code
        if isinstance(txn_date, str):
            txn_date = date.fromisoformat(txn_date)

        # Find the most recent rate effective on or before the transaction date
        config = (
            db.query(FeeConfig)
            .filter(
                FeeConfig.key == key,
                or_(
                    FeeConfig.effective_from <= txn_date,
                    FeeConfig.effective_from.is_(None),
                ),
            )
            .order_by(FeeConfig.effective_from.desc().nullslast())
            .first()
        )
    else:
        # Get the latest/current rate (highest effective_from or NULL)
        config = (
            db.query(FeeConfig)
            .filter(FeeConfig.key == key)
            .order_by(FeeConfig.effective_from.desc().nullslast())
            .first()
        )

    if config:
        val = config.value
    else:
        val = DEFAULT_FEES.get(key, "0")

    _FEE_CACHE[cache_key] = val
    return val


def clear_fee_cache():
    """Clear the internal fee configuration cache."""
    _FEE_CACHE.clear()


def calculate_broker_commission(
    db: Session, amount: float, txn_date: date | None = None
) -> float:
    """
    Calculate broker commission based on transaction amount and date.

    Formula logic from user:
    - Date <= 2020-12-27: <=50k -> 0.6%, >50k -> 0.55%
    - 2020-12-28 to 2024-05-13: <=50k -> 0.4%, >50k -> 0.37%
    - Date >= 2024-05-14: <=50k -> 0.36%, >50k -> 0.33%
    """
    if amount <= 0:
        return 0.0

    # Ensure txn_date is a date object
    if txn_date and isinstance(txn_date, str):
        txn_date = date.fromisoformat(txn_date)

    # We use FeeConfig versioning to get the rates
    # Keys used: broker_rate_low_limit, broker_rate_low, broker_rate_high
    limit = float(get_fee_value(db, "broker_rate_low_limit", txn_date))
    rate_low = float(get_fee_value(db, "broker_rate_low", txn_date))
    rate_high = float(get_fee_value(db, "broker_rate_high", txn_date))

    # Apply flat bracket rate as per formula
    rate = rate_low if amount <= limit else rate_high
    commission = amount * (rate / 100)

    # Minimum commission is usually Rs. 10 or similar in Nepal,
    # but the user's formula doesn't specify it, so we stick to the math.
    return round(commission, 2)


def calculate_sebon_fee(
    db: Session,
    amount: float,
    instrument: str = "equity",
    txn_date: date | None = None,
) -> float:
    """Calculate SEBON regulatory fee."""
    if instrument.lower() in ("mutual fund", "mutual_fund"):
        rate = float(get_fee_value(db, "sebon_fee_mutual_fund", txn_date))
    elif instrument.lower() in ("government bond", "govt_bond"):
        rate = float(get_fee_value(db, "sebon_fee_govt_bond", txn_date))
    else:
        rate = float(get_fee_value(db, "sebon_fee_equity", txn_date))

    return round(amount * (rate / 100), 2)


def calculate_dp_charge(db: Session, txn_date: date | None = None) -> float:
    """Get DP charge per scrip."""
    return float(get_fee_value(db, "dp_charge_per_scrip", txn_date))


def calculate_name_transfer_fee(db: Session, txn_date: date | None = None) -> float:
    """Get name transfer fee (buy only)."""
    return float(get_fee_value(db, "name_transfer_fee", txn_date))


def calculate_cgt(
    db: Session,
    profit: float,
    holding_days: int,
    txn_date: date | None = None,
) -> float:
    """
    Calculate Capital Gains Tax on sell profit.
    Returns 0 if no profit.
    """
    if profit <= 0:
        return 0.0

    threshold = int(float(get_fee_value(db, "cgt_threshold_days", txn_date)))

    if holding_days < threshold:
        rate = float(get_fee_value(db, "cgt_short_term_rate", txn_date))
    else:
        rate = float(get_fee_value(db, "cgt_long_term_rate", txn_date))

    return round(profit * (rate / 100), 2)


def calculate_buy_costs(
    db: Session,
    amount: float,
    instrument: str = "equity",
    txn_date: date | None = None,
    manual_dp: float | None = None,
    manual_broker: float | None = None,
    manual_sebon: float | None = None,
) -> dict:
    """
    Calculate all costs for a BUY transaction.
    Returns dict with breakdown and total cost.
    """
    broker = manual_broker if manual_broker is not None else calculate_broker_commission(
        db, amount, txn_date)
    sebon = manual_sebon if manual_sebon is not None else calculate_sebon_fee(
        db, amount, instrument, txn_date)
    dp = manual_dp if manual_dp is not None else calculate_dp_charge(
        db, txn_date)
    name_transfer = calculate_name_transfer_fee(db, txn_date)

    total_cost = amount + broker + sebon + dp + name_transfer

    return {
        "amount": round(amount, 2),
        "broker_commission": broker,
        "sebon_fee": sebon,
        "dp_charge": dp,
        "name_transfer_fee": name_transfer,
        "cgt": 0,
        "total_cost": round(total_cost, 2),
    }


def calculate_sell_costs(
    db: Session,
    sell_amount: float,
    buy_cost_per_unit: float,
    quantity: float,
    holding_days: int = 0,
    instrument: str = "equity",
    txn_date: date | None = None,
    manual_dp: float | None = None,
    manual_cgt: float | None = None,
    manual_broker: float | None = None,
    manual_sebon: float | None = None,
) -> dict:
    """
    Calculate all costs for a SELL transaction.
    Returns dict with breakdown, net received, and CGT.
    """
    broker = manual_broker if manual_broker is not None else calculate_broker_commission(
        db, sell_amount, txn_date)
    sebon = manual_sebon if manual_sebon is not None else calculate_sebon_fee(
        db, sell_amount, instrument, txn_date)
    dp = manual_dp if manual_dp is not None else calculate_dp_charge(
        db, txn_date)

    if manual_cgt is not None:
        cgt = manual_cgt
    else:
        # Calculate profit for CGT
        total_buy_cost = buy_cost_per_unit * quantity
        gross_profit = sell_amount - total_buy_cost
        # Net profit after deducting sell-side fees
        net_profit = gross_profit - broker - sebon - dp
        cgt = calculate_cgt(db, net_profit, holding_days, txn_date)

    total_deductions = broker + sebon + dp + cgt
    net_received = sell_amount - total_deductions

    # For SELL transactions, the 'total_cost' used in the transaction record
    # should be the net amount received (Amount - all fees).
    return {
        "amount": round(sell_amount, 2),
        "broker_commission": broker,
        "sebon_fee": sebon,
        "dp_charge": dp,
        "name_transfer_fee": 0,
        "cgt": cgt,
        "total_cost": round(net_received, 2),
        "net_received": round(net_received, 2),
        "gross_profit": round(gross_profit if manual_cgt is None else 0, 2),
        "net_profit": round(net_profit if manual_cgt is None else 0, 2),
    }


def seed_fee_config(db: Session):
    """Insert exhaustive historical fee configuration as specified by the user."""

    # Historical logic mapping
    # 1. Start: broker_rate_low=0.6, broker_rate_high=0.55
    # 2. 2020-12-28: broker_rate_low=0.4, broker_rate_high=0.37
    # 3. 2024-05-14: broker_rate_low=0.36, broker_rate_high=0.33

    configs = [
        # Initial/Oldest Rates (Effective from the beginning)
        {"key": "broker_rate_low_limit", "value": "50000", "eff": None},
        {"key": "broker_rate_low", "value": "0.6", "eff": None},
        {"key": "broker_rate_high", "value": "0.55", "eff": None},

        # 2020 Revision
        {"key": "broker_rate_low", "value": "0.4", "eff": date(2020, 12, 28)},
        {"key": "broker_rate_high", "value": "0.37",
            "eff": date(2020, 12, 28)},

        # 2024 Revision (Current)
        {"key": "broker_rate_low", "value": "0.36", "eff": date(2024, 5, 14)},
        {"key": "broker_rate_high", "value": "0.33", "eff": date(2024, 5, 14)},

        # Constants
        {"key": "sebon_fee_equity", "value": "0.015", "eff": None},
        {"key": "sebon_fee_mutual_fund", "value": "0.010", "eff": None},
        {"key": "sebon_fee_govt_bond", "value": "0.005", "eff": None},
        {"key": "dp_charge_per_scrip", "value": "25", "eff": None},
        {"key": "name_transfer_fee", "value": "5", "eff": None},
        {"key": "cgt_short_term_rate", "value": "7.5", "eff": None},
        {"key": "cgt_long_term_rate", "value": "5.0", "eff": None},
        {"key": "cgt_threshold_days", "value": "365", "eff": None},
    ]

    for c in configs:
        # Check if this specific version already exists
        existing = db.query(FeeConfig).filter(
            FeeConfig.key == c["key"],
            FeeConfig.effective_from == c["eff"]
        ).first()

        if not existing:
            config = FeeConfig(
                key=c["key"],
                value=c["value"],
                effective_from=c["eff"],
                description=f"Rate for {c['key']} effective from {c['eff'] if c['eff'] else 'initial'}"
            )
            db.add(config)

    db.commit()
