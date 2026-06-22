import React, { useState, useEffect } from 'react';
import { Sun, LogOut, Bell, UserCircle } from 'lucide-react';
import { supabase } from '../supabaseClient'; 
import '../styles/Header.css';

const Header = () => {
  const [time, setTime] = useState(new Date());
  const [userEmail, setUserEmail] = useState('Loading...'); // Temporary display samtang gakuha sa email

  // 1. Digital Clock Timer Hook
  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // 2. Hook para makuha ang tinuod nga Gmail gikan sa Supabase Session
  useEffect(() => {
    const fetchUserEmail = async () => {
      const { data: { session }, error } = await supabase.auth.getSession();
      if (session?.user) {
        setUserEmail(session.user.email); // Dinhi makuha ang rjnovicio143@gmail.com
      } else {
        setUserEmail('Admin Account'); // Fallback string kon offline
      }
    };
    fetchUserEmail();
  }, []);

  // ================= DEEP RADICAL SIGN OUT HANDLER =================
  const handleLogoutClick = async () => {
    const confirmLogout = window.confirm("Sigurado ka nga gusto ka mo-logout?");
    if (confirmLogout) {
      try {
        // 1. I-terminate ang active session sa Supabase backend
        await supabase.auth.signOut();
        
        // 2. Clear out all local browser data structure tokens
        localStorage.clear(); 
        sessionStorage.clear();

        // 3. Force completely hard reload balik sa login route
        window.location.href = '/login';
      } catch (error) {
        console.error("Error sa pag-logout:", error);
        localStorage.clear();
        sessionStorage.clear();
        window.location.href = '/login';
      }
    }
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

        {/* NAGPABILIN NGA ADMIN STATUS BADGE */}
        <div className="admin-status-badge">
          <span className="badge-icon">👑</span>
          <span className="badge-label">Admin</span>
        </div>

        <div className="user-profile-compact">
          <UserCircle size={30} className="profile-avatar-icon" />
          <div className="profile-meta">
            {/* DYNAMIC EMAIL NALANG KINI EMBES STATIC ADMIN USER */}
            <span className="profile-name" style={{ fontSize: '13px', fontWeight: '600' }}>
              {userEmail}
            </span>
            <span className="profile-role">Super Admin</span>
          </div>
        </div>

        <div className="header-control-group">
          <button className="control-btn notif-trigger">
            <Bell size={18} />
            <span className="notif-indicator"></span>
          </button>
          
          <button className="control-btn theme-switcher">
            <Sun size={18} className="sun-icon" />
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