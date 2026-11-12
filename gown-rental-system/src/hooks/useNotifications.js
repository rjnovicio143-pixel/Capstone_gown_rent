import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../supabaseClient';

const READ_KEY = 'notifReadIds';
const DISMISS_KEY = 'notifDismissedIds';
const SYNC_EVENT = 'notif-state-changed';
const TYPE_ORDER = { online: 0, overdue: 1, due: 2 };

const load = (key) => {
  try { return new Set(JSON.parse(localStorage.getItem(key) || '[]')); }
  catch { return new Set(); }
};
// local cache only (fast first paint); the real copy lives in the `notification_state` table
const cache = (key, set) => {
  try { localStorage.setItem(key, JSON.stringify([...set])); } catch { /* ignore */ }
  window.dispatchEvent(new Event(SYNC_EVENT));   // tell the other components (Header <-> Notifications page)
};

// write-through to the database, so it survives logout / other browsers / other devices
const persist = async (ids, state) => {
  const rows = [...ids].map((notif_id) => ({ notif_id, state, updated_at: new Date().toISOString() }));
  if (!rows.length) return;
  const { error } = await supabase.from('notification_state').upsert(rows, { onConflict: 'notif_id' });
  if (error) console.error('Could not save the notification state:', error);
};

const pullState = async () => {
  const { data, error } = await supabase.from('notification_state').select('notif_id, state');
  if (error) { console.error('Could not load the notification state:', error); return; }
  const read = new Set();
  const gone = new Set();
  (data || []).forEach((r) => (r.state === 'dismissed' ? gone : read).add(r.notif_id));
  cache(READ_KEY, read);
  cache(DISMISS_KEY, gone);
};

export const timeAgo = (date) => {
  if (!date) return '';
  const diff = Math.max(0, Date.now() - new Date(date).getTime());
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'Just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d === 1) return 'Yesterday';
  if (d < 7) return `${d}d ago`;
  return new Date(date).toLocaleDateString();
};

const build = (bookings) => {
  const now = new Date();
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
  const out = [];

  bookings.forEach((b) => {
    if (b.return_status === 'pending' && b.is_online_hold) {
      if (b.hold_expires_at && new Date(b.hold_expires_at) < now) return;
      out.push({
        id: `online-${b.id}`, type: 'online', title: 'New online reservation',
        message: `${b.name} reserved "${b.gown_name}". Waiting for your confirmation.`,
        at: b.created_at,
      });
      return;
    }
    if (b.return_status !== 'claimed' || !b.return_date) return;
    const rd = new Date(b.return_date); rd.setHours(0, 0, 0, 0);

    if (rd.getTime() === tomorrow.getTime()) {
      out.push({
        id: `due-${b.id}`, type: 'due', title: 'Return due tomorrow',
        message: `${b.name} must return "${b.gown_name}" tomorrow.`, at: b.return_date,
      });
    } else if (rd.getTime() < today.getTime()) {
      const late = Math.floor((today.getTime() - rd.getTime()) / 86400000);
      out.push({
        id: `overdue-${b.id}`, type: 'overdue', title: 'Overdue return',
        message: `${b.name} is ${late} day${late === 1 ? '' : 's'} late returning "${b.gown_name}".`, at: b.return_date,
      });
    }
  });
  return out;
};

export const useNotifications = () => {
  const [raw, setRaw] = useState([]);
  const [loading, setLoading] = useState(true);
  const [readIds, setReadIds] = useState(() => load(READ_KEY));
  const [dismissed, setDismissed] = useState(() => load(DISMISS_KEY));

  const refresh = useCallback(async () => {
    const { data, error } = await supabase
      .from('bookings')
      .select('id, name, gown_name, return_date, return_status, is_online_hold, hold_expires_at, created_at')
      .or('return_status.eq.claimed,and(return_status.eq.pending,is_online_hold.eq.true)');
    if (!error) setRaw(build(data || []));
    else console.error('Error fetching notifications:', error);
    await pullState();
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 60 * 1000);
    // Realtime (needs Realtime enabled on `bookings`); the 60s refresh is the fallback
    const channel = supabase
      .channel(`notif-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' }, refresh)
      .subscribe();
    return () => { clearInterval(interval); supabase.removeChannel(channel); };
  }, [refresh]);

  // keep every component in sync
  useEffect(() => {
    const sync = () => { setReadIds(load(READ_KEY)); setDismissed(load(DISMISS_KEY)); };
    window.addEventListener(SYNC_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => { window.removeEventListener(SYNC_EVENT, sync); window.removeEventListener('storage', sync); };
  }, []);

  const notifications = useMemo(
    () => raw.filter((n) => !dismissed.has(n.id)).sort((a, b) => {
      const ua = readIds.has(a.id) ? 1 : 0;
      const ub = readIds.has(b.id) ? 1 : 0;
      if (ua !== ub) return ua - ub;                                   // unread first
      if (a.type !== b.type) return TYPE_ORDER[a.type] - TYPE_ORDER[b.type];
      return new Date(b.at || 0) - new Date(a.at || 0);                // newest first
    }),
    [raw, dismissed, readIds]
  );

  const unreadCount = notifications.filter((n) => !readIds.has(n.id)).length;

  const mark = (key, state, ids) => {
    const set = load(key);
    ids.forEach((id) => set.add(id));
    cache(key, set);
    persist(ids, state);
  };
  const markRead = (id) => mark(READ_KEY, 'read', [id]);
  const markAllRead = () => mark(READ_KEY, 'read', notifications.filter((n) => !readIds.has(n.id)).map((n) => n.id));
  const dismiss = (id) => mark(DISMISS_KEY, 'dismissed', [id]);
  const dismissAll = () => mark(DISMISS_KEY, 'dismissed', notifications.map((n) => n.id));
  const dismissRead = () => mark(DISMISS_KEY, 'dismissed', notifications.filter((n) => readIds.has(n.id)).map((n) => n.id));

  return { notifications, readIds, unreadCount, loading, refresh, markRead, markAllRead, dismiss, dismissAll, dismissRead };
};