import { useState, useEffect, useCallback } from 'react';
import { Trash2, RotateCcw, X, Clock } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { askConfirm, showAlert } from './Dialogs';
import { logActivity } from '../utils/activityLogger';
import { purgeExpired, restoreEntry, deleteForever, countTrash, daysLeft, TRASH_DAYS } from '../utils/Trash';
import '../styles/TrashModal.css';

const KIND = {
  gowns: 'Gown / Suit', accessories: 'Accessory', petticoats: 'Petticoat',
  bookings: 'Rental record', wedding_reservations: 'Wedding reservation', wedding_packages: 'Wedding package',
};

/* Button for the page header. Shows how many items are waiting in the Trash. */
export const TrashButton = ({ tables, refreshKey, onClick, className = '' }) => {
  const [n, setN] = useState(0);
  useEffect(() => { countTrash(tables).then(setN); /* eslint-disable-next-line */ }, [refreshKey, tables.join()]);
  return (
    <button type="button" className={`trash-btn ${className}`} onClick={onClick}>
      <Trash2 size={15} /> Trash{n > 0 && <span className="trash-btn-count">{n}</span>}
    </button>
  );
};

/* Window that lists deleted items. beforeRestore(entry) may return false to cancel
   (used to take stock again for a rental record). onChanged() lets the page reload. */
const TrashModal = ({ open, onClose, tables, title = 'Trash', beforeRestore, onChanged }) => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    await purgeExpired();
    const { data } = await supabase.from('trash_bin').select('*').in('table_name', tables).is('purged_at', null).order('deleted_at', { ascending: false });
    setRows(data || []);
    setLoading(false);
  }, [tables.join()]); // eslint-disable-line

  useEffect(() => { if (open) load(); }, [open, load]);
  if (!open) return null;

  const restore = async (r) => {
    setBusyId(r.id);
    try {
      if (beforeRestore && (await beforeRestore(r)) === false) return;
      const { error } = await restoreEntry(r);
      if (error) { showAlert(`Could not restore "${r.label}".\n\n${error.message}`, { tone: 'error' }); return; }
      await logActivity('trash_restored', `Restored from Trash: ${r.label}`);
      await load(); onChanged && onChanged();
    } finally { setBusyId(null); }
  };

  const remove = async (r) => {
    if (!(await askConfirm(`Remove "${r.label}" from the Trash?\n\nIt will no longer show here. The System Admin can still recover it for 30 more days (Backup & Restore > Recovery), and then it is erased for good.`, { title: 'Delete forever?', tone: 'danger', confirmText: 'Yes, delete' }))) return;
    setBusyId(r.id);
    const { error } = await deleteForever(r);
    setBusyId(null);
    if (error) { showAlert(error.message, { tone: 'error' }); return; }
    await logActivity('trash_deleted', `Permanently deleted: ${r.label}`);
    await load(); onChanged && onChanged();
  };

  const emptyAll = async () => {
    if (!rows.length) return;
    if (!(await askConfirm(`Remove all ${rows.length} item(s) from the Trash?\n\nThe System Admin can still recover them for 30 more days.`, { title: 'Empty Trash?', tone: 'danger', confirmText: 'Yes, empty Trash' }))) return;
    await supabase.from('trash_bin').update({ purged_at: new Date().toISOString() }).in('id', rows.map(r => r.id));
    await logActivity('trash_emptied', `Emptied the Trash (${rows.length} item(s))`);
    await load(); onChanged && onChanged();
  };

  return (
    <div className="trash-overlay" onClick={onClose}>
      <div className="trash-modal" onClick={e => e.stopPropagation()}>
        <div className="trash-head">
          <h2><Trash2 size={18} /> {title}</h2>
          <button type="button" className="trash-x" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </div>
        <p className="trash-note"><Clock size={13} /> Deleted items stay here for {TRASH_DAYS} days. After that they are hidden; the System Admin can still recover them for 30 more days before they are erased for good.</p>

        <div className="trash-list">
          {loading ? <p className="trash-empty">Loading…</p>
            : rows.length === 0 ? <p className="trash-empty">The Trash is empty.</p>
            : rows.map(r => {
              const left = daysLeft(r.deleted_at);
              return (
                <div key={r.id} className="trash-row">
                  <div className="trash-info">
                    <span className="trash-kind">{KIND[r.table_name] || r.table_name}</span>
                    <strong>{r.label}</strong>
                    {r.detail && <span className="trash-detail">{r.detail}</span>}
                    <span className={`trash-left ${left <= 5 ? 'soon' : ''}`}>
                      Deleted {new Date(r.deleted_at).toLocaleDateString()}{r.deleted_by ? ` by ${r.deleted_by}` : ''} · {left} day{left === 1 ? '' : 's'} left
                    </span>
                  </div>
                  <div className="trash-actions">
                    <button type="button" className="trash-restore" disabled={busyId === r.id} onClick={() => restore(r)}><RotateCcw size={14} /> Restore</button>
                    <button type="button" className="trash-forever" disabled={busyId === r.id} onClick={() => remove(r)}><Trash2 size={14} /></button>
                  </div>
                </div>
              );
            })}
        </div>

        {rows.length > 0 && <div className="trash-foot"><button type="button" className="trash-empty-btn" onClick={emptyAll}>Empty Trash</button></div>}
      </div>
    </div>
  );
};

export default TrashModal;