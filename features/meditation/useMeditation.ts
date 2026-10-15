import React, { useCallback } from 'react';
import { PlayerStats } from '../../types';
import { CULTIVATION_ARTS, TALENTS, ACHIEVEMENTS } from '../../constants';

interface UseMeditationParams {
  player: PlayerStats | null;
  setPlayer: React.Dispatch<React.SetStateAction<PlayerStats | null>>;
  addLog: (message: string, type?: string) => void;
  setCooldown: React.Dispatch<React.SetStateAction<number>>;
  loading: boolean;
  cooldown: number;
}

export function useMeditation({
  player,
  setPlayer,
  addLog,
  setCooldown,
  loading,
  cooldown,
}: UseMeditationParams) {
  const handleMeditate = useCallback(() => {
    if (loading || cooldown > 0 || !player) return;

    let baseGain = 10 + player.realmLevel * 5;

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

    // Slight randomness
    const actualGain = Math.floor(baseGain * (0.8 + Math.random() * 0.4));

    setPlayer((prev) => {
      if (!prev) return prev;
      return { ...prev, exp: prev.exp + actualGain };
    });

    const artText = activeArt ? `，开${activeArt.name}的课` : '';
    addLog(`你在图书馆潜心刷题${artText}。(+${actualGain} 绩点)`);
    setCooldown(1);

    // 检查首次自习成就
    if (!player.achievements.includes('ach-first-step')) {
      const firstMeditateAchievement = ACHIEVEMENTS.find(
        (a) => a.id === 'ach-first-step'
      );
      if (firstMeditateAchievement) {
        setPlayer((prev) => {
          if (!prev) return prev;
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
  }, [player, loading, cooldown, setPlayer, addLog, setCooldown]);

  return { handleMeditate };
}
