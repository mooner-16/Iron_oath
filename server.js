// IRON OATH 게임 서버
// - 명중 판정, 체력, 쿨다운, 스킬, 기절, 부활은 모두 서버가 결정합니다(클라이언트 치팅 방지).
// - 이동은 클라이언트가 보내되, 서버가 속도/경계를 검사합니다.
// - 웹 서버도 이 파일 하나로 해결합니다(express 불필요).

import http from 'http';
import fs from 'fs';
import os from 'os';
import path from 'path';
import zlib from 'zlib';
import { fileURLToPath } from 'url';
import { WebSocketServer } from 'ws';
import { CLASSES, SKILLS, ARENA, PLAYER } from './classes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
const MAX_PLAYERS = Number(process.env.MAX_PLAYERS) || 16;
const MOVE_CHECK = process.env.NO_MOVE_CHECK !== '1';
const TICK_MS = 50; // 스냅샷 20Hz
const HIT_CONE = Math.cos((50 * Math.PI) / 180);
const MOVE_SLACK = 2.6; // 달리기(1.55) x 함성(1.2) x 네트워크 오차 여유

/* ───────────── 정적 파일 서버 ───────────── */
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};
const gzCache = new Map();

function sendFile(req, res, file) {
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Not found');
    }
    const ext = path.extname(file).toLowerCase();
    const headers = { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': 'no-cache' };
    const compressible = ext === '.js' || ext === '.html' || ext === '.css' || ext === '.json';
    if (compressible && /\bgzip\b/.test(req.headers['accept-encoding'] || '')) {
      const key = `${file}:${st.mtimeMs}`;
      let buf = gzCache.get(key);
      if (!buf) {
        buf = zlib.gzipSync(fs.readFileSync(file));
        gzCache.set(key, buf);
      }
      res.writeHead(200, { ...headers, 'Content-Encoding': 'gzip', 'Content-Length': buf.length, Vary: 'Accept-Encoding' });
      return res.end(buf);
    }
    res.writeHead(200, { ...headers, 'Content-Length': st.size });
    fs.createReadStream(file).pipe(res);
  });
}

const httpServer = http.createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405);
    return res.end();
  }
  let url;
  try {
    url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  } catch {
    res.writeHead(400);
    return res.end();
  }
  if (url === '/') url = '/index.html';
  if (url === '/classes.js') return sendFile(req, res, path.join(__dirname, 'classes.js'));

  let base = path.join(__dirname, 'public');
  let rel = url;
  if (url.startsWith('/three/build/')) {
    base = path.join(__dirname, 'node_modules', 'three', 'build');
    rel = url.slice('/three/build'.length);
  }
  const file = path.join(base, path.normalize(rel));
  if (!file.startsWith(base + path.sep)) {
    res.writeHead(403);
    return res.end();
  }
  sendFile(req, res, file);
});

const wss = new WebSocketServer({ server: httpServer, maxPayload: 4096 });

/* ───────────── 게임 상태 ───────────── */
const players = new Map(); // id -> player
let nextId = 1;
const now = () => Date.now();
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function send(ws, msg) {
  if (ws.readyState === 1) ws.send(JSON.stringify(msg));
}
function broadcast(msg) {
  const s = JSON.stringify(msg);
  for (const p of players.values()) if (p.ws.readyState === 1) p.ws.send(s);
}
function roster() {
  return [...players.values()].map((p) => ({
    id: p.id, name: p.name, cls: p.cls, kills: p.kills, deaths: p.deaths,
  }));
}
function spawnPoint() {
  const a = Math.random() * Math.PI * 2;
  const r = 26 + Math.random() * 8;
  const x = Math.cos(a) * r;
  const z = Math.sin(a) * r;
  return { x, y: 0, z, yaw: Math.atan2(x, z) }; // 중앙을 바라보게
}
const isStunned = (p) => p.stunUntil > now();
const dmgMult = (p) => (p.buffUntil > now() ? SKILLS.rally.dmgMult : 1);

// 밀어내기: 기둥과 경계를 넘지 않게 보정하고, 당사자에게 새 위치를 알려줌
function push(q, nx, nz, dist) {
  const lim = ARENA.half - PLAYER.radius;
  let x = q.x + nx * dist;
  let z = q.z + nz * dist;
  for (const pl of ARENA.pillars) {
    const ex = x - pl.x, ez = z - pl.z;
    const d = Math.hypot(ex, ez), min = pl.r + PLAYER.radius;
    if (d < min && d > 1e-4) { x = pl.x + (ex / d) * min; z = pl.z + (ez / d) * min; }
  }
  q.x = clamp(x, -lim, lim);
  q.z = clamp(z, -lim, lim);
  send(q.ws, { t: 'correct', x: q.x, y: q.y, z: q.z });
}

function stun(q, ms) {
  q.stunUntil = Math.max(q.stunUntil, now() + ms);
  q.blocking = false;
  broadcast({ t: 'stun', id: q.id, ms });
}

function kill(p, q) {
  q.alive = false;
  q.blocking = false;
  q.stunUntil = 0;
  q.buffUntil = 0;
  q.deaths++;
  p.kills++;
  broadcast({ t: 'kill', killer: p.id, victim: q.id });
  broadcast({ t: 'roster', list: roster() });
  setTimeout(() => respawn(q.id), PLAYER.respawnMs);
}

// 공격 판정 공통 함수 (일반 공격과 모든 스킬이 사용)
// o: { reach, cos, dmg, skill, ignoreBlock, knock, stun }
function strike(p, o) {
  if (!p.alive) return;
  const fx = -Math.sin(p.yaw);
  const fz = -Math.cos(p.yaw);

  for (const q of players.values()) {
    if (q === p || !q.alive) continue;
    const dx = q.x - p.x;
    const dz = q.z - p.z;
    const dist = Math.hypot(dx, dz);
    if (dist > o.reach + PLAYER.radius) continue;
    if (Math.abs(q.y - p.y) > 1.8) continue;
    if (o.cos > -1 && dist > 0.6 && (dx * fx + dz * fz) / dist < o.cos) continue;

    // 방어 판정: 방어 중이고, 공격자가 방어자의 정면에 있을 때
    const qc = CLASSES[q.cls];
    const tfx = -Math.sin(q.yaw);
    const tfz = -Math.cos(q.yaw);
    const facing = dist > 0.01 ? (tfx * -dx + tfz * -dz) / dist : 1;
    const blocked = !o.ignoreBlock && q.blocking && facing > 0.3;
    const dmg = Math.max(1, Math.round(o.dmg * (blocked ? 1 - qc.block : 1)));

    q.hp = Math.max(0, q.hp - dmg);
    broadcast({ t: 'hit', id: q.id, by: p.id, dmg, hp: q.hp, blocked, skill: o.skill || null });

    if (q.hp > 0) {
      if (o.knock) {
        const nx = dist > 0.01 ? dx / dist : fx;
        const nz = dist > 0.01 ? dz / dist : fz;
        push(q, nx, nz, o.knock * (blocked ? 0.4 : 1));
      }
      if (o.stun && !blocked) stun(q, o.stun);
    } else {
      kill(p, q);
    }
  }
}

function respawn(id) {
  const q = players.get(id);
  if (!q) return;
  let changed = false;
  if (q.nextCls && q.nextCls !== q.cls) {
    q.cls = q.nextCls;
    changed = true;
  }
  q.nextCls = null;
  const s = spawnPoint();
  Object.assign(q, {
    x: s.x, y: s.y, z: s.z, yaw: s.yaw, pitch: 0, hp: CLASSES[q.cls].hp,
    alive: true, blocking: false, stunUntil: 0, buffUntil: 0, dashUntil: 0, cds: {}, spawnAt: now(),
  });
  q.lastState = now();
  if (changed) broadcast({ t: 'roster', list: roster() });
  broadcast({ t: 'respawn', id: q.id, cls: q.cls, x: s.x, y: s.y, z: s.z, yaw: s.yaw, hp: q.hp });
}

function useSkill(p, slot) {
  const c = CLASSES[p.cls];
  const id = slot === 'e' ? 'kick' : c.skill;
  const def = SKILLS[id];
  if (!def) return;
  const t = now();
  if (t < (p.cds[id] || 0) - 80) return;
  p.cds[id] = t + def.cooldown * 1000;
  p.blocking = false;
  broadcast({ t: 'skill', id: p.id, skill: id });

  if (id === 'rally') {
    p.buffUntil = t + def.dur;
    broadcast({ t: 'buff', id: p.id, ms: def.dur });
    return;
  }
  if (def.dash) p.dashUntil = t + def.dash.dur * 1000 + 300;

  const reach = def.reach ?? c.reach + (def.reachAdd || 0);
  const cos = def.cone >= 360 ? -2 : Math.cos((def.cone * Math.PI) / 180);
  setTimeout(() => {
    if (!p.alive) return;
    strike(p, {
      reach, cos, skill: id,
      dmg: def.dmg ?? c.damage * def.dmgMult * dmgMult(p),
      ignoreBlock: !!def.ignoreBlock, knock: def.knock || 0, stun: def.stun || 0,
    });
  }, def.windup * 1000);
}

/* ───────────── 접속 처리 ───────────── */
wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.on('pong', () => (ws.isAlive = true));

  ws.on('message', (data) => {
    let m;
    try { m = JSON.parse(data); } catch { return; }
    if (!m || typeof m.t !== 'string') return;

    if (m.t === 'ping') return send(ws, { t: 'pong', ts: m.ts });

    if (m.t === 'join') {
      if (ws.pid) return;
      if (players.size >= MAX_PLAYERS) return send(ws, { t: 'full' });
      const id = nextId++;
      const cls = CLASSES[m.cls] ? m.cls : 'knight';
      const name = String(m.name ?? '').replace(/[<>&"'`]/g, '').trim().slice(0, PLAYER.maxNameLen) || `Knight${id}`;
      const s = spawnPoint();
      const p = {
        id, ws, name, cls, ...s, pitch: 0, hp: CLASSES[cls].hp, alive: true, blocking: false,
        kills: 0, deaths: 0, lastAttack: 0, lastState: now(),
        stunUntil: 0, buffUntil: 0, dashUntil: 0, cds: {}, spawnAt: now(), nextCls: null,
      };
      players.set(id, p);
      ws.pid = id;
      send(ws, { t: 'welcome', id, cls, x: s.x, y: s.y, z: s.z, yaw: s.yaw, hp: p.hp, roster: roster() });
      broadcast({ t: 'roster', list: roster() });
      console.log(`[+] ${name} (${cls}) 입장 — 현재 ${players.size}명`);
      return;
    }

    const p = players.get(ws.pid);
    if (!p) return;

    if (m.t === 'state') {
      if (!p.alive) return;
      const { x, y, z, yaw, pitch } = m;
      if (![x, y, z, yaw, pitch].every(Number.isFinite)) return;
      const t = now();
      const dt = Math.min((t - p.lastState) / 1000, 0.5);
      p.lastState = t;
      let maxDist = CLASSES[p.cls].speed * MOVE_SLACK * dt + 0.6;
      if (p.dashUntil > t) maxDist += 22 * dt; // 돌진 중에는 더 빠르게 허용
      if (MOVE_CHECK && Math.hypot(x - p.x, z - p.z) > maxDist) {
        return send(ws, { t: 'correct', x: p.x, y: p.y, z: p.z });
      }
      const lim = ARENA.half - PLAYER.radius;
      p.x = clamp(x, -lim, lim);
      p.z = clamp(z, -lim, lim);
      p.y = clamp(y, 0, 20);
      p.yaw = yaw;
      p.pitch = clamp(pitch, -1.6, 1.6);
      p.blocking = !!m.b && !isStunned(p);
    } else if (m.t === 'attack') {
      if (!p.alive || isStunned(p)) return;
      const c = CLASSES[p.cls];
      const t = now();
      if (t - p.lastAttack < c.cooldown * 1000 - 30) return;
      p.lastAttack = t;
      p.blocking = false;
      broadcast({ t: 'swing', id: p.id });
      setTimeout(() => {
        strike(p, { reach: c.reach, cos: HIT_CONE, dmg: Math.round(c.damage * dmgMult(p)) });
      }, c.windup * 1000);
    } else if (m.t === 'skill') {
      if (!p.alive || isStunned(p)) return;
      if (m.slot !== 'q' && m.slot !== 'e') return;
      useSkill(p, m.slot);
    } else if (m.t === 'setclass') {
      if (!CLASSES[m.cls] || m.cls === p.cls) return;
      const inGrace = p.alive && now() - p.spawnAt < PLAYER.classSwapGraceMs;
      p.nextCls = m.cls;
      if (inGrace) {
        respawn(p.id); // 막 시작한 상태라면 바로 바꿔 줌
        send(ws, { t: 'classqueued', cls: m.cls, immediate: true });
      } else {
        send(ws, { t: 'classqueued', cls: m.cls, immediate: false });
      }
    }
  });

  ws.on('close', () => {
    const p = players.get(ws.pid);
    if (!p) return;
    players.delete(p.id);
    broadcast({ t: 'roster', list: roster() });
    console.log(`[-] ${p.name} 퇴장 — 현재 ${players.size}명`);
  });
});

setInterval(() => {
  if (!players.size) return;
  broadcast({
    t: 'snap',
    p: [...players.values()].map((p) => ({
      id: p.id,
      x: +p.x.toFixed(3), y: +p.y.toFixed(3), z: +p.z.toFixed(3),
      yaw: +p.yaw.toFixed(3), pitch: +p.pitch.toFixed(3),
      b: p.blocking, hp: p.hp, alive: p.alive,
    })),
  });
}, TICK_MS);

setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) { ws.terminate(); continue; }
    ws.isAlive = false;
    ws.ping();
  }
}, 15000);

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log('\n⚔  IRON OATH 서버가 열렸습니다!');
  console.log(`   이 컴퓨터:        http://localhost:${PORT}`);
  for (const list of Object.values(os.networkInterfaces())) {
    for (const i of list ?? []) {
      if (i.family === 'IPv4' && !i.internal) console.log(`   같은 와이파이/LAN: http://${i.address}:${PORT}`);
    }
  }
  console.log(`   최대 인원: ${MAX_PLAYERS}명\n`);
});
