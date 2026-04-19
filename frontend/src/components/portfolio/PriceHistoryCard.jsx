import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, Radio, Spin, Empty } from 'antd';
import {
    ComposedChart, Line, Area, XAxis, YAxis, CartesianGrid,
    Tooltip as RechartsTooltip, ResponsiveContainer
} from 'recharts';
import { getHistoricalPrices } from '../../services/api';

export default function PriceHistoryCard({ symbol, transactions }) {
    const [timeRange, setTimeRange] = useState('6M');

    const { data: priceRaw, isLoading } = useQuery({
        queryKey: ['historicalPrices', symbol],
        queryFn: () => getHistoricalPrices({ symbol }).then(r => r.data),
        enabled: !!symbol,
    });

    const chartData = useMemo(() => {
        if (!priceRaw || priceRaw.length === 0) return [];
        let data = [...priceRaw].reverse();
        if (timeRange !== 'ALL') {
            const cutoff = new Date();
            if (timeRange === '1M') cutoff.setMonth(cutoff.getMonth() - 1);
            else if (timeRange === '3M') cutoff.setMonth(cutoff.getMonth() - 3);
            else if (timeRange === '6M') cutoff.setMonth(cutoff.getMonth() - 6);
            else if (timeRange === '1Y') cutoff.setFullYear(cutoff.getFullYear() - 1);
            data = data.filter(d => new Date(d.date) >= cutoff);
        }
        const txnsByDate = {};
        (transactions || []).forEach(t => {
            if (!t.txn_date) return;
            const txnDate = t.txn_date.split('T')[0];
            if (!txnsByDate[txnDate]) txnsByDate[txnDate] = { buys: false, sells: false };
            const type = t.txn_type;
            if (['BUY', 'IPO', 'FPO', 'RIGHT', 'AUCTION', 'TRANSFER_IN'].includes(type)) txnsByDate[txnDate].buys = true;
            else if (['SELL', 'TRANSFER_OUT'].includes(type)) txnsByDate[txnDate].sells = true;
        });
        return data.map(d => {
            let isBuy = false, isSell = false;
            if (d.date) {
                const dDate = d.date.split('T')[0];
                if (txnsByDate[dDate]) { isBuy = txnsByDate[dDate].buys; isSell = txnsByDate[dDate].sells; }
            }
            return {
                ...d,
                displayDate: new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' }),
                buyMarker: isBuy ? d.close : null,
                sellMarker: isSell ? d.close : null,
            };
        });
    }, [priceRaw, timeRange, transactions]);

    const domain = useMemo(() => {
        if (!chartData.length) return ['dataMin', 'dataMax'];
        const min = Math.min(...chartData.map(d => d.close));
        const max = Math.max(...chartData.map(d => d.close));
        const padding = (max - min) * 0.1;
        return [Math.max(0, min - padding), max + padding];
    }, [chartData]);

    return (
        <Card
            size="small"
            title={`Price History — ${symbol}`}
            extra={
                <Radio.Group value={timeRange} onChange={(e) => setTimeRange(e.target.value)} optionType="button" buttonStyle="solid" size="small">
                    <Radio.Button value="1M">1M</Radio.Button>
                    <Radio.Button value="3M">3M</Radio.Button>
                    <Radio.Button value="6M">6M</Radio.Button>
                    <Radio.Button value="1Y">1Y</Radio.Button>
                    <Radio.Button value="ALL">ALL</Radio.Button>
                </Radio.Group>
            }
        >
            {isLoading ? (
                <div style={{ textAlign: 'center', padding: '60px 0' }}><Spin /></div>
            ) : chartData.length === 0 ? (
                <Empty description="No price data found for the selected period" />
            ) : (
                <div style={{ padding: '10px 0' }}>
                    <ResponsiveContainer width="100%" height={400}>
                        <ComposedChart data={chartData} margin={{ top: 10, right: 10, bottom: 0, left: 0 }}>
                            <defs>
                                <linearGradient id="colorClose" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.3}/>
                                    <stop offset="95%" stopColor="#38bdf8" stopOpacity={0}/>
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" vertical={false} />
                            <XAxis dataKey="displayDate" tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} tickMargin={10} minTickGap={30} />
                            <YAxis domain={domain} tickFormatter={(val) => `Rs ${val.toFixed(0)}`} tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} width={60} />
                            <RechartsTooltip
                                contentStyle={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 8, fontSize: 12 }}
                                labelStyle={{ color: 'var(--text-secondary)', marginBottom: 8 }}
                                itemStyle={{ color: 'var(--text-primary)' }}
                            />
                            <Area type="monotone" dataKey="close" name="LTP" stroke="#38bdf8" strokeWidth={2} fillOpacity={1} fill="url(#colorClose)" isAnimationActive={false} />
                            <Line type="monotone" dataKey="buyMarker" name="Buy/In" stroke="none" connectNulls={true} dot={{ r: 5, fill: '#10b981', stroke: '#047857', strokeWidth: 2 }} activeDot={{ r: 7 }} isAnimationActive={false} />
                            <Line type="monotone" dataKey="sellMarker" name="Sell/Out" stroke="none" connectNulls={true} dot={{ r: 5, fill: '#ef4444', stroke: '#b91c1c', strokeWidth: 2 }} activeDot={{ r: 7 }} isAnimationActive={false} />
                        </ComposedChart>
                    </ResponsiveContainer>
                    <div style={{ textAlign: 'center', marginTop: 12, fontSize: 12, color: 'var(--text-secondary)' }}>
                        <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#10b981', marginRight: 6 }}></span> Buy / Transfer In
                        <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#ef4444', marginLeft: 16, marginRight: 6 }}></span> Sell / Transfer Out
                    </div>
                </div>
            )}
        </Card>
    );
}
