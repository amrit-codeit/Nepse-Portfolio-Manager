import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Row, Col, Tag, Progress, Spin, Card, Button, Divider, Space, Tooltip, Alert, Select, Tabs, Segmented, message } from 'antd';
import {
    RobotOutlined, CheckCircleOutlined, CloseCircleOutlined,
    RiseOutlined, FallOutlined, ThunderboltOutlined,
    ExperimentOutlined, DashboardOutlined, InfoCircleOutlined,
    FireOutlined, SafetyOutlined, DollarOutlined,
    WarningOutlined, BankOutlined, FundOutlined,
    BarChartOutlined, LineChartOutlined, StockOutlined,
    CopyOutlined, CloudOutlined, DesktopOutlined,
} from '@ant-design/icons';
import { BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, CartesianGrid, Cell } from 'recharts';
import { getAIModels, getExecutiveSummary, getAIVerdict, getAITradingVerdict, getAIVerdictCloud, getAITradingVerdictCloud, getFrontierPrompt } from '../../services/api';

function formatNPR(value) {
    if (value === null || value === undefined) return '—';
    return `Rs. ${Number(value).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatLargeNum(value) {
    if (value === null || value === undefined) return '—';
    const abs = Math.abs(value);
    if (abs >= 1e9) return `Rs. ${(value / 1e9).toFixed(2)}B`;
    if (abs >= 1e7) return `Rs. ${(value / 1e7).toFixed(2)}Cr`;
    if (abs >= 1e5) return `Rs. ${(value / 1e5).toFixed(2)}L`;
    return `Rs. ${value.toLocaleString('en-IN')}`;
}

function getScoreColor(score) {
    if (score >= 80) return '#00b894';
    if (score >= 60) return '#00cec9';
    if (score >= 40) return '#fdcb6e';
    return '#d63031';
}

function getRSIColor(rsi) {
    if (rsi >= 70) return '#d63031';
    if (rsi >= 60) return '#e17055';
    if (rsi >= 40) return '#00b894';
    if (rsi >= 30) return '#0984e3';
    return '#6c5ce7';
}

function getActionConfig(action) {
    switch (action) {
        case 'Strong Buy':
            return { color: '#00b894', bg: 'rgba(0,184,148,0.12)', icon: <ThunderboltOutlined />, glow: '0 0 20px rgba(0,184,148,0.3)' };
        case 'Accumulate':
            return { color: '#0984e3', bg: 'rgba(9,132,227,0.12)', icon: <RiseOutlined />, glow: '0 0 20px rgba(9,132,227,0.3)' };
        case 'Hold':
            return { color: '#fdcb6e', bg: 'rgba(253,203,110,0.12)', icon: <SafetyOutlined />, glow: '0 0 20px rgba(253,203,110,0.2)' };
        case 'Avoid/Reduce':
            return { color: '#d63031', bg: 'rgba(214,48,49,0.12)', icon: <FallOutlined />, glow: '0 0 20px rgba(214,48,49,0.3)' };
        case 'Strong Sell':
            return { color: '#c0392b', bg: 'rgba(192,57,43,0.15)', icon: <CloseCircleOutlined />, glow: '0 0 20px rgba(192,57,43,0.4)' };
        default:
            return { color: 'var(--text-secondary)', bg: 'rgba(255,255,255,0.05)', icon: <InfoCircleOutlined />, glow: 'none' };
    }
}

// Reusable mini stat card
function MetricCard({ label, value, color, suffix = '', tooltip }) {
    const content = (
        <div style={{ textAlign: 'center', padding: '14px 8px' }}>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 8, letterSpacing: '0.3px' }}>{label}</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: color || 'var(--text-primary)' }}>
                {value != null ? `${typeof value === 'number' ? value.toFixed(2) : value}${suffix}` : '—'}
            </div>
        </div>
    );
    return tooltip ? <Tooltip title={tooltip}>{content}</Tooltip> : content;
}

// Section header icons mapping for AI analysis output
const SECTION_ICONS = {
    'price action': <LineChartOutlined style={{ color: '#6c5ce7' }} />,
    'momentum': <ThunderboltOutlined style={{ color: '#e17055' }} />,
    'volume': <BarChartOutlined style={{ color: '#00b894' }} />,
    'bollinger': <StockOutlined style={{ color: '#fdcb6e' }} />,
    'support': <SafetyOutlined style={{ color: '#0984e3' }} />,
    'resistance': <SafetyOutlined style={{ color: '#d63031' }} />,
    'trade plan': <FireOutlined style={{ color: '#e84393' }} />,
    'entry': <FireOutlined style={{ color: '#e84393' }} />,
    'fundamental': <BankOutlined style={{ color: '#6c5ce7' }} />,
    'sector': <FundOutlined style={{ color: '#00b894' }} />,
    'dividend': <DollarOutlined style={{ color: '#fdcb6e' }} />,
    'technical': <LineChartOutlined style={{ color: '#0984e3' }} />,
    'risk': <WarningOutlined style={{ color: '#d63031' }} />,
    'margin of safety': <SafetyOutlined style={{ color: '#00b894' }} />,
    'recommendation': <CheckCircleOutlined style={{ color: '#00b894' }} />,
    'conclusion': <CheckCircleOutlined style={{ color: '#00b894' }} />,
    'final': <CheckCircleOutlined style={{ color: '#00b894' }} />,
    'valuation': <DashboardOutlined style={{ color: '#6c5ce7' }} />,
    'obv': <BarChartOutlined style={{ color: '#00cec9' }} />,
    'volatility': <ExperimentOutlined style={{ color: '#e17055' }} />,
};

function getSectionIcon(headerText) {
    const lower = headerText.toLowerCase();
    for (const [key, icon] of Object.entries(SECTION_ICONS)) {
        if (lower.includes(key)) return icon;
    }
    return <InfoCircleOutlined style={{ color: '#636e72' }} />;
}

/** Highlights numeric values and key terms inside analysis text */
function highlightText(text) {
    // Split by patterns we want to highlight, keeping delimiters
    const parts = text.split(/(\b(?:Rs\.?\s*)?[\d,]+\.?\d*%?\b|(?:STRONG BUY|BUY|ACCUMULATE|HOLD|REDUCE|SELL|WAIT|BULLISH|BEARISH|OVERBOUGHT|OVERSOLD|NEUTRAL|DO NOT BUY))/gi);
    
    return parts.map((part, i) => {
        // Highlight numbers and currency
        if (/^(?:Rs\.?\s*)?[\d,]+\.?\d*%?$/.test(part)) {
            return <span key={i} style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{part}</span>;
        }
        // Highlight verdicts / signals
        const upper = part.toUpperCase();
        if (['STRONG BUY', 'BUY', 'ACCUMULATE', 'BULLISH'].includes(upper)) {
            return <span key={i} style={{ fontWeight: 700, color: '#00b894', background: 'rgba(0,184,148,0.08)', padding: '1px 5px', borderRadius: 4 }}>{part}</span>;
        }
        if (['SELL', 'REDUCE', 'BEARISH', 'DO NOT BUY'].includes(upper)) {
            return <span key={i} style={{ fontWeight: 700, color: '#d63031', background: 'rgba(214,48,49,0.08)', padding: '1px 5px', borderRadius: 4 }}>{part}</span>;
        }
        if (['HOLD', 'WAIT', 'NEUTRAL', 'OVERBOUGHT', 'OVERSOLD'].includes(upper)) {
            return <span key={i} style={{ fontWeight: 700, color: '#fdcb6e', background: 'rgba(253,203,110,0.1)', padding: '1px 5px', borderRadius: 4 }}>{part}</span>;
        }
        return part;
    });
}

/** Renders AI analysis text as styled section cards instead of plain text */
function FormattedAnalysis({ text, isCloud }) {
    if (!text) return null;
    
    const accentColor = isCloud ? 'rgba(9, 132, 227,' : 'rgba(108, 92, 231,';
    
    // Split into paragraphs
    const paragraphs = text.split(/\n\n+/).filter(p => p.trim());
    
    // Group into sections: detect header lines (lines ending with ":" or numbered like "1. Something:")
    const sections = [];
    let currentSection = null;
    
    for (const para of paragraphs) {
        const lines = para.trim().split('\n');
        const firstLine = lines[0].trim();
        
        // Detect section headers: "Something:" or "1. Something:" or "## Something" patterns
        const isHeader = /^(?:\d+\.\s*)?(?:#+\s*)?[A-Z].*:$/m.test(firstLine) || 
                         /^(?:\d+\.\s*)?(?:#+\s*)?[A-Z][^.!?]*(?:[:])/.test(firstLine) && firstLine.length < 80;
        
        if (isHeader) {
            // Clean header text
            let headerText = firstLine.replace(/^(?:\d+\.\s*)?(?:#+\s*)?/, '').replace(/:+$/, '').trim();
            let bodyLines = lines.slice(1).join('\n').trim();
            
            // If header and body are on the same line (split by ":")
            if (!bodyLines && firstLine.includes(':')) {
                const colonIdx = firstLine.indexOf(':');
                const afterColon = firstLine.slice(colonIdx + 1).trim();
                if (afterColon) {
                    headerText = firstLine.slice(0, colonIdx).replace(/^(?:\d+\.\s*)?(?:#+\s*)?/, '').trim();
                    bodyLines = afterColon;
                }
            }
            
            currentSection = { header: headerText, body: bodyLines };
            sections.push(currentSection);
        } else if (currentSection) {
            // Append to current section's body
            currentSection.body += (currentSection.body ? '\n\n' : '') + para.trim();
        } else {
            // Standalone paragraph (no header detected)
            sections.push({ header: null, body: para.trim() });
        }
    }
    
    // If we couldn't parse sections (e.g. single blob of text), just render nicely
    if (sections.length <= 1 && !sections[0]?.header) {
        return (
            <div style={{
                fontSize: 13, lineHeight: 1.8, color: 'var(--text-secondary)',
                padding: '16px 20px', background: `${accentColor} 0.04)`,
                borderRadius: 10, border: `1px solid ${accentColor} 0.1)`,
            }}>
                {highlightText(text)}
            </div>
        );
    }
    
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {sections.map((section, i) => (
                <div key={i} style={{
                    padding: '14px 18px',
                    background: `${accentColor} 0.03)`,
                    borderRadius: 10,
                    border: `1px solid ${accentColor} 0.08)`,
                    borderLeft: section.header ? `3px solid ${accentColor} 0.3)` : `1px solid ${accentColor} 0.08)`,
                }}>
                    {section.header && (
                        <div style={{
                            fontSize: 12, fontWeight: 700, color: 'var(--text-primary)',
                            marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8,
                            textTransform: 'uppercase', letterSpacing: '0.3px',
                        }}>
                            {getSectionIcon(section.header)}
                            {section.header}
                        </div>
                    )}
                    <div style={{
                        fontSize: 13, lineHeight: 1.75, color: 'var(--text-secondary)',
                    }}>
                        {highlightText(section.body)}
                    </div>
                </div>
            ))}
        </div>
    );
}

function AIAnalystPanel({ title, mode, model, setModel, models, onGenerateLocal, localLoading, localData, onGenerateCloud, cloudLoading, cloudData, symbol }) {
    const [aiSource, setAiSource] = useState('cloud');
    const [promptText, setPromptText] = useState('');
    const [promptLoading, setPromptLoading] = useState(false);
    const [copied, setCopied] = useState(false);

    const handleGeneratePrompt = async () => {
        setPromptLoading(true);
        setCopied(false);
        try {
            const res = await getFrontierPrompt(symbol, mode);
            setPromptText(res.data.prompt);
        } catch (e) {
            setPromptText('Failed to generate prompt. Ensure the stock has sufficient data.');
        }
        setPromptLoading(false);
    };

    const handleCopy = () => {
        navigator.clipboard.writeText(promptText).then(() => {
            setCopied(true);
            message.success('Prompt copied to clipboard!');
            setTimeout(() => setCopied(false), 3000);
        });
    };

    const loading = aiSource === 'local' ? localLoading : aiSource === 'cloud' ? cloudLoading : promptLoading;
    const data = aiSource === 'local' ? localData : aiSource === 'cloud' ? cloudData : null;

    const handleGenerate = () => {
        if (aiSource === 'prompt') handleGeneratePrompt();
        else if (aiSource === 'cloud') onGenerateCloud();
        else onGenerateLocal();
    };

    return (
        <div className="stat-card" style={{ padding: '20px 24px', marginBottom: 24, border: '1px solid rgba(108, 92, 231, 0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
                <div style={{ fontSize: 15, fontWeight: 700 }}>
                    <RobotOutlined style={{ color: '#6c5ce7', marginRight: 8 }} />
                    {title}
                </div>
                <Segmented
                    size="small"
                    value={aiSource}
                    onChange={setAiSource}
                    options={[
                        { label: <span><CopyOutlined /> Copy Prompt</span>, value: 'prompt' },
                        { label: <span><DesktopOutlined /> Local AI</span>, value: 'local' },
                        { label: <span><CloudOutlined /> Cloud AI</span>, value: 'cloud' },
                    ]}
                    style={{ borderRadius: 8 }}
                />
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', maxWidth: 400 }}>
                    {aiSource === 'prompt' && 'Generate a ready-to-paste prompt for ChatGPT, DeepSeek, Gemini, or Claude.'}
                    {aiSource === 'local' && 'Run analysis on your local Ollama model. Slower but fully private.'}
                    {aiSource === 'cloud' && 'Get instant analysis from Groq Cloud (Llama 3.3 70B). Fast & high quality.'}
                </div>
                <Space>
                    {aiSource === 'local' && (
                        <Select
                            size="small"
                            value={model}
                            onChange={setModel}
                            style={{ width: 200 }}
                            dropdownStyle={{ borderRadius: 8 }}
                        >
                            {models.map(m => (
                                <Select.Option key={m} value={m}>
                                    {m.split(':')[0].toUpperCase()} ({m.split(':')[1] || 'latest'})
                                </Select.Option>
                            ))}
                        </Select>
                    )}
                    <Button
                        type="primary"
                        size="small"
                        icon={aiSource === 'prompt' ? <CopyOutlined /> : <ThunderboltOutlined />}
                        onClick={handleGenerate}
                        loading={loading}
                    >
                        {aiSource === 'prompt' ? 'Generate Prompt' : 'Generate'}
                    </Button>
                </Space>
            </div>

            {/* === PROMPT MODE === */}
            {aiSource === 'prompt' && (
                <>
                    {promptLoading ? (
                        <div style={{ textAlign: 'center', padding: '36px 0' }}>
                            <Spin size="large" />
                            <div style={{ marginTop: 14, color: 'var(--text-muted)', fontSize: 12 }}>
                                Building prompt for {symbol}...
                            </div>
                        </div>
                    ) : promptText ? (
                        <div className="animate-in">
                            <pre style={{
                                fontSize: 12, lineHeight: 1.6, color: 'var(--text-secondary)',
                                padding: '16px', background: 'rgba(108, 92, 231, 0.04)',
                                borderRadius: 10, border: '1px solid rgba(108, 92, 231, 0.1)',
                                maxHeight: 320, overflowY: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                                marginBottom: 12,
                            }}>
                                {promptText}
                            </pre>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                                    Paste into <strong>ChatGPT</strong>, <strong>DeepSeek</strong>, <strong>Gemini</strong>, or <strong>Claude</strong>
                                </span>
                                <Button
                                    type={copied ? 'default' : 'primary'}
                                    size="small"
                                    icon={<CopyOutlined />}
                                    onClick={handleCopy}
                                    style={copied ? { borderColor: '#00b894', color: '#00b894' } : {}}
                                >
                                    {copied ? 'Copied!' : 'Copy to Clipboard'}
                                </Button>
                            </div>
                        </div>
                    ) : (
                        <div style={{ textAlign: 'center', padding: '36px 0', color: 'var(--text-muted)', background: 'rgba(255,255,255,0.01)', borderRadius: 10 }}>
                            <CopyOutlined style={{ fontSize: 36, opacity: 0.1, marginBottom: 12, display: 'block' }} />
                            <div style={{ fontSize: 13, fontWeight: 500 }}>Ready to Generate Prompt</div>
                            <div style={{ fontSize: 11, marginTop: 6, maxWidth: 320, margin: '6px auto 0', opacity: 0.6 }}>
                                Click &quot;Generate Prompt&quot; to create a professional analysis prompt you can paste into any frontier AI model.
                            </div>
                        </div>
                    )}
                </>
            )}

            {/* === LOCAL & CLOUD AI MODES === */}
            {(aiSource === 'local' || aiSource === 'cloud') && (
                <>
                    {loading ? (
                        <div style={{ textAlign: 'center', padding: '36px 0' }}>
                            <Spin size="large" />
                            <div style={{ marginTop: 14, color: 'var(--text-muted)', fontSize: 12 }}>
                                {aiSource === 'cloud' ? 'Cloud AI' : model.split(':')[0].toUpperCase()} is analyzing {symbol}...
                            </div>
                        </div>
                    ) : data ? (
                        <div>
                            {data.status === 'error' ? (
                                <Alert
                                    message="AI Analysis Interrupted"
                                    description={data.analysis || 'Unexpected error occurred.'}
                                    type="warning"
                                    showIcon
                                    icon={<WarningOutlined />}
                                    style={{ marginBottom: 16 }}
                                    action={
                                        <Button size="small" danger ghost onClick={handleGenerate}>
                                            Retry
                                        </Button>
                                    }
                                />
                            ) : (
                                <div className="animate-in">
                                    <FormattedAnalysis text={data.analysis} isCloud={aiSource === 'cloud'} />
                                    
                                    <Divider style={{ margin: '16px 0', borderColor: 'rgba(108, 92, 231, 0.1)' }} />
                                    
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                            Final Verdict:
                                        </div>
                                        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
                                            {data.verdict}
                                        </div>
                                        {data.model_used && (
                                            <Tag color={aiSource === 'cloud' ? 'blue' : 'purple'} style={{ fontSize: 10, marginLeft: 'auto' }}>
                                                {aiSource === 'cloud' ? <CloudOutlined /> : <DesktopOutlined />} {data.model_used}
                                            </Tag>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div style={{ textAlign: 'center', padding: '36px 0', color: 'var(--text-muted)', background: 'rgba(255,255,255,0.01)', borderRadius: 10 }}>
                            <RobotOutlined style={{ fontSize: 36, opacity: 0.1, marginBottom: 12, display: 'block' }} />
                            <div style={{ fontSize: 13, fontWeight: 500 }}>
                                {aiSource === 'cloud' ? 'Ready for Cloud AI Analysis' : 'Ready for Local AI Analysis'}
                            </div>
                            <div style={{ fontSize: 11, marginTop: 6, maxWidth: 280, margin: '6px auto 0', opacity: 0.6 }}>
                                {aiSource === 'cloud'
                                    ? 'Click "Generate" for fast, high-quality analysis from Groq Cloud.'
                                    : 'Select a local model and click "Generate" for private, on-device analysis.'}
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}

export default function ExecutiveSummary({ symbol }) {
    const [selectedValueModel, setSelectedValueModel] = useState("qwen2.5:3b-instruct-q4_0");
    const [selectedTradingModel, setSelectedTradingModel] = useState("qwen2.5:3b-instruct-q4_0");

    const { data: modelData } = useQuery({
        queryKey: ['ai-models'],
        queryFn: () => getAIModels().then(r => r.data),
        staleTime: 600000,
    });
    const models = modelData?.models || ["qwen2.5:3b-instruct-q4_0", "gemma4:e2b"];

    const { data, isLoading } = useQuery({
        queryKey: ['executive-summary', symbol],
        queryFn: () => getExecutiveSummary(symbol).then(r => r.data),
        enabled: !!symbol,
    });

    const {
        data: valueAiData,
        isFetching: valueAiLoading,
        refetch: generateValueAI
    } = useQuery({
        queryKey: ['ai-verdict-value', symbol, selectedValueModel],
        queryFn: () => getAIVerdict(symbol, selectedValueModel).then(r => r.data),
        enabled: false,
        staleTime: Infinity,
    });

    const {
        data: tradingAiData,
        isFetching: tradingAiLoading,
        refetch: generateTradingAI
    } = useQuery({
        queryKey: ['ai-verdict-trading', symbol, selectedTradingModel],
        queryFn: () => getAITradingVerdict(symbol, selectedTradingModel).then(r => r.data),
        enabled: false,
        staleTime: Infinity,
    });

    // Cloud AI queries (Groq)
    const {
        data: valueCloudData,
        isFetching: valueCloudLoading,
        refetch: generateValueCloud
    } = useQuery({
        queryKey: ['ai-verdict-value-cloud', symbol],
        queryFn: () => getAIVerdictCloud(symbol).then(r => r.data),
        enabled: false,
        staleTime: Infinity,
    });

    const {
        data: tradingCloudData,
        isFetching: tradingCloudLoading,
        refetch: generateTradingCloud
    } = useQuery({
        queryKey: ['ai-verdict-trading-cloud', symbol],
        queryFn: () => getAITradingVerdictCloud(symbol).then(r => r.data),
        enabled: false,
        staleTime: Infinity,
    });

    if (isLoading) {
        return (
            <div style={{ textAlign: 'center', padding: '80px 0' }}>
                <Spin size="large" tip="Synthesizing stock data..." />
            </div>
        );
    }

    if (!symbol) {
        return (
            <Card style={{ margin: '20px 0' }}>
                <div style={{ textAlign: 'center', padding: '40px 0', opacity: 0.5 }}>
                    <ExperimentOutlined style={{ fontSize: 40, marginBottom: 12 }} />
                    <p>Select a stock to view its Executive Summary and AI Analysis.</p>
                </div>
            </Card>
        );
    }

    if (!data || data.error) {
        return (
            <Card className="stat-card" style={{ textAlign: 'center', padding: '40px 20px' }}>
                <ExperimentOutlined style={{ fontSize: 48, opacity: 0.12, marginBottom: 16, display: 'block' }} />
                <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Executive Summary Unavailable</div>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                    {data?.error || 'Ensure historical prices and fundamental data are synced for this symbol.'}
                </p>
            </Card>
        );
    }

    const actionCfg = getActionConfig(data?.action);
    const scoreColor = getScoreColor(data.health_score);
    const sm = data.sector_metrics || {};

    const profitChartData = [...(data.quarterly_profits || [])].reverse().map(q => ({
        quarter: q.quarter?.replace(/^0/, ''),
        value: q.value,
    }));

    // Common UI Components
    const ValuationGrid = () => (
        <div className="stat-card" style={{ padding: '4px 0', marginBottom: 20 }}>
            <div style={{ fontSize: 10, textTransform: 'uppercase', color: 'var(--text-muted)', padding: '12px 20px 0', letterSpacing: '0.5px' }}>
                <ExperimentOutlined /> Valuation
            </div>
            <Row gutter={0}>
                <Col xs={12} sm={6}>
                    <MetricCard label="P/E Ratio" value={data.pe_ratio} color={data.pe_ratio < 20 ? '#00b894' : data.pe_ratio < 35 ? '#fdcb6e' : '#d63031'} tooltip="Price-to-Earnings. <20 is cheap for NEPSE." />
                </Col>
                <Col xs={12} sm={6}>
                    <MetricCard label="P/B Ratio" value={data.pb_ratio} color={data.pb_ratio < 2 ? '#00b894' : data.pb_ratio < 4 ? '#fdcb6e' : '#d63031'} tooltip="Price-to-Book. <2 is value territory." />
                </Col>
                <Col xs={12} sm={6}>
                    <MetricCard label="PEG Ratio" value={data.peg_ratio} suffix="" color={data.peg_ratio && data.peg_ratio < 1 ? '#00b894' : 'inherit'} tooltip="PE / EPS Growth. <1 = undervalued growth." />
                </Col>
                <Col xs={12} sm={6}>
                    <div style={{ textAlign: 'center', padding: '14px 8px' }}>
                        <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 8, letterSpacing: '0.3px' }}>Graham</div>
                        <div style={{ fontSize: 20, fontWeight: 700, color: '#6c5ce7' }}>
                            {data.graham_number ? formatNPR(data.graham_number) : '—'}
                        </div>
                        {data.graham_discount_pct != null && (
                            <Tag color={data.graham_discount_pct > 0 ? 'green' : 'red'} style={{ fontSize: 10, marginTop: 4 }}>
                                {data.graham_discount_pct > 0 ? <RiseOutlined /> : <FallOutlined />} {Math.abs(data.graham_discount_pct).toFixed(1)}% {data.graham_discount_pct > 0 ? 'Disc.' : 'Prem.'}
                            </Tag>
                        )}
                    </div>
                </Col>
            </Row>
        </div>
    );

    const ProfitabilityGrid = () => (
        <div className="stat-card" style={{ padding: '4px 0', marginBottom: 20 }}>
            <div style={{ fontSize: 10, textTransform: 'uppercase', color: 'var(--text-muted)', padding: '12px 20px 0', letterSpacing: '0.5px' }}>
                <StockOutlined /> Profitability
            </div>
            <Row gutter={0}>
                <Col xs={12} sm={6}>
                    <MetricCard label="EPS (TTM)" value={data.eps_ttm} suffix="" color="#6c5ce7" tooltip="Earnings Per Share (Trailing 12 Months)" />
                </Col>
                <Col xs={12} sm={6}>
                    <MetricCard label="ROE (TTM)" value={data.roe_ttm} suffix="%" color={data.roe_ttm > 12 ? '#00b894' : '#fdcb6e'} tooltip="Return on Equity. >12% is good for NEPSE." />
                </Col>
                <Col xs={12} sm={6}>
                    <MetricCard label="Net Margin" value={data.npm ? (data.npm * 100) : null} suffix="%" color={data.npm && data.npm > 0.2 ? '#00b894' : 'inherit'} tooltip="Net Profit Margin (TTM)" />
                </Col>
                <Col xs={12} sm={6}>
                    <div style={{ textAlign: 'center', padding: '14px 8px' }}>
                        <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 8, letterSpacing: '0.3px' }}>Net Profit TTM</div>
                        <div style={{ fontSize: 18, fontWeight: 700, color: data.net_profit_ttm > 0 ? '#00b894' : '#d63031' }}>
                            {formatLargeNum(data.net_profit_ttm)}
                        </div>
                    </div>
                </Col>
            </Row>
        </div>
    );

    const TechTechnicalIndicators = () => (
        <>
            <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
                <Col xs={24} md={14}>
                    <div className="stat-card" style={{ padding: '16px 20px', height: '100%' }}>
                        <div style={{ fontSize: 10, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 10, letterSpacing: '0.5px' }}>
                            <BarChartOutlined /> 52-Week Range & Trend
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>
                            <span>Low: {formatNPR(data.low_52w)}</span>
                            <span>High: {formatNPR(data.high_52w)}</span>
                        </div>
                        <Progress
                            percent={data.placement_52w || 0}
                            showInfo={false}
                            strokeColor={{ '0%': '#d63031', '50%': '#fdcb6e', '100%': '#00b894' }}
                            trailColor="rgba(255,255,255,0.06)"
                            size={['100%', 10]}
                        />
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                            <span style={{ fontSize: 12, fontWeight: 600 }}>
                                LTP at {data.placement_52w?.toFixed(1) || 0}% of range
                            </span>
                            <Space size={4}>
                                {data.ema_200_status && (
                                    <Tag color={data.ema_200_status === 'Bullish' ? 'green' : 'red'} style={{ fontSize: 10, margin: 0 }}>
                                        {data.ema_200_status === 'Bullish' ? <RiseOutlined /> : <FallOutlined />} 200-EMA
                                    </Tag>
                                )}
                                {data.ema_50 && (
                                    <Tag color={data.ltp > data.ema_50 ? 'green' : 'red'} style={{ fontSize: 10, margin: 0 }}>
                                        {data.ltp > data.ema_50 ? <RiseOutlined /> : <FallOutlined />} 50-EMA
                                    </Tag>
                                )}
                            </Space>
                        </div>
                    </div>
                </Col>
                <Col xs={24} md={10}>
                    <div className="stat-card" style={{ padding: '16px 20px', height: '100%' }}>
                        <div style={{ fontSize: 10, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 10, letterSpacing: '0.5px' }}>
                            <DashboardOutlined /> RSI (14)
                        </div>
                        {data.rsi_14 ? (
                            <>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                    <div style={{ fontSize: 32, fontWeight: 800, color: getRSIColor(data.rsi_14) }}>
                                        {data.rsi_14.toFixed(1)}
                                    </div>
                                    <Tag color={data.rsi_14 >= 70 ? 'red' : data.rsi_14 <= 30 ? 'green' : 'blue'} style={{ fontSize: 11 }}>
                                        {data.rsi_14 >= 70 ? 'Overbought' : data.rsi_14 >= 60 ? 'Near Overbought' : data.rsi_14 >= 40 ? 'Neutral' : data.rsi_14 >= 30 ? 'Near Oversold' : 'Oversold'}
                                    </Tag>
                                </div>
                                <Progress percent={data.rsi_14} showInfo={false} strokeColor={getRSIColor(data.rsi_14)} trailColor="rgba(255,255,255,0.06)" style={{ marginTop: 8 }} />
                            </>
                        ) : (
                            <div style={{ color: 'var(--text-muted)', fontSize: 12, padding: '10px 0' }}>Insufficient data.</div>
                        )}
                    </div>
                </Col>
            </Row>

            <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
                <Col xs={24} md={8}>
                    <div className="stat-card" style={{ padding: '16px 20px', height: '100%' }}>
                        <div style={{ fontSize: 10, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 12, letterSpacing: '0.5px' }}>
                            <FundOutlined /> MACD
                        </div>
                        {data.macd_hist != null ? (
                            <div>
                                <div style={{ fontSize: 22, fontWeight: 700, color: data.macd_hist > 0 ? '#00b894' : '#d63031', marginBottom: 4 }}>
                                    {data.macd_hist > 0 ? '+' : ''}{data.macd_hist.toFixed(2)}
                                </div>
                                <Tag color={data.macd_hist > 0 ? 'green' : 'red'} style={{ fontSize: 11 }}>
                                    {data.macd_hist > 0 ? 'Upward' : 'Downward'}
                                </Tag>
                            </div>
                        ) : <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>Unavailable</div>}
                    </div>
                </Col>
                <Col xs={24} md={8}>
                    <div className="stat-card" style={{ padding: '16px 20px', height: '100%' }}>
                        <div style={{ fontSize: 10, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 12, letterSpacing: '0.5px' }}>
                            <BarChartOutlined /> Volume Surge
                        </div>
                        {data.vol_ratio != null ? (
                            <div>
                                <div style={{ fontSize: 22, fontWeight: 700, color: data.vol_ratio > 1.2 ? '#00b894' : 'var(--text-primary)', marginBottom: 4 }}>
                                    {data.vol_ratio.toFixed(1)}x Avg
                                </div>
                                {data.obv_status && <Tag color={data.obv_status === 'Accumulation' ? 'green' : 'red'} style={{ fontSize: 11 }}>{data.obv_status}</Tag>}
                            </div>
                        ) : <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>Unavailable</div>}
                    </div>
                </Col>
                <Col xs={24} md={8}>
                    <div className="stat-card" style={{ padding: '16px 20px', height: '100%' }}>
                        <div style={{ fontSize: 10, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 12, letterSpacing: '0.5px' }}>
                            <LineChartOutlined /> Bollinger Bands
                        </div>
                        {data.bb_upper && data.bb_lower ? (
                            <div>
                                <div style={{ fontSize: 22, fontWeight: 700, color: data.ltp > data.bb_upper ? '#d63031' : data.ltp < data.bb_lower ? '#00b894' : 'var(--text-primary)', marginBottom: 4 }}>
                                    {data.ltp > data.bb_upper ? 'Overbought' : data.ltp < data.bb_lower ? 'Oversold' : 'In Range'}
                                </div>
                                <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{formatNPR(data.bb_lower)} - {formatNPR(data.bb_upper)}</div>
                            </div>
                        ) : <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>Unavailable</div>}
                    </div>
                </Col>
            </Row>
        </>
    );

    const SectorHealthCard = () => {
        const sectorLower = (data.sector || '').toLowerCase();
        const isBFI = sectorLower.match(/bank|finance|microfinance/);
        const isInsurance = sectorLower.includes('insurance');
        const isHydro = sectorLower.includes('hydro');
        const isMfg = sectorLower.match(/manufacturing|processing/);
        const isInvestment = sectorLower.includes('investment');

        const fmtL = (v) => v > 1e6 ? `${(v / 1e6).toFixed(1)}M` : v?.toLocaleString();
        let sectorMetrics = [];
        let sectorIcon = <BankOutlined />;

        if (isBFI) {
            sectorMetrics = [
                sm.npl != null && { label: 'NPL', value: sm.npl, suffix: '%', color: sm.npl < 3 ? '#00b894' : sm.npl < 5 ? '#fdcb6e' : '#d63031', tooltip: 'Non-Performing Loan. <3% is healthy for BFIs.' },
                sm.car != null && { label: 'CAR', value: sm.car, suffix: '%', color: sm.car > 11 ? '#00b894' : '#d63031', tooltip: 'Capital Adequacy Ratio. >11% is NRB minimum.' },
                sm.cd_ratio != null && { label: 'CD Ratio', value: sm.cd_ratio, suffix: '%', color: sm.cd_ratio < 80 ? '#00b894' : '#fdcb6e', tooltip: 'Credit-to-Deposit Ratio. <80% preferred by NRB.' },
                sm.cost_of_funds != null && { label: 'Cost of Funds', value: sm.cost_of_funds, suffix: '%', color: 'var(--text-primary)', tooltip: 'Average cost of deposits and borrowings.' },
                sm.interest_spread != null && { label: 'Interest Spread', value: sm.interest_spread, suffix: '%', color: sm.interest_spread > 3 ? '#00b894' : '#fdcb6e', tooltip: 'Lending rate minus deposit rate.' },
                sm.base_rate != null && { label: 'Base Rate', value: sm.base_rate, suffix: '%', color: 'var(--text-primary)', tooltip: 'Minimum lending rate set by the institution.' },
                sm.net_interest_income != null && { label: 'NII', value: fmtL(sm.net_interest_income), suffix: '', color: sm.net_interest_income > 0 ? '#00b894' : '#d63031', tooltip: "Net Interest Income (Rs '000)" },
                sm.distributable_profit != null && { label: 'Dist. Profit', value: fmtL(sm.distributable_profit), suffix: '', color: sm.distributable_profit > 0 ? '#00b894' : '#d63031', tooltip: 'Distributable profit available for dividends.' },
            ].filter(Boolean);
        } else if (isInsurance) {
            sectorIcon = <SafetyOutlined />;
            sectorMetrics = [
                sm.solvency_ratio != null && { label: 'Solvency Ratio', value: sm.solvency_ratio, suffix: 'x', color: sm.solvency_ratio > 1.5 ? '#00b894' : sm.solvency_ratio > 1 ? '#fdcb6e' : '#d63031', tooltip: 'Solvency Ratio. >1.5x is healthy per Beema Samiti.' },
                sm.claim_ratio != null && { label: 'Claim Ratio', value: sm.claim_ratio, suffix: '%', color: sm.claim_ratio < 60 ? '#00b894' : sm.claim_ratio < 80 ? '#fdcb6e' : '#d63031', tooltip: 'Net Claim / Net Premium. <60% is excellent.' },
                sm.net_premium != null && { label: 'Net Premium', value: fmtL(sm.net_premium), suffix: '', color: sm.net_premium > 0 ? '#00b894' : '#d63031', tooltip: 'Net premium earned after reinsurance.' },
                sm.gross_premium != null && { label: 'Gross Premium', value: fmtL(sm.gross_premium), suffix: '', color: '#6c5ce7', tooltip: 'Total gross premium written.' },
                sm.investment_income != null && { label: 'Investment Income', value: fmtL(sm.investment_income), suffix: '', color: sm.investment_income > 0 ? '#00b894' : '#d63031', tooltip: 'Income from investments and loans.' },
                sm.total_investment != null && { label: 'Total Investments', value: fmtL(sm.total_investment), suffix: '', color: '#0984e3', tooltip: 'Total investment portfolio.' },
                sm.catastrophic_reserve != null && { label: 'Catastrophe Rsv.', value: fmtL(sm.catastrophic_reserve), suffix: '', color: sm.catastrophic_reserve > 0 ? '#00b894' : '#d63031', tooltip: 'Reserve for catastrophic events.' },
                sm.mgmt_expenses != null && { label: 'Mgmt Expenses', value: fmtL(sm.mgmt_expenses), suffix: '', color: 'var(--text-primary)', tooltip: 'Total management expenses.' },
            ].filter(Boolean);
        } else if (isHydro) {
            sectorIcon = <ThunderboltOutlined />;
            sectorMetrics = [
                sm.revenue != null && { label: 'Revenue', value: fmtL(sm.revenue), suffix: '', color: sm.revenue > 0 ? '#00b894' : '#d63031', tooltip: "Quarterly revenue (Rs '000)." },
                sm.operating_profit != null && { label: 'Oper. Profit', value: fmtL(sm.operating_profit), suffix: '', color: sm.operating_profit > 0 ? '#00b894' : '#d63031', tooltip: 'Operating profit/loss.' },
                sm.debt_to_equity != null && { label: 'Debt/Equity', value: sm.debt_to_equity, suffix: 'x', color: sm.debt_to_equity < 1 ? '#00b894' : sm.debt_to_equity < 2 ? '#fdcb6e' : '#d63031', tooltip: 'Leverage ratio. <1x is conservative, >2x is risky for hydro.' },
                sm.current_ratio != null && { label: 'Current Ratio', value: sm.current_ratio, suffix: 'x', color: sm.current_ratio > 1.5 ? '#00b894' : sm.current_ratio > 1 ? '#fdcb6e' : '#d63031', tooltip: 'Liquidity. >1.5x is comfortable.' },
                sm.reserves != null && { label: 'Reserves', value: fmtL(sm.reserves), suffix: '', color: sm.reserves > 0 ? '#00b894' : '#d63031', tooltip: 'Reserves and Surplus. Negative = red flag for hydro.' },
                sm.borrowings != null && { label: 'Borrowings', value: fmtL(sm.borrowings), suffix: '', color: '#fdcb6e', tooltip: 'Total borrowings/loans.' },
            ].filter(Boolean);
        } else if (isMfg) {
            sectorIcon = <ExperimentOutlined />;
            sectorMetrics = [
                sm.revenue != null && { label: 'Revenue', value: fmtL(sm.revenue), suffix: '', color: sm.revenue > 0 ? '#00b894' : '#d63031', tooltip: "Revenue from operations (Rs '000)." },
                sm.gross_margin != null && { label: 'Gross Margin', value: sm.gross_margin, suffix: '%', color: sm.gross_margin > 30 ? '#00b894' : sm.gross_margin > 15 ? '#fdcb6e' : '#d63031', tooltip: 'Gross Profit / Revenue. >30% is strong for manufacturing.' },
                sm.operating_profit != null && { label: 'Oper. Profit', value: fmtL(sm.operating_profit), suffix: '', color: sm.operating_profit > 0 ? '#00b894' : '#d63031', tooltip: 'Operating profit/loss.' },
                sm.current_ratio != null && { label: 'Current Ratio', value: sm.current_ratio, suffix: 'x', color: sm.current_ratio > 1.5 ? '#00b894' : sm.current_ratio > 1 ? '#fdcb6e' : '#d63031', tooltip: 'Liquidity measure. >1.5x is safe.' },
                sm.debt_to_equity != null && { label: 'Debt/Equity', value: sm.debt_to_equity, suffix: 'x', color: sm.debt_to_equity < 1 ? '#00b894' : sm.debt_to_equity < 2 ? '#fdcb6e' : '#d63031', tooltip: 'Leverage. <1x ideal for manufacturing.' },
                sm.reserves != null && { label: 'Reserves', value: fmtL(sm.reserves), suffix: '', color: sm.reserves > 0 ? '#00b894' : '#d63031', tooltip: 'Retained reserves and surplus.' },
            ].filter(Boolean);
        } else if (isInvestment) {
            sectorIcon = <FundOutlined />;
            sectorMetrics = [
                sm.revenue != null && { label: 'Total Revenue', value: fmtL(sm.revenue), suffix: '', color: sm.revenue > 0 ? '#00b894' : '#d63031', tooltip: 'Total revenue including finance/investment income.' },
                sm.investment_income != null && { label: 'Finance Income', value: fmtL(sm.investment_income), suffix: '', color: sm.investment_income > 0 ? '#00b894' : '#d63031', tooltip: 'Income from investments and financial instruments.' },
                sm.reserves != null && { label: 'Reserves', value: fmtL(sm.reserves), suffix: '', color: sm.reserves > 0 ? '#00b894' : '#d63031', tooltip: 'Reserves and surplus.' },
                sm.total_assets != null && { label: 'Total Assets', value: fmtL(sm.total_assets), suffix: '', color: '#0984e3', tooltip: 'Total assets under management.' },
                sm.current_ratio != null && { label: 'Current Ratio', value: sm.current_ratio, suffix: 'x', color: sm.current_ratio > 1.5 ? '#00b894' : '#fdcb6e', tooltip: 'Liquidity measure.' },
                sm.debt_to_equity != null && { label: 'Debt/Equity', value: sm.debt_to_equity, suffix: 'x', color: sm.debt_to_equity < 1 ? '#00b894' : sm.debt_to_equity < 2 ? '#fdcb6e' : '#d63031', tooltip: 'Leverage ratio.' },
            ].filter(Boolean);
        } else {
            sectorIcon = <BarChartOutlined />;
            sectorMetrics = [
                sm.revenue != null && { label: 'Revenue', value: fmtL(sm.revenue), suffix: '', color: sm.revenue > 0 ? '#00b894' : '#d63031', tooltip: "Revenue (Rs '000)." },
                sm.operating_profit != null && { label: 'Oper. Profit', value: fmtL(sm.operating_profit), suffix: '', color: sm.operating_profit > 0 ? '#00b894' : '#d63031', tooltip: 'Operating profit/loss.' },
                sm.reserves != null && { label: 'Reserves', value: fmtL(sm.reserves), suffix: '', color: sm.reserves > 0 ? '#00b894' : '#d63031', tooltip: 'Reserves and surplus.' },
                sm.current_ratio != null && { label: 'Current Ratio', value: sm.current_ratio, suffix: 'x', color: sm.current_ratio > 1.5 ? '#00b894' : sm.current_ratio > 1 ? '#fdcb6e' : '#d63031', tooltip: 'Liquidity measure.' },
                sm.debt_to_equity != null && { label: 'Debt/Equity', value: sm.debt_to_equity, suffix: 'x', color: sm.debt_to_equity < 1 ? '#00b894' : sm.debt_to_equity < 2 ? '#fdcb6e' : '#d63031', tooltip: 'Leverage ratio.' },
                sm.distributable_profit != null && { label: 'Dist. Profit', value: fmtL(sm.distributable_profit), suffix: '', color: sm.distributable_profit > 0 ? '#00b894' : '#d63031', tooltip: 'Distributable profit.' },
            ].filter(Boolean);
        }

        if (sectorMetrics.length === 0) return null;

        return (
            <div className="stat-card" style={{ padding: '4px 0', marginBottom: 20 }}>
                <div style={{ fontSize: 10, textTransform: 'uppercase', color: 'var(--text-muted)', padding: '12px 20px 0', letterSpacing: '0.5px' }}>
                    {sectorIcon} Sector Health — {data.sector}
                </div>
                <Row gutter={0}>
                    {sectorMetrics.map((m, i) => (
                        <Col xs={12} sm={6} key={i}>
                            <MetricCard label={m.label} value={m.value} suffix={m.suffix} color={m.color} tooltip={m.tooltip} />
                        </Col>
                    ))}
                </Row>
            </div>
        );
    };

    const DividendsAndProfitTraj = () => (
        <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
            <Col xs={24} md={10}>
                <div className="stat-card" style={{ padding: '16px 20px', height: '100%' }}>
                    <div style={{ fontSize: 10, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 10, letterSpacing: '0.5px' }}>
                        <DollarOutlined /> Dividend Yield
                    </div>
                    <div style={{ fontSize: 28, fontWeight: 700, color: data.dividend_yield > 3 ? '#00b894' : data.dividend_yield > 0 ? '#fdcb6e' : 'var(--text-muted)', marginBottom: 6 }}>
                        {data.dividend_yield}%
                    </div>
                    <div style={{ maxHeight: 120, overflowY: 'auto' }}>
                        <table style={{ width: '100%', fontSize: 11 }}>
                            <thead>
                                <tr style={{ color: 'var(--text-muted)', borderBottom: '1px solid var(--border-color)' }}>
                                    <th style={{ textAlign: 'left', fontWeight: 400, paddingBottom: 4 }}>FY</th>
                                    <th style={{ textAlign: 'right', fontWeight: 400, paddingBottom: 4 }}>Cash</th>
                                    <th style={{ textAlign: 'right', fontWeight: 400, paddingBottom: 4 }}>Bonus</th>
                                </tr>
                            </thead>
                            <tbody>
                                {data.dividend_history?.map((h, i) => (
                                    <tr key={i} style={{ borderBottom: i < data.dividend_history.length - 1 ? '1px solid rgba(255,255,255,0.02)' : 'none' }}>
                                        <td style={{ padding: '5px 0', fontSize: 11 }}>{h.fy}</td>
                                        <td style={{ textAlign: 'right', color: '#00b894' }}>{h.cash}%</td>
                                        <td style={{ textAlign: 'right', color: '#6c5ce7' }}>{h.bonus}%</td>
                                    </tr>
                                ))}
                                {(!data.dividend_history || data.dividend_history.length === 0) && (
                                    <tr><td colSpan={3} style={{ textAlign: 'center', padding: '10px 0', opacity: 0.5 }}>No records</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </Col>
            <Col xs={24} md={14}>
                <div className="stat-card" style={{ padding: '16px 20px', height: '100%' }}>
                    <div style={{ fontSize: 10, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 10, letterSpacing: '0.5px' }}>
                        <LineChartOutlined /> Quarterly Net Profit Trajectory
                    </div>
                    {profitChartData.length > 0 ? (
                        <ResponsiveContainer width="100%" height={140}>
                            <BarChart data={profitChartData} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                                <XAxis dataKey="quarter" tick={{ fontSize: 9, fill: 'var(--text-muted)' }} />
                                <YAxis tick={{ fontSize: 9, fill: 'var(--text-muted)' }} tickFormatter={v => v >= 1e6 ? `${(v/1e6).toFixed(0)}M` : v >= 1e3 ? `${(v/1e3).toFixed(0)}K` : v} />
                                <RechartsTooltip
                                    contentStyle={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 8, fontSize: 12 }}
                                    formatter={(val) => [val?.toLocaleString('en-IN'), 'Net Profit']}
                                />
                                <Bar dataKey="value" radius={[3, 3, 0, 0]}>
                                    {profitChartData.map((entry, idx) => (
                                        <Cell key={idx} fill={entry.value > 0 ? '#00b894' : '#d63031'} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    ) : (
                        <div style={{ color: 'var(--text-muted)', fontSize: 12, padding: '30px 0', textAlign: 'center' }}>No quarterly data available.</div>
                    )}
                </div>
            </Col>
        </Row>
    );

    const ScoreBreakdown = () => (
        <div className="stat-card" style={{ padding: '16px 20px', marginBottom: 20 }}>
            <div style={{ fontSize: 10, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 10, letterSpacing: '0.5px' }}>
                <DashboardOutlined /> Score Breakdown
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 6 }}>
                {data.score_breakdown?.map((item, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, padding: '5px 10px', background: item.met ? 'rgba(0,184,148,0.06)' : 'rgba(214,48,49,0.04)', borderRadius: 6 }}>
                        <span style={{ color: item.met ? 'var(--accent-green)' : 'var(--text-muted)' }}>
                            {item.met ? <CheckCircleOutlined /> : <CloseCircleOutlined />} {item.label}
                        </span>
                        <span style={{ fontWeight: 600, color: item.met ? 'var(--accent-green)' : 'var(--text-muted)', fontSize: 11 }}>
                            +{item.pts}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );

    const ValueInvestingContent = (
        <div className="animate-in">
            <ValuationGrid />
            <ProfitabilityGrid />
            <TechTechnicalIndicators />
            <SectorHealthCard />
            <DividendsAndProfitTraj />
            <ScoreBreakdown />
            <AIAnalystPanel 
                title="AI Value Investing Narrative" 
                mode="value"
                model={selectedValueModel}
                setModel={setSelectedValueModel}
                models={models}
                onGenerateLocal={() => generateValueAI()}
                localLoading={valueAiLoading}
                localData={valueAiData}
                onGenerateCloud={() => generateValueCloud()}
                cloudLoading={valueCloudLoading}
                cloudData={valueCloudData}
                symbol={data.symbol}
            />
        </div>
    );

    const PureTradingContent = (
        <div className="animate-in">
            <TechTechnicalIndicators />
            <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
                <Col xs={24} md={12}>
                    <div className="stat-card" style={{ padding: '16px 20px', height: '100%' }}>
                        <div style={{ fontSize: 10, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 12, letterSpacing: '0.5px' }}>
                            < ThunderboltOutlined /> Short-term Momentum
                        </div>
                        <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
                            <div style={{ textAlign: 'center' }}>
                                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4 }}>MACD HIST</div>
                                <div style={{ fontSize: 18, fontWeight: 700, color: data.macd_hist > 0 ? '#00b894' : '#d63031' }}>
                                    {data.macd_hist ? data.macd_hist.toFixed(2) : '—'}
                                </div>
                            </div>
                            <div style={{ textAlign: 'center' }}>
                                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4 }}>RSI ZONE</div>
                                <Tag color={data.rsi_14 >= 70 ? 'red' : data.rsi_14 <= 30 ? 'green' : 'blue'} style={{ fontSize: 10 }}>
                                    {data.rsi_14 >= 70 ? 'OB' : data.rsi_14 <= 30 ? 'OS' : 'Neutral'}
                                </Tag>
                            </div>
                            <div style={{ textAlign: 'center' }}>
                                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4 }}>VOLUME</div>
                                <div style={{ fontSize: 18, fontWeight: 700 }}>{data.vol_ratio ? data.vol_ratio.toFixed(1) : '—'}x</div>
                            </div>
                        </div>
                    </div>
                </Col>
                <Col xs={24} md={12}>
                     <div className="stat-card" style={{ padding: '16px 20px', height: '100%' }}>
                        <div style={{ fontSize: 10, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 10, letterSpacing: '0.5px' }}>
                            <SafetyOutlined /> Support & Resistance (Approx.)
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                           <p style={{ margin: '4px 0' }}>Support 1 (Lower BB): <span style={{ color: '#00b894' }}>{formatNPR(data.bb_lower)}</span></p>
                           <p style={{ margin: '4px 0' }}>Support 2 (EMA 50): <span style={{ color: '#fdcb6e' }}>{formatNPR(data.ema_50)}</span></p>
                           <p style={{ margin: '4px 0' }}>Resistance 1 (Upper BB): <span style={{ color: '#d63031' }}>{formatNPR(data.bb_upper)}</span></p>
                        </div>
                    </div>
                </Col>
            </Row>
            <AIAnalystPanel 
                title="AI Trading Specialist Narrative" 
                mode="trading"
                model={selectedTradingModel}
                setModel={setSelectedTradingModel}
                models={models}
                onGenerateLocal={() => generateTradingAI()}
                localLoading={tradingAiLoading}
                localData={tradingAiData}
                onGenerateCloud={() => generateTradingCloud()}
                cloudLoading={tradingCloudLoading}
                cloudData={tradingCloudData}
                symbol={data.symbol}
            />
        </div>
    );

    const tabItems = [
        {
            key: 'value',
            label: <span style={{ fontSize: 13, fontWeight: 600 }}><BankOutlined /> Value Investing</span>,
            children: ValueInvestingContent,
        },
        {
            key: 'trading',
            label: <span style={{ fontSize: 13, fontWeight: 600 }}><ThunderboltOutlined /> Trading</span>,
            children: PureTradingContent,
        },
    ];

    return (
        <div className="animate-in">
            {/* ===== METHODOLOGY BANNER ===== */}
            <Alert
                message={<span style={{ fontWeight: 600 }}><SafetyOutlined /> Portfolio Manager Methodology</span>}
                description={
                    <span style={{ fontSize: 13 }}>
                        This executive summary leverages institutional-grade sector analysis and deep technical data. Switch between Value Investing for long-term health and Trading for short-term momentum opportunities.
                    </span>
                }
                type="info"
                showIcon
                style={{ marginBottom: 20, background: 'var(--bg-glass)', border: '1px solid rgba(9, 132, 227, 0.3)' }}
            />

            {/* ===== ACTION BADGE + SCORE (GLOBAL) ===== */}
            <div className="stat-card" style={{
                marginBottom: 20,
                padding: '20px 24px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: 16,
                background: actionCfg.bg,
                border: `1px solid ${actionCfg.color}33`,
                boxShadow: actionCfg.glow,
                borderRadius: 14
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    <div style={{
                        width: 50, height: 50, borderRadius: 12,
                        background: actionCfg.color, display: 'flex',
                        alignItems: 'center', justifyContent: 'center',
                        fontSize: 24, color: 'white',
                    }}>
                        {actionCfg.icon}
                    </div>
                    <div>
                        <div style={{ fontSize: 22, fontWeight: 800, color: actionCfg.color, letterSpacing: '0.5px' }}>
                            {data.action?.toUpperCase()}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 500 }}>
                            Global Aggregate Market Sentiment
                        </div>
                    </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>Health Score</div>
                    <div style={{ fontSize: 28, fontWeight: 800, color: scoreColor }}>{data.health_score}<span style={{ fontSize: 14, fontWeight: 400 }}>/100</span></div>
                </div>
            </div>

            <Tabs 
                defaultActiveKey="value" 
                items={tabItems} 
                className="custom-tabs" 
                style={{ marginBottom: 24 }}
            />
        </div>
    );
}
