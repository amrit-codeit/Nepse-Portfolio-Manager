import React, { useState, useEffect } from 'react';
import { Table, InputNumber, Button, Tag, Space, Tooltip, message, Typography, Spin, Progress } from 'antd';
import { AimOutlined, SaveOutlined, SyncOutlined, ThunderboltOutlined, FallOutlined, RiseOutlined, SafetyOutlined, WarningOutlined, CloseCircleOutlined } from '@ant-design/icons';
import { updateTargetWeight, getExecutiveSummary } from '../../services/api';

const { Text } = Typography;

function formatNPR(value) {
    if (value == null) return '—';
    return `Rs. ${Number(value).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const getVerdictConfig = (verdict) => {
    switch (verdict) {
        case 'BUY': return { color: '#00b894', icon: <ThunderboltOutlined />, label: 'BUY' };
        case 'ACCUMULATE': return { color: '#0984e3', icon: <RiseOutlined />, label: 'ACCUMULATE' };
        case 'HOLD': return { color: '#fdcb6e', icon: <SafetyOutlined />, label: 'HOLD' };
        case 'REDUCE': return { color: '#e17055', icon: <FallOutlined />, label: 'REDUCE' };
        case 'EXIT': return { color: '#d63031', icon: <CloseCircleOutlined />, label: 'EXIT' };
        case 'AVOID': return { color: '#636e72', icon: <WarningOutlined />, label: 'AVOID' };
        default: return { color: 'var(--text-secondary)', icon: <SyncOutlined spin />, label: '...' };
    }
};

export default function ActionCenterTab({ summary, context, isSipMode }) {
    const [holdings, setHoldings] = useState([]);
    const [verdicts, setVerdicts] = useState({});
    const [loadingVerdicts, setLoadingVerdicts] = useState(false);
    const [saving, setSaving] = useState({});

    // Initialize holdings when summary changes
    useEffect(() => {
        if (summary?.holdings) {
            // Sort by current weight descending
            const sorted = [...summary.holdings].sort((a, b) => (b.current_value || 0) - (a.current_value || 0));
            setHoldings(sorted);
        }
    }, [summary]);

    // Fetch AI/System Verdicts for all holdings
    useEffect(() => {
        if (!summary?.holdings || summary.holdings.length === 0 || context.type !== 'member') return;

        let isMounted = true;
        const fetchVerdicts = async () => {
            setLoadingVerdicts(true);
            const newVerdicts = { ...verdicts };
            
            // Fetch in batches of 3 to avoid hammering the backend
            for (let i = 0; i < summary.holdings.length; i += 3) {
                const batch = summary.holdings.slice(i, i + 3);
                await Promise.all(batch.map(async (h) => {
                    if (newVerdicts[h.symbol]) return; // already fetched
                    try {
                        const res = await getExecutiveSummary(h.symbol, context.id);
                        newVerdicts[h.symbol] = {
                            action_verdict: res.data.action_verdict,
                            health_score: res.data.health_score
                        };
                    } catch (e) {
                        newVerdicts[h.symbol] = { action_verdict: 'ERROR', health_score: 0 };
                    }
                }));
                if (isMounted) setVerdicts({ ...newVerdicts });
            }
            if (isMounted) setLoadingVerdicts(false);
        };

        fetchVerdicts();
        return () => { isMounted = false; };
    }, [summary, context]);

    const handleTargetWeightChange = (id, value) => {
        setHoldings(prev => prev.map(h => h.id === id ? { ...h, temp_target_weight: value } : h));
    };

    const saveTargetWeight = async (holding) => {
        const target = holding.temp_target_weight !== undefined ? holding.temp_target_weight : holding.target_weight;
        if (target == null) return;

        setSaving(prev => ({ ...prev, [holding.id]: true }));
        try {
            await updateTargetWeight(holding.id, target);
            message.success(`${holding.symbol} target weight updated`);
            setHoldings(prev => prev.map(h => h.id === holding.id ? { ...h, target_weight: target } : h));
        } catch (e) {
            message.error(`Failed to save target weight for ${holding.symbol}`);
        }
        setSaving(prev => ({ ...prev, [holding.id]: false }));
    };

    if (context.type !== 'member') {
        return (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
                <AimOutlined style={{ fontSize: 48, opacity: 0.1, marginBottom: 16, display: 'block' }} />
                <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Select a Single Member</div>
                <p style={{ fontSize: 13 }}>Action Center & Rebalancing requires a specific portfolio member context.</p>
            </div>
        );
    }

    if (isSipMode) {
        return (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
                <AimOutlined style={{ fontSize: 48, opacity: 0.1, marginBottom: 16, display: 'block' }} />
                <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Not Applicable for SIPs</div>
                <p style={{ fontSize: 13 }}>Position Advisor and Target Rebalancing are designed for Equity portfolios.</p>
            </div>
        );
    }

    const totalPortfolioValue = summary?.current_value || 1;

    const columns = [
        {
            title: 'Symbol',
            dataIndex: 'symbol',
            key: 'symbol',
            width: 100,
            render: (text, record) => (
                <div>
                    <div style={{ fontWeight: 700 }}>{text}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{record.sector}</div>
                </div>
            )
        },
        {
            title: 'Verdict',
            key: 'verdict',
            width: 130,
            render: (_, record) => {
                const v = verdicts[record.symbol];
                if (!v) return <span style={{ color: 'var(--text-muted)', fontSize: 11 }}><SyncOutlined spin /> Analyzing</span>;
                const cfg = getVerdictConfig(v.action_verdict);
                return (
                    <div>
                        <Tag color={cfg.color} style={{ background: `${cfg.color}15`, borderColor: `${cfg.color}33`, color: cfg.color, fontWeight: 700 }}>
                            {cfg.icon} {cfg.label}
                        </Tag>
                        {v.health_score > 0 && (
                            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
                                Health: <span style={{ color: v.health_score >= 60 ? '#00b894' : '#fdcb6e', fontWeight: 600 }}>{v.health_score}</span>
                            </div>
                        )}
                    </div>
                );
            }
        },
        {
            title: 'Position',
            key: 'position',
            width: 120,
            render: (_, record) => {
                const currentWeight = ((record.current_value / totalPortfolioValue) * 100) || 0;
                return (
                    <div>
                        <div style={{ fontSize: 12, fontWeight: 600 }}>{currentWeight.toFixed(1)}% Weight</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Qty: {record.current_qty}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>WACC: {formatNPR(record.wacc)}</div>
                    </div>
                );
            }
        },
        {
            title: 'Performance',
            key: 'performance',
            width: 160,
            render: (_, record) => {
                const isPositive = record.unrealized_pnl >= 0;
                const pnlColor = isPositive ? '#00b894' : '#d63031';
                const xirrColor = (record.xirr || 0) >= 0 ? '#00b894' : '#d63031';
                
                return (
                    <div>
                        <div style={{ fontSize: 12, fontWeight: 600, color: pnlColor }}>
                            {isPositive ? '+' : ''}{record.pnl_pct?.toFixed(1)}% ({formatNPR(Math.abs(record.unrealized_pnl))})
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'flex', gap: 12, marginTop: 2 }}>
                            <span>XIRR: <span style={{color: xirrColor, fontWeight: 600}}>{(record.xirr || 0).toFixed(1)}%</span></span>
                            {record.dividend_yield > 0 && (
                                <Tooltip title={`Historical Dividends Received: ${formatNPR(record.dividend_income)}`}>
                                    <span style={{color: '#0984e3'}}>Yld: {record.dividend_yield.toFixed(1)}%</span>
                                </Tooltip>
                            )}
                        </div>
                    </div>
                );
            }
        },
        {
            title: 'Target Weight (%)',
            key: 'target_weight',
            width: 160,
            render: (_, record) => (
                <Space.Compact style={{ width: '100%' }}>
                    <InputNumber
                        min={0}
                        max={100}
                        step={1}
                        value={record.temp_target_weight !== undefined ? record.temp_target_weight : record.target_weight}
                        onChange={(v) => handleTargetWeightChange(record.id, v)}
                        style={{ width: '70%', background: 'var(--bg-glass)' }}
                        placeholder="Target %"
                    />
                    <Button 
                        type="primary" 
                        icon={<SaveOutlined />} 
                        onClick={() => saveTargetWeight(record)}
                        loading={saving[record.id]}
                        disabled={(record.temp_target_weight ?? record.target_weight) === record.target_weight}
                    />
                </Space.Compact>
            )
        },
        {
            title: 'Rebalance Action',
            key: 'rebalance',
            render: (_, record) => {
                const targetWeight = record.temp_target_weight !== undefined ? record.temp_target_weight : (record.target_weight || 0);
                if (!targetWeight) return <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>Set target %</span>;

                const currentWeight = (record.current_value / totalPortfolioValue) * 100;
                const targetValue = (targetWeight / 100) * totalPortfolioValue;
                const valueDelta = targetValue - record.current_value;
                const ltp = record.ltp || 1; // avoid div by 0
                const qtyDelta = Math.round(valueDelta / ltp);

                if (Math.abs(qtyDelta) < 5) return <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>Balanced</span>;

                const isBuy = qtyDelta > 0;
                return (
                    <div>
                        <div style={{ fontWeight: 700, color: isBuy ? '#0984e3' : '#e17055', fontSize: 13 }}>
                            {isBuy ? 'BUY' : 'SELL'} {Math.abs(qtyDelta).toLocaleString()} units
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                            Est: {formatNPR(Math.abs(valueDelta))}
                        </div>
                    </div>
                );
            }
        }
    ];

    const totalTargetWeight = holdings.reduce((sum, h) => sum + (h.temp_target_weight !== undefined ? h.temp_target_weight : (h.target_weight || 0)), 0);

    return (
        <div className="animate-in" style={{ padding: '0 12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 16 }}>
                <div>
                    <h3 style={{ margin: 0, fontSize: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <AimOutlined style={{ color: '#0984e3' }} /> 
                        Portfolio Action Center & Rebalancer
                    </h3>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
                        Set target allocation weights to calculate exact Buy/Sell quantities. Verdicts are powered by the AI Position Advisor.
                    </div>
                </div>
                
                <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>Total Target Weight</div>
                    <Progress 
                        percent={totalTargetWeight} 
                        status={totalTargetWeight > 100 ? 'exception' : 'active'}
                        strokeColor={totalTargetWeight > 100 ? '#d63031' : totalTargetWeight === 100 ? '#00b894' : '#0984e3'}
                        style={{ width: 150 }}
                    />
                </div>
            </div>

            <Table 
                dataSource={holdings} 
                columns={columns} 
                rowKey="id" 
                pagination={false}
                size="small"
                scroll={{ x: 700 }}
                className="portfolio-table"
                rowClassName={(r) => {
                    const v = verdicts[r.symbol]?.action_verdict;
                    if (v === 'ACCUMULATE' || v === 'BUY') return 'row-positive';
                    if (v === 'EXIT' || v === 'REDUCE') return 'row-negative';
                    return '';
                }}
            />
            {loadingVerdicts && (
                <div style={{ textAlign: 'center', padding: '16px', color: 'var(--text-muted)', fontSize: 12 }}>
                    <Spin size="small" style={{ marginRight: 8 }} /> Analyzing portfolio positions...
                </div>
            )}
        </div>
    );
}
