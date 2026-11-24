import React, { useState, useEffect, useMemo, useRef, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Stage, Html } from '@react-three/drei';
import { Sliders, Ruler, Shirt, RotateCcw, Info, Calendar, Search, Crown, Check, X, Sun, Moon, Hand, Lock, Layers } from 'lucide-react';
import { supabase } from '../supabaseClient';
import {
  Scene, CATEGORIES, sizesFor, defaultSizeFor, makeBuild, parseGownSizes, checkSizeFit,
  audienceOf, audienceFits, AUDIENCE_LABEL, parseTweak, parseKidAges, nearestAdultSize, DEFAULT_LIM,
} from '../components/MannequinEngine';
import '../styles-public/Mannequin3D.css';

function SceneLoader() {
  return (
    <Html center>
      <div className="m3d-loader">
        <span className="m3d-loader-spin" />
        Loading model...
      </div>
    </Html>
  );
}

/* ---------- CONSTANTS ---------- */
const MODEL_BUCKET = 'gown-models';
const PAGE_SIZE = 8;               

const peso = (n) => `₱${Number(n || 0).toLocaleString()}`;

// Resolve model_path to a real URL:
//  - "https://..."      -> used as is
//  - "/gown/xxx.glb"    -> local file in the public folder
//  - "ruby_gown.glb"    -> file in the Supabase Storage bucket
const resolveModelUrl = (path) => {
  if (!path) return null;
  if (path.startsWith('http') || path.startsWith('/')) return path;
  const { data } = supabase.storage.from(MODEL_BUCKET).getPublicUrl(path);
  return data.publicUrl;
};

const mapGown = (row) => ({
  id: row.id,
  name: row.name,
  category: row.category || 'Others',
  price: row.price,
  discount: Math.min(50, Math.max(0, Number(row.discount_percent) || 0)),
  isNew: !!row.is_posted && !!(row.posted_at || row.created_at) && Date.now() - new Date(row.posted_at || row.created_at).getTime() < 14 * 86400000,
  thumbnail: row.image,
  modelPath: resolveModelUrl(row.model_path),
  sizes: parseKidAges(row.size) || parseGownSizes(row.size) || (row.size ? [row.size] : []),
  type: row.type,
  audience: row.audience || '',
  stock: Number(row.stock) || 0,
  petticoatLayer: row.petticoat_layer || null,
  includedAccessoryIds: row.included_accessories || [],
  fitAdjust: parseTweak(row.fit_adjust),   // gown position saved by the admin
  isExample: false,
});

const mapAccessory = (row) => ({
  id: row.id,
  name: row.name,
  category: row.category || 'Others',
  price: Number(row.price) || 0,
  modelPath: resolveModelUrl(row.model_path),
});

// Nothing is selected until the customer picks a gown (placeholder keeps the page logic simple)
const NO_GOWN = {
  id: 'none', name: '', category: '', price: 0, discount: 0, sizes: [], includedAccessoryIds: [],
  modelPath: null, fitAdjust: parseTweak(null), isExample: true,
};

const SLIDERS = [
  { key: 'width', label: 'Width' },
  { key: 'depth', label: 'Front & Back' },
];

const SIZE_LIMITS = [0.8, 1.3];   // fine-tune range (80% - 130%)
const DEFAULT_ADJUST = { height: 1, width: 1, depth: 1 };

// Tabs shown under the 3D view on tablet and mobile
const TABS = [
  { id: 'gowns',  label: 'Gowns',  icon: Shirt },
  { id: 'extras', label: 'Add-ons', icon: Crown },
  { id: 'body',   label: 'Body',   icon: Ruler },
  { id: 'fit',    label: 'Fit',    icon: Sliders },
];

const Mannequin3D = () => {
  const navigate = useNavigate();
  const stageRef = useRef(null);

  // Mannequin settings
  const [categoryId, setCategoryId] = useState('Woman');
  const category = CATEGORIES.find(c => c.id === categoryId) || CATEGORIES[0];
  const [selectedSize, setSelectedSize] = useState('M');
  const [modelScale, setModelScale] = useState(1.0);   // grows with size / age
  const [weight, setWeight] = useState(0);              // -1 slim ... +1 heavy
  const [belly, setBelly] = useState(0);                // 0 ... 1
  const [muscle, setMuscle] = useState(0);              // 0 ... 1
  const [adjust, setAdjust] = useState(DEFAULT_ADJUST);
  const [looseness, setLooseness] = useState(1.0);
  const [length, setLength] = useState(1.0);
  const [bodyRaw, setBodyRaw] = useState(null);         // measured avatar (from the 3D scene)
  const [activeTab, setActiveTab] = useState('closed');   // mobile bottom sheet: closed | gowns | extras | body | fit
  const [arms, setArms] = useState('down');             // down (default) | hide
  const [bgMode, setBgMode] = useState(() => {         // 3D background: dark | light
    try { return localStorage.getItem('mannequin-bg') === 'light' ? 'light' : 'dark'; } catch (e) { return 'dark'; }
  });
  const toggleBg = () => setBgMode((m) => {
    const next = m === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem('mannequin-bg', next); } catch (e) { /* ignore */ }
    return next;
  });
  const [adjTab, setAdjTab] = useState('build');        // desktop: Build / Fine-tune switch

  // Data
  const [gowns, setGowns] = useState([]);
  const [accessories, setAccessories] = useState([]);
  const [loadingData, setLoadingData] = useState(true);

  // Selection
  const [selectedGown, setSelectedGown] = useState(NO_GOWN);
  const [wearing, setWearing] = useState(false); // nothing is worn until the customer picks a gown

  // Gown filters
  const [search, setSearch] = useState('');
  const [gownCat, setGownCat] = useState('All');
  const [only3D, setOnly3D] = useState(false);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  /* ---------- FETCH POSTED GOWNS + ACCESSORIES ---------- */
  useEffect(() => {
    const load = async () => {
      const [gRes, aRes] = await Promise.all([
        supabase
          .from('gowns')
          .select('*')
          .eq('is_posted', true)
          .gt('price', 0)
          .order('created_at', { ascending: false }),
        supabase.from('accessories').select('*').order('category', { ascending: true }),
      ]);

      if (gRes.error) console.error('Error fetching gowns:', gRes.error);
      if (aRes.error) console.error('Error fetching accessories:', aRes.error);

      // Gowns that already have a 3D file come first
      const mapped = (gRes.data || [])
        .map(mapGown)
        .sort((a, b) => Number(!!b.modelPath) - Number(!!a.modelPath));

      setGowns(mapped);
      setAccessories((aRes.data || []).map(mapAccessory));

      setLoadingData(false);
    };
    load();
  }, []);

  /* ---------- LIVE UPDATE: pick up the admin's saved limits / pose / position without refreshing ---------- */
  useEffect(() => {
    let alive = true;
    const refreshFit = async () => {
      const { data, error } = await supabase.from('gowns').select('id, fit_adjust, stock').eq('is_posted', true);
      if (!alive || error || !data) return;
      const fresh = new Map(data.map((r) => [String(r.id), { fit: parseTweak(r.fit_adjust), stock: Number(r.stock) || 0 }]));
      const changed = (g, f) => !!f && (JSON.stringify(g.fitAdjust) !== JSON.stringify(f.fit) || g.stock !== f.stock);
      const merge = (g) => { const f = fresh.get(String(g.id)); return changed(g, f) ? { ...g, fitAdjust: f.fit, stock: f.stock } : g; };
      setGowns((prev) => (prev.some((g) => changed(g, fresh.get(String(g.id)))) ? prev.map(merge) : prev));
      setSelectedGown((g) => (g && g.id !== 'none' ? merge(g) : g));
    };
    const onVisible = () => { if (document.visibilityState === 'visible') refreshFit(); };
    const timer = setInterval(refreshFit, 15000);
    window.addEventListener('focus', refreshFit);
    document.addEventListener('visibilitychange', onVisible);
    let channel = null;
    try {   // instant update if Realtime is switched on for the gowns table; harmless if not
      channel = supabase.channel('gowns-fit').on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'gowns' }, refreshFit).subscribe();
    } catch (e) { /* ignore */ }
    return () => {
      alive = false; clearInterval(timer);
      window.removeEventListener('focus', refreshFit);
      document.removeEventListener('visibilitychange', onVisible);
      if (channel) supabase.removeChannel(channel);
    };
  }, []);

  /* ---------- GOWN LIST (search, filters, show more) ---------- */
  const allGowns = gowns;
  const categories = ['All', ...new Set(allGowns.map(g => g.category).filter(Boolean))];

  const q = search.trim().toLowerCase();
  const filteredGowns = allGowns.filter(g =>
    (gownCat === 'All' || g.category === gownCat) &&
    (!only3D || !!g.modelPath) &&
    (!q || g.name?.toLowerCase().includes(q))
  );
  const visibleGowns = filteredGowns.slice(0, visibleCount);
  const remaining = filteredGowns.length - visibleGowns.length;
  const hasFilters = !!q || gownCat !== 'All' || only3D;

  const changeSearch   = (v) => { setSearch(v);   setVisibleCount(PAGE_SIZE); };
  const changeCategory = (v) => { setGownCat(v); setVisibleCount(PAGE_SIZE); };
  const changeOnly3D   = ()  => { setOnly3D(p => !p); setVisibleCount(PAGE_SIZE); };
  const clearFilters   = ()  => { setSearch(''); setGownCat('All'); setOnly3D(false); setVisibleCount(PAGE_SIZE); };

  /* ---------- ACCESSORIES ---------- */
  const includedIds = selectedGown.includedAccessoryIds || [];
  const includedAccs = accessories.filter(a => includedIds.includes(a.id));
  const hasPackage = !!selectedGown.petticoatLayer || includedAccs.length > 0;

  // Accessories are part of the gown's own 3D model: they are shown as information only (not selectable, not charged)
  const gownPrice = Math.round((Number(selectedGown.price) || 0) * (1 - (selectedGown.discount || 0) / 100));

  /* ---------- MANNEQUIN ---------- */
  const bodyModelPath = `/mannequin/${category.file}.glb`;
  const isDefault = Object.keys(DEFAULT_ADJUST).every(k => adjust[k] === DEFAULT_ADJUST[k]);
  const build = useMemo(
    () => makeBuild(weight, belly, muscle, category.kids),
    [weight, belly, muscle, category.kids]
  );

  const resetAdjust = () => setAdjust(DEFAULT_ADJUST);

  // Load a size / age preset: scale + weight, and reset belly / muscle / fine-tune
  const applyPreset = (cat, label) => {
    const list = sizesFor(cat);
    const p = list.find(x => x.label === label) || list[0];
    setSelectedSize(p.label);
    setModelScale(p.scale);
    setWeight(p.weight || 0);
    setBelly(p.belly || 0);
    setMuscle(0);
    resetAdjust();
  };

  const handleSizeChange = (size) => applyPreset(category, size);

  // Limits and the Away pose are set by the admin for each gown
  // Without a gown on, the customer can adjust freely. Limits and the pose rule only apply once a gown is worn.
  const lim = (wearing && selectedGown?.fitAdjust?.lim) || DEFAULT_LIM;
  const awayOk = !wearing || !!selectedGown?.fitAdjust?.away;
  // Height limit: the admin sets it in cm; the slider is a multiplier on the size, so convert
  const heightRange = (() => {
    const cm = lim.hcm;
    const base = bodyRaw?.height ? bodyRaw.height * 100 * modelScale : 0;
    if (!cm || !base) return lim.height;
    const a = Math.min(1.3, Math.max(0.8, cm[0] / base));
    const b = Math.min(1.3, Math.max(0.8, cm[1] / base));
    return a <= b ? [a, b] : [b, b];
  })();
  const [poseMsg, setPoseMsg] = useState('');
  const [heightText, setHeightText] = useState(null);   // what the customer is typing in the height box
  const pickArms = (id) => {
    if (id === 'away' && !awayOk) { setPoseMsg('This pose is not available for this 3D model.'); return; }
    setPoseMsg(''); setArms(id);
  };
  useEffect(() => { if (arms === 'away' && !awayOk) setArms('down'); setPoseMsg(''); }, [selectedGown?.id, wearing]); // eslint-disable-line react-hooks/exhaustive-deps
  // keep the sliders inside the admin's limits (also after choosing a size or another gown)
  const clampTo = (v, [a, b]) => Math.min(b, Math.max(a, v));
  useEffect(() => {
    setAdjust((prev) => (prev.height !== clampTo(prev.height, heightRange) ? { ...prev, height: clampTo(prev.height, heightRange) } : prev));
    setHeightText(null);
    setBelly((v) => clampTo(v, lim.belly));
    setMuscle((v) => clampTo(v, lim.muscle));
  }, [selectedGown?.id, wearing, selectedSize, JSON.stringify(lim), bodyRaw?.height, modelScale]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCategoryChange = (id) => {
    const cat = CATEGORIES.find(c => c.id === id) || CATEGORIES[0];
    setCategoryId(id);
    applyPreset(cat, defaultSizeFor(cat));
  };

  /* ---------- CAN THIS AVATAR WEAR THIS GOWN? ---------- */
  const audienceOk = selectedGown.isExample || audienceFits(audienceOf(selectedGown), category);
  const gownSizes = useMemo(
    () => (category.kids || selectedGown.isExample ? null : parseGownSizes(selectedGown.sizes?.join(', '))),
    [category.kids, selectedGown]
  );
  // Kids: the gown is sized by age (set in Inventory), so the avatar's age must be inside that range
  const kidAges = useMemo(
    () => (category.kids && !selectedGown.isExample ? parseKidAges(selectedGown.sizes?.join(', ')) : null),
    [category.kids, selectedGown]
  );
  const ageOk = !kidAges || kidAges.includes(selectedSize);
  const sizeCheck = useMemo(
    () => checkSizeFit(bodyRaw, build, gownSizes, adjust.width * modelScale, adjust.depth * modelScale),
    [bodyRaw, build, gownSizes, adjust.width, adjust.depth, modelScale]
  );
  // The Body size buttons follow the body: moving Weight / Belly / Muscle or the fine-tune sliders picks the matching size
  useEffect(() => {
    if (category.kids) return;
    const near = nearestAdultSize(bodyRaw, build, adjust.width * modelScale, adjust.depth * modelScale);
    if (near && near !== selectedSize) setSelectedSize(near);
  }, [bodyRaw, build, adjust.width, adjust.depth, modelScale, category.kids]); // eslint-disable-line react-hooks/exhaustive-deps

  const canWear = audienceOk && ageOk && (!sizeCheck || sizeCheck.ok);

  // Selecting a gown loads its package, switches to the matching avatar, and brings the 3D view into sight on small screens
  const handleSelectGown = (gown) => {
    setSelectedGown(gown);
    setWearing(true);
    setLooseness(1.0);
    setLength(1.0);

    let cat = category;
    if (!gown.isExample && !audienceFits(audienceOf(gown), category)) {
      cat = CATEGORIES.find(c => audienceFits(audienceOf(gown), c)) || category;
      setCategoryId(cat.id);
    }
    const allowed = gown.isExample ? null : (cat.kids ? parseKidAges(gown.sizes?.join(', ')) : parseGownSizes(gown.sizes?.join(', ')));
    const curSize = cat === category ? selectedSize : defaultSizeFor(cat);
    if (allowed && !allowed.includes(curSize)) applyPreset(cat, allowed[0]);
    else if (cat !== category) applyPreset(cat, defaultSizeFor(cat));

    if (window.innerWidth <= 1100) {
      setActiveTab('closed');   // close the sheet so the gown is visible
      stageRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const soldOut = wearing && !selectedGown.isExample && Number(selectedGown.stock) < 1;

  const handleReserve = () => {
    if (soldOut) return;
    navigate('/reserve', {
      state: {
        gown: {
          id: selectedGown.id,
          name: selectedGown.name,
          price: gownPrice,
          originalPrice: selectedGown.price,
          discount: selectedGown.discount || 0,
          image: selectedGown.thumbnail,
          category: selectedGown.category,
          size: selectedGown.sizes?.includes(selectedSize) ? selectedSize : (selectedGown.sizes?.[0] || ''),
        },
        extras: [],   // accessories come with the gown, nothing is added on top
      },
    });
  };

  return (
    <div className="m3d-page">
      <div className="m3d-container">

        {/* ================= HEADER ================= */}
        <header className="m3d-header">
          <span className="m3d-eyebrow">Virtual Fitting</span>
          <h1>3D Mannequin <span>Fitting</span></h1>
          <p>Choose a body type and size, then try a gown and accessories on the mannequin.</p>
        </header>

        <div className="m3d-layout" data-tab={activeTab}>

          {/* ================= LEFT: CONTROLS ================= */}
          <aside className="m3d-controls">

            <div className="m3d-card m3d-pane-body">
              <h3><span className="m3d-step">1</span> Who is trying it on?</h3>
              <p className="m3d-subtitle">Pick an avatar, then its size or age.</p>
              <div className="m3d-gender-tabs">
                {CATEGORIES.map(c => (
                  <button
                    key={c.id}
                    className={`m3d-gender-btn ${categoryId === c.id ? 'active' : ''}`}
                    onClick={() => handleCategoryChange(c.id)}
                  >
                    {c.id}
                  </button>
                ))}
              </div>
            </div>

            <div className="m3d-card m3d-pane-body">
              <h3><Ruler size={17} /> {category.kids ? 'Age' : 'Body size'}</h3>
              <p className="m3d-subtitle">
                {category.kids ? `Pick the age of the ${category.id.toLowerCase()}.` : `Load the ${category.id.toLowerCase()} model for this size.`}
              </p>
              <div className="m3d-presets">
                {sizesFor(category).map(p => (
                  <button
                    key={p.label}
                    className={`m3d-preset-btn ${selectedSize === p.label ? 'active' : ''}`}
                    style={(gownSizes || kidAges) && !(gownSizes || kidAges).includes(p.label) && selectedSize !== p.label ? { opacity: 0.45 } : undefined}
                    onClick={() => handleSizeChange(p.label)}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="m3d-card m3d-pane-body m3d-arms-card">
              <div className="m3d-arms-row">
                <h3><Hand size={16} /> Arms</h3>
                <div className="m3d-seg m3d-seg-3">
                  {[['down', 'Default'], ['away', 'Away'], ['hide', 'Hide']].map(([id, label]) => {
                    const locked = id === 'away' && !awayOk;
                    return (
                      <button
                        key={id} type="button" disabled={locked}
                        title={locked ? 'Away is turned off for this gown' : undefined}
                        className={`${arms === id ? 'active' : ''} ${locked ? 'locked' : ''}`}
                        onClick={() => pickArms(id)}
                      >
                        {locked && <Lock size={11} />} {label}
                      </button>
                    );
                  })}
                </div>
              </div>
              {wearing && !awayOk && <p className="m3d-hint">The Away pose is turned off for this gown.</p>}
            </div>

            <div className="m3d-adj-switch" role="tablist" aria-label="Adjust">
              <button type="button" className={adjTab === 'build' ? 'active' : ''} onClick={() => setAdjTab('build')}>Body build</button>
              <button type="button" className={adjTab === 'fit' ? 'active' : ''} onClick={() => setAdjTab('fit')}>Fine-Tune Scale</button>
            </div>

            <div className={`m3d-card m3d-pane-body m3d-adj ${adjTab === 'build' ? 'on' : ''}`}>
              <h3><Sliders size={17} /> Body build</h3>
              <p className="m3d-subtitle">Height, slim to heavy, belly and muscle. The gown follows the body.</p>
              {bodyRaw?.height ? (() => {
                const baseCm = bodyRaw.height * 100 * modelScale;
                const minCm = Math.round(baseCm * heightRange[0]);
                const maxCm = Math.round(baseCm * heightRange[1]);
                const curCm = Math.round(baseCm * adjust.height);
                const setCm = (cm) => {
                  const c = Math.min(maxCm, Math.max(minCm, Math.round(cm)));
                  setAdjust((prev) => ({ ...prev, height: c / baseCm }));
                  setHeightText(String(c));
                };
                return (
                  <div className="m3d-height">
                    <div className="m3d-height-top">
                      <span className="m3d-height-title">Height</span>
                      <span className="m3d-height-range">{minCm}–{maxCm} cm</span>
                    </div>
                    <div className="m3d-height-input">
                      <button type="button" aria-label="Shorter" onClick={() => setCm(curCm - 1)}>−</button>
                      <input
                        type="text" inputMode="numeric" aria-label="Height in cm"
                        value={heightText ?? String(curCm)}
                        onFocus={(e) => e.target.select()}
                        onChange={(e) => setHeightText(e.target.value.replace(/[^0-9]/g, '').slice(0, 3))}
                        onBlur={() => { if (heightText) setCm(parseInt(heightText, 10)); else setHeightText(null); }}
                        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                      />
                      <span className="m3d-unit">cm</span>
                      <button type="button" aria-label="Taller" onClick={() => setCm(curCm + 1)}>+</button>
                    </div>
                    <input
                      className="m3d-range" type="range" min={heightRange[0]} max={heightRange[1]} step="0.005" value={Math.min(heightRange[1], Math.max(heightRange[0], adjust.height))}
                      style={{ '--p': `${((adjust.height - heightRange[0]) / Math.max(1e-6, heightRange[1] - heightRange[0])) * 100}%` }}
                      onChange={(e) => { setHeightText(null); setAdjust((prev) => ({ ...prev, height: parseFloat(e.target.value) })); }}
                    />
                  </div>
                );
              })() : null}
              <div className="m3d-sliders">
                {[
                  ['Weight (slim / heavy)', weight, setWeight, -1, 1],
                  ['Belly', belly, setBelly, lim.belly[0], lim.belly[1]],
                  ['Muscle', muscle, setMuscle, lim.muscle[0], lim.muscle[1]],
                ].map(([label, value, setter, min, max]) => (
                  <div key={label} className="m3d-slider">
                    <div className="m3d-slider-label">
                      <span>{label}</span>
                      <span className="m3d-pill">{Math.round(value * 100)}%</span>
                    </div>
                    <input
                      className="m3d-range" type="range" min={min} max={max} step="0.01" value={value}
                      style={{ '--p': `${((value - min) / Math.max(1e-6, max - min)) * 100}%` }}
                      onChange={(e) => setter(parseFloat(e.target.value))}
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className={`m3d-card m3d-pane-fit m3d-adj ${adjTab === 'fit' ? 'on' : ''}`}>
              <div className="m3d-card-head">
                <h3><Sliders size={17} /> Fine-Tune Scale</h3>
                <button className="m3d-reset" onClick={resetAdjust} disabled={isDefault}>
                  <RotateCcw size={13} /> Reset
                </button>
              </div>
              <p className="m3d-subtitle">Fine adjustments for {category.id} ({selectedSize}); the gown follows:</p>

              <div className="m3d-sliders">
                {SLIDERS.map(({ key, label }) => (
                  <div key={key} className="m3d-slider">
                    <div className="m3d-slider-label">
                      <span>{label}</span>
                      <span>{Math.round(adjust[key] * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      min={SIZE_LIMITS[0]}
                      max={SIZE_LIMITS[1]}
                      step="0.01"
                      value={adjust[key]}
                      onChange={(e) => setAdjust(prev => ({ ...prev, [key]: parseFloat(e.target.value) }))}
                    />
                  </div>
                ))}
              </div>
            </div>
          </aside>

          {/* ================= CENTER: 3D PREVIEW ================= */}
          <main className="m3d-stage" ref={stageRef}>
            <div className="m3d-canvas-card">
              <div className="m3d-canvas-head">
                <span className="m3d-live">
                  <span className="m3d-live-dot" /> 3D Studio
                </span>
                <span className="m3d-head-tags">
                  <button type="button" className="m3d-bg-toggle" onClick={toggleBg} aria-label="Switch 3D background">
                    {bgMode === 'dark' ? <Sun size={13} /> : <Moon size={13} />}
                    {bgMode === 'dark' ? 'Light' : 'Dark'}
                  </button>
                  {wearing && (
                    <button
                      type="button"
                      className="m3d-unequip"
                      onClick={() => setWearing(false)}
                    >
                      <X size={13} /> Take off
                    </button>
                  )}
                  {wearing && (
                    <span className={`m3d-status ${canWear ? 'ok' : 'no'}`}>
                      {canWear ? <><Check size={12} /> Fits</> : <><X size={12} /> Can't wear</>}
                    </span>
                  )}
                  <span className="m3d-tag">{category.id} · {selectedSize}</span>
                </span>
              </div>

              <div className={`m3d-viewport ${bgMode}`}>
                <Canvas
                  key={category.id}
                  dpr={[1, 2]}
                  camera={{ position: [0, 0.1, category.kids ? 2.7 : 3.5], fov: 45 }}
                >
                  <ambientLight intensity={0.6} />
                  <directionalLight position={[6, 9, 6]} intensity={1.3} />
                  <directionalLight position={[-6, 4, -4]} intensity={0.6} color="#9db4ff" />

                  <Suspense fallback={<SceneLoader />}>
                    <Stage environment={null} intensity={0.4} shadows="contact" adjustCamera={false}>
                      <Scene
                        bodyPath={bodyModelPath}
                        gownPath={wearing && !loadingData && canWear ? selectedGown.modelPath : null}
                        onMeasured={setBodyRaw}
                        showBody
                        arms={arms}
                        tweak={selectedGown.fitAdjust}
                        build={build}
                        looseness={looseness}
                        length={length}
                        scale={[adjust.width * modelScale, adjust.height * modelScale, adjust.depth * modelScale]}
                      />
                    </Stage>
                  </Suspense>

                  <OrbitControls enableZoom minDistance={1.2} maxDistance={6} />
                </Canvas>

                {wearing && !audienceOk && (
                  <div className="m3d-notice warn">
                    <Info size={14} /> This is for {AUDIENCE_LABEL[audienceOf(selectedGown)]}. Choose the matching avatar to try it on.
                  </div>
                )}
                {wearing && audienceOk && !ageOk && (
                  <div className="m3d-notice warn">
                    <Info size={14} /> This gown is for ages {kidAges.join(' / ')}. The avatar is {selectedSize}, so it cannot be worn. Pick a matching age.
                  </div>
                )}
                {wearing && audienceOk && ageOk && sizeCheck && !sizeCheck.ok && (
                  <div className="m3d-notice warn">
                    <Info size={14} /> This gown comes in {gownSizes.join(' / ')}. The avatar is about {sizeCheck.now}, so it cannot be worn. Pick a matching size.
                  </div>
                )}

                {wearing && audienceOk && canWear && !selectedGown.modelPath && (
                  <div className="m3d-notice">
                    <Info size={14} /> The 3D model for this gown is not available yet.
                  </div>
                )}
              </div>

              <div className="m3d-canvas-foot">
                <span className="m3d-hint"><Info size={13} /> Drag to rotate · Scroll or pinch to zoom</span>
                {wearing ? (
                  <>
                    <span className="m3d-current">{selectedGown.name}</span>
                  </>
                ) : (
                  <span className="m3d-current">No gown · pick one below</span>
                )}
              </div>

              {wearing && !selectedGown.isExample && (
                <>
                  <div className="m3d-summary">
                    <div className="m3d-summary-text">
                      <strong>{selectedGown.name}</strong>
                      <span>
                        {peso(gownPrice)}
                      </span>
                    </div>
                    <div className="m3d-summary-total">
                      <span>Estimated total</span>
                      <strong>{peso(gownPrice)}</strong>
                    </div>
                  </div>

                  {soldOut && (
                    <div className="m3d-soldout">
                      <Info size={14} /> This gown is currently rented out, so it cannot be reserved right now. You can still try it on in 3D.
                    </div>
                  )}
                  <button className="m3d-reserve-btn" onClick={handleReserve} disabled={soldOut}>
                    <Calendar size={16} /> {soldOut ? 'Currently rented' : 'Reserve this gown'}
                  </button>
                </>
              )}
            </div>
          </main>

          {/* ================= TABS (tablet and mobile only) ================= */}
          <nav className="m3d-tabs" aria-label="Fitting options">
            {TABS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                className={`m3d-tab ${activeTab === id ? 'active' : ''}`}
                onClick={() => setActiveTab(prev => (prev === id ? 'closed' : id))}
              >
                <Icon size={16} /> {label}
              </button>
            ))}
          </nav>

          {/* ================= RIGHT: GOWNS + ACCESSORIES ================= */}
          <aside className="m3d-gowns">

            {/* ---------- GOWN SELECTION ---------- */}
            <div className="m3d-card m3d-card-fill m3d-pane-gowns">
              <h3><span className="m3d-step">2</span> Choose a gown</h3>
              <p className="m3d-subtitle">Tap a gown to see it on the mannequin.</p>

              <div className="m3d-search">
                <Search size={15} />
                <input
                  type="text"
                  placeholder="Search gowns..."
                  value={search}
                  onChange={(e) => changeSearch(e.target.value)}
                />
                {search && (
                  <button type="button" className="m3d-search-clear" onClick={() => changeSearch('')} aria-label="Clear search">
                    <X size={13} />
                  </button>
                )}
              </div>

              <div className="m3d-chips">
                <button
                  type="button"
                  className={`m3d-chip ${only3D ? 'active' : ''}`}
                  onClick={changeOnly3D}
                >
                  3D only
                </button>
                {categories.map(c => (
                  <button
                    key={c}
                    type="button"
                    className={`m3d-chip ${gownCat === c ? 'active' : ''}`}
                    onClick={() => changeCategory(c)}
                  >
                    {c}
                  </button>
                ))}
              </div>

              <div className="m3d-results">
                <span>{filteredGowns.length} {filteredGowns.length === 1 ? 'gown' : 'gowns'}</span>
                {hasFilters && (
                  <button type="button" className="m3d-link-btn" onClick={clearFilters}>Clear filters</button>
                )}
              </div>

              <div className="m3d-gown-list">
                {loadingData && <p className="m3d-list-note">Loading gowns...</p>}

                {!loadingData && filteredGowns.length === 0 && (
                  <p className="m3d-empty">No gowns match your search.</p>
                )}

                {visibleGowns.map(gown => (
                  <button
                    type="button"
                    key={gown.id}
                    className={`m3d-gown-card ${wearing && selectedGown.id === gown.id ? 'selected' : ''} ${gown.stock < 1 ? 'is-out' : ''}`}
                    onClick={() => handleSelectGown(gown)}
                  >
                    <span className="m3d-thumb">
                      {gown.thumbnail && (
                        <img
                          src={gown.thumbnail}
                          alt={gown.name}
                          loading="lazy"
                          onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }}
                        />
                      )}
                    </span>
                    <span className="m3d-gown-info">
                      <strong>{gown.name}</strong>
                      {!gown.isExample && (gown.isNew || gown.discount > 0) && (
                        <span className="m3d-promo">
                          {gown.isNew && <span className="m3d-new-tag">NEW</span>}
                          {gown.discount > 0 && <span className="m3d-off-tag">{gown.discount}% OFF</span>}
                          {gown.discount > 0 && <span className="m3d-promo-price"><s>{peso(gown.price)}</s> {peso(Math.round(gown.price * (1 - gown.discount / 100)))}</span>}
                        </span>
                      )}
                      <span className="m3d-sizes">
                        {gown.sizes.map(s => <span key={s} className="m3d-size-badge">{s}</span>)}
                        {!gown.isExample && <span className="m3d-example-badge">{AUDIENCE_LABEL[audienceOf(gown)]}</span>}
                        {gown.isExample ? (
                          <span className="m3d-example-badge">Example</span>
                        ) : (
                          <>
                            <span className={`m3d-stock ${gown.stock > 0 ? 'in' : 'out'}`}>
                              {gown.stock > 0 ? 'Available' : 'Rented · not available'}
                            </span>
                            {!gown.modelPath && <span className="m3d-no3d-badge">No 3D yet</span>}
                          </>
                        )}
                      </span>
                    </span>
                  </button>
                ))}
              </div>

              {remaining > 0 && (
                <button
                  type="button"
                  className="m3d-more"
                  onClick={() => setVisibleCount(c => c + PAGE_SIZE)}
                >
                  Show more ({remaining} left)
                </button>
              )}
            </div>

            {/* ---------- ADD-ONS THAT COME WITH THE GOWN (information only) ---------- */}
            <div className="m3d-card m3d-pane-extras">
              <h3><span className="m3d-step">3</span> What comes with it</h3>
              <p className="m3d-subtitle">
                The accessories are part of the gown's 3D model, so they cannot be added or swapped here.
              </p>

              {!wearing || selectedGown.isExample ? (
                <p className="m3d-list-note">Pick a gown to see what comes with it.</p>
              ) : hasPackage ? (
                <div className="m3d-incl-list">
                  {selectedGown.petticoatLayer && (
                    <div className="m3d-incl-row">
                      <span className="m3d-incl-ico"><Layers size={14} /></span>
                      <span className="m3d-incl-info"><strong>Petticoat</strong><span>Layer {selectedGown.petticoatLayer}</span></span>
                      <span className="m3d-acc-price inc">Included</span>
                    </div>
                  )}
                  {includedAccs.map(a => (
                    <div key={a.id} className="m3d-incl-row">
                      <span className="m3d-incl-ico"><Crown size={14} /></span>
                      <span className="m3d-incl-info"><strong>{a.name}</strong><span>{a.category}</span></span>
                      <span className="m3d-acc-price inc">Included</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="m3d-list-note">This gown comes on its own, with no petticoat or accessories.</p>
              )}
            </div>
          </aside>

        </div>
      </div>
    </div>
  );
};

export default Mannequin3D;