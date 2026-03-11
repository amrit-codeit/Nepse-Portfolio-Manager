import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Table, Input, Tag, Button, Space, Tooltip, notification, message } from 'antd';
import {
    SearchOutlined,
    SyncOutlined,
    ReloadOutlined,
    InfoCircleOutlined,
    FundOutlined
} from '@ant-design/icons';
import { getMergedPrices, scrapePrices, scrapeNav } from '../services/api';

function formatNPR(value) {
    if (value === null || value === undefined) return '—';
    return `Rs. ${Number(value).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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
        <div className="animate-in">
            <div className="page-header">
                <h1>Market Prices</h1>
                <p className="subtitle">Real-time share prices and mutual fund NAVs</p>
            </div>

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
                    icon={<ReloadOutlined spin={refreshPricesMutation.isPending} />}
                    onClick={() => refreshPricesMutation.mutate()}
                    loading={refreshPricesMutation.isPending}
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
        </div>
    );
}

export default Prices;
