import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Table, Select, Input, Tag, Button, Row, Col, Tooltip, Dropdown, Tabs, Statistic, Empty, message } from 'antd';
import {
    SearchOutlined,
    DownloadOutlined,
    HistoryOutlined,
    CheckCircleOutlined,
    ArrowUpOutlined,
    ArrowDownOutlined,
    TrophyOutlined,
    ClockCircleOutlined,
    CalculatorOutlined,
    WarningOutlined,
    AlertOutlined,
    RocketOutlined,
} from '@ant-design/icons';
import { getHoldings, getMembers, getTransactions, getMergedPrices, getClosedPositions, syncDividends, getDividends } from '../services/api';
import { Modal, Form, InputNumber, Divider, Space, Typography, Alert } from 'antd';
const { Text, Title, Paragraph } = Typography;
import * as XLSX from 'xlsx';
import Papa from 'papaparse';

import { formatNPR } from '../utils/formatters';
import TransactionHistory from '../components/holdings/TransactionHistory';
import DividendHistory from '../components/holdings/DividendHistory';
import ClosedPositionsTab from '../components/holdings/ClosedPositionsTab';
import AveragingCalculatorModal from '../components/holdings/AveragingCalculatorModal';
import SectionErrorBoundary from '../components/SectionErrorBoundary';

/* ─── Main Holdings Component ──────────────────────── */
function Holdings() {
    const [memberId, setMemberId] = useState(null);
    const [selectedSector, setSelectedSector] = useState(null);
    const [search, setSearch] = useState('');
    const [holdingForCalc, setHoldingForCalc] = useState(null);
    const [activeTab, setActiveTab] = useState('equity');
    const queryClient = useQueryClient();

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
    const pnlPct = totalInv > 0 ? (totalPnl / totalInv * 100).toFixed(3) : 0;

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
            render: (v) => v?.toFixed(3),
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
        },
        {
            title: '', key: 'calc', width: 50,
            render: (_, r) => (
                <Button 
                    type="text" 
                    icon={<CalculatorOutlined style={{ color: 'var(--text-muted)' }} />} 
                    onClick={() => setHoldingForCalc(r)}
                />
            )
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
            render: (v) => v?.toFixed(3), sorter: (a, b) => a.tax_wacc - b.tax_wacc,
        },
        {
            title: 'LTP', dataIndex: 'ltp', key: 'ltp', align: 'right',
            render: (v) => v?.toFixed(3) || '—', sorter: (a, b) => a.ltp - b.ltp,
        },
        {
            title: 'Graham Val.', dataIndex: 'graham_number', key: 'graham', align: 'right',
            render: (v, r) => v ? (
                <Tooltip title={`Graham: ${v.toFixed(3)} (Gap: ${((r.ltp - v) / v * 100).toFixed(3)}%)`}>
                    <Tag color={r.ltp > v ? 'error' : 'success'} style={{ fontWeight: 600 }}>
                        {v.toFixed(0)}
                    </Tag>
                </Tooltip>
            ) : '—'
        },
        {
            title: 'Risk Check', key: 'risk', align: 'center', width: 90,
            render: (_, r) => (
                <Space size={4}>
                    <Tooltip title={r.is_fundamental_risk ? "Fundamental Risk (NPL/Reserves)" : "Fundamentals OK"}>
                        <Tag color={r.is_fundamental_risk ? "error" : "success"} style={{ borderRadius: '50%', width: 8, height: 8, padding: 0 }} />
                    </Tooltip>
                    <Tooltip title={r.is_technical_downtrend ? "Technical Downtrend (LTP < SMA 200)" : "Technical Trend OK"}>
                        <Tag color={r.is_technical_downtrend ? "warning" : "success"} style={{ borderRadius: '50%', width: 8, height: 8, padding: 0 }} />
                    </Tooltip>
                </Space>
            )
        }
    ];

    const sipSpecificColumns = [
        {
            title: 'NAV', dataIndex: 'ltp', key: 'ltp', align: 'right',
            render: (v) => v?.toFixed(3) || '—', sorter: (a, b) => a.ltp - b.ltp,
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

    const syncDivMutation = useMutation({
        mutationFn: syncDividends,
        onSuccess: (res) => {
            message.success(res.data.message || 'Dividends synced successfully');
            queryClient.invalidateQueries(['dividends']);
            queryClient.invalidateQueries(['holdings']);
            queryClient.invalidateQueries(['closed-positions']);
        },
        onError: (e) => {
            message.error('Failed to sync dividends');
            console.error(e);
        }
    });

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
                    showSearch
                    optionFilterProp="label"
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
                    <div style={{ display: 'flex', gap: 8 }}>
                        <Button 
                            icon={<HistoryOutlined />} 
                            onClick={() => syncDivMutation.mutate()}
                            loading={syncDivMutation.isPending}
                        >
                            Sync Dividends
                        </Button>
                        <Dropdown menu={{ items: exportItems }} disabled={filtered.length === 0}>
                            <Button type="primary" icon={<DownloadOutlined />}>
                                Export
                            </Button>
                        </Dropdown>
                    </div>
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
                <SectionErrorBoundary>
                    <ClosedPositionsTab memberId={memberId} />
                </SectionErrorBoundary>
            ) : (
                <div className="portfolio-table">
                    <SectionErrorBoundary>
                        <Table
                            columns={activeTab === 'equity' ? equityColumns : sipColumns}
                            dataSource={filtered}
                            rowKey="id"
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
                        />
                    </SectionErrorBoundary>
                </div>
            )}

            <AveragingCalculatorModal 
                visible={!!holdingForCalc}
                holding={holdingForCalc}
                onCancel={() => setHoldingForCalc(null)}
            />
        </div>
    );
}

export default Holdings;
