import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, CalendarPlus, AlertTriangle, Clock4, CheckCheck, Trash2, X } from 'lucide-react';
import Header from '../components/Header';
import { useNotifications, timeAgo } from '../hooks/useNotifications';
import '../styles/Notifications.css';

const ICONS = { online: CalendarPlus, overdue: AlertTriangle, due: Clock4 };

const Notifications = () => {
  const navigate = useNavigate();
  const { notifications, readIds, unreadCount, loading, markRead, markAllRead, dismiss, dismissAll, dismissRead } = useNotifications();
  const [tab, setTab] = useState('all');   // all | unread

  const list = tab === 'unread' ? notifications.filter((n) => !readIds.has(n.id)) : notifications;
  const readCount = notifications.length - unreadCount;

  const open = (n) => { markRead(n.id); navigate('/admin/customers'); };
  const clearAll = () => {
    if (window.confirm(`Delete all ${notifications.length} notifications?`)) dismissAll();
  };

  return (
    <>
      <Header />
      <div className="np-page">
        <div className="np-hero">
          <h1><Bell size={22} /> Notifications</h1>
          <p>Online reservations, upcoming returns and overdue bookings.</p>
        </div>

        <div className="np-card">
          <div className="np-toolbar">
            <div className="np-tabs">
              <button type="button" className={tab === 'all' ? 'active' : ''} onClick={() => setTab('all')}>
                All <span>{notifications.length}</span>
              </button>
              <button type="button" className={tab === 'unread' ? 'active' : ''} onClick={() => setTab('unread')}>
                Unread <span>{unreadCount}</span>
              </button>
            </div>

            <div className="np-actions">
              <button type="button" className="np-btn" onClick={markAllRead} disabled={unreadCount === 0}>
                <CheckCheck size={15} /> Mark all as read
              </button>
              <button type="button" className="np-btn" onClick={dismissRead} disabled={readCount === 0}>
                <Trash2 size={15} /> Delete read
              </button>
              <button type="button" className="np-btn danger" onClick={clearAll} disabled={notifications.length === 0}>
                <Trash2 size={15} /> Delete all
              </button>
            </div>
          </div>

          {loading ? (
            <p className="np-empty">Loading...</p>
          ) : list.length === 0 ? (
            <p className="np-empty">{tab === 'unread' ? "You're all caught up." : 'No notifications.'}</p>
          ) : (
            <ul className="np-list">
              {list.map((n) => {
                const Icon = ICONS[n.type] || Bell;
                const unread = !readIds.has(n.id);
                return (
                  <li key={n.id} className={`np-item ${n.type} ${unread ? 'unread' : ''}`}>
                    <button type="button" className="np-main" onClick={() => open(n)}>
                      <span className="np-icon"><Icon size={18} /></span>
                      <span className="np-body">
                        <strong>{n.title}</strong>
                        <span className="np-msg">{n.message}</span>
                        <span className="np-time">{timeAgo(n.at)}</span>
                      </span>
                      {unread && <span className="np-dot" aria-label="Unread" />}
                    </button>
                    <button type="button" className="np-del" onClick={() => dismiss(n.id)} title="Delete" aria-label="Delete notification">
                      <X size={16} />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </>
  );
};

export default Notifications;