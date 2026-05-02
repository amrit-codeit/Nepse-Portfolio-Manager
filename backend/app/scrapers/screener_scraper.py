import logging
import time
from typing import Dict, Any, List, Optional
from curl_cffi import requests

logger = logging.getLogger(__name__)


class NepseAlphaScreenerScraper:
    """
    Scraper for NepseAlpha's Fundamental Screener API.
    """

    def __init__(self):
        self.base_url = "https://nepsealpha.com"
        self.api_endpoint = f"{self.base_url}/fundamental-screener"
        self.headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'application/json, text/plain, */*',
            'Accept-Language': 'en-US,en;q=0.9',
            'Referer': f'{self.base_url}/screener',
            'X-Requested-With': 'XMLHttpRequest',
        }
        self.technical_api_endpoint = f"{self.base_url}/technical-screener"

    def _parse_float(self, value) -> Optional[float]:
        """Safely parse a value to float."""
        if value is None or value == '' or value == 'N/A':
            return None
        try:
            return float(value)
        except (ValueError, TypeError):
            return None

    def scrape_fundamental_screener(self, filters: Dict[str, Any]) -> List[Dict[str, Any]]:
        """
        Fetch fundamental screener data with specified filters.
        Ensures all base payload keys are sent as empty strings if not provided.
        """
        timestamp = int(time.time() * 1000)
        # Base parameters required by NepseAlpha (must send empty strings if unused)
        params = {
            'fsk': timestamp,
            'pe_ratio': '',
            'pb_ratio': '',
            'peg_ratio': '',
            'roe': '',
            'roa': '',
            'total_dividend_to_ltp': '',
            'ltp': '',
            'graham_num': '',
            'shares_outstnading': '',
            'eps': '',
            'book_value': '',
            'sector': '',
            'yoy_growth': '',
            'd_eqty_min': '',
            'd_eqty_max': '',
            'payout_ratio_min': '',
            'payout_ratio_max': ''
        }

        # Apply user-provided filters (overriding empty strings)
        for key, value in filters.items():
            if value is not None and str(value).strip() != '':
                params[key] = str(value).strip()

        logger.info(f"Fetching screener data with params: {params}")

        try:
            response = requests.get(
                self.api_endpoint,
                headers=self.headers,
                params=params,
                impersonate="chrome",
                timeout=15,
            )

            if response.status_code == 200:
                data = response.json()
                logger.info(f"Found {len(data)} matching stocks")
                return data
            else:
                logger.error(f"NepseAlpha Screener API error: HTTP {response.status_code}")
                return []

        except Exception as e:
            logger.error(f"Scraper request failed: {e}")
            return []

    def process_data(self, raw_data: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Clean and format the raw API data.
        Derives P/E ratio from LTP/EPS since the API doesn't return it directly.
        """
        processed = []
        for stock in raw_data:
            try:
                symbol = stock.get('symbol', '')
                if not symbol:
                    continue

                ltp = self._parse_float(stock.get('ltp'))
                eps = self._parse_float(stock.get('eps'))
                graham = self._parse_float(stock.get('graham_number'))
                discount_raw = self._parse_float(stock.get('discountFromGraham'))
                discount_pct = round(discount_raw * 100, 2) if discount_raw is not None else None

                # Derive P/E locally (LTP / EPS) — same as sample.py
                pe_ratio = None
                if ltp is not None and eps is not None and eps > 0:
                    pe_ratio = round(ltp / eps, 2)

                # Valuation tag based on Graham discount
                valuation = 'N/A'
                if discount_pct is not None:
                    if discount_pct > 10:
                        valuation = 'Undervalued'
                    elif discount_pct < -10:
                        valuation = 'Overvalued'
                    else:
                        valuation = 'Fair Value'

                processed.append({
                    'symbol': symbol,
                    'name': stock.get('full_name', ''),
                    'sector': stock.get('sector', ''),
                    'ltp': ltp,
                    'eps_ttm': eps,
                    'pe_ratio': pe_ratio,
                    'graham_number': graham,
                    'discount_from_graham': discount_pct,
                    'valuation': valuation,
                })

            except (ValueError, TypeError) as e:
                logger.warning(f"Error processing stock {stock.get('symbol')}: {e}")
                continue

        # Sort by discount from Graham (most undervalued first)
        return sorted(processed, key=lambda x: x.get('discount_from_graham') or -9999, reverse=True)

    def scrape_technical_screener(self, filters: Dict[str, Any]) -> List[Dict[str, Any]]:
        """
        Fetch technical screener data with specified filters.
        Ensures all base payload keys are sent as empty strings if not provided.
        """
        timestamp = int(time.time() * 1000)
        params = {
            'fsk': timestamp,
            'rsi': '',
            'rsi_min': '',
            'rsi_max': '',
            'macd': '',
            'sma_200': '',
            'sma_520': '',
            'bollinger_band': '',
            'stochastic_14': '',
            'sma_20': '',
            'sma_50': '',
            'mfi_14': '',
            'ltp': '',
            'beta_3m': '',
            'sector': ''
        }

        for key, value in filters.items():
            if value is not None and str(value).strip() != '':
                params[key] = str(value).strip()

        logger.info(f"Fetching technical screener data with params: {params}")

        try:
            response = requests.get(
                self.technical_api_endpoint,
                headers=self.headers,
                params=params,
                impersonate="chrome",
                timeout=15,
            )

            if response.status_code == 200:
                data = response.json()
                logger.info(f"Found {len(data)} matching stocks in technical screener")
                return data
            else:
                logger.error(f"NepseAlpha Technical Screener API error: HTTP {response.status_code}")
                return []

        except Exception as e:
            logger.error(f"Scraper request failed: {e}")
            return []

    def process_technical_data(self, raw_data: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Clean and format the raw API data from technical screener.
        """
        processed = []
        for stock in raw_data:
            try:
                symbol = stock.get('symbol', '')
                if not symbol:
                    continue

                processed.append({
                    'symbol': symbol,
                    'name': stock.get('full_name', ''),
                    'sector': stock.get('sector', ''),
                    'ltp': self._parse_float(stock.get('ltp')),
                    'rsi_14': self._parse_float(stock.get('rsi_14')),
                    'macd_value': self._parse_float(stock.get('macd_value')),
                    'macd_signal': self._parse_float(stock.get('macd_signal')),
                    'sma_20': self._parse_float(stock.get('sma_20')),
                    'sma_50': self._parse_float(stock.get('sma_50')),
                    'sma_200': self._parse_float(stock.get('sma_200')),
                    'bollinger_upper': self._parse_float(stock.get('bollinger_upper')),
                    'bollinger_lower': self._parse_float(stock.get('bollinger_lower')),
                })

            except (ValueError, TypeError) as e:
                logger.warning(f"Error processing stock {stock.get('symbol')}: {e}")
                continue

        return processed
