import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
    Card, message, Button, Alert, List, Tag, Tabs, Table, Modal, Popconfirm,
    Form, Input, InputNumber, Space, Checkbox, Tooltip, Dropdown, Select
} from 'antd';
import {
    SyncOutlined, LockOutlined, EditOutlined,
    ImportOutlined, ExportOutlined, UserOutlined,
    SafetyCertificateOutlined, KeyOutlined,
    TranslationOutlined, NumberOutlined, DeleteOutlined, PlusOutlined,
    CheckCircleOutlined, CloseCircleOutlined
} from '@ant-design/icons';
import {
    getMembers, syncMeroshare, verifyMasterPassword,
    exportCredentials, importCredentials, setCredentials,
    getDecryptedCredentials, createMember, deleteMember
} from '../services/api';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';

const { TabPane } = Tabs;
const { Option } = Select;

const DP_OPTIONS = ["AAKASH CAPITAL LIMITED (19000)", "AAKASHBHAIRAB SECURITIES LIMITED (20600)", "ABC SECURITIES PRIVATE LIMITED (13200)", "AGRAWAL SECURITIES PRIVATE LIMITED (12300)", "AGRICULTURAL DEVELOPMENT BANK LIMITED (17200)", "APPLE SECURITIES PVT. LTD. (22300)", "ARUN SECURITIES PVT. LTD. (21800)", "ARYATARA INVESTMENT AND SECURITIES PRIVATE LIMITED (11900)", "ASIAN CAPITAL LIMITED (17500)", "ASIAN SECURITIES PRIVATE LIMITED (14700)", "BENI SECURITIES PVT. LTD. (23200)", "BHOLE GANESH SECURITIES LIMITED. (19100)", "BHRIKUTI STOCK BROKING COMPANY PRIVATE LIMITED (15000)", "BLUE CHIP SECURITIES LIMITED (20700)", "BRILLIANT SECURITIES PVT. LTD. (15600)", "CAPITAL HUB PVT. LTD. (20900)", "CAPITAL MAX SECURITIES LIMITED (19500)", "CITIZENS BANK INTERNATIONAL LIMITED (11700)", "CREATIVE SECURITIES PRIVATE LIMITED (13300)", "CRYSTAL KANCHANJUNGHA SECURITIES PVT. LTD (13400)", "DAKSHINKALI INVESTMENT AND SECURITIES PRIVATE LIMITED (12000)", "DEEVYAA  SECURITIES & STOCK HOUSE PRIVATE LIMITED (14500)", "DIPSHIKHA DHITOPATRA KAROBAR COMPANY (P.) LTD. (11300)", "DYNAMIC MONEY MANAGERS SECURITIES PRIVATE LIMITED (14900)", "ELITE MERCHANT CAPITAL LIMITED (20300)", "ELITE STOCK HOUSE LIMITED (19800)", "EVEREST BANK LTD. (10800)", "GARIMA CAPITAL LIMITED (17600)", "GARIMA SECURITIES LIMITED (21900)", "GLOBAL IME BANK LIMITED (11100)", "GLOBAL IME BANK LIMITED (12200)", "GLOBAL IME CAPITAL LIMITED (11200)", "GUHESWORI MERCHANT BANKING & FINANCE LIMITED (16200)", "GURKHAS FINANCE LIMITED (18000)", "HATEMALO FINANCIAL SERVICES PRIVATE LIMITED (20500)", "HIMALAYA SECURITIES BANKER LIMITED (22900)", "HIMALAYAN BROKERAGE COMPANY LIMITED (19600)", "HIMALAYAN CAPITAL LIMITED (10100)", "HIMALAYAN CAPITAL LIMITED (17700)", "HIMALAYAN INVESTMENT BANKER LIMITED (22800)", "ICFC FINANCE LIMITED (17400)", "IMPERIAL SECURITIES COMPANY LIMITED (13100)", "INDEX SECURITIES LIMITED (20000)", "INDIRA SECURITIES PVT. LTD. (20800)", "INFINITY SECURITIES LIMITED (19900)", "INVESTMENT MANAGEMENT NEPAL PVT. LTD. (23100)", "JF SECURITIES COMPANY PVT. LTD. (23300)", "JYOTI BIKASH BANK LIMITED (17900)", "K.B.L. SECURITIES LIMITED. (22000)", "KALASH STOCK MARKET PVT. LTD. (20100)", "KALIKA SECURITIES PVT. LTD. (18700)", "KAMANA SEWA BIKAS BANK LIMITED. (18200)", "KOHINOOR INVESTMENT & SECURITIES PRIVATE LIMITED (14300)", "KUMARI BANK LIMITED (15200)", "KUMARI BANK LIMITED (16300)", "LAXMI SUNRISE CAPITAL LIMITED (12400)", "LAXMI SUNRISE CAPITAL LIMITED (10700)", "LINCH STOCK MARKET  LIMITED (13800)", "MACHHAPUCHCHHRE BANK LIMITED (16100)", "MACHHAPUCHCHHRE CAPITAL LIMITED (14100)", "MACHHAPUCHCHHRE SECURITIES LTD. (21400)", "MAGNET SECURITIES AND INVESTMENT COMPANY PVT. LTD. (22200)", "MAHALAXMI BIKAS BANK LIMITED (16700)", "MANJUSHREE FINANCE LIMITED (18900)", "MARKET SECURITIES EXCHANGE COMPANY PVT. LTD (13600)", "MILKY WAY SHARE BROKER COMPANY LTD. (21600)", "MIYO SECURITIES PRIVATE LIMITED (19700)", "MONEY WORLD SHARE EXCHANGE PVT. LTD. (21100)", "MUKTINATH CAPITAL LIMITED (12500)", "NAASA SECURITIES COMPANY LTD (15900)", "NABIL BANK LIMITED (16800)", "NABIL BANK LIMITED (15100)", "NABIL INVESTMENT BANKING LTD. (10400)", "NAGARIK STOCK DEALER COMPANY LIMITED (20400)", "NATIONAL CAPITAL LIMITED (23400)", "NEPAL BANK LIMITED (15700)", "NEPAL DP LIMITED (15500)", "NEPAL INVESTMENT AND SECURITIES TRADING PVT. LTD. (23500)", "NEPAL LIFE CAPITAL LIMITED (16400)", "NEPAL SBI BANK LIMITED (15300)", "NEPAL STOCK HOUSE PRIVATE LIMITED (11500)", "NIC ASIA BANK LIMITED (13700)", "NIMB ACE CAPITAL LIMITED (10600)", "NIMB ACE CAPITAL LIMITED (10200)", "NIMB ACE CAPITAL LIMITED (17300)", "NMB CAPITAL LIMITED (11000)", "ONLINE SECURITIES LIMITED (11800)", "OPAL SECURITIES INVESTMENT PVT. LTD. (21200)", "OXFORD SECURITIES PVT. LTD. (17000)", "PAHI INVESTMENT PVT. LTD. (21300)", "PRABHU BANK LIMITED (13900)", "PRABHU BANK LIMITED (16000)", "PRABHU CAPITAL LIMITED (12600)", "PRAGYAN SECURITIES PVT. LTD. (22600)", "PREMIER SECURITIES COMPANY LIMITED (14800)", "PRIME COMMERCIAL BANK LIMITED (15400)", "PRIME COMMERCIAL BANK LIMITED (16900)", "PRIMO SECURITIES PRIVATE LIMITED (12800)", "PROGRESSIVE FINANCE LIMITED (18600)", "PROPERTY WIZARD LIMITED (19400)", "PROVIDENT MERCHANT BANKING LIMITED (16600)", "R.B.B. SECURITIES COMPANY LTD. (23000)", "RBB MERCHANT BANKING LIMITED (16500)", "ROADSHOW SECURITIES LTD. (22100)", "S.P.S.A. SECURITIES LTD. (21500)", "SAJILO BROKER LIMITED (21700)", "SAMPANNA CAPITAL AND ADVISORY NEPAL LIMITED (18100)", "SANI SECURITIES COMPANY LIMITED (14400)", "SANIMA BANK LTD (15800)", "SANIMA SECURITIES LIMITED (22400)", "SECURED SECURITIES LIMITED (11600)", "SEWA SECURITIES PRIVATE LIMITED (12700)", "SHANGRI-LA DEVELOPMENT BANK LIMITED (18400)", "SHAREPRO SECURITIES PVT.LTD. (19200)", "SHINE RESUNGA DEVELOPMENT BANK LIMITED (18500)", "SHREE INVESTMENT AND FINANCE CO. LTD. (18800)", "SHREE KRISHNA SECURITIES LIMITED (12900)", "SHUBHAKAMANA SECURITIES PVT. LTD. (20200)", "SIDDHARTHA CAPITAL LIMITED (10900)", "SIPLA SECURITIES PRIVATE LIMITED (14600)", "SOUTH ASIAN BULLS PRIVATE LIMITED (13000)", "SRI HARI SECURITIES PVT. LTD. (14000)", "STOXKARTS SECURITIES LIMITED (21000)", "SUMERU  SECURITIES  PRIVATE  LIMITED (14200)", "SUN SECURITIES PVT. LTD. (19300)", "SUNDHARA SECURITIES LIMITED (17800)", "SUNLIFE CAPITAL LIMITED (22500)", "SWARNALAXMI SECURITIES PVT. LTD. (18300)", "TRADEMOW SECURITIES PVT. LTD. (22700)", "TRISHAKTI SECURITIES LIMITED (11400)", "TRISHUL SECURITIES & INVESTMENT LIMITED (17100)", "VISION SECURITIES PVT. LTD (13500)"];

function Upload() {
    const [activeTab, setActiveTab] = useState('sync');
    const [isAuthenticated, setIsAuthenticated] = useState(!!sessionStorage.getItem('masterAuth'));
    const [passwordInput, setPasswordInput] = useState('');
    const [selectedMemberIds, setSelectedMemberIds] = useState([]);
    const [syncResults, setSyncResults] = useState(null);
    const [editModalVisible, setEditModalVisible] = useState(false);
    const [addMemberModalVisible, setAddMemberModalVisible] = useState(false);
    const [currentMember, setCurrentMember] = useState(null);
    const [form] = Form.useForm();
    const [addMemberForm] = Form.useForm();
    const queryClient = useQueryClient();
    const fileInputRef = useRef(null);

    // Queries
    const { data: members, isLoading: membersLoading } = useQuery({
        queryKey: ['members'],
        queryFn: () => getMembers().then(r => r.data),
    });

    // Mutations
    const syncMutation = useMutation({
        mutationFn: (ids) => syncMeroshare(ids),
        onSuccess: (res) => {
            setSyncResults(res.data);
            if (res.data.status === 'success') {
                message.success(res.data.message);
            } else {
                message.warning('Sync completed with some notifications.');
            }
            queryClient.invalidateQueries({ queryKey: ['transactions'] });
            queryClient.invalidateQueries({ queryKey: ['holdings'] });
            queryClient.invalidateQueries({ queryKey: ['portfolio-summary'] });
        },
        onError: (err) => {
            message.error(err.response?.data?.detail || 'Sync failed');
        },
    });

    const verifyMutation = useMutation({
        mutationFn: (pwd) => verifyMasterPassword(pwd),
        onSuccess: () => {
            sessionStorage.setItem('masterAuth', passwordInput);
            setIsAuthenticated(true);
            message.success('Authenticated successfully');
        },
        onError: () => {
            message.error('Invalid master password');
        },
    });

    const importMutation = useMutation({
        mutationFn: (data) => importCredentials(data),
        onSuccess: (res) => {
            message.success(res.data.message);
            queryClient.invalidateQueries({ queryKey: ['members'] });
        },
    });

    const updateCredMutation = useMutation({
        mutationFn: ({ id, data }) => setCredentials(id, data),
        onSuccess: () => {
            message.success('Credentials saved! Starting sync...');
            setEditModalVisible(false);
            queryClient.invalidateQueries({ queryKey: ['members'] });
            // Sync is automatically triggered by backend in background_tasks
        },
        onError: (err) => {
            message.error(err.response?.data?.detail || 'Failed to save credentials');
        },
    });

    const addMemberMutation = useMutation({
        mutationFn: (data) => createMember(data),
        onSuccess: () => {
            message.success('Member added');
            queryClient.invalidateQueries({ queryKey: ['members'] });
            setAddMemberModalVisible(false);
            addMemberForm.resetFields();
        },
        onError: (err) => message.error(err.response?.data?.detail || 'Failed to add member'),
    });

    const deleteMemberMutation = useMutation({
        mutationFn: (id) => deleteMember(id),
        onSuccess: () => {
            message.success('Member deleted');
            queryClient.invalidateQueries({ queryKey: ['members'] });
        },
    });

    // Handlers
    const handleVerify = () => {
        verifyMutation.mutate(passwordInput);
    };

    const [syncingMemberId, setSyncingMemberId] = useState(null);
    const [overallResults, setOverallResults] = useState([]);

    const handleSyncSelected = async (targetIds = null) => {
        const idsToSync = Array.isArray(targetIds) ? targetIds : selectedMemberIds;

        if (idsToSync.length === 0) {
            message.warning('Please select at least one member');
            return;
        }

        setOverallResults([]);
        setSyncingMemberId(null);

        message.loading({ content: `Starting sync for ${idsToSync.length} members...`, key: 'sync_msg' });

        for (const id of idsToSync) {
            const member = members.find(m => m.id === id);
            setSyncingMemberId(id);

            try {
                const res = await syncMeroshare([id]);
                const result = res.data.results[0]; // We sent only one ID

                setOverallResults(prev => [...prev, result]);

                if (result.status === 'success') {
                    message.success({ content: `Synced ${member?.name} successfully`, duration: 2 });
                } else {
                    message.error({ content: `Sync failed for ${member?.name}: ${result.reason || 'Unknown error'}`, duration: 3 });
                }
            } catch (err) {
                const errorResult = {
                    name: member?.name || 'Unknown',
                    status: 'failed',
                    reason: err.response?.data?.detail || 'Connection error'
                };
                setOverallResults(prev => [...prev, errorResult]);
                message.error(`Critical error syncing ${member?.name}`);
            }
        }

        setSyncingMemberId(null);
        message.success({ content: 'MeroShare synchronization complete!', key: 'sync_msg', duration: 3 });

        queryClient.invalidateQueries({ queryKey: ['transactions'] });
        queryClient.invalidateQueries({ queryKey: ['holdings'] });
        queryClient.invalidateQueries({ queryKey: ['portfolio-summary'] });
    };

    const handleEdit = async (member) => {
        setCurrentMember(member);
        try {
            const res = await getDecryptedCredentials(member.id);
            form.setFieldsValue(res.data);
            setEditModalVisible(true);
        } catch (err) {
            // If no credentials yet, just open empty
            form.resetFields();
            setEditModalVisible(true);
        }
    };

    const handleSaveCredentials = (values) => {
        updateCredMutation.mutate({ id: currentMember.id, data: values });
    };

    const handleExportExcel = async () => {
        try {
            const res = await exportCredentials();
            const ws = XLSX.utils.json_to_sheet(res.data);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, "Credentials");
            XLSX.writeFile(wb, "credentials_export.xlsx");
        } catch (err) {
            message.error('Export Excel failed');
        }
    };

    const handleExportCSV = async () => {
        try {
            const res = await exportCredentials();
            const csv = Papa.unparse(res.data);
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.setAttribute('download', 'credentials_export.csv');
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        } catch (err) {
            message.error('Export CSV failed');
        }
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

    const handleImportClick = () => fileInputRef.current.click();

    const handleFileImport = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        console.log('Importing file:', file.name);
        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            complete: (results) => {
                console.log('Parsed columns:', results.meta.fields);
                const mapped = results.data
                    .filter(row => row.Owner || row.owner || row.Username || row.username) // Skip empty rows
                    .map(row => ({
                        owner: row.Owner || row.owner,
                        dp: row.DP || row.dp,
                        username: row.Username || row.username,
                        password: row.Password || row.password,
                        crn: row.CRN || row.crn,
                        txn_pin: row.Txn_Pin || row.txn_pin || row.txnPin,
                        apply_unit: parseInt(row.Apply_Unit || row.apply_unit || row.applyUnit) || 10
                    }));

                console.log('Mapped data:', mapped);
                if (mapped.length === 0) {
                    message.error('No valid member data found in CSV. Check your headers (Owner, DP, Username, etc.)');
                    return;
                }
                importMutation.mutate(mapped);
            },
            error: (err) => {
                console.error('CSV Parse Error:', err);
                message.error('Failed to parse CSV file');
            }
        });
        e.target.value = null; // Reset file input
    };

    // Columns for credential table
    const credColumns = [
        { title: 'Name', dataIndex: 'display_name', key: 'name', render: (text, record) => <span style={{ fontWeight: 600 }}>{text || record.name}</span> },
        {
            title: 'MeroShare',
            dataIndex: 'id',
            key: 'user',
            render: (id) => {
                const m = members?.find(m => m.id === id);
                return m?.has_credentials ? <Tag icon={<CheckCircleOutlined />} color="success">Configured</Tag> : <Tag icon={<CloseCircleOutlined />} color="default">Not Set</Tag>;
            }
        },
        {
            title: 'Status',
            dataIndex: 'is_active',
            key: 'is_active',
            render: (v) => <Tag color={v ? 'green' : 'red'}>{v ? 'Active' : 'Inactive'}</Tag>,
        },
        {
            title: 'Actions',
            key: 'action',
            render: (_, record) => (
                <Space>
                    <Button
                        type="default"
                        size="small"
                        icon={<KeyOutlined />}
                        onClick={() => handleEdit(record)}
                    >
                        Credentials
                    </Button>
                    {record.has_credentials && (
                        <Button
                            type="link"
                            size="small"
                            icon={<SyncOutlined />}
                            loading={syncingMemberId === record.id}
                            onClick={() => handleSyncSelected([record.id])}
                        >
                            Sync History
                        </Button>
                    )}
                    <Popconfirm
                        title="Delete this member?"
                        onConfirm={() => deleteMemberMutation.mutate(record.id)}
                    >
                        <Button type="text" danger size="small" icon={<DeleteOutlined />} />
                    </Popconfirm>
                </Space>
            ),
        },
    ];

    if (activeTab === 'creds' && !isAuthenticated) {
        return (
            <div className="animate-in" style={{ maxWidth: 400, margin: '100px auto' }}>
                <Card title={<><LockOutlined /> Identity Verification</>} style={{ borderRadius: 16 }}>
                    <p style={{ color: 'var(--text-secondary)', marginBottom: 20 }}>
                        Credential management is protected. Please enter the master password to continue.
                    </p>
                    <Input.Password
                        placeholder="Master Password"
                        value={passwordInput}
                        onChange={(e) => setPasswordInput(e.target.value)}
                        onPressEnter={handleVerify}
                        prefix={<KeyOutlined style={{ color: 'var(--accent-primary)' }} />}
                        style={{ marginBottom: 16, borderRadius: 8 }}
                    />
                    <Button
                        type="primary"
                        block
                        onClick={handleVerify}
                        loading={verifyMutation.isPending}
                        style={{ borderRadius: 8 }}
                    >
                        Unlock Credentials
                    </Button>
                </Card>
            </div>
        );
    }

    return (
        <div className="animate-in">
            <div className="page-header">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                    <div>
                        <h1>Sync & Credentials</h1>
                        <p className="subtitle">Manage MeroShare connections and automate history synchronization</p>
                    </div>
                    {isAuthenticated && activeTab === 'creds' && (
                        <Space>
                            <input
                                type="file"
                                ref={fileInputRef}
                                style={{ display: 'none' }}
                                onChange={handleFileImport}
                                accept=".csv"
                            />
                            <Button icon={<ImportOutlined />} onClick={handleImportClick}>Import CSV</Button>
                            <Dropdown menu={{ items: exportItems }}>
                                <Button icon={<ExportOutlined />}>Export</Button>
                            </Dropdown>
                            <Button type="primary" icon={<PlusOutlined />} onClick={() => setAddMemberModalVisible(true)}>Add Member</Button>
                        </Space>
                    )}
                </div>
            </div>

            <Tabs
                activeKey={activeTab}
                onChange={setActiveTab}
                className="custom-tabs"
                style={{ marginTop: 24 }}
            >
                <TabPane tab={<Space><SyncOutlined /> MeroShare Sync</Space>} key="sync">
                    <Card style={{ borderRadius: 16 }}>

                        <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Space size="middle">
                                <Checkbox
                                    indeterminate={selectedMemberIds.length > 0 && selectedMemberIds.length < (members?.filter(m => m.has_credentials).length || 0)}
                                    checked={selectedMemberIds.length > 0 && selectedMemberIds.length === (members?.filter(m => m.has_credentials).length || 0)}
                                    onChange={(e) => {
                                        if (e.target.checked) {
                                            const allIds = members?.filter(m => m.has_credentials).map(m => m.id) || [];
                                            setSelectedMemberIds(allIds);
                                        } else {
                                            setSelectedMemberIds([]);
                                        }
                                    }}
                                >
                                    <span style={{ fontWeight: 500 }}>Select All Configured</span>
                                </Checkbox>
                            </Space>
                            <Button
                                type="primary"
                                icon={<SyncOutlined spin={!!syncingMemberId} />}
                                loading={!!syncingMemberId}
                                onClick={handleSyncSelected}
                            >
                                {syncingMemberId ? 'Syncing...' : 'Sync Selected Members'}
                            </Button>
                        </div>

                        {syncingMemberId && (
                            <div style={{ marginBottom: 16, padding: '12px 20px', background: 'rgba(108, 92, 231, 0.05)', borderRadius: 10, display: 'flex', alignItems: 'center', gap: 12 }}>
                                <SyncOutlined spin style={{ color: 'var(--accent-primary)' }} />
                                <span>Currently processing: <strong style={{ color: 'var(--accent-primary)' }}>{members?.find(m => m.id === syncingMemberId)?.display_name || members?.find(m => m.id === syncingMemberId)?.name}</strong>. Please do not close this tab.</span>
                            </div>
                        )}

                        <List
                            loading={membersLoading}
                            dataSource={members}
                            style={{ background: 'rgba(255,255,255,0.02)', borderRadius: 12, border: '1px solid var(--border-color)' }}
                            renderItem={item => (
                                <List.Item style={{ padding: '16px 24px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
                                        <Checkbox
                                            disabled={!item.has_credentials}
                                            checked={selectedMemberIds.includes(item.id)}
                                            onChange={(e) => {
                                                if (e.target.checked) {
                                                    setSelectedMemberIds([...selectedMemberIds, item.id]);
                                                } else {
                                                    setSelectedMemberIds(selectedMemberIds.filter(id => id !== item.id));
                                                }
                                            }}
                                        />
                                        <div style={{ marginLeft: 16 }}>
                                            <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                                                {item.display_name || item.name}
                                            </div>
                                            {!item.has_credentials && (
                                                <div style={{ fontSize: 12, color: 'var(--accent-red)' }}>
                                                    Credentials not configured
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </List.Item>
                            )}
                        />

                        {overallResults.length > 0 && (
                            <div style={{ marginTop: 24 }}>
                                <h3>Sync Results</h3>
                                <List
                                    size="small"
                                    dataSource={overallResults}
                                    renderItem={item => (
                                        <List.Item>
                                            <div style={{ width: '100%' }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                                                    <strong>{item.name}</strong>
                                                    <Tag color={item.status === 'success' ? 'green' : 'red'}>
                                                        {item.status.toUpperCase()}
                                                    </Tag>
                                                </div>
                                                <div style={{ fontSize: 13 }}>
                                                    {item.status === 'success' ? (
                                                        item.message || `Created: ${item.created} | Skipped: ${item.skipped}`
                                                    ) : (
                                                        <span style={{ color: 'var(--accent-red)' }}>{item.reason}</span>
                                                    )}
                                                </div>
                                            </div>
                                        </List.Item>
                                    )}
                                />
                            </div>
                        )}
                    </Card>
                </TabPane>

                <TabPane tab={<Space><UserOutlined /> Members</Space>} key="creds">
                    <Card style={{ borderRadius: 16 }} bodyStyle={{ padding: 0 }}>
                        <Table
                            loading={membersLoading}
                            dataSource={members}
                            columns={credColumns}
                            rowKey="id"
                            pagination={false}
                            style={{ borderRadius: 16, overflow: 'hidden' }}
                        />
                    </Card>
                </TabPane>
            </Tabs>

            {/* Add Member Modal */}
            <Modal
                title="Add Family Member"
                open={addMemberModalVisible}
                onCancel={() => { setAddMemberModalVisible(false); addMemberForm.resetFields(); }}
                footer={null}
            >
                <Form form={addMemberForm} layout="vertical" onFinish={(v) => addMemberMutation.mutate(v)} style={{ marginTop: 16 }}>
                    <Form.Item name="name" label="Name" rules={[{ required: true }]}>
                        <Input placeholder="e.g., Amrit" />
                    </Form.Item>
                    <Form.Item name="display_name" label="Display Name">
                        <Input placeholder="e.g., Amrit Poudel (optional)" />
                    </Form.Item>
                    <Form.Item>
                        <Button type="primary" htmlType="submit" loading={addMemberMutation.isPending} block>
                            Add Member
                        </Button>
                    </Form.Item>
                </Form>
            </Modal>

            {/* Edit Credentials Modal */}
            <Modal
                title={<><UserOutlined /> MeroShare Credentials: {currentMember?.name}</>}
                open={editModalVisible}
                onCancel={() => setEditModalVisible(false)}
                footer={null}
                width={500}
                centered
            >
                <Form
                    form={form}
                    layout="vertical"
                    onFinish={handleSaveCredentials}
                    style={{ marginTop: 20 }}
                >
                    <Form.Item label="DP (Capital/Bank Name)" name="dp" rules={[{ required: true }]}>
                        <Select 
                            showSearch
                            placeholder="Select your DP"
                            optionFilterProp="children"
                            filterOption={(input, option) =>
                                option.children.toLowerCase().includes(input.toLowerCase())
                            }
                        >
                            {DP_OPTIONS.map(dp => (
                                <Option key={dp} value={dp}>{dp}</Option>
                            ))}
                        </Select>
                    </Form.Item>

                    <Form.Item label="Username (MeroShare ID)" name="username" rules={[{ required: true }]}>
                        <Input prefix={<NumberOutlined />} />
                    </Form.Item>

                    <Form.Item label="MeroShare Password" name="password" rules={[{ required: true }]}>
                        <Input.Password prefix={<LockOutlined />} />
                    </Form.Item>

                    <Space style={{ width: '100%' }} size="large">
                        <Form.Item label="CRN Number" name="crn" style={{ flex: 1 }}>
                            <Input prefix={<SafetyCertificateOutlined />} />
                        </Form.Item>
                        <Form.Item label="Transaction PIN" name="txn_pin" style={{ flex: 1 }}>
                            <Input prefix={<KeyOutlined />} />
                        </Form.Item>
                    </Space>

                    <Form.Item label="Apply Unit (Default)" name="apply_unit" initialValue={10}>
                        <InputNumber style={{ width: '100%' }} />
                    </Form.Item>

                    <Form.Item style={{ marginBottom: 0, marginTop: 24 }}>
                        <Button type="primary" htmlType="submit" block size="large" loading={updateCredMutation.isPending}>
                            Save & Sync History
                        </Button>
                    </Form.Item>
                </Form>
            </Modal>
        </div>
    );
}

export default Upload;

