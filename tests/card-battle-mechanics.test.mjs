import test from 'node:test';
import assert from 'node:assert/strict';
import { CARDS } from '../features/card-battle/catalog';
import { ENEMY_ARCHETYPES } from '../features/card-battle/enemies';
import { CARD_MAX_VALUE } from '../features/card-battle/shared';
import {
  assertCardBattleState,
  createCardBattle,
  getCardBattleIncomingPreview,
  getCardBattlePreview,
  stepCardBattle,
} from '../features/card-battle/engine';

const clone = (value) => JSON.parse(JSON.stringify(value));
const card = (id, overrides = {}) => ({
  id,
  templateId: 'strike',
  name: id,
  cost: 0,
  kind: 'attack',
  damage: 10,
  description: '测试冻结机制。',
  ...overrides,
});
const gear = (id, effect, amount) => ({
  id,
  sourceId: id,
  name: id,
  effect,
  amount,
  description: '测试装备效果。',
});
const create = (overrides = {}) =>
  createCardBattle({
    id: 'mechanics',
    seed: 301,
    player: { hp: 100, maxHp: 150, attack: 50, defense: 30, speed: 20 },
    enemy: {
      name: '机制对手',
      behavior: 'balanced',
      hp: 600,
      maxHp: 600,
      attack: 40,
      defense: 20,
      speed: 20,
    },
    cards: Array.from({ length: 20 }, (_, i) => card(`hit-${i}`)),
    ...overrides,
  });
const send = (state, action) =>
  stepCardBattle(state, {
    id: state.id,
    seq: state.commandSeq + 1,
    ...action,
  });
const play = (state, id) => send(state, { type: 'play', cardId: id });
function arrange(state, ids) {
  state.hand = [...ids];
  state.drawPile = state.cards
    .map((item) => item.id)
    .filter((id) => !ids.includes(id));
  state.discardPile = [];
  state.exhaustPile = [];
  state.enemy.guardRounds = 0;
  return state;
}

test('旧现场不补入新装备或状态，基础战斗在刷新后继续同一随机流', () => {
  const state = create();
  assert.equal(Object.hasOwn(state, 'equipment'), false);
  assert.equal(Object.hasOwn(state.enemy, 'pattern'), false);
  assert.equal(Object.hasOwn(state.player, 'defensesPlayed'), false);
  const next = send(state, { type: 'end-turn' });
  assert.deepEqual(next, send(clone(state), { type: 'end-turn' }));
  assert.equal(Object.hasOwn(next.player, 'counter'), false);
  assert.equal(Object.hasOwn(next.player, 'retainBlock'), false);
  assertCardBattleState(next);
});

test('破绽不叠层，强化下一次总进攻25%并仅消耗一次', () => {
  let state = arrange(
    create({
      cards: [
        card('feint-a', { kind: 'utility', damage: 0, expose: true }),
        card('feint-b', { kind: 'utility', damage: 0, expose: true }),
        card('hit'),
        card('after'),
      ],
    }),
    ['feint-a', 'feint-b', 'hit', 'after']
  );
  state = play(play(state, 'feint-a'), 'feint-b');
  assert.equal(state.enemy.exposed, true);
  assert.equal(getCardBattlePreview(state, 'hit').actualDamage, 13);
  const before = clone(state);
  state = play(state, 'hit');
  assert.deepEqual(before.enemy.exposed, true);
  assert.equal(state.enemy.hp, 587);
  assert.equal(state.enemy.exposed, false);
  assert.equal(getCardBattlePreview(state, 'after').actualDamage, 10);
  assertCardBattleState(state);
});

test('转守为攻按出牌前防护计算并封顶，消耗全部防护，预览等于实效', () => {
  let state = arrange(
    create({
      cards: [
        card('convert', {
          damage: 4,
          blockToDamage: 50,
          blockDamageCap: 6,
        }),
      ],
    }),
    ['convert']
  );
  state.player.block = 20;
  const preview = getCardBattlePreview(state, 'convert');
  assert.equal(preview.damage, 10);
  assert.equal(preview.blockConsumed, 20);
  state = play(state, 'convert');
  assert.equal(state.player.block, 0);
  assert.equal(state.enemy.hp, 600 - preview.actualDamage);
  assertCardBattleState(state);
});

test('反击和防护留存只作用本轮敌袭，防护必须实际抵挡才触发反击', () => {
  let state = arrange(
    create({
      cards: [
        card('riposte', {
          kind: 'defense',
          damage: 0,
          block: 10,
          counter: 7,
          retainBlock: 9,
        }),
      ],
    }),
    ['riposte']
  );
  state = play(state, 'riposte');
  state.intent.damage = 6;
  const preview = getCardBattleIncomingPreview(state);
  assert.deepEqual(
    [
      preview.prevented,
      preview.damage,
      preview.counterDamage,
      preview.retainedBlock,
    ],
    [6, 0, 7, 4]
  );
  state = send(state, { type: 'end-turn' });
  assert.equal(state.enemy.hp, 593);
  assert.equal(state.player.block, 4);
  assert.equal(state.player.counter, 0);
  assert.equal(state.player.retainBlock, 0);
  assertCardBattleState(state);
  state = send(state, { type: 'end-turn' });
  assert.equal(state.player.block, 0);
  assert.equal(state.enemy.hp, 593);
  assertCardBattleState(state);
});

test('穿透仅绕过指定部分，剩余防护可抵挡；反击与敌方恢复预览匹配', () => {
  let state = create();
  state.player.block = 100;
  state.player.counter = 7;
  state.player.retainBlock = 10;
  state.enemy.hp = 599;
  state.intent = {
    type: 'strong',
    name: '穿透追问',
    description: '穿透一半防护并恢复。',
    damage: 20,
    crit: false,
    piercePercent: 50,
    heal: 50,
  };
  const preview = getCardBattleIncomingPreview(state);
  assert.deepEqual(preview, {
    incoming: 20,
    prevented: 10,
    damage: 10,
    piercing: 10,
    heal: 8,
    retainedBlock: 10,
    counterDamage: 7,
  });
  state = send(state, { type: 'end-turn' });
  assert.equal(state.player.hp, 90);
  assert.equal(state.player.block, 10);
  assert.equal(state.enemy.hp, 600);
  assert.ok(
    state.log.some((entry) => entry.kind === 'enemy' && entry.heal === 8)
  );
  assertCardBattleState(state);
});

test('致命穿透后不反击或恢复；末回合反击击杀优先于僵持', () => {
  let lost = create();
  lost.player.hp = 5;
  lost.player.block = 100;
  lost.player.counter = 600;
  lost.intent.damage = 10;
  lost.intent.piercePercent = 50;
  lost.intent.heal = 50;
  assert.equal(getCardBattleIncomingPreview(lost).counterDamage, 0);
  assert.equal(getCardBattleIncomingPreview(lost).heal, 0);
  lost = send(lost, { type: 'end-turn' });
  assert.equal(lost.phase, 'defeat');
  assert.equal(lost.enemy.hp, 600);
  assertCardBattleState(lost);
  let won = create({ maxTurns: 1 });
  won.player.block = 100;
  won.player.counter = 600;
  won.intent.damage = 3;
  won.intent.heal = 50;
  won = send(won, { type: 'end-turn' });
  assert.equal(won.phase, 'victory');
  assert.equal(won.enemy.hp, 0);
  assertCardBattleState(won);
});

test('装备每轮首攻与首防只触发一次，普通防护也能触发装备反击和留存', () => {
  const equipment = [
    gear('keyboard', 'first-attack', 2),
    gear('shirt', 'first-defense', 3),
    gear('wrist', 'guard-counter', 4),
    gear('badge', 'retain-block', 8),
  ];
  let state = arrange(
    create({
      equipment,
      cards: [
        card('guard-a', { kind: 'defense', damage: 0, block: 5 }),
        card('guard-b', { kind: 'defense', damage: 0, block: 5 }),
        card('hit-a'),
        card('hit-b'),
      ],
    }),
    ['guard-a', 'guard-b', 'hit-a', 'hit-b']
  );
  assert.equal(getCardBattlePreview(state, 'guard-a').block, 8);
  state = play(state, 'guard-a');
  assert.equal(getCardBattlePreview(state, 'guard-b').block, 5);
  state = play(state, 'guard-b');
  assert.equal(state.player.block, 13);
  assert.equal(getCardBattlePreview(state, 'hit-a').damage, 12);
  state = play(state, 'hit-a');
  assert.equal(getCardBattlePreview(state, 'hit-b').damage, 10);
  state.intent.damage = 3;
  state = send(state, { type: 'end-turn' });
  assert.equal(state.enemy.hp, 584);
  assert.equal(state.player.block, 8);
  assert.equal(state.player.defensesPlayed, 0);
  assert.equal(getCardBattlePreview(state, 'hit-b').damage, 12);
  assertCardBattleState(state);
});

test('装备开场抽牌总额封顶4且冻结来源，重复装备来源拒绝', () => {
  const equipment = [
    gear('badge', 'opening-block', 5),
    gear('draw-a', 'opening-draw', 4),
    gear('draw-b', 'opening-draw', 4),
  ];
  const state = create({ equipment });
  equipment[0].amount = 999;
  assert.equal(state.equipment[0].amount, 5);
  assert.equal(state.player.block, 5);
  assert.equal(state.hand.length, 8);
  assertCardBattleState(state);
  assert.throws(
    () =>
      create({
        equipment: [
          gear('duplicate', 'first-attack', 1),
          gear('duplicate', 'first-defense', 1),
        ],
      }),
    /装备/
  );
});

test('反震穿过防护且能造成失败；破势清除反震，致命打击不再反震', () => {
  const make = () =>
    arrange(
      create({
        cards: [card('hit'), card('break', { clearEnemyBlock: true })],
      }),
      ['hit', 'break']
    );
  const state = make();
  state.player.hp = 5;
  state.player.block = 100;
  state.enemy.thorns = 7;
  assert.equal(getCardBattlePreview(state, 'hit').reflectedDamage, 5);
  const lost = play(state, 'hit');
  assert.equal(lost.phase, 'defeat');
  assert.equal(lost.player.hp, 0);
  assertCardBattleState(lost);
  const broken = play(state, 'break');
  assert.equal(broken.player.hp, 5);
  assert.equal(broken.enemy.thorns, 0);
  assert.equal(getCardBattlePreview(state, 'break').clearsGuard, true);
  assertCardBattleState(broken);
  const lethal = make();
  lethal.player.hp = 5;
  lethal.enemy.hp = 10;
  lethal.enemy.thorns = 7;
  assert.equal(getCardBattlePreview(lethal, 'hit').reflectedDamage, undefined);
  const won = play(lethal, 'hit');
  assert.equal(won.phase, 'victory');
  assert.equal(won.player.hp, 5);
  assertCardBattleState(won);
});

test('恢复专注先支付消耗再补充，封顶3，暂存避免无限循环', () => {
  let state = arrange(
    create({
      cards: [
        card('focus', {
          kind: 'utility',
          damage: 0,
          cost: 1,
          focusGain: 3,
          exhaust: true,
        }),
      ],
    }),
    ['focus']
  );
  state.player.energy = 2;
  assert.equal(getCardBattlePreview(state, 'focus').focusGain, 2);
  state = play(state, 'focus');
  assert.equal(state.player.energy, 3);
  assert.deepEqual(state.exhaustPile, ['focus']);
  assert.equal(play(state, 'focus'), state);
  assertCardBattleState(state);
});

test('超限弃牌、取消和重复指令不会提前执行反击、留存或敌方回复', () => {
  let state = create();
  state = send(send(state, { type: 'end-turn' }), { type: 'end-turn' });
  state.player.block = 20;
  state.player.counter = 7;
  state.player.retainBlock = 8;
  state.intent.damage = 3;
  state.intent.heal = 5;
  const before = clone(state);
  const discard = send(state, { type: 'end-turn' });
  assert.equal(discard.phase, 'discard');
  assert.deepEqual(discard.player, before.player);
  assert.deepEqual(discard.enemy, before.enemy);
  const cancelled = send(discard, { type: 'cancel-discard' });
  assert.deepEqual(cancelled.player, before.player);
  const again = send(cancelled, { type: 'end-turn' });
  const command = {
    id: again.id,
    seq: again.commandSeq + 1,
    type: 'confirm-discard',
    cardIds: again.hand.slice(0, 2),
  };
  const ended = stepCardBattle(again, command);
  assert.equal(ended.enemy.hp, before.enemy.hp - 2); // 7反击后恢复5
  assert.equal(ended.player.block, 8);
  assert.equal(stepCardBattle(ended, command), ended);
  assertCardBattleState(ended);
});

test('六类敌人按冻结循环作战，模板修改不会改变已保存的下一行动', () => {
  for (const archetype of Object.keys(ENEMY_ARCHETYPES)) {
    const state = create({
      enemy: {
        name: '循环对手',
        behavior: 'balanced',
        hp: 600,
        maxHp: 600,
        attack: 10,
        defense: 20,
        speed: 20,
        archetype,
      },
    });
    assert.equal(state.intent.name, state.enemy.pattern[0].name);
    assertCardBattleState(state);
    assert.deepEqual(
      send(state, { type: 'end-turn' }),
      send(clone(state), { type: 'end-turn' })
    );
  }
  const definition = ENEMY_ARCHETYPES.duelist;
  const state = create({
    enemy: {
      name: '冻结对手',
      behavior: 'balanced',
      hp: 600,
      maxHp: 600,
      attack: 10,
      defense: 20,
      speed: 20,
      archetype: 'duelist',
    },
  });
  const saved = clone(state);
  const multiplier = definition.pattern[1].damageMultiplier;
  try {
    definition.pattern[1].damageMultiplier = 0;
    assert.deepEqual(
      send(state, { type: 'end-turn' }),
      send(saved, { type: 'end-turn' })
    );
    assert.equal(state.enemy.pattern[1].damageMultiplier, multiplier);
  } finally {
    definition.pattern[1].damageMultiplier = multiplier;
  }
});

test('新增机制与装备冻结数据完整校验，非法比例和未知效果拒绝读取', () => {
  const state = create({ equipment: [gear('safe', 'first-attack', 2)] });
  for (const corrupt of [
    (s) => {
      s.player.counter = -1;
    },
    (s) => {
      s.player.retainBlock = CARD_MAX_VALUE + 1;
    },
    (s) => {
      s.player.defensesPlayed = 1.5;
    },
    (s) => {
      s.enemy.exposed = 'yes';
    },
    (s) => {
      s.enemy.thorns = -1;
    },
    (s) => {
      s.enemy.archetype = 'future';
    },
    (s) => {
      s.intent.piercePercent = 101;
    },
    (s) => {
      s.intent.heal = NaN;
    },
    (s) => {
      s.equipment[0].effect = 'unlimited-focus';
    },
    (s) => {
      s.cards[0].focusGain = 4;
    },
    (s) => {
      s.cards[0].blockToDamage = 50;
    },
    (s) => {
      s.cards[0].expose = 1;
    },
  ]) {
    const invalid = clone(state);
    corrupt(invalid);
    assert.throws(() => assertCardBattleState(invalid), /卡牌战斗存档无效/);
  }
  assert.ok(Object.hasOwn(CARDS, 'strike'));
});
