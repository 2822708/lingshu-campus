import test from 'node:test';
import assert from 'node:assert/strict';
import { CARDS } from '../features/card-battle/catalog';
import {
  assertCardBattleState,
  createCardBattle,
  getCardBattlePlayableReason,
  getCardBattlePreview,
  stepCardBattle,
} from '../features/card-battle/engine';

const clone = (value) => JSON.parse(JSON.stringify(value));
const send = (state, action) =>
  stepCardBattle(state, { id: state.id, seq: state.commandSeq + 1, ...action });
const card = (id, templateId = 'strike', overrides = {}) => {
  const {
    id: ignored,
    scaling: ignoredScaling,
    ...template
  } = CARDS[templateId];
  return { ...template, id, templateId, ...overrides };
};
const create = (options = {}) =>
  createCardBattle({
    id: 'dungeon-core',
    seed: 301,
    player: { hp: 78, maxHp: 150, attack: 90, defense: 60, speed: 50 },
    enemy: {
      name: '实验难题',
      title: '待解的',
      behavior: 'balanced',
      hp: 600,
      maxHp: 600,
      attack: 35,
      defense: 20,
      speed: 20,
    },
    cards: Array.from({ length: 20 }, (_, i) =>
      card(`card-${i}`, 'strike', { damage: 12 })
    ),
    ...options,
  });
const arrange = (state, ids) => {
  state.hand = ids;
  state.drawPile = state.cards
    .map((card) => card.id)
    .filter((id) => !ids.includes(id));
  state.discardPile = [];
  state.exhaustPile = [];
  assertCardBattleState(state);
  return state;
};
const play = (state, id) => send(state, { type: 'play', cardId: id });

test('同种子冻结角色、敌意和起手；主战斗保留真实入场精力且只是一场', () => {
  const original = Math.random;
  Math.random = () => {
    throw new Error('禁止读取全局随机');
  };
  try {
    const state = create();
    assert.deepEqual(state, create());
    assert.equal(state.maxTurns, 12);
    assert.equal(state.player.hp, 78);
    assert.equal(state.player.entryHp, 78);
    assert.equal(state.player.maxHp, 150);
    assert.equal(state.hand.length, 4);
    assert.equal(state.player.energy, 3);
    assertCardBattleState(state);
    const restored = clone(state);
    assert.deepEqual(
      send(state, { type: 'end-turn' }),
      send(restored, { type: 'end-turn' })
    );
  } finally {
    Math.random = original;
  }
});

test('零种子可原样续档，战斗快照只复制战斗字段，不重复保存玩家背包', () => {
  const state = create({
    seed: 0,
    player: {
      hp: 78,
      maxHp: 150,
      attack: 90,
      defense: 60,
      speed: 50,
      inventory: [{ id: 'private-player-item' }],
      spiritStones: 1000,
    },
  });
  assert.equal(state.seed, 0);
  assert.notEqual(state.rngState, 0);
  assert.equal(state.player.inventory, undefined);
  assert.equal(state.player.spiritStones, undefined);
  assertCardBattleState(clone(state));
  assert.deepEqual(
    send(state, { type: 'end-turn' }),
    send(clone(state), { type: 'end-turn' })
  );
});

test('卡牌结算纯转移，敌人只在结束回合行动；伤害预览与实效相符', () => {
  const state = create();
  const before = clone(state);
  const id = state.hand[0];
  const preview = getCardBattlePreview(state, id);
  const next = play(state, id);
  assert.deepEqual(state, before);
  assert.equal(next.enemy.hp, state.enemy.hp - preview.actualDamage);
  assert.equal(next.player.hp, state.player.hp);
  assert.equal(next.player.energy, 2);
  assert.equal(next.hand.length, 3);
  assert.equal(next.discardPile.at(-1), id);
  assert.equal(next.intentRngState, state.intentRngState);
  assertCardBattleState(next);
});

test('重复、乱序、错误战斗和专注不足不消耗指令或随机数', () => {
  let state = create();
  for (let i = 0; i < 3; i++) state = play(state, state.hand[0]);
  assert.equal(getCardBattlePlayableReason(state, state.hand[0]), '专注不足');
  assert.equal(play(state, state.hand[0]), state);
  for (const command of [
    { id: 'elsewhere', seq: state.commandSeq + 1, type: 'end-turn' },
    { id: state.id, seq: state.commandSeq, type: 'end-turn' },
    { id: state.id, seq: state.commandSeq + 2, type: 'end-turn' },
    {
      id: state.id,
      seq: state.commandSeq + 1,
      type: 'play',
      cardId: 'missing',
    },
  ])
    assert.equal(stepCardBattle(state, command), state);
});

test('手牌保留并每轮抽4；超10必须手选弃到10才执行一次已公布来袭', () => {
  let state = create();
  state = send(state, { type: 'end-turn' });
  assert.equal(state.hand.length, 8);
  state = send(state, { type: 'end-turn' });
  assert.equal(state.hand.length, 12);
  const before = state;
  const discard = send(state, { type: 'end-turn' });
  assert.equal(discard.phase, 'discard');
  assert.equal(discard.player.hp, before.player.hp);
  assert.equal(discard.turn, before.turn);
  assert.equal(discard.intentRngState, before.intentRngState);
  assert.equal(
    send(discard, { type: 'confirm-discard', cardIds: [discard.hand[0]] }),
    discard
  );
  assert.equal(
    send(discard, {
      type: 'confirm-discard',
      cardIds: [discard.hand[0], discard.hand[0]],
    }),
    discard
  );
  assert.equal(
    send(discard, { type: 'play', cardId: discard.hand[0] }),
    discard
  );
  const cancelled = send(discard, { type: 'cancel-discard' });
  assert.equal(cancelled.phase, 'battle');
  assert.equal(cancelled.player.hp, before.player.hp);
  const chosen = discard.hand.slice(0, 2);
  const done = send(discard, { type: 'confirm-discard', cardIds: chosen });
  const reversed = send(discard, {
    type: 'confirm-discard',
    cardIds: chosen.toReversed(),
  });
  assert.deepEqual(done, reversed);
  assert.equal(done.turn, before.turn + 1);
  assert.equal(
    done.player.hp,
    before.player.hp - Math.min(before.player.hp, before.intent.damage)
  );
  assert.equal(done.hand.length, 14); // 保留10张，再抽4张；下一次结束才再次检查上限。
  assertCardBattleState(done);
});

test('抽牌牌本身在抽牌结束后才入弃牌，无法立即反抽自身；暂存牌不回洗', () => {
  const state = create({
    cards: [card('draw', 'insight'), card('hit', 'strike')],
  });
  const next = play(state, 'draw');
  assert.deepEqual(next.hand, ['hit']);
  assert.deepEqual(next.exhaustPile, ['draw']);
  assert.equal(next.log.find((entry) => entry.cardId === 'draw').draw, 0);
  assertCardBattleState(next);
});

test('治疗只补本场损耗，不将半血入场角色补满；防护吸收后全部清空', () => {
  const state = arrange(
    create({
      cards: [
        card('heal', 'recover', { heal: 100 }),
        card('guard', 'fortify', { block: 1000 }),
      ],
    }),
    ['heal', 'guard']
  );
  const healedAtEntry = play(state, 'heal');
  assert.equal(healedAtEntry.player.hp, 78);
  const guarded = play(healedAtEntry, 'guard');
  assert.equal(guarded.player.block, 1000);
  const next = send(guarded, { type: 'end-turn' });
  assert.equal(next.player.hp, 78);
  assert.equal(next.player.block, 0);
  const damaged = send(state, { type: 'end-turn' });
  const recovered = play(damaged, 'heal');
  assert.equal(recovered.player.hp, 78);
  assert.equal(getCardBattlePreview(recovered, 'heal').heal, 0);
  assertCardBattleState(recovered);
});

test('公布固守当回合即减半，破势先清固守再进攻且不重复扣防御', () => {
  let state;
  for (let seed = 1; seed < 1000; seed++) {
    state = create({
      seed,
      cards: [
        card('hit', 'strike', { damage: 20 }),
        card('break', 'break', { damage: 20 }),
      ],
    });
    if (state.intent.type === 'guard') break;
  }
  assert.equal(state.intent.type, 'guard');
  assert.equal(state.enemy.guardRounds, 2);
  assert.equal(getCardBattlePreview(state, 'hit').actualDamage, 10);
  assert.equal(getCardBattlePreview(state, 'break').actualDamage, 20);
  assert.equal(getCardBattlePreview(state, 'break').clearsGuard, true);
  const hit = play(state, 'hit');
  assert.equal(hit.enemy.hp, 590);
  const broken = play(hit, 'break');
  assert.equal(broken.enemy.hp, 570);
  assert.equal(broken.enemy.guardRounds, 0);
  assertCardBattleState(broken);
});

test('强攻后必定调整；牌堆随机流不会改变敌意随机流', () => {
  let state;
  for (let seed = 1; seed < 1000; seed++) {
    state = create({ seed });
    if (state.intent.type === 'strong') break;
  }
  const next = send(state, { type: 'end-turn' });
  assert.equal(next.intent.type, 'adjust');
  const changedCards = clone(state);
  changedCards.rngState = 123456;
  const other = send(changedCards, { type: 'end-turn' });
  assert.deepEqual(next.intent, other.intent);
  assert.equal(next.intentRngState, other.intentRngState);
});

test('下一击加成可跨回合保留但只消费一次，连击只看本回合进攻', () => {
  let state = arrange(
    create({
      cards: [
        card('up', 'windup', { nextAttackBonus: 15 }),
        card('hit', 'strike', { damage: 12 }),
        card('combo', 'pressure', { damage: 10, bonusAfterAttack: 7 }),
      ],
    }),
    ['up', 'hit', 'combo']
  );
  state.enemy.guardRounds = 0;
  state = play(state, 'up');
  state = send(state, { type: 'end-turn' });
  state.enemy.guardRounds = 0;
  assert.equal(getCardBattlePreview(state, 'hit').damage, 27);
  state = play(state, 'hit');
  assert.equal(state.player.nextAttackBonus, 0);
  assert.equal(getCardBattlePreview(state, 'combo').damage, 17);
  state = send(state, { type: 'end-turn' });
  assert.equal(getCardBattlePreview(state, 'combo').damage, 10);
});

test('撤离、失败、僵局和胜利为终局，末回合击杀优先于上限', () => {
  const initial = create();
  const retreated = send(initial, { type: 'retreat' });
  assert.equal(retreated.phase, 'retreat');
  assert.equal(retreated.player.hp, initial.player.hp);
  assert.equal(send(retreated, { type: 'end-turn' }), retreated);
  const singleTurn = create({ maxTurns: 1 });
  const stale = send(singleTurn, { type: 'end-turn' });
  assert.equal(stale.phase, 'stalemate');
  const kill = arrange(
    create({ maxTurns: 1, cards: [card('kill', 'strike', { damage: 10000 })] }),
    ['kill']
  );
  const won = play(kill, 'kill');
  assert.equal(won.phase, 'victory');
  assert.equal(won.player.hp, kill.player.hp);
  const lethal = create({
    player: { hp: 1, maxHp: 150, attack: 90, defense: 0, speed: 0 },
  });
  const lost = send(lethal, { type: 'end-turn' });
  assert.equal(lost.phase, 'defeat');
  for (const state of [retreated, stale, won, lost])
    assertCardBattleState(state);
});

test('冻结数值不随模板更新而变化；畸形牌区、随机状态和伪造终局拒绝读档', () => {
  const state = create();
  const saved = CARDS.strike.damage;
  CARDS.strike.damage = 99999;
  try {
    assertCardBattleState(state);
    assert.equal(getCardBattlePreview(state, state.hand[0]).damage, 12);
  } finally {
    CARDS.strike.damage = saved;
  }
  for (const corrupt of [
    (value) => {
      value.hand.push(value.drawPile[0]);
    },
    (value) => {
      value.drawPile.pop();
    },
    (value) => {
      value.phase = 'victory';
    },
    (value) => {
      value.player.hp = 100;
    },
    (value) => {
      value.intentRngState = 0;
    },
    (value) => {
      value.rulesetVersion = 'future';
    },
    (value) => {
      value.cards[0].damage = NaN;
    },
    (value) => {
      value.log.at(-1).playerHpAfter = 77;
    },
  ]) {
    const invalid = clone(state);
    corrupt(invalid);
    assert.throws(() => assertCardBattleState(invalid), /卡牌战斗存档无效/);
  }
});
