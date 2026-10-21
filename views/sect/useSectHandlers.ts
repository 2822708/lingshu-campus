import React from 'react';
import {
  PlayerStats,
  Item,
  ItemType,
  ItemRarity,
  RealmType,
  SectRank,
} from '../../types';
import { SECTS, SECT_RANK_REQUIREMENTS } from '../../constants';
import { RandomSectTask } from '../../services/randomService';
import { uid } from '../../utils/gameUtils';
import type { AdventureBattleRequest } from '../../features/interactive/adventureBattle';

interface UseSectHandlersProps {
  player: PlayerStats;
  setPlayer: React.Dispatch<React.SetStateAction<PlayerStats>>;
  addLog: (message: string, type?: string) => void;
  setIsSectOpen: (open: boolean) => void;
  setPurchaseSuccess: (
    success: { item: string; quantity: number } | null
  ) => void;
  onStartBattle: (request: AdventureBattleRequest) => boolean;
  getCurrentPlayer?: () => PlayerStats | null;
  isInteractionPending?: () => boolean;
}

/**
 * 社团处理函数
 * 包含加入社团、离开社团、完成社团任务、晋升社团、购买社团物品
 * @param player 玩家数据
 * @param setPlayer 设置玩家数据
 * @param addLog 添加日志
 * @param setIsSectOpen 设置社团是否打开
 * @param setPurchaseSuccess 设置购买成功
 * @returns handleJoinSect 加入社团
 * @returns handleLeaveSect 离开社团
 * @returns handleSectTask 完成社团任务
 * @returns handleSectPromote 晋升社团
 * @returns handleSectBuy 购买社团物品
 */

export function useSectHandlers({
  player,
  setPlayer,
  addLog,
  setIsSectOpen,
  setPurchaseSuccess,
  onStartBattle,
  getCurrentPlayer,
  isInteractionPending,
}: UseSectHandlersProps) {
  const handleJoinSect = (sectId: string, sectName?: string) => {
    // 先尝试从 SECTS 中查找
    let sect = SECTS.find((s) => s.id === sectId);

    // 如果找不到，说明是随机生成的社团，使用传入的名称或创建一个临时社团对象
    if (!sect) {
      if (sectName) {
        // 使用传入的名称创建临时社团对象
        sect = {
          id: sectId,
          name: sectName,
          description: '',
          reqRealm: RealmType.QiRefining,
        };
      } else {
        // 如果连名称都没有，尝试从 availableSects 中查找（但这需要从 SectModal 传递）
        console.warn('无法找到社团信息:', sectId);
        return;
      }
    }

    setPlayer((prev) => ({
      ...prev,
      sectId: sectId,
      sectRank: SectRank.Outer,
      sectContribution: 0,
    }));
    addLog(`恭喜！你已加入【${sect.name}】，成为一名新成员。`, 'special');
  };

  const handleLeaveSect = () => {
    setPlayer((prev) => ({
      ...prev,
      sectId: null,
      sectRank: SectRank.Outer,
      sectContribution: 0,
    }));
    addLog(`你退出了社团，从此成为一名自由人。`, 'danger');
    setIsSectOpen(false);
  };

  const handleSectTask = (task: RandomSectTask) => {
    if (isInteractionPending?.()) return;
    if (task.type === 'hunt') {
      const currentPlayer = getCurrentPlayer ? getCurrentPlayer() : player;
      if (!currentPlayer?.sectId) {
        addLog('请先加入社团，再接受社团挑战。', 'danger');
        return;
      }
      // Costs and the daily attempt are reserved with the initial battle save;
      // the ordinary instant-task setter must never award a challenge up front.
      onStartBattle({
        adventureType: 'normal',
        realmName: task.name,
        realmDescription: task.description,
        entryCost: task.cost?.spiritStones ?? 0,
        sectTask: {
          sectId: currentPlayer.sectId,
          task,
          day: new Date().toISOString().split('T')[0],
        },
      });
      return;
    }
    setPlayer((prev) => {
      // 检查每日任务限制
      const today = new Date().toISOString().split('T')[0];
      let dailyTaskCount = prev.dailyTaskCount || {
        instant: 0,
        short: 0,
        medium: 0,
        long: 0,
      };
      let lastTaskResetDate = prev.lastTaskResetDate || today;

      // 如果日期变化，重置计数
      if (lastTaskResetDate !== today) {
        dailyTaskCount = { instant: 0, short: 0, medium: 0, long: 0 };
        lastTaskResetDate = today;
      }

      // 任务类型限制配置（每日上限，已从原版翻倍：20 → 38）
      const taskLimits: Record<string, { limit: number; name: string }> = {
        instant: { limit: 20, name: '瞬时' },
        short: { limit: 10, name: '短暂' },
        medium: { limit: 5, name: '中等' },
        long: { limit: 3, name: '较长' },
      };

      // 检查当前任务类型的每日限制
      const taskType = task.timeCost;
      const limitConfig = taskLimits[taskType];
      if (limitConfig) {
        const currentCount =
          dailyTaskCount[taskType as keyof typeof dailyTaskCount] || 0;
        if (currentCount >= limitConfig.limit) {
          addLog(
            `今日已完成${limitConfig.limit}次${limitConfig.name}任务，请明日再来。`,
            'danger'
          );
          return prev;
        }
        // 增加计数
        dailyTaskCount = {
          ...dailyTaskCount,
          [taskType]: currentCount + 1,
        };
      }

      // 检查消耗
      let stoneCost = 0;
      let updatedInventory = [...prev.inventory];

      if (task.cost?.spiritStones) {
        if (prev.spiritStones < task.cost.spiritStones) {
          addLog(`学分不够，需要 ${task.cost.spiritStones} 学分。`, 'danger');
          return prev;
        }
        stoneCost = task.cost.spiritStones;
      }

      if (task.cost?.items) {
        for (const itemReq of task.cost.items) {
          const itemIdx = updatedInventory.findIndex(
            (i) => i.name === itemReq.name
          );
          if (
            itemIdx === -1 ||
            updatedInventory[itemIdx].quantity < itemReq.quantity
          ) {
            addLog(
              `物品不足，需要 ${itemReq.quantity} 个【${itemReq.name}】。`,
              'danger'
            );
            return prev;
          }
          updatedInventory[itemIdx] = {
            ...updatedInventory[itemIdx],
            quantity: updatedInventory[itemIdx].quantity - itemReq.quantity,
          };
        }
        updatedInventory = updatedInventory.filter((i) => i.quantity > 0);
      }

      // 计算奖励
      const contribGain = task.reward.contribution || 0;
      const expGain = task.reward.exp || 0;
      const stoneGain = task.reward.spiritStones || 0;

      // 添加奖励物品
      if (task.reward.items) {
        task.reward.items.forEach((rewardItem) => {
          const existingIdx = updatedInventory.findIndex(
            (i) => i.name === rewardItem.name
          );
          if (existingIdx >= 0) {
            updatedInventory[existingIdx] = {
              ...updatedInventory[existingIdx],
              quantity:
                updatedInventory[existingIdx].quantity +
                (rewardItem.quantity || 1),
            };
          } else {
            // 创建新物品（简化版，只包含基本信息）
            updatedInventory.push({
              id: uid(),
              name: rewardItem.name,
              type: ItemType.Material,
              description: `完成任务获得的${rewardItem.name}`,
              quantity: rewardItem.quantity || 1,
              rarity: '普通',
            });
          }
        });
      }

      // 生成任务完成日志
      const rewardText = [
        `${contribGain} 贡献`,
        expGain > 0 ? `${expGain} 绩点` : '',
        stoneGain > 0 ? `${stoneGain} 学分` : '',
        task.reward.items
          ? task.reward.items.map((i) => `${i.quantity} ${i.name}`).join('、')
          : '',
      ]
        .filter(Boolean)
        .join('、');

      addLog(
        `你完成了社团任务【${task.name}】，获得了 ${rewardText}。`,
        'gain'
      );

      return {
        ...prev,
        spiritStones: prev.spiritStones - stoneCost + stoneGain,
        exp: prev.exp + expGain,
        inventory: updatedInventory,
        sectContribution: prev.sectContribution + contribGain,
        dailyTaskCount,
        lastTaskResetDate,
      };
    });
  };

  const handleSectPromote = () => {
    setPlayer((prev) => {
      const ranks = Object.values(SectRank);
      const currentRankIdx = ranks.indexOf(prev.sectRank);
      const nextRank = ranks[currentRankIdx + 1];

      if (!nextRank) return prev;

      const req = SECT_RANK_REQUIREMENTS[nextRank];
      if (prev.sectContribution < req.contribution) return prev;

      addLog(`恭喜！你晋升为【${nextRank}】，社团地位 up。`, 'special');

      return {
        ...prev,
        sectRank: nextRank,
        sectContribution: prev.sectContribution - req.contribution,
      };
    });
  };

  const handleSectBuy = (
    itemTemplate: Partial<Item>,
    cost: number,
    quantity: number = 1
  ) => {
    setPlayer((prev) => {
      const totalCost = cost * quantity;
      if (prev.sectContribution < totalCost) {
        addLog('社团贡献不够！', 'danger');
        return prev;
      }

      const newInv = [...prev.inventory];
      const isEquipment =
        itemTemplate.isEquippable && itemTemplate.equipmentSlot;
      const existingIdx = newInv.findIndex((i) => i.name === itemTemplate.name);

      if (existingIdx >= 0 && !isEquipment) {
        // 非装备类物品可以叠加
        newInv[existingIdx] = {
          ...newInv[existingIdx],
          quantity: newInv[existingIdx].quantity + quantity,
        };
      } else {
        // 装备类物品或新物品，每个装备单独占一格
        // 如果是装备，每次兑换创建一个新物品（quantity=1）
        const itemsToAdd = isEquipment ? quantity : 1; // 装备每次兑换都创建新物品
        const addQuantity = isEquipment ? 1 : quantity; // 装备quantity始终为1

        for (let i = 0; i < itemsToAdd; i++) {
          newInv.push({
            id: uid(),
            name: itemTemplate.name || '未知物品',
            type: itemTemplate.type || ItemType.Material,
            description: itemTemplate.description || '',
            quantity: addQuantity,
            rarity: (itemTemplate.rarity as ItemRarity) || '普通',
            effect: itemTemplate.effect,
            level: 0,
            isEquippable: itemTemplate.isEquippable,
            equipmentSlot: itemTemplate.equipmentSlot,
          });
        }
      }

      addLog(
        `你消耗了 ${totalCost} 社团贡献，兑换了 ${itemTemplate.name} x${quantity}。`,
        'gain'
      );
      // 显示购买成功弹窗
      setPurchaseSuccess({ item: itemTemplate.name || '未知物品', quantity });
      setTimeout(() => setPurchaseSuccess(null), 2000);

      return {
        ...prev,
        sectContribution: prev.sectContribution - totalCost,
        inventory: newInv,
      };
    });
  };

  return {
    handleJoinSect,
    handleLeaveSect,
    handleSectTask,
    handleSectPromote,
    handleSectBuy,
  };
}
