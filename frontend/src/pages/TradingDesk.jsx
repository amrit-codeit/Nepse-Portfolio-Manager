import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
    Alert, Button, Col, Empty, Form, Input, InputNumber, Modal, Popconfirm, Progress,
    Row, Select, Space, Spin, Statistic, Table, Tabs, Tag, Tooltip, message
} from 'antd';
import {
    AimOutlined, CalculatorOutlined, CheckCircleOutlined, DeleteOutlined, EditOutlined,
    EyeOutlined, FilterOutlined, HistoryOutlined, LineChartOutlined, PlusOutlined,
    RobotOutlined, ThunderboltOutlined, TrophyOutlined, WarningOutlined
} from '@ant-design/icons';
import {
    closeTradeSetup, createTradeSetup, deleteTradeSetup, getCompanies, getExtendedTechnicals,
    getMembers, getMergedPrices, getTradeJournal, getTradeJournalStats, getTradeSetups,
    getTradeSignals, updateTradeSetup
} from '../services/api';
import StrategyTester from '../components/insights/StrategyTester';
import RiskCalculator from '../components/trading/RiskCalculator';
import TechnicalScreener from '../components/trading/TechnicalScreener';
import StockAnalysis from '../components/trading/StockAnalysis';
import { BuyCalculator, SellCalculator } from './Calculator';

function formatNPR(value, decimals = 2) {
    if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
    return `Rs. ${Number(value).toLocaleString('en-IN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
}

function formatPercent(value, decimals = 2) {
    if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
    return `${Number(value).toFixed(decimals)}%`;
}

function getSignalTag(signal, stale) {
    if (stale) return <Tag color="orange">INVALID DATA</Tag>;
    if (signal === 'HOLD') return <Tag color="green">HOLD</Tag>;
    if (signal === 'TIGHTEN_STOP') return <Tag color="gold">TIGHTEN STOP</Tag>;
    if (signal === 'TAKE_PROFIT') return <Tag color="blue">TAKE PROFIT</Tag>;
    if (signal === 'EXIT') return <Tag color="red">EXIT</Tag>;
    return <Tag>{signal}</Tag>;
}

function QueryInvalidator(queryClient) {
    return () => {
        queryClient.invalidateQueries({ queryKey: ['trade-signals'] });
        queryClient.invalidateQueries({ queryKey: ['trade-setups'] });
        queryClient.invalidateQueries({ queryKey: ['trade-journal'] });
        queryClient.invalidateQueries({ queryKey: ['trade-journal-stats'] });
    };
}

function ActivePositionsTab() {
    const queryClient = useQueryClient();
    const invalidateAll = QueryInvalidator(queryClient);
    const [closeForm] = Form.useForm();
    const [closingRecord, setClosingRecord] = useState(null);

    const { data: signals, isLoading } = useQuery({
        queryKey: ['trade-signals'],
        queryFn: () => getTradeSignals().then((r) => r.data),
        refetchInterval: 30000,
    });

    const deleteMut = useMutation({
        mutationFn: (id) => deleteTradeSetup(id),
        onSuccess: () => {
            message.success('Position removed');
            invalidateAll();
        },
    });

    const closeMut = useMutation({
        mutationFn: ({ id, payload }) => closeTradeSetup(id, payload),
        onSuccess: () => {
            message.success('Position closed and journaled');
            setClosingRecord(null);
            closeForm.resetFields();
            invalidateAll();
        },
        onError: (err) => message.error(err?.response?.data?.detail || 'Failed to close position'),
    });

    const openCloseModal = (record) => {
        setClosingRecord(record);
        closeForm.setFieldsValue({
            sell_price: record.ltp,
            exit_reason: record.signal === 'EXIT' ? 'Stop Loss Hit' : record.signal === 'TAKE_PROFIT' ? 'Booked Profit' : 'Manual Close',
            setup_grade: record.setup_quality,
            rule_followed: true,
        });
    };

    const columns = [
        {
            title: 'Symbol',
            dataIndex: 'symbol',
            width: 110,
            render: (value, record) => (
                <div>
                    <div style={{ fontWeight: 700, color: 'var(--accent-primary)' }}>{value}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{record.strategy_type || 'Swing trade'}</div>
                </div>
            ),
        },
        { title: 'Entry', dataIndex: 'entry_price', width: 100, align: 'right', render: (v) => formatNPR(v) },
        {
            title: 'LTP',
            dataIndex: 'ltp',
            width: 110,
            align: 'right',
            render: (v, r) => (
                <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 700 }}>{formatNPR(v)}</div>
                    <div style={{ fontSize: 11, color: r.stale_price ? '#f59e0b' : 'var(--text-muted)' }}>
                        {r.price_timestamp ? new Date(r.price_timestamp).toLocaleString() : 'No timestamp'}
                    </div>
                </div>
            ),
        },
        {
            title: 'Stops / Targets',
            width: 170,
            render: (_, r) => (
                <div>
                    <div style={{ color: '#ef4444' }}>Stop: {formatNPR(r.trailing_stop || r.current_stop_loss || r.stop_loss)}</div>
                    <div style={{ color: '#10b981' }}>T1: {formatNPR(r.target_1 || r.target_price)}</div>
                </div>
            ),
        },
        { title: 'Qty', dataIndex: 'allocated_qty', width: 75, align: 'right' },
        {
            title: 'P&L',
            width: 120,
            align: 'right',
            render: (_, r) => (
                <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 700, color: (r.live_pnl || 0) >= 0 ? '#10b981' : '#ef4444' }}>{formatNPR(r.live_pnl)}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{formatPercent(r.live_pnl_pct)}</div>
                </div>
            ),
        },
        {
            title: 'Progress',
            width: 140,
            render: (_, r) => (
                <Tooltip title={`To stop: ${formatPercent(r.distance_to_stop_pct)} | To target: ${formatPercent(r.distance_to_target_pct)}`}>
                    <div>
                        <Progress percent={Math.max(0, Math.min(Number(r.target_progress_pct || 0), 100))} size="small" showInfo={false} />
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                            Risk: {formatNPR(r.risk_amount)} | At risk: {formatNPR(r.capital_at_risk)}
                        </div>
                    </div>
                </Tooltip>
            ),
        },
        {
            title: 'Signal',
            width: 180,
            render: (_, r) => (
                <div>
                    {getSignalTag(r.signal, r.stale_price)}
                    <div style={{ marginTop: 6, fontSize: 11, color: 'var(--text-muted)' }}>{r.signal_reason}</div>
                </div>
            ),
        },
        {
            title: 'Actions',
            width: 130,
            render: (_, r) => (
                <Space size={4}>
                    <Button size="small" type="primary" ghost icon={<CheckCircleOutlined />} onClick={() => openCloseModal(r)}>
                        Close
                    </Button>
                    <Popconfirm title="Delete this setup?" onConfirm={() => deleteMut.mutate(r.id)}>
                        <Button size="small" danger icon={<DeleteOutlined />} />
                    </Popconfirm>
                </Space>
            ),
        },
    ];

    return (
        <div className="animate-in">
            <Alert
                type="info"
                showIcon
                style={{ marginBottom: 20, background: 'var(--bg-glass)', border: '1px solid rgba(16, 185, 129, 0.3)' }}
                message={<span style={{ fontWeight: 600 }}><ThunderboltOutlined /> Active Positions</span>}
                description="Signals are deterministic now: stale data is called out, stop and target diagnostics are explicit, and closing a trade writes a structured journal record."
            />
            {isLoading ? (
                <div style={{ textAlign: 'center', padding: '60px 0' }}><Spin size="large" /></div>
            ) : !signals?.length ? (
                <Empty description={<span style={{ color: 'var(--text-muted)' }}>No active positions yet.</span>} />
            ) : (
                <Table
                    className="portfolio-table"
                    dataSource={signals}
                    columns={columns}
                    rowKey="id"
                    size="small"
                    pagination={false}
                    scroll={{ x: 1250 }}
                />
            )}

            <Modal
                title={closingRecord ? `Close ${closingRecord.symbol}` : 'Close Position'}
                open={!!closingRecord}
                onCancel={() => setClosingRecord(null)}
                onOk={() => closeForm.submit()}
                confirmLoading={closeMut.isPending}
            >
                <Form
                    form={closeForm}
                    layout="vertical"
                    onFinish={(values) => closeMut.mutate({ id: closingRecord.id, payload: values })}
                >
                    <Row gutter={16}>
                        <Col span={12}>
                            <Form.Item name="sell_price" label="Sell Price">
                                <InputNumber min={0.01} step={0.01} style={{ width: '100%' }} />
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item name="setup_grade" label="Setup Grade">
                                <Select
                                    allowClear
                                    options={[
                                        { value: 'A', label: 'A' },
                                        { value: 'B', label: 'B' },
                                        { value: 'C', label: 'C' },
                                    ]}
                                />
                            </Form.Item>
                        </Col>
                    </Row>
                    <Form.Item name="exit_reason" label="Exit Reason">
                        <Select
                            options={[
                                { value: 'Stop Loss Hit', label: 'Stop Loss Hit' },
                                { value: 'Booked Profit', label: 'Booked Profit' },
                                { value: 'Signal Exit', label: 'Signal Exit' },
                                { value: 'Manual Close', label: 'Manual Close' },
                            ]}
                        />
                    </Form.Item>
                    <Form.Item name="rule_followed" label="Rule Followed">
                        <Select
                            allowClear
                            options={[
                                { value: true, label: 'Yes' },
                                { value: false, label: 'No' },
                            ]}
                        />
                    </Form.Item>
                    <Form.Item name="mistake_tag" label="Mistake Tag">
                        <Input placeholder="Optional: early entry, oversize, late exit..." />
                    </Form.Item>
                    <Form.Item name="lesson_learned" label="Lesson Learned">
                        <Input.TextArea rows={2} placeholder="What would you repeat or avoid next time?" />
                    </Form.Item>
                    <Form.Item name="post_trade_note" label="Review Note">
                        <Input.TextArea rows={2} placeholder="Short post-trade review" />
                    </Form.Item>
                </Form>
            </Modal>
        </div>
    );
}

function WatchlistTab() {
    const queryClient = useQueryClient();
    const invalidateAll = QueryInvalidator(queryClient);
    const [modalOpen, setModalOpen] = useState(false);
    const [editingSetup, setEditingSetup] = useState(null);
    const [form] = Form.useForm();

    const { data: setups, isLoading } = useQuery({
        queryKey: ['trade-setups', 'WATCHLIST'],
        queryFn: () => getTradeSetups('WATCHLIST').then((r) => r.data),
    });

    const { data: members } = useQuery({
        queryKey: ['members'],
        queryFn: () => getMembers().then((r) => r.data),
    });

    const { data: pricesRaw } = useQuery({
        queryKey: ['prices'],
        queryFn: () => getMergedPrices().then((r) => r.data),
    });
    const { data: companiesRaw } = useQuery({
        queryKey: ['companies', 'all'],
        queryFn: () => getCompanies({ limit: 1000 }).then((r) => r.data.companies),
    });

    const priceMap = useMemo(() => {
        const map = {};
        (Array.isArray(pricesRaw) ? pricesRaw : []).forEach((price) => {
            if (price.symbol) map[price.symbol] = price.price;
        });
        return map;
    }, [pricesRaw]);

    const companyOptions = useMemo(
        () => (companiesRaw || []).map((company) => ({ value: company.symbol, label: `${company.symbol} — ${company.name || ''}` })),
        [companiesRaw]
    );

    const memberOptions = useMemo(
        () => (members || []).map((member) => ({ value: member.id, label: member.name })),
        [members]
    );

    const createMut = useMutation({
        mutationFn: (data) => createTradeSetup(data),
        onSuccess: () => {
            message.success('Setup created');
            setModalOpen(false);
            setEditingSetup(null);
            form.resetFields();
            invalidateAll();
        },
        onError: (err) => message.error(err?.response?.data?.detail || 'Failed to create setup'),
    });

    const updateMut = useMutation({
        mutationFn: ({ id, ...data }) => updateTradeSetup(id, data),
        onSuccess: () => {
            message.success('Setup updated');
            setModalOpen(false);
            setEditingSetup(null);
            form.resetFields();
            invalidateAll();
        },
        onError: (err) => message.error(err?.response?.data?.detail || 'Failed to update setup'),
    });

    const activateMut = useMutation({
        mutationFn: (id) => updateTradeSetup(id, { status: 'ACTIVE' }),
        onSuccess: () => {
            message.success('Position activated');
            invalidateAll();
        },
        onError: (err) => message.error(err?.response?.data?.detail || 'Failed to activate setup'),
    });

    const deleteMut = useMutation({
        mutationFn: (id) => deleteTradeSetup(id),
        onSuccess: () => {
            message.success('Setup deleted');
            invalidateAll();
        },
    });

    const handleSubmit = (values) => {
        const payload = {
            ...values,
            symbol: values.symbol?.toUpperCase(),
            strategy_note: values.thesis,
        };
        if (editingSetup) {
            updateMut.mutate({ id: editingSetup.id, ...payload });
        } else {
            createMut.mutate({ ...payload, status: 'WATCHLIST' });
        }
    };

    const handleEdit = (record) => {
        setEditingSetup(record);
        form.setFieldsValue(record);
        setModalOpen(true);
    };

    const handleSymbolChange = async (symbol) => {
        if (!symbol) return;
        const ltp = priceMap[symbol];
        if (ltp) {
            form.setFieldsValue({
                entry_price: ltp,
                entry_zone_low: ltp,
                entry_zone_high: ltp,
            });
        }
        try {
            const { data } = await getExtendedTechnicals(symbol);
            if (data) {
                form.setFieldsValue({
                    initial_stop_loss: data.stop_loss,
                    current_stop_loss: data.stop_loss,
                    stop_loss: data.stop_loss,
                    target_1: data.target_1,
                    target_2: data.target_2,
                    target_price: data.target_1,
                    strategy_type: data.gate5_technical === 'STRONG BUY' ? 'Momentum continuation' : 'Pullback in bullish trend',
                    setup_quality: data.liquidity_grade,
                });
                message.info(`Loaded ATR-based planning levels for ${symbol}`);
            }
        } catch {
            // keep manual flow usable
        }
    };

    const columns = [
        {
            title: 'Symbol',
            dataIndex: 'symbol',
            width: 110,
            render: (value, record) => (
                <div>
                    <div style={{ fontWeight: 700, color: 'var(--accent-primary)' }}>{value}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{record.strategy_type || 'Trade setup'}</div>
                </div>
            ),
        },
        {
            title: 'LTP / Entry Zone',
            width: 160,
            render: (_, record) => {
                const ltp = priceMap[record.symbol];
                const inZone = ltp && record.entry_zone_low && record.entry_zone_high && ltp >= record.entry_zone_low && ltp <= record.entry_zone_high;
                return (
                    <div>
                        <div style={{ fontWeight: 700, color: inZone ? '#10b981' : 'var(--text-primary)' }}>{formatNPR(ltp)}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                            {formatNPR(record.entry_zone_low)} - {formatNPR(record.entry_zone_high)}
                        </div>
                    </div>
                );
            },
        },
        {
            title: 'Plan',
            width: 170,
            render: (_, record) => (
                <div>
                    <div style={{ color: '#ef4444' }}>Stop: {formatNPR(record.current_stop_loss || record.stop_loss)}</div>
                    <div style={{ color: '#10b981' }}>T1: {formatNPR(record.target_1 || record.target_price)}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Qty {record.allocated_qty || '—'} | Risk {formatNPR(record.risk_amount)}</div>
                </div>
            ),
        },
        {
            title: 'Quality',
            width: 120,
            render: (_, record) => (
                <Space direction="vertical" size={4}>
                    {record.setup_quality ? <Tag color="purple">{record.setup_quality}</Tag> : <Tag>Unrated</Tag>}
                    {record.member_id ? <Tag color="cyan">Member #{record.member_id}</Tag> : null}
                </Space>
            ),
        },
        { title: 'Thesis', dataIndex: 'thesis', ellipsis: true, render: (v) => <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{v || '—'}</span> },
        {
            title: 'Actions',
            width: 200,
            render: (_, record) => (
                <Space size={4}>
                    <Popconfirm title="Activate this setup?" onConfirm={() => activateMut.mutate(record.id)}>
                        <Button size="small" type="primary" icon={<ThunderboltOutlined />}>Activate</Button>
                    </Popconfirm>
                    <Button size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)} />
                    <Popconfirm title="Delete this setup?" onConfirm={() => deleteMut.mutate(record.id)}>
                        <Button size="small" danger icon={<DeleteOutlined />} />
                    </Popconfirm>
                </Space>
            ),
        },
    ];

    return (
        <div className="animate-in">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, marginBottom: 20 }}>
                <Alert
                    type="info"
                    showIcon
                    style={{ flex: 1, background: 'var(--bg-glass)', border: '1px solid rgba(108, 92, 231, 0.3)' }}
                    message={<span style={{ fontWeight: 600 }}><EyeOutlined /> Watchlist & Setups</span>}
                    description="Watchlist entries are now real trade plans: entry zone, stop, target, thesis, sizing, and strategy quality all travel with the setup into active management."
                />
                <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditingSetup(null); form.resetFields(); setModalOpen(true); }}>
                    New Setup
                </Button>
            </div>

            {isLoading ? (
                <div style={{ textAlign: 'center', padding: '60px 0' }}><Spin size="large" /></div>
            ) : (
                <Table className="portfolio-table" dataSource={setups || []} columns={columns} rowKey="id" size="small" pagination={false} scroll={{ x: 1080 }} />
            )}

            <Modal
                title={editingSetup ? 'Edit Trade Setup' : 'New Trade Setup'}
                open={modalOpen}
                onCancel={() => { setModalOpen(false); setEditingSetup(null); }}
                onOk={() => form.submit()}
                confirmLoading={createMut.isPending || updateMut.isPending}
                width={720}
            >
                <Form form={form} layout="vertical" onFinish={handleSubmit} style={{ marginTop: 16 }}>
                    <Row gutter={16}>
                        <Col span={12}>
                            <Form.Item name="symbol" label="Symbol" rules={[{ required: true, message: 'Select a symbol' }]}>
                                <Select
                                    showSearch
                                    optionFilterProp="label"
                                    options={companyOptions}
                                    placeholder="Search stock..."
                                    onChange={handleSymbolChange}
                                    disabled={!!editingSetup}
                                />
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item name="member_id" label="Member">
                                <Select allowClear options={memberOptions} placeholder="Optional portfolio member" />
                            </Form.Item>
                        </Col>
                    </Row>
                    <Row gutter={16}>
                        <Col span={8}>
                            <Form.Item name="entry_zone_low" label="Entry Zone Low" rules={[{ required: true }]}>
                                <InputNumber min={0.01} step={0.01} style={{ width: '100%' }} />
                            </Form.Item>
                        </Col>
                        <Col span={8}>
                            <Form.Item name="entry_zone_high" label="Entry Zone High" rules={[{ required: true }]}>
                                <InputNumber min={0.01} step={0.01} style={{ width: '100%' }} />
                            </Form.Item>
                        </Col>
                        <Col span={8}>
                            <Form.Item name="entry_price" label="Reference Entry">
                                <InputNumber min={0.01} step={0.01} style={{ width: '100%' }} />
                            </Form.Item>
                        </Col>
                    </Row>
                    <Row gutter={16}>
                        <Col span={8}>
                            <Form.Item name="initial_stop_loss" label="Initial Stop" rules={[{ required: true }]}>
                                <InputNumber min={0.01} step={0.01} style={{ width: '100%' }} />
                            </Form.Item>
                        </Col>
                        <Col span={8}>
                            <Form.Item name="current_stop_loss" label="Current Stop" rules={[{ required: true }]}>
                                <InputNumber min={0.01} step={0.01} style={{ width: '100%' }} />
                            </Form.Item>
                        </Col>
                        <Col span={8}>
                            <Form.Item name="trailing_stop" label="Trailing Stop">
                                <InputNumber min={0.01} step={0.01} style={{ width: '100%' }} />
                            </Form.Item>
                        </Col>
                    </Row>
                    <Row gutter={16}>
                        <Col span={8}>
                            <Form.Item name="target_1" label="Target 1" rules={[{ required: true }]}>
                                <InputNumber min={0.01} step={0.01} style={{ width: '100%' }} />
                            </Form.Item>
                        </Col>
                        <Col span={8}>
                            <Form.Item name="target_2" label="Target 2">
                                <InputNumber min={0.01} step={0.01} style={{ width: '100%' }} />
                            </Form.Item>
                        </Col>
                        <Col span={8}>
                            <Form.Item name="allocated_qty" label="Quantity" rules={[{ required: true }]}>
                                <InputNumber min={1} step={1} style={{ width: '100%' }} />
                            </Form.Item>
                        </Col>
                    </Row>
                    <Row gutter={16}>
                        <Col span={8}>
                            <Form.Item name="risk_percent" label="Risk %" rules={[{ required: true }]}>
                                <InputNumber min={0.1} max={100} step={0.1} style={{ width: '100%' }} />
                            </Form.Item>
                        </Col>
                        <Col span={8}>
                            <Form.Item name="capital_allocated" label="Capital Allocated">
                                <InputNumber min={0.01} step={0.01} style={{ width: '100%' }} />
                            </Form.Item>
                        </Col>
                        <Col span={8}>
                            <Form.Item name="risk_amount" label="Risk Amount">
                                <InputNumber min={0.01} step={0.01} style={{ width: '100%' }} />
                            </Form.Item>
                        </Col>
                    </Row>
                    <Row gutter={16}>
                        <Col span={12}>
                            <Form.Item name="strategy_type" label="Strategy Type">
                                <Select
                                    allowClear
                                    options={[
                                        { value: 'Momentum continuation', label: 'Momentum continuation' },
                                        { value: 'Breakout candidate', label: 'Breakout candidate' },
                                        { value: 'Pullback in bullish trend', label: 'Pullback in bullish trend' },
                                        { value: 'Mean-reversion bounce', label: 'Mean-reversion bounce' },
                                    ]}
                                />
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item name="setup_quality" label="Setup Quality">
                                <Select
                                    allowClear
                                    options={[
                                        { value: 'A', label: 'A' },
                                        { value: 'B', label: 'B' },
                                        { value: 'C', label: 'C' },
                                        { value: 'D', label: 'D' },
                                    ]}
                                />
                            </Form.Item>
                        </Col>
                    </Row>
                    <Form.Item name="thesis" label="Trade Thesis" rules={[{ required: true, message: 'Add the reason for the trade' }]}>
                        <Input.TextArea rows={3} placeholder="Why this trade is valid, what confirms it, and what invalidates it." />
                    </Form.Item>
                </Form>
            </Modal>
        </div>
    );
}

function TradeJournalTab() {
    const { data: journal, isLoading } = useQuery({
        queryKey: ['trade-journal'],
        queryFn: () => getTradeJournal().then((r) => r.data),
    });

    const { data: stats } = useQuery({
        queryKey: ['trade-journal-stats'],
        queryFn: () => getTradeJournalStats().then((r) => r.data),
    });

    const statCards = stats ? [
        { title: 'Total Trades', value: stats.total_trades },
        { title: 'Win Rate', value: stats.win_rate, suffix: '%' },
        { title: 'Avg R', value: stats.avg_rr },
        { title: 'Expectancy', value: stats.expectancy, prefix: 'Rs.' },
        { title: 'Avg Win', value: stats.avg_win, prefix: 'Rs.' },
        { title: 'Avg Loss', value: stats.avg_loss, prefix: 'Rs.' },
        { title: 'Profit Factor', value: stats.profit_factor },
        { title: 'Avg Hold', value: stats.average_hold_days, suffix: 'd' },
    ] : [];

    const columns = [
        { title: 'Symbol', dataIndex: 'symbol', width: 100, render: (v) => <span style={{ fontWeight: 700 }}>{v}</span> },
        {
            title: 'Plan vs Exit',
            width: 180,
            render: (_, r) => (
                <div>
                    <div>Plan: {formatNPR(r.planned_entry)} / {formatNPR(r.planned_stop)} / {formatNPR(r.planned_target)}</div>
                    <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>Exit: {formatNPR(r.sell_price)} | {r.exit_reason || '—'}</div>
                </div>
            ),
        },
        { title: 'Qty', dataIndex: 'quantity', width: 70, align: 'right' },
        {
            title: 'P&L',
            dataIndex: 'realized_pnl',
            width: 110,
            align: 'right',
            render: (v) => <span style={{ fontWeight: 700, color: (v || 0) >= 0 ? '#10b981' : '#ef4444' }}>{formatNPR(v)}</span>,
        },
        { title: 'R', dataIndex: 'realized_rr', width: 70, align: 'right', render: (v) => (v != null ? `${v}` : '—') },
        {
            title: 'Review',
            width: 180,
            render: (_, r) => (
                <div>
                    <div>
                        {r.setup_grade ? <Tag color="purple">{r.setup_grade}</Tag> : null}
                        {r.rule_followed === true ? <Tag color="green">Rules Followed</Tag> : null}
                        {r.rule_followed === false ? <Tag color="red">Rule Break</Tag> : null}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{r.mistake_tag || r.lesson_learned || '—'}</div>
                </div>
            ),
        },
        { title: 'Hold', dataIndex: 'hold_days', width: 80, align: 'right', render: (v) => (v != null ? `${v}d` : '—') },
        { title: 'Note', dataIndex: 'post_trade_note', ellipsis: true, render: (v) => <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{v || '—'}</span> },
    ];

    return (
        <div className="animate-in">
            {stats?.total_trades > 0 && (
                <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
                    {statCards.map((card) => (
                        <Col xs={12} sm={8} md={6} lg={6} xl={3} key={card.title}>
                            <div className="stat-card" style={{ padding: 16, textAlign: 'center' }}>
                                <Statistic title={card.title} value={card.value} prefix={card.prefix} suffix={card.suffix} />
                            </div>
                        </Col>
                    ))}
                </Row>
            )}

            {isLoading ? (
                <div style={{ textAlign: 'center', padding: '60px 0' }}><Spin size="large" /></div>
            ) : !journal?.length ? (
                <Empty description={<span style={{ color: 'var(--text-muted)' }}>No closed trades yet.</span>} />
            ) : (
                <Table
                    className="portfolio-table"
                    dataSource={journal}
                    columns={columns}
                    rowKey="id"
                    size="small"
                    scroll={{ x: 980 }}
                    pagination={{ defaultPageSize: 20, showSizeChanger: true }}
                />
            )}
        </div>
    );
}

function StrategyTesterTab() {
    const [symbol, setSymbol] = useState(null);
    const { data: companiesRaw } = useQuery({
        queryKey: ['companies', 'all'],
        queryFn: () => getCompanies({ limit: 1000 }).then((r) => r.data.companies),
    });
    const companyOptions = useMemo(
        () => (companiesRaw || []).map((company) => ({ value: company.symbol, label: `${company.symbol} — ${company.name || ''}` })),
        [companiesRaw]
    );

    return (
        <div className="animate-in">
            <div className="stat-card" style={{ padding: '16px 20px', marginBottom: 24, display: 'flex', gap: 16, alignItems: 'center' }}>
                <div style={{ fontSize: 14, fontWeight: 500 }}>Select Stock:</div>
                <Select
                    showSearch
                    optionFilterProp="label"
                    value={symbol}
                    onChange={setSymbol}
                    options={companyOptions}
                    placeholder="Search stock..."
                    style={{ width: 350 }}
                    size="large"
                    allowClear
                />
            </div>
            {symbol ? <StrategyTester symbol={symbol} /> : <Empty description={<span style={{ color: 'var(--text-muted)' }}>Select a stock above to run backtests</span>} style={{ padding: '60px 0' }} />}
        </div>
    );
}

function PositionsTab() {
    return (
        <Tabs
            defaultActiveKey="active"
            className="custom-subtabs"
            items={[
                { key: 'active', label: <span><ThunderboltOutlined /> Active Positions</span>, children: <ActivePositionsTab /> },
                { key: 'watchlist', label: <span><EyeOutlined /> Watchlist</span>, children: <WatchlistTab /> },
            ]}
        />
    );
}

export default function TradingDesk() {
    const items = [
        { key: 'positions', label: <span><ThunderboltOutlined /> Positions</span>, children: <PositionsTab /> },
        { key: 'analysis', label: <span><LineChartOutlined /> Analysis & AI</span>, children: <StockAnalysis /> },
        { key: 'calculator', label: <span><AimOutlined /> Risk Calculator</span>, children: <RiskCalculator /> },
        { key: 'tester', label: <span><TrophyOutlined /> Strategy Tester</span>, children: <StrategyTesterTab /> },
        { key: 'journal', label: <span><HistoryOutlined /> Trade Journal</span>, children: <TradeJournalTab /> },
        { key: 'screener', label: <span><FilterOutlined /> Technical Screener</span>, children: <TechnicalScreener /> },
        {
            key: 'buysell',
            label: <span><CalculatorOutlined /> Buy/Sell Calc</span>,
            children: (
                <div className="animate-in">
                    <Alert
                        showIcon
                        type="info"
                        style={{ marginBottom: 16 }}
                        message="Separate modes"
                        description="Portfolio Sell uses real holdings and FIFO CGT. Hypothetical trade planning now lives in the Risk Calculator."
                    />
                    <Tabs
                        defaultActiveKey="buy"
                        type="card"
                        items={[
                            { key: 'buy', label: 'Buy Calculator', children: <BuyCalculator /> },
                            { key: 'sell', label: 'Sell Calculator', children: <SellCalculator /> },
                        ]}
                    />
                </div>
            ),
        },
    ];

    return (
        <div className="animate-in">
            <div className="page-header">
                <h1><ThunderboltOutlined style={{ marginRight: 12, color: 'var(--accent-primary)' }} />Trading Desk</h1>
                <p className="subtitle">Run the desk like a trading journal, not a loose watchlist: plan, size, activate, manage, review.</p>
            </div>
            <Tabs defaultActiveKey="positions" items={items} className="custom-tabs" style={{ marginBottom: 24 }} size="large" />
        </div>
    );
}
