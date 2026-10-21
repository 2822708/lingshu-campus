import React from 'react';
import { PlayerStats, AdventureType, ShopType, RealmType } from '../../types';
import { REALM_ORDER } from '../../constants';
import {
  tryEncounter,
  tryBattleEncounter,
  pickBattleForced,
  pickRewardForced,
} from '../../utils/encounter';
import { generateAdventureEvent } from '../../services/aiService';
import {
  shouldTriggerBattle,
  BattleReplay,
} from '../../services/battleService';
import type { AdventureBattleRequest } from '../../features/interactive/adventureBattle';
import { executeAdventureCore } from './executeAdventureCore';
import {
  AIContextCancelledError,
  getAIContextEpoch,
  isAIContextCurrent,
} from '../../services/ai/runtime';

/**
 * 期末冲刺处理函数
 * 包含期末冲刺、刷题核心逻辑
 * @param player 玩家数据
 * @param setPlayer 设置玩家数据
 * @param addLog 添加日志
 * @param triggerVisual 触发视觉效果
 * @param setLoading 设置加载状态
 * @param setCooldown 设置冷却时间
 * @param loading 加载状态
 * @param cooldown 冷却时间
 * @param onOpenShop 打开商店
 * @param onStartBattle 保存未结算战斗并交由逐轮操作界面处理
 * @returns handleAdventure 期末冲刺
 * @returns executeAdventure 刷题核心逻辑
 */

interface UseAdventureHandlersProps {
  player: PlayerStats;
  setPlayer: React.Dispatch<React.SetStateAction<PlayerStats>>;
  addLog: (message: string, type?: string) => void;
  triggerVisual: (type: string, text?: string, className?: string) => void;
  setLoading: (loading: boolean) => void;
  setCooldown: (cooldown: number) => void;
  loading: boolean;
  cooldown: number;
  onOpenShop: (shopType: ShopType) => void;
  /** Kept for historical nonbattle-core callers; new battles never open a settled replay. */
  onOpenBattleModal?: (replay: BattleReplay) => void;
  skipBattle?: boolean;
  /** true consumes this action; false keeps the existing ordinary-event path. */
  onStartInteractive?: () => boolean;
  onStartBattle: (request: AdventureBattleRequest) => boolean;
  /** A nonbattle realm visit must save its entry cost before applying ordinary rewards. */
  onCommitRealmEntry?: (cost: number) => boolean;
  getCurrentPlayer?: () => PlayerStats | null;
  isInteractionPending?: () => boolean;
}

export function useAdventureHandlers({
  player,
  setPlayer,
  addLog,
  triggerVisual,
  setLoading,
  setCooldown,
  loading,
  cooldown,
  onOpenShop,
  onOpenBattleModal = () => {},
  skipBattle = false,
  onStartInteractive,
  onStartBattle,
  onCommitRealmEntry,
  getCurrentPlayer,
  isInteractionPending,
}: UseAdventureHandlersProps) {
  // 🆕 商店触发冷却：90 秒内不重复弹商店（避免连续点击刷屏）
  const SHOP_COOLDOWN_MS = 90_000;
  const lastShopAtRef = React.useRef<number>(0);
  const actionInFlight = React.useRef(false);
  const latestContext = React.useRef({ player, loading, cooldown });
  latestContext.current = { player, loading, cooldown };
  const executeAdventure = async (
    adventureType: AdventureType,
    realmName?: string,
    riskLevel?: '低' | '中' | '高' | '极度危险',
    realmMinRealm?: RealmType,
    realmDescription?: string,
    realmDrops?: string[], // 🆕 副本"可能掉落"列表，搜刮时按概率兑现
    entryCost = 0,
    continueTriggeredRealm = false
  ) => {
    if (
      actionInFlight.current ||
      isInteractionPending?.() ||
      latestContext.current.loading ||
      (!continueTriggeredRealm && latestContext.current.cooldown > 0)
    )
      return;
    const currentPlayer = getCurrentPlayer
      ? getCurrentPlayer()
      : latestContext.current.player;
    if (!currentPlayer) {
      setLoading(false);
      return;
    }
    actionInFlight.current = true;
    setLoading(true);
    const actionEpoch = getAIContextEpoch();
    if (realmName) {
      addLog(
        `你进入了【${realmName}】，只觉 DDL 扑面而来，气氛紧张...`,
        'special'
      );
    } else {
      addLog('你走出宿舍，前往图书馆/实训室刷题...', 'normal');
    }

    try {
      let result;

      // ============ 奇遇触发（战斗/纯奖励 五五开）============
      // 只对"期末周"按钮（adventureType === 'normal' 且不在副本）生效
      // 设计：遇到奇遇时，50% 强制出战斗奇遇，50% 强制出纯奖励奇遇
      //  - 战斗奇遇 → 强制进入特殊战斗，打赢给奇遇奖励，打输正常掉血（可能延毕）
      //  - 纯奖励奇遇 → 后置叠加 exp/学分/物品
      let battleEncounter: ReturnType<typeof tryBattleEncounter> = null;
      let encounterResult: ReturnType<typeof tryEncounter> = null;

      if (adventureType === 'normal' && !realmName) {
        const rollBattle = Math.random() < 0.5;
        if (rollBattle) {
          // 50%：先强制战斗奇遇（满足条件则必出）；没候选回退到纯奖励
          battleEncounter = pickBattleForced(currentPlayer);
          if (!battleEncounter) {
            encounterResult = pickRewardForced(currentPlayer);
          }
        } else {
          // 50%：先强制纯奖励奇遇；没候选回退到战斗奇遇
          encounterResult = pickRewardForced(currentPlayer);
          if (!encounterResult) {
            battleEncounter = pickBattleForced(currentPlayer);
          }
        }
      }

      if (battleEncounter) {
        // The request contains only preparation. No turn, reward, or HP change is settled here.
        onStartBattle({
          adventureType,
          riskLevel: battleEncounter.battle?.difficulty,
          realmMinRealm,
          realmName: battleEncounter.name,
          battleEncounter,
          entryCost,
        });
        // Failed critical saves must also stop here; never fall through to ordinary rewards.
        return;
      } else if (shouldTriggerBattle(currentPlayer, adventureType)) {
        onStartBattle({
          adventureType,
          riskLevel,
          realmMinRealm,
          realmName,
          realmDescription,
          realmDrops,
          entryCost,
          rewardEncounter: encounterResult,
        });
        return;
      } else {
        result = await generateAdventureEvent(
          currentPlayer,
          adventureType,
          riskLevel,
          realmName,
          realmDescription
        );
      }

      if (!isAIContextCurrent(actionEpoch)) return;

      // Realm fees belong to this attempt even when the original battle roll misses.
      // Save first so disabled autosave or refresh cannot turn the visit into a free roll.
      if (
        adventureType === 'secret_realm' &&
        entryCost > 0 &&
        !onCommitRealmEntry?.(entryCost)
      ) {
        return;
      }

      // 纯奖励奇遇叠加：如果在 50/50 分配里 roll 到了纯奖励奇遇，叠加到原 result 上
      // （战斗奇遇已在前置处理，这里只叠加纯奖励奇遇）
      if (
        adventureType === 'normal' &&
        !realmName &&
        !battleEncounter &&
        encounterResult
      ) {
        // 叠加 encounter 奖励到原 result 上（exp/credits/items 取 max）
        result = {
          ...result,
          story: result.story + '\n\n' + encounterResult.story,
          expChange: result.expChange + (encounterResult.expChange ?? 0),
          spiritStonesChange:
            result.spiritStonesChange +
            (encounterResult.spiritStonesChange ?? 0),
          itemObtained: encounterResult.itemObtained ?? result.itemObtained,
          eventColor: 'special',
        };
      }

      await executeAdventureCore({
        result,
        battleContext: null,
        player: currentPlayer,
        setPlayer,
        addLog,
        triggerVisual,
        onOpenBattleModal,
        realmName,
        adventureType,
        skipBattle,
        riskLevel,
        // The legacy rare extra-realm event must use the same manual battle entry.
        // Its timer can run just before the parent action's cooldown timer clears;
        // this continuation bypasses only that cooldown, never loading/pending guards.
        onTriggerSecretRealm: () =>
          executeAdventure(
            'secret_realm',
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            0,
            true
          ),
      });
    } catch (error) {
      if (
        !(error instanceof AIContextCancelledError) &&
        isAIContextCurrent(actionEpoch)
      ) {
        addLog('本次行动已中止，请稍后重试。', 'danger');
      }
    } finally {
      actionInFlight.current = false;
      if (isAIContextCurrent(actionEpoch)) {
        setLoading(false);
        setCooldown(2);
      }
    }
  };

  const handleAdventure = async () => {
    if (loading || cooldown > 0 || actionInFlight.current) return;
    if (onStartInteractive?.()) return;
    if (player.hp < player.maxHp * 0.2) {
      addLog('你精力见底，仍然强撑着继续刷题...', 'danger');
    }

    // 根据学阶计算机缘概率
    const realmIndex = REALM_ORDER.indexOf(player.realm);
    const baseLuckyChance = 0.05; // 基础5%概率
    const realmBonus = realmIndex * 0.02; // 每提升一个学阶增加2%
    const levelBonus = (player.realmLevel - 1) * 0.01; // 每提升一层增加1%
    const luckBonus = player.luck * 0.001; // 幸运值加成
    const luckyChance = Math.min(
      0.3,
      baseLuckyChance + realmBonus + levelBonus + luckBonus
    );

    // 🆕 商店触发概率：基础 8% + 学阶加成（每升 1 学阶 +1%），封顶 15%
    // 加 90 秒冷却：避免连续点击刷屏
    const baseShopChance = 0.08;
    const realmShopBonus = realmIndex * 0.01;
    const shopChance = Math.min(0.15, baseShopChance + realmShopBonus);
    const now = Date.now();
    const inShopCooldown = now - lastShopAtRef.current < SHOP_COOLDOWN_MS;

    if (!inShopCooldown && Math.random() < shopChance) {
      lastShopAtRef.current = now;
      const shopTypes = [ShopType.Village, ShopType.City, ShopType.Sect];
      const randomShopType =
        shopTypes[Math.floor(Math.random() * shopTypes.length)];
      onOpenShop(randomShopType);
      return;
    }

    // 根据学阶计算机缘概率
    const isLucky = Math.random() < luckyChance;
    await executeAdventure(isLucky ? 'lucky' : 'normal');
  };

  return {
    handleAdventure,
    executeAdventure,
  };
}
