import React from 'react';
import { PlayerStats } from '../../types';
import {
  CULTIVATION_ARTS,
  TALENTS,
  ACHIEVEMENTS,
  REALM_ORDER,
} from '../../constants';

interface UseMeditationHandlersProps {
  player: PlayerStats;
  setPlayer: React.Dispatch<React.SetStateAction<PlayerStats>>;
  addLog: (message: string, type?: string) => void;
  checkLevelUp: (addedExp: number) => void;
}

/**
 * 自习处理函数
 * 包含自习
 * @param player 玩家数据
 * @param setPlayer 设置玩家数据
 * @param addLog 添加日志
 * @param checkLevelUp 检查升级
 * @returns handleMeditate 自习
 */

export function useMeditationHandlers({
  player,
  setPlayer,
  addLog,
  checkLevelUp,
}: UseMeditationHandlersProps) {
  const handleMeditate = () => {
    if (!player) return;

    // 根据学阶计算基础绩点
    // 基础绩点 = 学阶基础值 * (1 + 学阶层数 * 0.15)
    const realmIndex = REALM_ORDER.indexOf(player.realm);

    // 不同学阶的基础绩点倍数（基于学阶等级）
    const realmBaseMultipliers = [1, 2, 5, 10, 25, 50, 100];
    const realmBaseMultiplier = realmBaseMultipliers[realmIndex] || 1;

    // 基础绩点 = 学阶基础倍数 * (1 + 学阶层数 * 0.15)
    let baseGain = Math.floor(
      realmBaseMultiplier * 10 * (1 + player.realmLevel * 0.15)
    );

    // Apply Active Art Bonus
    const activeArt = CULTIVATION_ARTS.find((a) => a.id === player.activeArtId);
    if (activeArt && activeArt.effects.expRate) {
      baseGain = Math.floor(baseGain * (1 + activeArt.effects.expRate));
    }

    // Apply Talent Bonus
    const talent = TALENTS.find((t) => t.id === player.talentId);
    if (talent && talent.effects.expRate) {
      baseGain = Math.floor(baseGain * (1 + talent.effects.expRate));
    }

    // 检查是否触发顿悟（0.1%概率）
    const isEnlightenment = Math.random() < 0.001;
    let actualGain: number;
    let logMessage: string;

    if (isEnlightenment) {
      // 顿悟：获得30-50倍绩点
      const enlightenmentMultiplier = 30 + Math.random() * 20; // 3-5倍
      actualGain = Math.floor(baseGain * enlightenmentMultiplier);
      const artText = activeArt ? `，开${activeArt.name}的课` : '';
      logMessage = `✨ 你在自习室突然开窍，灵台清明，对所学有了更深的理解${artText}！(+${actualGain} 绩点)`;
      addLog(logMessage, 'special');
    } else {
      // 正常自习：小幅随机波动
      actualGain = Math.floor(baseGain * (0.85 + Math.random() * 0.3)); // 85%-115%
      const artText = activeArt ? `，开${activeArt.name}的课` : '';
      logMessage = `你在图书馆潜心刷题${artText}。(+${actualGain} 绩点)`;
      addLog(logMessage);
    }

    setPlayer((prev) => {
      const now = Date.now();
      // 自习时提高回精力速度：基础2倍，根据学阶和层数可以增加
      // 基础倍数 = 2.0 + 学阶层数 * 0.1（最高3.5倍）
      const realmIndex = REALM_ORDER.indexOf(prev.realm);
      const baseMultiplier = 2.0 + Math.min(prev.realmLevel * 0.1, 1.5); // 2.0 - 3.5倍
      // 持续时间：基础30秒，根据学阶增加（最高60秒）
      const duration = 30000 + Math.min(realmIndex * 5000, 30000); // 30-60秒
      const durationSeconds = Math.floor(duration / 1000);

      // 添加回精力速度提升提示
      const multiplierText = baseMultiplier.toFixed(1);
      addLog(
        `💚 自习提升了你的回精力速度（${multiplierText}倍），持续 ${durationSeconds} 秒`,
        'gain'
      );

      return {
        ...prev,
        exp: prev.exp + actualGain,
        meditationHpRegenMultiplier: baseMultiplier,
        meditationBoostEndTime: now + duration,
      };
    });
    checkLevelUp(actualGain);

    // 检查首次自习成就
    if (!player.achievements.includes('ach-first-step')) {
      const firstMeditateAchievement = ACHIEVEMENTS.find(
        (a) => a.id === 'ach-first-step'
      );
      if (firstMeditateAchievement) {
        setPlayer((prev) => {
          const newAchievements = [...prev.achievements, 'ach-first-step'];
          addLog(
            `🎉 达成成就：【${firstMeditateAchievement.name}】！`,
            'special'
          );
          return {
            ...prev,
            achievements: newAchievements,
            exp: prev.exp + (firstMeditateAchievement.reward.exp || 0),
            spiritStones:
              prev.spiritStones +
              (firstMeditateAchievement.reward.spiritStones || 0),
          };
        });
      }
    }
  };

  return {
    handleMeditate,
  };
}
