import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Table, Tag } from 'antd';
import { getTransactions } from '../../services/api';

export default function TransactionHistory({ memberId, symbol }) {
    const { data: transactions, isLoading } = useQuery({
        queryKey: ['transactions-history', memberId, symbol],
        queryFn: () => getTransactions({ member_id: memberId, symbol, limit: 1000 }).then(r => r.data.transactions),
        enabled: !!symbol,
    });

    const columns = [
        { title: 'Date', dataIndex: 'txn_date', key: 'date', width: 120 },
        {
            title: 'Type',
            dataIndex: 'txn_type',
            key: 'type',
            render: (type) => {
                let color = 'default';
                if (['BUY', 'IPO', 'RIGHT'].includes(type)) color = 'green';
                if (['SELL'].includes(type)) color = 'red';
                if (['BONUS'].includes(type)) color = 'blue';
                return <Tag color={color}>{type}</Tag>;
            }
        },
        { title: 'Qty', dataIndex: 'quantity', key: 'qty', align: 'right' },
        {
            title: 'Rate',
            dataIndex: 'rate',
            key: 'rate',
            align: 'right',
            render: (v) => v ? v.toFixed(3) : '—'
        },
        {
            title: 'Commission',
            dataIndex: 'broker_commission',
            key: 'broker_commission',
            align: 'right',
            render: (v) => v ? v.toLocaleString() : '-'
        },
        {
            title: 'DP Charge',
            dataIndex: 'dp_charge',
            key: 'dp_charge',
            align: 'right',
            render: (v) => v ? v.toLocaleString() : '-'
        },
        {
            title: 'SEBON',
            dataIndex: 'sebon_fee',
            key: 'sebon_fee',
            align: 'right',
            render: (v) => v ? v.toLocaleString() : '-'
        },
        {
            title: 'CGT',
            dataIndex: 'cgt',
            key: 'cgt',
            align: 'right',
            render: (v) => v ? v.toLocaleString() : '-'
        },
        {
            title: 'Transfer Fee',
            dataIndex: 'name_transfer_fee',
            key: 'name_transfer_fee',
            align: 'right',
            render: (v) => v ? v.toLocaleString() : '-'
        },
        {
            title: 'Total Cost',
            dataIndex: 'total_cost',
            key: 'cost',
            align: 'right',
            render: (v) => v ? v.toLocaleString() : '—'
        },
        {
            title: 'Tax WACC',
            dataIndex: 'tax_wacc',
            key: 'tax_wacc',
            align: 'right',
            render: (v) => v ? <strong>{v.toFixed(3)}</strong> : '—'
        },
        { title: 'Source', dataIndex: 'source', key: 'source', render: (s) => <span style={{ fontSize: '0.8rem', opacity: 0.7 }}>{s}</span> },
    ];

    return (
        <Table
            columns={columns}
            dataSource={transactions || []}
            rowKey="id"
            loading={isLoading}
            pagination={false}
            size="small"
            style={{ margin: '8px 0', background: 'rgba(255,255,255,0.02)', borderRadius: 8 }}
        />
    );
}
