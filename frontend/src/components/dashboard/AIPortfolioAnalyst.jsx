import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, Button, Spin, Typography, Alert, Space, Divider, message, Segmented, Select, Tag } from 'antd';
import { 
    RobotOutlined, CloudOutlined, DesktopOutlined, CopyOutlined, 
    ThunderboltOutlined, CheckCircleOutlined, WarningOutlined, 
    InfoCircleOutlined, LineChartOutlined, BarChartOutlined, 
    StockOutlined, SafetyOutlined, FireOutlined, BankOutlined, 
    FundOutlined, DollarOutlined, DashboardOutlined, ExperimentOutlined,
    ControlOutlined, RetweetOutlined, CheckSquareOutlined, CalculatorOutlined,
    RiseOutlined, BulbOutlined
} from '@ant-design/icons';
import { 
    analyzePortfolioCloud, analyzePortfolioLocal, 
    getPortfolioFrontierPrompt, getAIModels 
} from '../../services/api';

const { Text } = Typography;

// Section header icons mapping for AI analysis output
const SECTION_ICONS = {
    'portfolio health': <CheckCircleOutlined style={{ color: '#00b894' }} />,
    'performance': <RiseOutlined style={{ color: '#6c5ce7' }} />,
    'market alpha': <ThunderboltOutlined style={{ color: '#e17055' }} />,
    'risk': <WarningOutlined style={{ color: '#d63031' }} />,
    'volatility': <ExperimentOutlined style={{ color: '#e17055' }} />,
    'advice': <BulbOutlined style={{ color: '#fdcb6e' }} />,
    'actionable': <FireOutlined style={{ color: '#e84393' }} />,
    'conclusion': <CheckCircleOutlined style={{ color: '#00b894' }} />,
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
    if (!text) return null;
    const parts = text.split(/(\b(?:Rs\.?\s*)?[\d,]+\.?\d*%?\b|(?:STRONG BUY|BUY|ACCUMULATE|HOLD|REDUCE|SELL|WAIT|BULLISH|BEARISH|OVERBOUGHT|OVERSOLD|NEUTRAL|DO NOT BUY|EXCELLENT|GOOD|NEEDS WORK|HIGH RISK))/gi);
    
    return parts.map((part, i) => {
        if (/^(?:Rs\.?\s*)?[\d,]+\.?\d*%?$/.test(part)) {
            return <span key={i} style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{part}</span>;
        }
        const upper = part.toUpperCase();
        if (['STRONG BUY', 'BUY', 'ACCUMULATE', 'BULLISH', 'EXCELLENT', 'GOOD'].includes(upper)) {
            return <span key={i} style={{ fontWeight: 700, color: '#00b894', background: 'rgba(0,184,148,0.08)', padding: '1px 5px', borderRadius: 4 }}>{part}</span>;
        }
        if (['SELL', 'REDUCE', 'BEARISH', 'DO NOT BUY', 'HIGH RISK'].includes(upper)) {
            return <span key={i} style={{ fontWeight: 700, color: '#d63031', background: 'rgba(214,48,49,0.08)', padding: '1px 5px', borderRadius: 4 }}>{part}</span>;
        }
        if (['HOLD', 'WAIT', 'NEUTRAL', 'OVERBOUGHT', 'OVERSOLD', 'NEEDS WORK'].includes(upper)) {
            return <span key={i} style={{ fontWeight: 700, color: '#fdcb6e', background: 'rgba(253,203,110,0.1)', padding: '1px 5px', borderRadius: 4 }}>{part}</span>;
        }
        return part;
    });
}

function FormattedAnalysis({ text, isCloud }) {
    if (!text) return null;
    const accentColor = isCloud ? 'rgba(9, 132, 227,' : 'rgba(108, 92, 231,';
    const paragraphs = text.split(/\n\n+/).filter(p => p.trim());
    const sections = [];
    let currentSection = null;
    
    for (const para of paragraphs) {
        const lines = para.trim().split('\n');
        const firstLine = lines[0].trim();
        const isCenteredHeader = /^[━─-]+\s*[A-Z\s&]+\s*[━─-]+$/.test(firstLine);
        const isHeader = /^(?:\d+\.\s*)?(?:#+\s*)?[A-Z].*:$/m.test(firstLine) || 
                         /^(?:\d+\.\s*)?(?:#+\s*)?[A-Z][^.!?]*(?:[:])/.test(firstLine) && firstLine.length < 80 ||
                         isCenteredHeader;
        
        if (isHeader) {
            let headerText = firstLine.replace(/^(?:\d+\.\s*)?(?:#+\s*)?/, '').replace(/:+$/, '').trim();
            if (isCenteredHeader) headerText = firstLine.replace(/^[━─-]+\s*/, '').replace(/\s*[━─-]+$/, '').trim();
            
            let bodyLines = lines.slice(1).join('\n').trim();
            if (!bodyLines && firstLine.includes(':') && !isCenteredHeader) {
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
            currentSection.body += (currentSection.body ? '\n\n' : '') + para.trim();
        } else {
            sections.push({ header: null, body: para.trim() });
        }
    }
    
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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 12 }}>
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
                    <div style={{ fontSize: 13, lineHeight: 1.75, color: 'var(--text-secondary)' }}>
                        {highlightText(section.body)}
                    </div>
                </div>
            ))}
        </div>
    );
}

export default function AIPortfolioAnalyst({ summary, context }) {
    const [aiSource, setAiSource] = useState('cloud');
    const [selectedModel, setSelectedModel] = useState('llama3');
    const [cloudProvider, setCloudProvider] = useState('groq');
    const [promptText, setPromptText] = useState('');
    const [promptLoading, setPromptLoading] = useState(false);
    const [copied, setCopied] = useState(false);

    // Fetch available local models
    const { data: models = [] } = useQuery({
        queryKey: ['ai-models'],
        queryFn: () => getAIModels().then(res => res.data.models || []),
    });

    useEffect(() => {
        if (models.length > 0 && !models.includes(selectedModel)) {
            setSelectedModel(models[0]);
        }
    }, [models]);

    const getParams = () => {
        const params = {};
        if (context?.type === 'member') params.member_id = context.id;
        if (context?.type === 'group') params.member_ids = context.memberIds.join(',');
        return params;
    };

    const { data: localData, isFetching: localLoading, refetch: generateLocal } = useQuery({
        queryKey: ['portfolio-analysis-local', context?.id, context?.memberIds, selectedModel],
        queryFn: () => analyzePortfolioLocal({ ...getParams(), model: selectedModel }).then(r => r.data),
        enabled: false, staleTime: Infinity,
    });

    const { data: cloudData, isFetching: cloudLoading, refetch: generateCloud } = useQuery({
        queryKey: ['portfolio-analysis-cloud', context?.id, context?.memberIds, cloudProvider],
        queryFn: () => analyzePortfolioCloud({ ...getParams(), provider: cloudProvider }).then(r => r.data),
        enabled: false, staleTime: Infinity,
    });

    const handleGeneratePrompt = async () => {
        setPromptLoading(true);
        setCopied(false);
        try {
            const res = await getPortfolioFrontierPrompt(getParams());
            if (res.data?.status === 'success') {
                setPromptText(res.data.prompt);
            } else {
                setPromptText('Failed to generate prompt.');
            }
        } catch (e) {
            setPromptText('Error connecting to prompt service.');
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
    const currentData = aiSource === 'local' ? localData : aiSource === 'cloud' ? cloudData : null;

    const handleGenerate = () => {
        if (aiSource === 'prompt') handleGeneratePrompt();
        else if (aiSource === 'cloud') generateCloud();
        else generateLocal();
    };

    if (!summary || summary.holdings_count === 0) return null;

    return (
        <div className="stat-card" style={{ 
            padding: '20px 24px', 
            marginBottom: 24, 
            border: '1px solid rgba(108, 92, 231, 0.2)',
            background: 'var(--bg-secondary)',
            borderRadius: 14
        }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ 
                        width: 32, height: 32, borderRadius: 8, 
                        background: 'rgba(108, 92, 231, 0.1)', 
                        display: 'flex', alignItems: 'center', justifyContent: 'center' 
                    }}>
                        <RobotOutlined style={{ color: '#6c5ce7', fontSize: 18 }} />
                    </div>
                    <div>
                        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>AI Portfolio Analyst</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Professional narrative review of your performance & risk</div>
                    </div>
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
                <div style={{ fontSize: 11, color: 'var(--text-muted)', maxWidth: 450 }}>
                    {aiSource === 'prompt' && 'Create a NEPSE-contextualized prompt for ChatGPT, Claude, or Gemini.'}
                    {aiSource === 'local' && 'Private analysis on your machine. Needs Ollama running.'}
                    {aiSource === 'cloud' && 'High-intelligence Groq Cloud analysis. Fast & reliable.'}
                </div>
                <Space>
                    {aiSource === 'local' && (
                        <Select
                            size="small"
                            value={selectedModel}
                            onChange={setSelectedModel}
                            style={{ width: 180 }}
                            dropdownStyle={{ borderRadius: 8 }}
                        >
                            {models.map(m => (
                                <Select.Option key={m} value={m}>
                                    {m.split(':')[0].toUpperCase()} ({m.split(':')[1] || 'latest'})
                                </Select.Option>
                            ))}
                        </Select>
                    )}
                    {aiSource === 'cloud' && (
                        <Select
                            size="small"
                            value={cloudProvider}
                            onChange={setCloudProvider}
                            style={{ width: 140 }}
                        >
                            <Select.Option value="groq">Groq Cloud</Select.Option>
                            <Select.Option value="nvidia">DeepSeek v3</Select.Option>
                        </Select>
                    )}
                    <Button
                        type="primary"
                        size="small"
                        icon={aiSource === 'prompt' ? <CopyOutlined /> : <ThunderboltOutlined />}
                        onClick={handleGenerate}
                        loading={loading}
                    >
                        {aiSource === 'prompt' ? 'Generate Prompt' : 'Analyze'}
                    </Button>
                </Space>
            </div>

            <Divider style={{ margin: '0 0 20px', borderColor: 'rgba(255,255,255,0.04)' }} />

            {/* === PROMPT MODE === */}
            {aiSource === 'prompt' && (
                <>
                    {loading ? (
                        <div style={{ textAlign: 'center', padding: '36px 0' }}><Spin tip="Building prompt..." /></div>
                    ) : promptText ? (
                        <div className="animate-in">
                            <pre style={{
                                fontSize: 12, lineHeight: 1.6, color: 'var(--text-secondary)',
                                padding: '16px', background: 'rgba(108, 92, 231, 0.04)',
                                borderRadius: 10, border: '1px solid rgba(108, 92, 231, 0.1)',
                                maxHeight: 280, overflowY: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                                marginBottom: 12,
                            }}>
                                {promptText}
                            </pre>
                            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
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
                        <div style={{ textAlign: 'center', padding: '30px 0', opacity: 0.5 }}>
                            <CopyOutlined style={{ fontSize: 32, marginBottom: 8 }} />
                            <p>Ready to generate a professional frontier prompt.</p>
                        </div>
                    )}
                </>
            )}

            {/* === AI MODES === */}
            {(aiSource === 'local' || aiSource === 'cloud') && (
                <>
                    {loading ? (
                        <div style={{ textAlign: 'center', padding: '36px 0' }}><Spin tip="AI is thinking..." /></div>
                    ) : currentData ? (
                        currentData.status === 'error' ? (
                            <Alert message="Analysis Error" description={currentData.analysis} type="warning" showIcon />
                        ) : (
                            <div className="animate-in">
                                <div style={{ 
                                    fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', 
                                    marginBottom: 16, padding: '12px 16px', 
                                    background: aiSource === 'cloud' ? 'rgba(9, 132, 227, 0.08)' : 'rgba(108, 92, 231, 0.08)', 
                                    borderRadius: 10, borderLeft: `4px solid ${aiSource === 'cloud' ? '#0984e3' : '#6c5ce7'}`
                                }}>
                                    {currentData.verdict}
                                </div>
                                <FormattedAnalysis text={currentData.analysis} isCloud={aiSource === 'cloud'} />
                                
                                <div style={{ marginTop: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <Tag color={aiSource === 'cloud' ? 'blue' : 'purple'} style={{ fontSize: 10 }}>
                                        {aiSource === 'cloud' ? <CloudOutlined /> : <DesktopOutlined />} {currentData.model_used}
                                    </Tag>
                                    <Button type="text" size="small" onClick={() => message.info('Visual metrics coming soon')} style={{ color: 'var(--text-muted)', fontSize: 11 }}>
                                        Detailed Stats
                                    </Button>
                                </div>
                            </div>
                        )
                    ) : (
                        <div style={{ textAlign: 'center', padding: '30px 0', opacity: 0.5 }}>
                            <RobotOutlined style={{ fontSize: 32, marginBottom: 8 }} />
                            <p>Select a model and click Analyze to start.</p>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
