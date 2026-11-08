import { useState, useEffect, useMemo, useCallback } from 'react';
import { HardDrive, Trash2, RefreshCw, Search, Box, Image as ImageIcon, FileText, Eye, X } from 'lucide-react';
import { supabase } from '../supabaseClient';
import Header from '../components/Header';
import '../styles/SuperAdmin.css';

const MODEL_BUCKET = 'gown-models';

// Tables to scan to find out which files are still in use.
// If another table holds images or 3D files, add it here.
const TABLES = ['gowns', 'accessories', 'petticoats', 'wedding_packages', 'wedding_reservations', 'bookings'];

const IMG_EXT = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'avif'];
const MODEL_EXT = ['glb', 'gltf'];
const extOf = (name) => (name.split('.').pop() || '').toLowerCase();
const kindOf = (name) => (IMG_EXT.includes(extOf(name)) ? 'image' : MODEL_EXT.includes(extOf(name)) ? 'model' : 'other');

const fmtSize = (b) => {
  if (b >= 1048576) return `${(b / 1048576).toFixed(1)} MB`;
  if (b >= 1024) return `${Math.round(b / 1024)} KB`;
  return `${b} B`;
};

const MARK = '/storage/v1/object/public/';

// Find every storage file referenced by a database value
const collectRefs = (value, key, out) => {
  if (value == null) return;
  if (typeof value === 'string') {
    const i = value.indexOf(MARK);
    if (i !== -1) {
      const rest = value.slice(i + MARK.length).split('?')[0];
      const slash = rest.indexOf('/');
      if (slash > 0) {
        let path = rest.slice(slash + 1);
        try { path = decodeURIComponent(path); } catch { /* keep the original */ }
        out.add(`${rest.slice(0, slash)}/${path}`);
      }
    } else if (key === 'model_path' && !value.startsWith('http') && !value.startsWith('/')) {
      out.add(`${MODEL_BUCKET}/${value}`);   // just a file name, stored in gown-models
    }
    return;
  }
  if (Array.isArray(value)) { value.forEach((v) => collectRefs(v, key, out)); return; }
  if (typeof value === 'object') Object.entries(value).forEach(([k, v]) => collectRefs(v, k, out));
};

// List every file in the bucket, including files inside folders
const listAll = async (bucket, prefix = '') => {
  const out = [];
  const { data, error } = await supabase.storage.from(bucket).list(prefix, {
    limit: 1000,
    sortBy: { column: 'name', order: 'asc' },
  });
  if (error) throw error;
  for (const item of data || []) {
    const path = prefix ? `${prefix}/${item.name}` : item.name;
    if (item.id === null) out.push(...(await listAll(bucket, path)));   // folder
    else out.push({ path, name: item.name, size: item.metadata?.size || 0, created: item.created_at });
  }
  return out;
};

const SuperStorage = () => {
  const [buckets, setBuckets] = useState([MODEL_BUCKET]);
  const [bucket, setBucket] = useState(MODEL_BUCKET);
  const [files, setFiles] = useState([]);
  const [used, setUsed] = useState(new Set());
  const [scanFailed, setScanFailed] = useState([]);
  const [loadingFiles, setLoadingFiles] = useState(true);
  const [selected, setSelected] = useState(new Set());
  const [filter, setFilter] = useState('all');   // all | unused | used
  const [search, setSearch] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(null);   // image shown in the large preview

  /* ---------- SCAN THE DATABASE (what is still in use?) ---------- */
  const scan = useCallback(async () => {
    const usedSet = new Set();
    const failed = [];
    await Promise.all(TABLES.map(async (t) => {
      const { data, error } = await supabase.from(t).select('*');
      if (error) { failed.push(t); return; }
      (data || []).forEach((row) => Object.entries(row).forEach(([k, v]) => collectRefs(v, k, usedSet)));
    }));
    setUsed(usedSet);
    setScanFailed(failed);

    const found = new Set([MODEL_BUCKET]);
    usedSet.forEach((k) => found.add(k.split('/')[0]));
    try {
      const { data } = await supabase.storage.listBuckets();
      (data || []).forEach((b) => found.add(b.name));
    } catch { /* may not be allowed, that is fine */ }
    setBuckets([...found]);
  }, []);

  /* ---------- LIST THE FILES IN THE BUCKET ---------- */
  const loadFiles = useCallback(async (b) => {
    setLoadingFiles(true);
    setSelected(new Set());
    try {
      const list = await listAll(b);
      setFiles(list.filter((f) => f.name !== '.emptyFolderPlaceholder'));
    } catch (err) {
      setFiles([]);
      setMsg('Could not list the files: ' + err.message + '. A select policy on storage.objects is needed (see the SQL).');
    }
    setLoadingFiles(false);
  }, []);

  useEffect(() => { scan(); }, [scan]);
  useEffect(() => { setMsg(''); loadFiles(bucket); }, [bucket, loadFiles]);

  const refresh = async () => { setMsg(''); await scan(); await loadFiles(bucket); };

  /* ---------- DERIVED ---------- */
  const rows = useMemo(() => files.map((f) => ({
    ...f,
    inUse: used.has(`${bucket}/${f.path}`),
    kind: kindOf(f.name),
    url: supabase.storage.from(bucket).getPublicUrl(f.path).data.publicUrl,
  })), [files, used, bucket]);

  const totalSize = rows.reduce((s, r) => s + r.size, 0);
  const unusedRows = rows.filter((r) => !r.inUse);
  const unusedSize = unusedRows.reduce((s, r) => s + r.size, 0);

  const q = search.trim().toLowerCase();
  const visible = rows.filter((r) =>
    (filter === 'all' || (filter === 'unused' ? !r.inUse : r.inUse)) &&
    (!q || r.path.toLowerCase().includes(q))
  );

  // If scanning gowns failed, "Unused" cannot be trusted
  const scanOk = !scanFailed.includes('gowns');

  /* ---------- SELECT / DELETE ---------- */
  const toggle = (path) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(path)) next.delete(path); else next.add(path);
    return next;
  });

  const selectUnused = () => setSelected(new Set(visible.filter((r) => !r.inUse).map((r) => r.path)));

  const handleDelete = async () => {
    const picked = rows.filter((r) => selected.has(r.path));
    if (picked.length === 0) return;
    const inUseCount = picked.filter((r) => r.inUse).length;
    const total = picked.reduce((s, r) => s + r.size, 0);

    let text = `Delete ${picked.length} file(s) (${fmtSize(total)}) from "${bucket}"?\n\nThis cannot be undone.`;
    if (inUseCount > 0) {
      text += `\n\nWARNING: ${inUseCount} of them are still used in the database. Their images or 3D models will disappear from the pages.`;
    }
    if (!window.confirm(text)) return;

    setBusy(true);
    setMsg('');
    const paths = picked.map((r) => r.path);
    let removed = 0;
    for (let i = 0; i < paths.length; i += 100) {
      const { data, error } = await supabase.storage.from(bucket).remove(paths.slice(i, i + 100));
      if (error) { setMsg('Delete failed: ' + error.message); break; }
      removed += (data || []).length;
    }
    setBusy(false);

    if (removed === paths.length) setMsg(`Deleted ${removed} file(s).`);
    else if (removed > 0) setMsg(`Only ${removed} of ${paths.length} were deleted. The delete policy may be missing.`);
    else if (!msg) setMsg('Nothing was deleted. A delete policy on storage.objects is needed (see the SQL).');

    await loadFiles(bucket);
  };

  const iconFor = (kind) => (kind === 'model' ? <Box size={32} /> : kind === 'image' ? <ImageIcon size={32} /> : <FileText size={32} />);

  return (
    <>
      <Header />
      <div className="sa-page">
        <div className="sa-hero">
          <h1><HardDrive size={22} /> Storage</h1>
          <p>View and delete unused images and 3D files in Supabase.</p>
        </div>

        <div className="sa-card">
          <div className="ss-toolbar">
            <div className="ss-chips">
              {buckets.map((b) => (
                <button key={b} type="button" className={`ss-chip ${bucket === b ? 'active' : ''}`} onClick={() => setBucket(b)}>
                  {b}
                </button>
              ))}
            </div>
            <button type="button" className="ss-btn" onClick={refresh} disabled={loadingFiles || busy}>
              <RefreshCw size={14} /> Refresh
            </button>
          </div>

          <div className="ss-stats">
            <div className="ss-stat"><span>Total files</span><strong>{rows.length}</strong></div>
            <div className="ss-stat"><span>Total size</span><strong>{fmtSize(totalSize)}</strong></div>
            <div className={`ss-stat ${scanOk && unusedRows.length > 0 ? 'warn' : ''}`}>
              <span>Unused</span>
              <strong>{scanOk ? `${unusedRows.length} (${fmtSize(unusedSize)})` : '?'}</strong>
            </div>
          </div>

          {scanFailed.length > 0 && (
            <p className="sa-msg">
              Could not scan these tables: {scanFailed.join(', ')}. "Unused" may be inaccurate. Check the tables or RLS.
            </p>
          )}

          <div className="ss-toolbar">
            <div className="sa-search" style={{ flex: '1 1 220px' }}>
              <Search size={14} className="sa-search-icon" />
              <input type="text" placeholder="Search files..." value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <div className="ss-chips">
              {[['all', 'All'], ['unused', 'Unused'], ['used', 'In use']].map(([k, label]) => (
                <button key={k} type="button" className={`ss-chip ${filter === k ? 'active' : ''}`} onClick={() => setFilter(k)}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="ss-toolbar">
            <button type="button" className="ss-btn" onClick={selectUnused} disabled={!scanOk || busy}>
              Select all unused
            </button>
            <button type="button" className="ss-btn" onClick={() => setSelected(new Set())} disabled={selected.size === 0 || busy}>
              Clear
            </button>
            <button type="button" className="ss-btn danger" onClick={handleDelete} disabled={selected.size === 0 || busy}>
              <Trash2 size={14} /> {busy ? 'Deleting...' : `Delete (${selected.size})`}
            </button>
          </div>

          {msg && <p className="sa-msg">{msg}</p>}

          {loadingFiles ? (
            <p className="sa-empty">Loading files...</p>
          ) : visible.length === 0 ? (
            <p className="sa-empty">No files found.</p>
          ) : (
            <div className="ss-grid">
              {visible.map((r) => (
                <div
                  key={r.path}
                  className={`ss-file ${selected.has(r.path) ? 'selected' : ''}`}
                  onClick={() => toggle(r.path)}
                >
                  <input type="checkbox" className="ss-check" checked={selected.has(r.path)} readOnly />
                  <span className={`sa-badge ss-tag ${r.inUse ? 'ok' : 'warn'}`}>{r.inUse ? 'In use' : 'Unused'}</span>
                  <div className="ss-thumb">
                    {r.kind === 'image'
                      ? <img src={r.url} alt={r.name} loading="lazy" />
                      : iconFor(r.kind)}
                    {r.kind === 'image' && (
                      <button
                        type="button"
                        className="ss-view"
                        title="View image"
                        aria-label={`View ${r.name}`}
                        onClick={(e) => { e.stopPropagation(); setPreview(r); }}
                      >
                        <Eye size={14} />
                      </button>
                    )}
                  </div>
                  <div className="ss-info">
                    <div className="ss-name" title={r.path}>{r.path}</div>
                    <div className="ss-meta">
                      <span>{fmtSize(r.size)}</span>
                      <span>{r.created ? new Date(r.created).toLocaleDateString() : ''}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {preview && (
        <div className="sm-overlay" onClick={() => setPreview(null)}>
          <div className="sm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="sm-head">
              <strong className="ss-lb-title">{preview.path}</strong>
              <button type="button" className="sm-x" onClick={() => setPreview(null)} aria-label="Close">
                <X size={18} />
              </button>
            </div>
            <div className="ss-lb-body">
              <img src={preview.url} alt={preview.name} />
            </div>
            <div className="ss-lb-foot">
              <span>{fmtSize(preview.size)}</span>
              <span className={`sa-badge ${preview.inUse ? 'ok' : 'warn'}`}>{preview.inUse ? 'In use' : 'Unused'}</span>
              <a href={preview.url} target="_blank" rel="noreferrer">Open in new tab</a>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default SuperStorage;