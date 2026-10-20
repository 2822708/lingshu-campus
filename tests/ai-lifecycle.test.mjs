import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire as createLifecycleRequire } from 'node:module';
import { join } from 'node:path';

// Resolve the installed build API at runtime: the repository test runner bundles
// this file, whereas esbuild itself must remain outside that bundle.
const { build } = createLifecycleRequire(join(process.cwd(), 'package.json'))('esbuild');
const HARNESS = Symbol.for('lingshu.ai-lifecycle-test');
const TALENT = 'npu:circuit:juanwang';
let bundleSequence = 0;

async function createHarness(t, savedName) {
  const state = {
    slots: [],
    uidRequests: [],
    storage: new Map(),
    alerts: [],
    errors: [],
  };
  const descriptors = new Map();
  for (const name of ['localStorage', 'sessionStorage', 'alert', HARNESS]) {
    descriptors.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
  }
  const storage = {
    getItem: (key) => state.storage.get(key) ?? null,
    setItem: (key, value) => state.storage.set(key, String(value)),
    removeItem: (key) => state.storage.delete(key),
  };
  Object.defineProperty(globalThis, HARNESS, {
    configurable: true,
    value: state,
  });
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: storage,
  });
  Object.defineProperty(globalThis, 'sessionStorage', {
    configurable: true,
    value: { getItem: () => null },
  });
  Object.defineProperty(globalThis, 'alert', {
    configurable: true,
    value: (message) => state.alerts.push(message),
  });
  t.mock.method(globalThis, 'fetch', async () => {
    throw new Error('Lifecycle tests must never use network');
  });
  t.mock.method(console, 'error', (...args) => state.errors.push(args));
  t.after(() => {
    for (const [name, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  });

  const built = await build({
    stdin: {
      contents: [
        "export { useGameState } from './hooks/useGameState';",
        "export { createInitialPlayer } from './utils/playerUtils';",
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
        name: 'lifecycle-test-dependencies',
        setup(builder) {
          builder.onResolve({ filter: /^react$/ }, () => ({
            path: 'react',
            namespace: 'lifecycle',
          }));
          builder.onResolve({ filter: /uidApi$/ }, () => ({
            path: 'uid',
            namespace: 'lifecycle',
          }));
          builder.onLoad({ filter: /.*/, namespace: 'lifecycle' }, (args) => ({
            loader: 'js',
            contents:
              args.path === 'react'
                ? `
              const state = () => globalThis[Symbol.for('lingshu.ai-lifecycle-test')];
              export function useState(initial) {
                const slot = { value: typeof initial === 'function' ? initial() : initial };
                state().slots.push(slot);
                return [slot.value, next => {
                  slot.value = typeof next === 'function' ? next(slot.value) : next;
                }];
              }
              export const useCallback = fn => fn;
              export const useMemo = fn => fn();
              export const useEffect = () => {};
              export const useRef = value => ({ current: value });
            `
                : `
              export const ensureUid = name => new Promise((resolve, reject) => {
                globalThis[Symbol.for('lingshu.ai-lifecycle-test')].uidRequests.push({ name, resolve, reject });
              });
              export const extractUidFromName = () => null;
              export const releaseUid = async () => {};
            `,
          }));
        },
      },
    ],
  });
  // Distinct module instances isolate epoch counters between cases.
  const url =
    'data:text/javascript;base64,' +
    Buffer.from(built.outputFiles[0].text).toString('base64');
  const api = await import(url + '#lifecycle-' + ++bundleSequence);
  if (savedName) {
    state.storage.set(
      'npu-game-save',
      JSON.stringify({
        version: 2,
        player: api.createInitialPlayer(savedName, TALENT),
        logs: [{ id: 'old-log', text: '旧档案', type: 'normal', timestamp: 1 }],
        timestamp: 1,
      })
    );
  }
  state.game = api.useGameState();
  // The harness observes setters, not React rendering or browser persistence.
  state.snapshot = () =>
    structuredClone({
      screen: state.slots[1].value,
      player: state.slots[2].value,
      logs: state.slots[4].value,
      hasSave: state.slots[0].value,
      stored: [...state.storage],
    });
  return state;
}

test('新建等待UID期间删档，迟到UID不能重建玩家或存档', async (t) => {
  const state = await createHarness(t);
  const starting = state.game.handleStartGame('旧新建请求', TALENT);
  assert.equal(state.uidRequests.length, 1);
  state.game.handleDeleteSave();
  const afterDelete = state.snapshot();
  state.uidRequests[0].resolve('旧新建请求#ABCD');
  await starting;
  assert.deepEqual(state.snapshot(), afterDelete);
  assert.equal(state.snapshot().screen, 'home');
  assert.equal(state.snapshot().player, null);
  assert.equal(state.storage.has('npu-game-save'), false);
});

test('继续旧档期间启动更新上下文，迟到加载不覆盖新角色', async (t) => {
  const state = await createHarness(t, '旧档角色');
  const continuing = state.game.handleContinueGame();
  const starting = state.game.handleStartGame('新角色', TALENT);
  assert.equal(state.uidRequests.length, 2);
  state.uidRequests[1].resolve('新角色#EFGH');
  await starting;
  const newer = state.snapshot();
  state.uidRequests[0].resolve('旧档角色#ABCD');
  await continuing;
  assert.deepEqual(state.snapshot(), newer);
  assert.equal(state.snapshot().player.name, '新角色#EFGH');
  assert.equal(
    JSON.parse(state.storage.get('npu-game-save')).player.name,
    '新角色#EFGH'
  );
});

test('已过期的旧加载失败，不清除新存档或弹出损坏提示', async (t) => {
  const state = await createHarness(t, '旧档角色');
  const continuing = state.game.handleContinueGame();
  const starting = state.game.handleStartGame('新角色', TALENT);
  state.uidRequests[1].resolve('新角色#EFGH');
  await starting;
  const newer = state.snapshot();
  state.uidRequests[0].reject(new Error('模拟旧UID请求失败'));
  await continuing;
  assert.deepEqual(state.snapshot(), newer);
  assert.deepEqual(state.alerts, []);
  assert.deepEqual(state.errors, []);
});
