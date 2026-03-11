import { useState, useEffect } from 'react';
import { Card, Select, Button, Table, Checkbox, Spin, Alert, message, List, Typography } from 'antd';
import { SyncOutlined, SendOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { getMembers, getOpenIPOs, applyIPOs, getIPOJobStatus } from '../services/api';

const { Title, Text } = Typography;

export default function ApplyIPO() {
    const [fetchMemberId, setFetchMemberId] = useState(null);
    const [isFetching, setIsFetching] = useState(false);
    const [openIssues, setOpenIssues] = useState([]);

    const [selectedIssues, setSelectedIssues] = useState([]);
    const [applyMemberIds, setApplyMemberIds] = useState([]);

    const [jobId, setJobId] = useState(null);
    const [jobStatus, setJobStatus] = useState(null);

    const { data: membersData } = useQuery({
        queryKey: ['members'],
        queryFn: () => getMembers().then(r => r.data),
    });
    const members = membersData || [];

    const handleFetchOpenIPOs = async () => {
        if (!fetchMemberId) {
            message.warning("Select a member first");
            return;
        }
        setIsFetching(true);
        setOpenIssues([]);
        try {
            const res = await getOpenIPOs(fetchMemberId);
            setOpenIssues(res.data.open_issues);
            message.success(`Found ${res.data.open_issues.length} issues`);
        } catch (e) {
            message.error(e.response?.data?.detail || "Failed to fetch IPOs");
        } finally {
            setIsFetching(false);
        }
    };

    const handleApply = async () => {
        if (selectedIssues.length === 0) {
            message.warning("Select at least one IPO issue");
            return;
        }
        if (applyMemberIds.length === 0) {
            message.warning("Select at least one member to apply for");
            return;
        }

        try {
            const res = await applyIPOs({
                member_ids: applyMemberIds,
                ipo_indices: selectedIssues,
                apply_unit: 10, // Assuming 10 for all, could make adjustable
            });
            setJobId(res.data.job_id);
            setJobStatus({ status: 'running', results: [] });
            message.success("IPO Application job started");
        } catch (e) {
            message.error(e.response?.data?.detail || "Failed to start job");
        }
    };

    // Poll job status
    useEffect(() => {
        if (!jobId || (jobStatus?.status !== 'running' && jobStatus?.status !== 'pending')) return;

        const interval = setInterval(async () => {
            try {
                const res = await getIPOJobStatus(jobId);
                setJobStatus(res.data);
                if (res.data.status !== 'running' && res.data.status !== 'pending') {
                    clearInterval(interval);
                    if (res.data.status === 'done') {
                        message.success("IPO applications completed!");
                    } else {
                        message.error("IPO job failed: " + res.data.message);
                    }
                }
            } catch (error) {
                console.error("Poll error", error);
            }
        }, 3000);

        return () => clearInterval(interval);
    }, [jobId, jobStatus]);

    const columns = [
        {
            title: 'Index',
            dataIndex: 'index',
            key: 'index',
            width: 60,
        },
        {
            title: 'Company',
            dataIndex: 'name',
            key: 'name',
        },
        {
            title: 'Ticker',
            dataIndex: 'ticker',
            key: 'ticker',
            width: 100,
        },
        {
            title: 'Share Type',
            dataIndex: 'share_type',
            key: 'share_type',
        },
        {
            title: 'Status',
            dataIndex: 'mode',
            key: 'mode',
            render: (mode) => {
                const isApply = mode.toLowerCase() === 'apply';
                return <span style={{ color: isApply ? 'var(--accent-green)' : 'var(--text-secondary)' }}>{mode}</span>;
            }
        }
    ];

    const rowSelection = {
        selectedRowKeys: selectedIssues,
        onChange: (keys) => setSelectedIssues(keys),
        getCheckboxProps: (record) => ({
            disabled: record.mode.toLowerCase() !== 'apply',
        }),
    };

    return (
        <div className="animate-in" style={{ padding: '0 24px' }}>
            <Title level={2} style={{ marginBottom: 24 }}><ThunderboltOutlined /> Apply IPO</Title>

            <Card title="Step 1: Check Open IPOs" style={{ marginBottom: 24 }}>
                <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                    <Select
                        placeholder="Select member to check IPOs"
                        style={{ width: 300 }}
                        options={members.map(m => ({ label: m.display_name || m.name, value: m.id }))}
                        value={fetchMemberId}
                        onChange={setFetchMemberId}
                    />
                    <Button
                        type="primary"
                        icon={<SyncOutlined spin={isFetching} />}
                        onClick={handleFetchOpenIPOs}
                        loading={isFetching}
                    >
                        Fetch Open Issues
                    </Button>
                </div>

                {openIssues.length > 0 && (
                    <div style={{ marginTop: 24 }}>
                        <Text strong>Available Issues</Text>
                        <Table
                            rowSelection={rowSelection}
                            dataSource={openIssues}
                            columns={columns}
                            rowKey="index"
                            pagination={false}
                            size="small"
                            style={{ marginTop: 16 }}
                        />
                    </div>
                )}
            </Card>

            <Card title="Step 2: Start Application" style={{ marginBottom: 24, opacity: openIssues.length > 0 && selectedIssues.length > 0 ? 1 : 0.5 }}>
                <div style={{ marginBottom: 16 }}>
                    <Text strong>Select members to apply for:</Text>
                    <div style={{ marginTop: 12 }}>
                        <Checkbox.Group
                            options={members.map(m => ({ label: m.display_name || m.name, value: m.id }))}
                            value={applyMemberIds}
                            onChange={setApplyMemberIds}
                        />
                    </div>
                </div>

                <Button
                    type="primary"
                    size="large"
                    icon={<SendOutlined />}
                    onClick={handleApply}
                    disabled={selectedIssues.length === 0 || applyMemberIds.length === 0 || jobStatus?.status === 'running'}
                    loading={jobStatus?.status === 'running'}
                >
                    {jobStatus?.status === 'running' ? 'Applying...' : 'Apply for Selected IPOs'}
                </Button>
            </Card>

            {jobStatus && (
                <Card title="Application Status">
                    {jobStatus.status === 'running' && (
                        <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
                            <Spin /> <Text>Working in background...</Text>
                        </div>
                    )}

                    {jobStatus.status === 'error' && (
                        <Alert type="error" message={jobStatus.message} style={{ marginBottom: 16 }} />
                    )}

                    <List
                        itemLayout="horizontal"
                        dataSource={jobStatus.results || []}
                        renderItem={item => {
                            const member = members.find(m => m.id === item.member_id);
                            return (
                                <List.Item>
                                    <List.Item.Meta
                                        title={member?.display_name || member?.name}
                                        description={
                                            item.status === 'error'
                                                ? <span style={{ color: 'var(--accent-red)' }}>{item.message}</span>
                                                : (
                                                    <div style={{ marginTop: 8 }}>
                                                        {item.applications?.map((app, idx) => (
                                                            <div key={idx} style={{
                                                                color: app.status === 'success' ? 'var(--accent-green)' :
                                                                    app.status === 'error' ? 'var(--accent-red)' : 'var(--text-secondary)',
                                                                marginBottom: 4
                                                            }}>
                                                                <strong>Issue #{app.index}:</strong> {app.message || app.status}
                                                            </div>
                                                        ))}
                                                    </div>
                                                )
                                        }
                                    />
                                </List.Item>
                            );
                        }}
                    />
                </Card>
            )}
        </div>
    );
}
