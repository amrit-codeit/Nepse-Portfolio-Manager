"""
Technical analysis calculation helpers.
"""
def is_technical_downtrend(ltp: float, sma_200: float | None) -> bool:
    if ltp is None or sma_200 is None:
        return False
    return ltp < sma_200
