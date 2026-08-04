import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, ArrowLeft, LogIn, Mail, Lock, UserPlus } from 'lucide-react';
import '../styles-public/Login.css';

// Supabase client instance configuration driver
import { supabase } from '../supabaseClient';

const Login = ({ onLoginSuccess }) => {
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Form input control configuration states
  const [isSignUpMode, setIsSignUpMode] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');

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
  }, [navigate, onLoginSuccess]);

  // Shared processing cluster for identity routing parameters
  const handleUserSessionRouting = async (session) => {
    setError(''); // Limpyohan daan ang layout display error message parameters
    setLoading(true);
    const userEmail = session.user.email;
    const supabaseUID = session.user.id;

    console.log("Authenticated via Supabase verification layer. Target:", userEmail);

    // ================= [ADMIN LOOKUP VIA "admins" TABLE] =================
    // Dinamiko na ni — bisan kinsa nga admin nga naka-"Connect Google Account"
    // pinaagi sa Settings page (auth_provider = 'google', email = ilang
    // tinuod nga Gmail) makahimo na mo-login dinhi. Wala na'y hardcoded
    // nga single email bypass.
    try {
      const { data: adminByEmail, error: adminLookupError } = await supabase
        .from('admins')
        .select('*')
        .eq('email', userEmail)
        .single();

      if (!adminLookupError && adminByEmail) {
        localStorage.setItem('userToken', adminByEmail.id);
        localStorage.setItem('userRole', 'admin');

        if (typeof onLoginSuccess === 'function') {
          onLoginSuccess('admin');
        }

        setLoading(false);
        navigate('/admin/dashboard');
        return; // Undangon na ang execution thread diri
      }
    } catch (adminCheckErr) {
      console.error("Admin lookup via Google session failed:", adminCheckErr);
      // Padayon ra sa customer flow sa ubos kung mapakyas ang admin check
    }

    // ================= [CUSTOMER AUTH FLOW VIA NEW CUSTOMERS TABLE] =================
    try {
      // Mag-query sa bag-ong 'customers' table aron malikayan ang users_role_check blockage
      const { data: customerData, error: queryError } = await supabase
        .from('customers')
        .select('*')
        .eq('email', userEmail)
        .single();

      if (customerData) {
        // [A] KUNG NAA NA ANG REGISTRATION PROFILE SA CUSTOMERS DATA CLUSTER
        localStorage.setItem('userToken', customerData.id);
        localStorage.setItem('userRole', 'customer');

        if (typeof onLoginSuccess === 'function') {
          onLoginSuccess('customer');
        }

        navigate('/');
      } else {
        // ================= [B] AUTOMATIC NEW CUSTOMER PROVISIONING IN DEDICATED TABLE =================
        console.log("New customer tracking record initialized. Synchronizing database entry...");

        const googleName = session.user.user_metadata?.full_name || session.user.user_metadata?.name || "Valued Customer";

        const newCustomerProfile = {
          id: supabaseUID, // Gamiton ang Auth UID isip Primary Key sa table array
          email: userEmail,
          name: fullName || googleName,
          password: 'OAUTH_GOOGLE_VALIDATED_ACCOUNT' // Security bypass string for third-party allocation
        };

        const { error: insertError } = await supabase
          .from('customers')
          .insert([newCustomerProfile]);

        if (insertError) throw insertError;

        localStorage.setItem('userToken', supabaseUID);
        localStorage.setItem('userRole', 'customer');

        if (typeof onLoginSuccess === 'function') {
          onLoginSuccess('customer');
        }

        navigate('/');
      }
    } catch (err) {
      console.error("Supabase cross-verification query layer failed:", err);
      setError("Database linkage failed during background cross-verification storage processes.");
    } finally {
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
      setError(err.message || 'Verification system encountered an error routing context parameters.');
      setLoading(false);
    }
  };

  /// ================= MANUAL EMAIL & PASSWORD LOGIN (UPDATED: ADMIN + CUSTOMER) =================
  const handleEmailLogin = async (e) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Please fill in all fields.');
      return;
    }

    setError('');
    setLoading(true);

    try {
      // 1. Susiha una ang 'admins' table
      const { data: adminData, error: adminError } = await supabase
        .from('admins')
        .select('*')
        .eq('email', email)
        .eq('password', password)
        .single();

      if (!adminError && adminData) {
        // Kung naka-link na sa Google ang account (auth_provider = 'google'),
        // dili na siya pwede mo-login gamit ang daan nga custom password —
        // kinahanglan na siya mo-"Continue with Gmail" imbes.
        if (adminData.auth_provider === 'google') {
          throw new Error('Naka-link na ni nga account sa Google. Palihug gamit ang "Continue with Gmail" para mo-login.');
        }

        localStorage.setItem('userToken', adminData.id);
        localStorage.setItem('userRole', 'admin');
        if (typeof onLoginSuccess === 'function') onLoginSuccess('admin');
        navigate('/admin/dashboard');
        return;
      }

      // 2. KUNG DILI ADMIN, Susiha ang 'customers' table
      const { data: customerData, error: dbError } = await supabase
        .from('customers')
        .select('*')
        .eq('email', email)
        .single();

      if (dbError || !customerData || customerData.password !== password) {
        throw new Error('Invalid email or password.');
      }

      // 3. SUCCESSFUL CUSTOMER LOGIN
      localStorage.setItem('userToken', customerData.id);
      localStorage.setItem('userRole', 'customer');
      if (typeof onLoginSuccess === 'function') onLoginSuccess('customer');

      console.log("Manual operational validation parameters cleared successfully!");
      navigate('/');
    } catch (err) {
      console.error(err);
      setError(err.message || 'Invalid email or password.');
      setLoading(false);
    }
  };

  // ================= MANUAL EMAIL SIGN UP (CREATE STANDALONE CUSTOMER PROFILE) =================
  const handleEmailSignUp = async (e) => {
    e.preventDefault();
    if (!email || !password || !fullName) {
      setError('Please fill in all fields.');
      return;
    }

    setError('');
    setLoading(true);

    try {
      // Pag-generate og programmatic layout tracking id key sequence
      const generatedUID = crypto.randomUUID ? crypto.randomUUID() : "cust_" + Math.random().toString(36).substr(2, 9);

      // Diretso nga pagpasulod sa data control parameters ngadto sa bag-ong standalone configuration storage array
      const { error: dbInsertError } = await supabase
        .from('customers')
        .insert([{
          id: generatedUID,
          name: fullName,
          email: email,
          password: password // 🚀 Gi-save na ang password field parameter ngadto sa remote table!
        }]);

      if (dbInsertError) throw dbInsertError;

      // Automatic access initialization logic loop configuration properties
      localStorage.setItem('userToken', generatedUID);
      localStorage.setItem('userRole', 'customer');

      if (typeof onLoginSuccess === 'function') {
        onLoginSuccess('customer');
      }

      console.log("Data packet integrated inside active network clusters successfully.");
      navigate('/');
    } catch (err) {
      console.error(err);
      setError(err.message || 'Identity population processing framework exception found.');
    } finally {
      setLoading(false);
    }
  };

  // ================= FORGOT PASSWORD FUNCTION (LOCAL STABILITY BYPASS) =================
  const handleForgotPassword = () => {
    setError('System structural notice: Dynamic email notification parameters are adjusted for demo environment presentation.');
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
            <h3>{isSignUpMode ? 'Create Account' : 'Secure Gateway'}</h3>
            <p>{isSignUpMode ? 'Fill in your details below to register a portal access account.' : 'Please sign in using your credentials to validate your portal access.'}</p>
          </div>

          <div className="role-selector" style={{ marginBottom: '25px' }}>
            <div className="role-tab active" style={{ background: '#f59e0b', color: '#fff', width: '100%', justifyContent: 'center' }}>
              {isSignUpMode ? <UserPlus size={16} /> : <LogIn size={16} />}
              <span>{isSignUpMode ? 'Customer Registration' : 'Universal Portal Access'}</span>
            </div>
          </div>

          {error && (
            <div className="login-error-message" style={{ marginBottom: '20px', padding: '10px', background: '#fef2f2', color: '#ef4444', borderRadius: '6px', fontSize: '13px', textAlign: 'center' }}>
              {error}
            </div>
          )}

          {/* ================= MANUAL EMAIL & PASSWORD FORM INPUTS ================= */}
          <form onSubmit={isSignUpMode ? handleEmailSignUp : handleEmailLogin} style={{ display: 'flex', flexDirection: 'column', gap: '15px', marginBottom: '20px' }}>

            {isSignUpMode && (
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }}>👤</span>
                <input
                  type="text"
                  placeholder="Full Name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  style={{ width: '100%', padding: '12px 12px 12px 40px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px' }}
                  required
                />
              </div>
            )}

            <div style={{ position: 'relative' }}>
              <Mail size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
              <input
                type="email"
                placeholder="Email Address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={{ width: '100%', padding: '12px 12px 12px 40px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px' }}
                required
              />
            </div>

            <div style={{ position: 'relative' }}>
              <Lock size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
              <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={{ width: '100%', padding: '12px 12px 12px 40px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px' }}
                required
              />
            </div>

            {/* FORGOT PASSWORD LINK */}
            {!isSignUpMode && (
              <div style={{ textAlign: 'right' }}>
                <button
                  type="button"
                  onClick={handleForgotPassword}
                  style={{ background: 'none', border: 'none', color: '#f59e0b', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}
                >
                  Forgot Password?
                </button>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              style={{ width: '100%', padding: '12px', borderRadius: '8px', border: 'none', background: '#f59e0b', color: '#fff', fontWeight: '600', fontSize: '15px', cursor: 'pointer', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}
            >
              {loading ? 'Processing...' : isSignUpMode ? 'Register Account' : 'Sign In with Password'}
            </button>
          </form>

          {/* OAUTH OR DIVIDER */}
          <div style={{ display: 'flex', alignItems: 'center', textAlign: 'center', margin: '15px 0', color: '#94a3b8', fontSize: '13px' }}>
            <div style={{ flex: 1, height: '1px', background: '#e2e8f0' }}></div>
            <span style={{ padding: '0 10px' }}>or</span>
            <div style={{ flex: 1, height: '1px', background: '#e2e8f0' }}></div>
          </div>

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

          {/* SWITCH REGISTRATION/LOGIN MODE */}
          <div style={{ textAlign: 'center', marginTop: '20px' }}>
            <p style={{ fontSize: '13px', color: '#64748b' }}>
              {isSignUpMode ? 'Already have an account?' : "Don't have an account yet?"}{' '}
              <button
                type="button"
                onClick={() => { setIsSignUpMode(!isSignUpMode); setError(''); }}
                style={{ background: 'none', border: 'none', color: '#f59e0b', fontWeight: '700', cursor: 'pointer', textDecoration: 'underline' }}
              >
                {isSignUpMode ? 'Sign In Here' : 'Create Account / Sign Up'}
              </button>
            </p>
          </div>

          <p style={{ fontSize: '12px', color: '#94a3b8', textAlign: 'center', marginTop: '25px', lineHeight: '1.5' }}>
            The system automatically conducts integrated cross-layer verification using your registered identity parameters.
          </p>

          <p className="login-footer-text" style={{ marginTop: '30px' }}>Protected by GownRent Security. © 2026</p>
        </div>
      </div>
    </div>
  );
};

export default Login;