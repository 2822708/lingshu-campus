import React from 'react';
import { PlayerStats, CultivationArt } from '../../types';
import { CULTIVATION_ARTS, REALM_ORDER } from '../../constants';

interface UseCultivationHandlersProps {
  player: PlayerStats;
  setPlayer: React.Dispatch<React.SetStateAction<PlayerStats>>;
  addLog: (message: string, type?: string) => void;
}

/**
 * 课程处理函数
 * 包含选课、激活课程
 * @param player 玩家数据
 * @param setPlayer 设置玩家数据
 * @param addLog 添加日志
 * @returns handleLearnArt 选课
 * @returns handleActivateArt 激活课程
 */

export function useCultivationHandlers({
  player,
  setPlayer,
  addLog,
}: UseCultivationHandlersProps) {
  const handleLearnArt = (art: CultivationArt) => {
    if (!player || player.spiritStones < art.cost) return;

    setPlayer((prev) => {
      const newStones = prev.spiritStones - art.cost;

      const newAttack = prev.attack + (art.effects.attack || 0);
      const newDefense = prev.defense + (art.effects.defense || 0);
      const newMaxHp = prev.maxHp + (art.effects.hp || 0);
      const newHp = prev.hp + (art.effects.hp || 0);

      const newArts = [...prev.cultivationArts, art.id];

      let newActiveId = prev.activeArtId;
      if (!newActiveId && art.type === 'mental') {
        newActiveId = art.id;
      }

      return {
        ...prev,
        spiritStones: newStones,
        attack: newAttack,
        defense: newDefense,
        maxHp: newMaxHp,
        hp: newHp,
        cultivationArts: newArts,
        activeArtId: newActiveId,
      };
    });

    addLog(`你成功选上了【${art.name}】！绩点效率大增。`, 'gain');
  };

  const handleActivateArt = (art: CultivationArt) => {
    if (art.type !== 'mental') return;
    setPlayer((prev) => ({ ...prev, activeArtId: art.id }));
    addLog(`你开始刷【${art.name}】这门课。`, 'normal');
  };

  // 一键学完所有可学且付得起的课程
  const handleLearnAllArts = () => {
    if (!player) return;
    const playerRealmIdx = REALM_ORDER.indexOf(player.realm);

    // 找出所有可学的课程（realm 满足 + 未学 + 学分够）
    const learnable = CULTIVATION_ARTS.filter(
      (art) =>
        !player.cultivationArts.includes(art.id) &&
        REALM_ORDER.indexOf(art.realmRequirement) <= playerRealmIdx
    );

    // 从最便宜的开始学，尽可能多学
    const sorted = [...learnable].sort((a, b) => a.cost - b.cost);
    let stones = player.spiritStones;
    const toLearn: CultivationArt[] = [];
    for (const art of sorted) {
      if (stones >= art.cost) {
        stones -= art.cost;
        toLearn.push(art);
      }
    }

    if (toLearn.length === 0) {
      addLog('没有可学的课程（学阶不够或学分不足）', 'normal');
      return;
    }

    setPlayer((prev) => {
      let newStones = prev.spiritStones;
      let newAttack = prev.attack;
      let newDefense = prev.defense;
      let newMaxHp = prev.maxHp;
      let newHp = prev.hp;
      const newArts = [...prev.cultivationArts];
      let newActiveId = prev.activeArtId;

      for (const art of toLearn) {
        if (newStones < art.cost) continue;
        newStones -= art.cost;
        newAttack += art.effects.attack || 0;
        newDefense += art.effects.defense || 0;
        newMaxHp += art.effects.hp || 0;
        newHp += art.effects.hp || 0;
        if (!newArts.includes(art.id)) newArts.push(art.id);
        if (!newActiveId && art.type === 'mental') newActiveId = art.id;
      }

      return {
        ...prev,
        spiritStones: newStones,
        attack: newAttack,
        defense: newDefense,
        maxHp: newMaxHp,
        hp: newHp,
        cultivationArts: newArts,
        activeArtId: newActiveId,
      };
    });

    addLog(
      `🎓 一键选课完成！共学习了 ${toLearn.length} 门课程`,
      'special'
    );
  };

  return {
    handleLearnArt,
    handleActivateArt,
    handleLearnAllArts,
  };
}
