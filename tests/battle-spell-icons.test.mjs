import test from 'node:test';
import assert from 'node:assert/strict';
import { getSpellIconRole } from '../features/card-battle/ui/SpellIcon';

test('术式图形依据冻结效果区分六类机制，不把恢复与破绽误画成抽牌', () => {
  const base = { cost: 1, kind: 'utility', description: '' };
  for (const [effect, role] of [
    [{ damage: 7 }, 'attack'],
    [{ block: 8 }, 'guard'],
    [{ draw: 2 }, 'draw'],
    [{ nextAttackBonus: 9 }, 'charge'],
    [{ focusGain: 1 }, 'charge'],
    [{ clearEnemyBlock: true, damage: 8 }, 'break'],
    [{ counter: 7, block: 8 }, 'counter'],
    [{ heal: 6 }, 'guard'],
    [{ expose: true }, 'attack'],
    [{ retainBlock: 3 }, 'guard'],
  ]) {
    assert.equal(getSpellIconRole({ ...base, ...effect }), role);
  }
  assert.equal(getSpellIconRole({ ...base, kind: 'attack' }), 'attack');
  assert.equal(getSpellIconRole({ ...base, kind: 'defense' }), 'guard');
});
