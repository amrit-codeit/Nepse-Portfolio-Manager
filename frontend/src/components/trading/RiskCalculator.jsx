import { useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Alert, Button, Col, InputNumber, Row, Select, Spin, Tag, Tooltip, message } from 'antd';
import { AimOutlined, CalculatorOutlined, ThunderboltOutlined, WarningOutlined } from '@ant-design/icons';
import { calculateTradePlan, getCompanies, getMergedPrices, getScreenerData } from '../../services/api';

function formatNPR(value) {
    if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
    return `Rs. ${Number(value).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function RiskCalculator() {
    const [symbol, setSymbol] = useState(null);
    const [capitalBase, setCapitalBase] = useState(500000);
    const [sleevePct, setSleevePct] = useState(20);
    const [riskPct, setRiskPct] = useState(2);
    const [entryPrice, setEntryPrice] = useState(null);
    const [stopLoss, setStopLoss] = useState(null);
    const [targetPrice, setTargetPrice] = useState(null);
    const [result, setResult] = useState(null);

    const { data: companiesRaw } = useQuery({
        queryKey: ['companies'],
        queryFn: () => getCompanies().then((r) => r.data),
    });

    const { data: pricesRaw } = useQuery({
        queryKey: ['prices'],
        queryFn: () => getMergedPrices().then((r) => r.data),
    });

    const { data: screenerRaw } = useQuery({
        queryKey: ['screener-data'],
        queryFn: () => getScreenerData().then((r) => r.data),
    });

    const companies = useMemo(() => {
        const raw = companiesRaw?.companies || [];
        return raw.map((company) => ({
            value: company.symbol,
            label: `${company.symbol} — ${company.name || ''}`,
            instrument: company.instrument,
        }));
    }, [companiesRaw]);

    const pricesMap = useMemo(() => {
        const map = {};
        (Array.isArray(pricesRaw) ? pricesRaw : []).forEach((price) => {
            if (price.symbol) map[price.symbol] = price.price;
        });
        return map;
    }, [pricesRaw]);

    const screenerMap = useMemo(() => {
        const map = {};
        (screenerRaw?.stocks || []).forEach((stock) => {
            map[stock.symbol] = stock;
        });
        return map;
    }, [screenerRaw]);

    const selectedCompany = companies.find((company) => company.value === symbol);
    const selectedStock = symbol ? screenerMap[symbol] : null;
    const instrument = selectedCompany?.instrument === 'Open-End Mutual Fund' ? 'mutual_fund' : 'equity';

    const planMutation = useMutation({
        mutationFn: (payload) => calculateTradePlan(payload).then((r) => r.data),
        onSuccess: (data) => setResult(data),
        onError: (err) => {
            setResult(null);
            message.error(err?.response?.data?.detail || 'Failed to calculate trade plan');
        },
    });

    const handleSymbolChange = (value) => {
        setSymbol(value);
        setResult(null);
        const ltp = pricesMap[value];
        if (ltp) setEntryPrice(ltp);
    };

    const applyAtrLevels = () => {
        if (!selectedStock?.atr_14 || !entryPrice) return;
        setStopLoss(Number((entryPrice - (1.5 * selectedStock.atr_14)).toFixed(2)));
        setTargetPrice(Number((entryPrice + (2 * selectedStock.atr_14)).toFixed(2)));
        message.success('Applied ATR-based stop and first target');
    };

    const handleCalculate = () => {
        if (!symbol || !entryPrice || !stopLoss) {
            message.warning('Select a stock, entry, and stop');
            return;
        }
        planMutation.mutate({
            symbol,
            capital_base: capitalBase,
            sleeve_pct: sleevePct,
            risk_pct: riskPct,
            entry_rate: entryPrice,
            stop_loss: stopLoss,
            target_price: targetPrice,
            instrument,
        });
    };

    const sleeveCapital = capitalBase * (sleevePct / 100);

    return (
        <div className="animate-in">
            <div className="stat-card" style={{ padding: 24, marginBottom: 24 }}>
                <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8, color: 'var(--accent-primary)' }}>
                    <AimOutlined /> Swing Trade Risk Planner
                </div>
                <Row gutter={[16, 16]}>
                    <Col xs={24} sm={12} lg={8}>
                        <div style={{ marginBottom: 6, fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Stock</div>
                        <Select
                            showSearch
                            optionFilterProp="label"
                            value={symbol}
                            onChange={handleSymbolChange}
                            options={companies}
                            placeholder="Search stock..."
                            style={{ width: '100%' }}
                            size="large"
                            allowClear
                        />
                    </Col>
                    <Col xs={12} sm={6} lg={4}>
                        <div style={{ marginBottom: 6, fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Capital Base</div>
                        <InputNumber value={capitalBase} onChange={setCapitalBase} min={1000} step={10000} style={{ width: '100%' }} size="large" />
                    </Col>
                    <Col xs={12} sm={6} lg={4}>
                        <div style={{ marginBottom: 6, fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Trading Sleeve</div>
                        <InputNumber value={sleevePct} onChange={setSleevePct} min={1} max={100} step={1} style={{ width: '100%' }} size="large" addonAfter="%" />
                    </Col>
                    <Col xs={12} sm={6} lg={4}>
                        <div style={{ marginBottom: 6, fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Risk / Trade</div>
                        <InputNumber value={riskPct} onChange={setRiskPct} min={0.1} max={10} step={0.1} style={{ width: '100%' }} size="large" addonAfter="%" />
                    </Col>
                    <Col xs={12} sm={6} lg={4}>
                        <div style={{ marginBottom: 6, fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Sleeve Capital</div>
                        <div style={{ fontSize: 18, fontWeight: 800, paddingTop: 6 }}>{formatNPR(sleeveCapital)}</div>
                    </Col>
                </Row>

                <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
                    <Col xs={12} sm={8} lg={6}>
                        <div style={{ marginBottom: 6, fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Entry</div>
                        <InputNumber value={entryPrice} onChange={setEntryPrice} min={0.01} step={0.01} style={{ width: '100%' }} size="large" />
                    </Col>
                    <Col xs={12} sm={8} lg={6}>
                        <div style={{ marginBottom: 6, fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', display: 'flex', justifyContent: 'space-between' }}>
                            <span>Stop Loss</span>
                            {selectedStock?.atr_14 ? (
                                <Tooltip title={`ATR 14 = ${selectedStock.atr_14}. Click to load ATR-based stop/target.`}>
                                    <span style={{ color: 'var(--accent-primary)', cursor: 'pointer', fontSize: 10 }} onClick={applyAtrLevels}>
                                        <ThunderboltOutlined /> Use ATR
                                    </span>
                                </Tooltip>
                            ) : null}
                        </div>
                        <InputNumber value={stopLoss} onChange={setStopLoss} min={0.01} step={0.01} style={{ width: '100%' }} size="large" />
                    </Col>
                    <Col xs={12} sm={8} lg={6}>
                        <div style={{ marginBottom: 6, fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Target</div>
                        <InputNumber value={targetPrice} onChange={setTargetPrice} min={0.01} step={0.01} style={{ width: '100%' }} size="large" />
                    </Col>
                    <Col xs={24} lg={6} style={{ display: 'flex', alignItems: 'flex-end' }}>
                        <Button type="primary" size="large" icon={<CalculatorOutlined />} onClick={handleCalculate} loading={planMutation.isPending} style={{ width: '100%', fontWeight: 700 }}>
                            Calculate Trade Plan
                        </Button>
                    </Col>
                </Row>

                {selectedStock && (
                    <div style={{ marginTop: 14, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <Tag color="cyan">LTP: {formatNPR(pricesMap[symbol])}</Tag>
                        {selectedStock.atr_14 ? <Tag color="blue">ATR: {selectedStock.atr_14}</Tag> : null}
                        {selectedStock.liquidity_grade ? <Tag color="green">Liquidity {selectedStock.liquidity_grade}</Tag> : null}
                        {selectedStock.volatility_risk_tag ? <Tag color="orange">Volatility {selectedStock.volatility_risk_tag}</Tag> : null}
                    </div>
                )}
            </div>

            {planMutation.isPending ? (
                <div style={{ textAlign: 'center', padding: '40px 0' }}><Spin size="large" /></div>
            ) : null}

            {result ? (
                <div className="animate-in">
                    <Row gutter={[16, 16]}>
                        <Col xs={24} md={12}>
                            <div className="stat-card" style={{ padding: 24 }}>
                                <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 16, color: 'var(--accent-primary)' }}>Recommended Position</div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                                    <span style={{ color: 'var(--text-secondary)' }}>Quantity</span>
                                    <span style={{ fontSize: 24, fontWeight: 800 }}>{result.quantity}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                                    <span style={{ color: 'var(--text-secondary)' }}>Total Cost</span>
                                    <span style={{ fontWeight: 700 }}>{formatNPR(result.total_cost)}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                                    <span style={{ color: 'var(--text-secondary)' }}>Net Risk</span>
                                    <span style={{ fontWeight: 700, color: '#ef4444' }}>{formatNPR(result.net_risk)}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span style={{ color: 'var(--text-secondary)' }}>Net Reward</span>
                                    <span style={{ fontWeight: 700, color: '#10b981' }}>{formatNPR(result.net_reward)}</span>
                                </div>
                            </div>
                        </Col>
                        <Col xs={24} md={12}>
                            <div className="stat-card" style={{ padding: 24 }}>
                                <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 16 }}>Trade Constraints</div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                                    <span style={{ color: 'var(--text-secondary)' }}>Sleeve Cap</span>
                                    <span style={{ fontWeight: 700 }}>{formatNPR(result.sleeve_capital)}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                                    <span style={{ color: 'var(--text-secondary)' }}>Max Risk Allowance</span>
                                    <span style={{ fontWeight: 700 }}>{formatNPR(result.max_risk_amount)}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 16px', background: 'var(--bg-tertiary)', borderRadius: 8 }}>
                                    <span style={{ fontWeight: 700 }}>True Net R</span>
                                    <span style={{ fontSize: 18, fontWeight: 800, color: result.true_rr >= 1.5 ? '#10b981' : '#ef4444' }}>{result.true_rr?.toFixed(2) || '—'} : 1</span>
                                </div>
                            </div>
                        </Col>
                    </Row>

                    {!result.capital_within_sleeve && (
                        <Alert style={{ marginTop: 16 }} type="warning" showIcon icon={<WarningOutlined />} message="Trade exceeds the selected trading sleeve." />
                    )}
                    {!result.rr_meets_threshold && (
                        <Alert style={{ marginTop: 16 }} type="warning" showIcon icon={<WarningOutlined />} message="True post-fee R is below 1.5. The trade may not justify the risk." />
                    )}
                </div>
            ) : null}
        </div>
    );
}
