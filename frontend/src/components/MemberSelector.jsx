import { useState, useEffect } from 'react';
import { Modal, Input, Checkbox, Button, message, Tooltip } from 'antd';
import {
    TeamOutlined,
    UserOutlined,
    GroupOutlined,
    PlusOutlined,
    EditOutlined,
    DeleteOutlined,
    CloseOutlined,
} from '@ant-design/icons';

const STORAGE_KEY = 'portfolio_groups';

function loadGroups() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch {
        return [];
    }
}

function saveGroups(groups) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(groups));
}

/**
 * GroupModal — create/edit a member group.
 */
function GroupModal({ open, onClose, onSave, members, editGroup }) {
    const [name, setName] = useState('');
    const [selectedIds, setSelectedIds] = useState([]);

    useEffect(() => {
        if (editGroup) {
            setName(editGroup.name);
            setSelectedIds(editGroup.memberIds);
        } else {
            setName('');
            setSelectedIds([]);
        }
    }, [editGroup, open]);

    const handleSave = () => {
        if (!name.trim()) return message.error('Group name is required');
        if (selectedIds.length < 1) return message.error('Select at least 1 member');
        onSave({ name: name.trim(), memberIds: selectedIds });
        onClose();
    };

    return (
        <Modal
            title={editGroup ? 'Edit Group' : 'New Group'}
            open={open}
            onCancel={onClose}
            onOk={handleSave}
            okText="Save"
        >
            <Input
                placeholder="Group name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                style={{ marginBottom: 16 }}
            />
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>
                Select members:
            </div>
            <Checkbox.Group
                value={selectedIds}
                onChange={setSelectedIds}
                style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
            >
                {(members || []).map(m => (
                    <Checkbox key={m.id} value={m.id}>
                        {m.display_name || m.name}
                    </Checkbox>
                ))}
            </Checkbox.Group>
        </Modal>
    );
}

/**
 * MemberSelector — three-mode horizontal selector: All / Individual / Groups.
 * Outputs: { type: 'all'|'member'|'group', id: null|memberId|groupId, memberIds: [] }
 */
export default function MemberSelector({ members = [], onChange }) {
    const [mode, setMode] = useState('all'); // 'all' | 'individual' | 'groups'
    const [selectedId, setSelectedId] = useState(null);
    const [groups, setGroups] = useState(loadGroups);
    const [modalOpen, setModalOpen] = useState(false);
    const [editGroup, setEditGroup] = useState(null);

    // Emit context change
    const emit = (type, id, memberIds = []) => {
        onChange?.({ type, id, memberIds });
    };

    const handleModeChange = (newMode) => {
        setMode(newMode);
        setSelectedId(null);
        if (newMode === 'all') {
            emit('all', null, []);
        }
    };

    const handleMemberClick = (id) => {
        setSelectedId(id);
        emit('member', id, [id]);
    };

    const handleGroupClick = (group) => {
        setSelectedId(group.id);
        emit('group', group.id, group.memberIds);
    };

    const handleGroupSave = (data) => {
        let updated;
        if (editGroup) {
            updated = groups.map(g =>
                g.id === editGroup.id ? { ...g, name: data.name, memberIds: data.memberIds } : g
            );
        } else {
            const newGroup = {
                id: `grp_${Date.now()}`,
                name: data.name,
                memberIds: data.memberIds,
                createdAt: new Date().toISOString(),
            };
            updated = [...groups, newGroup];
        }
        setGroups(updated);
        saveGroups(updated);
        setEditGroup(null);
    };

    const handleGroupDelete = (groupId) => {
        const updated = groups.filter(g => g.id !== groupId);
        setGroups(updated);
        saveGroups(updated);
        if (selectedId === groupId) {
            setSelectedId(null);
            emit('all', null, []);
            setMode('all');
        }
    };

    return (
        <div>
            {/* Mode Toggle */}
            <div className="mode-toggle">
                <div
                    className={`mode-chip ${mode === 'all' ? 'active' : ''}`}
                    onClick={() => handleModeChange('all')}
                >
                    <TeamOutlined /> All Members
                </div>
                <div
                    className={`mode-chip ${mode === 'individual' ? 'active' : ''}`}
                    onClick={() => handleModeChange('individual')}
                >
                    <UserOutlined /> Individual
                </div>
                <div
                    className={`mode-chip ${mode === 'groups' ? 'active' : ''}`}
                    onClick={() => handleModeChange('groups')}
                >
                    <GroupOutlined /> Groups
                </div>
            </div>

            {/* Individual Member Chips */}
            {mode === 'individual' && (
                <div className="member-selector" style={{ marginTop: 12 }}>
                    {members.map(m => (
                        <div
                            key={m.id}
                            className={`member-chip ${selectedId === m.id ? 'active' : ''}`}
                            onClick={() => handleMemberClick(m.id)}
                        >
                            {m.display_name || m.name}
                        </div>
                    ))}
                </div>
            )}

            {/* Group Chips */}
            {mode === 'groups' && (
                <div className="member-selector" style={{ marginTop: 12 }}>
                    {groups.map(g => (
                        <div
                            key={g.id}
                            className={`group-chip ${selectedId === g.id ? 'active' : ''}`}
                            onClick={() => handleGroupClick(g)}
                        >
                            <span>{g.name}</span>
                            <span className="group-chip-actions">
                                <Tooltip title="Edit">
                                    <EditOutlined
                                        onClick={(e) => { e.stopPropagation(); setEditGroup(g); setModalOpen(true); }}
                                        style={{ fontSize: 11 }}
                                    />
                                </Tooltip>
                                <Tooltip title="Delete">
                                    <DeleteOutlined
                                        onClick={(e) => { e.stopPropagation(); handleGroupDelete(g.id); }}
                                        style={{ fontSize: 11 }}
                                    />
                                </Tooltip>
                            </span>
                        </div>
                    ))}
                    <div
                        className="member-chip"
                        onClick={() => { setEditGroup(null); setModalOpen(true); }}
                        style={{ borderStyle: 'dashed' }}
                    >
                        <PlusOutlined /> New Group
                    </div>
                </div>
            )}

            <GroupModal
                open={modalOpen}
                onClose={() => { setModalOpen(false); setEditGroup(null); }}
                onSave={handleGroupSave}
                members={members}
                editGroup={editGroup}
            />
        </div>
    );
}
