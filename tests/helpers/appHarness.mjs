import assert from 'node:assert/strict';
import React from 'react';
import App from '../../App';
import GameView from '../../views/GameView';
import HomeScreen from '../../components/HomeScreen';
import InteractiveEncounterModal from '../../components/InteractiveEncounterModal';
import { createInitialPlayer } from '../../utils/playerUtils';
import { createGameSave } from '../../features/save/saveCodec';
import { ACHIEVEMENTS } from '../../constants';

const SAVE_KEY = 'npu-game-save';

/** Actual App, game hooks and reducers; child components are inspected as React
 * elements without mounting DOM. Timers/storage/Web Locks are controlled fixtures.
 * This does not verify browser focus, rendering, or real Web Locks scheduling. */
export async function mountApp(t, overrides = {}, options = {}) {
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
  let randomValues = [];
  let randomFallback = 0.99;
  t.mock.method(Math, 'random', () =>
    randomValues.length ? randomValues.shift() : randomFallback
  );
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
  data.set(
    SAVE_KEY,
    JSON.stringify(createGameSave(player, [], 1, options.interactive))
  );
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
    rawSaved: () => data.get(SAVE_KEY),
    random: (values = [], fallback = 0.99) => {
      randomValues = [...values];
      randomFallback = fallback;
    },
    async reload() {
      slots
        .filter((cell) => cell.kind === 'effect' || cell.kind === 'layout')
        .forEach((cell) => cell.cleanup?.());
      slots.length = 0;
      timers.clear();
      for (let i = 0; i < 8; i++) await Promise.resolve();
      flush();
      await find(HomeScreen).props.onContinueGame();
      flush();
      assert.ok(find(GameView), 'Reload must resume actual App route');
    },
    inert: () =>
      elements(tree).some(
        (node) => node.type === 'div' && node.props.inert === true
      ),
    fail: (value) => {
      failWrites = value;
    },
  };
}
