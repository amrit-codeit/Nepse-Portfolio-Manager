import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
    Table, Select, Input, Button, Tag, message, Popconfirm, Space, Tooltip, Dropdown, Tabs
} from 'antd';
import { PlusOutlined, DeleteOutlined, SearchOutlined, EditOutlined, DownloadOutlined, ImportOutlined, UploadOutlined, SyncOutlined } from '@ant-design/icons';
import api, { getTransactions, deleteTransaction, getMembers, getCompanies, getMergedPrices } from '../services/api';
import dayjs from 'dayjs';
import * as XLSX from 'xlsx';
import Papa from 'papaparse';
import AddEditTransactionModal from '../components/transactions/AddEditTransactionModal';
import ImportMeroShareModal from '../components/transactions/ImportMeroShareModal';
import ImportDpStatementModal from '../components/transactions/ImportDpStatementModal';
import ImportNativePortfolioModal from '../components/transactions/ImportNativePortfolioModal';
import SectionErrorBoundary from '../components/SectionErrorBoundary';

const TXN_TYPES = [
    { value: 'BUY', label: 'Buy', color: 'green' },
    { value: 'SELL', label: 'Sell', color: 'red' },
    { value: 'IPO', label: 'IPO', color: 'blue' },
    { value: 'FPO', label: 'FPO', color: 'blue' },
    { value: 'BONUS', label: 'Bonus', color: 'gold' },
    { value: 'RIGHT', label: 'Right', color: 'purple' },
    { value: 'AUCTION', label: 'Auction', color: 'cyan' },
    { value: 'TRANSFER_IN', label: 'Transfer In', color: 'lime' },
    { value: 'TRANSFER_OUT', label: 'Transfer Out', color: 'orange' },
    { value: 'MERGE', label: 'Merge', color: 'magenta' },
];

function formatNPR(value) {
    if (value === null || value === undefined || value === 0) return '—';
    return `Rs. ${Number(value).toLocaleString('en-IN', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}`;
}

function Transactions() {
    const [memberId, setMemberId] = useState(null);
    const [search, setSearch] = useState('');
    const [typeFilter, setTypeFilter] = useState(null);
    const [modalOpen, setModalOpen] = useState(false);
    const [editingTxn, setEditingTxn] = useState(null);
    const [importModalOpen, setImportModalOpen] = useState(false);
    const [importDpModalOpen, setImportDpModalOpen] = useState(false);
    const [nativeImportModalOpen, setNativeImportModalOpen] = useState(false);
    const [activeTab, setActiveTab] = useState('equity');
    const queryClient = useQueryClient();
    const [pageSize, setPageSize] = useState(20);

    const { data: members } = useQuery({
        queryKey: ['members'],
        queryFn: () => getMembers().then(r => r.data),
    });

    const { data: companiesData } = useQuery({
        queryKey: ['companies'],
        queryFn: () => getCompanies({ limit: 1000 }).then(r => r.data),
    });

    const { data: pricesData } = useQuery({
        queryKey: ['prices'],
        queryFn: () => getMergedPrices().then(r => r.data),
    });

    const { data: txnData, isLoading } = useQuery({
        queryKey: ['transactions', memberId, typeFilter],
        queryFn: () => getTransactions({
            member_id: memberId,
            txn_type: typeFilter,
            limit: 500,
        }).then(r => r.data),
    });



    const syncIssuePricesMutation = useMutation({
        mutationFn: () => api.post('/scraper/issues'),
        onSuccess: (res) => {
            message.success('Historical IPO/Right/FPO prices synced and filled.');
            queryClient.invalidateQueries({ queryKey: ['transactions'] });
            queryClient.invalidateQueries({ queryKey: ['holdings'] });
        },
        onError: (err) => message.error(err.response?.data?.detail || 'Failed to sync issue prices'),
    });

    const isSip = (txn) => {
        // High priority: Remarks from DP/SIP import
        if (txn.remarks && (txn.remarks.toLowerCase().includes('ca-rearrangement') || txn.remarks.toLowerCase().includes('dp statement'))) {
            return true;
        }
        
        // Priority: Metadata from NEPSE
        const priceInfo = pricesData?.find(p => p.symbol === txn.symbol);
        if (priceInfo) {
            if (priceInfo.instrument === 'Open-End Mutual Fund') return true;
            if (priceInfo.instrument === 'Equity' || priceInfo.instrument === 'Mutual Fund') return false;
        }

        // Potential fallback for transactions without metadata
        return false;
    };
    const allTransactions = (txnData?.transactions || []).filter(t =>
        !search || t.symbol.toLowerCase().includes(search.toLowerCase())
    );

    const equityTransactions = allTransactions.filter(t => !isSip(t));
    const sipTransactions = allTransactions.filter(t => isSip(t));

    const commonColumns = [
        {
            title: 'Date',
            dataIndex: 'txn_date',
            key: 'txn_date',
            width: 100,
            render: (d) => d || '—',
            sorter: (a, b) => (a.txn_date || '').localeCompare(b.txn_date || ''),
        },
        {
            title: 'Member',
            key: 'member_id',
            width: 100,
            render: (_, r) => {
                const m = (members || []).find(m => m.id === r.member_id);
                return m?.name || r.member_id;
            },
        },
        {
            title: 'Symbol',
            dataIndex: 'symbol',
            key: 'symbol',
            width: 100,
            render: (s) => <span style={{ fontWeight: 700, color: 'var(--accent-secondary)' }}>{s}</span>,
        },
        {
            title: 'Type',
            dataIndex: 'txn_type',
            key: 'txn_type',
            width: 100,
            render: (t) => {
                const cfg = TXN_TYPES.find(tt => tt.value === t);
                return <Tag color={cfg?.color || 'default'}>{cfg?.label || t}</Tag>;
            },
        },
        {
            title: 'Qty',
            dataIndex: 'quantity',
            key: 'quantity',
            align: 'right',
            width: 70,
        },
        {
            title: 'Rate',
            dataIndex: 'rate',
            key: 'rate',
            align: 'right',
            width: 80,
            render: (v) => v?.toFixed(3) || '—',
        },
        {
            title: (
                <Tooltip title="True Break-even WACC (Bonus @ Rs. 0)">
                    WACC
                </Tooltip>
            ),
            dataIndex: 'wacc',
            key: 'wacc',
            align: 'right',
            width: 90,
            render: (v) => v > 0 ? v.toFixed(3) : '—',
        }
    ];

    const equitySpecificColumns = [
        {
            title: (
                <Tooltip title="MeroShare-style Tax WACC (Bonus @ Rs. 100)">
                    Tax WACC
                </Tooltip>
            ),
            dataIndex: 'tax_wacc',
            key: 'tax_wacc',
            align: 'right',
            width: 90,
            render: (v) => v > 0 ? <strong>{v.toFixed(3)}</strong> : '—',
        },
        {
            title: 'Broker Comm.',
            dataIndex: 'broker_commission',
            key: 'broker_commission',
            align: 'right',
            render: (v) => v > 0 ? v.toFixed(3) : '—',
        },
        {
            title: 'SEBON Fee',
            dataIndex: 'sebon_fee',
            key: 'sebon_fee',
            align: 'right',
            render: (v) => v > 0 ? v.toFixed(3) : '—',
        },
        {
            title: 'DP Fee',
            dataIndex: 'dp_charge',
            key: 'dp_charge',
            align: 'right',
            render: (v) => v > 0 ? v.toFixed(3) : '—',
        }
    ];

    const sipSpecificColumns = [
        {
            title: 'DP Fee',
            dataIndex: 'dp_charge',
            key: 'dp_charge',
            align: 'right',
            render: (v) => v > 0 ? v.toFixed(3) : '—',
        }
    ];

    const endingColumns = [
        {
            title: 'CGT',
            dataIndex: 'cgt',
            key: 'cgt',
            align: 'right',
            render: (v) => v > 0 ? <span className="pnl-negative">{v.toFixed(3)}</span> : '—',
        },
        {
            title: 'Total',
            dataIndex: 'total_cost',
            key: 'total_cost',
            align: 'right',
            render: formatNPR,
        },
        {
            title: 'Actions',
            key: 'actions',
            width: 80,
            fixed: 'right',
            render: (_, r) => (
                <Space>
                    <Button
                        type="text"
                        icon={<EditOutlined />}
                        size="small"
                        onClick={() => {
                            setEditingTxn(r);
                            setModalOpen(true);
                        }}
                    />
                    <Popconfirm title="Delete this transaction?" onConfirm={() => deleteMutation.mutate(r.id)}>
                        <Button type="text" danger icon={<DeleteOutlined />} size="small" />
                    </Popconfirm>
                </Space>
            ),
        },
    ];

    const equityColumns = [...commonColumns, ...equitySpecificColumns, ...endingColumns];
    const sipColumns = [...commonColumns, ...sipSpecificColumns, ...endingColumns];

    const getExportData = (dataGroup) => {
        return dataGroup.map(t => {
            const memberName = (members || []).find(m => m.id === t.member_id)?.name || t.member_id;
            const companyName = (companiesData?.companies || []).find(c => c.symbol === t.symbol)?.name || '';

            return {
                Date: t.txn_date || '',
                Member: memberName,
                Symbol: t.symbol,
                Company: companyName,
                Type: t.txn_type,
                Quantity: t.quantity,
                Rate: t.rate || '',
                'Broker Commission': t.broker_commission || 0,
                'SEBON Fee': t.sebon_fee || 0,
                'DP Charge': t.dp_charge || 0,
                'Name Transfer Fee': t.name_transfer_fee || 0,
                'CGT': t.cgt || 0,
                'Total Cost/Received': t.total_cost || '',
                'Actual Date': t.actual_date || '',
                'Actual Units': t.actual_units || '',
                'NAV': t.nav || '',
                'SIP Charge': t.charge || '',
                'Is Reconciled': t.is_reconciled ? 1 : 0,
                Source: t.source,
                Remarks: t.remarks || ''
            };
        });
    };

    const handleExportExcel = (groupName) => {
        const dataForExport = getExportData(groupName === 'equity' ? equityTransactions : sipTransactions);
        const ws = XLSX.utils.json_to_sheet(dataForExport);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Transactions");
        XLSX.writeFile(wb, `portfolio_transactions_${groupName}.xlsx`);
    };

    const handleExportCSV = (groupName) => {
        const csv = Papa.unparse(getExportData(groupName === 'equity' ? equityTransactions : sipTransactions));
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.setAttribute('download', `portfolio_transactions_${groupName}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handleExportBoth = () => {
        handleExportCSV('equity');
        handleExportCSV('sips');
    };

    const exportItems = [
        {
            key: 'excel',
            label: 'Export as Excel',
            onClick: () => handleExportExcel(activeTab),
        },
        {
            key: 'csv',
            label: 'Export as CSV',
            onClick: () => handleExportCSV(activeTab),
        },
        {
            key: 'csv_both',
            label: 'Export Both (CSV)',
            onClick: handleExportBoth,
        },
    ];

    const deleteMutation = useMutation({
        mutationFn: deleteTransaction,
        onSuccess: () => {
            message.success('Transaction deleted');
            queryClient.invalidateQueries({ queryKey: ['transactions'] });
            queryClient.invalidateQueries({ queryKey: ['holdings'] });
            queryClient.invalidateQueries({ queryKey: ['portfolio-summary'] });
        },
    });

    return (
        <div className="animate-in">
            <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                    <h1>Transactions</h1>
                    <p className="subtitle">All share transactions across members</p>
                </div>
                <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
                    Add Transaction
                </Button>
            </div>

            {/* Filters */}
            <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
                <Select
                    placeholder="All Members"
                    showSearch
                    optionFilterProp="label"
                    allowClear
                    style={{ width: 180 }}
                    onChange={(v) => setMemberId(v)}
                    options={(members || []).map(m => ({ value: m.id, label: m.name }))}
                />
                <Select
                    placeholder="All Types"
                    allowClear
                    style={{ width: 150 }}
                    onChange={(v) => setTypeFilter(v)}
                    options={TXN_TYPES}
                />
                <Input
                    placeholder="Search symbol..."
                    prefix={<SearchOutlined />}
                    style={{ width: 180 }}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    allowClear
                />
                <div style={{ flexGrow: 1 }} />
                
                {activeTab === 'sips' && (
                  <Button
                      type="default"
                      icon={<ImportOutlined />}
                      onClick={() => setImportDpModalOpen(true)}
                  >
                      Import SIP Data
                  </Button>
                )}

                <Button 
                    type="default" 
                    icon={<UploadOutlined />} 
                    onClick={() => setNativeImportModalOpen(true)}
                >
                    {activeTab === 'equity' ? 'Import Equity Backup' : 'Import SIP Backup'}
                </Button>

                <Tooltip title="Automatically find and fill missing prices for IPO, Right, and FPO shares using historical data.">
                    <Button 
                        icon={<SyncOutlined spin={syncIssuePricesMutation.isPending} />} 
                        onClick={() => syncIssuePricesMutation.mutate()}
                        loading={syncIssuePricesMutation.isPending}
                    >
                        Auto-Fill Rates
                    </Button>
                </Tooltip>
                
                <Dropdown menu={{ items: exportItems }} disabled={activeTab === 'equity' ? equityTransactions.length === 0 : sipTransactions.length === 0}>
                    <Button type="primary" icon={<DownloadOutlined />}>
                        Export
                    </Button>
                </Dropdown>
            </div>

            <Tabs 
                activeKey={activeTab} 
                onChange={setActiveTab}
                items={[
                    {
                        key: 'equity',
                        label: 'Equity Transactions',
                        children: (
                            <div className="portfolio-table">
                                <Table
                                    columns={equityColumns}
                                    dataSource={equityTransactions}
                                    rowKey="id"
                                    loading={isLoading}
                                    pagination={{
                                        pageSize: pageSize,
                                        showSizeChanger: true,
                                        pageSizeOptions: ['10', '20', '50', '100'],
                                        onShowSizeChange: (current, size) => setPageSize(size),
                                        onChange: (page, size) => setPageSize(size),
                                    }}
                                    scroll={{ x: 1300 }}
                                    size="middle"
                                />
                            </div>
                        )
                    },
                    {
                        key: 'sips',
                        label: 'SIPs & Mutual Funds',
                        children: (
                            <div className="portfolio-table">
                                <Table
                                    columns={sipColumns}
                                    dataSource={sipTransactions}
                                    rowKey="id"
                                    loading={isLoading}
                                    pagination={{
                                        pageSize: pageSize,
                                        showSizeChanger: true,
                                        pageSizeOptions: ['10', '20', '50', '100'],
                                        onShowSizeChange: (current, size) => setPageSize(size),
                                        onChange: (page, size) => setPageSize(size),
                                    }}
                                    scroll={{ x: 1300 }}
                                    size="middle"
                                />
                            </div>
                        )
                    }
                ]}
            />

            <AddEditTransactionModal 
                open={modalOpen} 
                onClose={() => { setModalOpen(false); setEditingTxn(null); }} 
                editingTxn={editingTxn} 
                members={members} 
                companiesData={companiesData} 
                activeTab={activeTab} 
            />
            <ImportMeroShareModal 
                open={importModalOpen} 
                onClose={() => setImportModalOpen(false)} 
                members={members} 
            />
            <ImportDpStatementModal 
                open={importDpModalOpen} 
                onClose={() => setImportDpModalOpen(false)} 
                members={members} 
                pricesData={pricesData} 
            />
            <ImportNativePortfolioModal 
                open={nativeImportModalOpen} 
                onClose={() => setNativeImportModalOpen(false)} 
                activeTab={activeTab} 
            />
        </div>
    );
}

export default Transactions;
