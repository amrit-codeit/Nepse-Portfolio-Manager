import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, Table, InputNumber, Button, message, Divider, Alert, Space, Modal, Form, DatePicker, Input, Tag, Tabs, Row, Col, Typography } from 'antd';
import { SettingOutlined, SaveOutlined, HistoryOutlined, PlusOutlined } from '@ant-design/icons';
import { getFeeConfig, updateFeeConfig, getFeeConfigHistory, addFeeConfigVersion } from '../services/api';
import { useState } from 'react';

function Settings() {
    const [editedValues, setEditedValues] = useState({});
    const [historyModal, setHistoryModal] = useState({ visible: false, key: null, title: '' });
    const [versionModal, setVersionModal] = useState(false);
    const [versionForm] = Form.useForm();
    const queryClient = useQueryClient();

    const { data: feeConfig, isLoading } = useQuery({
        queryKey: ['fee-config'],
        queryFn: () => getFeeConfig().then(r => r.data),
    });

    const { data: historyData, isLoading: historyLoading } = useQuery({
        queryKey: ['fee-config-history', historyModal.key],
        queryFn: () => getFeeConfigHistory(historyModal.key).then(r => r.data),
        enabled: !!historyModal.key,
    });

    const updateMutation = useMutation({
        mutationFn: ({ key, value }) => updateFeeConfig(key, String(value)),
        onSuccess: () => {
            message.success('Fee config updated');
            queryClient.invalidateQueries({ queryKey: ['fee-config'] });
        },
        onError: () => message.error('Failed to update'),
    });

    const addVersionMutation = useMutation({
        mutationFn: (data) => addFeeConfigVersion(data),
        onSuccess: () => {
            message.success('New fee version added');
            queryClient.invalidateQueries({ queryKey: ['fee-config'] });
            queryClient.invalidateQueries({ queryKey: ['fee-config-history'] });
            setVersionModal(false);
            versionForm.resetFields();
        },
        onError: () => message.error('Failed to add fee version'),
    });


    const handleSave = (key) => {
        if (editedValues[key] !== undefined) {
            updateMutation.mutate({ key, value: editedValues[key] });
            setEditedValues(prev => {
                const next = { ...prev };
                delete next[key];
                return next;
            });
        }
    };

    const handleAddVersion = (values) => {
        addVersionMutation.mutate({
            key: values.key,
            value: String(values.value),
            effective_from: values.effective_from.format('YYYY-MM-DD'),
            description: values.description,
        });
    };

    const brokerConfigs = (feeConfig || []).filter(c => c.key.startsWith('broker_'));
    const sebonConfigs = (feeConfig || []).filter(c => c.key.startsWith('sebon_'));
    const dpConfigs = (feeConfig || []).filter(c => c.key.includes('dp_') || c.key.includes('name_transfer'));
    const cgtConfigs = (feeConfig || []).filter(c => c.key.startsWith('cgt_'));

    const renderConfigTable = (configs, title) => (
            <Table
                style={{ marginTop: 12 }}
                dataSource={configs}
                rowKey="key"
                pagination={false}
                size="middle"
                columns={[
                    {
                        title: 'Parameter Name',
                        dataIndex: 'description',
                        key: 'description',
                        render: (d, r) => (
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{d || r.key}</span>
                                <code style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>{r.key}</code>
                            </div>
                        ),
                    },
                    {
                        title: 'Current Rate',
                        dataIndex: 'value',
                        key: 'value',
                        width: 200,
                        render: (v, r) => (
                            <Space size="small">
                                <InputNumber
                                    defaultValue={Number(v)}
                                    size="middle"
                                    style={{ width: 140, fontWeight: 600 }}
                                    onChange={(val) => setEditedValues(prev => ({ ...prev, [r.key]: val }))}
                                />
                            </Space>
                        ),
                    },
                    {
                        title: 'Status',
                        dataIndex: 'effective_from',
                        key: 'effective_from',
                        width: 150,
                        render: (v) => v ? <Tag color="green">Active: {v}</Tag> : <Tag color="blue">System Default</Tag>,
                    },
                    {
                        title: 'Actions',
                        key: 'actions',
                        width: 180,
                        align: 'right',
                        render: (_, r) => (
                            <Space size="small">
                                {editedValues[r.key] !== undefined && (
                                    <Button
                                        type="primary"
                                        size="small"
                                        icon={<SaveOutlined />}
                                        onClick={() => handleSave(r.key)}
                                        loading={updateMutation.isPending}
                                        style={{ background: 'var(--gradient-primary)', border: 'none' }}
                                    >
                                        Save
                                    </Button>
                                )}
                                <Button
                                    size="small"
                                    type="default"
                                    icon={<HistoryOutlined />}
                                    onClick={() => setHistoryModal({ visible: true, key: r.key, title: r.description || r.key })}
                                    title="View Audit History"
                                    style={{ color: 'var(--text-secondary)' }}
                                />
                            </Space>
                        ),
                    },
                ]}
            />
    );

    const settingTabs = [
        {
            key: 'broker',
            label: '📊 Broker Commissions',
            children: renderConfigTable(brokerConfigs, 'Broker commission tiers based on trade volume.'),
        },
        {
            key: 'sebon',
            label: '🏛️ SEBON Fees',
            children: renderConfigTable(sebonConfigs, 'Regulatory board fee rates.'),
        },
        {
            key: 'dp',
            label: '💳 DP & Transfer',
            children: renderConfigTable(dpConfigs, 'Depository Participant and Name Transfer charges.'),
        },
        {
            key: 'cgt',
            label: '💰 Capital Gains Tax',
            children: renderConfigTable(cgtConfigs, 'Tax brackets for individual and corporate investors.'),
        }
    ];

    return (
        <div className="animate-in">
            <div className="page-header">
                <h1>Settings</h1>
                <p className="subtitle">System operations and SEBON fee parameters</p>
            </div>


            <Row gutter={[24, 24]}>
                <Col xs={24} lg={6}>
                    <Card style={{ borderRadius: 12, background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', height: '100%' }}>
                        <Typography.Title level={4} style={{ marginTop: 0 }}>Fee Engine Configuration</Typography.Title>
                        <p style={{ color: 'var(--text-secondary)', fontSize: 13, lineHeight: 1.6, marginBottom: 24 }}>
                            Modify the underlying rates used by the system to calculate exact true-cost averages, break-even targets, and net portfolio summaries. 
                            <br/><br/>
                            Rates are strictly timestamped to preserve the historical integrity of your legacy trades.
                        </p>
                        
                        <Button
                            type="primary"
                            icon={<PlusOutlined />}
                            onClick={() => setVersionModal(true)}
                            block
                            size="large"
                            style={{ background: 'var(--gradient-primary)', border: 'none' }}
                        >
                            Publish New Rate Version
                        </Button>
                    </Card>
                </Col>
                
                <Col xs={24} lg={18}>
                    <Card style={{ borderRadius: 14 }} loading={isLoading} bodyStyle={{ padding: '0px 24px 24px 24px' }}>
                        <Tabs 
                            defaultActiveKey="broker" 
                            items={settingTabs}
                            size="large"
                            tabBarStyle={{ marginBottom: 24 }}
                        />
                    </Card>
                </Col>
            </Row>

            {/* History Modal */}
            <Modal
                title={`Rate History — ${historyModal.title}`}
                open={historyModal.visible}
                onCancel={() => setHistoryModal({ visible: false, key: null, title: '' })}
                footer={null}
                width={600}
            >
                <Table
                    loading={historyLoading}
                    dataSource={historyData || []}
                    rowKey="id"
                    pagination={false}
                    size="small"
                    columns={[
                        { title: 'Value', dataIndex: 'value', key: 'value' },
                        {
                            title: 'Effective From',
                            dataIndex: 'effective_from',
                            key: 'effective_from',
                            render: (v) => v || 'Default (initial)',
                        },
                        { title: 'Description', dataIndex: 'description', key: 'description' },
                    ]}
                />
            </Modal>

            {/* Add Version Modal */}
            <Modal
                title="Add New Fee Rate Version"
                open={versionModal}
                onCancel={() => { setVersionModal(false); versionForm.resetFields(); }}
                footer={null}
                width={500}
            >
                <Alert
                    type="warning"
                    showIcon
                    message="This adds a NEW rate version"
                    description="Old transactions will continue using the rate that was in effect at their transaction date."
                    style={{ marginBottom: 16 }}
                />
                <Form form={versionForm} onFinish={handleAddVersion} layout="vertical">
                    <Form.Item name="key" label="Fee Parameter Key" rules={[{ required: true }]}>
                        <Input placeholder="e.g. broker_tier_1_rate" />
                    </Form.Item>
                    <Form.Item name="value" label="New Value" rules={[{ required: true }]}>
                        <InputNumber style={{ width: '100%' }} placeholder="e.g. 0.34" />
                    </Form.Item>
                    <Form.Item name="effective_from" label="Effective From Date" rules={[{ required: true }]}>
                        <DatePicker style={{ width: '100%' }} />
                    </Form.Item>
                    <Form.Item name="description" label="Description (optional)">
                        <Input placeholder="e.g. Updated broker tier 1 rate per SEBON circular" />
                    </Form.Item>
                    <Form.Item>
                        <Button type="primary" htmlType="submit" loading={addVersionMutation.isPending} block>
                            Add Version
                        </Button>
                    </Form.Item>
                </Form>
            </Modal>
        </div>
    );
}

export default Settings;
