import { useState, useRef } from 'react';
import { DatabaseBackup, Download, FileSpreadsheet, Upload, ShieldCheck, Clock, Image as ImageIcon } from 'lucide-react';
import { supabase } from '../supabaseClient';
import SuperHeader from '../components/SuperHeader';
import { askConfirm, showAlert, DialogHost } from '../components/Dialogs';
import { downloadWorkbook } from '../utils/exportWorkbook';
import '../styles/SuperAdmin.css';
import '../styles/SuperBackup.css';

// Tables that are saved. Order matters for restore (parents first).
// A table that does not exist in your database is skipped automatically.
const TABLES = ['petticoats', 'accessories', 'gowns', 'bookings', 'wedding_packages', 'wedding_reservations'];
const LAST_KEY = 'mrsg_last_backup';

const readLast = () => { try { return localStorage.getItem(LAST_KEY) || ''; } catch { return ''; } };
const saveLast = (v) => { try { localStorage.setItem(LAST_KEY, v); } catch { /* ignore */ } };
const stamp = () => new Date().toISOString().slice(0, 10);

const download = (name, text, type) => {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
};

// Read every row (Supabase returns max 1000 per request)
const fetchAll = async (table) => {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from(table).select('*').range(from, from + 999);
    if (error) return { error };
    out.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return { rows: out };
};


/* ---------- PHOTOS & 3D FILES (Supabase Storage) ---------- */
const FIXED_BUCKETS = ['gown-models'];
const PART_LIMIT = 40 * 1024 * 1024;          // each photo backup file holds about 40 MB of photos
const decodeAll = (v) => { let o = v; for (let i = 0; i < 4; i++) { try { const d = decodeURIComponent(o); if (d === o) break; o = d; } catch { break; } } return o; };

// Bucket names are found from the links saved in the database, plus the 3D models bucket
const bucketsFromData = (data) => {
  const found = new Set(FIXED_BUCKETS);
  const text = JSON.stringify(data);
  const re = /\/storage\/v1\/object\/public\/([^/"\\]+)\//g;
  let m;
  while ((m = re.exec(text))) found.add(decodeAll(m[1]));
  return [...found];
};

const listAll = async (bucket, prefix = '') => {
  const out = [];
  const { data, error } = await supabase.storage.from(bucket).list(prefix, { limit: 1000, sortBy: { column: 'name', order: 'asc' } });
  if (error) throw error;
  for (const item of data || []) {
    const path = prefix ? `${prefix}/${item.name}` : item.name;
    if (item.id === null) out.push(...(await listAll(bucket, path)));
    else out.push({ bucket, path });
  }
  return out;
};

const toBase64 = (blob) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(String(r.result).split(',')[1] || '');
  r.onerror = reject;
  r.readAsDataURL(blob);
});

const IMG_EXT = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'avif'];
const MODEL_EXT = ['glb', 'gltf'];
const kindOf = (path) => {
  const e = (path.split('.').pop() || '').toLowerCase();
  return IMG_EXT.includes(e) ? 'images' : MODEL_EXT.includes(e) ? 'models' : 'other';
};
const fmtSize = (b) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : b >= 1024 ? `${Math.round(b / 1024)} KB` : `${b} B`);
const newStat = () => ({ images: 0, models: 0, other: 0, size: 0, failed: 0 });

const fromBase64Size = (b64) => Math.floor((b64.length * 3) / 4);
const fromBase64 = (b64, type) => {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: type || 'application/octet-stream' });
};

export default function SuperBackup() {
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');
  const [report, setReport] = useState([]);
  const [last, setLast] = useState(readLast());
  const fileRef = useRef(null);
  const photoRef = useRef(null);
  const [progress, setProgress] = useState('');
  const [photoReport, setPhotoReport] = useState(null);   // { title, rows: [{bucket, ...stat}] }

  const collect = async () => {
    const data = {}; const rep = [];
    for (const t of TABLES) {
      const r = await fetchAll(t);
      if (r.error) rep.push({ table: t, count: 0, note: 'skipped' });
      else { data[t] = r.rows; rep.push({ table: t, count: r.rows.length, note: 'saved' }); }
    }
    setReport(rep);
    return data;
  };

  const finish = (label) => {
    const now = new Date().toLocaleString();
    saveLast(now); setLast(now);
    setMsg(label);
  };

  const backupNow = async () => {
    setBusy('backup'); setMsg('');
    const data = await collect();
    const total = Object.values(data).reduce((a, r) => a + r.length, 0);
    download(`MrsG_Backup_${stamp()}.json`, JSON.stringify({ app: 'mrs-g-gown-rental', created: new Date().toISOString(), tables: data }, null, 2), 'application/json');
    finish(`Backup saved: ${total} records. Keep the file in Google Drive or a flash drive.`);
    setBusy('');
  };

  const backupExcel = async () => {
    setBusy('excel'); setMsg('');
    const data = await collect();
    const sheets = Object.entries(data).map(([name, rows]) => {
      const heads = rows.length ? Object.keys(rows[0]) : ['(empty)'];
      return {
        name, headers: heads,
        rows: rows.map(r => heads.map(h => {
          const v = r[h];
          return v !== null && typeof v === 'object' ? JSON.stringify(v) : (v ?? '');
        })),
      };
    });
    downloadWorkbook(`MrsG_Data_Copy_${stamp()}.xlsx`, sheets);
    finish('Excel copy saved (for reading only; use the JSON backup to restore).');
    setBusy('');
  };

  const restore = async (file) => {
    if (!file) return;
    let parsed;
    try { parsed = JSON.parse(await file.text()); } catch { parsed = null; }
    if (!parsed || parsed.app !== 'mrs-g-gown-rental' || !parsed.tables) {
      await showAlert('This is not a Mrs. G backup file. Please choose a .json file made by "Backup now".', { tone: 'error' });
      return;
    }
    const counts = TABLES.filter(t => parsed.tables[t]).map(t => `${t}: ${parsed.tables[t].length}`).join('\n');
    const ok = await askConfirm(
      `Restore data from this backup?\n\n${counts}\n\nRecords with the same ID will be overwritten with the backup version. Records that are not in the backup will NOT be deleted.`,
      { title: 'Restore backup?', tone: 'danger', confirmText: 'Yes, restore' }
    );
    if (!ok) return;

    setBusy('restore'); setMsg('');
    const rep = [];
    for (const t of TABLES) {
      const rows = parsed.tables[t];
      if (!rows || !rows.length) continue;
      let failed = '';
      for (let i = 0; i < rows.length; i += 200) {
        const { error } = await supabase.from(t).upsert(rows.slice(i, i + 200));
        if (error) { failed = error.message; break; }
      }
      rep.push({ table: t, count: rows.length, note: failed ? `failed: ${failed}` : 'restored' });
    }
    setReport(rep);
    setMsg(rep.some(r => r.note.startsWith('failed')) ? 'Restore finished with some errors (see the list below). Tables marked failed were NOT restored.' : 'Restore finished. All tables restored.');
    setBusy('');
    if (fileRef.current) fileRef.current.value = '';
  };


  const backupPhotos = async () => {
    setBusy('photos'); setMsg(''); setPhotoReport(null); setProgress('Looking for files…');
    try {
      const data = await collect();
      const buckets = bucketsFromData(data);
      const all = [];
      const skipped = [];
      for (const b of buckets) {
        try { all.push(...(await listAll(b))); } catch { skipped.push(b); }
      }
      if (!all.length) { setMsg('No photos or 3D files were found.'); setBusy(''); setProgress(''); return; }

      const day = stamp();
      // Photos and 3D models are saved in separate files so they are easy to tell apart
      const LABEL = { images: 'Photos', models: '3D-Models', other: 'Other-Files' };
      const order = { images: 0, models: 1, other: 2 };
      all.sort((a, b) => order[kindOf(a.path)] - order[kindOf(b.path)]);
      const parts = {};      // how many files were made per kind
      let curKind = '', size = 0, count = 0, chunks = [];
      const flush = () => {
        if (!chunks.length) return;
        parts[curKind] = (parts[curKind] || 0) + 1;
        const n = parts[curKind];
        const body = `{"app":"mrs-g-photos","kind":"${curKind}","created":"${new Date().toISOString()}","part":${n},"files":[${chunks.join(',')}]}`;
        download(`MrsG_${LABEL[curKind]}_${day}_part${n}.json`, body, 'application/json');
        size = 0; chunks = [];
      };
      let failed = 0;
      const stats = {};
      for (let i = 0; i < all.length; i++) {
        const f = all[i];
        setProgress(`Saving ${i + 1} of ${all.length}…`);
        const { data: blob, error } = await supabase.storage.from(f.bucket).download(f.path);
        const st = (stats[f.bucket] = stats[f.bucket] || newStat());
        if (error || !blob) { failed += 1; st.failed += 1; continue; }
        const kind = kindOf(f.path);
        if (kind !== curKind) { flush(); curKind = kind; }
        if (size > 0 && size + blob.size > PART_LIMIT) flush();
        chunks.push(JSON.stringify({ bucket: f.bucket, path: f.path, type: blob.type, data: await toBase64(blob) }));
        size += blob.size; count += 1;
        st[kindOf(f.path)] += 1; st.size += blob.size;
      }
      flush();
      setPhotoReport({ title: 'Saved in the backup', rows: Object.entries(stats).map(([bucket, v]) => ({ bucket, ...v })) });
      const summary = Object.entries(parts).map(([k, n]) => `${LABEL[k]}: ${n} file(s)`).join(', ');
      finish(`Saved ${count} file(s) (${summary}).${failed ? ` ${failed} could not be read.` : ''}${skipped.length ? ` Skipped buckets: ${skipped.join(', ')}.` : ''} Keep ALL the part files together.`);
    } catch (e) {
      setMsg(`Photo backup failed: ${e.message || e}`);
    }
    setBusy(''); setProgress('');
  };

  const restorePhotos = async (fileList) => {
    const picked = [...(fileList || [])];
    if (!picked.length) return;
    const ok = await askConfirm(
      `Restore photos and 3D files from ${picked.length} backup file(s)?\n\nFiles with the same name will be replaced by the backup version.`,
      { title: 'Restore photos?', tone: 'danger', confirmText: 'Yes, restore' }
    );
    if (!ok) { if (photoRef.current) photoRef.current.value = ''; return; }
    setBusy('photos-restore'); setMsg('');
    let done = 0, failed = 0; const errors = new Set(); const rstats = {};
    setPhotoReport(null);
    for (const file of picked) {
      let parsed;
      try { parsed = JSON.parse(await file.text()); } catch { parsed = null; }
      if (!parsed || parsed.app !== 'mrs-g-photos' || !Array.isArray(parsed.files)) { failed += 1; errors.add(`${file.name} is not a photo backup`); continue; }
      for (const f of parsed.files) {
        setProgress(`Restoring ${done + failed + 1}…`);
        const { error } = await supabase.storage.from(f.bucket).upload(f.path, fromBase64(f.data, f.type), { upsert: true, contentType: f.type || undefined });
        const st = (rstats[f.bucket] = rstats[f.bucket] || newStat());
        if (error) { failed += 1; st.failed += 1; errors.add(`${f.bucket}: ${error.message}`); } else { done += 1; st[kindOf(f.path)] += 1; st.size += fromBase64Size(f.data); }
      }
    }
    setPhotoReport({ title: 'Restored to Storage', rows: Object.entries(rstats).map(([bucket, v]) => ({ bucket, ...v })) });
    setMsg(`Restored ${done} file(s).${failed ? ` ${failed} failed (${[...errors].slice(0, 2).join('; ')}). If a bucket is missing, create it in Supabase first with the same name.` : ''}`);
    setBusy(''); setProgress('');
    if (photoRef.current) photoRef.current.value = '';
  };

  return (
    <>
      <DialogHost />
      <SuperHeader />
      <div className="sa-page">
        <div className="sa-hero">
          <h1><DatabaseBackup size={22} /> Backup &amp; Restore</h1>
          <p>Save a copy of all shop data and bring it back if something is lost or deleted.</p>
        </div>

        <div className="sa-card sb-card">
          <div className="sb-last"><Clock size={15} /> Last backup on this device: <b>{last || 'none yet'}</b></div>

          <div className="sb-grid">
            <div className="sb-box">
              <div className="sb-ico gold"><Download size={20} /></div>
              <h3>Backup now</h3>
              <p>Downloads one file (data only, no photos) with all gowns, accessories, petticoats, bookings and weddings. This file can be restored.</p>
              <button className="sb-btn gold" disabled={!!busy} onClick={backupNow}>{busy === 'backup' ? 'Saving…' : 'Backup now'}</button>
            </div>

            <div className="sb-box">
              <div className="sb-ico green"><FileSpreadsheet size={20} /></div>
              <h3>Excel copy</h3>
              <p>The same data as Excel sheets, easy to read and print. It cannot be restored into the system.</p>
              <button className="sb-btn green" disabled={!!busy} onClick={backupExcel}>{busy === 'excel' ? 'Saving…' : 'Download Excel copy'}</button>
            </div>

            <div className="sb-box">
              <div className="sb-ico red"><Upload size={20} /></div>
              <h3>Restore</h3>
              <p>Choose a backup file (.json). Records with the same ID are overwritten; nothing is deleted.</p>
              <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={(e) => restore(e.target.files?.[0])} />
              <button className="sb-btn red" disabled={!!busy} onClick={() => fileRef.current?.click()}>{busy === 'restore' ? 'Restoring…' : 'Choose backup file'}</button>
            </div>
          </div>


          <h4 className="sb-sub">Photos &amp; 3D files</h4>
          <div className="sb-grid">
            <div className="sb-box">
              <div className="sb-ico gold"><ImageIcon size={20} /></div>
              <h3>Backup photos</h3>
              <p>Saves all gown photos and 3D files from Storage. Photos and 3D models are saved in separate files (MrsG_Photos_… and MrsG_3D-Models_…). Keep them all together.</p>
              <button className="sb-btn gold" disabled={!!busy} onClick={backupPhotos}>{busy === 'photos' ? (progress || 'Saving…') : 'Backup photos'}</button>
            </div>
            <div className="sb-box">
              <div className="sb-ico red"><Upload size={20} /></div>
              <h3>Restore photos</h3>
              <p>Choose the photo backup file(s). You can pick all the parts at once. Same names are replaced.</p>
              <input ref={photoRef} type="file" multiple accept=".json,application/json" hidden onChange={(e) => restorePhotos(e.target.files)} />
              <button className="sb-btn red" disabled={!!busy} onClick={() => photoRef.current?.click()}>{busy === 'photos-restore' ? (progress || 'Restoring…') : 'Choose photo backup files'}</button>
            </div>
          </div>

          {photoReport && (
            <>
              <h4 className="sb-sub">{photoReport.title}</h4>
              <table className="sb-table">
                <thead><tr><th>Bucket</th><th>Images</th><th>3D models</th><th>Other</th><th>Size</th><th>Failed</th></tr></thead>
                <tbody>
                  {photoReport.rows.map(r => (
                    <tr key={r.bucket}>
                      <td>{r.bucket}</td><td>{r.images}</td><td>{r.models}</td><td>{r.other}</td><td>{fmtSize(r.size)}</td>
                      <td className={r.failed ? 'bad' : 'ok'}>{r.failed || 0}</td>
                    </tr>
                  ))}
                  <tr className="sb-total">
                    <td>Total</td>
                    <td>{photoReport.rows.reduce((a, r) => a + r.images, 0)}</td>
                    <td>{photoReport.rows.reduce((a, r) => a + r.models, 0)}</td>
                    <td>{photoReport.rows.reduce((a, r) => a + r.other, 0)}</td>
                    <td>{fmtSize(photoReport.rows.reduce((a, r) => a + r.size, 0))}</td>
                    <td>{photoReport.rows.reduce((a, r) => a + r.failed, 0)}</td>
                  </tr>
                </tbody>
              </table>
            </>
          )}

          {msg && <div className="sb-msg"><ShieldCheck size={15} /> {msg}</div>}

          {report.length > 0 && (
            <table className="sb-table">
              <thead><tr><th>Table</th><th>Records</th><th>Result</th></tr></thead>
              <tbody>{report.map(r => (
                <tr key={r.table}><td>{r.table}</td><td>{r.count}</td><td className={r.note.startsWith('failed') || r.note === 'skipped' ? 'bad' : 'ok'}>{r.note}</td></tr>
              ))}</tbody>
            </table>
          )}

          <p className="sb-tip">Tip: backup every week and keep the file in Google Drive and on a flash drive. Photos are saved separately with Backup photos.</p>
        </div>
      </div>
    </>
  );
}