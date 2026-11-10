import test from 'node:test';
import assert from 'node:assert/strict';
import { INITIAL_ITEMS, LOTTERY_PRIZES } from '../constants';
import { ItemType, EquipmentSlot, RealmType } from '../types';
import { createInitialPlayer } from '../utils/playerUtils';
import { CARDS, STARTER_DECK } from '../features/card-battle/catalog';
import {
  ENEMY_ARCHETYPES,
  selectDungeonEnemyArchetype,
} from '../features/card-battle/enemies';
import { createAdventureBattlePlan } from '../features/interactive/adventureBattle';
import {
  BASIC_DUNGEON_CARD_IDS,
  TACTIC_DUNGEON_CARD_IDS,
  getDungeonCardSources,
} from '../features/card-dungeon/sources';
import {
  createDefaultCardLoadout,
  validateDungeonLoadout,
} from '../features/card-dungeon/loadout';
import {
  resolveDungeonCards,
  getDungeonCardBudgets,
} from '../features/card-dungeon/numericAdapter';
import {
  EQUIPMENT_BATTLE_DEFINITIONS,
  getDungeonEquipmentTraits,
  getEquipmentBattleDefinition,
  resolveDungeonEquipment,
} from '../features/card-dungeon/equipment';

const clone = (value) => JSON.parse(JSON.stringify(value));
const player = (extra = {}) => ({
  ...createInitialPlayer('内容测试', 'talent-ordinary'),
  hp: 150,
  maxHp: 200,
  attack: 120,
  defense: 100,
  speed: 50,
  inventory: [],
  equippedItems: {},
  ...extra,
});
const plan = (subject) =>
  createAdventureBattlePlan(
    subject,
    {
      adventureType: 'secret_realm',
      realmMinRealm: RealmType.QiRefining,
      realmName: '公开答辩',
      riskLevel: '中',
    },
    531
  );
const makeItem = (definition, index = 0) => ({
  id: `gear-${index}`,
  name: definition.name,
  type: definition.type,
  quantity: 1,
  isEquippable: true,
  equipmentSlot: definition.slots[0],
  description: '已有装备',
  effect: { attack: 99999, defense: 99999 },
});

test('六张战术牌是可选来源，默认八张简历和独立试玩奖励池保持原样', () => {
  const subject = player();
  const before = clone(subject);
  const sources = getDungeonCardSources(subject);
  const saved = createDefaultCardLoadout(2);
  assert.equal(BASIC_DUNGEON_CARD_IDS.length, 8);
  assert.deepEqual(saved.library, BASIC_DUNGEON_CARD_IDS);
  assert.deepEqual(saved.resume, BASIC_DUNGEON_CARD_IDS);
  assert.deepEqual(STARTER_DECK, [
    'strike',
    'strike',
    'strike',
    'guard',
    'guard',
    'guard',
    'break',
    'prepare',
  ]);
  assert.equal(TACTIC_DUNGEON_CARD_IDS.length, 6);
  assert.equal(
    new Set(sources.map((source) => source.id)).size,
    sources.length
  );
  for (const id of TACTIC_DUNGEON_CARD_IDS) {
    const source = sources.find((entry) => entry.id === id);
    assert.equal(source.sourceLabel, '战术牌');
    assert.equal(source.source, 'basic');
    assert.equal(CARDS[source.templateId].source, 'tactic');
    assert.equal(saved.library.includes(id), false);
  }
  assert.equal(
    Object.values(CARDS).filter((entry) => !entry.source).length,
    12
  );
  assert.deepEqual(subject, before);
});

test('十件特性装备都来自主体真实物品，各合法同类槽位都能识别', () => {
  const actual = [
    ...INITIAL_ITEMS,
    ...LOTTERY_PRIZES.map((prize) => prize.value?.item).filter(Boolean),
  ];
  assert.equal(EQUIPMENT_BATTLE_DEFINITIONS.length, 10);
  for (const definition of EQUIPMENT_BATTLE_DEFINITIONS) {
    assert.ok(
      actual.some(
        (item) =>
          item.name === definition.name &&
          item.type === definition.type &&
          definition.slots.includes(item.equipmentSlot)
      ),
      definition.name
    );
    for (const slot of definition.slots) {
      const item = makeItem(definition);
      const subject = player({
        inventory: [item],
        equippedItems: { [slot]: item.id },
      });
      assert.equal(getDungeonEquipmentTraits(subject).length, 1);
      assert.equal(
        getDungeonCardSources(subject).find(
          (source) => source.sourceId === item.id
        ).templateId,
        definition.card
      );
    }
  }
});

test('背包同名物品不冒充已装备来源，错类型、错槽、重复库存及无效数量不生效', () => {
  const definition = EQUIPMENT_BATTLE_DEFINITIONS.find(
    (entry) => entry.name === '降噪耳塞'
  );
  const item = makeItem(definition);
  const equipped = { [EquipmentSlot.Artifact1]: item.id };
  for (const subject of [
    player({ inventory: [item] }),
    player({
      inventory: [{ ...item, type: ItemType.Material }],
      equippedItems: equipped,
    }),
    player({
      inventory: [item],
      equippedItems: { [EquipmentSlot.Head]: item.id },
    }),
    player({ inventory: [item, clone(item)], equippedItems: equipped }),
    player({ inventory: [{ ...item, quantity: 0 }], equippedItems: equipped }),
    player({
      inventory: [{ ...item, quantity: 0.5 }],
      equippedItems: equipped,
    }),
    player({
      inventory: [{ ...item, isEquippable: false }],
      equippedItems: equipped,
    }),
  ]) {
    assert.equal(getDungeonEquipmentTraits(subject).length, 0);
    assert.equal(
      getDungeonCardSources(subject).filter(
        (source) => source.source === 'equipment'
      ).length,
      0
    );
  }
  const duplicatedSlots = player({
    inventory: [item],
    equippedItems: { ...equipped, [EquipmentSlot.Artifact2]: item.id },
  });
  assert.equal(getDungeonEquipmentTraits(duplicatedSlots).length, 1);
  assert.equal(
    getEquipmentBattleDefinition({ ...item, name: '其他耳塞' }),
    undefined
  );
});

test('装备被动与携带装备牌独立，卸下装备会同时停止被动并使其卡牌来源失效', () => {
  const definition = EQUIPMENT_BATTLE_DEFINITIONS.find(
    (entry) => entry.name === '青轴机械键盘'
  );
  const item = makeItem(definition);
  const subject = player({
    inventory: [item],
    equippedItems: { [EquipmentSlot.Weapon]: item.id },
  });
  const saved = createDefaultCardLoadout();
  assert.equal(
    saved.resume.some((id) => id.startsWith('equipment:')),
    false
  );
  assert.equal(resolveDungeonEquipment(subject, plan(subject)).length, 1);
  saved.library.push(`equipment:${item.id}`);
  saved.resume.push(`equipment:${item.id}`);
  assert.equal(validateDungeonLoadout(subject, saved).valid, true);
  const unequipped = { ...subject, equippedItems: {} };
  assert.equal(getDungeonEquipmentTraits(unequipped).length, 0);
  assert.equal(validateDungeonLoadout(unequipped, saved).valid, false);
  assert.throws(() => resolveDungeonCards(unequipped, plan(subject), saved));
});

test('战术的反击、留防、转攻上限按同一角色预算解析，百分比与专注不随学阶膨胀', () => {
  const subject = player();
  const prepared = plan(subject);
  const saved = createDefaultCardLoadout();
  saved.library.push(...TACTIC_DUNGEON_CARD_IDS);
  saved.resume.push(...TACTIC_DUNGEON_CARD_IDS);
  assert.equal(validateDungeonLoadout(subject, saved).valid, true);
  const budget = getDungeonCardBudgets(subject, prepared);
  const cards = resolveDungeonCards(subject, prepared, saved);
  const byId = Object.fromEntries(cards.map((card) => [card.id, card]));
  assert.equal(byId['tactic:feint'].expose, true);
  assert.equal(
    byId['tactic:riposte'].counter,
    Math.round((4 / 6) * budget.attack)
  );
  assert.equal(
    byId['tactic:reserve'].retainBlock,
    Math.round((4 / 5) * budget.defense)
  );
  assert.equal(byId['tactic:convert'].blockToDamage, 50);
  assert.equal(
    byId['tactic:convert'].blockDamageCap,
    Math.round((8 / 6) * budget.attack)
  );
  assert.equal(byId['tactic:reset'].focusGain, 1);
  assert.equal(byId['tactic:reset'].exhaust, true);
  assert.match(
    byId['tactic:riposte'].description,
    new RegExp(`反击 ${byId['tactic:riposte'].counter}`)
  );
  assert.match(
    byId['tactic:convert'].description,
    new RegExp(`上限${byId['tactic:convert'].blockDamageCap}`)
  );
  const stronger = resolveDungeonCards(
    { ...subject, attack: 480, defense: 400 },
    prepared,
    saved
  );
  assert.ok(
    stronger.find((card) => card.id === 'tactic:riposte').counter >
      byId['tactic:riposte'].counter
  );
  assert.ok(
    stronger.find((card) => card.id === 'tactic:reserve').retainBlock >
      byId['tactic:reserve'].retainBlock
  );
  assert.equal(
    stronger.find((card) => card.id === 'tactic:convert').blockToDamage,
    50
  );
  assert.equal(
    stronger.find((card) => card.id === 'tactic:reset').focusGain,
    1
  );
  assert.deepEqual(cards, clone(cards));
});

test('装备特性只读取最终角色预算，不重复计算物品属性，冻结结果不引用实时定义', () => {
  const definitions = EQUIPMENT_BATTLE_DEFINITIONS.filter((entry) =>
    [
      '青轴机械键盘',
      '军训迷彩服',
      '实验室工牌',
      '智能手环',
      '降噪耳塞',
      '运动护腕',
    ].includes(entry.name)
  );
  const inventory = definitions.map(makeItem);
  const subject = player({
    inventory,
    equippedItems: Object.fromEntries(
      inventory.map((item) => [item.equipmentSlot, item.id])
    ),
  });
  subject.equippedItems[EquipmentSlot.Artifact2] = inventory.find(
    (item) => item.name === '运动护腕'
  ).id;
  subject.equippedItems[EquipmentSlot.Artifact1] = inventory.find(
    (item) => item.name === '降噪耳塞'
  ).id;
  const original = clone(subject);
  const prepared = plan(subject);
  const resolved = resolveDungeonEquipment(subject, prepared);
  const withoutItemStats = clone(subject);
  withoutItemStats.inventory.forEach((item) => {
    item.effect = { attack: 0, defense: 0 };
  });
  assert.deepEqual(
    resolveDungeonEquipment(withoutItemStats, prepared),
    resolved
  );
  assert.deepEqual(subject, original);
  assert.equal(
    new Set(resolved.map((effect) => effect.sourceId)).size,
    resolved.length
  );
  assert.ok(
    resolved.every(
      (effect) =>
        Number.isSafeInteger(effect.amount) &&
        effect.amount >= 1 &&
        !('coefficient' in effect)
    )
  );
  assert.deepEqual(resolved, clone(resolved));
  assert.equal(
    resolved.find((effect) => effect.effect === 'opening-draw').amount,
    1
  );
  const stronger = resolveDungeonEquipment(
    { ...subject, attack: 480, defense: 400 },
    prepared
  );
  assert.ok(
    stronger.find((effect) => effect.effect === 'first-attack').amount >
      resolved.find((effect) => effect.effect === 'first-attack').amount
  );
  assert.equal(
    stronger.find((effect) => effect.effect === 'opening-draw').amount,
    1
  );
});

test('六种对手按种子稳定选择且全部可达，三步预告与特殊效果公开可读', () => {
  const originalRandom = Math.random;
  Math.random = () => {
    throw new Error('不允许全局随机');
  };
  try {
    const seen = new Set();
    for (let seed = 0; seed < 1024; seed++) {
      const id = selectDungeonEnemyArchetype(seed);
      assert.equal(id, selectDungeonEnemyArchetype(seed));
      assert.ok(ENEMY_ARCHETYPES[id]);
      seen.add(id);
    }
    assert.equal(seen.size, 6);
    for (const [id, definition] of Object.entries(ENEMY_ARCHETYPES)) {
      assert.equal(definition.id, id);
      assert.equal(definition.pattern.length, 3);
      assert.ok(definition.name && definition.description);
      for (const step of definition.pattern) {
        assert.ok(step.name && step.description);
        assert.ok(step.damageMultiplier > 0 && step.damageMultiplier <= 1.3);
        for (const field of ['piercePercent', 'healPercent', 'thornsPercent']) {
          if (step[field] !== undefined)
            assert.ok(
              Number.isInteger(step[field]) &&
                step[field] >= 0 &&
                step[field] <= 100
            );
        }
      }
    }
  } finally {
    Math.random = originalRandom;
  }
});
