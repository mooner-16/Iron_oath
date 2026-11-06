// 서버와 클라이언트가 함께 쓰는 설정 파일입니다.
// 기사(클래스)·스킬을 추가하거나 능력치를 바꾸려면 여기만 고치면 됩니다.

export const ARENA = {
  half: 40, // 경기장 한 변의 절반 (80 x 80)
  pillars: [
    { x: -12, z: -12, r: 1.6 },
    { x: 12, z: -12, r: 1.6 },
    { x: -12, z: 12, r: 1.6 },
    { x: 12, z: 12, r: 1.6 },
    { x: 0, z: 0, r: 2.2 },
    { x: -24, z: 0, r: 1.4 },
    { x: 24, z: 0, r: 1.4 },
    { x: 0, z: -24, r: 1.4 },
    { x: 0, z: 24, r: 1.4 },
  ],
};

export const PLAYER = {
  radius: 0.5,
  eye: 1.62, // 마인크래프트 비율(키 1.8m)의 눈높이
  gravity: 22,
  jump: 7.5,
  respawnMs: 3000,
  maxNameLen: 16,
  // 달리기 (Shift)
  sprintMult: 1.55, // 달릴 때 속도 배율
  staminaMax: 100,
  staminaDrain: 24, // 달리는 동안 초당 소모
  staminaRegen: 18, // 쉬는 동안 초당 회복
  staminaMin: 20, // 바닥까지 쓰면 이 값까지 차야 다시 달릴 수 있음
  classSwapGraceMs: 8000, // 부활/입장 직후 이 시간 안에는 기사를 바로 바꿀 수 있음
};

// 스킬 정의
// cooldown: 재사용 대기(초) / windup: 발동 후 타격까지(초) / reach: 사거리(m) / cone: 타격 각도(도, 360=전방위)
// dmgMult: 기사 공격력 배율 (dmg가 있으면 고정 피해) / knock: 밀치는 거리(m) / stun: 기절(ms) / ignoreBlock: 방어 무시
export const SKILLS = {
  rally: {
    id: 'rally', name: '전투 함성', icon: '📣', key: 'Q',
    desc: '5초간 공격력 +30%, 이동속도 +20%',
    cooldown: 14, dur: 5000, dmgMult: 1.3, speedMult: 1.2,
  },
  spin: {
    id: 'spin', name: '회전 베기', icon: '🌀', key: 'Q',
    desc: '제자리에서 한 바퀴 돌며 주변 모든 적을 베고 밀어냄',
    cooldown: 9, windup: 0.28, reachAdd: 0.5, cone: 360, dmgMult: 0.9, knock: 2.5,
  },
  lunge: {
    id: 'lunge', name: '쇄도', icon: '⚡', key: 'Q',
    desc: '전방으로 순식간에 돌진하며 베기',
    cooldown: 7, windup: 0.3, reachAdd: 0.4, cone: 70, dmgMult: 1.2, dash: { speed: 17, dur: 0.28 },
  },
  bash: {
    id: 'bash', name: '방패 밀치기', icon: '🛡️', key: 'Q',
    desc: '정면의 적을 밀치고 1.2초 기절시킴 (방어 무시)',
    cooldown: 10, windup: 0.22, reach: 2.7, cone: 70, dmgMult: 0.5, knock: 3.5, stun: 1200, ignoreBlock: true,
  },
  kick: {
    id: 'kick', name: '발차기', icon: '🦶', key: 'E',
    desc: '모든 기사 공용. 방어를 무시하고 밀쳐냄 (방어 깨기)',
    cooldown: 5, windup: 0.15, reach: 2.0, cone: 50, dmg: 6, knock: 2.8, stun: 500, ignoreBlock: true,
  },
};

// hp: 체력 / speed: 이동속도(m/s) / damage: 공격력 / cooldown: 공격 간격(초)
// reach: 사거리(m) / windup: 휘두르고 타격이 들어가기까지(초) / block: 방어 시 피해 감소율(0~1) / skill: Q 스킬
export const CLASSES = {
  knight: {
    id: 'knight',
    name: '기사',
    desc: '균형 잡힌 롱소드 기사',
    hp: 100, speed: 5.2, damage: 22, cooldown: 0.7, reach: 2.6, windup: 0.18, block: 0.6,
    skill: 'rally',
    color: 0x4a6fa5,
  },
  greatsword: {
    id: 'greatsword',
    name: '대검 전사',
    desc: '느리지만 한 방이 묵직하다',
    hp: 120, speed: 4.2, damage: 40, cooldown: 1.2, reach: 3.2, windup: 0.35, block: 0.4,
    skill: 'spin',
    color: 0x8b2f2f,
  },
  duelist: {
    id: 'duelist',
    name: '결투가',
    desc: '빠른 발과 연속 찌르기',
    hp: 80, speed: 6.4, damage: 13, cooldown: 0.38, reach: 2.3, windup: 0.1, block: 0.35,
    skill: 'lunge',
    color: 0x3f8f5a,
  },
  shield: {
    id: 'shield',
    name: '방패 기사',
    desc: '단단한 방어, 느린 움직임',
    hp: 150, speed: 3.8, damage: 17, cooldown: 0.85, reach: 2.3, windup: 0.2, block: 0.85,
    skill: 'bash',
    color: 0xb08d2a,
  },
};
