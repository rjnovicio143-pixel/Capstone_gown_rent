import React, { useState, useEffect, useMemo, Suspense, Component } from 'react';
import * as THREE from 'three';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Stage, useGLTF } from '@react-three/drei';
import { Sliders, Ruler, Shirt, Search } from 'lucide-react';
import { supabase } from '../supabaseClient';
import Header from '../components/Header';
import '../styles/AdminMannequin.css';

/* ---------- ERROR BOUNDARY ---------- */
class ModelErrorBoundary extends Component {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  render() {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}

/* ==========================================================
   AUTO-FIT: sukdon ang avatar, i-fit ang gown niini
   ----------------------------------------------------------
   1. Sukdon ang avatar (Box3): gitas-on + gilapdon/gibag-on sa
      dughan, hawak ug hips (mga "slice" sa lawas).
   2. Ang gown i-scale aron ang hem naa sa salog ug ang taas
      sakto sa lawas (FIT.coverTop = pila % sa gitas-on sa avatar
      ang gisakpan sa gown, gikan sa salog).
   3. Sa matag slice, itandi ang gown sa lawas. Kung mas pig-ot
      ang gown, i-lapdon (x/z) hangtod mas dako gamay kay sa lawas
      (FIT.margin) -> dili na mo-gawas/mo-lapas ang mannequin.
   Ang mga numero sa ubos mao ang pwede nimo i-tune.
   ========================================================== */
const FIT = {
  coverTop: 0.84,   // top sa gown = 84% sa gitas-on sa avatar (hapit sa abaga)
  slices: [         // asa nga gitas-on sa lawas nato i-check (0 = tiil, 1 = ulo)
    ['chest', 0.72],
    ['waist', 0.62],
    ['hip', 0.52],
  ],
  band: 0.02,       // gibag-on sa slice (2% sa gitas-on)
  margin: 1.03,     // gown mas dako 3% kay sa lawas
  armTrim: 0.08,    // i-ignore ang 8% sa dulo sa lapad sa lawas (aron dili makuha ang mga bukton)
  minXZ: 0.8,       // limit sa pag-lapdon / pag-pig-ot sa gown
  maxXZ: 1.6,
};

// Moagi sa tanang vertices (sa world coordinates)
function eachVertex(root, fn) {
  root.updateWorldMatrix(true, true);
  const v = new THREE.Vector3();
  root.traverse((o) => {
    const pos = o.isMesh && o.geometry?.attributes?.position;
    if (!pos) return;
    for (let i = 0; i < pos.count; i += 1) {
      v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
      fn(v);
    }
  });
}

// Gilapdon / gibag-on sa usa ka "hiwa" sa model tali sa y0 ug y1
function sliceExtents(root, y0, y1, trimX = 0) {
  const xs = [];
  const zs = [];
  eachVertex(root, (v) => {
    if (v.y >= y0 && v.y <= y1) { xs.push(v.x); zs.push(v.z); }
  });
  if (xs.length < 3) return null;
  xs.sort((a, b) => a - b);
  zs.sort((a, b) => a - b);
  const lo = Math.floor(xs.length * trimX);
  const hi = xs.length - 1 - lo;
  return {
    halfW: (xs[hi] - xs[lo]) / 2,
    halfD: (zs[zs.length - 1] - zs[0]) / 2,
    cx: (xs[hi] + xs[lo]) / 2,
    cz: (zs[zs.length - 1] + zs[0]) / 2,
  };
}

function measureBody(root) {
  // 1) Kung ang .glb naay sulod nga sukod ("fit" sa extras), gamiton kana - mas saktong-sakto
  let meta = null;
  root.traverse((o) => { if (!meta && o.userData?.fit?.slices) meta = o.userData.fit; });
  if (meta) {
    return {
      ok: true,
      height: meta.height,
      minY: meta.minY || 0,
      cx: meta.cx || 0,
      cz: 0,
      coverTop: meta.coverTop,
      slices: meta.slices,
      morphs: meta.morphs || {},      // pila ang madugang sa matag slice kung i-slide ang weight / belly / muscle
    };
  }

  // 2) Kung wala, sukdon gikan sa mesh (approximate)
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  if (box.isEmpty() || !(size.y > 0)) return { ok: false };

  const slices = FIT.slices
    .map(([name, ratio]) => {
      const y = box.min.y + ratio * size.y;
      const ext = sliceExtents(root, y - FIT.band * size.y, y + FIT.band * size.y, FIT.armTrim);
      return ext ? { name, y, ...ext } : null;
    })
    .filter(Boolean);

  return {
    ok: true,
    height: size.y,
    minY: box.min.y,
    cx: (box.min.x + box.max.x) / 2,
    cz: (box.min.z + box.max.z) / 2,
    slices,
    morphs: {},
  };
}

// Ang sukod sa lawas sumala sa posisyon sa sliders (weight / belly / muscle)
function applyBuild(raw, build) {
  if (!raw?.ok) return raw;
  const slices = raw.slices.map((sl, i) => {
    let { halfW, halfD } = sl;
    let cz = sl.cz ?? raw.cz ?? 0;
    Object.entries(build).forEach(([name, v]) => {
      const d = raw.morphs?.[name]?.[i];
      if (!d || !v) return;
      halfW += v * d.dHalfW;
      halfD += v * d.dHalfD;
      cz += v * d.dCz;
    });
    return { ...sl, halfW, halfD, cz };
  });
  const mid = slices.length ? slices.reduce((sum, sl) => sum + sl.cz, 0) / slices.length : raw.cz;
  return { ...raw, slices, cz: mid };
}

// Sukdon ang gown sa mga gitas-on sa lawas (usa ra, kay dili mausab ang gitas-on sa pag-slide sa build)
function gownProfile(root, body, length) {
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  if (box.isEmpty() || !(size.y > 0)) return null;

  // Taas: i-scale uniformly
  const s = (body.height * (body.coverTop || FIT.coverTop) * length) / size.y;
  const gb = (FIT.band * body.height) / s;
  const rows = body.slices.map((sl) => {
    const gy = box.min.y + (sl.y - body.minY) / s;           // samang gitas-on sa gown (local)
    const g = sliceExtents(root, gy - gb, gy + gb, 0);
    return g && g.halfW > 0 && g.halfD > 0 ? g : null;       // null = wala'y gown sa kana nga gitas-on
  });
  return { box, s, rows };
}

// Kuhaon ang scale + position sa gown aron mo-fit sa avatar (paspas, mahimo matag slide)
function gownFit(profile, body, looseness) {
  const identity = { scale: [1, 1, 1], position: [0, 0, 0] };
  if (!profile || !body?.ok) return identity;
  const { box, s, rows } = profile;

  // Lapad / gibag-on: tandi sa matag slice sa lawas
  let fx = 0;
  let fz = 0;
  body.slices.forEach((sl, i) => {
    const g = rows[i];
    if (!g) return;
    fx = Math.max(fx, (sl.halfW * FIT.margin) / (g.halfW * s));   // pila ka-dako kinahanglan ang gown
    fz = Math.max(fz, ((sl.halfD + Math.abs((sl.cz ?? body.cz) - body.cz)) * FIT.margin) / (g.halfD * s));
  });
  if (fx === 0) fx = 1;   // wala'y slice nga na-tandi -> ayaw usba
  if (fz === 0) fz = 1;
  const clamp = (n) => Math.min(FIT.maxXZ, Math.max(FIT.minXZ, n));
  const sx = s * clamp(fx * looseness);
  const sz = s * clamp(fz * looseness);

  // Posisyon: hem sa salog, sentro sa avatar
  const gcx = (box.min.x + box.max.x) / 2;
  const gcz = (box.min.z + box.max.z) / 2;
  return {
    scale: [sx, s, sz],
    position: [body.cx - sx * gcx, body.minY - s * box.min.y, body.cz - sz * gcz],
  };
}

/* ---------- MODELS ---------- */
// Usa ka kopya matag model, aron dili mag-clone matag render
function useClonedGLB(path) {
  const { scene } = useGLTF(path);
  return useMemo(() => scene.clone(true), [scene]);
}

// Ang avatar. Ang "build" (weight / belly / muscle) mao ang morph targets sulod sa .glb
function Body({ modelPath, visible, build, onProfile }) {
  const scene = useClonedGLB(modelPath);
  const profile = useMemo(() => measureBody(scene), [scene]);
  useEffect(() => { onProfile(profile); }, [profile, onProfile]);

  useEffect(() => {
    scene.traverse((o) => {
      if (!o.isMesh) return;
      o.frustumCulled = false;               // ang morph mo-gawas sa orihinal nga gidak-on
      const dict = o.morphTargetDictionary;
      if (!dict || !o.morphTargetInfluences) return;
      Object.entries(build).forEach(([name, v]) => {
        if (dict[name] !== undefined) o.morphTargetInfluences[dict[name]] = v;
      });
    });
  }, [scene, build]);

  return <primitive object={scene} visible={visible} />;
}

// Kung dili ma-load ang avatar file
function FallbackBody({ onProfile }) {
  useEffect(() => { onProfile({ ok: false }); }, [onProfile]);
  return (
    <mesh position={[0, 1, 0]}>
      <cylinderGeometry args={[0.3, 0.4, 2, 16]} />
      <meshStandardMaterial color="#c5a880" roughness={0.5} metalness={0.1} />
    </mesh>
  );
}

function FittedGown({ modelPath, body, looseness, length }) {
  const scene = useClonedGLB(modelPath);
  const ysKey = body.ok ? body.slices.map(sl => sl.y).join(',') : '';

  // Mahal ni (nag-sukod sa gown), mao nga usa ra kada gown / avatar / gown length
  const profile = useMemo(
    () => (body.ok ? gownProfile(scene, body, length) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scene, body.ok, body.height, body.minY, body.coverTop, ysKey, length]
  );
  const fit = useMemo(() => gownFit(profile, body, looseness), [profile, body, looseness]);

  return (
    <group position={fit.position} scale={fit.scale}>
      <primitive object={scene} />
    </group>
  );
}

function FallbackGown() {
  return (
    <mesh position={[0, 1, 0]}>
      <cylinderGeometry args={[0.35, 0.5, 2, 16]} />
      <meshStandardMaterial color="#b33939" roughness={0.5} metalness={0.1} />
    </mesh>
  );
}

// Ang tibuok eksena: avatar + gown nga na-fit sa iyang sukod
function Scene({ bodyPath, gownPath, showBody, build, looseness, length, scale, onMeasured }) {
  const [raw, setRaw] = useState(null);   // null = wala pa na-sukod ang avatar
  useEffect(() => { if (onMeasured) onMeasured(raw); }, [raw, onMeasured]);
  const body = useMemo(() => applyBuild(raw, build), [raw, build]);

  return (
    <group scale={scale} position={[0, -1, 0]}>
      <ModelErrorBoundary key={bodyPath} fallback={<FallbackBody onProfile={setRaw} />}>
        <Body modelPath={bodyPath} visible={showBody} build={build} onProfile={setRaw} />
      </ModelErrorBoundary>

      {gownPath && body && (
        <ModelErrorBoundary key={gownPath} fallback={<FallbackGown />}>
          <FittedGown modelPath={gownPath} body={body} looseness={looseness} length={length} />
        </ModelErrorBoundary>
      )}
    </group>
  );
}

/* ---------- CONSTANTS ---------- */
// Mga klase sa avatar. Ang matag usa naay .glb sa public/mannequin/<file>.glb
const CATEGORIES = [
  { id: 'Woman', file: 'female', kids: false },
  { id: 'Man', file: 'male', kids: false },
  { id: 'Girl', file: 'girl', kids: true },
  { id: 'Boy', file: 'boy', kids: true },
];

// Mga preset sa size: scale (gidak-on) + weight (-1 payat ... +1 tambok)
const ADULT_SIZES = [
  { label: 'S', scale: 0.97, weight: -0.35, belly: 0 },
  { label: 'M', scale: 1.0, weight: 0, belly: 0 },
  { label: 'L', scale: 1.02, weight: 0.3, belly: 0.15 },
  { label: 'XL', scale: 1.04, weight: 0.6, belly: 0.35 },
  { label: 'XXL', scale: 1.06, weight: 1.0, belly: 0.6 },
];
// Mga bata: pinaagi sa edad (ang base nga avatar kay mga 5-6 anyos)
const KID_SIZES = [
  { label: '3-4y', scale: 0.86, weight: 0 },
  { label: '5-6y', scale: 1.0, weight: 0 },
  { label: '7-8y', scale: 1.1, weight: 0 },
  { label: '9-10y', scale: 1.21, weight: 0 },
  { label: '11-12y', scale: 1.31, weight: 0 },
];
const sizesFor = (cat) => (cat.kids ? KID_SIZES : ADULT_SIZES);
const defaultSizeFor = (cat) => (cat.kids ? '5-6y' : 'M');

// Basahon ang size sa gown (e.g. "L", "Large", "L-XL", "L to XL", "L, XL", "Medium") -> ['L','XL'].
// Kung dili masabtan ang size, mobalik og null (walay pag-check).
const SIZE_ORDER = ['S', 'M', 'L', 'XL', 'XXL'];
const SIZE_WORDS = [
  [/extra\s*extra\s*large|2\s*xl|xxl/g, ' XXL '],
  [/extra\s*large|x-?large|\bxl\b/g, ' XL '],
  [/medium/g, ' M '],
  [/large/g, ' L '],
  [/small/g, ' S '],
];
const parseGownSizes = (raw) => {
  if (!raw) return null;
  let t = String(raw).toLowerCase();
  SIZE_WORDS.forEach(([re, rep]) => { t = t.replace(re, rep); });
  const tokens = t.toUpperCase().match(/\b(?:XXL|XL|S|M|L)\b/g);
  if (!tokens) return null;
  const idx = tokens.map(x => SIZE_ORDER.indexOf(x));
  const isRange = /-|–|\bto\b|hangtod|until/i.test(String(raw)) && idx.length >= 2;
  if (isRange) {
    const lo = Math.min(...idx), hi = Math.max(...idx);
    return SIZE_ORDER.slice(lo, hi + 1);
  }
  return SIZE_ORDER.filter((_, i) => idx.includes(i));
};

// Libut sa lawas (chest + waist + hip, metros) sumala sa build ug scale. Gamiton para sa "pwede ba ma-sout ang gown".
const ellipseGirth = (a, b) => Math.PI * (3 * (a + b) - Math.sqrt((3 * a + b) * (a + 3 * b)));
const makeBuild = (weight, belly, muscle, kids) => ({
  weight: weight < 0 ? weight * 0.4 : weight * (kids ? 0.6 : 1),
  belly: belly * (kids ? 0.7 : 1),
  muscle: muscle * (kids ? 0.5 : 1),
});
const bodyGirth = (raw, build, sx, sz) => {
  const b = applyBuild(raw, build);
  if (!b?.ok) return null;
  let sum = 0;
  b.slices.forEach((sl) => {
    if (['chest', 'waist', 'hip'].includes(sl.name)) sum += ellipseGirth(sl.halfW * sx, sl.halfD * sz);
  });
  return sum || null;
};
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
  const [tab, setTab] = useState('avatar');          // avatar | build | scale
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
  const canWear = !sizeCheck || sizeCheck.ok;
  const handleCategoryChange = (id) => {
    const cat = CATEGORIES.find(c => c.id === id) || CATEGORIES[0];
    setCategoryId(id);
    applyPreset(cat, defaultSizeFor(cat));
  };

  // Pagpili og gown: i-reset ang fit, ug kung naay size sa inventory (S/M/L...), i-load ang samang avatar
  const handlePickGown = (gown) => {
    setSelectedGown(gown);
    setLooseness(1.0);
    setLength(1.0);
    const allowed = category.kids ? null : parseGownSizes(gown.size);
    if (allowed && !allowed.includes(selectedSize)) handleSizeChange(allowed[0]);
  };

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

        <div className="am-grid-layout">

          {/* ===== LEFT: CONTROLS ===== */}
          <div className="am-control-panel">
            <div className="am-section-card">
              <div className="presets-list">
                {[['avatar', 'Avatar'], ['build', 'Body'], ['scale', 'Scale']].map(([k, label]) => (
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
          </div>

          {/* ===== CENTER: 3D CANVAS ===== */}
          <div className="am-canvas-panel">
            <div className="am-canvas-wrapper">
              <div className="canvas-header">
                <span className="live-badge">
                  <span className="live-dot"></span> Admin 3D Studio
                </span>
                <span className="active-item-tag">
                  {selectedGown ? selectedGown.name : 'No gown'} • {category.id} ({selectedSize})
                </span>
              </div>

              {sizeCheck && (
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

              <div className="canvas-viewport-container">
                <Suspense fallback={<div className="m3d-loading-text">Loading 3D Scene...</div>}>
                  <Canvas key={category.id} camera={{ position: [0, 0, category.kids ? 3.4 : 4.5], fov: 45 }}>
                    <ambientLight intensity={0.7} />
                    <directionalLight position={[10, 10, 5]} intensity={1} />

                    <Suspense fallback={null}>
                      <Stage environment="city" intensity={0.5} adjustCamera={false}>
                        <Scene
                          bodyPath={bodyModelPath}
                          gownPath={canWear ? selectedGown?.modelPath : null}
                          onMeasured={setBodyRaw}
                          showBody={showBody}
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