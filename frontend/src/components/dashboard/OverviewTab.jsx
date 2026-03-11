import { useMemo } from 'react';
import { Row, Col, Empty } from 'antd';
import {
    DollarOutlined,
    StockOutlined,
    ArrowUpOutlined,
    ArrowDownOutlined,
    FundOutlined,
    PieChartOutlined,
    BarChartOutlined,
    RightOutlined,
} from '@ant-design/icons';
import {
    PieChart, Pie, Cell, Tooltip as RechartsTooltip, ResponsiveContainer,
    BarChart, Bar, XAxis, CartesianGrid, ReferenceLine, LabelList,
} from 'recharts';

const COLORS = [
    '#6c5ce7', '#00b894', '#fdcb6e', '#e17055', '#0984e3',
    '#d63031', '#e84393', '#00cec9', '#ffeaa7', '#fab1a0',
];

function formatNPR(value) {
    if (value === null || value === undefined) return '—';
    return `Rs. ${Number(value).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
        const entry = payload[0];
        const val = entry.payload?.pnl !== undefined ? entry.payload.pnl : entry.value;
        return (
            <div style={{ background: 'var(--bg-secondary)', padding: '10px 15px', borderRadius: 8, border: '1px solid var(--border-color)' }}>
                <p style={{ margin: '0 0 5px 0', fontWeight: 'bold' }}>{entry.payload?.name || entry.name}</p>
                <p style={{ margin: 0, color: val < 0 ? 'var(--accent-red)' : 'var(--accent-primary)' }}>
                    {formatNPR(val)}
                </p>
            </div>
        );
    }
    return null;
};

export default function OverviewTab({ summary, context, members, onTabChange }) {
    const stats = useMemo(() => [
        {
            label: 'Total Investment',
            value: formatNPR(summary?.total_investment),
            icon: <DollarOutlined />,
            color: 'blue',
        },
        {
            label: 'Current Value',
            value: formatNPR(summary?.current_value),
            icon: <StockOutlined />,
            color: summary?.current_value > 0 ? 'green' : '',
        },
        {
            label: 'Unrealized P&L',
            value: formatNPR(summary?.unrealized_pnl),
            change: summary?.pnl_pct ? `${summary.pnl_pct > 0 ? '+' : ''}${summary.pnl_pct}%` : null,
            icon: summary?.unrealized_pnl >= 0 ? <ArrowUpOutlined /> : <ArrowDownOutlined />,
            color: summary?.unrealized_pnl >= 0 ? 'green' : 'red',
        },
        {
            label: 'Total Holdings',
            value: summary?.holdings_count || 0,
            icon: <FundOutlined />,
            color: '',
        },
    ], [summary]);

    const { sectorData, chartPnlData, totalVal } = useMemo(() => {
        const sectorMap = {};
        const pnlMap = {};
        let tv = 0;

        summary?.holdings?.forEach(h => {
            const sector = (h.sector && h.sector.trim()) || 'Other';
            if (!sectorMap[sector]) sectorMap[sector] = { name: sector, value: 0 };
            const cv = h.current_value || h.total_investment || 0;
            sectorMap[sector].value += cv;
            tv += cv;

            if (!pnlMap[h.symbol]) pnlMap[h.symbol] = { name: h.symbol, pnl: 0 };
            pnlMap[h.symbol].pnl += (h.unrealized_pnl || 0);
        });

        const sd = Object.values(sectorMap).sort((a, b) => b.value - a.value);
        const pnlSorted = Object.values(pnlMap).sort((a, b) => b.pnl - a.pnl);
        const gainers = pnlSorted.filter(x => x.pnl > 0).slice(0, 5);
        const losers = pnlSorted.filter(x => x.pnl < 0).slice(-5).reverse();
        const cpd = [...gainers, ...losers].sort((a, b) => b.pnl - a.pnl);

        return { sectorData: sd, chartPnlData: cpd, totalVal: tv };
    }, [summary]);

    // Group composition data
    const groupComposition = useMemo(() => {
        if (context?.type !== 'group' || !summary?.holdings) return null;
        const memberValues = {};
        summary.holdings.forEach(h => {
            const name = h.member_name || 'Unknown';
            if (!memberValues[name]) memberValues[name] = 0;
            memberValues[name] += (h.current_value || h.total_investment || 0);
        });
        const total = Object.values(memberValues).reduce((s, v) => s + v, 0);
        return Object.entries(memberValues)
            .map(([name, value]) => ({ name, value, pct: total > 0 ? ((value / total) * 100).toFixed(1) : 0 }))
            .sort((a, b) => b.value - a.value);
    }, [summary, context]);

    // Top 10 holdings by current value
    const topHoldings = useMemo(() => {
        return [...(summary?.holdings || [])]
            .sort((a, b) => (b.current_value || 0) - (a.current_value || 0))
            .slice(0, 10);
    }, [summary]);

    if (!summary?.holdings?.length) {
        return <Empty description="No holdings data. Add transactions to get started." style={{ marginTop: 60 }} />;
    }

    return (
        <div className="animate-in">
            {/* Stat Cards */}
            <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
                {stats.map((stat, i) => (
                    <Col xs={24} sm={12} lg={6} key={i}>
                        <div className={`stat-card ${stat.color}`}>
                            <div className="stat-label">{stat.label}</div>
                            <div className="stat-value">{stat.value}</div>
                            {stat.change && (
                                <div className={`stat-change ${stat.color === 'green' ? 'positive' : 'negative'}`}>
                                    {stat.icon} {stat.change}
                                </div>
                            )}
                        </div>
                    </Col>
                ))}
            </Row>

            {/* Group Composition Card */}
            {groupComposition && (
                <div className="stat-card" style={{ marginBottom: 24, padding: '16px 24px' }}>
                    <div className="chart-title">
                        <FundOutlined /> Group Composition
                    </div>
                    <div style={{ display: 'flex', gap: 0, borderRadius: 8, overflow: 'hidden', height: 24, marginBottom: 12 }}>
                        {groupComposition.map((m, i) => (
                            <div
                                key={m.name}
                                style={{
                                    width: `${m.pct}%`,
                                    background: COLORS[i % COLORS.length],
                                    minWidth: m.pct > 0 ? 4 : 0,
                                    transition: 'width 0.3s ease',
                                }}
                                title={`${m.name}: ${m.pct}%`}
                            />
                        ))}
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
                        {groupComposition.map((m, i) => (
                            <div key={m.name} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                                <div style={{ width: 10, height: 10, borderRadius: '50%', background: COLORS[i % COLORS.length] }} />
                                <span style={{ color: 'var(--text-secondary)' }}>{m.name}</span>
                                <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{m.pct}%</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Charts Row */}
            <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
                {/* Sector Allocation */}
                <Col xs={24} lg={12}>
                    <div className="chart-card" style={{ height: 420 }}>
                        <div className="chart-title">
                            <PieChartOutlined /> Sector Allocation
                        </div>
                        <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={sectorData}
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={60}
                                        outerRadius={100}
                                        paddingAngle={2}
                                        dataKey="value"
                                        stroke="none"
                                    >
                                        {sectorData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                        ))}
                                        <LabelList
                                            dataKey="value"
                                            position="outside"
                                            formatter={(v) => totalVal > 0 ? `${((v / totalVal) * 100).toFixed(0)}%` : ''}
                                            style={{ fontSize: 11, fill: 'var(--text-secondary)' }}
                                        />
                                    </Pie>
                                    <RechartsTooltip content={<CustomTooltip />} />
                                    {/* Center hole text */}
                                    <text x="50%" y="48%" textAnchor="middle" style={{ fontSize: 11, fill: 'var(--text-secondary)' }}>Total</text>
                                    <text x="50%" y="56%" textAnchor="middle" style={{ fontSize: 13, fill: 'var(--text-primary)', fontWeight: 700 }}>
                                        {totalVal > 1000000 ? `${(totalVal / 1000000).toFixed(1)}M` : `${(totalVal / 1000).toFixed(0)}K`}
                                    </text>
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'center', marginTop: 8 }}>
                            {sectorData.slice(0, 8).map((entry, index) => (
                                <div key={index} style={{ display: 'flex', alignItems: 'center', fontSize: 11 }}>
                                    <div style={{ width: 8, height: 8, backgroundColor: COLORS[index % COLORS.length], borderRadius: '50%', marginRight: 5 }} />
                                    <span style={{ color: 'var(--text-secondary)' }}>
                                        {entry.name} ({totalVal > 0 ? ((entry.value / totalVal) * 100).toFixed(1) : 0}%)
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                </Col>

                {/* Top Gainers & Losers */}
                <Col xs={24} lg={12}>
                    <div className="chart-card" style={{ height: 420 }}>
                        <div className="chart-title">
                            <BarChartOutlined /> Top Gainers & Losers
                        </div>
                        <div style={{ flex: 1, minHeight: 0 }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={chartPnlData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                                    <XAxis dataKey="name" stroke="var(--text-secondary)" tick={{ fontSize: 12 }} />
                                    <RechartsTooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.02)' }} />
                                    <ReferenceLine y={0} stroke="rgba(255,255,255,0.2)" />
                                    <Bar dataKey="pnl" radius={[4, 4, 4, 4]}>
                                        {chartPnlData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={entry.pnl > 0 ? '#00b894' : '#d63031'} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </Col>
            </Row>

            {/* Top 10 Holdings */}
            <div className="stat-card" style={{ padding: 0, overflow: 'hidden' }}>
                <div style={{ padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div className="chart-title" style={{ marginBottom: 0 }}>
                        <FundOutlined /> Top Holdings
                    </div>
                    <div
                        style={{ fontSize: 13, color: 'var(--accent-secondary)', cursor: 'pointer', fontWeight: 500 }}
                        onClick={() => onTabChange?.('holdings')}
                    >
                        View All <RightOutlined style={{ fontSize: 10 }} />
                    </div>
                </div>
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                                {['Member', 'Symbol', 'Qty', 'WACC', 'LTP', 'Investment', 'Current Value', 'P&L', 'P&L %', '% Portfolio'].map(h => (
                                    <th key={h} style={{
                                        padding: '10px 14px',
                                        textAlign: h === 'Member' || h === 'Symbol' ? 'left' : 'right',
                                        fontSize: '11px',
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.5px',
                                        color: 'var(--text-secondary)',
                                        fontWeight: 600,
                                        background: 'var(--bg-tertiary)',
                                    }}>
                                        {h}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {topHoldings.map((h, i) => {
                                const portfolioPct = totalVal > 0 ? ((h.current_value || 0) / totalVal * 100).toFixed(1) : '0.0';
                                return (
                                    <tr
                                        key={i}
                                        className={h.unrealized_pnl > 0 ? 'row-positive' : h.unrealized_pnl < 0 ? 'row-negative' : ''}
                                        style={{ borderBottom: '1px solid rgba(42, 42, 74, 0.3)', transition: 'background 0.2s' }}
                                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(108, 92, 231, 0.05)'}
                                        onMouseLeave={e => e.currentTarget.style.background = ''}
                                    >
                                        <td style={{ padding: '10px 14px', fontSize: 13 }}>{h.member_name}</td>
                                        <td style={{ padding: '10px 14px', fontSize: 13, fontWeight: 600 }}>{h.symbol}</td>
                                        <td style={{ padding: '10px 14px', fontSize: 13, textAlign: 'right' }}>{h.current_qty}</td>
                                        <td style={{ padding: '10px 14px', fontSize: 13, textAlign: 'right' }}>{h.wacc?.toFixed(2)}</td>
                                        <td style={{ padding: '10px 14px', fontSize: 13, textAlign: 'right' }}>{h.ltp?.toFixed(2) || '—'}</td>
                                        <td style={{ padding: '10px 14px', fontSize: 13, textAlign: 'right' }}>{formatNPR(h.total_investment)}</td>
                                        <td style={{ padding: '10px 14px', fontSize: 13, textAlign: 'right' }}>{h.current_value ? formatNPR(h.current_value) : '—'}</td>
                                        <td style={{
                                            padding: '10px 14px', fontSize: 13, textAlign: 'right', fontWeight: 600,
                                            color: h.unrealized_pnl > 0 ? 'var(--accent-green)' : h.unrealized_pnl < 0 ? 'var(--accent-red)' : 'var(--text-secondary)',
                                        }}>
                                            {h.unrealized_pnl ? formatNPR(h.unrealized_pnl) : '—'}
                                        </td>
                                        <td style={{ padding: '10px 14px', fontSize: 13, textAlign: 'right' }}>
                                            {h.pnl_pct !== null && h.pnl_pct !== undefined ? (
                                                <span className={`glow-badge ${h.pnl_pct >= 0 ? 'green' : 'red'}`}>
                                                    {h.pnl_pct >= 0 ? '+' : ''}{h.pnl_pct}%
                                                </span>
                                            ) : '—'}
                                        </td>
                                        <td style={{ padding: '10px 14px', fontSize: 13, textAlign: 'right' }}>
                                            <span className="glow-badge blue">{portfolioPct}%</span>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
