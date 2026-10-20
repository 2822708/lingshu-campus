import test from 'node:test';
import assert from 'node:assert/strict';
import {
  generateAdventureEvent,
  generateBreakthroughFlavorText,
  generateEnemyName,
} from '../services/aiService';
import { generateLocalAdventureEvent } from '../utils/localEvents';
import { createInitialPlayer } from '../utils/playerUtils';
import { RealmType } from '../types';
import { CAMPUS_THEME } from '../config/campusTheme';
import {
  AIContextCancelledError,
  cancelGameAI,
  testAIConnection,
  runGameAISkill,
} from '../services/ai/runtime';

const config = {
  enabled: true,
  provider: 'custom',
  apiKey: 'test-only-placeholder',
  model: 'mock-campus-model',
  customUrl: 'https://campus.invalid/mock',
};
function installStorage(t, value = config) {
  const data = new Map([['npu-user-ai-config', JSON.stringify(value)]]);
  for (const name of ['localStorage', 'sessionStorage']) {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, {
      configurable: true,
      value: {
        getItem: (key) =>
          name === 'localStorage' ? (data.get(key) ?? null) : null,
        setItem: (key, value) => data.set(key, value),
        removeItem: (key) => data.delete(key),
      },
    });
    t.after(() => {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    });
  }
  return data;
}
const response = (text) =>
  new Response(
    JSON.stringify({
      choices: [{ message: { content: text }, finish_reason: 'stop' }],
    }),
    { headers: { 'Content-Type': 'application/json' } }
  );
function seededRandom(seed) {
  let state = seed;
  let calls = 0;
  const random = () => {
    calls++;
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  return { random, calls: () => calls };
}

test('三项游戏技能使用虚构背景与受控JSON，不发送姓名UID，学部命格进入叙事', async (t) => {
  installStorage(t);
  const replies = [
    JSON.stringify({ story: '你在南京邮电大学整理了一页笔记。' }),
    JSON.stringify({ text: '你在南京邮电大学完成答辩。' }),
    JSON.stringify({ name: '南邮考官', title: '仙林答辩席' }),
  ];
  const requests = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, config.customUrl);
    requests.push(JSON.parse(options.body));
    return response(replies.shift());
  });
  const player = createInitialPlayer(
    '不该发送的姓名#ABCD',
    'npu:algorithm:pingmin'
  );
  const event = await generateAdventureEvent(player);
  assert.equal(event.story, '你在学园整理了一页笔记。');
  assert.ok(Number.isFinite(event.hpChange));
  assert.equal(
    await generateBreakthroughFlavorText(RealmType.Foundation, true),
    '你在学园完成答辩。'
  );
  assert.deepEqual(await generateEnemyName(RealmType.QiRefining, 'normal'), {
    name: '学园考官',
    title: '东区答辩席',
  });
  assert.equal(requests.length, 3);
  for (const request of requests) {
    assert.ok(request.messages[0].content.includes(CAMPUS_THEME.aiSetting));
    assert.doesNotMatch(
      JSON.stringify(request),
      /不该发送的姓名|ABCD|test-only-placeholder/
    );
  }
  assert.match(requests[0].messages[1].content, /算法学部/);
  assert.match(requests[0].messages[1].content, /平民命/);
});

test('在线和离线使用同一规则结果，三类事件多种种子下随机消耗一致', async (t) => {
  installStorage(t);
  const player = createInitialPlayer('固定测试', 'npu:circuit:juanwang');
  t.mock.method(globalThis, 'fetch', async () =>
    response('{"story":"你整理了这次研习的记录。"}')
  );
  for (const adventureType of ['normal', 'lucky', 'secret_realm']) {
    for (const seed of [1, 7, 25, 99, 456, 9999]) {
      const first = seededRandom(seed);
      const baselineMock = t.mock.method(Math, 'random', first.random);
      const expected = generateLocalAdventureEvent(player, adventureType);
      baselineMock.mock.restore();
      const second = seededRandom(seed);
      const onlineMock = t.mock.method(Math, 'random', second.random);
      const actual = await generateAdventureEvent(player, adventureType);
      onlineMock.mock.restore();
      assert.deepEqual({ ...actual, story: expected.story }, expected);
      assert.equal(
        second.calls(),
        first.calls(),
        `${adventureType}/${seed}不应重复抽取`
      );
    }
  }
});

test('缺字段、极值奖励、伪造物品和断网均回退原结果，不采用AI奖励或重掷', async (t) => {
  installStorage(t);
  const player = createInitialPlayer('边界测试', 'npu:circuit:juanwang');
  const invalid = [
    '{}',
    '{"eventColor":"gain"}',
    '{"story":"获得奖励","expChange":1e100}',
    '{"story":"获得道具","itemObtained":{"name":"伪造物品"}}',
    '{"story":null}',
    '普通文本',
    null,
  ];
  for (const text of invalid) {
    const baseline = seededRandom(41);
    const first = t.mock.method(Math, 'random', baseline.random);
    const expected = generateLocalAdventureEvent(player, 'normal');
    first.mock.restore();
    const replay = seededRandom(41);
    const second = t.mock.method(Math, 'random', replay.random);
    const network = t.mock.method(globalThis, 'fetch', async () => {
      if (text === null) throw new Error('模拟断网');
      return response(text);
    });
    assert.deepEqual(await generateAdventureEvent(player), expected);
    assert.equal(replay.calls(), baseline.calls());
    second.mock.restore();
    network.mock.restore();
  }
});

test('角色上下文取消后迟到响应被拒绝，不能回退为旧角色行动', async (t) => {
  installStorage(t);
  const player = createInitialPlayer('旧角色', 'npu:circuit:juanwang');
  let release;
  t.mock.method(
    globalThis,
    'fetch',
    () =>
      new Promise((resolve) => {
        release = resolve;
      })
  );
  const pending = generateAdventureEvent(player);
  cancelGameAI();
  await assert.rejects(pending, AIContextCancelledError);
  release(response('{"story":"迟到的记录。"}'));
});

test('连接测试使用事件协议，拒绝空200和普通OK，不保存草稿或更改游戏存档', async (t) => {
  const storage = installStorage(t, { ...config, enabled: false });
  storage.set('npu-game-save', 'unchanged-game-save');
  const before = [...storage];
  for (const text of ['', 'OK', '{"story":"你整理了一页笔记。"}']) {
    const network = t.mock.method(globalThis, 'fetch', async () =>
      text ? response(text) : new Response('')
    );
    const actual = await testAIConnection(config);
    assert.equal(actual.ok, text.startsWith('{'));
    assert.deepEqual([...storage], before);
    network.mock.restore();
  }
});

test('协调器不积累付费并发，繁忙调用不会产生第二个请求', async (t) => {
  installStorage(t);
  let requests = 0;
  const controller = new AbortController();
  t.mock.method(globalThis, 'fetch', () => {
    requests++;
    return new Promise(() => {});
  });
  const first = runGameAISkill(
    'enemy-name',
    { realm: '大一', adventureType: 'normal' },
    { signal: controller.signal }
  );
  await assert.rejects(
    runGameAISkill('enemy-name', { realm: '大一', adventureType: 'normal' }),
    /已有生成/
  );
  assert.equal(requests, 1);
  controller.abort();
  await assert.rejects(first, /取消/);
});
