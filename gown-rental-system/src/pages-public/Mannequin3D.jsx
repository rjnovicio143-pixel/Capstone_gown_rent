import React, { useState, useEffect, useRef, Suspense, Component } from 'react';
import { useNavigate } from 'react-router-dom';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Stage, useGLTF, Html } from '@react-three/drei';
import {
  Sliders, Ruler, Shirt, RotateCcw, Info, Calendar, Search, Crown, Check, X
} from 'lucide-react';
import { supabase } from '../supabaseClient';
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

function FallbackModel({ scale, color }) {
  return (
    <mesh scale={scale}>
      <cylinderGeometry args={[0.3, 0.4, 2, 16]} />
      <meshStandardMaterial color={color} roughness={0.5} metalness={0.1} />
    </mesh>
  );
}

function Safe3DModel({ modelPath, scale, color }) {
  return (
    <ModelErrorBoundary
      key={modelPath}
      fallback={<FallbackModel scale={scale} color={color} />}
    >
      <GLBModel modelPath={modelPath} scale={scale} />
    </ModelErrorBoundary>
  );
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
const SIZES = ['S', 'M', 'L', 'XL', 'XXL'];
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
  sizes: row.size ? [row.size] : [],
  stock: Number(row.stock) || 0,
  petticoatLayer: row.petticoat_layer || null,
  includedAccessoryIds: row.included_accessories || [],
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
  const [gender, setGender] = useState('Female');
  const [selectedSize, setSelectedSize] = useState('M');
  const [adjust, setAdjust] = useState(DEFAULT_ADJUST);
  const [activeTab, setActiveTab] = useState('gowns');

  // Data
  const [gowns, setGowns] = useState([]);
  const [accessories, setAccessories] = useState([]);
  const [loadingData, setLoadingData] = useState(true);

  // Selection
  const [selectedGown, setSelectedGown] = useState(EXAMPLE_GOWNS[0]);
  const [wornIds, setWornIds] = useState([]); // accessories shown on the mannequin

  // Gown filters
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
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
          .select('id, name, price, category, size, image, stock, model_path, petticoat_layer, included_accessories')
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
    (category === 'All' || g.category === category) &&
    (!only3D || !!g.modelPath) &&
    (!q || g.name?.toLowerCase().includes(q))
  );
  const visibleGowns = filteredGowns.slice(0, visibleCount);
  const remaining = filteredGowns.length - visibleGowns.length;
  const hasFilters = !!q || category !== 'All' || only3D;

  const changeSearch   = (v) => { setSearch(v);   setVisibleCount(PAGE_SIZE); };
  const changeCategory = (v) => { setCategory(v); setVisibleCount(PAGE_SIZE); };
  const changeOnly3D   = ()  => { setOnly3D(p => !p); setVisibleCount(PAGE_SIZE); };
  const clearFilters   = ()  => { setSearch(''); setCategory('All'); setOnly3D(false); setVisibleCount(PAGE_SIZE); };

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
  const bodyModelPath = `/mannequin/${gender.toLowerCase()}_${selectedSize.toLowerCase()}.glb`;
  const isDefault = Object.keys(DEFAULT_ADJUST).every(k => adjust[k] === DEFAULT_ADJUST[k]);

  const resetAdjust = () => setAdjust(DEFAULT_ADJUST);

  const handleSizeChange = (size) => {
    setSelectedSize(size);
    resetAdjust();
  };

  const handleGenderChange = (value) => {
    setGender(value);
    resetAdjust();
  };

  // Selecting a gown loads its package and brings the 3D view back into sight on small screens
  const handleSelectGown = (gown) => {
    setSelectedGown(gown);
    setWornIds(gown.includedAccessoryIds || []);
    if (window.innerWidth <= 1100) {
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
          size: selectedGown.sizes?.[0] || '',
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
              <h3><Ruler size={18} /> Avatar</h3>
              <p className="m3d-subtitle">Choose your base avatar type.</p>
              <div className="m3d-gender-tabs">
                {['Female', 'Male'].map(g => (
                  <button
                    key={g}
                    className={`m3d-gender-btn ${gender === g ? 'active' : ''}`}
                    onClick={() => handleGenderChange(g)}
                  >
                    {g}
                  </button>
                ))}
              </div>
            </div>

            <div className="m3d-card m3d-pane-body">
              <h3>Body Size</h3>
              <p className="m3d-subtitle">Load the {gender.toLowerCase()} model for this size.</p>
              <div className="m3d-presets">
                {SIZES.map(size => (
                  <button
                    key={size}
                    className={`m3d-preset-btn ${selectedSize === size ? 'active' : ''}`}
                    onClick={() => handleSizeChange(size)}
                  >
                    {size}
                  </button>
                ))}
              </div>
            </div>

            <div className="m3d-card m3d-pane-fit">
              <div className="m3d-card-head">
                <h3><Sliders size={18} /> Fine-Tune</h3>
                <button className="m3d-reset" onClick={resetAdjust} disabled={isDefault}>
                  <RotateCcw size={13} /> Reset
                </button>
              </div>
              <p className="m3d-subtitle">Slightly adjust the {selectedSize} model.</p>

              <div className="m3d-sliders">
                {SLIDERS.map(({ key, label }) => (
                  <div key={key} className="m3d-slider">
                    <div className="m3d-slider-label">
                      <span>{label}</span>
                      <span>{Math.round(adjust[key] * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      min="0.9"
                      max="1.1"
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
                <span className="m3d-tag">{gender} · {selectedSize}</span>
              </div>

              <div className="m3d-viewport">
                <Canvas
                  key={`${gender}-${selectedSize}`}
                  dpr={[1, 2]}
                  camera={{ position: [0, 0, 4.5], fov: 45 }}
                >
                  <ambientLight intensity={0.7} />
                  <directionalLight position={[10, 10, 5]} intensity={1} />

                  <Suspense fallback={<SceneLoader />}>
                    <Stage environment="city" intensity={0.5}>
                      <group
                        scale={[adjust.waist, adjust.height, adjust.chest]}
                        position={[0, -1, 0]}
                      >
                        <Safe3DModel modelPath={bodyModelPath} scale={[1, 1, 1]} color="#c5a880" />

                        {selectedGown.modelPath && (
                          <Safe3DModel modelPath={selectedGown.modelPath} scale={[1.02, 1, 1.02]} color="#b33939" />
                        )}

                        {wornWith3D.map(acc => (
                          <OptionalModel key={acc.id} modelPath={acc.modelPath} />
                        ))}
                      </group>
                    </Stage>
                  </Suspense>

                  <OrbitControls enableZoom minDistance={1.2} maxDistance={6} />
                </Canvas>

                {!selectedGown.modelPath && (
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
                onClick={() => setActiveTab(id)}
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
              <h3><Shirt size={18} /> Gown Selection</h3>
              <p className="m3d-subtitle">Select a gown to try on the {selectedSize} mannequin.</p>

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
                    className={`m3d-chip ${category === c ? 'active' : ''}`}
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
              <h3><Crown size={18} /> Accessories</h3>
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