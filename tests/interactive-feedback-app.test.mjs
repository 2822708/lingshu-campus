import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import InteractiveEncounterModal from '../components/InteractiveEncounterModal';
import { chooseAutoBattleAction } from '../features/interactive/battle';
import { mountApp } from './helpers/appHarness.mjs';

const renderModal = (app) =>
  renderToStaticMarkup(
    React.createElement(InteractiveEncounterModal, app.modal())
  );
const escapeHtml = (text) =>
  text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

test('真实App机缘选择前展示后续变化，保存后回显已选择路线和实际结算', async (t) => {
  const app = await mountApp(t);
  await app.game().handlers.onAdventure();
  app.flush();
  const pending = app.modal().pending;
  const diagnosis = pending.encounter.choices.find(
    (choice) => choice.id === 'diagnose'
  );
  assert.ok(renderModal(app).includes(diagnosis.followUp));
  app.modal().onChoose(pending.id, diagnosis.id);
  app.flush();
  const saved = app.rawSaved();
  const html = renderModal(app);
  assert.ok(html.includes(`你的选择：${diagnosis.label}`));
  assert.ok(html.includes('本次结算'));
  assert.ok(html.includes('下次会怎样：'));
  for (const change of app.modal().pending.result.changes) {
    assert.ok(html.includes(escapeHtml(change)), `应显示真实变化：${change}`);
  }
  assert.equal(app.rawSaved(), saved, '展示反馈不应再次写档或发奖');
  assert.equal(app.network.length, 0);
});

test('真实战斗每轮反馈紧邻操作按钮；最后一击在结果页保留，刷新不丢回合记录', async (t) => {
  const app = await mountApp(t);
  await app.game().handlers.onAdventure();
  app.flush();
  const id = app.modal().pending.id;
  app.modal().onChoose(id, 'challenge');
  app.flush();
  app
    .modal()
    .onCommand(id, 1, chooseAutoBattleAction(app.modal().pending.battle));
  app.flush();
  assert.equal(app.modal().pending.phase, 'battle');
  const html = renderModal(app);
  const footer = html.slice(html.indexOf('<footer'));
  assert.ok(footer.includes('aria-live="polite"'));
  assert.ok(footer.includes('造成'), '本轮实际损耗不能藏在上方滚动区域');
  assert.ok(footer.includes('自动应对一轮'));
  for (let n = 0; app.modal().pending.phase === 'battle' && n < 14; n++) {
    const battle = app.modal().pending.battle;
    app
      .modal()
      .onCommand(id, battle.commandSeq + 1, chooseAutoBattleAction(battle));
    app.flush();
  }
  assert.equal(app.modal().pending.phase, 'result');
  const finalRound = structuredClone(app.modal().pending.battle.rounds.at(-1));
  const saved = app.rawSaved();
  const terminalHtml = renderModal(app);
  assert.ok(
    terminalHtml.indexOf('最后一次行动') < terminalHtml.indexOf('本次结算')
  );
  for (const entry of finalRound.entries)
    assert.ok(terminalHtml.includes(escapeHtml(entry.description)));
  assert.ok(terminalHtml.includes('<details'));
  assert.equal(app.rawSaved(), saved);
  await app.reload();
  assert.deepEqual(app.modal().pending.battle.rounds.at(-1), finalRound);
  assert.ok(renderModal(app).includes('最后一次行动'));
  assert.equal(app.network.length, 0);
});

test('接受并保存后的指令才播放音效，失败、重复、刷新和关闭音效均不误报成功', async (t) => {
  const app = await mountApp(t);
  const heard = [];
  const param = () => ({
    setValueAtTime() {},
    exponentialRampToValueAtTime() {},
  });
  window.AudioContext = class {
    currentTime = 0;
    state = 'running';
    destination = {};
    createOscillator() {
      return {
        frequency: param(),
        connect() {},
        stop() {},
        start() {
          heard.push(
            app.saved().interactive.pending?.battle?.commandSeq ?? null
          );
        },
      };
    }
    createGain() {
      return { gain: param(), connect() {} };
    }
  };
  await app.game().handlers.onAdventure();
  app.flush();
  const id = app.modal().pending.id;
  app.modal().onChoose(id, 'challenge');
  app.flush();
  assert.ok(heard.length > 0);
  let before = heard.length;
  app.fail(true);
  app.modal().onCommand(id, 1, 'attack');
  app.flush();
  assert.equal(heard.length, before);
  assert.equal(app.modal().pending.battle.commandSeq, 0);
  assert.ok(renderModal(app).includes('模拟存储空间不足'));
  app.fail(false);
  app.modal().onCommand(id, 1, 'attack');
  app.flush();
  assert.ok(heard.length > before);
  assert.equal(heard.at(-1), 1, '音效必须发生在包含本轮结果的存档写入之后');
  before = heard.length;
  app.modal().onCommand(id, 1, 'attack');
  app.flush();
  assert.equal(heard.length, before);
  await app.reload();
  assert.equal(heard.length, before);
  localStorage.setItem(
    'npu-game-settings',
    JSON.stringify({ soundEnabled: false })
  );
  app.modal().onCommand(id, 2, 'retreat');
  app.flush();
  assert.equal(app.modal().pending.phase, 'result');
  assert.equal(heard.length, before);
  const html = renderModal(app);
  assert.ok(html.includes('主动撤离'));
  assert.ok(html.includes('最后一次行动'));
  assert.equal(app.network.length, 0);
});
