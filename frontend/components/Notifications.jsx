import { useEffect, useState } from 'react';
import { fetchNotifications, markNotificationRead } from '@/lib/notifications';

export default function Notifications({ userId }) {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;
    fetchNotifications(userId).then(data => {
      setNotifications(data);
      setLoading(false);
    });
  }, [userId]);

  const handleRead = async (id) => {
    await markNotificationRead(id);
    setNotifications(notifications => notifications.map(n => n.id === id ? { ...n, is_read: 1 } : n));
  };

  if (loading) return <div>جاري تحميل الإشعارات...</div>;
  if (!notifications.length) return <div>لا توجد إشعارات.</div>;

  return (
    <div>
      <h3>الإشعارات</h3>
      <ul>
        {notifications.map(n => (
          <li key={n.id} style={{ background: n.is_read ? '#eee' : '#ffd' }}>
            {n.message}
            {n.is_read ? null : (
              <button onClick={() => handleRead(n.id)} style={{ marginRight: 8 }}>تحديد كمقروء</button>
            )}
            <span style={{ fontSize: 12, color: '#888', marginLeft: 8 }}>{new Date(n.created_at).toLocaleString()}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
