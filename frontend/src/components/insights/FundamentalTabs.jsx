import React from 'react';
import { Row, Col, Alert, Card, Divider, Tooltip, Tabs, Spin, Empty, Typography } from 'antd';
import { 
    ExperimentOutlined, RiseOutlined, BarChartOutlined, SwapOutlined, 
    DollarOutlined, TrophyOutlined 
} from '@ant-design/icons';
import { 
    ResponsiveContainer, PieChart, Pie, Cell, Tooltip as RechartsTooltip,
    BarChart, CartesianGrid, XAxis, YAxis, Legend, Bar 
} from 'recharts';

const { Text } = Typography;

const PIE_COLORS = ['#818cf8', '#34d399', '#fbbf24', '#f87171', '#38bdf8', '#a78bfa'];

const GROWTH_METRIC_LABELS = {
    'net_profit_growth': 'Net Profit Growth',
    'eps_growth': 'EPS Growth',
    'revenue_growth': 'Revenue Growth',
    'operating_profit_growth': 'Operating Profit Growth',
    'deposit_growth': 'Deposit Growth',
    'loan_growth': 'Loan Growth',
    'npl': 'NPL Ratio',
    'car': 'CAR Ratio',
    'roe': 'Return on Equity',
    'roa': 'Return on Assets',
    'net_interest_margin': 'Net Interest Margin',
    'credit_to_deposit': 'CD Ratio',
};

function formatNPR(value, decimals = 2) {
    if (value === null || value === undefined) return '—';
    return `Rs. ${Number(value).toLocaleString('en-IN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
}

const PCT = (val) => val == null ? '—' : `${Number(val).toFixed(2)}%`;
const QTY = (val) => val == null ? '—' : Number(val).toLocaleString('en-NP');
const pnlColor = (val) => {
    if (val == null || val === 0) return 'var(--text-secondary)';
    return val > 0 ? 'var(--accent-green)' : 'var(--accent-red)';
};

export default function FundamentalTabs({ 
    symbol, fund, processedGrowths, detail, hasPortfolioData, 
    qtyPieData, scriptHistoryData, loadingDividends 
}) {

    const ValuationHealthTab = () => (
        <div className="animate-in" style={{ marginTop: 16 }}>
            <Alert
                message={<span style={{ fontWeight: 600 }}><ExperimentOutlined /> Comprehensive Overview</span>}
                description={<span style={{ fontSize: 13 }}>Trailing metrics and general financial health based on the latest available quarterly and annual reports.</span>}
                type="info" showIcon
                style={{ marginBottom: 20, background: 'var(--bg-glass)', border: '1px solid rgba(108, 92, 231, 0.3)' }}
            />
            {fund?.overview && (
                <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
                    {[
                        { label: 'P/E Ratio', value: fund.overview.pe_ratio, fmt: v => v?.toFixed(2), color: fund.overview.pe_ratio < 20 ? '#00b894' : fund.overview.pe_ratio < 35 ? '#fdcb6e' : '#d63031' },
                        { label: 'P/B Ratio', value: fund.overview.pb_ratio, fmt: v => v?.toFixed(2), color: fund.overview.pb_ratio < 2 ? '#00b894' : fund.overview.pb_ratio < 4 ? '#fdcb6e' : '#d63031' },
                        { label: 'ROE (TTM)', value: fund.overview.roe_ttm, fmt: v => `${(v * 100).toFixed(2)}%`, color: fund.overview.roe_ttm > 0.12 ? '#00b894' : '#fdcb6e' },
                        { label: 'EPS (TTM)', value: fund.overview.eps_ttm, fmt: v => `Rs. ${v?.toFixed(2)}`, color: '#6c5ce7' },
                        { label: 'Book Value', value: fund.overview.book_value, fmt: v => `Rs. ${v?.toFixed(2)}`, color: '#0984e3' },
                        { label: 'Net Profit (TTM)', value: fund.overview.net_profit_ttm, fmt: v => v >= 1e9 ? `Rs. ${(v / 1e9).toFixed(2)}B` : v >= 1e6 ? `Rs. ${(v / 1e6).toFixed(2)}M` : `Rs. ${v?.toFixed(0)}`, color: fund.overview.net_profit_ttm > 0 ? '#00b894' : '#d63031' },
                    ].map(m => (
                        <Col xs={12} sm={8} key={m.label}>
                            <div className="stat-card" style={{ padding: '16px 20px', textAlign: 'center' }}>
                                <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>{m.label}</div>
                                <div style={{ fontSize: 22, fontWeight: 700, color: m.value != null ? m.color : 'var(--text-muted)' }}>
                                    {m.value != null ? m.fmt(m.value) : '—'}
                                </div>
                            </div>
                        </Col>
                    ))}
                </Row>
            )}

            {/* Quantity Breakdown from Portfolio */}
            {detail?.qty_breakdown && hasPortfolioData && (
                <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
                    <Col xs={24} lg={14}>
                        <Card size="small" title={<span><SwapOutlined /> Quantity Breakdown</span>}>
                            <Row gutter={[16, 12]}>
                                {[
                                    { label: 'IPO/FPO', val: detail.qty_breakdown.total_ipo, color: '#a78bfa' },
                                    { label: 'Secondary Buy', val: detail.qty_breakdown.total_bought, color: '#818cf8' },
                                    { label: 'Right Shares', val: detail.qty_breakdown.total_right, color: '#38bdf8' },
                                    { label: 'Bonus', val: detail.qty_breakdown.total_bonus, color: '#34d399' },
                                    { label: 'Transferred In', val: detail.qty_breakdown.total_transferred_in, color: '#fbbf24' },
                                    { label: 'Sold / Out', val: detail.qty_breakdown.total_sold + detail.qty_breakdown.total_transferred_out, color: '#f87171' },
                                ].map(item => (
                                    <Col xs={12} sm={8} key={item.label}>
                                        <div style={{ padding: '12px 14px', borderRadius: 10, background: 'var(--bg-primary)', border: '1px solid var(--border-color)' }}>
                                            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>{item.label}</div>
                                            <div style={{ fontSize: 18, fontWeight: 600, color: item.color }}>{QTY(item.val)}</div>
                                        </div>
                                    </Col>
                                ))}
                            </Row>
                            <Divider style={{ margin: '12px 0' }} />
                            <Row justify="space-between" style={{ padding: '0 4px' }}>
                                <Text style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Net Shares (Current)</Text>
                                <Text style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>{QTY(detail.qty_breakdown.net_shares)}</Text>
                            </Row>
                        </Card>
                    </Col>
                    <Col xs={24} lg={10}>
                        {qtyPieData?.length > 0 && (
                            <Card size="small" title={<span><BarChartOutlined /> Share Acquisition Sources</span>}>
                                <ResponsiveContainer width="100%" height={250}>
                                    <PieChart>
                                        <Pie data={qtyPieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} innerRadius={50} paddingAngle={2}
                                            label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                                            labelLine={{ stroke: 'var(--text-muted)', strokeWidth: 1 }}>
                                            {qtyPieData.map((_, i) => (<Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />))}
                                        </Pie>
                                        <RechartsTooltip contentStyle={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 8, fontSize: 12 }} />
                                    </PieChart>
                                </ResponsiveContainer>
                            </Card>
                        )}
                    </Col>
                </Row>
            )}
        </div>
    );

    const QuarterlyMatrixTab = () => (
        <div className="animate-in" style={{ marginTop: 16 }}>
            {processedGrowths && (
                <div style={{ marginBottom: 32 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: 'var(--accent-secondary)' }}>
                        <RiseOutlined style={{ marginRight: 6 }} /> YoY Fundamental Growth
                    </div>
                    <div style={{ overflowX: 'auto', background: 'var(--bg-primary)', padding: 16, borderRadius: 8, border: '1px solid var(--border-color)' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                                    <th style={{ textAlign: 'left', padding: '10px 12px', color: 'var(--text-secondary)', fontWeight: 600 }}>Metric</th>
                                    {processedGrowths.periods.map(p => (
                                        <th key={p} style={{ textAlign: 'right', padding: '10px 12px', color: 'var(--text-primary)', fontWeight: 600 }}>{p}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {processedGrowths.metrics.map((metric, idx) => (
                                    <tr key={metric} style={{ borderBottom: '1px solid var(--border-color)', background: idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)' }}>
                                        <td style={{ padding: '8px 12px', fontWeight: 500 }}>{GROWTH_METRIC_LABELS[metric] || metric}</td>
                                        {processedGrowths.periods.map(p => {
                                            const val = processedGrowths.values[metric][p];
                                            const isPercent = metric.includes('growth') || metric.includes('roe') || metric.includes('roa') || metric.includes('margin');
                                            return (<td key={p} style={{ textAlign: 'right', padding: '8px 12px' }}>{val != null ? (isPercent ? `${val.toFixed(2)}%` : val.toLocaleString(undefined, { minimumFractionDigits: 2 })) : '—'}</td>);
                                        })}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
            
            {fund?.quarterly && fund.quarterly.length > 0 && (
                <div style={{ marginBottom: 24 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: 'var(--text-secondary)' }}>
                        <BarChartOutlined style={{ marginRight: 6 }} /> Quarterly Spreadsheet <span style={{ fontSize: 11, fontWeight: 400, marginLeft: 8, opacity: 0.6 }}>(Values in Rs. '000)</span>
                    </div>
                    <div style={{ overflowX: 'auto', background: 'var(--bg-primary)', padding: 16, borderRadius: 8, border: '1px solid var(--border-color)' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                                    <th style={{ textAlign: 'left', padding: '10px 12px', color: 'var(--text-secondary)', fontWeight: 600 }}>Metric</th>
                                    {fund.quarterly.map(q => (<th key={q.quarter} style={{ textAlign: 'right', padding: '10px 12px', color: 'var(--accent-secondary)', fontWeight: 600 }}>{q.quarter}</th>))}
                                </tr>
                            </thead>
                            <tbody>
                                <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                                    <td style={{ padding: '8px 12px', fontWeight: 600 }}>Paid Up Capital</td>
                                    {fund.quarterly.map(q => (<td key={q.quarter} style={{ textAlign: 'right', padding: '8px 12px' }}>{q.paid_up_capital != null ? Number(q.paid_up_capital).toLocaleString('en-IN') : '—'}</td>))}
                                </tr>
                                <tr style={{ borderBottom: '1px solid var(--border-color)', background: 'rgba(0,184,148,0.04)' }}>
                                    <td style={{ padding: '8px 12px', fontWeight: 600, color: '#00b894' }}>Net Profit</td>
                                    {fund.quarterly.map(q => (<td key={q.quarter} style={{ textAlign: 'right', padding: '8px 12px', fontWeight: 600, color: q.net_profit > 0 ? '#00b894' : '#d63031' }}>{q.net_profit != null ? Number(q.net_profit).toLocaleString('en-IN') : '—'}</td>))}
                                </tr>
                                {(() => {
                                    const allKeys = [...new Set(fund.quarterly.flatMap(q => Object.keys(q.sector_metrics || {})))];
                                    return allKeys.slice(0, 15).map((key, idx) => (
                                        <tr key={key} style={{ borderBottom: '1px solid var(--border-color)', background: idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)' }}>
                                            <td style={{ padding: '8px 12px', color: 'var(--text-secondary)' }}>{key}</td>
                                            {fund.quarterly.map(q => {
                                                const val = (q.sector_metrics || {})[key];
                                                return (<td key={q.quarter} style={{ textAlign: 'right', padding: '8px 12px' }}>{val != null ? (typeof val === 'number' ? Number(val).toLocaleString('en-IN') : val) : '—'}</td>);
                                            })}
                                        </tr>
                                    ));
                                })()}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );

    const DividendTab = () => (
        <div className="animate-in" style={{ marginTop: 16 }}>
            {loadingDividends ? (
                <div style={{ textAlign: 'center', padding: '80px 0' }}><Spin size="large" /></div>
            ) : (
                <>
                    {/* Yield cards from portfolio context */}
                    {hasPortfolioData && detail && (
                        <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
                            <Col xs={24} sm={12} lg={6}>
                                <div className="stat-card"><div className="stat-label">Market Dividend Yield</div>
                                    <div className="stat-value" style={{ fontSize: 22, color: 'var(--accent-blue)' }}>{PCT(detail.market_yield)}</div>
                                    <div className="stat-change" style={{ color: 'var(--text-secondary)' }}>Based on LTP: {formatNPR(detail.price)}</div>
                                </div>
                            </Col>
                            <Col xs={24} sm={12} lg={6}>
                                <div className="stat-card"><div className="stat-label">Your Yield on Cost</div>
                                    <div className="stat-value" style={{ fontSize: 22, color: 'var(--accent-green)' }}>{PCT(detail.cost_yield)}</div>
                                    <div className="stat-change" style={{ color: 'var(--text-secondary)' }}>Based on WACC: {formatNPR(detail.wacc)}</div>
                                </div>
                            </Col>
                            <Col xs={24} sm={12} lg={6}>
                                <div className="stat-card"><div className="stat-label">Yield Advantage</div>
                                    <div className="stat-value" style={{ fontSize: 22, color: pnlColor(detail.cost_yield - detail.market_yield) }}>
                                        {detail.cost_yield > detail.market_yield ? '+' : ''}{PCT(detail.cost_yield - detail.market_yield)}
                                    </div>
                                    <div className="stat-change" style={{ color: 'var(--text-secondary)' }}>Your yield vs market yield</div>
                                </div>
                            </Col>
                            <Col xs={24} sm={12} lg={6}>
                                <div className="stat-card"><div className="stat-label">Tax Payable</div>
                                    <div className="stat-value" style={{ fontSize: 22, color: 'var(--accent-red)' }}>
                                        {formatNPR(detail.dividend_history?.reduce((sum, r) => sum + (r.tax_owed || 0), 0) || 0)}
                                    </div>
                                    <div className="stat-change" style={{ color: 'var(--text-secondary)' }}>Unpaid tax on bonus shares</div>
                                </div>
                            </Col>
                        </Row>
                    )}

                    {/* Detailed dividend table from portfolio context */}
                    {detail?.dividend_history?.length > 0 && (
                        <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
                            <Col xs={24} sm={12}>
                                <div className="stat-card" style={{ padding: '20px 24px', borderLeft: '4px solid var(--accent-green)' }}>
                                    <div className="stat-label" style={{ color: 'var(--text-secondary)', marginBottom: 8 }}><DollarOutlined /> Total Net Cash Received</div>
                                    <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--accent-green)' }}>
                                        {formatNPR(detail.dividend_history.reduce((sum, h) => sum + (h.cash_amount > 0 ? h.cash_amount : 0), 0))}
                                    </div>
                                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>From your eligible holdings</div>
                                </div>
                            </Col>
                            <Col xs={24} sm={12}>
                                <div className="stat-card" style={{ padding: '20px 24px', borderLeft: '4px solid #34d399' }}>
                                    <div className="stat-label" style={{ color: 'var(--text-secondary)', marginBottom: 8 }}><TrophyOutlined /> Total Bonus Shares</div>
                                    <div style={{ fontSize: 24, fontWeight: 700, color: '#34d399' }}>
                                        {detail.dividend_history.reduce((sum, h) => sum + (h.bonus_shares > 0 ? h.bonus_shares : 0), 0).toLocaleString()} <span style={{ fontSize: 14 }}>Units</span>
                                    </div>
                                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Added to portfolio</div>
                                </div>
                            </Col>
                        </Row>
                    )}

                    {/* Dividend Chart */}
                    {scriptHistoryData && scriptHistoryData.length > 0 ? (
                        <Row gutter={[24, 24]}>
                            <Col xs={24}>
                                <div style={{ height: 350, background: 'var(--bg-glass)', padding: 16, borderRadius: 8, border: '1px solid var(--border-color)' }}>
                                    <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-secondary)', textAlign: 'center', marginBottom: 16 }}>Historic Payout Percentage</div>
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={scriptHistoryData} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#ffffff1a" />
                                            <XAxis dataKey="fy" stroke="#8884d8" angle={-30} textAnchor="end" height={60} />
                                            <YAxis stroke="#8884d8" />
                                            <RechartsTooltip contentStyle={{ backgroundColor: '#1a1a2e', border: '1px solid #ffffff1a', borderRadius: '8px' }} itemStyle={{ color: 'white' }} />
                                            <Legend verticalAlign="top" height={36} />
                                            <Bar dataKey="cashPercent" name="Cash %" fill="#00e676" stackId="a" />
                                            <Bar dataKey="bonusPercent" name="Bonus %" fill="#2979ff" stackId="a" />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            </Col>
                        </Row>
                    ) : (
                        <div style={{ textAlign: 'center', padding: '60px 0' }}>
                            <Empty description={<span style={{ color: 'var(--text-secondary)' }}>No dividend history recorded. Ensure dividends are synced.</span>} />
                        </div>
                    )}
                </>
            )}
        </div>
    );

    if (!fund) {
        return (
            <Card className="stat-card" style={{ textAlign: 'center', padding: '40px 20px', marginBottom: 24, marginTop: 16 }}>
                <ExperimentOutlined style={{ fontSize: 48, opacity: 0.12, marginBottom: 16, display: 'block' }} />
                <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>No Fundamental Data</div>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', maxWidth: 500, margin: '0 auto' }}>
                    Click "Scrape Latest Data" above to fetch fundamentals for this symbol.
                </p>
            </Card>
        );
    }

    const items = [
        { key: 'valuation', label: 'Valuation & Health', children: <ValuationHealthTab /> },
        { key: 'quarterly', label: 'Quarterly Matrix', children: <QuarterlyMatrixTab /> },
        { key: 'dividend', label: 'Dividend Analysis', children: <DividendTab /> },
    ];

    return (
        <Tabs items={items} defaultActiveKey="valuation" className="custom-subtabs" />
    );
}
