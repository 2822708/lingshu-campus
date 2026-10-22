import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  createInteractiveBattle,
  stepInteractiveBattle,
} from '../features/interactive/battle';
import {
  BattleRoundFeedback,
  BattleRecord,
} from '../components/InteractiveBattleFeedback';
import { RealmType } from '../types';

const player = { hp: 500, maxHp: 500, attack: 30, defense: 8, speed: 12 };
const enemy = {
  hp: 500,
  maxHp: 500,
  attack: 28,
  defense: 8,
  speed: 10,
  name: '联调难题',
  title: '待解的',
  realm: RealmType.QiRefining,
  behavior: 'balanced',
};
const fixture = (seed = 123, extra = {}) =>
  createInteractiveBattle({
    id: 'feedback-battle',
    player,
    enemy,
    seed,
    ...extra,
  });
const step = (state, action) =>
  stepInteractiveBattle(state, { seq: state.commandSeq + 1, action });
const renderRound = (round, compact = false) =>
  renderToStaticMarkup(
    React.createElement(BattleRoundFeedback, { round, compact })
  );
const renderRecord = (battle) =>
  renderToStaticMarkup(React.createElement(BattleRecord, { battle }));
const text = (html) => html.replace(/<[^>]+>/g, '');
function findBattle(predicate, extra = {}) {
  for (let sample = 1; sample <= 1000; sample++) {
    // 分散到整个32位种子空间，避免连续小种子的首个随机数集中在同一意图。
    const battle = fixture((sample * 0x9e3779b1) >>> 0, extra);
    if (predicate(battle)) return battle;
  }
  assert.fail('未找到符合条件的真实战斗现场');
}

test('防守短反馈展示真实减免、承受数值和未出手事实，渲染不推进战斗', () => {
  const before = findBattle((battle) => battle.intent === 'strong', {
    player: { ...player, speed: 1 },
  });
  const after = step(before, 'defend');
  const round = after.rounds.at(-1);
  const entry = round.entries[0];
  const saved = JSON.stringify(after);
  assert.equal(round.entries.length, 1);
  assert.equal(entry.attacker, 'enemy');
  assert.ok(entry.preventedDamage > 0);
  const output = text(renderRound(round, true));
  assert.match(output, /第 1 轮 · 防守 · 对手强攻/);
  assert.match(output, /你未出手/);
  assert.ok(
    output.includes(`承受 ${before.player.hp - after.player.hp} 点损耗`)
  );
  assert.ok(output.includes(`防守减免 ${entry.preventedDamage}`));
  assert.equal(JSON.stringify(after), saved);
});

test('对固守稳攻与破势的反馈反映同一真实现场的不同后果', () => {
  const before = findBattle((battle) => battle.intent === 'guard');
  const attacked = step(before, 'attack');
  const broken = step(before, 'break');
  const attackRound = attacked.rounds.at(-1);
  const breakRound = broken.rounds.at(-1);
  const blocked = attackRound.entries.find(
    (entry) => entry.attacker === 'player'
  );
  assert.ok(blocked.preventedDamage > 0);
  assert.ok(
    text(renderRound(attackRound, true)).includes(
      `对方固守减免 ${blocked.preventedDamage}`
    )
  );
  const compactBreak = text(renderRound(breakRound, true));
  assert.match(compactBreak, /破势清除了固守/);
  assert.doesNotMatch(compactBreak, /对方固守减免/);
  assert.ok(
    compactBreak.includes(`造成 ${before.enemy.hp - broken.enemy.hp} 点损耗`)
  );
});

test('没有固守时破势保留输出降低的真实反馈', () => {
  const before = findBattle((battle) => battle.intent === 'adjust');
  const round = step(before, 'break').rounds.at(-1);
  assert.match(
    text(renderRound(round, true)),
    /对方没有固守，破势仅发挥七成五输出/
  );
});

test('暴击提示只出现在引擎实际记为暴击的出手中', () => {
  const before = findBattle((battle) =>
    step(battle, 'attack').rounds[0].entries.some((entry) => entry.crit)
  );
  const round = step(before, 'attack').rounds[0];
  const output = text(renderRound(round));
  for (const side of ['player', 'enemy']) {
    const count = round.entries.filter(
      (entry) => entry.attacker === side && entry.crit
    ).length;
    const label = `${side === 'player' ? '你' : '对手'}暴击`;
    if (count) assert.ok(output.includes(`${label} ${count} 次`));
    else assert.ok(!output.includes(label));
  }
  const ordinaryBefore = findBattle((battle) =>
    step(battle, 'attack').rounds[0].entries.every((entry) => !entry.crit)
  );
  assert.doesNotMatch(
    renderRound(step(ordinaryBefore, 'attack').rounds[0]),
    /暴击/
  );
});

test('致胜最后一轮可以在终局记录中查看，未行动对手不会被捏造成出手', () => {
  const before = findBattle((battle) => battle.intent === 'guard', {
    player: { ...player, attack: 10000, speed: 100 },
    enemy: { ...enemy, hp: 1 },
  });
  const after = step(before, 'break');
  assert.equal(after.outcome, 'victory');
  const round = after.rounds.at(-1);
  assert.equal(round.entries.length, 1);
  assert.equal(round.entries[0].attacker, 'player');
  const output = text(renderRecord(after));
  assert.match(output, /已记录 1 次行动/);
  assert.match(output, /造成 1 点损耗 · 对手未出手/);
  assert.ok(output.includes(round.entries[0].description));
  const terminal = text(
    renderToStaticMarkup(
      React.createElement(BattleRoundFeedback, { round, terminal: true })
    )
  );
  assert.match(terminal, /破势清除了固守/);
  assert.doesNotMatch(terminal, /还需完成两个其他行动轮/);
});

test('致败最后一轮显示对手实际损耗并明确玩家未出手', () => {
  const before = fixture(123, {
    player: { ...player, hp: 1, speed: 1 },
    enemy: { ...enemy, attack: 10000, speed: 100 },
  });
  const after = step(before, 'attack');
  assert.equal(after.outcome, 'defeat');
  assert.equal(after.rounds[0].entries.length, 1);
  assert.equal(after.rounds[0].entries[0].attacker, 'enemy');
  const output = text(renderRecord(after));
  assert.match(output, /你未出手 · 承受 1 点损耗/);
  assert.ok(output.includes(after.rounds[0].message));
});

test('撤离记录不复述上一轮伤害为本轮出手，完整记录仍保留之前的行动', () => {
  const ongoing = step(fixture(), 'attack');
  const after = step(ongoing, 'retreat');
  const retreat = after.rounds.at(-1);
  assert.equal(after.outcome, 'retreat');
  assert.deepEqual(retreat.entries, []);
  assert.equal(after.player.hp, ongoing.player.hp);
  const compact = text(renderRound(retreat, true));
  assert.match(compact, /第 2 轮 · 撤离/);
  assert.match(compact, /你未出手 · 对手未出手/);
  assert.doesNotMatch(compact, /造成|承受|减免|暴击/);
  const record = renderRecord(after);
  assert.match(record, /<details[^>]*>/);
  assert.match(record, /<summary[^>]*>/);
  assert.match(text(record), /已记录 2 次行动/);
  for (const round of after.rounds) {
    assert.ok(text(record).includes(round.message));
    for (const entry of round.entries)
      assert.ok(text(record).includes(entry.description));
  }
});

test('尚未出手时记录明确为空，不制造第一轮反馈', () => {
  const output = text(renderRecord(fixture()));
  assert.match(output, /已记录 0 次行动/);
  assert.match(output, /尚未出手，暂无回合记录/);
  assert.doesNotMatch(output, /第 1 轮|造成|承受/);
});
