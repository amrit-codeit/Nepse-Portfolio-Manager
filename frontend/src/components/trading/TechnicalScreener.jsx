import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Col, Empty, Form, Input, InputNumber, Modal, Row, Select, Space, Spin, Table, Tag, Tooltip, message, Segmented, Divider } from 'antd';
import { FilterOutlined, PlusOutlined, SearchOutlined, WarningOutlined, SyncOutlined, DatabaseOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { createTradeSetup, getScreenerData, getSectors, getTechnicalScreener } from '../../services/api';

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

const TECHNICAL_OPTIONS = {
    rsi: [
        { label: '70-100', value: '1' },
        { label: '30-70', value: '2' },
        { label: '0-30', value: '3' }
    ],
    macd: [
        { label: 'Up', value: '1' },
        { label: 'Down', value: '2' }
    ],
    sma_200: [
        { label: 'Above', value: '1' },
        { label: 'Below', value: '2' }
    ],
    sma_520: [
        { label: 'Bullish', value: '1' },
        { label: 'Bearish', value: '2' }
    ],
    bollinger_band: [
        { label: 'Above Upper Band', value: '1' },
        { label: 'Insider Bollinger Band', value: '2' },
        { label: 'Below Lower Band', value: '3' },
        { label: 'Between Upper & Middle', value: '4' },
        { label: 'Between Middle & Lower', value: '5' }
    ],
    stochastic_14: [
        { label: '70-100', value: '1' },
        { label: '30-70', value: '2' }
    ],
    sma_20: [
        { label: 'Above', value: '1' },
        { label: 'Below', value: '2' }
    ],
    sma_50: [
        { label: 'Bullish', value: '1' },
        { label: 'Bearish', value: '2' }
    ],
    mfi_14: [
        { label: '70-100', value: '1' },
        { label: '30-70', value: '2' },
        { label: '0-30', value: '3' }
    ],
    ltp: [
        { label: 'Below 200', value: '1' },
        { label: 'Below 500', value: '2' },
        { label: 'Above 500', value: '3' }
    ],
    beta_3m: [
        { label: 'Above 1', value: '1' },
        { label: 'Below 1', value: '2' }
    ],
    sector: [
        { label: 'Commercial Banks', value: 'BANKING' },
        { label: 'Development Banks', value: 'DEVBANK' },
        { label: 'Finance', value: 'FINANCE' },
        { label: 'Hotels', value: 'HOTELS' },
        { label: 'Hydro Power', value: 'HYDROPOWER' },
        { label: 'Investment', value: 'INVESTMENT' },
        { label: 'Life Insurance', value: 'LIFEINSU' },
        { label: 'Manufacturing', value: 'MANUFACTURE' },
        { label: 'Microfinance', value: 'MICROFINANCE' },
        { label: 'Mutual Fund', value: 'MUTUAL' },
        { label: 'Non Life Insurance', value: 'NONLIFEINSU' },
        { label: 'Others', value: 'OTHERS' },
        { label: 'Tradings', value: 'TRADING' },
    ]
};

export default function TechnicalScreener() {
    const queryClient = useQueryClient();
    const [mode, setMode] = useState('cached'); // 'cached' or 'live'
    
    // Cached mode filters
    const [sectorFilter, setSectorFilter] = useState(null);
    const [searchText, setSearchText] = useState('');
    const [preset, setPreset] = useState(null);
    
    // Live scan mode state
    const [form] = Form.useForm();
    const [scanResults, setScanResults] = useState(null);
    
    const [setupModal, setSetupModal] = useState(null);
    const [setupForm] = Form.useForm();

    // Data fetching
    const { data: screenerRaw, isLoading: loadingCached } = useQuery({
        queryKey: ['screener-data'],
        queryFn: () => getScreenerData().then((r) => r.data),
        staleTime: 120000,
        enabled: mode === 'cached'
    });

    const { data: sectors } = useQuery({
        queryKey: ['sectors'],
        queryFn: () => getSectors().then((r) => r.data),
        staleTime: 600000,
    });

    const runLiveScan = useMutation({
        mutationFn: (values) => getTechnicalScreener(values).then(r => r.data),
        onSuccess: (data) => {
            message.success(`Found ${data.total} matching stocks via NepseAlpha`);
            setScanResults(data.stocks || []);
        },
        onError: (err) => message.error(err?.response?.data?.detail || 'Failed to fetch from NepseAlpha')
    });

    const createSetupMutation = useMutation({
        mutationFn: (payload) => createTradeSetup(payload),
        onSuccess: () => {
            message.success('Setup created from screener');
            setSetupModal(null);
            setupForm.resetFields();
            queryClient.invalidateQueries({ queryKey: ['trade-setups'] });
        },
        onError: (err) => message.error(err?.response?.data?.detail || 'Failed to create setup'),
    });

    // CACHED FILTERING
    const allStocks = useMemo(
        () => (screenerRaw?.stocks?.filter((stock) => stock.has_technicals) || []),
        [screenerRaw]
    );

    const filteredCachedStocks = useMemo(() => {
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
        setupForm.setFieldsValue({
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
            thesis: `${stock.setup_type_tags?.[0] || 'Swing setup'} | Liquidity ${stock.liquidity_grade || 'C'} | ATR ${stock.atr_14 || 'n/a'}`,
        });
    };

    const cachedColumns = [
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

    const liveColumns = [
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
        { title: 'RSI', dataIndex: 'rsi_14', width: 80, align: 'right', render: (v) => (v != null ? v.toFixed(2) : '—') },
        { title: 'MACD', dataIndex: 'macd_value', width: 80, align: 'right', render: (v) => (v != null ? v.toFixed(2) : '—') },
        { title: 'MACD Signal', dataIndex: 'macd_signal', width: 100, align: 'right', render: (v) => (v != null ? v.toFixed(2) : '—') },
        { title: 'SMA 20', dataIndex: 'sma_20', width: 90, align: 'right', render: (v) => formatNPR(v) },
        { title: 'SMA 50', dataIndex: 'sma_50', width: 90, align: 'right', render: (v) => formatNPR(v) },
        { title: 'SMA 200', dataIndex: 'sma_200', width: 90, align: 'right', render: (v) => formatNPR(v) },
        { title: 'BB Upper', dataIndex: 'bollinger_upper', width: 90, align: 'right', render: (v) => formatNPR(v) },
        { title: 'BB Lower', dataIndex: 'bollinger_lower', width: 90, align: 'right', render: (v) => formatNPR(v) },
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

    const renderCachedMode = () => (
        <>
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
                    <FilterOutlined style={{ marginRight: 6 }} /> Showing <strong style={{ color: 'var(--text-primary)' }}>{filteredCachedStocks.length}</strong> of {allStocks.length} stocks
                    {preset ? <Tag color="purple" style={{ marginLeft: 8, fontSize: 10 }}>{presetOptions.find((option) => option.value === preset)?.label}</Tag> : null}
                </div>
            </div>

            {loadingCached ? (
                <div style={{ textAlign: 'center', padding: '80px 0' }}><Spin size="large" tip="Loading screener..." /></div>
            ) : filteredCachedStocks.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '60px 0' }}><Empty description={<span style={{ color: 'var(--text-secondary)' }}>No stocks match</span>} /></div>
            ) : (
                <Table className="portfolio-table" dataSource={filteredCachedStocks} columns={cachedColumns} rowKey="symbol" size="small" scroll={{ x: 980 }} pagination={{ defaultPageSize: 25, showSizeChanger: true }} />
            )}
        </>
    );

    const renderLiveMode = () => (
        <>
            <div className="stat-card" style={{ padding: '24px', marginBottom: 24 }}>
                <Form
                    form={form}
                    layout="vertical"
                    onFinish={(values) => runLiveScan.mutate(values)}
                    className="dense-form"
                >
                    <Row gutter={[16, 0]}>
                        <Col xs={12} sm={8} md={6}>
                            <Form.Item name="rsi" label="RSI">
                                <Select options={TECHNICAL_OPTIONS.rsi} allowClear placeholder="Any" />
                            </Form.Item>
                        </Col>
                        <Col xs={12} sm={8} md={6}>
                            <Form.Item name="macd" label="MACD VS Signal">
                                <Select options={TECHNICAL_OPTIONS.macd} allowClear placeholder="Any" />
                            </Form.Item>
                        </Col>
                        <Col xs={12} sm={8} md={6}>
                            <Form.Item name="sma_200" label="Price > 200 SMA">
                                <Select options={TECHNICAL_OPTIONS.sma_200} allowClear placeholder="Any" />
                            </Form.Item>
                        </Col>
                        <Col xs={12} sm={8} md={6}>
                            <Form.Item name="sma_520" label="5 SMA > 20 SMA">
                                <Select options={TECHNICAL_OPTIONS.sma_520} allowClear placeholder="Any" />
                            </Form.Item>
                        </Col>
                        <Col xs={12} sm={8} md={6}>
                            <Form.Item name="bollinger_band" label="Bollinger Band(20)">
                                <Select options={TECHNICAL_OPTIONS.bollinger_band} allowClear placeholder="Any" />
                            </Form.Item>
                        </Col>
                        <Col xs={12} sm={8} md={6}>
                            <Form.Item name="stochastic_14" label="Stochastic 14">
                                <Select options={TECHNICAL_OPTIONS.stochastic_14} allowClear placeholder="Any" />
                            </Form.Item>
                        </Col>
                        <Col xs={12} sm={8} md={6}>
                            <Form.Item name="sma_20" label="Price > 20 SMA">
                                <Select options={TECHNICAL_OPTIONS.sma_20} allowClear placeholder="Any" />
                            </Form.Item>
                        </Col>
                        <Col xs={12} sm={8} md={6}>
                            <Form.Item name="sma_50" label="Price > 50 SMA">
                                <Select options={TECHNICAL_OPTIONS.sma_50} allowClear placeholder="Any" />
                            </Form.Item>
                        </Col>
                        <Col xs={12} sm={8} md={6}>
                            <Form.Item name="mfi_14" label="MFI-14">
                                <Select options={TECHNICAL_OPTIONS.mfi_14} allowClear placeholder="Any" />
                            </Form.Item>
                        </Col>
                        <Col xs={12} sm={8} md={6}>
                            <Form.Item name="ltp" label="LTP">
                                <Select options={TECHNICAL_OPTIONS.ltp} allowClear placeholder="Any" />
                            </Form.Item>
                        </Col>
                        <Col xs={12} sm={8} md={6}>
                            <Form.Item name="beta_3m" label="3 Month Beta">
                                <Select options={TECHNICAL_OPTIONS.beta_3m} allowClear placeholder="Any" />
                            </Form.Item>
                        </Col>
                        <Col xs={12} sm={8} md={6}>
                            <Form.Item name="sector" label="Sector">
                                <Select options={TECHNICAL_OPTIONS.sector} allowClear placeholder="Any" />
                            </Form.Item>
                        </Col>
                    </Row>
                    <Divider style={{ margin: '12px 0 24px 0' }} />
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
                        <Button onClick={() => { form.resetFields(); setScanResults(null); }}>
                            Reset Defaults
                        </Button>
                        <Button type="primary" htmlType="submit" icon={<ThunderboltOutlined />} loading={runLiveScan.isPending}>
                            Run Live Scan
                        </Button>
                    </div>
                </Form>
            </div>

            {runLiveScan.isPending ? (
                <div style={{ textAlign: 'center', padding: '60px 0' }}><Spin size="large" tip="Scanning NepseAlpha database..." /></div>
            ) : scanResults ? (
                <div className="animate-in">
                    <div style={{ marginBottom: 12, fontSize: 13, color: 'var(--text-secondary)' }}>
                        <FilterOutlined style={{ marginRight: 6 }} /> Found <strong style={{ color: 'var(--text-primary)' }}>{scanResults.length}</strong> matches via Live Scan
                    </div>
                    {scanResults.length === 0 ? (
                        <Empty description={<span style={{ color: 'var(--text-secondary)' }}>No stocks matched this criteria</span>} />
                    ) : (
                        <Table 
                            className="portfolio-table" 
                            dataSource={scanResults} 
                            columns={liveColumns} 
                            rowKey="symbol" 
                            size="small" 
                            scroll={{ x: 1050 }} 
                            pagination={{ defaultPageSize: 25, showSizeChanger: true }} 
                        />
                    )}
                </div>
            ) : (
                <Empty 
                    image={Empty.PRESENTED_IMAGE_SIMPLE} 
                    description={<span style={{ color: 'var(--text-muted)' }}>Configure filters and run scan to see live technical data from NepseAlpha</span>} 
                />
            )}
        </>
    );

    return (
        <div className="animate-in">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                <Segmented
                    options={[
                        { label: <span><DatabaseOutlined /> Local Scan (AI Tags)</span>, value: 'cached' },
                        { label: <span><SyncOutlined /> Live Scan (NepseAlpha)</span>, value: 'live' },
                    ]}
                    value={mode}
                    onChange={(v) => {
                        setMode(v);
                        if (v === 'live' && !scanResults) {
                            // form.submit();
                        }
                    }}
                    size="large"
                />
            </div>

            {mode === 'cached' ? renderCachedMode() : renderLiveMode()}

            <Modal
                title={setupModal ? `Create Setup: ${setupModal.symbol}` : 'Create Setup'}
                open={!!setupModal}
                onCancel={() => setSetupModal(null)}
                onOk={() => setupForm.submit()}
                confirmLoading={createSetupMutation.isPending}
            >
                <Form
                    form={setupForm}
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
