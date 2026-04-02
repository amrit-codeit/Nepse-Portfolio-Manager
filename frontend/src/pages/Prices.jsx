import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
    Table,
    Input,
    Tag,
    Button,
    Space,
    Tooltip,
    notification,
    message,
    Tabs,
    Select,
    DatePicker,
    Card,
    Empty
} from 'antd';
import {
    SearchOutlined,
    SyncOutlined,
    ReloadOutlined,
    InfoCircleOutlined,
    FundOutlined,
    HistoryOutlined,
    LineChartOutlined
} from '@ant-design/icons';
import { getMergedPrices, scrapePrices, scrapeNav, getHistoricalPrices, getCompanies, syncHistory } from '../services/api';
import dayjs from 'dayjs';

const { RangePicker } = DatePicker;

function formatNPR(value) {
    if (value === null || value === undefined) return '—';
    return `Rs. ${Number(value).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function LivePricesTab({ prices, isLoading, isFetching, search, setSearch, refreshMutation }) {
    const filtered = (prices || []).filter(p =>
        !search ||
        p.symbol.toLowerCase().includes(search.toLowerCase()) ||
        p.name.toLowerCase().includes(search.toLowerCase())
    );

    const columns = [
        {
            title: 'Symbol',
            dataIndex: 'symbol',
            key: 'symbol',
            width: 120,
            render: (symbol) => <span style={{ fontWeight: 700, color: 'var(--accent-secondary)' }}>{symbol}</span>,
            sorter: (a, b) => a.symbol.localeCompare(b.symbol),
        },
        {
            title: 'Company Name',
            dataIndex: 'name',
            key: 'name',
            ellipsis: true,
            render: (text) => <Tooltip title={text}>{text}</Tooltip>,
            sorter: (a, b) => a.name.localeCompare(b.name),
        },
        {
            title: 'Instrument',
            dataIndex: 'instrument',
            key: 'instrument',
            width: 150,
            render: (i) => {
                let color = 'blue';
                if (i?.includes('Mutual Fund')) color = 'purple';
                if (i === 'Debenture') color = 'orange';
                return <Tag color={color}>{i || 'Equity'}</Tag>;
            },
            filters: [
                { text: 'Equity', value: 'Equity' },
                { text: 'Mutual Fund', value: 'Mutual Fund' },
                { text: 'Open-End Mutual Fund', value: 'Open-End Mutual Fund' },
                { text: 'Debenture', value: 'Debenture' },
            ],
            onFilter: (value, record) => (record.instrument || 'Equity') === value,
        },
        {
            title: 'Price / NAV',
            dataIndex: 'price',
            key: 'price',
            align: 'right',
            width: 140,
            render: (v) => <span style={{ fontWeight: 600 }}>{formatNPR(v)}</span>,
            sorter: (a, b) => (a.price || 0) - (b.price || 0),
        },
        {
            title: 'Change',
            dataIndex: 'change',
            key: 'change',
            align: 'right',
            width: 150,
            render: (v, record) => {
                if (v === null || v === undefined) return '—';
                const color = v > 0 ? 'var(--accent-green)' : v < 0 ? 'var(--accent-red)' : 'inherit';
                return (
                    <span style={{ color, fontWeight: 600 }}>
                        {v > 0 ? '+' : ''}{v.toFixed(2)}
                        <span style={{ fontSize: '0.8rem', marginLeft: 4, opacity: 0.8 }}>
                            ({record.change_pct > 0 ? '+' : ''}{record.change_pct}%)
                        </span>
                    </span>
                );
            },
            sorter: (a, b) => (a.change || 0) - (b.change || 0),
        },
        {
            title: 'Prev Close',
            dataIndex: 'prev_close',
            key: 'prev_close',
            align: 'right',
            width: 120,
            render: (v) => v ? formatNPR(v) : '—',
            sorter: (a, b) => (a.prev_close || 0) - (b.prev_close || 0),
            responsive: ['md'],
        },
        {
            title: 'Open',
            dataIndex: 'open_price',
            key: 'open_price',
            align: 'right',
            width: 120,
            render: (v) => v ? formatNPR(v) : '—',
            sorter: (a, b) => (a.open_price || 0) - (b.open_price || 0),
            responsive: ['lg'],
        },
        {
            title: 'High',
            dataIndex: 'high',
            key: 'high',
            align: 'right',
            width: 120,
            render: (v) => v ? formatNPR(v) : '—',
            sorter: (a, b) => (a.high || 0) - (b.high || 0),
            responsive: ['lg'],
        },
        {
            title: 'Low',
            dataIndex: 'low',
            key: 'low',
            align: 'right',
            width: 120,
            render: (v) => v ? formatNPR(v) : '—',
            sorter: (a, b) => (a.low || 0) - (b.low || 0),
            responsive: ['lg'],
        },
        {
            title: 'Volume',
            dataIndex: 'volume',
            key: 'volume',
            align: 'right',
            width: 120,
            render: (v) => v?.toLocaleString() || '—',
            sorter: (a, b) => (a.volume || 0) - (b.volume || 0),
        },
        {
            title: 'Last Updated',
            dataIndex: 'updated_at',
            key: 'updated_at',
            width: 180,
            render: (v) => v ? new Date(v).toLocaleString() : '—',
        }
    ];

    return (
        <>
            <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap', justifyContent: 'space-between' }}>
                <Space>
                    <Input
                        placeholder="Search symbol or company..."
                        prefix={<SearchOutlined />}
                        style={{ width: 300 }}
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        allowClear
                    />
                    <Tooltip title="Data includes today's prices for equities and latest NAVs for mutual funds.">
                        <InfoCircleOutlined style={{ color: 'rgba(255,255,255,0.45)' }} />
                    </Tooltip>
                </Space>

                <Button
                    type="primary"
                    icon={<ReloadOutlined spin={refreshMutation.isPending} />}
                    onClick={() => refreshMutation.mutate()}
                    loading={refreshMutation.isPending}
                >
                    Refresh Market Data
                </Button>
            </div>

            <div className="portfolio-table">
                <Table
                    columns={columns}
                    dataSource={filtered}
                    rowKey="symbol"
                    loading={isLoading || isFetching}
                    pagination={{ pageSize: 50, showSizeChanger: true }}
                    scroll={{ x: 1000 }}
                    size="middle"
                    locale={{
                        emptyText: 'No price data available. Try refreshing market data.'
                    }}
                />
            </div>
        </>
    );
}

function HistoricalPricesTab() {
    const [selectedSymbol, setSelectedSymbol] = useState(null);
    const [dateRange, setDateRange] = useState([dayjs().subtract(1, 'month'), dayjs()]);
    const queryClient = useQueryClient();

    const syncHistoryMutation = useMutation({
        mutationFn: () => syncHistory(),
        onSuccess: (res) => {
            message.success(res.data.message || 'History sync initiated');
            queryClient.invalidateQueries(['historicalPrices']);
        },
        onError: (err) => {
            notification.error({
                message: 'Sync Failed',
                description: err.response?.data?.error || err.message
            });
        }
    });

    const { data: companies, isLoading: loadingCompanies } = useQuery({
        queryKey: ['companies', 'all'],
        queryFn: () => getCompanies({ limit: 1000 }).then(r => r.data.companies),
    });

    const { data: history, isLoading: loadingHistory, isFetching: fetchingHistory } = useQuery({
        queryKey: ['historicalPrices', selectedSymbol, dateRange],
        queryFn: () => getHistoricalPrices({
            symbol: selectedSymbol,
            start_date: dateRange?.[0]?.format('YYYY-MM-DD'),
            end_date: dateRange?.[1]?.format('YYYY-MM-DD')
        }).then(r => r.data),
        enabled: !!selectedSymbol,
    });

    const columns = [
        {
            title: 'Date',
            dataIndex: 'date',
            key: 'date',
            render: (d) => dayjs(d).format('YYYY-MM-DD'),
            sorter: (a, b) => dayjs(a.date).unix() - dayjs(b.date).unix(),
        },
        {
            title: 'Open',
            dataIndex: 'open',
            key: 'open',
            align: 'right',
            render: (v) => formatNPR(v),
        },
        {
            title: 'High',
            dataIndex: 'high',
            key: 'high',
            align: 'right',
            render: (v) => formatNPR(v),
        },
        {
            title: 'Low',
            dataIndex: 'low',
            key: 'low',
            align: 'right',
            render: (v) => formatNPR(v),
        },
        {
            title: 'Close',
            dataIndex: 'close',
            key: 'close',
            align: 'right',
            render: (v) => <span style={{ fontWeight: 600 }}>{formatNPR(v)}</span>,
        },
        {
            title: 'Volume',
            dataIndex: 'volume',
            key: 'volume',
            align: 'right',
            render: (v) => v?.toLocaleString() || '—',
        },
    ];

    return (
        <Space direction="vertical" style={{ width: '100%' }} size="large">
            <Card size="small" className="filter-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 12 }}>
                    <Space flexWrap="wrap">
                        <div style={{ width: 250 }}>
                            <span style={{ display: 'block', marginBottom: 4, fontSize: '0.8rem', opacity: 0.6 }}>Select Script</span>
                            <Select
                                showSearch
                                style={{ width: '100%' }}
                                placeholder="Type to search symbol..."
                                optionFilterProp="children"
                                loading={loadingCompanies}
                                onChange={(v) => setSelectedSymbol(v)}
                                value={selectedSymbol}
                            >
                                {companies?.map(c => (
                                    <Select.Option key={c.symbol} value={c.symbol}>
                                        {c.symbol} - {c.name}
                                    </Select.Option>
                                ))}
                            </Select>
                        </div>
                        <div style={{ width: 280 }}>
                            <span style={{ display: 'block', marginBottom: 4, fontSize: '0.8rem', opacity: 0.6 }}>Date Range</span>
                            <RangePicker
                                style={{ width: '100%' }}
                                value={dateRange}
                                onChange={(v) => setDateRange(v)}
                                ranges={{
                                    'Last 7 Days': [dayjs().subtract(7, 'days'), dayjs()],
                                    'Last 30 Days': [dayjs().subtract(30, 'days'), dayjs()],
                                    'This Month': [dayjs().startOf('month'), dayjs().endOf('month')],
                                    'Last Month': [dayjs().subtract(1, 'month').startOf('month'), dayjs().subtract(1, 'month').endOf('month')],
                                }}
                            />
                        </div>
                    </Space>
                    
                    <Button
                        type="default"
                        style={{ marginBottom: 4 }}
                        icon={<SyncOutlined spin={syncHistoryMutation.isPending} />}
                        onClick={() => syncHistoryMutation.mutate()}
                        loading={syncHistoryMutation.isPending}
                    >
                        Sync Historical Data
                    </Button>
                </div>
            </Card>

            <div className="portfolio-table">
                {!selectedSymbol ? (
                    <Empty description="Select a symbol to view historical prices" style={{ margin: '40px 0' }} />
                ) : (
                    <Table
                        columns={columns}
                        dataSource={history || []}
                        rowKey={(record) => `${record.symbol}-${record.date}`}
                        loading={loadingHistory || fetchingHistory}
                        pagination={{ pageSize: 20 }}
                        scroll={{ x: 800 }}
                        size="middle"
                        locale={{ emptyText: 'No historical data found for this period. The scrip may have been merged or delisted.' }}
                    />
                )}
            </div>
        </Space>
    );
}

function Prices() {
    const [search, setSearch] = useState('');
    const queryClient = useQueryClient();

    const { data: prices, isLoading, isFetching } = useQuery({
        queryKey: ['mergedPrices'],
        queryFn: () => getMergedPrices().then(r => r.data),
    });

    const refreshPricesMutation = useMutation({
        mutationFn: async () => {
            await scrapePrices();
            await scrapeNav();
        },
        onSuccess: () => {
            message.success('Price refresh triggered successfully');
            queryClient.invalidateQueries(['mergedPrices']);
        },
        onError: (err) => {
            notification.error({
                message: 'Refresh Failed',
                description: err.response?.data?.error || err.message
            });
        }
    });

    const tabItems = [
        {
            key: 'live',
            label: (
                <span>
                    <LineChartOutlined />
                    Live Market
                </span>
            ),
            children: (
                <LivePricesTab
                    prices={prices}
                    isLoading={isLoading}
                    isFetching={isFetching}
                    search={search}
                    setSearch={setSearch}
                    refreshMutation={refreshPricesMutation}
                />
            ),
        },
        {
            key: 'historical',
            label: (
                <span>
                    <HistoryOutlined />
                    Historical Prices
                </span>
            ),
            children: <HistoricalPricesTab />,
        },
    ];

    return (
        <div className="animate-in">
            <div className="page-header">
                <h1>Market Prices</h1>
                <p className="subtitle">Real-time share prices and historical performance</p>
            </div>

            <Tabs defaultActiveKey="live" items={tabItems} className="custom-tabs" />
        </div>
    );
}

export default Prices;
