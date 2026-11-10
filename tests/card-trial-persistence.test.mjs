import test from 'node:test';
import assert from 'node:assert/strict';
import { createTrial, reduceTrial } from '../prototypes/card-trial/engine';
import {
  loadTrial,
  commitTrial,
  TRIAL_SAVE_KEY,
} from '../prototypes/card-trial/persistence';

function storage() {
  const data = new Map([['npu-game-save', 'main-game-sentinel']]);
  let fail = false;
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem(key, value) {
      if (fail) throw new Error('quota');
      data.set(key, String(value));
    },
    fail(value) {
      fail = value;
    },
  };
}
const nextTurn = (state) =>
  reduceTrial(state, {
    runId: state.runId,
    seq: state.commandSeq + 1,
    type: 'end-turn',
  });

test('独立存档可续接相同牌序与指令，不读取或改写主游戏记录', () => {
  const db = storage();
  assert.deepEqual(loadTrial(db), { state: null, error: '' });
  const first = createTrial({ seed: 271828, runId: 'isolated' });
  assert.equal(commitTrial(db, null, first).ok, true);
  const second = nextTurn(first);
  assert.equal(commitTrial(db, first, second).ok, true);
  const restored = loadTrial(db);
  assert.deepEqual(restored.state, second);
  assert.deepEqual(nextTurn(restored.state), nextTurn(second));
  assert.deepEqual(
    [...db.data.keys()].sort(),
    [TRIAL_SAVE_KEY, 'npu-game-save'].sort()
  );
  assert.equal(db.data.get('npu-game-save'), 'main-game-sentinel');
});

test('存储失败保留旧快照，恢复后同一指令仅提交一次', () => {
  const db = storage();
  const first = createTrial({ seed: 25, runId: 'quota' });
  commitTrial(db, null, first);
  const second = nextTurn(first);
  db.fail(true);
  const failed = commitTrial(db, first, second);
  assert.equal(failed.ok, false);
  assert.match(failed.error, /没有推进/);
  assert.deepEqual(loadTrial(db).state, first);
  db.fail(false);
  assert.equal(commitTrial(db, first, second).ok, true);
  const once = db.getItem(TRIAL_SAVE_KEY);
  assert.equal(commitTrial(db, first, second).ok, false);
  assert.equal(db.getItem(TRIAL_SAVE_KEY), once);
});

test('损坏记录读取时不被清除，显式新开只覆盖独立键', () => {
  const db = storage();
  db.data.set(TRIAL_SAVE_KEY, '{broken');
  const result = loadTrial(db);
  assert.equal(result.state, null);
  assert.ok(result.error);
  assert.equal(db.getItem(TRIAL_SAVE_KEY), '{broken');
  const first = createTrial({ seed: 4, runId: 'replacement' });
  assert.equal(commitTrial(db, null, first).ok, true);
  assert.deepEqual(loadTrial(db).state, first);
  assert.equal(db.getItem('npu-game-save'), 'main-game-sentinel');
});

test('过期页面和跳号指令不能覆盖新进度，显式重开可建立新试炼', () => {
  const db = storage();
  const first = createTrial({ seed: 42, runId: 'original' });
  commitTrial(db, null, first);
  assert.equal(
    commitTrial(db, null, createTrial({ seed: 8, runId: 'race' })).ok,
    false
  );
  const second = nextTurn(first);
  assert.equal(commitTrial(db, first, { ...second, commandSeq: 8 }).ok, false);
  assert.equal(commitTrial(db, first, second).ok, true);
  const restarted = createTrial({ seed: 42, runId: 'new-run' });
  assert.equal(commitTrial(db, first, restarted).ok, false);
  assert.equal(commitTrial(db, second, restarted).ok, true);
  assert.deepEqual(loadTrial(db).state, restarted);
});

test('拒绝未知版本及重复牌实例的存档，读取不修补或发奖', () => {
  const db = storage();
  const first = createTrial({ seed: 42, runId: 'validation' });
  for (const invalid of [
    { ...first, version: 9 },
    {
      ...first,
      battle: {
        ...first.battle,
        hand: [...first.battle.hand, first.battle.hand[0]],
      },
    },
  ]) {
    const raw = JSON.stringify(invalid);
    db.data.set(TRIAL_SAVE_KEY, raw);
    assert.equal(loadTrial(db).state, null);
    assert.equal(db.getItem(TRIAL_SAVE_KEY), raw);
  }
});
