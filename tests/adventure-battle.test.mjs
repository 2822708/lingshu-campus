import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createAdventureBattlePlan,
  applyAdventureBattleOutcome,
  assertAdventureBattlePlan,
  applyAdventureBattleEntry,
} from '../features/interactive/adventureBattle';
import {
  createInteractiveBattle,
  autoInteractiveBattle,
  stepInteractiveBattle,
} from '../features/interactive/battle';
import { createInitialPlayer } from '../utils/playerUtils';
import { CULTIVATION_ARTS, REALM_DATA, REALM_ORDER } from '../constants';
import { RealmType, ItemType, EquipmentSlot } from '../types';

const clone = (value) => JSON.parse(JSON.stringify(value));
const player = (overrides = {}) => ({
  ...createInitialPlayer('测试', 'npu:algorithm:pingmin'),
  exp: 100,
  spiritStones: 100,
  ...overrides,
});
const plan = (subject, request = {}, seed = 1729) =>
  createAdventureBattlePlan(
    subject,
    { adventureType: 'normal', ...request },
    seed
  );
const field = (subject, prepared) =>
  createInteractiveBattle({
    id: 'current-action',
    player: subject,
    enemy: prepared.enemy,
    seed: prepared.seed,
  });
const terminal = (subject, prepared, outcome, hp = 5) => ({
  ...field(subject, prepared),
  outcome,
  player: { ...field(subject, prepared).player, hp },
});

test('所有场景战前计划同步确定、完全可序列化，不读全局随机或改写角色', () => {
  const subject = player();
  const before = clone(subject);
  const original = Math.random;
  Math.random = () => {
    throw new Error('计划必须使用固定种子');
  };
  try {
    for (const adventureType of ['normal', 'lucky', 'secret_realm']) {
      const prepared = plan(subject, {
        adventureType,
        realmDrops: ['速溶咖啡粉'],
      });
      assert.deepEqual(
        prepared,
        plan(subject, { adventureType, realmDrops: ['速溶咖啡粉'] })
      );
      assert.deepEqual(prepared, clone(prepared));
      assertAdventureBattlePlan(prepared);
      const battle = field(subject, prepared);
      assert.equal(battle.outcome, 'ongoing');
      assert.equal(battle.player.hp, subject.hp);
      assert.equal(battle.commandSeq, 0);
      assert.equal(battle.rounds.length, 0);
      assert.equal(
        applyAdventureBattleOutcome(subject, prepared, battle),
        null
      );
    }
    assert.deepEqual(subject, before);
  } finally {
    Math.random = original;
  }
});

test('普通与幸运保持学阶差异，副本按准入学阶成长并保留高阶压制', () => {
  const subject = player({ realm: RealmType.NascentSoul, realmLevel: 3 });
  assert.equal(plan(subject).enemy.realm, RealmType.NascentSoul);
  assert.equal(
    plan(subject, { adventureType: 'lucky' }).enemy.realm,
    RealmType.GoldenCore
  );
  assert.equal(
    plan(subject, { adventureType: 'secret_realm' }).enemy.realm,
    RealmType.NascentSoul
  );
  const request = {
    adventureType: 'secret_realm',
    realmMinRealm: RealmType.Foundation,
    riskLevel: '中',
  };
  const high = plan(subject, request);
  const equal = plan(
    player({ realm: RealmType.Foundation, realmLevel: 3 }),
    request
  );
  assert.equal(high.enemy.realm, RealmType.Foundation);
  assert.ok(high.enemy.attack < equal.enemy.attack);
  assert.ok(high.enemy.maxHp < equal.enemy.maxHp);
});

test('低风险副本在各准入学阶可应对，不因跨一个指数成长学阶而普遍必败', (t) => {
  for (const realm of REALM_ORDER) {
    const base = REALM_DATA[realm];
    let wins = 0;
    let rounds = 0;
    for (const level of [1, 9]) {
      const scale = 1 + (level - 1) * 0.1;
      const subject = player({
        realm,
        realmLevel: level,
        hp: Math.floor(base.baseMaxHp * scale),
        maxHp: Math.floor(base.baseMaxHp * scale),
        attack: Math.floor(base.baseAttack * scale),
        defense: Math.floor(base.baseDefense * scale),
        speed: Math.floor(base.baseSpeed * scale),
      });
      for (let index = 1; index <= 40; index++) {
        const prepared = plan(
          subject,
          {
            adventureType: 'secret_realm',
            realmMinRealm: realm,
            riskLevel: '低',
          },
          Math.imul(index, 0x9e3779b1) >>> 0
        );
        assert.equal(prepared.enemy.realm, realm);
        const ending = autoInteractiveBattle(field(subject, prepared));
        wins += Number(ending.outcome === 'victory');
        rounds += ending.completedRounds;
      }
    }
    t.diagnostic(
      `${realm}: ${wins}/80 胜，平均 ${(rounds / 80).toFixed(1)} 轮`
    );
    assert.ok(wins >= 48, `${realm} 低风险基础角色应有实际取胜机会`);
  }
});

test('相同种子下风险难度及奖励有实际区别，装备膨胀不跟涨对手', () => {
  const subject = player({ realm: RealmType.Foundation, realmLevel: 4 });
  const low = plan(subject, { adventureType: 'secret_realm', riskLevel: '低' });
  const high = plan(subject, {
    adventureType: 'secret_realm',
    riskLevel: '极度危险',
  });
  assert.ok(high.enemy.maxHp > low.enemy.maxHp);
  assert.ok(high.enemy.attack > low.enemy.attack);
  assert.ok(high.reward.exp > low.reward.exp);
  assert.deepEqual(
    high.enemy,
    plan(
      {
        ...subject,
        attack: 100000,
        defense: 100000,
        maxHp: 100000,
        hp: 100000,
      },
      { adventureType: 'secret_realm', riskLevel: '极度危险' }
    ).enemy
  );
});

test('中后期采用互动学阶基础，普通对手精力随学阶输出增长', () => {
  for (const realm of REALM_ORDER) {
    const prepared = plan(player({ realm, realmLevel: 1 }), {}, 1234567);
    assert.ok(
      prepared.enemy.maxHp >= Math.min(30, REALM_DATA[realm].baseAttack)
    );
    if (REALM_ORDER.indexOf(realm) >= 3)
      assert.ok(prepared.enemy.maxHp > REALM_DATA[realm].baseAttack);
  }
});

test('胜负奖励延续旧公式，失败扣分按实际可用余额封底', () => {
  const subject = player({ realmLevel: 3 });
  const prepared = plan(subject);
  assert.equal(prepared.reward.exp, 61);
  assert.equal(prepared.reward.spiritStones, 12);
  assert.equal(prepared.failure.exp, -31);
  assert.equal(prepared.failure.spiritStones, -7);
  const poor = player({ exp: 2, spiritStones: 1 });
  const after = applyAdventureBattleOutcome(
    poor,
    prepared,
    terminal(poor, prepared, 'defeat', 0)
  );
  assert.equal(after.player.exp, 0);
  assert.equal(after.player.spiritStones, 0);
  assert.equal(after.player.hp, 0);
  assert.match(after.changes.join('；'), /绩点 -2.*学分 -1/);
  assert.deepEqual(after.player.inventory, poor.inventory);
});

test('撤离和僵持保留本轮伤耗，不重扣副本入场费、不发战斗胜奖或追加失败扣分', () => {
  const subject = player({ spiritStones: 70 });
  const prepared = plan(subject, {
    adventureType: 'secret_realm',
    entryCost: 30,
  });
  for (const outcome of ['retreat', 'stalemate']) {
    const after = applyAdventureBattleOutcome(
      subject,
      prepared,
      terminal(subject, prepared, outcome, 12)
    );
    assert.equal(after.player.hp, 12);
    assert.equal(after.player.spiritStones, 70);
    assert.equal(after.player.exp, subject.exp);
    assert.deepEqual(after.player.inventory, subject.inventory);
    assert.match(after.feedback, /不发战斗奖励.*不追加扣分/);
  }
});

test('实际指令决定结果，序列化续战与连续操作得到相同终局和奖励', () => {
  const subject = player({
    hp: 500,
    maxHp: 500,
    attack: 40,
    defense: 8,
    speed: 30,
  });
  const prepared = plan(subject);
  const beginning = field(subject, prepared);
  const first = stepInteractiveBattle(beginning, { seq: 1, action: 'defend' });
  assert.ok(first.player.hp < beginning.player.hp);
  assert.equal(first.enemy.hp, beginning.enemy.hp);
  const continuous = autoInteractiveBattle(first);
  const restored = autoInteractiveBattle(clone(first));
  assert.deepEqual(restored, continuous);
  assert.deepEqual(
    applyAdventureBattleOutcome(subject, prepared, restored),
    applyAdventureBattleOutcome(clone(subject), clone(prepared), continuous)
  );
});

test('强制战斗奇遇追加奖励仅在胜利到账，名称与数量都固定', () => {
  const subject = player();
  const encounter = {
    id: 'old-battle',
    name: '旧机缘',
    description: '测试挑战',
    rarity: '普通',
    triggerChance: 1,
    battle: { difficulty: '高', enemyName: '测试对手', enemyTitle: '严谨的' },
    rewards: {
      exp: 20,
      spiritStones: 10,
      items: [{ name: '万能板', rarity: '普通', quantity: 2 }],
    },
  };
  const prepared = plan(subject, { battleEncounter: encounter });
  assert.equal(prepared.enemy.name, '测试对手');
  assert.equal(prepared.reward.exp, 57);
  assert.equal(prepared.reward.spiritStones, 18);
  const wins = applyAdventureBattleOutcome(
    subject,
    prepared,
    terminal(subject, prepared, 'victory')
  );
  const before =
    subject.inventory.find((item) => item.name === '万能板')?.quantity ?? 0;
  assert.equal(
    wins.player.inventory.find((item) => item.name === '万能板').quantity,
    before +
      2 +
      prepared.reward.items.filter((item) => item.name === '万能板').length -
      2
  );
  for (const outcome of ['defeat', 'retreat', 'stalemate']) {
    const after = applyAdventureBattleOutcome(
      subject,
      prepared,
      terminal(subject, prepared, outcome)
    );
    assert.deepEqual(after.player.inventory, subject.inventory);
  }
});

test('独立纯奖励机缘与战斗胜奖分开显示，战败仍保留已遇机缘的奖励', () => {
  const subject = player({ exp: 100, spiritStones: 100 });
  const prepared = plan(subject, {
    rewardEncounter: {
      story: '校园志愿活动补贴',
      hpChange: 20,
      expChange: 10,
      spiritStonesChange: 5,
      eventColor: 'special',
      itemObtained: {
        name: '鲜牛奶',
        type: '食材',
        description: '补贴',
        rarity: '普通',
      },
    },
  });
  const after = applyAdventureBattleOutcome(
    subject,
    prepared,
    terminal(subject, prepared, 'defeat', 9)
  );
  assert.equal(after.player.exp, 100 + prepared.failure.exp + 10);
  assert.equal(
    after.player.spiritStones,
    100 + prepared.failure.spiritStones + 5
  );
  assert.equal(
    after.player.hp,
    9,
    '旧叠加路径不叠hpChange，不能让机缘补贴改写伤耗'
  );
  assert.match(after.feedback, /独立校园机缘.*校园志愿活动补贴/);
  assert.equal(
    after.player.inventory.find((item) => item.name === '鲜牛奶').quantity,
    (subject.inventory.find((item) => item.name === '鲜牛奶')?.quantity ?? 0) +
      1
  );
});

test('副本专属掉落继续兑现，属性与配方在计划中已完整确定', () => {
  const subject = player({ realm: RealmType.GoldenCore });
  let dedicated = false;
  let recipe = false;
  for (let seed = 1; seed < 160 && (!dedicated || !recipe); seed += 1) {
    const prepared = plan(
      subject,
      {
        adventureType: 'secret_realm',
        riskLevel: '极度危险',
        realmDrops: ['实验室示波器'],
      },
      seed
    );
    assertAdventureBattlePlan(clone(prepared));
    for (const item of prepared.reward.items) {
      if (item.name === '实验室示波器') {
        dedicated = true;
        assert.equal(item.type, ItemType.Artifact);
        assert.ok(item.effect.attack > 0);
        assert.ok(item.isEquippable);
      }
      if (item.type === ItemType.Recipe) {
        recipe = true;
        assert.ok(item.recipeData.ingredients.length);
      }
    }
  }
  assert.ok(dedicated);
  assert.ok(recipe);
});

test('材料叠加，装备和配方独立占格，纯结算不修改玩家、计划或战斗输入', () => {
  const subject = player({
    inventory: [
      {
        id: 'owned-board',
        name: '万能板',
        type: ItemType.Material,
        description: '',
        quantity: 3,
      },
    ],
  });
  const prepared = plan(subject);
  prepared.reward.items = [
    {
      id: 'm',
      name: '万能板',
      type: ItemType.Material,
      description: '',
      quantity: 2,
    },
    ...[1, 2].map((id) => ({
      id: `weapon-${id}`,
      name: '测试键盘',
      type: ItemType.Weapon,
      description: '',
      quantity: 1,
      isEquippable: true,
      equipmentSlot: EquipmentSlot.Weapon,
      effect: { attack: 5 },
    })),
    ...[1, 2].map((id) => ({
      id: `recipe-${id}`,
      name: '测试配方',
      type: ItemType.Recipe,
      description: '',
      quantity: 1,
    })),
  ];
  const battle = terminal(subject, prepared, 'victory');
  const before = clone({ subject, prepared, battle });
  const after = applyAdventureBattleOutcome(subject, prepared, battle);
  assert.equal(
    after.player.inventory.find((item) => item.name === '万能板').quantity,
    5
  );
  assert.equal(
    after.player.inventory.filter((item) => item.name === '测试键盘').length,
    2
  );
  assert.equal(
    after.player.inventory.filter((item) => item.name === '测试配方').length,
    2
  );
  assert.equal(
    new Set(after.player.inventory.map((item) => item.id)).size,
    after.player.inventory.length
  );
  assert.deepEqual({ subject, prepared, battle }, before);
});

test('预抽课程在胜败后保持原有发现，精力归零不会被课程加成复活，撤离不刷发现', () => {
  const subject = player({ cultivationArts: [] });
  const prepared = plan(subject);
  const art = CULTIVATION_ARTS.find((item) => item.effects.hp > 0);
  prepared.discoveries = { artId: art.id };
  for (const outcome of ['victory', 'defeat']) {
    const after = applyAdventureBattleOutcome(
      subject,
      prepared,
      terminal(subject, prepared, outcome, 0)
    );
    assert.ok(after.player.cultivationArts.includes(art.id));
    assert.equal(after.player.hp, 0);
    assert.equal(after.player.maxHp, subject.maxHp + art.effects.hp);
  }
  assert.deepEqual(
    applyAdventureBattleOutcome(
      subject,
      prepared,
      terminal(subject, prepared, 'retreat')
    ).player.cultivationArts,
    []
  );
  assert.deepEqual(
    applyAdventureBattleOutcome(
      subject,
      prepared,
      terminal(subject, prepared, 'defeat')
    ).player.pets,
    subject.pets
  );
});

test('存档计划拒绝无效场景、费用、奖励物品、敌人或渲染文本', () => {
  const prepared = plan(player());
  const invalid = [
    (value) => (value.seed = -1),
    (value) => (value.request.adventureType = 'unknown'),
    (value) => (value.request.riskLevel = 'unknown'),
    (value) => (value.request.realmMinRealm = 'unknown'),
    (value) => (value.request.entryCost = -2),
    (value) => (value.enemy.name = {}),
    (value) => (value.enemy.attack = Infinity),
    (value) => (value.reward.exp = '12'),
    (value) => (value.reward.items = [{}]),
    (value) => (value.independentReward.spiritStones = NaN),
    (value) => (value.request.rewardEncounter = { story: {} }),
    (value) => (value.story = {}),
  ];
  for (const mutate of invalid) {
    const corrupted = clone(prepared);
    mutate(corrupted);
    assert.throws(() => assertAdventureBattlePlan(corrupted), /战斗计划/);
  }
});

const huntRequest = (extra = {}) => ({
  adventureType: 'normal',
  entryCost: 7,
  sectTask: {
    sectId: 'club-1',
    day: '2026-10-21',
    task: {
      id: 'hunt-1',
      name: '社团联调挑战',
      description: '逐轮完成联调',
      type: 'hunt',
      timeCost: 'short',
      cost: { spiritStones: 7, items: [{ name: '万能板', quantity: 2 }] },
      reward: {
        contribution: 40,
        exp: 20,
        spiritStones: 10,
        items: [{ name: '报废芯片', quantity: 3 }],
      },
    },
  },
  ...extra,
});

test('社团挑战开始时一次预占次数与实际费用，胜利仅发任务精确奖励', () => {
  const subject = player({
    sectId: 'club-1',
    sectContribution: 5,
    inventory: [
      {
        id: 'board',
        name: '万能板',
        type: ItemType.Material,
        description: '',
        quantity: 3,
      },
    ],
    dailyTaskCount: { instant: 0, short: 2, medium: 0, long: 0 },
    lastTaskResetDate: '2026-10-21',
  });
  const prepared = plan(subject, huntRequest());
  assertAdventureBattlePlan(prepared);
  assert.equal(prepared.reward.exp, 20);
  assert.equal(prepared.reward.spiritStones, 10);
  assert.equal(prepared.reward.contribution, 40);
  assert.deepEqual(prepared.discoveries, {});
  const paid = applyAdventureBattleEntry(subject, prepared);
  assert.equal(paid.spiritStones, 93);
  assert.equal(paid.inventory[0].quantity, 1);
  assert.equal(paid.dailyTaskCount.short, 3);
  const after = applyAdventureBattleOutcome(
    paid,
    prepared,
    terminal(paid, prepared, 'victory')
  );
  assert.equal(after.player.spiritStones, 103);
  assert.equal(after.player.exp, 120);
  assert.equal(after.player.sectContribution, 45);
  assert.equal(
    after.player.inventory.find((item) => item.name === '报废芯片').quantity,
    3
  );
  assert.equal(after.player.inventory.length, 2);
  assert.equal(after.player.dailyTaskCount.short, 3);
  assert.match(after.changes.join('；'), /社团贡献 \+40/);
  assert.equal(subject.inventory[0].quantity, 3);
  for (const outcome of ['defeat', 'retreat', 'stalemate']) {
    const failed = applyAdventureBattleOutcome(
      paid,
      prepared,
      terminal(paid, prepared, outcome)
    );
    assert.equal(failed.player.exp, paid.exp);
    assert.equal(failed.player.spiritStones, paid.spiritStones);
    assert.equal(failed.player.sectContribution, paid.sectContribution);
    assert.deepEqual(failed.player.inventory, paid.inventory);
  }
});

test('社团挑战校验成员、当日限额与合计材料成本，拒绝时不改变原数据', () => {
  const subject = player({
    sectId: 'club-1',
    inventory: [
      {
        id: 'board',
        name: '万能板',
        type: ItemType.Material,
        description: '',
        quantity: 3,
      },
    ],
    dailyTaskCount: { instant: 0, short: 10, medium: 0, long: 0 },
    lastTaskResetDate: '2026-10-21',
  });
  const prepared = plan(subject, huntRequest());
  assert.throws(() => applyAdventureBattleEntry(subject, prepared), /次数/);
  assert.throws(
    () =>
      applyAdventureBattleEntry({ ...subject, sectId: 'club-other' }, prepared),
    /资格/
  );
  assert.throws(
    () => applyAdventureBattleEntry({ ...subject, spiritStones: 2 }, prepared),
    /学分/
  );
  const yesterday = { ...subject, lastTaskResetDate: '2026-10-20' };
  const paid = applyAdventureBattleEntry(yesterday, prepared);
  assert.equal(paid.dailyTaskCount.short, 1);
  prepared.request.sectTask.task.cost.items.push({
    name: '万能板',
    quantity: 2,
  });
  assert.throws(() => applyAdventureBattleEntry(yesterday, prepared), /4 个/);
  assert.equal(yesterday.inventory[0].quantity, 3);
  assert.equal(yesterday.spiritStones, 100);
});

test('不同父行动即使随机种子相同也生成独立的装备实例', () => {
  const subject = player({ inventory: [] });
  const prepared = plan(subject);
  prepared.reward.items = [
    {
      id: 'seed-slot-1',
      name: '测试键盘',
      type: ItemType.Weapon,
      description: '',
      quantity: 1,
      isEquippable: true,
      equipmentSlot: EquipmentSlot.Weapon,
    },
  ];
  const battle = terminal(subject, prepared, 'victory');
  const first = applyAdventureBattleOutcome(subject, prepared, {
    ...battle,
    id: 'parent-1',
  });
  const second = applyAdventureBattleOutcome(first.player, prepared, {
    ...battle,
    id: 'parent-2',
  });
  assert.equal(second.player.inventory.length, 2);
  assert.equal(new Set(second.player.inventory.map((item) => item.id)).size, 2);
});
