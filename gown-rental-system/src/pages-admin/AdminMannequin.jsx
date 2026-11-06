import React, { useState, useEffect, useMemo, Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Stage } from '@react-three/drei';
import { Sliders, Ruler, Shirt, Search, Move, Sun, Moon, Maximize2 } from 'lucide-react';
import { supabase } from '../supabaseClient';
import Header from '../components/Header';
import '../styles/AdminMannequin.css';
import {
  Scene, CATEGORIES, ADULT_SIZES, SIZE_ORDER, sizesFor, defaultSizeFor, makeBuild, bodyGirth,
  parseGownSizes, audienceOf, audienceFits, AUDIENCE_LABEL, DEFAULT_TWEAK, parseTweak,
} from '../components/MannequinEngine';


const MODEL_BUCKET = 'gown-models';   // Supabase Storage bucket (Public)

// Mo-resolve sa model_path ngadto sa tinuod nga URL:
//  - "https://..."          -> gamiton as is
//  - "/gown/xxx.glb"        -> local file sa public folder
//  - "ruby_gown.glb"        -> file sa Supabase Storage bucket
const resolveModelUrl = (path) => {
  if (!path) return null;
  if (path.startsWith('http') || path.startsWith('/')) return path;
  const { data } = supabase.storage.from(MODEL_BUCKET).getPublicUrl(path);
  return data.publicUrl;
};

const mapGown = (row) => ({
  id: row.id,
  name: row.name,
  category: row.category || 'Uncategorized',
  size: row.size,
  type: row.type,
  audience: row.audience || '',
  stock: Number(row.stock) || 0,
  fitAdjust: parseTweak(row.fit_adjust),      // gown position saved by the admin
  hasFit: !!row.fit_adjust,
  thumbnail: row.image,                       // usba kung lahi ang column
  modelPath: resolveModelUrl(row.model_path), // usba kung lahi ang column
  isExample: false,
});

// MGA EXAMPLE LANG (local files sa public/gown)
const EXAMPLE_GOWNS = [
  { id: 'example-1', name: 'Red Dress Ruby', category: 'Example', thumbnail: '/images/Red rose.jpg', modelPath: '/gown/elegant_rose.glb', isExample: true },
  { id: 'example-2', name: 'Blue Gown',      category: 'Example', thumbnail: '/images/Sky blye.jpg', modelPath: '/gown/blue_dress.glb',   isExample: true },
  { id: 'example-3', name: 'Black Dress',    category: 'Example', thumbnail: '/images/Black.jpg',    modelPath: '/gown/black_dress.glb',  isExample: true },
  { id: 'example-4', name: 'Golden Gown',    category: 'Example', thumbnail: '/images/premium.jpg',  modelPath: '/gown/golden_gown.glb',  isExample: true },
];

const AdminMannequin = () => {
  const [gowns, setGowns] = useState([]);
  const [selectedGown, setSelectedGown] = useState(EXAMPLE_GOWNS[0]);
  const [search, setSearch] = useState('');

  const [categoryId, setCategoryId] = useState('Woman');
  const category = CATEGORIES.find(c => c.id === categoryId) || CATEGORIES[0];
  const [selectedSize, setSelectedSize] = useState('M');
  const [modelScale, setModelScale] = useState(1.0);   // gidak-on sumala sa size / edad

  // Body type (mga morph target sa avatar)
  const [weight, setWeight] = useState(0);   // -1 payat ... +1 tambok
  const [belly, setBelly] = useState(0);     // 0 ... 1 dako nga tiyan
  const [muscle, setMuscle] = useState(0);   // 0 ... 1 muscle

  const [height, setHeight] = useState(1.0);
  const [waist, setWaist] = useState(1.0);
  const [chest, setChest] = useState(1.0);
  const [hip, setHip] = useState(1.0);

  // Auto-fit sa gown
  const [looseness, setLooseness] = useState(1.0);   // gaan-an / pig-ot sa gown
  const [length, setLength] = useState(1.0);         // taas sa gown
  const [showBody, setShowBody] = useState(true);    // ipakita ba ang avatar
  const [tab, setTab] = useState('avatar');          // avatar | build | scale | place
  const [arms, setArms] = useState('down');          // down | away | tpose | hide
  const [tweak, setTweak] = useState(DEFAULT_TWEAK);  // gown position (saved per gown)
  const [saveMsg, setSaveMsg] = useState('');
  const [sheet, setSheet] = useState('closed');       // mobile bottom sheet: closed | gowns | controls
  // 3D background: dark | light (remembered in this browser)
  const [bgMode, setBgMode] = useState(() => {
    try { return localStorage.getItem('mannequin-bg') === 'light' ? 'light' : 'dark'; } catch (e) { return 'dark'; }
  });
  const toggleBg = () => setBgMode((m) => {
    const next = m === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem('mannequin-bg', next); } catch (e) { /* ignore */ }
    return next;
  });
  const [bodyRaw, setBodyRaw] = useState(null);       // sukod sa avatar (gikan sa Scene)

  /* ---------- FETCH GOWNS (INVENTORY) ---------- */
  useEffect(() => {
    const fetchGowns = async () => {
      const { data, error } = await supabase
        .from('gowns')
        .select('*')
        .order('name', { ascending: true });

      if (error) {
        console.error('Error fetching gowns:', error);
        return;
      }
      const mapped = data.map(mapGown);
      setGowns(mapped);

      // i-select dayon ang una nga inventory gown nga naay 3D file
      const firstWith3D = mapped.find(g => g.modelPath);
      if (firstWith3D) { setSelectedGown(firstWith3D); setTweak(firstWith3D.fitAdjust || DEFAULT_TWEAK); }
    };
    fetchGowns();
  }, []);

  // Inventory una, examples sunod
  const allGowns = [...gowns, ...EXAMPLE_GOWNS];

  const filteredGowns = allGowns.filter(g =>
    g.name?.toLowerCase().includes(search.toLowerCase()) ||
    g.category?.toLowerCase().includes(search.toLowerCase())
  );

  const bodyModelPath = `/mannequin/${category.file}.glb`;

  // Ang mga bata mas sensitibo, mao nga gihinay ang epekto sa sliders
  const build = useMemo(
    () => makeBuild(weight, belly, muscle, category.kids),
    [weight, belly, muscle, category.kids]
  );

  const resetSliders = () => {
    setHeight(1.0); setWaist(1.0); setChest(1.0); setHip(1.0);
  };

  // I-load ang preset sa size / edad: gidak-on + weight, ug i-reset ang belly / muscle
  const applyPreset = (cat, label) => {
    const list = sizesFor(cat);
    const p = list.find(x => x.label === label) || list[0];
    setSelectedSize(p.label);
    setModelScale(p.scale);
    setWeight(p.weight || 0);
    setBelly(p.belly || 0);
    setMuscle(0);
    resetSliders();
  };

  const handleSizeChange = (label) => applyPreset(category, label);

  // Pwede ba ang napili nga gown sa napili nga size sa avatar?
  const gownSizes = category.kids ? null : parseGownSizes(selectedGown?.size);
  const fitsSize = (label) => (gownSizes ? gownSizes.includes(label) : null);

  // Ang tinuod nga sukod sa avatar karon (apil ang weight, belly, muscle ug scale sliders) itandi sa size sa gown.
  // Kung naa sa sakup sa gown size -> ma-sout. Kung dili -> dili ma-sout, gawas kung i-scale hangtod moabot.
  const sizeCheck = useMemo(() => {
    if (!gownSizes || !bodyRaw?.ok || selectedGown?.isExample) return null;
    const pm = ADULT_SIZES.map(p => bodyGirth(bodyRaw, makeBuild(p.weight, p.belly, 0, false), p.scale, p.scale));
    const cur = bodyGirth(bodyRaw, build, waist * modelScale, chest * modelScale);
    if (cur == null || pm.some(v => v == null)) return null;
    const lo = SIZE_ORDER.indexOf(gownSizes[0]);
    const hi = SIZE_ORDER.indexOf(gownSizes[gownSizes.length - 1]);
    const low = lo <= 0 ? -Infinity : (pm[lo - 1] + pm[lo]) / 2;
    const high = hi >= pm.length - 1 ? Infinity : (pm[hi] + pm[hi + 1]) / 2;
    let near = 0;
    pm.forEach((v, i) => { if (Math.abs(v - cur) < Math.abs(pm[near] - cur)) near = i; });
    return { ok: cur >= low && cur <= high, now: ADULT_SIZES[near].label };
  }, [gownSizes, bodyRaw, build, waist, chest, modelScale, selectedGown]);
  const audienceOk = !selectedGown || selectedGown.isExample || audienceFits(audienceOf(selectedGown), category);
  const canWear = audienceOk && (!sizeCheck || sizeCheck.ok);
  const handleCategoryChange = (id) => {
    const cat = CATEGORIES.find(c => c.id === id) || CATEGORIES[0];
    setCategoryId(id);
    applyPreset(cat, defaultSizeFor(cat));
  };

  // Pagpili og gown: i-reset ang fit, ug kung naay size sa inventory (S/M/L...), i-load ang samang avatar
  const handlePickGown = (gown) => {
    setSelectedGown(gown);
    setTweak(gown.fitAdjust || DEFAULT_TWEAK);
    setSaveMsg('');
    if (window.innerWidth <= 900) setSheet('closed');   // close the sheet so the gown is visible
    setLooseness(1.0);
    setLength(1.0);
    // Ilisan ang avatar kung dili siya ang para sa gown (e.g. men's suit -> Man, kids gown -> Girl / Boy)
    let cat = category;
    if (!gown.isExample && !audienceFits(audienceOf(gown), category)) {
      cat = CATEGORIES.find(c => audienceFits(audienceOf(gown), c)) || category;
      setCategoryId(cat.id);
    }
    const allowed = cat.kids || gown.isExample ? null : parseGownSizes(gown.size);
    const curSize = cat === category ? selectedSize : defaultSizeFor(cat);
    if (allowed && !allowed.includes(curSize)) applyPreset(cat, allowed[0]);
    else if (cat !== category) applyPreset(cat, defaultSizeFor(cat));
  };

  // Save the gown position so every customer sees the same fit
  const saveFit = async () => {
    if (!selectedGown || selectedGown.isExample) return;
    setSaveMsg('Saving...');
    const { error } = await supabase.from('gowns').update({ fit_adjust: tweak }).eq('id', selectedGown.id);
    if (error) { console.error(error); setSaveMsg('Could not save: ' + error.message); return; }
    setGowns(prev => prev.map(g => (g.id === selectedGown.id ? { ...g, fitAdjust: tweak, hasFit: true } : g)));
    setSelectedGown(g => ({ ...g, fitAdjust: tweak, hasFit: true }));
    setSaveMsg('Saved. Customers will see this position.');
  };
  const resetFit = () => { setTweak(DEFAULT_TWEAK); setSaveMsg(''); };
  const setT = (k) => (v) => { setTweak(prev => ({ ...prev, [k]: v })); setSaveMsg(''); };

  const renderSlider = (label, value, setter, min = 0.9, max = 1.1) => (
    <div className="slider-group">
      <div className="slider-label">
        <span>{label}</span>
        <span>{Math.round(value * 100)}%</span>
      </div>
      <input
        type="range" min={min} max={max} step="0.01"
        value={value}
        onChange={(e) => setter(parseFloat(e.target.value))}
      />
    </div>
  );

  return (
    <>
      <Header />
      <div className="am-page-container">
        <div className="am-hero">
          <h1>3D Mannequin Preview</h1>
          <p>I-test ang gowns sa mannequin ug i-check ang stock availability</p>
        </div>

        <div className="am-grid-layout" data-sheet={sheet}>

          {/* ===== LEFT: CONTROLS ===== */}
          <div className="am-control-panel">
            <div className="am-section-card am-tabstrip">
              <div className="presets-list">
                {[['avatar', 'Avatar'], ['build', 'Body'], ['scale', 'Scale'], ['place', 'Place gown']].map(([k, label]) => (
                  <button key={k} className={`preset-btn ${tab === k ? 'active' : ''}`} onClick={() => setTab(k)}>
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {tab === 'avatar' && (<>
            <div className="am-section-card">
              <h3><Ruler size={18} /> Avatar Selection</h3>
              <p className="section-subtitle">Choose base avatar type.</p>
              <div className="gender-tabs">
                {CATEGORIES.map(c => (
                  <button
                    key={c.id}
                    className={`gender-btn ${categoryId === c.id ? 'active' : ''}`}
                    onClick={() => handleCategoryChange(c.id)}
                  >
                    {c.id}
                  </button>
                ))}
              </div>
            </div>

            <div className="am-section-card">
              <h3>{category.kids ? 'Age' : 'Body Size'}</h3>
              <p className="section-subtitle">
                {category.kids ? `Age of the ${category.id}:` : `Load ${category.id} model for this size:`}
              </p>
              <div className="presets-list">
                {sizesFor(category).map(p => (
                  <button
                    key={p.label}
                    className={`preset-btn ${selectedSize === p.label ? 'active' : ''}`}
                    style={fitsSize(p.label) === false && selectedSize !== p.label ? { opacity: 0.45 } : fitsSize(p.label) ? { borderColor: '#1d8348' } : undefined}
                    onClick={() => handleSizeChange(p.label)}
                    title={fitsSize(p.label) ? 'This gown fits this size' : undefined}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="am-section-card">
              <h3><Ruler size={18} /> Arms</h3>
              <p className="section-subtitle">Move the arms away from the gown, or hide them.</p>
              <div className="presets-list">
                {[['down', 'Down'], ['away', 'Away'], ['tpose', 'T-pose'], ['hide', 'Hide']].map(([id, label]) => (
                  <button key={id} className={`preset-btn ${arms === id ? 'active' : ''}`} onClick={() => setArms(id)}>{label}</button>
                ))}
              </div>
            </div>

            </>)}

            {tab === 'build' && (<>
            <div className="am-section-card">
              <h3><Sliders size={18} /> Body Build</h3>
              <p className="section-subtitle">Slim to heavy, belly and muscle (the gown follows).</p>
              {renderSlider('Weight (- slim / + heavy)', weight, setWeight, -1, 1)}
              {renderSlider('Belly', belly, setBelly, 0, 1)}
              {renderSlider('Muscle', muscle, setMuscle, 0, 1)}
              <div className="presets-list">
                <button className="preset-btn" onClick={() => applyPreset(category, selectedSize)}>
                  Reset build
                </button>
              </div>
            </div>

            </>)}

            {tab === 'scale' && (<>
            <div className="am-section-card">
              <h3><Sliders size={18} /> Fine-Tune Scale</h3>
              <p className="section-subtitle">Fine adjustments for {category.id} ({selectedSize}); the gown follows:</p>
              {renderSlider('Height', height, setHeight, 0.8, 1.3)}
              {renderSlider('Waist (Width)', waist, setWaist, 0.8, 1.3)}
              {renderSlider('Chest (Front)', chest, setChest, 0.8, 1.3)}
              {renderSlider('Hip', hip, setHip, 0.8, 1.3)}
            </div>

            <div className="am-section-card">
              <h3><Shirt size={18} /> Gown Fit</h3>
              <p className="section-subtitle">The gown auto-fits the avatar. Adjust if anything pokes through.</p>
              {renderSlider('Looseness', looseness, setLooseness, 0.95, 1.2)}
              {renderSlider('Gown length', length, setLength, 0.85, 1.15)}
              <label className="am-check">
                <input
                  type="checkbox"
                  checked={showBody}
                  onChange={(e) => setShowBody(e.target.checked)}
                />{' '}
                Show avatar body
              </label>
            </div>
            </>)}

            {tab === 'place' && (<>
            <div className="am-section-card">
              <h3><Move size={18} /> Place the gown</h3>
              <p className="section-subtitle">
                Best done on the Woman avatar, size M. Move the sliders until the gown sits right on the mannequin, then press Save.
                The position is added on top of the automatic fit, so it also works for the other sizes.
              </p>
              {selectedGown?.isExample && (
                <p className="section-subtitle" style={{ color: '#c0392b' }}>This is an example gown, so it cannot be saved. Pick a gown from your inventory.</p>
              )}
              <label className="am-check" style={{ display: 'block', marginBottom: 12 }}>
                <input
                  type="checkbox"
                  checked={!!tweak.exact}
                  onChange={(e) => { setTweak(prev => ({ ...prev, exact: e.target.checked })); setSaveMsg(''); }}
                />{' '}
                Exact position from Blender (no auto-fit)
              </label>
              {renderSlider('Size (whole gown)', tweak.s, setT('s'), 0.7, 1.3)}
              {renderSlider('Up / down', tweak.y, setT('y'), -0.3, 0.3)}
              {renderSlider('Width', tweak.w, setT('w'), 0.7, 1.4)}
              {renderSlider('Depth (front to back)', tweak.d, setT('d'), 0.7, 1.4)}
              <div className="presets-list">
                {!category.kids && (
                  <button className="preset-btn" onClick={() => applyPreset(category, 'M')}>Use size M</button>
                )}
                <button className="preset-btn active" onClick={saveFit} disabled={!selectedGown || selectedGown.isExample}>Save position</button>
                <button className="preset-btn" onClick={resetFit}>Reset</button>
              </div>
              {saveMsg && <p className="section-subtitle" style={{ marginTop: 10, fontWeight: 700 }}>{saveMsg}</p>}
              {selectedGown?.hasFit && !saveMsg && <p className="section-subtitle" style={{ marginTop: 10 }}>This gown already has a saved position.</p>}
            </div>
            </>)}
          </div>

          {/* ===== CENTER: 3D CANVAS ===== */}
          <div className="am-canvas-panel">
            <div className="am-canvas-wrapper">
              <div className="canvas-header">
                <span className="live-badge">
                  <span className="live-dot"></span> Admin 3D Studio
                </span>
                <span className="am-head-right">
                  <button
                    type="button"
                    className="am-bg-toggle"
                    onClick={toggleBg}
                    title={bgMode === 'dark' ? 'Switch to light background' : 'Switch to dark background'}
                  >
                    {bgMode === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
                    {bgMode === 'dark' ? 'Light' : 'Dark'}
                  </button>
                  <span className="active-item-tag">
                    {selectedGown ? selectedGown.name : 'No gown'} • {category.id} ({selectedSize})
                  </span>
                </span>
              </div>

              {!audienceOk && (
                <p style={{ margin: '0 0 12px', padding: '8px 12px', borderRadius: 10, fontSize: '0.82rem', fontWeight: 600, background: '#fff0f0', color: '#c0392b' }}>
                  {`Cannot be worn. This item is for ${AUDIENCE_LABEL[audienceOf(selectedGown)]}, but the ${category.id} avatar is selected. Choose the matching avatar.`}
                </p>
              )}

              {audienceOk && sizeCheck && (
                <p
                  style={{
                    margin: '0 0 12px', padding: '8px 12px', borderRadius: 10, fontSize: '0.82rem', fontWeight: 600,
                    background: sizeCheck.ok ? '#e6f9ee' : '#fff0f0',
                    color: sizeCheck.ok ? '#1d8348' : '#c0392b',
                  }}
                >
                  {sizeCheck.ok
                    ? `The gown fits (gown size ${gownSizes.join(' / ')}, avatar is about ${sizeCheck.now}).`
                    : `Does not fit. The gown is for ${gownSizes.join(' / ')} and the avatar is about ${sizeCheck.now}. Adjust Waist/Chest or Weight until it reaches ${gownSizes.join(' / ')}.`}
                </p>
              )}

              <div className={`canvas-viewport-container ${bgMode}`}>
                <Suspense fallback={<div className="m3d-loading-text">Loading 3D Scene...</div>}>
                  <Canvas key={category.id} camera={{ position: [0, 0, category.kids ? 3.4 : 4.5], fov: 45 }}>
                    <ambientLight intensity={0.35} />
                    <directionalLight position={[6, 9, 6]} intensity={0.8} />
                    <directionalLight position={[-6, 4, -4]} intensity={0.5} color="#9db4ff" />

                    <Suspense fallback={null}>
                      <Stage environment="studio" intensity={0.22} adjustCamera={false}>
                        <Scene
                          bodyPath={bodyModelPath}
                          gownPath={canWear ? selectedGown?.modelPath : null}
                          onMeasured={setBodyRaw}
                          showBody={showBody}
                          arms={arms}
                          tweak={tweak}
                          build={build}
                          looseness={looseness}
                          length={length}
                          scale={[waist * modelScale, height * modelScale, chest * modelScale]}
                        />
                      </Stage>
                    </Suspense>

                    <OrbitControls enableZoom minDistance={1.2} maxDistance={6} />
                  </Canvas>
                </Suspense>
              </div>
            </div>
          </div>

          {/* ===== RIGHT: GOWN LIST ===== */}
          <div className="am-gown-panel">
            <div className="am-section-card full-height">
              <h3><Shirt size={18} /> Gown Selection</h3>

              <div className="am-search">
                <Search size={14} className="am-search-icon" />
                <input
                  type="text"
                  placeholder="Search gown or category..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>

              <div className="gown-grid-selector">
                {filteredGowns.length === 0 && (
                  <p className="am-empty">No gowns found.</p>
                )}
                {filteredGowns.map(gown => (
                  <div
                    key={gown.id}
                    className={`gown-select-card ${selectedGown?.id === gown.id ? 'selected' : ''}`}
                    onClick={() => handlePickGown(gown)}
                  >
                    <div className="gown-thumbnail-wrapper">
                      {gown.thumbnail && <img src={gown.thumbnail} alt={gown.name} />}
                    </div>
                    <div className="gown-meta-details">
                      <h4>{gown.name}</h4>
                      <div className="size-tags">
                        {gown.isExample ? (
                          <span className="example-badge">Example</span>
                        ) : (
                          <>
                            {gown.size && <span className="size-badge">{gown.size}</span>}
                            {gown.hasFit && <span className="example-badge">Fit saved</span>}
                            <span className="example-badge">{AUDIENCE_LABEL[audienceOf(gown)]}</span>
                            <span className={`stock-badge ${gown.stock === 0 ? 'out' : 'in'}`}>
                              {gown.stock === 0 ? 'Out of stock' : `${gown.stock} in stock`}
                            </span>
                            {!gown.modelPath && <span className="no3d-badge">No 3D file</span>}
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ===== MOBILE BOTTOM BAR (hidden on desktop) ===== */}
          <nav className="am-nav" aria-label="3D tools">
            <button type="button" className={sheet === 'gowns' ? 'active' : ''} onClick={() => setSheet(s => (s === 'gowns' ? 'closed' : 'gowns'))}>
              <Shirt size={17} /> Gowns
            </button>
            {[['avatar', 'Avatar', Ruler], ['build', 'Body', Sliders], ['scale', 'Scale', Maximize2], ['place', 'Place', Move]].map(([k, label, Icon]) => (
              <button
                key={k}
                type="button"
                className={sheet === 'controls' && tab === k ? 'active' : ''}
                onClick={() => {
                  if (sheet === 'controls' && tab === k) setSheet('closed');
                  else { setTab(k); setSheet('controls'); }
                }}
              >
                <Icon size={17} /> {label}
              </button>
            ))}
          </nav>

        </div>
      </div>
    </>
  );
};

export default AdminMannequin;