import type { PlayerStats } from '../../types';
import { CARDS } from '../card-battle/catalog';
import { BASIC_DUNGEON_CARD_IDS, getDungeonCardSources } from './sources';

export interface CardLoadout {
  version: 1;
  revision: number;
  library: string[];
  resume: string[];
}
export interface DungeonLoadoutValidation {
  valid: boolean;
  errors: string[];
  missingSourceIds: string[];
}
export const MIN_DUNGEON_CARDS = 8;
export const MAX_DUNGEON_CARDS = 16;
export function createDefaultCardLoadout(revision = 0): CardLoadout {
  return {
    version: 1,
    revision,
    library: [...BASIC_DUNGEON_CARD_IDS],
    resume: [...BASIC_DUNGEON_CARD_IDS],
  };
}
export function assertCardLoadout(
  value: unknown
): asserts value is CardLoadout {
  const record = value as CardLoadout;
  const ids = (list: unknown): list is string[] =>
    Array.isArray(list) &&
    list.length <= 512 &&
    list.every(
      (id) => typeof id === 'string' && id.length > 0 && id.length <= 256
    ) &&
    new Set(list).size === list.length;
  if (
    !record ||
    typeof record !== 'object' ||
    Array.isArray(record) ||
    record.version !== 1 ||
    !Number.isSafeInteger(record.revision) ||
    record.revision < 0 ||
    record.revision >= Number.MAX_SAFE_INTEGER ||
    !ids(record.library) ||
    !ids(record.resume) ||
    record.resume.length < MIN_DUNGEON_CARDS ||
    record.resume.length > MAX_DUNGEON_CARDS ||
    BASIC_DUNGEON_CARD_IDS.some((id) => !record.library.includes(id)) ||
    record.resume.some((id) => !record.library.includes(id))
  ) {
    throw new Error('简历配置无效：请保留原档，并在副本准备中重新整理。');
  }
}
export function validateDungeonLoadout(
  player: PlayerStats,
  loadout: CardLoadout
): DungeonLoadoutValidation {
  try {
    assertCardLoadout(loadout);
  } catch (error) {
    return {
      valid: false,
      errors: [(error as Error).message],
      missingSourceIds: [],
    };
  }
  const sources = getDungeonCardSources(player);
  const available = new Map(sources.map((source) => [source.id, source]));
  const missingSourceIds = loadout.library.filter((id) => !available.has(id));
  const errors = missingSourceIds.length
    ? ['课程或装备来源已失效，请先移除失效来源或补齐基础牌。']
    : [];
  if (
    !loadout.resume.some((id) => {
      const source = available.get(id);
      if (!source) return false;
      const card = CARDS[source.templateId];
      return (card.damage ?? 0) > 0 || (card.blockToDamage ?? 0) > 0;
    })
  )
    errors.push('简历至少需要一张进攻牌。');
  return { valid: errors.length === 0, errors, missingSourceIds };
}
/** Explicit user action only; a failed validation never silently applies this. */
export function repairDungeonLoadout(
  player: PlayerStats,
  loadout: CardLoadout
): CardLoadout {
  const available = new Map(
    getDungeonCardSources(player).map((source) => [source.id, source])
  );
  const library = [
    ...new Set([
      ...BASIC_DUNGEON_CARD_IDS,
      ...(Array.isArray(loadout.library)
        ? loadout.library.filter((id) => available.has(id))
        : []),
    ]),
  ];
  const resume = [
    ...new Set(
      Array.isArray(loadout.resume)
        ? loadout.resume.filter((id) => available.has(id))
        : []
    ),
  ].slice(0, MAX_DUNGEON_CARDS);
  for (const id of BASIC_DUNGEON_CARD_IDS) {
    if (resume.length >= MIN_DUNGEON_CARDS) break;
    if (!resume.includes(id)) resume.push(id);
  }
  if (
    !resume.some((id) => {
      const card = CARDS[available.get(id)!.templateId];
      return (card.damage ?? 0) > 0 || (card.blockToDamage ?? 0) > 0;
    })
  ) {
    if (resume.length === MAX_DUNGEON_CARDS) resume.pop();
    resume.push(BASIC_DUNGEON_CARD_IDS[0]);
  }
  return {
    version: 1,
    revision:
      Number.isSafeInteger(loadout.revision) &&
      loadout.revision >= 0 &&
      loadout.revision < Number.MAX_SAFE_INTEGER
        ? loadout.revision
        : 0,
    library,
    resume,
  };
}
