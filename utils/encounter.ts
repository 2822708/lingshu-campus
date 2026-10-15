/**
 * 校园奇遇触发器（把 constants.ts 里的 ENCOUNTER_EVENTS 死代码接活）
 *
 * 工作流：
 *   - 玩家点"期末周" → 走完战斗/事件 → 调用 tryEncounter(player)
 *   - 根据 player.realm + luck 过滤满足条件的 encounter
 *   - 按 triggerChance roll 一个 → 命中 → 返回该 encounter 改写的 AdventureResult
 *   - 未命中 → 返回 null
 *
 * 设计要点：
 *   - encounter 触发是**后置**（战斗/事件之后），不打断节奏
 *   - 玩家感觉是"打了一场 → 还能撞到小确幸"
 *   - encounter 的奖励复用现有 AdventureResult 字段（exp/credits/item/eventColor）
 *   - 不需要新 UI —— eventColor = 'special' + story 拼接即可
 */

import type { PlayerStats, AdventureResult } from '../types';
import { ENCOUNTER_EVENTS, REALM_ORDER } from '../constants';

/**
 * 判断 encounter 是否满足前置条件
 *  - 学阶 >= minRealm
 *  - luck >= minLuck（如果有）
 *  - sectId（如果有）：当前玩家是否在该社团
 */
function meetsRequirement(
  enc: typeof ENCOUNTER_EVENTS[number],
  player: PlayerStats
): boolean {
  if (enc.minRealm) {
    const encIdx = REALM_ORDER.indexOf(enc.minRealm);
    const playerIdx = REALM_ORDER.indexOf(player.realm);
    if (playerIdx < encIdx) return false;
  }
  if (enc.requirements?.minLuck != null) {
    if ((player.luck || 0) < enc.requirements.minLuck) return false;
  }
  if (enc.requirements?.sectId) {
    if (player.sectId !== enc.requirements.sectId) return false;
  }
  return true;
}

/** 简单的加权随机抽取（每个 encounter 概率独立 roll） */
function pickEncounter(
  player: PlayerStats,
  onlyBattle?: boolean
): typeof ENCOUNTER_EVENTS[number] | null {
  const candidates = ENCOUNTER_EVENTS.filter((e) => {
    if (!meetsRequirement(e, player)) return false;
    // 战斗奇遇和纯奖励奇遇分开 roll：
    //  onlyBattle=true 只看 battle 字段的；false 只排除 battle 的
    const isBattle = !!e.battle;
    return onlyBattle ? isBattle : !isBattle;
  });
  for (const enc of candidates) {
    // luck 影响概率：+1 luck +5% 触发率，上限 100%
    const luckBonus = Math.min(1, (player.luck || 0) * 0.05);
    const effectiveChance = Math.min(1, enc.triggerChance * (1 + luckBonus));
    if (Math.random() < effectiveChance) {
      return enc;
    }
  }
  return null;
}

/**
 * 把 encounter 改写成 AdventureResult（让现有 UI 能直接展示）
 * 物品走 itemObtained 字段（执行端在 executeAdventureCore 里 addInventory）
 */
function encounterToResult(enc: typeof ENCOUNTER_EVENTS[number]): AdventureResult {
  return {
    story: `🌟 校园奇遇：${enc.name}\n\n${enc.description}`,
    hpChange: enc.rewards.hpChange ?? 0,
    expChange: enc.rewards.exp ?? 0,
    spiritStonesChange: enc.rewards.spiritStones ?? 0,
    eventColor: 'special',
    itemObtained: enc.rewards.items?.[0]
      ? {
          name: enc.rewards.items[0].name,
          // 不传 type / isEquippable / equipmentSlot — 让 executeAdventureCore 调
          // inferItemTypeAndSlot 根据物品名 + 描述自动推断
          type: '元件', // 默认值，会被 executeAdventureCore 的 inferItemTypeAndSlot 覆盖
          description: `${enc.name}的奖励`,
          rarity: enc.rewards.items[0].rarity,
        }
      : undefined,
  };
}

/**
 * 加权随机选一个（按 triggerChance 加权，保证有候选就返回）
 *  - candidates 非空 → 必返回一个
 *  - 空 → null
 */
function pickForced(
  player: PlayerStats,
  onlyBattle: boolean
): typeof ENCOUNTER_EVENTS[number] | null {
  const candidates = ENCOUNTER_EVENTS.filter((e) => {
    if (!meetsRequirement(e, player)) return false;
    const isBattle = !!e.battle;
    return onlyBattle ? isBattle : !isBattle;
  });
  if (candidates.length === 0) return null;

  // 按 triggerChance 加权随机（触发率高的更常见）
  let total = 0;
  for (const enc of candidates) total += enc.triggerChance;
  let r = Math.random() * total;
  for (const enc of candidates) {
    r -= enc.triggerChance;
    if (r <= 0) return enc;
  }
  return candidates[candidates.length - 1];
}

/**
 * 公开 API：尝试触发一个 encounter
 *  - 命中：返回该 encounter 改写的 AdventureResult（调用方直接用）
 *  - 未命中：返回 null（调用方继续走原本的 result）
 */
export function tryEncounter(player: PlayerStats): AdventureResult | null {
  const enc = pickEncounter(player, false); // 只 roll 纯奖励奇遇（战斗奇遇走 tryBattleEncounter）
  return enc ? encounterToResult(enc) : null;
}

/**
 * 公开 API：尝试触发一个【战斗奇遇】
 *  - 命中：返回该 encounter（调用方据此触发战斗，打赢才给 rewards）
 *  - 未命中：返回 null
 */
export function tryBattleEncounter(
  player: PlayerStats
): typeof ENCOUNTER_EVENTS[number] | null {
  return pickEncounter(player, true);
}

/**
 * 公开 API：强制选一个【战斗奇遇】（满足条件则必返回，用于"战斗占一半"的触发逻辑）
 */
export function pickBattleForced(
  player: PlayerStats
): typeof ENCOUNTER_EVENTS[number] | null {
  return pickForced(player, true);
}

/**
 * 公开 API：强制选一个【纯奖励奇遇】（满足条件则必返回）
 */
export function pickRewardForced(
  player: PlayerStats
): AdventureResult | null {
  const enc = pickForced(player, false);
  return enc ? encounterToResult(enc) : null;
}