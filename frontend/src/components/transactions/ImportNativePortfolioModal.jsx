import React, { useState } from 'react';
import { Modal, Upload, Button, message } from 'antd';
import { UploadOutlined } from '@ant-design/icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../services/api';

export default function ImportNativePortfolioModal({ open, onClose, activeTab }) {
    const [importFile, setImportFile] = useState(null);
    const queryClient = useQueryClient();

    const nativeImportMutation = useMutation({
        mutationFn: ({ file }) => {
            const formData = new FormData();
            formData.append('file', file);
            return api.post('/transactions/import-native', formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });
        },
        onSuccess: (res) => {
            message.success(res.data?.message || 'Portfolio CSV Imported Successfully');
            queryClient.invalidateQueries({ queryKey: ['transactions'] });
            queryClient.invalidateQueries({ queryKey: ['holdings'] });
            queryClient.invalidateQueries({ queryKey: ['portfolio-summary'] });
            handleClose();
        },
        onError: (err) => message.error(err.response?.data?.detail || 'Failed to import Portfolio CSV'),
    });

    const handleNativeImportSubmit = () => {
        if (!importFile) {
            message.warning("Please select a file");
            return;
        }
        nativeImportMutation.mutate({ file: importFile });
    };

    const handleClose = () => {
        setImportFile(null);
        onClose();
    };

    return (
        <Modal
            title={activeTab === 'equity' ? 'Import Equity Portfolio Backup' : 'Import SIP Portfolio Backup'}
            open={open}
            onCancel={handleClose}
            onOk={handleNativeImportSubmit}
            confirmLoading={nativeImportMutation.isPending}
            okText="Restore"
        >
            <p>
                Restore your {activeTab === 'equity' ? 'Equity' : 'SIP'} transactions from a CSV backup.
                This will preserve all manual rates, fees, and remarks exactly as they were exported.
            </p>
            <div style={{ marginBottom: 16, marginTop: 16 }}>
                <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>Select Portfolio CSV:</label>
                <Upload
                    beforeUpload={(file) => {
                        setImportFile(file);
                        return false;
                    }}
                    onRemove={() => setImportFile(null)}
                    fileList={importFile ? [importFile] : []}
                    maxCount={1}
                    accept=".csv"
                >
                    <Button icon={<UploadOutlined />}>Select CSV File</Button>
                </Upload>
            </div>
            <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: '0.85rem' }}>
                Note: This will skip transactions that already exist (matched by Date, Symbol, Type, and Quantity).
            </div>
        </Modal>
    );
}
