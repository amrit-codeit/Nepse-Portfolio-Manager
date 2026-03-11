import { useMemo } from 'react';
import { Row, Col, Empty, Spin } from 'antd';
import { useQuery } from '@tanstack/react-query';
import {
    LineChartOutlined,
    BarChartOutlined,
    PercentageOutlined,
    DollarOutlined,
    ClockCircleOutlined,
} from '@ant-design/icons';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
    ResponsiveContainer, Legend, LineChart, Line,
} from 'recharts';
import xirr from 'xirr';
import { getPortfolioHistory, getTransactions } from '../../services/api';

const COLORS = ['#6c5ce7', '#00b894', '#fdcb6e', '#e17055', '#0984e3'];

function formatNPR(value) {
    if (value === null || value === undefined) return '—';
    return `Rs. ${Number(value).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function computeXIRR(transactions, currentValue) {
    try {
        const cashFlows = [];

        transactions.forEach(t => {
            const date = new Date(t.txn_date);
            // Use total_cost, fallback to rate × quantity when total_cost is 0
            const cost = (t.total_cost && t.total_cost > 0) ? t.total_cost : ((t.rate || 0) * (t.quantity || 0));
            if (cost <= 0) return;

            if (['BUY', 'IPO', 'FPO', 'RIGHT', 'AUCTION'].includes(t.txn_type)) {
                cashFlows.push({ amount: -cost, when: date });
            } else if (t.txn_type === 'SELL') {
                cashFlows.push({ amount: cost, when: date });
            }
        });

        if (cashFlows.length > 0 && currentValue > 0) {
            cashFlows.push({ amount: currentValue, when: new Date() });
            const rate = xirr(cashFlows);
            return (rate * 100).toFixed(2);
        }
    } catch (e) {
        console.warn('XIRR calculation failed:', e);
    }
    return null;
}

export default function PerformanceTab({ summary, context, members }) {
    // Build query params for history
    const historyParams = useMemo(() => {
        const p = { days: 90 };
        if (context?.type === 'member') p.member_id = context.id;
        if (context?.type === 'group') p.member_ids = context.memberIds.join(',');
        return p;
    }, [context]);

    const summaryParams = useMemo(() => {
        if (context?.type === 'member') return { member_id: context.id };
        if (context?.type === 'group') return { member_ids: context.memberIds.join(',') };
        return {};
    }, [context]);

    const { data: historyData } = useQuery({
        queryKey: ['portfolio-history', historyParams],
        queryFn: () => getPortfolioHistory(historyParams).then(r => r.data),
    });

    const { data: txnData } = useQuery({
        queryKey: ['all-transactions-for-xirr', summaryParams],
        queryFn: () => getTransactions({ ...summaryParams, limit: 10000 }).then(r => r.data.transactions),
    });

    // Investment vs Current Value per member
    const memberComparison = useMemo(() => {
        if (!summary?.holdings) return [];
        const memberMap = {};
        summary.holdings.forEach(h => {
            const name = h.member_name || 'Unknown';
            if (!memberMap[name]) memberMap[name] = { name, investment: 0, currentValue: 0 };
            memberMap[name].investment += h.total_investment || 0;
            memberMap[name].currentValue += h.current_value || 0;
        });
        return Object.values(memberMap).sort((a, b) => b.currentValue - a.currentValue);
    }, [summary]);

    // XIRR calculation
    const xirrValue = useMemo(() => {
        if (!txnData || !summary?.current_value) return null;
        return computeXIRR(txnData, summary.current_value);
    }, [txnData, summary]);

    // Dividend income
    const dividendIncome = useMemo(() => {
        if (!txnData) return 0;
        return txnData
            .filter(t => t.txn_type === 'DIVIDEND')
            .reduce((sum, t) => sum + (t.total_cost || 0), 0);
    }, [txnData]);

    // Realized profit — proceeds from SELL minus cost basis of sold shares
    const realizedProfit = useMemo(() => {
        if (!txnData) return 0;
        const totalBought = txnData
            .filter(t => ['BUY', 'IPO', 'FPO', 'RIGHT', 'AUCTION'].includes(t.txn_type))
            .reduce((sum, t) => sum + ((t.total_cost && t.total_cost > 0) ? t.total_cost : ((t.rate || 0) * (t.quantity || 0))), 0);
        const totalSold = txnData
            .filter(t => t.txn_type === 'SELL')
            .reduce((sum, t) => sum + ((t.total_cost && t.total_cost > 0) ? t.total_cost : ((t.rate || 0) * (t.quantity || 0))), 0);
        const currentHoldingValue = summary?.current_value || 0;
        // Realized = (current portfolio value + total sold) - total bought
        return (currentHoldingValue + totalSold) - totalBought;
    }, [txnData, summary]);

    // Format history for line chart — group by date, one line per member
    const lineChartData = useMemo(() => {
        if (!historyData || historyData.length === 0) return null;

        const dateMap = {};
        const memberNames = new Set();

        // Build member name lookup
        const memberLookup = {};
        (members || []).forEach(m => { memberLookup[m.id] = m.display_name || m.name; });

        historyData.forEach(s => {
            if (!dateMap[s.date]) dateMap[s.date] = { date: s.date };
            const name = memberLookup[s.member_id] || `Member ${s.member_id}`;
            memberNames.add(name);
            dateMap[s.date][name] = s.current_value;
        });

        // Add group total if group mode
        if (context?.type === 'group' || context?.type === 'all') {
            Object.values(dateMap).forEach(row => {
                let total = 0;
                memberNames.forEach(n => { total += row[n] || 0; });
                row['Total'] = total;
            });
        }

        return {
            data: Object.values(dateMap).sort((a, b) => a.date.localeCompare(b.date)),
            lines: [...memberNames],
        };
    }, [historyData, members, context]);

    const CustomTooltip = ({ active, payload, label }) => {
        if (active && payload?.length) {
            return (
                <div style={{ background: 'var(--bg-secondary)', padding: '10px 15px', borderRadius: 8, border: '1px solid var(--border-color)' }}>
                    <p style={{ margin: '0 0 5px 0', fontWeight: 'bold', fontSize: 12 }}>{label}</p>
                    {payload.map((p, i) => (
                        <p key={i} style={{ margin: 0, color: p.color, fontSize: 12 }}>
                            {p.name}: {formatNPR(p.value)}
                        </p>
                    ))}
                </div>
            );
        }
        return null;
    };

    return (
        <div className="animate-in">
            {/* Metric Cards Row */}
            <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
                <Col xs={24} sm={12} lg={6}>
                    <div className="stat-card">
                        <div className="stat-label"><PercentageOutlined /> XIRR (Annualized Return)</div>
                        <div className="stat-value" style={{ color: xirrValue && Number(xirrValue) >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                            {xirrValue ? `${xirrValue}%` : 'Calculating...'}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                            Based on actual cash flows
                        </div>
                    </div>
                </Col>
                <Col xs={24} sm={12} lg={6}>
                    <div className={`stat-card ${realizedProfit >= 0 ? 'green' : 'red'}`}>
                        <div className="stat-label"><DollarOutlined /> Realized Profit</div>
                        <div className="stat-value" style={{ color: realizedProfit >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                            {formatNPR(realizedProfit)}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                            Portfolio value + sell proceeds − total cost
                        </div>
                    </div>
                </Col>
                <Col xs={24} sm={12} lg={6}>
                    <div className="stat-card">
                        <div className="stat-label"><DollarOutlined /> Dividend Income</div>
                        <div className="stat-value">{formatNPR(dividendIncome)}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                            From DIVIDEND transactions
                        </div>
                    </div>
                </Col>
                <Col xs={24} sm={12} lg={6}>
                    <div className="stat-card">
                        <div className="stat-label"><ClockCircleOutlined /> Portfolio Age</div>
                        <div className="stat-value">
                            {txnData?.length > 0 ? (() => {
                                const earliest = new Date(Math.min(...txnData.map(t => new Date(t.txn_date))));
                                const days = Math.floor((new Date() - earliest) / (1000 * 60 * 60 * 24));
                                return days > 365 ? `${(days / 365).toFixed(1)} years` : `${days} days`;
                            })() : '—'}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                            Since first transaction
                        </div>
                    </div>
                </Col>
            </Row>

            {/* Portfolio Value Over Time */}
            <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
                <Col xs={24}>
                    <div className="chart-card" style={{ height: 380 }}>
                        <div className="chart-title">
                            <LineChartOutlined /> Portfolio Value Over Time
                        </div>
                        {lineChartData && lineChartData.data.length >= 2 ? (
                            <div style={{ flex: 1, minHeight: 0 }}>
                                <ResponsiveContainer width="100%" height="100%">
                                    <LineChart data={lineChartData.data} margin={{ top: 10, right: 20, left: 20, bottom: 5 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                                        <XAxis dataKey="date" stroke="var(--text-secondary)" tick={{ fontSize: 11 }} />
                                        <YAxis stroke="var(--text-secondary)" tick={{ fontSize: 11 }} tickFormatter={v => `${(v / 1000).toFixed(0)}K`} />
                                        <RechartsTooltip content={<CustomTooltip />} />
                                        <Legend />
                                        {(context?.type === 'group' || context?.type === 'all') && (
                                            <Line type="monotone" dataKey="Total" stroke="#a29bfe" strokeWidth={3} dot={false} />
                                        )}
                                        {lineChartData.lines.map((name, i) => (
                                            <Line key={name} type="monotone" dataKey={name} stroke={COLORS[i % COLORS.length]} strokeWidth={1.5} dot={false} strokeDasharray={context?.type === 'group' ? '5 5' : undefined} />
                                        ))}
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>
                        ) : (
                            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 8, color: 'var(--text-secondary)' }}>
                                <ClockCircleOutlined style={{ fontSize: 32, opacity: 0.3 }} />
                                <span>Collecting data... Snapshots are recorded daily at 15:30 NPT.</span>
                                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Chart will appear after 2+ data points.</span>
                            </div>
                        )}
                    </div>
                </Col>
            </Row>

            {/* Investment vs Current Value */}
            <Row gutter={[16, 16]}>
                <Col xs={24}>
                    <div className="chart-card" style={{ height: 350 }}>
                        <div className="chart-title">
                            <BarChartOutlined /> Investment vs Current Value by Member
                        </div>
                        <div style={{ flex: 1, minHeight: 0 }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={memberComparison} margin={{ top: 10, right: 30, left: 20, bottom: 5 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                                    <XAxis dataKey="name" stroke="var(--text-secondary)" tick={{ fontSize: 12 }} />
                                    <YAxis stroke="var(--text-secondary)" tick={{ fontSize: 11 }} tickFormatter={v => `${(v / 1000).toFixed(0)}K`} />
                                    <RechartsTooltip content={<CustomTooltip />} />
                                    <Legend />
                                    <Bar dataKey="investment" name="Investment" fill="#6c5ce7" radius={[4, 4, 0, 0]} />
                                    <Bar dataKey="currentValue" name="Current Value" fill="#00b894" radius={[4, 4, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </Col>
            </Row>
        </div>
    );
}
