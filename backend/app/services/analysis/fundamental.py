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

    return False
