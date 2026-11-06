// IRON OATH 클라이언트 (Three.js)
// 구성: 설정 → 렌더러/월드 → 블록형 기사 모델·애니메이션 → 1인칭 → 사운드 → 네트워크 → 메뉴/HUD → 입력 → 메인 루프

import * as THREE from 'three';
import { CLASSES, SKILLS, ARENA, PLAYER } from '/classes.js';

const $ = (id) => document.getElementById(id);
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const easeOut = (t) => 1 - (1 - t) * (1 - t);
const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const rand = (a, b) => a + Math.random() * (b - a);
const TAU = Math.PI * 2;
const lerpAngle = (a, b, k) => {
  const d = ((((b - a + Math.PI) % TAU) + TAU) % TAU) - Math.PI;
  return a + d * k;
};

/* ═════════════ 설정 (브라우저에 저장) ═════════════ */
const QUALITY = {
  low: { ratio: 0.7, shadow: 0 },
  mid: { ratio: 1, shadow: 1024 },
  high: { ratio: Math.min(window.devicePixelRatio || 1, 1.5), shadow: 2048 },
};
const DEFAULTS = { sens: 1, fov: 75, vol: 0.7, quality: 'mid', minimap: true, netinfo: false, bob: true };
const S = { ...DEFAULTS };
try {
  const raw = JSON.parse(localStorage.getItem('ironoath_settings') || '{}');
  for (const k in DEFAULTS) if (typeof raw[k] === typeof DEFAULTS[k]) S[k] = raw[k];
} catch {}
S.sens = clamp(S.sens, 0.3, 3);
S.fov = clamp(S.fov, 60, 110);
S.vol = clamp(S.vol, 0, 1);
if (!QUALITY[S.quality]) S.quality = 'mid';
const saveSettings = () => { try { localStorage.setItem('ironoath_settings', JSON.stringify(S)); } catch {} };

/* ═════════════ 렌더러 / 장면 ═════════════ */
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x86b4e6);
scene.fog = new THREE.Fog(0x9cc2ee, 35, 130);

const camera = new THREE.PerspectiveCamera(S.fov, 1, 0.05, 300);
camera.rotation.order = 'YXZ';
scene.add(camera);

scene.add(new THREE.HemisphereLight(0xdfeaff, 0x7a6a55, 2.3));
const sun = new THREE.DirectionalLight(0xfff1d0, 2.6);
sun.position.set(30, 50, 20);
Object.assign(sun.shadow.camera, { left: -50, right: 50, top: 50, bottom: -50, near: 1, far: 150 });
scene.add(sun);

function applyQuality() {
  const q = QUALITY[S.quality];
  renderer.setPixelRatio(q.ratio);
  renderer.setSize(innerWidth, innerHeight, false);
  const wasShadow = renderer.shadowMap.enabled;
  renderer.shadowMap.enabled = q.shadow > 0;
  sun.castShadow = q.shadow > 0;
  if (q.shadow && sun.shadow.mapSize.x !== q.shadow) {
    sun.shadow.mapSize.set(q.shadow, q.shadow);
    sun.shadow.map?.dispose();
    sun.shadow.map = null;
  }
  if (wasShadow !== renderer.shadowMap.enabled) {
    scene.traverse((o) => { if (o.material) [].concat(o.material).forEach((m) => (m.needsUpdate = true)); });
  }
}
function onResize() {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
addEventListener('resize', onResize);

/* ═════════════ 픽셀 텍스처 도구 ═════════════ */
function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const k = f >= 0 ? 255 : 0, a = Math.abs(f);
  r = Math.round(r + (k - r) * a); g = Math.round(g + (k - g) * a); b = Math.round(b + (k - b) * a);
  return `rgb(${r},${g},${b})`;
}
function noise(g, x, y, w, h, base, amt = 0.12) {
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    g.fillStyle = shade(base, (Math.random() - 0.5) * 2 * amt);
    g.fillRect(x + i, y + j, 1, 1);
  }
}
const px = (g, x, y, col, w = 1, h = 1) => { g.fillStyle = col; g.fillRect(x, y, w, h); };
function pixTex(w, h, paint, repeat = false) {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  paint(cv.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(cv);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
const lamCache = {};
const lam = (color) => (lamCache[color] ??= new THREE.MeshLambertMaterial({ color }));
const texMat = (tex) => new THREE.MeshLambertMaterial({ map: tex });
const geoCache = new Map();
const BOX = (w, h, d) => {
  const k = `${w},${h},${d}`;
  let g = geoCache.get(k);
  if (!g) { g = new THREE.BoxGeometry(w, h, d); geoCache.set(k, g); }
  return g;
};

/* ═════════════ 월드 (마인크래프트풍 경기장) ═════════════ */
{
  const grass = pixTex(16, 16, (g) => {
    noise(g, 0, 0, 16, 16, '#5b9a3a', 0.16);
    for (let i = 0; i < 16; i++) px(g, (Math.random() * 16) | 0, (Math.random() * 16) | 0, '#3f7a2a');
  }, true);
  grass.repeat.set(40, 40);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(ARENA.half * 2, ARENA.half * 2), new THREE.MeshLambertMaterial({ map: grass }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const dirtTex = pixTex(16, 16, (g) => {
    noise(g, 0, 0, 16, 16, '#7f6647', 0.14);
    for (let i = 0; i < 12; i++) px(g, (Math.random() * 16) | 0, (Math.random() * 16) | 0, '#5d4a31');
  }, true);
  dirtTex.repeat.set(8, 8);
  const dirt = new THREE.Mesh(new THREE.CircleGeometry(15, 48), new THREE.MeshLambertMaterial({ map: dirtTex }));
  dirt.rotation.x = -Math.PI / 2;
  dirt.position.y = 0.01;
  dirt.receiveShadow = true;
  scene.add(dirt);

  const stoneTex = pixTex(16, 16, (g) => {
    noise(g, 0, 0, 16, 16, '#8a8780', 0.1);
    px(g, 0, 7, '#5d5b56', 16, 1); px(g, 0, 15, '#5d5b56', 16, 1);
    px(g, 3, 0, '#5d5b56', 1, 7); px(g, 11, 8, '#5d5b56', 1, 7);
  }, true);
  const stoneMat = (rx, ry) => {
    const t = stoneTex.clone();
    t.repeat.set(rx, ry);
    t.needsUpdate = true;
    return new THREE.MeshLambertMaterial({ map: t });
  };

  const h = ARENA.half, len = h * 2 + 4;
  const walls = [[0, -h - 1, len, 2], [0, h + 1, len, 2], [-h - 1, 0, 2, len], [h + 1, 0, 2, len]];
  const merlonMat = stoneMat(1, 1);
  for (const [x, z, w, d] of walls) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, 6, d), stoneMat(Math.max(w, d) / 2, 3));
    m.position.set(x, 3, z);
    m.castShadow = m.receiveShadow = true;
    scene.add(m);
    const horizontal = w > d;
    for (let i = -h; i <= h; i += 4) {
      const b = new THREE.Mesh(BOX(horizontal ? 2 : 2.2, 1.2, horizontal ? 2.2 : 2), merlonMat);
      b.position.set(horizontal ? i : x, 6.6, horizontal ? z : i);
      b.castShadow = true;
      scene.add(b);
    }
  }
  for (const p of ARENA.pillars) {
    const col = new THREE.Mesh(new THREE.CylinderGeometry(p.r, p.r * 1.15, 6, 16), stoneMat(5, 3));
    col.position.set(p.x, 3, p.z);
    col.castShadow = col.receiveShadow = true;
    scene.add(col);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(p.r * 1.3, p.r * 1.3, 0.4, 16), merlonMat);
    cap.position.set(p.x, 6.2, p.z);
    cap.castShadow = true;
    scene.add(cap);
  }

  // 블록 구름
  const cloudMat = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false, transparent: true, opacity: 0.92 });
  for (let i = 0; i < 18; i++) {
    const cl = new THREE.Mesh(new THREE.BoxGeometry(rand(14, 32), 3, rand(8, 18)), cloudMat);
    const a = rand(0, TAU), r = rand(60, 200);
    cl.position.set(Math.cos(a) * r, rand(48, 75), Math.sin(a) * r);
    scene.add(cl);
  }
}

/* ═════════════ 기사 모델 (마인크래프트 비율: 머리 8 · 몸통 12 · 팔다리 12 픽셀 = 키 1.8m) ═════════════ */
const U = 0.225; // 4픽셀
const LOOKS = {
  knight:     { cloth: '#3e63a8', cloth2: '#2b4a85', metal: '#b8bec7', metal2: '#7d848e', trim: '#e3b94b', skin: '#d6a67e', helm: 'full',   plume: '#2f63e0', pants: '#3a3f4c', cover: 7, belt: 7, armMetal: true,  greaves: true,  glove: '#4a4f58' },
  greatsword: { cloth: '#8d2b2b', cloth2: '#5c1b1b', metal: '#5a5e67', metal2: '#32353c', trim: '#bdbdbd', skin: '#c88f68', helm: 'horns',  plume: '#b01e1e', pants: '#2b2325', cover: 6, belt: 6, armMetal: true,  greaves: true,  glove: '#2a2c30' },
  duelist:    { cloth: '#2f8a55', cloth2: '#1f5e39', metal: '#b9b3a2', metal2: '#8a8576', trim: '#efe5b0', skin: '#e2b68e', helm: 'hood',   plume: '#f4f1e6', pants: '#2d3a30', cover: 3, belt: 8, armMetal: false, greaves: false, glove: '#3a2a1a' },
  shield:     { cloth: '#b88b2a', cloth2: '#7e5c17', metal: '#c9cdd3', metal2: '#8d939b', trim: '#f3d46c', skin: '#d0a279', helm: 'bucket', plume: null,      pants: '#3d3322', cover: 8, belt: 8, armMetal: true,  greaves: true,  glove: '#4a4f58' },
};
const hexStr = (n) => '#' + n.toString(16).padStart(6, '0');
function getLook(id) {
  return LOOKS[id] || { ...LOOKS.knight, cloth: hexStr(CLASSES[id]?.color ?? 0x4a6fa5), cloth2: shade(hexStr(CLASSES[id]?.color ?? 0x4a6fa5), -0.3) };
}

function paintHead(g, face, L) {
  if (L.helm === 'full' || L.helm === 'bucket') {
    noise(g, 0, 0, 8, 8, L.metal, 0.1);
    px(g, 0, 7, L.metal2, 8, 1);
    if (face === 'front') {
      if (L.helm === 'full') { px(g, 1, 3, '#12151a', 6, 2); px(g, 3, 1, L.metal2, 2, 2); px(g, 2, 6, L.metal2, 4, 1); }
      else { px(g, 3, 0, '#12151a', 2, 7); px(g, 1, 3, '#12151a', 6, 2); px(g, 0, 0, L.trim, 8, 1); }
    } else if (face === 'side') {
      px(g, 1, 1, L.metal2); px(g, 6, 5, L.metal2);
      if (L.helm === 'bucket') px(g, 0, 0, L.trim, 8, 1);
    } else if (face === 'top') px(g, 3, 0, L.metal2, 2, 8);
  } else if (L.helm === 'horns') {
    if (face === 'top') { noise(g, 0, 0, 8, 8, L.metal, 0.1); px(g, 3, 0, L.plume, 2, 8); return; }
    if (face === 'bottom') { noise(g, 0, 0, 8, 8, L.skin, 0.08); return; }
    noise(g, 0, 0, 8, 3, L.metal, 0.1);
    px(g, 0, 2, L.metal2, 8, 1);
    if (face === 'front') {
      noise(g, 0, 3, 8, 5, L.skin, 0.08);
      px(g, 1, 4, '#2a1a14', 2, 1); px(g, 5, 4, '#2a1a14', 2, 1);
      px(g, 1, 6, '#5a3320', 6, 2); px(g, 3, 5, '#b57a58', 2, 1);
    } else if (face === 'back') noise(g, 0, 3, 8, 5, L.metal2, 0.1);
    else noise(g, 0, 3, 8, 5, L.skin, 0.08);
  } else { // hood
    noise(g, 0, 0, 8, 8, face === 'bottom' ? L.cloth2 : L.cloth, 0.1);
    px(g, 0, 7, L.cloth2, 8, 1);
    if (face === 'front') {
      noise(g, 1, 2, 6, 5, L.skin, 0.06);
      px(g, 2, 4, '#23211f'); px(g, 5, 4, '#23211f'); px(g, 3, 6, '#a45a48', 2, 1);
      px(g, 0, 0, L.cloth2, 8, 1);
    }
  }
}
function paintTorso(g, face, L, w) {
  if (face === 'back') {
    noise(g, 0, 0, w, 12, L.cloth2, 0.1);
    px(g, 0, 0, L.trim, w, 1); px(g, 0, 11, L.trim, w, 1);
    return;
  }
  noise(g, 0, 0, w, 12, L.cloth, 0.1);
  if (L.cover > 0) {
    noise(g, 0, 0, w, L.cover, L.metal, 0.1);
    px(g, 0, L.cover - 1, L.metal2, w, 1);
    px(g, 0, 0, L.trim, w, 1);
    if (face === 'front') px(g, w / 2 - 1, 1, L.metal2, 2, L.cover - 2);
  }
  px(g, 0, L.belt, '#3a2a1a', w, 2);
  if (face === 'front') px(g, 3, L.belt, L.trim, 2, 2);
  px(g, 0, 11, L.trim, w, 1);
}
function paintArm(g, L) {
  noise(g, 0, 0, 4, 5, L.armMetal ? L.metal : L.cloth, 0.1);
  noise(g, 0, 5, 4, 4, L.armMetal ? L.metal2 : L.cloth2, 0.1);
  px(g, 0, 5, L.trim, 4, 1);
  noise(g, 0, 9, 4, 3, L.glove, 0.1);
}
function paintLeg(g, L) {
  noise(g, 0, 0, 4, 8, L.pants, 0.1);
  if (L.greaves) { noise(g, 0, 4, 4, 3, L.metal2, 0.1); px(g, 0, 4, L.trim, 4, 1); }
  noise(g, 0, 8, 4, 4, '#2e2118', 0.1);
  px(g, 0, 8, '#4a3626', 4, 1);
}

const matCache = {};
function getMats(id) {
  if (matCache[id]) return matCache[id];
  const L = getLook(id);
  const mh = (f) => texMat(pixTex(8, 8, (g) => paintHead(g, f, L)));
  const head = [mh('side'), mh('side'), mh('top'), mh('bottom'), mh('back'), mh('front')];
  const mt = (f, w) => texMat(pixTex(w, 12, (g) => paintTorso(g, f, L, w)));
  const tcap = texMat(pixTex(8, 4, (g) => noise(g, 0, 0, 8, 4, L.metal2, 0.1)));
  const torso = [mt('side', 4), mt('side', 4), tcap, tcap, mt('back', 8), mt('front', 8)];
  const arm = texMat(pixTex(4, 12, (g) => paintArm(g, L)));
  const leg = texMat(pixTex(4, 12, (g) => paintLeg(g, L)));
  const pauld = texMat(pixTex(4, 4, (g) => { noise(g, 0, 0, 4, 4, L.armMetal ? L.metal : L.cloth2, 0.1); px(g, 0, 3, L.trim, 4, 1); }));
  return (matCache[id] = { head, torso, arm, leg, pauld });
}

function makeSword(len, wide = 1, trim = '#c79a3a') {
  const g = new THREE.Group();
  const steel = lam(0xdfe5ec), steel2 = lam(0xa4aeba), gold = lam(parseInt(trim.slice(1), 16)), leather = lam(0x3b2a1a);
  const add = (geo, mat, y) => { const m = new THREE.Mesh(geo, mat); m.position.y = y; m.castShadow = true; g.add(m); };
  add(BOX(0.065 * wide, len, 0.02), steel, 0.14 + len / 2);
  add(BOX(0.02 * wide, len * 0.78, 0.024), steel2, 0.14 + len * 0.42);
  add(BOX(0.04 * wide, 0.1, 0.018), steel, 0.14 + len + 0.05);
  add(BOX(0.28 * Math.sqrt(wide), 0.05, 0.075), gold, 0.115);
  add(BOX(0.045, 0.2, 0.045), leather, 0);
  add(BOX(0.075, 0.06, 0.075), gold, -0.13);
  return g;
}
const swordLen = (c) => 1.0 * (c.reach / 2.6);
const swordWide = (c) => (c.id === 'greatsword' ? 1.7 : 1);

function makeShield(L) {
  const front = pixTex(12, 16, (g) => {
    noise(g, 0, 0, 12, 16, L.cloth, 0.08);
    px(g, 0, 0, L.metal, 12, 1); px(g, 0, 15, L.metal, 12, 1); px(g, 0, 0, L.metal, 1, 16); px(g, 11, 0, L.metal, 1, 16);
    px(g, 5, 1, L.trim, 2, 14); px(g, 1, 6, L.trim, 10, 2); px(g, 5, 6, L.metal2, 2, 2);
  });
  const back = pixTex(12, 16, (g) => { noise(g, 0, 0, 12, 16, '#5a3b1f', 0.1); px(g, 1, 4, '#2a1a0c', 10, 1); px(g, 1, 11, '#2a1a0c', 10, 1); });
  const edge = new THREE.MeshLambertMaterial({ color: parseInt(L.metal2.slice(1), 16) });
  const m = new THREE.Mesh(BOX(0.5, 0.62, 0.07), [edge, edge, edge, edge, texMat(back), texMat(front)]);
  m.castShadow = true;
  return m;
}

function nameSprite(text, color) {
  const cv = document.createElement('canvas');
  cv.width = 256; cv.height = 64;
  const g = cv.getContext('2d');
  g.font = 'bold 30px Georgia, "Noto Serif KR", serif';
  g.textAlign = 'center';
  g.lineWidth = 6;
  g.strokeStyle = 'rgba(0,0,0,.85)';
  g.strokeText(text, 128, 40);
  g.fillStyle = color;
  g.fillText(text, 128, 40);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  s.scale.set(1.8, 0.45, 1);
  s.position.y = 2.3;
  return s;
}

// 한 명의 기사를 이루는 관절 구조
//   root ─ legR, legL (엉덩이 관절)
//        └ upper(허리 관절) ─ torso, head(목 관절), armR, armL(어깨 관절), shield
function makeRig(clsId, name) {
  const c = CLASSES[clsId], L = getLook(clsId), M = getMats(clsId);
  const root = new THREE.Group();
  root.rotation.order = 'YXZ';
  const add = (geo, mat, x, y, z, parent) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    parent.add(m);
    return m;
  };
  const legR = new THREE.Group(); legR.position.set(0.1125, 0.675, 0); add(BOX(U, 0.675, U), M.leg, 0, -0.3375, 0, legR);
  const legL = new THREE.Group(); legL.position.set(-0.1125, 0.675, 0); add(BOX(U, 0.675, U), M.leg, 0, -0.3375, 0, legL);
  root.add(legR, legL);

  const upper = new THREE.Group(); upper.position.y = 0.675; root.add(upper);
  add(BOX(0.45, 0.675, U), M.torso, 0, 0.3375, 0, upper);

  const head = new THREE.Group(); head.position.y = 0.675; upper.add(head);
  add(BOX(0.45, 0.45, 0.45), M.head, 0, 0.225, 0, head);
  if (L.helm === 'full') add(BOX(0.08, 0.14, 0.42), lam(parseInt(L.plume.slice(1), 16)), 0, 0.52, 0, head);
  if (L.helm === 'horns') {
    add(BOX(0.07, 0.1, 0.4), lam(parseInt(L.plume.slice(1), 16)), 0, 0.5, 0, head);
    const hornMat = lam(0xe8e2cf);
    add(BOX(0.09, 0.26, 0.09), hornMat, 0.27, 0.42, 0, head).rotation.z = -0.55;
    add(BOX(0.09, 0.26, 0.09), hornMat, -0.27, 0.42, 0, head).rotation.z = 0.55;
  }
  if (L.helm === 'hood') {
    const f = add(BOX(0.05, 0.32, 0.1), lam(parseInt(L.plume.slice(1), 16)), 0.16, 0.56, 0.1, head);
    f.rotation.z = -0.4; f.rotation.x = 0.35;
  }
  if (L.helm === 'bucket') add(BOX(0.48, 0.05, 0.48), lam(parseInt(L.trim.slice(1), 16)), 0, 0.47, 0, head);

  const armR = new THREE.Group(); armR.position.set(0.3375, 0.675, 0); upper.add(armR);
  add(BOX(U, 0.675, U), M.arm, 0, -0.3375, 0, armR);
  add(BOX(0.28, 0.1, 0.28), M.pauld, 0, 0, 0, armR);
  const armL = new THREE.Group(); armL.position.set(-0.3375, 0.675, 0); upper.add(armL);
  add(BOX(U, 0.675, U), M.arm, 0, -0.3375, 0, armL);
  add(BOX(0.28, 0.1, 0.28), M.pauld, 0, 0, 0, armL);

  const sword = makeSword(swordLen(c), swordWide(c), L.trim);
  sword.position.set(0, -0.62, 0);
  sword.rotation.x = -Math.PI / 2;
  armR.add(sword);

  let shield = null;
  if (clsId === 'shield') { shield = makeShield(L); upper.add(shield); }

  const label = nameSprite(name, '#ffe9a8');
  root.add(label);

  const stars = new THREE.Group();
  stars.position.y = 2.15;
  stars.visible = false;
  for (let i = 0; i < 3; i++) {
    const s = new THREE.Mesh(BOX(0.12, 0.12, 0.12), new THREE.MeshBasicMaterial({ color: 0xffe14d }));
    s.position.set(Math.cos((i * TAU) / 3) * 0.35, 0, Math.sin((i * TAU) / 3) * 0.35);
    stars.add(s);
  }
  root.add(stars);
  scene.add(root);
  return { root, upper, head, armR, armL, legR, legL, sword, shield, label, stars, phase: 0, stepIdx: 0, block: 0, fall: 0, act: null, spinT: 0 };
}
function removeRig(r) {
  scene.remove(r.root);
  r.label.material.map.dispose();
  r.label.material.dispose();
}

/* ═════════════ 전신 애니메이션 ═════════════ */
// 휘두르기: 아이들 → 뒤로 젖힘(raised) → 내려침(end) → 복귀. 팔뿐 아니라 허리 비틀기·몸 기울기·다리 내딛기까지 함께 움직임
const P3 = {
  idle:   { arm: 0.85, wr: 0.5,  tw: 0,    ln: -0.04, st: 0,    al: 0 },
  raised: { arm: 2.6,  wr: 0.0,  tw: -0.6, ln: 0.18,  st: -0.3, al: 0.7 },
  end:    { arm: 1.45, wr: -1.9, tw: 0.55, ln: -0.42, st: 0.65, al: -0.7 },
};
const mixP = (a, b, u) => { const o = {}; for (const k in a) o[k] = lerp(a[k], b[k], u); return o; };
function swingParams(c) {
  // 타격 순간이 서버의 windup(명중 판정 시점)과 맞도록 구성
  const raise = Math.max(c.windup * 0.62, 0.05);
  const strike = Math.max(c.windup * 0.38, 0.05);
  const rec = Math.max(0.14, c.cooldown - raise - strike);
  return { raise, strike, rec, total: raise + strike + rec };
}
function swingKeys(t, c) {
  const s = swingParams(c);
  if (t < s.raise) return ['idle', 'raised', easeOut(t / s.raise)];
  if (t < s.raise + s.strike) return ['raised', 'end', (t - s.raise) / s.strike];
  if (t < s.total) return ['end', 'idle', easeInOut((t - s.raise - s.strike) / s.rec)];
  return null;
}
const SKILL_DUR = { spin: 0.5, lunge: 0.45, bash: 0.45, rally: 0.8, kick: 0.45 };
const SKILL_FREE = { rally: true }; // 시전 중에도 움직이고 공격할 수 있는 스킬

function actionPose(a, c) {
  const u = a.t / a.dur;
  if (a.kind === 'swing') {
    const k = swingKeys(a.t, c);
    return k ? mixP(P3[k[0]], P3[k[1]], k[2]) : null;
  }
  switch (a.id) {
    case 'spin': return { arm: 1.55, wr: -1.55, al: 1.3, ln: -0.1, tw: 0, spin: easeInOut(u) * TAU, st: 0.3 };
    case 'lunge': { const k = Math.min(1, u / 0.3); return { arm: lerp(0.9, 1.55, k), wr: lerp(0.5, -1.55, k), al: -0.8 * k, ln: -0.6 * k, tw: 0.25 * k, st: 0.95 * k }; }
    case 'bash': { const b = Math.sin(Math.min(1, u) * Math.PI); return { arm: 1.0, wr: 0.3, al: lerp(0.5, 1.75, b), ln: -0.35 * b, tw: 0.15 * b, st: 0.5 * b, sp: b }; }
    case 'rally': { const e = Math.min(1, u * 5) * Math.min(1, (1 - u) * 5); return { arm: lerp(0.85, 2.9, e), wr: lerp(0.5, -1.35, e), al: lerp(0, 2.9, e), ln: 0.15 * e, hx: 0.4 * e }; }
    case 'kick': { const b = Math.sin(Math.min(1, u / 0.66) * Math.PI); return { legR: 1.6 * b, arm: 0.5, al: 0.2, wr: 0.5, ln: 0.25 * b, tw: 0 }; }
  }
  return null;
}

function startAct(r, kind, id) {
  const c = CLASSES[r.cls];
  r.act = { kind, id, t: 0, dur: kind === 'swing' ? swingParams(c).total : SKILL_DUR[id] || 0.5, free: !!SKILL_FREE[id] };
}

function animateRig(r, dt, o) {
  const c = CLASSES[r.cls];
  r.phase += o.v * dt * 2.4 * (o.sprint ? 0.85 : 1);
  const amp = o.air ? 0.3 : clamp(o.v / 4.5, 0, 1) * 0.7 + (o.sprint ? 0.3 : 0);
  const s = Math.sin(r.phase);
  let legR = s * amp, legL = -s * amp;
  let armL = -s * amp * 0.9;
  let armR = P3.idle.arm + s * amp * 0.15, wr = P3.idle.wr;
  let tw = s * 0.1 * amp;
  let ln = o.sprint ? -0.3 : o.v > 0.5 ? -0.07 : -0.04;
  let spin = 0, hx = 0, sp = 0;

  r.block = lerp(r.block, o.blocking ? 1 : 0, Math.min(1, dt * 14));
  const b = r.block;
  if (b > 0.01) {
    armR = lerp(armR, 1.5, b); wr = lerp(wr, 0.1, b); armL = lerp(armL, 1.3, b);
    tw = lerp(tw, 0.35, b); ln = lerp(ln, -0.12, b);
  }

  let P = null;
  if (r.act) {
    r.act.t += dt;
    if (r.act.t >= r.act.dur) r.act = null;
    else P = actionPose(r.act, c);
  }
  if (P) {
    if (P.arm !== undefined) armR = P.arm;
    if (P.wr !== undefined) wr = P.wr;
    if (P.al !== undefined) armL = P.al;
    if (P.tw !== undefined) tw = P.tw;
    if (P.ln !== undefined) ln = P.ln;
    if (P.st !== undefined) { legR = -P.st * 0.8; legL = P.st; }
    if (P.legR !== undefined) legR = P.legR;
    spin = P.spin || 0; hx = P.hx || 0; sp = P.sp || 0;
  }

  r.legR.rotation.x = legR;
  r.legL.rotation.x = legL;
  r.upper.rotation.set(ln, tw + spin, 0);
  r.upper.position.y = 0.675 + (o.air ? 0 : Math.abs(Math.cos(r.phase)) * 0.02 * amp);
  r.armR.rotation.set(armR, 0, 0.06);
  r.armL.rotation.set(armL, 0, -0.06);
  r.sword.rotation.x = -Math.PI / 2 + wr;
  r.head.rotation.set(clamp(o.pitch, -1.2, 1.2) * 0.8 - ln * 0.5 + hx, -tw * 0.5, 0);
  if (r.shield) {
    r.shield.position.set(lerp(-0.44, -0.12, b), lerp(0.4, 0.52, b), lerp(-0.16, -0.42, b) - 0.3 * sp);
  }

  const idx = Math.floor(r.phase / Math.PI);
  if (idx !== r.stepIdx) {
    r.stepIdx = idx;
    if (amp > 0.25 && !o.air && o.onStep) o.onStep();
  }
}

/* ═════════════ 이펙트 ═════════════ */
const fx = [];
const parts = [];
const ringGeo = new THREE.RingGeometry(0.88, 1, 40);
ringGeo.rotateX(-Math.PI / 2);
function ring(x, z, color, maxR, dur) {
  const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }));
  m.position.set(x, 0.07, z);
  scene.add(m);
  fx.push({ m, t: 0, dur, maxR });
}
const sparkMats = {};
function burst(x, y, z, color, n = 8) {
  if (parts.length > 160) return;
  const mat = (sparkMats[color] ??= new THREE.MeshBasicMaterial({ color }));
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(BOX(0.08, 0.08, 0.08), mat);
    m.position.set(x, y, z);
    scene.add(m);
    parts.push({ m, vx: rand(-3, 3), vy: rand(1, 5), vz: rand(-3, 3), t: 0, life: rand(0.35, 0.6) });
  }
}
function updateFx(dt) {
  for (let i = fx.length - 1; i >= 0; i--) {
    const f = fx[i];
    f.t += dt;
    const u = f.t / f.dur;
    f.m.scale.setScalar(lerp(0.3, f.maxR, easeOut(Math.min(u, 1))));
    f.m.material.opacity = 0.9 * (1 - Math.min(u, 1));
    if (u >= 1) { scene.remove(f.m); f.m.material.dispose(); fx.splice(i, 1); }
  }
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    p.t += dt;
    p.vy -= 14 * dt;
    p.m.position.x += p.vx * dt; p.m.position.y += p.vy * dt; p.m.position.z += p.vz * dt;
    if (p.t > p.life || p.m.position.y < 0.03) { scene.remove(p.m); parts.splice(i, 1); }
  }
}

/* ═════════════ 상태 ═════════════ */
const me = {
  id: null, cls: 'knight', x: 0, y: 0, z: 0, vy: 0, yaw: 0, pitch: 0,
  hp: 100, alive: false, blocking: false, lastAtk: 0, onGround: true,
  stamina: PLAYER.staminaMax, exhausted: false, regenWait: 0, sprinting: false,
  sprintB: 0, blockB: 0, act: null, dash: null, stunUntil: 0, buffUntil: 0, cd: {},
  bobPhase: 0, mv: 0, stepIdx: 0, kick: 0, roll: 0, shake: 0, fovK: 0, pendingCls: null,
  streak: 0, ping: 0, debugCam: false,
};
let joined = false;
let roster = [];
const remotes = new Map();
let selectedCls = 'knight';
let deadUntil = 0;
let killerName = '';
let mouseR = false;
const keys = {};

/* ═════════════ 1인칭 팔 / 칼 ═════════════ */
const vm = new THREE.Group();
camera.add(vm);
let fp = null;
const FP_PIVOT = { x: 0.34, y: -0.25, z: -0.24 }; // 1인칭 오른쪽 어깨 위치
function buildViewmodel() {
  vm.clear();
  const c = CLASSES[me.cls], L = getLook(me.cls), M = getMats(me.cls);
  const arm = new THREE.Group();
  arm.rotation.order = 'YXZ';
  arm.position.set(FP_PIVOT.x, FP_PIVOT.y, FP_PIVOT.z);
  vm.add(arm);
  const am = new THREE.Mesh(BOX(0.11, 0.42, 0.11), M.arm);
  am.position.y = -0.21;
  arm.add(am);
  const sword = makeSword(swordLen(c) * 0.7, swordWide(c), L.trim);
  sword.traverse((o) => { o.castShadow = false; });
  sword.position.y = -0.4;
  sword.rotation.x = -Math.PI / 2;
  arm.add(sword);
  let shield = null;
  if (me.cls === 'shield') {
    shield = makeShield(L);
    shield.castShadow = false;
    shield.rotation.y = Math.PI; // 바깥 무늬가 카메라 쪽을 보게
    shield.scale.setScalar(0.72);
    vm.add(shield);
  }
  const boot = new THREE.Mesh(BOX(0.2, 0.2, 0.55), M.leg);
  boot.visible = false;
  vm.add(boot);
  fp = { arm, sword, shield, boot };
}
const PF = {
  idle:   { a: 1.3, w: -0.35, yw: 0.12 },
  raised: { a: 2.6, w: -0.2,  yw: -0.3 },
  end:    { a: 1.5, w: -1.8,  yw: 0.7 },
};
function updateViewmodel(dt) {
  if (!fp) return;
  const c = CLASSES[me.cls];
  me.sprintB = lerp(me.sprintB, me.sprinting ? 1 : 0, Math.min(1, dt * 9));
  me.blockB = lerp(me.blockB, me.blocking ? 1 : 0, Math.min(1, dt * 14));

  let a = lerp(PF.idle.a, 0.8, me.sprintB), w = lerp(PF.idle.w, 0.05, me.sprintB), yw = lerp(PF.idle.yw, 0.35, me.sprintB);
  a = lerp(a, 1.45, me.blockB); w = lerp(w, -0.2, me.blockB); yw = lerp(yw, 0.55, me.blockB);
  let ox = 0, oy = 0, oz = 0, shieldPush = 0, bootB = 0;

  if (me.act) {
    me.act.t += dt;
    const ac = me.act;
    if (ac.t >= ac.dur) me.act = null;
    else {
      const u = ac.t / ac.dur;
      if (ac.kind === 'swing') {
        const k = swingKeys(ac.t, c);
        if (k) {
          const A = PF[k[0]], B = PF[k[1]];
          a = lerp(A.a, B.a, k[2]); w = lerp(A.w, B.w, k[2]); yw = lerp(A.yw, B.yw, k[2]);
        }
      } else if (ac.id === 'spin') {
        a = 1.5; w = -1.5; yw = lerp(-0.9, 1.5, easeInOut(u)); me.roll = Math.sin(u * TAU) * 0.05;
      } else if (ac.id === 'lunge') {
        const k = Math.min(1, u / 0.25);
        a = lerp(1.3, 1.55, k); w = lerp(-0.35, -1.55, k); yw = 0.35; oz = -0.25 * Math.sin(Math.min(1, u * 2) * Math.PI);
      } else if (ac.id === 'bash') {
        a = 1.2; shieldPush = Math.sin(Math.min(1, u) * Math.PI);
        if (!fp.shield) { a = 1.3; w = -0.8; oz = -0.2 * shieldPush; }
      } else if (ac.id === 'rally') {
        const e = Math.min(1, u * 5) * Math.min(1, (1 - u) * 5);
        a = lerp(a, 2.9, e); w = lerp(w, -1.35, e); yw = lerp(yw, 0, e);
      } else if (ac.id === 'kick') {
        a = 0.7; bootB = Math.sin(Math.min(1, u / 0.66) * Math.PI);
      }
    }
  }
  if (S.bob) {
    ox += Math.sin(me.bobPhase) * 0.012 * me.mv;
    oy += Math.abs(Math.cos(me.bobPhase)) * 0.016 * me.mv;
  }
  fp.arm.position.set(FP_PIVOT.x + ox, FP_PIVOT.y + oy, FP_PIVOT.z + oz);
  fp.arm.rotation.set(a, yw, 0);
  fp.sword.rotation.x = -Math.PI / 2 + w;
  if (fp.shield) {
    const bl = Math.max(me.blockB, shieldPush * 0.6);
    fp.shield.position.set(lerp(-0.4, -0.08, bl) + ox, lerp(-0.38, -0.18, bl) + oy, lerp(-0.62, -0.56, bl) - 0.3 * shieldPush);
    fp.shield.rotation.x = 0;
    fp.shield.rotation.z = lerp(0.08, 0, bl);
  }
  fp.boot.visible = bootB > 0.01;
  if (fp.boot.visible) {
    fp.boot.position.set(0.12, lerp(-0.85, -0.4, bootB), lerp(-0.1, -0.8, bootB));
    fp.boot.rotation.x = -0.35 * bootB;
  }
  vm.visible = me.alive;
}

/* ═════════════ 사운드 (WebAudio) ═════════════ */
let ac, master;
function actx() {
  if (!ac) {
    ac = new (window.AudioContext || window.webkitAudioContext)();
    master = ac.createGain();
    master.gain.value = S.vol;
    master.connect(ac.destination);
  }
  if (ac.state === 'suspended') ac.resume();
  return ac;
}
const out = () => { actx(); return master; };
function tone(type, f0, f1, dur, vol) {
  const a = actx(), t = a.currentTime;
  const o = a.createOscillator(), g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur * 0.8);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(out());
  o.start(t); o.stop(t + dur + 0.02);
}
function noiseBurst(dur, f0, f1, vol, type = 'bandpass') {
  const a = actx(), t = a.currentTime;
  const buf = a.createBuffer(1, Math.max(1, Math.floor(a.sampleRate * dur)), a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const src = a.createBufferSource(); src.buffer = buf;
  const f = a.createBiquadFilter(); f.type = type;
  f.frequency.setValueAtTime(f0, t);
  f.frequency.exponentialRampToValueAtTime(f1, t + dur);
  const g = a.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(f).connect(g).connect(out());
  src.start(t);
}
function safe(fn) { return (...args) => { try { fn(...args); } catch {} }; }
const clang = safe((vol = 0.3) => {
  [1400, 2100, 3300].forEach((f, i) => tone('triangle', f * (0.97 + Math.random() * 0.06), f * 0.97, 0.35, vol / (i + 1.5)));
});
const thud = safe((vol = 0.4) => tone('sine', 140, 45, 0.22, vol));
const whoosh = safe((vol = 0.15, hi = 2200) => noiseBurst(0.25, 500, hi, vol));
const horn = safe((vol = 0.25) => { tone('sawtooth', 150, 180, 0.6, vol * 0.5); tone('square', 75, 90, 0.6, vol * 0.5); });
const stepSnd = safe((vol = 0.1) => noiseBurst(0.07, 500, 150, vol, 'lowpass'));
function volFor(id, base) {
  if (id === me.id) return base;
  const r = remotes.get(id);
  if (!r) return 0;
  const d = Math.hypot(r.root.position.x - me.x, r.root.position.z - me.z);
  return base * clamp(1 - d / 40, 0, 1);
}

/* ═════════════ UI: 캐릭터 카드 ═════════════ */
const STATS = [
  ['체력', (c) => c.hp / 150], ['속도', (c) => c.speed / 6.5], ['공격력', (c) => c.damage / 40],
  ['공속', (c) => 1 / c.cooldown / 2.7], ['사거리', (c) => c.reach / 3.2], ['방어', (c) => c.block],
];
function buildCards(container, selectedId, onPick) {
  container.textContent = '';
  for (const c of Object.values(CLASSES)) {
    const sk = SKILLS[c.skill];
    const el = document.createElement('div');
    el.className = 'card' + (c.id === selectedId ? ' sel' : '');
    el.innerHTML = '<h3></h3><p class="d"></p>'
      + STATS.map(([n, f]) => `<div class="stat"><span>${n}</span><div class="bar"><i style="width:${Math.round(clamp(f(c), 0.05, 1) * 100)}%"></i></div></div>`).join('')
      + `<div class="skl"><b>Q</b> ${sk.icon} <em>${sk.name}</em> — ${sk.desc} (${sk.cooldown}초)</div>`
      + `<div class="skl" style="border:0;margin:0;padding:0"><b>E</b> 🦶 <em>발차기</em> (${SKILLS.kick.cooldown}초)</div>`;
    el.querySelector('h3').textContent = c.name;
    el.querySelector('.d').textContent = c.desc;
    el.onclick = () => {
      container.querySelectorAll('.card').forEach((x) => x.classList.remove('sel'));
      el.classList.add('sel');
      onPick(c.id);
    };
    container.appendChild(el);
  }
}
buildCards($('cards'), selectedCls, (id) => (selectedCls = id));
$('name').value = (() => { try { return localStorage.getItem('ironoath_name') || ''; } catch { return ''; } })();
$('help-skills').innerHTML = Object.values(CLASSES).map((c) => {
  const sk = SKILLS[c.skill];
  return `<div style="margin:6px 0"><b>Q</b> ${sk.icon} <em>${sk.name}</em> <span style="opacity:.7">(${c.name})</span> — ${sk.desc}</div>`;
}).join('') + `<div style="margin:6px 0"><b>E</b> 🦶 <em>${SKILLS.kick.name}</em> — ${SKILLS.kick.desc}</div>`;

/* ═════════════ HUD 보조 ═════════════ */
let toastTimer = 0;
function toast(text) {
  const t = $('toast');
  t.textContent = text;
  t.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('on'), 2400);
}
function banner(text) {
  const b = $('banner');
  b.textContent = text;
  b.classList.remove('show');
  void b.offsetWidth;
  b.classList.add('show');
}
function feed(text) {
  const d = document.createElement('div');
  d.textContent = text;
  $('feed').appendChild(d);
  setTimeout(() => d.remove(), 6000);
  while ($('feed').children.length > 6) $('feed').firstChild.remove();
}
function dmgNumber(x, y, z, text, cls) {
  const v = new THREE.Vector3(x, y, z).project(camera);
  if (v.z > 1 || v.z < -1) return;
  const el = document.createElement('div');
  el.className = 'dn ' + cls;
  el.textContent = text;
  el.style.left = ((v.x * 0.5 + 0.5) * innerWidth) + 'px';
  el.style.top = ((-v.y * 0.5 + 0.5) * innerHeight) + 'px';
  $('floaters').appendChild(el);
  setTimeout(() => el.remove(), 950);
}
function updateHud() {
  const c = CLASSES[me.cls];
  $('clsname').textContent = c.name;
  $('hpfill').style.width = `${clamp((me.hp / c.hp) * 100, 0, 100)}%`;
  $('hptext').textContent = `${Math.ceil(me.hp)} / ${c.hp}`;
  $('lowhp').classList.toggle('on', me.alive && me.hp / c.hp < 0.3);
}
function renderBoard() {
  const body = $('boardbody');
  body.textContent = '';
  const rows = [...roster].sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);
  for (const r of rows) {
    const tr = document.createElement('tr');
    if (r.id === me.id) tr.className = 'me';
    for (const [txt, cls] of [[r.name, ''], [CLASSES[r.cls]?.name ?? r.cls, ''], [r.kills, 'n'], [r.deaths, 'n']]) {
      const td = document.createElement('td');
      td.textContent = txt;
      if (cls) td.className = cls;
      tr.appendChild(td);
    }
    body.appendChild(tr);
  }
  const mine = roster.find((r) => r.id === me.id);
  $('kd').textContent = mine ? `처치 ${mine.kills}  /  사망 ${mine.deaths}` : '';
}
const nameOf = (id) => roster.find((r) => r.id === id)?.name ?? '???';

// 스킬 슬롯, 스태미나, 상태 아이콘
const slotEls = ['q', 'e'].map((k) => {
  const el = $('slot-' + k);
  return { k, el, ic: el.querySelector('.ic'), nm: el.querySelector('.nm'), fill: el.querySelector('.cdfill'), txt: el.querySelector('.cdtxt'), id: null, last: '' };
});
let hudTick = 0;
function updateHudFrame(nowMs, dt) {
  for (const s of slotEls) {
    const id = s.k === 'q' ? CLASSES[me.cls].skill : 'kick';
    const def = SKILLS[id];
    if (s.id !== id) { s.id = id; s.ic.textContent = def.icon; s.nm.textContent = def.name; }
    const rem = Math.max(0, (me.cd[id] || 0) - nowMs);
    const key = rem <= 0 ? 'r' : `${Math.round((rem / (def.cooldown * 1000)) * 100)}|${(rem / 1000).toFixed(rem < 10000 ? 1 : 0)}`;
    if (key !== s.last) {
      s.last = key;
      s.fill.style.height = rem <= 0 ? '0%' : `${(rem / (def.cooldown * 1000)) * 100}%`;
      s.txt.textContent = rem <= 0 ? '' : (rem / 1000).toFixed(rem < 10000 ? 1 : 0);
      s.el.classList.toggle('ready', rem <= 0);
    }
  }
  $('stfill').style.width = `${(me.stamina / PLAYER.staminaMax) * 100}%`;
  $('stbar').classList.toggle('tired', me.exhausted);

  hudTick += dt;
  if (hudTick > 0.15) {
    hudTick = 0;
    const st = $('status');
    const items = [];
    if (nowMs < me.buffUntil) items.push(`📣 함성 ${((me.buffUntil - nowMs) / 1000).toFixed(1)}초`);
    if (nowMs < me.stunUntil) items.push('💫 기절');
    if (me.exhausted) items.push('😮‍💨 지침');
    if (st.dataset.k !== items.join('|')) {
      st.dataset.k = items.join('|');
      st.textContent = '';
      for (const t of items) { const d = document.createElement('div'); d.textContent = t; st.appendChild(d); }
    }
    $('stunned').style.display = nowMs < me.stunUntil && me.alive ? 'block' : 'none';
    if (S.netinfo) $('netinfo').textContent = `핑 ${me.ping}ms · ${fps} FPS`;
  }
}

// 미니맵: 내가 항상 위쪽을 보는 회전식 레이더
const mm = $('minimap'), mg = mm.getContext('2d');
const MM_RANGE = 30;
function drawMinimap() {
  const W = mm.width, s = W / 2 / MM_RANGE;
  mg.clearRect(0, 0, W, W);
  mg.save();
  mg.translate(W / 2, W / 2);
  mg.rotate(me.yaw);
  mg.translate(-me.x * s, -me.z * s);
  mg.fillStyle = 'rgba(80,125,55,.6)';
  mg.fillRect(-ARENA.half * s, -ARENA.half * s, ARENA.half * 2 * s, ARENA.half * 2 * s);
  mg.strokeStyle = '#d8d2c0';
  mg.lineWidth = 3;
  mg.strokeRect(-ARENA.half * s, -ARENA.half * s, ARENA.half * 2 * s, ARENA.half * 2 * s);
  mg.fillStyle = '#9c9a93';
  for (const p of ARENA.pillars) { mg.beginPath(); mg.arc(p.x * s, p.z * s, p.r * s, 0, TAU); mg.fill(); }
  for (const r of remotes.values()) {
    if (!r.alive) continue;
    mg.fillStyle = '#ff5a4a';
    mg.beginPath(); mg.arc(r.root.position.x * s, r.root.position.z * s, 4.5, 0, TAU); mg.fill();
    mg.strokeStyle = '#2a0805'; mg.lineWidth = 1.5; mg.stroke();
  }
  mg.restore();
  mg.fillStyle = '#ffe27a';
  mg.strokeStyle = '#3a2a05';
  mg.lineWidth = 1.5;
  mg.beginPath();
  mg.moveTo(W / 2, W / 2 - 8); mg.lineTo(W / 2 + 6, W / 2 + 6); mg.lineTo(W / 2, W / 2 + 2); mg.lineTo(W / 2 - 6, W / 2 + 6);
  mg.closePath(); mg.fill(); mg.stroke();
}

function applyHudSettings() {
  $('minimap').style.display = S.minimap ? 'block' : 'none';
  $('netinfo').style.display = S.netinfo ? 'block' : 'none';
  if (!S.netinfo) $('netinfo').textContent = '';
}

/* ═════════════ 네트워크 ═════════════ */
let ws = null;
let pingTimer = 0;
function send(m) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(m)); }

function connect() {
  const name = $('name').value.trim() || 'Knight';
  try { localStorage.setItem('ironoath_name', name); } catch {}
  $('join').disabled = true;
  $('lobmsg').textContent = '접속 중…';
  const sock = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`);
  ws = sock;
  sock.onopen = () => send({ t: 'join', name, cls: selectedCls });
  sock.onmessage = (e) => { try { handle(JSON.parse(e.data)); } catch (err) { console.error(err); } };
  sock.onerror = () => {};
  sock.onclose = () => {
    if (ws !== sock) return; // 우리가 직접 나간 경우
    ws = null;
    const wasJoined = joined;
    goLobby(wasJoined ? '서버와 연결이 끊어졌습니다.' : '서버에 연결하지 못했습니다. (서버가 잠들어 있다면 잠시 후 다시 시도해 보세요)');
  };
}
$('join').onclick = () => {
  actx();
  connect();
  tryLock();
};

function syncRemotes() {
  const ids = new Set(roster.map((r) => r.id));
  for (const [id, r] of remotes) {
    const p = roster.find((x) => x.id === id);
    if (!p || p.cls !== r.cls || p.name !== r.name) { removeRig(r); remotes.delete(id); }
  }
  for (const p of roster) {
    if (p.id === me.id || remotes.has(p.id)) continue;
    const rig = makeRig(p.cls, p.name);
    remotes.set(p.id, {
      id: p.id, cls: p.cls, name: p.name, ...rig,
      yaw: 0, tx: 0, ty: 0, tz: 0, tyaw: 0, tpitch: 0, pitch: 0, px: 0, pz: 0, v: 0,
      blocking: false, alive: true, init: false, stunUntil: 0,
    });
  }
  void ids;
  renderBoard();
}

function actorPos(id) {
  if (id === me.id) return { x: me.x, y: me.y, z: me.z };
  const r = remotes.get(id);
  return r ? { x: r.root.position.x, y: r.root.position.y, z: r.root.position.z } : null;
}

function resetLocal() {
  Object.assign(me, {
    vy: 0, blocking: false, stamina: PLAYER.staminaMax, exhausted: false, regenWait: 0, sprinting: false,
    sprintB: 0, blockB: 0, act: null, dash: null, stunUntil: 0, buffUntil: 0, cd: {}, kick: 0, roll: 0, shake: 0, fovK: 0, pendingCls: null,
  });
}

function handle(m) {
  switch (m.t) {
    case 'full':
      $('lobmsg').textContent = '서버가 가득 찼습니다.';
      $('join').disabled = false;
      ws?.close();
      ws = null;
      break;
    case 'welcome':
      resetLocal();
      me.streak = 0;
      Object.assign(me, { id: m.id, cls: m.cls, x: m.x, y: m.y, z: m.z, yaw: m.yaw, pitch: 0, hp: m.hp, alive: true });
      roster = m.roster;
      joined = true;
      buildViewmodel();
      syncRemotes();
      updateHud();
      $('lobby').style.display = 'none';
      $('hud').style.display = 'block';
      $('death').style.display = 'none';
      applyHudSettings();
      showView('main');
      refreshMenu();
      clearInterval(pingTimer);
      pingTimer = setInterval(() => send({ t: 'ping', ts: performance.now() }), 2000);
      break;
    case 'roster':
      roster = m.list;
      syncRemotes();
      break;
    case 'pong':
      me.ping = Math.round(performance.now() - m.ts);
      break;
    case 'snap':
      for (const p of m.p) {
        if (p.id === me.id) {
          if (p.hp !== me.hp) { me.hp = p.hp; updateHud(); }
          continue;
        }
        const r = remotes.get(p.id);
        if (!r) continue;
        r.tx = p.x; r.ty = p.y; r.tz = p.z; r.tyaw = p.yaw; r.tpitch = p.pitch; r.blocking = p.b; r.alive = p.alive;
        const pos = r.root.position;
        if (!r.init || Math.hypot(pos.x - p.x, pos.z - p.z) > 6) {
          pos.set(p.x, p.y, p.z); r.yaw = p.yaw; r.pitch = p.pitch; r.px = p.x; r.pz = p.z; r.init = true;
        }
      }
      break;
    case 'swing': {
      if (m.id === me.id) break;
      const r = remotes.get(m.id);
      if (r) startAct(r, 'swing');
      whoosh(volFor(m.id, 0.15));
      break;
    }
    case 'skill': {
      const r = remotes.get(m.id);
      if (m.id !== me.id && r) startAct(r, 'skill', m.skill);
      skillFx(m.id, m.skill);
      break;
    }
    case 'buff':
      if (m.id === me.id) me.buffUntil = performance.now() + m.ms;
      break;
    case 'stun': {
      const until = performance.now() + m.ms;
      if (m.id === me.id) { me.stunUntil = until; me.dash = null; me.blocking = false; me.act = null; }
      else { const r = remotes.get(m.id); if (r) { r.stunUntil = until; r.act = null; } }
      break;
    }
    case 'hit': {
      const pos = actorPos(m.id);
      if (m.id === me.id) {
        me.hp = m.hp;
        updateHud();
        $('dmg').style.opacity = m.blocked ? 0.25 : 0.8;
        setTimeout(() => ($('dmg').style.opacity = 0), 120);
        me.kick += m.blocked ? 0.02 : 0.05;
        me.shake = Math.max(me.shake, m.blocked ? 0.25 : 0.6);
      }
      if (pos) burst(pos.x, pos.y + 1.1, pos.z, m.blocked ? 0xcfd8e8 : 0xc23b2e, m.blocked ? 5 : 9);
      if (m.by === me.id && m.id !== me.id) {
        const h = $('hitmark');
        h.className = m.blocked ? 'blocked' : '';
        h.style.opacity = 1;
        setTimeout(() => (h.style.opacity = 0), 150);
        if (pos) dmgNumber(pos.x, pos.y + 2.1, pos.z, String(m.dmg), m.blocked ? 'blocked' : m.skill ? 'skill' : '');
      }
      m.blocked ? clang(volFor(m.id, 0.35)) : thud(volFor(m.id, 0.5));
      break;
    }
    case 'kill':
      feed(`${nameOf(m.killer)}  ⚔  ${nameOf(m.victim)}`);
      if (m.killer === me.id) {
        me.streak++;
        banner(['', '처치!', '더블 킬!', '트리플 킬!', '쿼드라 킬!'][me.streak] || `${me.streak}연속 처치!`);
      }
      if (m.victim === me.id) {
        me.alive = false;
        me.blocking = false;
        me.streak = 0;
        me.act = null; me.dash = null;
        killerName = nameOf(m.killer);
        deadUntil = performance.now() + PLAYER.respawnMs;
        $('death').style.display = 'block';
        updateHud();
      }
      break;
    case 'respawn':
      if (m.id === me.id) {
        const changed = m.cls !== me.cls;
        resetLocal();
        Object.assign(me, { cls: m.cls, x: m.x, y: m.y, z: m.z, yaw: m.yaw, pitch: 0, hp: m.hp, alive: true });
        if (changed) buildViewmodel();
        $('death').style.display = 'none';
        updateHud();
        buildCards($('menu-cards'), me.cls, pickClass);
      } else {
        const r = remotes.get(m.id);
        if (r) { r.act = null; r.stunUntil = 0; }
      }
      break;
    case 'correct':
      me.x = m.x; me.y = m.y; me.z = m.z;
      me.dash = null;
      break;
    case 'classqueued':
      me.pendingCls = m.immediate ? null : m.cls;
      $('menu-note').textContent = m.immediate ? `${CLASSES[m.cls].name}(으)로 변경했습니다!` : `${CLASSES[m.cls].name} — 다음 부활 때 적용됩니다.`;
      if (!m.immediate) toast(`다음 부활 때 ${CLASSES[m.cls].name}(으)로 변경`);
      buildCards($('menu-cards'), me.pendingCls || me.cls, pickClass);
      break;
  }
}

function skillFx(id, skill) {
  const p = actorPos(id);
  if (!p) return;
  const v = (b) => volFor(id, b);
  if (skill === 'rally') { ring(p.x, p.z, 0xffd45a, 4.5, 0.7); horn(v(0.3)); }
  else if (skill === 'spin') { ring(p.x, p.z, 0xe9eef5, 4.2, 0.45); whoosh(v(0.3), 3000); }
  else if (skill === 'bash') { thud(v(0.45)); whoosh(v(0.12), 1200); }
  else if (skill === 'lunge') { whoosh(v(0.28), 4000); }
  else if (skill === 'kick') { whoosh(v(0.2), 1500); }
}

/* ═════════════ 메뉴 (ESC) ═════════════ */
let lobbySettings = false;
const locked = () => document.pointerLockElement === canvas;
function showView(v) {
  document.querySelectorAll('.mview').forEach((el) => el.classList.toggle('on', el.id === 'mv-' + v));
  document.querySelector('#menu .mpanel').classList.toggle('wide', v === 'chars');
  if (v === 'chars') {
    $('menu-note').textContent = '';
    buildCards($('menu-cards'), me.pendingCls || me.cls, pickClass);
  }
}
function refreshMenu() {
  $('menu').style.display = (joined && !locked()) || lobbySettings ? 'flex' : 'none';
}
function tryLock() {
  try {
    const p = canvas.requestPointerLock();
    if (p && p.catch) p.catch(() => toast('잠시 후 다시 클릭해 주세요'));
  } catch {}
}
function resetInput() {
  for (const k in keys) keys[k] = false;
  mouseR = false;
  me.blocking = false;
}
function pickClass(id) {
  if (!joined) return;
  if (id === me.cls && !me.pendingCls) { $('menu-note').textContent = '이미 선택한 기사입니다.'; return; }
  send({ t: 'setclass', cls: id });
}
document.addEventListener('pointerlockchange', () => {
  if (!locked()) {
    resetInput();
    if (joined) showView('main');
  } else {
    document.activeElement?.blur?.();
  }
  refreshMenu();
});
document.addEventListener('pointerlockerror', () => toast('마우스 잠금에 실패했어요. 한 번 더 클릭해 주세요'));

document.querySelectorAll('[data-view]').forEach((b) => (b.onclick = () => showView(b.dataset.view)));
$('m-resume').onclick = () => tryLock();
$('m-home').onclick = () => leaveGame();
$('lobby-settings').onclick = () => { lobbySettings = true; showView('settings'); refreshMenu(); };
$('set-back').onclick = () => {
  if (joined) showView('main');
  else { lobbySettings = false; showView('main'); refreshMenu(); }
};

function goLobby(msg = '') {
  clearInterval(pingTimer);
  for (const r of remotes.values()) removeRig(r);
  remotes.clear();
  roster = [];
  joined = false;
  me.alive = false;
  me.id = null;
  $('feed').textContent = '';
  $('floaters').textContent = '';
  $('hud').style.display = 'none';
  $('death').style.display = 'none';
  $('lobby').style.display = 'flex';
  $('join').disabled = false;
  $('lobmsg').textContent = msg;
  lobbySettings = false;
  showView('main');
  if (locked()) document.exitPointerLock?.();
  refreshMenu();
}
function leaveGame() {
  const sock = ws;
  ws = null; // onclose가 '연결 끊김'으로 오해하지 않게
  try { sock?.close(); } catch {}
  goLobby('');
}

// 설정 UI
const setBinds = [
  ['sens', 'set-sens', 'o-sens', (v) => (+v).toFixed(2)],
  ['fov', 'set-fov', 'o-fov', (v) => `${v}°`],
  ['vol', 'set-vol', 'o-vol', (v) => `${Math.round(v * 100)}%`],
];
for (const [key, id, oid, fmt] of setBinds) {
  const el = $(id);
  el.value = S[key];
  $(oid).textContent = fmt(S[key]);
  el.oninput = () => {
    S[key] = +el.value;
    $(oid).textContent = fmt(S[key]);
    if (key === 'vol' && master) master.gain.value = S.vol;
    if (key === 'fov') { camera.fov = S.fov; camera.updateProjectionMatrix(); }
    saveSettings();
  };
}
$('set-quality').value = S.quality;
$('set-quality').onchange = (e) => { S.quality = e.target.value; applyQuality(); saveSettings(); };
for (const [key, id] of [['minimap', 'set-minimap'], ['netinfo', 'set-netinfo'], ['bob', 'set-bob']]) {
  const el = $(id);
  el.checked = S[key];
  el.onchange = () => { S[key] = el.checked; applyHudSettings(); saveSettings(); };
}

/* ═════════════ 입력 ═════════════ */
const typing = (e) => e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA');
addEventListener('keydown', (e) => {
  if (e.code === 'Tab') { e.preventDefault(); if (joined) $('board').style.display = 'block'; }
  if (typing(e)) return;
  if (joined && locked() && (e.code === 'Space' || e.code.startsWith('Arrow'))) e.preventDefault();
  keys[e.code] = true;
  if (e.repeat || !joined || !locked()) return;
  if (e.code === 'KeyQ') useSkill('q');
  if (e.code === 'KeyE') useSkill('e');
});
addEventListener('keyup', (e) => {
  if (e.code === 'Tab') $('board').style.display = 'none';
  keys[e.code] = false;
});
addEventListener('blur', () => resetInput());
addEventListener('contextmenu', (e) => e.preventDefault());

addEventListener('mousemove', (e) => {
  if (!locked() || !me.alive) return;
  const k = 0.0022 * S.sens;
  me.yaw -= e.movementX * k;
  me.pitch = clamp(me.pitch - e.movementY * k, -1.45, 1.45);
});
addEventListener('mousedown', (e) => {
  if (!locked() || !joined) return;
  if (e.button === 0) tryAttack();
  if (e.button === 2) mouseR = true;
});
addEventListener('mouseup', (e) => { if (e.button === 2) mouseR = false; });

function startMeAct(kind, id) {
  const c = CLASSES[me.cls];
  me.act = { kind, id, t: 0, dur: kind === 'swing' ? swingParams(c).total : SKILL_DUR[id] || 0.5, free: !!SKILL_FREE[id] };
}
const stunnedNow = () => performance.now() < me.stunUntil;
const busy = () => me.act && me.act.kind === 'skill' && !me.act.free;

function tryAttack() {
  if (!me.alive || stunnedNow() || busy()) return;
  const c = CLASSES[me.cls];
  const t = performance.now();
  if (t - me.lastAtk < c.cooldown * 1000) return;
  me.lastAtk = t;
  startMeAct('swing');
  me.blocking = false;
  send({ t: 'attack' });
  whoosh(0.18);
}
function useSkill(slot) {
  if (!me.alive || stunnedNow() || busy()) return;
  const id = slot === 'e' ? 'kick' : CLASSES[me.cls].skill;
  const def = SKILLS[id];
  const t = performance.now();
  if (t < (me.cd[id] || 0)) return;
  me.cd[id] = t + def.cooldown * 1000;
  me.blocking = false;
  startMeAct('skill', id);
  send({ t: 'skill', slot });
  if (def.dash) me.dash = { t: 0, dur: def.dash.dur, speed: def.dash.speed, dx: -Math.sin(me.yaw), dz: -Math.cos(me.yaw) };
  if (id === 'rally') me.buffUntil = t + def.dur;
  if (id === 'lunge') me.fovK = 14;
  if (id === 'bash' || id === 'kick') me.shake = Math.max(me.shake, 0.3);
  skillFx(me.id, id);
}

/* ═════════════ 메인 루프 ═════════════ */
const clock = new THREE.Clock();
let sendTimer = 0;
let fps = 0, fpsAcc = 0, fpsN = 0;
let mmTick = 0;

function update(dt, nowMs) {
  const c = CLASSES[me.cls];
  const stunned = nowMs < me.stunUntil;
  const buffed = nowMs < me.buffUntil;
  let speedH = 0;

  if (joined && me.alive) {
    me.blocking = !stunned && locked() && (mouseR || keys.KeyF === true) && !me.act;
    const f = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0);
    const s = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0);

    // 달리기 (Shift): 앞으로 갈 때만, 방어 중엔 불가, 스태미나 소모
    const wantSprint = !!(keys.ShiftLeft || keys.ShiftRight) && f > 0 && !me.blocking && !stunned && locked();
    const sprinting = wantSprint && !me.exhausted && me.stamina > 0;
    if (sprinting) {
      me.stamina = Math.max(0, me.stamina - PLAYER.staminaDrain * dt);
      me.regenWait = 0.5;
      if (me.stamina <= 0) me.exhausted = true;
    } else {
      me.regenWait -= dt;
      if (me.regenWait <= 0) me.stamina = Math.min(PLAYER.staminaMax, me.stamina + PLAYER.staminaRegen * dt);
      if (me.exhausted && me.stamina >= PLAYER.staminaMin) me.exhausted = false;
    }
    me.sprinting = sprinting;

    let vx = 0, vz = 0;
    if (me.dash) {
      me.dash.t += dt;
      vx = me.dash.dx * me.dash.speed;
      vz = me.dash.dz * me.dash.speed;
      if (me.dash.t >= me.dash.dur) me.dash = null;
    } else if (!stunned && (f || s)) {
      const len = Math.hypot(f, s);
      const sp = c.speed
        * (sprinting ? PLAYER.sprintMult : 1)
        * (me.blocking ? 0.55 : 1)
        * (me.act && me.act.kind === 'swing' ? 0.8 : 1)
        * (buffed ? SKILLS.rally.speedMult : 1);
      const fx = -Math.sin(me.yaw), fz = -Math.cos(me.yaw);
      const rx = Math.cos(me.yaw), rz = -Math.sin(me.yaw);
      vx = ((fx * f + rx * s) / len) * sp;
      vz = ((fz * f + rz * s) / len) * sp;
    }
    me.x += vx * dt;
    me.z += vz * dt;
    speedH = Math.hypot(vx, vz);

    if (keys.Space && me.onGround && !stunned && locked()) { me.vy = PLAYER.jump; me.onGround = false; }
    me.vy -= PLAYER.gravity * dt;
    me.y += me.vy * dt;
    if (me.y <= 0) { me.y = 0; me.vy = 0; me.onGround = true; }

    for (const p of ARENA.pillars) {
      const dx = me.x - p.x, dz = me.z - p.z;
      const d = Math.hypot(dx, dz), min = p.r + PLAYER.radius;
      if (d < min && d > 0.0001) { me.x = p.x + (dx / d) * min; me.z = p.z + (dz / d) * min; }
    }
    const lim = ARENA.half - PLAYER.radius;
    me.x = clamp(me.x, -lim, lim);
    me.z = clamp(me.z, -lim, lim);

    sendTimer += dt;
    if (sendTimer >= 0.05) {
      sendTimer = 0;
      send({ t: 'state', x: me.x, y: me.y, z: me.z, yaw: me.yaw, pitch: me.pitch, b: me.blocking });
    }
  } else {
    me.sprinting = false;
    me.blocking = false;
  }

  // 걷기 흔들림 / 발소리
  me.mv = lerp(me.mv, me.onGround ? clamp(speedH / c.speed, 0, 1.6) : 0, Math.min(1, dt * 10));
  me.bobPhase += speedH * dt * 1.9;
  const stepIdx = Math.floor(me.bobPhase / Math.PI);
  if (stepIdx !== me.stepIdx) { me.stepIdx = stepIdx; if (me.mv > 0.4 && me.onGround) stepSnd(0.07); }

  // 카메라
  me.kick = lerp(me.kick, 0, Math.min(1, dt * 9));
  me.shake = lerp(me.shake, 0, Math.min(1, dt * 7));
  me.roll = lerp(me.roll, 0, Math.min(1, dt * 6));
  me.fovK = lerp(me.fovK, 0, Math.min(1, dt * 6));
  const dead = joined && !me.alive;
  if (!me.debugCam) {
    const bob = S.bob ? Math.abs(Math.cos(me.bobPhase)) * 0.035 * me.mv : 0;
    const sh = me.shake * 0.02;
    camera.position.set(me.x + rand(-sh, sh), me.y + (dead ? 0.35 : PLAYER.eye + bob), me.z + rand(-sh, sh));
    const wob = stunned ? Math.sin(nowMs * 0.012) * 0.04 : 0;
    camera.rotation.set(
      dead ? -0.2 : me.pitch - me.kick,
      me.yaw + wob,
      dead ? 0.5 : me.roll + (S.bob ? Math.sin(me.bobPhase) * 0.004 * me.mv : 0),
    );
  }
  const targetFov = S.fov + (me.sprinting ? 8 : 0) + me.fovK + (nowMs < me.buffUntil ? 3 : 0);
  if (Math.abs(camera.fov - targetFov) > 0.05) { camera.fov = lerp(camera.fov, targetFov, Math.min(1, dt * 8)); camera.updateProjectionMatrix(); }

  updateViewmodel(dt);

  // 다른 기사들
  const k = 1 - Math.exp(-14 * dt);
  for (const r of remotes.values()) {
    const pos = r.root.position;
    pos.x = lerp(pos.x, r.tx, k);
    pos.z = lerp(pos.z, r.tz, k);
    pos.y = lerp(pos.y, r.ty, k);
    const dx = pos.x - r.px, dz = pos.z - r.pz;
    r.px = pos.x; r.pz = pos.z;
    r.v = lerp(r.v, Math.min(Math.hypot(dx, dz) / Math.max(dt, 0.001), 12), Math.min(1, dt * 10));
    r.yaw = lerpAngle(r.yaw, r.tyaw, k);
    r.pitch = lerp(r.pitch, r.tpitch, k);
    r.root.rotation.y = r.yaw;
    const rs = nowMs < r.stunUntil;
    animateRig(r, dt, {
      v: r.v, air: pos.y > 0.08, sprint: r.v > CLASSES[r.cls].speed * 1.25,
      blocking: r.blocking && r.alive && !rs, pitch: r.pitch,
      onStep: () => stepSnd(volFor(r.id, 0.08)),
    });
    r.fall = lerp(r.fall, r.alive ? 0 : 1, Math.min(1, dt * 8));
    r.root.rotation.x = r.fall * (Math.PI / 2);
    r.label.visible = r.alive;
    r.stars.visible = rs && r.alive;
    if (r.stars.visible) r.stars.rotation.y += dt * 5;
  }
  updateFx(dt);

  if (joined) {
    updateHudFrame(nowMs, dt);
    mmTick = (mmTick + 1) % 2;
    if (S.minimap && mmTick === 0) drawMinimap();
    if (dead) {
      const left = Math.max(0, Math.ceil((deadUntil - nowMs) / 1000));
      $('death').innerHTML = '전사했습니다<small></small>';
      $('death').querySelector('small').textContent = `${killerName}에게 쓰러졌습니다 · ${left}초 후 부활`;
    }
  }
}

let lastT = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastT) / 1000, 0.05);
  lastT = now;
  fpsAcc += dt; fpsN++;
  if (fpsAcc >= 0.5) { fps = Math.round(fpsN / fpsAcc); fpsAcc = 0; fpsN = 0; }
  update(dt, performance.now());
  renderer.render(scene, camera);
}

applyQuality();
onResize();
applyHudSettings();
requestAnimationFrame(frame);

// 개발용: 주소 끝에 #debug 를 붙였을 때만 열리는 점검 도구
if (location.hash === '#debug') window.__game = { me, remotes, camera, scene, THREE, S, send, startAct, makeRig, animateRig, swingParams };
