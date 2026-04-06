import { useMemo } from 'react';
import { Row, Col, Empty } from 'antd';
import {
    AlertOutlined,
    PieChartOutlined,
    ExperimentOutlined,
    WarningOutlined,
    BulbOutlined,
} from '@ant-design/icons';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
    ResponsiveContainer, Cell, ReferenceLine,
} from 'recharts';
import { Table, Tag, Tooltip, Space, Button, Card, Typography, Spin, Collapse, Divider } from 'antd';
import { 
    CheckCircleOutlined,
    CloseCircleOutlined,
    InfoCircleOutlined,
    RobotOutlined,
    ThunderboltOutlined,
    LoadingOutlined,
    SyncOutlined,
    RocketOutlined,
    ArrowDownOutlined,
} from '@ant-design/icons';
import { getAIReview } from '../../services/api';
import { useState } from 'react';

const { Paragraph, Text, Title } = Typography;
const { Panel } = Collapse;

function formatNPR(value) {
    if (value === null || value === undefined) return '—';
    return `Rs. ${Number(value).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function RiskTab({ summary, context, members }) {

    const totalPortfolioValue = useMemo(() => {
        return summary?.holdings?.reduce((sum, h) => sum + (h.current_value || h.total_investment || 0), 0) || 0;
    }, [summary]);

    // Top 3 holdings by value
    const topHoldings = useMemo(() => {
        if (!summary?.holdings) return [];
        return [...summary.holdings]
            .sort((a, b) => (b.current_value || 0) - (a.current_value || 0))
            .slice(0, 3)
            .map(h => ({
                symbol: h.symbol,
                member: h.member_name,
                value: h.current_value || h.total_investment || 0,
                pct: totalPortfolioValue > 0 ? (((h.current_value || h.total_investment || 0) / totalPortfolioValue) * 100).toFixed(1) : 0,
            }));
    }, [summary, totalPortfolioValue]);

    // Largest single holding
    const largestHolding = topHoldings[0] || null;

    // Sector concentration
    const sectorData = useMemo(() => {
        if (!summary?.holdings) return [];
        const sectorMap = {};
        summary.holdings.forEach(h => {
            const sector = (h.sector && h.sector.trim()) || 'Other';
            if (!sectorMap[sector]) sectorMap[sector] = 0;
            sectorMap[sector] += (h.current_value || h.total_investment || 0);
        });
        return Object.entries(sectorMap)
            .map(([name, value]) => ({
                name,
                value,
                pct: totalPortfolioValue > 0 ? ((value / totalPortfolioValue) * 100) : 0,
                flagged: totalPortfolioValue > 0 && ((value / totalPortfolioValue) * 100) > 40,
            }))
            .sort((a, b) => b.value - a.value);
    }, [summary, totalPortfolioValue]);

    // Unique sectors
    const uniqueSectors = sectorData.length;
    const flaggedSectors = sectorData.filter(s => s.flagged);

    // Auto-generated insights
    const insights = useMemo(() => {
        const items = [];
        if (!summary?.holdings?.length) return items;

        // Concentration warning
        if (largestHolding && Number(largestHolding.pct) > 30) {
            items.push({
                type: 'warning',
                icon: <WarningOutlined />,
                text: `${largestHolding.symbol} makes up ${largestHolding.pct}% of your portfolio. Consider diversifying.`,
            });
        }

        // Sector over-concentration
        flaggedSectors.forEach(s => {
            items.push({
                type: 'warning',
                icon: <AlertOutlined />,
                text: `${s.name} sector is ${s.pct.toFixed(1)}% of portfolio — exceeds 40% threshold.`,
            });
        });

        // Low diversification
        if (uniqueSectors < 3 && summary.holdings.length > 3) {
            items.push({
                type: 'danger',
                icon: <ExperimentOutlined />,
                text: `Only ${uniqueSectors} sector(s) across ${summary.holdings.length} holdings. Consider broader sector exposure.`,
            });
        }

        // Cross-member insights (for group mode)
        if (context?.type === 'group') {
            const memberHoldings = {};
            summary.holdings.forEach(h => {
                const sym = h.symbol;
                const member = h.member_name;
                if (!memberHoldings[sym]) memberHoldings[sym] = [];
                memberHoldings[sym].push({
                    member,
                    value: h.current_value || h.total_investment || 0,
                });
            });

            // Find symbols where one member dominates
            Object.entries(memberHoldings).forEach(([symbol, entries]) => {
                if (entries.length > 1) {
                    const total = entries.reduce((s, e) => s + e.value, 0);
                    entries.forEach(e => {
                        const pct = total > 0 ? ((e.value / total) * 100) : 0;
                        if (pct > 70) {
                            items.push({
                                type: 'warning',
                                icon: <BulbOutlined />,
                                text: `${e.member} holds ${pct.toFixed(0)}% of the group's ${symbol} exposure.`,
                            });
                        }
                    });
                }
            });
        }

        // Positive insight
        if (summary.unrealized_pnl > 0) {
            items.push({
                type: 'success',
                icon: <BulbOutlined />,
                text: `Portfolio is in profit: ${formatNPR(summary.unrealized_pnl)} (${summary.pnl_pct > 0 ? '+' : ''}${summary.pnl_pct}%).`,
            });
        }

        return items;
    }, [summary, context, largestHolding, flaggedSectors, uniqueSectors]);

    if (!summary?.holdings?.length) {
        return <Empty description="No holdings data for risk analysis." style={{ marginTop: 60 }} />;
    }

    const COLORS = ['#6c5ce7', '#00b894', '#fdcb6e', '#e17055', '#0984e3', '#d63031', '#e84393', '#00cec9'];

    const matrixColumns = [
        {
            title: 'Symbol',
            key: 'symbol',
            render: (_, h) => (
                <div>
                    <div style={{ fontWeight: 700, color: 'var(--accent-secondary)' }}>{h.symbol}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{h.sector}</div>
                </div>
            )
        },
        {
            title: 'Security Status',
            key: 'status',
            render: (_, h) => {
                let status = { label: 'Hold', color: 'blue', emoji: '✅' };
                if (h.is_fundamental_risk && h.is_technical_downtrend) {
                    status = { label: 'Strong Sell', color: '#d63031', emoji: '🚨' };
                } else if (h.is_fundamental_risk && !h.is_technical_downtrend) {
                    status = { label: 'Value Trap', color: '#fdcb6e', emoji: '⚠️' };
                } else if (!h.is_fundamental_risk && h.is_technical_downtrend) {
                    status = { label: 'Tech. Correction', color: '#0984e3', emoji: '📉' };
                } else {
                    status = { label: 'Clear', color: '#00b894', emoji: '✅' };
                }
                return (
                    <Space>
                        <span style={{ fontSize: 16 }}>{status.emoji}</span>
                        <span style={{ fontWeight: 600, color: status.color, fontSize: 12 }}>{status.label}</span>
                    </Space>
                );
            }
        },
        {
            title: 'Risk Check',
            key: 'risk',
            render: (_, h) => (
                <Space direction="vertical" size={2}>
                    {h.is_fundamental_risk ? (
                        <Tag color="error" style={{ margin: 0, border: 'none', background: 'rgba(214, 48, 49, 0.15)', color: '#ff7675' }}>⚠️ Fund. Risk</Tag>
                    ) : (
                        <Tag color="success" style={{ margin: 0, border: 'none', background: 'rgba(0, 184, 148, 0.1)', color: '#55efc4' }}>✓ Fund. OK</Tag>
                    )}
                    {h.is_technical_downtrend ? (
                        <Tag color="warning" style={{ margin: 0, border: 'none', background: 'rgba(253, 203, 110, 0.15)', color: '#ffeaa7' }}>📉 Tech. Down</Tag>
                    ) : (
                        <Tag color="success" style={{ margin: 0, border: 'none', background: 'rgba(0, 184, 148, 0.1)', color: '#55efc4' }}>✓ Tech. OK</Tag>
                    )}
                </Space>
            )
        },
        {
            title: 'LTP',
            key: 'ltp',
            align: 'right',
            render: (_, h) => <span style={{ fontWeight: 600 }}>{formatNPR(h.ltp)}</span>
        },
        {
            title: 'Graham P.',
            key: 'graham',
            align: 'right',
            render: (_, h) => <span style={{ color: 'var(--text-secondary)' }}>{h.graham_number ? h.graham_number.toFixed(0) : '—'}</span>
        },
        {
            title: 'Value Gap',
            key: 'gap',
            align: 'right',
            render: (_, h) => {
                const grahamGap = h.graham_number ? ((h.ltp - h.graham_number) / h.graham_number * 100) : null;
                if (grahamGap === null) return '—';
                return (
                    <span style={{ color: grahamGap > 0 ? 'var(--accent-red)' : 'var(--accent-green)', fontWeight: 600 }}>
                        {grahamGap > 0 ? '+' : ''}{grahamGap.toFixed(1)}%
                    </span>
                );
            }
        },
        {
            title: 'Proj. YoC',
            key: 'yoc',
            align: 'right',
            render: (_, h) => <span style={{ fontWeight: 600, color: 'var(--accent-primary)' }}>{(h.yoc || 0).toFixed(2)}%</span>
        }
    ];

    return (
        <div className="animate-in">

            {/* Insights Panel */}
            <div style={{ marginBottom: 24 }}>
                <div className="section-title"><BulbOutlined /> Auto-Generated Insights</div>
                {insights.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {insights.map((insight, i) => (
                            <div key={i} className={`insight-card ${insight.type}`}>
                                {insight.icon} <span style={{ marginLeft: 8 }}>{insight.text}</span>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="insight-card success">
                        <BulbOutlined /> <span style={{ marginLeft: 8 }}>Portfolio looks well-diversified. No concentration warnings.</span>
                    </div>
                )}
            </div>

            {/* Risk Metrics Row */}
            <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
                <Col xs={24} sm={8}>
                    <div className="stat-card">
                        <div className="stat-label"><AlertOutlined /> Largest Holding</div>
                        <div className="stat-value" style={{ fontSize: 22 }}>
                            {largestHolding?.symbol || '—'}
                        </div>
                        <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>
                            {largestHolding ? `${largestHolding.pct}% of portfolio (${formatNPR(largestHolding.value)})` : ''}
                        </div>
                    </div>
                </Col>
                <Col xs={24} sm={8}>
                    <div className="stat-card">
                        <div className="stat-label"><PieChartOutlined /> Unique Sectors</div>
                        <div className="stat-value">{uniqueSectors}</div>
                        <div style={{ fontSize: 13, color: flaggedSectors.length > 0 ? 'var(--accent-yellow)' : 'var(--accent-green)', marginTop: 4 }}>
                            {flaggedSectors.length > 0 ? `${flaggedSectors.length} sector(s) over 40%` : 'No over-concentrated sectors'}
                        </div>
                    </div>
                </Col>
                <Col xs={24} sm={8}>
                    <div className="stat-card">
                        <div className="stat-label"><ExperimentOutlined /> Top 3 Concentration</div>
                        <div className="stat-value" style={{ fontSize: 22 }}>
                            {topHoldings.reduce((sum, h) => sum + Number(h.pct), 0).toFixed(1)}%
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                            {topHoldings.map(h => h.symbol).join(', ')}
                        </div>
                    </div>
                </Col>
            </Row>

            {/* Value-Risk Matrix Table */}
            <div className="stat-card" style={{ padding: 0, marginBottom: 24, overflow: 'hidden' }}>
                <div style={{ padding: '16px 24px', background: 'var(--bg-tertiary)', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontSize: 16, fontWeight: 600 }}>
                        <ExperimentOutlined /> Value-Risk Matrix
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                        <InfoCircleOutlined /> Graham's Number based valuation vs Technical Trends
                    </div>
                </div>
                <Table 
                    columns={matrixColumns} 
                    dataSource={summary.holdings} 
                    rowKey="id" 
                    pagination={{ pageSize: 15 }} 
                    size="middle" 
                    className="portfolio-table"
                />
            </div>

            {/* Sector Concentration Bar */}
            <div className="chart-card" style={{ height: Math.max(300, sectorData.length * 45 + 80) }}>
                <div className="chart-title">
                    <PieChartOutlined /> Sector Concentration
                </div>
                <div style={{ flex: 1, minHeight: 0 }}>
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={sectorData} layout="vertical" margin={{ top: 5, right: 30, left: 80, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />
                            <XAxis type="number" stroke="var(--text-secondary)" tick={{ fontSize: 11 }} tickFormatter={v => `${v.toFixed(0)}%`} />
                            <YAxis type="category" dataKey="name" stroke="var(--text-secondary)" tick={{ fontSize: 12 }} width={70} />
                            <RechartsTooltip
                                content={({ active, payload }) => {
                                    if (active && payload?.length) {
                                        const d = payload[0].payload;
                                        return (
                                            <div style={{ background: 'var(--bg-secondary)', padding: '10px 15px', borderRadius: 8, border: '1px solid var(--border-color)' }}>
                                                <p style={{ margin: '0 0 5px 0', fontWeight: 'bold' }}>{d.name}</p>
                                                <p style={{ margin: 0, color: 'var(--accent-secondary)' }}>
                                                    {formatNPR(d.value)} ({d.pct.toFixed(1)}%)
                                                </p>
                                            </div>
                                        );
                                    }
                                    return null;
                                }}
                            />
                            <ReferenceLine x={40} stroke="var(--accent-yellow)" strokeDasharray="5 5" label={{ value: '40%', fill: 'var(--accent-yellow)', fontSize: 11 }} />
                            <Bar dataKey="pct" radius={[0, 4, 4, 0]}>
                                {sectorData.map((entry, index) => (
                                    <Cell key={index} fill={entry.flagged ? '#ff6b6b' : COLORS[index % COLORS.length]} />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>
        </div>
    );
}
