import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Row, Col, Tag, Progress, Spin, Card, Button, Divider, Space, Tooltip } from 'antd';
import {
    RobotOutlined, CheckCircleOutlined, CloseCircleOutlined,
    RiseOutlined, FallOutlined, ThunderboltOutlined,
    ExperimentOutlined, DashboardOutlined, InfoCircleOutlined,
    FireOutlined, SafetyOutlined, DollarOutlined,
} from '@ant-design/icons';
import { getExecutiveSummary, getAIVerdict } from '../../services/api';

function formatNPR(value) {
    if (value === null || value === undefined) return '—';
    return `Rs. ${Number(value).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function getScoreColor(score) {
    if (score >= 80) return '#00b894';
    if (score >= 60) return '#00cec9';
    if (score >= 40) return '#fdcb6e';
    return '#d63031';
}

function getActionConfig(action) {
    switch (action) {
        case 'Strong Buy':
            return { color: '#00b894', bg: 'rgba(0,184,148,0.12)', icon: <ThunderboltOutlined />, glow: '0 0 20px rgba(0,184,148,0.3)' };
        case 'Accumulate':
            return { color: '#0984e3', bg: 'rgba(9,132,227,0.12)', icon: <RiseOutlined />, glow: '0 0 20px rgba(9,132,227,0.3)' };
        case 'Hold':
            return { color: '#fdcb6e', bg: 'rgba(253,203,110,0.12)', icon: <SafetyOutlined />, glow: '0 0 20px rgba(253,203,110,0.2)' };
        case 'Avoid':
            return { color: '#d63031', bg: 'rgba(214,48,49,0.12)', icon: <CloseCircleOutlined />, glow: '0 0 20px rgba(214,48,49,0.3)' };
        default:
            return { color: 'var(--text-secondary)', bg: 'rgba(255,255,255,0.05)', icon: <InfoCircleOutlined />, glow: 'none' };
    }
}

export default function ExecutiveSummary({ symbol }) {
    const { data, isLoading } = useQuery({
        queryKey: ['executive-summary', symbol],
        queryFn: () => getExecutiveSummary(symbol).then(r => r.data),
        enabled: !!symbol,
    });

    const [aiData, setAiData] = useState(null);
    const aiMutation = useMutation({
        mutationFn: () => getAIVerdict(symbol).then(r => r.data),
        onSuccess: (result) => setAiData(result),
    });

    if (isLoading) {
        return (
            <div style={{ textAlign: 'center', padding: '80px 0' }}>
                <Spin size="large" />
                <div style={{ marginTop: 16, color: 'var(--text-secondary)', fontSize: 13 }}>
                    Synthesizing fundamentals, technicals, and valuations...
                </div>
            </div>
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

    const actionCfg = getActionConfig(data.action);
    const scoreColor = getScoreColor(data.health_score);

    return (
        <div className="animate-in">

            {/* Top Row: Score + Graham + Dividend */}
            <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>

                {/* Health Score */}
                <Col xs={24} sm={8}>
                    <div className="stat-card" style={{ padding: '24px', textAlign: 'center' }}>
                        <div style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 16, letterSpacing: '0.5px' }}>
                            <DashboardOutlined /> Health Score
                        </div>
                        <Progress
                            type="dashboard"
                            percent={data.health_score}
                            strokeColor={scoreColor}
                            trailColor="rgba(255,255,255,0.06)"
                            format={(pct) => (
                                <div>
                                    <div style={{ fontSize: 32, fontWeight: 700, color: scoreColor }}>{pct}</div>
                                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>/ 100</div>
                                </div>
                            )}
                            size={160}
                        />
                        <div style={{ marginTop: 16 }}>
                            {data.score_breakdown?.map((item, i) => (
                                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, padding: '3px 0' }}>
                                    <span style={{ color: item.met ? 'var(--accent-green)' : 'var(--text-muted)' }}>
                                        {item.met ? <CheckCircleOutlined /> : <CloseCircleOutlined />} {item.label}
                                    </span>
                                    <span style={{ fontWeight: 600, color: item.met ? 'var(--accent-green)' : 'var(--text-muted)' }}>
                                        +{item.pts}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                </Col>

                {/* Graham Number */}
                <Col xs={24} sm={8}>
                    <div className="stat-card" style={{ padding: '24px' }}>
                        <div style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 16, letterSpacing: '0.5px' }}>
                            <ExperimentOutlined /> Graham Valuation
                        </div>
                        {data.graham_number ? (
                            <>
                                <div style={{ fontSize: 28, fontWeight: 700, color: '#6c5ce7', marginBottom: 4 }}>
                                    {formatNPR(data.graham_number)}
                                </div>
                                <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12 }}>
                                    LTP: {formatNPR(data.ltp)}
                                </div>
                                <Tag
                                    color={data.graham_discount_pct > 0 ? 'green' : 'red'}
                                    style={{ fontSize: 14, padding: '4px 12px', borderRadius: 6, fontWeight: 600 }}
                                >
                                    {data.graham_discount_pct > 0 ? (
                                        <><RiseOutlined /> {data.graham_discount_pct}% Discount</>
                                    ) : (
                                        <><FallOutlined /> {Math.abs(data.graham_discount_pct)}% Premium</>
                                    )}
                                </Tag>
                                <Divider style={{ margin: '16px 0', borderColor: 'var(--border-color)' }} />
                                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                                        <span>EPS (TTM)</span><span style={{ fontWeight: 600 }}>Rs. {data.eps_ttm?.toFixed(2) || '—'}</span>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                                        <span>Book Value</span><span style={{ fontWeight: 600 }}>Rs. {data.bvps?.toFixed(2) || '—'}</span>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                        <span>P/E Ratio</span><span style={{ fontWeight: 600 }}>{data.pe_ratio?.toFixed(2) || '—'}</span>
                                    </div>
                                </div>
                            </>
                        ) : (
                            <div style={{ color: 'var(--text-muted)', fontSize: 14, padding: '20px 0' }}>
                                <InfoCircleOutlined /> Graham's Number is N/A<br />
                                <span style={{ fontSize: 12 }}>
                                    Requires positive EPS and Book Value to compute.
                                </span>
                            </div>
                        )}
                    </div>
                </Col>

                {/* Dividend Yield */}
                <Col xs={24} sm={8}>
                    <div className="stat-card" style={{ padding: '24px' }}>
                        <div style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 16, letterSpacing: '0.5px' }}>
                            <DollarOutlined /> Dividend Yield
                        </div>
                        <div style={{ fontSize: 28, fontWeight: 700, color: data.dividend_yield > 3 ? '#00b894' : data.dividend_yield > 0 ? '#fdcb6e' : 'var(--text-muted)', marginBottom: 4 }}>
                            {data.dividend_yield}%
                        </div>
                        <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12 }}>
                            Based on latest cash distribution
                        </div>
                        <Divider style={{ margin: '12px 0', borderColor: 'var(--border-color)' }} />
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                                <span>Cash Div %</span><span style={{ fontWeight: 600 }}>{data.cash_dividend_pct}%</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                                <span>Bonus Div %</span><span style={{ fontWeight: 600 }}>{data.bonus_dividend_pct}%</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span>Face Value</span><span style={{ fontWeight: 600 }}>Rs. {data.face_value}</span>
                            </div>
                        </div>
                        {data.bonus_dividend_pct > 0 && data.cash_dividend_pct > 0 && (
                            <div style={{ marginTop: 12, fontSize: 11, color: 'var(--text-muted)', background: 'rgba(253,203,110,0.08)', padding: '8px 10px', borderRadius: 8 }}>
                                <InfoCircleOutlined /> Cash dividend of Rs. {(data.cash_dividend_pct / 100 * data.face_value).toFixed(2)}/share
                                {data.cash_dividend_pct / 100 * data.face_value > data.bonus_dividend_pct * 0.05 * data.face_value
                                    ? ' covers the 5% bonus tax.'
                                    : ' may not fully cover the 5% bonus tax.'}
                            </div>
                        )}
                    </div>
                </Col>
            </Row>

            {/* Action Badge */}
            <div className="stat-card" style={{
                marginBottom: 24,
                padding: '20px 24px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: 16,
                background: actionCfg.bg,
                border: `1px solid ${actionCfg.color}33`,
                boxShadow: actionCfg.glow,
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    <div style={{
                        width: 48, height: 48, borderRadius: 12,
                        background: actionCfg.color, display: 'flex',
                        alignItems: 'center', justifyContent: 'center',
                        fontSize: 22, color: 'white',
                    }}>
                        {actionCfg.icon}
                    </div>
                    <div>
                        <div style={{ fontSize: 22, fontWeight: 700, color: actionCfg.color }}>
                            {data.action}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                            Based on Health Score ({data.health_score}/100), RSI ({data.rsi_14 || 'N/A'}), and technical trend
                        </div>
                    </div>
                </div>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                    {data.ema_200_status && (
                        <Tag color={data.ema_200_status === 'Bullish' ? 'green' : 'red'} style={{ fontSize: 12, padding: '2px 10px' }}>
                            {data.ema_200_status === 'Bullish' ? <RiseOutlined /> : <FallOutlined />} 200-SMA {data.ema_200_status}
                        </Tag>
                    )}
                    <Tag style={{ fontSize: 12, padding: '2px 10px' }}>
                        <FireOutlined /> Profit: {data.profit_trend}
                    </Tag>
                    <Tag style={{ fontSize: 12, padding: '2px 10px' }}>
                        Capital: {data.capital_trend}
                    </Tag>
                </div>
            </div>

            {/* AI Analyst Narrative */}
            <div className="stat-card" style={{ padding: '24px', marginBottom: 24 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                    <div style={{ fontSize: 16, fontWeight: 600 }}>
                        <RobotOutlined style={{ color: '#6c5ce7', marginRight: 8 }} />
                        AI Analyst Narrative
                    </div>
                    <Button
                        type="primary"
                        ghost
                        size="small"
                        icon={<RobotOutlined />}
                        onClick={() => aiMutation.mutate()}
                        loading={aiMutation.isPending}
                    >
                        Generate Analysis
                    </Button>
                </div>

                {aiMutation.isPending ? (
                    <div style={{ textAlign: 'center', padding: '40px 0' }}>
                        <Spin size="large" />
                        <div style={{ marginTop: 16, color: 'var(--accent-primary)', fontSize: 13 }}>
                            DeepSeek is analyzing 2 years of financial trajectories...
                        </div>
                    </div>
                ) : aiData ? (
                    <div>
                        <div style={{ marginBottom: 20 }}>
                            <Tag
                                style={{
                                    fontSize: 16, padding: '6px 20px', borderRadius: 8,
                                    fontWeight: 700, letterSpacing: '1px',
                                }}
                                color={
                                    aiData.verdict === 'BUY' ? 'green'
                                        : aiData.verdict === 'SELL' ? 'red'
                                            : aiData.verdict === 'ACCUMULATE' ? 'blue'
                                                : 'gold'
                                }
                            >
                                {aiData.verdict}
                            </Tag>
                        </div>

                        <div style={{
                            fontSize: 14, lineHeight: 1.7, color: 'var(--text-secondary)',
                            padding: '16px', background: 'rgba(108, 92, 231, 0.04)',
                            borderRadius: 10, border: '1px solid rgba(108, 92, 231, 0.1)',
                            marginBottom: 20,
                        }}>
                            {aiData.logic}
                        </div>

                        <Row gutter={[16, 16]}>
                            <Col xs={24} sm={12}>
                                <div style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--accent-green)', marginBottom: 6, letterSpacing: '0.5px' }}>
                                    Foundation Analysis
                                </div>
                                <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                                    {aiData.foundation}
                                </div>
                            </Col>
                            <Col xs={24} sm={12}>
                                <div style={{ fontSize: 11, textTransform: 'uppercase', color: '#0984e3', marginBottom: 6, letterSpacing: '0.5px' }}>
                                    Timing & Entry
                                </div>
                                <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                                    {aiData.timing}
                                </div>
                            </Col>
                        </Row>
                    </div>
                ) : (
                    <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text-muted)' }}>
                        <RobotOutlined style={{ fontSize: 36, opacity: 0.15, marginBottom: 12, display: 'block' }} />
                        <div style={{ fontSize: 13 }}>
                            Click "Generate Analysis" to get an AI-powered synthesis of all data points.
                        </div>
                        <div style={{ fontSize: 11, marginTop: 6, opacity: 0.6 }}>
                            Requires local Ollama instance with deepseek-r1:1.5b model.
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
