import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
    Table, Select, Input, Button, Modal, Form, InputNumber,
    DatePicker, Tag, message, Popconfirm, Space, Tooltip, Dropdown, Upload, Tabs
} from 'antd';
import { PlusOutlined, DeleteOutlined, SearchOutlined, EditOutlined, DownloadOutlined, ImportOutlined, UploadOutlined, SyncOutlined } from '@ant-design/icons';
import api, { getTransactions, createTransaction, updateTransaction, deleteTransaction, getMembers, getCompanies, getIssuePrice, uploadHistory, uploadDpStatement, getMergedPrices } from '../services/api';
import dayjs from 'dayjs';
import * as XLSX from 'xlsx';
import Papa from 'papaparse';

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
    return `Rs. ${Number(value).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function Transactions() {
    const [memberId, setMemberId] = useState(null);
    const [search, setSearch] = useState('');
    const [typeFilter, setTypeFilter] = useState(null);
    const [modalOpen, setModalOpen] = useState(false);
    const [editingTxn, setEditingTxn] = useState(null);
    const [importModalOpen, setImportModalOpen] = useState(false);
    const [importDpModalOpen, setImportDpModalOpen] = useState(false);
    const [importFile, setImportFile] = useState(null);
    const [importMemberId, setImportMemberId] = useState(null);
    const [importDpFormat, setImportDpFormat] = useState('NIBLSF');
    const [importDpSymbol, setImportDpSymbol] = useState(null);
    const [activeTab, setActiveTab] = useState('equity');
    const [form] = Form.useForm();
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

    const addMutation = useMutation({
        mutationFn: createTransaction,
        onSuccess: () => {
            message.success('Transaction added');
            queryClient.invalidateQueries({ queryKey: ['transactions'] });
            queryClient.invalidateQueries({ queryKey: ['holdings'] });
            queryClient.invalidateQueries({ queryKey: ['portfolio-summary'] });
            setModalOpen(false);
            form.resetFields();
        },
        onError: (err) => message.error(err.response?.data?.detail || 'Failed to add transaction'),
    });

    const updateMutation = useMutation({
        mutationFn: ({ id, data }) => updateTransaction(id, data),
        onSuccess: () => {
            message.success('Transaction updated');
            queryClient.invalidateQueries({ queryKey: ['transactions'] });
            queryClient.invalidateQueries({ queryKey: ['holdings'] });
            queryClient.invalidateQueries({ queryKey: ['portfolio-summary'] });
            setModalOpen(false);
            setEditingTxn(null);
            form.resetFields();
        },
        onError: (err) => message.error(err.response?.data?.detail || 'Failed to update transaction'),
    });

    const deleteMutation = useMutation({
        mutationFn: deleteTransaction,
        onSuccess: () => {
            message.success('Transaction deleted');
            queryClient.invalidateQueries({ queryKey: ['transactions'] });
            queryClient.invalidateQueries({ queryKey: ['holdings'] });
            queryClient.invalidateQueries({ queryKey: ['portfolio-summary'] });
        },
    });

    const uploadMutation = useMutation({
        mutationFn: ({ memberId, file }) => uploadHistory(memberId, file),
        onSuccess: (res) => {
            message.success(res.data?.message || 'CSV Imported Successfully');
            queryClient.invalidateQueries({ queryKey: ['transactions'] });
            queryClient.invalidateQueries({ queryKey: ['holdings'] });
            queryClient.invalidateQueries({ queryKey: ['portfolio-summary'] });
            setImportModalOpen(false);
            setImportFile(null);
            setImportMemberId(null);
        },
        onError: (err) => message.error(err.response?.data?.detail || 'Failed to import CSV'),
    });

    const uploadDpMutation = useMutation({
        mutationFn: ({ memberId, symbol, format, file }) => uploadDpStatement(memberId, symbol, format, file),
        onSuccess: (res) => {
            message.success(res.data?.message || 'DP Statement Imported Successfully');
            queryClient.invalidateQueries({ queryKey: ['transactions'] });
            queryClient.invalidateQueries({ queryKey: ['holdings'] });
            queryClient.invalidateQueries({ queryKey: ['portfolio-summary'] });
            setImportDpModalOpen(false);
            setImportFile(null);
            setImportMemberId(null);
        },
        onError: (err) => message.error(err.response?.data?.detail || 'Failed to import DP Statement'),
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
            render: (v) => v?.toFixed(2) || '—',
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
            render: (v) => v > 0 ? v.toFixed(2) : '—',
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
            render: (v) => v > 0 ? <strong>{v.toFixed(2)}</strong> : '—',
        },
        {
            title: 'Broker Comm.',
            dataIndex: 'broker_commission',
            key: 'broker_commission',
            align: 'right',
            render: (v) => v > 0 ? v.toFixed(2) : '—',
        },
        {
            title: 'SEBON Fee',
            dataIndex: 'sebon_fee',
            key: 'sebon_fee',
            align: 'right',
            render: (v) => v > 0 ? v.toFixed(2) : '—',
        },
        {
            title: 'DP Fee',
            dataIndex: 'dp_charge',
            key: 'dp_charge',
            align: 'right',
            render: (v) => v > 0 ? v.toFixed(2) : '—',
        }
    ];

    const sipSpecificColumns = [
        {
            title: 'DP Fee',
            dataIndex: 'dp_charge',
            key: 'dp_charge',
            align: 'right',
            render: (v) => v > 0 ? v.toFixed(2) : '—',
        }
    ];

    const endingColumns = [
        {
            title: 'CGT',
            dataIndex: 'cgt',
            key: 'cgt',
            align: 'right',
            render: (v) => v > 0 ? <span className="pnl-negative">{v.toFixed(2)}</span> : '—',
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
                            form.setFieldsValue({
                                member_id: r.member_id,
                                symbol: r.symbol,
                                txn_type: r.txn_type,
                                quantity: r.quantity,
                                rate: r.rate,
                                dp_charge: r.dp_charge,
                                broker_commission: r.broker_commission,
                                sebon_fee: r.sebon_fee,
                                cgt: r.cgt,
                                txn_date: r.txn_date ? dayjs(r.txn_date) : null,
                                remarks: r.remarks,
                            });
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
    ];

    const handleImportSubmit = () => {
        if (!importMemberId) {
            message.warning("Please select a member");
            return;
        }
        if (!importFile) {
            message.warning("Please select a file");
            return;
        }
        uploadMutation.mutate({ memberId: importMemberId, file: importFile });
    };

    const handleDpImportSubmit = () => {
        if (!importMemberId) {
            message.warning("Please select a member");
            return;
        }
        if (!importDpSymbol) {
            message.warning("Please select a symbol");
            return;
        }
        if (!importFile) {
            message.warning("Please select a file");
            return;
        }
        uploadDpMutation.mutate({ memberId: importMemberId, symbol: importDpSymbol, format: importDpFormat, file: importFile });
    }

    const handleValuesChange = (changedValues, allValues) => {
        // Auto-rate logic
        if (changedValues.txn_type) {
            const type = changedValues.txn_type;
            if (['IPO', 'RIGHT', 'FPO'].includes(type) && (!allValues.rate || allValues.rate === 0)) {
                form.setFieldsValue({ rate: 100 });
            }
            
            // Specifically reset rate to 0 and DP charge to 0 for BONUS
            if (type === 'BONUS') {
                if (!allValues.rate || allValues.rate === 100) {
                    form.setFieldsValue({ rate: 0 });
                }
                form.setFieldsValue({ dp_charge: 0 });
            }

            // DP Fee logic - only autocalculate for non-SIP mode
            if (activeTab === 'equity') {
                if (['IPO', 'FPO', 'RIGHT'].includes(type)) {
                    form.setFieldsValue({ dp_charge: 5 });
                } else if (type === 'BONUS') {
                    form.setFieldsValue({ dp_charge: 0 });
                } else if (type === 'BUY' || type === 'SELL' || type === 'AUCTION') {
                    form.setFieldsValue({ dp_charge: 25 });
                }
            }

            // Auto-fetch issue price if symbol is already selected
            if (['IPO', 'RIGHT', 'FPO'].includes(type) && allValues.symbol) {
                handleFetchIssuePrice();
            }
        }

        // Auto-fetch if symbol changes and type is already set to IPO/RIGHT/FPO
        if (changedValues.symbol && ['IPO', 'RIGHT', 'FPO'].includes(allValues.txn_type)) {
            handleFetchIssuePrice();
        }
    };

    const handleFetchIssuePrice = async () => {
        const symbol = form.getFieldValue('symbol');
        const currentType = form.getFieldValue('txn_type');
        
        if (currentType === 'BONUS') {
            form.setFieldsValue({ rate: 0, dp_charge: 0 });
            message.info('Bonus shares are treated as Rs. 0 cost by default.');
            return;
        }

        if (!symbol) {
            message.warning('Please select a symbol first');
            return;
        }

        try {
            // Pass the current type to avoid fetching the wrong record for the same symbol
            const res = await getIssuePrice(symbol, currentType);
            if (res.data && res.data.price) {
                const fetchedType = res.data.type;
                
                // Update the form
                const updates = { rate: res.data.price };
                
                // Only overwrite type if it's not already set to a matching valid type, 
                // OR if it's a completely new transaction.
                if (!currentType || (!['IPO', 'RIGHT', 'FPO'].includes(currentType) && !editingTxn)) {
                    updates.txn_type = fetchedType;
                }
                
                form.setFieldsValue(updates);
                message.success(`Fetched ${fetchedType} price for ${symbol}: Rs. ${res.data.price}`);
            } else {
                message.info(`No stored ${currentType || 'issue'} price found for ${symbol}`);
            }
        } catch (err) {
            message.error('Failed to fetch issue price');
        }
    };

    const handleAddOrUpdate = (values) => {
        const payload = {
            member_id: values.member_id,
            symbol: values.symbol,
            txn_type: values.txn_type,
            quantity: values.quantity,
            rate: values.rate || null,
            txn_date: values.txn_date ? values.txn_date.format('YYYY-MM-DD') : null,
            remarks: values.remarks || null,
            dp_charge: values.dp_charge || null,
            cgt: values.cgt || null,
            broker_commission: activeTab === 'equity' ? (values.broker_commission || null) : 0,
            sebon_fee: activeTab === 'equity' ? (values.sebon_fee || null) : 0,
        };

        if (editingTxn) {
            updateMutation.mutate({ id: editingTxn.id, data: payload });
        } else {
            addMutation.mutate(payload);
        }
    };

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

            {/* Add/Edit Transaction Modal */}
            <Modal
                title={editingTxn ? "Edit Transaction" : "Add Transaction"}
                open={modalOpen}
                onCancel={() => { setModalOpen(false); setEditingTxn(null); form.resetFields(); }}
                footer={null}
                width={500}
            >
                <Form
                    form={form}
                    layout="vertical"
                    onFinish={handleAddOrUpdate}
                    onValuesChange={handleValuesChange}
                    style={{ marginTop: 16 }}
                >
                    <Form.Item name="member_id" label="Member" rules={[{ required: true }]}>
                        <Select
                            placeholder="Select member"
                            showSearch
                            optionFilterProp="label"
                            options={(members || []).map(m => ({ value: m.id, label: m.name }))}
                        />
                    </Form.Item>
                    <Form.Item name="symbol" label="Symbol" rules={[{ required: true }]}>
                        <Select
                            placeholder="Search company..."
                            showSearch
                            optionFilterProp="label"
                            options={(companiesData?.companies || []).map(c => ({
                                value: c.symbol,
                                label: `${c.symbol} — ${c.name}`,
                            }))}
                        />
                    </Form.Item>
                    <Form.Item name="txn_type" label="Transaction Type" rules={[{ required: true }]}>
                        <Select options={TXN_TYPES} disabled={!!editingTxn} />
                    </Form.Item>
                    <Space style={{ width: '100%' }}>
                        <Form.Item name="quantity" label="Quantity" rules={[{ required: true }]} style={{ flex: 1 }}>
                            <InputNumber style={{ width: '100%' }} min={0} />
                        </Form.Item>
                        <Form.Item name="rate" label="Rate (per unit)" style={{ flex: 1 }}>
                            <div style={{ display: 'flex', gap: 8 }}>
                                <InputNumber style={{ flex: 1 }} min={0} step={0.01} />
                                <Button
                                    size="small"
                                    onClick={handleFetchIssuePrice}
                                    title="Fetch IPO/Right/FPO Price"
                                    style={{ height: 32 }}
                                >
                                    Fetch
                                </Button>
                            </div>
                        </Form.Item>
                        <Form.Item name="dp_charge" label="DP Fee" style={{ flex: 1 }}>
                            <InputNumber style={{ width: '100%' }} min={0} step={1} />
                        </Form.Item>
                        {activeTab === 'equity' && (
                            <>
                                <Form.Item name="broker_commission" label="Broker Comm." style={{ flex: 1 }}>
                                    <InputNumber style={{ width: '100%' }} min={0} step={0.01} />
                                </Form.Item>
                                <Form.Item name="sebon_fee" label="SEBON Fee" style={{ flex: 1 }}>
                                    <InputNumber style={{ width: '100%' }} min={0} step={0.01} />
                                </Form.Item>
                            </>
                        )}
                        <Form.Item name="cgt" label="CGT" style={{ flex: 1 }}>
                            <InputNumber style={{ width: '100%' }} min={0} step={0.01} />
                        </Form.Item>
                    </Space>
                    <Form.Item name="txn_date" label="Date">
                        <DatePicker style={{ width: '100%' }} />
                    </Form.Item>
                    <Form.Item name="remarks" label="Remarks">
                        <Input.TextArea rows={2} />
                    </Form.Item>
                    <Form.Item>
                        <Button type="primary" htmlType="submit" loading={addMutation.isPending || updateMutation.isPending} block>
                            {editingTxn ? "Update Transaction" : "Add Transaction"}
                        </Button>
                    </Form.Item>
                </Form>
            </Modal>

            {/* Import CSV Modal (Equity) */}
            <Modal
                title="Import MeroShare Transactions CSV"
                open={importModalOpen}
                onCancel={() => { setImportModalOpen(false); setImportFile(null); setImportMemberId(null); }}
                onOk={handleImportSubmit}
                confirmLoading={uploadMutation.isPending}
                okText="Import"
            >
                <p>Select a member and upload their exported MeroShare history CSV to automatically import transactions.</p>
                <div style={{ marginBottom: 16, marginTop: 16 }}>
                    <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>Select Member:</label>
                    <Select
                        placeholder="Select Member"
                        style={{ width: '100%' }}
                        onChange={setImportMemberId}
                        value={importMemberId}
                        options={(members || []).map(m => ({ value: m.id, label: m.name }))}
                    />
                </div>
                <div style={{ marginBottom: 16 }}>
                    <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>CSV File:</label>
                    <Upload
                        beforeUpload={(file) => {
                            setImportFile(file);
                            return false;
                        }}
                        onRemove={() => setImportFile(null)}
                        fileList={importFile ? [importFile] : []}
                        maxCount={1}
                        accept=".csv"
                    >
                        <Button icon={<UploadOutlined />}>Select CSV File</Button>
                    </Upload>
                </div>
            </Modal>
            
            {/* Import DP Statement Modal (SIPs) */}
            <Modal
                title="Import SIP DP Statement"
                open={importDpModalOpen}
                onCancel={() => { 
                    setImportDpModalOpen(false); 
                    setImportFile(null); 
                    setImportMemberId(null); 
                    setImportDpSymbol(null);
                }}
                onOk={handleDpImportSubmit}
                confirmLoading={uploadDpMutation.isPending}
                okText="Import DP Statement"
            >
                <p>Reconcile SIPs with official DP Statements to get exact dates, NAVs, and DP charges.</p>
                <div style={{ marginBottom: 16, marginTop: 16 }}>
                    <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>Select Member:</label>
                    <Select
                        placeholder="Select Member"
                        style={{ width: '100%' }}
                        onChange={setImportMemberId}
                        value={importMemberId}
                        options={(members || []).map(m => ({ value: m.id, label: m.name }))}
                    />
                </div>
                <div style={{ marginBottom: 16 }}>
                    <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>Select Symbol:</label>
                    <Select
                        placeholder="Search SIP/Mutual Fund..."
                        showSearch
                        optionFilterProp="label"
                        style={{ width: '100%' }}
                        onChange={setImportDpSymbol}
                        value={importDpSymbol}
                        options={(pricesData || []).map(p => ({
                            value: p.symbol,
                            label: `${p.symbol} — ${p.name}`,
                        }))}
                    />
                </div>
                <div style={{ marginBottom: 16 }}>
                    <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>DP Format:</label>
                    <Select
                        style={{ width: '100%' }}
                        value={importDpFormat}
                        onChange={setImportDpFormat}
                        options={[
                            { value: 'NIBLSF', label: 'NIBLSF (CSV Format)' },
                            { value: 'NMBSBFE', label: 'NMBSBFE (PDF Format)' },
                            { value: 'NEW_NI31', label: 'NI31 (Excel Format)' }
                        ]}
                    />
                </div>
                <div style={{ marginBottom: 16 }}>
                    <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>
                        Statement File ({importDpFormat === 'NIBLSF' ? 'CSV' : importDpFormat === 'NEW_NI31' ? 'XLSX' : 'PDF'}):
                    </label>
                    <Upload
                        beforeUpload={(file) => {
                            setImportFile(file);
                            return false;
                        }}
                        onRemove={() => setImportFile(null)}
                        fileList={importFile ? [importFile] : []}
                        maxCount={1}
                        accept={importDpFormat === 'NIBLSF' ? ".csv" : importDpFormat === 'NEW_NI31' ? ".xlsx" : ".pdf"}
                    >
                        <Button icon={<UploadOutlined />}>Select File</Button>
                    </Upload>
                </div>
            </Modal>
        </div>
    );
}

export default Transactions;
