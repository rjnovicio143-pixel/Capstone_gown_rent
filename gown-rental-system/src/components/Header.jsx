import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  LogOut, Bell, Settings as SettingsIcon, History,
  AlertTriangle, Clock4, ChevronDown, ShieldCheck, CalendarPlus, CheckCheck, X,
} from 'lucide-react';
import { supabase } from '../supabaseClient';
import { useNotifications, timeAgo } from '../hooks/useNotifications';
import '../styles/Header.css';

const PREVIEW_COUNT = 5;   // how many show before "See all"

const Header = () => {
  const navigate = useNavigate();
  const [time, setTime] = useState(new Date());
  const [adminName, setAdminName] = useState('Loading...');
  const [adminEmail, setAdminEmail] = useState('');
  const role = localStorage.getItem('userRole');
  const roleLabel = role === 'super_admin' ? 'Super Admin' : 'Admin';

  const { notifications, readIds, unreadCount, markRead, markAllRead, dismiss } = useNotifications();
  const [tab, setTab] = useState('all');   // all | unread
  const [seeAll, setSeeAll] = useState(false);
  const [showNotifPanel, setShowNotifPanel] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const notifPanelRef = useRef(null);
  const profileMenuRef = useRef(null);

  // 1. Digital clock (also refreshes the "5m ago" labels)
  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // 2. Logged-in account (userToken = admins.id) - works for admin and super admin
  useEffect(() => {
    const loadAdmin = async () => {
      try {
        const userToken = localStorage.getItem('userToken');
        if (!userToken) { setAdminName('Admin Account'); return; }

        const { data, error } = await supabase
          .from('admins')
          .select('name, email')
          .eq('id', userToken)
          .single();

        if (!error && data) {
          setAdminName(data.name || data.email);
          setAdminEmail(data.email || '');
        } else {
          setAdminName('Admin Account');
        }
      } catch (err) {
        console.error('Error loading admin session:', err);
        setAdminName('Admin Account');
      }
    };
    loadAdmin();
  }, []);

  const filtered = tab === 'unread' ? notifications.filter((n) => !readIds.has(n.id)) : notifications;
  const visible = seeAll ? filtered : filtered.slice(0, PREVIEW_COUNT);

  const openNotif = (n) => {
    markRead(n.id);
    setShowNotifPanel(false);
    navigate('/admin/customers');
  };

  // Admin: "See all" opens the Notifications page. Super admin has no such page, so it expands in place.
  const handleSeeAll = () => {
    if (role === 'admin') { setShowNotifPanel(false); navigate('/admin/notifications'); }
    else setSeeAll(!seeAll);
  };

  // Close dropdowns on outside click / Escape
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (notifPanelRef.current && !notifPanelRef.current.contains(e.target)) setShowNotifPanel(false);
      if (profileMenuRef.current && !profileMenuRef.current.contains(e.target)) setShowProfileMenu(false);
    };
    const handleEscape = (e) => {
      if (e.key === 'Escape') { setShowNotifPanel(false); setShowProfileMenu(false); }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, []);

  const goTo = (path) => {
    setShowProfileMenu(false);
    navigate(path);
  };

  const handleLogoutClick = async () => {
    setShowProfileMenu(false);
    if (!window.confirm('Are you sure you want to log out?')) return;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) await supabase.auth.signOut(); // Google OAuth session
    } catch (error) {
      console.error('Logout error:', error);
    }

    // keep the notification cache so read items do not flash as unread after logging in again
    const keep = ['notifReadIds', 'notifDismissedIds'].map(k => [k, localStorage.getItem(k)]);
    localStorage.clear();
    keep.forEach(([k, v]) => { if (v !== null) localStorage.setItem(k, v); });
    sessionStorage.clear();
    window.location.href = '/login';
  };

  const initial = (adminName || 'A').trim().charAt(0).toUpperCase();
  const iconFor = (type) => {
    if (type === 'online') return <CalendarPlus size={16} />;
    if (type === 'overdue') return <AlertTriangle size={16} />;
    return <Clock4 size={16} />;
  };

  return (
    <header className="app-header-modern" data-tick={time.getMinutes()}>
      <div className="header-left-section">
        {/* Breadcrumb / page title later */}
      </div>

      <div className="header-right-section">
        <div className="digital-clock">
          {time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })}
        </div>

        <div className="header-v-divider"></div>

        {/* NOTIFICATIONS */}
        <div className="notif-wrapper" ref={notifPanelRef}>
          <button
            className={`control-btn notif-trigger ${showNotifPanel ? 'active' : ''}`}
            onClick={() => { setShowNotifPanel(!showNotifPanel); setShowProfileMenu(false); setSeeAll(false); }}
            title="Notifications"
            aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ''}`}
          >
            <Bell size={18} />
            {unreadCount > 0 && (
              <span className="notif-count-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>
            )}
          </button>

          {showNotifPanel && (
            <div className="notif-dropdown-panel">
              <div className="notif-panel-header">
                <span>Notifications</span>
                <button
                  type="button"
                  className="notif-markall"
                  onClick={markAllRead}
                  disabled={unreadCount === 0}
                >
                  <CheckCheck size={14} /> Mark all as read
                </button>
              </div>

              <div className="notif-tabs">
                <button type="button" className={tab === 'all' ? 'active' : ''} onClick={() => setTab('all')}>
                  All
                </button>
                <button type="button" className={tab === 'unread' ? 'active' : ''} onClick={() => setTab('unread')}>
                  Unread{unreadCount > 0 && <span className="notif-tab-count">{unreadCount}</span>}
                </button>
              </div>

              <div className="notif-panel-list">
                {visible.length > 0 ? (
                  visible.map((n) => {
                    const unread = !readIds.has(n.id);
                    return (
                      <div key={n.id} className={`notif-item ${n.type} ${unread ? 'unread' : ''}`}>
                        <button type="button" className="notif-item-main" onClick={() => openNotif(n)}>
                          <div className="notif-item-icon">{iconFor(n.type)}</div>
                          <div className="notif-item-body">
                            <span className="notif-item-title">{n.title}</span>
                            <p>{n.message}</p>
                            <span className="notif-item-time">{timeAgo(n.at)}</span>
                          </div>
                          {unread && <span className="notif-unread-dot" aria-label="Unread" />}
                        </button>
                        <button type="button" className="notif-item-del" onClick={() => dismiss(n.id)} title="Delete" aria-label="Delete notification">
                          <X size={14} />
                        </button>
                      </div>
                    );
                  })
                ) : (
                  <p className="notif-empty-text">
                    {tab === 'unread' ? "You're all caught up." : 'No notifications yet.'}
                  </p>
                )}
              </div>

              {(role === 'admin' ? filtered.length > 0 : filtered.length > PREVIEW_COUNT) && (
                <button type="button" className="notif-seeall" onClick={handleSeeAll}>
                  {role !== 'admin' && seeAll ? 'See less' : `See all (${filtered.length})`}
                </button>
              )}
            </div>
          )}
        </div>

        {/* PROFILE DROPDOWN */}
        <div className="profile-wrapper" ref={profileMenuRef}>
          <button
            className={`profile-trigger ${showProfileMenu ? 'open' : ''}`}
            onClick={() => { setShowProfileMenu(!showProfileMenu); setShowNotifPanel(false); }}
            aria-haspopup="menu"
            aria-expanded={showProfileMenu}
          >
            <span className="profile-avatar">{initial}</span>
            <span className="profile-meta">
              <span className="profile-name">{adminName}</span>
              <span className="profile-role">{roleLabel}</span>
            </span>
            <ChevronDown size={16} className="profile-chevron" />
          </button>

          {showProfileMenu && (
            <div className="profile-dropdown-panel" role="menu">
              <div className="profile-card">
                <span className="profile-avatar large">{initial}</span>
                <div className="profile-card-info">
                  <span className="profile-card-name">{adminName}</span>
                  {adminEmail && <span className="profile-card-email">{adminEmail}</span>}
                  <span className="profile-card-badge">
                    <ShieldCheck size={12} /> {roleLabel}
                  </span>
                </div>
              </div>

              <div className="profile-menu-list">
                <button className="profile-menu-item" role="menuitem" onClick={() => goTo('/admin/settings')}>
                  <SettingsIcon size={16} />
                  <span>Settings</span>
                </button>
                <button className="profile-menu-item" role="menuitem" onClick={() => goTo('/admin/activity-log')}>
                  <History size={16} />
                  <span>Activity Log</span>
                </button>
              </div>

              <div className="profile-menu-divider"></div>

              <div className="profile-menu-list">
                <button className="profile-menu-item danger" role="menuitem" onClick={handleLogoutClick}>
                  <LogOut size={16} />
                  <span>Logout</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

export default Header;