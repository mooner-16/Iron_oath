// game.js — Three.js 메인 클라이언트 엔진
import * as THREE from 'three';
import { CLASSES, SKILLS, ARENA, PLAYER, BASIC_KICK, EMOTES } from '/classes.js';

const $ = (id) => document.getElementById(id);
let scene, camera, renderer, previewScene, previewCamera, previewRenderer, previewMesh;
let localPlayer = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, cls: 'knight', team: 'red', hp: 100, alive: false, blocking: false };
let selectedCls = 'knight';
let ws = null, remotes = new Map();

// 1. 메인 Three.js 웹글로벌 및 중세 마을 전장 렌더링
function initEngine() {
  const canvas = $('c');
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x7ba0c0);
  scene.fog = new THREE.FogExp2(0x7ba0c0, 0.015);

  camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.1, 200);
  scene.add(camera);

  // 조명 설정
  const ambLight = new THREE.AmbientLight(0xfff5ea, 1.2);
  scene.add(ambLight);
  const dirLight = new THREE.DirectionalLight(0xffdfb0, 2.0);
  dirLight.position.set(40, 60, 20);
  dirLight.castShadow = true;
  dirLight.shadow.mapSize.set(2048, 2048);
  scene.add(dirLight);

  buildMedievalVillage();
  initPreviewRenderer();
  buildClassCards();
}

// 중세 마을 3D 전장 생성 (78x72 맵 구현)
function buildMedievalVillage() {
  // 바닥 돌식 자갈 바닥
  const floorGeo = new THREE.PlaneGeometry(ARENA.half * 2, ARENA.half * 2);
  const floorMat = new THREE.MeshStandardMaterial({ color: 0x4a433b, roughness: 0.8 });
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  // 중앙 광장 돌 분수대
  const fountGeo = new THREE.CylinderGeometry(ARENA.fountain.r, ARENA.fountain.r, 1.2, 16);
  const stoneMat = new THREE.MeshStandardMaterial({ color: 0x77726b, roughness: 0.6 });
  const fountain = new THREE.Mesh(fountGeo, stoneMat);
  fountain.position.set(0, 0.6, 0);
  fountain.castShadow = fountain.receiveShadow = true;
  scene.add(fountain);

  // 중세 건물 및 집들 배치
  for (const b of ARENA.buildings) {
    const houseGroup = new THREE.Group();
    const wallMesh = new THREE.Mesh(new THREE.BoxGeometry(b.w, b.h, b.d), new THREE.MeshStandardMaterial({ color: 0x8c7a65 }));
    wallMesh.position.y = b.h / 2;
    wallMesh.castShadow = wallMesh.receiveShadow = true;
    houseGroup.add(wallMesh);

    // 지붕
    const roofMesh = new THREE.Mesh(new THREE.ConeGeometry(Math.max(b.w, b.d) * 0.75, 4, 4), new THREE.MeshStandardMaterial({ color: 0x7a2e22 }));
    roofMesh.position.y = b.h + 2;
    roofMesh.rotation.y = Math.PI / 4;
    roofMesh.castShadow = true;
    houseGroup.add(roofMesh);

    houseGroup.position.set(b.x, 0, b.z);
    scene.add(houseGroup);
  }
}

// 2. 로비 3D 캐릭터 실시간 프리뷰 렌더러
function initPreviewRenderer() {
  const pCanvas = $('preview-canvas');
  previewRenderer = new THREE.WebGLRenderer({ canvas: pCanvas, antialias: true, alpha: true });
  previewRenderer.setSize(340, 420);

  previewScene = new THREE.Scene();
  previewCamera = new THREE.PerspectiveCamera(45, 340 / 420, 0.1, 20);
  previewCamera.position.set(0, 1.3, 3.2);

  const light = new THREE.DirectionalLight(0xffffff, 2.2);
  light.position.set(5, 10, 7);
  previewScene.add(light);
  previewScene.add(new THREE.AmbientLight(0xffffff, 1.0));

  updatePreviewModel('knight');
}

function updatePreviewModel(clsId) {
  if (previewMesh) previewScene.remove(previewMesh);
  previewMesh = createCharacterMesh(clsId);
  previewScene.add(previewMesh);
  $('preview-name').textContent = CLASSES[clsId].name;
  $('preview-desc').textContent = CLASSES[clsId].desc;
}

// 3. 20종 캐릭터 3D 메쉬 및 무기 생성기
function createCharacterMesh(clsId) {
  const c = CLASSES[clsId];
  const group = new THREE.Group();

  // 몸통
  const bodyGeo = new THREE.BoxGeometry(0.6, 0.9, 0.4);
  const bodyMat = new THREE.MeshStandardMaterial({ color: c.color });
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.position.y = 1.0;
  group.add(body);

  // 머리 / 투구
  const headGeo = new THREE.BoxGeometry(0.4, 0.4, 0.4);
  const headMat = new THREE.MeshStandardMaterial({ color: 0xd4a373 });
  const head = new THREE.Mesh(headGeo, headMat);
  head.position.y = 1.75;
  group.add(head);

  // 무기 모델 추가 (무기 유형별)
  const weaponMesh = createWeaponMesh(c.weapon);
  weaponMesh.position.set(0.45, 1.1, 0.3);
  group.add(weaponMesh);

  return group;
}

function createWeaponMesh(weaponType) {
  const g = new THREE.Group();
  const metalMat = new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.8, roughness: 0.2 });
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x5c4033 });

  if (weaponType === 'longsword' || weaponType === 'rapier') {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.2, 0.03), metalMat);
    g.add(blade);
  } else if (weaponType === 'bow') {
    const bow = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.03, 8, 24, Math.PI), woodMat);
    g.add(bow);
  } else if (weaponType === 'staff') {
    const staff = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.6), woodMat);
    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.12), new THREE.MeshBasicMaterial({ color: 0x00ffff }));
    orb.position.y = 0.8;
    g.add(staff, orb);
  } else {
    const defaultWep = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.0, 0.1), metalMat);
    g.add(defaultWep);
  }
  return g;
}

// 4. 로비 카드 및 이벤트 처리
function buildClassCards() {
  const container = $('cards-container');
  container.innerHTML = '';
  for (const [id, c] of Object.entries(CLASSES)) {
    const el = document.createElement('div');
    el.className = `card ${id === selectedCls ? 'sel' : ''}`;
    el.innerHTML = `<h4>${c.name}</h4><p>${c.desc}</p>`;
    el.onclick = () => {
      document.querySelectorAll('.card').forEach(x => x.classList.remove('sel'));
      el.classList.add('sel');
      selectedCls = id;
      updatePreviewModel(id);
    };
    container.appendChild(el);
  }
}

// 감정표현 발동
window.triggerEmote = (key) => {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify({ t: 'emote', emote: key }));
};

// 메인 프레임 애니메이션 루프
function animate() {
  requestAnimationFrame(animate);

  // 로비 프리뷰 캐릭터 회전
  if (previewMesh) previewMesh.rotation.y += 0.01;

  renderer.render(scene, camera);
  if (previewRenderer && previewScene) previewRenderer.render(previewScene, previewCamera);
}

// 서버 네트워크 연결 및 조작
$('btn-join').onclick = () => {
  const name = $('name-input').value.trim() || '기사단장';
  ws = new WebSocket(`ws://${location.host}`);
  ws.onopen = () => {
    ws.send(JSON.stringify({ t: 'join', name, cls: selectedCls }));
    $('lobby').style.display = 'none';
    $('hud').style.display = 'block';
  };
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.t === 'parry') {
      const flash = $('parry-flash');
      flash.style.opacity = '1';
      setTimeout(() => flash.style.opacity = '0', 200);
    }
  };
};

window.onload = () => {
  initEngine();
  animate();
};