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

// Removes everything older than 30 days (runs when a page or the Trash window opens)
export async function purgeExpired() {
  const cutoff = new Date(Date.now() - TRASH_DAYS * DAY).toISOString();
  await supabase.from('trash_bin').delete().lt('deleted_at', cutoff);
}

export async function restoreEntry(entry) {
  const { error } = await supabase.from(entry.table_name).upsert(entry.data);
  if (error) return { error };
  await supabase.from('trash_bin').delete().eq('id', entry.id);
  return { error: null };
}

export async function deleteForever(entry) {
  return supabase.from('trash_bin').delete().eq('id', entry.id);
}

export async function countTrash(tables) {
  const { count } = await supabase.from('trash_bin').select('id', { count: 'exact', head: true }).in('table_name', tables);
  return count || 0;
}

// Same as moveToTrash, but reads the real database row first (for pages that only keep a reshaped copy)
export async function moveToTrashById(table, id, label, detail = '') {
  const { data: row, error } = await supabase.from(table).select('*').eq('id', id).single();
  if (error || !row) return { error: error || new Error('Record not found.') };
  return moveToTrash(table, row, label, detail);
}