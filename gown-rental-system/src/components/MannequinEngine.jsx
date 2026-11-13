import React, { useState, useEffect, useMemo, useRef, Component } from 'react';
import * as THREE from 'three';
import { useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';

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

// Sukdon ang gown sa iyang kaugalingong luna: ibulag sa dali ang parent (ang group nga naay fit scale / position),
// kay kung dili, ang world matrix naay sakop na nga scale ug mausab ang sukod matag higayon nga i-slide.
function withDetached(root, fn) {
  const parent = root.parent;
  root.parent = null;
  root.updateMatrixWorld(true);
  try {
    return fn();
  } finally {
    root.parent = parent;
    root.updateMatrixWorld(true);
  }
}

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
      arm: meta.arm || null,          // abaga (pivot) + anggulo sa bukton
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
  // balika ang orihinal nga porma (kung na-isbog na kini kaniadto) aron husto ang sukod
  root.traverse((o) => {
    const pos = o.isMesh && o.geometry?.attributes?.position;
    if (pos && o.userData.origPos) { pos.array.set(o.userData.origPos); pos.needsUpdate = true; }
  });
  return withDetached(root, () => gownProfileInner(root, body, length));
}
function gownProfileInner(root, body, length) {
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

/* ----------------------------------------------------------
   POSISYON NGA GI-SAVE SA ADMIN (matag gown)
   Gi-butang sa admin ang gown sa mannequin (M) ug gi-save. Kini nga mga numero
   gidugang ibabaw sa auto-fit, mao nga parehas ang posisyon sa tanang customer.
   s = gidak-on (1 = sama), y = pataas / paubos (metros), w = lapad, d = gibag-on
   ---------------------------------------------------------- */
export const DEFAULT_TWEAK = { s: 1, y: 0, w: 1, d: 1, exact: false };
export const parseTweak = (v) => {
  const n = (x, def) => (Number.isFinite(Number(x)) && x !== null && x !== '' ? Number(x) : def);
  const o = v && typeof v === 'object' ? v : {};
  return { s: n(o.s, 1), y: n(o.y, 0), w: n(o.w, 1), d: n(o.d, 1), exact: !!o.exact };
};

// Kuhaon ang scale + position sa gown aron mo-fit sa avatar (paspas, mahimo matag slide)
function gownFit(profile, body, looseness, tweak) {
  // EXACT: ang gown gi-butang na sa Blender sa ibabaw sa mannequin -> gamiton ang iyang posisyon sa Blender, walay auto-fit
  if (tweak?.exact && body?.ok) {
    return { scale: [tweak.s * tweak.w, tweak.s, tweak.s * tweak.d], position: [0, tweak.y, 0] };
  }
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
  const tw = tweak || DEFAULT_TWEAK;
  const sx = s * clamp(fx * looseness) * tw.s * tw.w;
  const sz = s * clamp(fz * looseness) * tw.s * tw.d;
  const sy = s * tw.s;

  // Posisyon: hem sa salog, sentro sa avatar
  const gcx = (box.min.x + box.max.x) / 2;
  const gcz = (box.min.z + box.max.z) / 2;
  return {
    scale: [sx, sy, sz],
    position: [body.cx - sx * gcx, body.minY - sy * box.min.y + tw.y, body.cz - sz * gcz],
  };
}

/* ---------- MODELS ---------- */
// Usa ka kopya matag model, aron dili mag-clone matag render
function useClonedGLB(path) {
  const { scene } = useGLTF(path);
  return useMemo(() => scene.clone(true), [scene]);
}

/* ----------------------------------------------------------
   HIDE THE TORSO UNDER THE GOWN
   Kung naay gown, dili na i-render ang bahin sa lawas nga naa sulod sa gown
   (gikan sa salog hangtod sa taas sa bodice). Mao nga dili na mo-gawas ang
   dughan / hawak / tiyan latas sa gown, bisan pa ang gown mas pig-ot gamay
   taliwala sa mga slice nga gisukod. Ang ulo, liog, abaga ug mga bukton kay
   makita gihapon.
   ---------------------------------------------------------- */
const HIDE_N = 6;
const makeHideUniforms = () => ({
  uHideOn: { value: 0 },
  uHideInv: { value: new THREE.Matrix4() },
  uHideYTop: { value: 0 },
  uHideY: { value: new Array(HIDE_N).fill(0) },
  uHideW: { value: new Array(HIDE_N).fill(1) },
  uHideD: { value: new Array(HIDE_N).fill(1) },
  uHideCz: { value: new Array(HIDE_N).fill(0) },
  uHideCx: { value: 0 },
  // Mga bukton: uArmRot = pila ka radian ang pag-taas, uArmP = abaga (pivot), uArmHide = tagoa
  uArmRot: { value: 0 },
  uArmP: { value: new THREE.Vector2(0.2, 1.4) },
  uArmHide: { value: 0 },
});

function patchMaterial(mat) {
  if (mat.userData.hideUni) return mat.userData.hideUni;
  const uni = makeHideUniforms();
  mat.userData.hideUni = uni;
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uni);
    shader.vertexShader = shader.vertexShader
      .replace('void main() {', 'varying vec3 vHidePos;\nvarying float vArmW;\nuniform mat4 uHideInv;\nuniform float uArmRot;\nuniform vec2 uArmP;\nattribute float _arm;\nvoid main() {')
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
float armSide = position.x >= 0.0 ? 1.0 : -1.0;
float armA = uArmRot * _arm;
float armC = cos(armA); float armS = sin(armA);
vArmW = _arm;
vec2 armN = vec2(objectNormal.x * armSide, objectNormal.y);
armN = vec2(armC * armN.x - armS * armN.y, armS * armN.x + armC * armN.y);
objectNormal.x = armN.x * armSide; objectNormal.y = armN.y;`)
      .replace('#include <project_vertex>', `{
  vec2 armQ = vec2(transformed.x * armSide - uArmP.x, transformed.y - uArmP.y);
  armQ = vec2(armC * armQ.x - armS * armQ.y, armS * armQ.x + armC * armQ.y);
  transformed.x = armSide * (armQ.x + uArmP.x); transformed.y = armQ.y + uArmP.y;
}
vHidePos = (uHideInv * modelMatrix * vec4(transformed, 1.0)).xyz;
#include <project_vertex>`);
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', `varying vec3 vHidePos;
varying float vArmW; uniform float uArmHide;
uniform float uHideOn; uniform float uHideYTop; uniform float uHideCx;
uniform float uHideY[${HIDE_N}]; uniform float uHideW[${HIDE_N}];
uniform float uHideD[${HIDE_N}]; uniform float uHideCz[${HIDE_N}];
void main() {`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
if (uArmHide > 0.5 && vArmW > 0.08) discard;
if (uHideOn > 0.5 && vHidePos.y < uHideYTop) {
  float y = vHidePos.y;
  float w = uHideW[0]; float d = uHideD[0]; float cz = uHideCz[0];
  for (int i = 0; i < ${HIDE_N - 1}; i++) {
    if (y > uHideY[i]) {
      float t = clamp((y - uHideY[i]) / max(uHideY[i + 1] - uHideY[i], 0.0001), 0.0, 1.0);
      w = mix(uHideW[i], uHideW[i + 1], t);
      d = mix(uHideD[i], uHideD[i + 1], t);
      cz = mix(uHideCz[i], uHideCz[i + 1], t);
    }
  }
  float ex = (vHidePos.x - uHideCx) / w;
  float ez = (vHidePos.z - cz) / d;
  if (ex * ex + ez * ez < 1.0) discard;
}`);
  };
  mat.customProgramCacheKey = () => 'hide-torso-v2';
  mat.needsUpdate = true;
  return uni;
}

// Ang avatar. Ang "build" (weight / belly / muscle) mao ang morph targets sulod sa .glb
// hide = ang sukod sa lawas (body) kung naay gown nga gisul-ob, kung wala = null
function Body({ modelPath, visible, build, hide, arms, onProfile }) {
  const scene = useClonedGLB(modelPath);
  const wrap = useRef(null);
  const profile = useMemo(() => measureBody(scene), [scene]);
  useEffect(() => { onProfile(profile); }, [profile, onProfile]);

  const unis = useMemo(() => {
    const list = [];
    scene.traverse((o) => {
      if (!o.isMesh) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach((m) => { if (m) list.push(patchMaterial(m)); });
    });
    return list;
  }, [scene]);

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

  // I-set ang mga numero sa "hide" (slice sa lawas, taas sa bodice)
  useEffect(() => {
    const on = !!(hide?.ok && hide.slices?.length);
    unis.forEach((u) => {
      u.uHideOn.value = on ? 1 : 0;
      if (!on) return;
      const sl = [...hide.slices].sort((a, b) => a.y - b.y);
      // 6 ka punto: pun-on pinaagi sa pagbalik sa katapusan
      for (let i = 0; i < HIDE_N; i++) {
        const k = sl[Math.min(i, sl.length - 1)];
        u.uHideY.value[i] = i < sl.length ? k.y : k.y + 0.001 * (i - sl.length + 1);
        u.uHideW.value[i] = Math.max(k.halfW, 0.01) * 1.03;
        u.uHideD.value[i] = Math.max(k.halfD, 0.01) * 1.12;
        u.uHideCz.value[i] = k.cz ?? hide.cz ?? 0;
      }
      u.uHideCx.value = hide.cx || 0;
      u.uHideYTop.value = hide.minY + (hide.coverTop || FIT.coverTop) * hide.height - 0.02 * hide.height;
    });
  }, [unis, hide]);

  // Mga bukton: down (orihinal) | away | tpose | hide
  useEffect(() => {
    const a = profile?.arm;
    unis.forEach((u) => {
      u.uArmHide.value = arms === 'hide' ? 1 : 0;
      if (!a) { u.uArmRot.value = 0; return; }
      u.uArmP.value.set(a.pivot[0], a.pivot[1]);
      const deg = arms === 'tpose' ? 90 - a.rest : arms === 'away' ? 28 : 0;
      u.uArmRot.value = (deg * Math.PI) / 180;
    });
  }, [unis, profile, arms]);

  // Ang matrix: world -> Scene group (parehas nga luna sa gown ug slices)
  useFrame(() => {
    if (!wrap.current) return;
    wrap.current.updateWorldMatrix(true, false);
    unis.forEach((u) => u.uHideInv.value.copy(wrap.current.matrixWorld).invert());
  });

  return <group ref={wrap}><primitive object={scene} visible={visible} /></group>;
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

/* ----------------------------------------------------------
   I-ISBOG ANG GOWN (dili tagoan ang lawas)
   Ang matag vertex sa gown nga naa sulod sa lawas gi-tulod paggawas hangtod
   mo-gawas sa porma sa lawas (ellipse sa matag gitas-on). Mao nga ang gown
   mo-dako lang kung asa kini kinahanglan, ug ang lawas makita gyud sa sulod.
   ---------------------------------------------------------- */
const PUSH = { mw: 1.05, md: 1.10 };   // dugang nga luna palibot sa lawas (lapad / lalom)

function expandGownAroundBody(root, fit, body, length, tweak) {
  withDetached(root, () => expandInner(root, fit, body, length, tweak));
}
function expandInner(root, fit, body, length, tweak) {
  const sl = [...body.slices].sort((a, b) => a.y - b.y);
  if (!sl.length) return;
  const last = sl[sl.length - 1];
  const tw = tweak || DEFAULT_TWEAK;
  const topY = body.minY + (body.coverTop || FIT.coverTop) * body.height * length * tw.s + tw.y;
  const cx = body.cx || 0;
  const [sx, sy, sz] = fit.scale;
  const [px, py, pz] = fit.position;

  const profile = (y) => {
    let a = sl[0];
    let b = sl[0];
    if (y >= last.y) { a = last; b = last; }
    else if (y > sl[0].y) {
      for (let i = 0; i < sl.length - 1; i += 1) {
        if (y <= sl[i + 1].y) { a = sl[i]; b = sl[i + 1]; break; }
      }
    }
    let t = b.y > a.y ? (y - a.y) / (b.y - a.y) : 0;
    t = t * t * (3 - 2 * t);
    const az = a.cz ?? body.cz ?? 0;
    const bz = b.cz ?? body.cz ?? 0;
    let w = a.halfW + (b.halfW - a.halfW) * t;
    const d = a.halfD + (b.halfD - a.halfD) * t;
    if (y > last.y) w *= 1 + 0.08 * Math.min(1, (y - last.y) / Math.max(topY - last.y, 1e-3));   // mas lapad paingon sa abaga
    return [w * PUSH.mw, d * PUSH.md, az + (bz - az) * t];
  };

  root.updateWorldMatrix(true, true);
  const m = new THREE.Matrix4();
  const mi = new THREE.Matrix4();
  const v = new THREE.Vector3();
  root.traverse((o) => {
    const pos = o.isMesh && o.geometry?.attributes?.position;
    if (!pos) return;
    if (!o.userData.origPos) o.userData.origPos = pos.array.slice();
    const orig = o.userData.origPos;
    m.copy(o.matrixWorld);
    mi.copy(m).invert();
    for (let i = 0; i < pos.count; i += 1) {
      v.set(orig[3 * i], orig[3 * i + 1], orig[3 * i + 2]).applyMatrix4(m);
      let bx = px + sx * v.x;
      const by = py + sy * v.y;
      let bz = pz + sz * v.z;
      if (by >= sl[0].y && by <= topY) {
        const [w, d, cz] = profile(by);
        let ex = (bx - cx) / w;
        let ez = (bz - cz) / d;
        const r2 = ex * ex + ez * ez;
        if (r2 < 1) {
          let r = Math.sqrt(r2);
          if (r < 1e-3) { ex = 0; ez = 1; r = 1; }
          bx = cx + (ex / r) * w;
          bz = cz + (ez / r) * d;
        }
      }
      v.set((bx - px) / sx, (by - py) / sy, (bz - pz) / sz).applyMatrix4(mi);
      pos.array[3 * i] = v.x;
      pos.array[3 * i + 1] = v.y;
      pos.array[3 * i + 2] = v.z;
    }
    pos.needsUpdate = true;
    o.geometry.computeBoundingSphere();
    o.frustumCulled = false;
  });
}

function FittedGown({ modelPath, body, looseness, length, tweak }) {
  const scene = useClonedGLB(modelPath);
  const ysKey = body.ok ? body.slices.map(sl => sl.y).join(',') : '';

  // Mahal ni (nag-sukod sa gown), mao nga usa ra kada gown / avatar / gown length
  const profile = useMemo(
    () => (body.ok ? gownProfile(scene, body, length) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scene, body.ok, body.height, body.minY, body.coverTop, ysKey, length]
  );
  const tw = useMemo(() => parseTweak(tweak), [tweak?.s, tweak?.y, tweak?.w, tweak?.d, tweak?.exact]); // eslint-disable-line react-hooks/exhaustive-deps
  const fit = useMemo(() => gownFit(profile, body, looseness, tw), [profile, body, looseness, tw]);

  // Kada gown naay kaugalingon nga geometry (dili mausab ang gi-cache nga original)
  useMemo(() => {
    scene.traverse((o) => {
      if (o.isMesh && !o.userData.ownGeo) { o.geometry = o.geometry.clone(); o.userData.ownGeo = true; }
    });
  }, [scene]);

  // I-isbog ang gown aron ang lawas makasulod gyud
  useEffect(() => {
    if (body.ok && profile) expandGownAroundBody(scene, fit, body, length, tw);
  }, [scene, fit, body, profile, length, tw]);

  // Ang sulod sa gown makita (walay "butang" kung ang mesh usa ra ka-side)
  useEffect(() => {
    scene.traverse((o) => {
      if (!o.isMesh) return;
      (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => {
        if (m && m.side !== THREE.DoubleSide) { m.side = THREE.DoubleSide; m.needsUpdate = true; }
      });
    });
  }, [scene]);

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
export function Scene({ bodyPath, gownPath, showBody, build, looseness, length, scale, arms = 'down', tweak, onMeasured }) {
  const [raw, setRaw] = useState(null);   // null = wala pa na-sukod ang avatar
  useEffect(() => { if (onMeasured) onMeasured(raw); }, [raw, onMeasured]);
  const body = useMemo(() => applyBuild(raw, build), [raw, build]);

  return (
    <group scale={scale} position={[0, -1, 0]}>
      <ModelErrorBoundary key={bodyPath} fallback={<FallbackBody onProfile={setRaw} />}>
        <Body modelPath={bodyPath} visible={showBody} build={build} hide={null} arms={arms} onProfile={setRaw} />
      </ModelErrorBoundary>

      {gownPath && body && (
        <ModelErrorBoundary key={gownPath} fallback={<FallbackGown />}>
          <FittedGown modelPath={gownPath} body={body} looseness={looseness} length={length} tweak={tweak} />
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

// Kids' gowns are sized by age: "3-4y, 5-6y" or "3-4y to 7-8y" -> ['3-4y','5-6y','7-8y'] (null if no ages found)
export const KID_AGE_LABELS = ['3-4y', '5-6y', '7-8y', '9-10y', '11-12y'];
export const parseKidAges = (raw) => {
  if (!raw) return null;
  const t = String(raw).toLowerCase();
  const found = KID_AGE_LABELS.filter((l) => t.includes(l));
  if (!found.length) return null;
  if (/\bto\b|~|…|\.\.\./.test(t) && found.length >= 2) {
    const a = KID_AGE_LABELS.indexOf(found[0]);
    const b = KID_AGE_LABELS.indexOf(found[found.length - 1]);
    return KID_AGE_LABELS.slice(Math.min(a, b), Math.max(a, b) + 1);
  }
  return found;
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