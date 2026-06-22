import React, { useState, Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Stage, useGLTF } from '@react-three/drei';
import { Sliders, Ruler, Shirt } from 'lucide-react';
import '../styles-public/Mannequin3D.css';

// 1. SAFE GLTF LOADER NGA DILI MO-CRASH UG DILI MAG-FALLBACK OG WALAY SAKTONG FILE
function Safe3DModel({ modelPath, scale, color }) {
  try {
    // Sulayan pag-load ang .glb file
    const { scene } = useGLTF(modelPath);
    return <primitive object={scene.clone()} scale={scale} />;
  } catch (error) {
    // KUNG WALA PA ANG .GLB FILE:
    // Mag-render lang og simple Three.js Cube o Cylinder aron dili mo-crash ang imong Canvas!
    return (
      <mesh scale={scale} position={[0, 0, 0]}>
        <cylinderGeometry args={[0.3, 0.4, 2, 16]} />
        <meshStandardMaterial color={color} roughness={0.5} metalness={0.1} />
      </mesh>
    );
  }
}

// 2. MGA PRESET SIZES
const SIZES = ['S', 'M', 'L', 'XL', 'XXL'];

const GOWN_LIST = [
  { 
    id: 'gown1', 
    name: 'Red Dress Ruby', 
    thumbnail: '/images/Red rose.jpg', 
    modelPath: '/gown/elegant_rose.glb',
    sizes: ['S', 'M', 'L']
  },
  { 
    id: 'gown2', 
    name: 'Blue Gown', 
    thumbnail: '/images/Sky blye.jpg', 
    modelPath: '/gown/blue_dress.glb',
    sizes: ['M',]
  },
  { 
    id: 'gown3', 
    name: 'Black Dress', 
    thumbnail: '/images/Black.jpg', 
    modelPath: '/gown/black_dress.glb',
    sizes: ['S', 'M',]
  },
  { 
    id: 'gown4', 
    name: 'Golden Gown', 
    thumbnail: '/images/premium.jpg', 
    modelPath: '/gown/golden_gown.glb',
    sizes: [ 'L', 'XXL']
  }
];

const Mannequin3D = () => {
  const [gender, setGender] = useState('Female'); 
  const [selectedSize, setSelectedSize] = useState('M'); 
  const [selectedGown, setSelectedGown] = useState(GOWN_LIST[0]);

  // Fine-tuning adjustments
  const [height, setHeight] = useState(1.0);
  const [waist, setWaist] = useState(1.0);
  const [chest, setChest] = useState(1.0);
  const [hip, setHip] = useState(1.0);

  // Dynamic Filename Generation
  const bodyModelPath = `/mannequin/${gender.toLowerCase()}_${selectedSize.toLowerCase()}.glb`;

  const handleSizeChange = (size) => {
    setSelectedSize(size);
    setHeight(1.0);
    setWaist(1.0);
    setChest(1.0);
    setHip(1.0);
  };

  const handleGenderChange = (selectedGender) => {
    setGender(selectedGender);
    setHeight(1.0);
    setWaist(1.0);
    setChest(1.0);
    setHip(1.0);
  };

  return (
    <div className="m3d-page-container">
      <div className="m3d-grid-layout">
        
        {/* ================= LEFT SIDEBAR: CONTROLS ================= */}
        <div className="m3d-control-panel">
          
          {/* Avatar & Gender Selection */}
          <div className="m3d-section-card">
            <h3><Ruler size={18} /> Avatar Selection</h3>
            <p className="section-subtitle">Choose your base avatar type.</p>
            <div className="gender-tabs">
              <button 
                className={`gender-btn ${gender === 'Female' ? 'active' : ''}`}
                onClick={() => handleGenderChange('Female')}
              >
                Female
              </button>
              <button 
                className={`gender-btn ${gender === 'Male' ? 'active' : ''}`}
                onClick={() => handleGenderChange('Male')}
              >
                Male
              </button>
            </div>
          </div>

          {/* Dynamic Size Presets */}
          <div className="m3d-section-card">
            <h3>Basic Body Measurements</h3>
            <p className="section-subtitle">Load {gender} model file for this size:</p>
            <div className="presets-list">
              {SIZES.map((size) => (
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

          {/* Fine-Tuning Scale Adjustments */}
          <div className="m3d-section-card">
            <h3><Sliders size={18} /> Fine-Tune Scale</h3>
            <p className="section-subtitle">Slightly adjust the loaded {selectedSize} model:</p>
            
            <div className="slider-group">
              <div className="slider-label">
                <span>Height</span>
                <span>{Math.round(height * 100)}%</span>
              </div>
              <input 
                type="range" min="0.9" max="1.1" step="0.01" 
                value={height} 
                onChange={(e) => setHeight(parseFloat(e.target.value))} 
              />
            </div>

            <div className="slider-group">
              <div className="slider-label">
                <span>Waist (Width)</span>
                <span>{Math.round(waist * 100)}%</span>
              </div>
              <input 
                type="range" min="0.9" max="1.1" step="0.01" 
                value={waist} 
                onChange={(e) => setWaist(parseFloat(e.target.value))} 
              />
            </div>

            <div className="slider-group">
              <div className="slider-label">
                <span>Chest (Front)</span>
                <span>{Math.round(chest * 100)}%</span>
              </div>
              <input 
                type="range" min="0.9" max="1.1" step="0.01" 
                value={chest} 
                onChange={(e) => setChest(parseFloat(e.target.value))} 
              />
            </div>

            <div className="slider-group">
              <div className="slider-label">
                <span>Hip</span>
                <span>{Math.round(hip * 100)}%</span>
              </div>
              <input 
                type="range" min="0.9" max="1.1" step="0.01" 
                value={hip} 
                onChange={(e) => setHip(parseFloat(e.target.value))} 
              />
            </div>
          </div>

        </div>

        {/* ================= CENTER: LIVE 3D PREVIEW ================= */}
        <div className="m3d-canvas-panel">
          <div className="m3d-canvas-wrapper">
            <div className="canvas-header">
              <span className="live-badge">
                <span className="live-dot"></span> Interactive 3D Studio
              </span>
              <span className="active-item-tag">
                Loaded: {gender} ({selectedSize})
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

                        <Safe3DModel 
                          modelPath={selectedGown.modelPath} 
                          scale={[1.02, 1, 1.02]} 
                          color="#b33939" 
                        />

                      </group>
                    </Stage>
                  </Suspense>

                  <OrbitControls enableZoom={true} minDistance={1.2} maxDistance={6} />
                </Canvas>
              </Suspense>
            </div>
          </div>
        </div>

        {/* ================= RIGHT: GOWN SELECTION ================= */}
        <div className="m3d-gown-panel">
          <div className="m3d-section-card full-height">
            <h3><Shirt size={18} /> Gown Selection</h3>
            <p className="section-subtitle">Select a gown to fit on the {selectedSize} mannequin.</p>

            <div className="gown-grid-selector">
              {GOWN_LIST.map((gown) => (
                <div 
                  key={gown.id}
                  className={`gown-select-card ${selectedGown?.id === gown.id ? 'selected' : ''}`}
                  onClick={() => setSelectedGown(gown)}
                >
                  <div className="gown-thumbnail-wrapper">
                    <img src={gown.thumbnail} alt={gown.name} />
                  </div>
                  <div className="gown-meta-details">
                    <h4>{gown.name}</h4>
                    <div className="size-tags">
                      {gown.sizes.map(s => <span key={s} className="size-badge">{s}</span>)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};

export default Mannequin3D;