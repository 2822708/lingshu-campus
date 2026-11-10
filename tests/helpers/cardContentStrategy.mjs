import {
  assertCardBattleState,
  getCardBattleIncomingPreview,
  getCardBattlePlayableReason,
  getCardBattlePreview,
  stepCardBattle,
} from '../../features/card-battle/engine';

// Test-only strategy. Reads visible hand, current intent and the public resume, not future RNG/pile order.
function score(state, id) {
  const card = state.cards.find((c) => c.id === id);
  const p = getCardBattlePreview(state, id);
  if ((p.reflectedDamage ?? 0) >= state.player.hp + p.heal) return -Infinity;
  if (p.actualDamage >= state.enemy.hp) return 1e12;
  const hit = getCardBattleIncomingPreview(state);
  const blockable = hit.incoming - hit.piercing;
  const missing = Math.max(0, blockable - state.player.block);
  const futureAttack = state.hand
    .filter((other) => other !== id)
    .reduce(
      (n, other) =>
        Math.max(n, getCardBattlePreview(state, other).actualDamage),
      0
    );
  let value = p.actualDamage + Math.min(missing, p.block) * 0.95 + p.heal;
  if (card.expose && !state.enemy.exposed) value += futureAttack * 0.25;
  if (p.clearsGuard) value += futureAttack * 0.45 + (state.enemy.thorns ?? 0);
  if (p.draw && state.player.energy > card.cost)
    value += p.draw * Math.max(1, futureAttack * 0.3);
  if (p.nextAttackBonus) value += p.nextAttackBonus * 0.65;
  if (p.focusGain) value += p.focusGain * Math.max(1, futureAttack);
  if (p.counter && state.player.block + p.block > 0 && blockable > 0)
    value += Math.min(state.enemy.hp, p.counter) * 0.85;
  if (p.retainBlock)
    value +=
      Math.min(
        p.retainBlock,
        Math.max(0, state.player.block + p.block - blockable)
      ) * 0.45;
  value -= (p.reflectedDamage ?? 0) * 1.1;
  if (p.blockConsumed) value -= Math.min(blockable, p.blockConsumed) * 0.85;
  return value / Math.max(1, card.cost);
}

export function runVisibleContentStrategy(initial) {
  let state = initial;
  for (
    let step = 0;
    step < 500 && ['battle', 'discard'].includes(state.phase);
    step++
  ) {
    let action;
    if (state.phase === 'discard') {
      const cardIds = [...state.hand]
        .sort((a, b) => score(state, a) - score(state, b) || a.localeCompare(b))
        .slice(0, state.hand.length - 10);
      action = { type: 'confirm-discard', cardIds };
    } else {
      const choices = state.hand
        .filter((id) => getCardBattlePlayableReason(state, id) === null)
        .map((id) => ({ id, value: score(state, id) }))
        .sort((a, b) => b.value - a.value || a.id.localeCompare(b.id));
      action =
        choices[0]?.value > 0
          ? { type: 'play', cardId: choices[0].id }
          : { type: 'end-turn' };
    }
    const next = stepCardBattle(state, {
      ...action,
      id: state.id,
      seq: state.commandSeq + 1,
    });
    if (next === state) throw new Error('可见策略产生无效指令');
    assertCardBattleState(next);
    state = next;
  }
  if (['battle', 'discard'].includes(state.phase))
    throw new Error('战斗未在限制内结束');
  return state;
}
