import React from 'react';
import { PlayerStats, RealmType } from '../../types';
import { REALM_DATA, CULTIVATION_ARTS, TALENTS, TITLES } from '../../constants';
import { getItemStats } from '../../utils/itemUtils';
import { generateBreakthroughFlavorText } from '../../services/aiService';

interface UseBreakthroughHandlersProps {
  player: PlayerStats;
  setPlayer: React.Dispatch<React.SetStateAction<PlayerStats>>;
  addLog: (message: string, type?: string) => void;
  setLoading: (loading: boolean) => void;
  loading: boolean;
}

/**
 * 突破处理函数
 * 包含突破、使用传承
 * @param player 玩家数据
 * @param setPlayer 设置玩家数据
 * @param addLog 添加日志
 * @param setLoading 设置加载状态
 * @param loading 加载状态
 * @returns handleBreakthrough 突破
 * @returns handleUseInheritance 使用传承
 */
export function useBreakthroughHandlers({
  player,
  setPlayer,
  addLog,
  setLoading,
  loading,
}: UseBreakthroughHandlersProps) {
  const handleBreakthrough = async () => {
    if (loading || !player) return;

    const isRealmUpgrade = player.realmLevel >= 9;
    // 基础成功率（普通层 90% / 学阶突破 60%），叠加咖啡临时 buff（封顶 99%）
    const baseChance = isRealmUpgrade ? 0.6 : 0.9;
    const buff = player.breakthroughBonus || 0;
    const successChance = Math.min(0.99, baseChance + buff);
    const roll = Math.random();

    // 有 buff 时在日志里提示玩家
    if (buff > 0) {
      addLog(
        `☕ 你感受到咖啡的力量在体内流动（突破成功率 +${Math.round(
          buff * 100
        )}%）`,
        'special'
      );
    }

    if (roll < successChance) {
      setLoading(true);
      const nextLevel = isRealmUpgrade ? 1 : player.realmLevel + 1;

      let nextRealm = player.realm;
      if (isRealmUpgrade) {
        const realms = Object.values(RealmType);
        const currentIndex = realms.indexOf(player.realm);
        if (currentIndex < realms.length - 1) {
          nextRealm = realms[currentIndex + 1];
        }
      }

      const flavor = await generateBreakthroughFlavorText(
        isRealmUpgrade ? nextRealm : `第 ${nextLevel} 层`,
        true
      );
      addLog(flavor, 'special');
      addLog(
        isRealmUpgrade
          ? `恭喜！你的学阶提升到了 ${nextRealm} ！`
          : `恭喜！你升级到了 Lv.${nextLevel} ！`,
        'special'
      );

      setPlayer((prev) => {
        const stats = REALM_DATA[nextRealm];
        const levelMultiplier = 1 + nextLevel * 0.1;

        // Calculate all bonuses
        let bonusAttack = 0;
        let bonusDefense = 0;
        let bonusHp = 0;
        let bonusSpirit = 0;
        let bonusPhysique = 0;
        let bonusSpeed = 0;

        // Art bonuses
        prev.cultivationArts.forEach((artId) => {
          const art = CULTIVATION_ARTS.find((a) => a.id === artId);
          if (art) {
            bonusAttack += art.effects.attack || 0;
            bonusDefense += art.effects.defense || 0;
            bonusHp += art.effects.hp || 0;
            bonusSpirit += art.effects.spirit || 0;
            bonusPhysique += art.effects.physique || 0;
            bonusSpeed += art.effects.speed || 0;
          }
        });

        // Equipment bonuses
        Object.values(prev.equippedItems).forEach((itemId) => {
          const equippedItem = prev.inventory.find((i) => i.id === itemId);
          if (equippedItem && equippedItem.effect) {
            const isNatal = equippedItem.id === prev.natalArtifactId;
            const itemStats = getItemStats(equippedItem, isNatal);
            bonusAttack += itemStats.attack;
            bonusDefense += itemStats.defense;
            bonusHp += itemStats.hp;
            bonusSpirit += itemStats.spirit;
            bonusPhysique += itemStats.physique;
            bonusSpeed += itemStats.speed;
          }
        });

        // Talent bonuses
        const talent = TALENTS.find((t) => t.id === prev.talentId);
        if (talent) {
          bonusAttack += talent.effects.attack || 0;
          bonusDefense += talent.effects.defense || 0;
          bonusHp += talent.effects.hp || 0;
          bonusSpirit += talent.effects.spirit || 0;
          bonusPhysique += talent.effects.physique || 0;
          bonusSpeed += talent.effects.speed || 0;
        }

        // Title bonuses
        const title = TITLES.find((t) => t.id === prev.titleId);
        if (title) {
          bonusAttack += title.effects.attack || 0;
          bonusDefense += title.effects.defense || 0;
          bonusHp += title.effects.hp || 0;
          bonusSpirit += title.effects.spirit || 0;
          bonusPhysique += title.effects.physique || 0;
          bonusSpeed += title.effects.speed || 0;
        }

        const newBaseMaxHp = Math.floor(stats.baseMaxHp * levelMultiplier);
        const newMaxExp = Math.floor(stats.maxExpBase * levelMultiplier * 1.5);

        // 计算超出当前境界的经验值，保留到下一个境界
        const excessExp = Math.max(0, prev.exp - prev.maxExp);
        const newExp = excessExp;

        return {
          ...prev,
          realm: nextRealm,
          realmLevel: nextLevel,
          exp: newExp, // 保留超出部分
          maxExp: newMaxExp,
          maxHp: newBaseMaxHp + bonusHp,
          hp: newBaseMaxHp + bonusHp, // Full heal
          attack: Math.floor(stats.baseAttack * levelMultiplier) + bonusAttack,
          defense:
            Math.floor(stats.baseDefense * levelMultiplier) + bonusDefense,
          spirit: Math.floor(stats.baseSpirit * levelMultiplier) + bonusSpirit,
          physique:
            Math.floor(stats.basePhysique * levelMultiplier) + bonusPhysique,
          speed: Math.max(
            0,
            Math.floor(stats.baseSpeed * levelMultiplier) + bonusSpeed
          ),
          breakthroughBonus: 0, // 突破后清除咖啡临时 buff
        };
      });
      setLoading(false);
    } else {
      addLog('你尝试冲刺期末，奈何没复习，惨遭挂科！', 'danger');
      setPlayer((prev) => ({
        ...prev,
        exp: Math.floor(prev.exp * 0.7),
        hp: Math.floor(prev.hp * 0.5),
      }));
    }
  };

  const handleUseInheritance = () => {
    if (!player || player.inheritanceLevel <= 0) {
      addLog('你手里没有保研名额可用！', 'danger');
      return;
    }

    setPlayer((prev) => {
      let remainingInheritance = prev.inheritanceLevel;
      let currentRealm = prev.realm;
      let currentLevel = prev.realmLevel;
      let breakthroughCount = 0;

      const maxBreakthroughs = Math.min(remainingInheritance, 4);

      for (let i = 0; i < maxBreakthroughs; i++) {
        const isRealmUpgrade = currentLevel >= 9;

        if (isRealmUpgrade) {
          const realms = Object.values(RealmType);
          const currentIndex = realms.indexOf(currentRealm);
          if (currentIndex < realms.length - 1) {
            currentRealm = realms[currentIndex + 1];
            currentLevel = 1;
            breakthroughCount++;
            remainingInheritance--;
          } else {
            break;
          }
        } else {
          currentLevel++;
          breakthroughCount++;
          remainingInheritance--;
        }
      }

      if (breakthroughCount > 0) {
        const stats = REALM_DATA[currentRealm];
        const levelMultiplier = 1 + currentLevel * 0.1;

        // Calculate all bonuses (similar to handleBreakthrough)
        let bonusAttack = 0;
        let bonusDefense = 0;
        let bonusHp = 0;
        let bonusSpirit = 0;
        let bonusPhysique = 0;
        let bonusSpeed = 0;

        prev.cultivationArts.forEach((artId) => {
          const art = CULTIVATION_ARTS.find((a) => a.id === artId);
          if (art) {
            bonusAttack += art.effects.attack || 0;
            bonusDefense += art.effects.defense || 0;
            bonusHp += art.effects.hp || 0;
            bonusSpirit += art.effects.spirit || 0;
            bonusPhysique += art.effects.physique || 0;
            bonusSpeed += art.effects.speed || 0;
          }
        });

        Object.values(prev.equippedItems).forEach((itemId) => {
          const equippedItem = prev.inventory.find((i) => i.id === itemId);
          if (equippedItem && equippedItem.effect) {
            const isNatal = equippedItem.id === prev.natalArtifactId;
            const itemStats = getItemStats(equippedItem, isNatal);
            bonusAttack += itemStats.attack;
            bonusDefense += itemStats.defense;
            bonusHp += itemStats.hp;
            bonusSpirit += itemStats.spirit;
            bonusPhysique += itemStats.physique;
            bonusSpeed += itemStats.speed;
          }
        });

        const talent = TALENTS.find((t) => t.id === prev.talentId);
        if (talent) {
          bonusAttack += talent.effects.attack || 0;
          bonusDefense += talent.effects.defense || 0;
          bonusHp += talent.effects.hp || 0;
          bonusSpirit += talent.effects.spirit || 0;
          bonusPhysique += talent.effects.physique || 0;
          bonusSpeed += talent.effects.speed || 0;
        }

        const title = TITLES.find((t) => t.id === prev.titleId);
        if (title) {
          bonusAttack += title.effects.attack || 0;
          bonusDefense += title.effects.defense || 0;
          bonusHp += title.effects.hp || 0;
          bonusSpirit += title.effects.spirit || 0;
          bonusPhysique += title.effects.physique || 0;
          bonusSpeed += title.effects.speed || 0;
        }

        const newBaseMaxHp = Math.floor(stats.baseMaxHp * levelMultiplier);
        const newMaxExp = Math.floor(stats.maxExpBase * levelMultiplier * 1.5);

        // 计算超出当前境界的经验值，保留到下一个境界
        const excessExp = Math.max(0, prev.exp - prev.maxExp);
        const newExp = excessExp;

        addLog(
          `🌟 你祭出学霸传承，一路通关 ${breakthroughCount} 个学阶！`,
          'special'
        );

        return {
          ...prev,
          realm: currentRealm,
          realmLevel: currentLevel,
          exp: newExp, // 保留超出部分
          maxExp: newMaxExp,
          maxHp: newBaseMaxHp + bonusHp,
          hp: newBaseMaxHp + bonusHp,
          attack: Math.floor(stats.baseAttack * levelMultiplier) + bonusAttack,
          defense:
            Math.floor(stats.baseDefense * levelMultiplier) + bonusDefense,
          spirit: Math.floor(stats.baseSpirit * levelMultiplier) + bonusSpirit,
          physique:
            Math.floor(stats.basePhysique * levelMultiplier) + bonusPhysique,
          speed: Math.max(
            0,
            Math.floor(stats.baseSpeed * levelMultiplier) + bonusSpeed
          ),
          inheritanceLevel: remainingInheritance,
        };
      }

      return prev;
    });
  };

  return {
    handleBreakthrough,
    handleUseInheritance,
  };
}
