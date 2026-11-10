import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialPlayer } from '../utils/playerUtils';
import { EquipmentSlot, ItemType, RealmType } from '../types';
import {
  assertInteractiveProgress,
  emptyInteractiveProgress,
  reduceInteractiveAction,
} from '../features/interactive/state';
import { selectDungeonEnemyArchetype } from '../features/card-battle/enemies';
import {
  createCardBattle,
  stepCardBattle,
} from '../features/card-battle/engine';
import { resolveDungeonEquipment } from '../features/card-dungeon/equipment';
import { getDungeonCardSources } from '../features/card-dungeon/sources';
import { validateDungeonLoadout } from '../features/card-dungeon/loadout';
import {
  createGameSave,
  parseImportSave,
  repairSavedInventory,
} from '../features/save/saveCodec';
import { getDungeonEquipmentTraits } from '../features/card-dungeon/equipment';

const clone = (x) => JSON.parse(JSON.stringify(x));
const offer = {
  id: 'content-offer',
  name: '开放答辩',
  description: '内容回归',
  minRealm: RealmType.QiRefining,
  cost: 20,
  riskLevel: '中',
  drops: ['咖啡豆'],
};
function begin() {
  const player = {
    ...createInitialPlayer('内容测试#ABCD', 'talent-ordinary'),
    hp: 140,
    maxHp: 200,
    attack: 40,
    defense: 40,
    speed: 25,
    spiritStones: 1000,
    maxExp: 1e12,
    inventory: [
      {
        id: 'real-keyboard',
        name: '青轴机械键盘',
        type: ItemType.Weapon,
        isEquippable: true,
        equipmentSlot: EquipmentSlot.Weapon,
        quantity: 1,
        rarity: '稀有',
        effect: { attack: 99999 },
        description: '',
      },
    ],
    equippedItems: { [EquipmentSlot.Weapon]: 'real-keyboard' },
  };
  const interactive = emptyInteractiveProgress();
  const tactics = getDungeonCardSources(player).filter((s) =>
    s.id.startsWith('tactic:')
  );
  interactive.cardLoadout.library.push(...tactics.map((s) => s.id));
  interactive.cardLoadout.resume.push(...tactics.map((s) => s.id));
  const initial = { player, logs: [], interactive };
  for (let seed = 0; seed < 1000; seed++) {
    const next = reduceInteractiveAction(
      initial,
      {
        type: 'begin-dungeon',
        id: 'content-entry',
        seed,
        realm: offer,
        batchRevision: 'content-batch',
        loadoutRevision: 0,
      },
      1000
    );
    if (next.interactive.pending?.cardRun) return { initial, next, seed };
  }
  throw new Error('未找到固定战斗种子');
}

test('新副本接入敌型、真实装备被动与可选机制牌，费用和原始分级只结算一次', () => {
  const { initial, next, seed } = begin();
  const { cardRun: run, adventurePlan: plan } = next.interactive.pending;
  assert.equal(run.enemy.archetype, selectDungeonEnemyArchetype(seed));
  for (const key of [
    'name',
    'title',
    'realm',
    'maxHp',
    'attack',
    'defense',
    'speed',
    'behavior',
  ]) {
    assert.equal(run.enemy[key], plan.enemy[key]);
  }
  assert.equal(next.player.spiritStones, initial.player.spiritStones - 20);
  assert.equal(run.player.attack, initial.player.attack);
  assert.equal(run.cards.filter((c) => c.id.startsWith('tactic:')).length, 6);
  assert.ok(!run.cards.some((c) => c.id === 'equipment:real-keyboard'));
  assert.deepEqual(
    run.equipment,
    resolveDungeonEquipment(initial.player, plan)
  );
  assert.equal(run.equipment.length, 1, '无需选入装备卡，真实穿戴特性已冻结');
  assertInteractiveProgress(next.interactive);
  assert.deepEqual(initial.player.inventory[0].effect, { attack: 99999 });
});

test('带新敌型和装备的现场可原样导出、刷新续战，且重复指令不再扣费', () => {
  const { next } = begin();
  const save = createGameSave(next.player, next.logs, 1000, next.interactive);
  const restored = parseImportSave(JSON.stringify(save));
  assert.deepEqual(restored.interactive, next.interactive);
  const run = next.interactive.pending.cardRun;
  const command = { id: run.id, seq: run.commandSeq + 1, type: 'end-turn' };
  const a = stepCardBattle(run, command);
  const b = stepCardBattle(restored.interactive.pending.cardRun, command);
  assert.deepEqual(a, b);
  assert.equal(stepCardBattle(a, command), a);
});

test('已有卡战缺少新敌型和装备字段时继续原随机节奏，不自动加入新内容', () => {
  const { next } = begin();
  const pending = next.interactive.pending;
  const legacy = createCardBattle({
    id: pending.id,
    seed: pending.seed,
    player: next.player,
    enemy: pending.adventurePlan.enemy,
    cards: pending.cardRun.cards.filter((card) => card.id.startsWith('base:')),
  });
  next.interactive.cardLoadout.resume = legacy.cards.map((card) => card.id);
  pending.cardRun = legacy;
  assertInteractiveProgress(next.interactive);
  const before = clone(next.interactive);
  const restored = parseImportSave(
    JSON.stringify(createGameSave(next.player, next.logs, 1000, before))
  );
  assert.deepEqual(restored.interactive, before);
  assert.equal(restored.interactive.pending.cardRun.enemy.archetype, undefined);
  assert.equal(restored.interactive.pending.cardRun.equipment, undefined);
});

test('战术牌不替换默认基础来源，纯防御构筑仍不能报名', () => {
  const { initial } = begin();
  const loadout = clone(initial.interactive.cardLoadout);
  loadout.resume = [
    'base:3',
    'base:4',
    'base:5',
    'base:7',
    'tactic:feint',
    'tactic:riposte',
    'tactic:reserve',
    'tactic:reset',
  ];
  assert.equal(validateDungeonLoadout(initial.player, loadout).valid, false);
  loadout.resume[3] = 'tactic:convert';
  assert.equal(validateDungeonLoadout(initial.player, loadout).valid, true);
});

test('读档保留合法装备槽位，护腕用途含键盘也不会被误改成键鼠而失去特性', () => {
  const inventory = [
    {
      id: 'saved-wrist',
      name: '运动护腕',
      description: '打球和敲键盘都能用，护住手腕',
      type: ItemType.Artifact,
      equipmentSlot: EquipmentSlot.Artifact2,
      isEquippable: true,
      quantity: 1,
      rarity: '普通',
    },
  ];
  const originalRandom = Math.random;
  Math.random = () => {
    throw new Error('合法槽位读档不应重新随机');
  };
  try {
    const repaired = repairSavedInventory(inventory);
    assert.equal(repaired[0], inventory[0]);
    const player = {
      ...createInitialPlayer('槽位回归', 'talent-ordinary'),
      inventory: repaired,
      equippedItems: { [EquipmentSlot.Artifact2]: 'saved-wrist' },
    };
    assert.equal(getDungeonEquipmentTraits(player)[0].effect, 'guard-counter');
  } finally {
    Math.random = originalRandom;
  }
});
