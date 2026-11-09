import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut, ChevronDown, ShieldCheck, UserCog, HardDrive, Box } from 'lucide-react';
import { supabase } from '../supabaseClient';
import '../styles/SuperHeader.css';

const SuperHeader = () => {
  const navigate = useNavigate();
  const [time, setTime] = useState(new Date());
  const [name, setName] = useState('Super Admin');
  const [email, setEmail] = useState('');
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Logged-in account (userToken = admins.id)
  useEffect(() => {
    (async () => {
      try {
        const id = localStorage.getItem('userToken');
        if (!id) return;
        const { data } = await supabase.from('admins').select('name, email').eq('id', id).single();
        if (data) { setName(data.name || data.email); setEmail(data.email || ''); }
      } catch (err) {
        console.error('Could not load the account:', err);
      }
    })();
  }, []);

  useEffect(() => {
    const onDown = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, []);

  const goTo = (path) => { setOpen(false); navigate(path); };

  const logout = async () => {
    setOpen(false);
    if (!window.confirm('Are you sure you want to log out?')) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) await supabase.auth.signOut();
    } catch (err) {
      console.error('Logout error:', err);
    }
    localStorage.clear();
    sessionStorage.clear();
    window.location.href = '/login';
  };

  const initial = (name || 'S').trim().charAt(0).toUpperCase();

  return (
    <header className="sh-header">
      <div className="sh-left">
        <ShieldCheck size={16} />
        <span>Super Admin Panel</span>
      </div>

      <div className="sh-right">
        <div className="sh-clock">
          {time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })}
        </div>

        <div className="sh-profile" ref={menuRef}>
          <button type="button" className={`sh-trigger ${open ? 'open' : ''}`} onClick={() => setOpen(!open)} aria-haspopup="menu" aria-expanded={open}>
            <span className="sh-avatar">{initial}</span>
            <span className="sh-meta">
              <span className="sh-name">{name}</span>
              <span className="sh-role">Super Admin</span>
            </span>
            <ChevronDown size={16} className="sh-chevron" />
          </button>

          {open && (
            <div className="sh-menu" role="menu">
              <div className="sh-card">
                <span className="sh-avatar large">{initial}</span>
                <div className="sh-card-info">
                  <strong>{name}</strong>
                  {email && <span>{email}</span>}
                  <em><ShieldCheck size={12} /> Super Admin</em>
                </div>
              </div>

              <div className="sh-list">
                <button type="button" role="menuitem" onClick={() => goTo('/super/accounts')}><UserCog size={16} /> Accounts</button>
                <button type="button" role="menuitem" onClick={() => goTo('/super/models')}><Box size={16} /> 3D Models</button>
                <button type="button" role="menuitem" onClick={() => goTo('/super/storage')}><HardDrive size={16} /> Storage</button>
              </div>

              <div className="sh-divider" />

              <div className="sh-list">
                <button type="button" role="menuitem" className="danger" onClick={logout}><LogOut size={16} /> Logout</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

export default SuperHeader;