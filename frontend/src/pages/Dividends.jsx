import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Table, Card, Row, Col, Select, Typography, Statistic, Button, message, Tag, Tabs } from 'antd';
import { 
    TrophyOutlined, 
    GiftOutlined, 
    DollarOutlined, 
    SyncOutlined,
    HistoryOutlined,
    LineChartOutlined
} from '@ant-design/icons';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import { getDividendSummary, getDividends, getMembers, syncDividends } from '../services/api';

const { Title, Text } = Typography;
const { Option } = Select;
const { TabPane } = Tabs;

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

    // Data processing for Script History
    const [selectedScript, setSelectedScript] = useState(null);

    const scriptHistoryData = useMemo(() => {
        if (!selectedScript || !allDividends) return [];
        return allDividends
            .filter(d => d.symbol === selectedScript)
            .sort((a, b) => new Date(a.book_close_date) - new Date(b.book_close_date))
            .map(d => ({
                fy: d.fiscal_year,
                cashPercent: d.cash_dividend_percent,
                bonusPercent: d.bonus_dividend_percent,
                netCash: d.total_cash_amount,
                eligibleQty: d.eligible_quantity
            }));
    }, [selectedScript, allDividends]);

    const uniqueScripts = useMemo(() => {
        if (!allDividends) return [];
        const syms = new Set(allDividends.map(d => d.symbol));
        return Array.from(syms).sort();
    }, [allDividends]);

    return (
        <div className="animate-in">
            <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                    <h1>Dividends & Yield</h1>
                    <p className="subtitle">Track your passive income and reinvestment history</p>
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
                        <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>*Includes SIP reinvested cash value</div>
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

            <Card bordered={false} style={{ background: 'var(--bg-glass)', borderRadius: 12 }}>
                <Tabs defaultActiveKey="yield" style={{ color: 'white' }}>
                    <TabPane tab={<span><DollarOutlined /> Asset Yield Performance</span>} key="yield">
                        <Table
                            columns={[
                                { title: 'Symbol', dataIndex: 'symbol', key: 'symbol', render: s => <Text strong style={{ color: 'var(--accent-primary)' }}>{s}</Text> },
                                { title: 'LTP', dataIndex: 'ltp', key: 'ltp', align: 'right', render: v => v ? `Rs. ${v}` : '—' },
                                { title: 'Avg Cost', dataIndex: 'average_cost', key: 'ac', align: 'right', render: v => v ? `Rs. ${v}` : '—' },
                                { title: 'Total Cash Payout', dataIndex: 'total_cash', key: 'tc', align: 'right', render: v => formatNPR(v) },
                                { title: 'Total Bonus Units', dataIndex: 'total_bonus', key: 'tb', align: 'right', render: v => `${v} units` },
                                { 
                                    title: 'Div. Yield %', 
                                    dataIndex: 'dividend_yield', 
                                    key: 'dy', 
                                    align: 'right', 
                                    render: (v, record) => <Tag color={v > 5 ? 'green' : 'default'} title={`Based on latest payout vs LTP`}>{v}%</Tag> 
                                },
                                { 
                                    title: 'Yield on Cost %', 
                                    dataIndex: 'yield_on_cost', 
                                    key: 'yoc', 
                                    align: 'right', 
                                    render: (v, record) => <Tag color={v > 10 ? 'cyan' : 'default'} style={{ fontWeight: 'bold' }} title={`Based on latest payout vs Avg Cost`}>{v}%</Tag> 
                                },
                            ]}
                            dataSource={summary?.by_symbol || []}
                            rowKey="symbol"
                            loading={loadingSummary}
                            pagination={false}
                            size="middle"
                        />
                        <div style={{ padding: '12px 0', color: 'var(--text-secondary)', fontSize: 13 }}>
                            * Note: For Open-Ended Mutual Funds (SIPs like NIBLSF), the "Cash Payout" displayed is the cash equivalent of the dividend declared. Mutual funds typically reinvest this cash directly into your portfolio by granting you more units rather than depositing cash into your bank account.
                        </div>
                    </TabPane>

                    <TabPane tab={<span><LineChartOutlined /> Script History</span>} key="history">
                        <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
                            <span style={{ color: 'white' }}>Select Symbol:</span>
                            <Select
                                showSearch
                                placeholder="Select a script to view its payout history"
                                style={{ width: 250 }}
                                onChange={setSelectedScript}
                                value={selectedScript}
                            >
                                {uniqueScripts.map(s => <Option key={s} value={s}>{s}</Option>)}
                            </Select>
                        </div>
                        
                        {selectedScript && scriptHistoryData.length > 0 ? (
                            <Row gutter={[24, 24]}>
                                <Col xs={24} lg={12}>
                                    <div style={{ height: 350, background: 'rgba(0,0,0,0.2)', padding: 16, borderRadius: 8 }}>
                                        <Title level={5} style={{ color: 'var(--text-secondary)', textAlign: 'center', marginBottom: 16 }}>
                                            Historic Payout Percentage 
                                        </Title>
                                        <ResponsiveContainer width="100%" height="100%">
                                            <BarChart data={scriptHistoryData} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
                                                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff1a" />
                                                <XAxis dataKey="fy" stroke="#8884d8" angle={-30} textAnchor="end" height={60} />
                                                <YAxis stroke="#8884d8" />
                                                <Tooltip 
                                                    contentStyle={{ backgroundColor: '#1a1a2e', border: '1px solid #ffffff1a', borderRadius: '8px' }}
                                                    itemStyle={{ color: 'white' }}
                                                />
                                                <Legend verticalAlign="top" height={36} />
                                                <Bar dataKey="cashPercent" name="Cash %" fill="#00e676" stackId="a" />
                                                <Bar dataKey="bonusPercent" name="Bonus %" fill="#2979ff" stackId="a" />
                                            </BarChart>
                                        </ResponsiveContainer>
                                    </div>
                                </Col>
                                <Col xs={24} lg={12}>
                                    <Table
                                        columns={[
                                            { title: 'Fiscal Year', dataIndex: 'fy', key: 'fy' },
                                            { title: 'Eligible Qty', dataIndex: 'eligibleQty', key: 'qty', align: 'right' },
                                            { title: 'Cash Yield %', dataIndex: 'cashPercent', key: 'cp', align: 'right', render: v => `${v}%`},
                                            { title: 'Bonus Yield %', dataIndex: 'bonusPercent', key: 'bp', align: 'right', render: v => `${v}%`},
                                            { title: 'Net Amount', dataIndex: 'netCash', key: 'cash', align: 'right', render: v => <strong style={{color: '#00e676'}}>{formatNPR(v)}</strong> }
                                        ]}
                                        dataSource={scriptHistoryData}
                                        rowKey="fy"
                                        pagination={{ pageSize: 10 }}
                                        size="small"
                                    />
                                </Col>
                            </Row>
                        ) : (
                            selectedScript && <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)' }}>No history available for this script.</div>
                        )}
                    </TabPane>

                    <TabPane tab={<span><HistoryOutlined /> Detailed Payout Pipeline</span>} key="pipeline">
                        <Table
                            columns={columns}
                            dataSource={allDividends || []}
                            rowKey="id"
                            loading={loadingDividends}
                            pagination={{ pageSize: 20 }}
                            size="middle"
                        />
                    </TabPane>
                </Tabs>
            </Card>
        </div>
    );
}

export default Dividends;
