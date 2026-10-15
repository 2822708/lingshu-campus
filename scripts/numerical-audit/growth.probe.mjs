import fs from 'node:fs';
import { createInitialPlayer } from '../versioned-project/utils/playerUtils.ts';
import { applyDemotion } from '../versioned-project/utils/demotion.ts';
import { useMeditationHandlers } from '../versioned-project/views/meditation/useMeditationHandlers.ts';
import { useBreakthroughHandlers } from '../versioned-project/views/breakthrough/useBreakthroughHandlers.ts';
import { useCharacterHandlers } from '../versioned-project/views/character/useCharacterHandlers.ts';
import { useItemHandlers } from '../versioned-project/views/items/useItemHandlers.ts';
import { ItemType } from '../versioned-project/types.ts';
import { REALM_DATA, REALM_ORDER } from '../versioned-project/constants.ts';
import {
  LING_GENS,
  MING_GE,
  getNpuTalent,
} from '../versioned-project/npu-data.ts';

// 诊断只调用现行 handlers，不模拟 React 调度；不读取真实存档或访问网络。
globalThis.localStorage = { getItem: () => null };
globalThis.fetch = () => {
  throw new Error('Audit forbids network');
};
Date.now = () => Date.parse('2026-10-15T09:00:00Z');
Math.random = () => 0.5;
function stateHarness(initial) {
  let state = structuredClone(initial);
  const logs = [];
  return {
    get player() {
      return state;
    },
    setPlayer: (next) => {
      state = typeof next === 'function' ? next(state) : next;
    },
    addLog: (...args) => logs.push(args),
    logs,
  };
}
const makePlayer = (id = 'npu:circuit:pingmin') => ({
  ...createInitialPlayer('数值审计#AUDIT', id),
  achievements: ['ach-first-step'],
});
function meditate(player) {
  const h = stateHarness(player);
  useMeditationHandlers({
    ...h,
    player: h.player,
    checkLevelUp: () => {},
  }).handleMeditate();
  return { gain: h.player.exp - player.exp, player: h.player };
}
async function breakthrough(player, roll = 0.5) {
  Math.random = () => roll;
  const h = stateHarness(player);
  await useBreakthroughHandlers({
    ...h,
    player: h.player,
    setLoading: () => {},
    loading: false,
  }).handleBreakthrough();
  return { player: h.player, logs: h.logs };
}
const results = {
  baseline: 'd021986',
  method:
    'actual production handlers, fixed clock and random, isolated state; observations are not correctness assertions',
};
const matrix = [];
for (const ling of LING_GENS)
  for (const fate of MING_GE) {
    const id = `npu:${ling.id}:${fate.id}`;
    const player = makePlayer(id);
    const talent = getNpuTalent(id);
    const observed = meditate(player).gain;
    const base = Math.floor(10 * (1 + 0.15));
    const documentedGain = Math.floor(base * (1 + talent.effects.expRate));
    const after = (await breakthrough({ ...player, exp: 100 })).player;
    const expectedStats = {
      attack: Math.floor(10 * 1.2) + (talent.effects.attack || 0),
      defense: Math.floor(5 * 1.2) + (talent.effects.defense || 0),
      maxHp: Math.floor(100 * 1.2) + (talent.effects.hp || 0),
      spirit: Math.floor(5 * 1.2) + (talent.effects.spirit || 0),
      physique: Math.floor(10 * 1.2) + (talent.effects.physique || 0),
      speed: Math.floor(10 * 1.2) + (talent.effects.speed || 0),
    };
    matrix.push({
      id,
      expRate: talent.effects.expRate,
      observedGain: observed,
      documentedGain,
      lostBonus: Object.entries(expectedStats)
        .filter(([key, val]) => after[key] !== val)
        .map(([key, val]) => ({ key, observed: after[key], withTalent: val })),
      initialAttack: player.attack,
      level2Attack: after.attack,
      initialSpeed: player.speed,
      level2Speed: after.speed,
    });
  }
results.npuTalents = {
  combinations: matrix.length,
  observedGainValues: [...new Set(matrix.map((x) => x.observedGain))],
  combinationsWithNonzeroExpRate: matrix.filter((x) => x.expRate !== 0).length,
  gainMismatches: matrix.filter((x) => x.documentedGain !== x.observedGain)
    .length,
  lostStatBonuses: matrix.filter((x) => x.lostBonus.length).length,
  example: matrix[3],
};
results.titleExpRate = {
  withoutTitle: meditate(makePlayer()).gain,
  withThirtyPercentTitle: meditate({
    ...makePlayer(),
    titleId: 'title-immortal',
  }).gain,
};
const buffPlayer = {
  ...makePlayer(),
  realmLevel: 9,
  exp: 100,
  maxExp: 100,
  breakthroughBonus: 0.3,
};
results.breakthroughBuff = {
  before: buffPlayer.breakthroughBonus,
  failedRoll: 0.95,
  afterFailure: (await breakthrough(buffPlayer, 0.95)).player.breakthroughBonus,
  afterSuccess: (await breakthrough(buffPlayer, 0.5)).player.breakthroughBonus,
};
const finalRealm = REALM_ORDER.at(-1);
const finalPlayer = {
  ...makePlayer(),
  realm: finalRealm,
  realmLevel: 9,
  exp: 28_499_997,
  maxExp: 28_499_997,
  hp: 1_900_000,
  maxHp: 1_900_000,
  attack: 190_000,
};
const finalAfter = await breakthrough(finalPlayer, 0.5);
results.finalRealm = {
  before: {
    realm: finalPlayer.realm,
    level: finalPlayer.realmLevel,
    attack: finalPlayer.attack,
    maxExp: finalPlayer.maxExp,
  },
  after: {
    realm: finalAfter.player.realm,
    level: finalAfter.player.realmLevel,
    attack: finalAfter.player.attack,
    maxExp: finalAfter.player.maxExp,
  },
  logs: finalAfter.logs,
};
const inheritance = { ...makePlayer(), inheritanceLevel: 4, exp: 0 };
const inheritanceHarness = stateHarness(inheritance);
useBreakthroughHandlers({
  ...inheritanceHarness,
  player: inheritanceHarness.player,
  setLoading: () => {},
  loading: false,
}).handleUseInheritance();
results.inheritance = {
  before: {
    realm: inheritance.realm,
    level: inheritance.realmLevel,
    charges: 4,
  },
  after: {
    realm: inheritanceHarness.player.realm,
    level: inheritanceHarness.player.realmLevel,
    charges: inheritanceHarness.player.inheritanceLevel,
  },
  logs: inheritanceHarness.logs,
};
const initial = makePlayer();
const demoted = applyDemotion({ ...initial, hp: 0 }).player;
results.sameLevelDemotion = {
  before: {
    realm: initial.realm,
    level: initial.realmLevel,
    attack: initial.attack,
    hp: initial.maxHp,
    maxExp: initial.maxExp,
  },
  after: {
    realm: demoted.realm,
    level: demoted.realmLevel,
    attack: demoted.attack,
    hp: demoted.maxHp,
    maxExp: demoted.maxExp,
  },
};
const permanentItem = {
  id: 'audit-permanent',
  name: '深夜冰美式',
  type: ItemType.Pill,
  quantity: 1,
  description: '使用战斗掉落池中的永久精力属性',
  effect: { exp: 500 },
  permanentEffect: { maxHp: 100 },
};
const persistentHarness = stateHarness({
  ...makePlayer('none'),
  attributePoints: 1,
  inventory: [permanentItem],
});
useCharacterHandlers({
  ...persistentHarness,
  player: persistentHarness.player,
}).handleAllocateAttribute('attack');
useItemHandlers({
  ...persistentHarness,
  player: persistentHarness.player,
}).handleUseItem(permanentItem);
const beforePersistent = persistentHarness.player;
const afterPersistent = (await breakthrough({ ...beforePersistent, exp: 100 }))
  .player;
results.permanentGrowthLoss = {
  before: {
    attack: beforePersistent.attack,
    maxHp: beforePersistent.maxHp,
    points: beforePersistent.attributePoints,
    inventoryLength: beforePersistent.inventory.length,
  },
  after: {
    attack: afterPersistent.attack,
    maxHp: afterPersistent.maxHp,
    points: afterPersistent.attributePoints,
    inventoryLength: afterPersistent.inventory.length,
  },
  withPermanentBonusesAtLevel2: { attack: 12 + 5, maxHp: 120 + 100 },
  pointSource:
    'Injected single attribute point to examine legacy/imported allocations; normal new games currently grant none',
};
const curves = [];
for (const [idx, realm] of REALM_ORDER.entries())
  for (let level = 1; level <= 9; level++) {
    const p = { ...makePlayer(), realm, realmLevel: level, talentId: null };
    Math.random = () => 0.5;
    const baseGain = meditate(p).gain;
    const maxExp =
      idx === 0 && level === 1
        ? 100
        : Math.floor(REALM_DATA[realm].maxExpBase * (1 + level * 0.1) * 1.5);
    const expectedGain = baseGain * 1.039 - 0.5;
    curves.push({
      realm,
      level,
      maxExp,
      normalMidpointGain: baseGain,
      expectedGainIncludingEnlightenment: Number(expectedGain.toFixed(4)),
      thresholdOverExpectedActions: Number((maxExp / expectedGain).toFixed(2)),
      idealSecondsAt1100ms: Number(((maxExp / expectedGain) * 1.1).toFixed(2)),
      successChance: level >= 9 ? 0.6 : 0.9,
    });
  }
results.progression = REALM_ORDER.map((realm) => ({
  realm,
  thresholds: curves.filter((x) => x.realm === realm).map((x) => x.maxExp),
  idealSecondsAcrossNineLevels: Number(
    curves
      .filter((x) => x.realm === realm)
      .reduce((a, x) => a + x.idealSecondsAt1100ms, 0)
      .toFixed(2)
  ),
}));
const regen = [100, 120, 199, 200, 500, 1_000_000].map((maxHp) => ({
  maxHp,
  basePerSecond: Math.max(1, Math.floor(maxHp * 0.01)),
  level1MeditationPerSecond: Math.floor(
    Math.max(1, Math.floor(maxHp * 0.01)) * 2.1
  ),
}));
results.regeneration = regen;
const out = process.env.AUDIT_OUTPUT;
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(
  `${out}/growth-observations.json`,
  JSON.stringify(results, null, 2) + '\n'
);
fs.writeFileSync(
  `${out}/npu-talent-matrix.json`,
  JSON.stringify(matrix, null, 2) + '\n'
);
fs.writeFileSync(
  `${out}/growth-curve.csv`,
  'realm,level,maxExp,normalMidpointGain,expectedGainIncludingEnlightenment,thresholdOverExpectedActions,idealSecondsAt1100ms,successChance\n' +
    curves.map((x) => Object.values(x).join(',')).join('\n') +
    '\n'
);
console.log(JSON.stringify(results, null, 2));
