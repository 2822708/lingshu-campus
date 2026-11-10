import type { PlayerStats } from '../../types';
import type { CardBattleState } from '../card-battle/types';
import { createDungeonRandom } from './exploration';
import type { CardLoadout } from './loadout';
import { assertCardLoadout } from './loadout';
import { BASIC_DUNGEON_CARD_IDS, getDungeonCardSources } from './sources';
import type { DungeonCardSource } from './sources';

/** A per-entry deck: the player's saved manual resume is never changed here. */
export function createRogueDungeonLoadout(
  player: PlayerStats,
  seed: number,
  revision = 0
): CardLoadout {
  const random = createDungeonRandom(seed);
  const sources = getDungeonCardSources(player);
  function choose(pool: DungeonCardSource[], count: number): string[] {
    const remaining = [...pool].sort((a, b) =>
      a.id < b.id ? -1 : a.id > b.id ? 1 : 0
    );
    const selected: string[] = [];
    while (selected.length < count && remaining.length) {
      const index = Math.floor(random() * remaining.length);
      selected.push(remaining.splice(index, 1)[0].id);
    }
    return selected;
  }
  const resume = [
    ...BASIC_DUNGEON_CARD_IDS,
    ...choose(
      sources.filter((source) => source.id.startsWith('tactic:')),
      2
    ),
    ...choose(
      sources.filter((source) => source.source === 'course'),
      3
    ),
    ...choose(
      sources.filter((source) => source.source === 'equipment'),
      3
    ),
  ];
  const loadout: CardLoadout = {
    version: 1,
    revision,
    library: [...resume],
    resume,
  };
  assertCardLoadout(loadout);
  return loadout;
}

/** Exchange opening draws, preserving every card, pile size, and random stream. */
export function ensureRogueOpeningSources(
  run: CardBattleState
): CardBattleState {
  if (run.turn !== 1 || run.commandSeq !== 0 || run.phase !== 'battle')
    return run;
  const byId = new Map(run.cards.map((card) => [card.id, card]));
  const hand = [...run.hand];
  const drawPile = [...run.drawPile];
  const sourceOf = (id: string) => byId.get(id)?.source;
  let changed = false;
  for (const source of ['course', 'equipment'] as const) {
    if (hand.some((id) => sourceOf(id) === source)) continue;
    const drawIndex = drawPile.findIndex((id) => sourceOf(id) === source);
    if (drawIndex < 0) continue;
    const counts = {
      course: hand.filter((id) => sourceOf(id) === 'course').length,
      equipment: hand.filter((id) => sourceOf(id) === 'equipment').length,
    };
    let handIndex = hand.findIndex((id) => sourceOf(id) === 'basic');
    if (handIndex < 0)
      handIndex = hand.findIndex((id) => {
        const kind = sourceOf(id);
        return kind !== 'course' && kind !== 'equipment';
      });
    if (handIndex < 0)
      handIndex = hand.findIndex((id) => {
        const kind = sourceOf(id);
        return (kind === 'course' || kind === 'equipment') && counts[kind] > 1;
      });
    if (handIndex < 0) continue;
    [hand[handIndex], drawPile[drawIndex]] = [
      drawPile[drawIndex],
      hand[handIndex],
    ];
    changed = true;
  }
  return changed ? { ...run, hand, drawPile } : run;
}
