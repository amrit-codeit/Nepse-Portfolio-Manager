import { useState, useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Tabs, Spin } from 'antd';
import {
    AppstoreOutlined,
    LineChartOutlined,
    AlertOutlined,
    FundOutlined,
} from '@ant-design/icons';
import { getPortfolioSummary, getMembers } from '../services/api';
import MemberSelector from '../components/MemberSelector';
import OverviewTab from '../components/dashboard/OverviewTab';
import PerformanceTab from '../components/dashboard/PerformanceTab';
import RiskTab from '../components/dashboard/RiskTab';
import DashboardHoldings from '../components/dashboard/DashboardHoldings';

function Dashboard() {
    const [selectedContext, setSelectedContext] = useState({ type: 'all', id: null, memberIds: [] });
    const [activeTab, setActiveTab] = useState('overview');

    const { data: membersData } = useQuery({
        queryKey: ['members'],
        queryFn: () => getMembers().then(r => r.data),
    });

    const members = membersData || [];

    // Build query params from context
    const summaryParams = useMemo(() => {
        if (selectedContext.type === 'member') return { member_id: selectedContext.id };
        if (selectedContext.type === 'group') return { member_ids: selectedContext.memberIds.join(',') };
        return {};
    }, [selectedContext]);

    const { data: summary, isLoading } = useQuery({
        queryKey: ['portfolio-summary', summaryParams],
        queryFn: () => getPortfolioSummary(summaryParams).then(r => r.data),
    });

    const handleContextChange = useCallback((ctx) => {
        setSelectedContext(ctx);
    }, []);

    const handleTabChange = useCallback((key) => {
        setActiveTab(key);
    }, []);

    const subtitle = useMemo(() => {
        if (selectedContext.type === 'all') return 'Overview of all family member portfolios';
        if (selectedContext.type === 'member') {
            const m = members.find(m => m.id === selectedContext.id);
            return `Portfolio for ${m?.display_name || m?.name || 'Unknown'}`;
        }
        return `Group portfolio (${selectedContext.memberIds.length} members)`;
    }, [selectedContext, members]);

    const tabItems = useMemo(() => [
        {
            key: 'overview',
            label: <span><AppstoreOutlined /> Overview</span>,
            children: isLoading ? <Spin size="large" style={{ display: 'block', margin: '60px auto' }} /> : (
                <OverviewTab summary={summary} context={selectedContext} members={members} onTabChange={handleTabChange} />
            ),
        },
        {
            key: 'performance',
            label: <span><LineChartOutlined /> Performance</span>,
            children: isLoading ? <Spin size="large" style={{ display: 'block', margin: '60px auto' }} /> : (
                <PerformanceTab summary={summary} context={selectedContext} members={members} />
            ),
        },
        {
            key: 'risk',
            label: <span><AlertOutlined /> Risk & Insights</span>,
            children: isLoading ? <Spin size="large" style={{ display: 'block', margin: '60px auto' }} /> : (
                <RiskTab summary={summary} context={selectedContext} members={members} />
            ),
        },
        {
            key: 'holdings',
            label: <span><FundOutlined /> Holdings</span>,
            children: isLoading ? <Spin size="large" style={{ display: 'block', margin: '60px auto' }} /> : (
                <DashboardHoldings summary={summary} context={selectedContext} />
            ),
        },
    ], [summary, isLoading, selectedContext, members, handleTabChange]);

    return (
        <div className="animate-in">
            {/* Page Header */}
            <div className="page-header">
                <h1>Portfolio Dashboard</h1>
                <p className="subtitle">{subtitle}</p>
            </div>

            {/* Member Selector */}
            <MemberSelector
                members={members}
                onChange={handleContextChange}
            />

            {/* Tabs */}
            <Tabs
                className="dashboard-tabs"
                activeKey={activeTab}
                onChange={handleTabChange}
                items={tabItems}
                destroyInactiveTabPane={false}
            />
        </div>
    );
}

export default Dashboard;
