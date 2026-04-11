import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Row, Col, Tag, Progress, Spin, Card, Button, Divider, Space, Tooltip, Alert, Select } from 'antd';
import {
    RobotOutlined, CheckCircleOutlined, CloseCircleOutlined,
    RiseOutlined, FallOutlined, ThunderboltOutlined,
    ExperimentOutlined, DashboardOutlined, InfoCircleOutlined,
    FireOutlined, SafetyOutlined, DollarOutlined,
    WarningOutlined, BankOutlined, FundOutlined,
    BarChartOutlined, LineChartOutlined, StockOutlined,
} from '@ant-design/icons';
import { BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, CartesianGrid, Cell } from 'recharts';
import { getAIModels, getExecutiveSummary, getAIVerdict } from '../../services/api';

function formatNPR(value) {
    if (value === null || value === undefined) return '—';
    return `Rs. ${Number(value).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatLargeNum(value) {
    if (value === null || value === undefined) return '—';
    const abs = Math.abs(value);
    if (abs >= 1e9) return `Rs. ${(value / 1e9).toFixed(2)}B`;
    if (abs >= 1e7) return `Rs. ${(value / 1e7).toFixed(2)}Cr`;
    if (abs >= 1e5) return `Rs. ${(value / 1e5).toFixed(2)}L`;
    return `Rs. ${value.toLocaleString('en-IN')}`;
}

function getScoreColor(score) {
    if (score >= 80) return '#00b894';
    if (score >= 60) return '#00cec9';
    if (score >= 40) return '#fdcb6e';
    return '#d63031';
}

function getRSIColor(rsi) {
    if (rsi >= 70) return '#d63031';
    if (rsi >= 60) return '#e17055';
    if (rsi >= 40) return '#00b894';
    if (rsi >= 30) return '#0984e3';
    return '#6c5ce7';
}

function getActionConfig(action) {
    switch (action) {
        case 'Strong Buy':
            return { color: '#00b894', bg: 'rgba(0,184,148,0.12)', icon: <ThunderboltOutlined />, glow: '0 0 20px rgba(0,184,148,0.3)' };
        case 'Accumulate':
            return { color: '#0984e3', bg: 'rgba(9,132,227,0.12)', icon: <RiseOutlined />, glow: '0 0 20px rgba(9,132,227,0.3)' };
        case 'Hold':
            return { color: '#fdcb6e', bg: 'rgba(253,203,110,0.12)', icon: <SafetyOutlined />, glow: '0 0 20px rgba(253,203,110,0.2)' };
        case 'Avoid/Reduce':
            return { color: '#d63031', bg: 'rgba(214,48,49,0.12)', icon: <FallOutlined />, glow: '0 0 20px rgba(214,48,49,0.3)' };
        case 'Strong Sell':
            return { color: '#c0392b', bg: 'rgba(192,57,43,0.15)', icon: <CloseCircleOutlined />, glow: '0 0 20px rgba(192,57,43,0.4)' };
        default:
            return { color: 'var(--text-secondary)', bg: 'rgba(255,255,255,0.05)', icon: <InfoCircleOutlined />, glow: 'none' };
    }
}

// Reusable mini stat card
function MetricCard({ label, value, color, suffix = '', tooltip }) {
    const content = (
        <div style={{ textAlign: 'center', padding: '14px 8px' }}>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 8, letterSpacing: '0.3px' }}>{label}</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: color || 'var(--text-primary)' }}>
                {value != null ? `${typeof value === 'number' ? value.toFixed(2) : value}${suffix}` : '—'}
            </div>
        </div>
    );
    return tooltip ? <Tooltip title={tooltip}>{content}</Tooltip> : content;
}


export default function ExecutiveSummary({ symbol }) {
    const [selectedModel, setSelectedModel] = useState("qwen2.5:3b-instruct-q4_0");

    const { data: modelData } = useQuery({
        queryKey: ['ai-models'],
        queryFn: () => getAIModels().then(r => r.data),
        staleTime: 600000,
    });
    const models = modelData?.models || ["qwen2.5:3b-instruct-q4_0", "gemma4:e2b"];

    const { data, isLoading } = useQuery({
        queryKey: ['executive-summary', symbol],
        queryFn: () => getExecutiveSummary(symbol).then(r => r.data),
        enabled: !!symbol,
    });

    const {
        data: aiData,
        isFetching: aiLoading,
        refetch: generateAI
    } = useQuery({
        queryKey: ['ai-verdict', symbol, selectedModel],
        queryFn: () => getAIVerdict(symbol, selectedModel).then(r => r.data),
        enabled: false,
        staleTime: Infinity,
    });

    if (isLoading) {
        return (
            <div style={{ textAlign: 'center', padding: '80px 0' }}>
                <Spin size="large" tip="Synthesizing stock data..." />
            </div>
        );
    }

    if (!symbol) {
        return (
            <Card style={{ margin: '20px 0' }}>
                <div style={{ textAlign: 'center', padding: '40px 0', opacity: 0.5 }}>
                    <ExperimentOutlined style={{ fontSize: 40, marginBottom: 12 }} />
                    <p>Select a stock to view its Executive Summary and AI Analysis.</p>
                </div>
            </Card>
        );
    }

    if (!data || data.error) {
        return (
            <Card className="stat-card" style={{ textAlign: 'center', padding: '40px 20px' }}>
                <ExperimentOutlined style={{ fontSize: 48, opacity: 0.12, marginBottom: 16, display: 'block' }} />
                <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Executive Summary Unavailable</div>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                    {data?.error || 'Ensure historical prices and fundamental data are synced for this symbol.'}
                </p>
            </Card>
        );
    }

    const actionCfg = getActionConfig(data?.action);
    const scoreColor = getScoreColor(data.health_score);
    const sm = data.sector_metrics || {};
    const isBanking = data.sector?.toLowerCase().match(/bank|finance|microfinance/);

    // Prepare quarterly profit chart data
    const profitChartData = [...(data.quarterly_profits || [])].reverse().map(q => ({
        quarter: q.quarter?.replace(/^0/, ''),
        value: q.value,
    }));

    return (
        <div className="animate-in">

            {/* ===== SECTION 1: Action Badge + Score ===== */}
            <div className="stat-card" style={{
                marginBottom: 20,
                padding: '20px 24px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: 16,
                background: actionCfg.bg,
                border: `1px solid ${actionCfg.color}33`,
                boxShadow: actionCfg.glow,
                borderRadius: 14
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    <div style={{
                        width: 50, height: 50, borderRadius: 12,
                        background: actionCfg.color, display: 'flex',
                        alignItems: 'center', justifyContent: 'center',
                        fontSize: 24, color: 'white',
                    }}>
                        {actionCfg.icon}
                    </div>
                    <div>
                        <div style={{ fontSize: 22, fontWeight: 800, color: actionCfg.color, letterSpacing: '0.5px' }}>
                            {data.action?.toUpperCase()}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 500 }}>
                            Aggregated Technical & Fundamental Signal
                        </div>
                    </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>Health Score</div>
                    <div style={{ fontSize: 28, fontWeight: 800, color: scoreColor }}>{data.health_score}<span style={{ fontSize: 14, fontWeight: 400 }}>/100</span></div>
                </div>
            </div>

            {/* ===== SECTION 2: Valuation Grid ===== */}
            <div className="stat-card" style={{ padding: '4px 0', marginBottom: 20 }}>
                <div style={{ fontSize: 10, textTransform: 'uppercase', color: 'var(--text-muted)', padding: '12px 20px 0', letterSpacing: '0.5px' }}>
                    <ExperimentOutlined /> Valuation
                </div>
                <Row gutter={0}>
                    <Col xs={12} sm={6}>
                        <MetricCard label="P/E Ratio" value={data.pe_ratio} color={data.pe_ratio < 20 ? '#00b894' : data.pe_ratio < 35 ? '#fdcb6e' : '#d63031'} tooltip="Price-to-Earnings. <20 is cheap for NEPSE." />
                    </Col>
                    <Col xs={12} sm={6}>
                        <MetricCard label="P/B Ratio" value={data.pb_ratio} color={data.pb_ratio < 2 ? '#00b894' : data.pb_ratio < 4 ? '#fdcb6e' : '#d63031'} tooltip="Price-to-Book. <2 is value territory." />
                    </Col>
                    <Col xs={12} sm={6}>
                        <MetricCard label="PEG Ratio" value={data.peg_ratio} suffix="" color={data.peg_ratio && data.peg_ratio < 1 ? '#00b894' : 'inherit'} tooltip="PE / EPS Growth. <1 = undervalued growth." />
                    </Col>
                    <Col xs={12} sm={6}>
                        <div style={{ textAlign: 'center', padding: '14px 8px' }}>
                            <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 8, letterSpacing: '0.3px' }}>Graham</div>
                            <div style={{ fontSize: 20, fontWeight: 700, color: '#6c5ce7' }}>
                                {data.graham_number ? formatNPR(data.graham_number) : '—'}
                            </div>
                            {data.graham_discount_pct != null && (
                                <Tag color={data.graham_discount_pct > 0 ? 'green' : 'red'} style={{ fontSize: 10, marginTop: 4 }}>
                                    {data.graham_discount_pct > 0 ? <RiseOutlined /> : <FallOutlined />} {Math.abs(data.graham_discount_pct).toFixed(1)}% {data.graham_discount_pct > 0 ? 'Disc.' : 'Prem.'}
                                </Tag>
                            )}
                        </div>
                    </Col>
                </Row>
            </div>

            {/* ===== SECTION 3: Profitability Grid ===== */}
            <div className="stat-card" style={{ padding: '4px 0', marginBottom: 20 }}>
                <div style={{ fontSize: 10, textTransform: 'uppercase', color: 'var(--text-muted)', padding: '12px 20px 0', letterSpacing: '0.5px' }}>
                    <StockOutlined /> Profitability
                </div>
                <Row gutter={0}>
                    <Col xs={12} sm={6}>
                        <MetricCard label="EPS (TTM)" value={data.eps_ttm} suffix="" color="#6c5ce7" tooltip="Earnings Per Share (Trailing 12 Months)" />
                    </Col>
                    <Col xs={12} sm={6}>
                        <MetricCard label="ROE (TTM)" value={data.roe_ttm} suffix="%" color={data.roe_ttm > 12 ? '#00b894' : '#fdcb6e'} tooltip="Return on Equity. >12% is good for NEPSE." />
                    </Col>
                    <Col xs={12} sm={6}>
                        <MetricCard label="Net Margin" value={data.npm ? (data.npm * 100) : null} suffix="%" color={data.npm && data.npm > 0.2 ? '#00b894' : 'inherit'} tooltip="Net Profit Margin (TTM)" />
                    </Col>
                    <Col xs={12} sm={6}>
                        <div style={{ textAlign: 'center', padding: '14px 8px' }}>
                            <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 8, letterSpacing: '0.3px' }}>Net Profit TTM</div>
                            <div style={{ fontSize: 18, fontWeight: 700, color: data.net_profit_ttm > 0 ? '#00b894' : '#d63031' }}>
                                {formatLargeNum(data.net_profit_ttm)}
                            </div>
                        </div>
                    </Col>
                </Row>
            </div>

            {/* ===== SECTION 4: Technical Snapshot + 52-Week ===== */}
            <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
                {/* 52-Week Range */}
                <Col xs={24} md={14}>
                    <div className="stat-card" style={{ padding: '16px 20px', height: '100%' }}>
                        <div style={{ fontSize: 10, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 10, letterSpacing: '0.5px' }}>
                            <BarChartOutlined /> 52-Week Range & Trend
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>
                            <span>Low: {formatNPR(data.low_52w)}</span>
                            <span>High: {formatNPR(data.high_52w)}</span>
                        </div>
                        <Progress
                            percent={data.placement_52w || 0}
                            showInfo={false}
                            strokeColor={{ '0%': '#d63031', '50%': '#fdcb6e', '100%': '#00b894' }}
                            trailColor="rgba(255,255,255,0.06)"
                            size={['100%', 10]}
                        />
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                            <span style={{ fontSize: 12, fontWeight: 600 }}>
                                LTP at {data.placement_52w?.toFixed(1) || 0}% of range
                            </span>
                            <Space size={4}>
                                {data.ema_200_status && (
                                    <Tag color={data.ema_200_status === 'Bullish' ? 'green' : 'red'} style={{ fontSize: 10, margin: 0 }}>
                                        {data.ema_200_status === 'Bullish' ? <RiseOutlined /> : <FallOutlined />} 200-SMA
                                    </Tag>
                                )}
                                {data.sma_50 && (
                                    <Tag color={data.ltp > data.sma_50 ? 'green' : 'red'} style={{ fontSize: 10, margin: 0 }}>
                                        {data.ltp > data.sma_50 ? <RiseOutlined /> : <FallOutlined />} 50-SMA
                                    </Tag>
                                )}
                                <Tag color="cyan" style={{ fontSize: 10, margin: 0 }}>
                                    <FireOutlined /> {data.profit_trend}
                                </Tag>
                            </Space>
                        </div>
                    </div>
                </Col>

                {/* RSI Gauge */}
                <Col xs={24} md={10}>
                    <div className="stat-card" style={{ padding: '16px 20px', height: '100%' }}>
                        <div style={{ fontSize: 10, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 10, letterSpacing: '0.5px' }}>
                            <DashboardOutlined /> RSI (14)
                        </div>
                        {data.rsi_14 ? (
                            <>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                    <div style={{ fontSize: 32, fontWeight: 800, color: getRSIColor(data.rsi_14) }}>
                                        {data.rsi_14.toFixed(1)}
                                    </div>
                                    <Tag color={data.rsi_14 >= 70 ? 'red' : data.rsi_14 <= 30 ? 'green' : 'blue'} style={{ fontSize: 11 }}>
                                        {data.rsi_14 >= 70 ? 'Overbought' : data.rsi_14 >= 60 ? 'Near Overbought' : data.rsi_14 >= 40 ? 'Neutral' : data.rsi_14 >= 30 ? 'Near Oversold' : 'Oversold'}
                                    </Tag>
                                </div>
                                <Progress percent={data.rsi_14} showInfo={false} strokeColor={getRSIColor(data.rsi_14)} trailColor="rgba(255,255,255,0.06)" style={{ marginTop: 8 }} />
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'var(--text-muted)', marginTop: 2 }}>
                                    <span>Oversold</span><span>Neutral</span><span>Overbought</span>
                                </div>
                            </>
                        ) : (
                            <div style={{ color: 'var(--text-muted)', fontSize: 12, padding: '10px 0' }}>Insufficient data for RSI.</div>
                        )}
                    </div>
                </Col>
            </Row>

            {/* ===== SECTION 5: Sector Health (conditional) ===== */}
            {(sm.npl != null || sm.car != null || sm.reserves != null) && (
                <div className="stat-card" style={{ padding: '4px 0', marginBottom: 20 }}>
                    <div style={{ fontSize: 10, textTransform: 'uppercase', color: 'var(--text-muted)', padding: '12px 20px 0', letterSpacing: '0.5px' }}>
                        <BankOutlined /> Sector Health — {data.sector}
                    </div>
                    <Row gutter={0}>
                        {sm.npl != null && (
                            <Col xs={12} sm={6}>
                                <MetricCard label="NPL" value={sm.npl} suffix="%" color={sm.npl < 3 ? '#00b894' : sm.npl < 5 ? '#fdcb6e' : '#d63031'} tooltip="Non-Performing Loan. <3% is healthy." />
                            </Col>
                        )}
                        {sm.car != null && (
                            <Col xs={12} sm={6}>
                                <MetricCard label="CAR" value={sm.car} suffix="%" color={sm.car > 11 ? '#00b894' : '#d63031'} tooltip="Capital Adequacy Ratio. >11% is regulatory minimum." />
                            </Col>
                        )}
                        {sm.cd_ratio != null && (
                            <Col xs={12} sm={6}>
                                <MetricCard label="CD Ratio" value={sm.cd_ratio} suffix="%" color={sm.cd_ratio < 80 ? '#00b894' : '#fdcb6e'} tooltip="Credit-to-Deposit Ratio. <80% preferred." />
                            </Col>
                        )}
                        {sm.cost_of_funds != null && (
                            <Col xs={12} sm={6}>
                                <MetricCard label="Cost of Funds" value={sm.cost_of_funds} suffix="%" color="var(--text-primary)" tooltip="Average cost of borrowing." />
                            </Col>
                        )}
                        {sm.interest_spread != null && (
                            <Col xs={12} sm={6}>
                                <MetricCard label="Interest Spread" value={sm.interest_spread} suffix="%" color={sm.interest_spread > 3 ? '#00b894' : '#fdcb6e'} tooltip="Rate spread. Higher = better margins." />
                            </Col>
                        )}
                        {sm.reserves != null && !isBanking && (
                            <Col xs={12} sm={6}>
                                <MetricCard label="Reserves" value={sm.reserves > 1e6 ? `${(sm.reserves / 1e6).toFixed(1)}M` : sm.reserves?.toLocaleString()} suffix="" color={sm.reserves > 0 ? '#00b894' : '#d63031'} tooltip="Reserves and Surplus" />
                            </Col>
                        )}
                        {sm.distributable_profit != null && (
                            <Col xs={12} sm={6}>
                                <MetricCard label="Dist. Profit" value={sm.distributable_profit > 1e6 ? `${(sm.distributable_profit / 1e6).toFixed(1)}M` : sm.distributable_profit?.toLocaleString()} suffix="" color={sm.distributable_profit > 0 ? '#00b894' : '#d63031'} tooltip="Distributable profit available for dividends." />
                            </Col>
                        )}
                    </Row>
                </div>
            )}

            {/* ===== SECTION 6: Dividends + Profit Trajectory ===== */}
            <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
                {/* Dividend Panel */}
                <Col xs={24} md={10}>
                    <div className="stat-card" style={{ padding: '16px 20px', height: '100%' }}>
                        <div style={{ fontSize: 10, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 10, letterSpacing: '0.5px' }}>
                            <DollarOutlined /> Dividend Yield
                        </div>
                        <div style={{ fontSize: 28, fontWeight: 700, color: data.dividend_yield > 3 ? '#00b894' : data.dividend_yield > 0 ? '#fdcb6e' : 'var(--text-muted)', marginBottom: 6 }}>
                            {data.dividend_yield}%
                        </div>
                        <div style={{ maxHeight: 120, overflowY: 'auto' }}>
                            <table style={{ width: '100%', fontSize: 11 }}>
                                <thead>
                                    <tr style={{ color: 'var(--text-muted)', borderBottom: '1px solid var(--border-color)' }}>
                                        <th style={{ textAlign: 'left', fontWeight: 400, paddingBottom: 4 }}>FY</th>
                                        <th style={{ textAlign: 'right', fontWeight: 400, paddingBottom: 4 }}>Cash</th>
                                        <th style={{ textAlign: 'right', fontWeight: 400, paddingBottom: 4 }}>Bonus</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.dividend_history?.map((h, i) => (
                                        <tr key={i} style={{ borderBottom: i < data.dividend_history.length - 1 ? '1px solid rgba(255,255,255,0.02)' : 'none' }}>
                                            <td style={{ padding: '5px 0', fontSize: 11 }}>{h.fy}</td>
                                            <td style={{ textAlign: 'right', color: '#00b894' }}>{h.cash}%</td>
                                            <td style={{ textAlign: 'right', color: '#6c5ce7' }}>{h.bonus}%</td>
                                        </tr>
                                    ))}
                                    {(!data.dividend_history || data.dividend_history.length === 0) && (
                                        <tr><td colSpan={3} style={{ textAlign: 'center', padding: '10px 0', opacity: 0.5 }}>No records</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </Col>

                {/* Quarterly Profit Trajectory Chart */}
                <Col xs={24} md={14}>
                    <div className="stat-card" style={{ padding: '16px 20px', height: '100%' }}>
                        <div style={{ fontSize: 10, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 10, letterSpacing: '0.5px' }}>
                            <LineChartOutlined /> Quarterly Net Profit Trajectory
                        </div>
                        {profitChartData.length > 0 ? (
                            <ResponsiveContainer width="100%" height={140}>
                                <BarChart data={profitChartData} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                                    <XAxis dataKey="quarter" tick={{ fontSize: 9, fill: 'var(--text-muted)' }} />
                                    <YAxis tick={{ fontSize: 9, fill: 'var(--text-muted)' }} tickFormatter={v => v >= 1e6 ? `${(v/1e6).toFixed(0)}M` : v >= 1e3 ? `${(v/1e3).toFixed(0)}K` : v} />
                                    <RechartsTooltip
                                        contentStyle={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 8, fontSize: 12 }}
                                        formatter={(val) => [val?.toLocaleString('en-IN'), 'Net Profit']}
                                    />
                                    <Bar dataKey="value" radius={[3, 3, 0, 0]}>
                                        {profitChartData.map((entry, idx) => (
                                            <Cell key={idx} fill={entry.value > 0 ? '#00b894' : '#d63031'} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        ) : (
                            <div style={{ color: 'var(--text-muted)', fontSize: 12, padding: '30px 0', textAlign: 'center' }}>No quarterly data available.</div>
                        )}
                    </div>
                </Col>
            </Row>

            {/* ===== SECTION 7: Score Breakdown ===== */}
            <div className="stat-card" style={{ padding: '16px 20px', marginBottom: 20 }}>
                <div style={{ fontSize: 10, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 10, letterSpacing: '0.5px' }}>
                    <DashboardOutlined /> Score Breakdown
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 6 }}>
                    {data.score_breakdown?.map((item, i) => (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, padding: '5px 10px', background: item.met ? 'rgba(0,184,148,0.06)' : 'rgba(214,48,49,0.04)', borderRadius: 6 }}>
                            <span style={{ color: item.met ? 'var(--accent-green)' : 'var(--text-muted)' }}>
                                {item.met ? <CheckCircleOutlined /> : <CloseCircleOutlined />} {item.label}
                            </span>
                            <span style={{ fontWeight: 600, color: item.met ? 'var(--accent-green)' : 'var(--text-muted)', fontSize: 11 }}>
                                +{item.pts}
                            </span>
                        </div>
                    ))}
                </div>
            </div>

            {/* ===== SECTION 8: AI Analyst Narrative ===== */}
            <div className="stat-card" style={{ padding: '20px 24px', marginBottom: 24, border: '1px solid rgba(108, 92, 231, 0.2)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
                    <div style={{ fontSize: 15, fontWeight: 700 }}>
                        <RobotOutlined style={{ color: '#6c5ce7', marginRight: 8 }} />
                        AI Analyst Narrative
                    </div>
                    <Space>
                        <Select
                            size="small"
                            value={selectedModel}
                            onChange={setSelectedModel}
                            style={{ width: 200 }}
                            dropdownStyle={{ borderRadius: 8 }}
                        >
                            {models.map(m => (
                                <Select.Option key={m} value={m}>
                                    {m.split(':')[0].toUpperCase()} ({m.split(':')[1] || 'latest'})
                                </Select.Option>
                            ))}
                        </Select>
                        <Button
                            type="primary"
                            size="small"
                            icon={<ThunderboltOutlined />}
                            onClick={() => generateAI()}
                            loading={aiLoading}
                        >
                            Generate
                        </Button>
                    </Space>
                </div>

                {aiLoading ? (
                    <div style={{ textAlign: 'center', padding: '36px 0' }}>
                        <Spin size="large" />
                        <div style={{ marginTop: 14, color: 'var(--text-muted)', fontSize: 12 }}>
                            {selectedModel.split(':')[0].toUpperCase()} is analyzing {data.symbol}...
                        </div>
                    </div>
                ) : aiData ? (
                    <div>
                        {aiData.status === 'error' ? (
                            <Alert
                                message="AI Analysis Interrupted"
                                description={aiData.logic}
                                type="warning"
                                showIcon
                                icon={<WarningOutlined />}
                                style={{ marginBottom: 16 }}
                                action={
                                    <Button size="small" danger ghost onClick={() => generateAI()}>
                                        Retry
                                    </Button>
                                }
                            />
                        ) : (
                            <>
                                <div style={{ marginBottom: 16 }}>
                                    <Tag
                                        style={{ fontSize: 15, padding: '5px 18px', borderRadius: 8, fontWeight: 700, letterSpacing: '1px' }}
                                        color={
                                            aiData.verdict === 'BUY' ? 'green'
                                                : aiData.verdict === 'SELL' ? 'red'
                                                    : aiData.verdict === 'ACCUMULATE' ? 'blue'
                                                        : 'gold'
                                        }
                                    >
                                        {aiData.verdict}
                                    </Tag>
                                    {aiData.model_used && (
                                        <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 8 }}>
                                            via {aiData.model_used}
                                        </span>
                                    )}
                                </div>

                                <div style={{
                                    fontSize: 13, lineHeight: 1.7, color: 'var(--text-secondary)',
                                    padding: '14px', background: 'rgba(108, 92, 231, 0.04)',
                                    borderRadius: 10, border: '1px solid rgba(108, 92, 231, 0.1)',
                                    marginBottom: 16,
                                }}>
                                    {aiData.logic}
                                </div>

                                <Row gutter={[16, 16]}>
                                    <Col xs={24} sm={12}>
                                        <div style={{ fontSize: 10, textTransform: 'uppercase', color: 'var(--accent-green)', marginBottom: 6, letterSpacing: '0.5px' }}>
                                            Foundation Analysis
                                        </div>
                                        <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                                            {aiData.foundation}
                                        </div>
                                    </Col>
                                    <Col xs={24} sm={12}>
                                        <div style={{ fontSize: 10, textTransform: 'uppercase', color: '#0984e3', marginBottom: 6, letterSpacing: '0.5px' }}>
                                            Timing & Entry
                                        </div>
                                        <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                                            {aiData.timing}
                                        </div>
                                    </Col>
                                </Row>
                            </>
                        )}
                    </div>
                ) : (
                    <div style={{ textAlign: 'center', padding: '36px 0', color: 'var(--text-muted)', background: 'rgba(255,255,255,0.01)', borderRadius: 10 }}>
                        <RobotOutlined style={{ fontSize: 36, opacity: 0.1, marginBottom: 12, display: 'block' }} />
                        <div style={{ fontSize: 13, fontWeight: 500 }}>
                            Ready for AI-Powered Analysis
                        </div>
                        <div style={{ fontSize: 11, marginTop: 6, maxWidth: 280, margin: '6px auto 0', opacity: 0.6 }}>
                            Select a model and click &quot;Generate&quot; for an AI synthesis of all metrics above.
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
