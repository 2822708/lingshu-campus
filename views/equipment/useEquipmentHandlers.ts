import React from 'react';
import {
  PlayerStats,
  Item,
  ItemType,
  EquipmentSlot,
  ItemRarity,
} from '../../types';
import { getItemStats } from '../../utils/itemUtils';
import {
  UPGRADE_MATERIAL_NAME,
  UPGRADE_STONE_NAME,
  UPGRADE_STONE_SUCCESS_BONUS,
  getUpgradeMultiplier,
  RARITY_MULTIPLIERS,
} from '../../constants';

interface UseEquipmentHandlersProps {
  player: PlayerStats;
  setPlayer: React.Dispatch<React.SetStateAction<PlayerStats>>;
  addLog: (message: string, type?: string) => void;
  setItemActionLog?: (log: { text: string; type: string } | null) => void;
}

/**
 * 装备处理函数
 * 包含装备物品、卸下物品、绑定主力外设、解绑主力外设、打开升级界面、升级物品
 * @param player 玩家数据
 * @param setPlayer 设置玩家数据
 * @param addLog 添加日志
 * @returns handleEquipItem 装备物品
 * @returns handleUnequipItem 卸下物品
 * @returns handleRefineNatalArtifact 绑定主力外设
 * @returns handleUnrefineNatalArtifact 解绑主力外设
 * @returns handleOpenUpgrade 打开升级界面
 * @returns handleUpgradeItem 升级物品
 */
export function useEquipmentHandlers({
  setPlayer,
  addLog,
  setItemActionLog,
}: UseEquipmentHandlersProps) {
  const handleEquipItem = (item: Item, slot: EquipmentSlot) => {
    // 检查装备类型是否匹配
    if (!item.equipmentSlot) {
      addLog('该物品无法装备！', 'danger');
      return;
    }

    setPlayer((prev) => {
      // 检查物品是否在背包中
      const itemInInventory = prev.inventory.find((i) => i.id === item.id);
      if (!itemInInventory) {
        addLog('该物品不在背包里！', 'danger');
        return prev;
      }

      // 对于手环、挂件、外设，允许装备到任意同类型的空槽位
      const isRing = item.type === ItemType.Ring;
      const isAccessory = item.type === ItemType.Accessory;
      const isArtifact = item.type === ItemType.Artifact;

      if (isRing) {
        const ringSlots = [
          EquipmentSlot.Ring1,
          EquipmentSlot.Ring2,
          EquipmentSlot.Ring3,
          EquipmentSlot.Ring4,
        ];
        if (!ringSlots.includes(slot)) {
          addLog('手环只能装备到手环槽位！', 'danger');
          return prev;
        }
      } else if (isAccessory) {
        const accessorySlots = [
          EquipmentSlot.Accessory1,
          EquipmentSlot.Accessory2,
        ];
        if (!accessorySlots.includes(slot)) {
          addLog('挂件只能装备到挂件槽位！', 'danger');
          return prev;
        }
      } else if (isArtifact) {
        const artifactSlots = [
          EquipmentSlot.Artifact1,
          EquipmentSlot.Artifact2,
        ];
        if (!artifactSlots.includes(slot)) {
          addLog('外设只能装备到外设槽位！', 'danger');
          return prev;
        }
      } else {
        // 其他装备类型需要精确匹配
        if (item.equipmentSlot !== slot) {
          addLog('装备部位不匹配！', 'danger');
          return prev;
        }
      }

      let newAttack = prev.attack;
      let newDefense = prev.defense;
      let newMaxHp = prev.maxHp;
      let newSpirit = prev.spirit;
      let newPhysique = prev.physique;
      let newSpeed = prev.speed;
      const newEquippedItems = { ...prev.equippedItems };

      // 0. 如果该物品已经在其他槽位装备，先卸下旧槽位的装备
      let oldSlot: EquipmentSlot | null = null;
      for (const [equippedSlot, equippedItemId] of Object.entries(
        prev.equippedItems
      )) {
        if (equippedItemId === item.id && equippedSlot !== slot) {
          oldSlot = equippedSlot as EquipmentSlot;
          // 移除旧槽位的装备ID
          delete newEquippedItems[oldSlot];
          // 减去旧槽位的属性（如果物品已经在某个槽位，属性已经被计算过了，所以需要先减去）
          const isNatal = item.id === prev.natalArtifactId;
          const oldStats = getItemStats(item, isNatal);
          newAttack -= oldStats.attack;
          newDefense -= oldStats.defense;
          newMaxHp -= oldStats.hp;
          newSpirit -= oldStats.spirit;
          newPhysique -= oldStats.physique;
          newSpeed -= oldStats.speed;
          break;
        }
      }

      // 1. Remove stats from currently equipped item in this slot if any
      const currentEquippedId = prev.equippedItems[slot];
      if (currentEquippedId && currentEquippedId !== item.id) {
        const currentEquipped = prev.inventory.find(
          (i) => i.id === currentEquippedId
        );
        if (currentEquipped) {
          const isNatal = currentEquipped.id === prev.natalArtifactId;
          const stats = getItemStats(currentEquipped, isNatal);
          newAttack -= stats.attack;
          newDefense -= stats.defense;
          newMaxHp -= stats.hp;
          newSpirit -= stats.spirit;
          newPhysique -= stats.physique;
          newSpeed -= stats.speed;
        }
      }

      // 2. Add stats from new item
      const isNatal = item.id === prev.natalArtifactId;
      const newStats = getItemStats(item, isNatal);
      newAttack += newStats.attack;
      newDefense += newStats.defense;
      newMaxHp += newStats.hp;
      newSpirit += newStats.spirit;
      newPhysique += newStats.physique;
      newSpeed += newStats.speed;

      // 3. Update equipped items
      newEquippedItems[slot] = item.id;

      if (oldSlot) {
        const logMessage = `你将 ${item.name} 从${oldSlot}移动到${slot}。`;
        addLog(logMessage, 'normal');
        if (setItemActionLog) {
          setItemActionLog({ text: logMessage, type: 'normal' });
          setTimeout(() => setItemActionLog(null), 3000);
        }
      } else {
        const logMessage = `你装备了 ${item.name} 到${slot}，状态有所提升。`;
        addLog(logMessage, 'normal');
        if (setItemActionLog) {
          setItemActionLog({ text: logMessage, type: 'normal' });
          setTimeout(() => setItemActionLog(null), 3000);
        }
      }

      return {
        ...prev,
        equippedItems: newEquippedItems,
        attack: newAttack,
        defense: newDefense,
        maxHp: newMaxHp,
        hp: Math.min(prev.hp, newMaxHp),
        spirit: newSpirit,
        physique: newPhysique,
        speed: Math.max(0, newSpeed),
      };
    });
  };

  const handleUnequipItem = (slot: EquipmentSlot) => {
    setPlayer((prev) => {
      const currentEquippedId = prev.equippedItems[slot];
      if (!currentEquippedId) {
        addLog('该栏位空空如也！', 'danger');
        return prev;
      }

      const item = prev.inventory.find((i) => i.id === currentEquippedId);
      if (!item) return prev;

      let newAttack = prev.attack;
      let newDefense = prev.defense;
      let newMaxHp = prev.maxHp;
      let newSpirit = prev.spirit;
      let newPhysique = prev.physique;
      let newSpeed = prev.speed;

      const isNatal = item.id === prev.natalArtifactId;
      const stats = getItemStats(item, isNatal);
      newAttack -= stats.attack;
      newDefense -= stats.defense;
      newMaxHp -= stats.hp;
      newSpirit -= stats.spirit;
      newPhysique -= stats.physique;
      newSpeed -= stats.speed;

      const newEquippedItems = { ...prev.equippedItems };
      delete newEquippedItems[slot];

      addLog(`你卸下了 ${item.name}。`, 'normal');

      return {
        ...prev,
        equippedItems: newEquippedItems,
        attack: newAttack,
        defense: newDefense,
        maxHp: newMaxHp,
        hp: Math.min(prev.hp, newMaxHp),
        spirit: newSpirit,
        physique: newPhysique,
        speed: Math.max(0, newSpeed),
      };
    });
  };

  const handleRefineNatalArtifact = (item: Item) => {
    if (item.type !== ItemType.Artifact) {
      addLog('只有外设才能绑定为主力外设！', 'danger');
      return;
    }

    if (item.isNatal) {
      addLog('该外设已经绑定为主力外设了！', 'normal');
      return;
    }

    setPlayer((prev) => {
      if (prev.natalArtifactId) {
        const currentNatal = prev.inventory.find(
          (i) => i.id === prev.natalArtifactId
        );
        if (currentNatal) {
          addLog(
            `你已经有一台主力外设【${currentNatal.name}】，需要先解绑才能换新的。`,
            'danger'
          );
          return prev;
        }
      }

      // 消耗精力上限
      const rarity = (item.rarity as ItemRarity) || '普通';
      const hpCostMap: Record<ItemRarity, number> = {
        普通: 50,
        稀有: 100,
        传说: 200,
        绝版: 500,
      };
      const hpCost = hpCostMap[rarity];

      if (prev.maxHp <= hpCost) {
        addLog(`精力上限不足！绑定需要消耗 ${hpCost} 点精力上限。`, 'danger');
        return prev;
      }

      // 更新物品，标记为本命
      const newInventory = prev.inventory.map((i) => {
        if (i.id === item.id) {
          return { ...i, isNatal: true };
        }
        if (i.id === prev.natalArtifactId) {
          return { ...i, isNatal: false };
        }
        return i;
      });

      const newMaxHp = prev.maxHp - hpCost;
      const newHp = Math.min(prev.hp, newMaxHp);

      // 如果主力外设已装备，需要重新计算属性
      let newAttack = prev.attack;
      let newDefense = prev.defense;
      let newSpirit = prev.spirit;
      let newPhysique = prev.physique;
      let newSpeed = prev.speed;

      const isEquipped = Object.values(prev.equippedItems).includes(item.id);
      if (isEquipped) {
        const oldStats = getItemStats(item, false);
        const newStats = getItemStats(item, true);
        newAttack = newAttack - oldStats.attack + newStats.attack;
        newDefense = newDefense - oldStats.defense + newStats.defense;
        newSpirit = newSpirit - oldStats.spirit + newStats.spirit;
        newPhysique = newPhysique - oldStats.physique + newStats.physique;
        newSpeed = newSpeed - oldStats.speed + newStats.speed;
      }

      addLog(
        `你消耗了 ${hpCost} 点精力上限，把【${item.name}】绑定为主力外设！`,
        'special'
      );
      addLog(`主力外设与你朝夕相处，属性加成提升 50%！`, 'special');

      return {
        ...prev,
        inventory: newInventory,
        natalArtifactId: item.id,
        maxHp: newMaxHp,
        hp: newHp,
        attack: newAttack,
        defense: newDefense,
        spirit: newSpirit,
        physique: newPhysique,
        speed: Math.max(0, newSpeed),
      };
    });
  };

  const handleUnrefineNatalArtifact = () => {
    setPlayer((prev) => {
      if (!prev.natalArtifactId) {
        addLog('你还没绑定主力外设！', 'danger');
        return prev;
      }

      const natalItem = prev.inventory.find(
        (i) => i.id === prev.natalArtifactId
      );
      if (!natalItem) {
        addLog('主力外设找不到了！', 'danger');
        return prev;
      }

      const newInventory = prev.inventory.map((i) => {
        if (i.id === prev.natalArtifactId) {
          return { ...i, isNatal: false };
        }
        return i;
      });

      // 如果主力外设已装备，需要重新计算属性（移除本命加成）
      let newAttack = prev.attack;
      let newDefense = prev.defense;
      let newSpirit = prev.spirit;
      let newPhysique = prev.physique;
      let newSpeed = prev.speed;

      const isEquipped = Object.values(prev.equippedItems).includes(
        prev.natalArtifactId
      );
      if (isEquipped) {
        const oldStats = getItemStats(natalItem, true);
        const newStats = getItemStats(natalItem, false);
        newAttack = newAttack - oldStats.attack + newStats.attack;
        newDefense = newDefense - oldStats.defense + newStats.defense;
        newSpirit = newSpirit - oldStats.spirit + newStats.spirit;
        newPhysique = newPhysique - oldStats.physique + newStats.physique;
        newSpeed = newSpeed - oldStats.speed + newStats.speed;
      }

      addLog('你解绑了主力外设。', 'normal');

      return {
        ...prev,
        inventory: newInventory,
        natalArtifactId: null,
        attack: newAttack,
        defense: newDefense,
        spirit: newSpirit,
        physique: newPhysique,
        speed: Math.max(0, newSpeed),
      };
    });
  };

  const handleOpenUpgrade = (item: Item) => {
    return item; // 这个函数主要用于设置状态，实际逻辑在调用处
  };

  const handleUpgradeItem = async (
    item: Item,
    costStones: number,
    costMats: number,
    upgradeStones: number = 0
  ): Promise<'success' | 'failure' | 'error'> => {
    return new Promise((resolve) => {
      setPlayer((prev) => {
      const matsItem = prev.inventory.find(
        (i) => i.name === UPGRADE_MATERIAL_NAME
      );
      const upgradeStoneItem = prev.inventory.find(
        (i) => i.name === UPGRADE_STONE_NAME
      );

      if (
        prev.spiritStones < costStones ||
        !matsItem ||
        matsItem.quantity < costMats ||
        !upgradeStoneItem ||
        upgradeStoneItem.quantity < upgradeStones
      ) {
        resolve('error');
        return prev;
      }

      // 计算成功率
      const currentLevel = item.level || 0;
      const rarity = item.rarity || '普通';
      const rarityMult = RARITY_MULTIPLIERS[rarity];
      const baseSuccessRate = Math.max(
        0.1,
        1 - currentLevel * 0.1 - (rarityMult - 1) * 0.15
      );
      const successRate = Math.min(
        1,
        baseSuccessRate + upgradeStones * UPGRADE_STONE_SUCCESS_BONUS
      );

      // 判断是否成功
      const isSuccess = Math.random() < successRate;

      // 消耗材料
      const newInventory = prev.inventory
        .map((i) => {
          if (i.name === UPGRADE_MATERIAL_NAME) {
            return { ...i, quantity: i.quantity - costMats };
          }
          if (i.name === UPGRADE_STONE_NAME && upgradeStones > 0) {
            return { ...i, quantity: i.quantity - upgradeStones };
          }
          return i;
        })
        .filter((i) => i.quantity > 0);

      // 消耗学分（无论成功失败都消耗）
      const newSpiritStones = prev.spiritStones - costStones;

      if (!isSuccess) {
        addLog(`升级失败！${item.name} 没能提升版本，材料已打水漂。`, 'danger');
        resolve('failure');
        return {
          ...prev,
          spiritStones: newSpiritStones,
          inventory: newInventory,
        };
      }

      // 成功：提升属性
      const growthRate = getUpgradeMultiplier(rarity);
      const getNextStat = (val: number) => Math.floor(val * (1 + growthRate));

      const newEffect = {
        ...item.effect,
        attack: item.effect?.attack
          ? getNextStat(item.effect.attack)
          : undefined,
        defense: item.effect?.defense
          ? getNextStat(item.effect.defense)
          : undefined,
        hp: item.effect?.hp ? getNextStat(item.effect.hp) : undefined,
        spirit: item.effect?.spirit
          ? getNextStat(item.effect.spirit)
          : undefined,
        physique: item.effect?.physique
          ? getNextStat(item.effect.physique)
          : undefined,
        speed: item.effect?.speed ? getNextStat(item.effect.speed) : undefined,
      };

      const finalInventory = newInventory.map((i) => {
        if (i.id === item.id) {
          return {
            ...i,
            level: (i.level || 0) + 1,
            effect: newEffect,
          };
        }
        return i;
      });

      let newAttack = prev.attack;
      let newDefense = prev.defense;
      let newMaxHp = prev.maxHp;
      let newSpirit = prev.spirit;
      let newPhysique = prev.physique;
      let newSpeed = prev.speed;

      // Check if item is equipped in any slot
      const equippedSlot = Object.entries(prev.equippedItems).find(
        ([, itemId]) => itemId === item.id
      )?.[0] as EquipmentSlot | undefined;
      if (equippedSlot) {
        const isNatal = item.id === prev.natalArtifactId;
        const oldStats = getItemStats(item, isNatal);
        newAttack -= oldStats.attack;
        newDefense -= oldStats.defense;
        newMaxHp -= oldStats.hp;
        newSpirit -= oldStats.spirit;
        newPhysique -= oldStats.physique;
        newSpeed -= oldStats.speed;

        const newItem = {
          ...item,
          effect: newEffect,
          level: (item.level || 0) + 1,
        };
        const newStats = getItemStats(newItem, isNatal);

        newAttack += newStats.attack;
        newDefense += newStats.defense;
        newMaxHp += newStats.hp;
        newSpirit += newStats.spirit;
        newPhysique += newStats.physique;
        newSpeed += newStats.speed;
      }

      addLog(`升级成功！${item.name} 性能提升了。`, 'gain');
      resolve('success');

      return {
        ...prev,
        spiritStones: newSpiritStones,
        inventory: finalInventory,
        attack: newAttack,
        defense: newDefense,
        maxHp: newMaxHp,
        spirit: newSpirit,
        physique: newPhysique,
        speed: Math.max(0, newSpeed),
      };
      });
    });
  };

  // 一键强化：连续强化直到材料不足或达到上限次数，返回成功次数
  const handleUpgradeItemAll = async (
    item: Item,
    costStones: number,
    costMats: number,
    maxTimes: number = 30
  ): Promise<number> => {
    let successCount = 0;
    let failureCount = 0;
    let error = false;

    for (let i = 0; i < maxTimes && !error; i++) {
      // 每次用最新 player（通过闭包 player，但 handleUpgradeItem 用 prev 更新）
      // 这里逐个调用 handleUpgradeItem，成功后 item.level 不会自动更新，
      // 但我们依赖库存/学分扣减，材料不足时返回 'error' 终止
      const result = await handleUpgradeItem(item, costStones, costMats, 0);
      if (result === 'error') {
        error = true;
      } else if (result === 'success') {
        successCount++;
      } else {
        failureCount++;
        // 失败也消耗材料，可能很快耗尽；失败一次就停，避免无限耗材料
        break;
      }
    }

    if (successCount > 0) {
      addLog(
        `⚡ 一键强化完成！${item.name} 成功强化 ${successCount} 次${
          failureCount > 0 ? `，失败 ${failureCount} 次` : ''
        }`,
        'special'
      );
    } else if (failureCount > 0) {
      addLog(`一键强化失败，${item.name} 没能提升。`, 'danger');
    } else {
      addLog('材料不足，无法继续强化。', 'normal');
    }
    return successCount;
  };

  // 一键穿最优装备：对每个槽位，从背包里选总属性加成最高的物品并穿上
  const handleAutoEquip = () => {
    setPlayer((prev) => {
      if (!prev) return prev;

      // 所有装备槽位
      const allSlots = Object.values(EquipmentSlot);
      const newEquipped: Record<string, string> = {};

      // 每个槽位选一件（排除已装备的）
      const alreadyUsed = new Set<string>();
      for (const slot of allSlots) {
        const candidates = prev.inventory.filter(
          (item) =>
            item.isEquippable &&
            item.quantity > 0 &&
            !alreadyUsed.has(item.id) &&
            // 槽位匹配
            (item.equipmentSlot === slot ||
              // 手环/挂件/外设可放任意同类型槽
              (item.type === ItemType.Ring && slot.startsWith('手环')) ||
              (item.type === ItemType.Accessory && slot.startsWith('挂件')) ||
              (item.type === ItemType.Artifact && slot.startsWith('外设')) ||
              (item.type === ItemType.Weapon && slot === EquipmentSlot.Weapon) ||
              (item.type === ItemType.Armor && item.equipmentSlot === slot))
        );

        if (candidates.length === 0) continue;

        // 选加成总值最高的一件
        let best: Item | null = null;
        let bestScore = -1;
        for (const c of candidates) {
          const isNatal = c.id === prev.natalArtifactId;
          const stats = getItemStats(c, isNatal);
          const score =
            stats.attack + stats.defense + stats.hp + stats.spirit + stats.physique + stats.speed;
          if (score > bestScore) {
            bestScore = score;
            best = c;
          }
        }
        if (best) {
          newEquipped[slot] = best.id;
          alreadyUsed.add(best.id);
        }
      }

      // 计算新属性：从基础+天赋+功法+称号（不含旧装备）开始，再加新装备
      // 简化：先算"无装备"属性，再加
      const baseNoEquip = {
        attack: prev.attack,
        defense: prev.defense,
        maxHp: prev.maxHp,
        spirit: prev.spirit,
        physique: prev.physique,
        speed: prev.speed,
      };
      // 减去当前所有装备加成
      Object.values(prev.equippedItems).forEach((itemId) => {
        const item = prev.inventory.find((i) => i.id === itemId);
        if (item) {
          const isNatal = item.id === prev.natalArtifactId;
          const stats = getItemStats(item, isNatal);
          baseNoEquip.attack -= stats.attack;
          baseNoEquip.defense -= stats.defense;
          baseNoEquip.maxHp -= stats.hp;
          baseNoEquip.spirit -= stats.spirit;
          baseNoEquip.physique -= stats.physique;
          baseNoEquip.speed -= stats.speed;
        }
      });

      // 加上新装备加成
      let newAttack = baseNoEquip.attack;
      let newDefense = baseNoEquip.defense;
      let newMaxHp = baseNoEquip.maxHp;
      let newSpirit = baseNoEquip.spirit;
      let newPhysique = baseNoEquip.physique;
      let newSpeed = baseNoEquip.speed;
      Object.values(newEquipped).forEach((itemId) => {
        const item = prev.inventory.find((i) => i.id === itemId);
        if (item) {
          const isNatal = item.id === prev.natalArtifactId;
          const stats = getItemStats(item, isNatal);
          newAttack += stats.attack;
          newDefense += stats.defense;
          newMaxHp += stats.hp;
          newSpirit += stats.spirit;
          newPhysique += stats.physique;
          newSpeed += stats.speed;
        }
      });

      const equippedCount = Object.keys(newEquipped).length;
      addLog(
        equippedCount > 0
          ? `✨ 一键装备完成！自动穿上了 ${equippedCount} 件最优装备`
          : '背包里没有可装备的物品',
        equippedCount > 0 ? 'special' : 'normal'
      );

      return {
        ...prev,
        equippedItems: newEquipped,
        attack: newAttack,
        defense: newDefense,
        maxHp: newMaxHp,
        hp: Math.min(prev.hp, newMaxHp),
        spirit: newSpirit,
        physique: newPhysique,
        speed: Math.max(0, newSpeed),
      };
    });
  };

  return {
    handleEquipItem,
    handleUnequipItem,
    handleRefineNatalArtifact,
    handleUnrefineNatalArtifact,
    handleOpenUpgrade,
    handleUpgradeItem,
    handleUpgradeItemAll,
    handleAutoEquip,
  };
}
