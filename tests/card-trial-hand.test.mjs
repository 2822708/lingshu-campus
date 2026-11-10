import test from 'node:test';
import assert from 'node:assert/strict';
import { RealmType } from '../types';
import { CARDS } from '../prototypes/card-trial/catalog';
import {
  createDemoProfile,
  createDefaultLoadout,
  createTrialBuild,
  getAvailableEntries,
} from '../prototypes/card-trial/loadout';
import {
  getTrialEnemy,
  getTrialMaxHp,
} from '../prototypes/card-trial/progression';
import {
  assertTrialState,
  createTrial,
  DRAW_PER_TURN,
  getCardLabel,
  getCardPreview,
  HAND_LIMIT,
  reduceTrial,
} from '../prototypes/card-trial/engine';

const clone = (value) => JSON.parse(JSON.stringify(value));
const send = (state, extra) =>
  reduceTrial(state, {
    runId: state.runId,
    seq: state.commandSeq + 1,
    ...extra,
  });
function prepared(count = 16) {
  const loadout = createDefaultLoadout();
  loadout.profile = createDemoProfile(RealmType.Foundation, 1);
  loadout.library = getAvailableEntries(loadout.profile).map(
    (entry) => entry.id
  );
  loadout.resume = loadout.library.slice(0, count);
  return createTrialBuild(loadout);
}
function fixture(handSize, deckSize = 16) {
  const state = createTrial({
    seed: 1729,
    runId: 'hand-fixture',
    build: prepared(deckSize),
  });
  state.battle.hand = state.deck.slice(0, handSize).map((card) => card.id);
  state.battle.drawPile = state.deck.slice(handSize).map((card) => card.id);
  state.battle.discardPile = [];
  state.battle.exhaustPile = [];
  assertTrialState(state);
  return state;
}
function requireConserved(state) {
  assertTrialState(state);
  const all = [
    state.battle.hand,
    state.battle.drawPile,
    state.battle.discardPile,
    state.battle.exhaustPile,
  ].flat();
  assert.equal(all.length, state.deck.length);
  assert.equal(new Set(all).size, state.deck.length);
}

test('十张是回合结束上限，十张以内保留全部手牌再抽四张', () => {
  assert.equal(HAND_LIMIT, 10);
  assert.equal(DRAW_PER_TURN, 4);
  const before = fixture(10, 16);
  const next = send(before, { type: 'end-turn' });
  assert.equal(next.phase, 'battle');
  assert.equal(next.battle.turn, 2);
  assert.equal(next.battle.hand.length, 14);
  assert.deepEqual(next.battle.hand.slice(0, 10), before.battle.hand);
  assert.equal(next.battle.discardPile.length, 0);
  assert.match(next.log.at(-1).text, /保留未出手牌.*抽取 4 张牌/);
  requireConserved(next);
});

test('十一张结束时只进入弃牌阶段，敌人、护盾、回合和随机状态均未推进', () => {
  const before = fixture(11);
  before.player.block = 5;
  const snapshot = clone(before);
  const next = send(before, { type: 'end-turn' });
  assert.deepEqual(before, snapshot);
  assert.equal(next.phase, 'discard');
  assert.equal(next.battle.turn, before.battle.turn);
  assert.equal(next.player.hp, before.player.hp);
  assert.equal(next.player.block, 5);
  assert.equal(next.player.energy, before.player.energy);
  assert.deepEqual(next.battle, before.battle);
  assert.equal(next.rngState, before.rngState);
  assert.match(next.log.at(-1).text, /弃置 1 张/);
  assert.equal(next.log.filter((entry) => entry.kind === 'enemy').length, 0);
  requireConserved(next);
});

test('弃牌阶段不能出牌或重复结束，精确确认后才执行一次敌人行动', () => {
  const before = fixture(11, 16);
  const choosing = send(before, { type: 'end-turn' });
  assert.equal(
    send(choosing, { type: 'play', cardInstanceId: choosing.battle.hand[0] }),
    choosing
  );
  assert.equal(send(choosing, { type: 'end-turn' }), choosing);
  const discarded = choosing.battle.hand[0];
  const command = {
    runId: choosing.runId,
    seq: choosing.commandSeq + 1,
    type: 'confirm-discard',
    cardInstanceIds: [discarded],
  };
  const next = reduceTrial(choosing, command);
  assert.equal(next.phase, 'battle');
  assert.equal(next.battle.turn, 2);
  assert.equal(next.battle.hand.length, 14);
  assert.ok(!next.battle.hand.includes(discarded));
  assert.deepEqual(next.battle.discardPile, [discarded]);
  assert.equal(next.log.filter((entry) => entry.kind === 'enemy').length, 1);
  assert.equal(reduceTrial(next, command), next);
  requireConserved(next);
});

test('十四张须选择四张，点击先后不同不改变弃牌、洗牌或结算结果', () => {
  const choosing = send(fixture(14), { type: 'end-turn' });
  const selected = choosing.battle.hand.slice(0, 4);
  const ordered = send(choosing, {
    type: 'confirm-discard',
    cardInstanceIds: selected,
  });
  const reversed = send(choosing, {
    type: 'confirm-discard',
    cardInstanceIds: [...selected].reverse(),
  });
  assert.deepEqual(ordered, reversed);
  assert.equal(ordered.phase, 'battle');
  assert.equal(ordered.battle.hand.length, 14);
  // 两张抽牌耗尽后可能重洗刚弃置的牌；这不应变成复制或凭空丢失。
  assert.match(
    ordered.log.find(
      (entry) => entry.seq === ordered.commandSeq && entry.kind === 'system'
    ).text,
    /弃置 4 张/
  );
  requireConserved(ordered);
});

test('错误数量、重复选择、未知牌与旧序号弃牌均原对象拒绝且不推进随机', () => {
  const choosing = send(fixture(14), { type: 'end-turn' });
  const selected = choosing.battle.hand.slice(0, 4);
  const snapshot = clone(choosing);
  for (const cardInstanceIds of [
    [],
    selected.slice(0, 3),
    [...selected, choosing.battle.hand[4]],
    [selected[0], selected[0], selected[1], selected[2]],
    ['missing', ...selected.slice(1)],
    [choosing.battle.drawPile[0], ...selected.slice(1)],
    null,
  ]) {
    assert.equal(
      send(choosing, { type: 'confirm-discard', cardInstanceIds }),
      choosing
    );
  }
  assert.equal(
    reduceTrial(choosing, {
      runId: choosing.runId,
      seq: choosing.commandSeq,
      type: 'confirm-discard',
      cardInstanceIds: selected,
    }),
    choosing
  );
  assert.deepEqual(choosing, snapshot);
});

test('取消弃牌保留现场可继续出牌，撤离则不执行敌人或抽牌', () => {
  const choosing = send(fixture(14), { type: 'end-turn' });
  const canceled = send(choosing, { type: 'cancel-discard' });
  assert.equal(canceled.phase, 'battle');
  assert.deepEqual(canceled.player, choosing.player);
  assert.deepEqual(canceled.battle, choosing.battle);
  assert.equal(canceled.rngState, choosing.rngState);
  assert.equal(send(canceled, { type: 'cancel-discard' }), canceled);
  const card = canceled.battle.hand[0];
  assert.notEqual(
    send(canceled, { type: 'play', cardInstanceId: card }),
    canceled
  );
  const retreated = send(choosing, { type: 'retreat' });
  assert.equal(retreated.phase, 'retreated');
  assert.deepEqual(retreated.battle, choosing.battle);
  assert.equal(retreated.player.hp, choosing.player.hp);
  requireConserved(retreated);
});

test('确认弃牌后若敌袭致败，恰好剩十张且不抽下一轮的牌', () => {
  const before = fixture(14);
  before.player.hp = 1;
  before.player.block = 0;
  const choosing = send(before, { type: 'end-turn' });
  const selected = choosing.battle.hand.slice(0, 4);
  const next = send(choosing, {
    type: 'confirm-discard',
    cardInstanceIds: selected,
  });
  assert.equal(next.phase, 'defeat');
  assert.equal(next.battle.turn, 1);
  assert.equal(next.battle.hand.length, 10);
  assert.deepEqual(next.battle.discardPile, selected);
  assert.deepEqual(next.battle.drawPile, choosing.battle.drawPile);
  assert.equal(next.rngState, choosing.rngState);
  requireConserved(next);
});

test('牌堆只剩两张时只抽两张，空牌堆不会把保留的手牌复制一份', () => {
  const before = fixture(8, 10);
  const next = send(before, { type: 'end-turn' });
  assert.equal(next.battle.hand.length, 10);
  assert.match(next.log.at(-1).text, /抽取 2 张牌/);
  const noCards = send(next, { type: 'end-turn' });
  assert.equal(noCards.battle.hand.length, 10);
  assert.match(noCards.log.at(-1).text, /抽取 0 张牌/);
  requireConserved(noCards);
});

test('待弃牌阶段JSON续接保持选择前现场，确认结果与未刷新时一致', () => {
  const choosing = send(fixture(14), { type: 'end-turn' });
  const restored = clone(choosing);
  assertTrialState(restored);
  const command = {
    type: 'confirm-discard',
    cardInstanceIds: choosing.battle.hand.slice(0, 4),
  };
  assert.deepEqual(send(choosing, command), send(restored, command));
  const invalid = clone(choosing);
  invalid.battle.drawPile.push(...invalid.battle.hand.splice(0, 4));
  assert.throws(() => assertTrialState(invalid), /弃牌阶段/);
});

test('简历和角色在开局冻结，来源标签与动态精力防护可验证', () => {
  const build = prepared(16);
  const snapshot = clone(build);
  const state = createTrial({ seed: 891, runId: 'frozen-build', build });
  assert.equal(state.player.maxHp, getTrialMaxHp(snapshot.profile));
  assert.equal(state.battle.enemyHp, getTrialEnemy(state).maxHp);
  assert.equal(state.battle.enemyBlock, getTrialEnemy(state).grade.defense);
  const first = state.deck[0];
  assert.equal(
    getCardLabel(state, first.id),
    snapshot.library.find((entry) => entry.id === snapshot.resume[0]).label
  );
  build.profile.attack *= 50;
  build.profile.courseIds.splice(0, 1);
  build.library[0].label = 'changed';
  build.resume.reverse();
  assert.deepEqual(state.build, snapshot);
  const next = send(state, { type: 'end-turn' });
  next.build.profile.equipment[0].name = '改过的装备';
  assert.deepEqual(state.build, snapshot);
  requireConserved(state);
});

test('来源牌结算与预览使用同一属性加成，日志保留实际课程名称', () => {
  const state = fixture(16);
  const card = state.deck.find((entry) => entry.cardId === 'course-early');
  assert.ok(card);
  const before = getCardPreview(state, card.id);
  assert.ok(before.block > CARDS[card.cardId].block);
  const next = send(state, { type: 'play', cardInstanceId: card.id });
  assert.equal(next.player.block, before.block);
  assert.match(next.log.at(-1).text, /早八生存术/);
  assertTrialState(next);
  for (const mutate of [
    (value) => {
      value.deck[0].label = '伪造';
    },
    (value) => {
      value.deck[0].sourceId = 'unknown';
    },
    (value) => {
      value.player.maxHp++;
    },
    (value) => {
      value.build.resume[0] = value.build.resume[1];
    },
  ]) {
    const invalid = clone(state);
    mutate(invalid);
    assert.throws(() => assertTrialState(invalid), /试炼存档无效/);
  }
});

test('胜利奖励只取基础扩展，不会发放未拥有的课程或装备', () => {
  let state = fixture(16);
  state.battle.enemyHp = 1;
  state.battle.enemyBlock = 0;
  const strike = state.deck.find((card) => card.cardId === 'strike');
  state = send(state, { type: 'play', cardInstanceId: strike.id });
  assert.equal(state.phase, 'reward');
  assert.ok(
    state.rewards.every(
      (id) => !CARDS[id].source && !['strike', 'guard'].includes(id)
    )
  );
  const rewarded = send(state, {
    type: 'choose-reward',
    cardId: state.rewards[0],
  });
  assert.deepEqual(rewarded.deck.slice(0, 16), state.deck);
  assert.equal(rewarded.deck.length, 17);
  assert.equal(rewarded.battle.hand.length, DRAW_PER_TURN);
  requireConserved(rewarded);
});

test('真实连回合从四张保留到十二张，整理后续接十四张且每步可读档', () => {
  let state = createTrial({
    seed: 314159,
    runId: 'natural-hand',
    build: prepared(16),
  });
  for (const expected of [8, 12]) {
    state = send(state, { type: 'end-turn' });
    assert.equal(state.battle.hand.length, expected);
    requireConserved(state);
  }
  const hp = state.player.hp;
  state = send(state, { type: 'end-turn' });
  assert.equal(state.phase, 'discard');
  assert.equal(state.player.hp, hp);
  assert.equal(state.battle.turn, 3);
  const command = {
    type: 'confirm-discard',
    cardInstanceIds: state.battle.hand.slice(0, 2),
  };
  const restored = clone(state);
  const next = send(state, command);
  assert.deepEqual(next, send(restored, command));
  assert.equal(next.battle.turn, 4);
  assert.equal(next.battle.hand.length, 14);
  requireConserved(next);
});
