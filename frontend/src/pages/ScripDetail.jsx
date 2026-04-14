import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Row, Col, Card, Statistic, Table, Tag, Select, Spin, Empty, Tooltip,
  Typography, Divider, Progress, Descriptions, Tabs, Radio
} from 'antd';
import {
  ArrowUpOutlined, ArrowDownOutlined, StockOutlined, DollarOutlined,
  HistoryOutlined, FundOutlined, BarChartOutlined, SafetyCertificateOutlined,
  SwapOutlined, TrophyOutlined, CalendarOutlined, BankOutlined,
  RiseOutlined, FallOutlined, InfoCircleOutlined, LineChartOutlined,
} from '@ant-design/icons';
import {
  XAxis, YAxis, CartesianGrid, ResponsiveContainer,
  Tooltip as RechartsTooltip, PieChart, Pie, Cell, Legend,
  AreaChart, Area, ComposedChart, Line, BarChart, Bar
} from 'recharts';
import { getMembers, getStockDetail, getSymbolsList, getHistoricalPrices } from '../services/api';

const { Text, Title } = Typography;

const NPR = (val, decimals = 2) => {
  if (val == null) return '—';
  return `Rs. ${Number(val).toLocaleString('en-NP', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
};

const PCT = (val) => {
  if (val == null) return '—';
  return `${Number(val).toFixed(3)}%`;
};

const QTY = (val) => {
  if (val == null) return '—';
  return Number(val).toLocaleString('en-NP');
};

const pnlColor = (val) => {
  if (val == null || val === 0) return 'var(--text-secondary)';
  return val > 0 ? 'var(--accent-green)' : 'var(--accent-red)';
};

const PIE_COLORS = ['#818cf8', '#34d399', '#fbbf24', '#f87171', '#38bdf8', '#a78bfa'];

function PriceHistoryCard({ symbol, transactions }) {
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
      // Normalize date to YYYY-MM-DD to avoid time/timezone mismatches
      const txnDate = t.txn_date.split('T')[0];
      if (!txnsByDate[txnDate]) txnsByDate[txnDate] = { buys: false, sells: false };
      
      const type = t.txn_type;
      if (['BUY', 'IPO', 'FPO', 'RIGHT', 'AUCTION', 'TRANSFER_IN'].includes(type)) {
        txnsByDate[txnDate].buys = true;
      } else if (['SELL', 'TRANSFER_OUT'].includes(type)) {
        txnsByDate[txnDate].sells = true;
      }
    });

    return data.map(d => {
      let isBuy = false;
      let isSell = false;
      
      if (d.date) {
        const dDate = d.date.split('T')[0];
        if (txnsByDate[dDate]) {
          if (txnsByDate[dDate].buys) isBuy = true;
          if (txnsByDate[dDate].sells) isSell = true;
        }
      }
      
      return {
        ...d,
        displayDate: new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' }),
        buyMarker: isBuy ? d.close : null,
        sellMarker: isSell ? d.close : null,
      };
    });
  }, [priceRaw, timeRange, transactions]);

  // Compute domain for better zoom
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
        <Radio.Group 
          value={timeRange} 
          onChange={(e) => setTimeRange(e.target.value)} 
          optionType="button" 
          buttonStyle="solid" 
          size="small"
        >
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

export default function ScripDetail() {
  const [memberCtx, setMemberCtx] = useState({ type: 'all', id: null, memberIds: [] });
  const [selectedSymbol, setSelectedSymbol] = useState(null);

  // Fetch members
  const { data: membersData } = useQuery({
    queryKey: ['members'],
    queryFn: () => getMembers().then(r => r.data),
  });
  const members = membersData || [];

  // Build query params from member context
  const memberParams = useMemo(() => {
    if (memberCtx.type === 'member' && memberCtx.id) return { member_id: memberCtx.id };
    if (memberCtx.type === 'group' && memberCtx.memberIds?.length) return { member_ids: memberCtx.memberIds.join(',') };
    return {};
  }, [memberCtx]);

  // Fetch symbols list
  const { data: symbolsData, isLoading: symbolsLoading } = useQuery({
    queryKey: ['symbolsList', memberParams],
    queryFn: () => getSymbolsList(memberParams).then(r => r.data),
  });
  const symbols = symbolsData || [];

  // Fetch stock detail
  const { data: detail, isLoading: detailLoading, isError } = useQuery({
    queryKey: ['stockDetail', selectedSymbol, memberParams],
    queryFn: () => getStockDetail(selectedSymbol, memberParams).then(r => r.data),
    enabled: !!selectedSymbol,
  });

  // --- Handlers ---
  const handleMemberChange = (ctx) => {
    setMemberCtx(ctx);
    setSelectedSymbol(null);
  };

  // --- Quantity Pie Data ---
  const qtyPieData = useMemo(() => {
    if (!detail?.qty_breakdown) return [];
    const b = detail.qty_breakdown;
    const data = [];
    if (b.total_ipo > 0) data.push({ name: 'IPO/FPO', value: b.total_ipo });
    if (b.total_bought > 0) data.push({ name: 'Secondary Buy', value: b.total_bought });
    if (b.total_right > 0) data.push({ name: 'Right Shares', value: b.total_right });
    if (b.total_bonus > 0) data.push({ name: 'Bonus', value: b.total_bonus });
    if (b.total_transferred_in > 0) data.push({ name: 'Transferred In', value: b.total_transferred_in });
    if (b.total_sold > 0) data.push({ name: 'Sold', value: b.total_sold });
    if (b.total_transferred_out > 0) data.push({ name: 'Transferred Out', value: b.total_transferred_out });
    return data;
  }, [detail]);

  // --- Dividend chart Data ---
  const divChartData = useMemo(() => {
    if (!detail?.dividend_history?.length) return [];
    return [...detail.dividend_history].reverse().map(d => ({
      fy: d.fiscal_year,
      cash: d.cash_pct,
      bonus: d.bonus_pct,
      amount: d.cash_amount,
    }));
  }, [detail]);

  // --- Txn columns ---
  const txnColumns = [
    {
      title: 'Date',
      dataIndex: 'txn_date',
      width: 110,
      render: v => v || '—',
    },
    {
      title: 'Type',
      dataIndex: 'txn_type',
      width: 100,
      render: v => {
        const colors = {
          BUY: 'blue', SELL: 'red', IPO: 'purple', BONUS: 'green',
          RIGHT: 'cyan', DIVIDEND: 'gold', FPO: 'purple',
          TRANSFER_IN: 'geekblue', TRANSFER_OUT: 'volcano',
          AUCTION: 'magenta', MERGE: 'lime', DEMERGE: 'orange',
        };
        return <Tag color={colors[v] || 'default'}>{v}</Tag>;
      },
    },
    {
      title: 'Qty',
      dataIndex: 'quantity',
      width: 80,
      align: 'right',
      render: v => QTY(v),
    },
    {
      title: 'Rate',
      dataIndex: 'rate',
      width: 100,
      align: 'right',
      render: v => v ? NPR(v) : '—',
    },
    {
      title: 'Amount',
      dataIndex: 'amount',
      width: 120,
      align: 'right',
      render: v => v ? NPR(v) : '—',
    },
    {
      title: 'Fees',
      width: 100,
      align: 'right',
      render: (_, r) => {
        const fees = (r.broker_commission || 0) + (r.sebon_fee || 0) + (r.dp_charge || 0) + (r.cgt || 0);
        return fees > 0 ? (
          <Tooltip title={`Broker: ${NPR(r.broker_commission)} | SEBON: ${NPR(r.sebon_fee)} | DP: ${NPR(r.dp_charge)} | CGT: ${NPR(r.cgt)}`}>
            <span style={{ color: 'var(--accent-yellow)', cursor: 'help' }}>{NPR(fees)}</span>
          </Tooltip>
        ) : '—';
      },
    },
    {
      title: 'Net Cost',
      dataIndex: 'total_cost',
      width: 120,
      align: 'right',
      render: v => v ? NPR(v) : '—',
    },
    {
      title: 'WACC',
      dataIndex: 'wacc',
      width: 100,
      align: 'right',
      render: v => v ? NPR(v) : '—',
    },
    {
      title: 'Source',
      dataIndex: 'source',
      width: 90,
      render: v => <Tag>{v || 'MANUAL'}</Tag>,
    },
  ];

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto' }}>
      {/* Page Header */}
      <div className="page-header">
        <h1><StockOutlined style={{ marginRight: 10, color: 'var(--accent-primary)' }} />Scrip Detail</h1>
        <div className="subtitle">Complete 360° analysis for any stock or SIP in your portfolio</div>
      </div>

      {/* Member Selector (Inline) */}
      <div className="member-selector" style={{ marginBottom: 24, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <div
            className={`member-chip ${memberCtx.type === 'all' ? 'active' : ''}`}
            onClick={() => handleMemberChange({ type: 'all', id: null, memberIds: [] })}
        >
            All Members
        </div>
        {members.map(m => (
            <div
                key={m.id}
                className={`member-chip ${memberCtx.id === m.id ? 'active' : ''}`}
                onClick={() => handleMemberChange({ type: 'member', id: m.id, memberIds: [m.id] })}
            >
                {m.display_name || m.name}
            </div>
        ))}
      </div>

      {/* Symbol Selector */}
      <div style={{ marginBottom: 24 }}>
        <Select
          id="symbol-selector"
          showSearch
          allowClear
          placeholder="Search and select a stock symbol..."
          value={selectedSymbol}
          onChange={setSelectedSymbol}
          loading={symbolsLoading}
          style={{ width: 400, fontSize: 15 }}
          size="large"
          filterOption={(input, option) =>
            option.label.toLowerCase().includes(input.toLowerCase())
          }
          options={symbols.map(s => ({
            value: s.symbol,
            label: s.symbol,
            extra: s.is_active,
          }))}
          optionRender={(option) => (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 500 }}>{option.data.value}</span>
              {option.data.extra ? (
                <Tag color="green" style={{ margin: 0, fontSize: 10 }}>HOLDING</Tag>
              ) : (
                <Tag color="default" style={{ margin: 0, fontSize: 10 }}>CLOSED</Tag>
              )}
            </div>
          )}
        />
      </div>

      {/* Loading or Empty */}
      {!selectedSymbol && (
        <div style={{ textAlign: 'center', padding: '80px 0' }}>
          <Empty
            description={
              <span style={{ color: 'var(--text-secondary)', fontSize: 15 }}>
                Select a symbol above to view its complete analysis
              </span>
            }
          />
        </div>
      )}

      {selectedSymbol && detailLoading && (
        <div style={{ textAlign: 'center', padding: '80px 0' }}>
          <Spin size="large" />
        </div>
      )}

      {/* Main Detail Content */}
      {detail && !detailLoading && (
        <div className="animate-in">
          {/* Title Bar */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24,
            padding: '16px 24px',
            background: 'var(--bg-secondary)', border: '1px solid var(--border-color)',
            borderRadius: 16,
          }}>
            <div style={{
              width: 48, height: 48, borderRadius: 12,
              background: detail.is_active ? 'var(--gradient-green)' : 'var(--gradient-red)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 20, color: '#fff', fontWeight: 700,
            }}>
              {detail.symbol.charAt(0)}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 22, fontWeight: 600, color: 'var(--text-primary)', letterSpacing: -0.5 }}>
                {detail.symbol}
                <Tag color={detail.is_active ? 'green' : 'volcano'} style={{ marginLeft: 12 }}>
                  {detail.is_active ? 'ACTIVE' : 'CLOSED'}
                </Tag>
                {detail.instrument && detail.instrument !== 'Equity' && (
                  <Tag color="blue" style={{ marginLeft: 4 }}>{detail.instrument}</Tag>
                )}
              </div>
              <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
                {detail.company_name} • {detail.sector}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 28, fontWeight: 600, color: 'var(--text-primary)', letterSpacing: -1 }}>
                {NPR(detail.price)}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                {detail.ltp ? 'LTP' : detail.nav ? 'NAV' : ''}
              </div>
            </div>
          </div>

          {/* Top Stat Cards */}
          <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
            <Col xs={24} sm={12} lg={6}>
              <div className="stat-card">
                <div className="stat-label"><FundOutlined /> Current Value</div>
                <div className="stat-value" style={{ fontSize: 24 }}>{NPR(detail.current_value)}</div>
                <div className="stat-change" style={{ color: pnlColor(detail.unrealized_pnl) }}>
                  {detail.unrealized_pnl > 0 ? <ArrowUpOutlined /> : detail.unrealized_pnl < 0 ? <ArrowDownOutlined /> : null}
                  {NPR(detail.unrealized_pnl)} ({PCT(detail.pnl_pct)})
                </div>
              </div>
            </Col>
            <Col xs={24} sm={12} lg={6}>
              <div className="stat-card">
                <div className="stat-label"><DollarOutlined /> Total Investment</div>
                <div className="stat-value" style={{ fontSize: 24 }}>{NPR(detail.total_investment)}</div>
                <div className="stat-change" style={{ color: 'var(--text-secondary)' }}>
                  WACC: {NPR(detail.wacc)} | Tax: {NPR(detail.tax_wacc)}
                </div>
              </div>
            </Col>
            <Col xs={24} sm={12} lg={6}>
              <div className="stat-card">
                <div className="stat-label"><RiseOutlined /> Total ROI</div>
                <div className="stat-value" style={{ fontSize: 24, color: pnlColor(detail.roi_pct) }}>
                  {PCT(detail.roi_pct)}
                </div>
                <div className="stat-change" style={{ color: 'var(--text-secondary)' }}>
                  Returns: {NPR(detail.total_returns)}
                </div>
              </div>
            </Col>
            <Col xs={24} sm={12} lg={6}>
              <div className="stat-card">
                <div className="stat-label"><BarChartOutlined /> XIRR</div>
                <div className="stat-value" style={{ fontSize: 24, color: pnlColor(detail.xirr) }}>
                  {PCT(detail.xirr)}
                </div>
                <div className="stat-change" style={{ color: 'var(--text-secondary)' }}>
                  <CalendarOutlined style={{ marginRight: 4 }} />
                  {detail.holding_days} days held
                </div>
              </div>
            </Col>
          </Row>

          {/* Tabs */}
          <Tabs
            className="dashboard-tabs"
            defaultActiveKey="overview"
            items={[
              {
                key: 'overview',
                label: <span><InfoCircleOutlined /> Overview</span>,
                children: (
                  <Row gutter={[16, 16]}>
                    {/* Left: Key Metrics */}
                    <Col xs={24} lg={14}>
                      <Card size="small" title={<span><SafetyCertificateOutlined /> Key Metrics</span>}>
                        <Descriptions column={2} size="small" labelStyle={{ color: 'var(--text-secondary)', fontSize: 12 }}
                          contentStyle={{ fontWeight: 500, fontSize: 13 }}>
                          <Descriptions.Item label="Current Qty">{QTY(detail.current_qty)}</Descriptions.Item>
                          <Descriptions.Item label="WACC (True)">{NPR(detail.wacc)}</Descriptions.Item>
                          <Descriptions.Item label="Tax WACC">{NPR(detail.tax_wacc)}</Descriptions.Item>
                          <Descriptions.Item label="LTP / NAV">{NPR(detail.price)}</Descriptions.Item>
                          <Descriptions.Item label="Unrealized P&L">
                            <span style={{ color: pnlColor(detail.unrealized_pnl) }}>{NPR(detail.unrealized_pnl)}</span>
                          </Descriptions.Item>
                          <Descriptions.Item label="Tax Profit">
                            <span style={{ color: pnlColor(detail.tax_profit) }}>{NPR(detail.tax_profit)}</span>
                          </Descriptions.Item>
                          <Descriptions.Item label="Realized P&L">
                            <span style={{ color: pnlColor(detail.realized_profit) }}>{NPR(detail.realized_profit)}</span>
                          </Descriptions.Item>
                          <Descriptions.Item label="Total Cash Dividend">{NPR(detail.total_cash_dividend)}</Descriptions.Item>
                          <Descriptions.Item label="Bonus Shares Received">{QTY(detail.total_bonus_shares)}</Descriptions.Item>
                          <Descriptions.Item label="Instrument">{detail.instrument}</Descriptions.Item>
                          <Descriptions.Item label="First Transaction">{detail.first_txn_date || '—'}</Descriptions.Item>
                          <Descriptions.Item label="Last Transaction">{detail.last_txn_date || '—'}</Descriptions.Item>
                        </Descriptions>
                      </Card>

                      {/* Quantity Breakdown */}
                      {detail.qty_breakdown && (
                        <Card size="small" title={<span><SwapOutlined /> Quantity Breakdown</span>} style={{ marginTop: 16 }}>
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
                                <div style={{
                                  padding: '12px 14px', borderRadius: 10,
                                  background: 'var(--bg-primary)', border: '1px solid var(--border-color)',
                                }}>
                                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>{item.label}</div>
                                  <div style={{ fontSize: 18, fontWeight: 600, color: item.color }}>
                                    {QTY(item.val)}
                                  </div>
                                </div>
                              </Col>
                            ))}
                          </Row>
                          <Divider style={{ margin: '12px 0' }} />
                          <Row justify="space-between" style={{ padding: '0 4px' }}>
                            <Text style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Net Shares (Current)</Text>
                            <Text style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>
                              {QTY(detail.qty_breakdown.net_shares)}
                            </Text>
                          </Row>
                        </Card>
                      )}
                    </Col>

                    {/* Right: Charts */}
                    <Col xs={24} lg={10}>
                      {/* Pie Chart — Acquisition Sources */}
                      {qtyPieData.length > 0 && (
                        <Card size="small" title={<span><BarChartOutlined /> Share Acquisition Sources</span>}>
                          <ResponsiveContainer width="100%" height={250}>
                            <PieChart>
                              <Pie data={qtyPieData} dataKey="value" nameKey="name" cx="50%" cy="50%"
                                outerRadius={90} innerRadius={50} paddingAngle={2}
                                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                                labelLine={{ stroke: 'var(--text-muted)', strokeWidth: 1 }}
                              >
                                {qtyPieData.map((_, i) => (
                                  <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                                ))}
                              </Pie>
                              <RechartsTooltip contentStyle={{
                                background: 'var(--bg-secondary)', border: '1px solid var(--border-color)',
                                borderRadius: 8, fontSize: 12,
                              }} />
                            </PieChart>
                          </ResponsiveContainer>
                        </Card>
                      )}

                      {/* Graham & Valuation Card */}
                      <Card size="small" title={<span><BankOutlined /> Valuation</span>} style={{ marginTop: 16 }}>
                        <Descriptions column={1} size="small"
                          labelStyle={{ color: 'var(--text-secondary)', fontSize: 12 }}
                          contentStyle={{ fontWeight: 500, fontSize: 13 }}
                        >
                          <Descriptions.Item label="Graham's Number">
                            {detail.graham_number ? (
                              <span>
                                {NPR(detail.graham_number)}
                                {' '}
                                <Tag color={detail.graham_discount_pct > 0 ? 'green' : 'red'} style={{ fontSize: 11 }}>
                                  {detail.graham_discount_pct > 0 ? 'Undervalued' : 'Overvalued'} {PCT(Math.abs(detail.graham_discount_pct))}
                                </Tag>
                              </span>
                            ) : '—'}
                          </Descriptions.Item>
                          <Descriptions.Item label="EPS (TTM)">{detail.eps_ttm?.toFixed(3) || '—'}</Descriptions.Item>
                          <Descriptions.Item label="Book Value">{detail.bvps ? NPR(detail.bvps) : '—'}</Descriptions.Item>
                          <Descriptions.Item label="P/E Ratio">{detail.pe_ratio?.toFixed(3) || '—'}</Descriptions.Item>
                          <Descriptions.Item label="ROE (TTM)">{detail.roe_ttm ? PCT(detail.roe_ttm) : '—'}</Descriptions.Item>
                        </Descriptions>

                        {/* Graham vs LTP visual */}
                        {detail.graham_number && detail.price && (
                          <div style={{ marginTop: 12 }}>
                            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 6 }}>Price vs Graham's Number</div>
                            <Progress
                              percent={Math.min(100, Math.round((detail.price / detail.graham_number) * 100))}
                              strokeColor={detail.price <= detail.graham_number ? '#34d399' : '#f87171'}
                              trailColor="var(--border-color)"
                              format={() => `${NPR(detail.price)} / ${NPR(detail.graham_number)}`}
                              size="small"
                            />
                          </div>
                        )}
                      </Card>
                    </Col>
                  </Row>
                ),
              },
              {
                key: 'dividends',
                label: <span><TrophyOutlined /> Dividends & Yield</span>,
                children: (
                  <Row gutter={[16, 16]}>
                    {/* Yield Comparison Cards */}
                    <Col xs={24} sm={12} lg={6}>
                      <div className="stat-card">
                        <div className="stat-label">Market Dividend Yield</div>
                        <div className="stat-value" style={{ fontSize: 22, color: 'var(--accent-blue)' }}>
                          {PCT(detail.market_yield)}
                        </div>
                        <div className="stat-change" style={{ color: 'var(--text-secondary)' }}>
                          Based on LTP: {NPR(detail.price)}
                        </div>
                      </div>
                    </Col>
                    <Col xs={24} sm={12} lg={6}>
                      <div className="stat-card">
                        <div className="stat-label">Your Yield on Cost</div>
                        <div className="stat-value" style={{ fontSize: 22, color: 'var(--accent-green)' }}>
                          {PCT(detail.cost_yield)}
                        </div>
                        <div className="stat-change" style={{ color: 'var(--text-secondary)' }}>
                          Based on WACC: {NPR(detail.wacc)}
                        </div>
                      </div>
                    </Col>
                    <Col xs={24} sm={12} lg={6}>
                      <div className="stat-card">
                        <div className="stat-label">Yield Advantage</div>
                        <div className="stat-value" style={{
                          fontSize: 22,
                          color: pnlColor(detail.cost_yield - detail.market_yield),
                        }}>
                          {detail.cost_yield > detail.market_yield ? '+' : ''}{PCT(detail.cost_yield - detail.market_yield)}
                        </div>
                        <div className="stat-change" style={{ color: 'var(--text-secondary)' }}>
                          Your yield vs market yield
                        </div>
                      </div>
                    </Col>
                    <Col xs={24} sm={12} lg={6}>
                      <div className="stat-card">
                        <div className="stat-label">Tax Payable</div>
                        <div className="stat-value" style={{ fontSize: 22, color: 'var(--accent-red)' }}>
                          {NPR(detail.dividend_history?.reduce((sum, r) => sum + (r.tax_owed || 0), 0) || 0)}
                        </div>
                        <div className="stat-change" style={{ color: 'var(--text-secondary)' }}>
                          Unpaid tax on bonus shares
                        </div>
                      </div>
                    </Col>

                    {/* Dividend Summary */}
                    <Col xs={24} sm={12}>
                      <Card size="small" title="Dividend Summary">
                        <Descriptions column={1} size="small"
                          labelStyle={{ color: 'var(--text-secondary)', fontSize: 12 }}
                          contentStyle={{ fontWeight: 500, fontSize: 13 }}>
                          <Descriptions.Item label="Total Cash Dividend Received">{NPR(detail.total_cash_dividend)}</Descriptions.Item>
                          <Descriptions.Item label="Total Tax Payable / Deducted">{NPR(detail.total_tax_deducted)}</Descriptions.Item>
                          <Descriptions.Item label="Total Bonus Shares Received">{QTY(detail.total_bonus_shares)}</Descriptions.Item>
                          <Descriptions.Item label="Latest Cash Dividend %">{PCT(detail.latest_cash_div_pct)}</Descriptions.Item>
                          <Descriptions.Item label="Face Value">Rs. {detail.face_value}</Descriptions.Item>
                        </Descriptions>
                      </Card>
                    </Col>

                    {/* Dividend Chart */}
                    <Col xs={24} sm={12}>
                      {divChartData.length > 0 ? (
                        <Card size="small" title="Dividend History">
                          <ResponsiveContainer width="100%" height={220}>
                            <BarChart data={divChartData} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
                              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
                              <XAxis dataKey="fy" tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} />
                              <YAxis tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} />
                              <RechartsTooltip contentStyle={{
                                background: 'var(--bg-secondary)', border: '1px solid var(--border-color)',
                                borderRadius: 8, fontSize: 12,
                              }} />
                              <Bar dataKey="cash" name="Cash %" fill="#818cf8" radius={[4, 4, 0, 0]} />
                              <Bar dataKey="bonus" name="Bonus %" fill="#34d399" radius={[4, 4, 0, 0]} />
                              <Legend wrapperStyle={{ fontSize: 11, color: 'var(--text-secondary)' }} />
                            </BarChart>
                          </ResponsiveContainer>
                        </Card>
                      ) : (
                        <Card size="small" title="Dividend History">
                          <Empty description="No dividend data available" />
                        </Card>
                      )}
                    </Col>

                    {/* Dividend Table */}
                    {detail.dividend_history?.length > 0 && (
                      <Col span={24}>
                        <Card size="small" title="Dividend History Details">
                          <Table
                            className="portfolio-table"
                            dataSource={detail.dividend_history}
                            rowKey="fiscal_year"
                            size="small"
                            pagination={false}
                            columns={[
                              { title: 'Fiscal Year', dataIndex: 'fiscal_year', width: 120 },
                              { title: 'Cash %', dataIndex: 'cash_pct', width: 80, align: 'right', render: v => PCT(v) },
                              { title: 'Bonus %', dataIndex: 'bonus_pct', width: 80, align: 'right', render: v => PCT(v) },
                              { title: 'Book Close', dataIndex: 'book_close_date', width: 120 },
                              { title: 'Eligible Qty', dataIndex: 'eligible_qty', width: 100, align: 'right', render: v => QTY(v) },
                              { title: 'Tax/Deducted', dataIndex: 'total_tax', width: 110, align: 'right', render: (v, r) => (
                                <div>
                                  {NPR(v)}
                                  {r.tax_owed > 0 && <div style={{ fontSize: 10, color: 'var(--accent-red)' }}>Payable</div>}
                                </div>
                              )},
                              { title: 'Net Cash Income', dataIndex: 'cash_amount', width: 120, align: 'right', render: v => {
                                if (v < 0) {
                                  return <strong style={{ color: 'var(--accent-red)' }}>({NPR(Math.abs(v))})</strong>;
                                }
                                return <strong style={{ color: 'var(--accent-green)' }}>{NPR(v)}</strong>;
                              }},
                              { title: 'Bonus Shares', dataIndex: 'bonus_shares', width: 100, align: 'right', render: v => QTY(v) },
                            ]}
                          />
                        </Card>
                      </Col>
                    )}
                  </Row>
                ),
              },
              {
                key: 'price-history',
                label: <span><LineChartOutlined /> Price History</span>,
                children: (
                  <PriceHistoryCard
                    symbol={detail.symbol}
                    transactions={detail.transactions}
                  />
                ),
              },
              {
                key: 'transactions',
                label: <span><HistoryOutlined /> Transactions ({detail.transaction_count})</span>,
                children: (
                  <Card size="small" title={`Transaction History — ${detail.symbol}`}>
                    <Table
                      className="portfolio-table"
                      dataSource={detail.transactions}
                      columns={txnColumns}
                      rowKey="id"
                      size="small"
                      pagination={{ defaultPageSize: 20, showSizeChanger: true, pageSizeOptions: ['20', '50', '100'], showTotal: (t) => `${t} transactions` }}
                      scroll={{ x: 900 }}
                      rowClassName={(r) => {
                        if (['BUY', 'IPO', 'FPO', 'RIGHT', 'AUCTION', 'TRANSFER_IN'].includes(r.txn_type)) return 'row-positive';
                        if (['SELL', 'TRANSFER_OUT'].includes(r.txn_type)) return 'row-negative';
                        return '';
                      }}
                    />
                  </Card>
                ),
              },
            ]}
          />
        </div>
      )}
    </div>
  );
}
