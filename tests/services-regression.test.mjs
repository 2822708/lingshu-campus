import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveBattleEncounter } from '../services/battleService';
import { generateRandomSectTasks } from '../services/randomService';
import { generateAdventureEvent } from '../services/aiService';
import { normalizeItemEffect, inferItemTypeAndSlot } from '../utils/itemUtils';
import { createInitialPlayer } from '../utils/playerUtils';
import { RealmType } from '../types';
import baseline from './fixtures/services-baseline.json';

// 基准来自修复前的 67f12ae；比较完整结果和随机调用次数，防止掉落顺序漂移。
async function compareBaseline(key, seed, operation) {
  const originalRandom = Math.random;
  const originalNow = Date.now;
  const storageDescriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    'localStorage'
  );
  const fetchDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'fetch');
  let state = seed;
  let randomCalls = 0;
  let networkCalls = 0;
  Math.random = () => {
    randomCalls++;
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  Date.now = () => baseline.fixedNow;
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: { getItem: () => null },
  });
  Object.defineProperty(globalThis, 'fetch', {
    configurable: true,
    value: () => {
      networkCalls++;
      throw new Error('回归测试禁止网络请求');
    },
  });
  try {
    const result = await operation();
    // JSON 存档和快照都会省略 undefined 字段，按相同协议比较。
    assert.deepEqual(
      JSON.parse(JSON.stringify({ result, randomCalls })),
      baseline[key]
    );
    assert.equal(networkCalls, 0);
  } finally {
    Math.random = originalRandom;
    Date.now = originalNow;
    if (storageDescriptor)
      Object.defineProperty(globalThis, 'localStorage', storageDescriptor);
    else delete globalThis.localStorage;
    if (fetchDescriptor)
      Object.defineProperty(globalThis, 'fetch', fetchDescriptor);
    else delete globalThis.fetch;
  }
}

test('社团任务五种类型保留成本、贡献奖励、顺序和随机消耗', async () => {
  await compareBaseline('tasks', 23, () =>
    generateRandomSectTasks('核心成员', 12)
  );
});

test('副本战斗胜利保留回放、奖励与专属掉落', async () => {
  await compareBaseline('victory', 33, () =>
    resolveBattleEncounter(
      {
        ...createInitialPlayer('回归检查', ''),
        realm: RealmType.GoldenCore,
        realmLevel: 5,
        attack: 10000,
        hp: 10000,
        maxHp: 10000,
      },
      'secret_realm',
      '中',
      RealmType.QiRefining,
      '固定副本',
      '',
      ['瑰夏咖啡豆', '红轴机械键盘', '不存在的物品']
    )
  );
});

test('高风险副本战败保留伤害、失败回放及零掉落', async () => {
  await compareBaseline('defeat', 11, () =>
    resolveBattleEncounter(
      createInitialPlayer('回归检查', ''),
      'secret_realm',
      '极度危险',
      RealmType.GoldenCore,
      '固定副本',
      '',
      ['瑰夏咖啡豆']
    )
  );
});

test('已知和未知物品效果及旧防具槽位兼容保持不变', async () => {
  await compareBaseline('items', 7, () => ({
    known: normalizeItemEffect(
      '速溶美式',
      { attack: 9, hp: 12 },
      { maxHp: 23 }
    ),
    unknown: normalizeItemEffect(
      '未知物品',
      { attack: 9, hp: 12 },
      { maxHp: 23 }
    ),
    slots: ['手环', '校园卡挂绳', '显示器', '旧护甲'].map((name) =>
      inferItemTypeAndSlot(name, '防具', '', true)
    ),
  }));
});

test('AI关闭时三类事件继续使用本地模板且不发送网络请求', async () => {
  await compareBaseline('localEvents', 17, async () => {
    const player = createInitialPlayer('回归检查', '');
    return Promise.all(
      ['normal', 'lucky', 'secret_realm'].map((type) =>
        generateAdventureEvent(player, type, '中', '固定副本', '固定环境')
      )
    );
  });
});
