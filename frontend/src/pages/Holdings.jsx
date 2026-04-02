import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Table, Select, Input, Tag, Button, Row, Col, Tooltip, Dropdown, Tabs, Statistic, Empty } from 'antd';
import {
    SearchOutlined,
    DownloadOutlined,
    HistoryOutlined,
    CheckCircleOutlined,
    ArrowUpOutlined,
    ArrowDownOutlined,
    TrophyOutlined,
    ClockCircleOutlined,
} from '@ant-design/icons';
import { getHoldings, getMembers, getTransactions, getMergedPrices, getClosedPositions } from '../services/api';
import * as XLSX from 'xlsx';
import Papa from 'papaparse';

function formatNPR(value) {
    if (value === null || value === undefined) return '—';
    return `Rs. ${Number(value).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function TransactionHistory({ memberId, symbol }) {
    const { data: transactions, isLoading } = useQuery({
        queryKey: ['transactions-history', memberId, symbol],
        queryFn: () => getTransactions({ member_id: memberId, symbol, limit: 1000 }).then(r => r.data.transactions),
        enabled: !!symbol,
    });

    const columns = [
        { title: 'Date', dataIndex: 'txn_date', key: 'date', width: 120 },
        {
            title: 'Type',
            dataIndex: 'txn_type',
            key: 'type',
            render: (type) => {
                let color = 'default';
                if (['BUY', 'IPO', 'RIGHT'].includes(type)) color = 'green';
                if (['SELL'].includes(type)) color = 'red';
                if (['BONUS'].includes(type)) color = 'blue';
                return <Tag color={color}>{type}</Tag>;
            }
        },
        { title: 'Qty', dataIndex: 'quantity', key: 'qty', align: 'right' },
        {
            title: 'Rate',
            dataIndex: 'rate',
            key: 'rate',
            align: 'right',
            render: (v) => v ? v.toFixed(2) : '—'
        },
        {
            title: 'Total Cost',
            dataIndex: 'total_cost',
            key: 'cost',
            align: 'right',
            render: (v) => v ? v.toLocaleString() : '—'
        },
        {
            title: 'Tax WACC',
            dataIndex: 'tax_wacc',
            key: 'tax_wacc',
            align: 'right',
            render: (v) => v ? <strong>{v.toFixed(2)}</strong> : '—'
        },
        { title: 'Source', dataIndex: 'source', key: 'source', render: (s) => <span style={{ fontSize: '0.8rem', opacity: 0.7 }}>{s}</span> },
    ];

    return (
        <Table
            columns={columns}
            dataSource={transactions || []}
            rowKey="id"
            loading={isLoading}
            pagination={false}
            size="small"
            style={{ margin: '8px 0', background: 'rgba(255,255,255,0.02)', borderRadius: 8 }}
        />
    );
}

/* ─── Closed Positions Tab ─────────────────────────── */
function ClosedPositionsTab({ memberId }) {
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
                    {v >= 0 ? '+' : ''}{v?.toFixed(1)}%
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
                if (v > 365) return `${(v / 365).toFixed(1)}y`;
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
                pagination={{ pageSize: 50, showSizeChanger: true }}
                scroll={{ x: 1100 }}
                size="middle"
                expandable={{
                    expandedRowRender: (record) => (
                        <div style={{ padding: '0 48px' }}>
                            <h4 style={{ marginBottom: 12 }}><HistoryOutlined /> Transaction History for {record.symbol} ({record.member_name})</h4>
                            <TransactionHistory memberId={record.member_id} symbol={record.symbol} />
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


/* ─── Main Holdings Component ──────────────────────── */
function Holdings() {
    const [memberId, setMemberId] = useState(null);
    const [selectedSector, setSelectedSector] = useState(null);
    const [search, setSearch] = useState('');
    const [activeTab, setActiveTab] = useState('equity');

    const { data: members } = useQuery({
        queryKey: ['members'],
        queryFn: () => getMembers().then(r => r.data),
    });

    const { data: holdings, isLoading: isHoldingsLoading } = useQuery({
        queryKey: ['holdings', memberId],
        queryFn: () => getHoldings({ member_id: memberId }).then(r => r.data),
    });

    const { data: pricesData } = useQuery({
        queryKey: ['prices'],
        queryFn: () => getMergedPrices().then(r => r.data),
    });

    const isLoading = isHoldingsLoading;

    // Dynamically derive sectors from holdings
    const sectorOptions = useMemo(() => {
        if (!holdings) return [];
        const sectors = new Set(holdings.map(h => h.sector || 'Others'));
        return Array.from(sectors).sort().map(s => ({ value: s, label: s }));
    }, [holdings]);

    const isSip = (h) => {
        return h.instrument === 'Open-End Mutual Fund';
    };

    const filtered = (holdings || []).filter(h => {
        const matchesSearch = !search ||
            h.symbol.toLowerCase().includes(search.toLowerCase()) ||
            h.company_name?.toLowerCase().includes(search.toLowerCase());
        const matchesSector = !selectedSector || (h.sector || 'Others') === selectedSector;
        const isMutualFund = isSip(h);
        const matchesTab = activeTab === 'equity' ? !isMutualFund : isMutualFund;
        return matchesSearch && matchesSector && matchesTab;
    });

    // Summary Calculations
    const totalInv = filtered.reduce((s, r) => s + (r.total_investment || 0), 0);
    const totalVal = filtered.reduce((s, r) => s + (r.current_value || 0), 0);
    const totalTaxProfit = filtered.reduce((s, r) => s + (r.tax_profit || 0), 0);
    const totalPnl = totalVal - totalInv;
    const pnlPct = totalInv > 0 ? (totalPnl / totalInv * 100).toFixed(2) : 0;

    const commonColumns = [
        {
            title: 'Member', dataIndex: 'member_name', key: 'member_name', width: 120,
            render: (name) => <span style={{ fontWeight: 500 }}>{name}</span>,
        },
        {
            title: 'Symbol', dataIndex: 'symbol', key: 'symbol', width: 100,
            render: (symbol) => (
                <Tooltip title="Click to view history">
                    <span style={{ fontWeight: 700, color: 'var(--accent-secondary)' }}>{symbol}</span>
                </Tooltip>
            ),
            sorter: (a, b) => a.symbol.localeCompare(b.symbol),
        },
        {
            title: 'Sector', dataIndex: 'sector', key: 'sector', width: 140,
            render: (s) => s ? <Tag color="purple">{s}</Tag> : <Tag>Others</Tag>,
        },
        {
            title: 'Quantity', dataIndex: 'current_qty', key: 'current_qty', align: 'right',
            sorter: (a, b) => a.current_qty - b.current_qty,
        },
        {
            title: (
                <Tooltip title="Actual cash spent per share. Bonus shares are calculated at Rs. 0 cost here. This is your true break-even point.">
                    True WACC
                </Tooltip>
            ),
            dataIndex: 'wacc', key: 'wacc', align: 'right',
            render: (v) => v?.toFixed(2),
            sorter: (a, b) => a.wacc - b.wacc,
        }
    ];

    const endingColumns = [
        {
            title: 'Investment', dataIndex: 'total_investment', key: 'total_investment', align: 'right',
            render: formatNPR, sorter: (a, b) => a.total_investment - b.total_investment,
        },
        {
            title: 'Current Value', dataIndex: 'current_value', key: 'current_value', align: 'right',
            render: (v) => v ? formatNPR(v) : '—', sorter: (a, b) => a.current_value - b.current_value,
        },
        {
            title: (
                <Tooltip title="True Profit/Loss based on actual cash spent.">
                    Net P&L
                </Tooltip>
            ),
            dataIndex: 'unrealized_pnl', key: 'unrealized_pnl', align: 'right',
            render: (v) => (
                <span className={v > 0 ? 'pnl-positive' : v < 0 ? 'pnl-negative' : 'pnl-neutral'}>
                    {v ? formatNPR(v) : '—'}
                </span>
            ),
            sorter: (a, b) => (a.unrealized_pnl || 0) - (b.unrealized_pnl || 0),
        },
        {
            title: 'P&L %', dataIndex: 'pnl_pct', key: 'pnl_pct', align: 'right', width: 90,
            sorter: (a, b) => (a.pnl_pct || 0) - (b.pnl_pct || 0),
            render: (v) => v !== null && v !== undefined ? (
                <span className={`glow-badge ${v >= 0 ? 'green' : 'red'}`}>
                    {v >= 0 ? '+' : ''}{v}%
                </span>
            ) : '—',
        },
        {
            title: (
                <Tooltip title="Extended Internal Rate of Return. Considers the timing of all buy/sell transactions.">
                    XIRR
                </Tooltip>
            ),
            dataIndex: 'xirr', key: 'xirr', align: 'right', width: 90,
            render: (v) => v !== null && v !== undefined ? (
                <span style={{ fontWeight: 600, color: v >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                    {v >= 0 ? '+' : ''}{v}%
                </span>
            ) : '—',
            sorter: (a, b) => (a.xirr || 0) - (b.xirr || 0),
        }
    ];

    const equitySpecificColumns = [
        {
            title: (
                <Tooltip title="MeroShare-style WACC. Bonus shares are calculated at Rs. 100 par value. Use this for matching CDSC/SEBON tax values.">
                    Tax WACC
                </Tooltip>
            ),
            dataIndex: 'tax_wacc', key: 'tax_wacc', align: 'right',
            render: (v) => v?.toFixed(2), sorter: (a, b) => a.tax_wacc - b.tax_wacc,
        },
        {
            title: 'LTP', dataIndex: 'ltp', key: 'ltp', align: 'right',
            render: (v) => v?.toFixed(2) || '—', sorter: (a, b) => a.ltp - b.ltp,
        }
    ];

    const sipSpecificColumns = [
        {
            title: 'NAV', dataIndex: 'ltp', key: 'ltp', align: 'right',
            render: (v) => v?.toFixed(2) || '—', sorter: (a, b) => a.ltp - b.ltp,
        }
    ];

    const taxProfitColumn = {
        title: (
            <Tooltip title="Profit subject to Capital Gains Tax (calculated using Tax WACC).">
                Taxable Profit
            </Tooltip>
        ),
        dataIndex: 'tax_profit', key: 'tax_profit', align: 'right',
        render: (v) => (
            <span style={{ color: v > 0 ? 'var(--accent-secondary)' : 'var(--text-secondary)', fontSize: '0.9rem' }}>
                {v ? formatNPR(v) : '—'}
            </span>
        ),
        sorter: (a, b) => (a.tax_profit || 0) - (b.tax_profit || 0),
    };

    const equityColumns = [...commonColumns, ...equitySpecificColumns, ...endingColumns.slice(0, 3), taxProfitColumn, ...endingColumns.slice(3)];
    const sipColumns = [...commonColumns, ...sipSpecificColumns, ...endingColumns];


    const getExportData = () => {
        return filtered.map(h => ({
            'Member Name': h.member_name,
            'Symbol': h.symbol,
            'Company Name': h.company_name || '',
            'Sector': h.sector || '',
            'Quantity': h.current_qty,
            'WACC': h.wacc,
            'LTP': h.ltp || '',
            'Total Investment': h.total_investment,
            'Current Value': h.current_value || '',
            'Unrealized P&L': h.unrealized_pnl || '',
            'P&L %': h.pnl_pct || ''
        }));
    };

    const handleExportExcel = () => {
        const dataForExport = getExportData();
        const ws = XLSX.utils.json_to_sheet(dataForExport);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Holdings");
        XLSX.writeFile(wb, "portfolio_holdings.xlsx");
    };

    const handleExportCSV = () => {
        const csv = Papa.unparse(getExportData());
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.setAttribute('download', 'portfolio_holdings.csv');
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const exportItems = [
        { key: 'excel', label: 'Export as Excel', onClick: handleExportExcel },
        { key: 'csv', label: 'Export as CSV', onClick: handleExportCSV },
    ];

    const isClosedTab = activeTab === 'closed';

    return (
        <div className="animate-in">
            <div className="page-header">
                <h1>Holdings</h1>
                <p className="subtitle">Current share holdings and closed positions across all members</p>
            </div>

            {/* Filters */}
            <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
                <Select
                    placeholder="All Members"
                    allowClear
                    style={{ width: 180 }}
                    onChange={(v) => setMemberId(v)}
                    options={[
                        ...(members || []).map(m => ({ value: m.id, label: m.display_name || m.name })),
                    ]}
                />

                {!isClosedTab && (
                    <>
                        <Select
                            placeholder="All Sectors"
                            allowClear
                            style={{ width: 180 }}
                            onChange={(v) => setSelectedSector(v)}
                            options={sectorOptions}
                        />

                        <Input
                            placeholder="Search symbol or company..."
                            prefix={<SearchOutlined />}
                            style={{ width: 250 }}
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            allowClear
                        />
                    </>
                )}

                <div style={{ flexGrow: 1 }} />

                {!isClosedTab && (
                    <Dropdown menu={{ items: exportItems }} disabled={filtered.length === 0}>
                        <Button type="primary" icon={<DownloadOutlined />}>
                            Export
                        </Button>
                    </Dropdown>
                )}
            </div>

            <Tabs
                activeKey={activeTab}
                onChange={setActiveTab}
                items={[
                    { key: 'equity', label: 'Equity' },
                    { key: 'sips', label: 'SIPs & Mutual Funds' },
                    { key: 'closed', label: <span><CheckCircleOutlined /> Closed Positions</span> },
                ]}
                style={{ marginBottom: 16 }}
            />

            {isClosedTab ? (
                <ClosedPositionsTab memberId={memberId} />
            ) : (
                <div className="portfolio-table">
                    <Table
                        columns={activeTab === 'equity' ? equityColumns : sipColumns}
                        dataSource={filtered}
                        rowKey="id"
                        loading={isLoading}
                        pagination={{ pageSize: 50, showSizeChanger: true }}
                        scroll={{ x: 1100 }}
                        size="middle"
                        expandable={{
                            expandedRowRender: (record) => (
                                <div style={{ padding: '0 48px' }}>
                                    <h4 style={{ marginBottom: 12 }}><HistoryOutlined /> Transaction History for {record.symbol} ({record.member_name})</h4>
                                    <TransactionHistory memberId={record.member_id} symbol={record.symbol} />
                                </div>
                            ),
                            rowExpandable: () => true,
                        }}
                    />
                </div>
            )}
        </div>
    );
}

export default Holdings;
