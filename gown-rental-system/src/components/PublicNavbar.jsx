import React, { useState, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { 
  Shirt, 
  Info, 
  Home, 
  Layers, 
  Eye, 
  MessageSquare,
  User, 
  LogOut, 
  ShieldCheck 
} from 'lucide-react';
import { supabase } from '../supabaseClient'; 
import '../styles-public/PublicNavbar.css';

const PublicNavbar = () => {
  const navigate = useNavigate();
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userDisplayName, setUserDisplayName] = useState('');
  const [userRole, setUserRole] = useState(null);

  // ================= HYBRID AUTH SEGMENT PROCESSING LAYER =================
  const checkNavbarAuthenticationState = async () => {
    const localToken = localStorage.getItem('userToken');
    const localRole = localStorage.getItem('userRole');

    // 1. KUNG MAO NI ANG DEVELOPER / ADMIN BYPASS
    if (localRole === 'admin' || localRole === 'Admin') {
      setIsLoggedIn(true);
      setUserRole('admin');
      setUserDisplayName('rjnovicio143@gmail.com');
      return;
    }

    // 2. KUNG CUSTOMER DATA PACKET ANG NAA SA STORAGE UNIT
    if (localToken && localRole === 'customer') {
      setIsLoggedIn(true);
      setUserRole('customer');

      try {
        // I-fetch ang tinuod nga pangalan sa customer gikan sa database cluster
        const { data: customerData } = await supabase
          .from('customers')
          .select('name')
          .eq('id', localToken)
          .single();

        if (customerData?.name) {
          setUserDisplayName(customerData.name);
        } else {
          // Fallback metadata mapping configuration
          const { data: { session } } = await supabase.auth.getSession();
          const googleName = session?.user?.user_metadata?.full_name || session?.user?.user_metadata?.name;
          setUserDisplayName(googleName || 'Valued Customer');
        }
      } catch (err) {
        setUserDisplayName('Valued Customer');
      }
      return;
    }

    // 3. SECURE FALLBACK LOGICAL REVERT
    setIsLoggedIn(false);
    setUserRole(null);
    setUserDisplayName('');
  };

  useEffect(() => {
    // Pagdalagan sa identity evaluation checking inisyal load
    checkNavbarAuthenticationState();

    // Live Sync Listener para sa Supabase Core Third Party Triggers (Google Login)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session?.user) {
        await checkNavbarAuthenticationState();
      } else if (event === 'SIGNED_OUT') {
        setIsLoggedIn(false);
        setUserRole(null);
        setUserDisplayName('');
      }
    });

    // Custom browser layout channel event connection for manual registration/login hooks
    const handleManualAuthSync = () => {
      checkNavbarAuthenticationState();
    };

    window.addEventListener('storage', handleManualAuthSync);
    window.addEventListener('local-login-success', handleManualAuthSync);

    return () => {
      subscription?.unsubscribe();
      window.removeEventListener('storage', handleManualAuthSync);
      window.removeEventListener('local-login-success', handleManualAuthSync);
    };
  }, []);

  // ================= SECURE DE-PROVISIONING (LOGOUT) ACTION =================
  const handleLogoutAction = async () => {
    try {
      // 1. I-clear ang third-party connection system parameter
      await supabase.auth.signOut();
      
      // 2. I-wipe out ang custom session state attributes sa framework
      localStorage.clear();
      
      // 3. Reset state indicators
      setIsLoggedIn(false);
      setUserRole(null);
      setUserDisplayName('');

      alert("Naka-logout na ka nga luwas gikan sa portal framework.");
      navigate('/');
    } catch (error) {
      console.error("Logout verification system failure:", error);
    }
  };

  return (
    <nav className="public-navbar">
      {/* Brand Logo Section */}
      <div className="nav-logo" onClick={() => navigate('/')} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div className="logo-icon-wrapper" style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
          <Shirt size={30} className="logo-icon" style={{ color: 'var(--accent-gold)' }} />
          <span style={{ position: 'absolute', top: '-10px', left: '50%', transform: 'translateX(-50%)', fontSize: '12px' }}>👑</span>
        </div>
        
        <div className="brand-typography" style={{ display: 'flex', flexDirection: 'column', lineHeight: '1.1' }}>
          <span className="logo-text" style={{ fontSize: '20px', fontWeight: '800', color: '#1e293b', letterSpacing: '-0.5px' }}>
            Mrs. G <span style={{ color: 'var(--accent-gold)', fontWeight: '300', fontSize: '16px' }}>GOWN RENTAL</span>
          </span>
          <span className="logo-subtext" style={{ fontSize: '10px', fontWeight: '600', color: '#64748b', letterSpacing: '2px', textTransform: 'uppercase' }}>
            Villanueva
          </span>
        </div>
      </div>

      {/* Center Navigation Menu Links */}
      <ul className="nav-links">
        <li>
          <NavLink to="/" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
            <Home size={16} />
            <span>Home</span>
          </NavLink>
        </li>
        <li>
          <NavLink to="/gown-suit" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
            <Layers size={16} />
            <span>Gown & Suit</span>
          </NavLink>
        </li>
        <li>
          <NavLink to="/3d-mannequin" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
            <Eye size={16} />
            <span>3D Mannequin</span>
          </NavLink>
        </li>
        <li>
          <NavLink to="/about" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
            <Info size={16} />
            <span>About Us</span>
          </NavLink>
        </li>
        <li>
          <NavLink to="/contact" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
            <MessageSquare size={16} />
            <span>Contact</span>
          </NavLink>
        </li>
      </ul>

      {/* Dynamic Action Control Cluster (Conditional Sign-In/Profile View UI) */}
      <div className="nav-actions">
        {isLoggedIn ? (
          // ================= RENDER CONDITIONAL: USER VALIDATION GRANTED =================
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            
            {/* Elegant Profile Badge Indicator Box */}
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '10px', 
              padding: '6px 14px', 
              background: '#f8fafc', 
              border: '1px solid #e2e8f0', 
              borderRadius: '30px'
            }}>
              {userRole === 'admin' ? (
                <ShieldCheck size={16} style={{ color: '#f59e0b' }} /> 
              ) : (
                <User size={16} style={{ color: '#64748b' }} /> 
              )}
              
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', lineHeight: '1.2' }}>
                <span style={{ fontSize: '12px', fontWeight: '700', color: '#334155' }}>
                  {userDisplayName}
                </span>
                <span style={{ fontSize: '10px', fontWeight: '600', color: userRole === 'admin' ? '#f59e0b' : '#94a3b8', textTransform: 'uppercase' }}>
                  {userRole}
                </span>
              </div>
            </div>

            {/* Logout Action Layout Button */}
            <button 
              className="logout-action-btn" 
              onClick={handleLogoutAction}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', borderRadius: '8px', border: '1px solid #fee2e2', background: '#fef2f2', color: '#ef4444', fontWeight: '600', fontSize: '13px', cursor: 'pointer', transition: 'all 0.2s'
              }}
            >
              <LogOut size={14} />
              <span>Logout</span>
            </button>
          </div>
        ) : (
          // ================= RENDER CONDITIONAL: ANONYMOUS DISPLAY ACCESS =================
          <button className="login-admin-btn" onClick={() => navigate('/login')}>
            <User size={16} />
            <span>Login</span>
          </button>
        )}
      </div>
    </nav>
  );
};

export default PublicNavbar;