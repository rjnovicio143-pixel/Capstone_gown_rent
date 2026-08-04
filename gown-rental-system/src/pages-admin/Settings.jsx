import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { Lock, UserCircle, Mail, Calendar, ShieldCheck, Eye, EyeOff, LogOut, User } from 'lucide-react';
import Header from '../components/Header';
import '../styles/Settings.css';

const Settings = () => {
  const [admin, setAdmin] = useState(null); // full row gikan sa "admins" table
  const [authMethod, setAuthMethod] = useState(null); // 'google' o 'password'
  const [loadingAdmin, setLoadingAdmin] = useState(true);

  // Account info form
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [accountFeedback, setAccountFeedback] = useState({ type: '', message: '' });
  const [savingAccount, setSavingAccount] = useState(false);

  // Password form
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPasswords, setShowPasswords] = useState(false);
  const [passwordFeedback, setPasswordFeedback] = useState({ type: '', message: '' });
  const [savingPassword, setSavingPassword] = useState(false);

  // --- Kuhaon ang naka-login nga admin. Ang Login.jsx nag-store sa
  //     'userToken' (= admins.id) ug 'userRole' (= 'admin') sa localStorage
  //     para sa TANANG admin login — password man o Google OAuth, parehas
  //     ra. Mao ni ang tinuod nga source of truth, dili pinaagi sa email.
  //
  //     Kung naa pud "pendingGoogleLink" sa sessionStorage (gibutang sa
  //     handleConnectGoogle), human sa Google redirect kay dinhi na-finish
  //     ang pag-link sa Google email ngadto sa original admin row. ---
  useEffect(() => {
    const loadAdmin = async () => {
      setLoadingAdmin(true);
      try {
        const { data: { session } } = await supabase.auth.getSession();

        // 1. Human mahuman ang Google redirect, i-finish ang pending link
        const pendingLinkRaw = sessionStorage.getItem('pendingGoogleLink');
        if (pendingLinkRaw && session?.user) {
          const pendingLink = JSON.parse(pendingLinkRaw);
          const googleEmail = session.user.email;

          const { error: linkError } = await supabase
            .from('admins')
            .update({ email: googleEmail, auth_provider: 'google' })
            .eq('id', pendingLink.adminId);

          sessionStorage.removeItem('pendingGoogleLink');

          if (linkError) {
            console.error("Error linking Google account:", linkError);
            setAccountFeedback({ type: 'error', message: 'Napakyas ang pag-link sa Google: ' + linkError.message });
          } else {
            setAccountFeedback({ type: 'success', message: 'Na-link na ang imong Google account! Google na ang gamiton mo-login sukad karon.' });
          }
        }

        // 2. Ang userToken (= admins.id) gikan sa localStorage ang tinuod
        //    nga source of truth, gibutang kini sa Login.jsx
        const userToken = localStorage.getItem('userToken');
        const userRole = localStorage.getItem('userRole');

        if (userRole !== 'admin' || !userToken) {
          setLoadingAdmin(false);
          return;
        }

        const { data, error } = await supabase
          .from('admins')
          .select('*')
          .eq('id', userToken)
          .single();

        if (error) throw error;

        setAdmin(data);
        setName(data.name || "");
        setEmail(data.email || "");
        // auth_provider column ang tinuod nga source of truth sa login method
        setAuthMethod(data.auth_provider || 'password');
      } catch (err) {
        console.error("Error loading admin account:", err);
      } finally {
        setLoadingAdmin(false);
      }
    };
    loadAdmin();
  }, []);

  // --- UPDATE NAME / EMAIL ---
  const handleUpdateAccount = async (e) => {
    e.preventDefault();
    if (!admin) return;
    setAccountFeedback({ type: '', message: '' });

    if (!name.trim() || !email.trim()) {
      return setAccountFeedback({ type: 'error', message: 'Ang ngalan ug email kinahanglan dili blangko.' });
    }

    setSavingAccount(true);
    try {
      const { error } = await supabase
        .from('admins')
        .update({ name: name.trim(), email: email.trim() })
        .eq('id', admin.id);

      if (error) throw error;

      const updatedAdmin = { ...admin, name: name.trim(), email: email.trim() };
      setAdmin(updatedAdmin);

      setAccountFeedback({ type: 'success', message: 'Na-update na ang account information!' });
    } catch (err) {
      console.error("Error updating account:", err);
      setAccountFeedback({ type: 'error', message: 'Naay sayop: ' + err.message });
    } finally {
      setSavingAccount(false);
    }
  };

  // --- CHANGE PASSWORD ---
  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (!admin) return;
    setPasswordFeedback({ type: '', message: '' });

    if (!currentPassword) {
      return setPasswordFeedback({ type: 'error', message: 'Isulat ang imong current password.' });
    }
    if (currentPassword !== admin.password) {
      return setPasswordFeedback({ type: 'error', message: 'Sayop ang imong current password.' });
    }
    if (!newPassword || newPassword.length < 4) {
      return setPasswordFeedback({ type: 'error', message: 'Ang bag-ong password kinahanglan at least 4 characters.' });
    }
    if (newPassword !== confirmPassword) {
      return setPasswordFeedback({ type: 'error', message: 'Ang bag-ong password ug confirm password dili managsama.' });
    }

    setSavingPassword(true);
    try {
      const { error } = await supabase
        .from('admins')
        .update({ password: newPassword })
        .eq('id', admin.id);

      if (error) throw error;

      setAdmin({ ...admin, password: newPassword });
      setPasswordFeedback({ type: 'success', message: 'Na-update na ang imong password!' });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      console.error("Error changing password:", err);
      setPasswordFeedback({ type: 'error', message: 'Naay sayop: ' + err.message });
    } finally {
      setSavingPassword(false);
    }
  };

  // --- CONNECT GOOGLE ACCOUNT ---
  // I-redirect sa Google OAuth. Pag-balik niini sa /admin/settings, ang
  // loadAdmin effect sa taas ang mag-finish sa pag-link (tan-awa ang
  // "pendingGoogleLink" handling sa ibabaw).
  const handleConnectGoogle = async () => {
    if (!admin) return;
    sessionStorage.setItem('pendingGoogleLink', JSON.stringify({ adminId: admin.id }));

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/admin/settings` }
    });

    if (error) {
      console.error("Error starting Google OAuth:", error);
      setAccountFeedback({ type: 'error', message: 'Naay sayop sa pag-connect sa Google: ' + error.message });
      sessionStorage.removeItem('pendingGoogleLink');
    }
    // Kung successful, mo-redirect dayon ang browser sa Google login screen.
  };

  // --- DISCONNECT GOOGLE, BALIK SA CUSTOM PASSWORD LOGIN ---
  const handleDisconnectGoogle = async () => {
    if (!admin) return;
    if (!window.confirm("Mo-disconnect sa Google? Mogamit na pud ka og custom password para mo-login human niini.")) return;

    try {
      const { error } = await supabase
        .from('admins')
        .update({ auth_provider: 'password' })
        .eq('id', admin.id);
      if (error) throw error;

      await supabase.auth.signOut();

      setAdmin({ ...admin, auth_provider: 'password' });
      setAuthMethod('password');
      setAccountFeedback({ type: 'success', message: 'Na-disconnect na ang Google. Gamit na pud sa imong password para mo-login.' });
    } catch (err) {
      console.error("Error disconnecting Google:", err);
      setAccountFeedback({ type: 'error', message: 'Naay sayop: ' + err.message });
    }
  };

  const handleLogout = async () => {
    if (!window.confirm("Mo-logout ka? Kinahanglan ka mo-login balik.")) return;
    try {
      if (authMethod === 'google') {
        await supabase.auth.signOut();
      }
    } catch (err) {
      console.error("Error signing out of Supabase Auth:", err);
    }
    localStorage.removeItem('userToken');
    localStorage.removeItem('userRole');
    window.location.href = '/login';
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return 'N/A';
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  };

  return (
    <>
      <Header />
      <div className="settings-container">
        <div className="settings-hero">
          <h1>Account Settings</h1>
          <p>I-manage ang imong account ug password</p>
        </div>

        {loadingAdmin ? (
          <p className="settings-loading-text">Loading account...</p>
        ) : !admin ? (
          <p className="settings-loading-text">Walay naka-login nga admin nga nakit-an. Palihug log in usab.</p>
        ) : (
          <div className="settings-grid">
            {/* Account Info Card */}
            <div className="settings-card">
              <div className="settings-card-header">
                <UserCircle size={20} color="#b8860b" />
                <h3>Account Information</h3>
                <span className={`method-badge inline ${authMethod === 'google' ? 'google' : 'password'}`}>
                  {authMethod === 'google' ? '🔵 Gmail Account' : '🔒 Custom Account'}
                </span>
              </div>

              <form className="account-form" onSubmit={handleUpdateAccount}>
                <label><User size={12} /> Full Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your full name"
                />

                <label><Mail size={12} /> Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  disabled={authMethod === 'google'}
                />
                {authMethod === 'google' && (
                  <span className="field-note">
                    🔒 Naka-link na ni sa imong Gmail — dili na ma-usab dinhi. I-disconnect una sa "Login Method" kung gusto nimo usbon.
                  </span>
                )}

                <div className="account-info-row readonly">
                  <ShieldCheck size={16} className="info-icon" />
                  <div>
                    <span>Role</span>
                    <p>{admin.role || 'admin'}</p>
                  </div>
                </div>

                <div className="account-info-row readonly">
                  <Calendar size={16} className="info-icon" />
                  <div>
                    <span>Account Created</span>
                    <p>{formatDate(admin.created_at)}</p>
                  </div>
                </div>

                {accountFeedback.message && (
                  <p className={`form-feedback ${accountFeedback.type}`}>{accountFeedback.message}</p>
                )}

                <button type="submit" className="btn-update-password" disabled={savingAccount}>
                  {savingAccount ? 'Saving...' : 'Save Account Info'}
                </button>

                <button type="button" className="btn-logout-all" onClick={handleLogout}>
                  <LogOut size={16} /> Logout
                </button>
              </form>
            </div>

            {/* Login Method Card */}
            <div className="settings-card login-method-card">
              <div className="settings-card-header">
                <ShieldCheck size={20} color="#b8860b" />
                <h3>Login Method</h3>
              </div>

              {authMethod === 'google' ? (
                <div className="login-method-body">
                  <span className="method-badge google">🔵 Google Account Linked</span>
                  <p className="method-desc">
                    Naka-login na ang account pinaagi sa Google ({admin.email}).
                    Dili na ma-gamit ang daan nga custom password para mo-login.
                  </p>
                  <button type="button" className="btn-disconnect-google" onClick={handleDisconnectGoogle}>
                    Disconnect Google Account
                  </button>
                </div>
              ) : (
                <div className="login-method-body">
                  <span className="method-badge password">🔒 Password Login</span>
                  <p className="method-desc">
                    I-connect ang imong tinuod nga Gmail dinhi aron makagamit ka
                    og "Login with Google" sukad karon imbes ang custom password.
                    Human ma-connect, Google na ra ang paagi para mo-access niini
                    nga account.
                  </p>
                  <button type="button" className="btn-connect-google" onClick={handleConnectGoogle}>
                    Connect Google Account
                  </button>
                </div>
              )}
            </div>

            {/* Change Password Card */}
            <div className="settings-card">
              <div className="settings-card-header">
                <Lock size={20} color="#b8860b" />
                <h3>Change Password</h3>
              </div>

              {authMethod === 'google' ? (
                <p className="google-auth-note">
                  Naka-login ka gamit ang imong Google account, mao nga walay
                  password dinhi nga ima-manage. I-usab ang password sa imong
                  Google Account settings kung kinahanglan.
                </p>
              ) : (
                <form className="password-form" onSubmit={handleChangePassword}>
                  <label>Current Password</label>
                  <div className="password-input-wrapper">
                    <input
                      type={showPasswords ? 'text' : 'password'}
                      placeholder="Enter current password"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                    />
                  </div>

                  <label>New Password</label>
                  <div className="password-input-wrapper">
                    <input
                      type={showPasswords ? 'text' : 'password'}
                      placeholder="At least 4 characters"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                    />
                  </div>

                  <label>Confirm New Password</label>
                  <div className="password-input-wrapper">
                    <input
                      type={showPasswords ? 'text' : 'password'}
                      placeholder="Re-type new password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                    />
                  </div>

                  <button type="button" className="toggle-visibility-btn" onClick={() => setShowPasswords(!showPasswords)}>
                    {showPasswords ? <EyeOff size={14} /> : <Eye size={14} />}
                    {showPasswords ? 'Hide Passwords' : 'Show Passwords'}
                  </button>

                  {passwordFeedback.message && (
                    <p className={`form-feedback ${passwordFeedback.type}`}>{passwordFeedback.message}</p>
                  )}

                  <button type="submit" className="btn-update-password" disabled={savingPassword}>
                    {savingPassword ? 'Updating...' : 'Update Password'}
                  </button>
                </form>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
};

export default Settings;