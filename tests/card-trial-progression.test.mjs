import test from 'node:test';
import assert from 'node:assert/strict';
import { REALM_DATA, REALM_ORDER } from '../constants';
import { generateInteractiveEnemy } from '../features/interactive/battle';
import { ENEMIES } from '../prototypes/card-trial/catalog';
import {
  getCardScaling,
  getProfileStatRatio,
  getTrialEnemy,
  getTrialMaxHp,
} from '../prototypes/card-trial/progression';

function profile(realm = REALM_ORDER[0], realmLevel = 1) {
  const base = REALM_DATA[realm];
  const scale = 1 + (realmLevel - 1) * 0.1;
  return {
    source: 'demo',
    name: '分级验收角色',
    realm,
    realmLevel,
    maxHp: base.baseMaxHp * scale,
    attack: base.baseAttack * scale,
    defense: base.baseDefense * scale,
    spirit: base.baseSpirit * scale,
    physique: base.basePhysique * scale,
    speed: base.baseSpeed * scale,
    courseIds: [],
    equipment: [],
  };
}
function state(character = profile(), stage = 0, seed = 314159) {
  return {
    stage,
    seed,
    build: { profile: character, library: [], resume: [] },
  };
}
function scaledCard(stat, effect = 'damage', coefficient = 3, cap = 9) {
  return {
    id: 'course-code',
    name: '定向属性验收',
    cost: 1,
    kind: effect === 'damage' ? 'attack' : 'utility',
    description: '定向属性加成验收',
    scaling: { stat, effect, coefficient, cap },
  };
}

test('旧无角色快照记录沿用原三场数值，不改变已经开始的旧试炼', () => {
  for (let stage = 0; stage < ENEMIES.length; stage++)
    assert.equal(getTrialEnemy({ stage, seed: 314159 }), ENEMIES[stage]);
  assert.equal(getTrialMaxHp(), 45);
  assert.deepEqual(getCardScaling(scaledCard('attack')), {
    bonus: 0,
    effect: null,
  });
});

test('七学阶九层均复用主互动敌人快照，分级与单位折算可核对', () => {
  const tiers = ['弱敌', '普通', '强敌'];
  const multipliers = [0.7, 0.9, 1.1];
  for (const realm of REALM_ORDER) {
    for (let level = 1; level <= 9; level++) {
      const character = profile(realm, level);
      for (let stage = 0; stage < 3; stage++) {
        const trial = state(character, stage, 271828);
        const enemySeed = (trial.seed + Math.imul(stage + 1, 0x9e3779b9)) >>> 0;
        const main = generateInteractiveEnemy(character, enemySeed);
        const enemy = getTrialEnemy(trial);
        const unit =
          (REALM_DATA[realm].baseAttack * (1 + (level - 1) * 0.1)) / 10;
        assert.equal(enemy.grade.realm, realm);
        assert.equal(enemy.grade.level, level);
        assert.equal(enemy.grade.strength, tiers[stage]);
        assert.equal(enemy.grade.unit, unit);
        assert.deepEqual(enemy.grade.raw, {
          maxHp: Math.round(main.maxHp * multipliers[stage]),
          attack: Math.round(main.attack * multipliers[stage]),
          defense: Math.round(main.defense * multipliers[stage]),
        });
        assert.equal(
          enemy.maxHp,
          Math.max(15, Math.round(enemy.grade.raw.maxHp / unit))
        );
        assert.equal(
          enemy.grade.attack,
          Math.max(1, Math.round(enemy.grade.raw.attack / unit))
        );
        assert.equal(
          enemy.grade.defense,
          Math.max(1, Math.round(enemy.grade.raw.defense / unit))
        );
        assert.equal(Object.hasOwn(enemy.grade, 'speed'), false);
        assert.equal(Object.hasOwn(enemy.grade.raw, 'speed'), false);
      }
    }
  }
});

test('角色装备与属性膨胀不会带动同学阶敌人数值同步增长', () => {
  const original = state(profile(REALM_ORDER[3], 5), 2);
  const inflated = structuredClone(original);
  for (const stat of [
    'attack',
    'defense',
    'spirit',
    'physique',
    'speed',
    'maxHp',
  ])
    inflated.build.profile[stat] *= 1000;
  inflated.build.profile.equipment.push({
    id: 'fixture-gear',
    name: '定向测试装备',
  });
  assert.deepEqual(getTrialEnemy(inflated), getTrialEnemy(original));
});

test('敌人展示节奏与原模板一致，攻击和防护文本使用换算后的真实数值', () => {
  for (let stage = 0; stage < 3; stage++) {
    const enemy = getTrialEnemy(state(profile(), stage));
    for (let index = 0; index < enemy.pattern.length; index++) {
      const original = ENEMIES[stage].pattern[index];
      const intent = enemy.pattern[index];
      assert.equal(intent.name, original.name);
      assert.equal(
        intent.damage,
        Math.round((original.damage * enemy.grade.attack) / 8)
      );
      assert.equal(
        intent.block,
        Math.round((original.block * enemy.grade.defense) / 4)
      );
      if (intent.damage)
        assert.ok(intent.description.includes(`${intent.damage} 点损耗`));
      if (intent.block)
        assert.ok(intent.description.includes(`${intent.block} 点防护`));
      if (!original.damage) assert.equal(intent.damage, 0);
      if (!original.block) assert.equal(intent.block, 0);
    }
  }
});

test('相同局面反复派生敌人保持一致，不推进牌序或修改输入', () => {
  const input = {
    ...state(profile(REALM_ORDER[2], 4), 1, 0),
    rngState: 0x12345678,
  };
  const before = structuredClone(input);
  const originalRandom = Math.random;
  Math.random = () => {
    throw new Error('禁止读取全局随机');
  };
  try {
    const enemy = getTrialEnemy(input);
    assert.deepEqual(enemy, getTrialEnemy(input));
    assert.deepEqual(input, before);
    assert.equal(input.rngState, 0x12345678);
    assert.ok(Object.isFrozen(enemy));
    assert.ok(Object.isFrozen(enemy.grade.raw));
    assert.ok(Object.isFrozen(enemy.pattern));
    assert.ok(enemy.pattern.every(Object.isFrozen));
    assert.notDeepEqual(
      enemy.grade.raw,
      getTrialEnemy({ ...input, seed: 1 }).grade.raw
    );
  } finally {
    Math.random = originalRandom;
  }
});

test('同阶各层角色五项属性均归一为一，速度独立使用手速基准', () => {
  for (const realm of REALM_ORDER)
    for (let level = 1; level <= 9; level++) {
      const character = profile(realm, level);
      for (const stat of ['attack', 'defense', 'spirit', 'physique', 'speed'])
        assert.equal(getProfileStatRatio(character, stat), 1);
    }
  const character = profile(REALM_ORDER[5], 4);
  character.speed *= 2;
  assert.equal(getProfileStatRatio(character, 'speed'), 2);
  assert.equal(getProfileStatRatio(character, 'attack'), 1);
});

test('牌的伤害、防护和治疗属性加成分别生效，向下取整并受上限约束', () => {
  const character = profile();
  character.attack *= 1.5;
  character.defense *= 2;
  character.physique *= 3;
  assert.deepEqual(getCardScaling(scaledCard('attack'), character), {
    bonus: 4,
    effect: 'damage',
  });
  assert.deepEqual(getCardScaling(scaledCard('defense', 'block'), character), {
    bonus: 6,
    effect: 'block',
  });
  assert.deepEqual(getCardScaling(scaledCard('physique', 'heal'), character), {
    bonus: 9,
    effect: 'heal',
  });
  character.attack *= 1000;
  assert.deepEqual(getCardScaling(scaledCard('attack'), character), {
    bonus: 9,
    effect: 'damage',
  });
  character.attack = 0;
  assert.deepEqual(getCardScaling(scaledCard('attack'), character), {
    bonus: 0,
    effect: 'damage',
  });
  assert.deepEqual(
    getCardScaling(
      {
        id: 'strike',
        name: '基础',
        kind: 'attack',
        cost: 1,
        description: '基础',
        damage: 6,
      },
      character
    ),
    { bonus: 0, effect: null }
  );
});

test('试炼精力按上限与体能共同折算，不随学阶单位膨胀并有明确边界', () => {
  for (const realm of REALM_ORDER)
    for (let level = 1; level <= 9; level++)
      assert.equal(getTrialMaxHp(profile(realm, level)), 45);
  const character = profile();
  character.maxHp *= 2;
  assert.equal(getTrialMaxHp(character), 81);
  character.physique *= 10;
  assert.equal(getTrialMaxHp(character), 90);
  character.maxHp = 0;
  character.physique = 0;
  assert.equal(getTrialMaxHp(character), 34);
});
