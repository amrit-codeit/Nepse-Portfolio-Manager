# NEPSE Trading System — Comprehensive Blueprint
> Version 3.0 | Optimized for practical, publicly available data and actual NEPSE market context.
> Goal: Empower the common user with transparent, top-down technical and fundamental insights to make well-informed, emotion-free trading decisions without mimicking opaque, paid institutional tools.

---

## 1. MARKET CONSTRAINTS (Hard Rules)

| Parameter | Value | Notes |
|---|---|---|
| Exchange | Nepal Stock Exchange (NEPSE) | Sole exchange in Nepal |
| Trading days | Sunday–Thursday | Fri-Sat = weekend |
| Session | 11:00–15:00 NST (UTC+5:45) | 4-hour window only |
| Pre-open | 10:30–10:45 NST | Order collection |
| Settlement | T+2 business days | No same-day resell — violation impossible under MeroShare rules |
| Price band | ±15% of prev close | Always affects risk limits and gaps |
| Short selling | NOT permitted | Structurally impossible under T+2 |
| Intraday trading| NOT permitted | Capital locked min 2 working days post-buy |

---

## 2. TRANSACTION COST MODEL (Dual WACC & True TDS)

The system enforces strict fee accounting to calculate exact break-evens. Theoretical returns mean nothing if fees eat the profit.

### Standard Fees
- **Broker Commission**: 0.36% (≤ Rs. 50k) or 0.33% (> Rs. 50k)
- **SEBON Regulatory Fee**: 0.015% (Equity)
- **DP Charge**: Rs. 25 flat per transaction side
- **Name Transfer**: Rs. 5 flat on Buy only
- **CGT (Capital Gains Tax)**: 7.5% if held < 365 days; 5% if held ≥ 365 days

### Dual WACC & Dividend True TDS
1. **True WACC**: Cash basis accounting. Factors in all purchase fees.
2. **Tax WACC (MeroShare)**: Bases bonus shares strictly at Rs. 100 par.
3. **Dividend True TDS**: Book closure plays must account for the 5% TDS levied on the *Par Value* of both cash and bonus dividends. The UI must aggressively flag when an investor owes out-of-pocket tax for holding through a heavy bonus dividend declaration.

**Impact**: Trades must clear `buy_price + ~0.8% + DP charges / qty` to break even. Profit targets must factor in CGT.

---

## 3. DISCIPLINED TRADING FRAMEWORK (Top-Down Approach)

The core philosophy separates isolation from context. An isolated technical setup is invalid if the broader market (NEPSE Composite or Sector) is highly bearish. 

### 3.1 Capital Allocation
- **Risk per trade**: Max 2% of total capital.
- **Sector cap**: Max 40% in a single sector (e.g., heavily weighting Commercial Banks or Hydropower carries systemic risk).
- **Position cap**: Max 15% of capital per scrip.
- **Drawdown breaker**: If 3 consecutive trades hit Stop Loss, reduce standard position size by 50% until a winning streak is established.

### 3.2 The Conjunction Gates (All Trades Must Pass)
Instead of aspirational/opaque institutional flow metrics, we rely on robust public data.

- **GATE 1 — LIQUIDITY**: Average Daily Turnover (ADT) > Rs. 15 Lakhs. Avoid illiquidity traps.
- **GATE 2 — MARKET CONJUNCTION**: NEPSE composite index must not be in free-fall. Broad market momentum must support the setup (e.g., NEPSE Index above its 50-SMA or forming higher lows).
- **GATE 3 — SECTOR TAILWIND**: Target scrip's sector must have positive Relative Strength (RS) compared to the broader NEPSE index.
- **GATE 4 — FUNDAMENTAL FLOOR**: No extreme red flags (e.g., NPL > 5%, negative Equity/Reserves, consistent losses). (This works when buying stocks fundamentally but for pure trading do not consider this as NEPSE has a history of manipulation and we want to ride this momentum for quick gains. )
- **GATE 5 — TECHNICAL TRIGGER**: A defined actionable setup is present (Reversal, Breakout, Pullback) with volume confirmation.
- **GATE 6 — RISK/REWARD (R:R)**: Estimated dual-target profit distance is ≥ 2× the Stop Loss distance distance (R:R ≥ 2.0).

### 3.3 Dynamic AI Analysis Layer
We utilize AI strictly as a reasoning engine to stitch together the technical and fundamental realities, NOT as a black-box oracle. Our architecture supports 3 tiers to prevent hardware bottlenecking:
1. **Prompt Generator**: Produces raw, highly structured Markdown strings detailing the fundamental facts, technical signals, and index data for the user to interpret directly.
2. **Local AI**: On-device LLMs (DeepSeek-R1, Qwen3:4b) ingest the raw context to summarize risks and formulate a structured insight independently.
3. **Cloud AI**: Fallback/Pro-tier for intensive multi-scrip correlation framing.

---

## 4. ENTRY & DUAL-TARGET EXIT STRATEGY

Because NEPSE operates strictly on T+2 and is highly illiquid, executing complex multi-tiered exits is rarely viable. We use a **Dual-Target** approach.

### Entry Execution
- Avoid market opens (11:00-11:15). Wait for initial volatility to settle.
- Enter on Limit Orders near support bands. 
- *Accumulation*: Split entry into 2 tranches maximum. (e.g. 50% on signal, 50% on next-day confirmation).

### Strict Stop Loss
- Stop Losses are calculated based on Average True Range (ATR) or significant structural daily closes.
- In NEPSE, wicks frequently hunt stops due to thin order books. Use **Closing-Price Stops** (exit if the scrip closes below the stop level).
- Max hard cap: Never risk > 7% capital on a single swing trade.

### Dual-Target Strategy
| Target Level | Action | Rationale |
|---|---|---|
| **Target 1 (T1)** | Sell 50%-60% of position. | Captures intermediate resistance. Secures base profits (R:R > 1.5). Move Stop Loss on remainder to Break-Even. |
| **Target 2 (T2)** | Trail remainder to major resistance / 52W high. | Allows capturing momentum. Exit remaining size when momentum indicators (RSI > 75) flatten or reverse. |

---

## 5. TRADING SCENARIOS / SETUPS

### S1: Structural Breakout (Volume Confirmed)
- **Condition**: Price consolidates in a tight range (Base) for >15 days.
- **Action**: Buy on the breakout day closing near the highs, where Trade Volume > 2x the 20-Day Average Volume (ADV).
- **Why**: Indicates strong buying pressure overcoming selling supply. Broad public data validates the breakout.

### S2: Sector-Aligned Pullback (Trend Continuation)
- **Condition**: Sector index is trending up. Scrip is above 200-SMA. Scrip pulls back to touch 20-EMA / 50-SMA with low volume daily candles.
- **Action**: Enter near the moving average upon seeing a bullish reversal candle.
- **Why**: Capitalizes on the primary trend while minimizing risk (stop loss placed right below the MA).

### S3: Mean Reversion (Deep Oversold)
- **Condition**: Broad market panic without company-specific fundamental damage. RSI drops below 30. Price hits lower Bollinger Band.
- **Action**: Buy after first green daily candle closes.
- **Target**: Very short-term. T1 is the 20-EMA. Close the entire position quickly (no T2 trailing).

### S4: Dividend Yield / Book Closure Play
- **Condition**: Scrip announces lucrative dividend (High Cash + Bonus) with yield > 5%. 
- **Action**: Enter 7 to 10 days before Book Closure Date.
- **Exit Logic**: Either sell T-1 to capture the pre-book closure rally, or hold through if the post-book closure gap is functionally offset by the true value of the bonus considering Tax WACC metrics.

---

## 6. SYSTEM FEATURES LIST

Aligned directly with the available and maintainable tech stack.

### 6.1 Data Pipeline (Public Sources, Anti-Scrape Aware)
- **Live Prices & Indices**: ShareSansar parsing via headless Selenium / `curl_cffi` routing to avoid IP blocks. (No need to change this as current method works)
- **Fundamentals**: NepseAlpha parsing for historical EPS, NPL, CAR, Reserves, and ROE.
- **Corporate Actions**: Dividend scrapers for history tracking. 
- *Note: nepalstock.com is excluded from active scraping requirements to respect their extreme anti-bot capabilities and ensure system stability.*

### 6.2 Technical Analysis Engine
- **Moving Averages**: 20-EMA, 50-SMA, 200-SMA (Golden/Death Crosses).
- **Oscillators**: RSI(14) for overbought/oversold, MACD for momentum shifts.
- **Volatility**: Bollinger Bands (20,2), ATR(14) for Stop Loss distance calculation.
- **Market Conjuncture**: NEPSE Composite SMA/RSI alignment tracked centrally and injected into every standalone stock analysis. 

### 6.3 Fundamental Analysis & Valuation
- **Graham's Number**: `√(22.5 × EPS × BVPS)` vs LTP discount/premium gap.
- **Sector Sub-Scores**: 
  - *Banks*: Core Capital (CAR), NPL%.
  - *Hydros*: Reserve/Capital Ratio, Installed Capacity.
  - *Manufacturing/Others*: ROE, Earnings consistency.
- **Dividend True-Yield**: Exact post-tax net yield calculation modeling UI alerts.

### 6.4 Tri-Tier AI Analysis Layer
- **Mode 1**: Transparent markdown generation listing exactly why a stock hits/misses 7-Gates.
- **Mode 2**: Local Ollama execution mapping inputs against established trading personas to reduce cognitive load. 
- **Mode 3**: Support for cloud models when context window size exceeds local VRAM capacity.

### 6.5 Portfolio & Simulator Module
- **Dual WACC Engine**: Calculates precise P&L and CGT.
- **Trade Simulator**: Allows users to plan an Entry -> T1 -> T2 trade and visually assess the real fees and required Nepse movement for profitability.
- **Stock 360 View**: Every scrip sub-page pulls fundamental score, technical indicator status, past trading history, and current portfolio exposure into one unified dashboard. (We already have this one)

---

## 7. TECH STACK (Currently Implemented)

- **Frontend**: React 19, Vite 7, Ant Design 6, Tailwind/Custom CSS, TanStack React Query, Recharts.
- **Backend**: Python 3, FastAPI, SQLAlchemy 2.0.
- **Database**: SQLite (Highly portable, efficient for personal-use tracking). No PostgreSQL overhead.
- **Task Scheduling**: APScheduler + ThreadPool (replaces Celery/Redis).
- **Local AI Bridge**: `ollama-python` library supporting deepseek-r1 / qwen / gemma.
- **Scraping**: Selenium with undetected_chromedriver patterns + BeautifulSoup4.

---

## 8. DATABASE SCHEMA CORE

| Table | Purpose |
|---|---|
| `members` | Multi-user tracking and encrypted MeroShare credentials |
| `transactions` | Immutable log of Buy/Sell/Bonus/IPO/Dividend events |
| `holdings` | Dynamic roll-up of current positions with Dual WACC computed |
| `fee_config` | Versioned history of SEBON/Broker fees |
| `price_history` | OHLCV data per symbol |
| `index_history` | OHLCV data for NEPSE Composite and Sub-indices |
| `dividend_history` | Historical dividend records |
| `fundamental_overview` | Cached quarterly EPS, NPL, CAR, ROE per symbol |
| `live_prices` | Intraday LTP caching |

---

## 9. IMPLEMENTATION PRIORITIES

1. **Robust Technical Engine (In Progress)**: Ensure price_history data cleanly powers RSI, MACD, and SMA formulas natively in the backend API to feed the AI layer.
2. **Market Conjunction Module (Next Phase)**: Ensure single stock views clearly overlay NEPSE Composite direction. A stock breaking out while the market breaks down is a low-probability trade.
3. **Order Simulator (Priority)**: Embed the Risk/Reward calculator with real fee deductions into the UI so users clearly see they need > ~1.2% move to realize profit. 
4. **AI Layer Diversification (Expansion)**: Build the toggle in settings to switch between Local AI, Cloud AI, or "Prompt Only" output.
