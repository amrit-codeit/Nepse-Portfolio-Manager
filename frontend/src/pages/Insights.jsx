import { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import {
    Card, Row, Col, Select, Empty, Spin, Tag, Progress, Descriptions, Tooltip, Divider, Space,
    Button, message, Tabs, Alert, Table, Radio, Typography
} from 'antd';
import {
    SearchOutlined, FundOutlined, LineChartOutlined, BarChartOutlined,
    RiseOutlined, FallOutlined, ExperimentOutlined, InfoCircleOutlined,
    DashboardOutlined, ThunderboltOutlined, StockOutlined, SyncOutlined,
    ArrowUpOutlined, ArrowDownOutlined, DollarOutlined, HistoryOutlined,
    SafetyCertificateOutlined, SwapOutlined, TrophyOutlined, CalendarOutlined,
    BankOutlined, FilterOutlined,
} from '@ant-design/icons';
import {
    getCompanies, getInsights, getDividends, scrapeInsights,
    getMembers, getStockDetail, getSymbolsList, getHistoricalPrices,
    getMarketContext, getExtendedTechnicals
} from '../services/api';
import ExecutiveSummary from '../components/insights/ExecutiveSummary';
import StockScreener from '../components/insights/StockScreener';
import {
    BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer,
    CartesianGrid, Legend, PieChart, Pie, Cell, ComposedChart, Line, Area,
} from 'recharts';

const { Text } = Typography;

// ============================================================================
// Helpers
// ============================================================================
function formatNPR(value, decimals = 2) {
    if (value === null || value === undefined) return '—';
    return `Rs. ${Number(value).toLocaleString('en-IN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
}
const PCT = (val) => val == null ? '—' : `${Number(val).toFixed(2)}%`;
const QTY = (val) => val == null ? '—' : Number(val).toLocaleString('en-NP');
const pnlColor = (val) => {
    if (val == null || val === 0) return 'var(--text-secondary)';
    return val > 0 ? 'var(--accent-green)' : 'var(--accent-red)';
};

function getRSIColor(rsi) {
    if (rsi >= 70) return '#d63031';
    if (rsi >= 60) return '#e17055';
    if (rsi >= 40) return '#00b894';
    if (rsi >= 30) return '#0984e3';
    return '#6c5ce7';
}

function getRSILabel(rsi) {
    if (rsi >= 70) return 'Overbought';
    if (rsi >= 60) return 'Approaching Overbought';
    if (rsi >= 40) return 'Neutral';
    if (rsi >= 30) return 'Approaching Oversold';
    return 'Oversold';
}

const PIE_COLORS = ['#818cf8', '#34d399', '#fbbf24', '#f87171', '#38bdf8', '#a78bfa'];

const GROWTH_METRIC_LABELS = {
    'roe_ttm': 'ROE (TTM)', 'roa_ttm': 'ROA (TTM)', 'eps_ttm': 'EPS (TTM)',
    'eps_yoy_growth': 'EPS YoY %', 'bvps': 'Book Value Per Share',
    'bvps_yoy_growth': 'BVPS YoY %', 'net_profit_ttm': 'Net Profit (TTM)',
    'net_profit_till_qtr': 'Net Profit (Qtr)', 'netprofitttmqtrl_yoy_growth': 'Net Profit TTM YoY %',
    'netprofitqtrly_yoy_growth': 'Net Profit Qtr YoY %', 'revenue_ttm': 'Revenue (TTM)',
    'revenue_till_qtr': 'Revenue (Qtr)', 'revenuettm_yoy_growth': 'Revenue TTM YoY %',
    'revenuetillqtr_yoy_growth': 'Revenue Qtr YoY %', 'net_margin_ttm': 'Net Margin (TTM)',
    'asset_turnover_ttm': 'Asset Turnover (TTM)',
};

// ============================================================================
// PriceHistoryCard (ported from ScripDetail)
// ============================================================================
function PriceHistoryCard({ symbol, transactions }) {
    const [timeRange, setTimeRange] = useState('6M');

    const { data: priceRaw, isLoading } = useQuery({
        queryKey: ['historicalPrices', symbol],
        queryFn: () => getHistoricalPrices({ symbol }).then(r => r.data),
        enabled: !!symbol,
    });

    const chartData = useMemo(() => {
        if (!priceRaw || priceRaw.length === 0) return [];
        let data = [...priceRaw].reverse();
        if (timeRange !== 'ALL') {
            const cutoff = new Date();
            if (timeRange === '1M') cutoff.setMonth(cutoff.getMonth() - 1);
            else if (timeRange === '3M') cutoff.setMonth(cutoff.getMonth() - 3);
            else if (timeRange === '6M') cutoff.setMonth(cutoff.getMonth() - 6);
            else if (timeRange === '1Y') cutoff.setFullYear(cutoff.getFullYear() - 1);
            data = data.filter(d => new Date(d.date) >= cutoff);
        }
        const txnsByDate = {};
        (transactions || []).forEach(t => {
            if (!t.txn_date) return;
            const txnDate = t.txn_date.split('T')[0];
            if (!txnsByDate[txnDate]) txnsByDate[txnDate] = { buys: false, sells: false };
            const type = t.txn_type;
            if (['BUY', 'IPO', 'FPO', 'RIGHT', 'AUCTION', 'TRANSFER_IN'].includes(type)) txnsByDate[txnDate].buys = true;
            else if (['SELL', 'TRANSFER_OUT'].includes(type)) txnsByDate[txnDate].sells = true;
        });
        return data.map(d => {
            let isBuy = false, isSell = false;
            if (d.date) {
                const dDate = d.date.split('T')[0];
                if (txnsByDate[dDate]) { isBuy = txnsByDate[dDate].buys; isSell = txnsByDate[dDate].sells; }
            }
            return {
                ...d,
                displayDate: new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' }),
                buyMarker: isBuy ? d.close : null,
                sellMarker: isSell ? d.close : null,
            };
        });
    }, [priceRaw, timeRange, transactions]);

    const domain = useMemo(() => {
        if (!chartData.length) return ['dataMin', 'dataMax'];
        const min = Math.min(...chartData.map(d => d.close));
        const max = Math.max(...chartData.map(d => d.close));
        const padding = (max - min) * 0.1;
        return [Math.max(0, min - padding), max + padding];
    }, [chartData]);

    return (
        <Card
            size="small"
            title={`Price History — ${symbol}`}
            extra={
                <Radio.Group value={timeRange} onChange={(e) => setTimeRange(e.target.value)} optionType="button" buttonStyle="solid" size="small">
                    <Radio.Button value="1M">1M</Radio.Button>
                    <Radio.Button value="3M">3M</Radio.Button>
                    <Radio.Button value="6M">6M</Radio.Button>
                    <Radio.Button value="1Y">1Y</Radio.Button>
                    <Radio.Button value="ALL">ALL</Radio.Button>
                </Radio.Group>
            }
        >
            {isLoading ? (
                <div style={{ textAlign: 'center', padding: '60px 0' }}><Spin /></div>
            ) : chartData.length === 0 ? (
                <Empty description="No price data found for the selected period" />
            ) : (
                <div style={{ padding: '10px 0' }}>
                    <ResponsiveContainer width="100%" height={400}>
                        <ComposedChart data={chartData} margin={{ top: 10, right: 10, bottom: 0, left: 0 }}>
                            <defs>
                                <linearGradient id="colorClose" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.3}/>
                                    <stop offset="95%" stopColor="#38bdf8" stopOpacity={0}/>
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" vertical={false} />
                            <XAxis dataKey="displayDate" tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} tickMargin={10} minTickGap={30} />
                            <YAxis domain={domain} tickFormatter={(val) => `Rs ${val.toFixed(0)}`} tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} width={60} />
                            <RechartsTooltip
                                contentStyle={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 8, fontSize: 12 }}
                                labelStyle={{ color: 'var(--text-secondary)', marginBottom: 8 }}
                                itemStyle={{ color: 'var(--text-primary)' }}
                            />
                            <Area type="monotone" dataKey="close" name="LTP" stroke="#38bdf8" strokeWidth={2} fillOpacity={1} fill="url(#colorClose)" isAnimationActive={false} />
                            <Line type="monotone" dataKey="buyMarker" name="Buy/In" stroke="none" connectNulls={true} dot={{ r: 5, fill: '#10b981', stroke: '#047857', strokeWidth: 2 }} activeDot={{ r: 7 }} isAnimationActive={false} />
                            <Line type="monotone" dataKey="sellMarker" name="Sell/Out" stroke="none" connectNulls={true} dot={{ r: 5, fill: '#ef4444', stroke: '#b91c1c', strokeWidth: 2 }} activeDot={{ r: 7 }} isAnimationActive={false} />
                        </ComposedChart>
                    </ResponsiveContainer>
                    <div style={{ textAlign: 'center', marginTop: 12, fontSize: 12, color: 'var(--text-secondary)' }}>
                        <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#10b981', marginRight: 6 }}></span> Buy / Transfer In
                        <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#ef4444', marginLeft: 16, marginRight: 6 }}></span> Sell / Transfer Out
                    </div>
                </div>
            )}
        </Card>
    );
}

// ============================================================================
// Stock360View — The unified detail view
// ============================================================================
function Stock360View({ selectedSymbol, companies }) {
    const queryClient = useQueryClient();

    // Technical + Fundamental data (existing Insights API)
    const { data: insightsData, isLoading: loadingInsights, isFetching: fetchingInsights, refetch: refetchInsights } = useQuery({
        queryKey: ['insights', selectedSymbol],
        queryFn: () => getInsights(selectedSymbol).then(r => r.data),
        enabled: !!selectedSymbol,
    });

    // Dividend History
    const { data: allDividends, isLoading: loadingDividends } = useQuery({
        queryKey: ['dividends-history', selectedSymbol],
        queryFn: () => getDividends({ symbol: selectedSymbol }).then(r => r.data),
        enabled: !!selectedSymbol,
    });

    // Portfolio context — stock detail for logged-in portfolio
    const { data: portfolioDetail, isLoading: detailLoading } = useQuery({
        queryKey: ['stockDetail', selectedSymbol, {}],
        queryFn: () => getStockDetail(selectedSymbol, {}).then(r => r.data),
        enabled: !!selectedSymbol,
    });

    // Market Context (Conjunction System)
    const { data: marketContext } = useQuery({
        queryKey: ['marketContext'],
        queryFn: () => getMarketContext().then(r => r.data),
    });

    // Extended Technicals (Trading Gates, ATR, Pivots)
    const { data: extTech } = useQuery({
        queryKey: ['extendedTechnicals', selectedSymbol],
        queryFn: () => getExtendedTechnicals(selectedSymbol).then(r => r.data),
        enabled: !!selectedSymbol,
    });

    // Scrape mutation
    const scrapeInsightsMut = useMutation({
        mutationFn: () => scrapeInsights(selectedSymbol),
        onSuccess: () => {
            message.success(`Successfully fetched latest data for ${selectedSymbol}`);
            refetchInsights();
            queryClient.invalidateQueries(['dividends-history', selectedSymbol]);
            queryClient.invalidateQueries(['stockDetail', selectedSymbol]);
        },
        onError: (err) => message.error(err.response?.data?.error || 'Failed to fetch latest data.'),
    });

    const tech = insightsData?.technicals;
    const fund = insightsData?.fundamentals;
    const detail = portfolioDetail;
    const hasPortfolioData = detail && detail.current_qty > 0;

    const scriptHistoryData = useMemo(() => {
        if (!selectedSymbol || !allDividends) return [];
        const uniqueFy = new Map();
        [...allDividends].sort((a, b) => new Date(a.book_close_date) - new Date(b.book_close_date)).forEach(d => {
            if (!uniqueFy.has(d.fiscal_year)) {
                uniqueFy.set(d.fiscal_year, { fy: d.fiscal_year, cashPercent: d.cash_dividend_percent || 0, bonusPercent: d.bonus_dividend_percent || 0 });
            }
        });
        return Array.from(uniqueFy.values());
    }, [selectedSymbol, allDividends]);

    const processedGrowths = useMemo(() => {
        if (!fund?.growths || fund.growths.length === 0) return null;
        const particularsMap = {};
        const periods = new Set();
        fund.growths.forEach(g => {
            const period = `${g.fiscal_year} Q${g.quarter}`;
            periods.add(period);
            if (!particularsMap[g.particulars]) particularsMap[g.particulars] = {};
            particularsMap[g.particulars][period] = g.value;
        });
        const sortedPeriods = Array.from(periods).sort((a, b) => b.localeCompare(a)).slice(0, 5);
        return { metrics: Object.keys(particularsMap), periods: sortedPeriods, values: particularsMap };
    }, [fund]);

    // Quantity Pie Data (from portfolio detail)
    const qtyPieData = useMemo(() => {
        if (!detail?.qty_breakdown) return [];
        const b = detail.qty_breakdown;
        const data = [];
        if (b.total_ipo > 0) data.push({ name: 'IPO/FPO', value: b.total_ipo });
        if (b.total_bought > 0) data.push({ name: 'Secondary Buy', value: b.total_bought });
        if (b.total_right > 0) data.push({ name: 'Right Shares', value: b.total_right });
        if (b.total_bonus > 0) data.push({ name: 'Bonus', value: b.total_bonus });
        if (b.total_transferred_in > 0) data.push({ name: 'Transferred In', value: b.total_transferred_in });
        if (b.total_sold > 0) data.push({ name: 'Sold', value: b.total_sold });
        if (b.total_transferred_out > 0) data.push({ name: 'Transferred Out', value: b.total_transferred_out });
        return data;
    }, [detail]);

    // Dividend chart data from portfolio detail
    const divChartData = useMemo(() => {
        if (!detail?.dividend_history?.length) return [];
        return [...detail.dividend_history].reverse().map(d => ({ fy: d.fiscal_year, cash: d.cash_pct, bonus: d.bonus_pct, amount: d.cash_amount }));
    }, [detail]);

    // Transaction table columns (from ScripDetail)
    const txnColumns = [
        { title: 'Date', dataIndex: 'txn_date', width: 110, render: v => v || '—' },
        {
            title: 'Type', dataIndex: 'txn_type', width: 100,
            render: v => {
                const colors = { BUY: 'blue', SELL: 'red', IPO: 'purple', BONUS: 'green', RIGHT: 'cyan', DIVIDEND: 'gold', FPO: 'purple', TRANSFER_IN: 'geekblue', TRANSFER_OUT: 'volcano', AUCTION: 'magenta', MERGE: 'lime', DEMERGE: 'orange' };
                return <Tag color={colors[v] || 'default'}>{v}</Tag>;
            },
        },
        { title: 'Qty', dataIndex: 'quantity', width: 80, align: 'right', render: v => QTY(v) },
        { title: 'Rate', dataIndex: 'rate', width: 100, align: 'right', render: v => v ? formatNPR(v) : '—' },
        { title: 'Amount', dataIndex: 'amount', width: 120, align: 'right', render: v => v ? formatNPR(v) : '—' },
        {
            title: 'Fees', width: 100, align: 'right',
            render: (_, r) => {
                const fees = (r.broker_commission || 0) + (r.sebon_fee || 0) + (r.dp_charge || 0) + (r.cgt || 0);
                return fees > 0 ? (
                    <Tooltip title={`Broker: ${formatNPR(r.broker_commission)} | SEBON: ${formatNPR(r.sebon_fee)} | DP: ${formatNPR(r.dp_charge)} | CGT: ${formatNPR(r.cgt)}`}>
                        <span style={{ color: 'var(--accent-yellow)', cursor: 'help' }}>{formatNPR(fees)}</span>
                    </Tooltip>
                ) : '—';
            },
        },
        { title: 'Net Cost', dataIndex: 'total_cost', width: 120, align: 'right', render: v => v ? formatNPR(v) : '—' },
        { title: 'WACC', dataIndex: 'wacc', width: 100, align: 'right', render: v => v ? formatNPR(v) : '—' },
        { title: 'Source', dataIndex: 'source', width: 90, render: v => <Tag>{v || 'MANUAL'}</Tag> },
    ];

    if (!selectedSymbol) {
        return (
            <div style={{ textAlign: 'center', padding: '80px 0' }}>
                <Empty description={<span style={{ color: 'var(--text-secondary)', fontSize: 15 }}>Select a stock from the Screener tab or search above to view its complete analysis</span>} />
            </div>
        );
    }

    const companyInfo = companies?.find(c => c.symbol === selectedSymbol);

    // Inner tabs for the 360 view
    const innerTabItems = [
        {
            key: 'summary',
            label: <span><ExperimentOutlined /> Executive Summary</span>,
            children: <ExecutiveSummary symbol={selectedSymbol} />,
        },
        {
            key: 'technical',
            label: <span><LineChartOutlined /> Technical & Charts</span>,
            children: (loadingInsights || fetchingInsights) ? (
                <div style={{ textAlign: 'center', padding: '80px 0' }}><Spin size="large" tip="Crunching technicals..." /></div>
            ) : insightsData?.error ? (
                <Card className="stat-card" style={{ textAlign: 'center', padding: '40px 20px' }}>
                    <p style={{ fontSize: 16, fontWeight: 600 }}>{insightsData.error}</p>
                    <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Sync historical prices first.</p>
                </Card>
            ) : (
                <div className="animate-in">
                    {/* Price Chart from portfolio — shows buy/sell dots */}
                    <div style={{ marginBottom: 24 }}>
                        <PriceHistoryCard symbol={selectedSymbol} transactions={detail?.transactions} />
                    </div>

                    <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
                        {/* 52-Week Range */}
                        <Col xs={24} lg={12}>
                            <div className="stat-card" style={{ padding: '20px 24px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                                    <div className="stat-label"><BarChartOutlined /> 52-Week Range</div>
                                </div>
                                <div style={{ marginBottom: 8 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>
                                        <span>Low: {tech ? formatNPR(tech.low_52w) : '—'}</span>
                                        <span>High: {tech ? formatNPR(tech.high_52w) : '—'}</span>
                                    </div>
                                    <Progress percent={tech?.placement_52w || 0} showInfo={false}
                                        strokeColor={{ '0%': '#d63031', '30%': '#fdcb6e', '60%': '#00b894', '100%': '#00b894' }}
                                        trailColor="rgba(255,255,255,0.06)" size={['100%', 16]} />
                                    <div style={{ textAlign: 'center', fontSize: 13, marginTop: 6, fontWeight: 600 }}>
                                        LTP at {tech?.placement_52w?.toFixed(1) || 0}% of 52-week range
                                    </div>
                                </div>
                            </div>
                        </Col>
                        {/* RSI */}
                        <Col xs={24} lg={12}>
                            <div className="stat-card" style={{ padding: '20px 24px' }}>
                                <div className="stat-label" style={{ marginBottom: 16 }}><DashboardOutlined /> RSI (14)</div>
                                {tech?.rsi_14 ? (
                                    <div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                                            <div style={{ fontSize: 36, fontWeight: 700, color: getRSIColor(tech.rsi_14) }}>{tech.rsi_14.toFixed(1)}</div>
                                            <div>
                                                <Tag color={tech.rsi_14 >= 70 ? 'red' : tech.rsi_14 <= 30 ? 'green' : 'blue'} style={{ fontSize: 13 }}>{getRSILabel(tech.rsi_14)}</Tag>
                                                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 6 }}>
                                                    {tech.rsi_14 >= 70 ? 'Stock may be overbought. Consider caution.' : tech.rsi_14 <= 30 ? 'Stock may be oversold. Potential buying opportunity.' : 'RSI is in neutral territory.'}
                                                </div>
                                            </div>
                                        </div>
                                        <Progress percent={tech.rsi_14} showInfo={false} strokeColor={getRSIColor(tech.rsi_14)} trailColor="rgba(255,255,255,0.06)" style={{ marginTop: 12 }} />
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                                            <span>Oversold (0)</span><span>Neutral (50)</span><span>Overbought (100)</span>
                                        </div>
                                    </div>
                                ) : <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Insufficient data to calculate RSI.</div>}
                            </div>
                        </Col>
                    </Row>

                    {/* Extended Technicals & Conjunction System (New Section) */}
                    {extTech && !extTech.error && (
                        <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
                            <Col xs={24}>
                                <div className="stat-card" style={{ padding: '20px 24px', background: 'linear-gradient(145deg, rgba(16, 185, 129, 0.05) 0%, rgba(15, 23, 42, 0) 100%)', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
                                    <div className="stat-label" style={{ marginBottom: 16, color: '#10b981' }}><SafetyCertificateOutlined /> Conjunction Trading & Execution (Gates)</div>
                                    
                                    <Row gutter={[24, 24]}>
                                        {/* Gate Checks */}
                                        <Col xs={24} md={12}>
                                            <div style={{ padding: 16, background: 'rgba(0,0,0,0.2)', borderRadius: 8 }}>
                                                <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 12, color: 'var(--text-secondary)' }}>Trading Gate Verifications</div>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                                                    <span>Market Context (Gate 2)</span>
                                                    <Tag color={marketContext?.market_verdict === 'BULLISH' ? 'green' : marketContext?.market_verdict === 'BEARISH' ? 'red' : 'blue'}>{marketContext?.market_verdict || 'UNKNOWN'}</Tag>
                                                </div>
                                                {extTech.sector && marketContext?.sectors && marketContext.sectors[extTech.sector] && (
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                                                        <span>Sector Context: {extTech.sector} (Gate 3)</span>
                                                        <Tag color={marketContext.sectors[extTech.sector].trend.includes('Uptrend') ? 'green' : marketContext.sectors[extTech.sector].trend.includes('Downtrend') ? 'red' : 'blue'}>{marketContext.sectors[extTech.sector].trend}</Tag>
                                                    </div>
                                                )}
                                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                                                    <span>Liquidity ADT &gt; 15L (Gate 1)</span>
                                                    <Tag color={extTech.gate1_liquidity === 'PASS' ? 'green' : 'red'}>{extTech.gate1_liquidity}</Tag>
                                                </div>
                                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                    <span>Technical Trigger (Gate 5)</span>
                                                    <Tag color={extTech.gate5_technical.includes('BUY') ? 'green' : extTech.gate5_technical === 'AVOID' ? 'red' : 'default'}>{extTech.gate5_technical}</Tag>
                                                </div>
                                            </div>
                                        </Col>

                                        {/* Execution Levels (ATR & Pivots) */}
                                        <Col xs={24} md={12}>
                                            <div style={{ padding: 16, background: 'rgba(0,0,0,0.2)', borderRadius: 8 }}>
                                                <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 12, color: 'var(--text-secondary)' }}>ATR Risk Management Levels</div>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                                                    <span>ATR (14) Volatility</span>
                                                    <span style={{ fontWeight: 600 }}>{formatNPR(extTech.atr_14)}</span>
                                                </div>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                                                    <span>Stop Loss (-1.5x ATR)</span>
                                                    <span style={{ fontWeight: 600, color: '#ef4444' }}>{formatNPR(extTech.stop_loss)}</span>
                                                </div>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                                                    <span>Target 1 (+2.0x ATR)</span>
                                                    <span style={{ fontWeight: 600, color: '#10b981' }}>{formatNPR(extTech.target_1)}</span>
                                                </div>
                                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                    <span>Risk/Reward Ratio</span>
                                                    <span style={{ fontWeight: 600, color: extTech.risk_reward >= 1.5 ? '#10b981' : '#f59e0b' }}>1 : {extTech.risk_reward}</span>
                                                </div>
                                            </div>
                                        </Col>
                                    </Row>
                                </div>
                            </Col>
                        </Row>
                    )}

                    {/* EMAs */}
                    <Row gutter={[16, 16]}>
                        <Col xs={24} sm={12}>
                            <div className="stat-card" style={{ padding: '20px 24px' }}>
                                <div className="stat-label" style={{ marginBottom: 12 }}><ThunderboltOutlined /> 50-Day EMA</div>
                                {tech?.ema_50 ? (
                                    <div>
                                        <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>{formatNPR(tech.ema_50)}</div>
                                        <Tag color={tech.ema_50_status === 'Bullish' ? 'green' : 'red'} style={{ fontSize: 13 }}>
                                            {tech.ema_50_status === 'Bullish' ? <RiseOutlined /> : <FallOutlined />} {tech.ema_50_status}
                                        </Tag>
                                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
                                            Diff: {formatNPR(tech.ltp - tech.ema_50)} ({((tech.ltp - tech.ema_50) / tech.ema_50 * 100).toFixed(2)}%)
                                        </div>
                                    </div>
                                ) : <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Need at least 50 days of data.</div>}
                            </div>
                        </Col>
                        <Col xs={24} sm={12}>
                            <div className="stat-card" style={{ padding: '20px 24px' }}>
                                <div className="stat-label" style={{ marginBottom: 12 }}><ThunderboltOutlined /> 200-Day EMA</div>
                                {tech?.ema_200 ? (
                                    <div>
                                        <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>{formatNPR(tech.ema_200)}</div>
                                        <Tag color={tech.ema_200_status === 'Bullish' ? 'green' : 'red'} style={{ fontSize: 13 }}>
                                            {tech.ema_200_status === 'Bullish' ? <RiseOutlined /> : <FallOutlined />} {tech.ema_200_status}
                                        </Tag>
                                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
                                            Diff: {formatNPR(tech.ltp - tech.ema_200)} ({((tech.ltp - tech.ema_200) / tech.ema_200 * 100).toFixed(2)}%)
                                        </div>
                                    </div>
                                ) : <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Need at least 200 days of data.</div>}
                            </div>
                        </Col>
                    </Row>

                    {/* Volume & MACD */}
                    <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
                        <Col xs={24} lg={12}>
                            <div className="stat-card" style={{ padding: '20px 24px' }}>
                                <div className="stat-label" style={{ marginBottom: 16 }}><BarChartOutlined /> Volume & Momentum</div>
                                {tech?.vol_sma_20 ? (
                                    <div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                                            <div><div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Today's Volume</div><div style={{ fontSize: 16, fontWeight: 600 }}>{tech.volume?.toLocaleString()}</div></div>
                                            <div style={{ textAlign: 'right' }}><div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>20-Day Avg</div><div style={{ fontSize: 16, fontWeight: 600 }}>{tech.vol_sma_20?.toLocaleString()}</div></div>
                                        </div>
                                        <div style={{ marginBottom: 16 }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                                                <span>Volume Ratio: {tech.vol_ratio?.toFixed(2)}x</span>
                                                <span style={{ color: tech.vol_ratio > 1.5 ? '#00b894' : 'var(--text-secondary)' }}>
                                                    {tech.vol_ratio > 2 ? 'Surge' : tech.vol_ratio > 1.2 ? 'Expansion' : tech.vol_ratio < 0.5 ? 'Dry' : 'Average'}
                                                </span>
                                            </div>
                                            <Progress percent={Math.min(tech.vol_ratio * 50, 100)} showInfo={false}
                                                strokeColor={tech.vol_ratio > 1.5 ? '#00b894' : tech.vol_ratio < 0.5 ? '#d63031' : '#0984e3'}
                                                trailColor="rgba(255,255,255,0.06)" size="small" />
                                        </div>
                                        {tech.obv_status && (
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'rgba(255,255,255,0.02)', borderRadius: 6 }}>
                                                <Tag color={tech.obv_status === 'Accumulation' ? 'green' : 'red'}>{tech.obv_status}</Tag>
                                                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>On-Balance Volume (OBV) Trend</span>
                                            </div>
                                        )}
                                    </div>
                                ) : <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Insufficient volume data.</div>}
                            </div>
                        </Col>
                        <Col xs={24} lg={12}>
                            <div className="stat-card" style={{ padding: '20px 24px', height: '100%' }}>
                                <div className="stat-label" style={{ marginBottom: 16 }}><FundOutlined /> MACD & Volatility</div>
                                {tech?.macd ? (
                                    <div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                                            <div style={{ fontSize: 24, fontWeight: 700, color: tech.macd_hist > 0 ? '#00b894' : '#d63031' }}>{tech.macd_hist?.toFixed(2)}</div>
                                            <div>
                                                <div style={{ fontSize: 13, fontWeight: 500 }}>MACD Histogram</div>
                                                <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>MACD: {tech.macd?.toFixed(2)} | Signal: {tech.macd_signal?.toFixed(2)}</div>
                                            </div>
                                            <div style={{ marginLeft: 'auto' }}><Tag color={tech.macd_hist > 0 ? 'green' : 'red'}>{tech.macd_hist > 0 ? 'Bullish' : 'Bearish'}</Tag></div>
                                        </div>
                                        {tech.bb_upper && (
                                            <div style={{ padding: '12px', background: 'rgba(255,255,255,0.02)', borderRadius: 6 }}>
                                                <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 8, color: 'var(--text-secondary)' }}>Bollinger Bands (20,2)</div>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                                                    <div><div style={{ color: 'var(--text-muted)', fontSize: 10 }}>Lower Band</div><div>{formatNPR(tech.bb_lower)}</div></div>
                                                    <div style={{ textAlign: 'center' }}>
                                                        <div style={{ color: 'var(--text-muted)', fontSize: 10 }}>LTP Position</div>
                                                        <div style={{ fontWeight: 600, color: tech.ltp > tech.bb_upper ? '#d63031' : tech.ltp < tech.bb_lower ? '#00b894' : 'var(--text-primary)' }}>
                                                            {tech.ltp > tech.bb_upper ? 'Above Upper' : tech.ltp < tech.bb_lower ? 'Below Lower' : 'Inside Bands'}
                                                        </div>
                                                    </div>
                                                    <div style={{ textAlign: 'right' }}><div style={{ color: 'var(--text-muted)', fontSize: 10 }}>Upper Band</div><div>{formatNPR(tech.bb_upper)}</div></div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                ) : <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Insufficient data for MACD/Bollinger.</div>}
                            </div>
                        </Col>
                    </Row>
                </div>
            ),
        },
        {
            key: 'fundamental',
            label: <span><StockOutlined /> Fundamental</span>,
            children: (loadingInsights || fetchingInsights) ? (
                <div style={{ textAlign: 'center', padding: '80px 0' }}><Spin size="large" tip="Loading fundamentals..." /></div>
            ) : (
                <div className="animate-in">
                    <Alert
                        message={<span style={{ fontWeight: 600 }}><FundOutlined /> Comprehensive Quarterly Analysis</span>}
                        description={<span style={{ fontSize: 13 }}>Fundamental metrics compiled from rigorous financial reports. YoY growth trajectories, trailing margins, and sector-specific ratios.</span>}
                        type="info" showIcon
                        style={{ marginBottom: 20, background: 'var(--bg-glass)', border: '1px solid rgba(108, 92, 231, 0.3)' }}
                    />
                    {!fund ? (
                        <Card className="stat-card" style={{ textAlign: 'center', padding: '40px 20px', marginBottom: 24 }}>
                            <ExperimentOutlined style={{ fontSize: 48, opacity: 0.12, marginBottom: 16, display: 'block' }} />
                            <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>No Fundamental Data</div>
                            <p style={{ fontSize: 13, color: 'var(--text-secondary)', maxWidth: 500, margin: '0 auto' }}>
                                Click "Scrape Latest Data" above to fetch fundamentals for this symbol.
                            </p>
                        </Card>
                    ) : (
                        <>
                            {/* Overview Metrics */}
                            {fund.overview && (
                                <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
                                    {[
                                        { label: 'P/E Ratio', value: fund.overview.pe_ratio, fmt: v => v?.toFixed(2), color: fund.overview.pe_ratio < 20 ? '#00b894' : fund.overview.pe_ratio < 35 ? '#fdcb6e' : '#d63031' },
                                        { label: 'P/B Ratio', value: fund.overview.pb_ratio, fmt: v => v?.toFixed(2), color: fund.overview.pb_ratio < 2 ? '#00b894' : fund.overview.pb_ratio < 4 ? '#fdcb6e' : '#d63031' },
                                        { label: 'ROE (TTM)', value: fund.overview.roe_ttm, fmt: v => `${(v * 100).toFixed(2)}%`, color: fund.overview.roe_ttm > 0.12 ? '#00b894' : '#fdcb6e' },
                                        { label: 'EPS (TTM)', value: fund.overview.eps_ttm, fmt: v => `Rs. ${v?.toFixed(2)}`, color: '#6c5ce7' },
                                        { label: 'Book Value', value: fund.overview.book_value, fmt: v => `Rs. ${v?.toFixed(2)}`, color: '#0984e3' },
                                        { label: 'Net Profit (TTM)', value: fund.overview.net_profit_ttm, fmt: v => v >= 1e9 ? `Rs. ${(v / 1e9).toFixed(2)}B` : v >= 1e6 ? `Rs. ${(v / 1e6).toFixed(2)}M` : `Rs. ${v?.toFixed(0)}`, color: fund.overview.net_profit_ttm > 0 ? '#00b894' : '#d63031' },
                                    ].map(m => (
                                        <Col xs={12} sm={8} key={m.label}>
                                            <div className="stat-card" style={{ padding: '16px 20px', textAlign: 'center' }}>
                                                <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>{m.label}</div>
                                                <div style={{ fontSize: 22, fontWeight: 700, color: m.value != null ? m.color : 'var(--text-muted)' }}>
                                                    {m.value != null ? m.fmt(m.value) : '—'}
                                                </div>
                                            </div>
                                        </Col>
                                    ))}
                                </Row>
                            )}
                            {/* Growth table */}
                            {processedGrowths && (
                                <div style={{ marginBottom: 32 }}>
                                    <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: 'var(--accent-secondary)' }}>
                                        <RiseOutlined style={{ marginRight: 6 }} /> Quarterly Fundamental Ratios & Growth
                                    </div>
                                    <div style={{ overflowX: 'auto' }}>
                                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                                            <thead>
                                                <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                                                    <th style={{ textAlign: 'left', padding: '10px 12px', color: 'var(--text-secondary)', fontWeight: 600 }}>Metric</th>
                                                    {processedGrowths.periods.map(p => (
                                                        <th key={p} style={{ textAlign: 'right', padding: '10px 12px', color: 'var(--text-primary)', fontWeight: 600 }}>{p}</th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {processedGrowths.metrics.map((metric, idx) => (
                                                    <tr key={metric} style={{ borderBottom: '1px solid var(--border-color)', background: idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)' }}>
                                                        <td style={{ padding: '8px 12px', fontWeight: 500 }}>{GROWTH_METRIC_LABELS[metric] || metric}</td>
                                                        {processedGrowths.periods.map(p => {
                                                            const val = processedGrowths.values[metric][p];
                                                            const isPercent = metric.includes('growth') || metric.includes('roe') || metric.includes('roa') || metric.includes('margin');
                                                            return (<td key={p} style={{ textAlign: 'right', padding: '8px 12px' }}>{val != null ? (isPercent ? `${val.toFixed(2)}%` : val.toLocaleString(undefined, { minimumFractionDigits: 2 })) : '—'}</td>);
                                                        })}
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}
                            {/* Quarterly Financials */}
                            {fund.quarterly && fund.quarterly.length > 0 && (
                                <div style={{ marginBottom: 24 }}>
                                    <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: 'var(--text-secondary)' }}>
                                        <BarChartOutlined style={{ marginRight: 6 }} /> Quarterly Financials <span style={{ fontSize: 11, fontWeight: 400, marginLeft: 8, opacity: 0.6 }}>(Values in Rs. '000)</span>
                                    </div>
                                    <div style={{ overflowX: 'auto' }}>
                                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                                            <thead>
                                                <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                                                    <th style={{ textAlign: 'left', padding: '10px 12px', color: 'var(--text-secondary)', fontWeight: 600 }}>Metric</th>
                                                    {fund.quarterly.map(q => (<th key={q.quarter} style={{ textAlign: 'right', padding: '10px 12px', color: 'var(--accent-secondary)', fontWeight: 600 }}>{q.quarter}</th>))}
                                                </tr>
                                            </thead>
                                            <tbody>
                                                <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                                                    <td style={{ padding: '8px 12px', fontWeight: 600 }}>Paid Up Capital</td>
                                                    {fund.quarterly.map(q => (<td key={q.quarter} style={{ textAlign: 'right', padding: '8px 12px' }}>{q.paid_up_capital != null ? Number(q.paid_up_capital).toLocaleString('en-IN') : '—'}</td>))}
                                                </tr>
                                                <tr style={{ borderBottom: '1px solid var(--border-color)', background: 'rgba(0,184,148,0.04)' }}>
                                                    <td style={{ padding: '8px 12px', fontWeight: 600, color: '#00b894' }}>Net Profit</td>
                                                    {fund.quarterly.map(q => (<td key={q.quarter} style={{ textAlign: 'right', padding: '8px 12px', fontWeight: 600, color: q.net_profit > 0 ? '#00b894' : '#d63031' }}>{q.net_profit != null ? Number(q.net_profit).toLocaleString('en-IN') : '—'}</td>))}
                                                </tr>
                                                {(() => {
                                                    const allKeys = [...new Set(fund.quarterly.flatMap(q => Object.keys(q.sector_metrics || {})))];
                                                    return allKeys.slice(0, 15).map((key, idx) => (
                                                        <tr key={key} style={{ borderBottom: '1px solid var(--border-color)', background: idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)' }}>
                                                            <td style={{ padding: '8px 12px', color: 'var(--text-secondary)' }}>{key}</td>
                                                            {fund.quarterly.map(q => {
                                                                const val = (q.sector_metrics || {})[key];
                                                                return (<td key={q.quarter} style={{ textAlign: 'right', padding: '8px 12px' }}>{val != null ? (typeof val === 'number' ? Number(val).toLocaleString('en-IN') : val) : '—'}</td>);
                                                            })}
                                                        </tr>
                                                    ));
                                                })()}
                                            </tbody>
                                        </table>
                                    </div>
                                    {fund.overview?.updated_at && (
                                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8, textAlign: 'right' }}>
                                            Last updated: {new Date(fund.overview.updated_at).toLocaleDateString()}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Quantity Breakdown from Portfolio */}
                            {detail?.qty_breakdown && hasPortfolioData && (
                                <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
                                    <Col xs={24} lg={14}>
                                        <Card size="small" title={<span><SwapOutlined /> Quantity Breakdown</span>}>
                                            <Row gutter={[16, 12]}>
                                                {[
                                                    { label: 'IPO/FPO', val: detail.qty_breakdown.total_ipo, color: '#a78bfa' },
                                                    { label: 'Secondary Buy', val: detail.qty_breakdown.total_bought, color: '#818cf8' },
                                                    { label: 'Right Shares', val: detail.qty_breakdown.total_right, color: '#38bdf8' },
                                                    { label: 'Bonus', val: detail.qty_breakdown.total_bonus, color: '#34d399' },
                                                    { label: 'Transferred In', val: detail.qty_breakdown.total_transferred_in, color: '#fbbf24' },
                                                    { label: 'Sold / Out', val: detail.qty_breakdown.total_sold + detail.qty_breakdown.total_transferred_out, color: '#f87171' },
                                                ].map(item => (
                                                    <Col xs={12} sm={8} key={item.label}>
                                                        <div style={{ padding: '12px 14px', borderRadius: 10, background: 'var(--bg-primary)', border: '1px solid var(--border-color)' }}>
                                                            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>{item.label}</div>
                                                            <div style={{ fontSize: 18, fontWeight: 600, color: item.color }}>{QTY(item.val)}</div>
                                                        </div>
                                                    </Col>
                                                ))}
                                            </Row>
                                            <Divider style={{ margin: '12px 0' }} />
                                            <Row justify="space-between" style={{ padding: '0 4px' }}>
                                                <Text style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Net Shares (Current)</Text>
                                                <Text style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>{QTY(detail.qty_breakdown.net_shares)}</Text>
                                            </Row>
                                        </Card>
                                    </Col>
                                    <Col xs={24} lg={10}>
                                        {qtyPieData.length > 0 && (
                                            <Card size="small" title={<span><BarChartOutlined /> Share Acquisition Sources</span>}>
                                                <ResponsiveContainer width="100%" height={250}>
                                                    <PieChart>
                                                        <Pie data={qtyPieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} innerRadius={50} paddingAngle={2}
                                                            label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                                                            labelLine={{ stroke: 'var(--text-muted)', strokeWidth: 1 }}>
                                                            {qtyPieData.map((_, i) => (<Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />))}
                                                        </Pie>
                                                        <RechartsTooltip contentStyle={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 8, fontSize: 12 }} />
                                                    </PieChart>
                                                </ResponsiveContainer>
                                            </Card>
                                        )}
                                    </Col>
                                </Row>
                            )}
                        </>
                    )}
                </div>
            ),
        },
        {
            key: 'dividend',
            label: <span><TrophyOutlined /> Dividends & Yield</span>,
            children: !selectedSymbol ? (
                <div style={{ textAlign: 'center', padding: '60px 0' }}><Empty description={<span style={{ color: 'var(--text-secondary)' }}>Select a symbol</span>} /></div>
            ) : loadingDividends ? (
                <div style={{ textAlign: 'center', padding: '80px 0' }}><Spin size="large" /></div>
            ) : (
                <div className="animate-in">
                    {/* Yield cards from portfolio context */}
                    {hasPortfolioData && (
                        <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
                            <Col xs={24} sm={12} lg={6}>
                                <div className="stat-card"><div className="stat-label">Market Dividend Yield</div>
                                    <div className="stat-value" style={{ fontSize: 22, color: 'var(--accent-blue)' }}>{PCT(detail.market_yield)}</div>
                                    <div className="stat-change" style={{ color: 'var(--text-secondary)' }}>Based on LTP: {formatNPR(detail.price)}</div>
                                </div>
                            </Col>
                            <Col xs={24} sm={12} lg={6}>
                                <div className="stat-card"><div className="stat-label">Your Yield on Cost</div>
                                    <div className="stat-value" style={{ fontSize: 22, color: 'var(--accent-green)' }}>{PCT(detail.cost_yield)}</div>
                                    <div className="stat-change" style={{ color: 'var(--text-secondary)' }}>Based on WACC: {formatNPR(detail.wacc)}</div>
                                </div>
                            </Col>
                            <Col xs={24} sm={12} lg={6}>
                                <div className="stat-card"><div className="stat-label">Yield Advantage</div>
                                    <div className="stat-value" style={{ fontSize: 22, color: pnlColor(detail.cost_yield - detail.market_yield) }}>
                                        {detail.cost_yield > detail.market_yield ? '+' : ''}{PCT(detail.cost_yield - detail.market_yield)}
                                    </div>
                                    <div className="stat-change" style={{ color: 'var(--text-secondary)' }}>Your yield vs market yield</div>
                                </div>
                            </Col>
                            <Col xs={24} sm={12} lg={6}>
                                <div className="stat-card"><div className="stat-label">Tax Payable</div>
                                    <div className="stat-value" style={{ fontSize: 22, color: 'var(--accent-red)' }}>
                                        {formatNPR(detail.dividend_history?.reduce((sum, r) => sum + (r.tax_owed || 0), 0) || 0)}
                                    </div>
                                    <div className="stat-change" style={{ color: 'var(--text-secondary)' }}>Unpaid tax on bonus shares</div>
                                </div>
                            </Col>
                        </Row>
                    )}

                    {/* Dividend Chart */}
                    {scriptHistoryData.length > 0 ? (
                        <Row gutter={[24, 24]}>
                            <Col xs={24}>
                                <div style={{ height: 350, background: 'var(--bg-glass)', padding: 16, borderRadius: 8 }}>
                                    <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-secondary)', textAlign: 'center', marginBottom: 16 }}>Historic Payout Percentage</div>
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={scriptHistoryData} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#ffffff1a" />
                                            <XAxis dataKey="fy" stroke="#8884d8" angle={-30} textAnchor="end" height={60} />
                                            <YAxis stroke="#8884d8" />
                                            <RechartsTooltip contentStyle={{ backgroundColor: '#1a1a2e', border: '1px solid #ffffff1a', borderRadius: '8px' }} itemStyle={{ color: 'white' }} />
                                            <Legend verticalAlign="top" height={36} />
                                            <Bar dataKey="cashPercent" name="Cash %" fill="#00e676" stackId="a" />
                                            <Bar dataKey="bonusPercent" name="Bonus %" fill="#2979ff" stackId="a" />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            </Col>
                        </Row>
                    ) : (
                        <div style={{ textAlign: 'center', padding: '60px 0' }}>
                            <Empty description={<span style={{ color: 'var(--text-secondary)' }}>No dividend history recorded. Ensure dividends are synced.</span>} />
                        </div>
                    )}

                    {/* Detailed dividend table from portfolio context */}
                    {detail?.dividend_history?.length > 0 && (
                        <Card size="small" title="Dividend History Details" style={{ marginTop: 20 }}>
                            <Table className="portfolio-table" dataSource={detail.dividend_history} rowKey="fiscal_year" size="small" pagination={false}
                                columns={[
                                    { title: 'Fiscal Year', dataIndex: 'fiscal_year', width: 120 },
                                    { title: 'Cash %', dataIndex: 'cash_pct', width: 80, align: 'right', render: v => PCT(v) },
                                    { title: 'Bonus %', dataIndex: 'bonus_pct', width: 80, align: 'right', render: v => PCT(v) },
                                    { title: 'Book Close', dataIndex: 'book_close_date', width: 120 },
                                    { title: 'Eligible Qty', dataIndex: 'eligible_qty', width: 100, align: 'right', render: v => QTY(v) },
                                    { title: 'Tax/Deducted', dataIndex: 'total_tax', width: 110, align: 'right', render: (v, r) => (<div>{formatNPR(v)}{r.tax_owed > 0 && <div style={{ fontSize: 10, color: 'var(--accent-red)' }}>Payable</div>}</div>) },
                                    { title: 'Net Cash Income', dataIndex: 'cash_amount', width: 120, align: 'right', render: v => v < 0 ? <strong style={{ color: 'var(--accent-red)' }}>({formatNPR(Math.abs(v))})</strong> : <strong style={{ color: 'var(--accent-green)' }}>{formatNPR(v)}</strong> },
                                    { title: 'Bonus Shares', dataIndex: 'bonus_shares', width: 100, align: 'right', render: v => QTY(v) },
                                ]}
                            />
                        </Card>
                    )}
                </div>
            ),
        },
    ];

    // Conditionally add Transactions tab only if portfolio data exists
    if (detail?.transactions?.length > 0) {
        innerTabItems.push({
            key: 'transactions',
            label: <span><HistoryOutlined /> Transactions ({detail.transaction_count})</span>,
            children: (
                <Card size="small" title={`Transaction History — ${selectedSymbol}`}>
                    <Table className="portfolio-table" dataSource={detail.transactions} columns={txnColumns} rowKey="id" size="small"
                        pagination={{ defaultPageSize: 20, showSizeChanger: true, pageSizeOptions: ['20', '50', '100'], showTotal: (t) => `${t} transactions` }}
                        scroll={{ x: 900 }}
                        rowClassName={(r) => {
                            if (['BUY', 'IPO', 'FPO', 'RIGHT', 'AUCTION', 'TRANSFER_IN'].includes(r.txn_type)) return 'row-positive';
                            if (['SELL', 'TRANSFER_OUT'].includes(r.txn_type)) return 'row-negative';
                            return '';
                        }}
                    />
                </Card>
            ),
        });
    }

    return (
        <div className="animate-in">
            {/* Symbol Header Bar */}
            <div className="stat-card" style={{ marginBottom: 24, padding: '20px 24px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                        <div style={{
                            width: 48, height: 48, borderRadius: 12,
                            background: hasPortfolioData ? 'var(--gradient-green)' : 'linear-gradient(135deg, #6c5ce7, #a78bfa)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 20, color: '#fff', fontWeight: 700,
                        }}>
                            {selectedSymbol.charAt(0)}
                        </div>
                        <div>
                            <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--accent-secondary)' }}>
                                {selectedSymbol}
                                {hasPortfolioData && <Tag color="green" style={{ marginLeft: 12 }}>IN PORTFOLIO</Tag>}
                            </div>
                            <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                                {companyInfo?.name} {companyInfo?.sector ? `• ${companyInfo.sector}` : ''}
                            </div>
                        </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                        <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: 28, fontWeight: 700 }}>{tech ? formatNPR(tech.ltp) : '—'}</div>
                        </div>
                        <Button type="primary" icon={<SyncOutlined spin={scrapeInsightsMut.isPending} />} onClick={() => scrapeInsightsMut.mutate()} loading={scrapeInsightsMut.isPending}>
                            Scrape Latest
                        </Button>
                    </div>
                </div>

                {/* Portfolio Context Strip */}
                {hasPortfolioData && (
                    <div style={{ display: 'flex', gap: 24, marginTop: 16, padding: '12px 16px', background: 'rgba(0,184,148,0.06)', borderRadius: 10, border: '1px solid rgba(0,184,148,0.15)', flexWrap: 'wrap' }}>
                        <div><div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Qty Held</div><div style={{ fontSize: 16, fontWeight: 700 }}>{QTY(detail.current_qty)}</div></div>
                        <div><div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase' }}>True WACC</div><div style={{ fontSize: 16, fontWeight: 700 }}>{formatNPR(detail.wacc)}</div></div>
                        <div><div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Tax WACC</div><div style={{ fontSize: 16, fontWeight: 700 }}>{formatNPR(detail.tax_wacc)}</div></div>
                        <div><div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Unrealized P&L</div><div style={{ fontSize: 16, fontWeight: 700, color: pnlColor(detail.unrealized_pnl) }}>{formatNPR(detail.unrealized_pnl)} ({PCT(detail.pnl_pct)})</div></div>
                        <div><div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase' }}>XIRR</div><div style={{ fontSize: 16, fontWeight: 700, color: pnlColor(detail.xirr) }}>{PCT(detail.xirr)}</div></div>
                        <div><div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Days Held</div><div style={{ fontSize: 16, fontWeight: 700 }}>{detail.holding_days}</div></div>
                    </div>
                )}
            </div>

            {/* Inner Tabs */}
            <Tabs
                defaultActiveKey="summary"
                items={innerTabItems}
                className="custom-tabs"
                style={{ background: 'var(--bg-secondary)', padding: '0 24px 24px', borderRadius: 12, border: '1px solid var(--border-color)' }}
            />
        </div>
    );
}

// ============================================================================
// Main Insights Page — Outer Shell
// ============================================================================
export default function Insights() {
    const [searchParams, setSearchParams] = useSearchParams();
    const initialSymbol = searchParams.get('symbol') || null;
    const [selectedSymbol, setSelectedSymbol] = useState(initialSymbol);
    const [activeOuterTab, setActiveOuterTab] = useState(initialSymbol ? 'stock360' : 'screener');

    const { data: companies, isLoading: loadingCompanies } = useQuery({
        queryKey: ['companies', 'all'],
        queryFn: () => getCompanies({ limit: 1000 }).then(r => r.data.companies),
    });

    // Update URL when symbol changes
    useEffect(() => {
        if (selectedSymbol) {
            setSearchParams({ symbol: selectedSymbol });
        }
    }, [selectedSymbol]);

    // Handle symbol selection from Screener
    const handleSelectSymbol = (sym) => {
        setSelectedSymbol(sym);
        setActiveOuterTab('stock360');
    };

    const outerTabItems = [
        {
            key: 'screener',
            label: <span><FilterOutlined /> Stock Screener</span>,
            children: <StockScreener onSelectSymbol={handleSelectSymbol} />,
        },
        {
            key: 'stock360',
            label: <span><StockOutlined /> Stock 360°</span>,
            children: (
                <>
                    {/* Symbol Search Bar */}
                    <Card size="small" className="filter-card" style={{ marginBottom: 24 }}>
                        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap' }}>
                            <div style={{ width: 450 }}>
                                <span style={{ display: 'block', marginBottom: 4, fontSize: '0.8rem', opacity: 0.6 }}>Search Symbol</span>
                                <Select
                                    showSearch
                                    style={{ width: '100%' }}
                                    placeholder="Type to search symbol..."
                                    optionFilterProp="children"
                                    loading={loadingCompanies}
                                    onChange={(v) => setSelectedSymbol(v)}
                                    value={selectedSymbol}
                                    size="large"
                                    suffixIcon={<SearchOutlined />}
                                >
                                    {companies?.map(c => (
                                        <Select.Option key={c.symbol} value={c.symbol}>
                                            {c.symbol} — {c.name}
                                        </Select.Option>
                                    ))}
                                </Select>
                            </div>
                            {selectedSymbol && (
                                <div style={{ fontSize: 13, color: 'var(--text-secondary)', paddingBottom: 6 }}>
                                    <InfoCircleOutlined style={{ marginRight: 6 }} />
                                    Technical indicators computed from locally stored historical data.
                                </div>
                            )}
                        </div>
                    </Card>
                    <Stock360View selectedSymbol={selectedSymbol} companies={companies} />
                </>
            ),
        },
    ];

    return (
        <div className="animate-in">
            <div className="page-header">
                <h1>Stock Explorer</h1>
                <p className="subtitle">Screen, analyze, and trade NEPSE securities with full technical & fundamental context</p>
            </div>

            <Tabs
                activeKey={activeOuterTab}
                onChange={setActiveOuterTab}
                items={outerTabItems}
                className="custom-tabs"
                style={{ marginBottom: 24 }}
                size="large"
            />
        </div>
    );
}
