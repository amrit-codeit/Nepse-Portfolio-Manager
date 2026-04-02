import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
    Card, Row, Col, Select, Empty, Spin, Tag, Progress, Descriptions, Tooltip, Divider, Space,
} from 'antd';
import {
    SearchOutlined, FundOutlined, LineChartOutlined, BarChartOutlined,
    RiseOutlined, FallOutlined, ExperimentOutlined, InfoCircleOutlined,
    DashboardOutlined, ThunderboltOutlined, StockOutlined,
} from '@ant-design/icons';
import { getCompanies, getInsights } from '../services/api';

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

    const { data: companies, isLoading: loadingCompanies } = useQuery({
        queryKey: ['companies', 'all'],
        queryFn: () => getCompanies({ limit: 1000 }).then(r => r.data.companies),
    });

    const { data: insightsData, isLoading: loadingInsights, isFetching: fetchingInsights } = useQuery({
        queryKey: ['insights', selectedSymbol],
        queryFn: () => getInsights(selectedSymbol).then(r => r.data),
        enabled: !!selectedSymbol,
    });

    const tech = insightsData?.technicals;
    const fund = insightsData?.fundamentals;

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
                            Technical indicators are computed from locally stored historical price data.
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

                    {/* Technical Analysis Section */}
                    <div className="section-title" style={{ marginBottom: 16 }}>
                        <LineChartOutlined /> Technical Analysis
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
                    <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
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

                    {/* Fundamental Analysis Placeholder Section */}
                    <Divider style={{ borderColor: 'var(--border-color)' }} />
                    <div className="section-title" style={{ marginBottom: 16 }}>
                        <StockOutlined /> Fundamental Analysis
                    </div>

                    <Card className="stat-card" style={{ textAlign: 'center', padding: '40px 20px', marginBottom: 24 }}>
                        <ExperimentOutlined style={{ fontSize: 48, opacity: 0.12, marginBottom: 16, display: 'block' }} />
                        <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Coming Soon</div>
                        <p style={{ fontSize: 13, color: 'var(--text-secondary)', maxWidth: 500, margin: '0 auto' }}>
                            Fundamental indicators like P/E Ratio, P/BV, EPS, NPL, and Dividend History
                            will be available in a future update. These require quarterly data scraping from ShareSansar.
                        </p>

                        <Row gutter={[16, 16]} style={{ marginTop: 24, maxWidth: 600, margin: '24px auto 0' }}>
                            {['P/E Ratio', 'P/BV', 'EPS', 'NPL', 'Dividend Yield'].map(metric => (
                                <Col xs={12} sm={8} key={metric}>
                                    <div style={{
                                        padding: '12px 8px',
                                        background: 'rgba(108, 92, 231, 0.04)',
                                        borderRadius: 8,
                                        border: '1px dashed rgba(108, 92, 231, 0.15)',
                                    }}>
                                        <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{metric}</div>
                                        <div style={{ fontSize: 18, fontWeight: 700, color: 'rgba(255,255,255,0.15)', marginTop: 4 }}>—</div>
                                    </div>
                                </Col>
                            ))}
                        </Row>
                    </Card>
                </div>
            )}
        </div>
    );
}
