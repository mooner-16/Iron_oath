// classes.js — 20종 판타지 직업, 매치 모드, 패링, 맵 설정
export const GAME_MODES = {
  ffa: { id: 'ffa', name: '개인전 (Free For All)', targetKills: 20 },
  tdm: { id: 'tdm', name: '팀 데스매치 (Red vs Blue)', targetKills: 30 },
};

export const ARENA = {
  half: 45,
  fountain: { x: 0, z: 0, r: 3.5 },
  // 복잡한 중세 마을 건물 및 구조물 배치
  buildings: [
    { x: -16, z: -16, w: 8, d: 10, h: 6, type: 'house' },
    { x: 16, z: -16, w: 9, d: 8, h: 6, type: 'house' },
    { x: -18, z: 14, w: 10, d: 8, h: 7, type: 'house' },
    { x: 18, z: 16, w: 8, d: 9, h: 6, type: 'house' },
    { x: 0, z: -28, w: 14, d: 6, h: 8, type: 'hall' },
    { x: -28, z: 0, w: 6, d: 12, h: 6, type: 'shop' },
    { x: 28, z: 0, w: 6, d: 12, h: 6, type: 'shop' },
  ],
  stalls: [
    { x: -8, z: -6, w: 3, d: 2 }, { x: 8, z: -6, w: 3, d: 2 },
    { x: -8, z: 6, w: 3, d: 2 }, { x: 8, z: 6, w: 3, d: 2 },
  ],
  towers: [
    { x: -38, z: -38, r: 3 }, { x: 38, z: -38, r: 3 },
    { x: -38, z: 38, r: 3 }, { x: 38, z: 38, r: 3 },
  ],
};

export const PLAYER = {
  radius: 0.5,
  eye: 1.62,
  gravity: 22,
  jump: 7.5,
  respawnMs: 3000,
  maxNameLen: 16,
  sprintMult: 1.55,
  staminaMax: 100,
  staminaDrain: 22,
  staminaRegen: 20,
  staminaMin: 20,
  parryWindowMs: 280, // 패링 타이밍 창(0.28초)
  classSwapGraceMs: 8000,
};

// 공용 기본 발차기 (쿨타임 제거, 스태미나 12 소모)
export const BASIC_KICK = {
  id: 'kick', name: '발차기', icon: '🦶',
  staminaCost: 12, windup: 0.12, reach: 2.1, dmg: 8, knock: 3.0, stun: 400, ignoreBlock: true,
};

// 감정 표현 정의
export const EMOTES = {
  '1': { id: 'dance', name: '춤추기', icon: '💃', text: '🎵 댄스 타임!' },
  '2': { id: 'taunt', name: '도발', icon: '😈', text: '🔥 덤벼라!' },
  '3': { id: 'salute', name: '경례', icon: '🫡', text: '🛡️ 기사의 예의' },
  '4': { id: 'cheer', name: '환호', icon: '🎉', text: '🙌 승리를 위하여!' },
};

// 20종 스킬 정의
export const SKILLS = {
  rally:     { id: 'rally', name: '전투 함성', icon: '📣', cooldown: 12, dur: 5000, dmgMult: 1.3, speedMult: 1.25, desc: '5초간 공격력+30%, 이동속도+25%' },
  spin:      { id: 'spin', name: '회전 베기', icon: '🌀', cooldown: 8, windup: 0.25, reachAdd: 0.8, cone: 360, dmgMult: 1.1, knock: 3.0, desc: '주변 전방위 회전 베기' },
  lunge:     { id: 'lunge', name: '쇄도', icon: '⚡', cooldown: 6, windup: 0.2, reachAdd: 0.6, cone: 60, dmgMult: 1.35, dash: { speed: 18, dur: 0.25 }, desc: '전방 고속 돌진 베기' },
  bash:      { id: 'bash', name: '방패 강타', icon: '🛡️', cooldown: 9, windup: 0.2, reach: 2.6, cone: 70, dmgMult: 0.6, knock: 4.0, stun: 1200, ignoreBlock: true, desc: '방어 무시 밀치기 & 1.2초 기절' },
  arcane:    { id: 'arcane', name: '비전 폭발', icon: '🔮', cooldown: 7, windup: 0.3, projectile: { speed: 22, radius: 0.8, dmg: 45, color: 0x9b51e0 }, desc: '구체 형태의 비전 마법 탄환 발사' },
  fireball:  { id: 'fireball', name: '화염구', icon: '🔥', cooldown: 8, windup: 0.35, projectile: { speed: 20, radius: 1.2, dmg: 55, splash: 3.5, color: 0xff4500 }, desc: '범위 폭발을 일으키는 화염구 발사' },
  frost:     { id: 'frost', name: '얼음 송곳', icon: '❄️', cooldown: 6, windup: 0.25, projectile: { speed: 24, radius: 0.6, dmg: 35, slow: 0.5, color: 0x00bfff }, desc: '적을 둔화시키는 얼음 송곳 발사' },
  darkness:  { id: 'darkness', name: '영혼 흡수', icon: '💀', cooldown: 10, windup: 0.3, projectile: { speed: 18, radius: 0.9, dmg: 40, drainRatio: 0.5, color: 0x4b0082 }, desc: '피해량의 50%만큼 체력 회복' },
  snipe:     { id: 'snipe', name: '저격 화살', icon: '🎯', cooldown: 7, windup: 0.4, projectile: { speed: 38, radius: 0.3, dmg: 65, color: 0xffffff }, desc: '고속 고위력 관통 화살 발사' },
  tripleshot:{ id: 'tripleshot', name: '삼연사', icon: '🏹', cooldown: 6, windup: 0.2, triple: true, desc: '3연속 쾌속 화살 발사' },
  shadowstep:{ id: 'shadowstep', name: '그림자 걸음', icon: '👤', cooldown: 8, stealth: 3000, speedMult: 1.4, desc: '3초간 은신 및 이동속도 +40%' },
  ambush:    { id: 'ambush', name: '치명적 암습', icon: '🗡️', cooldown: 9, windup: 0.15, reachAdd: 0.5, cone: 40, dmgMult: 2.2, desc: '단일 대상 극대미지 베기' },
  holyheal:  { id: 'holyheal', name: '신성한 빛', icon: '✨', cooldown: 12, healSelf: 40, healAoe: 25, r: 6, desc: '자신과 주변 아군 체력 회복' },
  palm:      { id: 'palm', name: '장풍 강타', icon: '✋', cooldown: 5, windup: 0.15, reach: 3.0, cone: 80, dmgMult: 1.0, knock: 5.0, stun: 600, desc: '충격파로 적을 멀리 밀쳐냄' },
  pierce:    { id: 'pierce', name: '용의 찌르기', icon: '🔱', cooldown: 7, windup: 0.25, reachAdd: 1.4, cone: 40, dmgMult: 1.4, ignoreBlock: true, desc: '가드를 뚫는 긴 사거리 찌르기' },
  rage:      { id: 'rage', name: '광란', icon: '😡', cooldown: 14, dur: 6000, dmgMult: 1.4, speedMult: 1.3, desc: '6초간 공속/이동속도/공격력 대폭 상승' },
  song:      { id: 'song', name: '용기의 찬가', icon: '🎶', cooldown: 13, dur: 6000, teamBuff: { dmg: 1.2, speed: 1.2 }, desc: '6초간 주변 아군 공격/속도 증폭' },
  cleave:    { id: 'cleave', name: '단두대 베기', icon: '🪓', cooldown: 8, windup: 0.35, reachAdd: 0.6, cone: 110, dmgMult: 1.6, desc: '전방의 적들을 한꺼번에 절단' },
  leap:      { id: 'leap', name: '용의 도약', icon: '🐉', cooldown: 9, windup: 0.1, leap: { dist: 10, height: 4 }, dmgMult: 1.3, knock: 3.0, desc: '높이 뛰어올라 찍어내리기' },
  wall:      { id: 'wall', name: '절대 방어', icon: '🏰', cooldown: 15, dur: 4000, blockAll: true, desc: '4초간 피해 90% 감소 및 무적에 가까운 가드' },
};

// 20종 전체 직업 능력치 및 테마
export const CLASSES = {
  knight:     { id: 'knight', name: '기사', desc: '정통 롱소드 검술의 수호자', type: 'melee', hp: 100, speed: 5.2, damage: 24, cooldown: 0.65, reach: 2.6, windup: 0.16, block: 0.65, skill: 'rally', color: 0x4a6fa5, weapon: 'longsword' },
  greatsword: { id: 'greatsword', name: '대검 전사', desc: '묵직한 한 방의 광전사', type: 'melee', hp: 125, speed: 4.2, damage: 42, cooldown: 1.15, reach: 3.3, windup: 0.32, block: 0.45, skill: 'spin', color: 0x8b2f2f, weapon: 'greatsword' },
  duelist:    { id: 'duelist', name: '결투가', desc: '레이피어의 신속한 찌르기', type: 'melee', hp: 85, speed: 6.5, damage: 15, cooldown: 0.35, reach: 2.4, windup: 0.09, block: 0.35, skill: 'lunge', color: 0x3f8f5a, weapon: 'rapier' },
  shield:     { id: 'shield', name: '방패 기사', desc: '철벽의 방어와 철퇴', type: 'melee', hp: 150, speed: 3.9, damage: 19, cooldown: 0.80, reach: 2.3, windup: 0.18, block: 0.85, skill: 'bash', color: 0xb08d2a, weapon: 'mace_shield' },
  archmage:   { id: 'archmage', name: '대마법사', desc: '강력한 비전 마법 주문', type: 'ranged_magic', hp: 75, speed: 4.8, damage: 28, cooldown: 0.75, reach: 18.0, windup: 0.25, block: 0.25, skill: 'arcane', color: 0x8a2be2, weapon: 'staff' },
  pyromancer: { id: 'pyromancer', name: '화염술사', desc: '모든 것을 태우는 화염', type: 'ranged_magic', hp: 80, speed: 4.9, damage: 32, cooldown: 0.85, reach: 16.0, windup: 0.28, block: 0.20, skill: 'fireball', color: 0xd32f2f, weapon: 'staff' },
  frostmage:  { id: 'frostmage', name: '빙결 마법사', desc: '적을 얼리는 냉기 제어', type: 'ranged_magic', hp: 85, speed: 5.0, damage: 22, cooldown: 0.60, reach: 17.0, windup: 0.20, block: 0.30, skill: 'frost', color: 0x0288d1, weapon: 'staff' },
  warlock:    { id: 'warlock', name: '암흑 주술사', desc: '생명력을 앗아가는 흑마법', type: 'ranged_magic', hp: 90, speed: 4.7, damage: 25, cooldown: 0.70, reach: 15.0, windup: 0.22, block: 0.35, skill: 'darkness', color: 0x4a148c, weapon: 'wand' },
  archer:     { id: 'archer', name: '궁수', desc: '장궁의 원거리 저격수', type: 'ranged_bow', hp: 80, speed: 5.6, damage: 30, cooldown: 0.85, reach: 25.0, windup: 0.25, block: 0.25, skill: 'snipe', color: 0x2e7d32, weapon: 'bow' },
  ranger:     { id: 'ranger', name: '레인저', desc: '신속한 단궁과 단검 속사', type: 'ranged_bow', hp: 90, speed: 6.2, damage: 20, cooldown: 0.45, reach: 18.0, windup: 0.12, block: 0.40, skill: 'tripleshot', color: 0x558b2f, weapon: 'bow' },
  rogue:      { id: 'rogue', name: '도적', desc: '쌍단검의 은밀한 은신 암살', type: 'melee', hp: 80, speed: 6.8, damage: 18, cooldown: 0.32, reach: 2.0, windup: 0.08, block: 0.30, skill: 'shadowstep', color: 0x37474f, weapon: 'daggers' },
  assassin:   { id: 'assassin', name: '암살자', desc: '치명적인 독단검 카타르', type: 'melee', hp: 75, speed: 7.0, damage: 24, cooldown: 0.38, reach: 2.1, windup: 0.08, block: 0.25, skill: 'ambush', color: 0x212121, weapon: 'katar' },
  cleric:     { id: 'cleric', name: '성기사', desc: '아군 치유와 망치 세례', type: 'melee', hp: 110, speed: 4.8, damage: 22, cooldown: 0.75, reach: 2.4, windup: 0.20, block: 0.60, skill: 'holyheal', color: 0xfbc02d, weapon: 'hammer' },
  monk:       { id: 'monk', name: '수도사', desc: '권법과 봉술의 권투사', type: 'melee', hp: 105, speed: 6.3, damage: 17, cooldown: 0.30, reach: 2.4, windup: 0.08, block: 0.50, skill: 'palm', color: 0xe65100, weapon: 'quarterstaff' },
  spearman:   { id: 'spearman', name: '장창병', desc: '가장 긴 사거리의 장창 지원', type: 'melee', hp: 100, speed: 5.4, damage: 26, cooldown: 0.70, reach: 3.8, windup: 0.22, block: 0.45, skill: 'pierce', color: 0x00695c, weapon: 'spear' },
  barbarian:  { id: 'barbarian', name: '야만 전사', desc: '쌍도끼의 야성적 난무', type: 'melee', hp: 130, speed: 5.5, damage: 36, cooldown: 0.60, reach: 2.4, windup: 0.18, block: 0.20, skill: 'rage', color: 0xbf360c, weapon: 'axes' },
  bard:       { id: 'bard', name: '음유시인', desc: '아군 버프와 레이피어 지원', type: 'melee', hp: 85, speed: 6.0, damage: 16, cooldown: 0.42, reach: 2.3, windup: 0.12, block: 0.40, skill: 'song', color: 0x8e24aa, weapon: 'lute' },
  sentinel:   { id: 'sentinel', name: '센티널', desc: '미늘창(Halberd)의 광범위 제어', type: 'melee', hp: 115, speed: 4.6, damage: 34, cooldown: 0.90, reach: 3.5, windup: 0.28, block: 0.55, skill: 'cleave', color: 0x455a64, weapon: 'halberd' },
  dragoon:    { id: 'dragoon', name: '용기사', desc: '공중 강하 충격의 도약창', type: 'melee', hp: 110, speed: 5.7, damage: 29, cooldown: 0.72, reach: 3.2, windup: 0.20, block: 0.50, skill: 'leap', color: 0x1565c0, weapon: 'spear' },
  guardian:   { id: 'guardian', name: '수호 기사', desc: '타워실드의 절대 방벽', type: 'melee', hp: 160, speed: 3.6, damage: 18, cooldown: 0.85, reach: 2.4, windup: 0.20, block: 0.90, skill: 'wall', color: 0x37474f, weapon: 'towershield' },
};