import React, { useState } from 'react';
import { Modal, Select, Upload, Button, message } from 'antd';
import { UploadOutlined } from '@ant-design/icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { uploadDpStatement } from '../../services/api';

export default function ImportDpStatementModal({ open, onClose, members, pricesData }) {
    const [importFile, setImportFile] = useState(null);
    const [importMemberId, setImportMemberId] = useState(null);
    const [importDpFormat, setImportDpFormat] = useState('NIBLSF');
    const [importDpSymbol, setImportDpSymbol] = useState(null);
    const queryClient = useQueryClient();

    const uploadDpMutation = useMutation({
        mutationFn: ({ memberId, symbol, format, file }) => uploadDpStatement(memberId, symbol, format, file),
        onSuccess: (res) => {
            message.success(res.data?.message || 'DP Statement Imported Successfully');
            queryClient.invalidateQueries({ queryKey: ['transactions'] });
            queryClient.invalidateQueries({ queryKey: ['holdings'] });
            queryClient.invalidateQueries({ queryKey: ['portfolio-summary'] });
            handleClose();
        },
        onError: (err) => message.error(err.response?.data?.detail || 'Failed to import DP Statement'),
    });

    const handleDpImportSubmit = () => {
        if (!importMemberId) {
            message.warning("Please select a member");
            return;
        }
        if (!importDpSymbol) {
            message.warning("Please select a symbol");
            return;
        }
        if (!importFile) {
            message.warning("Please select a file");
            return;
        }
        uploadDpMutation.mutate({ memberId: importMemberId, symbol: importDpSymbol, format: importDpFormat, file: importFile });
    };

    const handleClose = () => {
        setImportFile(null);
        setImportMemberId(null);
        setImportDpSymbol(null);
        setImportDpFormat('NIBLSF');
        onClose();
    };

    return (
        <Modal
            title="Import SIP DP Statement"
            open={open}
            onCancel={handleClose}
            onOk={handleDpImportSubmit}
            confirmLoading={uploadDpMutation.isPending}
            okText="Import DP Statement"
        >
            <p>Reconcile SIPs with official DP Statements to get exact dates, NAVs, and DP charges.</p>
            <div style={{ marginBottom: 16, marginTop: 16 }}>
                <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>Select Member:</label>
                <Select
                    placeholder="Select Member"
                    showSearch
                    optionFilterProp="label"
                    style={{ width: '100%' }}
                    onChange={setImportMemberId}
                    value={importMemberId}
                    options={(members || []).map(m => ({ value: m.id, label: m.name }))}
                />
            </div>
            <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>Select Symbol:</label>
                <Select
                    placeholder="Search SIP/Mutual Fund..."
                    showSearch
                    optionFilterProp="label"
                    style={{ width: '100%' }}
                    onChange={setImportDpSymbol}
                    value={importDpSymbol}
                    options={(pricesData || []).map(p => ({
                        value: p.symbol,
                        label: `${p.symbol} — ${p.name}`,
                    }))}
                />
            </div>
            <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>DP Format:</label>
                <Select
                    style={{ width: '100%' }}
                    value={importDpFormat}
                    onChange={setImportDpFormat}
                    options={[
                        { value: 'NIBLSF', label: 'NIBLSF (CSV Format)' },
                        { value: 'NMBSBFE', label: 'NMBSBFE (PDF Format)' },
                        { value: 'NEW_NI31', label: 'NI31 (Excel Format)' }
                    ]}
                />
            </div>
            <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>
                    Statement File ({importDpFormat === 'NIBLSF' ? 'CSV' : importDpFormat === 'NEW_NI31' ? 'XLSX' : 'PDF'}):
                </label>
                <Upload
                    beforeUpload={(file) => {
                        setImportFile(file);
                        return false;
                    }}
                    onRemove={() => setImportFile(null)}
                    fileList={importFile ? [importFile] : []}
                    maxCount={1}
                    accept={importDpFormat === 'NIBLSF' ? ".csv" : importDpFormat === 'NEW_NI31' ? ".xlsx" : ".pdf"}
                >
                    <Button icon={<UploadOutlined />}>Select File</Button>
                </Upload>
            </div>
        </Modal>
    );
}
