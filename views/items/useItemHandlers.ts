import React from 'react';
import { PlayerStats, Item, Pet, ItemType } from '../../types';
import { PET_TEMPLATES } from '../../constants';
import { uid } from '../../utils/gameUtils';
import { neutralizeCampusText } from '../../utils/campusText';

interface UseItemHandlersProps {
  player: PlayerStats;
  setPlayer: React.Dispatch<React.SetStateAction<PlayerStats>>;
  addLog: (message: string, type?: string) => void;
  setItemActionLog?: (log: { text: string; type: string } | null) => void;
}

/**
 * 物品处理函数
 * 包含使用物品、丢弃物品
 * @param setPlayer 设置玩家数据
 * @param addLog 添加日志
 * @returns handleUseItem 使用物品
 * @returns handleDiscardItem 丢弃物品
 */
export function useItemHandlers({
  setPlayer,
  addLog,
  setItemActionLog,
}: UseItemHandlersProps) {
  const handleUseItem = (item: Item) => {
    setPlayer((prev) => {
      const newInv = prev.inventory
        .map((i) => {
          if (i.id === item.id) return { ...i, quantity: i.quantity - 1 };
          return i;
        })
        .filter((i) => i.quantity > 0);

      const effectLogs = [];
      const newStats = { ...prev };
      const newPets = [...prev.pets];

      // 处理室友签约道具孵化
      const isPetEgg =
        item.name.includes('蛋') ||
        item.name.toLowerCase().includes('egg') ||
        item.name.includes('室友蛋') ||
        item.name.includes('签约卡') ||
        (item.description &&
          (item.description.includes('孵化') ||
            item.description.includes('室友') ||
            item.description.includes('签约') ||
            item.description.includes('宠物')));

      if (isPetEgg) {
        const availablePets = PET_TEMPLATES.filter((t) => {
          if (item.rarity === '普通')
            return t.rarity === '普通' || t.rarity === '稀有';
          if (item.rarity === '稀有')
            return t.rarity === '稀有' || t.rarity === '传说';
          if (item.rarity === '传说')
            return t.rarity === '传说' || t.rarity === '绝版';
          if (item.rarity === '绝版') return t.rarity === '绝版';
          return true;
        });

        if (availablePets.length > 0) {
          const randomTemplate =
            availablePets[Math.floor(Math.random() * availablePets.length)];
          const newPet: Pet = {
            id: uid(),
            name: randomTemplate.name,
            species: randomTemplate.species,
            level: 1,
            exp: 0,
            maxExp: 100,
            rarity: randomTemplate.rarity,
            stats: { ...randomTemplate.baseStats },
            skills: [...randomTemplate.skills],
            evolutionStage: 0,
            affection: 50,
          };
          newPets.push(newPet);
          effectLogs.push(`✨ 摇到了一位室友【${newPet.name}】！`);
          addLog(
            `🎉 你成功使用了${item.name}，结识了室友【${newPet.name}】！`,
            'special'
          );
        } else {
          effectLogs.push('但似乎什么都没有发生...');
          addLog(`你尝试使用${item.name}，但似乎什么都没有发生...`, 'normal');
        }
      }

      // 处理临时效果
      if (item.effect?.hp) {
        newStats.hp = Math.min(newStats.maxHp, newStats.hp + item.effect.hp);
        effectLogs.push(`恢复了 ${item.effect.hp} 点精力。`);
      }
      if (item.effect?.exp) {
        newStats.exp += item.effect.exp;
        effectLogs.push(`增长了 ${item.effect.exp} 点绩点。`);
      }
      if (item.effect?.breakthroughBonus) {
        // 累加到玩家的临时 buff（多个咖啡效果叠加）
        const oldBuff = newStats.breakthroughBonus || 0;
        newStats.breakthroughBonus = Math.min(
          0.99,
          oldBuff + item.effect.breakthroughBonus
        );
        effectLogs.push(
          `☕ 下次突破成功率 +${Math.round(item.effect.breakthroughBonus * 100)}%（当前累计 +${Math.round(
            newStats.breakthroughBonus * 100
          )}%）`
        );
      }

      // 处理永久效果
      if (item.permanentEffect) {
        const permLogs = [];
        if (item.permanentEffect.attack) {
          newStats.attack += item.permanentEffect.attack;
          permLogs.push(`攻击力永久 +${item.permanentEffect.attack}`);
        }
        if (item.permanentEffect.defense) {
          newStats.defense += item.permanentEffect.defense;
          permLogs.push(`防御力永久 +${item.permanentEffect.defense}`);
        }
        if (item.permanentEffect.spirit) {
          newStats.spirit += item.permanentEffect.spirit;
          permLogs.push(`思维永久 +${item.permanentEffect.spirit}`);
        }
        if (item.permanentEffect.physique) {
          newStats.physique += item.permanentEffect.physique;
          permLogs.push(`体能永久 +${item.permanentEffect.physique}`);
        }
        if (item.permanentEffect.speed) {
          newStats.speed += item.permanentEffect.speed;
          permLogs.push(`手速永久 +${item.permanentEffect.speed}`);
        }
        if (item.permanentEffect.maxHp) {
          newStats.maxHp += item.permanentEffect.maxHp;
          newStats.hp += item.permanentEffect.maxHp;
          permLogs.push(`精力上限永久 +${item.permanentEffect.maxHp}`);
        }
        if (permLogs.length > 0) {
          effectLogs.push(`✨ ${permLogs.join('，')}`);
        }
      }

      // 处理配方使用
      if (item.type === ItemType.Recipe && item.recipeData) {
        const recipeName = item.recipeData.name;
        // 确保 unlockedRecipes 存在（兼容旧存档）
        if (!newStats.unlockedRecipes) {
          newStats.unlockedRecipes = [];
        }
        // 检查是否已经解锁
        if (newStats.unlockedRecipes.includes(recipeName)) {
          addLog(`你已经学会了【${recipeName}】的冲调方法。`, 'normal');
          // 即使已解锁，也要消耗配方物品
          return { ...newStats, inventory: newInv, pets: newPets };
        }
        // 解锁配方
        newStats.unlockedRecipes = [...newStats.unlockedRecipes, recipeName];
        effectLogs.push(`✨ 学会了【${recipeName}】的冲调方法！`);
        addLog(
          `你研读了【${item.name}】，学会了【${recipeName}】的冲调方法！现在可以在冲调面板中调制这种饮品了。`,
          'special'
        );
        // 配方使用后会被消耗（已在上面处理了数量减少）
      }

      // 对于非室友签约道具的物品，显示使用日志
      if (effectLogs.length > 0 && !isPetEgg && item.type !== ItemType.Recipe) {
        const logMessage = `你使用了 ${item.name}。 ${effectLogs.join(' ')}`;
        addLog(logMessage, 'gain');
        // 显示轻提示
        if (setItemActionLog) {
          setItemActionLog({ text: logMessage, type: 'gain' });
          setTimeout(() => setItemActionLog(null), 3000);
        }
      } else if (item.type === ItemType.Recipe && effectLogs.length > 0) {
        // 配方使用后的提示
        const logMessage = effectLogs[0];
        if (setItemActionLog) {
          setItemActionLog({ text: logMessage, type: 'special' });
          setTimeout(() => setItemActionLog(null), 3000);
        }
      }

      return { ...newStats, inventory: newInv, pets: newPets };
    });
  };

  // 批量使用：一次用 N 个（循环调用 handleUseItem）
  const handleUseItemBatch = (item: Item, count: number) => {
    let remaining = count;
    for (let i = 0; i < count; i++) {
      // 用当前最新 inventory 判断是否还有货
      // 简化：逐个触发 handleUseItem，每个会扣 1 个
      handleUseItem(item);
      remaining--;
      // 避免无限循环：如果物品用完会自然停止（下面 UI 会禁用）
      if (remaining <= 0) break;
    }
  };

  // 一键使用全部未装备消耗品
  const handleUseAllConsumables = () => {
    setPlayer((prev) => {
      if (!prev) return prev;

      // 找出所有可用的消耗品（非装备、非配方、非宠物蛋、有 quantity）
      const equippedIds = new Set(
        Object.values(prev.equippedItems).filter(Boolean) as string[]
      );
      const consumables = prev.inventory.filter(
        (i) =>
          !equippedIds.has(i.id) &&
          i.quantity > 0 &&
          i.type !== ItemType.Recipe &&
          !i.isEquippable
      );

      if (consumables.length === 0) {
        addLog('背包里没有可使用的消耗品了！', 'normal');
        return prev;
      }

      // 逐个使用（仅临时/永久效果，不处理宠物蛋/配方）
      const newStats = { ...prev };
      const newPets = [...prev.pets];
      const newInv = [...prev.inventory];
      let usedCount = 0;

      for (const item of consumables) {
        const itemInInv = newInv.find((i) => i.id === item.id);
        if (!itemInInv || itemInInv.quantity <= 0) continue;

        const useQty = itemInInv.quantity;
        // 扣数量
        itemInInv.quantity = 0;

        // 临时效果（叠加）
        if (item.effect?.hp) {
          newStats.hp = Math.min(newStats.maxHp, newStats.hp + item.effect.hp * useQty);
        }
        if (item.effect?.exp) {
          newStats.exp += item.effect.exp * useQty;
        }
        // 永久效果
        if (item.permanentEffect) {
          if (item.permanentEffect.attack) newStats.attack += item.permanentEffect.attack * useQty;
          if (item.permanentEffect.defense) newStats.defense += item.permanentEffect.defense * useQty;
          if (item.permanentEffect.spirit) newStats.spirit += item.permanentEffect.spirit * useQty;
          if (item.permanentEffect.physique) newStats.physique += item.permanentEffect.physique * useQty;
          if (item.permanentEffect.speed) newStats.speed += item.permanentEffect.speed * useQty;
          if (item.permanentEffect.maxHp) {
            newStats.maxHp += item.permanentEffect.maxHp * useQty;
            newStats.hp += item.permanentEffect.maxHp * useQty;
          }
        }
        usedCount += useQty;
      }

      const cleanedInv = newInv.filter((i) => i.quantity > 0);
      if (usedCount > 0) {
        addLog(`✨ 一键使用了 ${usedCount} 个消耗品！`, 'special');
        if (setItemActionLog) {
          setItemActionLog({ text: `一键使用了 ${usedCount} 个消耗品`, type: 'special' });
          setTimeout(() => setItemActionLog(null), 3000);
        }
      }
      return { ...newStats, inventory: cleanedInv, pets: newPets };
    });
  };

  const handleDiscardItem = (item: Item) => {
    if (window.confirm(`确定要丢弃 ${neutralizeCampusText(item.name)} x${item.quantity} 吗？`)) {
      setPlayer((prev) => {
        // 检查是否已装备
        const isEquipped = Object.values(prev.equippedItems).includes(item.id);
        if (isEquipped) {
          addLog('无法丢已装备的装备！请先卸下。', 'danger');
          return prev;
        }

        const newInv = prev.inventory.filter((i) => i.id !== item.id);
        addLog(`你丢弃了 ${item.name} x${item.quantity}。`, 'normal');
        return { ...prev, inventory: newInv };
      });
    }
  };

  return {
    handleUseItem,
    handleUseItemBatch,
    handleUseAllConsumables,
    handleDiscardItem,
  };
}
