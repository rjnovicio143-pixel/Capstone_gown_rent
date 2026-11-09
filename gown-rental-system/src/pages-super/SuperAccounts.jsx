import { useState, useEffect } from 'react';
import { UserCog, Plus, Pencil, Trash2 } from 'lucide-react';
import { supabase } from '../supabaseClient';
import SuperHeader from '../components/SuperHeader';
import '../styles/SuperAdmin.css';

// Who is logged in right now (saved by Login.jsx)
const currentAdmin = () => {
  try { return JSON.parse(localStorage.getItem('admin') || '{}'); } catch { return {}; }
};

const EMPTY_FORM = { name: '', email: '', password: '', type: 'gmail', role: 'admin' };

const SuperAccounts = () => {
  const [admins, setAdmins] = useState([]);
  // type: 'gmail' = Google login (walay password), 'email' = email + password
  const [form, setForm] = useState(EMPTY_FORM);
  const [editing, setEditing] = useState(null);   // the account being edited (null = creating a new one)
  const [msg, setMsg] = useState('');
  const [saving, setSaving] = useState(false);

  const myId = currentAdmin().id || null;

  const fetchAdmins = async () => {
    const { data, error } = await supabase
      .from('admins')
      .select('id, name, email, role, auth_provider, created_at')   // never select the password
      .order('created_at', { ascending: false });
    if (error) console.error(error);
    else setAdmins(data);
  };

  useEffect(() => { fetchAdmins(); }, []);

  const isGmail = form.type === 'gmail';
  const superCount = admins.filter((a) => a.role === 'super_admin').length;

  /* ---------- EDIT ---------- */
  const startEdit = (a) => {
    setEditing(a);
    setForm({
      name: a.name || '',
      email: a.email || '',
      password: '',
      type: a.auth_provider === 'google' ? 'gmail' : 'email',
      role: a.role || 'admin',
    });
    setMsg('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const cancelEdit = () => {
    setEditing(null);
    setForm({ ...EMPTY_FORM, type: form.type });
    setMsg('');
  };

  /* ---------- CREATE / UPDATE ---------- */
  const handleSubmit = async (e) => {
    e.preventDefault();
    setMsg('');

    const email = form.email.trim().toLowerCase();
    if (!form.name.trim() || !email.includes('@')) {
      setMsg('Please fill in the name and a valid email.');
      return;
    }

    // A password is required for new accounts, or when switching from Gmail to Password
    const needPassword = !isGmail && (!editing || editing.auth_provider === 'google');
    if ((needPassword || (!isGmail && form.password)) && form.password.length < 8) {
      setMsg('The password must be at least 8 characters.');
      return;
    }

    if (editing && editing.role === 'super_admin' && form.role !== 'super_admin') {
      if (editing.id === myId) { setMsg('You cannot lower your own role.'); return; }
      if (superCount <= 1) { setMsg('There must be at least one Super Admin.'); return; }
    }

    const payload = {
      name: form.name.trim(),
      email,
      role: form.role,
      auth_provider: isGmail ? 'google' : 'email',
    };
    if (isGmail) payload.password = null;                 // Gmail: no password, Google verifies the user
    else if (form.password) payload.password = form.password;   // blank = keep the current password

    setSaving(true);
    let error = null;
    let changed = true;

    if (editing) {
      const res = await supabase.from('admins').update(payload).eq('id', editing.id).select('id');
      error = res.error;
      changed = (res.data || []).length > 0;
    } else {
      const res = await supabase.from('admins').insert([payload]);
      error = res.error;
    }
    setSaving(false);

    if (error) {
      if (error.code === '23505') setMsg('This email already exists.');
      else if (error.code === '23502') setMsg('The password column must allow null. Run the SQL provided.');
      else setMsg(error.message);
      return;
    }
    if (!changed) {
      setMsg('Nothing was saved. The admins table RLS policy may be blocking updates (an update policy is needed).');
      return;
    }

    // If I edited my own account, update the session saved in the browser
    if (editing && editing.id === myId) {
      localStorage.setItem('admin', JSON.stringify({ ...currentAdmin(), name: payload.name, email: payload.email, role: payload.role }));
      localStorage.setItem('userRole', payload.role);
    }

    setMsg(editing
      ? 'Changes saved.'
      : isGmail
        ? 'Added. They can now sign in with "Continue with Gmail".'
        : 'Account created.');
    setEditing(null);
    setForm({ ...EMPTY_FORM, type: form.type });
    fetchAdmins();
  };

  /* ---------- DELETE ---------- */
  const handleDelete = async (a) => {
    setMsg('');
    if (a.id === myId) { setMsg('You cannot delete your own account.'); return; }
    if (a.role === 'super_admin' && superCount <= 1) { setMsg('The last Super Admin cannot be deleted.'); return; }
    if (!window.confirm(`Delete the account of ${a.name} (${a.email})?\n\nThis cannot be undone.`)) return;

    const { data, error } = await supabase.from('admins').delete().eq('id', a.id).select('id');
    if (error) { setMsg(error.message); return; }
    if (!data || data.length === 0) {
      setMsg('Nothing was deleted. The admins table RLS policy may be blocking deletes (a delete policy is needed).');
      return;
    }
    if (editing?.id === a.id) cancelEdit();
    setMsg(`${a.name} was deleted.`);
    fetchAdmins();
  };

  const emailPlaceholder = isGmail ? 'Gmail (e.g. name@gmail.com)' : 'Email';
  const passPlaceholder = editing && editing.auth_provider === 'email'
    ? 'New password (leave blank to keep the current one)'
    : 'Password (8+ characters)';

  return (
    <>
      <SuperHeader />
      <div className="sa-page">
        <div className="sa-hero">
          <h1><UserCog size={22} /> Admin Accounts</h1>
          <p>Create accounts for other admins (booking / inventory side)</p>
        </div>

        <div className="sa-grid">
          <form className="sa-card" onSubmit={handleSubmit}>
            <h3>{editing ? <><Pencil size={16} /> Edit Account</> : <><Plus size={16} /> New Admin</>}</h3>

            <label className="sa-label" htmlFor="sa-type">Account type</label>
            <select
              id="sa-type"
              className="sa-select"
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value, password: '' })}
            >
              <option value="gmail">Gmail (Google login)</option>
              <option value="email">Email + password</option>
            </select>
            <p className="sa-hint">
              {isGmail
                ? 'Signs in with "Continue with Gmail". No password.'
                : 'Signs in with email and password.'}
            </p>

            <label className="sa-label" htmlFor="sa-role">Role</label>
            <select
              id="sa-role"
              className="sa-select"
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value })}
            >
              <option value="admin">Admin (booking / inventory)</option>
              <option value="super_admin">Super Admin</option>
            </select>

            <input
              type="text"
              placeholder="Name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
            <input
              type="email"
              placeholder={emailPlaceholder}
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
            {!isGmail && (
              <input
                type="password"
                placeholder={passPlaceholder}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
              />
            )}

            <button type="submit" disabled={saving}>
              {saving
                ? 'Saving...'
                : editing ? 'Save Changes' : isGmail ? 'Add Gmail Admin' : 'Create Account'}
            </button>
            {editing && (
              <button type="button" className="sa-btn-ghost" onClick={cancelEdit}>Cancel</button>
            )}
            {msg && <p className="sa-msg">{msg}</p>}
          </form>

          <div className="sa-card">
            <h3>Accounts <span className="sa-count">{admins.length}</span></h3>
            <div className="sa-list">
              {admins.length === 0 && <p className="sa-empty">No accounts yet.</p>}
              {admins.map((a) => (
                <div key={a.id} className={`sa-row ${editing?.id === a.id ? 'editing' : ''}`}>
                  <div className="sa-who">
                    <span className="sa-avatar">
                      {(a.name || a.email || '?').trim().charAt(0).toUpperCase()}
                    </span>
                    <div className="sa-who-text">
                      <strong>
                        {a.name}
                        {a.id === myId && <span className="sa-you">You</span>}
                      </strong>
                      <span className="sa-email">{a.email}</span>
                    </div>
                  </div>
                  <div className="sa-tags">
                    <span className={`sa-provider ${a.auth_provider === 'google' ? 'google' : ''}`}>
                      {a.auth_provider === 'google' ? 'Gmail' : 'Password'}
                    </span>
                    <span className={`sa-role ${a.role === 'super_admin' ? 'super' : ''}`}>
                      {a.role === 'super_admin' ? 'Super Admin' : 'Admin'}
                    </span>
                    <button type="button" className="sa-icon-btn" onClick={() => startEdit(a)} title="Edit" aria-label={`Edit ${a.name}`}>
                      <Pencil size={14} />
                    </button>
                    <button type="button" className="sa-icon-btn danger" onClick={() => handleDelete(a)} title="Delete" aria-label={`Delete ${a.name}`}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default SuperAccounts;