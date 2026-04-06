import { useState, useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Tabs, Spin, Card } from 'antd';
import {
    AppstoreOutlined,
    LineChartOutlined,
    AlertOutlined,
    FundOutlined,
    RiseOutlined,
    FallOutlined,
} from '@ant-design/icons';
import { Tag } from 'antd';
import { getPortfolioSummary, getMembers, getMergedPrices } from '../services/api';
import MemberSelector from '../components/MemberSelector';
import OverviewTab from '../components/dashboard/OverviewTab';
import PerformanceTab from '../components/dashboard/PerformanceTab';
import RiskTab from '../components/dashboard/RiskTab';
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

    const { data: summary, isLoading: isSummaryLoading } = useQuery({
        queryKey: ['portfolio-summary', summaryParams],
        queryFn: () => getPortfolioSummary(summaryParams).then(r => r.data),
    });

    const { data: pricesData, isLoading: isPricesLoading } = useQuery({
        queryKey: ['prices'],
        queryFn: () => getMergedPrices().then(r => r.data),
    });

    const isLoading = isSummaryLoading || isPricesLoading;

    const [topLevelTab, setTopLevelTab] = useState('equity');

    const splitSummary = useMemo(() => {
        if (!summary) return { equity: null, sip: null, totalValue: 0, equityValue: 0, sipValue: 0 };
        const sips = [];
        const eqs = [];
        let eqInv = 0, eqVal = 0, eqPnl = 0, eqTax = 0;
        let sipInv = 0, sipVal = 0, sipPnl = 0, sipTax = 0;

        const isSip = (h) => {
            return h.instrument === 'Open-End Mutual Fund';
        };

        (summary.holdings || []).forEach(h => {
            if (isSip(h)) {
                sips.push(h);
                sipInv += (h.total_investment || 0);
                sipVal += (h.current_value || 0);
                sipPnl += (h.unrealized_pnl || 0);
                sipTax += (h.tax_profit || 0);
            } else {
                eqs.push(h);
                eqInv += (h.total_investment || 0);
                eqVal += (h.current_value || 0);
                eqPnl += (h.unrealized_pnl || 0);
                eqTax += (h.tax_profit || 0);
            }
        });

        const equity = {
            ...summary,
            holdings: eqs,
            holdings_count: eqs.length,
            total_investment: eqInv,
            current_value: eqVal,
            unrealized_pnl: eqPnl,
            tax_profit: eqTax,
            pnl_pct: eqInv > 0 ? (eqPnl / eqInv) * 100 : 0
        };

        const sip = {
            ...summary,
            holdings: sips,
            holdings_count: sips.length,
            total_investment: sipInv,
            current_value: sipVal,
            unrealized_pnl: sipPnl,
            tax_profit: sipTax,
            pnl_pct: sipInv > 0 ? (sipPnl / sipInv) * 100 : 0
        };

        return { 
            equity, 
            sip, 
            totalValue: summary.current_value || 0,
            equityValue: eqVal,
            sipValue: sipVal 
        };
    }, [summary, pricesData]);

    const displaySummary = topLevelTab === 'equity' ? splitSummary.equity : splitSummary.sip;

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

    const tabItems = useMemo(() => {
        const items = [
            {
                key: 'overview',
                label: <span><AppstoreOutlined /> Overview</span>,
                children: isLoading ? <Spin size="large" style={{ display: 'block', margin: '60px auto' }} /> : (
                    <OverviewTab summary={displaySummary} context={selectedContext} members={members} onTabChange={handleTabChange} isSipMode={topLevelTab === 'sips'} pricesData={pricesData} />
                ),
            }
        ];

        items.push(
            {
                key: 'performance',
                label: <span><LineChartOutlined /> Performance</span>,
                children: isLoading ? <Spin size="large" style={{ display: 'block', margin: '60px auto' }} /> : (
                    <PerformanceTab 
                        summary={displaySummary} 
                        context={selectedContext} 
                        members={members} 
                        isSipMode={topLevelTab === 'sips'}
                        pricesData={pricesData}
                    />
                ),
            },
            {
                key: 'risk',
                label: <span><AlertOutlined /> Risk & Insights</span>,
                children: isLoading ? <Spin size="large" style={{ display: 'block', margin: '60px auto' }} /> : (
                    <RiskTab summary={displaySummary} context={selectedContext} members={members} />
                ),
            }
        );

        return items;
    }, [displaySummary, isLoading, selectedContext, members, handleTabChange, topLevelTab]);

    const eqPct = splitSummary.totalValue > 0 ? (splitSummary.equityValue / splitSummary.totalValue * 100).toFixed(1) : 0;
    const sipPct = splitSummary.totalValue > 0 ? (splitSummary.sipValue / splitSummary.totalValue * 100).toFixed(1) : 0;

    return (
        <div className="animate-in">
            {/* Page Header */}
            <div className="page-header">
                <h1>Portfolio Dashboard</h1>
                <p className="subtitle">{subtitle}</p>
            </div>

            {/* Total Net Worth Block */}
            <div className="stat-card" style={{ marginBottom: 24, padding: '24px' }}>
                <div style={{ textAlign: 'center', marginBottom: 20 }}>
                    <div style={{ fontSize: 16, color: 'var(--text-secondary)' }}>Total Net Worth</div>
                    <div style={{ fontSize: 36, fontWeight: 700, color: 'var(--accent-secondary)' }}>
                        Rs. {(splitSummary.totalValue || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                </div>

                {/* Benchmark Comparison */}
                {summary && (
                    <div style={{ display: 'flex', justifyContent: 'center', gap: 24, marginBottom: 24, padding: '16px', background: 'rgba(255,255,255,0.03)', borderRadius: 12 }}>
                        <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Portfolio XIRR</div>
                            <div style={{ fontSize: 18, fontWeight: 600, color: summary.portfolio_xirr >= 0 ? '#00b894' : '#d63031' }}>
                                {summary.portfolio_xirr?.toFixed(2)}%
                            </div>
                        </div>
                        <div style={{ width: 1, background: 'var(--border-color)', height: 40 }} />
                        <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase' }}>NEPSE XIRR</div>
                            <div style={{ fontSize: 18, fontWeight: 600 }}>
                                {summary.nepse_xirr?.toFixed(2)}%
                            </div>
                        </div>
                        <div style={{ width: 1, background: 'var(--border-color)', height: 40 }} />
                        <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>Market Alpha</div>
                            <Tag 
                                color={summary.market_alpha >= 0 ? 'success' : 'error'} 
                                icon={summary.market_alpha >= 0 ? <RiseOutlined /> : <FallOutlined />}
                                style={{ fontSize: 14, padding: '2px 10px', borderRadius: 6, fontWeight: 600 }}
                            >
                                {summary.market_alpha > 0 ? '+' : ''}{summary.market_alpha?.toFixed(2)}%
                            </Tag>
                        </div>
                    </div>
                )}
                
                {/* Visual Bar */}
                <div style={{ display: 'flex', height: 12, borderRadius: 6, overflow: 'hidden', marginBottom: 16 }}>
                    <div style={{ width: `${eqPct}%`, background: '#6c5ce7', transition: 'width 0.3s' }} title={`Equity: ${eqPct}%`} />
                    <div style={{ width: `${sipPct}%`, background: '#00b894', transition: 'width 0.3s' }} title={`SIPs: ${sipPct}%`} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--text-secondary)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#6c5ce7' }} />
                        <span>Equity ({eqPct}%)</span>
                        <strong style={{ color: 'var(--text-primary)' }}>Rs. {splitSummary.equityValue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#00b894' }} />
                        <span>SIPs & Mutual Funds ({sipPct}%)</span>
                        <strong style={{ color: 'var(--text-primary)' }}>Rs. {splitSummary.sipValue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong>
                    </div>
                </div>
            </div>

            {/* Member Selector */}
            <MemberSelector
                members={members}
                onChange={handleContextChange}
            />

            <Tabs
                activeKey={topLevelTab}
                onChange={(key) => {
                    setTopLevelTab(key);
                    setActiveTab('overview');
                }}
                items={[
                    { key: 'equity', label: 'Equity' },
                    { key: 'sips', label: 'SIPs & Mutual Funds' }
                ]}
                style={{ marginBottom: 0 }}
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
