import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
    Card, Row, Col, Select, Empty, Spin, Tag, Progress, Descriptions, Tooltip, Divider, Space,
    Button, message, Tabs,
} from 'antd';
import {
    SearchOutlined, FundOutlined, LineChartOutlined, BarChartOutlined,
    RiseOutlined, FallOutlined, ExperimentOutlined, InfoCircleOutlined,
    DashboardOutlined, ThunderboltOutlined, StockOutlined, SyncOutlined,
} from '@ant-design/icons';
import { getCompanies, getInsights, scrapeFundamentals } from '../services/api';

function formatNPR(value) {
    if (value === null || value === undefined) return '—';
    return `Rs. ${Number(value).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

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

export default function Insights() {
    const [selectedSymbol, setSelectedSymbol] = useState(null);
    const [activeTab, setActiveTab] = useState('technical');

    const { data: companies, isLoading: loadingCompanies } = useQuery({
        queryKey: ['companies', 'all'],
        queryFn: () => getCompanies({ limit: 1000 }).then(r => r.data.companies),
    });

    const { data: insightsData, isLoading: loadingInsights, isFetching: fetchingInsights, refetch: refetchInsights } = useQuery({
        queryKey: ['insights', selectedSymbol],
        queryFn: () => getInsights(selectedSymbol).then(r => r.data),
        enabled: !!selectedSymbol,
    });

    const [isScraping, setIsScraping] = useState(false);

    const handleScrape = async () => {
        if (!selectedSymbol) return;
        setIsScraping(true);
        const hide = message.loading(`Scraping fundamental data for ${selectedSymbol}...`, 0);
        try {
            await scrapeFundamentals(selectedSymbol);
            message.success(`Data updated for ${selectedSymbol}`);
            refetchInsights();
        } catch (error) {
            message.error(`Failed to scrape ${selectedSymbol}: ${error.message || 'Unknown error'}`);
        } finally {
            hide();
            setIsScraping(false);
        }
    };

    const tech = insightsData?.technicals;
    const fund = insightsData?.fundamentals;

    const tabItems = [
        {
            key: 'technical',
            label: <span><LineChartOutlined /> Technical</span>,
            children: (
                <div className="animate-in">
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
                                    <div style={{ position: 'relative' }}>
                                        <Progress
                                            percent={tech?.placement_52w || 0}
                                            showInfo={false}
                                            strokeColor={{
                                                '0%': '#d63031',
                                                '30%': '#fdcb6e',
                                                '60%': '#00b894',
                                                '100%': '#00b894',
                                            }}
                                            trailColor="rgba(255,255,255,0.06)"
                                            size={['100%', 16]}
                                        />
                                    </div>
                                    <div style={{ textAlign: 'center', fontSize: 13, marginTop: 6, color: 'var(--text-primary)', fontWeight: 600 }}>
                                        LTP at {tech?.placement_52w?.toFixed(1) || 0}% of 52-week range
                                    </div>
                                </div>
                            </div>
                        </Col>

                        {/* RSI */}
                        <Col xs={24} lg={12}>
                            <div className="stat-card" style={{ padding: '20px 24px' }}>
                                <div className="stat-label" style={{ marginBottom: 16 }}>
                                    <DashboardOutlined /> RSI (14)
                                </div>
                                {tech?.rsi_14 ? (
                                    <div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                                            <div style={{ fontSize: 36, fontWeight: 700, color: getRSIColor(tech.rsi_14) }}>
                                                {tech.rsi_14.toFixed(1)}
                                            </div>
                                            <div>
                                                <Tag color={tech.rsi_14 >= 70 ? 'red' : tech.rsi_14 <= 30 ? 'green' : 'blue'} style={{ fontSize: 13 }}>
                                                    {getRSILabel(tech.rsi_14)}
                                                </Tag>
                                                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 6 }}>
                                                    {tech.rsi_14 >= 70
                                                        ? 'Stock may be overbought. Consider caution.'
                                                        : tech.rsi_14 <= 30
                                                            ? 'Stock may be oversold. Potential buying opportunity.'
                                                            : 'RSI is in neutral territory.'}
                                                </div>
                                            </div>
                                        </div>
                                        <Progress
                                            percent={tech.rsi_14}
                                            showInfo={false}
                                            strokeColor={getRSIColor(tech.rsi_14)}
                                            trailColor="rgba(255,255,255,0.06)"
                                            style={{ marginTop: 12 }}
                                        />
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                                            <span>Oversold (0)</span>
                                            <span>Neutral (50)</span>
                                            <span>Overbought (100)</span>
                                        </div>
                                    </div>
                                ) : (
                                    <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
                                        Insufficient data to calculate RSI.
                                    </div>
                                )}
                            </div>
                        </Col>
                    </Row>

                    {/* Moving Averages */}
                    <Row gutter={[16, 16]}>
                        <Col xs={24} sm={12}>
                            <div className="stat-card" style={{ padding: '20px 24px' }}>
                                <div className="stat-label" style={{ marginBottom: 12 }}>
                                    <ThunderboltOutlined /> 50-Day EMA
                                </div>
                                {tech?.ema_50 ? (
                                    <div>
                                        <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>
                                            {formatNPR(tech.ema_50)}
                                        </div>
                                        <Tag color={tech.ema_50_status === 'Bullish' ? 'green' : 'red'} style={{ fontSize: 13 }}>
                                            {tech.ema_50_status === 'Bullish' ? <RiseOutlined /> : <FallOutlined />}
                                            {' '}{tech.ema_50_status} — Price is {tech.ema_50_status === 'Bullish' ? 'Above' : 'Below'} EMA 50
                                        </Tag>
                                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
                                            Diff: {formatNPR(tech.ltp - tech.ema_50)} ({((tech.ltp - tech.ema_50) / tech.ema_50 * 100).toFixed(2)}%)
                                        </div>
                                    </div>
                                ) : (
                                    <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
                                        Need at least 50 days of data.
                                    </div>
                                )}
                            </div>
                        </Col>
                        <Col xs={24} sm={12}>
                            <div className="stat-card" style={{ padding: '20px 24px' }}>
                                <div className="stat-label" style={{ marginBottom: 12 }}>
                                    <ThunderboltOutlined /> 200-Day EMA
                                </div>
                                {tech?.ema_200 ? (
                                    <div>
                                        <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>
                                            {formatNPR(tech.ema_200)}
                                        </div>
                                        <Tag color={tech.ema_200_status === 'Bullish' ? 'green' : 'red'} style={{ fontSize: 13 }}>
                                            {tech.ema_200_status === 'Bullish' ? <RiseOutlined /> : <FallOutlined />}
                                            {' '}{tech.ema_200_status} — Price is {tech.ema_200_status === 'Bullish' ? 'Above' : 'Below'} EMA 200
                                        </Tag>
                                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
                                            Diff: {formatNPR(tech.ltp - tech.ema_200)} ({((tech.ltp - tech.ema_200) / tech.ema_200 * 100).toFixed(2)}%)
                                        </div>
                                    </div>
                                ) : (
                                    <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
                                        Need at least 200 days of data.
                                    </div>
                                )}
                            </div>
                        </Col>
                    </Row>
                </div>
            )
        },
        {
            key: 'fundamental',
            label: <span><StockOutlined /> Fundamental</span>,
            children: (
                <div className="animate-in">
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
                        <Button 
                            type="primary" 
                            ghost 
                            size="small" 
                            icon={<SyncOutlined spin={isScraping} />}
                            onClick={handleScrape}
                            loading={isScraping}
                        >
                            Scrape Latest Data
                        </Button>
                    </div>

                    {!fund ? (
                        <Card className="stat-card" style={{ textAlign: 'center', padding: '40px 20px', marginBottom: 24 }}>
                            <ExperimentOutlined style={{ fontSize: 48, opacity: 0.12, marginBottom: 16, display: 'block' }} />
                            <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>No Fundamental Data</div>
                            <p style={{ fontSize: 13, color: 'var(--text-secondary)', maxWidth: 500, margin: '0 auto' }}>
                                Run the fundamental scraper from Settings to fetch P/E, EPS, Book Value, and quarterly financials for this symbol.
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

                            {/* Quarterly Financials */}
                            {fund.quarterly && fund.quarterly.length > 0 && (
                                <div style={{ marginBottom: 24 }}>
                                    <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: 'var(--text-secondary)' }}>
                                        <BarChartOutlined style={{ marginRight: 6 }} /> Quarterly Financials
                                        <span style={{ fontSize: 11, fontWeight: 400, marginLeft: 8, opacity: 0.6 }}>
                                            (Values in Rs. '000)
                                        </span>
                                    </div>
                                    <div style={{ overflowX: 'auto' }}>
                                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                                            <thead>
                                                <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                                                    <th style={{ textAlign: 'left', padding: '10px 12px', color: 'var(--text-secondary)', fontWeight: 600 }}>Metric</th>
                                                    {fund.quarterly.map(q => (
                                                        <th key={q.quarter} style={{ textAlign: 'right', padding: '10px 12px', color: 'var(--accent-secondary)', fontWeight: 600 }}>
                                                            {q.quarter}
                                                        </th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody>
                                                <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                                                    <td style={{ padding: '8px 12px', fontWeight: 600 }}>Paid Up Capital</td>
                                                    {fund.quarterly.map(q => (
                                                        <td key={q.quarter} style={{ textAlign: 'right', padding: '8px 12px' }}>
                                                            {q.paid_up_capital != null ? Number(q.paid_up_capital).toLocaleString('en-IN') : '—'}
                                                        </td>
                                                    ))}
                                                </tr>
                                                <tr style={{ borderBottom: '1px solid var(--border-color)', background: 'rgba(0,184,148,0.04)' }}>
                                                    <td style={{ padding: '8px 12px', fontWeight: 600, color: '#00b894' }}>Net Profit</td>
                                                    {fund.quarterly.map(q => (
                                                        <td key={q.quarter} style={{ textAlign: 'right', padding: '8px 12px', fontWeight: 600, color: q.net_profit > 0 ? '#00b894' : '#d63031' }}>
                                                            {q.net_profit != null ? Number(q.net_profit).toLocaleString('en-IN') : '—'}
                                                        </td>
                                                    ))}
                                                </tr>
                                                {(() => {
                                                    const allKeys = [...new Set(fund.quarterly.flatMap(q => Object.keys(q.sector_metrics || {})))];
                                                    return allKeys.slice(0, 15).map((key, idx) => (
                                                        <tr key={key} style={{ borderBottom: '1px solid var(--border-color)', background: idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)' }}>
                                                            <td style={{ padding: '8px 12px', color: 'var(--text-secondary)' }}>{key}</td>
                                                            {fund.quarterly.map(q => {
                                                                const val = (q.sector_metrics || {})[key];
                                                                return (
                                                                    <td key={q.quarter} style={{ textAlign: 'right', padding: '8px 12px' }}>
                                                                        {val != null ? (typeof val === 'number' ? Number(val).toLocaleString('en-IN') : val) : '—'}
                                                                    </td>
                                                                );
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
                        </>
                    )}
                </div>
            )
        }
    ];

    return (
        <div className="animate-in">
            {/* Page Header */}
            <div className="page-header">
                <h1>Market Insights</h1>
                <p className="subtitle">Technical analysis and market intelligence for NEPSE securities</p>
            </div>

            {/* Symbol Search */}
            <Card size="small" className="filter-card" style={{ marginBottom: 24 }}>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap' }}>
                    <div style={{ width: 400 }}>
                        <span style={{ display: 'block', marginBottom: 4, fontSize: '0.8rem', opacity: 0.6 }}>
                            Search Symbol
                        </span>
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
                            Technical indicators are computed from locally stored historical data.
                        </div>
                    )}
                </div>
            </Card>

            {/* Content Area */}
            {!selectedSymbol ? (
                <div style={{ textAlign: 'center', padding: '80px 0' }}>
                    <FundOutlined style={{ fontSize: 64, opacity: 0.08, marginBottom: 20, display: 'block' }} />
                    <Empty
                        description={
                            <span style={{ color: 'var(--text-secondary)' }}>
                                Select a symbol above to view technical analysis and market insights
                            </span>
                        }
                    />
                </div>
            ) : (loadingInsights || fetchingInsights) ? (
                <div style={{ textAlign: 'center', padding: '80px 0' }}>
                    <Spin size="large" tip="Crunching numbers..." />
                </div>
            ) : insightsData?.error ? (
                <Card className="stat-card" style={{ textAlign: 'center', padding: '40px 20px' }}>
                    <ExperimentOutlined style={{ fontSize: 48, opacity: 0.15, marginBottom: 16, display: 'block' }} />
                    <p style={{ fontSize: 16, fontWeight: 600 }}>{insightsData.error}</p>
                    <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                        Go to Prices → Historical Prices tab and click "Sync Historical Data" to download OHLCV data first.
                    </p>
                </Card>
            ) : (
                <div>
                    {/* Symbol Header */}
                    <div className="stat-card" style={{ marginBottom: 24, padding: '20px 24px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                            <div>
                                <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--accent-secondary)' }}>
                                    {selectedSymbol}
                                </div>
                                <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                                    {companies?.find(c => c.symbol === selectedSymbol)?.name}
                                </div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                                <div style={{ fontSize: 28, fontWeight: 700 }}>
                                    {tech ? formatNPR(tech.ltp) : '—'}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Navigation Tabs */}
                    <Tabs 
                        activeKey={activeTab} 
                        onChange={setActiveTab} 
                        items={tabItems} 
                        className="custom-tabs"
                        style={{ background: 'var(--bg-secondary)', padding: '0 24px 24px', borderRadius: 12, border: '1px solid var(--border-color)' }}
                    />
                </div>
            )}
        </div>
    );
}
