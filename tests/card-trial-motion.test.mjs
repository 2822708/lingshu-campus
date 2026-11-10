import test from 'node:test';
import assert from 'node:assert/strict';
import { ENEMIES, STARTER_DECK } from '../prototypes/card-trial/catalog';
import { REALM_ORDER } from '../constants';
import {
  createDemoProfile,
  createTrialBuild,
  getAvailableEntries,
} from '../prototypes/card-trial/loadout';
import {
  assertTrialState,
  createTrial,
  INITIAL_HP,
  getEnemyIntent,
  reduceTrial,
} from '../prototypes/card-trial/engine';
import { createTrialMotion } from '../prototypes/card-trial/motion';

function arrange(state, cardIds) {
  const remaining = state.deck.map((entry) => entry.id);
  state.battle.hand = cardIds.map((cardId) => {
    const index = remaining.findIndex(
      (id) => state.deck.find((entry) => entry.id === id).cardId === cardId
    );
    assert.ok(index >= 0, '牌组缺少 ' + cardId);
    return remaining.splice(index, 1)[0];
  });
  state.battle.drawPile = remaining;
  state.battle.discardPile = [];
  state.battle.exhaustPile = [];
  return state;
}

/** 定向局面控制已存在牌的手牌、精力和防护，仍经过完整协议校验。 */
function fixture(
  additions = [],
  hand = ['strike', 'guard', 'break', 'prepare']
) {
  const state = createTrial({ seed: 271828, runId: 'motion-fixture' });
  state.chosenCards = [...additions];
  state.stage = additions.length;
  state.summaries = additions.map((_, stage) => ({
    stage,
    turns: 4,
    hpBefore: INITIAL_HP,
    hpAfter: INITIAL_HP,
  }));
  state.deck.push(
    ...additions.map((cardId, index) => ({
      id: state.runId + ':card:' + (STARTER_DECK.length + index),
      cardId,
    }))
  );
  state.battle.enemyHp = ENEMIES[state.stage].maxHp;
  arrange(state, hand);
  assertTrialState(state);
  return state;
}

function playCommand(state, cardId) {
  const instance = state.battle.hand.find(
    (id) => state.deck.find((entry) => entry.id === id).cardId === cardId
  );
  assert.ok(instance, '手牌缺少 ' + cardId);
  return {
    type: 'play',
    cardInstanceId: instance,
    runId: state.runId,
    seq: state.commandSeq + 1,
  };
}

function transfer(previous, command) {
  assertTrialState(previous);
  const next = reduceTrial(previous, command);
  assert.notEqual(next, previous, '测试场景须产生真实、被接受的操作');
  assertTrialState(next);
  const beforeSnapshot = structuredClone(previous);
  const afterSnapshot = structuredClone(next);
  const cue = createTrialMotion(previous, next, command);
  assert.ok(cue, '合法操作应有可见反馈');
  assert.deepEqual(previous, beforeSnapshot, '反馈生成不应修改旧现场');
  assert.deepEqual(next, afterSnapshot, '反馈生成不应修改已保存新现场');
  return { next, cue, command };
}

test('命中浮字取真实精力差额，包含过量伤害裁剪', () => {
  const ordinary = fixture();
  const result = transfer(ordinary, playCommand(ordinary, 'strike'));
  assert.equal(result.cue.action, 'attack');
  assert.equal(result.cue.actor, 'player');
  assert.equal(
    result.cue.enemyDamage,
    ordinary.battle.enemyHp - result.next.battle.enemyHp
  );
  assert.equal(result.cue.enemyDamage, 6);
  assert.equal(result.cue.playerDamage, 0);
  assert.equal(result.cue.cardId, 'strike');

  const low = fixture();
  low.battle.enemyHp = 2;
  const finished = transfer(low, playCommand(low, 'strike'));
  assert.equal(finished.cue.enemyDamage, 2);
  assert.equal(finished.cue.action, 'attack');
  assert.equal(finished.cue.outcome, 'victory');
});

test('敌方完全防住时显示实际抵消，不能伪装为精力受伤', () => {
  const state = fixture();
  state.battle.enemyBlock = 10;
  const { cue, next } = transfer(state, playCommand(state, 'strike'));
  assert.equal(next.battle.enemyHp, state.battle.enemyHp);
  assert.equal(cue.enemyDamage, 0);
  assert.equal(cue.playerDamage, 0);
  assert.equal(cue.blocked, 6);
  assert.equal(cue.brokeBlock, 0);
});

test('破防将清除量与命中量分开，不把被移除的盾当作吸收', () => {
  const state = fixture();
  state.battle.enemyBlock = 10;
  const { cue } = transfer(state, playCommand(state, 'break'));
  assert.equal(cue.action, 'attack');
  assert.equal(cue.brokeBlock, 10);
  assert.equal(cue.enemyDamage, 9);
  assert.equal(cue.blocked, 0);
});

test('防御反馈取本次获得的防护，不显示累计防护为本次增量', () => {
  const state = fixture();
  state.player.block = 4;
  const { cue, next } = transfer(state, playCommand(state, 'guard'));
  assert.equal(next.player.block, 9);
  assert.equal(cue.action, 'guard');
  assert.equal(cue.playerBlock, 5);
  assert.equal(cue.blocked, 0);
  assert.equal(cue.playerDamage, 0);
  assert.equal(cue.enemyDamage, 0);
});

test('治疗反馈按精力上限裁剪，蓄势单独反馈且不伪造攻击', () => {
  const hurt = fixture(['recover'], ['recover', 'strike', 'guard', 'prepare']);
  hurt.player.hp = INITIAL_HP - 2;
  const healed = transfer(hurt, playCommand(hurt, 'recover'));
  assert.equal(healed.cue.action, 'heal');
  assert.equal(healed.cue.healed, 2);
  assert.equal(healed.next.player.hp, INITIAL_HP);
  assert.equal(healed.cue.enemyDamage, 0);

  const windup = fixture(['windup'], ['windup', 'strike', 'guard', 'prepare']);
  const charged = transfer(windup, playCommand(windup, 'windup'));
  assert.equal(charged.cue.action, 'charge');
  assert.equal(charged.next.player.nextAttackBonus, 6);
  assert.equal(charged.cue.enemyDamage, 0);
  assert.equal(charged.cue.playerDamage, 0);
});

test('抽牌反馈取实际抽入数量，牌堆耗尽时不捏造抽到的牌', () => {
  const state = fixture();
  const { cue, next } = transfer(state, playCommand(state, 'prepare'));
  assert.equal(cue.action, 'draw');
  assert.equal(
    cue.drawn,
    next.battle.hand.length - state.battle.hand.length + 1
  );
  assert.equal(cue.drawn, 2);

  const exhausted = fixture();
  arrange(exhausted, [...STARTER_DECK]);
  const none = transfer(exhausted, playCommand(exhausted, 'prepare'));
  assert.equal(none.cue.drawn, 0);
});

test('敌人行动反馈按实际来袭计算抵消，未用完防护清空不等于减免', () => {
  const state = fixture();
  state.player.block = 10;
  const { cue, next } = transfer(state, {
    runId: state.runId,
    seq: 1,
    type: 'end-turn',
  });
  assert.equal(next.player.block, 0);
  assert.equal(cue.action, 'enemy-turn');
  assert.equal(cue.playerDamage, 0);
  assert.equal(cue.blocked, 6);
  assert.equal(cue.drawn, next.battle.hand.length - state.battle.hand.length);
  assert.equal(cue.drawn, 4);
  assert.equal(cue.enemyDamage, 0);
});

test('敌人调整零伤回合不显示受伤或防护减免', () => {
  const state = fixture();
  state.battle.turn = 3;
  state.player.block = 10;
  const { cue, next } = transfer(state, {
    runId: state.runId,
    seq: 1,
    type: 'end-turn',
  });
  assert.equal(next.player.hp, state.player.hp);
  assert.equal(cue.playerDamage, 0);
  assert.equal(cue.blocked, 0);
  assert.equal(cue.enemyBlock, 0);
});

test('敌人致败最后一击保留实际损耗和原因，不抽下一回合的牌', () => {
  const state = fixture();
  state.player.hp = 2;
  const { cue, next } = transfer(state, {
    runId: state.runId,
    seq: 1,
    type: 'end-turn',
  });
  assert.equal(next.phase, 'defeat');
  assert.equal(cue.action, 'enemy-turn');
  assert.equal(cue.outcome, 'defeat');
  assert.equal(cue.playerDamage, 2);
  assert.equal(cue.drawn, 0);
});

test('换场选牌只有奖励与实际休整，不把新敌人的精力作为负伤害', () => {
  const state = fixture();
  state.player.hp = INITIAL_HP - 4;
  state.battle.enemyHp = 1;
  const won = transfer(state, playCommand(state, 'strike')).next;
  const { cue, next } = transfer(won, {
    runId: won.runId,
    seq: won.commandSeq + 1,
    type: 'choose-reward',
    cardId: won.rewards[0],
  });
  assert.equal(next.stage, 1);
  assert.equal(cue.action, 'reward');
  assert.equal(cue.healed, 4);
  assert.equal(cue.drawn, 4);
  assert.equal(cue.playerDamage, 0);
  assert.equal(cue.enemyDamage, 0);
  assert.equal(cue.enemyBlock, 0);
  assert.equal(cue.blocked, 0);
});

test('致胜带抽牌的进攻保留命中反馈，终局跳过的抽牌不会冒出来', () => {
  const state = fixture(
    ['followup'],
    ['followup', 'strike', 'guard', 'prepare']
  );
  state.battle.enemyHp = 1;
  const { cue, next } = transfer(state, playCommand(state, 'followup'));
  assert.equal(next.phase, 'reward');
  assert.equal(cue.action, 'attack');
  assert.equal(cue.outcome, 'victory');
  assert.equal(cue.enemyDamage, 1);
  assert.equal(cue.drawn, 0);
});

test('没有被接受的指令、重新读取或新试炼不生成旧动作反馈', () => {
  const previous = fixture();
  const command = playCommand(previous, 'strike');
  const next = reduceTrial(previous, command);
  assert.equal(createTrialMotion(null, next, command), null);
  assert.equal(createTrialMotion(previous, next), null);
  assert.equal(createTrialMotion(previous, previous, command), null);
  assert.equal(
    createTrialMotion(previous, next, { ...command, seq: 999 }),
    null
  );
  assert.equal(
    createTrialMotion(previous, next, { ...command, runId: 'stale' }),
    null
  );
  const restarted = createTrial({ seed: 271828, runId: 'new-run' });
  assert.equal(createTrialMotion(previous, restarted, command), null);
});

test('反馈纯计算且按实际指令区分key，不读取全局随机或写入存档字段', () => {
  const state = fixture();
  const first = transfer(state, playCommand(state, 'guard'));
  const second = transfer(first.next, playCommand(first.next, 'strike'));
  assert.equal(typeof first.cue.key, 'string');
  assert.notEqual(first.cue.key, second.cue.key);
  assert.equal(Object.hasOwn(second.next, 'motion'), false);
  const originalRandom = Math.random;
  Math.random = () => {
    throw new Error('动画反馈不得读取随机数');
  };
  try {
    assert.deepEqual(
      createTrialMotion(state, first.next, first.command),
      first.cue
    );
  } finally {
    Math.random = originalRandom;
  }
});

function buildFixture(includeCardId) {
  const profile = createDemoProfile(REALM_ORDER[2], 1);
  const available = getAvailableEntries(profile);
  const include = includeCardId
    ? available.find((entry) => entry.cardId === includeCardId)
    : undefined;
  if (includeCardId) assert.ok(include, '来源牌应在可选清单中');
  const resume = [
    ...(include ? [include.id] : []),
    ...available
      .filter((entry) => entry.id !== include?.id)
      .map((entry) => entry.id),
  ].slice(0, 16);
  const build = createTrialBuild({
    version: 1,
    profile,
    library: available.map((entry) => entry.id),
    resume,
  });
  const trial = createTrial({
    seed: 271828,
    runId: 'motion-build-fixture',
    build,
  });
  assertTrialState(trial);
  return trial;
}
function overflowFixture() {
  const trial = buildFixture();
  arrange(
    trial,
    trial.deck.slice(0, 12).map((entry) => entry.cardId)
  );
  trial.player.block = 10;
  assertTrialState(trial);
  return trial;
}
function noCombatEffects(cue) {
  assert.equal(cue.actor, 'none');
  for (const key of [
    'playerDamage',
    'enemyDamage',
    'playerBlock',
    'enemyBlock',
    'blocked',
    'healed',
    'drawn',
    'brokeBlock',
  ])
    assert.equal(cue[key], 0, key + '不应在未结算阶段产生');
}

test('保留手牌后的新回合浮字只计算实际抽牌，牌不足时不补造到四张', () => {
  const trial = fixture();
  arrange(trial, STARTER_DECK.slice(0, 7));
  const first = transfer(trial, {
    type: 'end-turn',
    runId: trial.runId,
    seq: 1,
  });
  assert.equal(first.next.battle.hand.length, 8);
  assert.equal(first.cue.drawn, 1);
  const second = transfer(first.next, {
    type: 'end-turn',
    runId: trial.runId,
    seq: 2,
  });
  assert.equal(second.next.battle.hand.length, 8);
  assert.equal(second.cue.drawn, 0);
});

test('等待手动弃牌只给整理提示，不提前播放敌袭、挡伤或抽牌', () => {
  const trial = overflowFixture();
  const { next, cue } = transfer(trial, {
    type: 'end-turn',
    runId: trial.runId,
    seq: 1,
  });
  assert.equal(next.phase, 'discard');
  assert.equal(cue.action, 'discard');
  assert.match(cue.title, /弃置 2 张/);
  noCombatEffects(cue);
  assert.deepEqual(next.player, trial.player);
  assert.deepEqual(next.battle, trial.battle);
  assert.equal(next.rngState, trial.rngState);
  assert.equal(cue.outcome, null);
});

test('确认弃牌后才结算真实敌袭，浮字不把保留十张手牌计入新抽牌', () => {
  const trial = overflowFixture();
  const waiting = transfer(trial, {
    type: 'end-turn',
    runId: trial.runId,
    seq: 1,
  }).next;
  const intent = getEnemyIntent(waiting);
  const selected = waiting.battle.hand.slice(0, 2);
  const { next, cue } = transfer(waiting, {
    type: 'confirm-discard',
    runId: waiting.runId,
    seq: 2,
    cardInstanceIds: selected,
  });
  assert.equal(next.phase, 'battle');
  assert.equal(next.battle.hand.length, 14);
  assert.equal(cue.action, 'enemy-turn');
  assert.equal(cue.actor, 'enemy');
  assert.equal(cue.drawn, 4);
  assert.equal(cue.playerDamage, waiting.player.hp - next.player.hp);
  assert.equal(cue.blocked, Math.min(waiting.player.block, intent.damage));
  assert.equal(cue.enemyBlock, intent.block);
  assert.ok(cue.detail.includes('弃置 2 张手牌'));
  assert.notEqual(cue.key, `${waiting.runId}:1`);
});

test('取消弃牌只返回出牌，不损耗精力或随机状态，读档不回放整理动作', () => {
  const trial = overflowFixture();
  const waiting = transfer(trial, {
    type: 'end-turn',
    runId: trial.runId,
    seq: 1,
  }).next;
  const command = { type: 'cancel-discard', runId: trial.runId, seq: 2 };
  const { next, cue } = transfer(waiting, command);
  assert.equal(next.phase, 'battle');
  assert.equal(cue.action, 'ready');
  assert.match(cue.title, /敌人尚未行动/);
  noCombatEffects(cue);
  assert.deepEqual(next.player, waiting.player);
  assert.deepEqual(next.battle, waiting.battle);
  assert.equal(next.rngState, waiting.rngState);
  assert.equal(createTrialMotion(null, next, command), null);
  assert.equal(createTrialMotion(waiting, next), null);
});

test('护腕动作同时呈现真实防护和治疗，标题使用来源装备名称', () => {
  const trial = buildFixture('gear-wrist');
  arrange(trial, ['gear-wrist', 'strike', 'guard', 'prepare']);
  trial.player.hp -= 5;
  const { cue, next } = transfer(trial, playCommand(trial, 'gear-wrist'));
  assert.equal(cue.action, 'guard');
  assert.equal(cue.playerBlock, 3);
  assert.equal(cue.healed, 3);
  assert.equal(next.player.hp - trial.player.hp, cue.healed);
  assert.ok(cue.title.includes('运动护腕'));
  assert.equal(cue.cardLabel, '运动护腕');
  assert.ok(cue.detail.includes('运动护腕'));
  assert.equal(cue.enemyDamage, 0);
});

test('课程的抽牌与蓄势共同反馈，标题使用具体课程来源而非模板名', () => {
  const trial = buildFixture('course-code');
  arrange(trial, ['course-code', 'strike', 'guard', 'prepare']);
  const instance = trial.deck.find((entry) => entry.cardId === 'course-code');
  const { cue, next } = transfer(trial, playCommand(trial, 'course-code'));
  assert.equal(cue.action, 'charge');
  assert.equal(cue.drawn, 2);
  assert.equal(next.player.nextAttackBonus - trial.player.nextAttackBonus, 2);
  assert.ok(cue.title.includes(instance.label));
  assert.equal(cue.cardLabel, instance.label);
  assert.equal(cue.playerDamage, 0);
  assert.equal(cue.enemyDamage, 0);
});
