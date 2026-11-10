import test from 'node:test';
import assert from 'node:assert/strict';
import { CARDS, ENEMIES, STARTER_DECK } from '../prototypes/card-trial/catalog';
import {
  createTrial,
  reduceTrial,
  getEnemyIntent,
  getPlayableReason,
  getCardPreview,
  assertTrialState,
  INITIAL_HP,
} from '../prototypes/card-trial/engine';

const clone = (value) => JSON.parse(JSON.stringify(value));
const send = (state, command) =>
  reduceTrial(state, {
    runId: state.runId,
    seq: state.commandSeq + 1,
    ...command,
  });
const play = (state, cardId) => {
  const id = state.battle.hand.find(
    (id) => state.deck.find((card) => card.id === id).cardId === cardId
  );
  assert.ok(id, `手牌缺少 ${cardId}`);
  return send(state, { type: 'play', cardInstanceId: id });
};
const arrange = (state, cards) => {
  const remaining = state.deck.map((card) => card.id);
  state.battle.hand = cards.map((cardId) => {
    const index = remaining.findIndex(
      (id) => state.deck.find((card) => card.id === id).cardId === cardId
    );
    assert.ok(index >= 0, `牌组缺少 ${cardId}`);
    return remaining.splice(index, 1)[0];
  });
  state.battle.drawPile = remaining;
  state.battle.discardPile = [];
  state.battle.exhaustPile = [];
  return state;
};
// 定向场景只控制牌区、生命与既有选牌，仍须通过完整存档结构校验。
const scenario = (
  additions = [],
  hand = ['strike', 'guard', 'break', 'prepare']
) => {
  const state = createTrial({ seed: 1729, runId: 'fixture' });
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
      id: `${state.runId}:card:${STARTER_DECK.length + index}`,
      cardId,
    }))
  );
  state.battle.enemyHp = ENEMIES[state.stage].maxHp;
  arrange(state, hand);
  assertTrialState(state);
  return state;
};

test('基础卡池12种另有来源牌模板，初始8张且同种子同起手', () => {
  assert.equal(Object.values(CARDS).filter((card) => !card.source).length, 12);
  assert.equal(
    Object.values(CARDS).filter((card) => card.source === 'course').length,
    6
  );
  assert.ok(
    Object.values(CARDS).filter((card) => card.source === 'equipment').length >=
      4
  );
  assert.equal(
    Object.values(CARDS).filter((card) => card.source === 'tactic').length,
    6
  );
  assert.equal(STARTER_DECK.length, 8);
  const original = Math.random;
  Math.random = () => {
    throw new Error('不允许使用全局随机');
  };
  try {
    const state = createTrial({ seed: 7 });
    assert.deepEqual(state, createTrial({ seed: 7 }));
    assertTrialState(state);
    assert.equal(state.player.hp, INITIAL_HP);
    assert.equal(state.player.energy, 3);
    assert.equal(state.battle.hand.length, 4);
    assert.equal(state.battle.enemyHp, 30);
    assert.notDeepEqual(
      state.battle.hand,
      createTrial({ seed: 99 }).battle.hand
    );
  } finally {
    Math.random = original;
  }
});

test('出牌是纯转移，攻击扣专注与敌HP，但敌人必须等结束回合才行动', () => {
  const state = scenario();
  const before = clone(state);
  const next = play(state, 'strike');
  assert.deepEqual(state, before);
  assert.notEqual(next, state);
  assert.equal(next.battle.enemyHp, 24);
  assert.equal(next.player.hp, INITIAL_HP);
  assert.equal(next.player.energy, 2);
  assert.equal(next.battle.turn, 1);
  assertTrialState(next);
});

test('蓄力只增强下一张攻击，非攻击不消耗，跨回合保留但换场重置', () => {
  let state = scenario(['windup'], ['windup', 'guard', 'strike', 'strike']);
  state = play(state, 'windup');
  assert.equal(state.player.nextAttackBonus, 6);
  state = play(state, 'guard');
  assert.equal(state.player.nextAttackBonus, 6);
  state = send(state, { type: 'end-turn' });
  assert.equal(state.player.nextAttackBonus, 6);
  state.battle.enemyBlock = 0; // 单独检验增伤，护盾交互由另一场景覆盖。
  arrange(state, ['strike', 'strike', 'guard', 'break']);
  const initialHp = state.battle.enemyHp;
  state = play(state, 'strike');
  assert.equal(initialHp - state.battle.enemyHp, 12);
  assert.equal(state.player.nextAttackBonus, 0);
  state = play(state, 'strike');
  assert.equal(initialHp - state.battle.enemyHp, 18);
  state.battle.enemyHp = 1;
  state.player.energy = 3;
  arrange(state, ['strike', 'windup', 'guard', 'break']);
  state = play(state, 'windup');
  state = play(state, 'strike');
  state = send(state, { type: 'choose-reward', cardId: null });
  assert.equal(state.player.nextAttackBonus, 0);
  assert.equal(state.player.attacksPlayed, 0);
  assertTrialState(state);
});

test('连贯作答根据出牌顺序加伤，结束回合清除连击计数', () => {
  const first = play(
    scenario(['pressure'], ['pressure', 'strike', 'guard', 'break']),
    'pressure'
  );
  assert.equal(ENEMIES[1].maxHp - first.battle.enemyHp, 5);
  let ordered = scenario(
    ['pressure'],
    ['pressure', 'strike', 'guard', 'break']
  );
  ordered = play(ordered, 'strike');
  const pressure = ordered.battle.hand.find(
    (id) => ordered.deck.find((card) => card.id === id).cardId === 'pressure'
  );
  assert.equal(getCardPreview(ordered, pressure).damage, 8);
  ordered = play(ordered, 'pressure');
  assert.equal(ENEMIES[1].maxHp - ordered.battle.enemyHp, 14);
  assert.equal(ordered.player.attacksPlayed, 2);
  ordered = send(ordered, { type: 'end-turn' });
  assert.equal(ordered.player.attacksPlayed, 0);
  assertTrialState(ordered);
});

test('先防御再进攻可组合，防护吸收损耗并在敌方行动后清空', () => {
  let state = scenario([], ['guard', 'guard', 'strike', 'prepare']);
  state = play(state, 'guard');
  state = play(state, 'guard');
  state = play(state, 'strike');
  assert.equal(state.player.block, 10);
  assert.equal(state.player.energy, 0);
  state = send(state, { type: 'end-turn' });
  assert.equal(state.player.hp, INITIAL_HP);
  assert.equal(state.player.block, 0);
  assert.equal(state.player.energy, 3);
  assert.equal(state.battle.hand.length, 5);
  assert.equal(getEnemyIntent(state).damage, 10);
});

test('敌人固守留下护盾供玩家应对，普通攻击先扣盾，破势先清盾', () => {
  let state = scenario(['precise'], ['strike', 'guard', 'break', 'prepare']);
  state = send(state, { type: 'end-turn' });
  assert.equal(state.battle.enemyBlock, 10);
  assert.equal(state.player.hp, INITIAL_HP - 3);
  arrange(state, ['strike', 'guard', 'break', 'prepare']);
  state = play(state, 'strike');
  assert.equal(state.battle.enemyHp, 42);
  assert.equal(state.battle.enemyBlock, 4);
  state = play(state, 'break');
  assert.equal(state.battle.enemyBlock, 0);
  assert.equal(state.battle.enemyHp, 33);
  state = send(state, { type: 'end-turn' });
  assert.equal(state.battle.enemyBlock, 0);
  assertTrialState(state);
});

test('抽牌不足时重洗弃牌，正在结算的抽牌牌不会被抽回，也不会复制手牌', () => {
  let state = scenario(
    [],
    ['prepare', 'strike', 'strike', 'guard', 'guard', 'guard', 'break']
  );
  state.battle.discardPile = state.battle.drawPile;
  state.battle.drawPile = [];
  const prepareId = state.battle.hand[0];
  state = play(state, 'prepare');
  assert.equal(state.battle.hand.length, 7);
  assert.ok(!state.battle.hand.includes(prepareId));
  assert.deepEqual(state.battle.discardPile, [prepareId]);
  assert.equal(new Set(state.battle.hand).size, 7);
  assertTrialState(state);
});

test('结束回合保留余牌，牌堆不足抽完实际可抽卡且实例仍唯一', () => {
  let state = scenario([], ['guard', 'guard', 'guard', 'strike']);
  const previousHand = [...state.battle.hand];
  state = send(state, { type: 'end-turn' });
  assert.ok(previousHand.every((id) => state.battle.hand.includes(id)));
  assert.equal(state.battle.hand.length, 8);
  assert.deepEqual(state.battle.discardPile, []);
  state = send(state, { type: 'end-turn' });
  assert.equal(state.battle.hand.length, 8);
  assert.equal(new Set(state.battle.hand).size, 8);
  assert.match(state.log.at(-1).text, /抽取 0 张牌/);
  assertTrialState(state);
});

test('零费暂存牌本场只使用一次，抽牌牌本身不会被抽回', () => {
  let state = scenario(
    ['quick-guard', 'insight'],
    ['quick-guard', 'insight', 'strike', 'guard']
  );
  const zeroIds = [...state.battle.hand.slice(0, 2)];
  state = play(state, 'quick-guard');
  state = play(state, 'insight');
  assert.equal(state.player.energy, 3);
  assert.equal(state.player.block, 3);
  assert.deepEqual(state.battle.exhaustPile, zeroIds);
  assert.ok(zeroIds.every((id) => !state.battle.hand.includes(id)));
  state = send(state, { type: 'end-turn' });
  assert.deepEqual(state.battle.exhaustPile, zeroIds);
  assertTrialState(state);
});

test('暂存只在本场有效，下一场重新洗入整个牌组', () => {
  let state = scenario(
    ['quick-guard'],
    ['quick-guard', 'strike', 'guard', 'break']
  );
  const id = state.battle.hand[0];
  state = play(state, 'quick-guard');
  state.battle.enemyHp = 1;
  state = play(state, 'strike');
  state = send(state, { type: 'choose-reward', cardId: null });
  assert.deepEqual(state.battle.exhaustPile, []);
  assert.ok([...state.battle.hand, ...state.battle.drawPile].includes(id));
  assertTrialState(state);
});

test('恢复牌受精力上限限制，抽牌型攻击在命中后抽牌', () => {
  let state = scenario(
    ['recover', 'followup'],
    ['recover', 'followup', 'strike', 'guard']
  );
  state.player.hp = INITIAL_HP - 2;
  const healId = state.battle.hand[0];
  assert.equal(getCardPreview(state, healId).heal, 2);
  state = play(state, 'recover');
  assert.equal(state.player.hp, INITIAL_HP);
  const beforeHand = state.battle.hand.length;
  state = play(state, 'followup');
  assert.equal(state.battle.enemyHp, 54);
  assert.equal(state.battle.hand.length, beforeHand);
  assertTrialState(state);
});

test('重放、错runId、跳序、超费和不在手牌的出牌均保持对象同一且不推进种子', () => {
  let state = scenario();
  state = play(state, 'break');
  const invalids = [
    { runId: state.runId, seq: state.commandSeq, type: 'end-turn' },
    { runId: 'different', seq: state.commandSeq + 1, type: 'end-turn' },
    { runId: state.runId, seq: state.commandSeq + 2, type: 'end-turn' },
    {
      runId: state.runId,
      seq: state.commandSeq + 1,
      type: 'play',
      cardInstanceId: state.battle.discardPile[0],
    },
    {
      runId: state.runId,
      seq: state.commandSeq + 1,
      type: 'play',
      cardInstanceId: 'missing',
    },
    {
      runId: state.runId,
      seq: state.commandSeq + 1,
      type: 'choose-reward',
      cardId: null,
    },
  ];
  for (const command of invalids)
    assert.equal(reduceTrial(state, command), state);
  state = play(state, 'guard');
  assert.equal(state.player.energy, 0);
  assert.equal(getPlayableReason(state, state.battle.hand[0]), '专注不足');
  assert.equal(
    send(state, { type: 'play', cardInstanceId: state.battle.hand[0] }),
    state
  );
  assertTrialState(state);
});

test('固定种子多次洗牌与JSON保存续接一致，所有接受命令后均可验证存档', () => {
  let state = createTrial({ seed: 361 });
  for (let i = 0; i < 10 && state.phase === 'battle'; i++) {
    const card = state.battle.hand.find(
      (id) => getPlayableReason(state, id) === null
    );
    const command = card
      ? { type: 'play', cardInstanceId: card }
      : { type: 'end-turn' };
    const resumed = clone(state);
    assertTrialState(resumed);
    const next = send(state, command);
    assert.deepEqual(next, send(resumed, command));
    assertTrialState(next);
    state = next;
  }
});

test('击败敌人当场停止，不追加敌袭；奖励候选三张互异且胜场只记一次', () => {
  let state = scenario();
  state.battle.enemyHp = 1;
  state.player.hp = 1;
  state = play(state, 'strike');
  assert.equal(state.phase, 'reward');
  assert.equal(state.player.hp, 1);
  assert.equal(state.rewards.length, 3);
  assert.equal(new Set(state.rewards).size, 3);
  assert.equal(state.summaries.length, 1);
  assert.equal(send(state, { type: 'end-turn' }), state);
  assert.equal(
    send(state, { type: 'play', cardInstanceId: state.battle.hand[0] }),
    state
  );
  assertTrialState(state);
});

test('三场连战可选牌也可跳过，场间回血6、实例唯一、末场完成后拒绝再次结算', () => {
  let state = scenario();
  state.player.hp = 30;
  for (let stage = 0; stage < 3; stage++) {
    assert.equal(state.stage, stage);
    state.battle.enemyHp = 1;
    arrange(state, ['strike', 'guard', 'break', 'prepare']);
    state = play(state, 'strike');
    assert.equal(state.summaries.length, stage + 1);
    if (stage < 2) {
      const cardId = stage === 0 ? state.rewards[0] : null;
      const oldState = state;
      const command = {
        runId: state.runId,
        seq: state.commandSeq + 1,
        type: 'choose-reward',
        cardId,
      };
      state = reduceTrial(state, command);
      assert.equal(reduceTrial(state, command), state);
      assert.equal(state.player.hp, oldState.player.hp + 6);
      assert.equal(state.player.energy, 3);
      assert.equal(state.battle.hand.length, 4);
      assert.equal(state.battle.enemyHp, ENEMIES[stage + 1].maxHp);
      assert.equal(state.player.block, 0);
    }
    assertTrialState(state);
  }
  assert.equal(state.phase, 'complete');
  assert.equal(state.player.hp, 42);
  assert.equal(state.deck.length, 9);
  assert.equal(new Set(state.deck.map((card) => card.id)).size, 9);
  assert.equal(state.summaries.length, 3);
  assert.equal(send(state, { type: 'choose-reward', cardId: null }), state);
  assert.equal(send(state, { type: 'retreat' }), state);
});

test('未知奖励不能领取，跳过奖励也只能执行一次', () => {
  let state = scenario();
  state.battle.enemyHp = 1;
  state = play(state, 'strike');
  assert.equal(send(state, { type: 'choose-reward', cardId: 'strike' }), state);
  state = send(state, { type: 'choose-reward', cardId: null });
  assert.equal(state.deck.length, 8);
  assert.equal(send(state, { type: 'choose-reward', cardId: null }), state);
  assertTrialState(state);
});

test('撤离不结算胜利，精力耗尽为失败，18回合敌袭后仍存活才判僵局', () => {
  const retreated = send(scenario(), { type: 'retreat' });
  assert.equal(retreated.phase, 'retreated');
  assert.equal(retreated.summaries.length, 0);
  assertTrialState(retreated);
  let failure = scenario();
  failure.player.hp = 1;
  failure.battle.turn = 18;
  // 第18回合为调整，改为第17回合强攻检验失败优先于新回合。
  failure.battle.turn = 17;
  failure = send(failure, { type: 'end-turn' });
  assert.equal(failure.phase, 'defeat');
  assert.equal(failure.player.hp, 0);
  assertTrialState(failure);
  let capped = scenario(['insight', 'recover']);
  capped.battle.turn = 18;
  capped.player.hp = INITIAL_HP;
  capped = send(capped, { type: 'end-turn' });
  assert.equal(capped.phase, 'stalemate');
  assert.equal(capped.battle.turn, 18);
  assert.equal(capped.player.hp, INITIAL_HP - 5);
  assertTrialState(capped);
  let lastTurnDefeat = scenario(['insight', 'recover']);
  lastTurnDefeat.battle.turn = 18;
  lastTurnDefeat.player.hp = 1;
  lastTurnDefeat = send(lastTurnDefeat, { type: 'end-turn' });
  assert.equal(lastTurnDefeat.phase, 'defeat');
  assertTrialState(lastTurnDefeat);
});

test('存档验证拒绝版本、非整数、随机数、重复牌区、伪造实例、奖励和阶段矛盾', () => {
  const original = scenario();
  const mutations = [
    (state) => {
      state.version = 2;
    },
    (state) => {
      state.rngState = 0;
    },
    (state) => {
      state.player.hp = 1.5;
    },
    (state) => {
      state.player.energy = 4;
    },
    (state) => {
      state.battle.hand.push(state.battle.drawPile[0]);
    },
    (state) => {
      state.battle.drawPile.pop();
    },
    (state) => {
      state.deck[0].cardId = 'precise';
    },
    (state) => {
      state.rewards = ['pressure', 'pressure', 'recover'];
    },
    (state) => {
      state.phase = 'reward';
    },
    (state) => {
      state.battle.enemyHp = 0;
    },
    (state) => {
      state.summaries.push({
        stage: 0,
        turns: 1,
        hpBefore: INITIAL_HP,
        hpAfter: INITIAL_HP,
      });
    },
    (state) => {
      state.battle.exhaustPile = [state.battle.hand.pop()];
    },
    (state) => {
      state.log[0].seq = 1;
    },
    (state) => {
      state.commandSeq = 1;
    },
  ];
  for (const mutate of mutations) {
    const invalid = clone(original);
    mutate(invalid);
    assert.throws(() => assertTrialState(invalid), /试炼存档无效/);
  }
  assert.throws(() => assertTrialState(null));
  assert.throws(() => createTrial({ seed: Number.NaN }));
});
