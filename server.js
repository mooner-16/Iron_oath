// server.js — 팀전 승리 로직, 패링/반격, 투사체, 채팅 & 감정표현 서버
import http from 'http';
import fs from 'fs';
import os from 'os';
import path from 'path';
import zlib from 'zlib';
import { fileURLToPath } from 'url';
import { WebSocketServer } from 'ws';
import { CLASSES, SKILLS, ARENA, PLAYER, GAME_MODES, BASIC_KICK } from './classes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
const MAX_PLAYERS = Number(process.env.MAX_PLAYERS) || 16;
const TICK_MS = 40; // 25Hz 스냅샷

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
};

const httpServer = http.createServer((req, res) => {
  let url = req.url === '/' ? '/index.html' : req.url;
  if (url === '/classes.js') url = '/classes.js';
  const file = path.join(__dirname, url.startsWith('/three') ? 'node_modules' + url : (url === '/classes.js' ? '.' : 'public') + url);
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
});

const wss = new WebSocketServer({ server: httpServer });
const players = new Map();
const projectiles = [];
let nextId = 1;
let currentMode = 'tdm'; // 기본 팀 데스매치
let teamScores = { red: 0, blue: 0 };
let matchWinner = null;
const now = () => Date.now();
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function broadcast(msg) {
  const s = JSON.stringify(msg);
  for (const p of players.values()) if (p.ws.readyState === 1) p.ws.send(s);
}
function roster() {
  return [...players.values()].map((p) => ({
    id: p.id, name: p.name, cls: p.cls, team: p.team, kills: p.kills, deaths: p.deaths,
  }));
}

function spawnPoint(team) {
  let x = (Math.random() - 0.5) * 30;
  let z = (Math.random() - 0.5) * 30;
  if (currentMode === 'tdm') {
    z = team === 'red' ? -30 + Math.random() * 8 : 30 - Math.random() * 8;
  }
  return { x, y: 0, z, yaw: team === 'red' ? 0 : Math.PI };
}

function resetMatch() {
  teamScores = { red: 0, blue: 0 };
  matchWinner = null;
  for (const p of players.values()) { p.kills = 0; p.deaths = 0; respawn(p.id); }
  broadcast({ t: 'match_start', mode: currentMode, scores: teamScores });
}

function kill(p, q) {
  q.alive = false; q.blocking = false; q.stunUntil = 0; q.deaths++;
  p.kills++;
  if (currentMode === 'tdm') {
    teamScores[p.team] = (teamScores[p.team] || 0) + 1;
    if (teamScores[p.team] >= GAME_MODES.tdm.targetKills && !matchWinner) {
      matchWinner = p.team;
      broadcast({ t: 'match_win', winner: matchWinner, scores: teamScores });
      setTimeout(resetMatch, 7000);
    }
  }
  broadcast({ t: 'kill', killer: p.id, victim: q.id, scores: teamScores });
  broadcast({ t: 'roster', list: roster() });
  setTimeout(() => respawn(q.id), PLAYER.respawnMs);
}

function respawn(id) {
  const q = players.get(id);
  if (!q) return;
  if (q.nextCls) { q.cls = q.nextCls; q.nextCls = null; }
  const s = spawnPoint(q.team);
  Object.assign(q, {
    x: s.x, y: s.y, z: s.z, yaw: s.yaw, pitch: 0, hp: CLASSES[q.cls].hp,
    alive: true, blocking: false, blockStartTime: 0, stunUntil: 0, counterBuff: false,
  });
  broadcast({ t: 'respawn', id: q.id, cls: q.cls, x: s.x, y: s.y, z: s.z, yaw: s.yaw, hp: q.hp });
}

// 근접 공격 & 패링(Parry) 판정
function strike(p, o) {
  if (!p.alive) return;
  const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw);
  for (const q of players.values()) {
    if (q === p || !q.alive) continue;
    if (currentMode === 'tdm' && q.team === p.team) continue; // 아군 오사 방지
    const dx = q.x - p.x, dz = q.z - p.z, dist = Math.hypot(dx, dz);
    if (dist > o.reach + PLAYER.radius || Math.abs(q.y - p.y) > 2.0) continue;
    if (o.cos > -1 && dist > 0.5 && (dx * fx + dz * fz) / dist < o.cos) continue;

    const tfx = -Math.sin(q.yaw), tfz = -Math.cos(q.yaw);
    const facing = dist > 0.01 ? (tfx * -dx + tfz * -dz) / dist : 1;
    const isBlocking = q.blocking && facing > 0.25;

    // 패링 판정: 방어 누른 후 0.28초 이내 명중 시 PERFECT PARRY!
    if (!o.ignoreBlock && isBlocking && now() - q.blockStartTime <= PLAYER.parryWindowMs) {
      p.stunUntil = now() + 1000; // 공격자 1초 기절
      q.counterBuff = true;       // 피공격자 반격 버프 (다음 공격 1.5배)
      broadcast({ t: 'parry', defender: q.id, attacker: p.id });
      return;
    }

    let dmg = Math.max(1, Math.round(o.dmg * (isBlocking && !o.ignoreBlock ? 1 - CLASSES[q.cls].block : 1)));
    if (p.counterBuff) { dmg = Math.round(dmg * 1.5); p.counterBuff = false; }

    q.hp = Math.max(0, q.hp - dmg);
    broadcast({ t: 'hit', id: q.id, by: p.id, dmg, hp: q.hp, blocked: isBlocking && !o.ignoreBlock });
    if (q.hp <= 0) kill(p, q);
  }
}

wss.on('connection', (ws) => {
  ws.on('message', (data) => {
    let m; try { m = JSON.parse(data); } catch { return; }
    if (m.t === 'join') {
      const id = nextId++;
      const cls = CLASSES[m.cls] ? m.cls : 'knight';
      const team = m.team || (players.size % 2 === 0 ? 'red' : 'blue');
      const s = spawnPoint(team);
      const p = {
        id, ws, name: m.name || `Knight${id}`, cls, team, ...s, pitch: 0,
        hp: CLASSES[cls].hp, alive: true, blocking: false, blockStartTime: 0,
        kills: 0, deaths: 0, stunUntil: 0, counterBuff: false, cds: {},
      };
      players.set(id, p); ws.pid = id;
      ws.send(JSON.stringify({ t: 'welcome', id, cls, team, ...s, hp: p.hp, roster: roster(), scores: teamScores, mode: currentMode }));
      broadcast({ t: 'roster', list: roster() });
      return;
    }

    const p = players.get(ws.pid);
    if (!p || !p.alive) return;

    if (m.t === 'state') {
      p.x = m.x; p.y = m.y; p.z = m.z; p.yaw = m.yaw; p.pitch = m.pitch;
      if (m.b && !p.blocking) p.blockStartTime = now(); // 방어 시작 시각 저장
      p.blocking = m.b && p.stunUntil < now();
    } else if (m.t === 'attack') {
      if (p.stunUntil > now()) return;
      const c = CLASSES[p.cls];
      broadcast({ t: 'swing', id: p.id });
      setTimeout(() => strike(p, { reach: c.reach, cos: Math.cos((50 * Math.PI) / 180), dmg: c.damage }), c.windup * 1000);
    } else if (m.t === 'kick') { // 쿨타임 없는 기본 발차기
      if (p.stunUntil > now()) return;
      broadcast({ t: 'kick_anim', id: p.id });
      setTimeout(() => strike(p, { reach: BASIC_KICK.reach, cos: Math.cos((45 * Math.PI) / 180), dmg: BASIC_KICK.dmg, ignoreBlock: true }), BASIC_KICK.windup * 1000);
    } else if (m.t === 'chat') {
      broadcast({ t: 'chat', id: p.id, name: p.name, team: p.team, text: String(m.text).slice(0, 60) });
    } else if (m.t === 'emote') {
      broadcast({ t: 'emote', id: p.id, emote: m.emote });
    } else if (m.t === 'setclass') {
      p.nextCls = m.cls;
    }
  });

  ws.on('close', () => {
    if (ws.pid) { players.delete(ws.pid); broadcast({ t: 'roster', list: roster() }); }
  });
});

setInterval(() => {
  broadcast({
    t: 'snap',
    p: [...players.values()].map((p) => ({
      id: p.id, x: +p.x.toFixed(2), y: +p.y.toFixed(2), z: +p.z.toFixed(2),
      yaw: +p.yaw.toFixed(2), pitch: +p.pitch.toFixed(2), b: p.blocking, hp: p.hp, alive: p.alive,
    })),
  });
}, TICK_MS);

httpServer.listen(PORT, () => console.log(`⚔️ IRON OATH 중세 대전 서버 실행 중 (포트 ${PORT})`));