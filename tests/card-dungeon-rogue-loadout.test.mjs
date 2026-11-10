import test from 'node:test';
import assert from 'node:assert/strict';
import { CULTIVATION_ARTS } from '../constants';
import { EquipmentSlot, ItemType } from '../types';
import { createInitialPlayer } from '../utils/playerUtils';
import { CARDS } from '../features/card-battle/catalog';
import {
  assertCardBattleState,
  createCardBattle,
  stepCardBattle,
} from '../features/card-battle/engine';
import {
  BASIC_DUNGEON_CARD_IDS,
  getDungeonCardSources,
} from '../features/card-dungeon/sources';
import {
  assertCardLoadout,
  validateDungeonLoadout,
} from '../features/card-dungeon/loadout';
import {
  createRogueDungeonLoadout,
  ensureRogueOpeningSources,
} from '../features/card-dungeon/rogueLoadout';

const clone = (value) => JSON.parse(JSON.stringify(value));
const item = (id, name, type, equipmentSlot) => ({
  id,
  name,
  type,
  equipmentSlot,
  quantity: 1,
  isEquippable: true,
  rarity: '普通',
  description: '肉鸽构筑测试',
});
function player(withSources = true) {
  const subject = createInitialPlayer('构筑测试', 'talent-ordinary');
  if (!withSources) return subject;
  subject.cultivationArts = CULTIVATION_ARTS.map((art) => art.id);
  subject.inventory = [
    item('keyboard', '青轴机械键盘', ItemType.Weapon, EquipmentSlot.Weapon),
    item('uniform', '军训迷彩服', ItemType.Armor, EquipmentSlot.Chest),
    item('band', '智能手环', ItemType.Ring, EquipmentSlot.Ring1),
    item('badge', '实验室工牌', ItemType.Accessory, EquipmentSlot.Accessory1),
    item('wrist', '运动护腕', ItemType.Artifact, EquipmentSlot.Artifact1),
    item(
      'cooler',
      '笔记本散热底座',
      ItemType.Artifact,
      EquipmentSlot.Artifact2
    ),
    item('unequipped', '降噪耳塞', ItemType.Artifact, EquipmentSlot.Artifact1),
  ];
  subject.equippedItems = Object.fromEntries(
    subject.inventory.slice(0, 6).map((gear) => [gear.equipmentSlot, gear.id])
  );
  return subject;
}
const prefixCount = (loadout, prefix) =>
  loadout.resume.filter((id) => id.startsWith(prefix)).length;

test('局内构筑同种子稳定，来源顺序变化不改结果，不读取全局随机或修改主角色', () => {
  const subject = player();
  const before = clone(subject);
  const original = Math.random;
  Math.random = () => {
    throw new Error('禁止读取全局随机');
  };
  try {
    const first = createRogueDungeonLoadout(subject, 301, 7);
    assert.deepEqual(first, createRogueDungeonLoadout(subject, 301, 7));
    const reordered = {
      ...subject,
      cultivationArts: [...subject.cultivationArts].reverse(),
      inventory: [...subject.inventory].reverse(),
      equippedItems: Object.fromEntries(
        Object.entries(subject.equippedItems).reverse()
      ),
    };
    assert.deepEqual(first, createRogueDungeonLoadout(reordered, 301, 7));
    assert.equal(first.revision, 7);
    assert.deepEqual(subject, before);
  } finally {
    Math.random = original;
  }
});

test('未选课未装备也能直接构筑：8基础和2战术，不凭空生成来源', () => {
  const subject = player(false);
  const loadout = createRogueDungeonLoadout(subject, 0);
  assertCardLoadout(loadout);
  assert.equal(validateDungeonLoadout(subject, loadout).valid, true);
  assert.equal(loadout.resume.length, 10);
  assert.deepEqual(loadout.resume.slice(0, 8), BASIC_DUNGEON_CARD_IDS);
  assert.equal(prefixCount(loadout, 'tactic:'), 2);
  assert.equal(prefixCount(loadout, 'course:'), 0);
  assert.equal(prefixCount(loadout, 'equipment:'), 0);
  assert.deepEqual(loadout.library, loadout.resume);
  assert.notEqual(loadout.library, loadout.resume);
});

test('来源充足最多16张、课程与装备各3张，不带未穿戴装备且所有选择无重复', () => {
  const subject = player();
  const available = new Set(getDungeonCardSources(subject).map((s) => s.id));
  for (let seed = 0; seed < 64; seed++) {
    const loadout = createRogueDungeonLoadout(subject, seed);
    assertCardLoadout(loadout);
    assert.equal(validateDungeonLoadout(subject, loadout).valid, true);
    assert.equal(loadout.resume.length, 16);
    assert.equal(prefixCount(loadout, 'course:'), 3);
    assert.equal(prefixCount(loadout, 'equipment:'), 3);
    assert.equal(prefixCount(loadout, 'tactic:'), 2);
    assert.equal(new Set(loadout.resume).size, loadout.resume.length);
    assert.ok(loadout.library.length <= 16);
    assert.ok(loadout.resume.every((id) => available.has(id)));
    assert.ok(!loadout.resume.includes('equipment:unequipped'));
  }
  const variants = new Set(
    Array.from({ length: 24 }, (_, seed) =>
      JSON.stringify(createRogueDungeonLoadout(subject, seed).resume)
    )
  );
  assert.ok(variants.size > 1);
});

test('来源不足只取真实课程与装备，重复已学课程不产生副本牌', () => {
  const subject = player();
  subject.cultivationArts = [
    CULTIVATION_ARTS[0].id,
    CULTIVATION_ARTS[0].id,
    'missing-course',
  ];
  subject.equippedItems = { [EquipmentSlot.Weapon]: 'keyboard' };
  const loadout = createRogueDungeonLoadout(subject, 0xffffffff);
  assert.equal(loadout.resume.length, 12);
  assert.equal(prefixCount(loadout, 'course:'), 1);
  assert.equal(prefixCount(loadout, 'equipment:'), 1);
  assert.equal(validateDungeonLoadout(subject, loadout).valid, true);
  assert.throws(() => createRogueDungeonLoadout(subject, -1));
  assert.throws(() => createRogueDungeonLoadout(subject, 1.5));
  assert.throws(() => createRogueDungeonLoadout(subject, 0, -1));
});

function opening() {
  const definitions = [
    ['base:0', 'strike', 'basic'],
    ['base:1', 'guard', 'basic'],
    ['base:2', 'strike', 'basic'],
    ['base:3', 'guard', 'basic'],
    ['course:a', 'course-math', 'course'],
    ['course:b', 'course-linear', 'course'],
    ['equipment:a', 'gear-keyboard', 'equipment'],
    ['equipment:b', 'gear-earplugs', 'equipment'],
  ];
  const run = createCardBattle({
    id: 'opening-sources',
    seed: 41,
    player: { hp: 100, maxHp: 100, attack: 20, defense: 20, speed: 10 },
    enemy: {
      name: '测试对手',
      hp: 100,
      maxHp: 100,
      attack: 20,
      defense: 10,
      speed: 10,
      behavior: 'balanced',
    },
    cards: definitions.map(([id, templateId, source]) => {
      const {
        id: ignored,
        scaling: ignoredScaling,
        ...template
      } = CARDS[templateId];
      return { ...template, id, templateId, source };
    }),
  });
  run.hand = ['base:0', 'base:1', 'base:2', 'base:3'];
  run.drawPile = ['course:a', 'course:b', 'equipment:a', 'equipment:b'];
  return run;
}
const partitions = (run) =>
  [...run.hand, ...run.drawPile, ...run.discardPile, ...run.exhaustPile].sort();

test('起手互换基础牌以展示课程和装备，牌堆分区、随机流、角色数值均守恒', () => {
  const run = opening();
  const before = clone(run);
  const next = ensureRogueOpeningSources(run);
  assertCardBattleState(next);
  assert.deepEqual(run, before);
  assert.deepEqual(next.hand, ['course:a', 'equipment:a', 'base:2', 'base:3']);
  assert.deepEqual(next.drawPile, [
    'base:0',
    'course:b',
    'base:1',
    'equipment:b',
  ]);
  assert.deepEqual(partitions(next), partitions(run));
  assert.equal(new Set(partitions(next)).size, run.cards.length);
  assert.equal(next.rngState, run.rngState);
  assert.equal(next.intentRngState, run.intentRngState);
  assert.equal(next.cards, run.cards);
  assert.equal(next.player, run.player);
  assert.equal(next.log, run.log);
  assert.equal(next.discardPile, run.discardPile);
  assert.equal(next.exhaustPile, run.exhaustPile);
  assert.equal(ensureRogueOpeningSources(next), next);
});

test('手中已有该类来源就保留原牌，补另一类时不挤掉唯一来源牌', () => {
  const run = opening();
  run.hand = ['course:b', 'base:1', 'base:2', 'base:3'];
  run.drawPile = ['course:a', 'base:0', 'equipment:a', 'equipment:b'];
  const next = ensureRogueOpeningSources(run);
  assert.deepEqual(next.hand, ['course:b', 'equipment:a', 'base:2', 'base:3']);
  assert.ok(next.drawPile.includes('course:a'));
  assert.deepEqual(partitions(next), partitions(run));

  const allSources = opening();
  allSources.hand = ['equipment:b', 'equipment:a', 'base:2', 'base:3'];
  allSources.drawPile = ['course:a', 'course:b', 'base:0', 'base:1'];
  const added = ensureRogueOpeningSources(allSources);
  assert.deepEqual(added.hand, [
    'equipment:b',
    'equipment:a',
    'course:a',
    'base:3',
  ]);
  assert.equal(ensureRogueOpeningSources(added), added);

  const noBasics = opening();
  noBasics.hand = ['equipment:b', 'equipment:a'];
  noBasics.drawPile = [
    'course:a',
    'course:b',
    'base:0',
    'base:1',
    'base:2',
    'base:3',
  ];
  const exchanged = ensureRogueOpeningSources(noBasics);
  assertCardBattleState(exchanged);
  assert.deepEqual(exchanged.hand, ['course:a', 'equipment:a']);
  assert.deepEqual(partitions(exchanged), partitions(noBasics));
});

test('起手已有两类来源、无来源或已进入后续回合时不改牌；互换不触碰弃牌和暂存牌', () => {
  const ready = opening();
  ready.hand = ['course:b', 'equipment:b', 'base:2', 'base:3'];
  ready.drawPile = ['course:a', 'equipment:a', 'base:0', 'base:1'];
  assert.equal(ensureRogueOpeningSources(ready), ready);

  const basic = opening();
  basic.cards = basic.cards.slice(0, 4);
  basic.drawPile = [];
  assert.equal(ensureRogueOpeningSources(basic), basic);

  const later = stepCardBattle(opening(), {
    id: 'opening-sources',
    seq: 1,
    type: 'play',
    cardId: 'base:1',
  });
  assert.equal(ensureRogueOpeningSources(later), later);

  const split = opening();
  split.drawPile = ['course:a', 'equipment:a'];
  split.discardPile = ['course:b'];
  split.exhaustPile = ['equipment:b'];
  const next = ensureRogueOpeningSources(split);
  assertCardBattleState(next);
  assert.deepEqual(partitions(next), partitions(split));
  assert.equal(next.discardPile, split.discardPile);
  assert.equal(next.exhaustPile, split.exhaustPile);
});
