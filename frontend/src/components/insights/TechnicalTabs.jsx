import React, { useState } from 'react';
import { Row, Col, Progress, Tag, Tooltip, Tabs, Slider, InputNumber } from 'antd';
import { 
    BarChartOutlined, DashboardOutlined, SafetyCertificateOutlined,
    RiseOutlined, FallOutlined, ThunderboltOutlined, FundOutlined,
    AimOutlined, SlidersOutlined
} from '@ant-design/icons';
import PriceHistoryCard from '../portfolio/PriceHistoryCard';

function formatNPR(value, decimals = 2) {
    if (value === null || value === undefined) return '—';
    return `Rs. ${Number(value).toLocaleString('en-IN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
}

function getRSIColor(rsi) {
    if (rsi >= 70) return '#d63031';
    if (rsi >= 60) return '#e17055';
    if (rsi >= 40) return '#00b894';
    if (rsi >= 30) return '#0984e3';
    return '#6c5ce7';
}

function getRSILabel(rsi) {
    if (rsi >= 70) return 'Overbought';
    if (rsi >= 60) return 'Approaching Overbought';
    if (rsi >= 40) return 'Neutral';
    if (rsi >= 30) return 'Approaching Oversold';
    return 'Oversold';
}

export default function TechnicalTabs({ symbol, tech, extTech, marketContext, transactions }) {
    const [capital, setCapital] = useState(100000);
    const [riskPct, setRiskPct] = useState(2);

    const IndicatorsTab = () => (
        <div className="animate-in" style={{ marginTop: 16 }}>
            <div style={{ marginBottom: 24 }}>
                <PriceHistoryCard symbol={symbol} transactions={transactions} />
            </div>

            <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
                {/* 52-Week Range */}
                <Col xs={24} lg={12}>
                    <div className="stat-card" style={{ padding: '20px 24px', height: '100%' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                            <div className="stat-label"><BarChartOutlined /> 52-Week Range</div>
                        </div>
                        <div style={{ marginBottom: 8 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>
                                <span>Low: {tech ? formatNPR(tech.low_52w) : '—'}</span>
                                <span>High: {tech ? formatNPR(tech.high_52w) : '—'}</span>
                            </div>
                            <Progress percent={tech?.placement_52w || 0} showInfo={false}
                                strokeColor={{ '0%': '#d63031', '30%': '#fdcb6e', '60%': '#00b894', '100%': '#00b894' }}
                                trailColor="rgba(255,255,255,0.06)" size={['100%', 16]} />
                            <div style={{ textAlign: 'center', fontSize: 13, marginTop: 6, fontWeight: 600 }}>
                                LTP at {tech?.placement_52w?.toFixed(1) || 0}% of 52-week range
                            </div>
                        </div>
                    </div>
                </Col>
                {/* RSI */}
                <Col xs={24} lg={12}>
                    <div className="stat-card" style={{ padding: '20px 24px', height: '100%' }}>
                        <div className="stat-label" style={{ marginBottom: 16 }}><DashboardOutlined /> RSI (14)</div>
                        {tech?.rsi_14 ? (
                            <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                                    <div style={{ fontSize: 36, fontWeight: 700, color: getRSIColor(tech.rsi_14) }}>{tech.rsi_14.toFixed(1)}</div>
                                    <div>
                                        <Tag color={tech.rsi_14 >= 70 ? 'red' : tech.rsi_14 <= 30 ? 'green' : 'blue'} style={{ fontSize: 13 }}>{getRSILabel(tech.rsi_14)}</Tag>
                                        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 6 }}>
                                            {tech.rsi_14 >= 70 ? 'Stock overbought. Consider caution.' : tech.rsi_14 <= 30 ? 'Stock oversold. Potential buying opportunity.' : 'RSI is in neutral territory.'}
                                        </div>
                                    </div>
                                </div>
                                <Progress percent={tech.rsi_14} showInfo={false} strokeColor={getRSIColor(tech.rsi_14)} trailColor="rgba(255,255,255,0.06)" style={{ marginTop: 12 }} />
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                                    <span>Oversold (0)</span><span>Neutral (50)</span><span>Overbought (100)</span>
                                </div>
                            </div>
                        ) : <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Insufficient data.</div>}
                    </div>
                </Col>
            </Row>

            {/* EMAs */}
            <Row gutter={[16, 16]}>
                <Col xs={24} sm={12}>
                    <div className="stat-card" style={{ padding: '20px 24px' }}>
                        <div className="stat-label" style={{ marginBottom: 12 }}><ThunderboltOutlined /> 50-Day EMA</div>
                        {tech?.ema_50 ? (
                            <div>
                                <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>{formatNPR(tech.ema_50)}</div>
                                <Tag color={tech.ema_50_status === 'Bullish' ? 'green' : 'red'} style={{ fontSize: 13 }}>
                                    {tech.ema_50_status === 'Bullish' ? <RiseOutlined /> : <FallOutlined />} {tech.ema_50_status}
                                </Tag>
                                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
                                    Diff: {formatNPR(tech.ltp - tech.ema_50)} ({((tech.ltp - tech.ema_50) / tech.ema_50 * 100).toFixed(2)}%)
                                </div>
                            </div>
                        ) : <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Require 50 days data.</div>}
                    </div>
                </Col>
                <Col xs={24} sm={12}>
                    <div className="stat-card" style={{ padding: '20px 24px' }}>
                        <div className="stat-label" style={{ marginBottom: 12 }}><ThunderboltOutlined /> 200-Day EMA</div>
                        {tech?.ema_200 ? (
                            <div>
                                <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>{formatNPR(tech.ema_200)}</div>
                                <Tag color={tech.ema_200_status === 'Bullish' ? 'green' : 'red'} style={{ fontSize: 13 }}>
                                    {tech.ema_200_status === 'Bullish' ? <RiseOutlined /> : <FallOutlined />} {tech.ema_200_status}
                                </Tag>
                                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
                                    Diff: {formatNPR(tech.ltp - tech.ema_200)} ({((tech.ltp - tech.ema_200) / tech.ema_200 * 100).toFixed(2)}%)
                                </div>
                            </div>
                        ) : <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Require 200 days data.</div>}
                    </div>
                </Col>
            </Row>

            {/* Volume & MACD */}
            <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
                <Col xs={24} lg={12}>
                    <div className="stat-card" style={{ padding: '20px 24px' }}>
                        <div className="stat-label" style={{ marginBottom: 16 }}><BarChartOutlined /> Volume & Momentum</div>
                        {tech?.vol_sma_20 ? (
                            <div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                                    <div><div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Today's Volume</div><div style={{ fontSize: 16, fontWeight: 600 }}>{tech.volume?.toLocaleString()}</div></div>
                                    <div style={{ textAlign: 'right' }}><div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>20-Day Avg</div><div style={{ fontSize: 16, fontWeight: 600 }}>{tech.vol_sma_20?.toLocaleString()}</div></div>
                                </div>
                                <div style={{ marginBottom: 16 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                                        <span>Volume Ratio: {tech.vol_ratio?.toFixed(2)}x</span>
                                        <span style={{ color: tech.vol_ratio > 1.5 ? '#00b894' : 'var(--text-secondary)' }}>
                                            {tech.vol_ratio > 2 ? 'Surge' : tech.vol_ratio > 1.2 ? 'Expansion' : tech.vol_ratio < 0.5 ? 'Dry' : 'Average'}
                                        </span>
                                    </div>
                                    <Progress percent={Math.min(tech.vol_ratio * 50, 100)} showInfo={false}
                                        strokeColor={tech.vol_ratio > 1.5 ? '#00b894' : tech.vol_ratio < 0.5 ? '#d63031' : '#0984e3'}
                                        trailColor="rgba(255,255,255,0.06)" size="small" />
                                </div>
                                {tech.obv_status && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'rgba(255,255,255,0.02)', borderRadius: 6 }}>
                                        <Tag color={tech.obv_status === 'Accumulation' ? 'green' : 'red'}>{tech.obv_status}</Tag>
                                        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>On-Balance Volume (OBV)</span>
                                    </div>
                                )}
                            </div>
                        ) : <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Insufficient volume data.</div>}
                    </div>
                </Col>
                <Col xs={24} lg={12}>
                    <div className="stat-card" style={{ padding: '20px 24px', height: '100%' }}>
                        <div className="stat-label" style={{ marginBottom: 16 }}><FundOutlined /> MACD & Volatility</div>
                        {tech?.macd ? (
                            <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                                    <div style={{ fontSize: 24, fontWeight: 700, color: tech.macd_hist > 0 ? '#00b894' : '#d63031' }}>{tech.macd_hist?.toFixed(2)}</div>
                                    <div>
                                        <div style={{ fontSize: 13, fontWeight: 500 }}>MACD Histogram</div>
                                        <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>MACD: {tech.macd?.toFixed(2)} | Signal: {tech.macd_signal?.toFixed(2)}</div>
                                    </div>
                                    <div style={{ marginLeft: 'auto' }}><Tag color={tech.macd_hist > 0 ? 'green' : 'red'}>{tech.macd_hist > 0 ? 'Bullish' : 'Bearish'}</Tag></div>
                                </div>
                                {tech.bb_upper && (
                                    <div style={{ padding: '12px', background: 'rgba(255,255,255,0.02)', borderRadius: 6 }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                            <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)' }}>Bollinger Bands (20,2)</div>
                                            {extTech?.bb_squeeze && <Tag color="orange" style={{ margin: 0 }}>SQUEEZE</Tag>}
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                                            <div><div style={{ color: 'var(--text-muted)', fontSize: 10 }}>Lower Band</div><div>{formatNPR(tech.bb_lower)}</div></div>
                                            <div style={{ textAlign: 'center' }}>
                                                <div style={{ color: 'var(--text-muted)', fontSize: 10 }}>LTP Position</div>
                                                <div style={{ fontWeight: 600, color: tech.ltp > tech.bb_upper ? '#d63031' : tech.ltp < tech.bb_lower ? '#00b894' : 'var(--text-primary)' }}>
                                                    {tech.ltp > tech.bb_upper ? 'Above Upper' : tech.ltp < tech.bb_lower ? 'Below Lower' : 'Inside Bands'}
                                                </div>
                                            </div>
                                            <div style={{ textAlign: 'right' }}><div style={{ color: 'var(--text-muted)', fontSize: 10 }}>Upper Band</div><div>{formatNPR(tech.bb_upper)}</div></div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        ) : <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Insufficient data.</div>}
                    </div>
                </Col>
            </Row>
        </div>
    );

    const GatesTab = () => (
        <div className="animate-in" style={{ marginTop: 16 }}>
            {extTech && !extTech.error ? (
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
                                {extTech.sector && marketContext?.sectors && marketContext.sectors[extTech.sector] && (
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
                                    <Tag color={extTech.gate5_technical.includes('BUY') ? 'green' : extTech.gate5_technical === 'AVOID' ? 'red' : 'default'}>{extTech.gate5_technical}</Tag>
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
                                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>
                                        Stocks with positive Alpha are outperforming the broader market.
                                    </div>
                                </div>
                            )}
                        </Col>
                    </Row>
                </div>
            ) : <div style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '40px' }}>Conjunction Data Unavailable</div>}
        </div>
    );

    const TradeExecutorTab = () => {
        if (!extTech || extTech.error || !extTech.ltp) {
            return <div style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '40px' }}>Insufficient data for Trade Planner</div>;
        }

        const ltp = extTech.ltp;
        const slPrice = extTech.stop_loss;
        const targetPrice = extTech.target_1;
        const riskPerShare = ltp - slPrice;
        
        // Stop loss might be above LTP if in deep downtrend, handle logically
        const validSetup = riskPerShare > 0;
        const maxLoss = capital * (riskPct / 100);
        const positionSize = validSetup ? Math.floor(maxLoss / riskPerShare) : 0;
        const actualCost = positionSize * ltp;
        const potentialProfit = validSetup ? positionSize * (targetPrice - ltp) : 0;

        return (
            <div className="animate-in" style={{ marginTop: 16 }}>
                <Row gutter={[24, 24]}>
                    <Col xs={24} lg={10}>
                        <div className="stat-card" style={{ padding: '24px' }}>
                            <div className="stat-label" style={{ marginBottom: 24, fontSize: 16 }}><SlidersOutlined /> Position Calculator</div>
                            <div style={{ marginBottom: 20 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                                    <label style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Trading Capital (NPR)</label>
                                    <span style={{ fontWeight: 600 }}>{formatNPR(capital, 0)}</span>
                                </div>
                                <Slider 
                                    min={10000} max={2000000} step={10000} 
                                    value={capital} onChange={setCapital}
                                    tooltip={{ formatter: v => formatNPR(v, 0) }} 
                                />
                            </div>
                            <div style={{ marginBottom: 20 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                                    <label style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Risk per Trade (%)</label>
                                    <span style={{ fontWeight: 600, color: '#ef4444' }}>{riskPct}% ({formatNPR(maxLoss, 0)})</span>
                                </div>
                                <Slider 
                                    min={0.5} max={5} step={0.5} 
                                    value={riskPct} onChange={setRiskPct}
                                    trackStyle={{ backgroundColor: '#ef4444' }} 
                                />
                            </div>
                        </div>
                    </Col>
                    
                    <Col xs={24} lg={14}>
                        <div className="stat-card" style={{ padding: '24px', background: 'linear-gradient(145deg, rgba(108, 92, 231, 0.05) 0%, rgba(15, 23, 42, 0) 100%)', border: '1px solid rgba(108, 92, 231, 0.2)', height: '100%' }}>
                            <div className="stat-label" style={{ marginBottom: 24, fontSize: 16, color: '#6c5ce7' }}><AimOutlined /> ATR Trade Plan</div>
                            
                            {!validSetup ? (
                                <div style={{ padding: '20px', background: 'rgba(239, 68, 68, 0.1)', borderRadius: 8, color: '#ef4444' }}>
                                    This stock is currently trading below its stop loss level. Long setups are not advised.
                                </div>
                            ) : (
                                <div>
                                    <Row gutter={16} style={{ marginBottom: 24 }}>
                                        <Col span={8}>
                                            <div style={{ color: 'var(--text-muted)', fontSize: 11, textTransform: 'uppercase' }}>Entry (LTP)</div>
                                            <div style={{ fontSize: 24, fontWeight: 700 }}>{formatNPR(ltp)}</div>
                                        </Col>
                                        <Col span={8} style={{ borderLeft: '1px solid rgba(255,255,255,0.1)', paddingLeft: 16 }}>
                                            <div style={{ color: 'var(--text-muted)', fontSize: 11, textTransform: 'uppercase' }}>Stop Loss</div>
                                            <div style={{ fontSize: 24, fontWeight: 700, color: '#ef4444' }}>{formatNPR(slPrice)}</div>
                                            <div style={{ fontSize: 11, color: '#ef4444' }}>-1.5x ATR</div>
                                        </Col>
                                        <Col span={8} style={{ borderLeft: '1px solid rgba(255,255,255,0.1)', paddingLeft: 16 }}>
                                            <div style={{ color: 'var(--text-muted)', fontSize: 11, textTransform: 'uppercase' }}>Target 1</div>
                                            <div style={{ fontSize: 24, fontWeight: 700, color: '#10b981' }}>{formatNPR(targetPrice)}</div>
                                            <div style={{ fontSize: 11, color: '#10b981' }}>+2.0x ATR ({extTech.risk_reward} R:R)</div>
                                        </Col>
                                    </Row>
                                    
                                    <div style={{ padding: '16px', background: 'rgba(0,0,0,0.2)', borderRadius: 8 }}>
                                        <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12 }}>Suggested Position Size</div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                                            <div>
                                                <div style={{ fontSize: 32, fontWeight: 800, color: '#00b894', lineHeight: 1 }}>{positionSize} <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-secondary)' }}>Kittas</span></div>
                                                <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 8 }}>Cost: ~{formatNPR(actualCost, 0)}</div>
                                            </div>
                                            <div style={{ textAlign: 'right' }}>
                                                <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 4 }}>Potential Profit at Target</div>
                                                <div style={{ fontSize: 18, fontWeight: 700, color: '#10b981' }}>+{formatNPR(potentialProfit, 0)}</div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </Col>
                </Row>
            </div>
        );
    };

    const items = [
        { key: 'indicators', label: 'Indicators & Signals', children: <IndicatorsTab /> },
        { key: 'gates', label: 'Conjunction Gates', children: <GatesTab /> },
        { key: 'executor', label: 'Trade Executor', children: <TradeExecutorTab /> },
    ];

    return (
        <Tabs items={items} defaultActiveKey="indicators" className="custom-subtabs" />
    );
}
