import { Typography, Card, Space, Divider, Row, Col, List, Tag } from 'antd';
import { 
    InfoCircleOutlined, 
    RocketOutlined, 
    DoubleRightOutlined,
    HistoryOutlined,
    AppstoreOutlined,
    ApiOutlined,
} from '@ant-design/icons';

const { Title, Paragraph, Text } = Typography;

export default function About() {
    return (
        <div className="animate-in" style={{ maxWidth: 900, margin: '0 auto' }}>
            {/* Header / Meta Section */}
            <div className="page-header" style={{ marginBottom: 40, borderBottom: '1px solid var(--border-color)', paddingBottom: 24 }}>
                <Title level={2} style={{ marginBottom: 4 }}>
                    <AppstoreOutlined style={{ marginRight: 12, color: 'var(--accent-primary)' }} />
                    Nepse Portfolio Manager
                </Title>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <Tag color="blue" bordered={false} style={{ borderRadius: 4 }}>v1.0.0-Stable</Tag>
                    <Text type="secondary" style={{ fontSize: 13 }}>Enterprise-grade performance tracking for the Nepali Stock Market.</Text>
                </div>
            </div>

            {/* Brief Overview */}
            <section style={{ marginBottom: 48 }}>
                <Title level={4} style={{ color: 'var(--text-primary)', borderLeft: '4px solid var(--accent-primary)', paddingLeft: 16 }}>
                    Overview
                </Title>
                <Paragraph style={{ fontSize: 15, lineHeight: 1.8, color: 'var(--text-secondary)' }}>
                    Nepse Portfolio Manager is a sophisticated, full-stack application designed to provide institutional-level analytics for individual investors in the Nepal Stock Exchange (NEPSE). It integrates automated data collection, complex financial modeling, and AI-driven insights to offer a 360-degree view of portfolio health across multiple family members.
                </Paragraph>
            </section>

            <Row gutter={[24, 24]}>
                {/* Core Features Section */}
                <Col xs={24} md={14}>
                    <Title level={4} style={{ borderLeft: '4px solid var(--accent-green)', paddingLeft: 16 }}>
                        Core Features
                    </Title>
                    <List
                        split={false}
                        dataSource={[
                            { title: 'Multi-Member Governance', desc: 'Consolidated tracking for multiple family portfolios with isolated or group-level reporting.' },
                            { title: 'True WACC & Alpha Engine', desc: 'Cash-flow based XIRR calculation and performance benchmarking against the NEPSE Index.' },
                            { title: 'Risk Intelligence Suite', desc: 'Real-time monitoring of NPL, CAR, and Graham Values with automated sector-specific flags.' },
                            { title: 'MeroShare Automation', desc: 'Selenium-driven synchronization of transaction history and automated IPO application bot.' },
                            { title: 'Data Sovereignty', desc: 'Privacy-focused local SQLite architecture with multi-layer credential encryption (Fernet).' },
                        ]}
                        renderItem={(item) => (
                            <List.Item style={{ border: '1px solid var(--border-color)', borderRadius: 12, padding: 20, marginBottom: 16, background: 'var(--bg-secondary)' }}>
                                <List.Item.Meta
                                    title={<Text strong style={{ color: 'var(--accent-primary)', fontSize: 15 }}><DoubleRightOutlined style={{ fontSize: 12 }} /> {item.title}</Text>}
                                    description={<Text style={{ color: 'var(--text-secondary)', display: 'block', marginTop: 4 }}>{item.desc}</Text>}
                                />
                            </List.Item>
                        )}
                    />
                </Col>

                {/* Update Logs Section */}
                <Col xs={24} md={10}>
                    <Title level={4} style={{ borderLeft: '4px solid var(--accent-blue)', paddingLeft: 16 }}>
                        Update Logs
                    </Title>
                    <Card style={{ borderRadius: 12, background: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }} bodyStyle={{ padding: 20 }}>
                        <List
                            size="small"
                            dataSource={[
                                { date: 'Apr 06, 2026', version: 'v1.0.0', msg: 'Production Stable Release. Integrated Value-Risk Matrix.' },
                                { date: 'Apr 06, 2026', version: 'v0.9.8', msg: 'Optimized Benchmarking engine; fixed XIRR N+1 bottleneck.' },
                                { date: 'Apr 01, 2026', version: 'v0.9.5', msg: 'Complete data audit and credential security hardening.' },
                                { date: 'Mar 25, 2026', version: 'v0.9.0', msg: 'Beta testing of MeroShare Selenium bridge.' },
                            ]}
                            renderItem={(item) => (
                                <List.Item style={{ borderBottom: '1px solid var(--border-color)', padding: '12px 0' }}>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <HistoryOutlined style={{ fontSize: 11, color: 'var(--text-muted)' }} />
                                            <Text strong style={{ fontSize: 12 }}>{item.date}</Text>
                                            <Tag color="default" style={{ fontSize: 10, margin: 0 }}>{item.version}</Tag>
                                        </div>
                                        <Text style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{item.msg}</Text>
                                    </div>
                                </List.Item>
                            )}
                        />
                    </Card>

                    <Card style={{ marginTop: 24, borderRadius: 12, background: 'rgba(129, 140, 248, 0.03)', border: '1px dashed var(--accent-primary)' }}>
                        <Space direction="vertical" size={4}>
                            <Title level={5} style={{ margin: 0, fontSize: 14 }}>
                                <ApiOutlined /> Support Information
                            </Title>
                            <Text type="secondary" style={{ fontSize: 12 }}>
                                This system is for private use. Ensure your local deepseek instance is running for strategy reviews.
                            </Text>
                        </Space>
                    </Card>
                </Col>
            </Row>

            <div style={{ textAlign: 'center', marginTop: 64, paddingBottom: 48 }}>
                <Divider style={{ borderColor: 'var(--border-color)' }} />
                <Text type="secondary" style={{ fontSize: 12 }}>
                    Nepse Portfolio Manager &copy; 2026 • Optimized for Nepali Markets
                </Text>
            </div>
        </div>
    );
}
