import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Table, Tag, Tooltip, Row, Col, Input, Empty } from 'antd';
import { CheckCircleOutlined, TrophyOutlined, ArrowDownOutlined, SearchOutlined, HistoryOutlined } from '@ant-design/icons';
import { getClosedPositions } from '../../services/api';
import { formatNPR } from '../../utils/formatters';
import TransactionHistory from './TransactionHistory';
import DividendHistory from './DividendHistory';

export default function ClosedPositionsTab({ memberId }) {
    const [search, setSearch] = useState('');

    const params = useMemo(() => {
        const p = {};
        if (memberId) p.member_id = memberId;
        return p;
    }, [memberId]);

    const { data: closedPositions, isLoading } = useQuery({
        queryKey: ['closed-positions', params],
        queryFn: () => getClosedPositions(params).then(r => r.data),
    });

    const filtered = useMemo(() => {
        if (!closedPositions) return [];
        const s = search.toLowerCase();
        return closedPositions.filter(c =>
            !s || c.symbol?.toLowerCase().includes(s) || c.member_name?.toLowerCase().includes(s)
        );
    }, [closedPositions, search]);

    // Summary cards
    const summaryStats = useMemo(() => {
        if (!filtered.length) return { totalPnl: 0, totalInvested: 0, totalReceived: 0, count: 0, best: null, worst: null };
        const totalPnl = filtered.reduce((s, c) => s + c.net_pnl, 0);
        const totalInvested = filtered.reduce((s, c) => s + c.total_buy_cost, 0);
        const totalReceived = filtered.reduce((s, c) => s + c.total_sell_proceeds, 0);
        const sorted = [...filtered].sort((a, b) => b.net_pnl - a.net_pnl);
        return {
            totalPnl,
            totalInvested,
            totalReceived,
            count: filtered.length,
            best: sorted[0],
            worst: sorted[sorted.length - 1],
        };
    }, [filtered]);

    const columns = [
        {
            title: 'Member', dataIndex: 'member_name', key: 'member', width: 120,
            render: (name) => <span style={{ fontWeight: 500 }}>{name}</span>,
            sorter: (a, b) => (a.member_name || '').localeCompare(b.member_name || ''),
        },
        {
            title: 'Symbol', dataIndex: 'symbol', key: 'symbol', width: 100,
            render: (v) => <span style={{ fontWeight: 700, color: 'var(--accent-secondary)' }}>{v}</span>,
            sorter: (a, b) => a.symbol.localeCompare(b.symbol),
        },
        {
            title: 'Sector', dataIndex: 'sector', key: 'sector', width: 140,
            render: (s) => s ? <Tag color="purple">{s}</Tag> : <Tag>Others</Tag>,
        },
        {
            title: 'Total Invested', dataIndex: 'total_buy_cost', key: 'invested', align: 'right',
            render: formatNPR,
            sorter: (a, b) => a.total_buy_cost - b.total_buy_cost,
        },
        {
            title: 'Total Received', dataIndex: 'total_sell_proceeds', key: 'received', align: 'right',
            render: formatNPR,
            sorter: (a, b) => a.total_sell_proceeds - b.total_sell_proceeds,
        },
        {
            title: 'Dividends', dataIndex: 'dividend_income', key: 'dividends', align: 'right',
            render: (v) => v > 0 ? formatNPR(v) : '—',
            sorter: (a, b) => a.dividend_income - b.dividend_income,
        },
        {
            title: (
                <Tooltip title="Net Profit/Loss = Sell Proceeds - Buy Cost + Dividends">
                    Net P&L
                </Tooltip>
            ),
            dataIndex: 'net_pnl', key: 'pnl', align: 'right',
            render: (v) => (
                <span style={{
                    fontWeight: 600,
                    color: v > 0 ? 'var(--accent-green)' : v < 0 ? 'var(--accent-red)' : 'var(--text-secondary)',
                }}>
                    {formatNPR(v)}
                </span>
            ),
            sorter: (a, b) => a.net_pnl - b.net_pnl,
            defaultSortOrder: 'descend',
        },
        {
            title: 'P&L %', dataIndex: 'pnl_pct', key: 'pnl_pct', align: 'right', width: 90,
            render: (v) => (
                <span className={`glow-badge ${v >= 0 ? 'green' : 'red'}`}>
                    {v >= 0 ? '+' : ''}{v?.toFixed(3)}%
                </span>
            ),
            sorter: (a, b) => a.pnl_pct - b.pnl_pct,
        },
        {
            title: (
                <Tooltip title="Extended Internal Rate of Return">
                    XIRR
                </Tooltip>
            ),
            dataIndex: 'xirr', key: 'xirr', align: 'right', width: 90,
            render: (v) => v ? (
                <span style={{ fontWeight: 600, color: v >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                    {v >= 0 ? '+' : ''}{v}%
                </span>
            ) : '—',
            sorter: (a, b) => (a.xirr || 0) - (b.xirr || 0),
        },
        {
            title: (
                <Tooltip title="Duration from first buy to last sell">
                    Held
                </Tooltip>
            ),
            dataIndex: 'holding_days', key: 'holding_days', align: 'right', width: 90,
            render: (v) => {
                if (!v) return '—';
                if (v > 365) return `${(v / 365).toFixed(3)}y`;
                return `${v}d`;
            },
            sorter: (a, b) => a.holding_days - b.holding_days,
        },
    ];

    if (!closedPositions?.length && !isLoading) {
        return <Empty description="No closed positions found. Stocks that have been fully sold will appear here." style={{ marginTop: 60 }} />;
    }

    return (
        <div>
            {/* Summary Cards */}
            <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
                <Col xs={24} sm={12} lg={6}>
                    <div className={`stat-card ${summaryStats.totalPnl >= 0 ? 'green' : 'red'}`}>
                        <div className="stat-label"><CheckCircleOutlined /> Total Realized P&L</div>
                        <div className="stat-value" style={{ color: summaryStats.totalPnl >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                            {formatNPR(summaryStats.totalPnl)}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                            Across {summaryStats.count} closed positions
                        </div>
                    </div>
                </Col>
                <Col xs={24} sm={12} lg={6}>
                    <div className="stat-card">
                        <div className="stat-label">Total Invested</div>
                        <div className="stat-value">{formatNPR(summaryStats.totalInvested)}</div>
                    </div>
                </Col>
                <Col xs={24} sm={12} lg={6}>
                    <div className="stat-card green">
                        <div className="stat-label"><TrophyOutlined /> Best Trade</div>
                        <div className="stat-value" style={{ fontSize: 18 }}>
                            {summaryStats.best ? `${summaryStats.best.symbol}` : '—'}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--accent-green)' }}>
                            {summaryStats.best ? formatNPR(summaryStats.best.net_pnl) : ''}
                        </div>
                    </div>
                </Col>
                <Col xs={24} sm={12} lg={6}>
                    <div className="stat-card red">
                        <div className="stat-label"><ArrowDownOutlined /> Worst Trade</div>
                        <div className="stat-value" style={{ fontSize: 18 }}>
                            {summaryStats.worst && summaryStats.worst.net_pnl < 0 ? summaryStats.worst.symbol : '—'}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--accent-red)' }}>
                            {summaryStats.worst && summaryStats.worst.net_pnl < 0 ? formatNPR(summaryStats.worst.net_pnl) : 'No losing trades'}
                        </div>
                    </div>
                </Col>
            </Row>

            {/* Search */}
            <div style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'center' }}>
                <Input
                    placeholder="Search symbol or member..."
                    prefix={<SearchOutlined />}
                    style={{ width: 250 }}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    allowClear
                />
            </div>

            <Table
                className="portfolio-table"
                columns={columns}
                dataSource={filtered}
                rowKey={(record) => `${record.member_id}-${record.symbol}`}
                loading={isLoading}
                pagination={{ defaultPageSize: 50, showSizeChanger: true, pageSizeOptions: ['20', '50', '100'] }}
                scroll={{ x: 1100 }}
                size="middle"
                expandable={{
                    expandedRowRender: (record) => (
                        <div style={{ padding: '0 48px' }}>
                            <h4 style={{ marginBottom: 12 }}><HistoryOutlined /> Transaction History for {record.symbol} ({record.member_name})</h4>
                            <TransactionHistory memberId={record.member_id} symbol={record.symbol} />
                            <DividendHistory memberId={record.member_id} symbol={record.symbol} />
                        </div>
                    ),
                    rowExpandable: () => true,
                }}
                rowClassName={(record) =>
                    record.net_pnl > 0 ? 'row-positive' : record.net_pnl < 0 ? 'row-negative' : ''
                }
            />
        </div>
    );
}
