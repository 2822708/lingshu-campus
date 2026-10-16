import test from 'node:test';
import assert from 'node:assert/strict';
import {
  generateAdventureEvent,
  generateBreakthroughFlavorText,
  generateEnemyName,
} from '../services/aiService';
import { createInitialPlayer } from '../utils/playerUtils';
import { RealmType } from '../types';
import { CAMPUS_THEME } from '../config/campusTheme';

test('三类AI请求约束虚构背景，清理生成文案且保留数字和兼容标识', async (t) => {
  const storageDescriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    'localStorage'
  );
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key) =>
        key === 'npu-user-ai-config'
          ? JSON.stringify({
              enabled: true,
              provider: 'custom',
              apiKey: 'test-only-placeholder',
              model: 'mock-campus-model',
              customUrl: 'https://campus.invalid/mock',
            })
          : null,
    },
  });

  const adventureResponse = {
    story: '你在南京邮电大学的电子与光学工程学院研习。',
    hpChange: -7,
    expChange: 13,
    spiritStonesChange: 22,
    lotteryTicketsChange: 3,
    eventColor: 'gain',
    petObtained: 'pet-spirit-fox',
    itemObtained: {
      id: 'npu:algorithm:pingmin',
      name: '南邮手记',
      description: '从三牌楼带回的NPU课程资料。',
      type: '元件',
      rarity: '稀有',
      recipeName: '南邮旧配方键',
      effect: { attack: 11, exp: 23, breakthroughBonus: 0.3 },
      permanentEffect: { maxHp: 17 },
    },
    itemsObtained: [
      {
        name: '仙林资料夹',
        description: '计算机学院整理的南邮手记。',
        type: '元件',
        effect: { spirit: 8 },
      },
    ],
    petOpportunity: {
      type: 'stats',
      petId: 'npu:legacy-pet',
      statsBoost: { attack: 31 },
    },
  };
  const responses = [
    JSON.stringify(adventureResponse),
    '你在南京邮电大学完成答辩。',
    JSON.stringify({ name: '南邮考官', title: '仙林答辩席' }),
  ];
  const requests = [];
  // 完全替换 fetch：假配置只进入该桩函数，绝不调用真实网络。
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, 'https://campus.invalid/mock');
    requests.push(JSON.parse(options.body));
    assert.ok(responses.length > 0, '不应产生额外请求');
    return {
      ok: true,
      json: async () => ({
        choices: [{ message: { content: responses.shift() } }],
      }),
    };
  });

  try {
    const player = createInitialPlayer('测试同学', 'npu:algorithm:pingmin');
    const actual = await generateAdventureEvent(player, 'normal');
    const expected = structuredClone(adventureResponse);
    expected.story = '你在学园的电路学部研习。';
    expected.itemObtained.name = '学园手记';
    expected.itemObtained.description = '从西区带回的学园课程资料。';
    expected.itemsObtained[0].name = '东区资料夹';
    expected.itemsObtained[0].description = '算法学部整理的学园手记。';
    // 深比较同时覆盖所有数值、ID、配方键、类型与未知兼容字段。
    assert.deepEqual(actual, expected);

    assert.equal(
      await generateBreakthroughFlavorText(RealmType.Foundation, true),
      '你在学园完成答辩。'
    );
    assert.deepEqual(await generateEnemyName(RealmType.QiRefining, 'normal'), {
      name: '学园考官',
      title: '东区答辩席',
    });

    assert.equal(requests.length, 3);
    assert.equal(responses.length, 0);
    for (const request of requests) {
      assert.equal(request.messages[0].role, 'system');
      assert.ok(request.messages[0].content.includes(CAMPUS_THEME.aiSetting));
    }
  } finally {
    if (storageDescriptor)
      Object.defineProperty(globalThis, 'localStorage', storageDescriptor);
    else delete globalThis.localStorage;
  }
});
