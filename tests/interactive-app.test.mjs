import test from 'node:test';
import assert from 'node:assert/strict';
import DeathModal from '../components/DeathModal';
import { chooseAutoBattleAction } from '../features/interactive/battle';
import { mountApp } from './helpers/appHarness.mjs';

test('真实App主按钮接通选择→战斗→唯一到账→确认，自动暂停且旧冒险不叠发', async (t) => {
  const app = await mountApp(t);
  const before = structuredClone(app.game().player);
  app.game().handlers.onToggleAutoMeditate();
  app.game().handlers.onToggleAutoAdventure();
  app.flush();
  await app.game().handlers.onAdventure();
  app.flush();
  assert.equal(app.modal().pending.phase, 'choice');
  assert.ok(app.inert());
  assert.equal(app.game().handlers.autoMeditate, false);
  assert.equal(app.game().handlers.autoAdventure, false);
  assert.deepEqual(app.game().player, before);
  assert.equal(app.game().logs.length, 0, '新入口不能叠加旧冒险剧情或奖励');
  const id = app.modal().pending.id;
  const reward = app
    .modal()
    .pending.encounter.choices.find(
      (choice) => choice.id === 'challenge'
    ).reward;
  app.modal().onChoose(id, 'challenge');
  app.flush();
  const initialBattle = structuredClone(app.modal().pending.battle);
  app.advance(5000);
  assert.deepEqual(
    app.modal().pending.battle,
    initialBattle,
    '等待不自动出招或回血'
  );
  for (
    let round = 0;
    app.modal().pending.phase === 'battle' && round < 15;
    round++
  ) {
    const battle = app.modal().pending.battle;
    app
      .modal()
      .onCommand(id, battle.commandSeq + 1, chooseAutoBattleAction(battle));
    app.flush();
  }
  assert.equal(app.modal().pending.phase, 'result');
  assert.equal(app.modal().pending.battle.outcome, 'victory');
  assert.equal(app.game().player.exp, before.exp + reward.exp);
  assert.equal(
    app.game().player.spiritStones,
    before.spiritStones + reward.spiritStones
  );
  assert.equal(app.game().logs.length, 1);
  assert.equal(app.saved().interactive.pending.phase, 'result');
  app.modal().onAcknowledge(id);
  app.flush();
  assert.equal(app.modal().pending, null);
  assert.equal(app.inert(), false);
  assert.equal(app.game().handlers.autoAdventure, false);
  assert.equal(app.game().handlers.autoMeditate, false);
  assert.equal(app.network.length, 0);
});

test('互动入口true拦截保存失败，false保留普通机缘和物品获取通道', async (t) => {
  const app = await mountApp(t);
  const before = structuredClone(app.game().player);
  app.fail(true);
  await app.game().handlers.onAdventure();
  app.flush();
  assert.equal(app.modal().pending, null);
  assert.deepEqual(app.game().player, before);
  assert.equal(
    app.game().logs.length,
    0,
    '关键保存失败仍消费本次入口，不能跌入旧冒险结算'
  );
  assert.ok(app.modal().error.includes('存储空间不足'));
  app.fail(false);
  await app.game().handlers.onAdventure();
  app.flush();
  const id = app.modal().pending.id;
  app.modal().onChoose(id, 'leave');
  app.flush();
  app.modal().onAcknowledge(id);
  app.flush();
  app.advance(1000);
  const logsBefore = app.game().logs.length;
  await app.game().handlers.onAdventure();
  app.flush();
  assert.equal(
    app.modal().pending,
    null,
    '0.99种子避开35%入口，继续旧主按钮通道'
  );
  assert.ok(
    app.game().logs.length > logsBefore,
    '普通冒险通道应仍然产生实际结果'
  );
  assert.equal(app.network.length, 0);
});

test('App接收父行动力竭终局后只降一级，旧死亡观察器不再二次处理', async (t) => {
  const app = await mountApp(t, {
    hp: 1,
    realmLevel: 3,
    attack: 0,
    defense: 0,
    speed: 0,
    exp: 7,
  });
  await app.game().handlers.onAdventure();
  app.flush();
  const id = app.modal().pending.id;
  app.modal().onChoose(id, 'challenge');
  app.flush();
  app.modal().onCommand(id, 1, 'attack');
  app.flush();
  assert.equal(app.modal().pending.phase, 'result');
  assert.equal(app.modal().pending.battle.outcome, 'defeat');
  assert.equal(app.game().player.realmLevel, 2);
  assert.equal(app.game().player.exp, 0);
  assert.equal(app.game().player.hp, app.game().player.maxHp);
  assert.equal(app.find(DeathModal), undefined);
  assert.equal(app.saved().player.realmLevel, 2);
  app.modal().onAcknowledge(id);
  app.flush();
  app.advance(1000);
  assert.equal(app.game().player.realmLevel, 2);
  assert.equal(app.find(DeathModal), undefined);
  assert.equal(app.network.length, 0);
});
