"""
Fundamental data scraper for NEPSE stocks via Nepsealpha.
Uses curl_cffi with Chrome impersonation to bypass Cloudflare.
Extracts TTM overview data and sector-specific quarterly financials.
"""
import re
import json
import logging
import asyncio
from datetime import datetime, timezone
from typing import Dict, Any
from bs4 import BeautifulSoup
from curl_cffi import requests
from sqlalchemy.orm import Session
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from app.models.fundamental import StockOverview, FundamentalReport, QuarterlyGrowth

logger = logging.getLogger(__name__)


def _clean_value(val_str: str) -> Any:
    """Clean a scraped cell value: strip commas/%, handle dashes, convert to float."""
    if not val_str:
        return None
    v = val_str.strip().replace(',', '').replace('%', '')
    if v in ('-', '', 'na', 'NA', 'N/A'):
        return None
    try:
        return float(v)
    except ValueError:
        return val_str


def _safe_float(val) -> float | None:
    """Safely convert a value to float."""
    if val is None:
        return None
    try:
        return float(val)
    except (ValueError, TypeError):
        return None


async def scrape_fundamentals(symbol: str, db: Session):
    """
    Scrape fundamental data for a NEPSE symbol.
    1. Fetches the stock page to extract TTM/overview data from Inertia props.
    2. Fetches AJAX financials table for quarterly data.
    3. Upserts both into the database.
    """
    logger.info(f"Starting fundamental scraping for {symbol}")
    session = requests.Session(impersonate="chrome")

    # ── Step 1: Fetch stock page & extract Inertia props ──
    stock_url = f"https://nepsealpha.com/search?q={symbol}"
    try:
        response = session.get(stock_url, allow_redirects=True, timeout=15)
        response.raise_for_status()
    except Exception as e:
        logger.error(f"Failed to fetch {stock_url}: {e}")
        return

    soup = BeautifulSoup(response.text, 'html.parser')
    app_div = soup.find('div', id='nepse_app_content')

    if not app_div or not app_div.has_attr('data-page'):
        logger.error(f"Could not find Inertia data-page div for {symbol}")
        return

    page_data = json.loads(app_div['data-page'])
    props = page_data.get('props', {})

    # Verify the page actually loaded the correct symbol
    page_symbol = props.get('symbol', '')
    if page_symbol.upper() != symbol.upper():
        logger.warning(f"Page symbol '{page_symbol}' doesn't match requested '{symbol}'. "
                       f"Search may have returned a different stock.")

    # ── Step 2: Extract TTM data from props ──
    funda = props.get('funda_table', {})
    master = props.get('masterData', {})

    pe_ratio = _safe_float(funda.get('pe_ratio'))
    pb_ratio = _safe_float(funda.get('pb_ratio'))
    roe_ttm = _safe_float(funda.get('roe'))
    eps_ttm = _safe_float(master.get('eps'))
    book_value = _safe_float(master.get('book_value'))

    # Net profit TTM: try to find from quartesGrowths
    net_profit_ttm = None
    for item in props.get('quartesGrowths', []):
        if item.get('particulars') == 'net_profit_till_qtr':
            net_profit_ttm = _safe_float(item.get('value'))
            break

    # UPSERT StockOverview
    stmt = sqlite_insert(StockOverview).values(
        symbol=symbol.upper(),
        pe_ratio=pe_ratio,
        pb_ratio=pb_ratio,
        roe_ttm=roe_ttm,
        net_profit_ttm=net_profit_ttm,
        eps_ttm=eps_ttm,
        book_value=book_value,
    )
    stmt = stmt.on_conflict_do_update(
        index_elements=['symbol'],
        set_={
            'pe_ratio': stmt.excluded.pe_ratio,
            'pb_ratio': stmt.excluded.pb_ratio,
            'roe_ttm': stmt.excluded.roe_ttm,
            'net_profit_ttm': stmt.excluded.net_profit_ttm,
            'eps_ttm': stmt.excluded.eps_ttm,
            'book_value': stmt.excluded.book_value,
        }
    )
    db.execute(stmt)
    db.commit()
    logger.info(f"Saved StockOverview for {symbol}: PE={pe_ratio}, EPS={eps_ttm}")

    # ── Step 2.5: Extract Quarterly Growths (props.quartesGrowths) ──
    growths = props.get('quartesGrowths', [])
    if growths:
        growth_batch = []
        for g in growths:
            growth_batch.append({
                "symbol": symbol.upper(),
                "particulars": g.get('particulars'),
                "fiscal_year": g.get('fiscal_year'),
                "quarter": g.get('quarter'),
                "value": _safe_float(g.get('value')),
                "financial_date": g.get('financial_date')
            })
        
        if growth_batch:
            gs = sqlite_insert(QuarterlyGrowth).values(growth_batch)
            gs = gs.on_conflict_do_update(
                index_elements=['symbol', 'particulars', 'fiscal_year', 'quarter'],
                set_={
                    'value': gs.excluded.value,
                    'financial_date': gs.excluded.financial_date,
                    'updated_at': datetime.now(timezone.utc)
                }
            )
            db.execute(gs)
            db.commit()
            logger.info(f"Saved {len(growth_batch)} quarterly growth records for {symbol}")

    # ── Step 3: Fetch AJAX quarterly financials (no fsk needed) ──
    ajax_url = f"https://nepsealpha.com/ajax/financials-menu/{symbol}"
    headers = {
        "X-Requested-With": "XMLHttpRequest",
        "Accept": "application/json",
        "Referer": stock_url,
    }

    try:
        ajax_resp = session.get(ajax_url, headers=headers, timeout=15)
        ajax_resp.raise_for_status()
        ajax_data = ajax_resp.json()
    except Exception as e:
        logger.error(f"Failed to fetch quarterly financials for {symbol}: {e}")
        await asyncio.sleep(3)
        return

    table_html = ajax_data.get("html", "")
    if not table_html:
        logger.warning(f"No HTML table in AJAX response for {symbol}")
        await asyncio.sleep(3)
        return

    # ── Step 4: Parse & transpose the HTML table ──
    q_soup = BeautifulSoup(table_html, 'html.parser')
    # Find ALL tables — there may be multiple financial tables
    tables = q_soup.find_all('table')

    quarter_data: Dict[str, Dict[str, Any]] = {}

    for table in tables:
        thead = table.find('thead')
        tbody = table.find('tbody')
        if not thead or not tbody:
            continue

        # The thead has 2 rows:
        #   Row 0: Fiscal year selector (skip)
        #   Row 1: ['Particular', 'YoY Growth', 'Q1', 'Q2', ..., 'Chart']
        header_rows = thead.find_all('tr')
        if len(header_rows) < 2:
            continue
        header_row = header_rows[1]
        th_elements = header_row.find_all(['th', 'td'])

        quarters = []
        for i, th in enumerate(th_elements):
            if i >= 2:  # Index 0=Particular, 1=YoY Growth, 2+=quarters
                q_name = th.get_text(strip=True)
                # Skip the trailing 'Chart' column
                if q_name and q_name.lower() != 'chart':
                    quarters.append(q_name)
                    if q_name not in quarter_data:
                        quarter_data[q_name] = {}

        # Parse each row
        for row in tbody.find_all('tr'):
            tds = row.find_all('td')
            if not tds or len(tds) < 3:
                continue

            metric_name = tds[0].get_text(strip=True)
            # Clean metric name: remove trailing notes like "(Rs in '000')"
            metric_clean = re.sub(r"\s*\(.*?\)\s*$", "", metric_name).strip()
            if not metric_clean:
                continue

            for i, quarter_name in enumerate(quarters):
                td_idx = i + 2
                if td_idx < len(tds):
                    raw_val = tds[td_idx].get_text(strip=True)
                    quarter_data[quarter_name][metric_clean] = _clean_value(raw_val)

    # ── Step 5: Save to FundamentalReport ──
    saved_count = 0
    for quarter, metrics in quarter_data.items():
        if not metrics:
            continue

        # Extract standard columns; rest goes to sector_metrics JSON
        paid_up = (metrics.pop('Paid Up Capital', None)
                   or metrics.pop('Paid up Capital', None)
                   or metrics.pop('Share Capital', None))
        net_profit = (metrics.pop('Net Profit', None)
                      or metrics.pop('Net Profit / (Loss)', None)
                      or metrics.pop('Net Profit/Loss', None))

        ins = sqlite_insert(FundamentalReport).values(
            symbol=symbol.upper(),
            quarter=quarter,
            paid_up_capital=_safe_float(paid_up) if paid_up is not None else None,
            net_profit=_safe_float(net_profit) if net_profit is not None else None,
            sector_metrics=metrics,
        )
        ins = ins.on_conflict_do_update(
            index_elements=['symbol', 'quarter'],
            set_={
                'paid_up_capital': ins.excluded.paid_up_capital,
                'net_profit': ins.excluded.net_profit,
                'sector_metrics': ins.excluded.sector_metrics,
            }
        )
        db.execute(ins)
        saved_count += 1

    db.commit()
    logger.info(f"Saved {saved_count} quarterly reports for {symbol}")

    # Rate-limit courtesy
    await asyncio.sleep(3)
