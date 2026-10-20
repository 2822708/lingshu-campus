import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ENCOUNTER_IDS,
  createInteractiveEncounter,
  describeEncounterChanges,
  getEncounterChoiceAvailability,
  isEncounterId,
  resolveEncounterChoice,
} from '../features/interactive/encounters';
import { createInitialPlayer } from '../utils/playerUtils';
import { REALM_DATA, REALM_ORDER } from '../constants';
import { RealmType } from '../types';

function player(overrides = {}) {
  return {
    ...createInitialPlayer('试作同学', 'npu:algorithm:pingmin'),
    hp: 80,
    maxHp: 100,
    spiritStones: 30,
    exp: 7,
    ...overrides,
  };
}
const roommate = (id = 'roommate-a', affection = 50) => ({
  id,
  name: id,
  species: '同窗',
  level: 1,
  exp: 0,
  maxExp: 10,
  rarity: '普通',
  stats: { attack: 1, defense: 1, hp: 10, speed: 1 },
  skills: [],
  evolutionStage: 0,
  affection,
});

test('首版六机缘中四个非战斗、两个可选挑战；每项成本奖励为非负整数且总量有限', () => {
  const start = player();
  assert.equal(ENCOUNTER_IDS.length, 6);
  let battleEvents = 0;
  for (const id of ENCOUNTER_IDS) {
    const event = createInteractiveEncounter(id, start);
    assert.equal(isEncounterId(id), true);
    assert.equal(event.id, id);
    assert.ok(event.title && event.story);
    assert.ok(event.choices.length >= 3 && event.choices.length <= 4);
    assert.equal(
      new Set(event.choices.map((item) => item.id)).size,
      event.choices.length
    );
    const fights = event.choices.filter((item) => item.battle);
    assert.ok(fights.length <= 1);
    battleEvents += Number(fights.length > 0);
    for (const item of event.choices) {
      for (const value of Object.values(item.cost).concat(
        Object.values(item.reward)
      )) {
        assert.ok(Number.isSafeInteger(value) && value >= 0);
      }
      assert.equal(getEncounterChoiceAvailability(item, start).available, true);
    }
    assert.equal(event.choices.at(-1).id, 'leave');
  }
  assert.equal(battleEvents, 2);
  assert.equal(isEncounterId('invented-event'), false);
});

test('排查路线与协作路线具有实际不同成本，返回真实差额且不改写原角色', () => {
  const start = player();
  const original = structuredClone(start);
  const event = createInteractiveEncounter('lab-device', start);
  const diagnosis = resolveEncounterChoice(event, 'diagnose', start);
  const cooperate = resolveEncounterChoice(event, 'cooperate', start);
  assert.equal(diagnosis.status, 'settled');
  assert.equal(cooperate.status, 'settled');
  assert.equal(diagnosis.player.hp, 74);
  assert.equal(diagnosis.player.exp, 17);
  assert.equal(diagnosis.player.spiritStones, 30);
  assert.equal(cooperate.player.hp, 77);
  assert.equal(cooperate.player.exp, 13);
  assert.equal(cooperate.player.spiritStones, 26);
  assert.equal(diagnosis.facts['lab-diagnosed'], true);
  assert.equal(cooperate.facts['lab-cooperated'], true);
  assert.deepEqual(start, original);
  assert.equal(describeEncounterChanges(diagnosis.changes), '精力-6，绩点+10');
});

test('完成排查后下一次相同机缘出现省精力的新选项，未经选择不会解锁', () => {
  const start = player();
  const initial = createInteractiveEncounter('lab-device', start);
  assert.equal(
    initial.choices.some((item) => item.id === 'apply-notes'),
    false
  );
  const settled = resolveEncounterChoice(initial, 'diagnose', start);
  const next = createInteractiveEncounter(
    'lab-device',
    settled.player,
    settled.facts
  );
  assert.equal(
    next.choices.some((item) => item.id === 'diagnose'),
    false
  );
  const reused = resolveEncounterChoice(next, 'apply-notes', settled.player);
  assert.equal(reused.status, 'settled');
  assert.equal(reused.changes.hp, -2);
  assert.equal(reused.facts['lab-notes-used'], true);
  assert.equal(reused.player.exp - settled.player.exp, 10);
});

test('战斗选项只进入现场，不发胜利总奖励；胜败标记分离', () => {
  const start = player();
  const event = createInteractiveEncounter('lab-device', start);
  const chosen = resolveEncounterChoice(event, 'challenge', start);
  assert.equal(chosen.status, 'battle');
  assert.equal(chosen.player.exp, start.exp);
  assert.equal(chosen.player.spiritStones, start.spiritStones);
  assert.deepEqual(chosen.changes, {
    hp: 0,
    exp: 0,
    spiritStones: 0,
    affection: 0,
  });
  assert.deepEqual(chosen.choice.reward, { exp: 24, spiritStones: 8 });
  assert.equal(chosen.choice.battle.victoryFacts['lab-challenge-won'], true);
  assert.equal(
    chosen.choice.battle.unfinishedFacts['lab-challenge-won'],
    undefined
  );
  assert.equal(
    chosen.choice.battle.unfinishedFacts['lab-challenge-unfinished'],
    true
  );
  const next = createInteractiveEncounter(
    'lab-device',
    start,
    chosen.choice.battle.victoryFacts
  );
  assert.equal(
    next.choices.find((item) => item.id === 'challenge').label,
    '接受进阶联调'
  );
});

test('不足费用不扣成负数；精力须保留一点，不能预借本次收益抵扣费用', () => {
  const start = player({ hp: 3, spiritStones: 3 });
  const event = createInteractiveEncounter('lab-device', start);
  const denied = resolveEncounterChoice(event, 'cooperate', start);
  assert.equal(denied.status, 'rejected');
  assert.match(denied.reason, /精力还差1/);
  assert.match(denied.reason, /学分还差1/);
  assert.equal(start.hp, 3);
  assert.equal(start.spiritStones, 3);
  assert.equal(
    resolveEncounterChoice(event, 'diagnose', player({ hp: 6 })).status,
    'rejected'
  );
  assert.equal(
    resolveEncounterChoice(event, 'diagnose', player({ hp: 7 })).player.hp,
    1
  );
  const hypothetical = {
    ...event.choices[2],
    cost: { hp: 0, spiritStones: 4 },
    reward: { exp: 0, spiritStones: 100 },
  };
  assert.equal(
    getEncounterChoiceAvailability(hypothetical, start).available,
    false
  );
});

test('提交时读取新快照：准备时够用不代表当前够用；补足后同一选项可提交', () => {
  const event = createInteractiveEncounter('lab-device', player());
  const selected = event.choices.find((item) => item.id === 'cooperate');
  assert.equal(
    getEncounterChoiceAvailability(selected, player({ spiritStones: 3 }))
      .available,
    false
  );
  assert.equal(
    resolveEncounterChoice(event, 'cooperate', player({ spiritStones: 4 }))
      .player.spiritStones,
    0
  );
});

test('合作只绑定原有室友并按封顶实际增加；绑定室友消失不转赠', () => {
  const start = player({
    pets: [roommate('a', 99), roommate('b')],
    activePetId: 'a',
  });
  const event = createInteractiveEncounter('lab-device', start);
  const option = event.choices.find((item) => item.id === 'cooperate');
  assert.equal(option.roommateId, 'a');
  assert.equal(option.affectionGain, 1);
  const result = resolveEncounterChoice(event, 'cooperate', start);
  assert.equal(result.player.pets[0].affection, 100);
  assert.equal(result.player.pets[1].affection, 50);
  assert.equal(result.changes.affection, 1);
  assert.equal(start.pets[0].affection, 99);
  const vanished = resolveEncounterChoice(
    event,
    'cooperate',
    player({ pets: [roommate('b')], activePetId: 'b' })
  );
  assert.equal(vanished.status, 'rejected');
  assert.match(vanished.reason, /不能将合作转交他人/);
});

test('没有室友时明确同学协作，不创建角色或发放默契；完成后可复测', () => {
  const start = player({ pets: [], activePetId: null });
  const event = createInteractiveEncounter('lab-device', start);
  const option = event.choices.find((item) => item.id === 'cooperate');
  assert.match(option.label, /同学/);
  assert.equal(option.roommateId, undefined);
  assert.equal(option.affectionGain, 0);
  const result = resolveEncounterChoice(event, 'cooperate', start);
  assert.deepEqual(result.player.pets, []);
  assert.equal(result.changes.affection, 0);
  assert.equal(result.facts['lab-partner'], 'classmate');
  const next = createInteractiveEncounter(
    'lab-device',
    result.player,
    result.facts
  );
  assert.equal(
    next.choices.some((item) => item.id === 'retest'),
    true
  );
  assert.equal(
    next.choices.some((item) => item.id === 'cooperate'),
    false
  );
});

test('所有机缘离开不扣费不发奖励，不产生完成或合作事实', () => {
  const start = player({ hp: 1, spiritStones: 0 });
  for (const id of ENCOUNTER_IDS) {
    const result = resolveEncounterChoice(
      createInteractiveEncounter(id, start),
      'leave',
      start
    );
    assert.equal(result.status, 'settled');
    assert.deepEqual(result.player, start);
    assert.deepEqual(result.facts, {});
    assert.equal(describeEncounterChanges(result.changes), '资源无变化');
  }
});

test('四个非战斗事件的笔记或路线在下一次关联事件兑现为新选项', () => {
  const start = player();
  for (const [id, first, second] of [
    ['study-table', 'prepare', 'explain-notes'],
    ['library-notes', 'index', 'reuse-index'],
    ['club-poster', 'draft', 'reuse-draft'],
    ['campus-errand', 'deliver', 'known-route'],
  ]) {
    const event = createInteractiveEncounter(id, start);
    const before = event.choices.find((item) => item.id === first);
    const result = resolveEncounterChoice(event, first, start);
    const next = createInteractiveEncounter(id, result.player, result.facts);
    const unlocked = next.choices.find((item) => item.id === second);
    assert.ok(unlocked, id);
    assert.ok(unlocked.cost.hp < before.cost.hp, id);
    assert.equal(
      next.choices.some((item) => item.id === first),
      false
    );
  }
});

test('旁观记录在下次邀请实际提示对手意图，未完成挑战不伪装胜利', () => {
  const start = player();
  const event = createInteractiveEncounter('practice-invitation', start);
  const result = resolveEncounterChoice(event, 'observe', start);
  const next = createInteractiveEncounter(
    'practice-invitation',
    result.player,
    result.facts
  );
  assert.match(next.story, /你上次的笔记提醒/);
  assert.equal(
    next.choices.find((item) => item.id === 'challenge').battle.archetype,
    'balanced'
  );
  const unfinished = createInteractiveEncounter('lab-device', start, {
    'lab-challenge-unfinished': true,
  });
  assert.match(unfinished.story, /还没有完成/);
  assert.equal(
    unfinished.choices.find((item) => item.id === 'challenge').label,
    '直接联调，挑战核心'
  );
});

test('未知选择和负数或非有限输入被拒绝，领域计算不能用无效成本创造资源', () => {
  const start = player();
  const event = createInteractiveEncounter('lab-device', start);
  assert.equal(
    resolveEncounterChoice(event, 'nonexistent', start).status,
    'rejected'
  );
  for (const invalid of [-1, NaN, Infinity, 0.5]) {
    const damaged = structuredClone(event);
    damaged.choices[0].cost.hp = invalid;
    assert.equal(
      resolveEncounterChoice(damaged, 'diagnose', start).status,
      'rejected'
    );
  }
  for (const hp of [-1, NaN, Infinity]) {
    assert.equal(
      resolveEncounterChoice(event, 'diagnose', player({ hp })).status,
      'rejected'
    );
  }
  assert.equal(
    resolveEncounterChoice(event, 'challenge', player({ hp: 0 })).status,
    'rejected'
  );
});

test('机缘和后续事实可JSON往返；一次创建不依赖随机数或模型', () => {
  const start = player({ pets: [roommate()], activePetId: 'roommate-a' });
  for (const id of ENCOUNTER_IDS) {
    const created = createInteractiveEncounter(id, start);
    const restored = JSON.parse(JSON.stringify(created));
    assert.deepEqual(
      restored,
      JSON.parse(JSON.stringify(createInteractiveEncounter(id, start)))
    );
    for (const option of restored.choices) {
      const result = resolveEncounterChoice(restored, option.id, start);
      assert.notEqual(result.status, 'rejected');
    }
  }
});

test('高学阶机缘按基础精力和升级基数缩放，学分温和递增，离开仍然全零', () => {
  const start = player({
    realm: RealmType.VoidRefining,
    realmLevel: 4,
    hp: 260000,
    maxHp: 260000,
    spiritStones: 100,
  });
  const event = createInteractiveEncounter('lab-device', start);
  const diagnosis = event.choices.find((item) => item.id === 'diagnose');
  const challenge = event.choices.find((item) => item.id === 'challenge');
  const cooperate = event.choices.find((item) => item.id === 'cooperate');
  assert.equal(diagnosis.cost.hp, 15600);
  assert.equal(diagnosis.reward.exp, 65000);
  assert.equal(challenge.reward.exp, 156000);
  assert.equal(challenge.reward.spiritStones, 22);
  assert.equal(cooperate.cost.spiritStones, 11);
  const settled = resolveEncounterChoice(event, 'diagnose', start);
  assert.equal(settled.player.hp, start.hp - 15600);
  assert.equal(settled.player.exp, start.exp + 65000);
  assert.ok(challenge.reward.exp / REALM_DATA[start.realm].maxExpBase > 0.1);
  assert.deepEqual(event.choices.at(-1).cost, { hp: 0, spiritStones: 0 });
  assert.deepEqual(event.choices.at(-1).reward, { exp: 0, spiritStones: 0 });
  assert.ok(REALM_ORDER.indexOf(start.realm) > 0);
});

test('机缘快照不随换装或当前exp/maxExp追涨，首阶1层初始成本收益保持原值', () => {
  const start = player({ realm: RealmType.ImmortalAscension, realmLevel: 9 });
  const upgradedEquipment = {
    ...start,
    hp: 999999999,
    maxHp: 999999999,
    exp: 99999999,
    maxExp: 999999999,
    attack: start.attack * 100,
    defense: start.defense * 100,
    equippedItems: { ...start.equippedItems, boots: 'sample-equipment' },
  };
  for (const id of ENCOUNTER_IDS) {
    assert.deepEqual(
      createInteractiveEncounter(id, start),
      createInteractiveEncounter(id, upgradedEquipment)
    );
  }
  const first = createInteractiveEncounter('lab-device', player());
  assert.equal(first.choices[0].cost.hp, 6);
  assert.equal(first.choices[0].reward.exp, 10);
  assert.equal(first.choices[1].reward.exp, 24);
  assert.equal(first.choices[1].reward.spiritStones, 8);
});
