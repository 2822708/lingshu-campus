import assert from 'node:assert/strict';
import {
  resolveBattleEncounter,
  shouldTriggerBattle,
} from '../versioned-project/services/battleService';
import { executeAdventureCore } from '../versioned-project/views/adventure/executeAdventureCore';
import { useAdventureHandlers } from '../versioned-project/views/adventure/useAdventureHandlers';
import { useEquipmentHandlers } from '../versioned-project/views/equipment/useEquipmentHandlers';
import { createInitialPlayer } from '../versioned-project/utils/playerUtils';
import { getItemStats } from '../versioned-project/utils/itemUtils';
import { RealmType, ItemType, EquipmentSlot } from '../versioned-project/types';
import { REALM_DATA, REALM_ORDER } from '../versioned-project/constants';
import { pickRewardForced } from '../versioned-project/utils/encounter';
import { generateAdventureEvent } from '../versioned-project/services/aiService';

const evidence = [];
let fetchCalls = 0;
globalThis.fetch = async () => {
  fetchCalls += 1;
  throw Error('audit prohibits network');
};
globalThis.document = { body: { classList: { add() {}, remove() {} } } };
const oldTimeout = globalThis.setTimeout;
globalThis.setTimeout = (callback) => {
  callback();
  return 1;
};
Date.now = () => 1792022400000;
const makePlayer = (overrides = {}) => ({
  ...createInitialPlayer('数值审计', 'npu:algorithm:pingmin'),
  ...overrides,
});
async function fixedRandom(value, fn) {
  const original = Math.random;
  Math.random = () => value;
  try {
    return await fn();
  } finally {
    Math.random = original;
  }
}
async function seeded(seed, fn) {
  const original = Math.random;
  Math.random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  try {
    return await fn();
  } finally {
    Math.random = original;
  }
}
async function battle(player, type = 'normal', risk = '低', random = 0.5) {
  return fixedRandom(random, () => resolveBattleEncounter(player, type, risk));
}

const basePlayer = makePlayer();
const baseBattle = await battle(basePlayer);
const ignoredStatPlayer = makePlayer({
  spirit: 999999,
  physique: 999999,
  activePetId: 'audit-pet',
  pets: [
    {
      id: 'audit-pet',
      name: '审计室友',
      species: '审计型',
      level: 100,
      exp: 0,
      maxExp: 100,
      rarity: '绝版',
      stats: { attack: 999999, defense: 999999, hp: 999999, speed: 999999 },
      skills: [
        {
          id: 'audit-skill',
          name: '审计技能',
          description: '测试',
          type: 'attack',
          effect: { damage: 999999 },
        },
      ],
      evolutionStage: 2,
      affection: 100,
    },
  ],
});
assert.deepEqual(await battle(ignoredStatPlayer), baseBattle);
evidence.push({
  check: '思维、体能、出战室友均不改变战斗',
  base: { spirit: basePlayer.spirit, physique: basePlayer.physique, pets: 0 },
  raised: { spirit: 999999, physique: 999999, petAttack: 999999 },
  identical: true,
  rounds: baseBattle.replay.rounds.length,
  hpLoss: baseBattle.replay.hpLoss,
});

assert.deepEqual(
  await battle(basePlayer, 'normal', '低'),
  await battle(basePlayer, 'normal', '极度危险')
);
evidence.push({
  check: '普通战斗传入低/极度危险完全相同',
  identical: true,
  enemy: baseBattle.replay.enemy,
  exp: baseBattle.replay.expChange,
  stones: baseBattle.replay.spiritChange,
});

const easyRealm = await battle(
  makePlayer({ attack: 1000000 }),
  'secret_realm',
  '低'
);
const hardRealm = await battle(
  makePlayer({ attack: 1000000 }),
  'secret_realm',
  '极度危险'
);
assert.notDeepEqual(easyRealm.replay.enemy, hardRealm.replay.enemy);
evidence.push({
  check: '副本风险确实影响数值',
  low: {
    enemy: easyRealm.replay.enemy,
    exp: easyRealm.replay.expChange,
    stones: easyRealm.replay.spiritChange,
  },
  extreme: {
    enemy: hardRealm.replay.enemy,
    exp: hardRealm.replay.expChange,
    stones: hardRealm.replay.spiritChange,
  },
});

let actual = makePlayer({ attack: 1000000 });
const original = structuredClone(actual);
let replay;
const logs = [];
await fixedRandom(0.1, async () => {
  const handlers = useAdventureHandlers({
    player: actual,
    setPlayer: (update) => {
      actual = typeof update === 'function' ? update(actual) : update;
    },
    addLog: (text, type) => logs.push({ text, type }),
    triggerVisual() {},
    setLoading() {},
    setCooldown() {},
    loading: false,
    cooldown: 0,
    onOpenShop() {},
    onOpenBattleModal: (value) => {
      replay = value;
    },
  });
  await handlers.executeAdventure('normal');
});
assert.ok(replay.victory);
assert.notEqual(actual.exp - original.exp, replay.expChange);
evidence.push({
  check: '战斗奇遇回放奖励少于实际到账',
  story: logs.find(({ text }) => text.includes('\n\n'))?.text,
  actualExp: actual.exp - original.exp,
  replayExp: replay.expChange,
  actualStones: actual.spiritStones - original.spiritStones,
  replayStones: replay.spiritChange,
});

let healingRoll;
let healingEncounter;
for (let index = 1; index < 1000; index += 1) {
  const roll = index / 1000;
  const encounter = await fixedRandom(roll, () => pickRewardForced(basePlayer));
  if (encounter.hpChange > 0) {
    healingRoll = roll;
    healingEncounter = encounter;
    break;
  }
}
assert.ok(healingEncounter);
let healingState = makePlayer({ hp: 30 });
const baseEvent = await fixedRandom(0.5, () =>
  generateAdventureEvent(healingState, 'normal')
);
let call = 0;
const oldRandomForHealing = Math.random;
Math.random = () => [0.9, healingRoll][call++] ?? 0.5;
try {
  const handlers = useAdventureHandlers({
    player: healingState,
    setPlayer: (update) => {
      healingState =
        typeof update === 'function' ? update(healingState) : update;
    },
    addLog() {},
    triggerVisual() {},
    setLoading() {},
    setCooldown() {},
    loading: false,
    cooldown: 0,
    onOpenShop() {},
    onOpenBattleModal() {},
  });
  await handlers.executeAdventure('normal');
} finally {
  Math.random = oldRandomForHealing;
}
assert.equal(healingState.hp - 30, baseEvent.hpChange);
evidence.push({
  check: '纯奖励奇遇精力奖励未叠加',
  encounter: healingEncounter.story,
  configuredHpReward: healingEncounter.hpChange,
  baseEventHpChange: baseEvent.hpChange,
  actualHpChange: healingState.hp - 30,
  expectedHpChange: baseEvent.hpChange + healingEncounter.hpChange,
});

let dropped = makePlayer({ inventory: [] });
await fixedRandom(0.5, () =>
  executeAdventureCore({
    result: {
      story: '审计掉落',
      hpChange: 0,
      expChange: 0,
      spiritStonesChange: 0,
      eventColor: 'normal',
      itemsObtained: [
        {
          name: '审计显示器',
          type: ItemType.Artifact,
          description: '测试掉落',
          rarity: '普通',
          isEquippable: true,
          equipmentSlot: EquipmentSlot.Artifact1,
          permanentEffect: { attack: 80, maxHp: 200 },
        },
      ],
    },
    battleContext: null,
    player: dropped,
    setPlayer: (update) => {
      dropped = typeof update === 'function' ? update(dropped) : update;
    },
    addLog() {},
    triggerVisual() {},
    onOpenBattleModal() {},
    adventureType: 'normal',
  })
);
const artifact = dropped.inventory[0];
assert.notEqual(getItemStats(artifact).attack, 80);
assert.notEqual(getItemStats(artifact).hp, 200);
evidence.push({
  check: '仅permanentEffect外设未转换成装备effect',
  inputPermanent: { attack: 80, maxHp: 200 },
  actualItem: artifact,
  effectiveStats: getItemStats(artifact),
});

const equippedArtifact = {
  id: 'artifact',
  name: '审计外设',
  description: '审计',
  type: ItemType.Artifact,
  quantity: 1,
  rarity: '普通',
  effect: { attack: 20, hp: 100 },
  isEquippable: true,
  equipmentSlot: EquipmentSlot.Artifact1,
};
let natalState = makePlayer({
  hp: 500,
  maxHp: 500,
  attack: 30,
  inventory: [equippedArtifact],
  equippedItems: { [EquipmentSlot.Artifact1]: 'artifact' },
});
const natalStart = structuredClone(natalState);
const equipHandlers = useEquipmentHandlers({
  player: natalState,
  setPlayer: (update) => {
    natalState = typeof update === 'function' ? update(natalState) : update;
  },
  addLog() {},
});
equipHandlers.handleRefineNatalArtifact(equippedArtifact);
const natalBeforeReequip = structuredClone(natalState);
equipHandlers.handleUnequipItem(EquipmentSlot.Artifact1);
equipHandlers.handleEquipItem(natalState.inventory[0], EquipmentSlot.Artifact1);
assert.equal(natalBeforeReequip.maxHp, 450);
assert.equal(natalState.maxHp, 450);
evidence.push({
  check: '已装备主力外设未补加50%精力属性',
  before: { hp: natalStart.maxHp, attack: natalStart.attack },
  after: { hp: natalBeforeReequip.maxHp, attack: natalBeforeReequip.attack },
  expectedHpAfter50CostAnd50Bonus: 500,
  rawHpBonus:
    getItemStats(equippedArtifact, true).hp -
    getItemStats(equippedArtifact, false).hp,
  afterUnequipReequipHp: natalState.maxHp,
});

const powerCurve = [];
for (const realm of REALM_ORDER) {
  const d = REALM_DATA[realm];
  const player = makePlayer({
    realm,
    attack: d.baseAttack,
    defense: d.baseDefense,
    hp: d.baseMaxHp,
    maxHp: d.baseMaxHp,
    speed: d.baseSpeed,
  });
  const { replay } = await battle(player);
  powerCurve.push({
    realm,
    attack: player.attack,
    playerHp: player.hp,
    enemyHp: replay.enemy.maxHp,
    enemyAttack: replay.enemy.attack,
    first: replay.rounds[0]?.attacker,
    rounds: replay.rounds.length,
    hpLoss: replay.hpLoss,
    victory: replay.victory,
  });
}
evidence.push({
  check: '无装备各学阶基础战斗成长曲线,固定随机0.5',
  data: powerCurve,
});

const timedOut = await battle(
  makePlayer({
    realm: RealmType.ImmortalAscension,
    attack: 0,
    defense: 1000000,
    hp: 1000000,
    maxHp: 1000000,
  })
);
assert.equal(timedOut.replay.rounds.length, 40);
assert.ok(timedOut.replay.playerHpAfter > 0);
assert.equal(timedOut.replay.victory, false);
evidence.push({
  check: '40行动上限判负,双方存活',
  rounds: timedOut.replay.rounds.length,
  playerHpAfter: timedOut.replay.playerHpAfter,
  enemyHpAfter: timedOut.replay.rounds.at(-1).enemyHpAfter,
  expChange: timedOut.replay.expChange,
  spiritChange: timedOut.replay.spiritChange,
});

const sensitivity = [];
for (const adventureType of ['normal', 'secret_realm']) {
  const risk = adventureType === 'secret_realm' ? '中' : undefined;
  const variants = {
    baseline: {},
    attack_x2: { attack: basePlayer.attack * 2 },
    defense_x2: { defense: basePlayer.defense * 2 },
    speed_x2: { speed: basePlayer.speed * 2 },
    maxHp_x2_current_unchanged: { maxHp: basePlayer.maxHp * 2 },
    maxHp_and_hp_x2: { maxHp: basePlayer.maxHp * 2, hp: basePlayer.hp * 2 },
  };
  const summaries = {};
  const baseReplays = [];
  for (const [name, overrides] of Object.entries(variants)) {
    let wins = 0,
      totalHpLoss = 0,
      totalHpAfter = 0,
      totalRounds = 0;
    let enemyChanged = 0,
      resultChanged = 0,
      firstMoves = 0;
    for (let seed = 1; seed <= 100; seed += 1) {
      const player = { ...basePlayer, ...overrides };
      const { replay } = await seeded(seed, () =>
        resolveBattleEncounter(player, adventureType, risk)
      );
      if (name === 'baseline') baseReplays.push(replay);
      else {
        if (
          JSON.stringify(replay.enemy) !==
          JSON.stringify(baseReplays[seed - 1].enemy)
        )
          enemyChanged += 1;
        if (JSON.stringify(replay) !== JSON.stringify(baseReplays[seed - 1]))
          resultChanged += 1;
      }
      wins += Number(replay.victory);
      firstMoves += Number(replay.rounds[0]?.attacker === 'player');
      totalHpLoss += replay.hpLoss;
      totalHpAfter += replay.playerHpAfter;
      totalRounds += replay.rounds.length;
    }
    assert.equal(enemyChanged, 0);
    if (name === 'maxHp_x2_current_unchanged') assert.equal(resultChanged, 0);
    summaries[name] = {
      wins,
      sampleSize: 100,
      enemyChanged,
      resultChanged,
      firstMoves,
      averageHpLoss: totalHpLoss / 100,
      averageHpAfter: totalHpAfter / 100,
      averageActions: totalRounds / 100,
    };
  }
  sensitivity.push({ adventureType, risk, summaries });
}
evidence.push({
  check: '同种子单变量灵敏度：敌人完全不随玩家攻防速精力变化',
  samples: sensitivity,
});

// 多随机种子分别验证：核心战斗不受思维、体能和出战室友属性影响。
for (let seed = 1; seed <= 50; seed += 1) {
  const first = await seeded(seed, () =>
    resolveBattleEncounter(basePlayer, 'normal')
  );
  const second = await seeded(seed, () =>
    resolveBattleEncounter(ignoredStatPlayer, 'normal')
  );
  assert.deepEqual(first, second);
}
assert.equal(fetchCalls, 0);
globalThis.setTimeout = oldTimeout;
process.stdout.write(
  JSON.stringify(
    {
      sourceCommit: 'd021986',
      checks: evidence,
      additionalIgnoredStatSeedsVerified: 50,
      fetchCalls,
    },
    null,
    2
  )
);
