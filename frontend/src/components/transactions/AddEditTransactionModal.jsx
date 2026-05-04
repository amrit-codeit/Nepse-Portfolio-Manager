import React, { useEffect } from 'react';
import { Modal, Form, Select, Space, InputNumber, Button, DatePicker, Input, message } from 'antd';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { createTransaction, updateTransaction, getIssuePrice } from '../../services/api';

const TXN_TYPES = [
    { value: 'BUY', label: 'Buy' },
    { value: 'SELL', label: 'Sell' },
    { value: 'IPO', label: 'IPO' },
    { value: 'FPO', label: 'FPO' },
    { value: 'BONUS', label: 'Bonus' },
    { value: 'RIGHT', label: 'Right' },
    { value: 'AUCTION', label: 'Auction' },
    { value: 'TRANSFER_IN', label: 'Transfer In' },
    { value: 'TRANSFER_OUT', label: 'Transfer Out' },
    { value: 'MERGE', label: 'Merge' },
];

export default function AddEditTransactionModal({ 
    open, 
    onClose, 
    editingTxn, 
    members, 
    companiesData, 
    activeTab 
}) {
    const [form] = Form.useForm();
    const queryClient = useQueryClient();

    useEffect(() => {
        if (open) {
            if (editingTxn) {
                form.setFieldsValue({
                    member_id: editingTxn.member_id,
                    symbol: editingTxn.symbol,
                    txn_type: editingTxn.txn_type,
                    quantity: editingTxn.quantity,
                    rate: editingTxn.rate,
                    dp_charge: editingTxn.dp_charge,
                    broker_commission: editingTxn.broker_commission,
                    sebon_fee: editingTxn.sebon_fee,
                    cgt: editingTxn.cgt,
                    txn_date: editingTxn.txn_date ? dayjs(editingTxn.txn_date) : null,
                    remarks: editingTxn.remarks,
                });
            } else {
                form.resetFields();
            }
        }
    }, [open, editingTxn, form]);

    const addMutation = useMutation({
        mutationFn: createTransaction,
        onSuccess: () => {
            message.success('Transaction added');
            queryClient.invalidateQueries({ queryKey: ['transactions'] });
            queryClient.invalidateQueries({ queryKey: ['holdings'] });
            queryClient.invalidateQueries({ queryKey: ['portfolio-summary'] });
            onClose();
        },
        onError: (err) => message.error(err.response?.data?.detail || 'Failed to add transaction'),
    });

    const updateMutation = useMutation({
        mutationFn: ({ id, data }) => updateTransaction(id, data),
        onSuccess: () => {
            message.success('Transaction updated');
            queryClient.invalidateQueries({ queryKey: ['transactions'] });
            queryClient.invalidateQueries({ queryKey: ['holdings'] });
            queryClient.invalidateQueries({ queryKey: ['portfolio-summary'] });
            onClose();
        },
        onError: (err) => message.error(err.response?.data?.detail || 'Failed to update transaction'),
    });

    const handleFetchIssuePrice = async () => {
        const symbol = form.getFieldValue('symbol');
        const currentType = form.getFieldValue('txn_type');
        
        if (currentType === 'BONUS') {
            form.setFieldsValue({ rate: 0, dp_charge: 0 });
            message.info('Bonus shares are treated as Rs. 0 cost by default.');
            return;
        }

        if (!symbol) {
            message.warning('Please select a symbol first');
            return;
        }

        try {
            const res = await getIssuePrice(symbol, currentType);
            if (res.data && res.data.price) {
                const fetchedType = res.data.type;
                const updates = { rate: res.data.price };
                
                if (!currentType || (!['IPO', 'RIGHT', 'FPO'].includes(currentType) && !editingTxn)) {
                    updates.txn_type = fetchedType;
                }
                
                form.setFieldsValue(updates);
                message.success(`Fetched ${fetchedType} price for ${symbol}: Rs. ${res.data.price}`);
            } else {
                message.info(`No stored ${currentType || 'issue'} price found for ${symbol}`);
            }
        } catch (err) {
            message.error('Failed to fetch issue price');
        }
    };

    const handleValuesChange = (changedValues, allValues) => {
        if (changedValues.txn_type) {
            const type = changedValues.txn_type;
            if (['IPO', 'RIGHT', 'FPO'].includes(type) && (!allValues.rate || allValues.rate === 0)) {
                form.setFieldsValue({ rate: 100 });
            }
            if (type === 'BONUS') {
                if (!allValues.rate || allValues.rate === 100) {
                    form.setFieldsValue({ rate: 0 });
                }
                form.setFieldsValue({ dp_charge: 0 });
            }

            if (activeTab === 'equity') {
                if (['IPO', 'FPO', 'RIGHT'].includes(type)) {
                    form.setFieldsValue({ dp_charge: 5 });
                } else if (type === 'BONUS') {
                    form.setFieldsValue({ dp_charge: 0 });
                } else if (type === 'BUY' || type === 'SELL' || type === 'AUCTION') {
                    form.setFieldsValue({ dp_charge: 25 });
                }
            }

            if (['IPO', 'RIGHT', 'FPO'].includes(type) && allValues.symbol) {
                handleFetchIssuePrice();
            }
        }

        if (changedValues.symbol && ['IPO', 'RIGHT', 'FPO'].includes(allValues.txn_type)) {
            handleFetchIssuePrice();
        }
    };

    const handleAddOrUpdate = (values) => {
        const payload = {
            member_id: values.member_id,
            symbol: values.symbol,
            txn_type: values.txn_type,
            quantity: values.quantity,
            rate: values.rate || null,
            txn_date: values.txn_date ? values.txn_date.format('YYYY-MM-DD') : null,
            remarks: values.remarks || null,
            dp_charge: values.dp_charge || null,
            cgt: values.cgt || null,
            broker_commission: activeTab === 'equity' ? (values.broker_commission || null) : 0,
            sebon_fee: activeTab === 'equity' ? (values.sebon_fee || null) : 0,
        };

        if (editingTxn) {
            updateMutation.mutate({ id: editingTxn.id, data: payload });
        } else {
            addMutation.mutate(payload);
        }
    };

    return (
        <Modal
            title={editingTxn ? "Edit Transaction" : "Add Transaction"}
            open={open}
            onCancel={onClose}
            footer={null}
            width={500}
        >
            <Form
                form={form}
                layout="vertical"
                onFinish={handleAddOrUpdate}
                onValuesChange={handleValuesChange}
                style={{ marginTop: 16 }}
            >
                <Form.Item name="member_id" label="Member" rules={[{ required: true }]}>
                    <Select
                        placeholder="Select member"
                        showSearch
                        optionFilterProp="label"
                        options={(members || []).map(m => ({ value: m.id, label: m.name }))}
                    />
                </Form.Item>
                <Form.Item name="symbol" label="Symbol" rules={[{ required: true }]}>
                    <Select
                        placeholder="Search company..."
                        showSearch
                        optionFilterProp="label"
                        options={(companiesData?.companies || []).map(c => ({
                            value: c.symbol,
                            label: `${c.symbol} — ${c.name}`,
                        }))}
                    />
                </Form.Item>
                <Form.Item name="txn_type" label="Transaction Type" rules={[{ required: true }]}>
                    <Select options={TXN_TYPES} disabled={!!editingTxn} />
                </Form.Item>
                <Space style={{ width: '100%' }}>
                    <Form.Item name="quantity" label="Quantity" rules={[{ required: true }]} style={{ flex: 1 }}>
                        <InputNumber style={{ width: '100%' }} min={0} />
                    </Form.Item>
                    <Form.Item name="rate" label="Rate (per unit)" style={{ flex: 1 }}>
                        <div style={{ display: 'flex', gap: 8 }}>
                            <InputNumber style={{ flex: 1 }} min={0} step={0.01} />
                            <Button
                                size="small"
                                onClick={handleFetchIssuePrice}
                                title="Fetch IPO/Right/FPO Price"
                                style={{ height: 32 }}
                            >
                                Fetch
                            </Button>
                        </div>
                    </Form.Item>
                    <Form.Item name="dp_charge" label="DP Fee" style={{ flex: 1 }}>
                        <InputNumber style={{ width: '100%' }} min={0} step={1} />
                    </Form.Item>
                    {activeTab === 'equity' && (
                        <>
                            <Form.Item name="broker_commission" label="Broker Comm." style={{ flex: 1 }}>
                                <InputNumber style={{ width: '100%' }} min={0} step={0.01} />
                            </Form.Item>
                            <Form.Item name="sebon_fee" label="SEBON Fee" style={{ flex: 1 }}>
                                <InputNumber style={{ width: '100%' }} min={0} step={0.01} />
                            </Form.Item>
                        </>
                    )}
                    <Form.Item name="cgt" label="CGT" style={{ flex: 1 }}>
                        <InputNumber style={{ width: '100%' }} min={0} step={0.01} />
                    </Form.Item>
                </Space>
                <Form.Item name="txn_date" label="Date">
                    <DatePicker style={{ width: '100%' }} />
                </Form.Item>
                <Form.Item name="remarks" label="Remarks">
                    <Input.TextArea rows={2} />
                </Form.Item>
                <Form.Item>
                    <Button type="primary" htmlType="submit" loading={addMutation.isPending || updateMutation.isPending} block>
                        {editingTxn ? "Update Transaction" : "Add Transaction"}
                    </Button>
                </Form.Item>
            </Form>
        </Modal>
    );
}
