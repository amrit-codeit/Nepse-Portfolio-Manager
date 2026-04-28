import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Alert, Button, Card, Col, InputNumber, Row, Select, Spin, Statistic, Table, Tag } from 'antd';
import { FallOutlined, PlayCircleOutlined, RiseOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { runBacktest } from '../../services/api';

function formatNPR(value, decimals = 2) {
    if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
    return `Rs. ${Number(value).toLocaleString('en-IN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
}

export default function StrategyTester({ symbol }) {
    const [config, setConfig] = useState({
        strategy: 'ema_cross',
        initial_capital: 500000,
        risk_pct: 2,
        stop_model: 'atr_trailing',
        atr_multiple: 2,
    });

    const { data: backtestData, isLoading, isFetching, refetch } = useQuery({
        queryKey: ['backtest', symbol, config],
        queryFn: () => runBacktest(symbol, config).then((res) => res.data),
        enabled: !!symbol,
    });

    const columns = [
        { title: 'Date', dataIndex: 'date', render: (v) => (v ? new Date(v).toLocaleDateString() : '—') },
        { title: 'Type', dataIndex: 'type', render: (v) => <Tag color={v === 'Buy' ? 'green' : v.includes('Stop') ? 'orange' : 'red'}>{v}</Tag> },
        { title: 'Price', dataIndex: 'price', align: 'right', render: (v) => formatNPR(v) },
        { title: 'Shares', dataIndex: 'shares', align: 'right' },
        { title: 'Hold', dataIndex: 'hold_days', align: 'right', render: (v) => (v != null ? `${v}d` : '—') },
        { title: 'R', dataIndex: 'realized_r', align: 'right', render: (v) => (v != null ? v.toFixed(2) : '—') },
        {
            title: 'Profit',
            dataIndex: 'profit',
            align: 'right',
            render: (v) => (v == null ? '—' : <span style={{ color: v > 0 ? '#10b981' : '#ef4444' }}>{formatNPR(v)}</span>),
        },
    ];

    const statCards = backtestData ? [
        { title: 'Total Return', value: backtestData.total_return_pct, suffix: '%', good: backtestData.total_return_pct > 0 },
        { title: 'Win Rate', value: backtestData.win_rate_pct, suffix: '%', neutral: true },
        { title: 'Profit Factor', value: backtestData.profit_factor, precision: 2, good: (backtestData.profit_factor || 0) > 1 },
        { title: 'Expectancy', value: backtestData.expectancy, prefix: 'Rs.', good: backtestData.expectancy > 0 },
        { title: 'Avg Win', value: backtestData.avg_win, prefix: 'Rs.', good: true },
        { title: 'Avg Loss', value: backtestData.avg_loss, prefix: 'Rs.', good: false },
        { title: 'Max Drawdown', value: backtestData.max_drawdown_pct, suffix: '%', good: false },
        { title: 'Avg Hold', value: backtestData.avg_hold_days, suffix: 'd', neutral: true },
    ] : [];

    return (
        <div className="animate-in" style={{ padding: '4px 0' }}>
            <Alert
                type="info"
                showIcon
                style={{ marginBottom: 20, background: 'var(--bg-glass)', border: '1px solid rgba(108, 92, 231, 0.3)' }}
                message={<span style={{ fontWeight: 600 }}><PlayCircleOutlined /> Strategy Tester</span>}
                description="This backtester now exposes its assumptions up front: capital, risk budget, stop model, ATR multiple, and NEPSE fee treatment."
            />

            <div className="stat-card" style={{ padding: '16px 20px', marginBottom: 24 }}>
                <Row gutter={[16, 16]}>
                    <Col xs={24} md={8}>
                        <div style={{ marginBottom: 6, fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Strategy</div>
                        <Select
                            value={config.strategy}
                            onChange={(value) => setConfig((prev) => ({ ...prev, strategy: value }))}
                            options={[
                                { value: 'ema_cross', label: '50/200 EMA Crossover' },
                                { value: 'rsi_bounce', label: 'RSI Bounce Above 35' },
                            ]}
                            style={{ width: '100%' }}
                        />
                    </Col>
                    <Col xs={12} md={4}>
                        <div style={{ marginBottom: 6, fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Capital</div>
                        <InputNumber value={config.initial_capital} onChange={(value) => setConfig((prev) => ({ ...prev, initial_capital: value }))} min={10000} step={50000} style={{ width: '100%' }} />
                    </Col>
                    <Col xs={12} md={4}>
                        <div style={{ marginBottom: 6, fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Risk %</div>
                        <InputNumber value={config.risk_pct} onChange={(value) => setConfig((prev) => ({ ...prev, risk_pct: value }))} min={0.1} max={10} step={0.1} style={{ width: '100%' }} />
                    </Col>
                    <Col xs={12} md={4}>
                        <div style={{ marginBottom: 6, fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Stop Model</div>
                        <Select
                            value={config.stop_model}
                            onChange={(value) => setConfig((prev) => ({ ...prev, stop_model: value }))}
                            options={[
                                { value: 'atr_trailing', label: 'ATR Trailing' },
                                { value: 'fixed_atr', label: 'Fixed ATR Stop' },
                            ]}
                        />
                    </Col>
                    <Col xs={12} md={4}>
                        <div style={{ marginBottom: 6, fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>ATR Multiple</div>
                        <InputNumber value={config.atr_multiple} onChange={(value) => setConfig((prev) => ({ ...prev, atr_multiple: value }))} min={0.5} max={5} step={0.25} style={{ width: '100%' }} />
                    </Col>
                </Row>
                <div style={{ marginTop: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16 }}>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                        Simulation assumptions are shown below the results, including liquidity floor and fee treatment.
                    </div>
                    <Button type="primary" icon={<ThunderboltOutlined />} onClick={() => refetch()} loading={isLoading || isFetching}>
                        Run Simulation
                    </Button>
                </div>
            </div>

            {isLoading || isFetching ? (
                <div style={{ textAlign: 'center', padding: '60px 0' }}>
                    <Spin size="large" tip={`Running ${config.strategy.replace('_', ' ')} backtest...`} />
                </div>
            ) : backtestData?.error ? (
                <Alert type="error" message="Simulation Failed" description={backtestData.error} showIcon />
            ) : backtestData ? (
                <>
                    <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
                        {statCards.map((card) => (
                            <Col xs={12} sm={12} md={8} lg={6} key={card.title}>
                                <Card size="small" bordered={false} style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
                                    <Statistic
                                        title={card.title}
                                        value={card.value}
                                        precision={card.precision || 2}
                                        prefix={card.prefix || (card.title === 'Total Return' ? (card.good ? <RiseOutlined /> : <FallOutlined />) : undefined)}
                                        suffix={card.suffix}
                                        valueStyle={{
                                            color: card.neutral ? '#6c5ce7' : card.good ? '#10b981' : '#ef4444',
                                        }}
                                        formatter={card.prefix === 'Rs.' ? (value) => formatNPR(value, 0) : undefined}
                                    />
                                </Card>
                            </Col>
                        ))}
                    </Row>

                    <Alert
                        type="warning"
                        showIcon
                        style={{ marginBottom: 16 }}
                        message="Simulation assumptions"
                        description={`Market: ${backtestData.assumptions?.market}. Entry uses signal-day close. Exit uses signal close or stop. Fees and CGT are included. Liquidity floor ADT20: ${backtestData.assumptions?.liquidity_floor_adt20?.toLocaleString?.() || backtestData.assumptions?.liquidity_floor_adt20}.`}
                    />

                    <div style={{ padding: '20px 24px', background: 'var(--bg-primary)', borderRadius: 12, border: '1px solid var(--border-color)' }}>
                        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Recent Trade Log</div>
                        <Table dataSource={backtestData.trades?.map((trade, index) => ({ ...trade, key: index }))} columns={columns} size="small" pagination={false} />
                    </div>
                </>
            ) : null}
        </div>
    );
}
