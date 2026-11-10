import type { CardEffects } from './types';

export const CARD_HAND_LIMIT = 10;
export const CARD_DRAW_PER_TURN = 4;
export const CARD_FOCUS_PER_TURN = 3;
export const CARD_MAX_VALUE = Math.floor(Number.MAX_SAFE_INTEGER / 64);
export interface CardRandomState {
  rngState: number;
}
export interface CardZones {
  drawPile: string[];
  hand: string[];
  discardPile: string[];
  exhaustPile: string[];
}
export interface CardPlayerRuntime {
  hp: number;
  maxHp: number;
  energy: number;
  block: number;
  nextAttackBonus: number;
  attacksPlayed: number;
}
export interface CardCombatRuntime extends CardRandomState, CardZones {
  player: CardPlayerRuntime;
  enemyHp: number;
  enemyBlock: number;
  enemyGuardRounds: number;
}
export function nextCardRandom(state: CardRandomState): number {
  let word = state.rngState;
  word ^= word << 13;
  word ^= word >>> 17;
  word ^= word << 5;
  state.rngState = word >>> 0;
  return state.rngState / 0x100000000;
}
export function shuffleCards<T>(
  rng: CardRandomState,
  values: readonly T[]
): T[] {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(nextCardRandom(rng) * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
export function drawCards(
  rng: CardRandomState,
  zones: CardZones,
  count: number
): number {
  let drawn = 0;
  while (drawn < count) {
    if (!zones.drawPile.length) {
      if (!zones.discardPile.length) break;
      zones.drawPile = shuffleCards(rng, zones.discardPile);
      zones.discardPile = [];
    }
    zones.hand.push(zones.drawPile.pop()!);
    drawn++;
  }
  return drawn;
}
export function isExactDiscard(
  hand: readonly string[],
  selected: unknown,
  limit = CARD_HAND_LIMIT
): selected is string[] {
  return (
    Array.isArray(selected) &&
    selected.length === hand.length - limit &&
    new Set(selected).size === selected.length &&
    selected.every((id) => typeof id === 'string' && hand.includes(id))
  );
}
export function discardSelected(
  zones: CardZones,
  selected: readonly string[]
): string[] {
  const ids = new Set(selected);
  const discarded = zones.hand.filter((id) => ids.has(id));
  zones.hand = zones.hand.filter((id) => !ids.has(id));
  zones.discardPile.push(...discarded);
  return discarded;
}
export function previewCardEffects(
  card: CardEffects,
  player: CardPlayerRuntime,
  healingCap = player.maxHp
) {
  const damage =
    (card.damage ?? 0) > 0
      ? Math.min(
          CARD_MAX_VALUE,
          (card.damage ?? 0) +
            player.nextAttackBonus +
            (player.attacksPlayed > 0 ? (card.bonusAfterAttack ?? 0) : 0)
        )
      : 0;
  return {
    damage,
    block: card.block ?? 0,
    heal: Math.max(0, Math.min(card.heal ?? 0, healingCap - player.hp)),
    draw: card.draw ?? 0,
  };
}
/** Shared single-card kernel. Callers provide an already cloned combat snapshot. */
export function applyCardEffects(
  runtime: CardCombatRuntime,
  card: CardEffects,
  cardId: string,
  healingCap: number
) {
  const preview = previewCardEffects(card, runtime.player, healingCap);
  const cleared = card.clearEnemyBlock ? runtime.enemyBlock : 0;
  const clearedGuard = Boolean(
    card.clearEnemyBlock && runtime.enemyGuardRounds
  );
  if (card.clearEnemyBlock) {
    runtime.enemyBlock = 0;
    runtime.enemyGuardRounds = 0;
  }
  const guardedDamage =
    preview.damage > 0 && runtime.enemyGuardRounds > 0
      ? Math.max(1, Math.round(preview.damage * 0.5))
      : preview.damage;
  const absorbed = Math.min(guardedDamage, runtime.enemyBlock);
  const damage = Math.min(runtime.enemyHp, guardedDamage - absorbed);
  runtime.player.energy -= card.cost;
  runtime.hand.splice(runtime.hand.indexOf(cardId), 1);
  runtime.enemyBlock -= absorbed;
  runtime.enemyHp -= damage;
  if (preview.damage > 0) {
    runtime.player.nextAttackBonus = 0;
    runtime.player.attacksPlayed++;
  }
  runtime.player.block = Math.min(
    CARD_MAX_VALUE,
    runtime.player.block + preview.block
  );
  runtime.player.hp += preview.heal;
  runtime.player.nextAttackBonus = Math.min(
    CARD_MAX_VALUE,
    runtime.player.nextAttackBonus + (card.nextAttackBonus ?? 0)
  );
  const drawn =
    runtime.enemyHp > 0 ? drawCards(runtime, runtime, preview.draw) : 0;
  // A draw card reaches discard only after its own draw resolves.
  (card.exhaust ? runtime.exhaustPile : runtime.discardPile).push(cardId);
  return {
    ...preview,
    damage,
    absorbed,
    cleared,
    clearedGuard,
    drawn,
    guardPrevented: preview.damage - guardedDamage,
  };
}
export function applyCardEnemyHit(player: CardPlayerRuntime, incoming: number) {
  const prevented = Math.min(player.block, incoming);
  const damage = Math.min(player.hp, incoming - prevented);
  player.hp -= damage;
  player.block = 0;
  return { damage, prevented };
}
