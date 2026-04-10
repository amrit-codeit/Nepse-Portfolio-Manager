import { useState, useMemo, useCallback, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Tabs, Spin, Card, Row, Col } from 'antd';
import {
    AppstoreOutlined,
    LineChartOutlined,
    AlertOutlined,
    FundOutlined,
    RiseOutlined,
    FallOutlined,
    DollarOutlined,
} from '@ant-design/icons';
import { Tag } from 'antd';
import { getPortfolioSummary, getMembers, getMergedPrices, getLatestNepseIndex } from '../services/api';
import MemberSelector from '../components/MemberSelector';
import OverviewTab from '../components/dashboard/OverviewTab';
import PerformanceTab from '../components/dashboard/PerformanceTab';
import RiskTab from '../components/dashboard/RiskTab';
import DividendTab from '../components/dashboard/DividendTab';

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

    const { data: summary, isLoading: isLoadingSummary } = useQuery({
        queryKey: ['portfolio-summary', summaryParams],
        queryFn: () => getPortfolioSummary(summaryParams).then(r => r.data),
    });

    const { data: latestIndex } = useQuery({
        queryKey: ['latestNepseIndex'],
        queryFn: () => getLatestNepseIndex().then(r => r.data),
    });

    const { data: pricesData, isLoading: isPricesLoading } = useQuery({
        queryKey: ['prices'],
        queryFn: () => getMergedPrices().then(r => r.data),
    });

    const isLoading = isLoadingSummary || isPricesLoading;

    const [topLevelTab, setTopLevelTab] = useState('equity');

    // Split summary by equity vs SIP using backend-provided segmented data
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
            dividend_income: summary.equity_dividend_income || 0,
            dividend_yield: eqInv > 0 ? ((summary.equity_dividend_income || 0) / eqInv) * 100 : 0,
            pnl_pct: eqInv > 0 ? (eqPnl / eqInv) * 100 : 0,
            portfolio_xirr: summary.equity_xirr || 0,
        };

        const sip = {
            ...summary,
            holdings: sips,
            holdings_count: sips.length,
            total_investment: sipInv,
            current_value: sipVal,
            unrealized_pnl: sipPnl,
            tax_profit: sipTax,
            dividend_income: summary.sip_dividend_income || 0,
            dividend_yield: sipInv > 0 ? ((summary.sip_dividend_income || 0) / sipInv) * 100 : 0,
            pnl_pct: sipInv > 0 ? (sipPnl / sipInv) * 100 : 0,
            portfolio_xirr: summary.sip_xirr || 0,
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
                    <RiskTab summary={displaySummary} context={selectedContext} members={members} isSipMode={topLevelTab === 'sips'} />
                ),
            },
            {
                key: 'dividend',
                label: <span><DollarOutlined /> Dividend Yield</span>,
                children: isLoading ? <Spin size="large" style={{ display: 'block', margin: '60px auto' }} /> : (
                    <DividendTab summary={displaySummary} context={selectedContext} isSipMode={topLevelTab === 'sips'} pricesData={pricesData} />
                ),
            }
        );

        return items;
    }, [displaySummary, isLoading, selectedContext, members, handleTabChange, topLevelTab]);

    const eqPct = splitSummary.totalValue > 0 ? (splitSummary.equityValue / splitSummary.totalValue * 100).toFixed(3) : 0;
    const sipPct = splitSummary.totalValue > 0 ? (splitSummary.sipValue / splitSummary.totalValue * 100).toFixed(3) : 0;

    return (
        <div className="animate-in">
            {/* Page Header */}
            <div className="page-header">
                <h1>Portfolio Dashboard</h1>
                <p className="subtitle">{subtitle}</p>
            </div>

            <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
                <Col xs={24} md={12}>
                    <div className="stat-card" style={{ padding: '24px', height: '100%', minHeight: 140, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                        <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: 13, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 8 }}>Total Net Worth</div>
                            <div style={{ fontSize: 32, fontWeight: 700, color: 'var(--accent-secondary)' }}>
                                Rs. {(splitSummary.totalValue || 0).toLocaleString('en-IN', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}
                            </div>
                        </div>
                    </div>
                </Col>
                <Col xs={24} md={12}>
                    <div className="stat-card" style={{ padding: '24px', height: '100%', minHeight: 140, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                        <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: 13, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 8 }}>NEPSE Index</div>
                            {latestIndex && !latestIndex.error ? (
                                <>
                                    <div style={{ fontSize: 32, fontWeight: 700, color: 'var(--text-primary)' }}>
                                        {latestIndex.close?.toLocaleString('en-IN', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'center', gap: 12, alignItems: 'center' }}>
                                        <div style={{ fontSize: 14, fontWeight: 600, color: latestIndex.change >= 0 ? '#00b894' : '#d63031' }}>
                                            {latestIndex.change >= 0 ? '+' : ''}{latestIndex.change?.toFixed(3)} ({latestIndex.percent_change?.toFixed(3)}%)
                                        </div>
                                        <div style={{ width: 1, background: 'var(--border-color)', height: 14 }} />
                                        <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                                            Vol: Rs. {(latestIndex.turnover / 1e7).toFixed(3)} Cr
                                        </div>
                                    </div>
                                </>
                            ) : (
                                <div style={{ fontSize: 14, color: 'var(--text-muted)', opacity: 0.5 }}>Sync index data to see latest status</div>
                            )}
                        </div>
                    </div>
                </Col>
            </Row>

            <div className="stat-card" style={{ marginBottom: 24, padding: '24px' }}>

                {/* Benchmark Comparison */}
                {displaySummary && (
                    <div style={{ display: 'flex', justifyContent: 'center', gap: 24, marginBottom: 24, padding: '16px', background: 'rgba(255,255,255,0.03)', borderRadius: 12 }}>
                        <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Portfolio XIRR</div>
                            <div style={{ fontSize: 18, fontWeight: 600, color: displaySummary.portfolio_xirr >= 0 ? '#00b894' : '#d63031' }}>
                                {displaySummary.portfolio_xirr?.toFixed(3)}%
                            </div>
                        </div>
                        <div style={{ width: 1, background: 'var(--border-color)', height: 40 }} />
                        <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Dividend Yield</div>
                            <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--accent-blue)' }}>
                                {displaySummary.dividend_yield?.toFixed(3)}%
                            </div>
                        </div>
                        <div style={{ width: 1, background: 'var(--border-color)', height: 40 }} />
                        <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase' }}>NEPSE XIRR</div>
                            <div style={{ fontSize: 18, fontWeight: 600 }}>
                                {displaySummary.nepse_xirr?.toFixed(3)}%
                            </div>
                        </div>
                        <div style={{ width: 1, background: 'var(--border-color)', height: 40 }} />
                        <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>Market Alpha</div>
                            <Tag 
                                color={displaySummary.market_alpha >= 0 ? 'success' : 'error'} 
                                icon={displaySummary.market_alpha >= 0 ? <RiseOutlined /> : <FallOutlined />}
                                style={{ fontSize: 14, padding: '2px 10px', borderRadius: 6, fontWeight: 600 }}
                            >
                                {displaySummary.market_alpha > 0 ? '+' : ''}{displaySummary.market_alpha?.toFixed(3)}%
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
                        <strong style={{ color: 'var(--text-primary)' }}>Rs. {splitSummary.equityValue.toLocaleString('en-IN', { minimumFractionDigits: 3 })}</strong>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#00b894' }} />
                        <span>SIPs & Mutual Funds ({sipPct}%)</span>
                        <strong style={{ color: 'var(--text-primary)' }}>Rs. {splitSummary.sipValue.toLocaleString('en-IN', { minimumFractionDigits: 3 })}</strong>
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
