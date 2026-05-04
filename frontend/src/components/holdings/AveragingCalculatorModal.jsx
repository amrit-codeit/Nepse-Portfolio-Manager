import React, { useState } from 'react';
import { Modal, Form, InputNumber, Row, Col, Typography, Divider, Alert } from 'antd';
import { CalculatorOutlined, WarningOutlined } from '@ant-design/icons';

const { Text } = Typography;

export default function AveragingCalculatorModal({ visible, onCancel, holding }) {
    const [form] = Form.useForm();
    const [results, setResults] = useState(null);

    const onValuesChange = (_, allValues) => {
        if (!holding) return;
        const newQty = allValues.qty || 0;
        const newRate = allValues.rate || 0;
        
        const totalQty = holding.current_qty + newQty;
        const totalInvestment = holding.total_investment + (newQty * newRate);
        const newWacc = totalInvestment / totalQty;
        
        // Calculate New YoC (assuming dividend amount per share remains constant)
        const dps = holding.yoc ? (holding.yoc * holding.wacc / 100) : 0;
        const newYoC = newWacc > 0 ? (dps / newWacc * 100) : 0;
        
        setResults({
            newWacc,
            totalQty,
            totalValue: totalQty * (holding.ltp || newRate),
            newYoC,
            waccReduction: holding.wacc - newWacc,
            newRate
        });
    };

    if (!holding) return null;

    const isOvervalued = holding.graham_number && (results?.newRate || holding.ltp) > holding.graham_number;

    return (
        <Modal
            title={<><CalculatorOutlined /> Averaging Down Calculator: {holding.symbol}</>}
            open={visible}
            onCancel={onCancel}
            footer={null}
            width={450}
        >
            <Alert 
                type={holding.is_fundamental_risk ? "error" : "info"}
                showIcon
                message={holding.is_fundamental_risk ? "High Fundamental Risk!" : "Graham Analysis"}
                description={
                    holding.is_fundamental_risk 
                    ? `Sector-specific risks detected (NPL/Reserves). Adding more might be risky.`
                    : `Fair Value (Graham): Rs. ${holding.graham_number?.toFixed(3) || 'N/A'}`
                }
                style={{ marginBottom: 20 }}
            />

            {isOvervalued && (
                <Alert 
                    type="warning"
                    showIcon
                    icon={<WarningOutlined />}
                    message="Overvaluation Warning"
                    description="Current price is above Graham's Number. You are averaging up in a premium zone."
                    style={{ marginBottom: 20 }}
                />
            )}

            <Form form={form} layout="vertical" onValuesChange={onValuesChange}>
                <Row gutter={16}>
                    <Col span={12}>
                        <Form.Item label="Quantity to Buy" name="qty">
                            <InputNumber style={{ width: '100%' }} min={1} placeholder="Units" />
                        </Form.Item>
                    </Col>
                    <Col span={12}>
                        <Form.Item label="At Rate" name="rate">
                            <InputNumber style={{ width: '100%' }} min={1} placeholder="Price" defaultValue={holding.ltp} />
                        </Form.Item>
                    </Col>
                </Row>
            </Form>

            {results && (
                <div style={{ background: 'rgba(255,255,255,0.03)', padding: 20, borderRadius: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                        <Text type="secondary">New WACC</Text>
                        <Text strong style={{ fontSize: 18, color: 'var(--accent-secondary)' }}>
                            Rs. {results.newWacc.toFixed(3)}
                            {results.waccReduction > 0 && (
                                <Text style={{ fontSize: 12, color: 'var(--accent-green)', marginLeft: 8 }}>
                                    (-{results.waccReduction.toFixed(3)})
                                </Text>
                            )}
                        </Text>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                        <Text type="secondary">New Projected YoC</Text>
                        <Text strong style={{ color: 'var(--accent-primary)' }}>{results.newYoC.toFixed(3)}%</Text>
                    </div>
                    <Divider style={{ margin: '12px 0' }} />
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <Text type="secondary">Total Quantity</Text>
                        <Text strong>{results.totalQty}</Text>
                    </div>
                </div>
            )}
        </Modal>
    );
}
