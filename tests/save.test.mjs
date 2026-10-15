import test from 'node:test';
import assert from 'node:assert/strict';
import { createAutoSaveScheduler } from '../features/save/autoSaveScheduler';
import {
  createGameSave,
  isSaveCompatible,
  parseImportSave,
  repairSavedInventory,
  restoreSavedPlayer,
} from '../features/save/saveCodec';
import { createInitialPlayer } from '../utils/playerUtils';
import { SAVE_VERSION } from '../utils/gameUtils';
import { EquipmentSlot, ItemType } from '../types';

const player = () =>
  createInitialPlayer('测试同学#0001', 'npu:computer:平民命');

test('当前存档可导入并保留所有玩家字段、日志和时间戳', () => {
  const original = createGameSave(
    player(),
    [{ id: '1', text: '测试', type: 'normal', timestamp: 10 }],
    123
  );
  assert.equal(original.version, SAVE_VERSION);
  assert.deepEqual(parseImportSave(JSON.stringify(original)), original);
});

test('拒绝无版本、旧版本、损坏JSON、缺少玩家和非数组日志', () => {
  for (const saved of [
    null,
    [],
    {},
    { player: player() },
    { version: 1, player: player(), logs: [] },
    { version: SAVE_VERSION, player: null },
    { version: SAVE_VERSION, player: [], logs: [] },
    { version: SAVE_VERSION, player: player(), logs: 'wrong' },
  ]) {
    assert.throws(() => parseImportSave(JSON.stringify(saved)));
  }
  assert.throws(() => parseImportSave('{broken'));
  assert.equal(isSaveCompatible({ version: 1, player: player() }), false);
});

test('导入校验失败时不会执行覆盖操作', () => {
  const existing = JSON.stringify(createGameSave(player(), [], 456));
  let stored = existing;
  assert.throws(() => {
    const imported = parseImportSave(
      JSON.stringify({ version: 1, player: player(), logs: [] })
    );
    stored = JSON.stringify(imported);
  });
  assert.equal(stored, existing);
});

test('同版本旧玩家补齐字段，将数字日任务迁移为对象且不修改原对象', () => {
  const legacy = { ...player(), dailyTaskCount: 3 };
  for (const key of [
    'inventory',
    'lastTaskResetDate',
    'viewedAchievements',
    'natalArtifactId',
    'unlockedRecipes',
    'meditationHpRegenMultiplier',
    'meditationBoostEndTime',
    'playtimeSeconds',
    'lastLeaderboardSubmit',
  ])
    delete legacy[key];
  const snapshot = structuredClone(legacy);
  const restored = restoreSavedPlayer(
    legacy,
    '补全名字#0001',
    new Date('2026-10-15T00:00:00Z')
  );
  assert.equal(restored.name, '补全名字#0001');
  assert.deepEqual(restored.dailyTaskCount, {
    instant: 3,
    short: 0,
    medium: 0,
    long: 0,
  });
  assert.deepEqual(restored.inventory, []);
  assert.deepEqual(restored.viewedAchievements, []);
  assert.deepEqual(restored.unlockedRecipes, []);
  assert.equal(restored.lastTaskResetDate, '2026-10-15');
  assert.equal(restored.meditationHpRegenMultiplier, 1);
  assert.equal(restored.meditationBoostEndTime, null);
  assert.equal(restored.playtimeSeconds, 0);
  assert.equal(restored.lastLeaderboardSubmit, 0);
  assert.equal(restored.natalArtifactId, null);
  assert.deepEqual(legacy, snapshot);
});

test('迁移保留已存在的零值、日任务对象和未知扩展字段', () => {
  const current = {
    ...player(),
    extraField: 'preserved',
    meditationHpRegenMultiplier: 0,
    meditationBoostEndTime: 0,
    dailyTaskCount: { instant: 1, short: 2, medium: 3, long: 4 },
  };
  const restored = restoreSavedPlayer(current, current.name);
  assert.equal(restored.meditationHpRegenMultiplier, 0);
  assert.equal(restored.meditationBoostEndTime, 0);
  assert.equal(restored.extraField, 'preserved');
  assert.deepEqual(restored.dailyTaskCount, current.dailyTaskCount);
});

test('存档背包修复裤装槽位，保留数量、属性与原始背包', () => {
  const item = {
    id: 'pants',
    name: '机能裤',
    description: '',
    type: ItemType.Armor,
    quantity: 2,
    isEquippable: true,
    equipmentSlot: EquipmentSlot.Chest,
    effect: { defense: 8 },
  };
  const original = structuredClone(item);
  const repaired = repairSavedInventory([item])[0];
  assert.equal(repaired.equipmentSlot, EquipmentSlot.Legs);
  assert.equal(repaired.quantity, 2);
  assert.deepEqual(repaired.effect, { defense: 8 });
  assert.deepEqual(item, original);
});

test('非装备物品清除历史残留槽位，保持原有修复规则', () => {
  const item = {
    id: 'part',
    name: '万能板',
    description: '',
    type: ItemType.Material,
    quantity: 1,
    isEquippable: false,
    equipmentSlot: EquipmentSlot.Chest,
  };
  const repaired = repairSavedInventory([item])[0];
  assert.equal(repaired.equipmentSlot, undefined);
  assert.equal(item.equipmentSlot, EquipmentSlot.Chest);
});

function fakeClock() {
  let now = 0;
  let nextId = 0;
  const timers = new Map();
  return {
    setTimeout(callback, delay) {
      const id = ++nextId;
      timers.set(id, { callback, due: now + delay });
      return id;
    },
    clearTimeout(id) {
      timers.delete(id);
    },
    tick(milliseconds) {
      const target = now + milliseconds;
      while (true) {
        const next = [...timers.entries()]
          .filter(([, timer]) => timer.due <= target)
          .sort((a, b) => a[1].due - b[1].due || a[0] - b[0])[0];
        if (!next) break;
        now = next[1].due;
        timers.delete(next[0]);
        next[1].callback();
      }
      now = target;
    },
    count: () => timers.size,
  };
}

test('停止操作2秒后仅保存最后一份快照', () => {
  const clock = fakeClock();
  const saved = [];
  const scheduler = createAutoSaveScheduler(
    (value) => saved.push(value),
    clock
  );
  scheduler.schedule(1);
  clock.tick(1000);
  scheduler.schedule(2);
  clock.tick(1999);
  assert.deepEqual(saved, []);
  clock.tick(1);
  assert.deepEqual(saved, [2]);
  assert.equal(clock.count(), 0);
});

test('持续每秒更新时10秒内保存最新值，下一周期继续保存', () => {
  const clock = fakeClock();
  const saved = [];
  const scheduler = createAutoSaveScheduler(
    (value) => saved.push(value),
    clock
  );
  for (let i = 0; i < 20; i++) {
    scheduler.schedule(i);
    clock.tick(1000);
  }
  assert.deepEqual(saved, [9, 19]);
  assert.equal(clock.count(), 0);
});

test('关闭自动保存、退回首页或卸载时取消待保存快照和全部计时器', () => {
  const clock = fakeClock();
  const saved = [];
  const scheduler = createAutoSaveScheduler(
    (value) => saved.push(value),
    clock
  );
  scheduler.schedule('old');
  clock.tick(1000);
  scheduler.cancel();
  clock.tick(20000);
  assert.deepEqual(saved, []);
  assert.equal(clock.count(), 0);
  scheduler.schedule('new');
  clock.tick(2000);
  assert.deepEqual(saved, ['new']);
});
