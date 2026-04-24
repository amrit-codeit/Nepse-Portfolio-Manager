/**
 * StockAnalysis — Merged Live Technicals + AI Copilot
 * A single stock selector drives both panels side by side.
 */
import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
    Spin, Alert, Select, Button, Typography, Tag, Row, Col, Input,
    message, Tabs, Tooltip
} from 'antd';
import {
    RobotOutlined, ThunderboltOutlined, CopyOutlined, LineChartOutlined,
    RiseOutlined, AimOutlined, BarChartOutlined, SyncOutlined
} from '@ant-design/icons';
import {
    getCompanies, getExtendedTechnicals, getInsights,
    getAITradingVerdict, getAITradingVerdictCloud, getAIModels, getFrontierPrompt,
    getMarketContext, scrapeTechnicals
} from '../../services/api';
import TechnicalTabs from '../insights/TechnicalTabs';

const { Title, Paragraph, Text } = Typography;

function formatNPR(value, decimals = 2) {
    if (value === null || value === undefined || isNaN(value)) return 'N/A';
    return 'Rs. ' + Number(value).toLocaleString('en-IN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
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
    const queryClient = useQueryClient();

    const { data: companiesRaw } = useQuery({
        queryKey: ['companies', 'all'],
        queryFn: () => getCompanies({ limit: 1000 }).then(r => r.data.companies),
    });
    const companyOptions = useMemo(() =>
        (companiesRaw || []).map(c => ({ value: c.symbol, label: `${c.symbol} — ${c.name || ''}` })),
        [companiesRaw]
    );

    // Insights API provides tech data (RSI, EMA, MACD, Bollinger, Volume, OBV)
    const { data: insightsData, isLoading: insightsLoading, isFetching } = useQuery({
        queryKey: ['insights', symbol],
        queryFn: () => getInsights(symbol).then(r => r.data),
        enabled: !!symbol,
    });

    // Extended technicals (ADX, ATR, Pivots, Gates, VSA)
    const { data: extTech } = useQuery({
        queryKey: ['extended-technicals', symbol],
        queryFn: () => getExtendedTechnicals(symbol).then(r => r.data),
        enabled: !!symbol,
    });

    // Market context (Conjunction system)
    const { data: marketContext } = useQuery({
        queryKey: ['market-context'],
        queryFn: () => getMarketContext().then(r => r.data),
        enabled: !!symbol,
    });

    const scrapeMut = useMutation({
        mutationFn: () => scrapeTechnicals(symbol),
        onSuccess: () => {
            message.success(`Technical data refreshed for ${symbol}`);
            queryClient.invalidateQueries(['insights', symbol]);
            queryClient.invalidateQueries(['extended-technicals', symbol]);
            queryClient.invalidateQueries(['historicalPrices', symbol]);
        },
        onError: () => message.error('Failed to refresh data'),
    });

    const tech = insightsData?.technicals;
    const isLoading = insightsLoading || isFetching;

    const subItems = [
        {
            key: 'technicals',
            label: <span><LineChartOutlined /> Live Technicals</span>,
            children: isLoading
                ? <div style={{ textAlign: 'center', padding: '40px 0' }}><Spin size="large" /></div>
                : symbol
                    ? <TechnicalTabs symbol={symbol} tech={tech} extTech={extTech} marketContext={marketContext} />
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
                {symbol && (
                    <Button 
                        icon={<SyncOutlined spin={scrapeMut.isPending} />} 
                        onClick={() => scrapeMut.mutate()}
                        loading={scrapeMut.isPending}
                        title="Refresh Technical Data"
                    >
                        Scrape
                    </Button>
                )}
                {symbol && tech && (
                    <Tag color="purple" style={{ fontSize: 13, padding: '4px 12px' }}>
                        {symbol} — LTP: {formatNPR(tech.ltp)}
                    </Tag>
                )}
            </div>

            {!symbol ? (
                <div style={{ textAlign: 'center', padding: '80px 20px', background: 'var(--bg-secondary)', borderRadius: 12, border: '1px dashed var(--border-color)' }}>
                    <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.2 }}><LineChartOutlined /></div>
                    <Title level={4} style={{ color: 'var(--text-primary)' }}>Stock Analysis & AI Copilot</Title>
                    <Paragraph style={{ color: 'var(--text-muted)', maxWidth: 500, margin: '0 auto', fontSize: 15 }}>
                        Select a stock to view live technical metrics (RSI, EMA, MACD, Bollinger, Pivots, VSA) with price history chart and generate AI-powered trading verdicts.
                    </Paragraph>
                </div>
            ) : (
                <Tabs items={subItems} defaultActiveKey="technicals" className="custom-subtabs" />
            )}
        </div>
    );
}
