import React, { useState, useEffect, useMemo, useRef, Suspense, Component } from 'react';
import { useNavigate } from 'react-router-dom';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Stage, useGLTF, Html } from '@react-three/drei';
import {
  Sliders, Ruler, Shirt, RotateCcw, Info, Calendar, Search, Crown, Check, X, Sun, Moon
} from 'lucide-react';
import { supabase } from '../supabaseClient';
import {
  Scene, CATEGORIES, sizesFor, defaultSizeFor, makeBuild, parseGownSizes, checkSizeFit,
  audienceOf, audienceFits, AUDIENCE_LABEL, parseTweak,
} from '../components/MannequinEngine';
import '../styles-public/Mannequin3D.css';

/* ---------- SAFE MODEL LOADER ----------
   useGLTF suspends while loading, so a plain try/catch does not work.
   An Error Boundary shows a placeholder only when the file really fails to load. */
class ModelErrorBoundary extends Component {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  render() {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}

function GLBModel({ modelPath, scale }) {
  const { scene } = useGLTF(modelPath);
  return <primitive object={scene.clone()} scale={scale} />;
}

// Accessories: render nothing if the file fails, and load without blanking the whole scene
function OptionalModel({ modelPath }) {
  return (
    <ModelErrorBoundary key={modelPath} fallback={null}>
      <Suspense fallback={null}>
        <GLBModel modelPath={modelPath} scale={[1, 1, 1]} />
      </Suspense>
    </ModelErrorBoundary>
  );
}

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
const MODEL_BUCKET = 'gown-models'; // Supabase Storage bucket (public)
const PAGE_SIZE = 8;                // gowns shown per "Show more" step

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
  thumbnail: row.image,
  modelPath: resolveModelUrl(row.model_path),
  sizes: parseGownSizes(row.size) || (row.size ? [row.size] : []),
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

// EXAMPLES ONLY (local files in public/gown)
const EXAMPLE_GOWNS = [
  {
    id: 'example-1', name: 'Red Dress Ruby', category: 'Example',
    thumbnail: '/images/Red rose.jpg', modelPath: '/gown/elegant_rose.glb',
    sizes: ['S', 'M', 'L'], includedAccessoryIds: [], isExample: true,
  },
  {
    id: 'example-2', name: 'Blue Gown', category: 'Example',
    thumbnail: '/images/Sky blye.jpg', modelPath: '/gown/blue_dress.glb',
    sizes: ['M'], includedAccessoryIds: [], isExample: true,
  },
  {
    id: 'example-3', name: 'Black Dress', category: 'Example',
    thumbnail: '/images/Black.jpg', modelPath: '/gown/black_dress.glb',
    sizes: ['S', 'M'], includedAccessoryIds: [], isExample: true,
  },
  {
    id: 'example-4', name: 'Golden Gown', category: 'Example',
    thumbnail: '/images/premium.jpg', modelPath: '/gown/golden_gown.glb',
    sizes: ['L', 'XXL'], includedAccessoryIds: [], isExample: true,
  },
];

const SLIDERS = [
  { key: 'height', label: 'Height' },
  { key: 'waist',  label: 'Waist (Width)' },
  { key: 'chest',  label: 'Chest (Front)' },
  { key: 'hip',    label: 'Hip' },
];

const SIZE_LIMITS = [0.8, 1.3];   // fine-tune range (80% - 130%)
const DEFAULT_ADJUST = { height: 1, waist: 1, chest: 1, hip: 1 };

// Tabs shown under the 3D view on tablet and mobile
const TABS = [
  { id: 'gowns',  label: 'Gowns',  icon: Shirt },
  { id: 'extras', label: 'Extras', icon: Crown },
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
  const [arms, setArms] = useState('down');             // down | away | tpose | hide
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
  const [selectedGown, setSelectedGown] = useState(EXAMPLE_GOWNS[0]);
  const [wornIds, setWornIds] = useState([]); // accessories shown on the mannequin

  // Gown filters
  const [search, setSearch] = useState('');
  const [gownCat, setGownCat] = useState('All');
  const [only3D, setOnly3D] = useState(false);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  // Accessory filter
  const [accCategory, setAccCategory] = useState('All');

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

      const firstWith3D = mapped.find(g => g.modelPath);
      if (firstWith3D) {
        setSelectedGown(firstWith3D);
        setWornIds(firstWith3D.includedAccessoryIds);
      }
      setLoadingData(false);
    };
    load();
  }, []);

  /* ---------- GOWN LIST (search, filters, show more) ---------- */
  const allGowns = [...gowns, ...EXAMPLE_GOWNS];
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
  const accCategories = ['All', ...new Set(accessories.map(a => a.category).filter(Boolean))];
  const visibleAccs = accessories.filter(a => accCategory === 'All' || a.category === accCategory);

  const includedIds = selectedGown.includedAccessoryIds || [];
  const includedAccs = accessories.filter(a => includedIds.includes(a.id));
  const hasPackage = !!selectedGown.petticoatLayer || includedAccs.length > 0;

  const wornAccessories = accessories.filter(a => wornIds.includes(a.id));
  const wornWith3D = wornAccessories.filter(a => a.modelPath);
  const noPreviewCount = wornAccessories.length - wornWith3D.length;

  // Accessories that are not part of the gown package are charged as extras
  const chargedAccessories = wornAccessories.filter(a => !includedIds.includes(a.id));
  const extrasTotal = chargedAccessories.reduce((sum, a) => sum + a.price, 0);
  const gownPrice = Number(selectedGown.price) || 0;

  const toggleAccessory = (id) =>
    setWornIds(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));

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
  const sizeCheck = useMemo(
    () => checkSizeFit(bodyRaw, build, gownSizes, adjust.waist * modelScale, adjust.chest * modelScale),
    [bodyRaw, build, gownSizes, adjust.waist, adjust.chest, modelScale]
  );
  const canWear = audienceOk && (!sizeCheck || sizeCheck.ok);

  // Selecting a gown loads its package, switches to the matching avatar, and brings the 3D view into sight on small screens
  const handleSelectGown = (gown) => {
    setSelectedGown(gown);
    setWornIds(gown.includedAccessoryIds || []);
    setLooseness(1.0);
    setLength(1.0);

    let cat = category;
    if (!gown.isExample && !audienceFits(audienceOf(gown), category)) {
      cat = CATEGORIES.find(c => audienceFits(audienceOf(gown), c)) || category;
      setCategoryId(cat.id);
    }
    const allowed = cat.kids || gown.isExample ? null : parseGownSizes(gown.sizes?.join(', '));
    const curSize = cat === category ? selectedSize : defaultSizeFor(cat);
    if (allowed && !allowed.includes(curSize)) applyPreset(cat, allowed[0]);
    else if (cat !== category) applyPreset(cat, defaultSizeFor(cat));

    if (window.innerWidth <= 1100) {
      setActiveTab('closed');   // close the sheet so the gown is visible
      stageRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const handleReserve = () => {
    navigate('/reserve', {
      state: {
        gown: {
          id: selectedGown.id,
          name: selectedGown.name,
          price: selectedGown.price,
          image: selectedGown.thumbnail,
          category: selectedGown.category,
          size: selectedGown.sizes?.includes(selectedSize) ? selectedSize : (selectedGown.sizes?.[0] || ''),
        },
        // Accessories chosen on top of the gown package (charged)
        extras: chargedAccessories.map(a => a.id),
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
                    style={gownSizes && !gownSizes.includes(p.label) && selectedSize !== p.label ? { opacity: 0.45 } : undefined}
                    onClick={() => handleSizeChange(p.label)}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="m3d-card m3d-pane-body">
              <h3><Ruler size={17} /> Arms</h3>
              <p className="m3d-subtitle">Move the arms away from the gown, or hide them.</p>
              <div className="m3d-seg">
                {[['down', 'Down'], ['away', 'Away'], ['tpose', 'T-pose'], ['hide', 'Hide']].map(([id, label]) => (
                  <button key={id} type="button" className={arms === id ? 'active' : ''} onClick={() => setArms(id)}>
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="m3d-adj-switch" role="tablist" aria-label="Adjust">
              <button type="button" className={adjTab === 'build' ? 'active' : ''} onClick={() => setAdjTab('build')}>Body build</button>
              <button type="button" className={adjTab === 'fit' ? 'active' : ''} onClick={() => setAdjTab('fit')}>Fine-tune</button>
            </div>

            <div className={`m3d-card m3d-pane-body m3d-adj ${adjTab === 'build' ? 'on' : ''}`}>
              <h3><Sliders size={17} /> Body build</h3>
              <p className="m3d-subtitle">Slim to heavy, belly and muscle. The gown follows the body.</p>
              <div className="m3d-sliders">
                {[
                  ['Weight (slim / heavy)', weight, setWeight, -1, 1],
                  ['Belly', belly, setBelly, 0, 1],
                  ['Muscle', muscle, setMuscle, 0, 1],
                ].map(([label, value, setter, min, max]) => (
                  <div key={label} className="m3d-slider">
                    <div className="m3d-slider-label">
                      <span>{label}</span>
                      <span>{Math.round(value * 100)}%</span>
                    </div>
                    <input
                      type="range" min={min} max={max} step="0.01" value={value}
                      onChange={(e) => setter(parseFloat(e.target.value))}
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className={`m3d-card m3d-pane-fit m3d-adj ${adjTab === 'fit' ? 'on' : ''}`}>
              <div className="m3d-card-head">
                <h3><Sliders size={17} /> Fine-tune</h3>
                <button className="m3d-reset" onClick={resetAdjust} disabled={isDefault}>
                  <RotateCcw size={13} /> Reset
                </button>
              </div>
              <p className="m3d-subtitle">Adjust the {selectedSize} model. The gown follows.</p>

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
                {[
                  ['Gown looseness', looseness, setLooseness, 0.95, 1.2],
                  ['Gown length', length, setLength, 0.85, 1.15],
                ].map(([label, value, setter, min, max]) => (
                  <div key={label} className="m3d-slider">
                    <div className="m3d-slider-label">
                      <span>{label}</span>
                      <span>{Math.round(value * 100)}%</span>
                    </div>
                    <input
                      type="range" min={min} max={max} step="0.01" value={value}
                      onChange={(e) => setter(parseFloat(e.target.value))}
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
                  <span className={`m3d-status ${canWear ? 'ok' : 'no'}`}>
                    {canWear ? <><Check size={12} /> Fits</> : <><X size={12} /> Can't wear</>}
                  </span>
                  <span className="m3d-tag">{category.id} · {selectedSize}</span>
                </span>
              </div>

              <div className={`m3d-viewport ${bgMode}`}>
                <Canvas
                  key={category.id}
                  dpr={[1, 2]}
                  camera={{ position: [0, 0.1, category.kids ? 2.7 : 3.5], fov: 45 }}
                >
                  <ambientLight intensity={0.35} />
                  <directionalLight position={[6, 9, 6]} intensity={0.8} />
                  <directionalLight position={[-6, 4, -4]} intensity={0.5} color="#9db4ff" />

                  <Suspense fallback={<SceneLoader />}>
                    <Stage environment="studio" intensity={0.22} shadows="contact" adjustCamera={false}>
                      <Scene
                        bodyPath={bodyModelPath}
                        gownPath={canWear ? selectedGown.modelPath : null}
                        onMeasured={setBodyRaw}
                        showBody
                        arms={arms}
                        tweak={selectedGown.fitAdjust}
                        build={build}
                        looseness={looseness}
                        length={length}
                        scale={[adjust.waist * modelScale, adjust.height * modelScale, adjust.chest * modelScale]}
                      />
                      {wornWith3D.map(acc => (
                        <group key={acc.id} scale={modelScale} position={[0, -1, 0]}>
                          <OptionalModel modelPath={acc.modelPath} />
                        </group>
                      ))}
                    </Stage>
                  </Suspense>

                  <OrbitControls enableZoom minDistance={1.2} maxDistance={6} />
                </Canvas>

                {!audienceOk && (
                  <div className="m3d-notice warn">
                    <Info size={14} /> This is for {AUDIENCE_LABEL[audienceOf(selectedGown)]}. Choose the matching avatar to try it on.
                  </div>
                )}
                {audienceOk && sizeCheck && !sizeCheck.ok && (
                  <div className="m3d-notice warn">
                    <Info size={14} /> This gown comes in {gownSizes.join(' / ')}. The avatar is about {sizeCheck.now}, so it cannot be worn. Pick a matching size.
                  </div>
                )}

                {audienceOk && canWear && !selectedGown.modelPath && (
                  <div className="m3d-notice">
                    <Info size={14} /> The 3D model for this gown is not available yet.
                  </div>
                )}
              </div>

              <div className="m3d-canvas-foot">
                <span className="m3d-hint"><Info size={13} /> Drag to rotate · Scroll or pinch to zoom</span>
                <span className="m3d-current">{selectedGown.name}</span>
              </div>

              {!selectedGown.isExample && (
                <>
                  <div className="m3d-summary">
                    <div className="m3d-summary-text">
                      <strong>{selectedGown.name}</strong>
                      <span>
                        {peso(gownPrice)}
                        {extrasTotal > 0 && ` + ${peso(extrasTotal)} extras`}
                      </span>
                    </div>
                    <div className="m3d-summary-total">
                      <span>Estimated total</span>
                      <strong>{peso(gownPrice + extrasTotal)}</strong>
                    </div>
                  </div>

                  <button className="m3d-reserve-btn" onClick={handleReserve}>
                    <Calendar size={16} /> Reserve this gown
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
                {id === 'extras' && chargedAccessories.length > 0 && (
                  <span className="m3d-tab-count">{chargedAccessories.length}</span>
                )}
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
                    className={`m3d-gown-card ${selectedGown.id === gown.id ? 'selected' : ''}`}
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
                      <span className="m3d-sizes">
                        {gown.sizes.map(s => <span key={s} className="m3d-size-badge">{s}</span>)}
                        {!gown.isExample && <span className="m3d-example-badge">{AUDIENCE_LABEL[audienceOf(gown)]}</span>}
                        {gown.isExample ? (
                          <span className="m3d-example-badge">Example</span>
                        ) : (
                          <>
                            <span className={`m3d-stock ${gown.stock > 0 ? 'in' : 'out'}`}>
                              {gown.stock > 0 ? 'Available' : 'Rented'}
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

            {/* ---------- ACCESSORIES ---------- */}
            <div className="m3d-card m3d-pane-extras">
              <h3><span className="m3d-step">3</span> Add accessories</h3>
              <p className="m3d-subtitle">
                Add accessories to your look. Items included with the gown are already in its price.
              </p>

              {!selectedGown.isExample && hasPackage && (
                <div className="m3d-included">
                  <p className="m3d-included-title">Included with this gown</p>
                  <div className="m3d-included-list">
                    {selectedGown.petticoatLayer && (
                      <span className="m3d-inc-chip">Petticoat Layer {selectedGown.petticoatLayer}</span>
                    )}
                    {includedAccs.map(a => (
                      <span key={a.id} className="m3d-inc-chip">{a.name}</span>
                    ))}
                  </div>
                </div>
              )}

              {accessories.length === 0 ? (
                <p className="m3d-list-note">{loadingData ? 'Loading accessories...' : 'No accessories available yet.'}</p>
              ) : (
                <>
                  {accCategories.length > 2 && (
                    <div className="m3d-chips">
                      {accCategories.map(c => (
                        <button
                          key={c}
                          type="button"
                          className={`m3d-chip ${accCategory === c ? 'active' : ''}`}
                          onClick={() => setAccCategory(c)}
                        >
                          {c}
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="m3d-acc-list">
                    {visibleAccs.map(acc => {
                      const on = wornIds.includes(acc.id);
                      const included = includedIds.includes(acc.id);
                      return (
                        <button
                          type="button"
                          key={acc.id}
                          className={`m3d-acc ${on ? 'on' : ''}`}
                          onClick={() => toggleAccessory(acc.id)}
                          aria-pressed={on}
                        >
                          <span className="m3d-acc-check">{on && <Check size={12} />}</span>
                          <span className="m3d-acc-info">
                            <strong>{acc.name}</strong>
                            <span>{acc.category}{!acc.modelPath ? ' · No 3D preview' : ''}</span>
                          </span>
                          <span className={`m3d-acc-price ${included ? 'inc' : ''}`}>
                            {included ? 'Included' : acc.price > 0 ? `+${peso(acc.price)}` : 'Free'}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  {noPreviewCount > 0 && (
                    <p className="m3d-note">
                      {noPreviewCount} selected {noPreviewCount === 1 ? 'accessory has' : 'accessories have'} no 3D preview yet.
                    </p>
                  )}
                </>
              )}
            </div>
          </aside>

        </div>
      </div>
    </div>
  );
};

export default Mannequin3D;