import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Table, Card, Row, Col, Select, Typography, Statistic, Button, message, Tag } from 'antd';
import { 
    TrophyOutlined, 
    GiftOutlined, 
    DollarOutlined, 
    SyncOutlined,
    HistoryOutlined
} from '@ant-design/icons';
import { getDividendSummary, getDividends, getMembers, syncDividends } from '../services/api';

const { Title, Text } = Typography;
const { Option } = Select;

function formatNPR(num) {
    if (num == null) return '—';
    return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'NPR',
        minimumFractionDigits: 2,
    }).format(num);
}

function Dividends() {
    const [memberId, setMemberId] = useState(null);
    const queryClient = useQueryClient();

    // Fetch members for filter
    const { data: members } = useQuery({
        queryKey: ['members'],
        queryFn: () => getMembers().then(r => r.data),
    });

    // Fetch summary
    const { data: summary, isLoading: loadingSummary } = useQuery({
        queryKey: ['dividend-summary', memberId],
        queryFn: () => getDividendSummary({ member_id: memberId }).then(r => r.data),
    });

    // Fetch all records
    const { data: allDividends, isLoading: loadingDividends } = useQuery({
        queryKey: ['dividends-history', memberId],
        queryFn: () => getDividends({ member_id: memberId, eligible_only: true }).then(r => r.data),
    });

    const syncDivMutation = useMutation({
        mutationFn: syncDividends,
        onSuccess: (res) => {
            message.success(res.data.message || 'Dividends synced successfully');
            queryClient.invalidateQueries(['dividend-summary']);
            queryClient.invalidateQueries(['dividends-history']);
            queryClient.invalidateQueries(['holdings']);
            queryClient.invalidateQueries(['portfolio-summary']);
        },
        onError: (e) => {
            message.error('Failed to sync dividends');
            console.error(e);
        }
    });

    const columns = [
        {
            title: 'Symbol',
            dataIndex: 'symbol',
            key: 'symbol',
            render: (s) => <strong style={{ color: 'var(--accent-primary)' }}>{s}</strong>
        },
        { title: 'Fiscal Year', dataIndex: 'fiscal_year', key: 'fy' },
        { 
            title: 'Book Close', 
            dataIndex: 'book_close_date', 
            key: 'bcd', 
            render: v => v ? <span style={{ color: 'var(--text-secondary)' }}>{v}</span> : '—' 
        },
        { 
            title: 'Cash Div %', 
            dataIndex: 'cash_dividend_percent', 
            key: 'cash', 
            align: 'right',
            render: v => v > 0 ? <Tag bordered={false} color="green">{v}%</Tag> : '—'
        },
        { 
            title: 'Bonus Div %', 
            dataIndex: 'bonus_dividend_percent', 
            key: 'bonus', 
            align: 'right',
            render: v => v > 0 ? <Tag bordered={false} color="blue">{v}%</Tag> : '—'
        },
        { title: 'Eligible Qty', dataIndex: 'eligible_quantity', key: 'qty', align: 'right' },
        { 
            title: 'Total Bonus Shares', 
            dataIndex: 'total_bonus_shares', 
            key: 'total_bonus', 
            align: 'right',
            render: (v) => v > 0 ? <strong>{v} units</strong> : '—',
        },
        { 
            title: 'Net Amount (Rs)', 
            dataIndex: 'total_cash_amount', 
            key: 'amount', 
            align: 'right', 
            render: v => <span style={{ fontWeight: 600, color: '#00e676' }}>{formatNPR(v)}</span> 
        },
    ];

    return (
        <div className="animate-in">
            <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                    <h1>Dividends & Yield</h1>
                    <p className="subtitle">Track your passive income and bonus share increments</p>
                </div>
                <div style={{ display: 'flex', gap: 12 }}>
                    <Select
                        allowClear
                        placeholder="All Portfolios"
                        style={{ width: 220 }}
                        onChange={setMemberId}
                        value={memberId}
                    >
                        {members?.map(m => (
                            <Option key={m.id} value={m.id}>{m.name}</Option>
                        ))}
                    </Select>
                    <Button 
                        type="primary" 
                        icon={<SyncOutlined />} 
                        onClick={() => syncDivMutation.mutate()}
                        loading={syncDivMutation.isPending}
                    >
                        Sync Dividends
                    </Button>
                </div>
            </div>

            <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
                <Col xs={24} sm={12} md={6}>
                    <Card bordered={false} style={{ background: 'var(--bg-glass)' }}>
                        <Statistic 
                            title={<span style={{ color: 'var(--text-secondary)' }}><DollarOutlined /> Total Eligible Cash</span>}
                            value={summary?.total_dividend_income || 0}
                            precision={2}
                            prefix="Rs."
                            valueStyle={{ color: '#00e676', fontWeight: 600 }}
                            loading={loadingSummary}
                        />
                    </Card>
                </Col>
                <Col xs={24} sm={12} md={6}>
                    <Card bordered={false} style={{ background: 'var(--bg-glass)' }}>
                        <Statistic 
                            title={<span style={{ color: 'var(--text-secondary)' }}><GiftOutlined /> Total Bonus Shares</span>}
                            value={summary?.total_bonus_shares || 0}
                            precision={2}
                            suffix="units"
                            valueStyle={{ color: '#2979ff', fontWeight: 600 }}
                            loading={loadingSummary}
                        />
                    </Card>
                </Col>
                <Col xs={24} sm={12} md={6}>
                    <Card bordered={false} style={{ background: 'var(--bg-glass)' }}>
                        <Statistic 
                            title={<span style={{ color: 'var(--text-secondary)' }}><TrophyOutlined /> Unique Yielding Scripts</span>}
                            value={summary?.unique_symbols || 0}
                            valueStyle={{ color: 'white', fontWeight: 600 }}
                            loading={loadingSummary}
                        />
                    </Card>
                </Col>
                <Col xs={24} sm={12} md={6}>
                    <Card bordered={false} style={{ background: 'var(--bg-glass)' }}>
                        <Statistic 
                            title={<span style={{ color: 'var(--text-secondary)' }}><HistoryOutlined /> Total Historic Payouts</span>}
                            value={summary?.total_eligible_records || 0}
                            valueStyle={{ color: 'white', fontWeight: 600 }}
                            loading={loadingSummary}
                        />
                    </Card>
                </Col>
            </Row>

            <Card bordered={false} style={{ background: 'var(--bg-glass)', borderRadius: 12, marginBottom: 24 }}>
                <Title level={4} style={{ marginTop: 0, marginBottom: 16 }}>Asset Yield Performance</Title>
                <Table
                    columns={[
                        { title: 'Symbol', dataIndex: 'symbol', key: 'symbol', render: s => <Text strong color="var(--accent-primary)">{s}</Text> },
                        { title: 'LTP', dataIndex: 'ltp', key: 'ltp', align: 'right', render: v => v ? `Rs. ${v}` : '—' },
                        { title: 'Avg Cost', dataIndex: 'average_cost', key: 'ac', align: 'right', render: v => v ? `Rs. ${v}` : '—' },
                        { title: 'Total Cash Payout', dataIndex: 'total_cash', key: 'tc', align: 'right', render: v => formatNPR(v) },
                        { title: 'Total Bonus Units', dataIndex: 'total_bonus', key: 'tb', align: 'right', render: v => `${v} units` },
                        { 
                            title: 'Div. Yield %', 
                            dataIndex: 'dividend_yield', 
                            key: 'dy', 
                            align: 'right', 
                            render: v => <Tag color={v > 5 ? 'green' : 'default'}>{v}%</Tag> 
                        },
                        { 
                            title: 'Yield on Cost %', 
                            dataIndex: 'yield_on_cost', 
                            key: 'yoc', 
                            align: 'right', 
                            render: v => <Tag color={v > 10 ? 'cyan' : 'default'} style={{ fontWeight: 'bold' }}>{v}%</Tag> 
                        },
                    ]}
                    dataSource={summary?.by_symbol || []}
                    rowKey="symbol"
                    loading={loadingSummary}
                    pagination={false}
                    size="middle"
                />
            </Card>

            <Card bordered={false} style={{ background: 'var(--bg-glass)', borderRadius: 12 }}>
                <Title level={4} style={{ marginTop: 0, marginBottom: 16 }}>Detailed Payout Pipeline</Title>
                <Table
                    columns={columns}
                    dataSource={allDividends || []}
                    rowKey="id"
                    loading={loadingDividends}
                    pagination={{ pageSize: 20 }}
                    size="middle"
                />
            </Card>
        </div>
    );
}

export default Dividends;
