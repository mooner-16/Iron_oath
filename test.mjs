// 서버 통합 테스트: 일반 공격 / 방어 / 처치 / 부활 / 스킬 / 기절 / 넉백 / 버프 / 직업 변경 / 정적 파일
process.env.PORT = '3111';
process.env.NO_MOVE_CHECK = '1'; // 테스트에서는 순간이동 허용
await import('./server.js');
const { default: WebSocket } = await import('ws');
const http = await import('http');
import { CLASSES, SKILLS } from './classes.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(log, pred, ms = 2000) {
  const t = Date.now();
  while (Date.now() - t < ms) {
    const m = log.find(pred);
    if (m) return m;
    await sleep(20);
  }
  throw new Error('timeout');
}
function assert(cond, msg) {
  if (!cond) { console.error('FAIL:', msg); process.exit(1); }
  console.log('ok  ', msg);
}
const near = (a, b, e = 0.02) => Math.abs(a - b) <= e;

async function open(cls, name) {
  const ws = new WebSocket('ws://localhost:3111');
  const log = [];
  ws.on('message', (d) => log.push(JSON.parse(d)));
  await new Promise((r) => ws.on('open', r));
  ws.send(JSON.stringify({ t: 'join', cls, name }));
  const w = await waitFor(log, (m) => m.t === 'welcome');
  const place = (x, z, yaw, b = false) => ws.send(JSON.stringify({ t: 'state', x, y: 0, z, yaw, pitch: 0, b }));
  const send = (o) => ws.send(JSON.stringify(o));
  return {
    ws, log, id: w.id, place, send,
    attack: () => send({ t: 'attack' }),
    skill: (slot) => send({ t: 'skill', slot }),
  };
}
const hitsOn = (log, id) => log.filter((m) => m.t === 'hit' && m.id === id);

/* ───── 정적 파일 ───── */
function get(path) {
  return new Promise((resolve, reject) => {
    http.get({ host: 'localhost', port: 3111, path }, (res) => {
      let body = '';
      res.on('data', (d) => (body += d));
      res.on('end', () => resolve({ status: res.statusCode, type: res.headers['content-type'], body }));
    }).on('error', reject);
  });
}
let r = await get('/');
assert(r.status === 200 && r.type.startsWith('text/html') && r.body.includes('IRON OATH'), '메인 페이지(/) 제공');
r = await get('/classes.js');
assert(r.status === 200 && r.body.includes('SKILLS'), '/classes.js 제공');
r = await get('/%2e%2e/server.js');
assert(!r.body.includes('WebSocketServer'), '경로 탈출(../) 차단');
r = await get('/nothing.xyz');
assert(r.status === 404, '없는 파일은 404');

/* ───── 기본 전투 ───── */
const A = await open('duelist', 'Alice');
const B = await open('knight', 'Bob');
const dmgA = CLASSES.duelist.damage;

A.place(0, 0, 0);               // 앞쪽 = -z
B.place(0, -2, Math.PI);
await sleep(120);
B.log.length = 0;
A.attack();
let hit = await waitFor(B.log, (m) => m.t === 'hit' && m.id === B.id);
assert(hit.dmg === dmgA && hit.hp === 100 - dmgA && !hit.blocked, `정면 명중 (피해 ${hit.dmg}, 남은 체력 ${hit.hp})`);

B.place(0, -6, Math.PI);
await sleep(500);
B.log.length = 0;
A.attack();
await sleep(400);
assert(!B.log.some((m) => m.t === 'hit'), '사거리 밖에서는 명중하지 않음');

B.place(0, -2, Math.PI);
A.place(0, 0, Math.PI); // 반대쪽을 봄
await sleep(500);
B.log.length = 0;
A.attack();
await sleep(400);
assert(!B.log.some((m) => m.t === 'hit'), '공격 방향 밖에서는 명중하지 않음');

A.place(0, 0, 0);
B.place(0, -2, Math.PI, true);
await sleep(500);
B.log.length = 0;
A.attack();
hit = await waitFor(B.log, (m) => m.t === 'hit' && m.id === B.id);
const expect = Math.max(1, Math.round(dmgA * (1 - CLASSES.knight.block)));
assert(hit.blocked && hit.dmg === expect, `방어 시 피해 감소 (${dmgA} → ${hit.dmg})`);

B.place(0, -2, Math.PI, false);
await sleep(500);
B.log.length = 0;
A.attack(); A.attack(); A.attack();
await sleep(300);
assert(hitsOn(B.log, B.id).length === 1, '쿨다운 중 연타는 1회만 인정');

B.log.length = 0;
let kill;
for (let i = 0; i < 20 && !kill; i++) {
  await sleep(430);
  A.attack();
  kill = B.log.find((m) => m.t === 'kill');
}
assert(kill && kill.killer === A.id && kill.victim === B.id, '처치 이벤트 발생');
const rs = await waitFor(B.log, (m) => m.t === 'respawn' && m.id === B.id, 4000);
assert(rs.hp === CLASSES.knight.hp && rs.cls === 'knight', `부활 후 체력 ${rs.hp}`);
const ro = [...B.log].reverse().find((m) => m.t === 'roster');
assert(ro.list.find((p) => p.id === A.id).kills === 1, '점수판 처치 수 반영');

/* ───── 발차기: 방어 무시 + 기절 + 넉백 + 쿨다운 ───── */
{
  const C = await open('knight', 'Cain');
  const D = await open('shield', 'Dora');
  C.place(20, 20, 0);
  D.place(20, 18, Math.PI, true); // 방어 중
  await sleep(300);
  D.log.length = 0;
  C.skill('e');
  const h = await waitFor(D.log, (m) => m.t === 'hit' && m.id === D.id);
  assert(h.skill === 'kick' && !h.blocked && h.dmg === SKILLS.kick.dmg, `발차기는 방어를 무시 (피해 ${h.dmg})`);
  const st = await waitFor(D.log, (m) => m.t === 'stun' && m.id === D.id);
  assert(st.ms === SKILLS.kick.stun, `발차기로 기절 ${st.ms}ms`);
  const cor = await waitFor(D.log, (m) => m.t === 'correct');
  assert(near(cor.z, 18 - SKILLS.kick.knock), `발차기 넉백: z 18 → ${cor.z.toFixed(2)}`);

  D.log.length = 0;
  C.skill('e');
  await sleep(400);
  assert(hitsOn(D.log, D.id).length === 0, '스킬 쿨다운 중 재사용은 무시');

  // 사거리 밖 스킬은 아무에게도 맞지 않음
  const E0 = await open('knight', 'Eve');
  E0.place(20, 30, 0);
  await sleep(300);
  E0.log.length = 0;
  E0.skill('e');
  await sleep(400);
  assert(!E0.log.some((m) => m.t === 'hit'), '사거리 밖 스킬은 아무에게도 맞지 않음');
  E0.ws.close(); C.ws.close(); D.ws.close();
}
// 기절 중에는 공격 불가
{
  const F = await open('knight', 'Finn');
  const G = await open('knight', 'Gus');
  F.place(-20, -20, 0);
  G.place(-20, -22, Math.PI);
  await sleep(300);
  F.skill('e');
  await waitFor(G.log, (m) => m.t === 'stun' && m.id === G.id);
  G.log.length = 0; F.log.length = 0;
  G.place(-20, -21.2, Math.PI);
  G.attack(); // 기절 중이라 무시되어야 함
  await sleep(500);
  assert(!F.log.some((m) => m.t === 'swing' && m.id === G.id), '기절한 기사는 공격할 수 없음');
  F.ws.close(); G.ws.close();
}

/* ───── 전투 함성(버프) ───── */
{
  const H = await open('knight', 'Hal');
  const I = await open('duelist', 'Ivy');
  H.place(-20, 20, 0);
  I.place(-20, 18, Math.PI);
  await sleep(300);
  I.log.length = 0;
  H.skill('q');
  const bf = await waitFor(I.log, (m) => m.t === 'buff' && m.id === H.id);
  assert(bf.ms === SKILLS.rally.dur, `전투 함성 버프 ${bf.ms}ms`);
  H.attack();
  const h = await waitFor(I.log, (m) => m.t === 'hit' && m.id === I.id);
  const want = Math.round(CLASSES.knight.damage * SKILLS.rally.dmgMult);
  assert(h.dmg === want, `버프 중 공격력 증가 (${CLASSES.knight.damage} → ${h.dmg})`);
  H.ws.close(); I.ws.close();
}

/* ───── 방패 밀치기 ───── */
{
  const J = await open('shield', 'Jin');
  const K = await open('knight', 'Kay');
  J.place(10, -30, 0);
  K.place(10, -32, Math.PI, true); // 방어 중이어도 밀치기는 통함
  await sleep(300);
  K.log.length = 0;
  J.skill('q');
  const h = await waitFor(K.log, (m) => m.t === 'hit' && m.id === K.id);
  assert(h.skill === 'bash' && !h.blocked && h.dmg === Math.round(CLASSES.shield.damage * SKILLS.bash.dmgMult), `방패 밀치기 피해 ${h.dmg}`);
  const st = await waitFor(K.log, (m) => m.t === 'stun');
  assert(st.ms === SKILLS.bash.stun, `방패 밀치기 기절 ${st.ms}ms`);
  const cor = await waitFor(K.log, (m) => m.t === 'correct');
  assert(near(cor.z, -32 - SKILLS.bash.knock), `방패 밀치기 넉백 z -32 → ${cor.z.toFixed(2)}`);
  J.ws.close(); K.ws.close();
}

/* ───── 쇄도(돌진 베기) ───── */
{
  const L = await open('duelist', 'Lia');
  const M = await open('knight', 'Max');
  L.place(-30, 0, 0);
  M.place(-30, -2.6, Math.PI);
  await sleep(300);
  M.log.length = 0;
  L.skill('q');
  const h = await waitFor(M.log, (m) => m.t === 'hit' && m.id === M.id);
  assert(h.skill === 'lunge' && h.dmg === Math.round(CLASSES.duelist.damage * SKILLS.lunge.dmgMult), `쇄도 피해 ${h.dmg}`);
  L.ws.close(); M.ws.close();
}

/* ───── 회전 베기(전방위) ───── */
{
  const N = await open('greatsword', 'Nox');
  const O = await open('knight', 'Opal');
  const P = await open('knight', 'Pax');
  N.place(30, 0, 0);
  O.place(30, -3, Math.PI);  // 앞
  P.place(30, 3, 0);         // 뒤 (일반 공격으로는 못 맞는 위치)
  await sleep(300);
  O.log.length = 0; P.log.length = 0;
  N.skill('q');
  const a = await waitFor(O.log, (m) => m.t === 'hit' && m.id === O.id);
  const b = await waitFor(P.log, (m) => m.t === 'hit' && m.id === P.id);
  const want = Math.round(CLASSES.greatsword.damage * SKILLS.spin.dmgMult);
  assert(a.dmg === want && b.dmg === want, `회전 베기는 앞뒤 모두 명중 (${a.dmg}, ${b.dmg})`);
  N.ws.close(); O.ws.close(); P.ws.close();
}

/* ───── 직업 변경 / 핑 ───── */
{
  const Q = await open('knight', 'Quin');
  Q.log.length = 0;
  Q.send({ t: 'setclass', cls: 'shield' });
  const q = await waitFor(Q.log, (m) => m.t === 'classqueued');
  assert(q.immediate === true, '입장 직후에는 기사를 바로 바꿀 수 있음');
  const rsp = await waitFor(Q.log, (m) => m.t === 'respawn' && m.id === Q.id);
  assert(rsp.cls === 'shield' && rsp.hp === CLASSES.shield.hp, `직업 변경 반영 (체력 ${rsp.hp})`);
  const rr = [...Q.log].reverse().find((m) => m.t === 'roster');
  assert(rr.list.find((p) => p.id === Q.id).cls === 'shield', '명단에도 새 직업 반영');
  Q.send({ t: 'ping', ts: 1234 });
  const pong = await waitFor(Q.log, (m) => m.t === 'pong');
  assert(pong.ts === 1234, '핑/퐁 응답');
  Q.ws.close();
}

console.log('\n모든 테스트 통과');
process.exit(0);
