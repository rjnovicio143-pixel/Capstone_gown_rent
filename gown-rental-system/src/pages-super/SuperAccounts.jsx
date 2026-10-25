import { useState, useEffect } from 'react';
import { UserCog, Plus } from 'lucide-react';
import { supabase } from '../supabaseClient';
import Header from '../components/Header';
import '../styles/SuperAdmin.css';

const SuperAccounts = () => {
  const [admins, setAdmins] = useState([]);
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [msg, setMsg] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchAdmins = async () => {
    const { data, error } = await supabase
      .from('admins')
      .select('id, name, email, role, created_at')   // ayaw i-select ang password
      .order('created_at', { ascending: false });
    if (error) console.error(error);
    else setAdmins(data);
  };

  useEffect(() => { fetchAdmins(); }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    setMsg('');
    if (!form.name || !form.email || form.password.length < 8) {
      setMsg('Kompletoha ang form. Ang password labing menos 8 ka characters.');
      return;
    }
    setSaving(true);
    const { error } = await supabase.from('admins').insert([{
      name: form.name.trim(),
      email: form.email.trim().toLowerCase(),
      password: form.password,       // tan-awa ang nota sa seguridad sa ubos
      role: 'admin',                 // naay padulong sa /admin/dashboard
      auth_provider: 'email',        // i-match sa gigamit sa imong Login
    }]);
    setSaving(false);

    if (error) {
      setMsg(error.code === '23505' ? 'Naa na ang email nga ni.' : error.message);
      return;
    }
    setForm({ name: '', email: '', password: '' });
    setMsg('Na-create na ang account.');
    fetchAdmins();
  };

  return (
    <>
      <Header />
      <div className="sa-page">
        <div className="sa-hero">
          <h1><UserCog size={22} /> Admin Accounts</h1>
          <p>Maghimo og account para sa ubang admin (booking/inventory side)</p>
        </div>

        <div className="sa-grid">
          <form className="sa-card" onSubmit={handleCreate}>
            <h3><Plus size={16} /> Bag-ong Admin</h3>
            <input placeholder="Pangalan" value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <input type="email" placeholder="Email" value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })} />
            <input type="password" placeholder="Password (8+ characters)" value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })} />
            <button type="submit" disabled={saving}>
              {saving ? 'Nag-save...' : 'Create Account'}
            </button>
            {msg && <p className="sa-msg">{msg}</p>}
          </form>

          <div className="sa-card">
            <h3>Mga Account</h3>
            <div className="sa-list">
              {admins.map((a) => (
                <div key={a.id} className="sa-row">
                  <div>
                    <strong>{a.name}</strong>
                    <span>{a.email}</span>
                  </div>
                  <span className={`sa-role ${a.role === 'super_admin' ? 'super' : ''}`}>
                    {a.role === 'super_admin' ? 'Super Admin' : 'Admin'}
                  </span>
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