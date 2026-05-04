import React, { useState } from 'react';
import { Modal, Select, Upload, Button, message } from 'antd';
import { UploadOutlined } from '@ant-design/icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { uploadHistory } from '../../services/api';

export default function ImportMeroShareModal({ open, onClose, members }) {
    const [importFile, setImportFile] = useState(null);
    const [importMemberId, setImportMemberId] = useState(null);
    const queryClient = useQueryClient();

    const uploadMutation = useMutation({
        mutationFn: ({ memberId, file }) => uploadHistory(memberId, file),
        onSuccess: (res) => {
            message.success(res.data?.message || 'CSV Imported Successfully');
            queryClient.invalidateQueries({ queryKey: ['transactions'] });
            queryClient.invalidateQueries({ queryKey: ['holdings'] });
            queryClient.invalidateQueries({ queryKey: ['portfolio-summary'] });
            handleClose();
        },
        onError: (err) => message.error(err.response?.data?.detail || 'Failed to import CSV'),
    });

    const handleImportSubmit = () => {
        if (!importMemberId) {
            message.warning("Please select a member");
            return;
        }
        if (!importFile) {
            message.warning("Please select a file");
            return;
        }
        uploadMutation.mutate({ memberId: importMemberId, file: importFile });
    };

    const handleClose = () => {
        setImportFile(null);
        setImportMemberId(null);
        onClose();
    };

    return (
        <Modal
            title="Import MeroShare Transactions CSV"
            open={open}
            onCancel={handleClose}
            onOk={handleImportSubmit}
            confirmLoading={uploadMutation.isPending}
            okText="Import"
        >
            <p>Select a member and upload their exported MeroShare history CSV to automatically import transactions.</p>
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
                <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>CSV File:</label>
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
        </Modal>
    );
}
