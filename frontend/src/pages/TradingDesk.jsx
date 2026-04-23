import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
    Tabs, Table, Tag, Button, Modal, Form, InputNumber, Input, Select,
    Row, Col, Spin, Empty, Space, Statistic, message, Popconfirm, Alert
} from 'antd';
import {
    ThunderboltOutlined, EyeOutlined, AimOutlined, TrophyOutlined,
    HistoryOutlined, CalculatorOutlined, PlusOutlined, DeleteOutlined,
    EditOutlined, CheckCircleOutlined, WarningOutlined, RiseOutlined,
    FallOutlined, FilterOutlined, SyncOutlined, PlayCircleOutlined,
    DashboardOutlined, FundOutlined, BarChartOutlined, RobotOutlined,
    LineChartOutlined
} from '@ant-design/icons';
import {
    getTradeSetups, createTradeSetup, updateTradeSetup, deleteTradeSetup,
    getTradeSignals, getTradeJournal, createTradeJournalEntry, getTradeJournalStats,
    getMergedPrices, getCompanies, getExtendedTechnicals
} from '../services/api';
import StrategyTester from '../components/insights/StrategyTester';
import RiskCalculator from '../components/trading/RiskCalculator';
import TechnicalScreener from '../components/trading/TechnicalScreener';
import StockAnalysis from '../components/trading/StockAnalysis';
import { BuyCalculator, SellCalculator } from './Calculator';

function formatNPR(value, decimals = 2) {
    if (value === null || value === undefined) return '—';
    return `Rs. ${Number(value).toLocaleString('en-IN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
}

// ── Coming Soon Placeholder ──
function ComingSoon({ title, description, icon }) {
    return (
        <div style={{ textAlign: 'center', padding: '80px 20px' }}>
            <div style={{ fontSize: 64, marginBottom: 24, opacity: 0.08 }}>{icon}</div>
            <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 8, color: 'var(--text-primary)' }}>{title}</div>
            <div style={{ fontSize: 14, color: 'var(--text-muted)', maxWidth: 500, margin: '0 auto', lineHeight: 1.7 }}>
                {description}
            </div>
            <Tag color="purple" style={{ marginTop: 20, fontSize: 13, padding: '4px 16px' }}>Coming Soon</Tag>
        </div>
    );
}


// ── Active Positions Tab ──
function ActivePositionsTab() {
    const queryClient = useQueryClient();
    const { data: signals, isLoading } = useQuery({
        queryKey: ['trade-signals'],
        queryFn: () => getTradeSignals().then(r => r.data),
        refetchInterval: 30000, // refresh every 30s
    });

    const deleteMut = useMutation({
        mutationFn: (id) => deleteTradeSetup(id),
        onSuccess: () => { message.success('Position removed'); queryClient.invalidateQueries(['trade-signals']); queryClient.invalidateQueries(['trade-setups']); },
    });

    const closeMut = useMutation({
        mutationFn: ({ id, ...journalData }) => {
            return Promise.all([
                updateTradeSetup(id, { status: 'CLOSED' }),
                createTradeJournalEntry(journalData),
            ]);
        },
        onSuccess: () => {
            message.success('Position closed & logged to journal');
            queryClient.invalidateQueries(['trade-signals']);
            queryClient.invalidateQueries(['trade-setups']);
            queryClient.invalidateQueries(['trade-journal']);
        },
    });

    const getSignalTag = (signal) => {
        switch (signal) {
            case 'HOLD': return <Tag color="green" style={{ fontWeight: 700 }}>🟢 HOLD</Tag>;
            case 'TIGHTEN_STOP': return <Tag color="gold" style={{ fontWeight: 700 }}>🟡 TIGHTEN STOP</Tag>;
            case 'TAKE_PROFIT': return <Tag color="blue" style={{ fontWeight: 700 }}>🔵 TAKE PROFIT</Tag>;
            case 'EXIT': return <Tag color="red" style={{ fontWeight: 700 }}>🔴 EXIT</Tag>;
            default: return <Tag>{signal}</Tag>;
        }
    };

    const columns = [
        { title: 'Symbol', dataIndex: 'symbol', width: 100, render: v => <span style={{ fontWeight: 700, color: 'var(--accent-primary)' }}>{v}</span> },
        { title: 'Entry', dataIndex: 'entry_price', width: 100, align: 'right', render: v => formatNPR(v) },
        { title: 'LTP', dataIndex: 'ltp', width: 100, align: 'right', render: v => v ? <span style={{ fontWeight: 700 }}>{formatNPR(v)}</span> : '—' },
        { title: 'Stop Loss', dataIndex: 'stop_loss', width: 100, align: 'right', render: v => <span style={{ color: '#ef4444' }}>{formatNPR(v)}</span> },
        { title: 'Target', dataIndex: 'target_price', width: 100, align: 'right', render: v => <span style={{ color: '#10b981' }}>{formatNPR(v)}</span> },
        { title: 'Qty', dataIndex: 'allocated_qty', width: 70, align: 'right' },
        {
            title: 'P&L', dataIndex: 'live_pnl', width: 110, align: 'right',
            render: v => v != null ? <span style={{ fontWeight: 700, color: v > 0 ? '#10b981' : '#ef4444' }}>{v > 0 ? '+' : ''}{formatNPR(v)}</span> : '—'
        },
        { title: 'R:R', dataIndex: 'live_rr', width: 70, align: 'right', render: v => v != null ? `${v}:1` : '—' },
        { title: 'Signal', dataIndex: 'signal', width: 140, render: v => getSignalTag(v) },
        {
            title: 'Actions', width: 120, render: (_, r) => (
                <Space size={4}>
                    <Popconfirm title="Close this position?" onConfirm={() => closeMut.mutate({
                        id: r.id, setup_id: r.id, symbol: r.symbol,
                        buy_price: r.entry_price, sell_price: r.ltp, quantity: r.allocated_qty || 0,
                        realized_pnl: r.live_pnl, realized_rr: r.live_rr,
                    })}>
                        <Button size="small" type="primary" ghost icon={<CheckCircleOutlined />}>Close</Button>
                    </Popconfirm>
                    <Popconfirm title="Delete?" onConfirm={() => deleteMut.mutate(r.id)}>
                        <Button size="small" danger icon={<DeleteOutlined />} />
                    </Popconfirm>
                </Space>
            )
        },
    ];

    if (isLoading) return <div style={{ textAlign: 'center', padding: '60px 0' }}><Spin size="large" /></div>;

    return (
        <div className="animate-in">
            <Alert
                message={<span style={{ fontWeight: 600 }}><ThunderboltOutlined /> Active Positions</span>}
                description="Live tracking of your active trading positions. Signals auto-refresh every 30 seconds based on current market prices."
                type="info" showIcon
                style={{ marginBottom: 20, background: 'var(--bg-glass)', border: '1px solid rgba(16, 185, 129, 0.3)' }}
            />
            {(!signals || signals.length === 0) ? (
                <div style={{ textAlign: 'center', padding: '60px 0' }}>
                    <Empty description={<span style={{ color: 'var(--text-muted)' }}>No active positions. Add setups from the Watchlist tab and activate them.</span>} />
                </div>
            ) : (
                <Table
                    className="portfolio-table"
                    dataSource={signals}
                    columns={columns}
                    rowKey="id"
                    size="small"
                    scroll={{ x: 1100 }}
                    pagination={false}
                    rowClassName={(r) => r.signal === 'EXIT' ? 'row-negative' : r.signal === 'TAKE_PROFIT' ? 'row-positive' : ''}
                />
            )}
        </div>
    );
}

// ── Watchlist Tab ──
function WatchlistTab() {
    const queryClient = useQueryClient();
    const [modalOpen, setModalOpen] = useState(false);
    const [editingSetup, setEditingSetup] = useState(null);
    const [form] = Form.useForm();

    const { data: setups, isLoading } = useQuery({
        queryKey: ['trade-setups', 'WATCHLIST'],
        queryFn: () => getTradeSetups('WATCHLIST').then(r => r.data),
    });

    const { data: pricesRaw } = useQuery({
        queryKey: ['prices'],
        queryFn: () => getMergedPrices().then(r => r.data),
    });
    const priceMap = useMemo(() => {
        const m = {};
        (Array.isArray(pricesRaw) ? pricesRaw : []).forEach(p => { if (p.symbol) m[p.symbol] = p.price; });
        return m;
    }, [pricesRaw]);

    const { data: companiesRaw } = useQuery({
        queryKey: ['companies', 'all'],
        queryFn: () => getCompanies({ limit: 1000 }).then(r => r.data.companies),
    });
    const companyOptions = useMemo(() =>
        (companiesRaw || []).map(c => ({ value: c.symbol, label: `${c.symbol} — ${c.name || ''}` })),
        [companiesRaw]
    );

    const createMut = useMutation({
        mutationFn: (data) => createTradeSetup(data),
        onSuccess: () => { message.success('Setup created'); queryClient.invalidateQueries(['trade-setups']); setModalOpen(false); form.resetFields(); },
    });

    const activateMut = useMutation({
        mutationFn: (id) => updateTradeSetup(id, { status: 'ACTIVE' }),
        onSuccess: () => { message.success('Position activated'); queryClient.invalidateQueries(['trade-setups']); queryClient.invalidateQueries(['trade-signals']); },
    });

    const deleteMut = useMutation({
        mutationFn: (id) => deleteTradeSetup(id),
        onSuccess: () => { message.success('Deleted'); queryClient.invalidateQueries(['trade-setups']); },
    });

    const updateMut = useMutation({
        mutationFn: ({ id, ...data }) => updateTradeSetup(id, data),
        onSuccess: () => { message.success('Updated'); queryClient.invalidateQueries(['trade-setups']); setModalOpen(false); setEditingSetup(null); form.resetFields(); },
    });

    const handleSubmit = (values) => {
        if (editingSetup) {
            updateMut.mutate({ id: editingSetup.id, ...values });
        } else {
            createMut.mutate({ ...values, status: 'WATCHLIST' });
        }
    };

    const handleEdit = (record) => {
        setEditingSetup(record);
        form.setFieldsValue(record);
        setModalOpen(true);
    };

    const handleSymbolChange = async (val) => {
        if (!val) return;
        const ltp = priceMap[val];
        if (ltp) form.setFieldValue('entry_price', ltp);
        try {
            const res = await getExtendedTechnicals(val);
            const data = res.data;
            if (data && data.stop_loss) {
                form.setFieldValue('stop_loss', data.stop_loss);
                form.setFieldValue('target_price', data.target_1 || data.target_2);
                message.info(`Auto-filled ATR-based SL & Target for ${val}`);
            }
        } catch (err) {
            // ignore silently
        }
    };

    const columns = [
        { title: 'Symbol', dataIndex: 'symbol', width: 100, render: v => <span style={{ fontWeight: 700, color: 'var(--accent-primary)' }}>{v}</span> },
        {
            title: 'LTP', width: 100, align: 'right',
            render: (_, r) => {
                const ltp = priceMap[r.symbol];
                const inZone = ltp && r.entry_price && ltp <= r.entry_price;
                return ltp ? <span style={{ fontWeight: 700, color: inZone ? '#10b981' : 'var(--text-primary)' }}>{formatNPR(ltp)} {inZone && '✓'}</span> : '—';
            }
        },
        { title: 'Planned Entry', dataIndex: 'entry_price', width: 100, align: 'right', render: v => formatNPR(v) },
        { title: 'Target', dataIndex: 'target_price', width: 100, align: 'right', render: v => <span style={{ color: '#10b981' }}>{formatNPR(v)}</span> },
        { title: 'Stop Loss', dataIndex: 'stop_loss', width: 100, align: 'right', render: v => <span style={{ color: '#ef4444' }}>{formatNPR(v)}</span> },
        { title: 'Qty', dataIndex: 'allocated_qty', width: 70, align: 'right' },
        { title: 'Note', dataIndex: 'strategy_note', ellipsis: true, render: v => <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{v || '—'}</span> },
        {
            title: 'Actions', width: 200, render: (_, r) => (
                <Space size={4}>
                    <Popconfirm title="Activate this position as ACTIVE?" onConfirm={() => activateMut.mutate(r.id)}>
                        <Button size="small" type="primary" icon={<ThunderboltOutlined />}>Activate</Button>
                    </Popconfirm>
                    <Button size="small" icon={<EditOutlined />} onClick={() => handleEdit(r)} />
                    <Popconfirm title="Delete?" onConfirm={() => deleteMut.mutate(r.id)}>
                        <Button size="small" danger icon={<DeleteOutlined />} />
                    </Popconfirm>
                </Space>
            )
        },
    ];

    return (
        <div className="animate-in">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <Alert
                    message={<span style={{ fontWeight: 600 }}><EyeOutlined /> Watchlist & Trade Setups</span>}
                    description="Plan your trades here. When LTP enters your buy zone, the entry price will highlight green. Activate to move to Active Positions."
                    type="info" showIcon style={{ flex: 1, background: 'var(--bg-glass)', border: '1px solid rgba(108, 92, 231, 0.3)' }}
                />
                <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditingSetup(null); form.resetFields(); setModalOpen(true); }} style={{ marginLeft: 16 }}>
                    New Setup
                </Button>
            </div>

            {isLoading ? <Spin size="large" style={{ display: 'block', margin: '60px auto' }} /> : (
                <Table className="portfolio-table" dataSource={setups || []} columns={columns} rowKey="id" size="small" scroll={{ x: 900 }} pagination={false} />
            )}

            <Modal
                title={editingSetup ? 'Edit Trade Setup' : 'New Trade Setup'}
                open={modalOpen}
                onCancel={() => { setModalOpen(false); setEditingSetup(null); }}
                footer={null}
                width={520}
            >
                <Form form={form} layout="vertical" onFinish={handleSubmit} style={{ marginTop: 16 }}>
                    {!editingSetup && (
                        <Form.Item name="symbol" label="Symbol" rules={[{ required: true }]}>
                            <Select showSearch optionFilterProp="label" options={companyOptions} placeholder="Search stock..." size="large" onChange={handleSymbolChange} />
                        </Form.Item>
                    )}
                    <Row gutter={16}>
                        <Col span={8}><Form.Item name="entry_price" label="Entry Price"><InputNumber style={{ width: '100%' }} min={0} step={0.01} /></Form.Item></Col>
                        <Col span={8}><Form.Item name="target_price" label="Target Price"><InputNumber style={{ width: '100%' }} min={0} step={0.01} /></Form.Item></Col>
                        <Col span={8}><Form.Item name="stop_loss" label="Stop Loss"><InputNumber style={{ width: '100%' }} min={0} step={0.01} /></Form.Item></Col>
                    </Row>
                    <Row gutter={16}>
                        <Col span={8}><Form.Item name="allocated_qty" label="Quantity"><InputNumber style={{ width: '100%' }} min={1} /></Form.Item></Col>
                        <Col span={8}><Form.Item name="risk_percent" label="Risk %"><InputNumber style={{ width: '100%' }} min={0.1} max={100} step={0.1} /></Form.Item></Col>
                        <Col span={8}><Form.Item name="trailing_stop" label="Trailing Stop"><InputNumber style={{ width: '100%' }} min={0} step={0.01} /></Form.Item></Col>
                    </Row>
                    <Form.Item name="strategy_note" label="Strategy Note">
                        <Input.TextArea rows={2} placeholder="e.g., Buy on RSI bounce from 30 with volume confirmation..." />
                    </Form.Item>
                    <Button type="primary" htmlType="submit" loading={createMut.isPending || updateMut.isPending} block size="large">
                        {editingSetup ? 'Update Setup' : 'Create Setup'}
                    </Button>
                </Form>
            </Modal>
        </div>
    );
}


// ── Trade Journal Tab ──
function TradeJournalTab() {
    const { data: journal, isLoading } = useQuery({
        queryKey: ['trade-journal'],
        queryFn: () => getTradeJournal().then(r => r.data),
    });

    const { data: stats } = useQuery({
        queryKey: ['trade-journal-stats'],
        queryFn: () => getTradeJournalStats().then(r => r.data),
    });

    const columns = [
        { title: 'Symbol', dataIndex: 'symbol', width: 100, render: v => <span style={{ fontWeight: 700 }}>{v}</span> },
        { title: 'Buy Price', dataIndex: 'buy_price', width: 100, align: 'right', render: v => formatNPR(v) },
        { title: 'Sell Price', dataIndex: 'sell_price', width: 100, align: 'right', render: v => formatNPR(v) },
        { title: 'Qty', dataIndex: 'quantity', width: 70, align: 'right' },
        {
            title: 'P&L', dataIndex: 'realized_pnl', width: 110, align: 'right',
            render: v => v != null ? <span style={{ fontWeight: 700, color: v > 0 ? '#10b981' : '#ef4444' }}>{v > 0 ? '+' : ''}{formatNPR(v)}</span> : '—'
        },
        { title: 'R:R', dataIndex: 'realized_rr', width: 70, align: 'right', render: v => v != null ? `${v}:1` : '—' },
        { title: 'Note', dataIndex: 'post_trade_note', ellipsis: true, render: v => <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{v || '—'}</span> },
        {
            title: 'Date', dataIndex: 'created_at', width: 110,
            render: v => v ? new Date(v).toLocaleDateString() : '—'
        },
    ];

    return (
        <div className="animate-in">
            {stats && stats.total_trades > 0 && (
                <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
                    <Col xs={12} sm={6}>
                        <div className="stat-card" style={{ padding: 16, textAlign: 'center' }}>
                            <Statistic title="Total Trades" value={stats.total_trades} />
                        </div>
                    </Col>
                    <Col xs={12} sm={6}>
                        <div className="stat-card" style={{ padding: 16, textAlign: 'center' }}>
                            <Statistic title="Win Rate" value={stats.win_rate} suffix="%" valueStyle={{ color: stats.win_rate > 50 ? '#10b981' : '#ef4444' }} />
                        </div>
                    </Col>
                    <Col xs={12} sm={6}>
                        <div className="stat-card" style={{ padding: 16, textAlign: 'center' }}>
                            <Statistic title="Profit Factor" value={stats.profit_factor} precision={2} valueStyle={{ color: stats.profit_factor > 1 ? '#10b981' : '#ef4444' }} />
                        </div>
                    </Col>
                    <Col xs={12} sm={6}>
                        <div className="stat-card" style={{ padding: 16, textAlign: 'center' }}>
                            <Statistic title="Total P&L" value={stats.total_pnl} precision={2} prefix="Rs." valueStyle={{ color: stats.total_pnl > 0 ? '#10b981' : '#ef4444' }} />
                        </div>
                    </Col>
                </Row>
            )}

            {isLoading ? <Spin size="large" style={{ display: 'block', margin: '60px auto' }} /> : (
                (!journal || journal.length === 0) ? (
                    <Empty description={<span style={{ color: 'var(--text-muted)' }}>No closed trades yet. Close positions from the Active tab to log them here.</span>} />
                ) : (
                    <Table className="portfolio-table" dataSource={journal} columns={columns} rowKey="id" size="small" scroll={{ x: 800 }}
                        pagination={{ defaultPageSize: 25, showSizeChanger: true, showTotal: t => `${t} trades` }} />
                )
            )}
        </div>
    );
}


// ── Strategy Tester Wrapper ──
function StrategyTesterTab() {
    const [symbol, setSymbol] = useState(null);
    const { data: companiesRaw } = useQuery({
        queryKey: ['companies', 'all'],
        queryFn: () => getCompanies({ limit: 1000 }).then(r => r.data.companies),
    });
    const companyOptions = useMemo(() =>
        (companiesRaw || []).map(c => ({ value: c.symbol, label: `${c.symbol} — ${c.name || ''}` })),
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
            {symbol ? <StrategyTester symbol={symbol} /> : (
                <Empty description={<span style={{ color: 'var(--text-muted)' }}>Select a stock above to run backtests</span>} style={{ padding: '60px 0' }} />
            )}
        </div>
    );
}


// ── Merged Positions Tab (Active + Watchlist) ──
function PositionsTab() {
    const posSubItems = [
        {
            key: 'active',
            label: <span><ThunderboltOutlined /> Active Positions</span>,
            children: <ActivePositionsTab />,
        },
        {
            key: 'watchlist',
            label: <span><EyeOutlined /> Watchlist</span>,
            children: <WatchlistTab />,
        },
    ];

    return <Tabs items={posSubItems} defaultActiveKey="active" className="custom-subtabs" />;
}

// ── Main Trading Desk Page ──
export default function TradingDesk() {
    const tabItems = [
        {
            key: 'positions',
            label: <span><ThunderboltOutlined /> Positions</span>,
            children: <PositionsTab />,
        },
        {
            key: 'analysis',
            label: <span><LineChartOutlined /> Analysis & AI</span>,
            children: <StockAnalysis />,
        },
        {
            key: 'calculator',
            label: <span><AimOutlined /> Risk Calculator</span>,
            children: <RiskCalculator />,
        },
        {
            key: 'tester',
            label: <span><TrophyOutlined /> Strategy Tester</span>,
            children: <StrategyTesterTab />,
        },
        {
            key: 'journal',
            label: <span><HistoryOutlined /> Trade Journal</span>,
            children: <TradeJournalTab />,
        },
        {
            key: 'screener',
            label: <span><FilterOutlined /> Technical Screener</span>,
            children: <TechnicalScreener />,
        },
        {
            key: 'buysell',
            label: <span><CalculatorOutlined /> Buy/Sell Calc</span>,
            children: (
                <div className="animate-in">
                    <Tabs
                        defaultActiveKey="buy"
                        type="card"
                        items={[
                            { key: 'buy', label: 'Buy Calculator', children: <BuyCalculator /> },
                            { key: 'sell', label: 'Sell Calculator', children: <SellCalculator /> }
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
                <p className="subtitle">Manage active positions, track trade setups, and execute with professional risk management</p>
            </div>

            <Tabs
                defaultActiveKey="positions"
                items={tabItems}
                className="custom-tabs"
                style={{ marginBottom: 24 }}
                size="large"
            />
        </div>
    );
}
