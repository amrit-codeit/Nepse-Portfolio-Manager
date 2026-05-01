import React, { useState, useEffect } from 'react';
import { Badge, Popover, List, Typography, Button, Spin } from 'antd';
import { BellOutlined, CheckOutlined } from '@ant-design/icons';
import { getUnreadNotifications, markNotificationRead, markAllNotificationsRead } from '../services/api';

const { Text } = Typography;

export default function NotificationBell() {
    const [notifications, setNotifications] = useState([]);
    const [loading, setLoading] = useState(false);
    const [open, setOpen] = useState(false);

    const fetchNotifications = async () => {
        try {
            const res = await getUnreadNotifications();
            if (res.data?.status === 'success') {
                setNotifications(res.data.data);
            }
        } catch (e) {
            console.error("Failed to fetch notifications", e);
        }
    };

    useEffect(() => {
        fetchNotifications();
        // Poll every 5 minutes
        const interval = setInterval(fetchNotifications, 5 * 60 * 1000);
        return () => clearInterval(interval);
    }, []);

    const handleMarkRead = async (id) => {
        try {
            await markNotificationRead(id);
            setNotifications(prev => prev.filter(n => n.id !== id));
        } catch (e) {
            console.error(e);
        }
    };

    const handleMarkAllRead = async () => {
        setLoading(true);
        try {
            await markAllNotificationsRead();
            setNotifications([]);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const content = (
        <div style={{ width: 300, maxHeight: 400, overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, padding: '0 12px' }}>
                <strong style={{ color: 'var(--text-primary)' }}>Notifications</strong>
                {notifications.length > 0 && (
                    <Button type="link" size="small" onClick={handleMarkAllRead} loading={loading}>
                        Mark all as read
                    </Button>
                )}
            </div>
            
            {notifications.length === 0 ? (
                <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    No new notifications
                </div>
            ) : (
                <List
                    itemLayout="horizontal"
                    dataSource={notifications}
                    renderItem={item => (
                        <List.Item
                            actions={[
                                <Button type="text" size="small" icon={<CheckOutlined />} onClick={() => handleMarkRead(item.id)} />
                            ]}
                            style={{ padding: '12px', borderBottom: '1px solid var(--border-color)', background: 'var(--bg-tertiary)' }}
                        >
                            <List.Item.Meta
                                title={<span style={{ fontSize: 13, color: 'var(--text-primary)' }}>{item.title}</span>}
                                description={
                                    <div>
                                        <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{item.message}</div>
                                        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
                                            {new Date(item.created_at).toLocaleString()}
                                        </div>
                                    </div>
                                }
                            />
                        </List.Item>
                    )}
                />
            )}
        </div>
    );

    return (
        <Popover
            content={content}
            trigger="click"
            open={open}
            onOpenChange={setOpen}
            placement="bottomRight"
            overlayInnerStyle={{ padding: 0, background: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}
        >
            <div style={{ cursor: 'pointer', padding: '0 16px', display: 'flex', alignItems: 'center' }}>
                <Badge count={notifications.length} size="small" style={{ backgroundColor: 'var(--accent-primary)' }}>
                    <BellOutlined style={{ fontSize: 18, color: 'var(--text-primary)' }} />
                </Badge>
            </div>
        </Popover>
    );
}
