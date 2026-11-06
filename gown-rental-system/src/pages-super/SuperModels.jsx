import { useState, useEffect, Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Stage } from '@react-three/drei';
import { Box, Upload, Search, Link2, Eye, Trash2, X } from 'lucide-react';
import { supabase } from '../supabaseClient';
import Header from '../components/Header';
import '../styles/SuperAdmin.css';
import { Scene, CATEGORIES, makeBuild, DEFAULT_TWEAK, parseTweak, ModelErrorBoundary } from '../components/MannequinEngine';

const MODEL_BUCKET = 'gown-models';
const MAX_UPLOAD_MB = 45;               // Supabase free plan allows 50 MB per file
const PUBLIC_DIR = '/gown/';            // files in your project's public/gown folder

// Turn model_path into a real URL the 3D viewer can load
const toUrl = (path) => {
  if (!path) return null;
  if (path.startsWith('http') || path.startsWith('/')) return path;
  return supabase.storage.from(MODEL_BUCKET).getPublicUrl(path).data.publicUrl;
};

// Where does this model live?
const sourceOf = (path) => {
  if (!path) return null;
  if (path.startsWith('http')) return 'Link';
  if (path.startsWith('/')) return 'Public folder';
  return 'Storage';
};

const SuperModels = () => {
  const [gowns, setGowns] = useState([]);
  const [search, setSearch] = useState('');
  const [uploadingId, setUploadingId] = useState(null);
  const [linkId, setLinkId] = useState(null);      // row whose "link a file" box is open
  const [linkValue, setLinkValue] = useState('');
  const [linkMsg, setLinkMsg] = useState('');
  const [linkBusy, setLinkBusy] = useState(false);

  // Preview / adjust window
  const [pv, setPv] = useState(null);                 // gown being previewed
  const [pvCat, setPvCat] = useState(CATEGORIES[0]);  // which mannequin
  const [tweak, setTweak] = useState(DEFAULT_TWEAK);
  const [pvMsg, setPvMsg] = useState('');
  const [pvBusy, setPvBusy] = useState(false);
  const [pvDark, setPvDark] = useState(true);

  const fetchGowns = async () => {
    const { data, error } = await supabase
      .from('gowns')
      .select('id, name, category, image, is_posted, model_path, fit_adjust')
      .order('name', { ascending: true });
    if (error) console.error(error);
    else setGowns(data);
  };

  useEffect(() => { fetchGowns(); }, []);

  /* ---------- UPLOAD TO SUPABASE STORAGE (small files only) ---------- */
  const handleUpload = async (gown, e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    if (!gown.is_posted) {
      alert('Post the gown in Inventory first before adding a 3D model.');
      return;
    }
    if (!file.name.toLowerCase().endsWith('.glb')) {
      alert('Only .glb files are allowed.');
      return;
    }
    if (file.size > MAX_UPLOAD_MB * 1024 * 1024) {
      alert(
        `This file is ${(file.size / 1024 / 1024).toFixed(1)} MB. Storage only takes up to ${MAX_UPLOAD_MB} MB.\n\n` +
        'Compress it first (Draco, smaller textures), or put it in the public/gown folder and use "Link file".'
      );
      return;
    }

    setUploadingId(gown.id);
    const fileName = `${gown.id}_${Date.now()}.glb`;

    const { error: upErr } = await supabase.storage
      .from(MODEL_BUCKET)
      .upload(fileName, file, { contentType: 'model/gltf-binary' });

    if (upErr) {
      alert('Upload failed: ' + upErr.message);
      setUploadingId(null);
      return;
    }

    const { error: dbErr } = await supabase
      .from('gowns')
      .update({ model_path: fileName })
      .eq('id', gown.id);

    if (dbErr) alert('The file was uploaded but saving failed: ' + dbErr.message);

    setUploadingId(null);
    fetchGowns();
  };

  /* ---------- LINK A FILE (public folder or a web link): nothing is uploaded, only the path is saved ---------- */
  const openLink = (g) => {
    setLinkId(linkId === g.id ? null : g.id);
    setLinkValue(g.model_path && g.model_path.startsWith('/') ? g.model_path.replace(PUBLIC_DIR, '') : '');
    setLinkMsg('');
  };

  const handleLink = async (gown) => {
    const raw = linkValue.trim();
    if (!raw) { setLinkMsg('Type the file name, for example ruby_gown.glb'); return; }
    if (!gown.is_posted) { setLinkMsg('Post the gown in Inventory first.'); return; }

    // "ruby.glb" -> "/gown/ruby.glb";  "/gown/ruby.glb" and "https://..." stay as they are
    const path = raw.startsWith('http') || raw.startsWith('/') ? raw : PUBLIC_DIR + raw;
    if (!path.toLowerCase().split('?')[0].endsWith('.glb')) { setLinkMsg('The file must end with .glb'); return; }

    setLinkBusy(true);
    setLinkMsg('');

    // Make sure the file really is deployed (local files only; a missing file would otherwise return the website page)
    if (path.startsWith('/')) {
      try {
        const res = await fetch(path, { method: 'HEAD' });
        const type = res.headers.get('content-type') || '';
        if (!res.ok || type.includes('text/html')) {
          setLinkMsg(`Cannot find ${path}. Put the file in your project's public${path} and run/deploy again.`);
          setLinkBusy(false);
          return;
        }
      } catch (err) {
        setLinkMsg('Could not check the file: ' + err.message);
        setLinkBusy(false);
        return;
      }
    }

    const { error } = await supabase.from('gowns').update({ model_path: path }).eq('id', gown.id);
    setLinkBusy(false);
    if (error) { setLinkMsg('Saving failed: ' + error.message); return; }

    setLinkMsg('Saved.');
    setLinkId(null);
    fetchGowns();
  };

  /* ---------- PREVIEW + ADJUST ---------- */
  const openPreview = (g) => {
    setPv(g);
    setTweak(parseTweak(g.fit_adjust));
    setPvMsg('');
    const t = `${g.category || ''} ${g.name || ''}`.toLowerCase();
    setPvCat(CATEGORIES.find(c => c.id === 'Man') && /suit|tux|barong|\bman\b|\bmen\b|groom/.test(t) ? CATEGORIES[1] : CATEGORIES[0]);
  };
  const closePreview = () => setPv(null);
  const setT = (k) => (v) => { setTweak(prev => ({ ...prev, [k]: v })); setPvMsg(''); };

  const savePosition = async () => {
    setPvBusy(true);
    const { error } = await supabase.from('gowns').update({ fit_adjust: tweak }).eq('id', pv.id);
    setPvBusy(false);
    if (error) { setPvMsg('Saving failed: ' + error.message); return; }
    setPvMsg('Position saved. Customers will see it.');
    setGowns(prev => prev.map(g => (g.id === pv.id ? { ...g, fit_adjust: tweak } : g)));
    setPv(p => ({ ...p, fit_adjust: tweak }));
  };

  /* ---------- DELETE THE 3D MODEL (the gown itself stays) ---------- */
  const handleDelete = async (g) => {
    const where = sourceOf(g.model_path);
    const note =
      where === 'Storage' ? 'The file will also be removed from Supabase storage.'
      : where === 'Public folder' ? 'The file stays in your public/gown folder (delete it from GitHub if you do not need it).'
      : 'Only the link is removed.';
    if (!window.confirm(`Remove the 3D model of "${g.name}"?\n\nThe gown stays in Inventory. ${note}`)) return;

    const { error } = await supabase.from('gowns').update({ model_path: null, fit_adjust: null }).eq('id', g.id);
    if (error) { alert('Could not remove: ' + error.message); return; }

    if (where === 'Storage') {
      const { error: rmErr } = await supabase.storage.from(MODEL_BUCKET).remove([g.model_path]);
      if (rmErr) alert('The 3D model was unlinked, but the storage file could not be deleted: ' + rmErr.message);
    }
    if (pv?.id === g.id) setPv(null);
    fetchGowns();
  };

  const filtered = gowns.filter((g) =>
    g.name?.toLowerCase().includes(search.toLowerCase()) ||
    g.category?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <>
      <Header />
      <div className="sa-page">
        <div className="sa-hero">
          <h1><Box size={22} /> 3D Models</h1>
          <p>
            Small files: upload here. Big files: put the .glb in your project's <b>public/gown</b> folder,
            then press <b>Link file</b> and type the file name. Only the file name is saved, so storage is never used.
          </p>
        </div>

        <div className="sa-card">
          <div className="sa-search">
            <Search size={14} className="sa-search-icon" />
            <input
              type="text"
              placeholder="Search gown or category..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="sa-list">
            {filtered.length === 0 && <p className="sa-msg">No gowns found.</p>}
            {filtered.map((g) => (
              <div key={g.id}>
                <div className="sa-row">
                  <div className="sa-gown-info">
                    <div className="sa-thumb">
                      {g.image && <img src={g.image} alt={g.name} />}
                    </div>
                    <div>
                      <strong>{g.name}</strong>
                      <div className="sa-badges">
                        <span className={`sa-badge ${g.is_posted ? 'ok' : 'warn'}`}>
                          {g.is_posted ? 'Posted' : 'Not posted'}
                        </span>
                        <span className={`sa-badge ${g.model_path ? 'ok' : 'gray'}`}>
                          {g.model_path ? `3D · ${sourceOf(g.model_path)}` : 'No 3D'}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    {g.model_path && (
                      <>
                        <button type="button" className="sa-upload-btn" onClick={() => openPreview(g)} title="See it on the mannequin and adjust the position">
                          <Eye size={14} /> View / Adjust
                        </button>
                        <button type="button" className="sa-upload-btn" onClick={() => handleDelete(g)} title="Remove the 3D model" style={{ background: '#dc2626', border: 'none' }}>
                          <Trash2 size={14} /> Remove 3D
                        </button>
                      </>
                    )}
                    <button
                      type="button"
                      className={`sa-upload-btn ${!g.is_posted ? 'disabled' : ''}`}
                      onClick={() => g.is_posted && openLink(g)}
                      title="Use a file from the public folder (for big models)"
                    >
                      <Link2 size={14} /> Link file
                    </button>

                    <label
                      className={`sa-upload-btn ${(!g.is_posted || uploadingId === g.id) ? 'disabled' : ''}`}
                      title={!g.is_posted ? 'Post the gown first' : `Up to ${MAX_UPLOAD_MB} MB`}
                    >
                      <Upload size={14} />
                      {uploadingId === g.id ? 'Uploading...' : g.model_path ? 'Replace' : 'Upload'}
                      <input
                        type="file"
                        accept=".glb"
                        hidden
                        disabled={!g.is_posted || uploadingId === g.id}
                        onChange={(e) => handleUpload(g, e)}
                      />
                    </label>
                  </div>
                </div>

                {linkId === g.id && (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', padding: '8px 4px 14px' }}>
                    <input
                      style={{ flex: '1 1 220px', padding: '9px 12px', borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 13 }}
                      placeholder="File name in public/gown, e.g. ruby_gown.glb  (or a full https:// link)"
                      value={linkValue}
                      onChange={(e) => setLinkValue(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleLink(g); }}
                    />
                    <button type="button" className="sa-upload-btn" onClick={() => handleLink(g)} disabled={linkBusy}>
                      {linkBusy ? 'Checking...' : 'Save'}
                    </button>
                    {linkMsg && <p className="sa-msg" style={{ flexBasis: '100%', margin: 0 }}>{linkMsg}</p>}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {pv && (
        <div className="sm-overlay" onClick={closePreview}>
          <div className="sm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="sm-head">
              <strong>{pv.name}</strong>
              <button type="button" className="sm-x" onClick={closePreview} aria-label="Close"><X size={18} /></button>
            </div>

            <div className="sm-body">
              <div className={`sm-view ${pvDark ? 'dark' : 'light'}`}>
                <ModelErrorBoundary key={pv.id + pvCat.id}>
                  <Suspense fallback={<div className="sm-loading">Loading 3D…</div>}>
                    <Canvas key={pvCat.id} dpr={[1, 2]} camera={{ position: [0, 0.1, pvCat.kids ? 2.7 : 3.5], fov: 45 }}>
                      <ambientLight intensity={0.6} />
                      <directionalLight position={[6, 9, 6]} intensity={1.3} />
                      <directionalLight position={[-6, 4, -4]} intensity={0.6} color="#9db4ff" />
                      <Suspense fallback={null}>
                        <Stage environment={null} intensity={0.4} adjustCamera={false}>
                          <Scene
                            bodyPath={`/mannequin/${pvCat.file}.glb`}
                            gownPath={toUrl(pv.model_path)}
                            showBody
                            build={makeBuild(0, 0, 0, pvCat.kids)}
                            looseness={1}
                            length={1}
                            scale={[1, 1, 1]}
                            arms="down"
                            tweak={tweak}
                          />
                        </Stage>
                      </Suspense>
                      <OrbitControls enableZoom minDistance={1.2} maxDistance={6} />
                    </Canvas>
                  </Suspense>
                </ModelErrorBoundary>
              </div>

              <div className="sm-panel">
                <div className="sm-row">
                  {CATEGORIES.map((c) => (
                    <button key={c.id} type="button" className={`sa-upload-btn ${pvCat.id === c.id ? 'sm-on' : ''}`} onClick={() => setPvCat(c)}>{c.id}</button>
                  ))}
                  <button type="button" className="sa-upload-btn" onClick={() => setPvDark(d => !d)}>{pvDark ? 'Light bg' : 'Dark bg'}</button>
                </div>

                <label className="sm-check">
                  <input type="checkbox" checked={!!tweak.exact} onChange={(e) => { setTweak(prev => ({ ...prev, exact: e.target.checked })); setPvMsg(''); }} />
                  Exact position (gown placed in Blender)
                </label>

                {[['Size (whole gown)', 's', 0.7, 1.3], ['Up / down', 'y', -0.3, 0.3], ['Width', 'w', 0.7, 1.4], ['Depth (front to back)', 'd', 0.7, 1.4]].map(([label, k, min, max]) => (
                  <label key={k} className="sm-slider">
                    <span>{label} <b>{Number(tweak[k]).toFixed(2)}</b></span>
                    <input type="range" min={min} max={max} step="0.01" value={tweak[k]} onChange={(e) => setT(k)(parseFloat(e.target.value))} />
                  </label>
                ))}

                <div className="sm-row">
                  <button type="button" className="sa-upload-btn" onClick={savePosition} disabled={pvBusy}>{pvBusy ? 'Saving…' : 'Save position'}</button>
                  <button type="button" className="sa-upload-btn" onClick={() => { setTweak(DEFAULT_TWEAK); setPvMsg(''); }}>Reset</button>
                </div>
                {pvMsg && <p className="sa-msg" style={{ margin: 0 }}>{pvMsg}</p>}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default SuperModels;