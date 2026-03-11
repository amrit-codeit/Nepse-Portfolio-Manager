import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Table, Select, Input, Tag, Button, Card, Row, Col, Statistic, Tooltip, Dropdown } from 'antd';
import {
    SearchOutlined,
    DownloadOutlined,
    HistoryOutlined
} from '@ant-design/icons';
import { getHoldings, getMembers, getTransactions } from '../services/api';
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

function Holdings() {
    const [memberId, setMemberId] = useState(null);
    const [selectedSector, setSelectedSector] = useState(null);
    const [search, setSearch] = useState('');

    const { data: members } = useQuery({
        queryKey: ['members'],
        queryFn: () => getMembers().then(r => r.data),
    });

    const { data: holdings, isLoading } = useQuery({
        queryKey: ['holdings', memberId],
        queryFn: () => getHoldings({ member_id: memberId }).then(r => r.data),
    });

    // Dynamically derive sectors from holdings
    const sectorOptions = useMemo(() => {
        if (!holdings) return [];
        const sectors = new Set(holdings.map(h => h.sector || 'Others'));
        return Array.from(sectors).sort().map(s => ({ value: s, label: s }));
    }, [holdings]);

    const filtered = (holdings || []).filter(h => {
        const matchesSearch = !search ||
            h.symbol.toLowerCase().includes(search.toLowerCase()) ||
            h.company_name?.toLowerCase().includes(search.toLowerCase());

        const matchesSector = !selectedSector || (h.sector || 'Others') === selectedSector;

        return matchesSearch && matchesSector;
    });

    // Summary Calculations
    const totalInv = filtered.reduce((s, r) => s + (r.total_investment || 0), 0);
    const totalVal = filtered.reduce((s, r) => s + (r.current_value || 0), 0);
    const totalTaxProfit = filtered.reduce((s, r) => s + (r.tax_profit || 0), 0);
    const totalPnl = totalVal - totalInv;
    const pnlPct = totalInv > 0 ? (totalPnl / totalInv * 100).toFixed(2) : 0;

    const columns = [
        {
            title: 'Member',
            dataIndex: 'member_name',
            key: 'member_name',
            width: 120,
            render: (name) => <span style={{ fontWeight: 500 }}>{name}</span>,
        },
        {
            title: 'Symbol',
            dataIndex: 'symbol',
            key: 'symbol',
            width: 100,
            render: (symbol) => (
                <Tooltip title="Click to view history">
                    <span style={{ fontWeight: 700, color: 'var(--accent-secondary)' }}>{symbol}</span>
                </Tooltip>
            ),
            sorter: (a, b) => a.symbol.localeCompare(b.symbol),
        },
        {
            title: 'Sector',
            dataIndex: 'sector',
            key: 'sector',
            width: 140,
            render: (s) => s ? <Tag color="purple">{s}</Tag> : <Tag>Others</Tag>,
        },
        {
            title: 'Quantity',
            dataIndex: 'current_qty',
            key: 'current_qty',
            align: 'right',
            sorter: (a, b) => a.current_qty - b.current_qty,
        },
        {
            title: (
                <Tooltip title="Actual cash spent per share. Bonus shares are calculated at Rs. 0 cost here. This is your true break-even point.">
                    True WACC
                </Tooltip>
            ),
            dataIndex: 'wacc',
            key: 'wacc',
            align: 'right',
            render: (v) => v?.toFixed(2),
            sorter: (a, b) => a.wacc - b.wacc,
        },
        {
            title: (
                <Tooltip title="MeroShare-style WACC. Bonus shares are calculated at Rs. 100 par value. Use this for matching CDSC/SEBON tax values.">
                    Tax WACC
                </Tooltip>
            ),
            dataIndex: 'tax_wacc',
            key: 'tax_wacc',
            align: 'right',
            render: (v) => v?.toFixed(2),
            sorter: (a, b) => a.tax_wacc - b.tax_wacc,
        },
        {
            title: 'LTP',
            dataIndex: 'ltp',
            key: 'ltp',
            align: 'right',
            render: (v) => v?.toFixed(2) || '—',
            sorter: (a, b) => a.ltp - b.ltp,
        },
        {
            title: 'Investment',
            dataIndex: 'total_investment',
            key: 'total_investment',
            align: 'right',
            render: formatNPR,
            sorter: (a, b) => a.total_investment - b.total_investment,
        },
        {
            title: 'Current Value',
            dataIndex: 'current_value',
            key: 'current_value',
            align: 'right',
            render: (v) => v ? formatNPR(v) : '—',
            sorter: (a, b) => a.current_value - b.current_value,
        },
        {
            title: (
                <Tooltip title="True Profit/Loss based on actual cash spent.">
                    Net P&L
                </Tooltip>
            ),
            dataIndex: 'unrealized_pnl',
            key: 'unrealized_pnl',
            align: 'right',
            render: (v) => (
                <span className={v > 0 ? 'pnl-positive' : v < 0 ? 'pnl-negative' : 'pnl-neutral'}>
                    {v ? formatNPR(v) : '—'}
                </span>
            ),
            sorter: (a, b) => (a.unrealized_pnl || 0) - (b.unrealized_pnl || 0),
        },
        {
            title: (
                <Tooltip title="Profit subject to Capital Gains Tax (calculated using Tax WACC).">
                    Taxable Profit
                </Tooltip>
            ),
            dataIndex: 'tax_profit',
            key: 'tax_profit',
            align: 'right',
            render: (v) => (
                <span style={{ color: v > 0 ? 'var(--accent-secondary)' : 'var(--text-secondary)', fontSize: '0.9rem' }}>
                    {v ? formatNPR(v) : '—'}
                </span>
            ),
            sorter: (a, b) => (a.tax_profit || 0) - (b.tax_profit || 0),
        },
        {
            title: 'P&L %',
            dataIndex: 'pnl_pct',
            key: 'pnl_pct',
            align: 'right',
            render: (v) => v !== null && v !== undefined ? (
                <span className={`glow-badge ${v >= 0 ? 'green' : 'red'}`}>
                    {v >= 0 ? '+' : ''}{v}%
                </span>
            ) : '—',
            sorter: (a, b) => a.pnl_pct - b.pnl_pct,
        },
    ];

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
        {
            key: 'excel',
            label: 'Export as Excel',
            onClick: handleExportExcel,
        },
        {
            key: 'csv',
            label: 'Export as CSV',
            onClick: handleExportCSV,
        },
    ];

    return (
        <div className="animate-in">
            <div className="page-header">
                <h1>Holdings</h1>
                <p className="subtitle">Current share holdings across all members</p>
            </div>

            {/* Top Summary Stats */}
            <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
                <Col xs={24} sm={12} lg={6}>
                    <Card className="stat-card" style={{ height: '100%' }}>
                        <Statistic
                            title="Total Investment"
                            value={totalInv}
                            precision={2}
                            prefix="Rs."
                            valueStyle={{ color: 'var(--text-primary)', fontSize: '1.5rem', fontWeight: 700 }}
                        />
                    </Card>
                </Col>
                <Col xs={24} sm={12} lg={6}>
                    <Card className="stat-card" style={{ height: '100%' }}>
                        <Statistic
                            title="Current Market Value"
                            value={totalVal}
                            precision={2}
                            prefix="Rs."
                            valueStyle={{ color: 'var(--accent-secondary)', fontSize: '1.5rem', fontWeight: 700 }}
                        />
                    </Card>
                </Col>
                <Col xs={24} sm={12} lg={6}>
                    <Card className={`stat-card ${totalPnl >= 0 ? 'green' : 'red'}`} style={{ height: '100%' }}>
                        <Statistic
                            title="Total Real P&L"
                            value={totalPnl}
                            precision={2}
                            prefix="Rs."
                            valueStyle={{ color: totalPnl >= 0 ? 'var(--accent-green)' : 'var(--accent-red)', fontSize: '1.5rem', fontWeight: 700 }}
                            suffix={<span style={{ fontSize: '0.9rem', marginLeft: 8 }}>({pnlPct}%)</span>}
                        />
                    </Card>
                </Col>
                <Col xs={24} sm={12} lg={6}>
                    <Card className="stat-card" style={{ height: '100%' }}>
                        <Statistic
                            title={
                                <Tooltip title="Estimated profit for Capital Gains Tax, calculated using par value (Rs. 100) for bonus shares as per SEBON rules.">
                                    Total Taxable Profit
                                </Tooltip>
                            }
                            value={totalTaxProfit}
                            precision={2}
                            prefix="Rs."
                            valueStyle={{ color: 'var(--accent-secondary)', fontSize: '1.5rem', fontWeight: 700 }}
                        />
                    </Card>
                </Col>
            </Row>

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

                <div style={{ flexGrow: 1 }} />

                <Dropdown menu={{ items: exportItems }} disabled={filtered.length === 0}>
                    <Button type="primary" icon={<DownloadOutlined />}>
                        Export
                    </Button>
                </Dropdown>
            </div>

            <div className="portfolio-table">
                <Table
                    columns={columns}
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
                        rowExpandable: (record) => true,
                    }}
                />
            </div>
        </div>
    );
}

export default Holdings;
