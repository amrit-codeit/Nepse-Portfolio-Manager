"""
Sector-specific financial analysis logic for NEPSE.
"""
import math

def calculate_graham_number(eps: float, bvps: float) -> float | None:
    """
    Graham's Number = sqrt(22.5 * EPS * Book Value Per Share)
    Only valid if EPS and BVPS are positive.
    """
    if eps is None or bvps is None or eps <= 0 or bvps <= 0:
        return None
    val = 22.5 * eps * bvps
    return round(math.sqrt(val), 3)

def is_overvalued(ltp: float, graham_number: float | None) -> bool:
    if ltp is None or graham_number is None:
        return False
    return ltp > graham_number

def analyze_sector_risk(sector: str, overview_data: dict, quarterly_data: list) -> bool:
    """
    Implements sector-specific risk logic.
    Returns True if fundamental risk is detected.
    """
    if not sector:
        return False
    
    # 1. Commercial/Dev Banks & Finance
    is_bank = any(x in sector.lower() for x in ["bank", "finance"])
    if is_bank:
        # Check latest quarterly report
        if not quarterly_data:
            return False
        
        latest = quarterly_data[0]
        metrics = latest.get("sector_metrics", {})
        
        # NPL > 4%
        npl = metrics.get("Non Performing Loan (NPL)")
        if isinstance(npl, str) and "%" in npl:
            npl = float(npl.replace("%", ""))
        elif npl is None:
            npl = 0
            
        # CAR < 11%
        car = metrics.get("Capital Adequacy Ratio (CAR)")
        if isinstance(car, str) and "%" in car:
            car = float(car.replace("%", ""))
        elif car is None:
            car = 12 # Default safe if missing? Or risk if missing?
            
        # distributable_profit < 0
        dp = metrics.get("Distributable Profit")
        if isinstance(dp, str):
            dp = float(dp.replace(",", ""))
        elif dp is None:
            dp = 0
            
        if npl > 4 or car < 11 or dp < 0:
            return True
            
    # 2. Hydropower
    elif "hydro" in sector.lower():
        if not quarterly_data:
            return False
            
        latest = quarterly_data[0]
        metrics = latest.get("sector_metrics", {})
        
        # reserve_to_equity_ratio < 0
        # This is often calculated as Reserves / Paid Up Capital
        reserves = metrics.get("Reserves and Surplus") or metrics.get("Reserve and Surplus")
        if isinstance(reserves, str):
            reserves = float(reserves.replace(",", ""))
        elif reserves is None:
            reserves = 0
            
        if reserves < 0:
            return True
            
        # net_profit_growth < -20% (Compare latest to previous or same q last year)
        if len(quarterly_data) >= 2:
            current_profit = latest.get("net_profit") or 0
            prev_profit = quarterly_data[1].get("net_profit") or 0
            if prev_profit > 0:
                growth = ((current_profit - prev_profit) / prev_profit) * 100
                if growth < -20:
                    return True

    # 3. Insurance (Life/Non-Life)
    elif "insurance" in sector.lower():
        if not quarterly_data:
            return False
            
        latest = quarterly_data[0]
        metrics = latest.get("sector_metrics", {})
        
        # solvency_ratio < 1.5
        solvency = metrics.get("Solvency Ratio")
        if isinstance(solvency, (int, float)) and solvency < 1.5:
            return True
            
        # Claim Ratio > 90% (Net Claim / Net Premium)
        net_claim = metrics.get("Net Claim Payment")
        net_premium = metrics.get("Net Premium")
        if isinstance(net_claim, (int, float)) and isinstance(net_premium, (int, float)) and net_premium > 0:
            if (net_claim / net_premium) > 0.9:
                return True

        # net_premium declining for 2 consecutive quarters
        if len(quarterly_data) >= 3:
            p1 = latest.get("sector_metrics", {}).get("Net Premium")
            p2 = quarterly_data[1].get("sector_metrics", {}).get("Net Premium")
            p3 = quarterly_data[2].get("sector_metrics", {}).get("Net Premium")
            
            # Helper to parse premium string
            def _p(val):
                if isinstance(val, str): return float(val.replace(",", ""))
                return val or 0
                
            if _p(p1) < _p(p2) and _p(p2) < _p(p3):
                return True

    # 4. Manufacturing & Processing
    elif any(x in sector.lower() for x in ["manufacturing", "processing"]):
        if not quarterly_data:
            return False

        latest = quarterly_data[0]
        metrics = latest.get("sector_metrics", {})

        # Current Ratio < 1.0 (liquidity risk)
        current_assets = metrics.get("Current Assets")
        current_liabilities = metrics.get("Current Liabilities")
        if isinstance(current_assets, (int, float)) and isinstance(current_liabilities, (int, float)):
            if current_liabilities > 0 and (current_assets / current_liabilities) < 1.0:
                return True

        # Gross Margin < 10% (thin margins)
        revenue = metrics.get("Revenue") or metrics.get("Revenue from Operation")
        gross_profit = metrics.get("Gross Profit")
        if isinstance(revenue, (int, float)) and isinstance(gross_profit, (int, float)) and revenue > 0:
            if (gross_profit / revenue) < 0.10:
                return True

    # 5. Investment Companies
    elif "investment" in sector.lower():
        if not quarterly_data:
            return False

        latest = quarterly_data[0]
        metrics = latest.get("sector_metrics", {})

        # Negative reserves
        reserves = metrics.get("Reserve and Surplus") or metrics.get("Reserves and Surplus") or metrics.get("Reserves")
        if isinstance(reserves, (int, float)) and reserves < 0:
            return True

        # Declining revenue over 2 quarters
        if len(quarterly_data) >= 2:
            rev_curr = metrics.get("Total Revenue") or metrics.get("Revenue from Contract with Customers")
            rev_prev = (quarterly_data[1].get("sector_metrics", {}).get("Total Revenue")
                       or quarterly_data[1].get("sector_metrics", {}).get("Revenue from Contract with Customers"))
            if isinstance(rev_curr, (int, float)) and isinstance(rev_prev, (int, float)) and rev_prev > 0:
                if ((rev_curr - rev_prev) / rev_prev) < -0.20:
                    return True

    # 6. Hotels, Tourism, Tradings, Others
    elif any(x in sector.lower() for x in ["hotel", "tourism", "trading", "other"]):
        if not quarterly_data:
            return False

        latest = quarterly_data[0]
        metrics = latest.get("sector_metrics", {})

        # Operating losses
        op_profit = metrics.get("Operating Profit") or metrics.get("Total Operating Profit")
        if isinstance(op_profit, (int, float)) and op_profit < 0:
            return True

        # Negative reserves
        reserves = metrics.get("Reserve and Surplus") or metrics.get("Reserves and Surplus")
        if isinstance(reserves, (int, float)) and reserves < 0:
            return True

    return False
