import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRogueRun, stepRogueRun } from '../features/rogue-mode/engine';
import { getRogueMapChoices } from '../features/rogue-mode/routeMap';
import {
  presentRogueBattle,
  presentRogueText,
} from '../features/rogue-mode/presentation';
import { runVisibleCardStrategy } from './helpers/cardDungeonStrategy.mjs';
import {
  ROGUE_SAVE_KEY,
  ROGUE_INVALID_BACKUP_KEY,
  MAX_ROGUE_SAVE_BYTES,
  loadRogueRun,
  commitRogueRun,
} from '../features/rogue-mode/persistence';

const clone = (value) => JSON.parse(JSON.stringify(value));
const run = (runId = 'independent', seed = 1729) =>
  createRogueRun({ runId, seed, jobId: 'vanguard', starterId: 'steady' });
const send = (state, action) =>
  stepRogueRun(state, {
    ...action,
    runId: state.runId,
    seq: state.seq + 1,
  });
function enter(state, index = 0) {
  return send(
    state,
    state.map
      ? {
          type: 'choose-node',
          id: getRogueMapChoices(
            state.seed,
            state.floor,
            state.map.path.at(-1)
          )[index].id,
        }
      : { type: 'choose-room', id: state.rooms[index].id }
  );
}
function storage() {
  const data = new Map([['npu-game-save', 'main-game-original-bytes']]);
  const touches = [];
  let failure = null;
  return {
    data,
    touches,
    getItem(key) {
      assert.ok(key.startsWith(ROGUE_SAVE_KEY), 'must not read the main save');
      touches.push(['get', key]);
      if (failure?.get) throw new Error('storage unavailable');
      return data.get(key) ?? null;
    },
    setItem(key, value) {
      assert.ok(key.startsWith(ROGUE_SAVE_KEY), 'must not write the main save');
      touches.push(['set', key]);
      if (failure?.set || failure?.key === key) throw new Error('quota');
      data.set(key, String(value));
    },
    fail(value) {
      failure = value;
    },
  };
}

test('独立记录空读、新开、继续、往返均不接触主游戏键', () => {
  const db = storage();
  assert.deepEqual(loadRogueRun(db), { state: null, error: '' });
  const first = run();
  assert.equal(commitRogueRun(db, null, first).ok, true);
  const second = enter(first);
  assert.equal(commitRogueRun(db, first, second).ok, true);
  assert.deepEqual(loadRogueRun(db), { state: second, error: '' });
  const alternative = enter(first, 1);
  assert.notDeepEqual(alternative.map.path, second.map.path);
  assert.equal(
    commitRogueRun(db, second, { ...alternative, seq: second.seq + 1 }).ok,
    false
  );
  assert.deepEqual(loadRogueRun(db).state.map.path, second.map.path);
  assert.equal(db.data.get('npu-game-save'), 'main-game-original-bytes');
  assert.ok(db.touches.every(([, key]) => key.startsWith(ROGUE_SAVE_KEY)));
  assert.deepEqual(
    [...db.data.keys()].sort(),
    ['npu-game-save', ROGUE_SAVE_KEY].sort()
  );
});

test('第10关旧档继续原有战斗，完成章节后进入分岔地图', () => {
  // Verbatim checkpoint from the 2026-10-31 playtest, before the theme update.
  const raw = readFileSync(
    'tests/fixtures/rogue-v1-floor10-route.json',
    'utf8'
  );
  const db = storage();
  db.data.set(ROGUE_SAVE_KEY, raw);
  const { state, error } = loadRogueRun(db);
  assert.equal(error, '');
  assert.deepEqual(state, JSON.parse(raw));
  assert.equal(db.data.get(ROGUE_SAVE_KEY), raw);
  assert.ok(!db.touches.some(([operation]) => operation === 'set'));
  assert.equal(state.rooms[0].name, '钟塔守望');
  assert.equal(presentRogueText(state.rooms[0].name), '高数心魔');
  assert.equal(presentRogueText(state.lastMessage), '已参悟「阵眼击破」。');
  assert.equal(presentRogueText('破阵 +1'), '阵眼击破 +1');
  assert.equal(presentRogueText('constructor'), 'constructor');
  assert.equal(
    presentRogueText('「快刃 +2」造成18点损耗。'),
    '「键阵敕令 +2」造成18点损耗。'
  );

  const started = enter(state);
  const originalBattle = clone(started.battle);
  const view = presentRogueBattle(started.battle);
  assert.equal(view.enemy.name, '高数心魔');
  assert.equal(view.intent.name, '压轴起式');
  assert.equal(view.enemy.maxHp, state.rooms[0].enemy.maxHp);
  assert.equal(view.enemy.attack, state.rooms[0].enemy.attack);
  assert.deepEqual(
    view.enemy.pattern.map(({ damageMultiplier }) => damageMultiplier),
    state.rooms[0].enemy.pattern.map(({ damageMultiplier }) => damageMultiplier)
  );
  assert.deepEqual(started.battle, originalBattle);
  assert.equal(commitRogueRun(db, state, started).ok, true);
  const resumed = loadRogueRun(db).state;
  assert.equal(resumed.battle.enemy.name, '钟塔守望');
  const next = stepRogueRun(resumed, {
    type: 'battle',
    action: { type: 'end-turn' },
    runId: resumed.runId,
    seq: resumed.seq + 1,
  });
  assert.equal(next.battle.turn, resumed.battle.turn + 1);
  assert.equal(commitRogueRun(db, resumed, next).ok, true);
  assert.deepEqual(loadRogueRun(db).state, next);
  assert.equal(next.map, undefined);

  const battle = runVisibleCardStrategy(next.battle);
  assert.equal(battle.phase, 'victory');
  const won = {
    ...next,
    battle,
    hp: battle.player.hp,
    seq: next.seq + battle.commandSeq - next.battle.commandSeq,
  };
  // Save a checkpoint produced by the actual frozen boss battle.
  db.data.set(ROGUE_SAVE_KEY, JSON.stringify(won));
  const settled = send(won, { type: 'settle-battle' });
  assert.equal(commitRogueRun(db, won, settled).ok, true);
  const afterCard = send(settled, { type: 'choose-card', cardId: null });
  assert.equal(commitRogueRun(db, settled, afterCard).ok, true);
  let mapStart = afterCard;
  if (afterCard.phase === 'reward') {
    mapStart = send(afterCard, { type: 'choose-relic', relicId: null });
    assert.equal(commitRogueRun(db, afterCard, mapStart).ok, true);
  }
  assert.equal(mapStart.floor, 11);
  assert.equal(mapStart.phase, 'route');
  assert.deepEqual(mapStart.map, { version: 1, startFloor: 11, path: [] });
  assert.deepEqual(mapStart.history.slice(0, 9), state.history);
  assert.deepEqual(loadRogueRun(db).state, mapStart);
  const firstMapped = enter(mapStart);
  assert.equal(firstMapped.phase, 'battle');
  assert.equal(commitRogueRun(db, mapStart, firstMapped).ok, true);
  assert.deepEqual(loadRogueRun(db).state, firstMapped);
});

test('存储失败保留原始字节与调用者快照，恢复后同一动作仅能提交一次', () => {
  const db = storage();
  const first = run('quota');
  const second = enter(first);
  const beforeFirst = clone(first),
    beforeSecond = clone(second);
  commitRogueRun(db, null, first);
  const raw = db.data.get(ROGUE_SAVE_KEY);
  db.fail({ set: true });
  const failed = commitRogueRun(db, first, second);
  assert.equal(failed.ok, false);
  assert.match(failed.error, /没有推进/);
  assert.equal(db.data.get(ROGUE_SAVE_KEY), raw);
  assert.deepEqual(first, beforeFirst);
  assert.deepEqual(second, beforeSecond);
  db.fail(null);
  assert.equal(commitRogueRun(db, first, second).ok, true);
  const savedOnce = db.data.get(ROGUE_SAVE_KEY);
  assert.equal(commitRogueRun(db, first, second).ok, false);
  assert.equal(db.data.get(ROGUE_SAVE_KEY), savedOnce);
});

test('战果结算的金币只保存一次，奖励刷新不重抽且领取不能重复提交', () => {
  const db = storage();
  const entered = enter(run('reward-once'));
  const battle = runVisibleCardStrategy(entered.battle);
  assert.equal(battle.phase, 'victory');
  // Imported checkpoint after the actual pure combat engine has won the fight.
  const won = {
    ...entered,
    battle,
    hp: battle.player.hp,
    seq: entered.seq + battle.commandSeq,
  };
  db.data.set(ROGUE_SAVE_KEY, JSON.stringify(won));
  const settled = stepRogueRun(won, {
    runId: won.runId,
    seq: won.seq + 1,
    type: 'settle-battle',
  });
  assert.equal(commitRogueRun(db, won, settled).ok, true);
  assert.equal(settled.gold, won.gold + settled.reward.gold);
  const reward = clone(settled.reward);
  assert.deepEqual(loadRogueRun(db).state.reward, reward);
  assert.equal(commitRogueRun(db, won, settled).ok, false);
  assert.equal(loadRogueRun(db).state.gold, settled.gold);
  const claimed = stepRogueRun(settled, {
    runId: settled.runId,
    seq: settled.seq + 1,
    type: 'choose-card',
    cardId: reward.cards[0],
  });
  assert.equal(commitRogueRun(db, settled, claimed).ok, true);
  assert.equal(claimed.deck.length, settled.deck.length + 1);
  const raw = db.data.get(ROGUE_SAVE_KEY);
  assert.equal(commitRogueRun(db, settled, claimed).ok, false);
  assert.equal(db.data.get(ROGUE_SAVE_KEY), raw);
  assert.equal(claimed.gold, settled.gold);
});

test('陈旧页、跳号及跳过当前记录的新开不能覆盖现场', () => {
  const db = storage();
  const first = run('first'),
    second = enter(first);
  commitRogueRun(db, null, first);
  assert.equal(
    commitRogueRun(db, null, run('new'), { replaceInvalid: true }).ok,
    false
  );
  assert.equal(
    commitRogueRun(db, first, { ...second, seq: second.seq + 1 }).ok,
    false
  );
  assert.equal(commitRogueRun(db, first, second).ok, true);
  assert.equal(commitRogueRun(db, first, run('stale-new')).ok, false);
  const raw = db.data.get(ROGUE_SAVE_KEY);
  assert.equal(
    commitRogueRun(db, second, { ...second, runId: 'not-initial' }).ok,
    false
  );
  assert.equal(db.data.get(ROGUE_SAVE_KEY), raw);
  const restarted = run('confirmed-new', 42);
  assert.equal(commitRogueRun(db, second, restarted).ok, true);
  assert.deepEqual(loadRogueRun(db).state, restarted);
});

test('只改变JSON缩进或字段顺序不冒充新进度，完整现场变化仍拒绝旧页', () => {
  const db = storage(),
    first = run('format');
  db.data.set(
    ROGUE_SAVE_KEY,
    JSON.stringify(Object.fromEntries(Object.entries(first).reverse()), null, 2)
  );
  const second = enter(first);
  assert.equal(commitRogueRun(db, first, second).ok, true);
  const altered = {
    ...second,
    lastMessage: `${second.lastMessage} 已由其他页面修改`,
  };
  db.data.set(ROGUE_SAVE_KEY, JSON.stringify(altered));
  assert.equal(commitRogueRun(db, second, run('new-after-change')).ok, false);
});

test('坏档只读不修改，只有明确重开才先备份原文并建立新局', () => {
  const db = storage();
  const original = '{ 损坏的原始记录\n';
  db.data.set(ROGUE_SAVE_KEY, original);
  const loaded = loadRogueRun(db);
  assert.equal(loaded.state, null);
  assert.match(loaded.error, /原记录已保留/);
  assert.equal(db.touches.filter(([op]) => op === 'set').length, 0);
  assert.equal(commitRogueRun(db, null, run('replace')).ok, false);
  assert.equal(db.data.get(ROGUE_SAVE_KEY), original);
  assert.equal(
    commitRogueRun(db, null, run('replace'), { replaceInvalid: true }).ok,
    true
  );
  assert.equal(db.data.get(ROGUE_INVALID_BACKUP_KEY), original);
  assert.deepEqual(
    db.touches.filter(([op]) => op === 'set').map(([, key]) => key),
    [ROGUE_INVALID_BACKUP_KEY, ROGUE_SAVE_KEY]
  );
  assert.equal(db.data.get('npu-game-save'), 'main-game-original-bytes');
});

test('备份失败不覆盖坏档，主记录写入失败也保留坏原文并可安全重试', () => {
  const db = storage(),
    next = run('retry');
  const original = '{broken quota';
  db.data.set(ROGUE_SAVE_KEY, original);
  db.fail({ key: ROGUE_INVALID_BACKUP_KEY });
  assert.equal(
    commitRogueRun(db, null, next, { replaceInvalid: true }).ok,
    false
  );
  assert.equal(db.data.get(ROGUE_SAVE_KEY), original);
  assert.ok(!db.data.has(ROGUE_INVALID_BACKUP_KEY));
  db.fail({ key: ROGUE_SAVE_KEY });
  assert.equal(
    commitRogueRun(db, null, next, { replaceInvalid: true }).ok,
    false
  );
  assert.equal(db.data.get(ROGUE_SAVE_KEY), original);
  assert.equal(db.data.get(ROGUE_INVALID_BACKUP_KEY), original);
  db.fail(null);
  assert.equal(
    commitRogueRun(db, null, next, { replaceInvalid: true }).ok,
    true
  );
});

test('第二份坏档不会覆盖已有备份，持有旧有效快照也不能悄悄覆盖坏档', () => {
  const db = storage(),
    first = run('before-corrupt');
  commitRogueRun(db, null, first);
  db.data.set(ROGUE_INVALID_BACKUP_KEY, 'older bad bytes');
  db.data.set(ROGUE_SAVE_KEY, 'newer bad bytes');
  assert.equal(
    commitRogueRun(db, first, run('reset'), { replaceInvalid: true }).ok,
    false
  );
  assert.equal(
    commitRogueRun(db, null, run('reset'), { replaceInvalid: true }).ok,
    true
  );
  assert.equal(db.data.get(ROGUE_INVALID_BACKUP_KEY), 'older bad bytes');
  assert.ok(
    [...db.data.entries()].some(
      ([key, value]) =>
        key.startsWith(`${ROGUE_INVALID_BACKUP_KEY}:`) &&
        value === 'newer bad bytes'
    )
  );
});

test('未知版本、超长数组、过深结构和UTF-8超限均拒绝读取且保留字节', () => {
  const first = run('bounds');
  let deep = {};
  for (let index = 0; index < 30; index++) deep = { child: deep };
  const tooManyBytes = '中'.repeat(Math.floor(MAX_ROGUE_SAVE_BYTES / 3) + 1);
  const invalid = [
    JSON.stringify({ ...first, version: 99 }),
    JSON.stringify({ ...first, extra: new Array(2049).fill(0) }),
    JSON.stringify({ ...first, extra: deep }),
    JSON.stringify({ ...first, extra: tooManyBytes }),
    JSON.stringify({ ...first, extra: 'x'.repeat(16385) }),
    '{"__proto__":{},"version":1}',
  ];
  for (const raw of invalid) {
    const db = storage();
    db.data.set(ROGUE_SAVE_KEY, raw);
    assert.equal(loadRogueRun(db).state, null);
    assert.equal(db.data.get(ROGUE_SAVE_KEY), raw);
    assert.equal(db.touches.filter(([op]) => op === 'set').length, 0);
  }
});

test('无效下一状态及循环对象不写入，存储读取异常也明确失败', () => {
  const db = storage(),
    first = run('invalid-next');
  const loop = { ...first };
  loop.extra = loop;
  for (const invalid of [
    { ...first, version: 99 },
    loop,
    { ...first, extra: () => 1 },
  ])
    assert.equal(commitRogueRun(db, null, invalid).ok, false);
  assert.equal(db.data.has(ROGUE_SAVE_KEY), false);
  db.fail({ get: true });
  assert.ok(loadRogueRun(db).error);
  assert.equal(commitRogueRun(db, null, first).ok, false);
});
