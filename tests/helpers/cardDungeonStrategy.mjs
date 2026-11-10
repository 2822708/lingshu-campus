import {
  stepCardBattle,
  getCardBattlePreview,
  getCardBattlePlayableReason,
} from '../../features/card-battle/engine';

// Visible hand/intent only. Does not inspect draw pile order or future RNG.
function selectVisibleCard(state) {
  const available = state.hand.filter(
    (id) => getCardBattlePlayableReason(state, id) === null
  );
  if (!available.length) return null;
  const candidates = available.map((id) => ({
    id,
    card: state.cards.find((c) => c.id === id),
    preview: getCardBattlePreview(state, id),
  }));
  const lethal = candidates.find(
    (c) => c.preview.actualDamage >= state.enemy.hp
  );
  if (lethal) return lethal.id;
  const expectedAttack = candidates
    .filter((c) => c.preview.actualDamage > 0)
    .reduce((n, c) => Math.max(n, c.preview.actualDamage), 0);
  const missingBlock = Math.max(0, state.intent.damage - state.player.block);
  for (const c of candidates) {
    c.score =
      c.preview.actualDamage +
      Math.min(missingBlock, c.preview.block) * 0.9 +
      Math.min(state.player.entryHp - state.player.hp, c.preview.heal) * 1.1;
    if (c.preview.clearsGuard && state.enemy.guardRounds > 0)
      c.score += expectedAttack * 0.4;
    if (c.preview.draw && state.player.energy >= 2)
      c.score += Math.max(1, expectedAttack) * 0.65;
    if (c.preview.nextAttackBonus) c.score += c.preview.nextAttackBonus * 0.7;
    c.score /= Math.max(1, c.card.cost);
  }
  candidates.sort(
    (a, b) =>
      b.score - a.score || a.card.cost - b.card.cost || a.id.localeCompare(b.id)
  );
  return candidates[0].score > 0 ? candidates[0].id : null;
}
export function runVisibleCardStrategy(initial) {
  let state = initial;
  for (
    let step = 0;
    step < 500 && (state.phase === 'battle' || state.phase === 'discard');
    step++
  ) {
    let action;
    if (state.phase === 'discard') {
      const ids = [...state.hand]
        .sort((a, b) => {
          const aa = state.cards.find((c) => c.id === a),
            bb = state.cards.find((c) => c.id === b);
          return (aa.damage ?? 0) - (bb.damage ?? 0) || a.localeCompare(b);
        })
        .slice(0, state.hand.length - 10);
      action = { type: 'confirm-discard', cardIds: ids };
    } else {
      const cardId = selectVisibleCard(state);
      action = cardId ? { type: 'play', cardId } : { type: 'end-turn' };
    }
    const next = stepCardBattle(state, {
      ...action,
      id: state.id,
      seq: state.commandSeq + 1,
    });
    if (next === state) throw Error('strategy rejected');
    state = next;
  }
  return state;
}
