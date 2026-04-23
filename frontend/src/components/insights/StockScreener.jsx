import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
    Table, Select, Tag, Input, Space, Row, Col, Segmented, Spin, Empty, Tooltip, Progress
} from 'antd';
import {
    SearchOutlined, FilterOutlined, RiseOutlined, FallOutlined,
    BankOutlined, ExperimentOutlined,
    DashboardOutlined, FundOutlined,
} from '@ant-design/icons';
import { getScreenerData, getSectors } from '../../services/api';

function formatNPR(value) {
    if (value === null || value === undefined) return '—';
    return `Rs. ${Number(value).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}



export default function StockScreener({ onSelectSymbol }) {
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

        // Fundamental only mode
        result = result.filter(s => s.has_fundamentals);

        // Quick filters — actionable insight filters 
        if (quickFilter === 'undervalued') {
            result = result.filter(s => s.pe_ratio != null && s.pe_ratio > 0 && s.pe_ratio < 15 && s.eps_ttm > 0);
        } else if (quickFilter === 'high_roe') {
            result = result.filter(s => s.roe_ttm != null && s.roe_ttm > 0.12);
        }

        return result;
    }, [allStocks, searchText, sectorFilter, quickFilter]);

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
    ];

    const quickFilterOptions = [
        { value: null, label: 'All Stocks' },
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
