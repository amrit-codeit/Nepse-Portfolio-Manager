import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, Spin, Tag, Empty, Button, Space, Select, Segmented, Divider, Alert, message } from 'antd';
import {
    HistoryOutlined, RobotOutlined, ThunderboltOutlined, CloudOutlined,
    DesktopOutlined, CopyOutlined, CheckCircleOutlined, CloseCircleOutlined,
    RiseOutlined, FallOutlined, CalendarOutlined, DollarOutlined,
    WarningOutlined, InfoCircleOutlined, SafetyOutlined
} from '@ant-design/icons';
import {
    getTradeIntelEpochs, getTradeIntelAILocal, getTradeIntelAICloud,
    getTradeIntelFrontierPrompt, getAIModels
} from '../../services/api';

function formatNPR(v) {
    if (v == null) return '—';
    return `Rs. ${Number(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function EpochCard({ epoch, index, total }) {
    const isOpen = epoch.is_open;
    const pnl = (epoch.realized_pnl || 0) + (epoch.unrealized_pnl || 0);
    const pnlPositive = pnl >= 0;

    return (
        <div className="stat-card" style={{
            padding: '18px 22px', marginBottom: 14,
            border: `1px solid ${isOpen ? 'rgba(9,132,227,0.25)' : 'rgba(255,255,255,0.06)'}`,
            borderRadius: 12,
        }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Tag color={isOpen ? 'blue' : 'default'} style={{ fontSize: 11, margin: 0 }}>
                        {isOpen ? 'OPEN' : 'CLOSED'}
                    </Tag>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>
                        Epoch {total - index} of {total}
                    </span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    <CalendarOutlined /> {epoch.epoch_start} → {isOpen ? 'Present' : epoch.epoch_end}
                    {epoch.holding_days > 0 && <span style={{ marginLeft: 8 }}>({epoch.holding_days} days)</span>}
                </div>
            </div>

            <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap' }}>
                <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Avg Buy</div>
                    <div style={{ fontSize: 15, fontWeight: 700 }}>{formatNPR(epoch.avg_buy_price)}</div>
                </div>
                {epoch.avg_sell_price > 0 && (
                    <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Avg Sell</div>
                        <div style={{ fontSize: 15, fontWeight: 700 }}>{formatNPR(epoch.avg_sell_price)}</div>
                    </div>
                )}
                <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Bought</div>
                    <div style={{ fontSize: 15, fontWeight: 700 }}>{epoch.total_bought_qty}</div>
                </div>
                {epoch.total_sold_qty > 0 && (
                    <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Sold</div>
                        <div style={{ fontSize: 15, fontWeight: 700 }}>{epoch.total_sold_qty}</div>
                    </div>
                )}
                {isOpen && epoch.remaining_qty > 0 && (
                    <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Remaining</div>
                        <div style={{ fontSize: 15, fontWeight: 700 }}>{epoch.remaining_qty}</div>
                    </div>
                )}
                <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Total P&L</div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: pnlPositive ? '#00b894' : '#d63031' }}>
                        {pnlPositive ? '+' : ''}{formatNPR(pnl)}
                    </div>
                </div>
                {epoch.total_cgt_paid > 0 && (
                    <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>CGT Paid</div>
                        <div style={{ fontSize: 15, fontWeight: 700, color: '#e17055' }}>{formatNPR(epoch.total_cgt_paid)}</div>
                    </div>
                )}
            </div>

            {/* Transaction timeline */}
            {epoch.transactions?.length > 0 && (
                <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>
                        Transactions ({epoch.transactions.length})
                    </div>
                    <div style={{ maxHeight: 150, overflowY: 'auto' }}>
                        {epoch.transactions.map((t, i) => (
                            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, padding: '3px 0', borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
                                <span style={{ color: 'var(--text-muted)', width: 80 }}>{t.date}</span>
                                <Tag color={['BUY','IPO','FPO','RIGHT','BONUS'].includes(t.type) ? 'green' : 'red'} style={{ fontSize: 10, margin: 0, minWidth: 50, textAlign: 'center' }}>{t.type}</Tag>
                                <span style={{ width: 50, textAlign: 'right' }}>{t.qty}</span>
                                <span style={{ width: 90, textAlign: 'right', color: 'var(--text-secondary)' }}>{t.rate ? formatNPR(t.rate) : '—'}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

/** Parses AI analysis text into styled sections */
function FormattedAnalysis({ text }) {
    if (!text) return null;
    const paragraphs = text.split(/\n\n+/).filter(p => p.trim());
    return (
        <div>
            {paragraphs.map((para, i) => {
                const headerMatch = para.match(/^[━═─\-]{2,}\s*(.+?)\s*[━═─\-]*$/m);
                const header = headerMatch ? headerMatch[1].trim() : null;
                const body = header ? para.replace(/^[━═─\-].*$/m, '').trim() : para.trim();
                return (
                    <div key={i} style={{ marginBottom: 12, padding: '10px 14px', background: 'rgba(108,92,231,0.03)', borderRadius: 8, borderLeft: header ? '3px solid rgba(9,132,227,0.5)' : 'none' }}>
                        {header && <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.3px' }}>{header}</div>}
                        <div style={{ fontSize: 13, lineHeight: 1.75, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap' }}>{body}</div>
                    </div>
                );
            })}
        </div>
    );
}

export default function TradeIntelTab({ symbol, memberId }) {
    const [selectedModel, setSelectedModel] = useState("qwen2.5:3b-instruct-q4_0");
    const [cloudModel, setCloudModel] = useState("groq");
    const [aiSource, setAiSource] = useState('cloud');
    const [promptText, setPromptText] = useState('');
    const [promptLoading, setPromptLoading] = useState(false);
    const [copied, setCopied] = useState(false);

    const { data: modelData } = useQuery({
        queryKey: ['ai-models'],
        queryFn: () => getAIModels().then(r => r.data),
        staleTime: 600000,
    });
    const models = modelData?.models || ["qwen2.5:3b-instruct-q4_0", "gemma4:e2b"];

    const { data: epochData, isLoading } = useQuery({
        queryKey: ['trade-intel-epochs', symbol, memberId],
        queryFn: () => getTradeIntelEpochs(symbol, memberId).then(r => r.data),
        enabled: !!symbol && !!memberId,
    });

    const { data: localAiData, isFetching: localLoading, refetch: generateLocal } = useQuery({
        queryKey: ['trade-intel-local', symbol, memberId, selectedModel],
        queryFn: () => getTradeIntelAILocal(symbol, memberId, selectedModel).then(r => r.data),
        enabled: false, staleTime: Infinity,
    });

    const { data: cloudAiData, isFetching: cloudLoading, refetch: generateCloud } = useQuery({
        queryKey: ['trade-intel-cloud', symbol, memberId, cloudModel],
        queryFn: () => getTradeIntelAICloud(symbol, memberId, cloudModel).then(r => r.data),
        enabled: false, staleTime: Infinity,
    });

    if (!memberId) {
        return (
            <Card className="stat-card" style={{ textAlign: 'center', padding: '60px 20px' }}>
                <HistoryOutlined style={{ fontSize: 48, opacity: 0.1, marginBottom: 16, display: 'block' }} />
                <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Select a Portfolio Member</div>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                    Use the Portfolio Filter above to select a member and view their trade history analysis.
                </p>
            </Card>
        );
    }

    if (isLoading) {
        return <div style={{ textAlign: 'center', padding: '80px 0' }}><Spin size="large" tip="Building holding epochs..." /></div>;
    }

    const epochs = epochData?.epochs || [];
    const fSnap = epochData?.fundamental_snapshot;
    const holding = epochData?.current_holding;

    if (epochs.length === 0) {
        return (
            <Card className="stat-card" style={{ textAlign: 'center', padding: '60px 20px' }}>
                <HistoryOutlined style={{ fontSize: 48, opacity: 0.1, marginBottom: 16, display: 'block' }} />
                <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>No Transaction History</div>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                    No transactions found for {symbol} under this member. Import your MeroShare history first.
                </p>
            </Card>
        );
    }

    const handleGeneratePrompt = async () => {
        setPromptLoading(true);
        setCopied(false);
        try {
            const res = await getTradeIntelFrontierPrompt(symbol, memberId);
            setPromptText(res.data.prompt);
        } catch { setPromptText('Failed to generate prompt.'); }
        setPromptLoading(false);
    };

    const handleCopy = () => {
        navigator.clipboard.writeText(promptText).then(() => { setCopied(true); message.success('Copied!'); setTimeout(() => setCopied(false), 3000); });
    };

    const loading = aiSource === 'local' ? localLoading : aiSource === 'cloud' ? cloudLoading : promptLoading;
    const aiData = aiSource === 'local' ? localAiData : aiSource === 'cloud' ? cloudAiData : null;
    const handleGenerate = () => {
        if (aiSource === 'prompt') handleGeneratePrompt();
        else if (aiSource === 'cloud') generateCloud();
        else generateLocal();
    };

    return (
        <div className="animate-in">
            <Alert
                message={<span style={{ fontWeight: 600 }}><HistoryOutlined /> Retrospective Trade Intelligence</span>}
                description={<span style={{ fontSize: 13 }}>AI-powered post-mortem analysis of your investment decisions. Evaluates entry timing, position management, and outcomes against fundamental benchmarks.</span>}
                type="info" showIcon
                style={{ marginBottom: 20, background: 'var(--bg-glass)', border: '1px solid rgba(9, 132, 227, 0.3)' }}
            />

            {/* Fundamental context bar */}
            {fSnap && (
                <div className="stat-card" style={{ padding: '12px 20px', marginBottom: 20, display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'center' }}>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Current Fundamentals</div>
                    {fSnap.health_score != null && <div><span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Health </span><span style={{ fontWeight: 700, color: fSnap.health_score >= 60 ? '#00b894' : '#fdcb6e' }}>{fSnap.health_score}/100</span></div>}
                    {fSnap.graham_number && <div><span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Graham </span><span style={{ fontWeight: 700, color: '#6c5ce7' }}>{formatNPR(fSnap.graham_number)}</span></div>}
                    {fSnap.pe_ratio != null && <div><span style={{ fontSize: 10, color: 'var(--text-muted)' }}>P/E </span><span style={{ fontWeight: 700 }}>{fSnap.pe_ratio?.toFixed(1)}</span></div>}
                    {fSnap.dividend_yield != null && <div><span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Yield </span><span style={{ fontWeight: 700, color: '#00b894' }}>{fSnap.dividend_yield}%</span></div>}
                </div>
            )}

            {/* Epoch cards */}
            <div style={{ marginBottom: 24 }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12, color: 'var(--text-secondary)' }}>
                    <HistoryOutlined style={{ marginRight: 6 }} />
                    {epochs.length} Holding Epoch{epochs.length > 1 ? 's' : ''} Found
                </div>
                {[...epochs].reverse().map((ep, i) => (
                    <EpochCard key={i} epoch={ep} index={i} total={epochs.length} />
                ))}
            </div>

            {/* AI Analysis Panel */}
            <div className="stat-card" style={{ padding: '20px 24px', border: '1px solid rgba(108, 92, 231, 0.2)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
                    <div style={{ fontSize: 15, fontWeight: 700 }}>
                        <RobotOutlined style={{ color: '#6c5ce7', marginRight: 8 }} />
                        AI Trade Review
                    </div>
                    <Segmented size="small" value={aiSource} onChange={setAiSource}
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
                        {aiSource === 'prompt' && 'Generate a prompt to paste into ChatGPT, DeepSeek, Gemini, or Claude.'}
                        {aiSource === 'local' && 'Run retrospective analysis on your local Ollama model.'}
                        {aiSource === 'cloud' && 'Get instant retrospective analysis from Cloud AI.'}
                    </div>
                    <Space>
                        {aiSource === 'local' && (
                            <Select size="small" value={selectedModel} onChange={setSelectedModel} style={{ width: 200 }}>
                                {models.map(m => <Select.Option key={m} value={m}>{m.split(':')[0].toUpperCase()} ({m.split(':')[1] || 'latest'})</Select.Option>)}
                            </Select>
                        )}
                        {aiSource === 'cloud' && (
                            <Select size="small" value={cloudModel} onChange={setCloudModel} style={{ width: 200 }}>
                                <Select.Option value="groq">Groq Cloud</Select.Option>
                                <Select.Option value="nvidia">Nvidia DeepSeek</Select.Option>
                            </Select>
                        )}
                        <Button type="primary" size="small" icon={aiSource === 'prompt' ? <CopyOutlined /> : <ThunderboltOutlined />} onClick={handleGenerate} loading={loading}>
                            {aiSource === 'prompt' ? 'Generate Prompt' : 'Analyze'}
                        </Button>
                    </Space>
                </div>

                {/* Prompt mode */}
                {aiSource === 'prompt' && (
                    promptLoading ? <div style={{ textAlign: 'center', padding: '36px 0' }}><Spin size="large" /></div> :
                    promptText ? (
                        <div className="animate-in">
                            <pre style={{ fontSize: 12, lineHeight: 1.6, color: 'var(--text-secondary)', padding: 16, background: 'rgba(108,92,231,0.04)', borderRadius: 10, border: '1px solid rgba(108,92,231,0.1)', maxHeight: 320, overflowY: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word', marginBottom: 12 }}>{promptText}</pre>
                            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                                <Button type={copied ? 'default' : 'primary'} size="small" icon={<CopyOutlined />} onClick={handleCopy} style={copied ? { borderColor: '#00b894', color: '#00b894' } : {}}>
                                    {copied ? 'Copied!' : 'Copy to Clipboard'}
                                </Button>
                            </div>
                        </div>
                    ) : (
                        <div style={{ textAlign: 'center', padding: '36px 0', color: 'var(--text-muted)' }}>
                            <CopyOutlined style={{ fontSize: 36, opacity: 0.1, marginBottom: 12, display: 'block' }} />
                            <div style={{ fontSize: 13, fontWeight: 500 }}>Ready to Generate Prompt</div>
                        </div>
                    )
                )}

                {/* Local & Cloud AI modes */}
                {(aiSource === 'local' || aiSource === 'cloud') && (
                    loading ? (
                        <div style={{ textAlign: 'center', padding: '36px 0' }}>
                            <Spin size="large" />
                            <div style={{ marginTop: 14, color: 'var(--text-muted)', fontSize: 12 }}>Analyzing trade history for {symbol}...</div>
                        </div>
                    ) : aiData ? (
                        aiData.status === 'error' ? (
                            <Alert message="Analysis Failed" description={aiData.analysis} type="warning" showIcon icon={<WarningOutlined />} style={{ marginBottom: 16 }}
                                action={<Button size="small" danger ghost onClick={handleGenerate}>Retry</Button>}
                            />
                        ) : (
                            <div className="animate-in">
                                <FormattedAnalysis text={aiData.analysis} />
                                <Divider style={{ margin: '16px 0', borderColor: 'rgba(108,92,231,0.1)' }} />
                                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Verdict:</div>
                                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>{aiData.verdict}</div>
                                    {aiData.model_used && <Tag color={aiSource === 'cloud' ? 'blue' : 'purple'} style={{ fontSize: 10, marginLeft: 'auto' }}>{aiData.model_used}</Tag>}
                                </div>
                            </div>
                        )
                    ) : (
                        <div style={{ textAlign: 'center', padding: '36px 0', color: 'var(--text-muted)' }}>
                            <RobotOutlined style={{ fontSize: 36, opacity: 0.1, marginBottom: 12, display: 'block' }} />
                            <div style={{ fontSize: 13, fontWeight: 500 }}>Ready for AI Trade Review</div>
                            <div style={{ fontSize: 11, marginTop: 6, opacity: 0.6 }}>Click "Analyze" to get a retrospective grade on your {symbol} investment.</div>
                        </div>
                    )
                )}
            </div>
        </div>
    );
}
