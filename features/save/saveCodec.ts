import type { Item, LogEntry, PlayerStats } from '../../types';
import { SAVE_VERSION } from '../../utils/gameUtils';
import { inferItemTypeAndSlot } from '../../utils/itemUtils';
import {
  assertInteractiveProgress,
  type InteractiveProgress,
} from '../interactive/state';

type MigratedField =
  | 'inventory'
  | 'dailyTaskCount'
  | 'lastTaskResetDate'
  | 'viewedAchievements'
  | 'natalArtifactId'
  | 'unlockedRecipes'
  | 'meditationHpRegenMultiplier'
  | 'meditationBoostEndTime'
  | 'playtimeSeconds'
  | 'lastLeaderboardSubmit';

/** 同一版本中曾缺少的字段在加载时补齐，不改变存档版本和枚举值。 */
export type SavedPlayer = Omit<PlayerStats, MigratedField> &
  Partial<Pick<PlayerStats, Exclude<MigratedField, 'dailyTaskCount'>>> & {
    dailyTaskCount?: PlayerStats['dailyTaskCount'] | number;
  };

export interface GameSave {
  version: number;
  player: SavedPlayer;
  logs?: LogEntry[];
  timestamp?: number;
  interactive?: InteractiveProgress;
}

/** 维持现有版本门槛；这不是对所有玩家字段的完整运行时校验。 */
export function isSaveCompatible(value: unknown): value is GameSave {
  if (!value || typeof value !== 'object') return false;
  const saved = value as Partial<GameSave>;
  return Boolean(saved.player) && saved.version === SAVE_VERSION;
}

/** 导入先检查再覆盖，避免旧主题存档在刷新后触发自动删档。 */
export function parseImportSave(raw: string): GameSave {
  const saved: unknown = JSON.parse(raw);
  if (!isSaveCompatible(saved)) {
    throw new Error('存档版本不兼容或缺少玩家数据，请导入当前版本的存档。');
  }
  if (typeof saved.player !== 'object' || Array.isArray(saved.player)) {
    throw new Error('存档缺少有效的玩家数据。');
  }
  if (!Array.isArray(saved.logs)) {
    throw new Error('存档日志数据必须是数组格式。');
  }
  if (saved.interactive !== undefined)
    assertInteractiveProgress(saved.interactive);
  return saved;
}

export function repairSavedInventory(inventory: Item[] | undefined): Item[] {
  return (inventory || []).map((item) => {
    const inferred = inferItemTypeAndSlot(
      item.name,
      item.type,
      item.description || '',
      item.isEquippable
    );
    if (
      inferred.type === item.type &&
      inferred.equipmentSlot === item.equipmentSlot &&
      inferred.isEquippable === item.isEquippable
    ) {
      return item;
    }
    return {
      ...item,
      type: inferred.type,
      isEquippable: inferred.isEquippable,
      equipmentSlot: inferred.equipmentSlot,
    };
  });
}

export function restoreSavedPlayer(
  player: SavedPlayer,
  name: string,
  now = new Date()
): PlayerStats {
  return {
    ...player,
    name,
    inventory: repairSavedInventory(player.inventory),
    dailyTaskCount:
      player.dailyTaskCount && typeof player.dailyTaskCount === 'object'
        ? player.dailyTaskCount
        : {
            instant:
              typeof player.dailyTaskCount === 'number'
                ? player.dailyTaskCount
                : 0,
            short: 0,
            medium: 0,
            long: 0,
          },
    lastTaskResetDate:
      player.lastTaskResetDate || now.toISOString().split('T')[0],
    viewedAchievements: player.viewedAchievements || [],
    natalArtifactId: player.natalArtifactId || null,
    unlockedRecipes: player.unlockedRecipes || [],
    meditationHpRegenMultiplier: player.meditationHpRegenMultiplier ?? 1.0,
    meditationBoostEndTime: player.meditationBoostEndTime ?? null,
    playtimeSeconds: player.playtimeSeconds ?? 0,
    lastLeaderboardSubmit: player.lastLeaderboardSubmit ?? 0,
  };
}

export function createGameSave(
  player: PlayerStats,
  logs: LogEntry[],
  timestamp = Date.now(),
  interactive?: InteractiveProgress
): GameSave {
  return {
    version: SAVE_VERSION,
    player,
    logs,
    timestamp,
    ...(interactive ? { interactive } : {}),
  };
}
