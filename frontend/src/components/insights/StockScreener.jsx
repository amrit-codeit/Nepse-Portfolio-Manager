import { useState, useMemo } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
    Table, Select, Tag, Input, Space, Row, Col, Segmented, Spin, Empty, Tooltip, Progress,
    Button, Divider, Typography, Collapse, Form, InputNumber
} from 'antd';
import {
    SearchOutlined, FilterOutlined, RiseOutlined, FallOutlined,
    BankOutlined, ExperimentOutlined,
    DashboardOutlined, FundOutlined, SyncOutlined, ThunderboltOutlined,
    RocketOutlined, DollarOutlined, SafetyCertificateOutlined, SettingOutlined,
    HistoryOutlined
} from '@ant-design/icons';
import { getScreenerData, getSectors, getFundamentalScreener } from '../../services/api';

const { Text, Title } = Typography;
const { Panel } = Collapse;

function formatNPR(value) {
    if (value === null || value === undefined) return '—';
    return `Rs. ${Number(value).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const CURATED_PRESETS = {
    'VALUE': {
        label: '💎 Value Investing (Undervalued)',
        description: 'Focuses on stocks trading below their intrinsic value with low P/E and Graham Number discount.',
        filters: { pe_ratio: '2', graham_num: '2' }
    },
    'GROWTH': {
        label: '🚀 High Growth (Aggressive)',
        description: 'Identifies companies with high ROE and strong earnings growth potential.',
        filters: { roe: '1', yoy_growth: '1' }
    },
    'DIVIDEND': {
        label: '💰 High Dividend Yield',
        description: 'Selects stable companies with high dividend payouts (> 5%).',
        filters: { total_dividend_to_ltp: '2' }
    },
    'BLUE_CHIP_BANK': {
        label: '🏦 Blue Chip Banking',
        description: 'Safe commercial banks with decent returns and reasonable valuations.',
        filters: { sector: 'BANKING', pe_ratio: '2', roe: '1' }
    }
};

const OPTIONS = {
    pe_ratio: [
        { label: 'Below 10', value: '1' },
        { label: 'Below 20', value: '2' },
        { label: 'Below 30', value: '3' },
    ],
    roe: [
        { label: 'Above 10', value: '1' },
        { label: 'Above 20', value: '2' },
        { label: 'Above 30', value: '3' },
    ],
    total_dividend_to_ltp: [
        { label: 'Above 2.5%', value: '1' },
        { label: 'Above 5%', value: '2' },
    ],
    ltp: [
        { label: 'Below 200', value: '1' },
        { label: 'Below 500', value: '2' },
        { label: 'Above 500', value: '3' },
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

export default function StockScreener({ onSelectSymbol }) {
    const [mode, setMode] = useState('cached'); // 'cached' or 'live'
    const [sectorFilter, setSectorFilter] = useState(null);
    const [searchText, setSearchText] = useState('');
    const [quickFilter, setQuickFilter] = useState(null);
    
    // Fundamental filters for Live mode
    const [form] = Form.useForm();
    const [scanResults, setScanResults] = useState(null);

    const { data: screenerRaw, isLoading: loadingCached } = useQuery({
        queryKey: ['screener-data'],
        queryFn: () => getScreenerData().then(r => r.data),
        staleTime: 120000,
        enabled: mode === 'cached'
    });

    const { data: sectors } = useQuery({
        queryKey: ['sectors'],
        queryFn: () => getSectors().then(r => r.data),
        staleTime: 600000,
    });

    const scanMutation = useMutation({
        mutationFn: (filters) => getFundamentalScreener(filters).then(r => r.data),
        onSuccess: (data) => {
            setScanResults(data.stocks);
            setMode('live'); // Switch to live view to show results
        }
    });

    const handlePresetChange = (presetKey) => {
        if (!presetKey) return;
        const preset = CURATED_PRESETS[presetKey];
        if (preset) {
            form.setFieldsValue(preset.filters);
            // Optionally auto-trigger scan if user wants
        }
    };

    const handleScan = () => {
        const values = form.getFieldsValue();
        scanMutation.mutate(values);
    };

    const allStocks = mode === 'live' ? (scanResults || []) : (screenerRaw?.stocks || []);

    // Apply filters
    const filteredStocks = useMemo(() => {
        let result = [...allStocks];

        // Search filter
        if (searchText) {
            const term = searchText.toLowerCase();
            result = result.filter(s =>
                s.symbol.toLowerCase().includes(term) ||
                (s.name || '').toLowerCase().includes(term)
            );
        }

        // Sector filter
        if (sectorFilter) {
            result = result.filter(s => s.sector === sectorFilter);
        }

        if (mode === 'cached') {
            // Fundamental only mode for cached
            result = result.filter(s => s.has_fundamentals);

            // Quick filters for cached
            if (quickFilter === 'undervalued') {
                result = result.filter(s => s.pe_ratio != null && s.pe_ratio > 0 && s.pe_ratio < 15 && s.eps_ttm > 0);
            } else if (quickFilter === 'high_roe') {
                result = result.filter(s => s.roe_ttm != null && s.roe_ttm > 0.12);
            }
        }

        return result;
    }, [allStocks, searchText, sectorFilter, quickFilter, mode]);

    const columns = [
        {
            title: 'Symbol',
            dataIndex: 'symbol',
            width: 100,
            fixed: 'left',
            sorter: (a, b) => a.symbol.localeCompare(b.symbol),
            render: (sym) => (
                <a
                    onClick={(e) => {
                        e.stopPropagation();
                        onSelectSymbol?.(sym);
                    }}
                    style={{ fontWeight: 700, color: 'var(--accent-primary)', cursor: 'pointer' }}
                >
                    {sym}
                </a>
            ),
        },
        {
            title: 'Sector',
            dataIndex: 'sector',
            width: 140,
            ellipsis: true,
            render: v => <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{v || '—'}</span>,
        },
        {
            title: 'LTP',
            dataIndex: 'ltp',
            width: 100,
            align: 'right',
            sorter: (a, b) => (a.ltp || 0) - (b.ltp || 0),
            render: v => v ? formatNPR(v) : '—',
        },
        {
            title: mode === 'live' ? 'P/E (Live)' : 'P/E',
            dataIndex: 'pe_ratio',
            width: 70,
            align: 'right',
            sorter: (a, b) => (a.pe_ratio || 999) - (b.pe_ratio || 999),
            render: v => v != null ? (
                <span style={{ color: v < 15 ? '#00b894' : v < 30 ? '#fdcb6e' : '#d63031' }}>
                    {v.toFixed(1)}
                </span>
            ) : '—',
        },
        {
            title: mode === 'live' ? 'EPS (Live)' : 'EPS',
            dataIndex: 'eps_ttm',
            width: 80,
            align: 'right',
            sorter: (a, b) => (a.eps_ttm || 0) - (b.eps_ttm || 0),
            render: v => v != null ? (
                <span style={{ color: v > 0 ? '#00b894' : '#d63031' }}>{v.toFixed(2)}</span>
            ) : '—',
        },
        {
            title: mode === 'live' ? 'ROE (Live)' : 'ROE',
            dataIndex: 'roe_ttm',
            width: 70,
            align: 'right',
            sorter: (a, b) => (a.roe_ttm || 0) - (b.roe_ttm || 0),
            render: v => {
                const val = mode === 'live' ? v : (v * 100);
                if (val == null) return '—';
                return <span style={{ color: val > 12 ? '#00b894' : '#fdcb6e' }}>{val.toFixed(1)}%</span>;
            },
        },
        {
            title: 'Valuation',
            dataIndex: 'valuation',
            width: 120,
            hidden: mode === 'cached',
            render: v => v ? <Tag color={v === 'Undervalued' ? 'green' : v === 'Overvalued' ? 'red' : 'orange'}>{v}</Tag> : '—',
        }
    ].filter(c => !c.hidden);

    return (
        <div className="animate-in">
            {/* Mode Switch & Presets */}
            <div className="stat-card" style={{ padding: '16px 20px', marginBottom: 20 }}>
                <Row gutter={[24, 16]} align="middle">
                    <Col xs={24} md={8}>
                        <div style={{ marginBottom: 8, fontSize: 12, color: 'var(--text-muted)' }}>Screener Mode</div>
                        <Segmented
                            block
                            size="large"
                            value={mode}
                            onChange={setMode}
                            options={[
                                { label: 'Cached Portfolio Data', value: 'cached', icon: <HistoryOutlined /> },
                                { label: 'Live Fundamental Scan', value: 'live', icon: <ThunderboltOutlined /> },
                            ]}
                        />
                    </Col>
                    <Col xs={24} md={16}>
                        <div style={{ marginBottom: 8, fontSize: 12, color: 'var(--text-muted)' }}>Curated Strategy Presets</div>
                        <Select
                            placeholder="Select a screening strategy..."
                            size="large"
                            style={{ width: '100%' }}
                            onChange={handlePresetChange}
                            allowClear
                            options={Object.entries(CURATED_PRESETS).map(([key, val]) => ({
                                label: val.label,
                                value: key
                            }))}
                        />
                    </Col>
                </Row>

                {mode === 'live' && (
                    <>
                        <Divider style={{ margin: '16px 0' }} />
                        <Form form={form} layout="vertical">
                            <Row gutter={[16, 0]}>
                                <Col xs={12} sm={6} md={4}>
                                    <Form.Item label="P/E Ratio" name="pe_ratio">
                                        <Select allowClear placeholder="Any">
                                            {OPTIONS.pe_ratio.map(o => <Select.Option key={o.value} value={o.value}>{o.label}</Select.Option>)}
                                        </Select>
                                    </Form.Item>
                                </Col>
                                <Col xs={12} sm={6} md={4}>
                                    <Form.Item label="ROE" name="roe">
                                        <Select allowClear placeholder="Any">
                                            {OPTIONS.roe.map(o => <Select.Option key={o.value} value={o.value}>{o.label}</Select.Option>)}
                                        </Select>
                                    </Form.Item>
                                </Col>
                                <Col xs={12} sm={6} md={4}>
                                    <Form.Item label="Dividend Yield" name="total_dividend_to_ltp">
                                        <Select allowClear placeholder="Any">
                                            {OPTIONS.total_dividend_to_ltp.map(o => <Select.Option key={o.value} value={o.value}>{o.label}</Select.Option>)}
                                        </Select>
                                    </Form.Item>
                                </Col>
                                <Col xs={12} sm={6} md={4}>
                                    <Form.Item label="LTP" name="ltp">
                                        <Select allowClear placeholder="Any">
                                            {OPTIONS.ltp.map(o => <Select.Option key={o.value} value={o.value}>{o.label}</Select.Option>)}
                                        </Select>
                                    </Form.Item>
                                </Col>
                                <Col xs={24} sm={12} md={4}>
                                    <Form.Item label="Sector" name="sector">
                                        <Select allowClear placeholder="Any Sector">
                                            {OPTIONS.sector.map(s => <Select.Option key={s.value} value={s.value}>{s.label}</Select.Option>)}
                                        </Select>
                                    </Form.Item>
                                </Col>
                                <Col xs={24} sm={12} md={4} style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: 24 }}>
                                    <Button 
                                        type="primary" 
                                        block 
                                        size="large" 
                                        icon={<RocketOutlined />} 
                                        onClick={handleScan}
                                        loading={scanMutation.isPending}
                                    >
                                        Scan Market
                                    </Button>
                                </Col>
                            </Row>
                        </Form>
                    </>
                )}
                
                {mode === 'cached' && (
                    <Row gutter={[16, 12]} style={{ marginTop: 16 }}>
                        <Col xs={24} sm={12} md={8}>
                            <Input
                                placeholder="Search symbol or name..."
                                prefix={<SearchOutlined style={{ color: 'var(--text-muted)' }} />}
                                value={searchText}
                                onChange={e => setSearchText(e.target.value)}
                                allowClear
                            />
                        </Col>
                        <Col xs={24} sm={12} md={8}>
                            <Select
                                placeholder="All Sectors"
                                value={sectorFilter}
                                onChange={setSectorFilter}
                                allowClear
                                style={{ width: '100%' }}
                            >
                                {(sectors || []).map(s => (
                                    <Select.Option key={s} value={s}>{s}</Select.Option>
                                ))}
                            </Select>
                        </Col>
                    </Row>
                )}
            </div>

            {/* Results Count & Routing Note */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, padding: '0 4px' }}>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                    <FilterOutlined style={{ marginRight: 6 }} />
                    {mode === 'live' ? 'Live Scan Results' : 'Cached Data'} — 
                    Showing <strong style={{ color: 'var(--text-primary)' }}>{filteredStocks.length}</strong> stocks
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    <ThunderboltOutlined style={{ marginRight: 6 }} />
                    Click row to view <strong>Stock 360°</strong> Analysis
                </div>
            </div>

            {/* Table */}
            {(loadingCached || scanMutation.isPending) ? (
                <div style={{ textAlign: 'center', padding: '80px 0' }}>
                    <Spin size="large" tip={scanMutation.isPending ? "Scraping NepseAlpha live data..." : "Loading screener data..."} />
                </div>
            ) : filteredStocks.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '60px 0' }}>
                    <Empty description={<span style={{ color: 'var(--text-secondary)' }}>No stocks match the current filters. Try relaxing your criteria or scanning the market.</span>} />
                </div>
            ) : (
                <Table
                    className="portfolio-table"
                    dataSource={filteredStocks}
                    columns={columns}
                    rowKey="symbol"
                    size="small"
                    scroll={{ x: 1100 }}
                    pagination={{
                        defaultPageSize: 25,
                        showSizeChanger: true,
                        pageSizeOptions: ['25', '50', '100', '200'],
                        showTotal: (t) => `${t} stocks`,
                        size: 'small',
                    }}
                    onRow={(record) => ({
                        onClick: () => onSelectSymbol?.(record.symbol),
                        style: { cursor: 'pointer' },
                    })}
                />
            )}
        </div>
    );
}
