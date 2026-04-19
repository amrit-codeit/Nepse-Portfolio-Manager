import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
    Table, Select, Tag, Input, Space, Row, Col, Segmented, Spin, Empty, Tooltip, Progress
} from 'antd';
import {
    SearchOutlined, FilterOutlined, RiseOutlined, FallOutlined,
    ThunderboltOutlined, BankOutlined, ExperimentOutlined,
    DashboardOutlined, BarChartOutlined, FundOutlined,
} from '@ant-design/icons';
import { getScreenerData, getSectors } from '../../services/api';

function formatNPR(value) {
    if (value === null || value === undefined) return '—';
    return `Rs. ${Number(value).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function getRSIColor(rsi) {
    if (rsi >= 70) return '#d63031';
    if (rsi >= 60) return '#e17055';
    if (rsi >= 40) return '#00b894';
    if (rsi >= 30) return '#0984e3';
    return '#6c5ce7';
}

export default function StockScreener({ onSelectSymbol }) {
    const [filterMode, setFilterMode] = useState('both');
    const [sectorFilter, setSectorFilter] = useState(null);
    const [searchText, setSearchText] = useState('');
    const [quickFilter, setQuickFilter] = useState(null);

    const { data: screenerRaw, isLoading } = useQuery({
        queryKey: ['screener-data'],
        queryFn: () => getScreenerData().then(r => r.data),
        staleTime: 120000, // 2 min cache
    });

    const { data: sectors } = useQuery({
        queryKey: ['sectors'],
        queryFn: () => getSectors().then(r => r.data),
        staleTime: 600000,
    });

    const allStocks = screenerRaw?.stocks || [];

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

        // Mode filter: fundamental only, technical only, both
        if (filterMode === 'fundamental') {
            result = result.filter(s => s.has_fundamentals);
        } else if (filterMode === 'technical') {
            result = result.filter(s => s.has_technicals);
        } else {
            // 'both' — show all but prioritize those with both
            result = result.filter(s => s.has_fundamentals || s.has_technicals);
        }

        // Quick filters — actionable insight filters 
        if (quickFilter === 'oversold') {
            result = result.filter(s => s.rsi_14 != null && s.rsi_14 < 30);
        } else if (quickFilter === 'overbought') {
            result = result.filter(s => s.rsi_14 != null && s.rsi_14 > 70);
        } else if (quickFilter === 'volume_surge') {
            result = result.filter(s => s.vol_ratio != null && s.vol_ratio > 2.0);
        } else if (quickFilter === 'bullish_ema') {
            result = result.filter(s => s.ema_200_status === 'Bullish' && s.ema_50_status === 'Bullish');
        } else if (quickFilter === 'undervalued') {
            result = result.filter(s => s.pe_ratio != null && s.pe_ratio > 0 && s.pe_ratio < 15 && s.eps_ttm > 0);
        } else if (quickFilter === 'high_roe') {
            result = result.filter(s => s.roe_ttm != null && s.roe_ttm > 0.12);
        } else if (quickFilter === 'momentum') {
            result = result.filter(s =>
                s.macd_hist != null && s.macd_hist > 0 &&
                s.rsi_14 != null && s.rsi_14 > 50 && s.rsi_14 < 70 &&
                s.ema_50_status === 'Bullish'
            );
        } else if (quickFilter === 'breakout') {
            result = result.filter(s =>
                s.vol_ratio != null && s.vol_ratio > 1.5 &&
                s.placement_52w != null && s.placement_52w > 80
            );
        }

        return result;
    }, [allStocks, searchText, sectorFilter, filterMode, quickFilter]);

    const columns = [
        {
            title: 'Symbol',
            dataIndex: 'symbol',
            width: 100,
            fixed: 'left',
            sorter: (a, b) => a.symbol.localeCompare(b.symbol),
            render: (sym, record) => (
                <a
                    onClick={() => onSelectSymbol?.(sym)}
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
            title: 'P/E',
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
            title: 'EPS',
            dataIndex: 'eps_ttm',
            width: 80,
            align: 'right',
            sorter: (a, b) => (a.eps_ttm || 0) - (b.eps_ttm || 0),
            render: v => v != null ? (
                <span style={{ color: v > 0 ? '#00b894' : '#d63031' }}>{v.toFixed(2)}</span>
            ) : '—',
        },
        {
            title: 'ROE',
            dataIndex: 'roe_ttm',
            width: 70,
            align: 'right',
            sorter: (a, b) => (a.roe_ttm || 0) - (b.roe_ttm || 0),
            render: v => v != null ? (
                <span style={{ color: v > 0.12 ? '#00b894' : '#fdcb6e' }}>{(v * 100).toFixed(1)}%</span>
            ) : '—',
        },
        {
            title: 'RSI',
            dataIndex: 'rsi_14',
            width: 70,
            align: 'right',
            sorter: (a, b) => (a.rsi_14 || 50) - (b.rsi_14 || 50),
            render: v => v != null ? (
                <span style={{ fontWeight: 600, color: getRSIColor(v) }}>{v.toFixed(0)}</span>
            ) : '—',
        },
        {
            title: 'MACD',
            dataIndex: 'macd_hist',
            width: 80,
            align: 'right',
            sorter: (a, b) => (a.macd_hist || 0) - (b.macd_hist || 0),
            render: v => v != null ? (
                <Tag color={v > 0 ? 'green' : 'red'} style={{ fontSize: 10, margin: 0 }}>
                    {v > 0 ? '+' : ''}{v.toFixed(1)}
                </Tag>
            ) : '—',
        },
        {
            title: 'Vol Ratio',
            dataIndex: 'vol_ratio',
            width: 85,
            align: 'right',
            sorter: (a, b) => (a.vol_ratio || 0) - (b.vol_ratio || 0),
            render: v => v != null ? (
                <span style={{ fontWeight: 600, color: v > 2 ? '#00b894' : v > 1.2 ? '#fdcb6e' : 'var(--text-secondary)' }}>
                    {v.toFixed(1)}x
                </span>
            ) : '—',
        },
        {
            title: 'EMA Trend',
            width: 110,
            render: (_, r) => (
                <Space size={2}>
                    {r.ema_50_status && (
                        <Tag color={r.ema_50_status === 'Bullish' ? 'green' : 'red'} style={{ fontSize: 9, margin: 0, padding: '0 4px' }}>
                            50
                        </Tag>
                    )}
                    {r.ema_200_status && (
                        <Tag color={r.ema_200_status === 'Bullish' ? 'green' : 'red'} style={{ fontSize: 9, margin: 0, padding: '0 4px' }}>
                            200
                        </Tag>
                    )}
                </Space>
            )
        },
        {
            title: '52W Pos',
            dataIndex: 'placement_52w',
            width: 90,
            align: 'center',
            sorter: (a, b) => (a.placement_52w || 0) - (b.placement_52w || 0),
            render: v => v != null ? (
                <Tooltip title={`${v.toFixed(1)}% of 52-week range`}>
                    <Progress
                        percent={v}
                        showInfo={false}
                        strokeColor={{ '0%': '#d63031', '50%': '#fdcb6e', '100%': '#00b894' }}
                        trailColor="rgba(255,255,255,0.06)"
                        size="small"
                        style={{ width: 60, margin: '0 auto' }}
                    />
                </Tooltip>
            ) : '—',
        },
    ];

    const quickFilterOptions = [
        { value: null, label: 'All Stocks' },
        { value: 'momentum', label: '🔥 Momentum' },
        { value: 'breakout', label: '🚀 Breakout Setup' },
        { value: 'oversold', label: '📉 Oversold (RSI < 30)' },
        { value: 'overbought', label: '📈 Overbought (RSI > 70)' },
        { value: 'volume_surge', label: '📊 Volume Surge (>2x)' },
        { value: 'bullish_ema', label: '✅ Bullish EMA Stack' },
        { value: 'undervalued', label: '💎 Low P/E (<15)' },
        { value: 'high_roe', label: '🏆 High ROE (>12%)' },
    ];

    return (
        <div className="animate-in">
            {/* Filter Controls */}
            <div className="stat-card" style={{ padding: '16px 20px', marginBottom: 20 }}>
                <Row gutter={[16, 12]} align="middle">
                    <Col xs={24} sm={8} md={6}>
                        <Input
                            placeholder="Search symbol or name..."
                            prefix={<SearchOutlined style={{ color: 'var(--text-muted)' }} />}
                            value={searchText}
                            onChange={e => setSearchText(e.target.value)}
                            allowClear
                        />
                    </Col>
                    <Col xs={24} sm={8} md={5}>
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
                    <Col xs={24} sm={8} md={5}>
                        <Segmented
                            size="small"
                            value={filterMode}
                            onChange={setFilterMode}
                            options={[
                                { label: <span><ExperimentOutlined /> Both</span>, value: 'both' },
                                { label: <span><BankOutlined /> Fundamental</span>, value: 'fundamental' },
                                { label: <span><ThunderboltOutlined /> Technical</span>, value: 'technical' },
                            ]}
                        />
                    </Col>
                    <Col xs={24} md={8}>
                        <Select
                            placeholder="Quick Filter..."
                            value={quickFilter}
                            onChange={setQuickFilter}
                            allowClear
                            style={{ width: '100%' }}
                            options={quickFilterOptions}
                        />
                    </Col>
                </Row>
            </div>

            {/* Results Count */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, padding: '0 4px' }}>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                    <FilterOutlined style={{ marginRight: 6 }} />
                    Showing <strong style={{ color: 'var(--text-primary)' }}>{filteredStocks.length}</strong> of {allStocks.length} stocks
                    {quickFilter && (
                        <Tag color="purple" style={{ marginLeft: 8, fontSize: 10 }}>
                            {quickFilterOptions.find(f => f.value === quickFilter)?.label}
                        </Tag>
                    )}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    Click any symbol to view 360° analysis
                </div>
            </div>

            {/* Table */}
            {isLoading ? (
                <div style={{ textAlign: 'center', padding: '80px 0' }}>
                    <Spin size="large" tip="Loading screener data..." />
                </div>
            ) : filteredStocks.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '60px 0' }}>
                    <Empty description={<span style={{ color: 'var(--text-secondary)' }}>No stocks match the current filters</span>} />
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
