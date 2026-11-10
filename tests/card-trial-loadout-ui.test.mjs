import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { LoadoutWorkshop } from '../prototypes/card-trial/LoadoutWorkshop';
import CardTrialApp from '../prototypes/card-trial/CardTrialApp';
import { RealmType } from '../types';
import {
  assertTrialBuild,
  createDefaultLoadout,
  createDemoProfile,
  createTrialBuild,
  getAvailableEntries,
  LOADOUT_SAVE_KEY,
} from '../prototypes/card-trial/loadout';
import {
  assertTrialState,
  createTrial,
  getEnemyIntent,
} from '../prototypes/card-trial/engine';
import { TRIAL_SAVE_KEY } from '../prototypes/card-trial/persistence';

function storage(initialTrial = null) {
  const data = new Map([['npu-game-save', 'main-game-sentinel']]);
  if (initialTrial) data.set(TRIAL_SAVE_KEY, JSON.stringify(initialTrial));
  const writes = [];
  let fail = false;
  return {
    data,
    writes,
    getItem: (key) => data.get(key) ?? null,
    setItem(key, value) {
      writes.push({ key, value });
      if (fail) throw new Error('quota');
      data.set(key, value);
    },
    fail(value) {
      fail = value;
    },
    savedTrial: () => JSON.parse(data.get(TRIAL_SAVE_KEY)),
    savedLoadout: () => JSON.parse(data.get(LOADOUT_SAVE_KEY)),
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
/** Actual component handlers with controlled hooks and SSR. Not DOM, focus or browser proof. */
function mount(Component, props) {
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
      tree = Component(props);
    } finally {
      internals.H = previous;
    }
  }
  flush();
  return {
    flush,
    nodes: () => walk(tree),
    markup: () => renderToStaticMarkup(tree),
    find(type, predicate) {
      const node = walk(tree).find(
        (item) => item.type === type && predicate(item)
      );
      assert.ok(node, `missing ${type}`);
      return node;
    },
    button(label) {
      return this.find(
        'button',
        (node) => node.props['aria-label'] === label || text(node) === label
      );
    },
    buttonPrefix(prefix) {
      return this.find('button', (node) =>
        (node.props['aria-label'] ?? text(node)).startsWith(prefix)
      );
    },
    clickNode(node) {
      assert.equal(
        Boolean(node.props.disabled),
        false,
        `${node.props['aria-label'] ?? text(node)} must be enabled`
      );
      node.props.onClick();
      flush();
    },
    click(label) {
      this.clickNode(this.button(label));
    },
    clickPrefix(prefix) {
      this.clickNode(this.buttonPrefix(prefix));
    },
    checkbox(prefix) {
      return this.find(
        'input',
        (node) =>
          node.props.type === 'checkbox' &&
          node.props['aria-label'].startsWith(prefix)
      );
    },
    check(prefix, checked) {
      const node = this.checkbox(prefix);
      assert.equal(Boolean(node.props.disabled), false);
      node.props.onChange({ target: { checked } });
      flush();
    },
    async importFile(raw) {
      const input = this.find('input', (node) => node.props.type === 'file');
      input.props.onChange({
        target: {
          files: [
            {
              size: new TextEncoder().encode(raw).byteLength,
              text: async () => raw,
            },
          ],
          value: 'fixture.json',
        },
      });
      await Promise.resolve();
      await Promise.resolve();
      flush();
    },
  };
}
function workshop(
  initial = createDefaultLoadout(),
  db = storage(),
  hasRun = false
) {
  const saved = [];
  const used = [];
  const order = [];
  let closed = 0;
  const ui = mount(LoadoutWorkshop, {
    initial,
    storage: db,
    hasRun,
    onClose: () => {
      closed++;
    },
    onSaved: (loadout) => {
      saved.push(loadout);
      order.push('saved');
    },
    onUse: (build, loadout) => {
      used.push({ build, loadout });
      order.push('use');
    },
  });
  return { ui, db, saved, used, order, closed: () => closed };
}
function expandedLoadout(resumeCount = 8) {
  const result = createDefaultLoadout();
  result.profile = createDemoProfile(RealmType.ImmortalAscension, 4);
  result.library = getAvailableEntries(result.profile).map((entry) => entry.id);
  result.resume = result.library.slice(0, resumeCount);
  return result;
}
function fourteenHandTrial() {
  const loadout = expandedLoadout(16);
  const state = createTrial({
    seed: 314159,
    runId: 'manual-discard-ui',
    build: createTrialBuild(loadout),
  });
  state.battle.hand = state.deck.slice(0, 14).map((card) => card.id);
  state.battle.drawPile = state.deck.slice(14).map((card) => card.id);
  state.battle.discardPile = [];
  state.battle.exhaustPile = [];
  assertTrialState(state);
  return state;
}

test('课程先加入牌库，不自动编入简历；选入后保存并采用冻结快照', () => {
  const { ui, db, saved, used, order } = workshop();
  ui.check('加入牌库：高等数学（', true);
  assert.match(ui.markup(), /挑选简历（8 \/ 16）/);
  assert.equal(saved.length, 0);
  assert.equal(db.writes.length, 0);
  ui.clickPrefix('2 · 挑选简历');
  assert.equal(ui.checkbox('编入简历：高等数学（').props.checked, false);
  ui.check('编入简历：高等数学（', true);
  assert.match(ui.markup(), /简历 9 张/);
  ui.click('以此简历出发');
  assert.deepEqual(order, ['saved', 'use']);
  assert.equal(used.length, 1);
  const persisted = db.savedLoadout();
  assert.ok(persisted.library.includes('course:art-spirit-cloud'));
  assert.ok(persisted.resume.includes('course:art-spirit-cloud'));
  assertTrialBuild(used[0].build);
  assert.equal(used[0].build.resume.length, 9);
  ui.check('编入简历：高等数学（', false);
  assert.equal(used[0].build.resume.length, 9);
  assert.equal(saved[0].resume.length, 9);
  assert.equal(db.savedLoadout().resume.length, 9);
  assert.ok(db.writes.every((entry) => entry.key === LOADOUT_SAVE_KEY));
  assert.equal(db.data.get('npu-game-save'), 'main-game-sentinel');
});

test('简历不足八张时不能出发，仍可显式保存草稿', () => {
  const { ui, db, saved, used } = workshop();
  ui.clickPrefix('2 · 挑选简历');
  ui.check('编入简历：演算（1）', false);
  assert.equal(ui.button('以此简历出发').props.disabled, true);
  assert.match(ui.markup(), /至少选择 8 张/);
  ui.click('保存配置');
  assert.equal(saved.length, 1);
  assert.equal(used.length, 0);
  assert.equal(db.savedLoadout().resume.length, 7);
});

test('十六张上限禁用新选择，取消已有选择后可选另一来源', () => {
  const { ui } = workshop(expandedLoadout(16));
  ui.clickPrefix('2 · 挑选简历');
  const inputs = ui
    .nodes()
    .filter((node) => node.type === 'input' && node.props.type === 'checkbox');
  const selected = inputs.filter((node) => node.props.checked);
  const others = inputs.filter((node) => !node.props.checked);
  assert.equal(selected.length, 16);
  assert.ok(others.length > 0);
  assert.ok(selected.every((node) => !node.props.disabled));
  assert.ok(others.every((node) => node.props.disabled));
  const firstLabel = selected[0].props['aria-label'];
  const newLabel = others[0].props['aria-label'];
  ui.check(firstLabel, false);
  assert.equal(ui.checkbox(newLabel).props.disabled, false);
  ui.check(newLabel, true);
  assert.equal(
    ui
      .nodes()
      .filter(
        (node) =>
          node.type === 'input' &&
          node.props.type === 'checkbox' &&
          node.props.checked
      ).length,
    16
  );
});

test('导入角色替换来源并清理旧库和简历，导入本身不自动写存档', async () => {
  const initial = expandedLoadout(12);
  const { ui, db, saved, used } = workshop(initial, storage(), true);
  const raw = JSON.stringify({
    version: 2,
    player: {
      name: '导入同学',
      realm: RealmType.QiRefining,
      realmLevel: 2,
      attack: 19,
      defense: 9,
      spirit: 11,
      physique: 17,
      speed: 13,
      maxHp: 150,
      cultivationArts: ['art-basic-breath'],
      inventory: [],
    },
    logs: [{ text: '不得进入快照的原日志' }],
  });
  await ui.importFile(raw);
  assert.match(ui.markup(), /导入同学/);
  assert.match(ui.markup(), /导入档案/);
  assert.doesNotMatch(ui.markup(), /加入牌库：高等数学/);
  assert.doesNotMatch(ui.markup(), /加入牌库：入门薄膜键盘/);
  assert.equal(db.writes.length, 0);
  assert.equal(saved.length, 0);
  assert.equal(used.length, 0);
  ui.clickPrefix('2 · 挑选简历');
  assert.equal(
    ui
      .nodes()
      .filter((node) => node.type === 'input' && node.props.type === 'checkbox')
      .length,
    8
  );
  ui.click('保存配置');
  const result = db.savedLoadout();
  assert.equal(result.profile.source, 'import');
  assert.equal(result.profile.attack, 19);
  assert.deepEqual(result.library, createDefaultLoadout().library);
  assert.deepEqual(result.resume, createDefaultLoadout().resume);
  assert.ok(!JSON.stringify(result).includes('不得进入快照的原日志'));
  assert.equal(db.data.get('npu-game-save'), 'main-game-sentinel');
});

test('配置保存失败不会触发采用或保存回调，恢复后同一选择可重试', () => {
  const { ui, db, saved, used } = workshop();
  db.fail(true);
  ui.click('以此简历出发');
  assert.equal(saved.length, 0);
  assert.equal(used.length, 0);
  assert.equal(db.data.has(LOADOUT_SAVE_KEY), false);
  assert.match(ui.markup(), /简历配置未能保存/);
  db.fail(false);
  ui.click('以此简历出发');
  assert.equal(saved.length, 1);
  assert.equal(used.length, 1);
  assert.equal(used[0].build.resume.length, 8);
});

test('十四张手牌结束时先要求手动弃四张，确认前不受伤，确认后保留十张并实际抽牌', () => {
  const state = fourteenHandTrial();
  const db = storage(state);
  const ui = mount(CardTrialApp, { storage: db });
  const hp = state.player.hp;
  const beforeIntent = getEnemyIntent(state);
  ui.click('结束回合');
  const pending = db.savedTrial();
  assert.equal(pending.phase, 'discard');
  assert.equal(pending.player.hp, hp);
  assert.deepEqual(pending.battle.hand, state.battle.hand);
  assert.equal(pending.battle.turn, state.battle.turn);
  assert.match(ui.markup(), /需弃 4 张，已选 0/);
  assert.equal(ui.button('确认弃牌并结束').props.disabled, true);
  for (let index = 0; index < 3; index++) ui.clickPrefix('选择弃置');
  assert.equal(ui.button('确认弃牌并结束').props.disabled, true);
  assert.equal(db.savedTrial().player.hp, hp);
  ui.clickPrefix('选择弃置');
  assert.equal(ui.button('确认弃牌并结束').props.disabled, false);
  const chosenNodes = ui
    .nodes()
    .filter(
      (node) =>
        node.type === 'button' &&
        node.props['aria-label']?.startsWith('取消弃置')
    );
  assert.equal(chosenNodes.length, 4);
  const retained = state.battle.hand.slice(4);
  ui.click('确认弃牌并结束');
  const after = db.savedTrial();
  assert.equal(after.phase, 'battle');
  assert.equal(after.battle.turn, state.battle.turn + 1);
  assert.equal(
    after.player.hp,
    hp - Math.min(hp, Math.max(0, beforeIntent.damage - state.player.block))
  );
  assert.ok(retained.every((id) => after.battle.hand.includes(id)));
  assert.equal(after.battle.hand.length, 14);
  assert.equal(
    after.battle.hand.filter((id) => !retained.includes(id)).length,
    4
  );
  assert.equal(after.commandSeq, 2);
  assertTrialState(after);
});

test('弃牌确认保存失败保留未结算现场，重试后只结算一次', () => {
  const state = fourteenHandTrial();
  const db = storage(state);
  const ui = mount(CardTrialApp, { storage: db });
  ui.click('结束回合');
  for (let index = 0; index < 4; index++) ui.clickPrefix('选择弃置');
  const discardState = db.savedTrial();
  db.fail(true);
  ui.click('确认弃牌并结束');
  assert.deepEqual(db.savedTrial(), discardState);
  assert.equal(db.savedTrial().player.hp, state.player.hp);
  assert.match(ui.markup(), /当前操作未保存/);
  assert.equal(ui.button('确认弃牌并结束').props.disabled, true);
  const attempted = db.writes.at(-1).value;
  db.fail(false);
  ui.click('重试保存本次操作');
  assert.equal(db.data.get(TRIAL_SAVE_KEY), attempted);
  assert.equal(db.savedTrial().phase, 'battle');
  assert.equal(db.savedTrial().commandSeq, 2);
  assert.equal(
    db.writes.filter((entry) => entry.key === TRIAL_SAVE_KEY).length,
    3
  );
});

test('返回出牌保留十四张手牌与精力，再结束时重新选择弃牌', () => {
  const state = fourteenHandTrial();
  const db = storage(state);
  const ui = mount(CardTrialApp, { storage: db });
  ui.click('结束回合');
  ui.clickPrefix('选择弃置');
  ui.click('返回出牌');
  assert.equal(db.savedTrial().phase, 'battle');
  assert.equal(db.savedTrial().player.hp, state.player.hp);
  assert.deepEqual(db.savedTrial().battle.hand, state.battle.hand);
  ui.click('结束回合');
  assert.match(ui.markup(), /需弃 4 张，已选 0/);
});

test('取消采用简历A后保存简历B，再重开使用B而不复用过期待确认快照', () => {
  const db = storage(createTrial({ seed: 314159, runId: 'cancel-build-ui' }));
  const ui = mount(CardTrialApp, { storage: db });
  function withCourse(sourceId) {
    const result = createDefaultLoadout();
    const entry = getAvailableEntries(result.profile).find(
      (item) => item.sourceId === sourceId
    );
    assert.ok(entry);
    result.library.push(entry.id);
    result.resume.push(entry.id);
    return result;
  }
  const first = withCourse('art-spirit-cloud');
  const second = withCourse('art-iron-skin');
  ui.click('编辑简历');
  let panel = ui.nodes().find((node) => node.type === LoadoutWorkshop);
  assert.ok(panel);
  panel.props.onUse(createTrialBuild(first), first);
  ui.flush();
  ui.click('保留当前试炼');
  ui.click('编辑简历');
  panel = ui.nodes().find((node) => node.type === LoadoutWorkshop);
  assert.ok(panel);
  // Workshop's separate tests verify persistence-before-callback; here exercise
  // the parent callback boundary and subsequent native restart controls.
  panel.props.onSaved(second);
  panel.props.onClose();
  ui.flush();
  ui.click('重新开一场');
  ui.click('确认覆盖并开始');
  const started = db.savedTrial();
  assert.deepEqual(started.build.resume, second.resume);
  assert.ok(!started.build.resume.includes('course:art-spirit-cloud'));
  assert.ok(started.build.resume.includes('course:art-iron-skin'));
  assert.notEqual(started.runId, 'cancel-build-ui');
  assert.equal(started.commandSeq, 0);
  assertTrialState(started);
  assert.equal(db.data.get('npu-game-save'), 'main-game-sentinel');
});

test('简历档案保留盲打课程真实来源名，共用模板不冒充数据结构课程', () => {
  const config = createDefaultLoadout();
  const course = getAvailableEntries(config.profile).find(
    (entry) => entry.sourceId === 'art-wind-step'
  );
  assert.ok(course);
  assert.equal(course.cardId, 'course-algorithms');
  config.library.push(course.id);
  config.resume.push(course.id);
  const state = createTrial({
    seed: 314159,
    runId: 'source-label-ui',
    build: createTrialBuild(config),
  });
  const ui = mount(CardTrialApp, { storage: storage(state) });
  const archive = ui.find(
    'ul',
    (node) => node.props.className === 'ct-deck-list'
  );
  const markup = renderToStaticMarkup(archive);
  assert.match(markup, /盲打十指法 × 1/);
  assert.doesNotMatch(markup, /数据结构与算法/);
  assert.match(markup, /演算 × 3/);
});
