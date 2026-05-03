import React, { useState } from 'react';
import {
  Tabs, Card, Row, Col, Statistic, Tag, Alert, Spin, Button, InputNumber,
  DatePicker, Typography, Space, Progress, Table, Divider, message, Tooltip,
} from 'antd';
import {
  ReloadOutlined, GlobalOutlined, BankOutlined, DollarOutlined,
  RiseOutlined, FallOutlined, TrophyOutlined, ArrowUpOutlined,
  ArrowDownOutlined, ThunderboltOutlined, SafetyCertificateOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getEconomyMacro, triggerEconomyScrape, getEconomyAlternatives } from '../services/api';
import dayjs from 'dayjs';

const { Title, Text, Paragraph } = Typography;

// ─── Color & style helpers ───
const biasColor = { bullish: '#52c41a', bearish: '#ff4d4f', neutral: '#faad14' };
const biasTag = { bullish: 'green', bearish: 'red', neutral: 'gold' };
const signalColor = { favorable: 'green', caution: 'orange', neutral: 'default' };
const iconForLabel = {
  'NEPSE Index': <RiseOutlined />,
  'Fixed Deposit': <BankOutlined />,
  'Gold': <DollarOutlined />,
  'Silver': <SafetyCertificateOutlined />,
};

const MIN_DATE = dayjs('2020-01-01');

// ═══════════════════════════════════════════════════════════════════
// MACRO PULSE TAB
// ═══════════════════════════════════════════════════════════════════
function MacroPulse() {
  const queryClient = useQueryClient();
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['economy-macro'],
    queryFn: () => getEconomyMacro().then(r => r.data),
    staleTime: 60 * 60 * 1000,
    retry: false,
  });

  const scrapeMutation = useMutation({
    mutationFn: triggerEconomyScrape,
    onSuccess: () => {
      message.success('Macro data refreshed successfully');
      queryClient.invalidateQueries({ queryKey: ['economy-macro'] });
    },
    onError: (e) => message.error(e?.response?.data?.detail || 'Scrape failed'),
  });

  if (isLoading) return <div style={{ textAlign: 'center', padding: 80 }}><Spin size="large" tip="Loading macro data..." /></div>;

  if (isError || !data) {
    const is404 = error?.response?.status === 404;
    return (
      <Alert
        type={is404 ? 'info' : 'error'}
        showIcon
        message={is404 ? 'No Macro Data Yet' : 'Failed to Load'}
        description={is404
          ? 'Click the Refresh button to scrape the latest macroeconomic indicators from NepseAlpha.'
          : (error?.response?.data?.detail || 'An unexpected error occurred.')
        }
        action={
          <Button icon={<ReloadOutlined />} loading={scrapeMutation.isPending} onClick={() => scrapeMutation.mutate()}>
            Refresh Data
          </Button>
        }
        style={{ marginBottom: 16 }}
      />
    );
  }

  const { indicators: ind, derived, regime, sector_signals, period_label, raw_indicators } = data;

  // Group raw indicators by category for the full table
  const categoryGroups = {};
  (raw_indicators || []).forEach(ri => {
    const cat = ri.category || 'Other';
    if (!categoryGroups[cat]) categoryGroups[cat] = [];
    categoryGroups[cat].push(ri);
  });

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <Text type="secondary" style={{ fontSize: 13 }}>Data Period</Text>
          <Title level={4} style={{ margin: 0 }}>{period_label}</Title>
        </div>
        <Button icon={<ReloadOutlined />} loading={scrapeMutation.isPending} onClick={() => scrapeMutation.mutate()}>
          Refresh
        </Button>
      </div>

      {/* Regime Banner */}
      <Card
        size="small"
        style={{
          marginBottom: 20,
          borderLeft: `4px solid ${biasColor[regime.bias] || '#888'}`,
          background: 'rgba(255,255,255,0.02)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
          <ThunderboltOutlined style={{ fontSize: 20, color: biasColor[regime.bias] }} />
          <Title level={5} style={{ margin: 0 }}>{regime.label}</Title>
          <Tag color={biasTag[regime.bias]}>{regime.bias.toUpperCase()}</Tag>
        </div>
        <Paragraph style={{ margin: 0, color: 'rgba(255,255,255,0.65)' }}>{regime.description}</Paragraph>
      </Card>

      {/* Real Deposit Return Callout */}
      {derived.real_deposit_return !== null && (
        <Alert
          type={derived.real_deposit_return < 0 ? 'warning' : 'success'}
          showIcon
          icon={derived.real_deposit_return < 0 ? <FallOutlined /> : <ArrowUpOutlined />}
          message={`Real Deposit Return: ${derived.real_deposit_return}%`}
          description={derived.real_deposit_return < 0
            ? 'Fixed deposits are losing purchasing power after inflation. Equities or gold may preserve value better.'
            : 'Fixed deposits are beating inflation — savers retain purchasing power.'
          }
          style={{ marginBottom: 20 }}
        />
      )}

      {/* Rate Environment */}
      <Title level={5} style={{ marginBottom: 12 }}>💰 Rate Environment</Title>
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        {[
          { title: 'Base Rate', key: 'base_rate', suffix: '%' },
          { title: 'Lending Rate', key: 'lending_rate', suffix: '%' },
          { title: 'Deposit Rate', key: 'deposit_rate', suffix: '%' },
          { title: 'Interbank Rate', key: 'interbank_rate', suffix: '%' },
          { title: '91-day T-Bill', key: 'tbill_91', suffix: '%' },
        ].map(item => (
          <Col xs={12} sm={8} md={4} key={item.key}>
            <Card size="small">
              <Statistic
                title={item.title}
                value={ind[item.key] ?? '—'}
                suffix={ind[item.key] != null ? item.suffix : ''}
                precision={2}
                valueStyle={{ fontSize: 18 }}
              />
            </Card>
          </Col>
        ))}
      </Row>

      {/* Monetary + Growth */}
      <Title level={5} style={{ marginBottom: 12 }}>📊 Monetary & Growth</Title>
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        {[
          { title: 'CPI (YoY)', key: 'cpi_yoy', suffix: '%' },
          { title: 'M2 Growth', key: 'm2_growth', suffix: '%' },
          { title: 'Private Credit Growth', key: 'private_credit_growth', suffix: '%' },
          { title: 'Market Cap / GDP', key: 'market_cap_gdp', suffix: '%' },
          { title: 'Real GDP Growth', key: 'real_gdp_growth', suffix: '%' },
        ].map(item => (
          <Col xs={12} sm={8} md={4} key={item.key}>
            <Card size="small">
              <Statistic
                title={item.title}
                value={ind[item.key] ?? '—'}
                suffix={ind[item.key] != null ? item.suffix : ''}
                precision={2}
                valueStyle={{ fontSize: 18 }}
              />
            </Card>
          </Col>
        ))}
      </Row>

      {/* External Sector & Public Finance */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} md={12}>
          <Title level={5}>🌐 External Sector</Title>
          <Card size="small">
            <Row gutter={[12, 8]}>
              {[
                { title: 'Remittances', key: 'remittance_inflow', suffix: 'B' },
                { title: 'Forex Reserves (USD)', key: 'forex_reserves_usd', suffix: 'M' },
                { title: 'Import Growth', key: 'import_growth', suffix: '%' },
                { title: 'Export Growth', key: 'export_growth', suffix: '%' },
              ].map(item => (
                <Col span={12} key={item.key}>
                  <Statistic
                    title={item.title}
                    value={ind[item.key] ?? '—'}
                    suffix={ind[item.key] != null ? item.suffix : ''}
                    precision={2}
                    valueStyle={{ fontSize: 16 }}
                  />
                </Col>
              ))}
            </Row>
          </Card>
        </Col>
        <Col xs={24} md={12}>
          <Title level={5}>🏛️ Public Finance</Title>
          <Card size="small">
            <Row gutter={[12, 8]}>
              {[
                { title: 'Revenue Growth', key: 'revenue_growth', suffix: '%' },
                { title: 'Capex / GDP', key: 'capex_gdp', suffix: '%' },
                { title: 'Revenue / GDP', key: 'revenue_gdp', suffix: '%' },
                { title: 'Expenditure Growth', key: 'expenditure_growth', suffix: '%' },
              ].map(item => (
                <Col span={12} key={item.key}>
                  <Statistic
                    title={item.title}
                    value={ind[item.key] ?? '—'}
                    suffix={ind[item.key] != null ? item.suffix : ''}
                    precision={2}
                    valueStyle={{ fontSize: 16 }}
                  />
                </Col>
              ))}
            </Row>
          </Card>
        </Col>
      </Row>

      {/* Sector Signals */}
      <Title level={5} style={{ marginBottom: 12 }}>🎯 Sector Signals</Title>
      <Table
        dataSource={sector_signals}
        rowKey="sector"
        pagination={false}
        size="small"
        style={{ marginBottom: 24 }}
        columns={[
          {
            title: 'Sector',
            dataIndex: 'sector',
            key: 'sector',
            render: (text) => <Text strong>{text}</Text>,
          },
          {
            title: 'Signal',
            dataIndex: 'signal',
            key: 'signal',
            render: (signal) => <Tag color={signalColor[signal]}>{signal.toUpperCase()}</Tag>,
          },
          {
            title: 'Symbols',
            dataIndex: 'symbols',
            key: 'symbols',
            render: (symbols) => symbols.map(s => <Tag key={s} style={{ fontSize: 11 }}>{s}</Tag>),
          },
          {
            title: 'Note',
            dataIndex: 'note',
            key: 'note',
            render: (note) => <Text type="secondary" style={{ fontSize: 12 }}>{note}</Text>,
          },
        ]}
      />

      {/* Full Indicators by Category */}
      <Divider />
      <Title level={5} style={{ marginBottom: 12 }}>📋 All Indicators by Category</Title>
      {Object.entries(categoryGroups).map(([category, items]) => (
        <div key={category} style={{ marginBottom: 16 }}>
          <Text strong style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)' }}>{category}</Text>
          <Table
            dataSource={items}
            rowKey={(r) => `${r.name}-${r.category}`}
            pagination={false}
            size="small"
            style={{ marginTop: 4 }}
            columns={[
              { title: 'Indicator', dataIndex: 'name', key: 'name', render: (t) => <Text style={{ fontSize: 12 }}>{t}</Text> },
              { title: 'Value', dataIndex: 'value', key: 'value', align: 'right',
                render: (v) => v != null ? <Text strong>{typeof v === 'number' ? v.toLocaleString(undefined, { maximumFractionDigits: 2 }) : v}</Text> : <Text type="secondary">—</Text>
              },
            ]}
          />
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// ALTERNATIVES COMPARISON TAB
// ═══════════════════════════════════════════════════════════════════
function AlternativesComparison() {
  const [principal, setPrincipal] = useState(100000);
  const [startDate, setStartDate] = useState(MIN_DATE);
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleCompare = async () => {
    if (!principal || !startDate) {
      message.warning('Please enter both a principal amount and a start date.');
      return;
    }
    setLoading(true);
    try {
      const res = await getEconomyAlternatives(principal, startDate.format('YYYY-MM-DD'));
      setResults(res.data);
    } catch (e) {
      message.error(e?.response?.data?.detail || 'Failed to fetch comparison data');
    } finally {
      setLoading(false);
    }
  };

  const maxAmount = results?.results?.length > 0 ? results.results[0].final_amount : 0;

  // Find equity and FD for contextual note
  const nepseResult = results?.results?.find(r => r.label === 'NEPSE Index');
  const fdResult = results?.results?.find(r => r.label === 'Fixed Deposit');
  const equityBeatFD = nepseResult && fdResult && nepseResult.final_amount > fdResult.final_amount;

  return (
    <div>
      <Paragraph type="secondary" style={{ marginBottom: 20 }}>
        Enter a principal amount and a starting date to see how your money would have performed
        across NEPSE, Fixed Deposit, Gold, and Silver.
      </Paragraph>

      {/* Input area */}
      <Card size="small" style={{ marginBottom: 24 }}>
        <Row gutter={[16, 16]} align="middle">
          <Col xs={24} sm={8}>
            <Text type="secondary" style={{ display: 'block', marginBottom: 4, fontSize: 12 }}>Principal (NPR)</Text>
            <InputNumber
              style={{ width: '100%' }}
              value={principal}
              onChange={setPrincipal}
              min={1000}
              max={50000000}
              step={10000}
              formatter={v => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
              parser={v => v.replace(/,/g, '')}
              size="large"
            />
          </Col>
          <Col xs={24} sm={8}>
            <Text type="secondary" style={{ display: 'block', marginBottom: 4, fontSize: 12 }}>Start Date</Text>
            <DatePicker
              style={{ width: '100%' }}
              value={startDate}
              onChange={setStartDate}
              disabledDate={(current) => current && (current < MIN_DATE || current > dayjs())}
              defaultPickerValue={MIN_DATE}
              size="large"
            />
          </Col>
          <Col xs={24} sm={8}>
            <Text type="secondary" style={{ display: 'block', marginBottom: 4, fontSize: 12 }}>&nbsp;</Text>
            <Button
              type="primary"
              size="large"
              onClick={handleCompare}
              loading={loading}
              icon={<RiseOutlined />}
              style={{ width: '100%' }}
            >
              Compare
            </Button>
          </Col>
        </Row>
      </Card>

      {/* Results */}
      {loading && <div style={{ textAlign: 'center', padding: 40 }}><Spin size="large" /></div>}

      {results && results.results && results.results.length > 0 && !loading && (
        <div>
          <Row gutter={[16, 16]}>
            {results.results.map((r, idx) => {
              const isWinner = r.is_winner;
              const returnPositive = r.total_return_pct >= 0;
              const barWidth = maxAmount > 0 ? Math.max((r.final_amount / maxAmount) * 100, 5) : 100;

              return (
                <Col xs={24} key={r.label}>
                  <Card
                    size="small"
                    style={{
                      border: isWinner ? '2px solid #52c41a' : '1px solid rgba(255,255,255,0.08)',
                      background: isWinner ? 'rgba(82, 196, 26, 0.04)' : undefined,
                    }}
                  >
                    <Row align="middle" gutter={[16, 8]}>
                      <Col xs={24} sm={6}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          {isWinner && <TrophyOutlined style={{ color: '#faad14', fontSize: 20 }} />}
                          <div>
                            <Text strong style={{ fontSize: 15 }}>{iconForLabel[r.label]} {r.label}</Text>
                            {r.note && <div><Text type="secondary" style={{ fontSize: 10 }}>{r.note}</Text></div>}
                          </div>
                        </div>
                      </Col>
                      <Col xs={24} sm={10}>
                        <Progress
                          percent={barWidth}
                          showInfo={false}
                          strokeColor={isWinner ? '#52c41a' : returnPositive ? '#1677ff' : '#ff4d4f'}
                          trailColor="rgba(255,255,255,0.06)"
                          size={['100%', 20]}
                        />
                      </Col>
                      <Col xs={12} sm={4} style={{ textAlign: 'right' }}>
                        <Statistic
                          title="Final Amount"
                          value={r.final_amount}
                          prefix="Rs."
                          precision={0}
                          valueStyle={{ fontSize: 16, color: isWinner ? '#52c41a' : undefined }}
                        />
                      </Col>
                      <Col xs={12} sm={4} style={{ textAlign: 'right' }}>
                        <Statistic
                          title="Total Return"
                          value={r.total_return_pct}
                          suffix="%"
                          precision={1}
                          valueStyle={{ fontSize: 14, color: returnPositive ? '#52c41a' : '#ff4d4f' }}
                          prefix={returnPositive ? <ArrowUpOutlined /> : <ArrowDownOutlined />}
                        />
                        <Text type="secondary" style={{ fontSize: 11 }}>
                          CAGR: {r.annualized_return_pct}% · {r.years_held}y
                        </Text>
                      </Col>
                    </Row>
                  </Card>
                </Col>
              );
            })}
          </Row>

          {/* Contextual note */}
          {equityBeatFD && (
            <Alert
              type="info"
              showIcon
              icon={<RiseOutlined />}
              message="Equity Outperformed FD"
              description={`NEPSE index investment returned Rs. ${(nepseResult.final_amount - fdResult.final_amount).toLocaleString(undefined, { maximumFractionDigits: 0 })} more than a fixed deposit over this period.`}
              style={{ marginTop: 16 }}
            />
          )}
        </div>
      )}

      {results && results.results && results.results.length === 0 && !loading && (
        <Alert type="warning" showIcon message="No data available for the selected date range." style={{ marginTop: 16 }} />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// MAIN ECONOMY PAGE
// ═══════════════════════════════════════════════════════════════════
export default function Economy() {
  return (
    <div style={{ maxWidth: 1200 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
        <GlobalOutlined style={{ fontSize: 24, color: '#1677ff' }} />
        <Title level={3} style={{ margin: 0 }}>Economy & Alternatives</Title>
      </div>

      <Tabs
        defaultActiveKey="macro"
        items={[
          {
            key: 'macro',
            label: '📊 Macro Pulse',
            children: <MacroPulse />,
          },
          {
            key: 'alternatives',
            label: '⚖️ Alternatives Comparison',
            children: <AlternativesComparison />,
          },
        ]}
      />
    </div>
  );
}
