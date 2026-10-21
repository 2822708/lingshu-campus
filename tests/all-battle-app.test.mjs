import test from 'node:test';
import assert from 'node:assert/strict';
import ModalsContainer from '../views/modals/ModalsContainer';
import DeathModal from '../components/DeathModal';
import { RealmType } from '../types';
import { emptyInteractiveProgress } from '../features/interactive/state';
import { executeAdventureCore } from '../views/adventure/executeAdventureCore';
import { createInitialPlayer } from '../utils/playerUtils';
import { cancelGameAI } from '../services/ai/runtime';
import { mountApp } from './helpers/appHarness.mjs';

const priorProgress = () => ({
  ...emptyInteractiveProgress(),
  nextSeq: 2,
  lastSettledSeq: 1,
  encounterCursor: 1,
});
const mainRolls = {
  normal: [0.99, 0.99, 0.99, 0.99, 0.99, 0.99, 0],
  lucky: [0.99, 0.99, 0, 0.99, 0],
  forced: [0.99, 0.99, 0.99, 0.99, 0, 0],
};
const realm = (riskLevel = '低', cost = 7) => ({
  id: 'qa-realm',
  name: '逐轮接入测试副本',
  description: '用于验证真实 App 副本入口，不调用模型。',
  minRealm: RealmType.QiRefining,
  cost,
  riskLevel,
  drops: ['验收奖章'],
});
const enterRealm = (app, config = realm()) =>
  app.find(ModalsContainer).props.handlers.handleEnterRealm(config);
function assertUnsettledBattle(app, before, entryCost = 0) {
  const pending = app.modal().pending;
  assert.equal(pending?.phase, 'battle', '实际入口必须立即交给玩家出招');
  assert.equal(pending.encounter.id, 'adventure-battle');
  assert.equal(pending.battle.outcome, 'ongoing');
  assert.equal(pending.battle.commandSeq, 0, '入场不能先执行任意回合');
  assert.equal(pending.battle.rounds.length, 0);
  assert.equal(app.game().player.hp, before.hp, '出招前不能预扣战损');
  assert.equal(app.game().player.exp, before.exp, '入场不能预发胜利绩点');
  assert.equal(app.game().player.spiritStones, before.spiritStones - entryCost);
  assert.deepEqual(
    app.game().player.inventory,
    before.inventory,
    '掉落必须等终局'
  );
  assert.equal(
    app.find(ModalsContainer).props.modals.isBattleModalOpen,
    false,
    '真实战斗不能再打开预结算的旧回放'
  );
  assert.equal(app.saved().interactive.pending.id, pending.id);
  assert.ok(app.inert());
  return pending;
}

for (const source of ['normal', 'lucky', 'forced']) {
  test(
    'App 主入口的 ' + source + ' 战斗未预结算，第一条命令才推进一轮',
    async (t) => {
      const app = await mountApp(t, {}, { interactive: priorProgress() });
      const before = structuredClone(app.game().player);
      app.random(mainRolls[source]);
      await app.game().handlers.onAdventure();
      app.flush();
      const pending = assertUnsettledBattle(app, before);
      assert.equal(
        pending.adventurePlan.request.adventureType,
        source === 'lucky' ? 'lucky' : 'normal'
      );
      if (source === 'forced') {
        assert.equal(pending.battle.enemy.name, '插队老油条');
        assert.ok(pending.adventurePlan.request.battleEncounter);
      } else if (source === 'normal') {
        assert.ok(
          pending.adventurePlan.request.rewardEncounter,
          '纯奖励机缘与普通战斗的分支也必须入操作系统'
        );
      }
      app.modal().onCommand(pending.id, 1, 'defend');
      app.flush();
      assert.equal(app.modal().pending.battle.commandSeq, 1);
      assert.equal(app.modal().pending.battle.completedRounds, 1);
      assert.equal(app.modal().pending.battle.rounds[0].action, 'defend');
      assert.equal(app.game().player.exp, before.exp);
      assert.equal(app.network.length, 0);
    }
  );
}

for (const risk of ['低', '中', '高', '极度危险']) {
  test('App 副本 ' + risk + ' 风险接入逐轮操作，费用只扣一次', async (t) => {
    const app = await mountApp(t, {}, { interactive: priorProgress() });
    const before = structuredClone(app.game().player);
    app.random([0.99, 0]);
    await enterRealm(app, realm(risk));
    app.flush();
    const pending = assertUnsettledBattle(app, before, 7);
    assert.equal(pending.adventurePlan.request.riskLevel, risk);
    assert.equal(pending.adventurePlan.request.realmName, realm().name);
    app.modal().onCommand(pending.id, 1, 'defend');
    app.flush();
    assert.equal(app.modal().pending.battle.commandSeq, 1);
    assert.equal(app.game().player.spiritStones, before.spiritStones - 7);
    assert.equal(app.network.length, 0);
  });
}

test('副本余额不足不入场、不扣费、不产生待处理战斗', async (t) => {
  const app = await mountApp(
    t,
    { spiritStones: 6 },
    { interactive: priorProgress() }
  );
  const before = structuredClone(app.game().player);
  app.random([0.99, 0]);
  await enterRealm(app, realm('低', 7));
  app.flush();
  assert.equal(app.modal().pending, null);
  assert.deepEqual(app.game().player, before);
  assert.match(app.game().logs.at(-1).text, /学分/);
  assert.equal(app.saved().interactive.pending, undefined);
});

test('副本同一渲染连续点击只入场一次，不发生重复扣费', async (t) => {
  const app = await mountApp(t, {}, { interactive: priorProgress() });
  const before = structuredClone(app.game().player);
  app.random([0.99, 0]);
  const staleEnter = app.find(ModalsContainer).props.handlers.handleEnterRealm;
  await Promise.all([staleEnter(realm()), staleEnter(realm())]);
  app.flush();
  assertUnsettledBattle(app, before, 7);
  assert.equal(app.saved().interactive.nextSeq, 3);
  assert.equal(app.saved().interactive.lastSettledSeq, 1);
});

test('战斗入场保存失败既不预扣副本费用，也不跌入旧战斗结算', async (t) => {
  const app = await mountApp(t, {}, { interactive: priorProgress() });
  const before = structuredClone(app.game().player);
  const raw = app.rawSaved();
  app.random([0.99, 0]);
  app.fail(true);
  await enterRealm(app);
  app.flush();
  assert.equal(app.modal().pending, null);
  assert.deepEqual(app.game().player, before);
  assert.equal(app.rawSaved(), raw);
  assert.equal(app.find(ModalsContainer).props.modals.isBattleModalOpen, false);
  app.fail(false);
  app.advance(2000);
  app.random([0.99, 0]);
  await enterRealm(app);
  app.flush();
  assertUnsettledBattle(app, before, 7);
});

test('普通战斗入场关键保存失败不能改走奖励或预结算', async (t) => {
  const app = await mountApp(t, {}, { interactive: priorProgress() });
  const before = structuredClone(app.game().player);
  const raw = app.rawSaved();
  app.random(mainRolls.forced);
  app.fail(true);
  await app.game().handlers.onAdventure();
  app.flush();
  assert.equal(app.modal().pending, null);
  assert.deepEqual(app.game().player, before);
  assert.equal(app.rawSaved(), raw);
  assert.equal(app.find(ModalsContainer).props.modals.isBattleModalOpen, false);
});

test('刷新继续同一副本战斗与费用，保存失败的出招不推进随机序列', async (t) => {
  const app = await mountApp(t, {}, { interactive: priorProgress() });
  const before = structuredClone(app.game().player);
  app.random([0.99, 0]);
  await enterRealm(app);
  app.flush();
  const id = app.modal().pending.id;
  app.modal().onCommand(id, 1, 'defend');
  app.flush();
  const persisted = structuredClone(app.saved());
  await app.reload();
  assert.deepEqual(app.modal().pending, persisted.interactive.pending);
  assert.deepEqual(app.game().player, persisted.player);
  assert.equal(app.game().player.spiritStones, before.spiritStones - 7);
  app.fail(true);
  app.modal().onCommand(id, 2, 'attack');
  app.flush();
  assert.deepEqual(app.modal().pending, persisted.interactive.pending);
  assert.deepEqual(app.saved(), persisted);
  app.fail(false);
  app.modal().onCommand(id, 2, 'attack');
  app.flush();
  assert.equal(app.modal().pending.battle.commandSeq, 2);
  const latest = structuredClone(app.saved());
  app.modal().onCommand(id, 2, 'attack');
  app.flush();
  assert.deepEqual(app.saved(), latest, '重复提交相同序号不能再次执行');
});

test('普通战斗同样暂停自动冲刺、自习和等待回血，撤离不发奖励', async (t) => {
  const app = await mountApp(t, { hp: 70 }, { interactive: priorProgress() });
  const before = structuredClone(app.game().player);
  app.game().handlers.onToggleAutoMeditate();
  app.game().handlers.onToggleAutoAdventure();
  app.flush();
  app.random(mainRolls.lucky);
  await app.game().handlers.onAdventure();
  app.flush();
  const pending = assertUnsettledBattle(app, before);
  assert.equal(app.game().handlers.autoMeditate, false);
  assert.equal(app.game().handlers.autoAdventure, false);
  app.advance(5000);
  assert.deepEqual(app.modal().pending, pending);
  assert.deepEqual(app.game().player, before);
  app.modal().onCommand(pending.id, 1, 'retreat');
  app.flush();
  assert.equal(app.modal().pending.phase, 'result');
  assert.equal(app.modal().pending.battle.outcome, 'retreat');
  assert.deepEqual(app.game().player, before, '未受伤主动撤离无胜利奖惩');
  assert.equal(app.find(DeathModal), undefined);
  const settled = structuredClone(app.saved());
  app.modal().onCommand(pending.id, 1, 'retreat');
  app.flush();
  assert.deepEqual(app.saved(), settled);
});

for (const source of ['normal', 'lucky', 'forced']) {
  test(
    '实际 App ' + source + ' 战斗终局奖励与全部掉落只到账一次',
    async (t) => {
      const app = await mountApp(
        t,
        { attack: 1000000, speed: 1000000 },
        { interactive: priorProgress() }
      );
      const before = structuredClone(app.game().player);
      app.random(mainRolls[source]);
      await app.game().handlers.onAdventure();
      app.flush();
      const pending = assertUnsettledBattle(app, before);
      const plan = structuredClone(pending.adventurePlan);
      app.fail(true);
      app.modal().onCommand(pending.id, 1, 'attack');
      app.flush();
      assert.equal(
        app.modal().pending.phase,
        'battle',
        '终局写失败仍停在出招前现场'
      );
      assert.equal(app.modal().pending.battle.commandSeq, 0);
      assert.deepEqual(app.game().player, before);
      app.fail(false);
      app.modal().onCommand(pending.id, 1, 'attack');
      app.flush();
      assert.equal(app.modal().pending.phase, 'result');
      assert.equal(app.modal().pending.battle.outcome, 'victory');
      assert.equal(
        app.game().player.exp,
        before.exp + plan.reward.exp + plan.independentReward.exp
      );
      assert.equal(
        app.game().player.spiritStones,
        before.spiritStones +
          plan.reward.spiritStones +
          plan.independentReward.spiritStones
      );
      const plannedItems = [
        ...plan.reward.items,
        ...plan.independentReward.items,
      ];
      const quantity = (items, name) =>
        items
          .filter((item) => item.name === name)
          .reduce((sum, item) => sum + item.quantity, 0);
      for (const name of new Set(
        [...before.inventory, ...plannedItems].map((item) => item.name)
      )) {
        assert.equal(
          quantity(app.game().player.inventory, name),
          quantity(before.inventory, name) + quantity(plannedItems, name),
          name + ' 必须按固定奖池恰好入库一次'
        );
      }
      assert.equal(
        app.game().logs.filter((log) => log.id === pending.id + ':settled')
          .length,
        1
      );
      const settled = structuredClone(app.saved());
      app.modal().onCommand(pending.id, 1, 'attack');
      app.flush();
      assert.deepEqual(app.saved(), settled);
      await app.reload();
      assert.deepEqual(app.saved(), settled, '终局刷新不再次发放');
      app.modal().onAcknowledge(pending.id);
      app.flush();
      assert.equal(app.modal().pending, null);
      assert.deepEqual(app.game().player, settled.player);
      assert.equal(app.network.length, 0);
    }
  );
}

test('副本未抽中战斗仍保留普通事件，入场费先持久化再结算', async (t) => {
  const app = await mountApp(t, {}, { interactive: priorProgress() });
  const before = structuredClone(app.game().player);
  const writesBefore = app.writes.length;
  app.random([], 0.99);
  await enterRealm(app);
  app.flush();
  assert.equal(
    app.modal().pending,
    null,
    '没有抽中战斗时不能把所有副本强制改成战斗'
  );
  const entryWrites = app.writes
    .slice(writesBefore)
    .filter((write) => write.key === 'npu-game-save')
    .map((write) => JSON.parse(write.value));
  assert.ok(
    entryWrites.some(
      (save) =>
        save.player.spiritStones === before.spiritStones - 7 &&
        save.player.exp === before.exp
    ),
    '普通副本也先保存唯一一次费用'
  );
  assert.ok(app.game().logs.length > 1, '普通副本结果仍然实际结算');
  assert.equal(app.network.length, 0);
});

test('未达到准入学阶时，即使随机为非战斗也不能缴费探索高阶副本', async (t) => {
  const app = await mountApp(t, {}, { interactive: priorProgress() });
  const before = structuredClone(app.game().player);
  const raw = app.rawSaved();
  app.random([], 0.99);
  await enterRealm(app, { ...realm(), minRealm: RealmType.Foundation });
  app.flush();
  assert.equal(app.modal().pending, null);
  assert.deepEqual(app.game().player, before);
  assert.equal(app.rawSaved(), raw);
  assert.match(app.game().logs.at(-1).text, /学阶/);
  assert.equal(app.network.length, 0);
});

test('非战斗副本的费用保存失败时不发普通事件奖励', async (t) => {
  const app = await mountApp(t, {}, { interactive: priorProgress() });
  const before = structuredClone(app.game().player);
  const raw = app.rawSaved();
  app.random([], 0.99);
  app.fail(true);
  await enterRealm(app);
  app.flush();
  assert.equal(app.modal().pending, null);
  assert.deepEqual(app.game().player, before);
  assert.equal(app.rawSaved(), raw);
  assert.equal(app.network.length, 0);
});

test('副本最低学阶不满足时不能经真实处理器绕过限制', async (t) => {
  const app = await mountApp(t, {}, { interactive: priorProgress() });
  const before = structuredClone(app.game().player);
  app.random([0.99, 0]);
  await enterRealm(app, { ...realm(), minRealm: RealmType.Foundation });
  app.flush();
  assert.equal(app.modal().pending, null);
  assert.deepEqual(app.game().player, before);
  assert.equal(app.saved().interactive.pending, undefined);
});

const huntTask = () => ({
  id: 'qa-hunt',
  name: '社团对练验收',
  description: '先完成逐轮挑战，再交付社团任务。',
  type: 'hunt',
  cost: { spiritStones: 3, items: [{ name: '验收元件', quantity: 1 }] },
  reward: {
    contribution: 13,
    exp: 21,
    spiritStones: 2,
    items: [{ name: '社团验收章', quantity: 2 }],
  },
  timeCost: 'instant',
});
const huntPlayer = () => ({
  sectId: 'qa-sect',
  attack: 1000000,
  speed: 1000000,
  inventory: [
    {
      id: 'qa-material',
      name: '验收元件',
      type: '元件',
      description: '验收输入',
      quantity: 2,
      rarity: '普通',
    },
  ],
});

test('社团hunt任务先逐轮交手，费用次数预占且只发一次任务奖励', async (t) => {
  const app = await mountApp(t, huntPlayer(), { interactive: priorProgress() });
  const before = structuredClone(app.game().player);
  const task = huntTask();
  await app.find(ModalsContainer).props.handlers.handleSectTask(task);
  app.flush();
  const pending = app.modal().pending;
  assert.equal(pending?.phase, 'battle');
  assert.equal(pending.battle.commandSeq, 0);
  assert.equal(app.game().player.exp, before.exp);
  assert.equal(app.game().player.sectContribution, before.sectContribution);
  assert.equal(app.game().player.spiritStones, before.spiritStones - 3);
  assert.equal(app.game().player.inventory[0].quantity, 1);
  assert.equal(app.game().player.dailyTaskCount.instant, 1);
  app.modal().onCommand(pending.id, 1, 'attack');
  app.flush();
  assert.equal(app.modal().pending.battle.outcome, 'victory');
  assert.equal(app.game().player.exp, before.exp + task.reward.exp);
  assert.equal(
    app.game().player.sectContribution,
    before.sectContribution + task.reward.contribution
  );
  assert.equal(
    app.game().player.spiritStones,
    before.spiritStones - 3 + task.reward.spiritStones
  );
  assert.equal(
    app.game().player.inventory.find((item) => item.name === '社团验收章')
      .quantity,
    2
  );
  const settled = structuredClone(app.saved());
  app.modal().onCommand(pending.id, 1, 'attack');
  app.flush();
  assert.deepEqual(app.saved(), settled);
  await app.reload();
  assert.deepEqual(app.saved(), settled);
});

test('社团hunt撤离保留入场成本和一次任务次数，不发贡献和胜利奖励', async (t) => {
  const app = await mountApp(t, huntPlayer(), { interactive: priorProgress() });
  const before = structuredClone(app.game().player);
  await app.find(ModalsContainer).props.handlers.handleSectTask(huntTask());
  app.flush();
  const pending = app.modal().pending;
  assert.equal(pending?.phase, 'battle');
  app.modal().onCommand(pending.id, 1, 'retreat');
  app.flush();
  assert.equal(app.modal().pending.battle.outcome, 'retreat');
  assert.equal(app.game().player.exp, before.exp);
  assert.equal(app.game().player.sectContribution, before.sectContribution);
  assert.equal(app.game().player.spiritStones, before.spiritStones - 3);
  assert.equal(app.game().player.inventory[0].quantity, 1);
  assert.equal(
    app.game().player.inventory.find((item) => item.name === '社团验收章'),
    undefined
  );
  assert.equal(app.game().player.dailyTaskCount.instant, 1);
});

test('社团非战斗任务仍按原规则即时缴费交付，不强制进入战斗', async (t) => {
  const app = await mountApp(t, huntPlayer(), { interactive: priorProgress() });
  const before = structuredClone(app.game().player);
  const task = {
    ...huntTask(),
    id: 'qa-donate',
    type: 'donate_stone',
    cost: { spiritStones: 3 },
    reward: { contribution: 4 },
  };
  await app.find(ModalsContainer).props.handlers.handleSectTask(task);
  app.flush();
  assert.equal(app.modal().pending, null);
  assert.equal(app.game().player.spiritStones, before.spiritStones - 3);
  assert.equal(app.game().player.sectContribution, before.sectContribution + 4);
  assert.equal(app.game().player.exp, before.exp);
  assert.deepEqual(app.game().player.inventory, before.inventory);
  assert.equal(app.game().player.dailyTaskCount.instant, 1);
});

test('社团hunt同一渲染双击只预占一次次数、费用和元件', async (t) => {
  const app = await mountApp(t, huntPlayer(), { interactive: priorProgress() });
  const before = structuredClone(app.game().player);
  const callback = app.find(ModalsContainer).props.handlers.handleSectTask;
  await Promise.all([callback(huntTask()), callback(huntTask())]);
  app.flush();
  assert.equal(app.modal().pending?.phase, 'battle');
  assert.equal(app.saved().interactive.nextSeq, 3);
  assert.equal(app.game().player.dailyTaskCount.instant, 1);
  assert.equal(app.game().player.spiritStones, before.spiritStones - 3);
  assert.equal(app.game().player.inventory[0].quantity, 1);
  assert.equal(app.game().player.sectContribution, before.sectContribution);
});

test('社团hunt入场保存失败不扣材料费用、不占每日额度、不发奖励', async (t) => {
  const app = await mountApp(t, huntPlayer(), { interactive: priorProgress() });
  const before = structuredClone(app.game().player);
  const raw = app.rawSaved();
  app.fail(true);
  await app.find(ModalsContainer).props.handlers.handleSectTask(huntTask());
  app.flush();
  assert.equal(app.modal().pending, null);
  assert.deepEqual(app.game().player, before);
  assert.equal(app.rawSaved(), raw);
});

for (const cancelled of [false, true]) {
  test(
    '随机副本延迟入口' +
      (cancelled ? '取消旧上下文不再继续' : '交回统一冒险入口而不旧式额外结算'),
    async (t) => {
      let player = createInitialPlayer('延迟验收#ABCD', 'talent-ordinary');
      const before = structuredClone(player);
      const timers = [];
      let updates = 0;
      let continuations = 0;
      t.mock.method(Math, 'random', () => 0.99);
      t.mock.method(globalThis, 'setTimeout', (callback, delay) => {
        timers.push({ callback, delay });
        return timers.length;
      });
      t.mock.method(globalThis, 'fetch', async () => {
        throw new Error('延迟入口不得自行请求模型');
      });
      await executeAdventureCore({
        result: {
          story: '前方发现旧考场入口',
          hpChange: 0,
          expChange: 0,
          spiritStonesChange: 0,
          eventColor: 'normal',
          triggerSecretRealm: true,
        },
        battleContext: null,
        player,
        setPlayer(update) {
          updates++;
          player = typeof update === 'function' ? update(player) : update;
        },
        addLog() {},
        triggerVisual() {},
        onOpenBattleModal() {
          assert.fail('延时副本不能打开旧战斗回放');
        },
        adventureType: 'normal',
        async onTriggerSecretRealm() {
          continuations++;
        },
      });
      assert.equal(continuations, 0);
      assert.equal(timers.filter((timer) => timer.delay === 1000).length, 1);
      if (cancelled) cancelGameAI();
      await timers.find((timer) => timer.delay === 1000).callback();
      assert.equal(continuations, cancelled ? 0 : 1);
      assert.equal(
        updates,
        1,
        '只有父普通事件更新，延时路径不独立预发战斗收益'
      );
      assert.deepEqual(player, before);
    }
  );
}
