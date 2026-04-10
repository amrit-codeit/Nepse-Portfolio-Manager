import { useState, useMemo } from 'react';
import { Row, Col, Empty, Tooltip, Tag } from 'antd';
import {
    DollarOutlined,
    StockOutlined,
    ArrowUpOutlined,
    ArrowDownOutlined,
    FundOutlined,
    PieChartOutlined,
    BarChartOutlined,
    DownOutlined,
    UpOutlined,
    TrophyOutlined,
    RiseOutlined,
    SafetyCertificateOutlined,
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
    return `Rs. ${Number(value).toLocaleString('en-IN', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}`;
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

const pnlColor = (val) => {
    if (val == null || val === 0) return 'var(--text-secondary)';
    return val > 0 ? 'var(--accent-green)' : 'var(--accent-red)';
};

/**
 * Expanded row detail — shows XIRR, dividend cash, Graham, technicals when a row is clicked.
 */
function HoldingDetail({ h }) {
    const detailItems = [
        { label: 'XIRR', value: h.xirr != null ? `${h.xirr.toFixed(3)}%` : '—', color: pnlColor(h.xirr) },
        { label: 'Dividend Income', value: formatNPR(h.dividend_income), color: h.dividend_income > 0 ? 'var(--accent-green)' : 'var(--text-secondary)' },
        { label: 'Dividend Yield', value: h.dividend_yield != null ? `${h.dividend_yield.toFixed(3)}%` : '—', color: 'var(--accent-blue)' },
        { label: 'Tax Profit', value: formatNPR(h.tax_profit), color: pnlColor(h.tax_profit) },
        { label: 'Tax WACC', value: formatNPR(h.tax_wacc), color: 'var(--text-primary)' },
        { label: "Graham's Number", value: h.graham_number ? formatNPR(h.graham_number) : '—', color: h.graham_number && h.ltp && h.ltp < h.graham_number ? 'var(--accent-green)' : h.graham_number ? 'var(--accent-red)' : 'var(--text-secondary)' },
        { label: 'RSI (14)', value: h.rsi_14 != null ? h.rsi_14.toFixed(3) : '—', color: h.rsi_14 && h.rsi_14 < 40 ? 'var(--accent-green)' : h.rsi_14 && h.rsi_14 > 70 ? 'var(--accent-red)' : 'var(--text-primary)' },
        { label: 'SMA 50', value: h.sma_50 ? formatNPR(h.sma_50) : '—', color: 'var(--text-secondary)' },
        { label: 'SMA 200', value: h.sma_200 ? formatNPR(h.sma_200) : '—', color: 'var(--text-secondary)' },
    ];

    // Graham tag
    let valuationTag = null;
    if (h.graham_number && h.ltp) {
        const discount = ((h.graham_number - h.ltp) / h.graham_number * 100).toFixed(3);
        valuationTag = h.ltp < h.graham_number
            ? <Tag color="green" style={{ fontSize: 11 }}>Undervalued {discount}%</Tag>
            : <Tag color="red" style={{ fontSize: 11 }}>Overvalued {Math.abs(discount)}%</Tag>;
    }

    // Trend tag
    let trendTag = null;
    if (h.ltp && h.sma_200) {
        trendTag = h.ltp > h.sma_200
            ? <Tag color="green" style={{ fontSize: 11 }}>Bullish</Tag>
            : <Tag color="red" style={{ fontSize: 11 }}>Bearish</Tag>;
    }

    return (
        <div style={{
            padding: '14px 20px',
            background: 'var(--bg-tertiary)',
            borderBottom: '1px solid var(--border-color)',
            animation: 'fadeInUp 0.2s ease-out forwards',
        }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'center' }}>
                {detailItems.map(item => (
                    <div key={item.label} style={{ minWidth: 100 }}>
                        <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 2 }}>
                            {item.label}
                        </div>
                        <div style={{ fontSize: 14, fontWeight: 600, color: item.color }}>
                            {item.value}
                        </div>
                    </div>
                ))}
                {/* Tags */}
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginLeft: 'auto' }}>
                    {valuationTag}
                    {trendTag}
                    {h.is_fundamental_risk && <Tag color="volcano" style={{ fontSize: 11 }}>Fundamental Risk</Tag>}
                </div>
            </div>
        </div>
    );
}

export default function OverviewTab({ summary, context, members, onTabChange, isSipMode, pricesData }) {
    const [expandedRows, setExpandedRows] = useState(new Set());
    const [sortField, setSortField] = useState('current_value');
    const [sortOrder, setSortOrder] = useState('desc');

    const toggleRow = (idx) => {
        setExpandedRows(prev => {
            const next = new Set(prev);
            if (next.has(idx)) next.delete(idx);
            else next.add(idx);
            return next;
        });
    };

    // Today's Gain/Loss: (LTP - Prev Close) * Qty
    const todayChange = useMemo(() => {
        if (!summary?.holdings || !pricesData) return { value: 0, pct: 0 };
        let totalChange = 0;
        let prevTotalValue = 0;
        summary.holdings.forEach(h => {
            const priceInfo = pricesData?.find(p => p.symbol === h.symbol);
            if (priceInfo?.change && h.current_qty) {
                totalChange += priceInfo.change * h.current_qty;
            }
            if (priceInfo?.prev_close && h.current_qty) {
                prevTotalValue += priceInfo.prev_close * h.current_qty;
            }
        });
        const pct = prevTotalValue > 0 ? (totalChange / prevTotalValue) * 100 : 0;
        return { value: totalChange, pct: pct.toFixed(3) };
    }, [summary, pricesData]);

    // Total Returns = Unrealized + Realized + Dividends
    const totalReturns = useMemo(() => {
        if (!summary) return 0;
        return (summary.unrealized_pnl || 0) + (summary.realized_profit || 0) + (summary.dividend_income || 0);
    }, [summary]);

    const stats = useMemo(() => {
        const items = [
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
                change: summary?.pnl_pct ? `${summary.pnl_pct > 0 ? '+' : ''}${summary.pnl_pct.toFixed(2)}%` : null,
                icon: summary?.unrealized_pnl >= 0 ? <ArrowUpOutlined /> : <ArrowDownOutlined />,
                color: summary?.unrealized_pnl >= 0 ? 'green' : 'red',
            },
            {
                label: "Today's Change",
                value: formatNPR(todayChange.value),
                change: todayChange.pct !== '0.00' ? `${todayChange.value > 0 ? '+' : ''}${todayChange.pct}%` : null,
                icon: todayChange.value >= 0 ? <ArrowUpOutlined /> : <ArrowDownOutlined />,
                color: todayChange.value > 0 ? 'green' : todayChange.value < 0 ? 'red' : '',
            },
            {
                label: 'Realized Profit',
                value: formatNPR(summary?.realized_profit),
                icon: summary?.realized_profit >= 0 ? <ArrowUpOutlined /> : <ArrowDownOutlined />,
                color: summary?.realized_profit >= 0 ? 'green' : 'red',
            },
            {
                label: 'Dividend Income',
                value: formatNPR(summary?.dividend_income),
                icon: <DollarOutlined />,
                color: summary?.dividend_income > 0 ? 'green' : '',
            },
            {
                label: 'Total Returns',
                value: formatNPR(totalReturns),
                change: summary?.total_investment > 0 ? `${totalReturns > 0 ? '+' : ''}${(totalReturns / summary.total_investment * 100).toFixed(2)}%` : null,
                icon: totalReturns >= 0 ? <TrophyOutlined /> : <ArrowDownOutlined />,
                color: totalReturns >= 0 ? 'green' : 'red',
            },
            {
                label: 'Total Holdings',
                value: summary?.holdings_count || 0,
                icon: <FundOutlined />,
                color: '',
            },
        ];
        return items;
    }, [summary, todayChange, totalReturns]);

    const { sectorData, chartPnlData, totalVal, hhiScore } = useMemo(() => {
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

        // HHI: sum of squared weights of each holding
        let hhi = 0;
        if (tv > 0) {
            summary?.holdings?.forEach(h => {
                const w = ((h.current_value || h.total_investment || 0) / tv) * 100;
                hhi += w * w;
            });
        }

        return { sectorData: sd, chartPnlData: cpd, totalVal: tv, hhiScore: Math.round(hhi) };
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
            .map(([name, value]) => ({ name, value, pct: total > 0 ? ((value / total) * 100).toFixed(3) : 0 }))
            .sort((a, b) => b.value - a.value);
    }, [summary, context]);

    // Sorted holdings — ALL of them, not just top 10
    const sortedHoldings = useMemo(() => {
        const list = [...(summary?.holdings || [])];
        list.sort((a, b) => {
            const aVal = a[sortField] || 0;
            const bVal = b[sortField] || 0;
            return sortOrder === 'desc' ? bVal - aVal : aVal - bVal;
        });
        return list;
    }, [summary, sortField, sortOrder]);

    const handleSort = (field) => {
        if (field === sortField) {
            setSortOrder(prev => prev === 'desc' ? 'asc' : 'desc');
        } else {
            setSortField(field);
            setSortOrder('desc');
        }
    };

    if (!summary?.holdings?.length) {
        return <Empty description="No holdings data. Add transactions to get started." style={{ marginTop: 60 }} />;
    }

    // Column Header helper
    const SortHeader = ({ field, label, align = 'right' }) => (
        <th
            onClick={() => handleSort(field)}
            style={{
                padding: '10px 14px',
                textAlign: align,
                fontSize: '11px',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                color: sortField === field ? 'var(--accent-primary)' : 'var(--text-secondary)',
                fontWeight: 600,
                background: 'var(--bg-tertiary)',
                cursor: 'pointer',
                userSelect: 'none',
                whiteSpace: 'nowrap',
                transition: 'color 0.15s',
            }}
        >
            {label}
            {sortField === field && (
                <span style={{ marginLeft: 4, fontSize: 9 }}>
                    {sortOrder === 'desc' ? '▼' : '▲'}
                </span>
            )}
        </th>
    );

    return (
        <div className="animate-in">
            {/* Stat Cards */}
            <Row gutter={[12, 12]} style={{ marginBottom: 24 }}>
                {stats.map((stat, i) => (
                    <Col xs={12} sm={8} lg={6} key={i}>
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

            {/* HHI Concentration Index */}
            {!isSipMode && hhiScore > 0 && (
                <div className="stat-card" style={{ marginBottom: 24, padding: '12px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <SafetyCertificateOutlined style={{ fontSize: 18, color: hhiScore < 1500 ? 'var(--accent-green)' : hhiScore < 2500 ? 'var(--accent-yellow)' : 'var(--accent-red)' }} />
                        <div>
                            <div style={{ fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Portfolio Concentration (HHI)</div>
                            <div style={{ fontSize: 16, fontWeight: 700, color: hhiScore < 1500 ? 'var(--accent-green)' : hhiScore < 2500 ? 'var(--accent-yellow)' : 'var(--accent-red)' }}>
                                {hhiScore.toLocaleString()} — {hhiScore < 1500 ? 'Diversified' : hhiScore < 2500 ? 'Moderate Concentration' : 'Highly Concentrated'}
                            </div>
                        </div>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', maxWidth: 260, textAlign: 'right' }}>
                        HHI &lt; 1,500 = diversified · 1,500–2,500 = moderate · &gt; 2,500 = concentrated
                    </div>
                </div>
            )}

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
                {!isSipMode && (
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
                                        {totalVal > 1000000 ? `${(totalVal / 1000000).toFixed(3)}M` : `${(totalVal / 1000).toFixed(0)}K`}
                                    </text>
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'center', marginTop: 8 }}>
                            {sectorData.slice(0, 8).map((entry, index) => (
                                <div key={index} style={{ display: 'flex', alignItems: 'center', fontSize: 11 }}>
                                    <div style={{ width: 8, height: 8, backgroundColor: COLORS[index % COLORS.length], borderRadius: '50%', marginRight: 5 }} />
                                    <span style={{ color: 'var(--text-secondary)' }}>
                                        {entry.name} ({totalVal > 0 ? ((entry.value / totalVal) * 100).toFixed(3) : 0}%)
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                </Col>
                )}

                {/* Top Gainers & Losers */}
                <Col xs={24} lg={isSipMode ? 24 : 12}>
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

            {/* Full Portfolio Holdings Table */}
            <div className="stat-card" style={{ padding: 0, overflow: 'hidden' }}>
                <div style={{ padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div className="chart-title" style={{ marginBottom: 0 }}>
                        <FundOutlined /> Portfolio Overview
                        <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 400, marginLeft: 8 }}>
                            {sortedHoldings.length} holdings · Click any row for details
                        </span>
                    </div>
                </div>
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                                <th style={{
                                    padding: '10px 14px', textAlign: 'left', fontSize: '11px',
                                    textTransform: 'uppercase', letterSpacing: '0.5px',
                                    color: 'var(--text-secondary)', fontWeight: 600, background: 'var(--bg-tertiary)',
                                    width: 30,
                                }}></th>
                                <th style={{
                                    padding: '10px 14px', textAlign: 'left', fontSize: '11px',
                                    textTransform: 'uppercase', letterSpacing: '0.5px',
                                    color: 'var(--text-secondary)', fontWeight: 600, background: 'var(--bg-tertiary)',
                                }}>Member</th>
                                <th style={{
                                    padding: '10px 14px', textAlign: 'left', fontSize: '11px',
                                    textTransform: 'uppercase', letterSpacing: '0.5px',
                                    color: 'var(--text-secondary)', fontWeight: 600, background: 'var(--bg-tertiary)',
                                }}>Symbol</th>
                                <SortHeader field="current_qty" label="Qty" />
                                <SortHeader field="wacc" label="WACC" />
                                <SortHeader field="ltp" label="LTP" />
                                <SortHeader field="total_investment" label="Investment" />
                                <SortHeader field="current_value" label="Current Value" />
                                <SortHeader field="unrealized_pnl" label="P&L" />
                                <SortHeader field="pnl_pct" label="P&L %" />
                                <SortHeader field="xirr" label="XIRR" />
                                <SortHeader field="dividend_income" label="Dividends" />
                                <th style={{
                                    padding: '10px 14px', textAlign: 'right', fontSize: '11px',
                                    textTransform: 'uppercase', letterSpacing: '0.5px',
                                    color: 'var(--text-secondary)', fontWeight: 600, background: 'var(--bg-tertiary)',
                                }}>% Portfolio</th>
                            </tr>
                        </thead>
                        <tbody>
                            {sortedHoldings.map((h, i) => {
                                const portfolioPct = totalVal > 0 ? ((h.current_value || 0) / totalVal * 100).toFixed(3) : '0.0';
                                const isExpanded = expandedRows.has(i);
                                return (
                                    <>
                                        <tr
                                            key={`row-${i}`}
                                            className={h.unrealized_pnl > 0 ? 'row-positive' : h.unrealized_pnl < 0 ? 'row-negative' : ''}
                                            style={{
                                                borderBottom: isExpanded ? 'none' : '1px solid rgba(42, 42, 74, 0.3)',
                                                transition: 'background 0.2s',
                                                cursor: 'pointer',
                                            }}
                                            onClick={() => toggleRow(i)}
                                            onMouseEnter={e => e.currentTarget.style.background = 'rgba(108, 92, 231, 0.05)'}
                                            onMouseLeave={e => e.currentTarget.style.background = ''}
                                        >
                                            <td style={{ padding: '10px 14px', fontSize: 11, color: 'var(--text-muted)' }}>
                                                {isExpanded ? <UpOutlined /> : <DownOutlined />}
                                            </td>
                                            <td style={{ padding: '10px 14px', fontSize: 13 }}>{h.member_name}</td>
                                            <td style={{ padding: '10px 14px', fontSize: 13, fontWeight: 600 }}>{h.symbol}</td>
                                            <td style={{ padding: '10px 14px', fontSize: 13, textAlign: 'right' }}>{h.current_qty}</td>
                                            <td style={{ padding: '10px 14px', fontSize: 13, textAlign: 'right' }}>{h.wacc?.toFixed(3)}</td>
                                            <td style={{ padding: '10px 14px', fontSize: 13, textAlign: 'right' }}>{h.ltp?.toFixed(3) || '—'}</td>
                                            <td style={{ padding: '10px 14px', fontSize: 13, textAlign: 'right' }}>{formatNPR(h.total_investment)}</td>
                                            <td style={{ padding: '10px 14px', fontSize: 13, textAlign: 'right' }}>{h.current_value ? formatNPR(h.current_value) : '—'}</td>
                                            <td style={{
                                                padding: '10px 14px', fontSize: 13, textAlign: 'right', fontWeight: 600,
                                                color: pnlColor(h.unrealized_pnl),
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
                                            <td style={{
                                                padding: '10px 14px', fontSize: 13, textAlign: 'right', fontWeight: 500,
                                                color: pnlColor(h.xirr),
                                            }}>
                                                {h.xirr != null ? `${h.xirr.toFixed(3)}%` : '—'}
                                            </td>
                                            <td style={{
                                                padding: '10px 14px', fontSize: 13, textAlign: 'right',
                                                color: h.dividend_income > 0 ? 'var(--accent-green)' : 'var(--text-secondary)',
                                            }}>
                                                {h.dividend_income > 0 ? formatNPR(h.dividend_income) : '—'}
                                            </td>
                                            <td style={{ padding: '10px 14px', fontSize: 13, textAlign: 'right' }}>
                                                <span className="glow-badge blue">{portfolioPct}%</span>
                                            </td>
                                        </tr>
                                        {isExpanded && (
                                            <tr key={`detail-${i}`}>
                                                <td colSpan={13} style={{ padding: 0 }}>
                                                    <HoldingDetail h={h} />
                                                </td>
                                            </tr>
                                        )}
                                    </>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
