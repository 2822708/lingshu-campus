import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialPlayer } from '../utils/playerUtils';
import { RealmType } from '../types';
import { getBattleChance } from '../services/battleService';
import { createDefaultCardLoadout } from '../features/card-dungeon/loadout';
import {
  reduceInteractiveAction,
  emptyInteractiveProgress,
  normalizeInteractiveProgress,
  assertInteractiveProgress,
} from '../features/interactive/state';
import { applyAdventureOutcome } from '../features/interactive/adventureBattle';
import CardBattleView from '../features/card-battle/ui/CardBattleView';
import ModalsContainer from '../views/modals/ModalsContainer';
import { mountApp } from './helpers/appHarness.mjs';

const realm = {
  id: 'test-offer',
  name: '校园实验室',
  description: '一场校园挑战',
  minRealm: RealmType.QiRefining,
  cost: 10,
  riskLevel: '中',
  drops: ['咖啡豆'],
};
const player = (extra = {}) => ({
  ...createInitialPlayer('接入测试#ABCD', 'talent-ordinary'),
  spiritStones: 1000,
  maxExp: 1e12,
  ...extra,
});
const snapshot = (extra = {}) => ({
  player: player(extra),
  logs: [],
  interactive: emptyInteractiveProgress(),
});
function seedFor(subject, battle) {
  for (let seed = 0; seed < 10000; seed++) {
    let word = (seed ^ 0x9e3779b9) >>> 0 || 0x6d2b79f5;
    word ^= word << 13;
    word ^= word >>> 17;
    word ^= word << 5;
    if (
      (word >>> 0) / 0x100000000 < getBattleChance(subject, 'secret_realm') ===
      battle
    )
      return seed;
  }
  throw new Error('Missing deterministic branch seed');
}
function begin(subject, battle = true) {
  return reduceInteractiveAction(
    subject,
    {
      type: 'begin-dungeon',
      id: 'dungeon-test',
      seed: seedFor(subject.player, battle),
      realm,
      batchRevision: 'batch-1',
      loadoutRevision: subject.interactive.cardLoadout.revision,
    },
    1000
  );
}
function card(
  subject,
  action,
  seq = subject.interactive.pending.cardRun.commandSeq + 1
) {
  return reduceInteractiveAction(
    subject,
    { type: 'card', id: subject.interactive.pending.id, seq, action },
    2000
  );
}

test('副本以真实剩余精力入场，只扣一次费用，来源数值和敌人计划冻结，可序列化续接', () => {
  const before = snapshot({ hp: 66, maxHp: 120 });
  const next = begin(before);
  const pending = next.interactive.pending;
  assert.equal(
    next.player.spiritStones,
    before.player.spiritStones - realm.cost
  );
  assert.equal(next.player.hp, 66);
  assert.equal(pending.cardRun.player.hp, 66);
  assert.equal(pending.cardRun.player.entryHp, 66);
  assert.equal(pending.cardRun.player.maxHp, 120);
  assert.equal(pending.cardRun.maxTurns, 12);
  assert.equal(pending.cardRun.hand.length, 4);
  assert.equal(pending.cardRun.cards.length, 8);
  for (const key of ['name', 'attack', 'defense', 'speed', 'maxHp'])
    assert.equal(pending.cardRun.enemy[key], pending.adventurePlan.enemy[key]);
  assertInteractiveProgress(structuredClone(next.interactive));
  const restored = JSON.parse(JSON.stringify(next));
  const id = pending.cardRun.hand.find(
    (id) => pending.cardRun.cards.find((c) => c.id === id).cost <= 3
  );
  assert.deepEqual(
    card(restored, { type: 'play', cardId: id }),
    card(next, { type: 'play', cardId: id })
  );
  assert.equal(before.player.spiritStones, 1000, '纯函数不修改输入');
});

test('入场门槛、版本过期、缺失课程来源均在扣费前拒绝', () => {
  for (const subject of [
    snapshot({ spiritStones: 9 }),
    snapshot({ hp: 29, maxHp: 100 }),
  ]) {
    const copy = structuredClone(subject);
    assert.throws(() => begin(subject));
    assert.deepEqual(subject, copy);
  }
  const subject = snapshot();
  assert.throws(() =>
    reduceInteractiveAction(subject, {
      type: 'begin-dungeon',
      id: 'stale',
      seed: 1,
      realm,
      batchRevision: 'b',
      loadoutRevision: 2,
    })
  );
  subject.interactive.cardLoadout.library.push('course:missing');
  assert.throws(() => begin(subject), /来源/);
  assert.equal(subject.player.spiritStones, 1000);
});

test('简历保存不消耗行动序号，修订递增，过期保存和进行中修改均拒绝', () => {
  const subject = snapshot();
  const saved = reduceInteractiveAction(subject, {
    type: 'save-card-loadout',
    expectedRevision: 0,
    loadout: createDefaultCardLoadout(),
  });
  assert.equal(saved.interactive.cardLoadout.revision, 1);
  assert.equal(saved.interactive.nextSeq, 1);
  assert.equal(saved.interactive.lastSettledSeq, 0);
  assert.throws(
    () =>
      reduceInteractiveAction(saved, {
        type: 'save-card-loadout',
        expectedRevision: 0,
        loadout: createDefaultCardLoadout(),
      }),
    /已在其他操作中更新/
  );
  const running = begin(saved);
  assert.equal(
    reduceInteractiveAction(running, {
      type: 'save-card-loadout',
      expectedRevision: 1,
      loadout: createDefaultCardLoadout(),
    }),
    running
  );
});

test('撤离不补满精力，重复指令/确认不能重发奖励或重扣费用', () => {
  let subject = begin(snapshot({ hp: 60, maxHp: 120 }));
  const id = subject.interactive.pending.id;
  subject = card(subject, { type: 'retreat' });
  assert.equal(subject.player.hp, 60);
  assert.equal(subject.player.spiritStones, 990);
  assert.equal(subject.interactive.lastSettledSeq, 1);
  assert.equal(subject.interactive.pending.phase, 'result');
  assert.equal(card(subject, { type: 'retreat' }, 1), subject);
  const confirmed = reduceInteractiveAction(subject, {
    type: 'acknowledge',
    id,
  });
  assert.equal(confirmed.interactive.pending, undefined);
  assert.equal(
    reduceInteractiveAction(confirmed, { type: 'acknowledge', id }),
    confirmed
  );
  assert.equal(confirmed.player.spiritStones, 990);
});

test('卡战胜利与旧经济共用一次结算，发现后的精力不被截回入场值', () => {
  let subject = begin(snapshot({ attack: 1e6, hp: 70, maxHp: 120 }));
  const plan = structuredClone(subject.interactive.pending.adventurePlan);
  // Fixed discovery fixture exercises a real original course HP grant.
  plan.discoveries = { artId: 'art-iron-skin' };
  subject.interactive.pending.adventurePlan = plan;
  const entered = structuredClone(subject.player);
  for (
    let i = 0;
    i < 80 && subject.interactive.pending.phase === 'battle';
    i++
  ) {
    const run = subject.interactive.pending.cardRun;
    const attack = run.hand.find((id) => {
      const c = run.cards.find((c) => c.id === id);
      return c.damage && c.cost <= run.player.energy;
    });
    subject = card(
      subject,
      attack ? { type: 'play', cardId: attack } : { type: 'end-turn' }
    );
  }
  const run = subject.interactive.pending.cardRun;
  assert.equal(run.phase, 'victory');
  const expected = applyAdventureOutcome(entered, plan, {
    battleId: run.id,
    outcome: 'victory',
    hpAfterRaw: run.player.hp,
  });
  assert.deepEqual(subject.player, expected.player);
  assert.equal(subject.player.hp, run.player.hp + 20);
  assert.ok(subject.player.hp > run.player.entryHp);
  assert.equal(subject.interactive.lastSettledSeq, 1);
  assertInteractiveProgress(subject.interactive);
});

test('非战斗探索的费用、物品、结果水位一次完成，读档确认只关闭', () => {
  const before = snapshot();
  const next = begin(before, false);
  assert.equal(next.interactive.pending.encounter.id, 'dungeon-exploration');
  assert.equal(next.interactive.pending.phase, 'result');
  assert.equal(next.interactive.lastSettledSeq, 1);
  assert.ok(next.logs.length > 0);
  assertInteractiveProgress(next.interactive);
  const confirmed = reduceInteractiveAction(JSON.parse(JSON.stringify(next)), {
    type: 'acknowledge',
    id: next.interactive.pending.id,
  });
  assert.deepEqual(confirmed.player, next.player);
  assert.deepEqual(confirmed.logs, next.logs);
});

test('旧未完成逐轮战斗仅迁移协议与基础简历，保留现场和随机状态', () => {
  const before = snapshot();
  const old = reduceInteractiveAction(
    before,
    {
      type: 'begin-battle',
      id: 'legacy',
      seed: 7,
      request: { adventureType: 'secret_realm', entryCost: 10 },
    },
    1000
  ).interactive;
  old.version = 1;
  delete old.cardLoadout;
  const original = structuredClone(old);
  const migrated = normalizeInteractiveProgress(old);
  assert.equal(migrated.version, 2);
  assert.deepEqual(migrated.pending.battle, original.pending.battle);
  assert.equal(migrated.pending.engine, 'round-v1');
  assert.equal(migrated.nextSeq, old.nextSeq);
  assert.equal(migrated.lastSettledSeq, old.lastSettledSeq);
  assert.deepEqual(old, original);
  assertInteractiveProgress(migrated);
  assert.throws(
    () => normalizeInteractiveProgress({ ...old, version: 9 }),
    /版本/
  );
});

test('真实App迁移前保留原始旧档备份，后续保存和读档不会覆盖该备份', async (t) => {
  const legacy = {
    version: 1,
    nextSeq: 1,
    lastSettledSeq: 0,
    facts: {},
    encounterCursor: 0,
  };
  const app = await mountApp(t, {}, { interactive: legacy });
  const backups = () =>
    app.writes.filter((item) => item.key === 'npu-game-save:pre-card-v2');
  assert.equal(backups().length, 1);
  const original = backups()[0].value;
  assert.deepEqual(JSON.parse(original).interactive, legacy);
  app.advance(3000);
  assert.equal(app.saved().interactive.version, 2);
  await app.reload();
  assert.equal(backups().length, 1);
  assert.equal(backups()[0].value, original);
});

test('真实App只接收当前大厅ID与修订，保存失败保持大厅/费用/现场，刷新恢复后唯一结算', async (t) => {
  const app = await mountApp(t, {
    spiritStones: 1000,
    hp: 66,
    maxHp: 120,
    maxExp: 1e12,
  });
  const hall = () => app.find(ModalsContainer).props;
  const battle = () => app.find(CardBattleView)?.props;
  hall().onRealmOffersChange({ revision: 'batch-1', offers: [realm] });
  assert.equal(hall().onEnterCardDungeon('other', 'batch-1', 0), false);
  assert.equal(hall().onEnterCardDungeon(realm.id, 'old-batch', 0), false);
  const seed = seedFor(app.game().player, true);
  app.random([0.123, seed / 0x100000000]);
  app.fail(true);
  assert.equal(hall().onEnterCardDungeon(realm.id, 'batch-1', 0), false);
  app.flush();
  assert.equal(app.game().player.spiritStones, 1000);
  assert.equal(battle(), undefined);
  app.fail(false);
  app.random([0.123, seed / 0x100000000]);
  assert.equal(hall().onEnterCardDungeon(realm.id, 'batch-1', 0), true);
  app.flush();
  assert.ok(battle());
  assert.equal(app.modal().pending, null);
  assert.ok(app.inert());
  const initial = structuredClone(battle().state);
  app.advance(10000);
  assert.deepEqual(battle().state, initial, '计时器不能自习或自动出牌');
  const id = initial.hand[0];
  app.fail(true);
  battle().onCommand({ type: 'play', cardId: id });
  app.flush();
  assert.deepEqual(battle().state, initial, '落盘失败不消耗随机、手牌或专注');
  app.fail(false);
  battle().onCommand({ type: 'play', cardId: id });
  app.flush();
  const progressed = structuredClone(battle().state);
  assert.equal(progressed.commandSeq, 1);
  await app.reload();
  assert.deepEqual(battle().state, progressed);
  const raw = app.rawSaved();
  app.fail(true);
  battle().onCommand({ type: 'retreat' });
  app.flush();
  assert.deepEqual(battle().state, progressed);
  assert.equal(app.rawSaved(), raw);
  app.fail(false);
  battle().onCommand({ type: 'retreat' });
  app.flush();
  assert.equal(battle().state.phase, 'retreat');
  assert.equal(app.game().player.spiritStones, 990);
  assert.ok(battle().result);
  battle().onAcknowledge();
  app.flush();
  assert.equal(battle(), undefined);
  assert.equal(app.inert(), false);
  assert.equal(app.game().player.spiritStones, 990);
  assert.equal(app.network.length, 0);
});
