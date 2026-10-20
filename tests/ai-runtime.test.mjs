import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire as createRuntimeRequire } from 'node:module';
import { join } from 'node:path';

// Isolate runtime singletons and browser events; every fetch is replaced.
const { build } = createRuntimeRequire(join(process.cwd(), 'package.json'))(
  'esbuild'
);
let instance = 0;
const config = {
  provider: 'custom',
  enabled: true,
  protocol: 'openai',
  useProxy: false,
  apiUrl: 'https://runtime.invalid/mock',
  apiKey: 'test-only-placeholder',
  model: 'mock-model',
};
const input = { realm: '大一', success: true };
const response = (text = '测试记录') =>
  new Response(
    JSON.stringify({
      choices: [
        {
          finish_reason: 'stop',
          message: { content: JSON.stringify({ text }) },
        },
      ],
      usage: { prompt_tokens: 11, completion_tokens: 5 },
    })
  );
function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

async function harness(t) {
  const original = new Map(
    ['window', 'localStorage', 'sessionStorage'].map((key) => [
      key,
      Object.getOwnPropertyDescriptor(globalThis, key),
    ])
  );
  const window = new EventTarget();
  const saved = new Map();
  const storage = {
    getItem: (key) => saved.get(key) ?? null,
    setItem: (key, value) => saved.set(key, String(value)),
    removeItem: (key) => saved.delete(key),
  };
  for (const [key, value] of [
    ['window', window],
    ['localStorage', storage],
    ['sessionStorage', storage],
  ]) {
    Object.defineProperty(globalThis, key, { configurable: true, value });
  }
  let fetchImpl = async () => {
    throw new Error('Runtime tests must never access network');
  };
  t.mock.method(globalThis, 'fetch', (...args) => fetchImpl(...args));
  t.after(() => {
    for (const [key, descriptor] of original) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });
  const built = await build({
    entryPoints: [join(process.cwd(), 'services/ai/runtime.ts')],
    write: false,
    bundle: true,
    platform: 'node',
    format: 'esm',
    define: { 'import.meta.env': '{}' },
    logLevel: 'silent',
  });
  const api = await import(
    'data:text/javascript;base64,' +
      Buffer.from(built.outputFiles[0].text).toString('base64') +
      '#runtime-' +
      ++instance
  );
  t.after(() => api.cancelGameAI());
  return {
    api,
    window,
    saved,
    setFetch: (next) => {
      fetchImpl = next;
    },
    storageEvent: (key) => {
      const event = new Event('storage');
      Object.defineProperty(event, 'key', { value: key });
      window.dispatchEvent(event);
    },
  };
}

test('runtime繁忙时拒绝第二次付费调用，完成后释放并发门禁', async (t) => {
  const h = await harness(t);
  const first = deferred();
  let calls = 0;
  h.setFetch(async () => (++calls === 1 ? first.promise : response('下一次')));
  const pending = h.api.runGameAISkill('breakthrough', input, { config });
  await assert.rejects(
    h.api.runGameAISkill('breakthrough', input, { config }),
    /已有生成正在进行/
  );
  assert.equal(calls, 1);
  first.resolve(response('第一次'));
  assert.deepEqual(await pending, { text: '第一次' });
  assert.deepEqual(
    await h.api.runGameAISkill('breakthrough', input, { config }),
    { text: '下一次' }
  );
  assert.equal(calls, 2);
});

test('runtime超时取消底层signal并释放门禁，下一次调用可以执行', async (t) => {
  const h = await harness(t);
  let signal;
  h.setFetch(async (_, init) => {
    signal = init.signal;
    return new Promise(() => {});
  });
  await assert.rejects(
    h.api.runGameAISkill('breakthrough', input, {
      config: { ...config, timeoutMs: 10 },
    }),
    (error) => error.code === 'timeout'
  );
  assert.equal(signal.aborted, true);
  h.setFetch(async () => response());
  assert.deepEqual(
    await h.api.runGameAISkill('breakthrough', input, { config }),
    { text: '测试记录' }
  );
});

test('runtime预取消不发送请求，取消后重试不残留繁忙状态', async (t) => {
  const h = await harness(t);
  const controller = new AbortController();
  controller.abort();
  let calls = 0;
  h.setFetch(async () => {
    calls++;
    return response();
  });
  await assert.rejects(
    h.api.runGameAISkill('breakthrough', input, {
      config,
      signal: controller.signal,
    }),
    (error) => error.code === 'cancelled'
  );
  assert.equal(calls, 0);
  await h.api.runGameAISkill('breakthrough', input, { config });
  assert.equal(calls, 1);
});

test('上下文epoch变化取消旧请求，迟到响应释放body且不影响新请求', async (t) => {
  const h = await harness(t);
  const old = deferred();
  let calls = 0;
  let oldSignal;
  h.setFetch(async (_, init) => {
    if (++calls === 1) {
      oldSignal = init.signal;
      return old.promise;
    }
    return response('新上下文');
  });
  const epoch = h.api.getAIContextEpoch();
  const pending = h.api.runGameAISkill('breakthrough', input, { config });
  const rejected = assert.rejects(
    pending,
    (error) => error instanceof h.api.AIContextCancelledError
  );
  h.api.cancelGameAI();
  await rejected;
  assert.equal(oldSignal.aborted, true);
  assert.equal(h.api.isAIContextCurrent(epoch), false);
  assert.deepEqual(
    await h.api.runGameAISkill('breakthrough', input, { config }),
    { text: '新上下文' }
  );
  let cancelledBody = false;
  old.resolve(
    new Response(
      new ReadableStream({
        cancel() {
          cancelledBody = true;
        },
      })
    )
  );
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(cancelledBody, true);
  assert.equal(calls, 2);
});

test('配置变化只取消文案请求，不伪装成角色epoch变化；新配置可继续调用', async (t) => {
  const h = await harness(t);
  let oldSignal;
  h.setFetch(async (_, init) => {
    oldSignal = init.signal;
    return new Promise(() => {});
  });
  const epoch = h.api.getAIContextEpoch();
  const pending = h.api.runGameAISkill('breakthrough', input, { config });
  const rejected = assert.rejects(
    pending,
    (error) =>
      error.code === 'cancelled' &&
      !(error instanceof h.api.AIContextCancelledError)
  );
  h.window.dispatchEvent(new Event('lingshu-ai-config-changed'));
  await rejected;
  assert.equal(oldSignal.aborted, true);
  assert.equal(h.api.getAIContextEpoch(), epoch);
  h.setFetch(async (_, init) => {
    assert.equal(JSON.parse(init.body).model, 'new-model');
    return response();
  });
  await h.api.runGameAISkill('breakthrough', input, {
    config: { ...config, model: 'new-model' },
  });
});

test('storage事件仅相关配置或clear会取消，普通存档变化不取消AI', async (t) => {
  const h = await harness(t);
  let signal;
  h.setFetch(async (_, init) => {
    signal = init.signal;
    return new Promise(() => {});
  });
  let pending = h.api.runGameAISkill('breakthrough', input, { config });
  h.storageEvent('npu-game-save');
  assert.equal(signal.aborted, false);
  let rejected = assert.rejects(pending, (error) => error.code === 'cancelled');
  h.storageEvent('npu-user-ai-config');
  await rejected;
  pending = h.api.runGameAISkill('breakthrough', input, { config });
  rejected = assert.rejects(pending, (error) => error.code === 'cancelled');
  h.storageEvent(null);
  await rejected;
});

test('skill结构校验失败释放门禁，不向调用方返回越权奖励', async (t) => {
  const h = await harness(t);
  h.setFetch(
    async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: { content: '{"text":"记录","expChange":100000}' },
              finish_reason: 'stop',
            },
          ],
        })
      )
  );
  await assert.rejects(
    h.api.runGameAISkill('breakthrough', input, { config }),
    /未允许的字段/
  );
  h.setFetch(async () => response());
  assert.deepEqual(
    await h.api.runGameAISkill('breakthrough', input, { config }),
    { text: '测试记录' }
  );
});

test('连接测试使用未保存草稿且不写配置/进度，HTTP错误保持脱敏', async (t) => {
  const h = await harness(t);
  h.saved.set('npu-game-save', 'unchanged');
  const before = [...h.saved];
  const draft = {
    enabled: false,
    provider: 'custom',
    protocol: 'openai',
    customUrl: 'https://draft.invalid/custom',
    model: 'draft-model',
    apiKey: 'test-only-placeholder',
    rememberKey: false,
  };
  h.setFetch(async (url, init) => {
    assert.equal(url, draft.customUrl);
    assert.equal(JSON.parse(init.body).model, 'draft-model');
    return new Response(
      JSON.stringify({
        choices: [
          {
            message: { content: '{"story":"测试手记"}' },
            finish_reason: 'stop',
          },
        ],
      })
    );
  });
  const result = await h.api.testAIConnection(draft);
  assert.equal(result.ok, true);
  assert.ok(result.latencyMs >= 0);
  assert.deepEqual([...h.saved], before);
  h.setFetch(
    async () =>
      new Response('private-provider-body test-only-placeholder', {
        status: 401,
      })
  );
  const error = await h.api.testAIConnection(draft);
  assert.equal(error.ok, false);
  assert.match(error.message, /401/);
  assert.doesNotMatch(
    error.message,
    /private-provider-body|placeholder|draft.invalid/
  );
});
