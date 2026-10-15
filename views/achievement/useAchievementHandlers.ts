import React, { useCallback, useRef } from 'react';
import { PlayerStats, RealmType } from '../../types';
import { REALM_ORDER, ACHIEVEMENTS, TITLES } from '../../constants';
import { uid } from '../../utils/gameUtils';

interface UseAchievementHandlersProps {
  player: PlayerStats;
  setPlayer: React.Dispatch<React.SetStateAction<PlayerStats>>;
  addLog: (message: string, type?: string) => void;
}
/**
 * 成就处理函数
 * 包含检查成就、应用成就效果
 * @param player 玩家数据
 * @param setPlayer 设置玩家数据
 * @param addLog 添加日志
 * @returns checkAchievements 检查成就
 */
export function useAchievementHandlers({
  player,
  setPlayer,
  addLog,
}: UseAchievementHandlersProps) {
  // 使用 ref 来防止成就重复触发
  const checkingAchievementsRef = useRef(false);
  const hasPlayer = Boolean(player);

  const checkAchievements = useCallback(() => {
    if (!hasPlayer) return; // 防止 player 为 null
    if (checkingAchievementsRef.current) return; // 防止重复触发
    checkingAchievementsRef.current = true;

    setPlayer((prev) => {
      if (!prev) {
        checkingAchievementsRef.current = false;
        return prev; // 防止 prev 为 null
      }

      const newAchievements = [...prev.achievements];
      let hasNewAchievement = false;
      let newExp = prev.exp;
      let newStones = prev.spiritStones;
      const newInv = [...prev.inventory];
      let newTitleId = prev.titleId;

      ACHIEVEMENTS.forEach((achievement) => {
        // 跳过已完成的成就，避免重复触发
        if (newAchievements.includes(achievement.id)) return;

        let completed = false;
        if (achievement.requirement.type === 'realm') {
          const realmIndex = REALM_ORDER.indexOf(
            achievement.requirement.target as RealmType
          );
          const playerRealmIndex = REALM_ORDER.indexOf(prev.realm);
          completed = playerRealmIndex >= realmIndex;
        } else if (
          achievement.requirement.type === 'custom' &&
          achievement.requirement.target === 'meditate'
        ) {
          // 这个需要在自习时单独检查
          return;
        }

        if (completed) {
          hasNewAchievement = true;
          newAchievements.push(achievement.id);
          newExp += achievement.reward.exp || 0;
          newStones += achievement.reward.spiritStones || 0;

          if (achievement.reward.items) {
            achievement.reward.items.forEach((item) => {
              const existingIdx = newInv.findIndex((i) => i.name === item.name);
              if (existingIdx >= 0) {
                newInv[existingIdx] = {
                  ...newInv[existingIdx],
                  quantity: newInv[existingIdx].quantity + 1,
                };
              } else {
                newInv.push({ ...item, id: uid() });
              }
            });
          }

          if (achievement.reward.titleId) {
            newTitleId = achievement.reward.titleId;
          }

          addLog(`🎉 达成成就：【${achievement.name}】！`, 'special');
        }
      });

      if (hasNewAchievement && newTitleId && newTitleId !== prev.titleId) {
        // 应用新称号效果
        const title = TITLES.find((t) => t.id === newTitleId);
        if (title) {
          const oldTitle = prev.titleId
            ? TITLES.find((t) => t.id === prev.titleId)
            : null;
          const titleAttack =
            prev.attack -
            (oldTitle?.effects.attack || 0) +
            (title.effects.attack || 0);
          const titleDefense =
            prev.defense -
            (oldTitle?.effects.defense || 0) +
            (title.effects.defense || 0);
          const titleMaxHp =
            prev.maxHp - (oldTitle?.effects.hp || 0) + (title.effects.hp || 0);
          const titleHp =
            prev.hp - (oldTitle?.effects.hp || 0) + (title.effects.hp || 0);

          checkingAchievementsRef.current = false;
          return {
            ...prev,
            achievements: newAchievements,
            exp: newExp,
            spiritStones: newStones,
            inventory: newInv,
            titleId: newTitleId,
            attack: titleAttack,
            defense: titleDefense,
            maxHp: titleMaxHp,
            hp: Math.min(titleHp, titleMaxHp),
          };
        }
      }

      if (hasNewAchievement) {
        checkingAchievementsRef.current = false;
        return {
          ...prev,
          achievements: newAchievements,
          exp: newExp,
          spiritStones: newStones,
          inventory: newInv,
          titleId: newTitleId || prev.titleId,
        };
      }

      checkingAchievementsRef.current = false;
      return prev;
    });
  }, [hasPlayer, setPlayer, addLog]);

  return {
    checkAchievements,
  };
}
