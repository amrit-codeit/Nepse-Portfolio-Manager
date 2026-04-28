import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Col, Empty, Form, Input, InputNumber, Modal, Row, Select, Space, Spin, Table, Tag, Tooltip, message } from 'antd';
import { FilterOutlined, PlusOutlined, SearchOutlined, WarningOutlined } from '@ant-design/icons';
import { createTradeSetup, getScreenerData, getSectors } from '../../services/api';

function formatNPR(value) {
    if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
    return `Rs. ${Number(value).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const presetOptions = [
    { value: null, label: 'All Stocks' },
    { value: 'momentum', label: 'Momentum continuation' },
    { value: 'breakout', label: 'Breakout candidate' },
    { value: 'pullback', label: 'Pullback in bullish trend' },
    { value: 'reversion', label: 'Mean-reversion bounce' },
    { value: 'avoid', label: 'Avoid / illiquid / weak-structure' },
];

export default function TechnicalScreener() {
    const queryClient = useQueryClient();
    const [sectorFilter, setSectorFilter] = useState(null);
    const [searchText, setSearchText] = useState('');
    const [preset, setPreset] = useState(null);
    const [form] = Form.useForm();
    const [setupModal, setSetupModal] = useState(null);

    const { data: screenerRaw, isLoading } = useQuery({
        queryKey: ['screener-data'],
        queryFn: () => getScreenerData().then((r) => r.data),
        staleTime: 120000,
    });

    const { data: sectors } = useQuery({
        queryKey: ['sectors'],
        queryFn: () => getSectors().then((r) => r.data),
        staleTime: 600000,
    });

    const createSetupMutation = useMutation({
        mutationFn: (payload) => createTradeSetup(payload),
        onSuccess: () => {
            message.success('Setup created from screener');
            setSetupModal(null);
            form.resetFields();
            queryClient.invalidateQueries({ queryKey: ['trade-setups'] });
        },
        onError: (err) => message.error(err?.response?.data?.detail || 'Failed to create setup'),
    });

    const allStocks = useMemo(
        () => (screenerRaw?.stocks?.filter((stock) => stock.has_technicals) || []),
        [screenerRaw]
    );

    const filteredStocks = useMemo(() => {
        let result = [...allStocks];
        if (searchText) {
            const term = searchText.toLowerCase();
            result = result.filter((stock) => stock.symbol.toLowerCase().includes(term) || (stock.name || '').toLowerCase().includes(term));
        }
        if (sectorFilter) {
            result = result.filter((stock) => stock.sector === sectorFilter);
        }
        if (preset === 'momentum') {
            result = result.filter((stock) => stock.setup_type_tags?.includes('Momentum continuation'));
        } else if (preset === 'breakout') {
            result = result.filter((stock) => stock.setup_type_tags?.includes('Breakout candidate'));
        } else if (preset === 'pullback') {
            result = result.filter((stock) => stock.setup_type_tags?.includes('Pullback in bullish trend'));
        } else if (preset === 'reversion') {
            result = result.filter((stock) => stock.setup_type_tags?.includes('Mean-reversion bounce'));
        } else if (preset === 'avoid') {
            result = result.filter((stock) => stock.setup_type_tags?.includes('Avoid / weak structure') || stock.liquidity_grade === 'D' || stock.stale_technical_data);
        }
        return result;
    }, [allStocks, preset, searchText, sectorFilter]);

    const openCreateSetup = (stock) => {
        setSetupModal(stock);
        form.setFieldsValue({
            symbol: stock.symbol,
            entry_price: stock.ltp,
            entry_zone_low: stock.ltp,
            entry_zone_high: stock.ltp,
            initial_stop_loss: stock.suggested_stop_loss,
            current_stop_loss: stock.suggested_stop_loss,
            target_1: stock.suggested_target_1,
            allocated_qty: 100,
            risk_percent: 2,
            strategy_type: stock.setup_type_tags?.[0],
            setup_quality: stock.liquidity_grade,
            thesis: `${stock.setup_type_tags?.[0] || 'Swing setup'} | Liquidity ${stock.liquidity_grade} | ATR ${stock.atr_14 || 'n/a'}`,
        });
    };

    const columns = [
        {
            title: 'Symbol',
            dataIndex: 'symbol',
            width: 110,
            fixed: 'left',
            render: (symbol, stock) => (
                <div>
                    <div style={{ fontWeight: 700, color: 'var(--accent-primary)' }}>{symbol}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{stock.sector || '—'}</div>
                </div>
            ),
        },
        { title: 'LTP', dataIndex: 'ltp', width: 100, align: 'right', render: (v) => formatNPR(v) },
        { title: 'RSI', dataIndex: 'rsi_14', width: 70, align: 'right', render: (v) => (v != null ? v.toFixed(0) : '—') },
        { title: 'ATR', dataIndex: 'atr_14', width: 80, align: 'right', render: (v) => (v != null ? v.toFixed(2) : '—') },
        {
            title: 'Liquidity',
            width: 110,
            render: (_, stock) => (
                <Space direction="vertical" size={4}>
                    <Tag color={stock.liquidity_grade === 'A' ? 'green' : stock.liquidity_grade === 'B' ? 'cyan' : stock.liquidity_grade === 'C' ? 'gold' : 'red'}>
                        {stock.liquidity_grade || '—'}
                    </Tag>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{formatNPR(stock.adt_20, 0)}</span>
                </Space>
            ),
        },
        {
            title: 'Setup Tags',
            width: 220,
            render: (_, stock) => (
                <Space wrap>
                    {(stock.setup_type_tags || []).map((tag) => <Tag key={tag}>{tag}</Tag>)}
                    {stock.stale_technical_data ? <Tag color="orange">Stale</Tag> : null}
                </Space>
            ),
        },
        {
            title: 'Risk',
            width: 150,
            render: (_, stock) => (
                <div>
                    <div>{stock.volatility_risk_tag || '—'}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Stop {formatNPR(stock.suggested_stop_loss)}</div>
                </div>
            ),
        },
        {
            title: 'Action',
            width: 130,
            render: (_, stock) => (
                <Button type="primary" ghost size="small" icon={<PlusOutlined />} onClick={() => openCreateSetup(stock)}>
                    Create Setup
                </Button>
            ),
        },
    ];

    return (
        <div className="animate-in">
            <div className="stat-card" style={{ padding: '16px 20px', marginBottom: 20 }}>
                <Row gutter={[16, 12]} align="middle">
                    <Col xs={24} sm={8} md={8}>
                        <Input placeholder="Search symbol or name..." prefix={<SearchOutlined style={{ color: 'var(--text-muted)' }} />} value={searchText} onChange={(e) => setSearchText(e.target.value)} allowClear />
                    </Col>
                    <Col xs={24} sm={8} md={8}>
                        <Select placeholder="All sectors" value={sectorFilter} onChange={setSectorFilter} allowClear style={{ width: '100%' }}>
                            {(sectors || []).map((sector) => <Select.Option key={sector} value={sector}>{sector}</Select.Option>)}
                        </Select>
                    </Col>
                    <Col xs={24} md={8}>
                        <Select placeholder="Trading preset..." value={preset} onChange={setPreset} allowClear style={{ width: '100%' }} options={presetOptions} />
                    </Col>
                </Row>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, padding: '0 4px' }}>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                    <FilterOutlined style={{ marginRight: 6 }} /> Showing <strong style={{ color: 'var(--text-primary)' }}>{filteredStocks.length}</strong> of {allStocks.length} stocks
                    {preset ? <Tag color="purple" style={{ marginLeft: 8, fontSize: 10 }}>{presetOptions.find((option) => option.value === preset)?.label}</Tag> : null}
                </div>
            </div>

            {isLoading ? (
                <div style={{ textAlign: 'center', padding: '80px 0' }}><Spin size="large" tip="Loading screener..." /></div>
            ) : filteredStocks.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '60px 0' }}><Empty description={<span style={{ color: 'var(--text-secondary)' }}>No stocks match</span>} /></div>
            ) : (
                <Table className="portfolio-table" dataSource={filteredStocks} columns={columns} rowKey="symbol" size="small" scroll={{ x: 980 }} pagination={{ defaultPageSize: 25, showSizeChanger: true }} />
            )}

            <Modal
                title={setupModal ? `Create Setup: ${setupModal.symbol}` : 'Create Setup'}
                open={!!setupModal}
                onCancel={() => setSetupModal(null)}
                onOk={() => form.submit()}
                confirmLoading={createSetupMutation.isPending}
            >
                <Form
                    form={form}
                    layout="vertical"
                    onFinish={(values) => createSetupMutation.mutate({ ...values, status: 'WATCHLIST', strategy_note: values.thesis })}
                >
                    {setupModal?.stale_technical_data ? (
                        <div style={{ marginBottom: 12 }}>
                            <Tag color="orange" icon={<WarningOutlined />}>Technical snapshot is stale. Review before activating.</Tag>
                        </div>
                    ) : null}
                    <Form.Item name="symbol" label="Symbol">
                        <Input disabled />
                    </Form.Item>
                    <Row gutter={16}>
                        <Col span={8}><Form.Item name="entry_zone_low" label="Entry Low"><InputNumber min={0.01} step={0.01} style={{ width: '100%' }} /></Form.Item></Col>
                        <Col span={8}><Form.Item name="entry_zone_high" label="Entry High"><InputNumber min={0.01} step={0.01} style={{ width: '100%' }} /></Form.Item></Col>
                        <Col span={8}><Form.Item name="allocated_qty" label="Quantity"><InputNumber min={1} step={1} style={{ width: '100%' }} /></Form.Item></Col>
                    </Row>
                    <Row gutter={16}>
                        <Col span={8}><Form.Item name="initial_stop_loss" label="Initial Stop"><InputNumber min={0.01} step={0.01} style={{ width: '100%' }} /></Form.Item></Col>
                        <Col span={8}><Form.Item name="current_stop_loss" label="Current Stop"><InputNumber min={0.01} step={0.01} style={{ width: '100%' }} /></Form.Item></Col>
                        <Col span={8}><Form.Item name="target_1" label="Target 1"><InputNumber min={0.01} step={0.01} style={{ width: '100%' }} /></Form.Item></Col>
                    </Row>
                    <Row gutter={16}>
                        <Col span={12}><Form.Item name="strategy_type" label="Strategy Type"><Input /></Form.Item></Col>
                        <Col span={12}><Form.Item name="setup_quality" label="Setup Quality"><Input /></Form.Item></Col>
                    </Row>
                    <Form.Item name="risk_percent" label="Risk %"><InputNumber min={0.1} max={10} step={0.1} style={{ width: '100%' }} /></Form.Item>
                    <Form.Item name="thesis" label="Thesis"><Input.TextArea rows={2} /></Form.Item>
                </Form>
            </Modal>
        </div>
    );
}
