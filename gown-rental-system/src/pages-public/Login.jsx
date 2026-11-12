import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, ArrowLeft, LogIn } from 'lucide-react';
import '../styles-public/Login.css';

// Supabase client instance configuration driver
import { supabase } from '../supabaseClient';

// Asa moadto ang user depende sa role
const roleHome = (role) => (role === 'super_admin' ? '/super/accounts' : '/admin/dashboard');

// I-save ang session sa browser gamit ang TINUOD nga role gikan sa database
const saveAdminSession = (adminRow) => {
  localStorage.setItem('userToken', adminRow.id);
  localStorage.setItem('userRole', adminRow.role);
  localStorage.setItem('admin', JSON.stringify({
    id: adminRow.id,
    name: adminRow.name,
    email: adminRow.email,
    role: adminRow.role,
  }));
};

const Login = ({ onLoginSuccess }) => {
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // ================= LISTEN TO GOOGLE REDIRECT SUCCESS =================
  useEffect(() => {
    const handleAuthRedirect = async () => {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();

      if (sessionError) {
        console.error("Session framework fetch anomaly:", sessionError);
        return;
      }

      if (session?.user) {
        handleUserSessionRouting(session);
      }
    };

    handleAuthRedirect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate, onLoginSuccess]);

  // Shared processing cluster for identity routing parameters (ADMIN ONLY)
  const handleUserSessionRouting = async (session) => {
    setError('');
    setLoading(true);
    const userEmail = session.user.email;

    console.log("Authenticated via Supabase verification layer. Target:", userEmail);

    try {
      const { data: adminByEmail, error: adminLookupError } = await supabase
        .from('admins')
        .select('*')
        .eq('email', userEmail)
        .single();

      if (!adminLookupError && adminByEmail) {
        const role = adminByEmail.role || 'admin';
        saveAdminSession({ ...adminByEmail, role });

        if (typeof onLoginSuccess === 'function') {
          onLoginSuccess(role);
        }

        setLoading(false);
        navigate(roleHome(role));
        return;
      }

      // Dili admin ang Google account nga ni-login — i-reject ug i-sign out
      await supabase.auth.signOut();
      setError('This Gmail account is not registered as an admin. You are not allowed to access this portal.');
      setLoading(false);
    } catch (adminCheckErr) {
      console.error("Admin lookup via Google session failed:", adminCheckErr);
      await supabase.auth.signOut();
      setError('Something went wrong while verifying your account. Please try again.');
      setLoading(false);
    }
  };

  // ================= TRIGGER GOOGLE OAUTH POPUP/REDIRECT =================
  const handleGoogleLogin = async () => {
    setError('');
    setLoading(true);

    try {
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin + '/login',
          queryParams: {
            prompt: 'select_account',
          }
        }
      });

      if (oauthError) throw oauthError;

    } catch (err) {
      console.error(err);
      setError(err.message || 'Something went wrong while signing in with Google. Please try again.');
      setLoading(false);
    }
  };

  return (
    <div className="login-page-container">
      <button className="back-home-btn" onClick={() => navigate('/')} disabled={loading}>
        <ArrowLeft size={16} />
        <span>Back to home</span>
      </button>

      <div className="login-card-wrapper">
        <div className="login-brand-side">
          <div className="brand-overlay"></div>
          <div className="brand-content">
            <span className="brand-gold-tag"><Sparkles size={14} /> GownRent Portal</span>
            <h2>Where Elegance Meets Technology</h2>
            <p>Your one-stop destination for luxury gown rentals and 3D mannequin fitting.</p>
            <div className="brand-features-list">
              <div className="b-feature"><span className="b-icon">✨</span><p>Mrs. G Gown System</p></div>
              <div className="b-feature"><span className="b-icon">👗</span><p>Real-time Inventory Monitor</p></div>
            </div>
          </div>
        </div>

        <div className="login-form-side" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div className="login-form-header">
            <h3>Admin Secure Gateway</h3>
            <p>Sign in with your authorized Gmail account to access the portal.</p>
          </div>

          <div className="role-selector" style={{ marginBottom: '25px' }}>
            <div className="role-tab active" style={{ background: '#f59e0b', color: '#fff', width: '100%', justifyContent: 'center' }}>
              <LogIn size={16} />
              <span>Admin Portal Access</span>
            </div>
          </div>

          {error && (
            <div className="login-error-message" style={{ marginBottom: '20px', padding: '10px', background: '#fef2f2', color: '#ef4444', borderRadius: '6px', fontSize: '13px', textAlign: 'center' }}>
              {error}
            </div>
          )}

          {/* GOOGLE ACCESS BUTTON */}
          <button
            type="button"
            onClick={handleGoogleLogin}
            disabled={loading}
            className="google-login-btn"
            style={{
              width: '100%', padding: '14px', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#ffffff', color: '#334155', fontWeight: '600', fontSize: '15px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', cursor: 'pointer', boxShadow: '0 2px 4px rgba(0,0,0,0.05)', transition: 'all 0.2s ease'
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.53 12-4.53z" fill="#EA4335"/>
            </svg>
            <span>{loading ? 'Verifying Credentials...' : 'Continue with Gmail'}</span>
          </button>

          <p style={{ fontSize: '12px', color: '#94a3b8', textAlign: 'center', marginTop: '25px', lineHeight: '1.5' }}>
            Only Gmail accounts registered by the Super Admin can sign in.
          </p>

          <p className="login-footer-text" style={{ marginTop: '30px' }}>Protected by GownRent Security. © 2026</p>
        </div>
      </div>
    </div>
  );
};

export default Login;