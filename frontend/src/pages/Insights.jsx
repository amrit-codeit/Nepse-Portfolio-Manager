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
import TechnicalTabs from '../components/insights/TechnicalTabs';
import FundamentalTabs from '../components/insights/FundamentalTabs';
import StrategyTester from '../components/insights/StrategyTester';
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
// Stock360View — The unified detail view
// ============================================================================
function Stock360View({ selectedSymbol, companies, selectedMember, memberName }) {
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
    const params = selectedMember ? { member_id: selectedMember } : {};
    const { data: portfolioDetail, isLoading: detailLoading } = useQuery({
        queryKey: ['stockDetail', selectedSymbol, params],
        queryFn: () => getStockDetail(selectedSymbol, params).then(r => r.data),
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
                <TechnicalTabs 
                    symbol={selectedSymbol} 
                    tech={tech} 
                    extTech={extTech} 
                    marketContext={marketContext} 
                    transactions={detail?.transactions} 
                />
            ),
        },
        {
            key: 'fundamental',
            label: <span><StockOutlined /> Fundamental</span>,
            children: (loadingInsights || fetchingInsights) ? (
                <div style={{ textAlign: 'center', padding: '80px 0' }}><Spin size="large" tip="Loading fundamentals..." /></div>
            ) : (
                <FundamentalTabs 
                    symbol={selectedSymbol} 
                    fund={fund} 
                    processedGrowths={processedGrowths} 
                    detail={detail} 
                    hasPortfolioData={hasPortfolioData} 
                    qtyPieData={qtyPieData} 
                    scriptHistoryData={scriptHistoryData} 
                    loadingDividends={loadingDividends} 
                />
            ),
        },
        {
            key: 'tester',
            label: <span><TrophyOutlined /> Strategy Tester</span>,
            children: <StrategyTester symbol={selectedSymbol} />,
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
                                {hasPortfolioData && <Tag color="green" style={{ marginLeft: 12 }}>IN PORTFOLIO {memberName ? `OF ${memberName}` : ''}</Tag>}
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
    const [selectedMember, setSelectedMember] = useState(null);

    const { data: companies, isLoading: loadingCompanies } = useQuery({
        queryKey: ['companies', 'all'],
        queryFn: () => getCompanies({ limit: 1000 }).then(r => r.data.companies),
    });

    const { data: members, isLoading: loadingMembers } = useQuery({
        queryKey: ['members'],
        queryFn: () => getMembers().then(r => r.data),
    });

    const activeMemberName = useMemo(() => {
        if (!selectedMember || !members) return null;
        const m = members.find(x => x.id === selectedMember);
        return m ? m.name.toUpperCase() : null;
    }, [selectedMember, members]);

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
                            <div style={{ width: 250 }}>
                                <span style={{ display: 'block', marginBottom: 4, fontSize: '0.8rem', opacity: 0.6 }}>Portfolio Filter</span>
                                <Select
                                    showSearch
                                    optionFilterProp="children"
                                    allowClear
                                    style={{ width: '100%' }}
                                    placeholder="All Portfolios"
                                    loading={loadingMembers}
                                    onChange={(v) => setSelectedMember(v)}
                                    value={selectedMember}
                                    size="large"
                                >
                                    {members?.map(m => (
                                        <Select.Option key={m.id} value={m.id}>
                                            {m.name}
                                        </Select.Option>
                                    ))}
                                </Select>
                            </div>
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
                    <Stock360View selectedSymbol={selectedSymbol} companies={companies} selectedMember={selectedMember} memberName={activeMemberName} />
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
