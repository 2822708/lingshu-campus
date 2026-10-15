import test from 'node:test';
import assert from 'node:assert/strict';
import { executeAdventureCore } from '../views/adventure/executeAdventureCore';
import baseline from './fixtures/adventure-baseline.json';
import { runAdventureScenario } from './helpers/adventureScenario.mjs';

// 预期输出由历史提交 67f12ae 的 executeAdventureCore 运行生成。
// fixture 固定输入、时钟、随机种子和预期状态，避免用当前实现生成当前预期。
for (const scenario of baseline.cases) {
  test(`冒险历史行为回归：${scenario.name}`, async () => {
    const actual = await runAdventureScenario(
      executeAdventureCore,
      baseline.basePlayer,
      scenario
    );
    assert.deepEqual(actual, scenario.expected);
  });
}
