import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Table } from 'antd';
import { TrophyOutlined } from '@ant-design/icons';
import { getDividends } from '../../services/api';
import { formatNPR } from '../../utils/formatters';

export default function DividendHistory({ memberId, symbol }) {
    const { data: dividends, isLoading } = useQuery({
        queryKey: ['dividends', memberId, symbol],
        queryFn: () => getDividends({ member_id: memberId, symbol, eligible_only: true }).then(r => r.data),
        enabled: !!symbol && !!memberId,
    });

    if (!dividends || dividends.length === 0) return null;

    const columns = [
        { title: 'Fiscal Year', dataIndex: 'fiscal_year', key: 'fy' },
        { title: 'Book Close', dataIndex: 'book_close_date', key: 'bcd', render: v => v || '—' },
        { title: 'Cash Div %', dataIndex: 'cash_dividend_percent', key: 'pct', render: v => `${v}%`, align: 'right' },
        { title: 'Bonus Div %', dataIndex: 'bonus_dividend_percent', key: 'bonus_pct', render: v => `${v}%`, align: 'right' },
        { title: 'Eligible Qty', dataIndex: 'eligible_quantity', key: 'qty', align: 'right' },
        { title: 'Net Amount (Rs)', dataIndex: 'total_cash_amount', key: 'amount', align: 'right', render: v => formatNPR(v) },
    ];

    return (
        <div style={{ marginTop: 12 }}>
            <h5 style={{ marginBottom: 8, color: 'var(--accent-green)' }}><TrophyOutlined /> Eligible Cash Dividends</h5>
            <Table
                columns={columns}
                dataSource={dividends}
                rowKey="id"
                loading={isLoading}
                pagination={false}
                size="small"
                style={{ background: 'rgba(255,255,255,0.02)', borderRadius: 8 }}
            />
        </div>
    );
}
