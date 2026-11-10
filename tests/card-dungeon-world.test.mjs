import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialPlayer } from '../utils/playerUtils';
import { CULTIVATION_ARTS } from '../constants';
import { EquipmentSlot, ItemType, RealmType } from '../types';
import { getDungeonCardSources } from '../features/card-dungeon/sources';
import {
  createDefaultCardLoadout,
  assertCardLoadout,
  validateDungeonLoadout,
  repairDungeonLoadout,
} from '../features/card-dungeon/loadout';
import {
  resolveDungeonCards,
  getDungeonCardBudgets,
} from '../features/card-dungeon/numericAdapter';
import { createAdventureBattlePlan } from '../features/interactive/adventureBattle';
import {
  prepareDungeonExploration,
  createDungeonRandom,
} from '../features/card-dungeon/exploration';
import { applyAdventureResult } from '../utils/adventureResult';
import { generateLocalAdventureEvent } from '../utils/localEvents';

const clone = (value) => JSON.parse(JSON.stringify(value));
const player = (extra = {}) => ({
  ...createInitialPlayer('测试', 'npu:algorithm:pingmin'),
  spiritStones: 500,
  ...extra,
});
const realm = {
  id: 'realm-1',
  name: '校园实验室',
  description: '测试',
  minRealm: RealmType.QiRefining,
  cost: 10,
  riskLevel: '中',
  drops: ['咖啡豆'],
};
const plan = (subject) =>
  createAdventureBattlePlan(
    subject,
    {
      adventureType: 'secret_realm',
      realmName: realm.name,
      realmMinRealm: realm.minRealm,
      riskLevel: realm.riskLevel,
    },
    1729
  );
const item = (id, name, type, slot) => ({
  id,
  name,
  type,
  quantity: 1,
  isEquippable: true,
  equipmentSlot: slot,
  description: '',
  effect: { attack: 99999 },
});

test('主角色的全部已学课程可做来源，未知/未学课程不混入', () => {
  const subject = player({
    cultivationArts: [
      ...CULTIVATION_ARTS.map((a) => a.id),
      'unknown',
      CULTIVATION_ARTS[0].id,
    ],
  });
  const before = clone(subject);
  const sources = getDungeonCardSources(subject);
  assert.equal(
    sources.filter((s) => s.source === 'course').length,
    CULTIVATION_ARTS.length
  );
  assert.equal(sources.filter((s) => s.id.startsWith('base:')).length, 8);
  assert.equal(sources.filter((s) => s.id.startsWith('tactic:')).length, 6);
  assert.equal(new Set(sources.map((s) => s.id)).size, sources.length);
  assert.deepEqual(subject, before);
});

test('只有背包里实际装备、类型槽位匹配的四种装备可入库，同个物品只出现一次', () => {
  const gear = [
    item('key', '入门薄膜键盘', ItemType.Weapon, EquipmentSlot.Weapon),
    item('uniform', '军训迷彩服', ItemType.Armor, EquipmentSlot.Chest),
    item('ear', '降噪耳塞', ItemType.Artifact, EquipmentSlot.Artifact1),
    item('wrist', '运动护腕', ItemType.Artifact, EquipmentSlot.Artifact2),
  ];
  const subject = player({
    inventory: gear,
    equippedItems: {
      [EquipmentSlot.Weapon]: 'key',
      [EquipmentSlot.Chest]: 'uniform',
      [EquipmentSlot.Artifact1]: 'ear',
      [EquipmentSlot.Artifact2]: 'wrist',
    },
  });
  assert.equal(
    getDungeonCardSources(subject).filter((s) => s.source === 'equipment')
      .length,
    4
  );
  assert.equal(
    getDungeonCardSources({ ...subject, equippedItems: {} }).filter(
      (s) => s.source === 'equipment'
    ).length,
    0
  );
  assert.equal(
    getDungeonCardSources({
      ...subject,
      equippedItems: { [EquipmentSlot.Head]: 'key' },
    }).filter((s) => s.source === 'equipment').length,
    0
  );
  assert.equal(
    getDungeonCardSources({ ...subject, inventory: [...gear, gear[0]] }).filter(
      (s) => s.sourceId === 'key'
    ).length,
    0
  );
  assert.equal(
    getDungeonCardSources({
      ...subject,
      equippedItems: {
        [EquipmentSlot.Artifact1]: 'ear',
        [EquipmentSlot.Artifact2]: 'ear',
      },
    }).filter((s) => s.sourceId === 'ear').length,
    1
  );
});

test('默认简历八张，8—16张和至少一张进攻牌，修复必须显式执行且不递增版本', () => {
  const subject = player();
  const saved = createDefaultCardLoadout(7);
  assertCardLoadout(saved);
  assert.equal(saved.resume.length, 8);
  assert.equal(validateDungeonLoadout(subject, saved).valid, true);
  const invalid = {
    ...saved,
    library: [...saved.library, 'course:missing'],
    resume: [...saved.resume, 'course:missing'],
  };
  const before = clone(invalid);
  assert.equal(validateDungeonLoadout(subject, invalid).valid, false);
  assert.deepEqual(invalid, before);
  const repaired = repairDungeonLoadout(subject, invalid);
  assert.deepEqual(repaired, saved);
  assert.equal(repaired.revision, 7);
  assert.throws(() =>
    assertCardLoadout({ ...saved, resume: saved.resume.slice(1) })
  );
  assert.throws(() =>
    assertCardLoadout({ ...saved, resume: [...saved.resume, saved.resume[0]] })
  );
  assert.throws(() => assertCardLoadout({ ...saved, revision: -1 }));
});

test('装备卸下立即使来源失效，进入时重新验证，不追加装备/课程属性', () => {
  const subject = player({
    inventory: [
      item('key', '入门薄膜键盘', ItemType.Weapon, EquipmentSlot.Weapon),
    ],
    equippedItems: { [EquipmentSlot.Weapon]: 'key' },
  });
  const loadout = createDefaultCardLoadout();
  loadout.library.push('equipment:key');
  loadout.resume.push('equipment:key');
  assert.equal(validateDungeonLoadout(subject, loadout).valid, true);
  const frozen = resolveDungeonCards(subject, plan(subject), loadout);
  const noEffect = clone(subject);
  noEffect.inventory[0].effect = { attack: 0 };
  assert.deepEqual(
    frozen,
    resolveDungeonCards(noEffect, plan(subject), loadout)
  );
  assert.equal(
    validateDungeonLoadout({ ...subject, equippedItems: {} }, loadout).valid,
    false
  );
  assert.throws(() =>
    resolveDungeonCards(
      { ...subject, equippedItems: {} },
      plan(subject),
      loadout
    )
  );
});

test('真实角色属性和原敌人防御影响冻结牌值；防御不变成开场盾，已解析值可存档', () => {
  const subject = player({
    attack: 100,
    defense: 80,
    spirit: 30,
    physique: 40,
    speed: 30,
    cultivationArts: ['art-spirit-cloud'],
  });
  const loadout = createDefaultCardLoadout();
  loadout.library.push('course:art-spirit-cloud');
  loadout.resume.push('course:art-spirit-cloud');
  const prepared = plan(subject);
  const before = clone(subject);
  const cards = resolveDungeonCards(subject, prepared, loadout);
  assert.deepEqual(cards, clone(cards));
  assert.deepEqual(subject, before);
  assert.ok(cards.every((c) => !('scaling' in c)));
  const more = resolveDungeonCards(
    { ...subject, attack: 200, spirit: 90 },
    prepared,
    loadout
  );
  assert.ok(more[0].damage > cards[0].damage);
  assert.ok(more.at(-1).damage >= cards.at(-1).damage);
  const hard = clone(prepared);
  hard.enemy.defense = 10000;
  assert.ok(
    resolveDungeonCards(subject, hard, loadout)[0].damage <= cards[0].damage
  );
  assert.equal(
    getDungeonCardBudgets(subject, prepared).referenceRealm,
    realm.minRealm
  );
});

test('非战斗探索使用唯一共享结果更新，固定种子且不读全局随机、不二次扣费、不改入参', () => {
  const subject = player({ hp: 55, maxHp: 100, spiritStones: 490 });
  const before = clone(subject);
  const original = Math.random;
  Math.random = () => {
    throw Error('不应读取全局随机');
  };
  try {
    const actual = prepareDungeonExploration(subject, realm, 177, 123456);
    assert.deepEqual(
      actual,
      prepareDungeonExploration(subject, realm, 177, 123456)
    );
    assert.deepEqual(subject, before);
    assert.deepEqual(actual, clone(actual));
    const random = createDungeonRandom(177);
    const result = generateLocalAdventureEvent(
      subject,
      'secret_realm',
      '中',
      random
    );
    let nextId = 0;
    const expected = applyAdventureResult(subject, result, {
      adventureType: 'secret_realm',
      realmName: realm.name,
      random,
      createId: () =>
        `dungeon-${(123456).toString(36)}-${(177).toString(36)}-${nextId++}`,
    });
    assert.deepEqual(actual.player, expected.player);
    assert.equal(
      actual.player.spiritStones,
      subject.spiritStones + result.spiritStonesChange
    );
    assert.ok(actual.logs.some((l) => l.text === result.story));
  } finally {
    Math.random = original;
  }
});

test('共享更新保留抽奖券、室友、堆叠物品、属性损耗上限和课程发现', () => {
  const subject = player({
    hp: 60,
    maxHp: 100,
    attack: 100,
    defense: 100,
    spirit: 100,
    physique: 100,
    speed: 100,
    lotteryTickets: 1,
  });
  const before = clone(subject);
  const result = {
    story: '探索',
    eventColor: 'gain',
    hpChange: -20,
    expChange: 8,
    spiritStonesChange: 15,
    lotteryTicketsChange: 2,
    petObtained: 'pet-spirit-fox',
    attributeReduction: { attack: 9999, defense: 9999 },
    itemsObtained: [
      { name: '咖啡豆', type: ItemType.Herb, description: '材料' },
      { name: '咖啡豆', type: ItemType.Herb, description: '材料' },
    ],
  };
  let id = 0;
  const applied = applyAdventureResult(subject, result, {
    adventureType: 'secret_realm',
    realmName: realm.name,
    random: () => 0.99,
    createId: () => `test-${id++}`,
  });
  assert.equal(applied.player.hp, 40);
  assert.equal(applied.player.lotteryTickets, 3);
  assert.equal(applied.player.pets.length, 1);
  assert.equal(
    applied.player.inventory.find((i) => i.name === '咖啡豆').quantity,
    (subject.inventory.find((i) => i.name === '咖啡豆')?.quantity ?? 0) + 2
  );
  assert.equal(applied.player.attack, 90);
  assert.equal(applied.player.defense, 90);
  assert.deepEqual(subject, before);
  const discovered = applyAdventureResult(
    subject,
    {
      story: '课程',
      eventColor: 'gain',
      hpChange: 0,
      expChange: 0,
      spiritStonesChange: 0,
    },
    {
      adventureType: 'secret_realm',
      realmName: realm.name,
      random: () => 0,
      createId: () => `extra-${id++}`,
    }
  );
  assert.ok(
    discovered.player.cultivationArts.length > subject.cultivationArts.length
  );
});

test('入口精力不会恢复到满值，耗尽留给主游戏单次延毕，种子/时间非法拒绝', () => {
  const subject = player({ hp: 10, maxHp: 500 });
  const actual = prepareDungeonExploration(
    subject,
    { ...realm, riskLevel: '极度危险' },
    1,
    5
  );
  assert.ok(actual.player.hp <= 0);
  assert.equal(actual.player.realm, subject.realm);
  assert.equal(actual.player.maxHp, subject.maxHp);
  assert.throws(() => prepareDungeonExploration(subject, realm, -1, 5));
  assert.throws(() => prepareDungeonExploration(subject, realm, 1, NaN));
});
import { REALM_DATA, REALM_ORDER } from '../constants';
import { createCardBattle } from '../features/card-battle/engine';
import {
  createInteractiveBattle,
  autoInteractiveBattle,
} from '../features/interactive/battle';
import { runVisibleCardStrategy } from './helpers/cardDungeonStrategy.mjs';

test('跨学阶基础简历保持低风险可完成、中风险接近旧难度、高风险更难，强化有收益', () => {
  const buckets = new Map();
  for (const risk of ['低', '中', '高'])
    for (const enhanced of [false, true]) {
      const bucket = {
        oldWins: 0,
        cardWins: 0,
        oldRounds: 0,
        cardRounds: 0,
        count: 0,
      };
      for (const realmName of REALM_ORDER)
        for (const level of [1, 9]) {
          const base = REALM_DATA[realmName],
            scale = 1 + (level - 1) * 0.1;
          const subject = player({
            realm: realmName,
            realmLevel: level,
            hp: Math.floor(base.baseMaxHp * scale),
            maxHp: Math.floor(base.baseMaxHp * scale),
            attack: Math.floor(base.baseAttack * scale * (enhanced ? 1.5 : 1)),
            defense: Math.floor(
              base.baseDefense * scale * (enhanced ? 1.5 : 1)
            ),
            speed: Math.floor(base.baseSpeed * scale * (enhanced ? 1.2 : 1)),
          });
          for (let index = 1; index <= 8; index++) {
            const seed = Math.imul(index, 0x9e3779b1) >>> 0;
            const prepared = createAdventureBattlePlan(
              subject,
              {
                adventureType: 'secret_realm',
                realmMinRealm: realmName,
                riskLevel: risk,
              },
              seed
            );
            const old = autoInteractiveBattle(
              createInteractiveBattle({
                id: 'balance-regression',
                player: subject,
                enemy: prepared.enemy,
                seed,
              })
            );
            const card = runVisibleCardStrategy(
              createCardBattle({
                id: 'balance-regression',
                seed,
                player: {
                  hp: subject.hp,
                  maxHp: subject.maxHp,
                  attack: subject.attack,
                  defense: subject.defense,
                  speed: subject.speed,
                },
                enemy: prepared.enemy,
                cards: resolveDungeonCards(
                  subject,
                  prepared,
                  createDefaultCardLoadout()
                ),
              })
            );
            bucket.oldWins += Number(old.outcome === 'victory');
            bucket.cardWins += Number(card.phase === 'victory');
            bucket.oldRounds += old.completedRounds;
            bucket.cardRounds += card.turn;
            bucket.count++;
          }
        }
      buckets.set(`${risk}-${enhanced}`, bucket);
    }
  const low = buckets.get('低-false'),
    medium = buckets.get('中-false'),
    high = buckets.get('高-false');
  assert.ok(low.cardWins / low.count >= 0.9, '基础低风险应普遍可完成');
  assert.ok(
    Math.abs(medium.cardWins - medium.oldWins) / medium.count < 0.18,
    '基础中风险不应被接入突然变成稳胜或必败'
  );
  assert.ok(
    Math.abs(medium.cardRounds - medium.oldRounds) / medium.count < 2.5,
    '基础中风险节奏不能显著拖长'
  );
  assert.ok(
    high.cardWins < medium.cardWins && medium.cardWins < low.cardWins,
    '风险等级必须有实际区别'
  );
  assert.ok(
    buckets.get('高-true').cardWins > high.cardWins,
    '强化原属性应提高高风险取胜机会'
  );
});
import { prepareAnonymousDungeonExploration } from '../features/card-dungeon/exploration';

test('匿名续接保留未具名副本的风险默认值与课程发现概率，不收费、不二次降级', () => {
  const subject = player({ hp: 60, spiritStones: 123 });
  const before = clone(subject);
  for (const seed of [1, 177, 99991]) {
    const actual = prepareAnonymousDungeonExploration(subject, seed, 98765);
    const random = createDungeonRandom(seed);
    const result = generateLocalAdventureEvent(
      subject,
      'secret_realm',
      undefined,
      random
    );
    let id = 0;
    const expected = applyAdventureResult(subject, result, {
      adventureType: 'secret_realm',
      realmName: undefined,
      random,
      createId: () =>
        `dungeon-${(98765).toString(36)}-${seed.toString(36)}-${id++}`,
    });
    assert.deepEqual(actual.player, expected.player);
    assert.equal(
      actual.player.spiritStones,
      subject.spiritStones + result.spiritStonesChange
    );
    assert.equal(actual.player.realm, subject.realm);
    assert.equal(actual.continuation, undefined);
  }
  assert.deepEqual(subject, before);
});
