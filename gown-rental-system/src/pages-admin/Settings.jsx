import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { Lock, UserCircle, Mail, Calendar, ShieldCheck, Eye, EyeOff, LogOut, User, CheckCircle2, AlertCircle, KeyRound, Link2 } from 'lucide-react';
import Header from '../components/Header';
import { askConfirm, DialogHost } from '../components/Dialogs';
import '../styles/Settings.css';

const Settings = () => {
  const [admin, setAdmin] = useState(null); // full row from the "admins" table
  const [authMethod, setAuthMethod] = useState(null); // 'google' or 'password'
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
            setAccountFeedback({ type: 'error', message: 'Could not link your Google account: ' + linkError.message });
          } else {
            setAccountFeedback({ type: 'success', message: 'Your Google account is now linked. You will sign in with Google from now on.' });
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
      return setAccountFeedback({ type: 'error', message: 'Name and email cannot be empty.' });
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

      setAccountFeedback({ type: 'success', message: 'Account information updated.' });
    } catch (err) {
      console.error("Error updating account:", err);
      setAccountFeedback({ type: 'error', message: 'Something went wrong: ' + err.message });
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
      return setPasswordFeedback({ type: 'error', message: 'Enter your current password.' });
    }
    if (currentPassword !== admin.password) {
      return setPasswordFeedback({ type: 'error', message: 'Your current password is incorrect.' });
    }
    if (!newPassword || newPassword.length < 4) {
      return setPasswordFeedback({ type: 'error', message: 'The new password must be at least 4 characters.' });
    }
    if (newPassword !== confirmPassword) {
      return setPasswordFeedback({ type: 'error', message: 'The new password and confirmation do not match.' });
    }

    setSavingPassword(true);
    try {
      const { error } = await supabase
        .from('admins')
        .update({ password: newPassword })
        .eq('id', admin.id);

      if (error) throw error;

      setAdmin({ ...admin, password: newPassword });
      setPasswordFeedback({ type: 'success', message: 'Password updated.' });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      console.error("Error changing password:", err);
      setPasswordFeedback({ type: 'error', message: 'Something went wrong: ' + err.message });
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
      setAccountFeedback({ type: 'error', message: 'Could not connect to Google: ' + error.message });
      sessionStorage.removeItem('pendingGoogleLink');
    }
    // Kung successful, mo-redirect dayon ang browser sa Google login screen.
  };

  const handleLogout = async () => {
    if (!(await askConfirm('Do you want to log out? You will need to sign in again.', { title: 'Log out?', confirmText: 'Yes, log out', tone: 'gold' }))) return;
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

  const initial = (name || admin?.name || 'A').trim().charAt(0).toUpperCase();
  const Feedback = ({ f }) => f.message ? (
    <p className={`form-feedback ${f.type}`}>
      {f.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
      <span>{f.message}</span>
    </p>
  ) : null;

  return (
    <>
      <Header />
      <DialogHost />
      <div className="settings-container">
        <div className="settings-hero">
          <h1>Account Settings</h1>
          <p>Manage your profile, sign-in method and password.</p>
        </div>

        {loadingAdmin ? (
          <p className="settings-loading-text">Loading account...</p>
        ) : !admin ? (
          <p className="settings-loading-text">No signed-in admin was found. Please log in again.</p>
        ) : (
          <div className="settings-grid">

            {/* ACCOUNT */}
            <div className="settings-card">
              <div className="profile-top">
                <div className="profile-avatar">{initial}</div>
                <div className="profile-who">
                  <strong>{admin.name || 'Admin'}</strong>
                  <span>{admin.email}</span>
                </div>
                <span className={`method-badge ${authMethod === 'google' ? 'google' : 'password'}`}>
                  {authMethod === 'google' ? 'Google account' : 'Password account'}
                </span>
              </div>

              <div className="settings-card-header">
                <UserCircle size={18} />
                <h3>Account Information</h3>
              </div>

              <form className="account-form" onSubmit={handleUpdateAccount}>
                <label><User size={13} /> Full name</label>
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your full name" />

                <label><Mail size={13} /> Email {authMethod === 'google' && <span className="locked-tag">locked</span>}</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="your@email.com" disabled={authMethod === 'google'} />
                {authMethod === 'google' && (
                  <span className="field-note"><Lock size={11} /> This email is linked to your Google account and cannot be changed.</span>
                )}

                <div className="info-pair">
                  <div className="info-tile">
                    <ShieldCheck size={16} className="info-icon" />
                    <div><span>Role</span><p>{admin.role || 'admin'}</p></div>
                  </div>
                  <div className="info-tile">
                    <Calendar size={16} className="info-icon" />
                    <div><span>Created</span><p>{formatDate(admin.created_at)}</p></div>
                  </div>
                </div>

                <Feedback f={accountFeedback} />

                <button type="submit" className="btn-update-password" disabled={savingAccount}>
                  {savingAccount ? 'Saving...' : 'Save Changes'}
                </button>
                <button type="button" className="btn-logout-all" onClick={handleLogout}>
                  <LogOut size={16} /> Log out
                </button>
              </form>
            </div>

            <div className="settings-col">
              {/* LOGIN METHOD */}
              <div className="settings-card">
                <div className="settings-card-header">
                  <Link2 size={18} />
                  <h3>Sign-in Method</h3>
                </div>

                {authMethod === 'google' ? (
                  <div className="login-method-body">
                    <div className="google-linked">
                      <span className="g-dot">G</span>
                      <div>
                        <strong>Google account linked</strong>
                        <span>{admin.email}</span>
                      </div>
                      <CheckCircle2 size={20} className="g-check" />
                    </div>
                    <p className="method-desc">
                      You sign in with this Google account. The link is permanent and cannot be disconnected.
                    </p>
                  </div>
                ) : (
                  <div className="login-method-body">
                    <span className="method-badge password">Password sign-in</span>
                    <p className="method-desc">
                      Connect your Gmail to use "Login with Google" instead of a password.
                      Once connected, Google becomes the only way to sign in to this account.
                    </p>
                    <button type="button" className="btn-connect-google" onClick={handleConnectGoogle}>
                      <span className="g-dot sm">G</span> Connect Google Account
                    </button>
                  </div>
                )}
              </div>

              {/* PASSWORD */}
              <div className="settings-card">
                <div className="settings-card-header">
                  <KeyRound size={18} />
                  <h3>Change Password</h3>
                </div>

                {authMethod === 'google' ? (
                  <p className="google-auth-note">
                    You sign in with Google, so there is no password to manage here.
                    Change your password in your Google Account settings if needed.
                  </p>
                ) : (
                  <form className="password-form" onSubmit={handleChangePassword}>
                    <label>Current password</label>
                    <div className="password-input-wrapper">
                      <input type={showPasswords ? 'text' : 'password'} placeholder="Enter current password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
                    </div>

                    <label>New password</label>
                    <div className="password-input-wrapper">
                      <input type={showPasswords ? 'text' : 'password'} placeholder="At least 4 characters" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
                    </div>

                    <label>Confirm new password</label>
                    <div className="password-input-wrapper">
                      <input type={showPasswords ? 'text' : 'password'} placeholder="Re-type new password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
                    </div>

                    <button type="button" className="toggle-visibility-btn" onClick={() => setShowPasswords(!showPasswords)}>
                      {showPasswords ? <EyeOff size={14} /> : <Eye size={14} />}
                      {showPasswords ? 'Hide passwords' : 'Show passwords'}
                    </button>

                    <Feedback f={passwordFeedback} />

                    <button type="submit" className="btn-update-password" disabled={savingPassword}>
                      {savingPassword ? 'Updating...' : 'Update Password'}
                    </button>
                  </form>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
};

export default Settings;