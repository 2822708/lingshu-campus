import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createInteractiveBattle,
  generateInteractiveEnemy,
  stepInteractiveBattle,
  chooseAutoBattleAction,
  autoInteractiveBattle,
  resolveInteractiveBattle,
} from '../features/interactive/battle';
import { RealmType } from '../types';

const player = { hp: 200, maxHp: 200, attack: 20, defense: 8, speed: 12 };
const enemy = {
  hp: 200,
  maxHp: 200,
  attack: 18,
  defense: 8,
  speed: 10,
  name: '联调难题',
  title: '待解的',
  realm: RealmType.QiRefining,
  behavior: 'balanced',
};
const fixture = (extra = {}) =>
  createInteractiveBattle({
    id: 'action-1',
    player,
    enemy,
    seed: 123,
    ...extra,
  });
const step = (state, action) =>
  stepInteractiveBattle(state, { seq: state.commandSeq + 1, action });
const serialized = (value) => JSON.parse(JSON.stringify(value));
const selectIntent = (state, intent) => ({ ...state, intent });

test('创建现场只冻结快照和已公布意图，不提前造成伤耗或发奖', () => {
  const input = { ...player };
  const state = fixture({ player: input });
  assert.equal(state.player.hp, input.hp);
  assert.equal(state.enemy.hp, enemy.hp);
  assert.equal(state.completedRounds, 0);
  assert.equal(state.commandSeq, 0);
  assert.deepEqual(state.rounds, []);
  assert.equal(resolveInteractiveBattle(state), null);
  input.attack = 999;
  assert.equal(state.player.attack, player.attack);
  assert.deepEqual(serialized(state), state);
});

test('慢速角色防守在先手来袭前生效，且减伤不被旧最低伤害吞掉', () => {
  const state = selectIntent(
    fixture({ player: { ...player, speed: 1, defense: 10000 } }),
    'strong'
  );
  const after = step(state, 'defend');
  const [entry] = after.rounds[0].entries;
  assert.equal(entry.attacker, 'enemy');
  assert.equal(after.enemy.hp, state.enemy.hp);
  assert.equal(
    entry.damage,
    Math.max(1, Math.round(entry.incomingDamage * 0.5))
  );
  assert.equal(entry.preventedDamage, entry.incomingDamage - entry.damage);
  assert.equal(after.player.hp, state.player.hp - entry.damage);
  assert.ok(entry.damage < entry.incomingDamage);
  assert.match(entry.description, /防守减免/);
});

test('对方本轮固守在出手前成立，破势清除固守并形成不同有效输出', () => {
  const state = selectIntent(fixture(), 'guard');
  const attack = step(state, 'attack');
  const breaking = step(state, 'break');
  const attackEntry = attack.rounds[0].entries[0];
  const breakEntry = breaking.rounds[0].entries[0];
  assert.ok(attackEntry.preventedDamage > 0);
  assert.equal(breakEntry.preventedDamage, 0);
  assert.ok(breakEntry.damage > attackEntry.damage);
  assert.equal(attack.enemyGuardRounds, 1);
  assert.equal(breaking.enemyGuardRounds, 0);
  assert.match(breaking.rounds[0].message, /清除了固守/);
});

test('无固守目标的破势仅有七成五伤害，不能作为更强普攻', () => {
  const state = selectIntent(fixture(), 'adjust');
  const attack = step(state, 'attack').rounds[0].entries[0];
  const breaking = step(state, 'break').rounds[0].entries[0];
  assert.equal(breaking.damage, Math.round(attack.damage * 0.75));
  assert.ok(breaking.damage < attack.damage);
});

test('破势后需要两个完整其他行动轮，拒绝指令不消耗序号或随机状态', () => {
  let state = step(selectIntent(fixture(), 'guard'), 'break');
  assert.equal(state.breakCooldown, 2);
  assert.strictEqual(step(state, 'break'), state);
  state = step(state, 'attack');
  assert.equal(state.breakCooldown, 1);
  assert.strictEqual(step(state, 'break'), state);
  state = step(state, 'defend');
  assert.equal(state.breakCooldown, 0);
  const after = step(state, 'break');
  assert.equal(after.commandSeq, state.commandSeq + 1);
  assert.equal(after.breakCooldown, 2);
});

test('已公布的意图不会因为玩家选择不同指令而临时改变', () => {
  const state = fixture();
  for (const action of ['attack', 'defend', 'break']) {
    const after = step(state, action);
    assert.equal(after.rounds[0].intent, state.intent);
    assert.equal(state.commandSeq, 0);
  }
});

test('重复、跳号、无效动作和终局迟到指令均不再次推进', () => {
  const original = fixture();
  assert.strictEqual(
    stepInteractiveBattle(original, { seq: 2, action: 'attack' }),
    original
  );
  assert.strictEqual(
    stepInteractiveBattle(original, { seq: 1, action: 'cheat' }),
    original
  );
  const after = step(original, 'attack');
  assert.strictEqual(
    stepInteractiveBattle(after, { seq: 1, action: 'attack' }),
    after
  );
  const end = step(after, 'retreat');
  assert.strictEqual(step(end, 'attack'), end);
  assert.strictEqual(
    stepInteractiveBattle(end, { seq: 1, action: 'attack' }),
    end
  );
});

test('固定种子与每轮存读档重放得到相同现场，完全不依赖环境随机数', () => {
  const ambientRandom = Math.random;
  try {
    Math.random = () => {
      throw new Error('战斗不应重抽环境随机数');
    };
    let uninterrupted = fixture();
    let reloaded = serialized(uninterrupted);
    for (const action of [
      'defend',
      'break',
      'attack',
      'defend',
      'attack',
      'retreat',
    ]) {
      uninterrupted = step(uninterrupted, action);
      reloaded = serialized(step(reloaded, action));
      assert.deepEqual(reloaded, uninterrupted);
    }
  } finally {
    Math.random = ambientRandom;
  }
});

test('先手结束战斗后败方不反击，双方同速时玩家先手', () => {
  const victory = step(
    fixture({ player: { ...player, attack: 99999, speed: enemy.speed } }),
    'attack'
  );
  assert.equal(victory.outcome, 'victory');
  assert.equal(victory.player.hp, player.hp);
  assert.equal(victory.rounds[0].entries.length, 1);
  assert.equal(victory.rounds[0].entries[0].attacker, 'player');
  const defeat = step(
    fixture({ enemy: { ...enemy, attack: 99999, speed: 999 } }),
    'attack'
  );
  assert.equal(defeat.outcome, 'defeat');
  assert.equal(defeat.enemy.hp, enemy.hp);
  assert.equal(defeat.rounds[0].entries.length, 1);
  assert.equal(defeat.rounds[0].entries[0].attacker, 'enemy');
});

test('主动撤离保留实际伤耗，不再遭攻击、不多完成一轮、不另行发放奖励', () => {
  const state = step(selectIntent(fixture(), 'strong'), 'defend');
  const after = step(state, 'retreat');
  assert.equal(after.outcome, 'retreat');
  assert.deepEqual(after.player, state.player);
  assert.deepEqual(after.enemy, state.enemy);
  assert.equal(after.completedRounds, state.completedRounds);
  assert.equal(after.rngState, state.rngState);
  assert.deepEqual(after.rounds.at(-1).entries, []);
  assert.deepEqual(resolveInteractiveBattle(after), {
    outcome: 'retreat',
    hpChange: state.player.hp - player.hp,
    hpLoss: player.hp - state.player.hp,
    completedRounds: 1,
  });
  assert.equal('expChange' in after, false);
});

test('十二个完整决策轮后双方存活为僵持，不冒充战败', () => {
  let state = fixture({
    player: { ...player, hp: 10000, maxHp: 10000, attack: 0 },
    enemy: { ...enemy, hp: 10000, maxHp: 10000, attack: 0 },
  });
  for (let index = 0; index < 12; index++) state = step(state, 'attack');
  assert.equal(state.outcome, 'stalemate');
  assert.equal(state.completedRounds, 12);
  assert.equal(state.rounds.length, 12);
  assert.ok(state.player.hp > 0 && state.enemy.hp > 0);
  assert.strictEqual(step(state, 'attack'), state);
});

test('基础攻击沿用旧伤害、暴击及先后公式，敌人意图在基础结果后缩放', () => {
  // 独立旧规则基线：只有随机数来源改成现场的固定 xorshift32。
  const state = selectIntent(fixture(), 'adjust');
  let rngState = state.rngState;
  const random = () => {
    rngState ^= rngState << 13;
    rngState ^= rngState >>> 17;
    rngState ^= rngState << 5;
    rngState >>>= 0;
    return rngState / 4294967296;
  };
  const oldAttack = (acting, target) => {
    const base = Math.max(
      Math.max(5, acting.attack * 0.25),
      acting.attack * 0.9 - target.defense * 0.45
    );
    const damage = Math.round(base * (0.9 + random() * 0.25));
    const crit =
      random() <
      0.08 +
        (acting.speed / ((state.player.speed || 1) + state.enemy.speed + 1)) *
          0.2;
    return { damage: crit ? Math.round(damage * 1.5) : damage, crit };
  };
  const expectedPlayer = oldAttack(player, enemy);
  const expectedEnemy = oldAttack(enemy, player);
  const after = step(state, 'attack');
  const [first, second] = after.rounds[0].entries;
  assert.equal(first.attacker, 'player');
  assert.equal(first.damage, expectedPlayer.damage);
  assert.equal(first.crit, expectedPlayer.crit);
  // 调整窗口按已冻结的首版规则仅保留35%来袭，基础攻击/暴击仍使用独立旧公式。
  assert.equal(second.damage, Math.round(expectedEnemy.damage * 0.35));
  assert.equal(second.crit, expectedEnemy.crit);
});

test('三类对手生成可复现且与玩家装备数值无关，行为影响公开意图分布', () => {
  const identity = { realm: RealmType.QiRefining, realmLevel: 1 };
  const base = generateInteractiveEnemy(identity, 11);
  assert.deepEqual(
    base,
    generateInteractiveEnemy({ ...identity, attack: 999999 }, 11)
  );
  assert.ok(base.hp >= 30 && base.hp <= 60);
  assert.ok(base.attack >= 5 && base.attack <= 10);
  const counts = { aggressive: 0, defensive: 0 };
  for (let seed = 1; seed <= 300; seed++) {
    for (const behavior of ['aggressive', 'defensive']) {
      const candidate = fixture({
        seed: seed * 2654435761,
        enemy: { ...enemy, behavior },
      });
      if (candidate.intent === 'strong') counts[behavior]++;
    }
  }
  assert.ok(counts.aggressive > counts.defensive);
});

test('自动与逐轮手动提交同一公开策略共享完整规则和随机序列', () => {
  const state = fixture();
  let manual = serialized(state);
  while (manual.outcome === 'ongoing')
    manual = step(manual, chooseAutoBattleAction(manual));
  assert.deepEqual(autoInteractiveBattle(state), manual);
});

test('多种固定起点和合法指令保持精力、轮次、冷却、只读输入等不变量', () => {
  for (let seed = 1; seed <= 100; seed++) {
    let state = fixture({
      seed: seed * 1000003,
      player: { ...player, hp: 20 + seed * 2, maxHp: 220 },
      enemy: {
        ...enemy,
        speed: seed % 20,
        behavior: ['balanced', 'aggressive', 'defensive'][seed % 3],
      },
    });
    while (state.outcome === 'ongoing') {
      const before = serialized(state);
      const action = ['attack', 'defend', 'break'][
        (seed + state.commandSeq) % 3
      ];
      const after = step(
        state,
        action === 'break' && state.breakCooldown ? 'attack' : action
      );
      assert.deepEqual(state, before);
      assert.ok(after.player.hp >= 0 && after.player.hp <= state.player.hp);
      assert.ok(after.enemy.hp >= 0 && after.enemy.hp <= state.enemy.hp);
      assert.ok(after.breakCooldown >= 0 && after.breakCooldown <= 2);
      assert.ok(after.enemyGuardRounds >= 0 && after.enemyGuardRounds <= 1);
      assert.ok(after.completedRounds <= 12);
      assert.equal(after.commandSeq, after.rounds.length);
      assert.ok(after.rounds.at(-1).entries.length <= 2);
      state = after;
    }
    if (state.outcome === 'victory') assert.equal(state.enemy.hp, 0);
    if (state.outcome === 'defeat') assert.equal(state.player.hp, 0);
  }
});
