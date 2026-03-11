import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, Button, Modal, Form, Input, Table, Tag, message, Popconfirm, Space } from 'antd';
import { PlusOutlined, DeleteOutlined, KeyOutlined, CheckCircleOutlined, CloseCircleOutlined } from '@ant-design/icons';
import { getMembers, createMember, deleteMember, setCredentials } from '../services/api';

function Members() {
    const [memberModalOpen, setMemberModalOpen] = useState(false);
    const [credModalOpen, setCredModalOpen] = useState(false);
    const [selectedMember, setSelectedMember] = useState(null);
    const [memberForm] = Form.useForm();
    const [credForm] = Form.useForm();
    const queryClient = useQueryClient();

    const { data: members, isLoading } = useQuery({
        queryKey: ['members'],
        queryFn: () => getMembers().then(r => r.data),
    });

    const addMemberMutation = useMutation({
        mutationFn: (data) => createMember(data),
        onSuccess: () => {
            message.success('Member added');
            queryClient.invalidateQueries({ queryKey: ['members'] });
            setMemberModalOpen(false);
            memberForm.resetFields();
        },
        onError: (err) => message.error(err.response?.data?.detail || 'Failed'),
    });

    const deleteMemberMutation = useMutation({
        mutationFn: (id) => deleteMember(id),
        onSuccess: () => {
            message.success('Member deleted');
            queryClient.invalidateQueries({ queryKey: ['members'] });
        },
    });

    const setCredMutation = useMutation({
        mutationFn: ({ memberId, data }) => setCredentials(memberId, data),
        onSuccess: () => {
            message.success('Credentials saved');
            queryClient.invalidateQueries({ queryKey: ['members'] });
            setCredModalOpen(false);
            credForm.resetFields();
        },
        onError: (err) => message.error(err.response?.data?.detail || 'Failed'),
    });

    const columns = [
        {
            title: 'Name',
            dataIndex: 'name',
            key: 'name',
            render: (name) => <span style={{ fontWeight: 600, fontSize: 14 }}>{name}</span>,
        },
        {
            title: 'Display Name',
            dataIndex: 'display_name',
            key: 'display_name',
            render: (v) => v || '—',
        },
        {
            title: 'MeroShare',
            dataIndex: 'has_credentials',
            key: 'has_credentials',
            render: (v) => v ? (
                <Tag icon={<CheckCircleOutlined />} color="success">Configured</Tag>
            ) : (
                <Tag icon={<CloseCircleOutlined />} color="default">Not Set</Tag>
            ),
        },
        {
            title: 'Status',
            dataIndex: 'is_active',
            key: 'is_active',
            render: (v) => <Tag color={v ? 'green' : 'red'}>{v ? 'Active' : 'Inactive'}</Tag>,
        },
        {
            title: 'Actions',
            key: 'actions',
            render: (_, record) => (
                <Space>
                    <Button
                        type="default"
                        size="small"
                        icon={<KeyOutlined />}
                        onClick={() => {
                            setSelectedMember(record);
                            setCredModalOpen(true);
                        }}
                    >
                        Credentials
                    </Button>
                    <Popconfirm
                        title="Delete this member and all their data?"
                        onConfirm={() => deleteMemberMutation.mutate(record.id)}
                    >
                        <Button type="text" danger size="small" icon={<DeleteOutlined />} />
                    </Popconfirm>
                </Space>
            ),
        },
    ];

    return (
        <div className="animate-in">
            <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                    <h1>Members</h1>
                    <p className="subtitle">Manage family members and their MeroShare credentials</p>
                </div>
                <Button type="primary" icon={<PlusOutlined />} onClick={() => setMemberModalOpen(true)}>
                    Add Member
                </Button>
            </div>

            <div className="portfolio-table">
                <Table
                    columns={columns}
                    dataSource={members || []}
                    rowKey="id"
                    loading={isLoading}
                    pagination={false}
                />
            </div>

            {/* Add Member Modal */}
            <Modal
                title="Add Family Member"
                open={memberModalOpen}
                onCancel={() => { setMemberModalOpen(false); memberForm.resetFields(); }}
                footer={null}
            >
                <Form form={memberForm} layout="vertical" onFinish={(v) => addMemberMutation.mutate(v)} style={{ marginTop: 16 }}>
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

            {/* Credentials Modal */}
            <Modal
                title={`MeroShare Credentials — ${selectedMember?.name}`}
                open={credModalOpen}
                onCancel={() => { setCredModalOpen(false); credForm.resetFields(); }}
                footer={null}
                width={500}
            >
                <Form
                    form={credForm}
                    layout="vertical"
                    onFinish={(v) => setCredMutation.mutate({ memberId: selectedMember.id, data: v })}
                    style={{ marginTop: 16 }}
                >
                    <Form.Item name="dp" label="Depository Participant (DP)" rules={[{ required: true }]}>
                        <Input placeholder="e.g., GLOBAL IME CAPITAL LIMITED (11200)" />
                    </Form.Item>
                    <Form.Item name="username" label="Username (DMAT No.)" rules={[{ required: true }]}>
                        <Input placeholder="e.g., 1604585" />
                    </Form.Item>
                    <Form.Item name="password" label="Password" rules={[{ required: true }]}>
                        <Input.Password placeholder="MeroShare password" />
                    </Form.Item>
                    <Form.Item name="crn" label="CRN">
                        <Input placeholder="e.g., KT0546452" />
                    </Form.Item>
                    <Form.Item name="txn_pin" label="Transaction PIN">
                        <Input.Password placeholder="e.g., 3592" />
                    </Form.Item>
                    <Form.Item name="apply_unit" label="IPO Apply Unit" initialValue={10}>
                        <Input type="number" />
                    </Form.Item>
                    <Form.Item>
                        <Button type="primary" htmlType="submit" loading={setCredMutation.isPending} block>
                            Save Credentials (Encrypted)
                        </Button>
                    </Form.Item>
                </Form>
            </Modal>
        </div>
    );
}

export default Members;
