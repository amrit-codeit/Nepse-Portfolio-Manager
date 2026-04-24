import { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Select, Spin, Alert, Row, Col, Tag, Typography, Button, message, Tabs, Tooltip } from 'antd';
import { RiseOutlined, AimOutlined, BarChartOutlined, LineChartOutlined, ThunderboltOutlined, SyncOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import { getCompanies, getExtendedTechnicals, scrapeTechnicals, getMarketContext } from '../../services/api';

const { Title, Paragraph, Text } = Typography;

function formatNPR(value, decimals = 2) {
    if (value === null || value === undefined || isNaN(value)) return 'N/A';
    return 'Rs. ' + Number(value).toLocaleString('en-IN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export default function LiveTechnicals({ symbol: propSymbol }) {
    const queryClient = useQueryClient();
    const [internalSymbol, setInternalSymbol] = useState(null);
    const symbol = propSymbol || internalSymbol;

    const { data: companiesRaw } = useQuery({
        queryKey: ['companies', 'all'],
        queryFn: () => getCompanies({ limit: 1000 }).then(r => r.data.companies),
    });
    
    const companyOptions = useMemo(() =>
        (companiesRaw || []).map(c => ({ value: c.symbol, label: `${c.symbol} — ${c.name || ''}` })),
        [companiesRaw]
    );

    const { data: extTech, isLoading, isError, refetch } = useQuery({
        queryKey: ['extended-technicals', symbol],
        queryFn: () => getExtendedTechnicals(symbol).then(r => r.data),
        enabled: !!symbol,
    });

    const { data: marketContext } = useQuery({
        queryKey: ['market-context'],
        queryFn: () => getMarketContext().then(r => r.data),
        enabled: !!symbol,
    });

    const scrapeMut = useMutation({
        mutationFn: () => scrapeTechnicals(symbol),
        onSuccess: () => {
            message.success(`Refreshed technicals for ${symbol}`);
            refetch();
            queryClient.invalidateQueries(['extended-technicals', symbol]);
        },
        onError: () => message.error('Failed to refresh data')
    });

    const TechnicalMetrics = () => (
        <div className="animate-in">
            <Row gutter={[16, 16]}>
                <Col xs={24} lg={12}>
                    <div className="stat-card" style={{ padding: '24px', height: '100%' }}>
                        <div className="stat-label" style={{ marginBottom: 20, fontSize: 16 }}><RiseOutlined /> Trend & Momentum</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: 12 }}>
                                <span style={{ color: 'var(--text-secondary)' }}>Current Price (LTP)</span>
                                <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--accent-primary)' }}>{formatNPR(extTech.ltp)}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: 12 }}>
                                <span style={{ color: 'var(--text-secondary)' }}>ADX (14) - Trend Strength</span>
                                <span style={{ fontWeight: 600 }}>{extTech.adx_14 ? `${extTech.adx_14} (${extTech.adx_14 > 25 ? 'Strong' : 'Weak'})` : 'N/A'}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: 12 }}>
                                <span style={{ color: 'var(--text-secondary)' }}>Relative Strength vs NEPSE</span>
                                <span style={{ fontWeight: 600 }}>
                                    {extTech.rs_alpha > 0 ? '+' : ''}{extTech.rs_alpha}% 
                                    <Tag style={{ marginLeft: 8 }} color={extTech.rs_trend === 'Outperforming' ? 'green' : extTech.rs_trend === 'Underperforming' ? 'red' : 'default'}>{extTech.rs_trend}</Tag>
                                </span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: 12 }}>
                                <span style={{ color: 'var(--text-secondary)' }}>Bollinger Squeeze</span>
                                <Tag color={extTech.bb_squeeze ? 'orange' : 'default'}>{extTech.bb_squeeze ? 'SQUEEZE ACTIVE' : 'Normal'}</Tag>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ color: 'var(--text-secondary)' }}>52-Week Placement</span>
                                <span style={{ fontWeight: 600 }}>{extTech.placement_52w ? `${extTech.placement_52w.toFixed(1)}%` : 'N/A'}</span>
                            </div>
                        </div>
                    </div>
                </Col>

                <Col xs={24} lg={12}>
                    <div className="stat-card" style={{ padding: '24px', height: '100%' }}>
                        <div className="stat-label" style={{ marginBottom: 20, fontSize: 16 }}><BarChartOutlined /> Volume & Volatility</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: 12 }}>
                                <span style={{ color: 'var(--text-secondary)' }}>Avg Daily Turnover (20d)</span>
                                <span style={{ fontWeight: 600 }}>{extTech.adt_20 ? formatNPR(extTech.adt_20) : 'N/A'}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: 12 }}>
                                <span style={{ color: 'var(--text-secondary)' }}>ATR (14) - Average True Range</span>
                                <span style={{ fontWeight: 600 }}>{extTech.atr_14 ? formatNPR(extTech.atr_14) : 'N/A'}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: 12 }}>
                                <span style={{ color: 'var(--text-secondary)' }}>VSA Reversal Signal</span>
                                <span>
                                    {extTech.vsa_reversal ? <Tag color={extTech.vsa_reversal.includes('Bullish') ? 'green' : 'red'}>{extTech.vsa_reversal} ✨</Tag> : <Text type="secondary">None</Text>}
                                </span>
                            </div>
                            
                            {extTech.target_1 && extTech.stop_loss && (
                                <div style={{ marginTop: 8, padding: '16px', background: 'rgba(255,255,255,0.02)', borderRadius: 8, border: '1px dashed rgba(255,255,255,0.1)' }}>
                                    <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8 }}><ThunderboltOutlined /> ATR-Based Target Zones</div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                                        <span>Stop Loss:</span>
                                        <span style={{ color: '#d63031', fontWeight: 600 }}>{formatNPR(extTech.stop_loss)}</span>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                                        <span>Target 1:</span>
                                        <span style={{ color: '#00b894', fontWeight: 600 }}>{formatNPR(extTech.target_1)}</span>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                        <span>Target 2:</span>
                                        <span style={{ color: '#00b894', fontWeight: 600 }}>{formatNPR(extTech.target_2)}</span>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </Col>

                <Col xs={24}>
                    <div className="stat-card" style={{ padding: '24px' }}>
                        <div className="stat-label" style={{ marginBottom: 20, fontSize: 16 }}><AimOutlined /> Floor Trader Pivot Points</div>
                        {extTech.pivot_points ? (
                            <div style={{ display: 'flex', justifyContent: 'space-between', textAlign: 'center', background: 'rgba(0,0,0,0.2)', padding: '20px', borderRadius: 8 }}>
                                <div><div style={{ color: 'var(--text-secondary)', marginBottom: 8 }}>Support 3</div><div style={{ color: '#00b894', fontWeight: 600, fontSize: 16 }}>{formatNPR(extTech.pivot_points.S3)}</div></div>
                                <div><div style={{ color: 'var(--text-secondary)', marginBottom: 8 }}>Support 2</div><div style={{ color: '#00b894', fontWeight: 600, fontSize: 16 }}>{formatNPR(extTech.pivot_points.S2)}</div></div>
                                <div><div style={{ color: 'var(--text-secondary)', marginBottom: 8 }}>Support 1</div><div style={{ color: '#00b894', fontWeight: 600, fontSize: 16 }}>{formatNPR(extTech.pivot_points.S1)}</div></div>
                                <div><div style={{ color: 'var(--accent-primary)', fontWeight: 700, marginBottom: 8 }}>Pivot Point</div><div style={{ color: 'var(--text-primary)', fontWeight: 800, fontSize: 20 }}>{formatNPR(extTech.pivot_points.P)}</div></div>
                                <div><div style={{ color: 'var(--text-secondary)', marginBottom: 8 }}>Resistance 1</div><div style={{ color: '#d63031', fontWeight: 600, fontSize: 16 }}>{formatNPR(extTech.pivot_points.R1)}</div></div>
                                <div><div style={{ color: 'var(--text-secondary)', marginBottom: 8 }}>Resistance 2</div><div style={{ color: '#d63031', fontWeight: 600, fontSize: 16 }}>{formatNPR(extTech.pivot_points.R2)}</div></div>
                                <div><div style={{ color: 'var(--text-secondary)', marginBottom: 8 }}>Resistance 3</div><div style={{ color: '#d63031', fontWeight: 600, fontSize: 16 }}>{formatNPR(extTech.pivot_points.R3)}</div></div>
                            </div>
                        ) : <div style={{ color: 'var(--text-secondary)', textAlign: 'center' }}>Pivot points not available.</div>}
                    </div>
                </Col>
            </Row>
        </div>
    );

    const ConjunctionGates = () => (
        <div className="animate-in" style={{ marginTop: 8 }}>
            <div className="stat-card" style={{ padding: '24px', background: 'linear-gradient(145deg, rgba(16, 185, 129, 0.05) 0%, rgba(15, 23, 42, 0) 100%)', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
                <div className="stat-label" style={{ marginBottom: 20, color: '#10b981', fontSize: 16 }}><SafetyCertificateOutlined /> Conjunction Verification Matrix</div>
                
                <Row gutter={[32, 32]}>
                    <Col xs={24} md={12}>
                        <div style={{ padding: 20, background: 'rgba(0,0,0,0.2)', borderRadius: 8, height: '100%' }}>
                            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 16, color: 'var(--text-secondary)' }}>Trading Gate Verifications</div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                                <Tooltip title="Is the overall NEPSE market going up?"><span style={{ borderBottom: '1px dashed rgba(255,255,255,0.3)', cursor: 'help' }}>Market Health (Gate 2)</span></Tooltip>
                                <Tag color={marketContext?.market_verdict === 'BULLISH' ? 'green' : marketContext?.market_verdict === 'BEARISH' ? 'red' : 'blue'}>{marketContext?.market_verdict || 'UNKNOWN'}</Tag>
                            </div>
                            {extTech?.sector && marketContext?.sectors && marketContext.sectors[extTech.sector] && (
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                                    <Tooltip title="Is this specific sector attracting money?"><span style={{ borderBottom: '1px dashed rgba(255,255,255,0.3)', cursor: 'help' }}>Sector Trend: {extTech.sector} (Gate 3)</span></Tooltip>
                                    <Tag color={marketContext.sectors[extTech.sector].trend.includes('Uptrend') ? 'green' : marketContext.sectors[extTech.sector].trend.includes('Downtrend') ? 'red' : 'blue'}>{marketContext.sectors[extTech.sector].trend}</Tag>
                                </div>
                            )}
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                                <Tooltip title="Checks if the company has safe debt levels or positive earnings."><span style={{ borderBottom: '1px dashed rgba(255,255,255,0.3)', cursor: 'help' }}>Fundamental Safety (Gate 4)</span></Tooltip>
                                <Tag color={extTech.gate4_fundamental === 'PASS' ? 'green' : extTech.gate4_fundamental === 'FAIL' ? 'red' : 'default'}>{extTech.gate4_fundamental}</Tag>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                                <Tooltip title="Are enough shares naturally traded daily (over 50L) to easily buy/sell?"><span style={{ borderBottom: '1px dashed rgba(255,255,255,0.3)', cursor: 'help' }}>Sufficient Liquidity (Gate 1)</span></Tooltip>
                                <Tag color={extTech.gate1_liquidity === 'PASS' ? 'green' : 'red'}>{extTech.gate1_liquidity}</Tag>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <Tooltip title="The algorithm's final technical verdict."><span style={{ borderBottom: '1px dashed rgba(255,255,255,0.3)', cursor: 'help', fontWeight: 600 }}>Technical Buy Signal (Gate 5)</span></Tooltip>
                                <Tag color={extTech.gate5_technical?.includes('BUY') ? 'green' : extTech.gate5_technical === 'AVOID' ? 'red' : 'default'}>{extTech.gate5_technical}</Tag>
                            </div>
                        </div>
                    </Col>

                    <Col xs={24} md={12}>
                        {extTech.rs_trend && (
                            <div style={{ padding: 20, background: 'rgba(0,0,0,0.2)', borderRadius: 8, marginBottom: 16 }}>
                                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: 'var(--text-secondary)' }}>Relative Strength vs NEPSE (60D)</div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ fontSize: 13 }}>Alpha (Outperformance)</span>
                                    <div>
                                        {extTech.rs_alpha !== null && (
                                            <span style={{ fontSize: 16, fontWeight: 700, marginRight: 12, color: extTech.rs_alpha > 0 ? '#10b981' : '#ef4444' }}>
                                                {extTech.rs_alpha > 0 ? '+' : ''}{extTech.rs_alpha}%
                                            </span>
                                        )}
                                        <Tag color={extTech.rs_trend === 'Outperforming' ? 'green' : extTech.rs_trend === 'Underperforming' ? 'red' : 'blue'}>
                                            {extTech.rs_trend}
                                        </Tag>
                                    </div>
                                </div>
                            </div>
                        )}
                    </Col>
                </Row>
            </div>
        </div>
    );

    const tabItems = [
        { key: 'metrics', label: 'Technical Metrics', children: <TechnicalMetrics /> },
        { key: 'gates', label: 'Conjunction Gates', children: <ConjunctionGates /> },
    ];

    return (
        <div className="animate-in">
            {!propSymbol && (
                <div className="stat-card" style={{ padding: '16px 20px', marginBottom: 24, display: 'flex', gap: 16, alignItems: 'center' }}>
                    <div style={{ fontSize: 14, fontWeight: 500 }}>Select Stock:</div>
                    <Select
                        showSearch
                        optionFilterProp="label"
                        value={symbol}
                        onChange={setInternalSymbol}
                        options={companyOptions}
                        placeholder="Search stock to view technicals..."
                        style={{ flex: 1, maxWidth: 400 }}
                        size="large"
                    />
                    {symbol && (
                        <Button 
                            icon={<SyncOutlined spin={scrapeMut.isPending} />} 
                            onClick={() => scrapeMut.mutate()}
                            loading={scrapeMut.isPending}
                        >
                            Scrape
                        </Button>
                    )}
                </div>
            )}

            {!symbol && (
                <div style={{ textAlign: 'center', padding: '80px 20px', background: 'var(--bg-secondary)', borderRadius: 12, border: '1px dashed var(--border-color)', marginTop: 20 }}>
                    <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.2 }}><LineChartOutlined /></div>
                    <Title level={4} style={{ color: 'var(--text-primary)' }}>Live Technical Metrics</Title>
                    <Paragraph style={{ color: 'var(--text-muted)', maxWidth: 500, margin: '0 auto', fontSize: 15 }}>
                        Select a stock to view its real-time technical structures, including Pivot Points, Average True Range (ATR), Trend Strength (ADX), Volume Spread Analysis (VSA), and Moving Averages.
                    </Paragraph>
                </div>
            )}

            {isLoading && (
                <div style={{ textAlign: 'center', padding: '60px 0' }}>
                    <Spin size="large" tip="Fetching live technicals..." />
                </div>
            )}

            {(isError || (extTech && extTech.error)) && symbol && (
                <Alert 
                    message="Data Error" 
                    description={extTech?.error || "Failed to fetch technical metrics for this stock."} 
                    type="error" 
                    showIcon 
                    style={{ marginBottom: 24 }} 
                    action={
                        <Button size="small" type="primary" ghost onClick={() => scrapeMut.mutate()} loading={scrapeMut.isPending}>
                            Scrape Now
                        </Button>
                    }
                />
            )}

            {extTech && !extTech.error && (
                <Tabs defaultActiveKey="metrics" items={tabItems} className="custom-tabs" />
            )}
        </div>
    );
}
