import { useState, useMemo } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Tabs, InputNumber, Select, Button, Spin, Row, Col, Tag, message, Empty, Tooltip } from 'antd';
import {
    ShoppingCartOutlined,
    DollarOutlined,
    ArrowUpOutlined,
    ArrowDownOutlined,
    CalculatorOutlined,
    InfoCircleOutlined,
    SwapOutlined,
    ClockCircleOutlined,
    PercentageOutlined,
    CheckCircleOutlined,
    WarningOutlined,
} from '@ant-design/icons';
import { getCompanies, getMembers, getHoldings, getMergedPrices, simulateBuy, simulateSell } from '../services/api';

function formatNPR(value) {
    if (value === null || value === undefined) return '—';
    return `Rs. ${Number(value).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ─────────────────────────────────────────────────────────────
// BUY CALCULATOR
// ─────────────────────────────────────────────────────────────
export function BuyCalculator() {
    const [symbol, setSymbol] = useState(null);
    const [quantity, setQuantity] = useState(null);
    const [rate, setRate] = useState(null);
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

    const mutation = useMutation({
        mutationFn: (data) => simulateBuy(data).then(r => r.data),
        onSuccess: (data) => setResult(data),
        onError: (err) => message.error(err?.response?.data?.detail || 'Calculation failed'),
    });

    const handleCalculate = () => {
        if (!quantity || !rate) { message.warning('Enter quantity and rate'); return; }
        mutation.mutate({
            quantity,
            rate,
            instrument: isOpenEndMF ? 'mutual_fund' : 'equity',
        });
    };

    // Auto-fill rate when symbol is selected
    const handleSymbolChange = (val) => {
        setSymbol(val);
        setResult(null);
        const ltp = pricesMap[val];
        if (ltp) setRate(ltp);
    };

    const amount = (quantity && rate) ? quantity * rate : 0;

    return (
        <div>
            {/* Inputs */}
            <div className="stat-card" style={{ padding: 24, marginBottom: 24 }}>
                <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8, color: 'var(--accent-green)' }}>
                    <ShoppingCartOutlined /> Buy Order Simulator
                </div>
                <Row gutter={[16, 16]}>
                    <Col xs={24} sm={12} lg={8}>
                        <div style={{ marginBottom: 6, fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Stock / Scrip</div>
                        <Select
                            showSearch
                            value={symbol}
                            onChange={handleSymbolChange}
                            options={companies}
                            placeholder="Search stock..."
                            style={{ width: '100%' }}
                            optionFilterProp="label"
                            filterOption={(input, option) => (option?.label ?? '').toLowerCase().includes(input.toLowerCase())}
                            size="large"
                            allowClear
                        />
                    </Col>
                    <Col xs={12} sm={6} lg={4}>
                        <div style={{ marginBottom: 6, fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Quantity</div>
                        <InputNumber
                            value={quantity}
                            onChange={v => { setQuantity(v); setResult(null); }}
                            min={1}
                            style={{ width: '100%' }}
                            placeholder="Qty"
                            size="large"
                        />
                    </Col>
                    <Col xs={12} sm={6} lg={4}>
                        <div style={{ marginBottom: 6, fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Rate (Rs.)</div>
                        <InputNumber
                            value={rate}
                            onChange={v => { setRate(v); setResult(null); }}
                            min={0.01}
                            step={0.01}
                            style={{ width: '100%' }}
                            placeholder="Rate"
                            size="large"
                        />
                    </Col>
                    <Col xs={24} sm={12} lg={4}>
                        <div style={{ marginBottom: 6, fontSize: 12, color: 'transparent' }}>_</div>
                        <Button
                            type="primary"
                            size="large"
                            icon={<CalculatorOutlined />}
                            onClick={handleCalculate}
                            loading={mutation.isPending}
                            style={{ width: '100%', background: 'var(--gradient-green)', border: 'none', fontWeight: 700 }}
                        >
                            Calculate
                        </Button>
                    </Col>
                    <Col xs={24} lg={4}>
                        <div style={{ marginBottom: 6, fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Trade Amount</div>
                        <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-primary)', padding: '4px 0' }}>
                            {amount > 0 ? formatNPR(amount) : '—'}
                        </div>
                    </Col>
                </Row>
                {symbol && (
                    <div style={{ marginTop: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
                        <Tag color={isOpenEndMF ? 'blue' : 'green'}>{isOpenEndMF ? 'Mutual Fund' : 'Equity'}</Tag>
                        {pricesMap[symbol] && <Tag>LTP: Rs. {pricesMap[symbol]}</Tag>}
                    </div>
                )}
            </div>

            {/* Results */}
            {result && <BuyResult result={result} />}
        </div>
    );
}

function BuyResult({ result }) {
    const totalPayable = result.total_cost;

    return (
        <div className="animate-in">
            <div className="stat-card" style={{ padding: 0, overflow: 'hidden' }}>
                {/* Header */}
                <div style={{
                    padding: '16px 24px',
                    background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.12) 0%, rgba(52, 211, 153, 0.06) 100%)',
                    borderBottom: '1px solid var(--border-color)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <CheckCircleOutlined style={{ color: 'var(--accent-green)', fontSize: 18 }} />
                        <span style={{ fontWeight: 700, fontSize: 15 }}>Buy Order Breakdown</span>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        {result.buy_qty} shares × Rs. {result.buy_rate}
                    </div>
                </div>

                {/* Fee Lines */}
                <div style={{ padding: '20px 24px' }}>
                    <FeeRow label="Share Amount" value={result.amount} />
                    <FeeRow label="Broker Commission" value={result.broker_commission} icon={<PercentageOutlined />} color="var(--accent-yellow)" />
                    <FeeRow label="SEBON Fee" value={result.sebon_fee} icon={<PercentageOutlined />} color="var(--accent-yellow)" />
                    <FeeRow label="DP Charge" value={result.dp_charge} icon={<DollarOutlined />} color="var(--accent-yellow)" />
                    <FeeRow label="Name Transfer Fee" value={result.name_transfer_fee} icon={<DollarOutlined />} color="var(--accent-yellow)" />

                    {/* Divider */}
                    <div style={{ height: 1, background: 'var(--border-color)', margin: '16px 0' }} />

                    {/* Total */}
                    <div style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '12px 16px', borderRadius: 8,
                        background: 'rgba(239, 68, 68, 0.08)',
                    }}>
                        <span style={{ fontWeight: 800, fontSize: 15, color: 'var(--accent-red)' }}>
                            Total Payable
                        </span>
                        <span style={{ fontWeight: 800, fontSize: 20, color: 'var(--accent-red)' }}>
                            {formatNPR(totalPayable)}
                        </span>
                    </div>

                    {/* Effective Cost Per Share */}
                    <div style={{ marginTop: 12, textAlign: 'center', fontSize: 12, color: 'var(--text-muted)' }}>
                        Effective cost per share: <strong style={{ color: 'var(--text-primary)' }}>
                            Rs. {result.buy_qty > 0 ? (totalPayable / result.buy_qty).toFixed(2) : '—'}
                        </strong>
                    </div>
                </div>
            </div>
        </div>
    );
}


// ─────────────────────────────────────────────────────────────
// SELL CALCULATOR
// ─────────────────────────────────────────────────────────────
export function SellCalculator() {
    const [memberId, setMemberId] = useState(null);
    const [symbol, setSymbol] = useState(null);
    const [quantity, setQuantity] = useState(null);
    const [rate, setRate] = useState(null);
    const [result, setResult] = useState(null);

    const { data: membersRaw } = useQuery({
        queryKey: ['members'],
        queryFn: () => getMembers().then(r => r.data),
    });

    const { data: holdingsRaw } = useQuery({
        queryKey: ['holdings-for-calc', memberId],
        queryFn: () => getHoldings(memberId ? { member_id: memberId } : {}).then(r => r.data),
        enabled: true,
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

    const members = useMemo(() =>
        (membersRaw || []).map(m => ({ value: m.id, label: m.name })),
        [membersRaw]
    );

    // Filter holdings based on member
    const filteredHoldings = useMemo(() => {
        let hldings = holdingsRaw || [];
        if (memberId) hldings = hldings.filter(h => h.member_id === memberId);
        return hldings;
    }, [holdingsRaw, memberId]);

    // Unique symbols from holdings
    const holdingOptions = useMemo(() => {
        const seen = new Set();
        return filteredHoldings
            .filter(h => {
                if (seen.has(h.symbol)) return false;
                seen.add(h.symbol);
                return true;
            })
            .map(h => ({
                value: h.symbol,
                label: `${h.symbol} — ${h.current_qty} units @ WACC ${h.wacc?.toFixed(2)}`,
                qty: h.current_qty,
                wacc: h.wacc,
                member_id: h.member_id,
            }));
    }, [filteredHoldings]);

    const selectedHolding = filteredHoldings.find(h => h.symbol === symbol && (!memberId || h.member_id === memberId));

    const mutation = useMutation({
        mutationFn: (data) => simulateSell(data).then(r => r.data),
        onSuccess: (data) => setResult(data),
        onError: (err) => message.error(err?.response?.data?.detail || 'Calculation failed'),
    });

    const handleSymbolChange = (val) => {
        setSymbol(val);
        setResult(null);
        const ltp = pricesMap[val];
        if (ltp) setRate(ltp);

        // Auto-fill member if unset and there's just one holding for this symbol
        if (!memberId) {
            const matching = filteredHoldings.filter(h => h.symbol === val);
            if (matching.length === 1) setMemberId(matching[0].member_id);
        }
    };

    const handleMemberChange = (val) => {
        setMemberId(val);
        setSymbol(null);
        setQuantity(null);
        setResult(null);
    };

    const handleCalculate = () => {
        const effectiveMemberId = memberId || selectedHolding?.member_id;
        if (!effectiveMemberId) { message.warning('Select a member'); return; }
        if (!symbol) { message.warning('Select a stock'); return; }
        if (!quantity || !rate) { message.warning('Enter quantity and rate'); return; }
        mutation.mutate({
            member_id: effectiveMemberId,
            symbol,
            quantity,
            rate,
        });
    };

    const amount = (quantity && rate) ? quantity * rate : 0;

    return (
        <div>
            <div className="stat-card" style={{ padding: 24, marginBottom: 24 }}>
                <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8, color: 'var(--accent-red)' }}>
                    <SwapOutlined /> Sell Order Simulator
                </div>
                <Row gutter={[16, 16]}>
                    <Col xs={24} sm={12} lg={5}>
                        <div style={{ marginBottom: 6, fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Member</div>
                        <Select
                            value={memberId}
                            showSearch
                            optionFilterProp="label"
                            onChange={handleMemberChange}
                            options={members}
                            placeholder="All Members"
                            style={{ width: '100%' }}
                            size="large"
                            allowClear
                        />
                    </Col>
                    <Col xs={24} sm={12} lg={7}>
                        <div style={{ marginBottom: 6, fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Portfolio Stock</div>
                        <Select
                            showSearch
                            value={symbol}
                            onChange={handleSymbolChange}
                            options={holdingOptions}
                            placeholder="Select from portfolio..."
                            style={{ width: '100%' }}
                            optionFilterProp="label"
                            filterOption={(input, option) => (option?.label ?? '').toLowerCase().includes(input.toLowerCase())}
                            size="large"
                            allowClear
                            notFoundContent={<Empty description="No holdings found" />}
                        />
                    </Col>
                    <Col xs={12} sm={6} lg={3}>
                        <div style={{ marginBottom: 6, fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                            Quantity
                            {selectedHolding && (
                                <Tooltip title="Click to sell all">
                                    <span
                                        style={{ marginLeft: 6, color: 'var(--accent-primary)', cursor: 'pointer', fontSize: 11 }}
                                        onClick={() => { setQuantity(selectedHolding.current_qty); setResult(null); }}
                                    >
                                        (Max: {selectedHolding.current_qty})
                                    </span>
                                </Tooltip>
                            )}
                        </div>
                        <InputNumber
                            value={quantity}
                            onChange={v => { setQuantity(v); setResult(null); }}
                            min={1}
                            max={selectedHolding?.current_qty || 999999}
                            style={{ width: '100%' }}
                            placeholder="Qty"
                            size="large"
                        />
                    </Col>
                    <Col xs={12} sm={6} lg={3}>
                        <div style={{ marginBottom: 6, fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Rate (Rs.)</div>
                        <InputNumber
                            value={rate}
                            onChange={v => { setRate(v); setResult(null); }}
                            min={0.01}
                            step={0.01}
                            style={{ width: '100%' }}
                            placeholder="Rate"
                            size="large"
                        />
                    </Col>
                    <Col xs={12} sm={6} lg={3}>
                        <div style={{ marginBottom: 6, fontSize: 12, color: 'transparent' }}>_</div>
                        <Button
                            type="primary"
                            size="large"
                            icon={<CalculatorOutlined />}
                            onClick={handleCalculate}
                            loading={mutation.isPending}
                            style={{ width: '100%', background: 'var(--gradient-red)', border: 'none', fontWeight: 700 }}
                            danger
                        >
                            Calculate
                        </Button>
                    </Col>
                    <Col xs={12} sm={6} lg={3}>
                        <div style={{ marginBottom: 6, fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Trade Amount</div>
                        <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-primary)', padding: '4px 0' }}>
                            {amount > 0 ? formatNPR(amount) : '—'}
                        </div>
                    </Col>
                </Row>
                {selectedHolding && (
                    <div style={{ marginTop: 12, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        <Tag color="blue">WACC: Rs. {selectedHolding.wacc?.toFixed(2)}</Tag>
                        <Tag color="purple">Tax WACC: Rs. {selectedHolding.tax_wacc?.toFixed(2)}</Tag>
                        <Tag>Qty: {selectedHolding.current_qty}</Tag>
                        {pricesMap[symbol] && <Tag color="cyan">LTP: Rs. {pricesMap[symbol]}</Tag>}
                    </div>
                )}
            </div>

            {/* Results */}
            {result && <SellResult result={result} />}
        </div>
    );
}

function SellResult({ result }) {
    const isProfitable = result.net_profit > 0;
    const hasCGT = result.cgt > 0;

    return (
        <div className="animate-in">
            <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
                {/* Quick Stats Row */}
                <Col xs={12} sm={6}>
                    <div className={`stat-card ${isProfitable ? 'green' : 'red'}`} style={{ padding: 16, textAlign: 'center' }}>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Gross P&L</div>
                        <div style={{ fontSize: 22, fontWeight: 800, color: isProfitable ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                            {formatNPR(result.gross_profit)}
                        </div>
                    </div>
                </Col>
                <Col xs={12} sm={6}>
                    <div className={`stat-card ${result.net_received > result.sell_qty * result.wacc ? 'green' : 'red'}`} style={{ padding: 16, textAlign: 'center' }}>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Net Receivable</div>
                        <div style={{ fontSize: 22, fontWeight: 800, color: result.net_received > 0 ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                            {formatNPR(result.net_received)}
                        </div>
                    </div>
                </Col>
                <Col xs={12} sm={6}>
                    <div className="stat-card" style={{ padding: 16, textAlign: 'center' }}>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Total Deductions</div>
                        <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--accent-yellow)' }}>
                            {formatNPR(result.broker_commission + result.sebon_fee + result.dp_charge + result.cgt)}
                        </div>
                    </div>
                </Col>
                <Col xs={12} sm={6}>
                    <div className="stat-card" style={{ padding: 16, textAlign: 'center' }}>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Capital Gains Tax</div>
                        <div style={{ fontSize: 22, fontWeight: 800, color: hasCGT ? 'var(--accent-red)' : 'var(--accent-green)' }}>
                            {formatNPR(result.cgt)}
                        </div>
                    </div>
                </Col>
            </Row>

            <div className="stat-card" style={{ padding: 0, overflow: 'hidden' }}>
                {/* Header */}
                <div style={{
                    padding: '16px 24px',
                    background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.12) 0%, rgba(248, 113, 113, 0.06) 100%)',
                    borderBottom: '1px solid var(--border-color)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <SwapOutlined style={{ color: 'var(--accent-red)', fontSize: 18 }} />
                        <span style={{ fontWeight: 700, fontSize: 15 }}>Sell Order Breakdown</span>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        {result.sell_qty} shares × Rs. {result.sell_rate}
                    </div>
                </div>

                {/* Fee Lines */}
                <div style={{ padding: '20px 24px' }}>
                    <FeeRow label="Sell Amount (Gross)" value={result.amount} />
                    <FeeRow label="WACC (Tax Basis)" value={result.wacc} isRate />
                    <FeeRow label="Cost Basis (WACC × Qty)" value={result.wacc * result.sell_qty} />

                    <div style={{ height: 1, background: 'var(--border-color)', margin: '14px 0' }} />

                    <FeeRow label="Broker Commission" value={result.broker_commission} icon={<PercentageOutlined />} color="var(--accent-yellow)" subtract />
                    <FeeRow label="SEBON Fee" value={result.sebon_fee} icon={<PercentageOutlined />} color="var(--accent-yellow)" subtract />
                    <FeeRow label="DP Charge" value={result.dp_charge} icon={<DollarOutlined />} color="var(--accent-yellow)" subtract />

                    {hasCGT && (
                        <>
                            <div style={{ height: 1, background: 'var(--border-color)', margin: '14px 0' }} />
                            <FeeRow label="Capital Gains Tax" value={result.cgt} icon={<WarningOutlined />} color="var(--accent-red)" subtract />
                        </>
                    )}

                    <div style={{ height: 1, background: 'var(--border-color)', margin: '16px 0' }} />

                    {/* Net Receivable */}
                    <div style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '12px 16px', borderRadius: 8,
                        background: 'rgba(16, 185, 129, 0.08)',
                    }}>
                        <span style={{ fontWeight: 800, fontSize: 15, color: 'var(--accent-green)' }}>
                            Net Receivable
                        </span>
                        <span style={{ fontWeight: 800, fontSize: 20, color: 'var(--accent-green)' }}>
                            {formatNPR(result.net_received)}
                        </span>
                    </div>

                    <div style={{ marginTop: 12, textAlign: 'center', fontSize: 12, color: 'var(--text-muted)' }}>
                        Effective sell rate per share: <strong style={{ color: 'var(--text-primary)' }}>
                            Rs. {result.sell_qty > 0 ? (result.net_received / result.sell_qty).toFixed(2) : '—'}
                        </strong>
                    </div>
                </div>
            </div>

            {/* CGT Breakdown (FIFO) */}
            {result.cgt_breakdown && result.cgt_breakdown.length > 0 && (
                <div className="stat-card animate-in" style={{ padding: 0, overflow: 'hidden', marginTop: 16 }}>
                    <div style={{
                        padding: '14px 24px',
                        borderBottom: '1px solid var(--border-color)',
                        background: 'rgba(251, 191, 36, 0.06)',
                        display: 'flex', alignItems: 'center', gap: 8,
                    }}>
                        <ClockCircleOutlined style={{ color: 'var(--accent-yellow)' }} />
                        <span style={{ fontWeight: 700, fontSize: 14 }}>CGT — FIFO Lot Breakdown</span>
                        <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 'auto' }}>
                            Based on purchase date → holding period
                        </span>
                    </div>
                    <div style={{ padding: '0', overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                                    {['Lot', 'Buy Date', 'Qty', 'Holding Days', 'Profit Share', 'CGT Rate', 'CGT Amount'].map(h => (
                                        <th key={h} style={{
                                            padding: '10px 14px', textAlign: h === 'Lot' ? 'center' : 'right',
                                            fontSize: 11, fontWeight: 700, color: 'var(--text-muted)',
                                            textTransform: 'uppercase', letterSpacing: '0.5px',
                                            background: 'var(--bg-tertiary)',
                                        }}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {result.cgt_breakdown.map((lot, i) => {
                                    const isLongTerm = lot.holding_days >= 365;
                                    return (
                                        <tr key={i} style={{ borderBottom: '1px solid var(--border-color)' }}>
                                            <td style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 600 }}>#{i + 1}</td>
                                            <td style={{ padding: '10px 14px', textAlign: 'right' }}>{lot.buy_date}</td>
                                            <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 600 }}>{lot.qty}</td>
                                            <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                                                <span style={{ fontWeight: 600 }}>{lot.holding_days}d</span>
                                                <Tag color={isLongTerm ? 'green' : 'orange'} style={{ marginLeft: 6, fontSize: 10 }}>
                                                    {isLongTerm ? 'Long' : 'Short'}
                                                </Tag>
                                            </td>
                                            <td style={{ padding: '10px 14px', textAlign: 'right' }}>{formatNPR(lot.profit_share)}</td>
                                            <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, color: isLongTerm ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                                                {lot.cgt_rate}%
                                            </td>
                                            <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700 }}>{formatNPR(lot.cgt_amount)}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}


// ─────────────────────────────────────────────────────────────
// SHARED COMPONENTS
// ─────────────────────────────────────────────────────────────
function FeeRow({ label, value, icon, color, subtract, isRate }) {
    return (
        <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '8px 0',
        }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: color || 'var(--text-secondary)' }}>
                {icon}
                {label}
            </span>
            <span style={{ fontWeight: 600, fontSize: 14, color: color || 'var(--text-primary)' }}>
                {subtract && '− '}
                {isRate ? `Rs. ${Number(value).toFixed(2)}` : formatNPR(value)}
            </span>
        </div>
    );
}


// ─────────────────────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────────────────────
function Calculator() {
    return (
        <div style={{ padding: '32px 28px', maxWidth: 1200, margin: '0 auto' }}>
            <div style={{ marginBottom: 28 }}>
                <h1 style={{
                    fontSize: 26, fontWeight: 800, marginBottom: 4,
                    background: 'var(--gradient-primary)',
                    WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                }}>
                    <CalculatorOutlined style={{ WebkitTextFillColor: 'var(--accent-primary)', marginRight: 10 }} />
                    Buy / Sell Calculator
                </h1>
                <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                    Simulate buy &amp; sell orders with exact SEBON fee breakdown, broker commission, DP charges, and FIFO-based CGT calculation.
                </p>
            </div>

            <Tabs
                defaultActiveKey="buy"
                type="card"
                items={[
                    {
                        key: 'buy',
                        label: (
                            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <ArrowUpOutlined style={{ color: '#34d399' }} />
                                Buy Calculator
                            </span>
                        ),
                        children: <BuyCalculator />,
                    },
                    {
                        key: 'sell',
                        label: (
                            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <ArrowDownOutlined style={{ color: '#f87171' }} />
                                Sell Calculator
                            </span>
                        ),
                        children: <SellCalculator />,
                    },
                ]}
            />
        </div>
    );
}

export default Calculator;
