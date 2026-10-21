import React from 'react';
import { PlayerStats, SecretRealm, RealmType } from '../../types';
import { REALM_ORDER } from '../../constants';

interface UseRealmHandlersProps {
  player: PlayerStats;
  setPlayer: React.Dispatch<React.SetStateAction<PlayerStats>>;
  addLog: (message: string, type?: string) => void;
  setLoading: (loading: boolean) => void;
  setCooldown: (cooldown: number) => void;
  loading: boolean;
  cooldown: number;
  setIsRealmOpen: (open: boolean) => void;
  executeAdventure: (
    adventureType: 'secret_realm',
    realmName: string,
    riskLevel?: '低' | '中' | '高' | '极度危险',
    realmMinRealm?: RealmType,
    realmDescription?: string,
    realmDrops?: string[],
    entryCost?: number
  ) => Promise<void>;
  isInteractionPending?: () => boolean;
  getCurrentPlayer?: () => PlayerStats | null;
}

/**
 * 副本处理函数
 * 包含进入副本
 * @param player 玩家数据
 * @param setPlayer 设置玩家数据
 * @param addLog 添加日志
 * @param setLoading 设置加载状态
 * @param setCooldown 设置冷却时间
 * @param loading 加载状态
 * @param cooldown 冷却时间
 * @param setIsRealmOpen 设置副本是否打开
 * @param executeAdventure 执行刷题
 * @returns handleEnterRealm 进入副本
 */

export function useRealmHandlers({
  player,
  addLog,
  loading,
  cooldown,
  setIsRealmOpen,
  executeAdventure,
  isInteractionPending,
  getCurrentPlayer,
}: UseRealmHandlersProps) {
  const entryInFlight = React.useRef(false);
  const handleEnterRealm = async (realm: SecretRealm) => {
    if (
      loading ||
      cooldown > 0 ||
      entryInFlight.current ||
      isInteractionPending?.()
    )
      return;
    const currentPlayer = getCurrentPlayer ? getCurrentPlayer() : player;
    if (!currentPlayer) return;

    if (
      REALM_ORDER.indexOf(currentPlayer.realm) <
      REALM_ORDER.indexOf(realm.minRealm)
    ) {
      addLog('当前学阶尚未达到该副本的要求。', 'danger');
      return;
    }

    if (currentPlayer.hp < currentPlayer.maxHp * 0.3) {
      addLog('你精力见底，此时冲副本简直是送人头！', 'danger');
      return;
    }

    if (currentPlayer.spiritStones < realm.cost) {
      addLog('囊中羞涩，学分不够开副本的。', 'danger');
      return;
    }

    entryInFlight.current = true;
    setIsRealmOpen(false);
    try {
      // The battle's first persisted state owns the fee. Nonbattle visits save it
      // before ordinary settlement, so neither path can charge twice or enter free.
      await executeAdventure(
        'secret_realm',
        realm.name,
        realm.riskLevel,
        realm.minRealm,
        realm.description,
        realm.drops,
        realm.cost
      );
    } finally {
      entryInFlight.current = false;
    }
  };

  return {
    handleEnterRealm,
  };
}
