import type { AdventureResult, PlayerStats, SecretRealm } from '../../types';
import { generateLocalAdventureEvent } from '../../utils/localEvents';
import {
  applyAdventureResult,
  type AdventureResultLog,
} from '../../utils/adventureResult';

export interface DungeonExploration {
  player: PlayerStats;
  logs: AdventureResultLog[];
  changes: string[];
  result: AdventureResult;
  continuation?: { type: 'secret-realm' };
}

export function createDungeonRandom(seed: number): () => number {
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff)
    throw new Error('副本随机种子无效。');
  let state = seed >>> 0 || 0x6d2b79f5;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x100000000;
  };
}

/** Entry fee is already committed by the host; this never charges or demotes. */
export function prepareDungeonExploration(
  entryPlayer: PlayerStats,
  realm: SecretRealm,
  seed: number,
  now: number
): DungeonExploration {
  return prepareExploration(entryPlayer, realm, seed, now);
}

/** Legacy anonymous continuation: no named-realm discovery bonus or entry fee. */
export function prepareAnonymousDungeonExploration(
  entryPlayer: PlayerStats,
  seed: number,
  now: number
): DungeonExploration {
  return prepareExploration(entryPlayer, undefined, seed, now);
}

function prepareExploration(
  entryPlayer: PlayerStats,
  realm: SecretRealm | undefined,
  seed: number,
  now: number
): DungeonExploration {
  if (!Number.isSafeInteger(now) || now < 0) throw new Error('副本时间无效。');
  const random = createDungeonRandom(seed);
  const result = generateLocalAdventureEvent(
    entryPlayer,
    'secret_realm',
    realm?.riskLevel,
    random
  );
  let nextId = 0;
  const applied = applyAdventureResult(entryPlayer, result, {
    adventureType: 'secret_realm',
    realmName: realm?.name,
    random,
    createId: () =>
      `dungeon-${now.toString(36)}-${seed.toString(36)}-${nextId++}`,
  });
  const changes: string[] = [];
  for (const [key, label] of [
    ['hp', '精力'],
    ['exp', '绩点'],
    ['spiritStones', '学分'],
    ['attack', '攻击'],
    ['defense', '防御'],
    ['maxHp', '精力上限'],
    ['spirit', '思维'],
    ['physique', '体能'],
    ['speed', '手速'],
    ['luck', '欧气'],
    ['lotteryTickets', '抽奖券'],
    ['inheritanceLevel', '传承等级'],
  ] as const) {
    const change = applied.player[key] - entryPlayer[key];
    if (change) changes.push(`${label} ${change > 0 ? '+' : ''}${change}`);
  }
  for (const item of applied.player.inventory) {
    const before = entryPlayer.inventory.find(
      (candidate) => candidate.id === item.id
    );
    const amount = item.quantity - (before?.quantity ?? 0);
    if (amount > 0) changes.push(`获得 ${item.name} ×${amount}`);
  }
  for (const id of applied.player.cultivationArts) {
    if (!entryPlayer.cultivationArts.includes(id))
      changes.push('领悟新课程，可在课程列表查看');
  }
  for (const pet of applied.player.pets) {
    if (!entryPlayer.pets.some((candidate) => candidate.id === pet.id))
      changes.push(`结识室友 ${pet.name}`);
  }
  const logs = [
    ...applied.logs,
    { text: result.story, type: result.eventColor ?? 'normal' },
  ];
  if (result.itemsObtained?.length) {
    for (const item of result.itemsObtained)
      logs.push({
        text: `获得物品: ${item.rarity ? `【${item.rarity}】` : ''}${item.name}`,
        type: 'gain',
      });
  } else if (result.itemObtained) {
    logs.push({ text: `获得物品: ${result.itemObtained.name}`, type: 'gain' });
  }
  return {
    player: applied.player,
    logs,
    changes,
    result,
    ...(result.triggerSecretRealm
      ? { continuation: { type: 'secret-realm' as const } }
      : {}),
  };
}
