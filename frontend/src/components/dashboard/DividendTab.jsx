import React, { useMemo } from 'react';
import { Table, Tag, Empty, Spin, Row, Col } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { DollarOutlined, GiftOutlined } from '@ant-design/icons';
import { getPortfolioDividends } from '../../services/api';

function formatNPR(value) {
    if (value === null || value === undefined) return '—';
    return `Rs. ${Number(value).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function DividendTab({ summary, context, isSipMode, pricesData }) {
    const summaryParams = useMemo(() => {
        if (context?.type === 'member') return { member_id: context.id };
        if (context?.type === 'group') return { member_ids: context.memberIds.join(',') };
        return {};
    }, [context]);

    const { data: dividendsRaw, isLoading } = useQuery({
        queryKey: ['dividends', summaryParams],
        queryFn: () => getPortfolioDividends(summaryParams).then(r => r.data)
    });

    const filteredDividends = useMemo(() => {
        if (!dividendsRaw) return [];
        
        const isSip = (symbol) => {
            const priceInfo = pricesData?.find(p => p.symbol === symbol);
            if (priceInfo) {
                if (priceInfo.instrument === 'Open-End Mutual Fund') return true;
                if (priceInfo.instrument === 'Equity' || priceInfo.instrument === 'Mutual Fund') return false;
            }
            return symbol?.length > 5;
        };

        return dividendsRaw.filter(d => {
            const sip = isSip(d.symbol);
            return isSipMode ? sip : !sip;
        });
    }, [dividendsRaw, isSipMode, pricesData]);

    const columns = [
        {
            title: 'Symbol',
            dataIndex: 'symbol',
            key: 'symbol',
            render: (text) => <strong>{text}</strong>
        },
        {
            title: 'Member',
            dataIndex: 'member_name',
            key: 'member_name',
            responsive: ['md'],
        },
        {
            title: 'Fiscal Year',
            dataIndex: 'fiscal_year',
            key: 'fiscal_year',
        },
        {
            title: 'Eligible Qty',
            dataIndex: 'eligible_quantity',
            key: 'eligible_quantity',
            align: 'right',
        },
        {
            title: 'Cash Div %',
            dataIndex: 'cash_dividend_percent',
            key: 'cash_dividend_percent',
            align: 'right',
            render: (val) => val > 0 ? <Tag color="blue">{val}%</Tag> : '—'
        },
        {
            title: 'Bonus Div %',
            dataIndex: 'bonus_dividend_percent',
            key: 'bonus_dividend_percent',
            align: 'right',
            render: (val) => val > 0 ? <Tag color="orange"><GiftOutlined /> {val}%</Tag> : '—'
        },
        {
            title: 'Yield on Cost',
            key: 'yield_on_cost',
            align: 'right',
            render: (_, record) => {
                const holding = summary?.holdings?.find(h => h.symbol === record.symbol && h.member_id === record.member_id);
                if (holding && holding.total_investment > 0) {
                    const yieldVal = (record.total_cash_amount / holding.total_investment) * 100;
                    return <span style={{ color: 'var(--accent-blue)', fontWeight: 600 }}>{yieldVal.toFixed(3)}%</span>;
                }
                return '—';
            }
        },
        {
            title: 'Total Cash Income',
            dataIndex: 'total_cash_amount',
            key: 'total_cash_amount',
            align: 'right',
            render: (val) => <strong style={{ color: 'var(--accent-green)' }}>{formatNPR(val)}</strong>
        }
    ];

    // Compute bonus share stats and avg yield on cost
    const bonusStats = useMemo(() => {
        let totalBonusShares = 0;
        let totalYoc = 0;
        let yocCount = 0;

        filteredDividends.forEach(d => {
            if (d.bonus_shares && d.bonus_shares > 0) {
                totalBonusShares += d.bonus_shares;
            }
            // Compute yield on cost for each record
            const holding = summary?.holdings?.find(h => h.symbol === d.symbol && h.member_id === d.member_id);
            if (holding && holding.total_investment > 0 && d.total_cash_amount > 0) {
                totalYoc += (d.total_cash_amount / holding.total_investment) * 100;
                yocCount++;
            }
        });

        return {
            totalBonusShares,
            avgYoc: yocCount > 0 ? (totalYoc / yocCount) : 0,
        };
    }, [filteredDividends, summary]);

    if (isLoading) {
        return <div style={{ display: 'flex', justifyContent: 'center', padding: '100px 0' }}><Spin size="large" /></div>;
    }

    return (
        <div className="animate-in" style={{ padding: '24px 0' }}>
            <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
                <Col xs={24} sm={12} lg={6}>
                    <div className="stat-card" style={{ padding: 24 }}>
                        <div style={{ fontSize: 13, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Total Cash Dividends</div>
                        <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--accent-green)', marginTop: 8 }}>
                            {formatNPR(filteredDividends.reduce((sum, item) => sum + item.total_cash_amount, 0))}
                        </div>
                    </div>
                </Col>
                <Col xs={24} sm={12} lg={6}>
                    <div className="stat-card" style={{ padding: 24 }}>
                        <div style={{ fontSize: 13, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Overall Dividend Yield</div>
                        <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--accent-blue)', marginTop: 8 }}>
                            {summary?.dividend_yield ? `${summary.dividend_yield.toFixed(3)}%` : '0.000%'}
                        </div>
                    </div>
                </Col>
                <Col xs={24} sm={12} lg={6}>
                    <div className="stat-card" style={{ padding: 24 }}>
                        <div style={{ fontSize: 13, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Total Bonus Shares</div>
                        <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--accent-primary)', marginTop: 8 }}>
                            {bonusStats.totalBonusShares > 0 ? bonusStats.totalBonusShares.toLocaleString('en-IN') : '—'}
                        </div>
                    </div>
                </Col>
                <Col xs={24} sm={12} lg={6}>
                    <div className="stat-card" style={{ padding: 24 }}>
                        <div style={{ fontSize: 13, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Avg Yield on Cost</div>
                        <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--accent-secondary)', marginTop: 8 }}>
                            {bonusStats.avgYoc > 0 ? `${bonusStats.avgYoc.toFixed(3)}%` : '—'}
                        </div>
                    </div>
                </Col>
            </Row>

            <div className="chart-card">
                <div className="chart-header">
                    <h3 style={{ margin: 0 }}><DollarOutlined /> Dividend Income History</h3>
                </div>
                <Table
                    columns={columns}
                    dataSource={filteredDividends}
                    rowKey="id"
                    pagination={{ defaultPageSize: 20, showSizeChanger: true, pageSizeOptions: ['20', '50', '100'] }}
                    size="middle"
                    scroll={{ x: 900 }}
                    locale={{ emptyText: <Empty description="No dividend records found. Ensure you have synced dividend history." /> }}
                />
            </div>
        </div>
    );
}
