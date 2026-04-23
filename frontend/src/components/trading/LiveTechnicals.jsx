import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Select, Spin, Alert, Row, Col, Tag, Typography } from 'antd';
import { RiseOutlined, AimOutlined, BarChartOutlined, LineChartOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { getCompanies, getExtendedTechnicals } from '../../services/api';

const { Title, Paragraph } = Typography;

function formatNPR(value, decimals = 2) {
    if (value === null || value === undefined || isNaN(value)) return 'N/A';
    return 'Rs. ' + Number(value).toLocaleString('en-IN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export default function LiveTechnicals() {
    const [symbol, setSymbol] = useState(null);

    const { data: companiesRaw } = useQuery({
        queryKey: ['companies', 'all'],
        queryFn: () => getCompanies({ limit: 1000 }).then(r => r.data.companies),
    });
    
    const companyOptions = useMemo(() =>
        (companiesRaw || []).map(c => ({ value: c.symbol, label: `${c.symbol} — ${c.name || ''}` })),
        [companiesRaw]
    );

    const { data: extTech, isLoading, isError } = useQuery({
        queryKey: ['extended-technicals', symbol],
        queryFn: () => getExtendedTechnicals(symbol).then(r => r.data),
        enabled: !!symbol,
    });

    return (
        <div className="animate-in">
            <div className="stat-card" style={{ padding: '16px 20px', marginBottom: 24, display: 'flex', gap: 16, alignItems: 'center' }}>
                <div style={{ fontSize: 14, fontWeight: 500 }}>Select Stock:</div>
                <Select
                    showSearch
                    optionFilterProp="label"
                    value={symbol}
                    onChange={setSymbol}
                    options={companyOptions}
                    placeholder="Search stock to view technicals..."
                    style={{ flex: 1, maxWidth: 400 }}
                    size="large"
                />
            </div>

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

            {isError && (
                <Alert message="Error" description="Failed to fetch technical metrics for this stock." type="error" showIcon style={{ marginBottom: 24 }} />
            )}

            {extTech && !extTech.error && (
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
            )}
        </div>
    );
}
