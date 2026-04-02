import { useMemo, useState } from 'react';
import { Row, Col, Empty, Spin, Button, message, Tooltip, Space, Radio } from 'antd';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
    LineChartOutlined,
    BarChartOutlined,
    PercentageOutlined,
    DollarOutlined,
    ClockCircleOutlined,
    CloudDownloadOutlined,
} from '@ant-design/icons';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
    ResponsiveContainer, Legend, LineChart, Line,
} from 'recharts';
import xirr from 'xirr';
import { getComputedHistory, getTransactions } from '../../services/api';

const COLORS = ['#6c5ce7', '#00b894', '#fdcb6e', '#e17055', '#0984e3'];
const NEPSE_COLOR = '#ff7675';

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

            if (['BUY', 'IPO', 'FPO', 'RIGHT', 'AUCTION', 'TRANSFER_IN'].includes(t.txn_type)) {
                if (cost > 0) {
                    cashFlows.push({ amount: -cost, when: date });
                }
            } else if (['SELL', 'TRANSFER_OUT'].includes(t.txn_type)) {
                let receivable = cost;
                // Fallback to cost basis if sell price is missing to prevent XIRR from crashing
                if (receivable <= 0 && t.wacc > 0) {
                    receivable = (t.quantity || 0) * t.wacc;
                }
                if (receivable > 0) {
                    cashFlows.push({ amount: receivable, when: date });
                }
            } else if (t.txn_type === 'DIVIDEND' && t.amount > 0) {
                cashFlows.push({ amount: t.amount, when: date });
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

export default function PerformanceTab({ summary, context, members, isSipMode, pricesData }) {
    const queryClient = useQueryClient();
    const [historyDays, setHistoryDays] = useState(180);

    // Build query params for history
    const historyParams = useMemo(() => {
        const p = { days: historyDays };
        if (context?.type === 'member') p.member_id = context.id;
        if (context?.type === 'group') p.member_ids = context.memberIds.join(',');
        return p;
    }, [context, historyDays]);

    const summaryParams = useMemo(() => {
        if (context?.type === 'member') return { member_id: context.id };
        if (context?.type === 'group') return { member_ids: context.memberIds.join(',') };
        return {};
    }, [context]);

    const { data: historyData, isLoading: isHistoryLoading } = useQuery({
        queryKey: ['computed-portfolio-history', historyParams],
        queryFn: () => getComputedHistory(historyParams).then(r => r.data),
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

    const filteredTxnData = useMemo(() => {
        if (!txnData) return [];
        
        const isSip = (symbol) => {
            const priceInfo = pricesData?.find(p => p.symbol === symbol);
            if (priceInfo) {
                if (priceInfo.instrument === 'Open-End Mutual Fund') return true;
                if (priceInfo.instrument === 'Equity' || priceInfo.instrument === 'Mutual Fund') return false;
            }
            return symbol?.length > 5; // Fallback heuristic
        };

        return txnData.filter(t => {
            const sip = isSip(t.symbol);
            return isSipMode ? sip : !sip;
        });
    }, [txnData, isSipMode, pricesData]);

    // XIRR calculation
    const xirrValue = useMemo(() => {
        if (!filteredTxnData.length || !summary?.current_value) return null;
        return computeXIRR(filteredTxnData, summary.current_value);
    }, [filteredTxnData, summary]);

    // Dividend income
    const dividendIncome = useMemo(() => {
        return filteredTxnData
            .filter(t => t.txn_type === 'DIVIDEND')
            .reduce((sum, t) => sum + (t.total_cost || 0), 0);
    }, [filteredTxnData]);

    // Realized profit
    const realizedProfit = useMemo(() => {
        return filteredTxnData
            .filter(t => ['SELL', 'TRANSFER_OUT'].includes(t.txn_type))
            .reduce((sum, t) => {
                const netReceived = (t.total_cost && t.total_cost > 0) ? t.total_cost : ((t.rate || 0) * (t.quantity || 0));
                
                // If sell price is completely missing/zero (e.g., auto-synced history), 
                // skip to avoid treating the whole cost basis as a massive loss
                if (netReceived <= 0) return sum;

                const costBasis = (t.quantity || 0) * (t.wacc || 0);
                return sum + (netReceived - costBasis);
            }, 0);
    }, [filteredTxnData]);

    // Format history for line chart
    const chartData = useMemo(() => {
        if (!historyData || historyData.length === 0) return [];
        return historyData.map(d => ({
            ...d,
            displayDate: new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        }));
    }, [historyData]);

    const CustomTooltip = ({ active, payload, label }) => {
        if (active && payload?.length) {
            const dateStr = payload[0].payload.date;
            return (
                <div style={{ background: 'var(--bg-secondary)', padding: '10px 15px', borderRadius: 8, border: '1px solid var(--border-color)' }}>
                    <p style={{ margin: '0 0 8px 0', fontWeight: 'bold', fontSize: 12 }}>{dateStr}</p>
                    {payload.map((p, i) => (
                        <p key={i} style={{ margin: '2px 0', color: p.color, fontSize: 12 }}>
                            {p.name}: {p.name === 'NEPSE Index' ? p.value.toFixed(2) : formatNPR(p.value)}
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
                            Net profit from shares already sold
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
                            {filteredTxnData?.length > 0 ? (() => {
                                const earliest = new Date(Math.min(...filteredTxnData.map(t => new Date(t.txn_date))));
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
                    <div className="chart-card" style={{ height: 450 }}>
                        <div className="chart-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                            <div className="chart-title" style={{ margin: 0 }}>
                                <LineChartOutlined /> Portfolio Performance
                            </div>
                            <Space>
                                <Radio.Group value={historyDays} onChange={e => setHistoryDays(e.target.value)} size="small">
                                    <Radio.Button value={30}>1M</Radio.Button>
                                    <Radio.Button value={90}>3M</Radio.Button>
                                    <Radio.Button value={180}>6M</Radio.Button>
                                    <Radio.Button value={365}>1Y</Radio.Button>
                                    <Radio.Button value={1095}>ALL</Radio.Button>
                                </Radio.Group>
                            </Space>
                        </div>

                        {isHistoryLoading ? (
                            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <Spin tip="Computing history..." />
                            </div>
                        ) : chartData.length >= 2 ? (
                            <div style={{ flex: 1, minHeight: 0 }}>
                                <ResponsiveContainer width="100%" height="100%">
                                    <LineChart data={chartData} margin={{ top: 10, right: 30, left: 10, bottom: 5 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                                        <XAxis 
                                            dataKey="displayDate" 
                                            stroke="var(--text-secondary)" 
                                            tick={{ fontSize: 10 }} 
                                            minTickGap={30}
                                        />
                                        <YAxis 
                                            yAxisId="left"
                                            stroke="var(--text-secondary)" 
                                            tick={{ fontSize: 11 }} 
                                            tickFormatter={v => `${(v / 1000).toFixed(0)}K`} 
                                        />
                                        <YAxis 
                                            yAxisId="right"
                                            orientation="right"
                                            stroke={NEPSE_COLOR} 
                                            tick={{ fontSize: 11 }}
                                            domain={['auto', 'auto']}
                                        />
                                        <RechartsTooltip content={<CustomTooltip />} />
                                        <Legend verticalAlign="top" height={36}/>
                                        <Line 
                                            yAxisId="left"
                                            type="monotone" 
                                            dataKey="portfolio_value" 
                                            name="Current Value"
                                            stroke="#6c5ce7" 
                                            strokeWidth={3} 
                                            dot={false} 
                                            activeDot={{ r: 6 }}
                                        />
                                        <Line 
                                            yAxisId="left"
                                            type="monotone" 
                                            dataKey="investment_cost" 
                                            name="Investment"
                                            stroke="#00b894" 
                                            strokeWidth={2} 
                                            strokeDasharray="5 5"
                                            dot={false} 
                                        />
                                        <Line 
                                            yAxisId="right"
                                            type="monotone" 
                                            dataKey="nepse_index" 
                                            name="NEPSE Index"
                                            stroke={NEPSE_COLOR} 
                                            strokeWidth={1.5} 
                                            dot={false} 
                                        />
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>
                        ) : (
                            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16, color: 'var(--text-secondary)', padding: 40 }}>
                                <LineChartOutlined style={{ fontSize: 48, opacity: 0.1 }} />
                                <div style={{ textAlign: 'center' }}>
                                    <p style={{ fontSize: 16, fontWeight: 'bold', margin: '0 0 8px 0' }}>No Historical Data</p>
                                    <p style={{ fontSize: 13, marginBottom: 20 }}>Historical prices must be downloaded to compute past portfolio values. Go to <b>Prices &rarr; Historical Prices</b> and click <b>Sync Historical Data</b>.</p>
                                </div>
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
