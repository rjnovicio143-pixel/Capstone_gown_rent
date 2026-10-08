import React, { useState, useEffect, useRef } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import {
  Shirt, Info, Home, Layers, Eye, MessageSquare,
  User, LogOut, ShieldCheck, LogIn, LayoutDashboard,
  Menu, X, ChevronDown,
} from 'lucide-react';
import { supabase } from '../supabaseClient';
import '../styles-public/PublicNavbar.css';

const NAV_LINKS = [
  { to: '/', label: 'Home', icon: Home },
  { to: '/gown-suit', label: 'Gown & Suit', icon: Layers },
  { to: '/3d-mannequin', label: '3D Mannequin', icon: Eye },
  { to: '/about', label: 'About Us', icon: Info },
  { to: '/contact', label: 'Contact', icon: MessageSquare },
];

const PublicNavbar = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const [isAdmin, setIsAdmin] = useState(false);
  const [adminName, setAdminName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');

  const [showAccountMenu, setShowAccountMenu] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const accountRef = useRef(null);
  const mobileRef = useRef(null);

  // ================= ADMIN SESSION CHECK =================
  // Admin ra ang naka-login, mao nga walay customer logic.
  const checkAdminSession = async () => {
    const userToken = localStorage.getItem('userToken');
    const userRole = (localStorage.getItem('userRole') || '').toLowerCase();

    if (userRole !== 'admin' || !userToken) {
      setIsAdmin(false);
      setAdminName('');
      setAdminEmail('');
      return;
    }

    setIsAdmin(true);
    setAdminName('Admin Account');

    try {
      const { data, error } = await supabase
        .from('admins')
        .select('name, email')
        .eq('id', userToken)
        .single();

      if (!error && data) {
        setAdminName(data.name || data.email);
        setAdminEmail(data.email || '');
      }
    } catch (err) {
      console.error('Error loading admin session:', err);
    }
  };

  useEffect(() => {
    checkAdminSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user) {
        checkAdminSession();
      } else if (event === 'SIGNED_OUT') {
        setIsAdmin(false);
        setAdminName('');
        setAdminEmail('');
      }
    });

    const handleAuthSync = () => checkAdminSession();
    window.addEventListener('storage', handleAuthSync);
    window.addEventListener('local-login-success', handleAuthSync);

    return () => {
      subscription?.unsubscribe();
      window.removeEventListener('storage', handleAuthSync);
      window.removeEventListener('local-login-success', handleAuthSync);
    };
  }, []);

  // Close menus kung mo-change ang page
  useEffect(() => {
    setShowAccountMenu(false);
    setShowMobileMenu(false);
  }, [location.pathname]);

  // Close kung mag-click sa gawas / Escape
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (accountRef.current && !accountRef.current.contains(e.target)) setShowAccountMenu(false);
      if (mobileRef.current && !mobileRef.current.contains(e.target)) setShowMobileMenu(false);
    };
    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        setShowAccountMenu(false);
        setShowMobileMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, []);

  // Dili ma-scroll ang page sa luyo kung bukas ang mobile menu
  useEffect(() => {
    document.body.style.overflow = showMobileMenu ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [showMobileMenu]);

  // ================= LOGOUT =================
  const handleLogoutAction = async () => {
    setShowAccountMenu(false);
    setShowMobileMenu(false);

    if (!window.confirm('Sigurado ka nga gusto ka mo-logout?')) return;

    try {
      await supabase.auth.signOut();
    } catch (error) {
      console.error('Logout error:', error);
    }

    localStorage.clear();
    sessionStorage.clear();
    setIsAdmin(false);
    setAdminName('');
    setAdminEmail('');
    navigate('/');
  };

  const initial = (adminName || 'A').trim().charAt(0).toUpperCase();

  // Sulod sa account section (gigamit sa desktop dropdown ug mobile menu)
  const renderAccountItems = () =>
    isAdmin ? (
      <>
        <div className="pn-account-card">
          <span className="pn-avatar">{initial}</span>
          <div className="pn-account-info">
            <span className="pn-account-name">{adminName}</span>
            {adminEmail && <span className="pn-account-email">{adminEmail}</span>}
            <span className="pn-admin-badge"><ShieldCheck size={12} /> Admin</span>
          </div>
        </div>
        <button className="pn-menu-item" onClick={() => navigate('/admin/dashboard')}>
          <LayoutDashboard size={16} />
          <span>Admin Dashboard</span>
        </button>
        <div className="pn-divider" />
        <button className="pn-menu-item danger" onClick={handleLogoutAction}>
          <LogOut size={16} />
          <span>Logout</span>
        </button>
      </>
    ) : (
      <button className="pn-menu-item" onClick={() => navigate('/login')}>
        <LogIn size={16} />
        <span>Admin Login</span>
      </button>
    );

  return (
    <nav className="public-navbar">
      {/* Brand */}
      <div className="nav-logo" onClick={() => navigate('/')}>
        <div className="logo-icon-wrapper">
          <Shirt size={28} className="logo-icon" />
          <span className="logo-crown">👑</span>
        </div>
        <div className="brand-typography">
          <span className="logo-text">
            Mrs. G <span className="logo-accent">GOWN RENTAL</span>
          </span>
          <span className="logo-subtext">Villanueva</span>
        </div>
      </div>

      {/* Desktop links */}
      <ul className="nav-links">
        {NAV_LINKS.map(({ to, label, icon: Icon }) => (
          <li key={to}>
            <NavLink to={to} className={({ isActive }) => (isActive ? 'nav-item active' : 'nav-item')}>
              <Icon size={16} />
              <span>{label}</span>
            </NavLink>
          </li>
        ))}
      </ul>

      <div className="nav-actions">
        {/* Desktop account dropdown (walay Login button) */}
        <div className="pn-account-wrapper" ref={accountRef}>
          <button
            className={`pn-account-trigger ${showAccountMenu ? 'open' : ''} ${isAdmin ? 'is-admin' : ''}`}
            onClick={() => setShowAccountMenu(!showAccountMenu)}
            aria-haspopup="menu"
            aria-expanded={showAccountMenu}
            aria-label="Account menu"
          >
            {isAdmin ? <span className="pn-avatar small">{initial}</span> : <User size={18} />}
            <ChevronDown size={14} className="pn-chevron" />
          </button>

          {showAccountMenu && (
            <div className="pn-dropdown" role="menu">{renderAccountItems()}</div>
          )}
        </div>

        {/* Mobile menu button */}
        <div className="pn-mobile-wrapper" ref={mobileRef}>
          <button
            className="pn-mobile-trigger"
            onClick={() => setShowMobileMenu(!showMobileMenu)}
            aria-label={showMobileMenu ? 'Close menu' : 'Open menu'}
            aria-expanded={showMobileMenu}
          >
            {showMobileMenu ? <X size={22} /> : <Menu size={22} />}
          </button>

          {showMobileMenu && (
            <div className="pn-mobile-panel">
              <ul className="pn-mobile-links">
                {NAV_LINKS.map(({ to, label, icon: Icon }) => (
                  <li key={to}>
                    <NavLink
                      to={to}
                      className={({ isActive }) => (isActive ? 'pn-mobile-link active' : 'pn-mobile-link')}
                    >
                      <Icon size={18} />
                      <span>{label}</span>
                    </NavLink>
                  </li>
                ))}
              </ul>
              <div className="pn-divider" />
              <div className="pn-mobile-account">{renderAccountItems()}</div>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
};

export default PublicNavbar;