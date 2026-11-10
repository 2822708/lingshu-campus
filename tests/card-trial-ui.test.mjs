import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import CardTrialApp from '../prototypes/card-trial/CardTrialApp';
import { BattleActor } from '../prototypes/card-trial/BattleActor';
import { CARDS, ENEMIES } from '../prototypes/card-trial/catalog';
import { createTrial, reduceTrial } from '../prototypes/card-trial/engine';
import { TRIAL_SAVE_KEY } from '../prototypes/card-trial/persistence';

function makeStorage(initial = null) {
  const data = new Map([['npu-game-save', '{"keep":"主游戏存档"}']]);
  if (initial !== null)
    data.set(
      TRIAL_SAVE_KEY,
      typeof initial === 'string' ? initial : JSON.stringify(initial)
    );
  const writes = [];
  let fail = false;
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem(key, value) {
      writes.push({ key, value });
      if (fail) throw new Error('quota');
      data.set(key, value);
    },
    saved: () => JSON.parse(data.get(TRIAL_SAVE_KEY)),
    raw: () => data.get(TRIAL_SAVE_KEY),
    writes,
    setFail: (value) => {
      fail = value;
    },
  };
}
function walk(node) {
  if (!node || typeof node !== 'object') return [];
  if (Array.isArray(node)) return node.flatMap(walk);
  return [node, ...walk(node.props?.children)];
}
function text(node) {
  if (node == null || typeof node === 'boolean') return '';
  if (Array.isArray(node)) return node.map(text).join('');
  if (typeof node !== 'object') return String(node);
  return text(node.props?.children);
}

/** Actual component + engine/storage with controlled React 19 hooks. This does
 * not verify DOM, focus, viewport layout or multiple-tab scheduling. */
function mount(storage) {
  const internals =
    React.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
  const slots = [];
  let cursor = 0;
  let tree;
  const dispatcher = {
    useState(initial) {
      const index = cursor++;
      if (!slots[index])
        slots[index] = {
          value: typeof initial === 'function' ? initial() : initial,
        };
      return [
        slots[index].value,
        (update) => {
          slots[index].value =
            typeof update === 'function' ? update(slots[index].value) : update;
        },
      ];
    },
    useRef(initial) {
      const index = cursor++;
      if (!slots[index]) slots[index] = { value: { current: initial } };
      return slots[index].value;
    },
    useEffect() {},
  };
  function flush() {
    cursor = 0;
    const previous = internals.H;
    internals.H = dispatcher;
    try {
      tree = CardTrialApp({ storage });
    } finally {
      internals.H = previous;
    }
  }
  flush();
  return {
    flush,
    markup: () => renderToStaticMarkup(tree),
    nodes: () => walk(tree),
    button(label) {
      const node = walk(tree).find(
        (item) =>
          item.type === 'button' &&
          (item.props['aria-label'] === label || text(item) === label)
      );
      assert.ok(node, `missing button: ${label}`);
      return node;
    },
    click(label) {
      const node = this.button(label);
      assert.equal(
        Boolean(node.props.disabled),
        false,
        `${label} must be enabled`
      );
      node.props.onClick();
      flush();
    },
  };
}
function actor(ui, side) {
  const node = ui
    .nodes()
    .find((item) => item.type === BattleActor && item.props.side === side);
  assert.ok(node, `missing ${side} actor`);
  return node;
}
function motion(ui) {
  return actor(ui, 'player').props.cue;
}
function fixture() {
  const state = createTrial({ seed: 314159, runId: 'ui-fixture' });
  const hand = ['strike', 'guard', 'break', 'prepare'].map(
    (id) => state.deck.find((card) => card.cardId === id).id
  );
  state.battle.hand = hand;
  state.battle.drawPile = state.deck
    .map((card) => card.id)
    .filter((id) => !hand.includes(id));
  state.battle.discardPile = [];
  return state;
}
function command(state, extra) {
  return reduceTrial(state, {
    ...extra,
    seq: state.commandSeq + 1,
    runId: state.runId,
  });
}
function firstWin() {
  const state = fixture();
  state.battle.enemyHp = 1;
  return command(state, { type: 'play', cardInstanceId: state.battle.hand[0] });
}

test('独立欢迎页实际开始，仅写专属key且保留主游戏存档', () => {
  const storage = makeStorage();
  const ui = mount(storage);
  assert.match(ui.markup(), /每回合抽 4 张/);
  assert.match(ui.markup(), /每场最多 18 回合/);
  assert.equal(storage.writes.length, 0);
  ui.click('开始试炼');
  assert.equal(storage.saved().phase, 'battle');
  assert.equal(storage.saved().commandSeq, 0);
  assert.equal(motion(ui), null);
  assert.match(ui.markup(), /结束回合/);
  assert.ok(storage.writes.every((entry) => entry.key === TRIAL_SAVE_KEY));
  assert.equal(storage.getItem('npu-game-save'), '{"keep":"主游戏存档"}');
});
test('公开敌人意图和实际损耗预览准确，结束回合才受伤', () => {
  const state = fixture();
  state.player.block = 4;
  state.battle.enemyBlock = 5;
  const storage = makeStorage(state);
  const ui = mount(storage);
  assert.match(ui.markup(), /下一步：试探/);
  assert.match(ui.markup(), /预计损失 <strong>2<\/strong>/);
  assert.match(ui.markup(), /进攻 6，实际损耗 1/);
  ui.click(`打出${CARDS.strike.name}，消耗 1 点专注`);
  assert.equal(storage.saved().player.hp, state.player.hp);
  assert.equal(storage.saved().battle.enemyHp, ENEMIES[0].maxHp - 1);
  assert.equal(motion(ui).action, 'attack');
  assert.equal(motion(ui).enemyDamage, 1);
  assert.equal(motion(ui).blocked, 5);
  assert.equal(motion(ui).playerDamage, 0);
  const attackKey = motion(ui).key;
  ui.click('结束回合');
  assert.equal(storage.saved().player.hp, state.player.hp - 2);
  assert.equal(storage.saved().player.block, 0);
  assert.equal(motion(ui).action, 'enemy-turn');
  assert.equal(motion(ui).actor, 'enemy');
  assert.equal(motion(ui).playerDamage, 2);
  assert.equal(motion(ui).blocked, 4);
  assert.notEqual(motion(ui).key, attackKey);
  assert.match(ui.markup(), /下一步：强攻/);
});
test('专注不足的牌真实禁用并显示原因，仍可结束回合', () => {
  const state = fixture();
  state.player.energy = 0;
  const ui = mount(makeStorage(state));
  const cards = ui
    .nodes()
    .filter(
      (node) =>
        node.type === 'button' && node.props['aria-label']?.startsWith('打出')
    );
  assert.equal(cards.length, 4);
  for (const card of cards) {
    assert.equal(card.props.disabled, true);
    assert.match(card.props['aria-label'], /专注不足/);
  }
  assert.equal(ui.button('结束回合').props.disabled, false);
});
test('保存失败保留现场，重试同一快照，旧手牌指令不重复执行', () => {
  const state = fixture();
  const storage = makeStorage(state);
  const ui = mount(storage);
  const label = `打出${CARDS.strike.name}，消耗 1 点专注`;
  const oldCard = ui.button(label);
  storage.setFail(true);
  ui.click(label);
  const attempted = storage.writes[0].value;
  assert.deepEqual(storage.saved(), state);
  assert.equal(motion(ui), null, 'failed save must not show an attack');
  assert.match(ui.markup(), /现场已保留/);
  assert.equal(ui.button('结束回合').props.disabled, true);
  assert.equal(
    ui
      .nodes()
      .filter(
        (node) =>
          node.type === 'button' && node.props['aria-label']?.startsWith('打出')
      ).length,
    4
  );
  storage.setFail(false);
  ui.click('重试保存本次操作');
  assert.equal(storage.raw(), attempted);
  assert.equal(storage.saved().commandSeq, 1);
  assert.equal(storage.saved().player.energy, state.player.energy - 1);
  const acceptedMotion = motion(ui);
  assert.equal(acceptedMotion.key, state.runId + ':1');
  assert.equal(acceptedMotion.enemyDamage, 6);
  assert.doesNotMatch(storage.raw(), /playerDamage|enemyDamage|cue|motion/);
  oldCard.props.onClick();
  ui.flush();
  assert.equal(storage.saved().commandSeq, 1);
  assert.equal(storage.writes.length, 2);
  assert.equal(
    motion(ui),
    acceptedMotion,
    'stale card must not replay feedback'
  );
});
test('胜利保留最后一击，三个真实奖励可选，选择后进入下一场', () => {
  const state = firstWin();
  const storage = makeStorage(state);
  const ui = mount(storage);
  assert.match(ui.markup(), /本场获胜 · 为下一场选牌/);
  assert.match(ui.markup(), /造成 1 点损耗/);
  assert.equal(
    ui
      .nodes()
      .filter(
        (node) =>
          node.type === 'button' && node.props['aria-label']?.startsWith('选择')
      ).length,
    3
  );
  const reward = state.rewards[0];
  ui.click(`选择${CARDS[reward].name}加入牌组`);
  assert.equal(storage.saved().stage, 1);
  assert.equal(storage.saved().deck.length, 9);
  assert.deepEqual(storage.saved().chosenCards, [reward]);
  assert.match(ui.markup(), /轮到你了/);
});
test('跳过选牌保持牌组并继续，重新载入恢复相同现场', () => {
  const storage = makeStorage(firstWin());
  const ui = mount(storage);
  ui.click('跳过选牌，恢复精力后继续');
  assert.equal(storage.saved().deck.length, 8);
  assert.equal(storage.saved().stage, 1);
  assert.match(mount(storage).markup(), /第 2 场/);
  assert.equal(storage.writes.length, 1);
});
test('重开需二次确认，取消保留记录，确认后才替换runId', () => {
  const state = fixture();
  const storage = makeStorage(state);
  const ui = mount(storage);
  ui.click(`打出${CARDS.strike.name}，消耗 1 点专注`);
  const beforeRestart = storage.saved();
  const priorMotion = motion(ui);
  ui.click('重新开一场');
  assert.deepEqual(storage.saved(), beforeRestart);
  assert.equal(motion(ui), priorMotion);
  assert.match(ui.markup(), /覆盖这次试炼记录/);
  ui.click('保留当前试炼');
  assert.doesNotMatch(ui.markup(), /覆盖这次试炼记录/);
  assert.equal(storage.writes.length, 1);
  assert.equal(motion(ui), priorMotion);
  ui.click('重新开一场');
  ui.click('确认覆盖并开始');
  assert.notEqual(storage.saved().runId, state.runId);
  assert.equal(storage.saved().commandSeq, 0);
  assert.equal(motion(ui), null, 'new run must not replay the old attack');
});
test('损坏旧档读取不删不写，只有明确新开才覆盖独立key', () => {
  const storage = makeStorage('{broken');
  const ui = mount(storage);
  assert.match(ui.markup(), /无法读取/);
  assert.equal(storage.raw(), '{broken');
  assert.equal(storage.writes.length, 0);
  ui.click('明确新开一场试炼');
  assert.equal(storage.saved().phase, 'battle');
  assert.equal(storage.getItem('npu-game-save'), '{"keep":"主游戏存档"}');
});
test('退场终局显示剩余精力和总回合，不提供战斗动作或胜利奖励', () => {
  const storage = makeStorage(fixture());
  const ui = mount(storage);
  ui.click('离开本次试炼');
  assert.equal(storage.saved().phase, 'retreated');
  assert.match(ui.markup(), /已离开试炼/);
  assert.match(ui.markup(), /剩余精力/);
  assert.match(ui.markup(), /共经历 1 回合/);
  assert.equal(
    ui
      .nodes()
      .filter(
        (node) =>
          node.type === 'button' && node.props['aria-label']?.startsWith('打出')
      ).length,
    0
  );
  assert.doesNotMatch(ui.markup(), /胜利后选牌/);
});
test('通关突出剩余精力、总回合、构筑，并保留压轴最后一击', () => {
  let state = firstWin();
  const forceWin = () => {
    const attack = state.deck.find((card) => card.cardId === 'strike');
    state.battle.enemyHp = 1;
    state.battle.hand = [attack.id];
    state.battle.drawPile = state.deck
      .map((card) => card.id)
      .filter((id) => id !== attack.id);
    state.battle.discardPile = [];
    state.battle.exhaustPile = [];
    state = command(state, { type: 'play', cardInstanceId: attack.id });
  };
  state = command(state, { type: 'choose-reward', cardId: state.rewards[0] });
  forceWin();
  state = command(state, { type: 'choose-reward', cardId: null });
  forceWin();
  assert.equal(state.phase, 'complete');
  const markup = mount(makeStorage(state)).markup();
  assert.match(markup, /试炼完成/);
  assert.match(markup, /完成 3 \/ 3 场/);
  assert.match(markup, /共经历 3 回合/);
  assert.match(markup, /选入的牌/);
  assert.match(markup, /造成 1 点损耗/);
  assert.doesNotMatch(markup, /结束回合<\/button>/);
});
test('失败显示损耗和原因，残血预告不会大于实际精力，没有误发奖励', () => {
  const state = fixture();
  state.player.hp = 1;
  const before = mount(makeStorage(state));
  assert.match(before.markup(), /预计损失 <strong>1<\/strong>/);
  assert.match(before.markup(), /精力将耗尽/);
  before.click('结束回合');
  assert.equal(motion(before).playerDamage, 1);
  assert.equal(motion(before).outcome, 'defeat');
  assert.match(
    renderToStaticMarkup(actor(before, 'player')),
    /is-hit is-downed/
  );
  const failed = command(state, { type: 'end-turn' });
  assert.equal(failed.phase, 'defeat');
  const markup = mount(makeStorage(failed)).markup();
  assert.match(markup, /这次先到这里/);
  assert.match(markup, /精力耗尽/);
  assert.match(markup, /精力 -1/);
  assert.doesNotMatch(markup, /胜利后选牌/);
});

test('保存后的动作不进入存档，刷新和重新读取均不重放旧攻击', () => {
  const storage = makeStorage(fixture());
  const ui = mount(storage);
  ui.click(`打出${CARDS.strike.name}，消耗 1 点专注`);
  const savedAttack = storage.raw();
  const attackMotion = motion(ui);
  assert.equal(attackMotion.key, 'ui-fixture:1');
  assert.equal(motion(mount(storage)), null);
  assert.equal(storage.writes.length, 1, 'loading must not rewrite or replay');
  storage.setFail(true);
  ui.click(`打出${CARDS.guard.name}，消耗 1 点专注`);
  assert.equal(
    motion(ui),
    attackMotion,
    'uncommitted guard must not replace feedback'
  );
  assert.equal(storage.raw(), savedAttack);
  ui.click('重新读取存档');
  assert.equal(motion(ui), null);
  assert.equal(storage.raw(), savedAttack);
  assert.doesNotMatch(ui.markup(), /ct-motion-caption|is-attacking|is-hit/);
  assert.equal(ui.button('结束回合').props.disabled, false);
});

test('双方完全挡住时呈现防护，不能冒出伤害或受击表现', () => {
  const state = fixture();
  state.player.block = 9;
  state.battle.enemyBlock = 9;
  const storage = makeStorage(state);
  const ui = mount(storage);
  ui.click(`打出${CARDS.strike.name}，消耗 1 点专注`);
  assert.equal(motion(ui).enemyDamage, 0);
  assert.equal(motion(ui).blocked, 6);
  const enemyMarkup = renderToStaticMarkup(actor(ui, 'enemy'));
  assert.match(enemyMarkup, /is-guarding/);
  assert.match(enemyMarkup, /挡住 6/);
  assert.doesNotMatch(enemyMarkup, /is-hit|ct-effect-damage/);
  ui.click('结束回合');
  assert.equal(motion(ui).playerDamage, 0);
  assert.equal(motion(ui).blocked, 6);
  const playerMarkup = renderToStaticMarkup(actor(ui, 'player'));
  assert.match(playerMarkup, /is-guarding/);
  assert.match(playerMarkup, /挡住 6/);
  assert.doesNotMatch(playerMarkup, /is-hit|ct-effect-damage/);
  assert.match(renderToStaticMarkup(actor(ui, 'enemy')), /is-attacking/);
});

test('最后一击进入奖励页仍表现真实命中，选牌后不把新对手误作受击', () => {
  const state = fixture();
  state.battle.enemyHp = 1;
  const storage = makeStorage(state);
  const ui = mount(storage);
  ui.click(`打出${CARDS.strike.name}，消耗 1 点专注`);
  assert.equal(storage.saved().phase, 'reward');
  assert.equal(motion(ui).action, 'attack');
  assert.equal(motion(ui).outcome, 'victory');
  assert.equal(motion(ui).enemyDamage, 1);
  assert.match(renderToStaticMarkup(actor(ui, 'player')), /is-attacking/);
  const defeatedMarkup = renderToStaticMarkup(actor(ui, 'enemy'));
  assert.match(defeatedMarkup, /is-hit is-downed/);
  assert.match(defeatedMarkup, /ct-effect-damage">−1</);
  ui.click('跳过选牌，恢复精力后继续');
  assert.equal(storage.saved().stage, 1);
  assert.equal(motion(ui).action, 'reward');
  assert.equal(motion(ui).actor, 'none');
  assert.equal(motion(ui).enemyDamage, 0);
  assert.equal(motion(ui).outcome, null);
  assert.doesNotMatch(
    renderToStaticMarkup(actor(ui, 'enemy')),
    /is-hit|is-downed|ct-effect-damage/
  );
});
