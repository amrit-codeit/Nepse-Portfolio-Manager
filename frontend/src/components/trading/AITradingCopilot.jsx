import { useState, useMemo } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Spin, Alert, Select, Button, Typography, Tag, Row, Col, Input, message } from 'antd';
import { RobotOutlined, ThunderboltOutlined, CopyOutlined } from '@ant-design/icons';
import { getCompanies, getAITradingVerdict, getAITradingVerdictCloud, getAIModels, getFrontierPrompt } from '../../services/api';


const { Title, Text, Paragraph } = Typography;

export default function AITradingCopilot() {
    const [symbol, setSymbol] = useState(null);
    const [mode, setMode] = useState('verdict'); // 'verdict' or 'prompt'
    const [model, setModel] = useState('llama3.2');

    const { data: companiesRaw } = useQuery({
        queryKey: ['companies', 'all'],
        queryFn: () => getCompanies({ limit: 1000 }).then(r => r.data.companies),
    });
    const companyOptions = useMemo(() =>
        (companiesRaw || []).map(c => ({ value: c.symbol, label: `${c.symbol} — ${c.name || ''}` })),
        [companiesRaw]
    );

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

    return (
        <div className="animate-in">
            <div className="stat-card" style={{ padding: '16px 20px', marginBottom: 24, display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ fontSize: 14, fontWeight: 500 }}>Select Stock:</div>
                <Select
                    showSearch
                    optionFilterProp="label"
                    value={symbol}
                    onChange={(val) => { setSymbol(val); verdictMut.reset(); }}
                    options={companyOptions}
                    placeholder="Search stock..."
                    style={{ width: 300 }}
                    size="large"
                />
                <div style={{ fontSize: 14, fontWeight: 500, marginLeft: 8 }}>Action:</div>
                <Select
                    value={mode}
                    onChange={setMode}
                    options={[
                        { value: 'verdict', label: 'Generate Verdict' },
                        { value: 'prompt', label: 'Generate Prompt (for Claude/ChatGPT)' }
                    ]}
                    style={{ width: 260 }}
                    size="large"
                />
                {mode === 'verdict' && (
                    <>
                        <div style={{ fontSize: 14, fontWeight: 500, marginLeft: 8 }}>AI Model:</div>
                        <Select
                            value={model}
                            onChange={setModel}
                            options={availableModels}
                            style={{ width: 180 }}
                            size="large"
                        />
                    </>
                )}
                <Button 
                    type="primary" 
                    icon={<RobotOutlined />} 
                    size="large" 
                    onClick={() => verdictMut.mutate()} 
                    loading={verdictMut.isPending}
                    disabled={!symbol}
                    style={{ marginLeft: 'auto', background: 'linear-gradient(135deg, #a29bfe 0%, #6c5ce7 100%)', border: 'none' }}
                >
                    {mode === 'prompt' ? 'Generate Prompt' : 'Generate Verdict'}
                </Button>
            </div>

            {verdictMut.isPending && (
                <div style={{ textAlign: 'center', padding: '60px 0' }}>
                    <Spin size="large" tip={mode === 'prompt' ? "Generating prompt..." : "AI is analyzing technical structures, momentum, and risk parameters..."} />
                </div>
            )}

            {verdictMut.isError && (
                <Alert message="Error" description="Failed to generate AI verdict. Check if Ollama is running or try cloud." type="error" showIcon style={{ marginBottom: 24 }} />
            )}

            {result && result.status === 'error' && (
                <Alert message={result.verdict} description={result.analysis} type="error" showIcon style={{ marginBottom: 24 }} />
            )}

            {result && result.status === 'success' && (
                <div className="animate-in">
                    {mode === 'prompt' ? (
                        <div className="stat-card" style={{ padding: '24px 32px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                                <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>Frontier Model Prompt</h2>
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
                                autoSize={{ minRows: 10, maxRows: 30 }} 
                                style={{ fontFamily: 'monospace', fontSize: 13, background: 'var(--bg-glass)', color: 'var(--text-primary)' }}
                            />
                        </div>
                    ) : (
                        <Row gutter={[24, 24]}>
                            <Col xs={24}>
                                <div className="stat-card" style={{ padding: '24px 32px', background: 'linear-gradient(135deg, rgba(108, 92, 231, 0.05) 0%, rgba(167, 139, 250, 0.1) 100%)', borderLeft: '4px solid #6c5ce7' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                                        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: 'var(--accent-primary)' }}>
                                            <ThunderboltOutlined style={{ marginRight: 8 }} />
                                            Trading Verdict: {result.verdict}
                                        </h2>
                                        <Tag color="purple" style={{ fontSize: 14, padding: '4px 12px' }}>{model === 'groq' ? 'Groq Cloud' : `Local: ${model}`}</Tag>
                                    </div>
                                    <div className="markdown-body" style={{ color: 'var(--text-secondary)', fontSize: 15, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                                        {result.analysis}
                                    </div>
                                </div>
                            </Col>
                        </Row>
                    )}
                </div>
            )}

            {!result && !verdictMut.isPending && (
                <div style={{ textAlign: 'center', padding: '80px 20px', background: 'var(--bg-secondary)', borderRadius: 12, border: '1px dashed var(--border-color)', marginTop: 20 }}>
                    <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.2 }}><RobotOutlined /></div>
                    <Title level={4} style={{ color: 'var(--text-primary)' }}>AI Trading Copilot</Title>
                    <Paragraph style={{ color: 'var(--text-muted)', maxWidth: 500, margin: '0 auto', fontSize: 15 }}>
                        Select a stock to generate an AI-powered technical analysis report. The AI will evaluate momentum, moving average trends, support/resistance levels, and suggest potential entry/exit strategies based on current market conditions.
                    </Paragraph>
                </div>
            )}
        </div>
    );
}
