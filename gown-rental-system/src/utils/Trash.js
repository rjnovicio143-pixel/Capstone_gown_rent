import { supabase } from '../supabaseClient';

export const TRASH_DAYS = 30;
const DAY = 86400000;

export const daysLeft = (deletedAt) =>
  Math.max(0, Math.ceil((new Date(deletedAt).getTime() + TRASH_DAYS * DAY - Date.now()) / DAY));

const who = () => {
  try { const a = JSON.parse(localStorage.getItem('admin')); return a?.name || a?.email || ''; } catch { return ''; }
};

// Copies the row into trash_bin first, then removes it from its table.
// Returns { error } so the page can show a message.
export async function moveToTrash(table, row, label, detail = '') {
  const { data: saved, error: e1 } = await supabase
    .from('trash_bin')
    .insert({ table_name: table, record_id: String(row.id), label, detail, data: row, deleted_by: who() })
    .select('id').single();
  if (e1) return { error: e1 };

  const { error: e2 } = await supabase.from(table).delete().eq('id', row.id);
  if (e2) {
    await supabase.from('trash_bin').delete().eq('id', saved.id);   // undo the copy
    return { error: e2 };
  }
  return { error: null };
}

// Two steps, so a mistake can still be fixed:
//  1) Trash older than 30 days is moved to "recovery" (hidden from the Trash, still saved).
//  2) Items that stayed in recovery for 30 days are erased for good.
export async function purgeExpired() {
  const cutoff = new Date(Date.now() - TRASH_DAYS * DAY).toISOString();
  await supabase.from('trash_bin').update({ purged_at: new Date().toISOString() }).is('purged_at', null).lt('deleted_at', cutoff);
  await supabase.from('trash_bin').delete().not('purged_at', 'is', null).lt('purged_at', cutoff);
}

// Days left in recovery
export const recoveryDaysLeft = (purgedAt) =>
  Math.max(0, Math.ceil((new Date(purgedAt).getTime() + TRASH_DAYS * DAY - Date.now()) / DAY));

export async function restoreEntry(entry) {
  const { error } = await supabase.from(entry.table_name).upsert(entry.data);
  if (error) return { error };
  await supabase.from('trash_bin').delete().eq('id', entry.id);
  return { error: null };
}

// "Delete forever" in the Trash: hide it, but keep it in recovery for 30 more days
export async function deleteForever(entry) {
  return supabase.from('trash_bin').update({ purged_at: new Date().toISOString() }).eq('id', entry.id);
}

// Really erase (only used from the System Admin recovery list)
export async function eraseNow(entry) {
  return supabase.from('trash_bin').delete().eq('id', entry.id);
}

// A reserved / claimed rental holds a gown, so take its stock again. Returns an error message or ''.
export async function retakeBookingStock(row) {
  if (row.return_status !== 'reserved' && row.return_status !== 'claimed') return '';
  if (row.gown_id) {
    const { data: g } = await supabase.from('gowns').select('name, stock').eq('id', row.gown_id).single();
    if (g) {
      const next = (Number(g.stock) || 0) - 1;
      if (next < 0) return `No stock left for "${g.name}".`;
      await supabase.from('gowns').update({ stock: next, status: next > 0 ? 'Available' : 'Out of Stock' }).eq('id', row.gown_id);
    }
  }
  const out = [];
  for (const a of row.addons || []) {
    const { data: r } = await supabase.from('accessories').select('stock').eq('id', a.id).single();
    if (r) await supabase.from('accessories').update({ stock: Math.max(0, (Number(r.stock) || 0) - 1) }).eq('id', a.id);
    out.push({ ...a, held: true });
  }
  row.addons = out;
  return '';
}

export async function countTrash(tables) {
  const { count } = await supabase.from('trash_bin').select('id', { count: 'exact', head: true }).in('table_name', tables).is('purged_at', null);
  return count || 0;
}

// Same as moveToTrash, but reads the real database row first (for pages that only keep a reshaped copy)
export async function moveToTrashById(table, id, label, detail = '') {
  const { data: row, error } = await supabase.from(table).select('*').eq('id', id).single();
  if (error || !row) return { error: error || new Error('Record not found.') };
  return moveToTrash(table, row, label, detail);
}