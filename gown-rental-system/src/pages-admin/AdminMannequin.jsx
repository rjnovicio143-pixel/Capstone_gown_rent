import React, { useState, useEffect, Suspense, Component } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Stage, useGLTF } from '@react-three/drei';
import { Sliders, Ruler, Shirt, Search } from 'lucide-react';
import { supabase } from '../supabaseClient';
import Header from '../components/Header';
import '../styles/AdminMannequin.css';

/* ---------- ERROR BOUNDARY + SAFE MODEL LOADER ---------- */
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

/* ---------- CONSTANTS ---------- */
const SIZES = ['S', 'M', 'L', 'XL', 'XXL'];
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
  stock: Number(row.stock) || 0,
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

  const [gender, setGender] = useState('Female');
  const [selectedSize, setSelectedSize] = useState('M');

  const [height, setHeight] = useState(1.0);
  const [waist, setWaist] = useState(1.0);
  const [chest, setChest] = useState(1.0);
  const [hip, setHip] = useState(1.0);

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
      if (firstWith3D) setSelectedGown(firstWith3D);
    };
    fetchGowns();
  }, []);

  // Inventory una, examples sunod
  const allGowns = [...gowns, ...EXAMPLE_GOWNS];

  const filteredGowns = allGowns.filter(g =>
    g.name?.toLowerCase().includes(search.toLowerCase()) ||
    g.category?.toLowerCase().includes(search.toLowerCase())
  );

  const bodyModelPath = `/mannequin/${gender.toLowerCase()}_${selectedSize.toLowerCase()}.glb`;

  const resetSliders = () => {
    setHeight(1.0); setWaist(1.0); setChest(1.0); setHip(1.0);
  };

  const handleSizeChange = (size) => { setSelectedSize(size); resetSliders(); };
  const handleGenderChange = (g) => { setGender(g); resetSliders(); };

  const renderSlider = (label, value, setter) => (
    <div className="slider-group">
      <div className="slider-label">
        <span>{label}</span>
        <span>{Math.round(value * 100)}%</span>
      </div>
      <input
        type="range" min="0.9" max="1.1" step="0.01"
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

        <div className="am-grid-layout">

          {/* ===== LEFT: CONTROLS ===== */}
          <div className="am-control-panel">
            <div className="am-section-card">
              <h3><Ruler size={18} /> Avatar Selection</h3>
              <p className="section-subtitle">Choose base avatar type.</p>
              <div className="gender-tabs">
                {['Female', 'Male'].map(g => (
                  <button
                    key={g}
                    className={`gender-btn ${gender === g ? 'active' : ''}`}
                    onClick={() => handleGenderChange(g)}
                  >
                    {g}
                  </button>
                ))}
              </div>
            </div>

            <div className="am-section-card">
              <h3>Body Size</h3>
              <p className="section-subtitle">Load {gender} model for this size:</p>
              <div className="presets-list">
                {SIZES.map(size => (
                  <button
                    key={size}
                    className={`preset-btn ${selectedSize === size ? 'active' : ''}`}
                    onClick={() => handleSizeChange(size)}
                  >
                    {size}
                  </button>
                ))}
              </div>
            </div>

            <div className="am-section-card">
              <h3><Sliders size={18} /> Fine-Tune Scale</h3>
              <p className="section-subtitle">Adjust the loaded {selectedSize} model:</p>
              {renderSlider('Height', height, setHeight)}
              {renderSlider('Waist (Width)', waist, setWaist)}
              {renderSlider('Chest (Front)', chest, setChest)}
              {renderSlider('Hip', hip, setHip)}
            </div>
          </div>

          {/* ===== CENTER: 3D CANVAS ===== */}
          <div className="am-canvas-panel">
            <div className="am-canvas-wrapper">
              <div className="canvas-header">
                <span className="live-badge">
                  <span className="live-dot"></span> Admin 3D Studio
                </span>
                <span className="active-item-tag">
                  {selectedGown ? selectedGown.name : 'No gown'} • {gender} ({selectedSize})
                </span>
              </div>

              <div className="canvas-viewport-container">
                <Suspense fallback={<div className="m3d-loading-text">Loading 3D Scene...</div>}>
                  <Canvas key={`${gender}-${selectedSize}`} camera={{ position: [0, 0, 4.5], fov: 45 }}>
                    <ambientLight intensity={0.7} />
                    <directionalLight position={[10, 10, 5]} intensity={1} />

                    <Suspense fallback={null}>
                      <Stage environment="city" intensity={0.5}>
                        <group scale={[waist, height, chest]} position={[0, -1, 0]}>
                          <Safe3DModel
                            modelPath={bodyModelPath}
                            scale={[1, 1, 1]}
                            color="#c5a880"
                          />
                          {selectedGown?.modelPath && (
                            <Safe3DModel
                              modelPath={selectedGown.modelPath}
                              scale={[1.02, 1, 1.02]}
                              color="#b33939"
                            />
                          )}
                        </group>
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
                  <p className="am-empty">Walay gown nga nakit-an.</p>
                )}
                {filteredGowns.map(gown => (
                  <div
                    key={gown.id}
                    className={`gown-select-card ${selectedGown?.id === gown.id ? 'selected' : ''}`}
                    onClick={() => setSelectedGown(gown)}
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

        </div>
      </div>
    </>
  );
};

export default AdminMannequin;