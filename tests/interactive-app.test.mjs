import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import App from '../App';
import GameView from '../views/GameView';
import HomeScreen from '../components/HomeScreen';
import DeathModal from '../components/DeathModal';
import InteractiveEncounterModal from '../components/InteractiveEncounterModal';
import { createInitialPlayer } from '../utils/playerUtils';
import { createGameSave } from '../features/save/saveCodec';
import { ACHIEVEMENTS } from '../constants';
import { chooseAutoBattleAction } from '../features/interactive/battle';

const SAVE_KEY = 'npu-game-save';

/** Actual App, game hooks and reducers; child components are inspected as React
 * elements without mounting DOM. Timers/storage/Web Locks are controlled fixtures.
 * This does not verify browser focus, rendering, or real Web Locks scheduling. */
async function mountApp(t, overrides = {}) {
  const data = new Map();
  const writes = [];
  const network = [];
  const browser = new EventTarget();
  browser.location = { origin: 'http://127.0.0.1' };
  const page = {
    hidden: false,
    body: { classList: { add() {}, remove() {} } },
  };
  const descriptors = new Map();
  let locked = false;
  let failWrites = false;
  const storage = {
    getItem: (key) => data.get(key) ?? null,
    setItem(key, value) {
      if (key === SAVE_KEY && failWrites) throw new Error('模拟存储空间不足');
      data.set(key, String(value));
      writes.push({ key, value: String(value) });
    },
    removeItem: (key) => data.delete(key),
  };
  for (const [name, value] of Object.entries({
    localStorage: storage,
    sessionStorage: { getItem: () => null },
    window: browser,
    document: page,
    navigator: {
      locks: {
        async request(_name, _options, callback) {
          if (locked) return callback(null);
          locked = true;
          try {
            return await callback({});
          } finally {
            locked = false;
          }
        },
      },
    },
  })) {
    descriptors.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, { configurable: true, value });
  }
  t.mock.method(globalThis, 'fetch', async (...args) => {
    network.push(args);
    throw new Error('App routing tests forbid network');
  });
  t.mock.method(console, 'error', () => {});
  t.mock.method(Math, 'random', () => 0.99);
  let now = 1700000000000;
  let nextTimer = 0;
  const timers = new Map();
  const addTimer = (callback, delay = 0, interval = false) => {
    const id = ++nextTimer;
    timers.set(id, {
      callback,
      at: now + delay,
      interval: interval ? delay : 0,
    });
    return id;
  };
  t.mock.method(Date, 'now', () => now);
  t.mock.method(globalThis, 'setTimeout', (callback, delay) =>
    addTimer(callback, delay)
  );
  t.mock.method(globalThis, 'clearTimeout', (id) => timers.delete(id));
  t.mock.method(globalThis, 'setInterval', (callback, delay) =>
    addTimer(callback, delay, true)
  );
  t.mock.method(globalThis, 'clearInterval', (id) => timers.delete(id));

  const player = {
    ...createInitialPlayer('接线同学#ABCD', 'talent-ordinary'),
    // Suppress unrelated achievement grants and level-up requests in this fixture.
    achievements: ACHIEVEMENTS.map((item) => item.id),
    maxExp: 10000,
    ...overrides,
  };
  data.set(SAVE_KEY, JSON.stringify(createGameSave(player, [])));
  const slots = [];
  let cursor = 0;
  let tree;
  let dirty = false;
  let effects = [];
  let layouts = [];
  let unmounted = false;
  const same = (a, b) =>
    Array.isArray(a) &&
    Array.isArray(b) &&
    a.length === b.length &&
    a.every((value, index) => Object.is(value, b[index]));
  const slot = (kind, initial) => {
    const index = cursor++;
    if (!slots[index]) slots[index] = { kind, ...initial() };
    assert.equal(slots[index].kind, kind, 'App Hook order changed');
    return slots[index];
  };
  const memo = (kind, factory, deps) => {
    const cell = slot(kind, () => ({ initialized: false }));
    if (!cell.initialized || !same(cell.deps, deps)) {
      cell.value = factory();
      cell.deps = deps;
      cell.initialized = true;
    }
    return cell.value;
  };
  const effect = (kind, callback, deps) => {
    const cell = slot(kind, () => ({ initialized: false }));
    if (!cell.initialized || !same(cell.deps, deps)) {
      cell.initialized = true;
      cell.deps = deps;
      (kind === 'layout' ? layouts : effects).push(() => {
        cell.cleanup?.();
        cell.cleanup = callback();
      });
    }
  };
  const dispatcher = {
    useState(initial) {
      const cell = slot('state', () => ({
        value: typeof initial === 'function' ? initial() : initial,
      }));
      cell.set ??= (update) => {
        if (unmounted) return;
        const value =
          typeof update === 'function' ? update(cell.value) : update;
        if (!Object.is(value, cell.value)) {
          cell.value = value;
          dirty = true;
        }
      };
      return [cell.value, cell.set];
    },
    useRef(value) {
      return slot('ref', () => ({ value: { current: value } })).value;
    },
    useMemo(factory, deps) {
      return memo('memo', factory, deps);
    },
    useCallback(callback, deps) {
      return memo('callback', () => callback, deps);
    },
    useEffect(callback, deps) {
      effect('effect', callback, deps);
    },
    useLayoutEffect(callback, deps) {
      effect('layout', callback, deps);
    },
  };
  const internals =
    React.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
  assert.ok(internals, 'Controlled App tests require project React 19 runtime');
  function flush() {
    if (unmounted) return;
    for (let pass = 0; pass < 40; pass++) {
      cursor = 0;
      dirty = false;
      effects = [];
      layouts = [];
      const previous = internals.H;
      internals.H = dispatcher;
      try {
        tree = App();
      } finally {
        internals.H = previous;
      }
      layouts.forEach((run) => run());
      effects.forEach((run) => run());
      if (!dirty) return;
    }
    throw new Error('Controlled App render did not settle');
  }
  function elements(node) {
    if (!node || typeof node !== 'object') return [];
    if (Array.isArray(node)) return node.flatMap(elements);
    return [node, ...elements(node.props?.children)];
  }
  const find = (type) => elements(tree).find((node) => node.type === type);
  function advance(ms) {
    const end = now + ms;
    for (let pass = 0; pass < 100; pass++) {
      const next = [...timers]
        .filter(([, timer]) => timer.at <= end)
        .sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) {
        now = end;
        flush();
        return;
      }
      const [id, timer] = next;
      now = timer.at;
      if (timer.interval) timer.at += timer.interval;
      else timers.delete(id);
      timer.callback();
      flush();
    }
    throw new Error('Unexpected timer loop');
  }
  t.after(() => {
    unmounted = true;
    slots
      .filter((cell) => cell.kind === 'effect' || cell.kind === 'layout')
      .forEach((cell) => cell.cleanup?.());
    for (const [name, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  });
  flush();
  await find(HomeScreen).props.onContinueGame();
  flush();
  assert.ok(find(GameView), 'App should enter actual playing route');
  return {
    flush,
    advance,
    find,
    writes,
    network,
    game: () => find(GameView).props,
    modal: () => find(InteractiveEncounterModal).props,
    saved: () => JSON.parse(data.get(SAVE_KEY)),
    inert: () =>
      elements(tree).some(
        (node) => node.type === 'div' && node.props.inert === true
      ),
    fail: (value) => {
      failWrites = value;
    },
  };
}

test('真实App主按钮接通选择→战斗→唯一到账→确认，自动暂停且旧冒险不叠发', async (t) => {
  const app = await mountApp(t);
  const before = structuredClone(app.game().player);
  app.game().handlers.onToggleAutoMeditate();
  app.game().handlers.onToggleAutoAdventure();
  app.flush();
  await app.game().handlers.onAdventure();
  app.flush();
  assert.equal(app.modal().pending.phase, 'choice');
  assert.ok(app.inert());
  assert.equal(app.game().handlers.autoMeditate, false);
  assert.equal(app.game().handlers.autoAdventure, false);
  assert.deepEqual(app.game().player, before);
  assert.equal(app.game().logs.length, 0, '新入口不能叠加旧冒险剧情或奖励');
  const id = app.modal().pending.id;
  const reward = app
    .modal()
    .pending.encounter.choices.find(
      (choice) => choice.id === 'challenge'
    ).reward;
  app.modal().onChoose(id, 'challenge');
  app.flush();
  const initialBattle = structuredClone(app.modal().pending.battle);
  app.advance(5000);
  assert.deepEqual(
    app.modal().pending.battle,
    initialBattle,
    '等待不自动出招或回血'
  );
  for (
    let round = 0;
    app.modal().pending.phase === 'battle' && round < 15;
    round++
  ) {
    const battle = app.modal().pending.battle;
    app
      .modal()
      .onCommand(id, battle.commandSeq + 1, chooseAutoBattleAction(battle));
    app.flush();
  }
  assert.equal(app.modal().pending.phase, 'result');
  assert.equal(app.modal().pending.battle.outcome, 'victory');
  assert.equal(app.game().player.exp, before.exp + reward.exp);
  assert.equal(
    app.game().player.spiritStones,
    before.spiritStones + reward.spiritStones
  );
  assert.equal(app.game().logs.length, 1);
  assert.equal(app.saved().interactive.pending.phase, 'result');
  app.modal().onAcknowledge(id);
  app.flush();
  assert.equal(app.modal().pending, null);
  assert.equal(app.inert(), false);
  assert.equal(app.game().handlers.autoAdventure, false);
  assert.equal(app.game().handlers.autoMeditate, false);
  assert.equal(app.network.length, 0);
});

test('互动入口true拦截保存失败，false保留普通机缘和物品获取通道', async (t) => {
  const app = await mountApp(t);
  const before = structuredClone(app.game().player);
  app.fail(true);
  await app.game().handlers.onAdventure();
  app.flush();
  assert.equal(app.modal().pending, null);
  assert.deepEqual(app.game().player, before);
  assert.equal(
    app.game().logs.length,
    0,
    '关键保存失败仍消费本次入口，不能跌入旧冒险结算'
  );
  assert.ok(app.modal().error.includes('存储空间不足'));
  app.fail(false);
  await app.game().handlers.onAdventure();
  app.flush();
  const id = app.modal().pending.id;
  app.modal().onChoose(id, 'leave');
  app.flush();
  app.modal().onAcknowledge(id);
  app.flush();
  app.advance(1000);
  const logsBefore = app.game().logs.length;
  await app.game().handlers.onAdventure();
  app.flush();
  assert.equal(
    app.modal().pending,
    null,
    '0.99种子避开35%入口，继续旧主按钮通道'
  );
  assert.ok(
    app.game().logs.length > logsBefore,
    '普通冒险通道应仍然产生实际结果'
  );
  assert.equal(app.network.length, 0);
});

test('App接收父行动力竭终局后只降一级，旧死亡观察器不再二次处理', async (t) => {
  const app = await mountApp(t, {
    hp: 1,
    realmLevel: 3,
    attack: 0,
    defense: 0,
    speed: 0,
    exp: 7,
  });
  await app.game().handlers.onAdventure();
  app.flush();
  const id = app.modal().pending.id;
  app.modal().onChoose(id, 'challenge');
  app.flush();
  app.modal().onCommand(id, 1, 'attack');
  app.flush();
  assert.equal(app.modal().pending.phase, 'result');
  assert.equal(app.modal().pending.battle.outcome, 'defeat');
  assert.equal(app.game().player.realmLevel, 2);
  assert.equal(app.game().player.exp, 0);
  assert.equal(app.game().player.hp, app.game().player.maxHp);
  assert.equal(app.find(DeathModal), undefined);
  assert.equal(app.saved().player.realmLevel, 2);
  app.modal().onAcknowledge(id);
  app.flush();
  app.advance(1000);
  assert.equal(app.game().player.realmLevel, 2);
  assert.equal(app.find(DeathModal), undefined);
  assert.equal(app.network.length, 0);
});
