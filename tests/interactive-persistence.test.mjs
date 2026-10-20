import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire as createPersistenceRequire } from 'node:module';
import { join } from 'node:path';

const { build } = createPersistenceRequire(join(process.cwd(), 'package.json'))(
  'esbuild'
);
const HARNESS = Symbol.for('lingshu.interactive-persistence-test');
const SAVE_KEY = 'npu-game-save';
const TALENT = 'npu:circuit:juanwang';
let sequence = 0;

/** Exercises actual hook callbacks, effects and refs with explicit rerenders.
 * This is a controlled hook harness, not React DOM or a browser Web Locks test. */
async function harness(t, { ownership = true, deferOwnership = false } = {}) {
  const state = {
    storage: new Map(),
    writes: [],
    removals: [],
    failWrites: false,
    timers: new Map(),
    now: 0,
    nextTimer: 0,
    instances: [],
    lockHeld: false,
    lockRequests: [],
    alerts: [],
    errors: [],
  };
  const descriptors = new Map();
  for (const key of [
    HARNESS,
    'localStorage',
    'sessionStorage',
    'navigator',
    'alert',
  ]) {
    descriptors.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
  }
  const define = (key, value) =>
    Object.defineProperty(globalThis, key, { configurable: true, value });
  define(HARNESS, state);
  define('localStorage', {
    getItem: (key) => state.storage.get(key) ?? null,
    setItem: (key, value) => {
      state.writes.push({ key, value: String(value) });
      if (key === SAVE_KEY && state.failWrites)
        throw new Error('模拟存储空间不足');
      state.storage.set(key, String(value));
    },
    removeItem: (key) => {
      state.removals.push(key);
      state.storage.delete(key);
    },
  });
  define('sessionStorage', { getItem: () => null });
  define('alert', (message) => state.alerts.push(message));
  define(
    'navigator',
    ownership
      ? {
          locks: {
            request: async (_name, options, callback) => {
              assert.deepEqual(options, { ifAvailable: true });
              if (deferOwnership)
                await new Promise((resolve) =>
                  state.lockRequests.push(resolve)
                );
              if (state.lockHeld) return callback(null);
              state.lockHeld = true;
              try {
                return await callback({ name: `${SAVE_KEY}:writer` });
              } finally {
                state.lockHeld = false;
              }
            },
          },
        }
      : {}
  );
  t.mock.method(globalThis, 'fetch', async () => {
    throw new Error('Persistence tests must not use network');
  });
  t.mock.method(console, 'error', (...args) => state.errors.push(args));

  const built = await build({
    stdin: {
      contents: [
        "export { useGameState } from './hooks/useGameState';",
        "export { createInitialPlayer } from './utils/playerUtils';",
        "export { createGameSave, parseImportSave } from './features/save/saveCodec';",
        "export { reduceInteractiveAction, emptyInteractiveProgress } from './features/interactive/state';",
      ].join('\n'),
      resolveDir: process.cwd(),
      loader: 'ts',
    },
    bundle: true,
    write: false,
    platform: 'node',
    format: 'esm',
    define: { 'import.meta.env': '{}' },
    logLevel: 'silent',
    plugins: [
      {
        name: 'persistence-controlled-hooks',
        setup(builder) {
          builder.onResolve({ filter: /^react$/ }, () => ({
            path: 'react',
            namespace: 'persistence',
          }));
          builder.onResolve({ filter: /uidApi$/ }, () => ({
            path: 'uid',
            namespace: 'persistence',
          }));
          builder.onLoad(
            { filter: /.*/, namespace: 'persistence' },
            ({ path }) => ({
              loader: 'js',
              contents:
                path === 'uid'
                  ? `
            export const ensureUid = async name => name.includes('#') ? name : name + '#ABCD';
            export const extractUidFromName = () => null;
            export const releaseUid = async () => {};
          `
                  : `
            const harness = () => globalThis[Symbol.for('lingshu.interactive-persistence-test')];
            const same = (left, right) => left && right && left.length === right.length && left.every((value, i) => Object.is(value, right[i]));
            function slot(initial) {
              const instance = harness().current;
              const index = instance.cursor++;
              if (!(index in instance.slots)) instance.slots[index] = initial();
              return [instance, instance.slots[index]];
            }
            export function useState(initial) {
              const [instance, cell] = slot(() => ({ value: typeof initial === 'function' ? initial() : initial }));
              return [cell.value, next => {
                const value = typeof next === 'function' ? next(cell.value) : next;
                if (!Object.is(cell.value, value)) { cell.value = value; instance.dirty = true; }
              }];
            }
            export function useRef(value) { return slot(() => ({ current: value }))[1]; }
            export function useMemo(factory, deps) {
              const [, cell] = slot(() => ({ initialized: false }));
              if (!cell.initialized || !same(cell.deps, deps)) {
                cell.value = factory(); cell.deps = deps; cell.initialized = true;
              }
              return cell.value;
            }
            export const useCallback = (callback, deps) => useMemo(() => callback, deps);
            export function useEffect(effect, deps) {
              const [instance, cell] = slot(() => ({ initialized: false }));
              if (!cell.initialized || !same(cell.deps, deps)) {
                cell.initialized = true; cell.deps = deps;
                instance.effects.push(() => { cell.cleanup?.(); cell.cleanup = effect(); });
              }
            }
          `,
            })
          );
        },
      },
    ],
  });
  const api = await import(
    'data:text/javascript;base64,' +
      Buffer.from(built.outputFiles[0].text).toString('base64') +
      '#persistence-' +
      ++sequence
  );
  state.api = api;
  // Only game timers use this clock; compilation and module loading have finished.
  t.mock.method(globalThis, 'setTimeout', (callback, delay = 0) => {
    const id = ++state.nextTimer;
    state.timers.set(id, { callback, due: state.now + delay });
    return id;
  });
  t.mock.method(globalThis, 'clearTimeout', (id) => state.timers.delete(id));
  state.tick = (duration) => {
    const target = state.now + duration;
    while (true) {
      const next = [...state.timers]
        .filter(([, timer]) => timer.due <= target)
        .sort((a, b) => a[1].due - b[1].due)[0];
      if (!next) break;
      state.now = next[1].due;
      state.timers.delete(next[0]);
      next[1].callback();
    }
    state.now = target;
  };
  state.create = () => {
    const instance = { cursor: 0, slots: [], effects: [], dirty: false };
    instance.render = () => {
      state.current = instance;
      instance.cursor = 0;
      instance.effects = [];
      instance.dirty = false;
      instance.game = api.useGameState();
      for (const effect of instance.effects) effect();
      return instance.game;
    };
    instance.flush = () => {
      for (let limit = 0; instance.dirty; limit++) {
        assert.ok(limit < 20, 'hook rerender must converge');
        instance.render();
      }
      return instance.game;
    };
    instance.snapshot = () => {
      instance.flush();
      return structuredClone({
        player: instance.game.player,
        logs: instance.game.logs,
        interactive: instance.game.interactive,
        screen: instance.game.screen,
      });
    };
    instance.dispose = () => {
      for (const cell of instance.slots) {
        cell.cleanup?.();
        cell.cleanup = undefined;
      }
    };
    state.instances.push(instance);
    instance.render();
    return instance;
  };
  state.seed = (name = '旧档同学#ABCD', interactive) => {
    const saved = api.createGameSave(
      api.createInitialPlayer(name, TALENT),
      [{ id: 'old', text: '旧档案', type: 'normal', timestamp: 1 }],
      1,
      interactive
    );
    state.storage.set(SAVE_KEY, JSON.stringify(saved));
    return saved;
  };
  state.load = async () => {
    const instance = state.create();
    await instance.game.handleContinueGame();
    instance.flush();
    return instance;
  };
  state.stored = () => JSON.parse(state.storage.get(SAVE_KEY));
  t.after(() => {
    for (const instance of state.instances) instance.dispose();
    for (const [key, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });
  return state;
}

test('真实useGameState可加载无机缘扩展的旧档，普通自动保存保留合法角色', async (t) => {
  const state = await harness(t);
  const old = state.seed();
  const instance = await state.load();
  assert.equal(instance.game.screen, 'playing');
  assert.equal(instance.game.player.name, old.player.name);
  assert.deepEqual(instance.game.logs, old.logs);
  assert.deepEqual(
    instance.game.interactive,
    state.api.emptyInteractiveProgress()
  );
  state.tick(2000);
  assert.equal(state.stored().player.name, old.player.name);
});

test('关键开始写盘失败不推进内存序号，原seed和命令重试可原样建立机缘', async (t) => {
  const state = await harness(t);
  state.seed();
  const instance = await state.load();
  const before = instance.snapshot();
  const raw = state.storage.get(SAVE_KEY);
  const command = { type: 'begin', id: 'action-1', seed: 2741 };
  state.failWrites = true;
  assert.equal(instance.game.commitInteractive(command), false);
  assert.deepEqual(instance.snapshot(), before);
  assert.equal(state.storage.get(SAVE_KEY), raw);
  assert.match(instance.game.saveError, /存储空间不足/);
  state.failWrites = false;
  assert.equal(instance.game.commitInteractive(command), true);
  const committed = instance.snapshot();
  assert.equal(committed.interactive.pending.seq, 1);
  assert.equal(committed.interactive.pending.seed, command.seed);
  assert.equal(committed.interactive.nextSeq, 2);
  assert.deepEqual(
    state.stored().interactive,
    JSON.parse(JSON.stringify(committed.interactive))
  );
});

test('选择结算写盘失败不扣资源不加事实，重试只到账一次', async (t) => {
  const state = await harness(t);
  state.seed();
  const instance = await state.load();
  assert.equal(
    instance.game.commitInteractive({ type: 'begin', id: 'settle', seed: 81 }),
    true
  );
  const before = instance.snapshot();
  const storedBefore = state.storage.get(SAVE_KEY);
  const command = { type: 'choose', id: 'settle', choiceId: 'diagnose' };
  state.failWrites = true;
  assert.equal(instance.game.commitInteractive(command), false);
  assert.deepEqual(instance.snapshot(), before);
  assert.equal(state.storage.get(SAVE_KEY), storedBefore);
  state.failWrites = false;
  assert.equal(instance.game.commitInteractive(command), true);
  const settled = instance.snapshot();
  assert.equal(settled.player.exp, before.player.exp + 10);
  assert.equal(settled.player.hp, before.player.hp - 6);
  assert.equal(settled.interactive.lastSettledSeq, 1);
  assert.equal(settled.interactive.facts['lab-diagnosed'], true);
  assert.equal(settled.logs.length, before.logs.length + 1);
  assert.equal(instance.game.commitInteractive(command), false);
  assert.deepEqual(instance.snapshot(), settled);
});

test('出招写盘失败不消耗随机状态，重试同一指令与纯规则预期一致', async (t) => {
  const state = await harness(t);
  state.seed();
  const instance = await state.load();
  instance.game.commitInteractive({ type: 'begin', id: 'fight', seed: 9123 });
  instance.game.commitInteractive({
    type: 'choose',
    id: 'fight',
    choiceId: 'challenge',
  });
  const before = instance.snapshot();
  const command = { type: 'battle', id: 'fight', seq: 1, action: 'defend' };
  const expected = state.api.reduceInteractiveAction(before, command, 123);
  state.failWrites = true;
  assert.equal(instance.game.commitInteractive(command), false);
  assert.deepEqual(instance.snapshot(), before);
  state.failWrites = false;
  assert.equal(instance.game.commitInteractive(command), true);
  const after = instance.snapshot();
  assert.deepEqual(
    after.interactive.pending.battle,
    expected.interactive.pending.battle
  );
  assert.equal(after.interactive.pending.battle.commandSeq, 1);
  assert.equal(instance.game.commitInteractive(command), false);
});

test('待处理机缘同步拦截迟到setPlayer/setLogs，包括尚未rerender时', async (t) => {
  const state = await harness(t);
  state.seed();
  const instance = await state.load();
  const oldPlayer = instance.game.player;
  const oldLogs = instance.game.logs;
  instance.game.commitInteractive({ type: 'begin', id: 'frozen', seed: 41 });
  let updaterCalls = 0;
  instance.game.setPlayer((value) => {
    updaterCalls++;
    return { ...value, exp: value.exp + 900 };
  });
  instance.game.setLogs((value) => {
    updaterCalls++;
    return [
      ...value,
      { id: 'late', text: '不应到账', timestamp: 2, type: 'gain' },
    ];
  });
  assert.equal(updaterCalls, 0);
  const after = instance.snapshot();
  assert.deepEqual(after.player, oldPlayer);
  assert.deepEqual(after.logs, oldLogs);
  assert.equal(instance.game.saveGame(oldPlayer, oldLogs), false);
});

test('开始机缘取消已排队自动保存，旧定时器不覆盖关键快照', async (t) => {
  const state = await harness(t);
  state.seed();
  const instance = await state.load();
  assert.ok(state.timers.size > 0);
  instance.game.commitInteractive({
    type: 'begin',
    id: 'cancel-old',
    seed: 28,
  });
  const critical = state.storage.get(SAVE_KEY);
  state.tick(10000);
  instance.flush();
  state.tick(10000);
  assert.equal(state.storage.get(SAVE_KEY), critical);
  assert.equal(state.stored().interactive.pending.id, 'cancel-old');
});

test('机缘确认结束后的迟到旧快照不能回滚角色或日志', async (t) => {
  const state = await harness(t);
  state.seed();
  const instance = await state.load();
  const stalePlayer = instance.game.player;
  const staleLogs = instance.game.logs;
  instance.game.commitInteractive({ type: 'begin', id: 'stale', seed: 78 });
  instance.game.commitInteractive({
    type: 'choose',
    id: 'stale',
    choiceId: 'diagnose',
  });
  instance.game.commitInteractive({ type: 'acknowledge', id: 'stale' });
  const latest = instance.snapshot();
  const critical = state.storage.get(SAVE_KEY);
  assert.equal(instance.game.saveGame(stalePlayer, staleLogs), false);
  assert.equal(state.storage.get(SAVE_KEY), critical);
  assert.equal(state.stored().player.exp, latest.player.exp);
  assert.deepEqual(state.stored().logs, latest.logs);
});

test('当前有pending时导入被拒绝并保留原存档；导入携带pending的合法档可继续同一选择', async (t) => {
  const state = await harness(t);
  const old = state.seed();
  const instance = await state.load();
  instance.game.commitInteractive({ type: 'begin', id: 'stay', seed: 385 });
  const pendingSave = state.stored();
  assert.throws(() => instance.game.importGameSave(old), /机缘/);
  assert.deepEqual(state.stored(), pendingSave);
  instance.game.commitInteractive({
    type: 'choose',
    id: 'stay',
    choiceId: 'leave',
  });
  instance.game.commitInteractive({ type: 'acknowledge', id: 'stay' });
  instance.flush();
  instance.game.importGameSave(
    state.api.parseImportSave(JSON.stringify(pendingSave))
  );
  assert.deepEqual(state.stored().interactive, pendingSave.interactive);
  await instance.game.handleContinueGame();
  instance.flush();
  assert.deepEqual(instance.game.interactive, pendingSave.interactive);
  assert.equal(instance.game.interactive.pending.seed, 385);
  assert.equal(
    instance.game.commitInteractive({
      type: 'choose',
      id: 'stay',
      choiceId: 'diagnose',
    }),
    true
  );
});

test('刷新重载继续同一战斗现场，敌人/已公开意图/随机源和指令序号不重抽', async (t) => {
  const state = await harness(t);
  state.seed();
  const instance = await state.load();
  instance.game.commitInteractive({
    type: 'begin',
    id: 'resume-fight',
    seed: 77221,
  });
  instance.game.commitInteractive({
    type: 'choose',
    id: 'resume-fight',
    choiceId: 'challenge',
  });
  instance.game.commitInteractive({
    type: 'battle',
    id: 'resume-fight',
    seq: 1,
    action: 'defend',
  });
  const saved = state.stored();
  instance.game.handleBackToHome();
  instance.flush();
  await Promise.resolve();
  const restored = await state.load();
  assert.equal(restored.game.screen, 'playing');
  assert.deepEqual(restored.game.interactive, saved.interactive);
  assert.deepEqual(restored.game.player, saved.player);
  assert.deepEqual(restored.game.logs, saved.logs);
  assert.equal(
    restored.game.commitInteractive({
      type: 'battle',
      id: 'resume-fight',
      seq: 1,
      action: 'attack',
    }),
    false
  );
  assert.equal(
    restored.game.commitInteractive({
      type: 'battle',
      id: 'resume-fight',
      seq: 2,
      action: 'attack',
    }),
    true
  );
});

test('确认结果写失败仍保留原结果，重试确认不重复发放或写入日志', async (t) => {
  const state = await harness(t);
  state.seed();
  const instance = await state.load();
  instance.game.commitInteractive({ type: 'begin', id: 'ack', seed: 10 });
  instance.game.commitInteractive({
    type: 'choose',
    id: 'ack',
    choiceId: 'diagnose',
  });
  const before = instance.snapshot();
  const raw = state.storage.get(SAVE_KEY);
  state.failWrites = true;
  assert.equal(
    instance.game.commitInteractive({ type: 'acknowledge', id: 'ack' }),
    false
  );
  assert.deepEqual(instance.snapshot(), before);
  assert.equal(state.storage.get(SAVE_KEY), raw);
  state.failWrites = false;
  assert.equal(
    instance.game.commitInteractive({ type: 'acknowledge', id: 'ack' }),
    true
  );
  const after = instance.snapshot();
  assert.equal(after.interactive.pending, undefined);
  assert.deepEqual(after.player, before.player);
  assert.deepEqual(after.logs, before.logs);
  state.tick(10000);
  assert.equal(state.stored().player.exp, before.player.exp);
});

test('成功导入后旧实例普通/关键操作均冻结，直到加载新存档', async (t) => {
  const state = await harness(t);
  state.seed();
  const instance = await state.load();
  const imported = state.api.createGameSave(
    state.api.createInitialPlayer('导入角色#EFGH', TALENT),
    [],
    99
  );
  instance.game.importGameSave(imported);
  const raw = state.storage.get(SAVE_KEY);
  let updates = 0;
  instance.game.setPlayer((value) => {
    updates++;
    return { ...value, exp: 999 };
  });
  instance.game.setLogs((value) => {
    updates++;
    return value;
  });
  assert.equal(updates, 0);
  assert.equal(
    instance.game.saveGame(instance.game.player, instance.game.logs),
    false
  );
  assert.equal(
    instance.game.commitInteractive({
      type: 'begin',
      id: 'stale-import',
      seed: 22,
    }),
    false
  );
  instance.flush();
  state.tick(10000);
  assert.equal(state.storage.get(SAVE_KEY), raw);
  await instance.game.handleContinueGame();
  instance.flush();
  assert.equal(instance.game.player.name, '导入角色#EFGH');
  assert.equal(
    instance.game.commitInteractive({
      type: 'begin',
      id: 'new-import',
      seed: 23,
    }),
    true
  );
});

test('另一个页面持有写锁时，继续/新建/删除/导入/普通保存均不能覆盖它', async (t) => {
  const state = await harness(t);
  state.seed();
  const owner = await state.load();
  const locked = state.storage.get(SAVE_KEY);
  const stranger = state.create();
  await stranger.game.handleContinueGame();
  stranger.flush();
  assert.equal(stranger.game.player, null);
  assert.match(stranger.game.saveError, /另一个页面/);
  await stranger.game.handleStartGame('不应新建', TALENT);
  await stranger.game.handleDeleteSave();
  assert.throws(() => stranger.game.importGameSave(state.stored()));
  assert.equal(
    stranger.game.saveGame(owner.game.player, owner.game.logs),
    false
  );
  assert.equal(
    stranger.game.commitInteractive({ type: 'begin', id: 'stolen', seed: 1 }),
    false
  );
  assert.equal(state.storage.get(SAVE_KEY), locked);
  assert.equal(state.removals.includes(SAVE_KEY), false);
});

test('锁冲突页面即使读到不兼容数据，也不能删掉另一页面的存档', async (t) => {
  const state = await harness(t);
  state.seed();
  await state.load();
  state.storage.set(
    SAVE_KEY,
    JSON.stringify({ version: -1, player: { name: '保留原始证据' } })
  );
  const original = state.storage.get(SAVE_KEY);
  const stranger = state.create();
  await stranger.game.handleContinueGame();
  stranger.flush();
  assert.equal(state.storage.get(SAVE_KEY), original);
  assert.equal(state.removals.includes(SAVE_KEY), false);
});

test('浏览器无页面写锁仍可加载旧档，但不能开始需要原子写入的互动机缘', async (t) => {
  const state = await harness(t, { ownership: false });
  state.seed();
  const instance = await state.load();
  assert.equal(instance.game.screen, 'playing');
  const before = state.storage.get(SAVE_KEY);
  assert.equal(
    instance.game.commitInteractive({
      type: 'begin',
      id: 'unsupported',
      seed: 1,
    }),
    false
  );
  assert.deepEqual(
    instance.snapshot().interactive,
    state.api.emptyInteractiveProgress()
  );
  assert.equal(state.storage.get(SAVE_KEY), before);
  assert.match(instance.game.saveError, /存档锁/);
});

test('等待页面锁时组件已卸载，迟到获得的锁必须立即释放', async (t) => {
  const state = await harness(t, { deferOwnership: true });
  state.seed();
  const instance = state.create();
  const continuing = instance.game.handleContinueGame();
  for (let i = 0; i < 8 && !state.lockRequests.length; i++)
    await Promise.resolve();
  assert.equal(state.lockRequests.length, 1);
  instance.dispose();
  state.lockRequests[0]();
  await continuing;
  for (let i = 0; i < 8; i++) await Promise.resolve();
  assert.equal(state.lockHeld, false);
});

test('等待页面锁时已返回首页，迟到加载不能重新占用存档锁', async (t) => {
  const state = await harness(t, { deferOwnership: true });
  state.seed();
  const instance = state.create();
  const continuing = instance.game.handleContinueGame();
  for (let i = 0; i < 8 && !state.lockRequests.length; i++)
    await Promise.resolve();
  assert.equal(state.lockRequests.length, 1);
  instance.game.handleBackToHome();
  instance.flush();
  state.lockRequests[0]();
  await continuing;
  for (let i = 0; i < 8; i++) await Promise.resolve();
  instance.flush();
  assert.equal(instance.game.player, null);
  assert.equal(instance.game.screen, 'home');
  assert.equal(state.lockHeld, false);
});

test('关闭普通自动保存仍逐次保存机缘关键动作与终局', async (t) => {
  const state = await harness(t);
  state.seed();
  const instance = await state.load();
  instance.game.setSettings((settings) => ({ ...settings, autoSave: false }));
  instance.flush();
  assert.equal(state.timers.size, 0);
  assert.equal(
    instance.game.commitInteractive({
      type: 'begin',
      id: 'autosave-off',
      seed: 93,
    }),
    true
  );
  assert.equal(state.stored().interactive.pending.phase, 'choice');
  assert.equal(
    instance.game.commitInteractive({
      type: 'choose',
      id: 'autosave-off',
      choiceId: 'diagnose',
    }),
    true
  );
  assert.equal(state.stored().interactive.pending.phase, 'result');
  assert.equal(state.stored().interactive.lastSettledSeq, 1);
  assert.equal(
    instance.game.commitInteractive({
      type: 'acknowledge',
      id: 'autosave-off',
    }),
    true
  );
  assert.equal(state.stored().interactive.pending, undefined);
  instance.flush();
  assert.equal(state.timers.size, 0);
});

test('机缘扩展损坏时保留原存档，不静默丢弃现场后自动覆盖', async (t) => {
  const state = await harness(t);
  state.seed('保留损坏现场#ABCD', {
    version: 1,
    nextSeq: 2,
    lastSettledSeq: 0,
    facts: {},
    pending: { id: 'damaged', seq: 1, seed: 1, phase: 'battle' },
  });
  const raw = state.storage.get(SAVE_KEY);
  const instance = await state.load();
  assert.equal(instance.game.player, null);
  assert.equal(instance.game.screen, 'home');
  assert.match(instance.game.saveError, /原数据已保留/);
  state.tick(10000);
  assert.equal(state.storage.get(SAVE_KEY), raw);
  assert.equal(state.removals.includes(SAVE_KEY), false);
  assert.throws(() => state.api.parseImportSave(raw), /机缘|挑战/);
});

test('导入写盘失败保留原存档和当前角色，可以继续原游戏', async (t) => {
  const state = await harness(t);
  state.seed();
  const instance = await state.load();
  const before = instance.snapshot();
  const raw = state.storage.get(SAVE_KEY);
  const imported = state.api.createGameSave(
    state.api.createInitialPlayer('不能覆盖#EFGH', TALENT),
    [],
    5
  );
  state.failWrites = true;
  assert.throws(() => instance.game.importGameSave(imported), /存储空间不足/);
  assert.equal(state.storage.get(SAVE_KEY), raw);
  assert.deepEqual(instance.snapshot(), before);
  state.failWrites = false;
  assert.equal(
    instance.game.commitInteractive({
      type: 'begin',
      id: 'after-import-failure',
      seed: 153,
    }),
    true
  );
});
