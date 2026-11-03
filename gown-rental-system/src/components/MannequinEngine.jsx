import React, { useState, useEffect, useMemo, Component } from 'react';
import * as THREE from 'three';
import { useGLTF } from '@react-three/drei';

/* ==========================================================
   MannequinEngine.jsx
   Shared by the Admin page and the Customer page:
   - avatars (Woman, Man, Girl, Boy) with weight / belly / muscle morph targets
   - size presets (S-XXL, kids by age)
   - auto-fit of a gown to the avatar
   - rules: who can wear what (women / men / girls / boys / kids) and which sizes a gown fits
   ========================================================== */

/* ---------- ERROR BOUNDARY ---------- */
export class ModelErrorBoundary extends Component {
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
export function applyBuild(raw, build) {
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
export function Scene({ bodyPath, gownPath, showBody, build, looseness, length, scale, onMeasured }) {
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
export const CATEGORIES = [
  { id: 'Woman', file: 'female', kids: false },
  { id: 'Man', file: 'male', kids: false },
  { id: 'Girl', file: 'girl', kids: true },
  { id: 'Boy', file: 'boy', kids: true },
];

// Mga preset sa size: scale (gidak-on) + weight (-1 payat ... +1 tambok)
export const ADULT_SIZES = [
  { label: 'S', scale: 0.97, weight: -0.35, belly: 0 },
  { label: 'M', scale: 1.0, weight: 0, belly: 0 },
  { label: 'L', scale: 1.02, weight: 0.3, belly: 0.15 },
  { label: 'XL', scale: 1.04, weight: 0.6, belly: 0.35 },
  { label: 'XXL', scale: 1.06, weight: 1.0, belly: 0.6 },
];
// Mga bata: pinaagi sa edad (ang base nga avatar kay mga 5-6 anyos)
export const KID_SIZES = [
  { label: '3-4y', scale: 0.86, weight: 0 },
  { label: '5-6y', scale: 1.0, weight: 0 },
  { label: '7-8y', scale: 1.1, weight: 0 },
  { label: '9-10y', scale: 1.21, weight: 0 },
  { label: '11-12y', scale: 1.31, weight: 0 },
];
// Kinsa ang mo-sul-ob sa gown / suit: women | men | girls | boys | kids (girl or boy)
export const AUDIENCE_LABEL = { women: 'Women', men: 'Men', girls: 'Girls', boys: 'Boys', kids: 'Kids' };
export const audienceOf = (g) => g.audience || (g.type === 'suit' ? 'men' : 'women');
const AVATAR_AUDIENCE = { Woman: ['women'], Man: ['men'], Girl: ['girls', 'kids'], Boy: ['boys', 'kids'] };
export const audienceFits = (aud, cat) => (AVATAR_AUDIENCE[cat.id] || []).includes(aud);
export const sizesFor = (cat) => (cat.kids ? KID_SIZES : ADULT_SIZES);
export const defaultSizeFor = (cat) => (cat.kids ? '5-6y' : 'M');

// Basahon ang size sa gown (e.g. "L", "Large", "L-XL", "L to XL", "L, XL", "Medium") -> ['L','XL'].
// Kung dili masabtan ang size, mobalik og null (walay pag-check).
export const SIZE_ORDER = ['S', 'M', 'L', 'XL', 'XXL'];
const SIZE_WORDS = [
  [/extra\s*extra\s*large|2\s*xl|xxl/g, ' XXL '],
  [/extra\s*large|x-?large|\bxl\b/g, ' XL '],
  [/medium/g, ' M '],
  [/large/g, ' L '],
  [/small/g, ' S '],
];
export const parseGownSizes = (raw) => {
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
export const makeBuild = (weight, belly, muscle, kids) => ({
  weight: weight < 0 ? weight * 0.4 : weight * (kids ? 0.6 : 1),
  belly: belly * (kids ? 0.7 : 1),
  muscle: muscle * (kids ? 0.5 : 1),
});
export const bodyGirth = (raw, build, sx, sz) => {
  const b = applyBuild(raw, build);
  if (!b?.ok) return null;
  let sum = 0;
  b.slices.forEach((sl) => {
    if (['chest', 'waist', 'hip'].includes(sl.name)) sum += ellipseGirth(sl.halfW * sx, sl.halfD * sz);
  });
  return sum || null;
};

// Does the avatar's current body reach the size range of the gown?
// gownSizes: e.g. ['L','XL']; raw: measured avatar; build: weight/belly/muscle; sx, sz: width / depth scale
export const checkSizeFit = (raw, build, gownSizes, sx, sz) => {
  if (!gownSizes || !raw?.ok) return null;
  const pm = ADULT_SIZES.map(p => bodyGirth(raw, makeBuild(p.weight, p.belly, 0, false), p.scale, p.scale));
  const cur = bodyGirth(raw, build, sx, sz);
  if (cur == null || pm.some(v => v == null)) return null;
  const lo = SIZE_ORDER.indexOf(gownSizes[0]);
  const hi = SIZE_ORDER.indexOf(gownSizes[gownSizes.length - 1]);
  const low = lo <= 0 ? -Infinity : (pm[lo - 1] + pm[lo]) / 2;
  const high = hi >= pm.length - 1 ? Infinity : (pm[hi] + pm[hi + 1]) / 2;
  let near = 0;
  pm.forEach((v, i) => { if (Math.abs(v - cur) < Math.abs(pm[near] - cur)) near = i; });
  return { ok: cur >= low && cur <= high, now: ADULT_SIZES[near].label };
};
