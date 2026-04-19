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
import { getMergedPrices, scrapePrices, scrapeNav, getHistoricalPrices, getCompanies, syncHistory, getAllIssues, scrapeIssues, scrapeCompanies, getNepseIndex, scrapeIndex } from '../services/api';
import dayjs from 'dayjs';

const { RangePicker } = DatePicker;

function formatNPR(value) {
    if (value === null || value === undefined) return '—';
    return `Rs. ${Number(value).toLocaleString('en-IN', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}`;
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
            title: 'LTP / NAV',
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
                        {v > 0 ? '+' : ''}{v.toFixed(3)}
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
                    pagination={{ defaultPageSize: 50, showSizeChanger: true, pageSizeOptions: ['20', '50', '100'] }}
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

function IssuesSubTab() {
    const queryClient = useQueryClient();

    const { data: issuesData, isLoading, isFetching } = useQuery({
        queryKey: ['allIssues'],
        queryFn: () => getAllIssues().then(r => r.data),
    });

    const fetchUnifiedMut = useMutation({
        mutationFn: async () => {
            await scrapeCompanies();
            await scrapeIssues();
            await scrapeIndex(); // Scrapes NEPSE & Sector indices based on new mapping
        },
        onSuccess: () => {
            message.success('Issues, Companies, and Indices updated successfully.');
            queryClient.invalidateQueries(['allIssues']);
            queryClient.invalidateQueries(['companies']);
            queryClient.invalidateQueries(['nepseIndex']);
        },
        onError: (err) => {
            message.error(err.response?.data?.error || 'Failed to sync market metadata.');
        }
    });

    const columns = [
        {
            title: 'Symbol',
            dataIndex: 'symbol',
            key: 'symbol',
            render: (s) => <span style={{ fontWeight: 700, color: 'var(--accent-primary)' }}>{s}</span>,
            sorter: (a, b) => a.symbol.localeCompare(b.symbol),
        },
        {
            title: 'Company Name',
            dataIndex: 'name',
            key: 'name',
            sorter: (a, b) => a.name.localeCompare(b.name),
        },
        {
            title: 'Issue Type',
            dataIndex: 'type',
            key: 'type',
            render: (v) => <Tag color={v === 'IPO' ? 'green' : v === 'RIGHT' ? 'blue' : 'purple'}>{v}</Tag>,
            filters: [
                { text: 'IPO', value: 'IPO' },
                { text: 'FPO', value: 'FPO' },
                { text: 'RIGHT', value: 'RIGHT' },
                { text: 'MUTUAL FUND', value: 'MUTUAL_FUND' }
            ],
            onFilter: (value, record) => record.type === value,
        },
        {
            title: 'Issue Price',
            dataIndex: 'price',
            key: 'price',
            align: 'right',
            render: (v) => <span style={{ fontWeight: 600 }}>{formatNPR(v)}</span>
        },
        {
            title: 'Last Updated',
            dataIndex: 'updated_at',
            key: 'updated_at',
            render: (v) => v ? dayjs(v).format('YYYY-MM-DD HH:mm') : '—'
        }
    ];

    return (
        <Space direction="vertical" style={{ width: '100%', marginTop: 24 }} size="large">
            <Card size="small" className="filter-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ color: 'var(--text-secondary)' }}>
                        Current active and historic IPO/FPO/Right share issues
                    </div>
                    <Button 
                        type="primary" 
                        icon={<SyncOutlined spin={fetchUnifiedMut.isPending} />} 
                        onClick={() => fetchUnifiedMut.mutate()}
                        loading={fetchUnifiedMut.isPending}
                    >
                        Sync Issues, Companies & Indices
                    </Button>
                </div>
            </Card>

            <div className="portfolio-table">
                <Table
                    columns={columns}
                    dataSource={issuesData || []}
                    rowKey="id"
                    loading={isLoading || isFetching}
                    pagination={{ defaultPageSize: 20, showSizeChanger: true, pageSizeOptions: ['20', '50', '100'] }}
                    scroll={{ x: 800 }}
                    size="middle"
                    locale={{ emptyText: 'No issues found. Click "Fetch Issues & Companies" to begin syncing.' }}
                />
            </div>
        </Space>
    );
}

function NepseIndexSubTab() {
    const queryClient = useQueryClient();

    const { data: indexData, isLoading, isFetching } = useQuery({
        queryKey: ['nepseIndex'],
        queryFn: () => getNepseIndex().then(r => r.data),
    });

    const fetchIndexMut = useMutation({
        mutationFn: () => scrapeIndex(),
        onSuccess: (res) => {
            message.success(res.data?.message || 'NEPSE Index records synced successfully.');
            queryClient.invalidateQueries(['nepseIndex']);
        },
        onError: (err) => {
            message.error(err.response?.data?.error || 'Failed to sync NEPSE Index data.');
        }
    });

    const formatIndex = (v) => v ? v.toLocaleString('en-IN', { minimumFractionDigits: 3, maximumFractionDigits: 3 }) : '—';

    const columns = [
        {
            title: 'Date',
            dataIndex: 'date',
            key: 'date',
            render: (d) => dayjs(d).format('YYYY-MM-DD'),
            sorter: (a, b) => dayjs(a.date).unix() - dayjs(b.date).unix(),
            width: 120
        },
        {
            title: 'Open',
            dataIndex: 'open',
            key: 'open',
            align: 'right',
            render: (v) => formatIndex(v)
        },
        {
            title: 'High',
            dataIndex: 'high',
            key: 'high',
            align: 'right',
            render: (v) => formatIndex(v)
        },
        {
            title: 'Low',
            dataIndex: 'low',
            key: 'low',
            align: 'right',
            render: (v) => formatIndex(v)
        },
        {
            title: 'Close',
            dataIndex: 'close',
            key: 'close',
            align: 'right',
            render: (v) => <span style={{ fontWeight: 600 }}>{formatIndex(v)}</span>
        },
        {
            title: 'Change',
            dataIndex: 'change',
            key: 'change',
            align: 'right',
            render: (v) => (
                <span style={{ color: v > 0 ? 'var(--accent-green)' : v < 0 ? 'var(--accent-red)' : 'inherit' }}>
                    {v > 0 ? '+' : ''}{v?.toFixed(3) || '0.000'}
                </span>
            )
        },
        {
            title: '% Change',
            dataIndex: 'percent_change',
            key: 'percent_change',
            align: 'right',
            render: (v) => (
                <span style={{ color: v > 0 ? 'var(--accent-green)' : v < 0 ? 'var(--accent-red)' : 'inherit' }}>
                    {v > 0 ? '+' : ''}{v?.toFixed(3) || '0.000'}%
                </span>
            )
        },
        {
            title: 'Turnover',
            dataIndex: 'turnover',
            key: 'turnover',
            align: 'right',
            render: (v) => v ? `Rs. ${(v/1e7).toFixed(3)} Cr` : '—'
        }
    ];

    return (
        <Space direction="vertical" style={{ width: '100%', marginTop: 24 }} size="large">
            <Card size="small" className="filter-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ color: 'var(--text-secondary)' }}>
                        Historical NEPSE Index Daily Close Data
                    </div>
                </div>
            </Card>

            <div className="portfolio-table">
                <Table
                    columns={columns}
                    dataSource={indexData || []}
                    rowKey="date"
                    loading={isLoading || isFetching}
                    pagination={{ defaultPageSize: 20, showSizeChanger: true, pageSizeOptions: ['20', '50', '100'] }}
                    scroll={{ x: 1000 }}
                    size="middle"
                    locale={{ emptyText: 'No index data found. Click "Sync Index Data".' }}
                />
            </div>
        </Space>
    );
}

function HistoricalDataTabs() {
    return (
        <Tabs
            defaultActiveKey="issues"
            type="card"
            style={{ marginTop: 16 }}
            items={[
                {
                    key: 'issues',
                    label: 'Issues',
                    children: <IssuesSubTab />
                },
                {
                    key: 'nepse',
                    label: 'NEPSE Index',
                    children: <NepseIndexSubTab />
                }
            ]}
        />
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
            message.success('Market data refresh triggered successfully');
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
                    Historical Data
                </span>
            ),
            children: <HistoricalDataTabs />,
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
