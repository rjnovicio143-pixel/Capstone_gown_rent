import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut, Bell, UserCircle, Settings as SettingsIcon, History, AlertTriangle, Clock4 } from 'lucide-react';
import { supabase } from '../supabaseClient';
import '../styles/Header.css';

const Header = () => {
  const navigate = useNavigate();
  const [time, setTime] = useState(new Date());
  const [adminName, setAdminName] = useState('Loading...');
  const [authMethod, setAuthMethod] = useState(null); // 'google' o 'password'

  const [notifications, setNotifications] = useState([]);
  const [showNotifPanel, setShowNotifPanel] = useState(false);
  const notifPanelRef = useRef(null);

  // 1. Digital Clock Timer Hook
  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // 2. Kuhaon ang naka-login nga admin — pwede Google OAuth (Supabase Auth session)
  //    o pwede custom "admins" table login (gi-store sa Login.jsx sa localStorage).
  //    Sa duha ka paagi, ang "admins" table ang source of truth sa name/role,
  //    gi-match pinaagi sa email.
  useEffect(() => {
    const loadAdmin = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        let email = null;

        if (session?.user) {
          email = session.user.email; // Google login
          setAuthMethod('google');
        } else {
          const stored = localStorage.getItem('admin');
          if (stored) {
            const localAdmin = JSON.parse(stored);
            email = localAdmin?.email;
          }
          setAuthMethod('password');
        }

        if (!email) {
          setAdminName('Admin Account');
          return;
        }

        const { data, error } = await supabase
          .from('admins')
          .select('name, email')
          .eq('email', email)
          .single();

        if (!error && data) {
          setAdminName(data.name || data.email);
        } else {
          setAdminName(email);
        }
      } catch (err) {
        console.error("Error loading admin session:", err);
        setAdminName('Admin Account');
      }
    };
    loadAdmin();
  }, []);

  // 3. NOTIFICATIONS: due tomorrow + overdue nga mga "claimed" booking
  // (claimed = gown naa pa sa customer, wala pa na-return)
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

    // Overdue una, unya due-tomorrow
    return notifs.sort((a, b) => (a.type === b.type ? 0 : a.type === 'overdue' ? -1 : 1));
  };

  const fetchNotifications = async () => {
    const { data, error } = await supabase
      .from('bookings')
      .select('id, name, gown_name, return_date, return_status')
      .eq('return_status', 'claimed');

    if (error) {
      console.error("Error fetching notifications:", error);
      return;
    }
    setNotifications(buildNotifications(data));
  };

  useEffect(() => {
    fetchNotifications();
    // I-refresh ang notifications kada 5 minutos samtang naa sa app
    const interval = setInterval(fetchNotifications, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  // Close ang dropdown kung mag-click sa gawas niini
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (notifPanelRef.current && !notifPanelRef.current.contains(e.target)) {
        setShowNotifPanel(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogoutClick = async () => {
    const confirmLogout = window.confirm("Sigurado ka nga gusto ka mo-logout?");
    if (!confirmLogout) return;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        await supabase.auth.signOut(); // Google OAuth session, kinahanglan i-terminate sa Supabase
      }
    } catch (error) {
      console.error("Error sa pag-logout:", error);
    }

    localStorage.removeItem('admin');
    localStorage.clear();
    sessionStorage.clear();
    window.location.href = '/login';
  };

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

        <div className="admin-status-badge">
          <span className="badge-icon">👑</span>
          <span className="badge-label">Admin</span>
        </div>

        <div className="user-profile-compact">
          <UserCircle size={30} className="profile-avatar-icon" />
          <div className="profile-meta">
            <span className="profile-name">{adminName}</span>
            <span className="profile-role">Super Admin</span>
          </div>
        </div>

        <div className="header-control-group">
          {/* NOTIFICATIONS */}
          <div className="notif-wrapper" ref={notifPanelRef}>
            <button
              className="control-btn notif-trigger"
              onClick={() => setShowNotifPanel(!showNotifPanel)}
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

          {/* SETTINGS */}
          <button
            className="control-btn"
            onClick={() => navigate('/admin/settings')}
            title="Settings"
          >
            <SettingsIcon size={18} />
          </button>

          {/* ACTIVITY LOG */}
          <button
            className="control-btn"
            onClick={() => navigate('/admin/activity-log')}
            title="Activity Log"
          >
            <History size={18} />
          </button>

          <button className="header-logout-action" onClick={handleLogoutClick}>
            <LogOut size={16} />
            <span>Logout</span>
          </button>
        </div>
      </div>
    </header>
  );
};

export default Header;