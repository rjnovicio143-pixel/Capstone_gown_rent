import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  LogOut, Bell, Settings as SettingsIcon, History,
  AlertTriangle, Clock4, ChevronDown, ShieldCheck,
} from 'lucide-react';
import { supabase } from '../supabaseClient';
import '../styles/Header.css';

const Header = () => {
  const navigate = useNavigate();
  const [time, setTime] = useState(new Date());
  const [adminName, setAdminName] = useState('Loading...');
  const [adminEmail, setAdminEmail] = useState('');

  const [notifications, setNotifications] = useState([]);
  const [showNotifPanel, setShowNotifPanel] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const notifPanelRef = useRef(null);
  const profileMenuRef = useRef(null);

  // 1. Digital clock
  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // 2. Kuhaon ang naka-login nga admin (userToken = admins.id)
  useEffect(() => {
    const loadAdmin = async () => {
      try {
        const userToken = localStorage.getItem('userToken');
        const userRole = localStorage.getItem('userRole');

        if (userRole !== 'admin' || !userToken) {
          setAdminName('Admin Account');
          return;
        }

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

  // 3. Notifications: due tomorrow + overdue nga "claimed" bookings
  const buildNotifications = (bookings) => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);

    const notifs = [];

    bookings.forEach((b) => {
      if (b.return_status !== 'claimed' || !b.return_date) return;

      const returnDate = new Date(b.return_date); returnDate.setHours(0, 0, 0, 0);

      if (returnDate.getTime() === tomorrow.getTime()) {
        notifs.push({
          id: `due-${b.id}`,
          type: 'due',
          message: `Ugma na ang return date ni ${b.name} para sa "${b.gown_name}".`,
        });
      } else if (returnDate.getTime() < today.getTime()) {
        const daysLate = Math.floor((today.getTime() - returnDate.getTime()) / 86400000);
        notifs.push({
          id: `overdue-${b.id}`,
          type: 'overdue',
          message: `Overdue na ${daysLate} ka adlaw ang booking ni ${b.name} para sa "${b.gown_name}" — wala pa gyapon nag-uli.`,
        });
      }
    });

    return notifs.sort((a, b) => (a.type === b.type ? 0 : a.type === 'overdue' ? -1 : 1));
  };

  const fetchNotifications = async () => {
    const { data, error } = await supabase
      .from('bookings')
      .select('id, name, gown_name, return_date, return_status')
      .eq('return_status', 'claimed');

    if (error) {
      console.error('Error fetching notifications:', error);
      return;
    }
    setNotifications(buildNotifications(data));
  };

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  // Close dropdowns kung mag-click sa gawas o mag-Escape
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (notifPanelRef.current && !notifPanelRef.current.contains(e.target)) {
        setShowNotifPanel(false);
      }
      if (profileMenuRef.current && !profileMenuRef.current.contains(e.target)) {
        setShowProfileMenu(false);
      }
    };
    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        setShowNotifPanel(false);
        setShowProfileMenu(false);
      }
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
    const confirmLogout = window.confirm('Sigurado ka nga gusto ka mo-logout?');
    if (!confirmLogout) return;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        await supabase.auth.signOut(); // Google OAuth session
      }
    } catch (error) {
      console.error('Error sa pag-logout:', error);
    }

    localStorage.clear();
    sessionStorage.clear();
    window.location.href = '/login';
  };

  const initial = (adminName || 'A').trim().charAt(0).toUpperCase();

  return (
    <header className="app-header-modern">
      <div className="header-left-section">
        {/* Breadcrumb o Page Title puhon */}
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
            onClick={() => {
              setShowNotifPanel(!showNotifPanel);
              setShowProfileMenu(false);
            }}
            title="Notifications"
            aria-label="Notifications"
          >
            <Bell size={18} />
            {notifications.length > 0 && (
              <span className="notif-count-badge">{notifications.length}</span>
            )}
          </button>

          {showNotifPanel && (
            <div className="notif-dropdown-panel">
              <div className="notif-panel-header">
                <span>Notifications</span>
                <span className="notif-panel-count">{notifications.length}</span>
              </div>
              <div className="notif-panel-list">
                {notifications.length > 0 ? (
                  notifications.map((n) => (
                    <div key={n.id} className={`notif-item ${n.type}`}>
                      <div className="notif-item-icon">
                        {n.type === 'overdue' ? <AlertTriangle size={16} /> : <Clock4 size={16} />}
                      </div>
                      <p>{n.message}</p>
                    </div>
                  ))
                ) : (
                  <p className="notif-empty-text">Walay bag-ong notification.</p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* PROFILE DROPDOWN */}
        <div className="profile-wrapper" ref={profileMenuRef}>
          <button
            className={`profile-trigger ${showProfileMenu ? 'open' : ''}`}
            onClick={() => {
              setShowProfileMenu(!showProfileMenu);
              setShowNotifPanel(false);
            }}
            aria-haspopup="menu"
            aria-expanded={showProfileMenu}
          >
            <span className="profile-avatar">{initial}</span>
            <span className="profile-meta">
              <span className="profile-name">{adminName}</span>
              <span className="profile-role">Super Admin</span>
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
                    <ShieldCheck size={12} /> Admin
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