import React, { useState, useEffect, useMemo } from 'react';
import { Table, InputNumber, Button, Tag, Space, Tooltip, message, Spin, Progress, Segmented, Collapse, Badge, Alert } from 'antd';
import { AimOutlined, SaveOutlined, SyncOutlined, ThunderboltOutlined, FallOutlined, RiseOutlined, SafetyOutlined, WarningOutlined, CloseCircleOutlined, InfoCircleOutlined, ReloadOutlined } from '@ant-design/icons';
import { updateTargetWeight, getExecutiveSummary } from '../../services/api';

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

const URGENCY_ORDER = {
    EXIT: 0,
    REDUCE: 1,
    ACCUMULATE: 2,
    BUY: 3,
    HOLD: 4,
    AVOID: 5
};

const getHealthColor = (score) => {
    if (score >= 70) return '#00b894';
    if (score >= 50) return '#fdcb6e';
    return '#d63031';
};

const getSectorColor = (weight) => {
    if (weight >= 40) return '#d63031';
    if (weight >= 25) return '#fdcb6e';
    return '#00b894';
};

const getTargetWeight = (holding) => (
    holding.temp_target_weight !== undefined ? holding.temp_target_weight : holding.target_weight
);

const getActionDirective = (verdict, record, currentWeight) => {
    const qty = Number(record.current_qty || 0);
    switch (verdict) {
        case 'EXIT':
            return `Sell all ${qty.toLocaleString('en-IN')} units - thesis or valuation failed`;
        case 'REDUCE':
            return `Consider trimming ~30% (about ${Math.round(qty * 0.3).toLocaleString('en-IN')} units)`;
        case 'ACCUMULATE':
            return `Set target weight above ${currentWeight.toFixed(1)}% in the rebalancer`;
        case 'BUY':
            return 'No position - use rebalancer to set initial target weight';
        case 'HOLD':
            return 'No action - monitor for deterioration';
        case 'AVOID':
            return 'Avoid adding capital - wait for a better setup';
        default:
            return '';
    }
};

export default function ActionCenterTab({ summary, context, isSipMode }) {
    const [verdicts, setVerdicts] = useState({});
    const [loadingVerdicts, setLoadingVerdicts] = useState(false);
    const [verdictsLastFetched, setVerdictsLastFetched] = useState(null);
    const [nowMs, setNowMs] = useState(null);
    const [refreshTick, setRefreshTick] = useState(0);
    const [saving, setSaving] = useState({});
    const [sortMode, setSortMode] = useState('urgency');
    const [tempTargetWeights, setTempTargetWeights] = useState({});
    const [savedTargetWeights, setSavedTargetWeights] = useState({});

    const holdings = useMemo(() => (
        (summary?.holdings || []).map(h => ({
            ...h,
            target_weight: savedTargetWeights[h.id] ?? h.target_weight,
            ...(Object.prototype.hasOwnProperty.call(tempTargetWeights, h.id)
                ? { temp_target_weight: tempTargetWeights[h.id] }
                : {})
        }))
    ), [summary, savedTargetWeights, tempTargetWeights]);

    // Fetch AI/System Verdicts for all holdings
    useEffect(() => {
        if (!summary?.holdings || summary.holdings.length === 0 || context.type !== 'member') return;

        let isMounted = true;
        const fetchVerdicts = async () => {
            setLoadingVerdicts(true);
            const newVerdicts = {};
            
            // Fetch in batches of 3 to avoid hammering the backend
            for (let i = 0; i < summary.holdings.length; i += 3) {
                const batch = summary.holdings.slice(i, i + 3);
                await Promise.all(batch.map(async (h) => {
                    try {
                        const res = await getExecutiveSummary(h.symbol, context.id);
                        newVerdicts[h.symbol] = {
                            action_verdict: res.data.action_verdict,
                            health_score: res.data.health_score,
                            score_context: res.data.score_context
                        };
                    } catch {
                        newVerdicts[h.symbol] = { action_verdict: 'ERROR', health_score: 0 };
                    }
                }));
                if (isMounted) setVerdicts({ ...newVerdicts });
            }
            if (isMounted) {
                const fetchedAt = Date.now();
                setVerdictsLastFetched(fetchedAt);
                setNowMs(fetchedAt);
                setLoadingVerdicts(false);
            }
        };

        fetchVerdicts();
        return () => { isMounted = false; };
    }, [summary, context, refreshTick]);

    const handleTargetWeightChange = (id, value) => {
        setTempTargetWeights(prev => ({ ...prev, [id]: value }));
    };

    const saveTargetWeight = async (holding) => {
        const target = getTargetWeight(holding);
        if (target == null) return;

        setSaving(prev => ({ ...prev, [holding.id]: true }));
        try {
            await updateTargetWeight(holding.id, target);
            message.success(`${holding.symbol} target weight updated`);
            setSavedTargetWeights(prev => ({ ...prev, [holding.id]: target }));
            setTempTargetWeights(prev => {
                const next = { ...prev };
                delete next[holding.id];
                return next;
            });
        } catch {
            message.error(`Failed to save target weight for ${holding.symbol}`);
        }
        setSaving(prev => ({ ...prev, [holding.id]: false }));
    };

    useEffect(() => {
        const timer = setInterval(() => setNowMs(Date.now()), 60 * 1000);
        return () => clearInterval(timer);
    }, []);

    const totalPortfolioValue = summary?.current_value || 1;

    const sectorAllocations = useMemo(() => {
        const sectorMap = holdings.reduce((acc, h) => {
            const sector = h.sector || 'Unclassified';
            acc[sector] = (acc[sector] || 0) + (Number(h.current_value) || 0);
            return acc;
        }, {});

        return Object.entries(sectorMap)
            .map(([sector, value]) => ({
                sector,
                value,
                weight: totalPortfolioValue ? (value / totalPortfolioValue) * 100 : 0
            }))
            .sort((a, b) => b.weight - a.weight);
    }, [holdings, totalPortfolioValue]);

    const hasDangerousSector = sectorAllocations.some(s => s.weight >= 40);

    const sortedHoldings = useMemo(() => {
        return [...holdings].sort((a, b) => {
            if (sortMode === 'urgency') {
                const verdictA = verdicts[a.symbol]?.action_verdict;
                const verdictB = verdicts[b.symbol]?.action_verdict;
                const urgencyA = URGENCY_ORDER[verdictA] ?? 99;
                const urgencyB = URGENCY_ORDER[verdictB] ?? 99;
                if (urgencyA !== urgencyB) return urgencyA - urgencyB;
            }
            return (b.current_value || 0) - (a.current_value || 0);
        });
    }, [holdings, sortMode, verdicts]);

    const urgentHoldings = useMemo(() => (
        sortedHoldings.filter(h => ['EXIT', 'REDUCE'].includes(verdicts[h.symbol]?.action_verdict))
    ), [sortedHoldings, verdicts]);

    const totalTargetWeight = useMemo(() => (
        holdings.reduce((sum, h) => sum + (Number(getTargetWeight(h)) || 0), 0)
    ), [holdings]);

    const targetWeightsSetCount = useMemo(() => (
        holdings.filter(h => getTargetWeight(h) != null && Number(getTargetWeight(h)) > 0).length
    ), [holdings]);

    const rebalanceCashFlow = useMemo(() => {
        return holdings.reduce((acc, h) => {
            const targetWeight = Number(getTargetWeight(h)) || 0;
            if (!targetWeight) return acc;

            const targetValue = (targetWeight / 100) * totalPortfolioValue;
            const valueDelta = targetValue - (Number(h.current_value) || 0);
            const qtyDelta = Math.round(valueDelta / (h.ltp || 1));

            if (qtyDelta < 0) acc.sellProceeds += Math.abs(valueDelta);
            if (qtyDelta > 0) acc.buyCapital += valueDelta;
            return acc;
        }, { sellProceeds: 0, buyCapital: 0 });
    }, [holdings, totalPortfolioValue]);

    const netCash = rebalanceCashFlow.sellProceeds - rebalanceCashFlow.buyCapital;
    const isStaleVerdicts = verdictsLastFetched && nowMs && (nowMs - verdictsLastFetched > 4 * 60 * 60 * 1000);
    const verdictsAsOf = verdictsLastFetched
        ? new Date(verdictsLastFetched).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        : null;

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
                const currentWeight = ((record.current_value / totalPortfolioValue) * 100) || 0;
                const directive = getActionDirective(v.action_verdict, record, currentWeight);
                return (
                    <div>
                        <Space size={4} wrap>
                            <Tag color={cfg.color} style={{ background: `${cfg.color}15`, borderColor: `${cfg.color}33`, color: cfg.color, fontWeight: 700, marginInlineEnd: 0 }}>
                                {cfg.icon} {cfg.label}
                            </Tag>
                            {v.health_score > 0 && v.score_context && (
                                <Tooltip title={v.score_context}>
                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: getHealthColor(v.health_score), fontSize: 11, fontWeight: 700, cursor: 'help' }}>
                                        {v.health_score} <InfoCircleOutlined />
                                    </span>
                                </Tooltip>
                            )}
                        </Space>
                        {v.health_score > 0 && !v.score_context && (
                            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
                                Health: <span style={{ color: getHealthColor(v.health_score), fontWeight: 600 }}>{v.health_score}</span>
                            </div>
                        )}
                        {directive && (
                            <Tooltip title={directive}>
                                <div style={{
                                    fontSize: 10,
                                    color: 'var(--text-secondary)',
                                    marginTop: 5,
                                    maxWidth: 190,
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap'
                                }}>
                                    {directive}
                                </div>
                            </Tooltip>
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
                const targetWeight = Number(getTargetWeight(record)) || 0;
                if (!targetWeight) return <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>Set target %</span>;

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

    const targetStatus = (() => {
        if (targetWeightsSetCount === 0) {
            return { tone: 'muted', text: 'Set target weights to generate a rebalance plan.' };
        }
        if (totalTargetWeight > 100) {
            return { tone: 'error', text: `Total exceeds 100% by ${(totalTargetWeight - 100).toFixed(1)}%. Reduce target weights before executing.` };
        }
        if (Math.abs(totalTargetWeight - 100) <= 0.5) {
            return { tone: 'success', text: 'Fully allocated plan.' };
        }
        if (totalTargetWeight >= 80 && totalTargetWeight < 99) {
            return { tone: 'muted', text: `${(100 - totalTargetWeight).toFixed(1)}% unallocated - consider assigning to cash, FD, or a watchlist position.` };
        }
        return { tone: 'muted', text: `${(100 - totalTargetWeight).toFixed(1)}% unallocated.` };
    })();

    const targetStatusColor = targetStatus.tone === 'error'
        ? '#d63031'
        : targetStatus.tone === 'success'
            ? '#00b894'
            : 'var(--text-muted)';

    const cashFlowStatus = (() => {
        const tolerance = totalPortfolioValue * 0.02;
        if (Math.abs(netCash) <= tolerance) return 'Self-funded plan';
        if (netCash < 0) return `Requires ${formatNPR(Math.abs(netCash))} fresh capital`;
        return `Frees ${formatNPR(netCash)} for deployment`;
    })();

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
                
                <div style={{ textAlign: 'right', minWidth: 250 }}>
                    <Space size={8} style={{ marginBottom: 6 }}>
                        <span style={{ fontSize: 11, color: isStaleVerdicts ? '#fdcb6e' : 'var(--text-muted)' }}>
                            {verdictsAsOf ? `Verdicts as of ${verdictsAsOf}` : 'Verdicts pending'}
                        </span>
                        <Tooltip title="Refresh all verdicts">
                            <Button
                                size="small"
                                type="text"
                                icon={<ReloadOutlined spin={loadingVerdicts} />}
                                loading={loadingVerdicts}
                                onClick={() => {
                                    setVerdicts({});
                                    setVerdictsLastFetched(null);
                                    setRefreshTick(prev => prev + 1);
                                }}
                            />
                        </Tooltip>
                    </Space>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>Total Target Weight</div>
                    <Progress 
                        percent={totalTargetWeight} 
                        status={totalTargetWeight > 100 ? 'exception' : 'active'}
                        strokeColor={totalTargetWeight > 100 ? '#d63031' : Math.abs(totalTargetWeight - 100) <= 0.5 ? '#00b894' : '#0984e3'}
                        style={{ width: 210 }}
                    />
                    <div style={{ fontSize: 11, color: targetStatusColor, marginTop: 4, maxWidth: 260 }}>
                        {targetStatus.text}
                    </div>
                </div>
            </div>

            <Segmented
                size="small"
                value={sortMode}
                onChange={setSortMode}
                options={[
                    { label: 'By Urgency', value: 'urgency' },
                    { label: 'By Weight', value: 'weight' }
                ]}
                style={{ marginBottom: 12, background: 'var(--bg-glass)' }}
            />

            <Collapse
                key={hasDangerousSector ? 'sector-danger' : 'sector-normal'}
                defaultActiveKey={hasDangerousSector ? ['sector-concentration'] : []}
                items={[{
                    key: 'sector-concentration',
                    label: (
                        <Space size={8}>
                            <span style={{ fontWeight: 700 }}>Sector Concentration</span>
                            {hasDangerousSector && <Badge color="#d63031" text={<span style={{ color: '#d63031', fontSize: 11 }}>Dangerous concentration detected</span>} />}
                        </Space>
                    ),
                    children: (
                        <div style={{ display: 'grid', gap: 10 }}>
                            {sectorAllocations.map(s => {
                                const color = getSectorColor(s.weight);
                                return (
                                    <div key={s.sector}>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 4 }}>
                                            <Space size={8} style={{ minWidth: 0 }}>
                                                <span style={{ fontSize: 12, fontWeight: 700 }}>{s.sector}</span>
                                                {s.weight >= 40 && <Tag color="error" style={{ marginInlineEnd: 0 }}>Dangerous</Tag>}
                                                {s.weight >= 25 && s.weight < 40 && <Tag color="warning" style={{ marginInlineEnd: 0 }}>Elevated</Tag>}
                                            </Space>
                                            <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 700 }}>{s.weight.toFixed(1)}%</span>
                                        </div>
                                        <Progress percent={Math.min(s.weight, 100)} showInfo={false} size="small" strokeColor={color} trailColor="var(--border-color)" />
                                        {s.weight >= 40 && (
                                            <div style={{ fontSize: 11, color: '#fdcb6e', marginTop: 3 }}>
                                                Single-sector above 40% is high risk in NEPSE due to correlated liquidity events.
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )
                }]}
                style={{ marginBottom: 12, background: 'var(--bg-glass)', border: '1px solid var(--border-color)' }}
            />

            {targetWeightsSetCount >= 2 && (
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
                    gap: 12,
                    marginBottom: 12,
                    padding: 12,
                    background: 'var(--bg-glass)',
                    border: '1px solid rgba(108, 92, 231, 0.3)',
                    borderRadius: 8
                }}>
                    <div>
                        <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Planned Sells</div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: '#e17055' }}>{formatNPR(rebalanceCashFlow.sellProceeds)}</div>
                    </div>
                    <div>
                        <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Planned Buys</div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: '#0984e3' }}>{formatNPR(rebalanceCashFlow.buyCapital)}</div>
                    </div>
                    <div>
                        <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Net Cash</div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: netCash >= 0 ? '#00b894' : '#d63031' }}>{formatNPR(netCash)}</div>
                    </div>
                    <div style={{ gridColumn: '1 / -1', fontSize: 11, color: 'var(--text-secondary)' }}>
                        <span style={{ color: netCash >= 0 ? '#00b894' : '#d63031', fontWeight: 700 }}>{cashFlowStatus}.</span>{' '}
                        Estimates exclude ~0.4% brokerage and 7.5% CGT on short-term gains. Actual proceeds will be lower.
                    </div>
                </div>
            )}

            {totalTargetWeight > 100 && (
                <Alert
                    type="error"
                    showIcon
                    message={`Total exceeds 100% by ${(totalTargetWeight - 100).toFixed(1)}%. Reduce target weights before executing.`}
                    style={{ marginBottom: 12, background: 'rgba(214,48,49,0.08)', border: '1px solid rgba(214,48,49,0.35)', color: '#d63031' }}
                />
            )}

            {sortMode === 'urgency' && urgentHoldings.length > 0 && (
                <div style={{
                    position: 'sticky',
                    top: 0,
                    zIndex: 3,
                    marginBottom: 8,
                    padding: '10px 12px',
                    background: 'rgba(214,48,49,0.12)',
                    border: '1px solid rgba(214,48,49,0.35)',
                    borderRadius: 8
                }}>
                    <Space size={[8, 8]} wrap>
                        <span style={{ color: '#d63031', fontWeight: 800, fontSize: 12 }}>Urgent Actions</span>
                        {urgentHoldings.map(h => {
                            const weight = ((h.current_value / totalPortfolioValue) * 100) || 0;
                            const v = verdicts[h.symbol];
                            const cfg = getVerdictConfig(v.action_verdict);
                            return (
                                <Tooltip key={h.id} title={v.score_context || 'No score context available'}>
                                    <Tag color={cfg.color} style={{ background: `${cfg.color}18`, borderColor: `${cfg.color}55`, color: cfg.color, fontWeight: 700, marginInlineEnd: 0 }}>
                                        {h.symbol} {weight.toFixed(1)}%
                                    </Tag>
                                </Tooltip>
                            );
                        })}
                    </Space>
                </div>
            )}

            <Table 
                dataSource={sortedHoldings} 
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
