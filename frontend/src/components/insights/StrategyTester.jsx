import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, Row, Col, Select, Button, Table, Spin, Alert, Tag, Statistic } from 'antd';
import { PlayCircleOutlined, ThunderboltOutlined, FallOutlined, RiseOutlined } from '@ant-design/icons';
import { runBacktest } from '../../services/api';

function formatNPR(value, decimals = 2) {
    if (value === null || value === undefined) return '—';
    return `Rs. ${Number(value).toLocaleString('en-IN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
}

export default function StrategyTester({ symbol }) {
    const [strategy, setStrategy] = useState('ema_cross');

    const { data: backtestData, isLoading, isFetching, refetch } = useQuery({
        queryKey: ['backtest', symbol, strategy],
        queryFn: () => runBacktest(symbol, strategy).then(res => res.data),
        enabled: !!symbol, // Can be refetched with the button
    });

    const columns = [
        {
            title: 'Date',
            dataIndex: 'date',
            render: (v) => v ? new Date(v).toLocaleDateString() : '—',
        },
        {
            title: 'Type',
            dataIndex: 'type',
            render: (v) => <Tag color={v === 'Buy' ? 'green' : v.includes('Stop Loss') ? 'orange' : 'red'}>{v}</Tag>
        },
        {
            title: 'Price',
            dataIndex: 'price',
            align: 'right',
            render: (v) => formatNPR(v)
        },
        {
            title: 'Shares',
            dataIndex: 'shares',
            align: 'right'
        },
        {
            title: 'Profit',
            dataIndex: 'profit',
            align: 'right',
            render: (v) => {
                if (v == null) return '—';
                return <span style={{ color: v > 0 ? '#10b981' : '#ef4444' }}>{v > 0 ? '+' : ''}{formatNPR(v)}</span>
            }
        }
    ];

    return (
        <div className="animate-in" style={{ padding: '4px 0' }}>
            <Alert
                message={<span style={{ fontWeight: 600 }}><PlayCircleOutlined /> Advanced Backtester</span>}
                description={<span style={{ fontSize: 13 }}>Simulate the exact historical performance of quantitative trading strategies on {symbol}. Includes 2% position sizing, 2x ATR trailing stop-loss, NEPSE broker commissions, SEBON fees, DP charges, and 7.5% CGT deduction on profits.</span>}
                type="info" showIcon
                style={{ marginBottom: 20, background: 'var(--bg-glass)', border: '1px solid rgba(108, 92, 231, 0.3)' }}
            />

            <div className="stat-card" style={{ padding: '16px 20px', marginBottom: 24, display: 'flex', gap: 16, alignItems: 'center' }}>
                <div style={{ fontSize: 14, fontWeight: 500 }}>Select Strategy:</div>
                <Select
                    value={strategy}
                    onChange={setStrategy}
                    style={{ width: 250 }}
                    options={[
                        { value: 'ema_cross', label: '50/200 EMA Crossover (Golden Cross)' },
                        { value: 'rsi_bounce', label: 'RSI(14) 30/70 Mean Reversion' }
                    ]}
                />
                <Button type="primary" icon={<ThunderboltOutlined />} onClick={() => refetch()} loading={isLoading || isFetching}>
                    Run Simulation
                </Button>
            </div>

            {isLoading || isFetching ? (
                <div style={{ textAlign: 'center', padding: '60px 0' }}>
                    <Spin size="large" tip={`Running ${strategy.replace('_', ' ')} backtest...`} />
                </div>
            ) : backtestData?.error ? (
                <Alert type="error" message="Simulation Failed" description={backtestData.error} showIcon />
            ) : backtestData ? (
                <>
                    <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
                        <Col xs={24} sm={12} md={8}>
                            <Card size="small" bordered={false} style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
                                <Statistic 
                                    title="Total Return" 
                                    value={backtestData.total_return_pct} 
                                    precision={2} 
                                    suffix="%" 
                                    valueStyle={{ color: backtestData.total_return_pct > 0 ? '#10b981' : '#ef4444' }} 
                                    prefix={backtestData.total_return_pct > 0 ? <RiseOutlined /> : <FallOutlined />} 
                                />
                            </Card>
                        </Col>
                        <Col xs={24} sm={12} md={8}>
                            <Card size="small" bordered={false} style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
                                <Statistic title="Win Rate" value={backtestData.win_rate_pct} precision={2} suffix="%" valueStyle={{ color: '#6c5ce7' }} />
                            </Card>
                        </Col>
                        <Col xs={24} sm={12} md={8}>
                            <Card size="small" bordered={false} style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
                                <Statistic title="Final Equity" value={backtestData.final_equity} formatter={val => formatNPR(val, 0)} />
                            </Card>
                        </Col>
                    </Row>
                    <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
                        <Col xs={24} sm={12} md={8}>
                            <Card size="small" bordered={false} style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
                                <Statistic title="Profit Factor" value={backtestData.profit_factor} precision={2} valueStyle={{ color: backtestData.profit_factor > 1 ? '#10b981' : '#ef4444' }} />
                            </Card>
                        </Col>
                        <Col xs={24} sm={12} md={8}>
                            <Card size="small" bordered={false} style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
                                <Statistic title="Expectancy" value={backtestData.expectancy} precision={2} prefix="Rs." valueStyle={{ color: backtestData.expectancy > 0 ? '#10b981' : '#ef4444' }} />
                            </Card>
                        </Col>
                        <Col xs={24} sm={12} md={8}>
                            <Card size="small" bordered={false} style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
                                <Statistic title="Total Completed Trades" value={backtestData.total_trades} />
                            </Card>
                        </Col>
                    </Row>

                    <div style={{ padding: '20px 24px', background: 'var(--bg-primary)', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
                        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Recent Trade Log (Sample) <span style={{fontSize:11, fontWeight: 400, color: 'var(--text-muted)'}}>(Showing last 20 signals)</span></div>
                        <Table 
                            dataSource={backtestData.trades?.map((t, i) => ({...t, key: i}))}
                            columns={columns}
                            size="small"
                            pagination={false}
                        />
                    </div>
                </>
            ) : null}
        </div>
    );
}
