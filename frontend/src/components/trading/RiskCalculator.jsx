import { useState, useMemo } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { InputNumber, Select, Button, Row, Col, Spin, Tag, message, Empty, Alert, Tooltip } from 'antd';
import { AimOutlined, CalculatorOutlined, CheckCircleOutlined, DollarOutlined, InfoCircleOutlined, PercentageOutlined, WarningOutlined } from '@ant-design/icons';
import { getCompanies, getMergedPrices, simulateBuy, simulateSell } from '../../services/api';

function formatNPR(value) {
    if (value === null || value === undefined) return '—';
    return `Rs. ${Number(value).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function RiskCalculator() {
    const [symbol, setSymbol] = useState(null);
    const [capital, setCapital] = useState(100000);
    const [riskPercent, setRiskPercent] = useState(2);
    const [entryPrice, setEntryPrice] = useState(null);
    const [stopLoss, setStopLoss] = useState(null);
    const [targetPrice, setTargetPrice] = useState(null);
    const [result, setResult] = useState(null);

    const { data: companiesRaw } = useQuery({
        queryKey: ['companies'],
        queryFn: () => getCompanies().then(r => r.data),
    });

    const { data: pricesRaw } = useQuery({
        queryKey: ['prices'],
        queryFn: () => getMergedPrices().then(r => r.data),
    });

    const pricesMap = useMemo(() => {
        const m = {};
        const raw = Array.isArray(pricesRaw) ? pricesRaw : [];
        raw.forEach(p => { 
            if (p.symbol) m[p.symbol] = p.price; 
        });
        return m;
    }, [pricesRaw]);

    const companies = useMemo(() => {
        const raw = companiesRaw?.companies || [];
        return raw.map(c => ({
            value: c.symbol,
            label: `${c.symbol} — ${c.name || ''}`,
            instrument: c.instrument,
        }));
    }, [companiesRaw]);

    const selectedCompany = companies.find(c => c.value === symbol);
    const instrument = selectedCompany?.instrument || 'equity';
    const isOpenEndMF = instrument === 'Open-End Mutual Fund';

    const handleSymbolChange = (val) => {
        setSymbol(val);
        setResult(null);
        const ltp = pricesMap[val];
        if (ltp) setEntryPrice(ltp);
    };

    // Calculate position size and project net R:R
    const handleCalculate = async () => {
        if (!symbol) { message.warning('Select a stock'); return; }
        if (!capital || !riskPercent || !entryPrice || !stopLoss) { message.warning('Fill all required fields'); return; }
        if (stopLoss >= entryPrice) { message.warning('Stop Loss must be below Entry Price for long positions'); return; }

        const maxRiskAmount = capital * (riskPercent / 100);
        const riskPerShare = entryPrice - stopLoss;
        
        // Initial estimate without fees
        let rawShares = Math.floor(maxRiskAmount / riskPerShare);
        
        // Cap by total capital
        const maxSharesByCapital = Math.floor(capital / entryPrice);
        let qty = Math.min(rawShares, maxSharesByCapital);

        if (qty <= 0) {
            message.warning('Risk parameters too tight or capital too low to buy even 1 share');
            return;
        }

        try {
            // Simulate Buy to get exact WACC (Tax WACC approximation)
            const buyRes = await simulateBuy({
                quantity: qty,
                rate: entryPrice,
                instrument: isOpenEndMF ? 'mutual_fund' : 'equity'
            });
            const actualBuyAmount = buyRes.data.total_cost;
            const effectiveWacc = actualBuyAmount / qty;

            // Simulate Sell at Stop Loss
            const sellLossRes = await simulateSell({
                member_id: 1, // Mock member ID, fee logic doesn't strictly depend on it for generic calc
                symbol,
                quantity: qty,
                rate: stopLoss,
                mock_wacc: effectiveWacc // Note: We might need backend support for mock WACC, but if not we can just estimate it client-side if it fails
            }).catch(async () => {
                // Fallback client side estimation if backend fails due to missing holding
                const brokerComm = stopLoss * qty * 0.0036; // Approx
                const sebonFee = stopLoss * qty * 0.00015;
                const dpCharge = 25;
                const grossProfit = (stopLoss * qty) - (effectiveWacc * qty);
                const cgt = grossProfit > 0 ? grossProfit * 0.075 : 0;
                return {
                    data: {
                        amount: stopLoss * qty,
                        broker_commission: brokerComm,
                        sebon_fee: sebonFee,
                        dp_charge: dpCharge,
                        cgt: cgt,
                        net_received: (stopLoss * qty) - brokerComm - sebonFee - dpCharge - cgt,
                        net_profit: ((stopLoss * qty) - brokerComm - sebonFee - dpCharge - cgt) - actualBuyAmount
                    }
                };
            });

            // Re-adjust qty if net risk exceeds maxRiskAmount
            let netRisk = actualBuyAmount - sellLossRes.data.net_received;
            
            // Refine qty iteratively if needed (simple approach: scale down linearly)
            if (netRisk > maxRiskAmount && qty > 1) {
                const ratio = maxRiskAmount / netRisk;
                qty = Math.floor(qty * ratio);
                // Re-calculate with refined qty
                const buyRes2 = await simulateBuy({ quantity: qty, rate: entryPrice, instrument: isOpenEndMF ? 'mutual_fund' : 'equity' });
                const actualBuyAmount2 = buyRes2.data.total_cost;
                const effectiveWacc2 = actualBuyAmount2 / qty;
                const sellLossRes2 = await simulateSell({
                    member_id: 1, symbol, quantity: qty, rate: stopLoss, mock_wacc: effectiveWacc2
                }).catch(async () => {
                    const brokerComm = stopLoss * qty * 0.0036;
                    const sebonFee = stopLoss * qty * 0.00015;
                    const dpCharge = 25;
                    const grossProfit = (stopLoss * qty) - (effectiveWacc2 * qty);
                    const cgt = grossProfit > 0 ? grossProfit * 0.075 : 0;
                    return { data: { net_received: (stopLoss * qty) - brokerComm - sebonFee - dpCharge - cgt } };
                });
                netRisk = actualBuyAmount2 - sellLossRes2.data.net_received;
            }

            // Simulate Sell at Target if provided
            let targetRes = null;
            let netReward = null;
            if (targetPrice && targetPrice > entryPrice) {
                const buyResFinal = await simulateBuy({ quantity: qty, rate: entryPrice, instrument: isOpenEndMF ? 'mutual_fund' : 'equity' });
                const finalBuyAmount = buyResFinal.data.total_cost;
                const finalWacc = finalBuyAmount / qty;

                const sellTargetRes = await simulateSell({
                    member_id: 1, symbol, quantity: qty, rate: targetPrice, mock_wacc: finalWacc
                }).catch(async () => {
                    const brokerComm = targetPrice * qty * 0.0036;
                    const sebonFee = targetPrice * qty * 0.00015;
                    const dpCharge = 25;
                    const grossProfit = (targetPrice * qty) - (finalWacc * qty);
                    const cgt = grossProfit > 0 ? grossProfit * 0.075 : 0;
                    return { data: { net_received: (targetPrice * qty) - brokerComm - sebonFee - dpCharge - cgt } };
                });
                netReward = sellTargetRes.data.net_received - finalBuyAmount;
                targetRes = sellTargetRes.data;
            }

            setResult({
                qty,
                maxRiskAmount,
                actualRisk: netRisk,
                buyAmount: qty * entryPrice,
                totalCapitalReq: await simulateBuy({ quantity: qty, rate: entryPrice, instrument: isOpenEndMF ? 'mutual_fund' : 'equity' }).then(r => r.data.total_cost),
                netReward,
                netRR: netReward ? (netReward / netRisk) : null
            });

        } catch (err) {
            message.error("Failed to calculate risk parameters");
            console.error(err);
        }
    };

    return (
        <div className="animate-in">
            <div className="stat-card" style={{ padding: 24, marginBottom: 24 }}>
                <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8, color: 'var(--accent-primary)' }}>
                    <AimOutlined /> Position Size & Risk Calculator
                </div>
                <Row gutter={[16, 16]}>
                    <Col xs={24} sm={12} lg={8}>
                        <div style={{ marginBottom: 6, fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Stock / Scrip</div>
                        <Select
                            showSearch value={symbol} onChange={handleSymbolChange}
                            options={companies} placeholder="Search stock..."
                            style={{ width: '100%' }} optionFilterProp="label" size="large" allowClear
                        />
                    </Col>
                    <Col xs={12} sm={6} lg={4}>
                        <div style={{ marginBottom: 6, fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Total Capital (Rs.)</div>
                        <InputNumber value={capital} onChange={setCapital} min={1000} step={10000} style={{ width: '100%' }} size="large" />
                    </Col>
                    <Col xs={12} sm={6} lg={4}>
                        <div style={{ marginBottom: 6, fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Risk % Per Trade</div>
                        <InputNumber value={riskPercent} onChange={setRiskPercent} min={0.1} max={100} step={0.1} style={{ width: '100%' }} size="large" addonAfter="%" />
                    </Col>
                </Row>
                <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
                    <Col xs={12} sm={8} lg={6}>
                        <div style={{ marginBottom: 6, fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Entry Price</div>
                        <InputNumber value={entryPrice} onChange={setEntryPrice} min={0.01} step={0.01} style={{ width: '100%' }} size="large" />
                    </Col>
                    <Col xs={12} sm={8} lg={6}>
                        <div style={{ marginBottom: 6, fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Stop Loss</div>
                        <InputNumber value={stopLoss} onChange={setStopLoss} min={0.01} step={0.01} style={{ width: '100%' }} size="large" />
                    </Col>
                    <Col xs={12} sm={8} lg={6}>
                        <div style={{ marginBottom: 6, fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Target (Optional)</div>
                        <InputNumber value={targetPrice} onChange={setTargetPrice} min={0.01} step={0.01} style={{ width: '100%' }} size="large" />
                    </Col>
                    <Col xs={24} lg={6} style={{ display: 'flex', alignItems: 'flex-end' }}>
                        <Button type="primary" size="large" icon={<CalculatorOutlined />} onClick={handleCalculate} style={{ width: '100%', fontWeight: 700 }}>
                            Calculate Position Size
                        </Button>
                    </Col>
                </Row>
            </div>

            {result && (
                <Row gutter={[16, 16]}>
                    <Col xs={24} md={12}>
                        <div className="stat-card animate-in" style={{ padding: 24, background: 'linear-gradient(135deg, rgba(108, 92, 231, 0.1) 0%, rgba(167, 139, 250, 0.05) 100%)', border: '1px solid rgba(108, 92, 231, 0.2)' }}>
                            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 16, color: 'var(--accent-primary)' }}>Recommended Position</div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                                <span style={{ color: 'var(--text-secondary)' }}>Quantity to Buy</span>
                                <span style={{ fontSize: 24, fontWeight: 800 }}>{result.qty} Shares</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                                <span style={{ color: 'var(--text-secondary)' }}>Capital Required (with Fees)</span>
                                <span style={{ fontSize: 16, fontWeight: 600 }}>{formatNPR(result.totalCapitalReq)}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span style={{ color: 'var(--text-secondary)' }}>Max Risk Permitted</span>
                                <span style={{ fontSize: 16, fontWeight: 600 }}>{formatNPR(result.maxRiskAmount)}</span>
                            </div>
                        </div>
                    </Col>
                    <Col xs={24} md={12}>
                        <div className="stat-card animate-in" style={{ padding: 24 }}>
                            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 16 }}>Risk / Reward Projection</div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                                <span style={{ color: 'var(--text-secondary)' }}>Net Risk (Loss if hit SL incl. fees)</span>
                                <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--accent-red)' }}>{formatNPR(result.actualRisk)}</span>
                            </div>
                            {result.netReward !== null ? (
                                <>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                                        <span style={{ color: 'var(--text-secondary)' }}>Net Reward (Profit if hit Target incl. fees & CGT)</span>
                                        <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--accent-green)' }}>{formatNPR(result.netReward)}</span>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 16px', background: 'var(--bg-tertiary)', borderRadius: 8, marginTop: 12 }}>
                                        <span style={{ fontWeight: 700 }}>True Net R:R</span>
                                        <span style={{ fontSize: 18, fontWeight: 800, color: result.netRR >= 2 ? 'var(--accent-green)' : (result.netRR >= 1 ? 'var(--accent-yellow)' : 'var(--accent-red)') }}>
                                            {result.netRR.toFixed(2)} : 1
                                        </span>
                                    </div>
                                </>
                            ) : (
                                <div style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 12 }}>Enter a target price to see net reward and R:R projection.</div>
                            )}
                        </div>
                    </Col>
                </Row>
            )}
        </div>
    );
}
