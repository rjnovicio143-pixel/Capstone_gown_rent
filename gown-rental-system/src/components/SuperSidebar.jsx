import { NavLink } from 'react-router-dom';
import { UserCog, Box, HardDrive, ChevronLeft, LogOut } from 'lucide-react';
import { supabase } from '../supabaseClient';
import '../styles/Sidebar.css';

const menuItems = [
  { name: 'Accounts',  icon: UserCog,   path: '/super/accounts' },
  { name: '3D Models', icon: Box,       path: '/super/models'   },
  { name: 'Storage',   icon: HardDrive, path: '/super/storage'  },
];

const SuperSidebar = ({ isCollapsed, setIsCollapsed }) => {

  // I-sign out sab ang Google session sa Supabase, kay kung dili, ang Login page
  // mo-login dayon pag-usab gamit ang daan nga session.
  const handleLogout = async () => {
    try { await supabase.auth.signOut(); } catch (_) { /* ignore */ }
    localStorage.removeItem('userToken');
    localStorage.removeItem('userRole');
    localStorage.removeItem('admin');
    window.location.href = '/login';
  };

  return (
    <>
      {/* DESKTOP */}
      <div className={`sidebar ${isCollapsed ? 'collapsed' : ''}`}>
        <button
          className="sidebar-toggle"
          onClick={() => setIsCollapsed(!isCollapsed)}
          aria-label="Toggle sidebar"
        >
          <ChevronLeft size={16} />
        </button>

        <div className="sidebar-logo">
          <span className="logo-icon-g">G</span>
          <span className="logos-text">
            Super<span className="accent-gold-text"> Admin</span>
          </span>
        </div>

        <nav className="sidebar-nav">
          <ul>
            {menuItems.map((item) => (
              <li key={item.name}>
                <NavLink
                  to={item.path}
                  className={({ isActive }) => (isActive ? 'active' : '')}
                  title={isCollapsed ? item.name : ''}
                >
                  <item.icon size={20} className="nav-icon" />
                  <span className="nav-text">{item.name}</span>
                </NavLink>
              </li>
            ))}
            <li>
              <a href="/login" onClick={(e) => { e.preventDefault(); handleLogout(); }}
                 title={isCollapsed ? 'Logout' : ''}>
                <LogOut size={20} className="nav-icon" />
                <span className="nav-text">Logout</span>
              </a>
            </li>
          </ul>
        </nav>
      </div>

      {/* MOBILE BOTTOM NAV */}
      <nav className="mobile-bottom-nav">
        {menuItems.map((item) => (
          <NavLink
            key={item.name}
            to={item.path}
            className={({ isActive }) =>
              `mobile-nav-item ${isActive ? 'mobile-nav-active' : ''}`
            }
          >
            <item.icon size={22} className="mobile-nav-icon" />
            <span className="mobile-nav-label">{item.name}</span>
          </NavLink>
        ))}
        <a href="/login" className="mobile-nav-item"
           onClick={(e) => { e.preventDefault(); handleLogout(); }}>
          <LogOut size={22} className="mobile-nav-icon" />
          <span className="mobile-nav-label">Logout</span>
        </a>
      </nav>
    </>
  );
};

export default SuperSidebar;