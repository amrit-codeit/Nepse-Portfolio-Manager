/**
 * StockAnalysis — Merged Live Technicals + AI Copilot
 * A single stock selector drives both panels side by side.
 */
import { useState, useMemo } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
    Spin, Alert, Select, Button, Typography, Tag, Row, Col, Input,
    message, Tabs, Tooltip
} from 'antd';
import {
    RobotOutlined, ThunderboltOutlined, CopyOutlined, LineChartOutlined,
    RiseOutlined, AimOutlined, BarChartOutlined
} from '@ant-design/icons';
import {
    getCompanies, getExtendedTechnicals,
    getAITradingVerdict, getAITradingVerdictCloud, getAIModels, getFrontierPrompt
} from '../../services/api';

const { Title, Paragraph, Text } = Typography;

function formatNPR(value, decimals = 2) {
    if (value === null || value === undefined || isNaN(value)) return 'N/A';
    return 'Rs. ' + Number(value).toLocaleString('en-IN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

// ── Live Technicals Panel ──
function TechnicalsPanel({ extTech }) {
    if (!extTech || extTech.error) {
        return <div style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: 40 }}>Technical data unavailable.</div>;
    }

    return (
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
                                    {extTech.rs_alpha != null ? `${extTech.rs_alpha > 0 ? '+' : ''}${extTech.rs_alpha}%` : 'N/A'}
                                    {extTech.rs_trend && <Tag style={{ marginLeft: 8 }} color={extTech.rs_trend === 'Outperforming' ? 'green' : extTech.rs_trend === 'Underperforming' ? 'red' : 'default'}>{extTech.rs_trend}</Tag>}
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
                                <div><div style={{ color: 'var(--text-secondary)', marginBottom: 8 }}>S3</div><div style={{ color: '#00b894', fontWeight: 600, fontSize: 16 }}>{formatNPR(extTech.pivot_points.S3)}</div></div>
                                <div><div style={{ color: 'var(--text-secondary)', marginBottom: 8 }}>S2</div><div style={{ color: '#00b894', fontWeight: 600, fontSize: 16 }}>{formatNPR(extTech.pivot_points.S2)}</div></div>
                                <div><div style={{ color: 'var(--text-secondary)', marginBottom: 8 }}>S1</div><div style={{ color: '#00b894', fontWeight: 600, fontSize: 16 }}>{formatNPR(extTech.pivot_points.S1)}</div></div>
                                <div><div style={{ color: 'var(--accent-primary)', fontWeight: 700, marginBottom: 8 }}>Pivot</div><div style={{ color: 'var(--text-primary)', fontWeight: 800, fontSize: 20 }}>{formatNPR(extTech.pivot_points.P)}</div></div>
                                <div><div style={{ color: 'var(--text-secondary)', marginBottom: 8 }}>R1</div><div style={{ color: '#d63031', fontWeight: 600, fontSize: 16 }}>{formatNPR(extTech.pivot_points.R1)}</div></div>
                                <div><div style={{ color: 'var(--text-secondary)', marginBottom: 8 }}>R2</div><div style={{ color: '#d63031', fontWeight: 600, fontSize: 16 }}>{formatNPR(extTech.pivot_points.R2)}</div></div>
                                <div><div style={{ color: 'var(--text-secondary)', marginBottom: 8 }}>R3</div><div style={{ color: '#d63031', fontWeight: 600, fontSize: 16 }}>{formatNPR(extTech.pivot_points.R3)}</div></div>
                            </div>
                        ) : <div style={{ color: 'var(--text-secondary)', textAlign: 'center' }}>Pivot points not available.</div>}
                    </div>
                </Col>
            </Row>
        </div>
    );
}


// ── AI Copilot Panel ──
function AICopilotPanel({ symbol, companyOptions }) {
    const [mode, setMode] = useState('verdict');
    const [model, setModel] = useState('llama3.2');

    const { data: modelsData } = useQuery({
        queryKey: ['ai-models'],
        queryFn: () => getAIModels().then(r => r.data),
    });

    const availableModels = useMemo(() => {
        const models = (modelsData?.models || []).map(m => ({ value: m, label: `Local: ${m}` }));
        models.push({ value: 'groq', label: 'Cloud: Groq Llama 3 (Fast)' });
        return models;
    }, [modelsData]);

    const verdictMut = useMutation({
        mutationFn: async () => {
            if (mode === 'prompt') {
                return getFrontierPrompt(symbol, 'trading').then(r => ({ status: 'success', prompt: r.data.prompt }));
            }
            if (model === 'groq') {
                return getAITradingVerdictCloud(symbol).then(r => r.data);
            }
            return getAITradingVerdict(symbol, model).then(r => r.data);
        }
    });

    const result = verdictMut.data;

    if (!symbol) {
        return (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>
                Select a stock above to use the AI Copilot.
            </div>
        );
    }

    return (
        <div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 20, padding: '12px 16px', background: 'rgba(255,255,255,0.02)', borderRadius: 8 }}>
                <div style={{ fontSize: 13, fontWeight: 500 }}>Action:</div>
                <Select
                    value={mode}
                    onChange={setMode}
                    options={[
                        { value: 'verdict', label: 'Generate Verdict' },
                        { value: 'prompt', label: 'Generate Prompt (for Claude/ChatGPT)' }
                    ]}
                    style={{ width: 260 }}
                />
                {mode === 'verdict' && (
                    <>
                        <div style={{ fontSize: 13, fontWeight: 500, marginLeft: 4 }}>Model:</div>
                        <Select
                            value={model}
                            onChange={setModel}
                            options={availableModels}
                            style={{ width: 180 }}
                        />
                    </>
                )}
                <Button
                    type="primary"
                    icon={<RobotOutlined />}
                    onClick={() => verdictMut.mutate()}
                    loading={verdictMut.isPending}
                    style={{ marginLeft: 'auto', background: 'linear-gradient(135deg, #a29bfe 0%, #6c5ce7 100%)', border: 'none' }}
                >
                    {mode === 'prompt' ? 'Generate Prompt' : 'Generate Verdict'}
                </Button>
            </div>

            {verdictMut.isPending && (
                <div style={{ textAlign: 'center', padding: '40px 0' }}>
                    <Spin size="large" tip={mode === 'prompt' ? "Generating prompt..." : "AI is analyzing..."} />
                </div>
            )}

            {verdictMut.isError && (
                <Alert message="Error" description="Failed to generate AI verdict. Check if Ollama is running or try cloud." type="error" showIcon style={{ marginBottom: 16 }} />
            )}

            {result && result.status === 'error' && (
                <Alert message={result.verdict} description={result.analysis} type="error" showIcon style={{ marginBottom: 16 }} />
            )}

            {result && result.status === 'success' && (
                <div className="animate-in">
                    {mode === 'prompt' ? (
                        <div className="stat-card" style={{ padding: '20px 24px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Frontier Model Prompt</h3>
                                <Button
                                    icon={<CopyOutlined />}
                                    onClick={() => { navigator.clipboard.writeText(result.prompt); message.success('Copied to clipboard!'); }}
                                >
                                    Copy Prompt
                                </Button>
                            </div>
                            <Input.TextArea
                                value={result.prompt}
                                readOnly
                                autoSize={{ minRows: 8, maxRows: 25 }}
                                style={{ fontFamily: 'monospace', fontSize: 12, background: 'var(--bg-glass)', color: 'var(--text-primary)' }}
                            />
                        </div>
                    ) : (
                        <div className="stat-card" style={{ padding: '20px 24px', background: 'linear-gradient(135deg, rgba(108, 92, 231, 0.05) 0%, rgba(167, 139, 250, 0.1) 100%)', borderLeft: '4px solid #6c5ce7' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: 'var(--accent-primary)' }}>
                                    <ThunderboltOutlined style={{ marginRight: 8 }} />
                                    Trading Verdict: {result.verdict}
                                </h3>
                                <Tag color="purple" style={{ fontSize: 13, padding: '4px 12px' }}>{model === 'groq' ? 'Groq Cloud' : `Local: ${model}`}</Tag>
                            </div>
                            <div style={{ color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
                                {result.analysis}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}


// ── Merged Stock Analysis Component ──
export default function StockAnalysis() {
    const [symbol, setSymbol] = useState(null);

    const { data: companiesRaw } = useQuery({
        queryKey: ['companies', 'all'],
        queryFn: () => getCompanies({ limit: 1000 }).then(r => r.data.companies),
    });
    const companyOptions = useMemo(() =>
        (companiesRaw || []).map(c => ({ value: c.symbol, label: `${c.symbol} — ${c.name || ''}` })),
        [companiesRaw]
    );

    const { data: extTech, isLoading: techLoading } = useQuery({
        queryKey: ['extended-technicals', symbol],
        queryFn: () => getExtendedTechnicals(symbol).then(r => r.data),
        enabled: !!symbol,
    });

    const subItems = [
        {
            key: 'technicals',
            label: <span><LineChartOutlined /> Live Technicals</span>,
            children: techLoading
                ? <div style={{ textAlign: 'center', padding: '40px 0' }}><Spin size="large" /></div>
                : symbol
                    ? <TechnicalsPanel extTech={extTech} />
                    : <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>Select a stock above.</div>,
        },
        {
            key: 'copilot',
            label: <span><RobotOutlined /> AI Copilot</span>,
            children: <AICopilotPanel symbol={symbol} companyOptions={companyOptions} />,
        },
    ];

    return (
        <div className="animate-in">
            {/* Shared stock selector */}
            <div className="stat-card" style={{ padding: '16px 20px', marginBottom: 20, display: 'flex', gap: 16, alignItems: 'center' }}>
                <div style={{ fontSize: 14, fontWeight: 500 }}>Analyze Stock:</div>
                <Select
                    showSearch
                    optionFilterProp="label"
                    value={symbol}
                    onChange={setSymbol}
                    options={companyOptions}
                    placeholder="Search stock..."
                    style={{ flex: 1, maxWidth: 400 }}
                    size="large"
                    allowClear
                />
                {symbol && extTech && (
                    <Tag color="purple" style={{ fontSize: 13, padding: '4px 12px' }}>
                        {symbol} — LTP: {formatNPR(extTech.ltp)}
                    </Tag>
                )}
            </div>

            {!symbol ? (
                <div style={{ textAlign: 'center', padding: '80px 20px', background: 'var(--bg-secondary)', borderRadius: 12, border: '1px dashed var(--border-color)' }}>
                    <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.2 }}><LineChartOutlined /></div>
                    <Title level={4} style={{ color: 'var(--text-primary)' }}>Stock Analysis & AI Copilot</Title>
                    <Paragraph style={{ color: 'var(--text-muted)', maxWidth: 500, margin: '0 auto', fontSize: 15 }}>
                        Select a stock to view live technical metrics (ADX, ATR, Pivot Points, VSA Reversals) and generate AI-powered trading verdicts or prompts for frontier models like Claude or ChatGPT.
                    </Paragraph>
                </div>
            ) : (
                <Tabs items={subItems} defaultActiveKey="technicals" className="custom-subtabs" />
            )}
        </div>
    );
}
