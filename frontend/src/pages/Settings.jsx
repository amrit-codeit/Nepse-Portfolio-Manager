import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, Table, InputNumber, Button, message, Divider, Alert, Space, Modal, Form, DatePicker, Input, Tag } from 'antd';
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
        <div style={{ marginBottom: 24 }}>
            <h3 style={{ marginBottom: 12, color: 'var(--text-primary)' }}>{title}</h3>
            <Table
                dataSource={configs}
                rowKey="key"
                pagination={false}
                size="small"
                columns={[
                    {
                        title: 'Parameter',
                        dataIndex: 'description',
                        key: 'description',
                        render: (d, r) => d || r.key,
                    },
                    {
                        title: 'Key',
                        dataIndex: 'key',
                        key: 'key',
                        width: 200,
                        render: (k) => <code style={{ fontSize: 11, color: 'var(--accent-secondary)' }}>{k}</code>,
                    },
                    {
                        title: 'Value',
                        dataIndex: 'value',
                        key: 'value',
                        width: 150,
                        render: (v, r) => (
                            <InputNumber
                                defaultValue={Number(v)}
                                size="small"
                                style={{ width: 120 }}
                                onChange={(val) => setEditedValues(prev => ({ ...prev, [r.key]: val }))}
                            />
                        ),
                    },
                    {
                        title: 'Effective',
                        dataIndex: 'effective_from',
                        key: 'effective_from',
                        width: 120,
                        render: (v) => v ? <Tag color="blue">{v}</Tag> : <Tag color="default">Default</Tag>,
                    },
                    {
                        title: '',
                        key: 'actions',
                        width: 160,
                        render: (_, r) => (
                            <Space size="small">
                                {editedValues[r.key] !== undefined && (
                                    <Button
                                        type="primary"
                                        size="small"
                                        icon={<SaveOutlined />}
                                        onClick={() => handleSave(r.key)}
                                        loading={updateMutation.isPending}
                                    >
                                        Save
                                    </Button>
                                )}
                                <Button
                                    size="small"
                                    icon={<HistoryOutlined />}
                                    onClick={() => setHistoryModal({ visible: true, key: r.key, title: r.description || r.key })}
                                />
                            </Space>
                        ),
                    },
                ]}
            />
        </div>
    );

    return (
        <div className="animate-in">
            <div className="page-header">
                <h1>Settings</h1>
                <p className="subtitle">System operations and SEBON fee parameters</p>
            </div>


            <Alert
                type="info"
                showIcon
                message="Fee configuration"
                description="These values are used to calculate broker commission, SEBON fees, DP charges, and Capital Gains Tax. When rates change, add a new version with an effective date to preserve history."
                style={{ marginBottom: 16, borderRadius: 10 }}
            />

            <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'flex-end' }}>
                <Button
                    type="primary"
                    icon={<PlusOutlined />}
                    onClick={() => setVersionModal(true)}
                >
                    Add Rate Change Version
                </Button>
            </div>

            <Card style={{ borderRadius: 14 }} loading={isLoading}>
                {renderConfigTable(brokerConfigs, '📊 Broker Commission Tiers')}
                <Divider />
                {renderConfigTable(sebonConfigs, '🏛️ SEBON Regulatory Fee')}
                <Divider />
                {renderConfigTable(dpConfigs, '💳 DP & Transfer Charges')}
                <Divider />
                {renderConfigTable(cgtConfigs, '💰 Capital Gains Tax')}
            </Card>

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
