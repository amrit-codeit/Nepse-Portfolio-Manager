"""
Economy & Alternatives service layer.
- get_latest_macro_snapshot: returns the latest macroeconomic indicator snapshot with regime + sector signals
- get_alternatives_comparison: compares NEPSE vs Gold vs Silver vs FD for a given principal and start date
- build_macro_context_string: returns a plain-English paragraph for AI prompt injection
"""

import datetime
import math
from sqlalchemy.orm import Session
from sqlalchemy import func, desc

from app.models.price import EconomicIndicator, MacroData, CommodityPrice, IndexHistory

# -------------------------------------------------------
# Internal key → substring match (lowercased indicator_name)
# -------------------------------------------------------
INDICATOR_KEY_MAP = {
    "real_gdp_growth":       "real gdp at basic price",
    "nominal_gdp_growth":    "nominal gdp at producers",
    "gdp_current_price":     "gross domestic product( current price)",
    "gni":                   "gross national income (gni)",
    "cpi_yoy":               "cpi (yoy)",
    "food_cpi_yoy":          "food cpi (yoy)",
    "nonfood_cpi_yoy":       "non food cpi (yoy)",
    "cpi_period_avg":        "cpi annual / period average",
    "wholesale_price_yoy":   "national wholesale price index (yoy)",
    "base_rate":             "base rate",
    "lending_rate":          "weighted average lending rate of commercial banks",
    "deposit_rate":          "weighted average deposit rate of commercial banks",
    "interbank_rate":        "weighted average interbank rate of commercial banks",
    "tbill_91":              "91 day t bills rate",
    "tbill_364":             "364 day t bills rate",
    "m2_growth":             "broad money (m2) (yoy)",
    "m1_growth":             "narrow money (m1) (yoy)",
    "domestic_credit":       "domestic credit (yoy)",
    "private_credit_growth": "claims on private sector (yoy)",
    "reserve_money":         "reserve money (yoy)",
    "total_deposits":        "total deposits",
    "bfi_credit":            "bfis credit to private sector",
    "market_cap_gdp":        "market capitalization/gdp",
    "remittance_inflow":     "workers' remittances",
    "forex_reserves_usd":    "gross foreign exchange reserves (usd",
    "forex_reserves_npr":    "gross foreign exchange reserves (rs",
    "import_growth":         "import growth",
    "export_growth":         "export growth",
    "bop_surplus":           "bop(deficit)",
    "current_account":       "current account balance",
    "revenue_growth":        "revenue growth",
    "expenditure_growth":    "expenditure growth",
    "capex_gdp":             "capital expenditure / gdp",
    "revenue_gdp":           "revenue / gdp",
    "domestic_debt":         "domestic debt (rs",
    "external_debt":         "external debt (rs",
    "domestic_debt_gdp":     "domestic debt / gdp",
}


def _match_indicator_key(indicator_name: str) -> str | None:
    """Match an indicator_name to an internal key using substring matching."""
    name_lower = indicator_name.lower().strip()
    for key, substr in INDICATOR_KEY_MAP.items():
        if substr in name_lower:
            return key
    return None


# -------------------------------------------------------
# Macro Snapshot
# -------------------------------------------------------

def get_latest_macro_snapshot(db: Session) -> dict:
    """
    Returns the latest macroeconomic snapshot from the EconomicIndicator table.
    Includes regime assessment and sector signals.
    """
    # Find the most recent date_value
    latest_date = db.query(func.max(EconomicIndicator.date_value)).scalar()
    if not latest_date:
        return {"available": False, "message": "No macro data available. Click Refresh to scrape the latest data."}

    # Get the label for display
    latest_label_row = db.query(EconomicIndicator.date_label).filter(
        EconomicIndicator.date_value == latest_date
    ).first()
    period_label = latest_label_row[0] if latest_label_row else str(latest_date)

    # Fetch all indicators for the latest date
    rows = db.query(EconomicIndicator).filter(
        EconomicIndicator.date_value == latest_date
    ).all()

    indicators = {}
    raw_indicators = []
    for row in rows:
        key = _match_indicator_key(row.indicator_name)
        if key:
            indicators[key] = row.value
        raw_indicators.append({
            "category": row.category,
            "name": row.indicator_name,
            "value": row.value,
            "key": key,
        })

    # Also fetch historical periods for trend display
    all_dates = db.query(EconomicIndicator.date_label, EconomicIndicator.date_value).distinct().order_by(
        EconomicIndicator.date_value.desc()
    ).all()
    period_labels = [{"label": d[0], "date": d[1].isoformat() if d[1] else None} for d in all_dates]

    # Derived values
    cpi = indicators.get("cpi_yoy")
    lending = indicators.get("lending_rate")
    deposit = indicators.get("deposit_rate")

    real_lending_rate = round(lending - cpi, 2) if lending is not None and cpi is not None else None
    real_deposit_return = round(deposit - cpi, 2) if deposit is not None and cpi is not None else None

    # Regime assessment
    regime = _assess_regime(indicators)

    # Sector signals
    sector_signals = _assess_sector_signals(indicators)

    return {
        "available": True,
        "period_label": period_label,
        "period_date": latest_date.isoformat(),
        "indicators": indicators,
        "raw_indicators": raw_indicators,
        "period_labels": period_labels,
        "derived": {
            "real_lending_rate": real_lending_rate,
            "real_deposit_return": real_deposit_return,
        },
        "regime": regime,
        "sector_signals": sector_signals,
    }


def _assess_regime(indicators: dict) -> dict:
    """Determine current monetary regime from indicator values."""
    base = indicators.get("base_rate")
    deposit = indicators.get("deposit_rate")
    m2 = indicators.get("m2_growth")
    lending = indicators.get("lending_rate")

    easing = (
        base is not None and base < 6.0 and
        deposit is not None and deposit < 5.0 and
        m2 is not None and m2 > 10.0
    )
    tightening = (
        base is not None and base > 8.0 and
        lending is not None and lending > 12.0 and
        m2 is not None and m2 < 5.0
    )

    if easing:
        return {
            "label": "Monetary Easing",
            "bias": "bullish",
            "description": (
                "NRB has maintained low rates with strong money supply growth, "
                "creating favorable conditions for equity markets. Lower borrowing costs "
                "support corporate earnings while cheap deposits push investors toward "
                "higher-yielding assets like stocks. Historically, NEPSE rallies during easing cycles."
            ),
        }
    elif tightening:
        return {
            "label": "Monetary Tightening",
            "bias": "bearish",
            "description": (
                "NRB has raised rates significantly with restrictive money supply, "
                "creating headwinds for equity markets. Higher borrowing costs compress "
                "corporate margins while attractive deposit rates pull capital away from stocks. "
                "NEPSE typically underperforms during tightening cycles."
            ),
        }
    else:
        return {
            "label": "Neutral / Transitional",
            "bias": "neutral",
            "description": (
                "Monetary conditions are mixed — neither fully easing nor tightening. "
                "Stock selection matters more than macro tailwinds in this environment. "
                "Focus on sector-specific opportunities and individual stock fundamentals "
                "rather than broad market bets."
            ),
        }


def _assess_sector_signals(indicators: dict) -> list:
    """Evaluate sector-level signals from macro indicators."""
    base = indicators.get("base_rate")
    m2 = indicators.get("m2_growth")
    lending = indicators.get("lending_rate")
    capex = indicators.get("capex_gdp")
    remittance = indicators.get("remittance_inflow")
    cpi = indicators.get("cpi_yoy")

    signals = []

    # BFI / Commercial Banks
    bfi_signal = "neutral"
    bfi_note = "Standard monetary conditions."
    if base is not None and m2 is not None:
        if base < 6.5 and m2 > 10.0:
            bfi_signal = "favorable"
            bfi_note = "Low base rate + strong M2 growth supports credit expansion and NIM."
        if lending is not None and lending < 8.0:
            bfi_signal = "caution"
            bfi_note = "Lending rate compression risks NIM squeeze for banks."
    signals.append({
        "sector": "BFI / Commercial Banks",
        "signal": bfi_signal,
        "note": bfi_note,
        "symbols": ["NABIL", "EBL", "SANIMA", "GBIME", "NICA"],
    })

    # Hydro / Infrastructure
    hydro_signal = "neutral"
    hydro_note = "Standard government spending levels."
    if capex is not None:
        if capex > 5.0:
            hydro_signal = "favorable"
            hydro_note = "High capital expenditure/GDP supports infrastructure spending."
        elif capex < 4.0:
            hydro_signal = "caution"
            hydro_note = "Low government capex/GDP suggests weak infrastructure pipeline."
    signals.append({
        "sector": "Hydro / Infrastructure",
        "signal": hydro_signal,
        "note": hydro_note,
        "symbols": ["NIFRA", "UPPER", "NHPC", "HIDCL"],
    })

    # Microfinance
    mfi_signal = "neutral"
    mfi_note = "Standard remittance levels."
    if remittance is not None and remittance > 1200.0:
        mfi_signal = "favorable"
        mfi_note = "Strong remittance inflows support rural lending demand."
    signals.append({
        "sector": "Microfinance",
        "signal": mfi_signal,
        "note": mfi_note,
        "symbols": ["SKBBL", "CBBL", "MLBBL"],
    })

    # Insurance
    ins_signal = "neutral"
    ins_note = "Standard conditions."
    if m2 is not None and cpi is not None:
        if m2 > 10.0 and cpi < 6.0:
            ins_signal = "favorable"
            ins_note = "Strong M2 + controlled inflation supports premium growth."
    signals.append({
        "sector": "Insurance",
        "signal": ins_signal,
        "note": ins_note,
        "symbols": ["NLIC", "LICN", "SJLIC"],
    })

    return signals


# -------------------------------------------------------
# Alternatives Comparison
# -------------------------------------------------------

def get_alternatives_comparison(db: Session, principal: float, start_date: datetime.date) -> list:
    """
    Compares what a principal amount would be worth today if invested in
    NEPSE index, Fixed Deposit, Gold, or Silver from start_date.
    """
    today = datetime.date.today()
    years_held = max((today - start_date).days / 365.25, 0.01)
    results = []

    # --- NEPSE Index ---
    try:
        start_idx = db.query(IndexHistory).filter(
            IndexHistory.index_name == "NEPSE Index",
            IndexHistory.date >= start_date,
        ).order_by(IndexHistory.date.asc()).first()

        end_idx = db.query(IndexHistory).filter(
            IndexHistory.index_name == "NEPSE Index",
        ).order_by(IndexHistory.date.desc()).first()

        if start_idx and end_idx and start_idx.close and end_idx.close:
            ratio = end_idx.close / start_idx.close
            final = principal * ratio
            total_return = (ratio - 1) * 100
            cagr = (math.pow(ratio, 1 / years_held) - 1) * 100
            results.append({
                "label": "NEPSE Index",
                "icon": "stock",
                "start_value": round(start_idx.close, 2),
                "end_value": round(end_idx.close, 2),
                "start_date": start_idx.date.isoformat(),
                "end_date": end_idx.date.isoformat(),
                "final_amount": round(final, 2),
                "total_return_pct": round(total_return, 2),
                "annualized_return_pct": round(cagr, 2),
                "years_held": round(years_held, 2),
            })
    except Exception:
        pass

    # --- Fixed Deposit ---
    try:
        fd_rate_row = db.query(MacroData).filter(
            MacroData.date <= start_date,
        ).order_by(MacroData.date.desc()).first()

        if not fd_rate_row:
            fd_rate_row = db.query(MacroData).order_by(MacroData.date.asc()).first()

        if fd_rate_row and fd_rate_row.fixed_deposit_rate:
            rate = fd_rate_row.fixed_deposit_rate / 100.0
            # Compound annually
            final = principal * math.pow(1 + rate, years_held)
            total_return = ((final / principal) - 1) * 100
            results.append({
                "label": "Fixed Deposit",
                "icon": "bank",
                "start_value": round(fd_rate_row.fixed_deposit_rate, 2),
                "end_value": round(fd_rate_row.fixed_deposit_rate, 2),
                "start_date": start_date.isoformat(),
                "end_date": today.isoformat(),
                "final_amount": round(final, 2),
                "total_return_pct": round(total_return, 2),
                "annualized_return_pct": round(fd_rate_row.fixed_deposit_rate, 2),
                "years_held": round(years_held, 2),
                "note": f"Using FD rate of {fd_rate_row.fixed_deposit_rate:.2f}% from {fd_rate_row.date.isoformat()}",
            })
    except Exception:
        pass

    # --- Gold ---
    try:
        start_gold = db.query(CommodityPrice).filter(
            CommodityPrice.date >= start_date,
            CommodityPrice.gold_price.isnot(None),
        ).order_by(CommodityPrice.date.asc()).first()

        end_gold = db.query(CommodityPrice).filter(
            CommodityPrice.gold_price.isnot(None),
        ).order_by(CommodityPrice.date.desc()).first()

        if start_gold and end_gold and start_gold.gold_price and end_gold.gold_price:
            ratio = end_gold.gold_price / start_gold.gold_price
            final = principal * ratio
            total_return = (ratio - 1) * 100
            cagr = (math.pow(ratio, 1 / years_held) - 1) * 100
            results.append({
                "label": "Gold",
                "icon": "gold",
                "start_value": round(start_gold.gold_price, 2),
                "end_value": round(end_gold.gold_price, 2),
                "start_date": start_gold.date.isoformat(),
                "end_date": end_gold.date.isoformat(),
                "final_amount": round(final, 2),
                "total_return_pct": round(total_return, 2),
                "annualized_return_pct": round(cagr, 2),
                "years_held": round(years_held, 2),
                "unit": "NPR per tola",
            })
    except Exception:
        pass

    # --- Silver ---
    try:
        start_silver = db.query(CommodityPrice).filter(
            CommodityPrice.date >= start_date,
            CommodityPrice.silver_price.isnot(None),
        ).order_by(CommodityPrice.date.asc()).first()

        end_silver = db.query(CommodityPrice).filter(
            CommodityPrice.silver_price.isnot(None),
        ).order_by(CommodityPrice.date.desc()).first()

        if start_silver and end_silver and start_silver.silver_price and end_silver.silver_price:
            ratio = end_silver.silver_price / start_silver.silver_price
            final = principal * ratio
            total_return = (ratio - 1) * 100
            cagr = (math.pow(ratio, 1 / years_held) - 1) * 100
            results.append({
                "label": "Silver",
                "icon": "silver",
                "start_value": round(start_silver.silver_price, 2),
                "end_value": round(end_silver.silver_price, 2),
                "start_date": start_silver.date.isoformat(),
                "end_date": end_silver.date.isoformat(),
                "final_amount": round(final, 2),
                "total_return_pct": round(total_return, 2),
                "annualized_return_pct": round(cagr, 2),
                "years_held": round(years_held, 2),
                "unit": "NPR per tola",
            })
    except Exception:
        pass

    # Sort by final_amount descending
    results.sort(key=lambda x: x["final_amount"], reverse=True)

    # Mark winner
    if results:
        results[0]["is_winner"] = True
        for r in results[1:]:
            r["is_winner"] = False

    return results


# -------------------------------------------------------
# AI Context String
# -------------------------------------------------------

def build_macro_context_string(db: Session) -> str:
    """
    Returns a plain-English paragraph summarizing the latest macro state,
    suitable for prepending to an AI prompt. Returns empty string if no data.
    """
    snapshot = get_latest_macro_snapshot(db)
    if not snapshot.get("available"):
        return ""

    ind = snapshot.get("indicators", {})
    regime = snapshot.get("regime", {})
    derived = snapshot.get("derived", {})
    period = snapshot.get("period_label", "Unknown period")

    parts = [f"Macro context ({period}): {regime.get('label', 'Unknown')} regime."]

    if ind.get("base_rate") is not None:
        parts.append(f"Base rate {ind['base_rate']}%.")
    if ind.get("lending_rate") is not None:
        parts.append(f"Lending rate {ind['lending_rate']}%.")
    if ind.get("deposit_rate") is not None:
        parts.append(f"Deposit rate {ind['deposit_rate']}%.")
    if ind.get("cpi_yoy") is not None:
        parts.append(f"CPI {ind['cpi_yoy']}%.")
    if derived.get("real_deposit_return") is not None:
        parts.append(f"Real deposit return {derived['real_deposit_return']}%.")
    if ind.get("m2_growth") is not None:
        parts.append(f"M2 growth {ind['m2_growth']}%.")
    if ind.get("remittance_inflow") is not None:
        parts.append(f"Remittances Rs.{ind['remittance_inflow']}B.")

    return " ".join(parts)
