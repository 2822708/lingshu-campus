import test from 'node:test';
import assert from 'node:assert/strict';
import { REALM_DATA } from '../constants';
import { RealmType } from '../types';
import {
  createInteractiveBattle,
  generateInteractiveEnemy,
  stepInteractiveBattle,
} from '../features/interactive/battle';

const behaviors = ['balanced', 'aggressive', 'defensive'];
const basePlayer = (realm, level = 1) => {
  const data = REALM_DATA[realm];
  const scale = level === 1 ? 1 : 1 + level * 0.1;
  return {
    realm,
    realmLevel: level,
    hp: Math.floor(data.baseMaxHp * scale),
    maxHp: Math.floor(data.baseMaxHp * scale),
    attack: Math.floor(data.baseAttack * scale),
    defense: Math.floor(data.baseDefense * scale),
    speed: Math.floor(data.baseSpeed * scale),
  };
};

function attackToEnd(state) {
  while (state.outcome === 'ongoing') {
    state = stepInteractiveBattle(state, {
      seq: state.commandSeq + 1,
      action: 'attack',
    });
  }
  return state;
}

test('裸基础角色跨学阶挑战保留多轮参与，常规稳攻能打通', (t) => {
  for (const realm of Object.keys(REALM_DATA)) {
    const states = [];
    for (const level of [1, 9]) {
      for (const behavior of behaviors) {
        for (let seed = 1; seed <= 40; seed++) {
          states.push(
            attackToEnd(
              createInteractiveBattle({
                id: 'balance',
                player: basePlayer(realm, level),
                seed: seed * 7919,
                behavior,
              })
            )
          );
        }
      }
    }
    const average =
      states.reduce((total, state) => total + state.completedRounds, 0) /
      states.length;
    const wins = states.filter((state) => state.outcome === 'victory').length;
    assert.ok(
      states.every((state) => state.completedRounds > 1),
      `${realm} 不应普遍成为一击回放`
    );
    assert.ok(average >= 4 && average <= 8, `${realm} 平均决策 ${average}`);
    assert.ok(
      wins >= states.length * 0.95,
      `${realm} 基础角色应有常规可完成路径`
    );
    t.diagnostic(
      `${realm}：${states.length} 场，平均 ${average.toFixed(1)} 轮，完成 ${wins} 场`
    );
  }
});

test('装备成长不会抬高同一机缘的敌人，较高攻击能缩短挑战', () => {
  const player = basePlayer(RealmType.GoldenCore);
  const equipped = {
    ...player,
    attack: player.attack * 2,
    defense: player.defense * 2,
  };
  const seed = 617;
  assert.deepEqual(
    generateInteractiveEnemy(player, seed),
    generateInteractiveEnemy(equipped, seed)
  );
  const baseline = attackToEnd(
    createInteractiveBattle({ id: 'growth', player, seed })
  );
  const improved = attackToEnd(
    createInteractiveBattle({ id: 'growth', player: equipped, seed })
  );
  assert.equal(improved.outcome, 'victory');
  assert.ok(improved.completedRounds < baseline.completedRounds);
  assert.ok(improved.player.hp >= baseline.player.hp);
});

test('已公布强攻后，所有合法主动作都能看到同一个调整窗口', () => {
  const player = basePlayer(RealmType.QiRefining);
  for (const behavior of behaviors) {
    for (const action of ['attack', 'defend', 'break']) {
      const enemy = {
        ...generateInteractiveEnemy(player, 53, behavior),
        hp: 1000,
        maxHp: 1000,
      };
      const initial = {
        ...createInteractiveBattle({ id: 'window', player, enemy, seed: 53 }),
        intent: 'strong',
      };
      const next = stepInteractiveBattle(initial, { seq: 1, action });
      assert.equal(next.outcome, 'ongoing');
      assert.equal(next.intent, 'adjust');
      assert.equal(initial.intent, 'strong');
    }
  }
});

test('精力吃紧且对手先手时，防守能撑过强攻并抓窗口完成挑战', () => {
  const player = {
    ...basePlayer(RealmType.QiRefining),
    hp: 12,
    attack: 100,
    defense: 0,
    speed: 1,
  };
  const enemy = {
    name: '窗口测试',
    title: '练习',
    realm: player.realm,
    behavior: 'aggressive',
    hp: 10,
    maxHp: 10,
    attack: 10,
    defense: 0,
    speed: 10,
  };
  let found = false;
  for (let seed = 1; seed <= 40 && !found; seed++) {
    const initial = {
      ...createInteractiveBattle({
        id: 'survival',
        player,
        enemy,
        seed: seed * 7919,
      }),
      intent: 'strong',
    };
    const attack = stepInteractiveBattle(initial, { seq: 1, action: 'attack' });
    const defended = stepInteractiveBattle(initial, {
      seq: 1,
      action: 'defend',
    });
    if (attack.outcome !== 'defeat' || defended.outcome !== 'ongoing') continue;
    const counter = stepInteractiveBattle(defended, {
      seq: 2,
      action: 'attack',
    });
    if (counter.outcome === 'victory') {
      found = true;
      assert.ok(counter.player.hp > 0);
      assert.ok(
        defended.rounds[0].entries.some((entry) => entry.preventedDamage > 0)
      );
    }
  }
  assert.ok(found, '应存在能实际保命的防守窗口，而不只是显示减伤文字');
});
