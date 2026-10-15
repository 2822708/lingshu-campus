import React from 'react';
import { PlayerStats } from '../../types';
import { PET_TEMPLATES, REALM_ORDER, RARITY_MULTIPLIERS } from '../../constants';

interface UsePetHandlersProps {
  player: PlayerStats;
  setPlayer: React.Dispatch<React.SetStateAction<PlayerStats>>;
  addLog: (message: string, type?: string) => void;
}

/**
 * 室友处理函数
 * 包含激活室友、喂养室友、成长室友
 * @param player 玩家数据
 * @param setPlayer 设置玩家数据
 * @param addLog 添加日志
 * @returns handleActivatePet 激活室友
 * @returns handleFeedPet 喂养室友
 * @returns handleEvolvePet 成长室友
 */

export function usePetHandlers({
  player,
  setPlayer,
  addLog,
}: UsePetHandlersProps) {
  const handleActivatePet = (petId: string) => {
    if (!player) return;
    setPlayer((prev) => ({ ...prev, activePetId: petId }));
    const pet = player.pets.find((p) => p.id === petId);
    if (pet) addLog(`你激活了室友【${pet.name}】，一起开黑！`, 'gain');
  };

  const handleFeedPet = (
    petId: string,
    feedType: 'hp' | 'item' | 'exp',
    itemId?: string
  ) => {
    if (!player) return;

    const pet = player.pets.find((p) => p.id === petId);
    if (!pet) return;

    // 检查消耗
    let canFeed = false;
    let costMessage = '';

    if (feedType === 'hp') {
      const hpCost = 200;
      if (player.hp >= hpCost) {
        canFeed = true;
        costMessage = `消耗了 ${hpCost} 点精力`;
      } else {
        addLog(
          `精力不足，无法投喂！需要 ${hpCost} 点精力，当前只有 ${player.hp} 点`,
          'danger'
        );
        return;
      }
    } else if (feedType === 'item') {
      if (!itemId) {
        addLog('请选择要投喂的零食', 'danger');
        return;
      }
      const item = player.inventory.find((i) => i.id === itemId);
      if (!item || item.quantity <= 0) {
        addLog('物品不存在或数量不足', 'danger');
        return;
      }
      canFeed = true;
      costMessage = `消耗了 1 个【${item.name}】`;
    } else if (feedType === 'exp') {
      const expCost = Math.max(1, Math.floor(player.exp * 0.05)); // 消耗5%当前绩点，至少1点
      if (player.exp >= expCost) {
        canFeed = true;
        costMessage = `消耗了 ${expCost} 点绩点`;
      } else {
        addLog(
          `绩点不足，无法投喂！需要 ${expCost} 点绩点，当前只有 ${player.exp} 点`,
          'danger'
        );
        return;
      }
    }

    if (!canFeed) return;

    setPlayer((prev) => {
      if (!prev) return prev;

      // 先计算经验值（需要物品信息，在扣除之前计算）
      let baseExp = 10; // 基础经验值

      // 根据玩家学阶计算基础经验值（学阶越高，基础经验值越高）
      const realmIndex = REALM_ORDER.indexOf(prev.realm);
      const realmMultiplier = 1 + realmIndex * 0.5; // 每个学阶增加50%基础经验
      const levelMultiplier = 1 + prev.realmLevel * 0.1; // 每层增加10%
      baseExp = Math.floor(baseExp * realmMultiplier * levelMultiplier);

      // 根据物品品质计算经验倍率
      let rarityMultiplier = 1;
      if (feedType === 'item' && itemId) {
        const item = prev.inventory.find(i => i.id === itemId);
        if (item) {
          const rarity = item.rarity || '普通';
          rarityMultiplier = RARITY_MULTIPLIERS[rarity] || 1;
        }
      }

      // 计算最终经验值（基础经验 * 品质倍率，有随机波动 ±20%）
      let expGain = Math.floor(baseExp * rarityMultiplier);
      const randomVariation = 0.8 + Math.random() * 0.4; // 0.8 到 1.2
      expGain = Math.floor(expGain * randomVariation);

      // 确保不超过升级所需经验
      const expToNextLevel = pet.maxExp - pet.exp;
      expGain = Math.min(expGain, expToNextLevel);

      // 至少给1点经验
      expGain = Math.max(1, expGain);

      // 扣除消耗
      let newHp = prev.hp;
      let newExp = prev.exp;
      let newInventory = [...prev.inventory];

      if (feedType === 'hp') {
        newHp = Math.max(0, prev.hp - 200);
      } else if (feedType === 'item' && itemId) {
        newInventory = prev.inventory
          .map((item) => {
            if (item.id === itemId) {
              return { ...item, quantity: item.quantity - 1 };
            }
            return item;
          })
          .filter((item) => item.quantity > 0);
      } else if (feedType === 'exp') {
        const expCost = Math.max(1, Math.floor(prev.exp * 0.05));
        newExp = Math.max(0, prev.exp - expCost);
      }

      // 增加默契度（每次投喂增加2-5点）
      const affectionGain = Math.floor(2 + Math.random() * 4);

      const newPets = prev.pets.map((p) => {
        if (p.id === petId) {
          let petNewExp = p.exp + expGain;
          let petNewLevel = p.level;
          let petNewMaxExp = p.maxExp;
          let leveledUp = false;

          // 处理升级（可能因为经验足够而直接升级）
          while (petNewExp >= petNewMaxExp && petNewLevel < 100) {
            petNewExp -= petNewMaxExp;
            petNewLevel += 1;
            petNewMaxExp = Math.floor(petNewMaxExp * 1.5);
            leveledUp = true;
            addLog(`【${p.name}】升级了！现在是 ${petNewLevel} 级`, 'gain');
          }

          // 只有升级时才提升属性
          const newStats = leveledUp
            ? {
                attack: Math.floor(p.stats.attack * 1.1),
                defense: Math.floor(p.stats.defense * 1.1),
                hp: Math.floor(p.stats.hp * 1.1),
                speed: Math.floor(p.stats.speed * 1.05),
              }
            : p.stats;

          // 增加默契度（最高100）
          const newAffection = Math.min(100, p.affection + affectionGain);

          return {
            ...p,
            level: petNewLevel,
            exp: petNewExp,
            maxExp: petNewMaxExp,
            stats: newStats,
            affection: newAffection,
          };
        }
        return p;
      });

      // 构建反馈消息
      let feedbackMessage = `${costMessage}，【${pet.name}】获得了 ${expGain} 点经验`;
      if (affectionGain > 0) {
        feedbackMessage += `，默契度提升了 ${affectionGain} 点`;
      }
      addLog(feedbackMessage, 'gain');

      return {
        ...prev,
        hp: newHp,
        exp: newExp,
        inventory: newInventory,
        pets: newPets,
      };
    });
  };

  // 一键喂食：自动用背包里最高稀有度的可喂物品喂宠物，直到满级或材料用完
  const handleAutoFeed = (petId: string) => {
    if (!player) return;
    const pet = player.pets.find((p) => p.id === petId);
    if (!pet) return;
    if (pet.level >= 100) {
      addLog('这只室友已经满级了，不需要再喂了！', 'normal');
      return;
    }
    const result = autoFeedPet(player, petId);
    if (!result) {
      addLog('背包里没有可喂的物品了！', 'danger');
      return;
    }
    setPlayer(result);
    const newPet = result.pets.find((p) => p.id === petId);
    if (newPet) {
      addLog(`✨ 一键喂食完成！【${newPet.name}】升到了 ${newPet.level} 级`, 'special');
    }
  };

  const handleEvolvePet = (petId: string) => {
    if (!player) return;
    const pet = player.pets.find((p) => p.id === petId);
    if (!pet || pet.evolutionStage >= 2) return;

    const template = PET_TEMPLATES.find((t) => t.species === pet.species);
    if (!template || !template.evolutionRequirements) return;

    if (pet.level < template.evolutionRequirements.level) {
      addLog(
        `室友还太嫩，需要 ${template.evolutionRequirements.level} 级才能成长`,
        'danger'
      );
      return;
    }

    setPlayer((prev) => {
      const newPets = prev.pets.map((p) => {
        if (p.id === petId) {
          return {
            ...p,
            evolutionStage: p.evolutionStage + 1,
            stats: {
              attack: Math.floor(p.stats.attack * 1.5),
              defense: Math.floor(p.stats.defense * 1.5),
              hp: Math.floor(p.stats.hp * 1.5),
              speed: Math.floor(p.stats.speed * 1.2),
            },
          };
        }
        return p;
      });

      addLog(`【${pet.name}】成长了！能力大幅提升！`, 'special');
      return { ...prev, pets: newPets };
    });
  };

  // 吞噬：把不用的室友喂给主室友，按稀有度+等级加权提升主室友基础属性
  const handleDevourPet = (petId: string, sacrificedId: string) => {
    if (!player) return;
    if (petId === sacrificedId) return;
    const main = player.pets.find((p) => p.id === petId);
    const sacrificed = player.pets.find((p) => p.id === sacrificedId);
    if (!main || !sacrificed) return;
    if (sacrificed.id === player.activePetId) {
      addLog('不能吞噬当前激活的室友！', 'danger');
      return;
    }

    setPlayer((prev) => {
      const m = prev.pets.find((p) => p.id === petId);
      const s = prev.pets.find((p) => p.id === sacrificedId);
      if (!m || !s) return prev;

      // 稀有度倍率：普通1 稀有2 传说4 绝版8
      const rarityMult = RARITY_MULTIPLIERS[s.rarity] || 1;
      // 等级加成：每级 +2% 转化率
      const levelBonus = 1 + s.level * 0.02;
      // 转化率 15% × 稀有度 × 等级加成
      const gainRate = 0.15 * rarityMult * levelBonus;

      const gain = {
        attack: Math.max(1, Math.floor(s.stats.attack * gainRate)),
        defense: Math.max(1, Math.floor(s.stats.defense * gainRate)),
        hp: Math.max(1, Math.floor(s.stats.hp * gainRate)),
        speed: Math.max(1, Math.floor(s.stats.speed * gainRate)),
      };

      // 吞噬历史（追加被吞噬室友的名字）
      const devouredNames = [...(m.devouredNames || []), s.name];

      const newPets = prev.pets
        .filter((p) => p.id !== sacrificedId)
        .map((p) =>
          p.id === petId
            ? {
                ...p,
                stats: {
                  attack: p.stats.attack + gain.attack,
                  defense: p.stats.defense + gain.defense,
                  hp: p.stats.hp + gain.hp,
                  speed: p.stats.speed + gain.speed,
                },
                devouredNames,
              }
            : p
        );

      addLog(
        `🫀 【${m.name}】吞噬了【${s.name}】！基础属性提升：攻+${gain.attack} 防+${gain.defense} 精+${gain.hp} 速+${gain.speed}`,
        'special'
      );
      return { ...prev, pets: newPets };
    });
  };

  return {
    handleActivatePet,
    handleFeedPet,
    handleEvolvePet,
    handleAutoFeed,
    handleDevourPet,
  };
}

/**
 * 计算吞噬增益（供 UI 预览）
 * 与 handleDevourPet 内部逻辑一致
 */
export function calcDevourGain(
  sacrificed: { rarity: string; level: number; stats: { attack: number; defense: number; hp: number; speed: number } }
): { attack: number; defense: number; hp: number; speed: number } {
  const rarityMult = RARITY_MULTIPLIERS[sacrificed.rarity] || 1;
  const levelBonus = 1 + sacrificed.level * 0.02;
  const gainRate = 0.15 * rarityMult * levelBonus;
  return {
    attack: Math.max(1, Math.floor(sacrificed.stats.attack * gainRate)),
    defense: Math.max(1, Math.floor(sacrificed.stats.defense * gainRate)),
    hp: Math.max(1, Math.floor(sacrificed.stats.hp * gainRate)),
    speed: Math.max(1, Math.floor(sacrificed.stats.speed * gainRate)),
  };
}

/**
 * 一键喂食：自动用背包里最高稀有度的可喂物品喂宠物，直到满级或材料用完
 * （独立函数，避免在 hook 内部循环调用 setPlayer 造成竞态）
 */
export function autoFeedPet(
  player: PlayerStats,
  petId: string
): PlayerStats | null {
  const pet = player.pets.find((p) => p.id === petId);
  if (!pet) return null;

  // 可喂养的物品 = 非装备的、有数量的物品，按稀有度排序（高的优先）
  const equippedItemIds = new Set(
    Object.values(player.equippedItems).filter(Boolean) as string[]
  );
  const feedable = player.inventory
    .filter((i) => !equippedItemIds.has(i.id) && i.quantity > 0)
    .sort((a, b) => {
      const ra = RARITY_MULTIPLIERS[a.rarity || '普通'] || 1;
      const rb = RARITY_MULTIPLIERS[b.rarity || '普通'] || 1;
      return rb - ra;
    });

  if (feedable.length === 0) return null;

  // 玩家学阶 → 基础经验
  const realmIndex = REALM_ORDER.indexOf(player.realm);
  const realmMultiplier = 1 + realmIndex * 0.5;
  const levelMultiplier = 1 + player.realmLevel * 0.1;
  const baseExp = Math.floor(10 * realmMultiplier * levelMultiplier);

  let newInventory = [...player.inventory];
  const petState = { ...pet };
  let feeds = 0;

  // 逐件喂，直到满级或没有可喂物品
  for (const item of feedable) {
    if (petState.level >= 100) break;

    // 计算这件物品能喂几次（数量）
    const itemInInv = newInventory.find((i) => i.id === item.id);
    if (!itemInInv || itemInInv.quantity <= 0) continue;

    let remainingQty = itemInInv.quantity;
    while (remainingQty > 0 && petState.level < 100) {
      const rarityMult = RARITY_MULTIPLIERS[item.rarity || '普通'] || 1;
      let expGain = Math.floor(baseExp * rarityMult);
      const randomVariation = 0.8 + Math.random() * 0.4;
      expGain = Math.floor(expGain * randomVariation);
      expGain = Math.max(1, expGain);

      // 升级
      petState.exp += expGain;
      while (petState.exp >= petState.maxExp && petState.level < 100) {
        petState.exp -= petState.maxExp;
        petState.level += 1;
        petState.maxExp = Math.floor(petState.maxExp * 1.5);
        petState.stats = {
          attack: Math.floor(petState.stats.attack * 1.1),
          defense: Math.floor(petState.stats.defense * 1.1),
          hp: Math.floor(petState.stats.hp * 1.1),
          speed: Math.floor(petState.stats.speed * 1.05),
        };
      }
      if (petState.exp > petState.maxExp) {
        petState.exp = petState.maxExp; // 封顶
      }

      remainingQty--;
      feeds++;
      // 每喂一次默契 +2~5
      petState.affection = Math.min(100, petState.affection + Math.floor(2 + Math.random() * 4));
    }

    // 扣除已消耗的数量
    newInventory = newInventory
      .map((i) =>
        i.id === item.id
          ? { ...i, quantity: i.quantity - (itemInInv.quantity - remainingQty) }
          : i
      )
      .filter((i) => i.quantity > 0);
  }

  if (feeds === 0) return null;

  return {
    ...player,
    inventory: newInventory,
    pets: player.pets.map((p) => (p.id === petId ? petState : p)),
  };
}
