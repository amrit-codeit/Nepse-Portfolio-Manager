import { useState, useMemo } from 'react';
import { Table, Input, Tag } from 'antd';
import { SearchOutlined, FundOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { getTransactions } from '../../services/api';

function formatNPR(value) {
    if (value === null || value === undefined) return '—';
    return `Rs. ${Number(value).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function DashboardHoldings({ summary, context, isSipMode }) {
    const [search, setSearch] = useState('');

    const summaryParams = useMemo(() => {
        if (context?.type === 'member') return { member_id: context.id };
        if (context?.type === 'group') return { member_ids: context.memberIds.join(',') };
        return {};
    }, [context]);

    const { data: txnData } = useQuery({
        queryKey: ['all-transactions-holdings', summaryParams],
        queryFn: () => getTransactions({ ...summaryParams, limit: 10000 }).then(r => r.data.transactions),
        enabled: !!summaryParams,
    });

    const totalPortfolioValue = useMemo(() => {
        return summary?.holdings?.reduce((sum, h) => sum + (h.current_value || h.total_investment || 0), 0) || 0;
    }, [summary]);

    const realizedPnLMap = useMemo(() => {
        const map = {};
        if (!txnData) return map;
        txnData.forEach(t => {
            if (t.txn_type === 'DIVIDEND') return;
            const key = `${t.member_id}-${t.symbol}`;
            if (!map[key]) map[key] = { buy: 0, sell: 0 };
            const cost = (t.total_cost && t.total_cost > 0) ? t.total_cost : ((t.rate || 0) * (t.quantity || 0));
            if (['BUY', 'IPO', 'FPO', 'RIGHT', 'AUCTION'].includes(t.txn_type)) {
                map[key].buy += cost;
            } else if (t.txn_type === 'SELL') {
                map[key].sell += cost;
            }
        });
        return map;
    }, [txnData]);

    const filteredHoldings = useMemo(() => {
        if (!summary?.holdings) return [];
        const s = search.toLowerCase();
        return summary.holdings.map(h => {
            const key = `${h.member_id}-${h.symbol}`;
            const txns = realizedPnLMap[key] || { buy: 0, sell: 0 };
            const realizedPnl = (h.total_investment || 0) + txns.sell - txns.buy;
            return { ...h, realizedPnl };
        }).filter(h =>
            !s || h.symbol?.toLowerCase().includes(s) || h.member_name?.toLowerCase().includes(s)
        );
    }, [summary, search, realizedPnLMap]);

    let columns = [
        {
            title: 'Member',
            dataIndex: 'member_name',
            key: 'member',
            width: 120,
            sorter: (a, b) => (a.member_name || '').localeCompare(b.member_name || ''),
        },
        {
            title: 'Symbol',
            dataIndex: 'symbol',
            key: 'symbol',
            width: 100,
            sorter: (a, b) => a.symbol.localeCompare(b.symbol),
            render: (v) => <span style={{ fontWeight: 600 }}>{v}</span>,
        },
        {
            title: 'Qty',
            dataIndex: 'current_qty',
            key: 'qty',
            align: 'right',
            width: 70,
            sorter: (a, b) => a.current_qty - b.current_qty,
        },
        {
            title: 'WACC',
            dataIndex: 'wacc',
            key: 'wacc',
            align: 'right',
            width: 90,
            sorter: (a, b) => (a.wacc || 0) - (b.wacc || 0),
            render: (v) => v?.toFixed(2) || '—',
        },
        {
            title: 'LTP',
            dataIndex: 'ltp',
            key: 'ltp',
            align: 'right',
            width: 90,
            sorter: (a, b) => (a.ltp || 0) - (b.ltp || 0),
            render: (v) => v?.toFixed(2) || '—',
        },
        {
            title: 'Investment',
            dataIndex: 'total_investment',
            key: 'investment',
            align: 'right',
            width: 120,
            sorter: (a, b) => a.total_investment - b.total_investment,
            render: (v) => formatNPR(v),
        },
        {
            title: 'Current Value',
            dataIndex: 'current_value',
            key: 'current_value',
            align: 'right',
            width: 120,
            sorter: (a, b) => (a.current_value || 0) - (b.current_value || 0),
            render: (v) => v ? formatNPR(v) : '—',
        },
        {
            title: 'Realized P&L',
            dataIndex: 'realizedPnl',
            key: 'realizedPnl',
            align: 'right',
            width: 120,
            sorter: (a, b) => (a.realizedPnl || 0) - (b.realizedPnl || 0),
            render: (v) => (
                <span style={{
                    fontWeight: 600,
                    color: v > 0 ? 'var(--accent-green)' : v < 0 ? 'var(--accent-red)' : 'var(--text-secondary)',
                }}>
                    {v ? formatNPR(v) : '—'}
                </span>
            ),
        },
        {
            title: 'Unrealized P&L',
            dataIndex: 'unrealized_pnl',
            key: 'pnl',
            align: 'right',
            width: 120,
            sorter: (a, b) => (a.unrealized_pnl || 0) - (b.unrealized_pnl || 0),
            render: (v) => (
                <span style={{
                    fontWeight: 600,
                    color: v > 0 ? 'var(--accent-green)' : v < 0 ? 'var(--accent-red)' : 'var(--text-secondary)',
                }}>
                    {v ? formatNPR(v) : '—'}
                </span>
            ),
        },
        {
            title: 'P&L %',
            dataIndex: 'pnl_pct',
            key: 'pnl_pct',
            align: 'right',
            width: 90,
            sorter: (a, b) => (a.pnl_pct || 0) - (b.pnl_pct || 0),
            render: (v) => v !== null && v !== undefined ? (
                <span className={`glow-badge ${v >= 0 ? 'green' : 'red'}`}>
                    {v >= 0 ? '+' : ''}{v}%
                </span>
            ) : '—',
        },
        {
            title: 'XIRR',
            dataIndex: 'xirr',
            key: 'xirr',
            align: 'right',
            width: 90,
            sorter: (a, b) => (a.xirr || 0) - (b.xirr || 0),
            render: (v) => v !== null && v !== undefined ? (
                <span style={{ fontWeight: 600, color: v >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                    {v >= 0 ? '+' : ''}{v}%
                </span>
            ) : '—',
        },
        {
            title: '% Portfolio',
            key: 'portfolio_pct',
            align: 'right',
            width: 100,
            sorter: (a, b) => (a.current_value || 0) - (b.current_value || 0),
            render: (_, record) => {
                const pct = totalPortfolioValue > 0
                    ? (((record.current_value || 0) / totalPortfolioValue) * 100).toFixed(1)
                    : '0.0';
                return <span className="glow-badge blue">{pct}%</span>;
            },
        },
    ];

    if (isSipMode) {
        columns = columns.filter(c => c.key !== 'wacc');
        const ltpCol = columns.find(c => c.key === 'ltp');
        if (ltpCol) ltpCol.title = 'NAV';
    }

    return (
        <div className="animate-in">
            {/* Search */}
            <div style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'center' }}>
                <FundOutlined style={{ fontSize: 16, color: 'var(--accent-primary)' }} />
                <span style={{ fontWeight: 600 }}>All Holdings ({filteredHoldings.length})</span>
                <Input
                    placeholder="Search symbol or member..."
                    prefix={<SearchOutlined />}
                    style={{ width: 250, marginLeft: 'auto' }}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    allowClear
                />
            </div>

            <Table
                className="portfolio-table"
                dataSource={filteredHoldings}
                columns={columns}
                rowKey={(record) => `${record.member_id}-${record.symbol}`}
                pagination={{ pageSize: 20, showSizeChanger: false, showTotal: (total) => `${total} holdings` }}
                size="small"
                scroll={{ x: 1100 }}
                rowClassName={(record) =>
                    record.unrealized_pnl > 0 ? 'row-positive' : record.unrealized_pnl < 0 ? 'row-negative' : ''
                }
            />
        </div>
    );
}
