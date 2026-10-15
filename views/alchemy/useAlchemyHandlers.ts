import React from 'react';
import {
  PlayerStats,
  Recipe,
  Item,
  ItemType,
  EquipmentSlot,
  ItemRarity,
} from '../../types';
import { uid } from '../../utils/gameUtils';

interface UseAlchemyHandlersProps {
  player: PlayerStats;
  setPlayer: React.Dispatch<React.SetStateAction<PlayerStats>>;
  addLog: (message: string, type?: string) => void;
}

/**
 * 冲调处理函数
 * 包含冲调
 * @param player 玩家数据
 * @param setPlayer 设置玩家数据
 * @param addLog 添加日志
 * @returns handleCraft 冲调
 */
export function useAlchemyHandlers({
  setPlayer,
  addLog,
}: UseAlchemyHandlersProps) {
  // 计算最多能冲调几杯（按材料 + 学分双限制）
  const maxCraftable = (recipe: Recipe, inv: Item[], stones: number): number => {
    let maxByStones = stones >= recipe.cost ? Math.floor(stones / recipe.cost) : 0;
    for (const req of recipe.ingredients) {
      const item = inv.find((i) => i.name === req.name);
      const owned = item ? item.quantity : 0;
      const canMake = Math.floor(owned / req.qty);
      if (canMake < maxByStones) maxByStones = canMake;
    }
    return maxByStones;
  };

  const handleCraft = (recipe: Recipe, count: number = 1) => {
    setPlayer((prev) => {
      if (count <= 0) return prev;
      const max = maxCraftable(recipe, prev.inventory, prev.spiritStones);
      const n = Math.min(count, max);
      if (n <= 0) return prev;

      const newInventory = [...prev.inventory];
      // 批量扣除材料
      for (const req of recipe.ingredients) {
        const itemIdx = newInventory.findIndex((i) => i.name === req.name);
        if (itemIdx === -1) return prev;
        newInventory[itemIdx] = {
          ...newInventory[itemIdx],
          quantity: newInventory[itemIdx].quantity - req.qty * n,
        };
      }

      const cleanedInventory = newInventory.filter((i) => i.quantity > 0);

      const isEquipment =
        recipe.result.type === ItemType.Artifact ||
        recipe.result.type === ItemType.Weapon ||
        recipe.result.type === ItemType.Armor ||
        recipe.result.type === ItemType.Ring ||
        recipe.result.type === ItemType.Accessory;
      const existingResultIdx = cleanedInventory.findIndex(
        (i) => i.name === recipe.result.name
      );

      if (existingResultIdx >= 0 && !isEquipment) {
        // 非装备类物品可以叠加
        cleanedInventory[existingResultIdx] = {
          ...cleanedInventory[existingResultIdx],
          quantity: cleanedInventory[existingResultIdx].quantity + n,
        };
      } else {
        // 装备类物品或新物品，创建新物品
        const newItem: Item = {
          id: uid(),
          name: recipe.result.name || 'Unknown',
          type: recipe.result.type || ItemType.Pill,
          description: recipe.result.description || '',
          quantity: n,
          rarity: (recipe.result.rarity as ItemRarity) || '普通',
          level: 0,
          effect: recipe.result.effect,
        };

        // 如果是装备，添加装备相关属性
        if (isEquipment) {
          newItem.isEquippable = true;
          if ('equipmentSlot' in recipe.result && recipe.result.equipmentSlot) {
            newItem.equipmentSlot = recipe.result
              .equipmentSlot as EquipmentSlot;
          } else {
            // 根据类型推断装备槽位
            if (recipe.result.type === ItemType.Artifact) {
              const artifactSlots = [
                EquipmentSlot.Artifact1,
                EquipmentSlot.Artifact2,
              ];
              newItem.equipmentSlot =
                artifactSlots[Math.floor(Math.random() * artifactSlots.length)];
            } else if (recipe.result.type === ItemType.Weapon) {
              newItem.equipmentSlot = EquipmentSlot.Weapon;
            } else if (recipe.result.type === ItemType.Ring) {
              const ringSlots = [
                EquipmentSlot.Ring1,
                EquipmentSlot.Ring2,
                EquipmentSlot.Ring3,
                EquipmentSlot.Ring4,
              ];
              newItem.equipmentSlot =
                ringSlots[Math.floor(Math.random() * ringSlots.length)];
            } else if (recipe.result.type === ItemType.Accessory) {
              const accessorySlots = [
                EquipmentSlot.Accessory1,
                EquipmentSlot.Accessory2,
              ];
              newItem.equipmentSlot =
                accessorySlots[
                  Math.floor(Math.random() * accessorySlots.length)
                ];
            }
          }
        }

        cleanedInventory.push(newItem);
      }

      addLog(`咖啡机嗡地响起来，香气扑鼻。你成功冲调出了 ${n} 杯 ${recipe.result.name}。`, 'gain');

      return {
        ...prev,
        spiritStones: prev.spiritStones - recipe.cost * n,
        inventory: cleanedInventory,
      };
    });
  };

  return {
    handleCraft,
  };
}
