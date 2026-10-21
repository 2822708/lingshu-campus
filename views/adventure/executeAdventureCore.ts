import React from 'react';
import {
  PlayerStats,
  AdventureResult,
  AdventureType,
  Item,
  ItemType,
  ItemRarity,
  EquipmentSlot,
  Pet,
} from '../../types';
import {
  REALM_ORDER,
  TALENTS,
  CULTIVATION_ARTS,
  PET_TEMPLATES,
  RARITY_MULTIPLIERS,
  DISCOVERABLE_RECIPES,
} from '../../constants';
import { BattleReplay } from '../../services/battleService';
import { generateAdventureEvent } from '../../services/aiService';
import {
  getAIContextEpoch,
  isAIContextCurrent,
} from '../../services/ai/runtime';
import { uid } from '../../utils/gameUtils';
import {
  normalizeItemEffect,
  inferItemTypeAndSlot,
} from '../../utils/itemUtils';

/**
 * 刷题/实训核心逻辑
 * 包含物品处理、室友处理、课程处理、天赋处理、属性降低处理、抽奖券和传承处理、随机副本处理
 * @param result 刷题结果
 * @param battleContext 战斗上下文
 * @param player 玩家数据
 * @param setPlayer 设置玩家数据
 * @param addLog 添加日志
 * @param triggerVisual 触发视觉效果
 * @param onOpenBattleModal 打开战斗模态框
 * @param realmName 刷题场景名称
 * @param adventureType 刷题类型
 * @returns 刷题核心逻辑
 */

interface ExecuteAdventureCoreProps {
  result: AdventureResult;
  battleContext: BattleReplay | null;
  player: PlayerStats;
  setPlayer: React.Dispatch<React.SetStateAction<PlayerStats>>;
  addLog: (message: string, type?: string) => void;
  triggerVisual: (type: string, text?: string, className?: string) => void;
  onOpenBattleModal: (replay: BattleReplay) => void;
  realmName?: string;
  adventureType: AdventureType;
  skipBattle?: boolean; // 是否跳过战斗（自动模式下）
  onTriggerSecretRealm?: () => Promise<void>;
}

export async function executeAdventureCore({
  result,
  battleContext,
  player,
  setPlayer,
  addLog,
  triggerVisual,
  onOpenBattleModal,
  realmName,
  adventureType,
  skipBattle = false,
  onTriggerSecretRealm,
}: ExecuteAdventureCoreProps & {
  riskLevel?: '低' | '中' | '高' | '极度危险';
}) {
  // Handle Visuals
  if (result.hpChange < 0) {
    triggerVisual('damage', String(result.hpChange), 'text-red-500');
    if (document.body) {
      document.body.classList.add('animate-shake');
      setTimeout(() => document.body.classList.remove('animate-shake'), 500);
    }
  } else if (result.hpChange > 0) {
    triggerVisual('heal', `+${result.hpChange}`, 'text-emerald-400');
  }

  if (result.eventColor === 'danger' || adventureType === 'secret_realm') {
    triggerVisual('slash');
  }

  // 核心玩家状态更新逻辑，从 App.tsx 中迁移而来
  setPlayer((prev) => {
    if (!prev) return prev;

    const newInv = [...prev.inventory];
    const newArts = [...prev.cultivationArts];
    let newTalentId = prev.talentId;
    let newAttack = prev.attack;
    let newDefense = prev.defense;
    let newMaxHp = prev.maxHp;
    let newHp = prev.hp;
    let newLuck = prev.luck;
    let newLotteryTickets = prev.lotteryTickets;
    let newInheritanceLevel = prev.inheritanceLevel;
    const newPets = [...prev.pets];

    // 处理获得的多个物品（搜刮奖励等）
    if (result.itemsObtained && result.itemsObtained.length > 0) {
      result.itemsObtained.forEach((itemData) => {
        const itemName = itemData.name;
        let itemType = (itemData.type as ItemType) || ItemType.Material;
        let isEquippable = itemData.isEquippable;
        let equipmentSlot = itemData.equipmentSlot as EquipmentSlot | undefined;
        const itemDescription = itemData.description || '';

        // 自动推断和修正物品类型和装备槽位
        // 优先使用代码推断的结果，因为代码的规则更准确
        const inferred = inferItemTypeAndSlot(
          itemName,
          itemType,
          itemDescription,
          isEquippable
        );
        // 如果推断出的类型与AI返回的类型不一致，使用推断的类型（代码规则优先）
        if (inferred.type !== itemType) {
          console.log(
            `[物品类型修正] "${itemName}": AI返回类型="${itemType}", 推断类型="${inferred.type}", 使用推断类型`
          );
        }
        itemType = inferred.type;
        isEquippable = inferred.isEquippable;
        equipmentSlot = inferred.equipmentSlot || equipmentSlot;

        // 规范化物品效果（确保已知物品的效果与描述一致）
        const normalized = normalizeItemEffect(
          itemName,
          itemData.effect,
          itemData.permanentEffect
        );
        let finalEffect = normalized.effect;
        let finalPermanentEffect = normalized.permanentEffect;

        // 装备类物品应该使用 effect 而不是 permanentEffect
        // 如果装备只有 permanentEffect 而没有 effect，将其转换为 effect
        if (isEquippable && !finalEffect && finalPermanentEffect) {
          // 将 permanentEffect 转换为 effect（除了 maxHp，因为装备不提供 maxHp）
          finalEffect = {
            attack: finalPermanentEffect.attack,
            defense: finalPermanentEffect.defense,
            spirit: finalPermanentEffect.spirit,
            physique: finalPermanentEffect.physique,
            speed: finalPermanentEffect.speed,
            hp: 0, // maxHp 转换为 hp（装备时增加当前精力上限）
          };
          // 如果有 maxHp，也加到 hp 中
          if (finalPermanentEffect.maxHp) {
            finalEffect.hp = (finalEffect.hp || 0) + finalPermanentEffect.maxHp;
          }
          // 清空 permanentEffect（装备不应该有 permanentEffect）
          finalPermanentEffect = undefined;
          console.log(
            `[装备效果修正] "${itemName}": 将 permanentEffect 转换为 effect`
          );
        }

        // 装备类物品应该使用 effect 而不是 permanentEffect
        // 如果装备只有 permanentEffect 而没有 effect，将其转换为 effect
        if (isEquippable && !finalEffect && finalPermanentEffect) {
          // 将 permanentEffect 转换为 effect（除了 maxHp，因为装备不提供 maxHp）
          finalEffect = {
            attack: finalPermanentEffect.attack,
            defense: finalPermanentEffect.defense,
            spirit: finalPermanentEffect.spirit,
            physique: finalPermanentEffect.physique,
            speed: finalPermanentEffect.speed,
            hp: 0, // maxHp 转换为 hp（装备时增加当前精力上限）
          };
          // 如果有 maxHp，也加到 hp 中
          if (finalPermanentEffect.maxHp) {
            finalEffect.hp = (finalEffect.hp || 0) + finalPermanentEffect.maxHp;
          }
          // 清空 permanentEffect（装备不应该有 permanentEffect）
          finalPermanentEffect = undefined;
          console.log(
            `[装备效果修正] "${itemName}": 将 permanentEffect 转换为 effect`
          );
        }

        // 确保外设有属性加成，且不能有exp加成
        if (itemType === ItemType.Artifact) {
          if (finalEffect.exp) {
            finalEffect = { ...finalEffect };
            delete finalEffect.exp;
          }

          const hasAnyAttribute =
            finalEffect.attack ||
            finalEffect.defense ||
            finalEffect.hp ||
            finalEffect.spirit ||
            finalEffect.physique ||
            finalEffect.speed;

          if (!hasAnyAttribute) {
            const rarity = (itemData.rarity as ItemRarity) || '普通';
            const rarityMultiplier = RARITY_MULTIPLIERS[rarity];
            const baseValue =
              rarity === '普通'
                ? 10
                : rarity === '稀有'
                  ? 30
                  : rarity === '传说'
                    ? 80
                    : 200;
            const attributeTypes: Array<keyof NonNullable<Item['effect']>> = [
              'attack',
              'defense',
              'hp',
              'spirit',
              'physique',
              'speed',
            ];
            const numAttributes = Math.floor(Math.random() * 3) + 1;
            const selectedAttributes = attributeTypes
              .sort(() => Math.random() - 0.5)
              .slice(0, numAttributes);

            finalEffect = {};
            selectedAttributes.forEach((attr) => {
              const value = Math.floor(
                baseValue * rarityMultiplier * (0.8 + Math.random() * 0.4)
              );
              finalEffect[attr] = value;
            });
          }
        }

        const isEquipment = isEquippable && equipmentSlot;
        const existingIdx = newInv.findIndex((i) => i.name === itemName);

        // 处理配方：需要添加 recipeData
        let recipeData = undefined;
        if (itemType === ItemType.Recipe) {
          // 从 itemData 中获取 recipeName（如果存在）
          const recipeName = itemData.recipeName;
          if (recipeName) {
            // 从 DISCOVERABLE_RECIPES 中查找对应的配方
            const recipe = DISCOVERABLE_RECIPES.find(
              (r) => r.name === recipeName
            );
            if (recipe) {
              recipeData = recipe;
            }
          }
        }

        if (existingIdx >= 0 && !isEquipment && itemType !== ItemType.Recipe) {
          // 配方不能叠加，每个配方都是独立的
          newInv[existingIdx] = {
            ...newInv[existingIdx],
            quantity: newInv[existingIdx].quantity + 1,
          };
        } else {
          const newItem: Item = {
            id: uid(),
            name: itemName,
            type: itemType,
            description: itemData.description,
            quantity: 1,
            rarity: (itemData.rarity as ItemRarity) || '普通',
            level: 0,
            isEquippable: isEquippable,
            equipmentSlot: equipmentSlot,
            effect: finalEffect,
            permanentEffect: finalPermanentEffect,
            recipeData: recipeData,
          };
          newInv.push(newItem);
        }
      });
    }

    // 处理获得的单个物品（兼容旧代码）
    if (result.itemObtained) {
      let itemName = result.itemObtained.name;
      let itemType =
        (result.itemObtained.type as ItemType) || ItemType.Material;
      let isEquippable = result.itemObtained.isEquippable;
      let equipmentSlot = result.itemObtained.equipmentSlot as
        | EquipmentSlot
        | undefined;
      const itemDescription = result.itemObtained.description || '';

      // 处理神秘外设：随机命名并设置为外设类型
      if (itemName?.includes('神秘') || itemName?.includes('外设')) {
        const artifactNames = [
          '青莲键',
          '紫霄屏',
          '玄天坞',
          '九幽塔',
          '太虚盘',
          '阴阳鼠',
          '星辰耳',
          '混沌坞',
          '天机板',
          '轮回笔',
          '乾坤袋',
          '五行坞',
          '八卦炉',
          '太极坞',
          '无极键',
          '造化坞',
          '开天坞',
          '辟地坞',
          '混元坞',
          '先天坞',
          '后天坞',
          '三生坞',
          '六道坞',
          '九重坞',
        ];
        itemName =
          artifactNames[Math.floor(Math.random() * artifactNames.length)];
        itemType = ItemType.Artifact;
        isEquippable = true;
        // 随机分配一个外设槽位
        const artifactSlots = [
          EquipmentSlot.Artifact1,
          EquipmentSlot.Artifact2,
        ];
        equipmentSlot =
          artifactSlots[Math.floor(Math.random() * artifactSlots.length)];
      } else {
        // 自动推断和修正物品类型和装备槽位
        // 优先使用代码推断的结果，因为代码的规则更准确
        const inferred = inferItemTypeAndSlot(
          itemName,
          itemType,
          itemDescription,
          isEquippable
        );
        // 如果推断出的类型与AI返回的类型不一致，使用推断的类型（代码规则优先）
        if (inferred.type !== itemType) {
          console.log(
            `[物品类型修正] "${itemName}": AI返回类型="${itemType}", 推断类型="${inferred.type}", 使用推断类型`
          );
        }
        itemType = inferred.type;
        isEquippable = inferred.isEquippable;
        equipmentSlot = inferred.equipmentSlot || equipmentSlot;
      }

      // 规范化物品效果（确保已知物品的效果与描述一致）
      const normalized = normalizeItemEffect(
        itemName,
        result.itemObtained.effect,
        result.itemObtained.permanentEffect
      );
      let finalEffect = normalized.effect;
      let finalPermanentEffect = normalized.permanentEffect;

      // 装备类物品应该使用 effect 而不是 permanentEffect
      // 如果装备只有 permanentEffect 而没有 effect，将其转换为 effect
      if (isEquippable && !finalEffect && finalPermanentEffect) {
        // 将 permanentEffect 转换为 effect（除了 maxHp，因为装备不提供 maxHp）
        finalEffect = {
          attack: finalPermanentEffect.attack,
          defense: finalPermanentEffect.defense,
          spirit: finalPermanentEffect.spirit,
          physique: finalPermanentEffect.physique,
          speed: finalPermanentEffect.speed,
          hp: 0, // maxHp 转换为 hp（装备时增加当前精力上限）
        };
        // 如果有 maxHp，也加到 hp 中
        if (finalPermanentEffect.maxHp) {
          finalEffect.hp = (finalEffect.hp || 0) + finalPermanentEffect.maxHp;
        }
        // 清空 permanentEffect（装备不应该有 permanentEffect）
        finalPermanentEffect = undefined;
        console.log(
          `[装备效果修正] "${itemName}": 将 permanentEffect 转换为 effect`
        );
      }

      // 确保外设有属性加成，且不能有exp加成
      if (itemType === ItemType.Artifact) {
        // 移除exp加成（外设不应该提供绩点加成）
        if (finalEffect.exp) {
          finalEffect = { ...finalEffect };
          delete finalEffect.exp;
        }

        // 如果外设没有任何属性加成，自动生成属性
        const hasAnyAttribute =
          finalEffect.attack ||
          finalEffect.defense ||
          finalEffect.hp ||
          finalEffect.spirit ||
          finalEffect.physique ||
          finalEffect.speed;

        if (!hasAnyAttribute) {
          const rarity = (result.itemObtained.rarity as ItemRarity) || '普通';
          const rarityMultiplier = RARITY_MULTIPLIERS[rarity];

          // 根据稀有度生成基础属性值
          const baseValue =
            rarity === '普通'
              ? 10
              : rarity === '稀有'
                ? 30
                : rarity === '传说'
                  ? 80
                  : 200;

          // 随机生成1-3种属性
          const attributeTypes: Array<keyof NonNullable<Item['effect']>> = [
            'attack',
            'defense',
            'hp',
            'spirit',
            'physique',
            'speed',
          ];
          const numAttributes = Math.floor(Math.random() * 3) + 1; // 1-3种属性
          const selectedAttributes = attributeTypes
            .sort(() => Math.random() - 0.5)
            .slice(0, numAttributes);

          finalEffect = {};
          selectedAttributes.forEach((attr) => {
            const value = Math.floor(
              baseValue * rarityMultiplier * (0.8 + Math.random() * 0.4)
            );
            finalEffect[attr] = value;
          });
        }
      }

      // 处理配方：需要添加 recipeData
      let recipeData = undefined;
      if (itemType === ItemType.Recipe) {
        // 从 result.itemObtained 中获取 recipeName（如果存在）
        const recipeName = result.itemObtained.recipeName;
        if (recipeName) {
          // 从 DISCOVERABLE_RECIPES 中查找对应的配方
          const recipe = DISCOVERABLE_RECIPES.find(
            (r) => r.name === recipeName
          );
          if (recipe) {
            recipeData = recipe;
          }
        }
      }

      // 装备类物品可以重复获得，但每个装备单独占一格（quantity始终为1）
      const isEquipment = isEquippable && equipmentSlot;
      const existingIdx = newInv.findIndex((i) => i.name === itemName);

      if (existingIdx >= 0 && !isEquipment && itemType !== ItemType.Recipe) {
        // 非装备类物品可以叠加，但配方不能叠加
        newInv[existingIdx] = {
          ...newInv[existingIdx],
          quantity: newInv[existingIdx].quantity + 1,
        };
      } else {
        // 装备类物品或新物品，创建新物品（每个装备单独占一格）
        const newItem: Item = {
          id: uid(),
          name: itemName,
          type: itemType,
          description: result.itemObtained.description,
          quantity: 1, // 装备quantity始终为1
          rarity: (result.itemObtained.rarity as ItemRarity) || '普通',
          level: 0,
          isEquippable: isEquippable,
          equipmentSlot: equipmentSlot,
          effect: finalEffect,
          permanentEffect: finalPermanentEffect,
          recipeData: recipeData,
        };
        newInv.push(newItem);
      }
    }

    // 处理抽奖券奖励
    if (result.lotteryTicketsChange && result.lotteryTicketsChange > 0) {
      newLotteryTickets += result.lotteryTicketsChange;
      addLog(`🎫 获得 ${result.lotteryTicketsChange} 张抽奖券！`, 'gain');
    }

    // 处理传承奖励（极小概率获得传承，可直接跳级1-4个学阶）
    if (result.inheritanceLevelChange && result.inheritanceLevelChange > 0) {
      // 限制传承等级变化在1-4之间，且总传承等级不超过4
      const validChange = Math.max(
        1,
        Math.min(4, result.inheritanceLevelChange)
      );
      const newTotal = Math.min(4, newInheritanceLevel + validChange);
      const actualChange = newTotal - newInheritanceLevel;
      if (actualChange > 0) {
        newInheritanceLevel = newTotal;
        addLog(
          `🌟 你获得了学霸传承！可以直接连跳 ${actualChange} 个学阶！`,
          'special'
        );
      }
    }

    // 处理获得的室友
    if (result.petObtained) {
      const petTemplate = PET_TEMPLATES.find(
        (t) => t.id === result.petObtained
      );
      if (petTemplate) {
        // 检查是否已经拥有该室友（根据种类判断，避免重复）
        const hasSameSpecies = newPets.some(
          (p) => p.species === petTemplate.species
        );
        if (!hasSameSpecies) {
          const newPet: Pet = {
            id: uid(),
            name: petTemplate.name,
            species: petTemplate.species,
            level: 1,
            exp: 0,
            maxExp: 100,
            rarity: petTemplate.rarity,
            stats: { ...petTemplate.baseStats },
            skills: [...petTemplate.skills],
            evolutionStage: 0,
            affection: 50,
          };
          newPets.push(newPet);
          addLog(
            `✨ 你成功 get 到了一位室友【${newPet.name}】，从此宿舍热闹了！`,
            'special'
          );
        } else {
          addLog(
            `你遇到了另一位同款室友，但你宿舍已经有同类人了，便婉拒了。`,
            'normal'
          );
        }
      }
    }

    // 处理室友机缘
    if (result.petOpportunity && newPets.length > 0) {
      let targetPet: Pet | null = null;

      // 确定目标室友：优先使用当前激活的室友
      if (result.petOpportunity.petId) {
        targetPet =
          newPets.find((p) => p.id === result.petOpportunity.petId) || null;
      }
      // 如果没有指定或找不到，优先使用当前激活的室友
      if (!targetPet && prev.activePetId) {
        targetPet = newPets.find((p) => p.id === prev.activePetId) || null;
      }
      // 如果还是没有，随机选择一个
      if (!targetPet) {
        const randomPet = newPets[Math.floor(Math.random() * newPets.length)];
        targetPet = randomPet;
      }

      if (targetPet) {
        const petIndex = newPets.findIndex((p) => p.id === targetPet!.id);
        const updatedPet = { ...targetPet };

        switch (result.petOpportunity.type) {
          case 'evolution':
            if (updatedPet.evolutionStage < 2) {
              updatedPet.evolutionStage += 1;
              updatedPet.stats = {
                attack: Math.floor(updatedPet.stats.attack * 1.5),
                defense: Math.floor(updatedPet.stats.defense * 1.5),
                hp: Math.floor(updatedPet.stats.hp * 1.5),
                speed: Math.floor(updatedPet.stats.speed * 1.2),
              };
              newPets[petIndex] = updatedPet;
              addLog(
                `✨ 【${targetPet.name}】在刷题中开窍了，成长一波！学习能力大幅提升！`,
                'special'
              );
            }
            break;

          case 'level':
            if (
              result.petOpportunity.levelGain &&
              result.petOpportunity.levelGain > 0
            ) {
              const levelGain = Math.min(result.petOpportunity.levelGain, 5); // 最多提升5级
              updatedPet.level += levelGain;
              // 每次升级提升属性
              for (let i = 0; i < levelGain; i++) {
                updatedPet.stats = {
                  attack: Math.floor(updatedPet.stats.attack * 1.1),
                  defense: Math.floor(updatedPet.stats.defense * 1.1),
                  hp: Math.floor(updatedPet.stats.hp * 1.1),
                  speed: Math.floor(updatedPet.stats.speed * 1.05),
                };
              }
              newPets[petIndex] = updatedPet;
              addLog(
                `✨ 【${targetPet.name}】在刷题中顿悟，直接升级了 ${levelGain} 级！`,
                'special'
              );
            }
            break;

          case 'stats':
            if (result.petOpportunity.statsBoost) {
              const boost = result.petOpportunity.statsBoost;
              updatedPet.stats = {
                attack: updatedPet.stats.attack + (boost.attack || 0),
                defense: updatedPet.stats.defense + (boost.defense || 0),
                hp: updatedPet.stats.hp + (boost.hp || 0),
                speed: updatedPet.stats.speed + (boost.speed || 0),
              };
              newPets[petIndex] = updatedPet;
              const statsText = [
                boost.attack ? `攻击+${boost.attack}` : '',
                boost.defense ? `防御+${boost.defense}` : '',
                boost.hp ? `精力+${boost.hp}` : '',
                boost.speed ? `手速+${boost.speed}` : '',
              ]
                .filter(Boolean)
                .join('、');
              addLog(
                `✨ 【${targetPet.name}】在刷题中开窍，属性提升了：${statsText}！`,
                'special'
              );
            }
            break;

          case 'exp':
            if (
              result.petOpportunity.expGain &&
              result.petOpportunity.expGain > 0
            ) {
              let petNewExp = updatedPet.exp + result.petOpportunity.expGain;
              let petNewLevel = updatedPet.level;
              let petNewMaxExp = updatedPet.maxExp;
              let leveledUp = false;
              let levelGainCount = 0;

              // 处理升级（可能连升多级）
              while (petNewExp >= petNewMaxExp && petNewLevel < 100) {
                petNewExp -= petNewMaxExp;
                petNewLevel += 1;
                levelGainCount += 1;
                petNewMaxExp = Math.floor(petNewMaxExp * 1.5);
                leveledUp = true;
              }

              // 每次升级提升属性
              if (leveledUp) {
                for (let i = 0; i < levelGainCount; i++) {
                  updatedPet.stats = {
                    attack: Math.floor(updatedPet.stats.attack * 1.1),
                    defense: Math.floor(updatedPet.stats.defense * 1.1),
                    hp: Math.floor(updatedPet.stats.hp * 1.1),
                    speed: Math.floor(updatedPet.stats.speed * 1.05),
                  };
                }
              }

              updatedPet.exp = petNewExp;
              updatedPet.level = petNewLevel;
              updatedPet.maxExp = petNewMaxExp;

              newPets[petIndex] = updatedPet;
              if (leveledUp) {
                addLog(
                  `✨ 【${targetPet.name}】在刷题中获得了 ${result.petOpportunity.expGain} 点经验，并提升了 ${levelGainCount} 级！`,
                  'special'
                );
              } else {
                addLog(
                  `✨ 【${targetPet.name}】在刷题中获得了 ${result.petOpportunity.expGain} 点经验！`,
                  'special'
                );
              }
            }
            break;
        }
      }
    }

    // 极小概率获得课程（3%概率，副本中5%）
    const artChance = realmName ? 0.05 : 0.03;
    if (Math.random() < artChance && adventureType !== 'lucky') {
      const availableArts = CULTIVATION_ARTS.filter(
        (art) =>
          !newArts.includes(art.id) &&
          REALM_ORDER.indexOf(art.realmRequirement) <=
            REALM_ORDER.indexOf(prev.realm)
      );
      if (availableArts.length > 0) {
        const randomArt =
          availableArts[Math.floor(Math.random() * availableArts.length)];
        // 确保课程没有被重复添加
        if (!newArts.includes(randomArt.id)) {
          newArts.push(randomArt.id);
          newAttack += randomArt.effects.attack || 0;
          newDefense += randomArt.effects.defense || 0;
          newMaxHp += randomArt.effects.hp || 0;
          newHp += randomArt.effects.hp || 0;
          addLog(
            `🎉 你在刷题中顿悟了【${randomArt.name}】！可在课程列表查看。`,
            'special'
          );
        }
      }
    }

    // 极小概率获得天赋（1%概率，副本中2%，大机缘中5%）
    const talentChance =
      adventureType === 'lucky' ? 0.05 : realmName ? 0.02 : 0.01;
    if (Math.random() < talentChance && !newTalentId) {
      const availableTalents = TALENTS.filter(
        (t) => t.id !== 'talent-ordinary' && t.rarity !== '绝版' // 绝版天赋只能通过特殊方式获得
      );
      if (availableTalents.length > 0) {
        const randomTalent =
          availableTalents[Math.floor(Math.random() * availableTalents.length)];
        newTalentId = randomTalent.id;
        newAttack += randomTalent.effects.attack || 0;
        newDefense += randomTalent.effects.defense || 0;
        newMaxHp += randomTalent.effects.hp || 0;
        newHp += randomTalent.effects.hp || 0;
        newLuck += randomTalent.effects.luck || 0;
        addLog(`🌟 你在刷题中觉醒了天赋【${randomTalent.name}】！`, 'special');
      }
    }

    // 处理属性降低（遭遇 BUG、挂科等危险事件）
    let newSpirit = prev.spirit;
    let newPhysique = prev.physique;
    let newSpeed = prev.speed;
    if (result.attributeReduction) {
      const reduction = result.attributeReduction;

      // 保护机制：限制单个属性最多降低10%，总属性降低不超过15%
      const maxSingleReductionRatio = 0.1; // 单个属性最多降低10%
      const maxTotalReductionRatio = 0.15; // 总属性最多降低15%

      // 计算总降低值
      let totalReduction = 0;
      if (reduction.attack) totalReduction += reduction.attack;
      if (reduction.defense) totalReduction += reduction.defense;
      if (reduction.spirit) totalReduction += reduction.spirit;
      if (reduction.physique) totalReduction += reduction.physique;
      if (reduction.speed) totalReduction += reduction.speed;
      if (reduction.maxHp) totalReduction += reduction.maxHp;

      // 计算玩家总属性值
      const totalAttributes =
        prev.attack +
        prev.defense +
        prev.spirit +
        prev.physique +
        prev.speed +
        prev.maxHp;
      const maxAllowedReduction = totalAttributes * maxTotalReductionRatio;

      // 如果总降低超过限制，按比例缩减
      let scaleFactor = 1;
      if (totalReduction > maxAllowedReduction) {
        scaleFactor = maxAllowedReduction / totalReduction;
      }

      if (reduction.attack) {
        const maxSingleReduction = Math.floor(
          prev.attack * maxSingleReductionRatio
        );
        const actualReduction = Math.min(
          Math.floor(reduction.attack * scaleFactor),
          maxSingleReduction
        );
        newAttack = Math.max(0, newAttack - actualReduction);
        if (actualReduction > 0) {
          addLog(`⚠️ 你的攻击力降低了 ${actualReduction} 点！`, 'danger');
        }
      }
      if (reduction.defense) {
        const maxSingleReduction = Math.floor(
          prev.defense * maxSingleReductionRatio
        );
        const actualReduction = Math.min(
          Math.floor(reduction.defense * scaleFactor),
          maxSingleReduction
        );
        newDefense = Math.max(0, newDefense - actualReduction);
        if (actualReduction > 0) {
          addLog(`⚠️ 你的防御力降低了 ${actualReduction} 点！`, 'danger');
        }
      }
      if (reduction.spirit) {
        const maxSingleReduction = Math.floor(
          prev.spirit * maxSingleReductionRatio
        );
        const actualReduction = Math.min(
          Math.floor(reduction.spirit * scaleFactor),
          maxSingleReduction
        );
        newSpirit = Math.max(0, newSpirit - actualReduction);
        if (actualReduction > 0) {
          addLog(`⚠️ 你的思维降低了 ${actualReduction} 点！`, 'danger');
        }
      }
      if (reduction.physique) {
        const maxSingleReduction = Math.floor(
          prev.physique * maxSingleReductionRatio
        );
        const actualReduction = Math.min(
          Math.floor(reduction.physique * scaleFactor),
          maxSingleReduction
        );
        newPhysique = Math.max(0, newPhysique - actualReduction);
        if (actualReduction > 0) {
          addLog(`⚠️ 你的体能降低了 ${actualReduction} 点！`, 'danger');
        }
      }
      if (reduction.speed) {
        const maxSingleReduction = Math.floor(
          prev.speed * maxSingleReductionRatio
        );
        const actualReduction = Math.min(
          Math.floor(reduction.speed * scaleFactor),
          maxSingleReduction
        );
        newSpeed = Math.max(0, newSpeed - actualReduction);
        if (actualReduction > 0) {
          addLog(`⚠️ 你的手速降低了 ${actualReduction} 点！`, 'danger');
        }
      }
      if (reduction.maxHp) {
        const maxSingleReduction = Math.floor(
          prev.maxHp * maxSingleReductionRatio
        );
        const actualReduction = Math.min(
          Math.floor(reduction.maxHp * scaleFactor),
          maxSingleReduction
        );
        newMaxHp = Math.max(prev.maxHp * 0.5, newMaxHp - actualReduction); // 至少保留50%精力上限
        newHp = Math.min(newHp, newMaxHp);
        if (actualReduction > 0) {
          addLog(`⚠️ 你的精力上限降低了 ${actualReduction} 点！`, 'danger');
        }
      }
    }

    // 允许hp变为0或负数，用于触发延毕检测
    const finalHp = newHp + result.hpChange;

    return {
      ...prev,
      hp: Math.min(newMaxHp, finalHp), // 移除 Math.max(0, ...)，允许负数
      exp: Math.max(0, prev.exp + result.expChange), // 绩点不能为负
      spiritStones: Math.max(0, prev.spiritStones + result.spiritStonesChange), // 学分不能为负
      inventory: newInv,
      cultivationArts: newArts,
      talentId: newTalentId || prev.talentId,
      attack: newAttack,
      defense: newDefense,
      maxHp: newMaxHp,
      spirit: newSpirit,
      physique: newPhysique,
      speed: newSpeed,
      luck: newLuck,
      lotteryTickets: newLotteryTickets,
      inheritanceLevel: newInheritanceLevel,
      pets: newPets,
    };
  });

  addLog(result.story, result.eventColor);

  // 显示获得的物品
  if (result.itemsObtained && result.itemsObtained.length > 0) {
    result.itemsObtained.forEach((item) => {
      const rarityText = item.rarity ? `【${item.rarity}】` : '';
      addLog(`获得物品: ${rarityText}${item.name}`, 'gain');
    });
  } else if (result.itemObtained) {
    addLog(`获得物品: ${result.itemObtained.name}`, 'gain');
  }

  // 即使跳过战斗，也要保存战斗数据用于死亡统计
  // 但只在非自动模式下显示战斗弹窗
  if (battleContext) {
    if (!skipBattle) {
      onOpenBattleModal(battleContext);
    } else {
      // 自动模式下，静默保存战斗数据（通过 onOpenBattleModal 回调）
      // 这样可以在死亡时显示战斗统计
      onOpenBattleModal(battleContext);
    }
  }

  // 如果触发随机副本，自动进入副本并触发新的随机事件
  if (result.triggerSecretRealm && onTriggerSecretRealm) {
    const actionEpoch = getAIContextEpoch();
    setTimeout(async () => {
      if (!isAIContextCurrent(actionEpoch)) return;
      await onTriggerSecretRealm();
    }, 1000);
    return;
  }
  // Legacy-only execution for callers without the active App's continuation callback.
  if (result.triggerSecretRealm) {
    const actionEpoch = getAIContextEpoch();
    setTimeout(async () => {
      if (!isAIContextCurrent(actionEpoch)) return;
      addLog(`你一头扎进副本深处...`, 'special');
      let secretRealmResult: AdventureResult;
      try {
        secretRealmResult = await generateAdventureEvent(
          player,
          'secret_realm'
        );
      } catch {
        return;
      }
      if (!isAIContextCurrent(actionEpoch)) return;

      setPlayer((prev) => {
        if (!prev) return prev;
        // 计算境界倍数（用于平衡补偿）
        const realmIndex = REALM_ORDER.indexOf(prev.realm);
        const realmMultiplier =
          1 + realmIndex * 0.3 + (prev.realmLevel - 1) * 0.1;

        const newInv = [...prev.inventory];
        let newStones = prev.spiritStones;
        let newExp = prev.exp;
        let newHp = prev.hp;
        let newMaxHp = prev.maxHp;
        let newAttack = prev.attack;
        let newDefense = prev.defense;
        let newSpirit = prev.spirit;
        let newPhysique = prev.physique;
        let newSpeed = prev.speed;

        // 处理副本中的物品
        if (secretRealmResult.itemObtained) {
          const itemName = secretRealmResult.itemObtained.name;
          const existingIdx = newInv.findIndex((i) => i.name === itemName);
          if (existingIdx < 0) {
            // 规范化物品效果（确保已知物品的效果与描述一致）
            const normalized = normalizeItemEffect(
              itemName,
              secretRealmResult.itemObtained.effect,
              secretRealmResult.itemObtained.permanentEffect
            );
            const newItem: Item = {
              id: uid(),
              name: itemName,
              type:
                (secretRealmResult.itemObtained.type as ItemType) ||
                ItemType.Material,
              description: secretRealmResult.itemObtained.description,
              quantity: 1,
              rarity:
                (secretRealmResult.itemObtained.rarity as ItemRarity) || '普通',
              level: 0,
              isEquippable: secretRealmResult.itemObtained.isEquippable,
              equipmentSlot: secretRealmResult.itemObtained.equipmentSlot as
                | EquipmentSlot
                | undefined,
              effect: normalized.effect,
              permanentEffect: normalized.permanentEffect,
            };
            newInv.push(newItem);
          }
        }

        // 处理属性降低（平衡机制：限制降低数值，确保有补偿）
        if (secretRealmResult.attributeReduction) {
          const reduction = secretRealmResult.attributeReduction;

          // 计算属性降低的总量，如果降低太多，需要限制
          let totalReduction = 0;
          if (reduction.attack) totalReduction += reduction.attack;
          if (reduction.defense) totalReduction += reduction.defense;
          if (reduction.spirit) totalReduction += reduction.spirit;
          if (reduction.physique) totalReduction += reduction.physique;
          if (reduction.speed) totalReduction += reduction.speed;
          if (reduction.maxHp) totalReduction += reduction.maxHp;

          // 计算玩家总属性值（用于比例限制）
          const totalAttributes =
            prev.attack +
            prev.defense +
            prev.spirit +
            prev.physique +
            prev.speed +
            prev.maxHp;

          // 如果降低超过总属性的15%，则按比例缩减（确保不会过度降低）
          const maxReductionRatio = 0.15; // 最多降低15%
          const maxAllowedReduction = totalAttributes * maxReductionRatio;

          if (totalReduction > maxAllowedReduction) {
            const scaleFactor = maxAllowedReduction / totalReduction;
            // 按比例缩减所有降低值
            if (reduction.attack)
              reduction.attack = Math.floor(reduction.attack * scaleFactor);
            if (reduction.defense)
              reduction.defense = Math.floor(reduction.defense * scaleFactor);
            if (reduction.spirit)
              reduction.spirit = Math.floor(reduction.spirit * scaleFactor);
            if (reduction.physique)
              reduction.physique = Math.floor(reduction.physique * scaleFactor);
            if (reduction.speed)
              reduction.speed = Math.floor(reduction.speed * scaleFactor);
            if (reduction.maxHp)
              reduction.maxHp = Math.floor(reduction.maxHp * scaleFactor);
          }

          // 应用属性降低（限制单个属性最多降低10%）
          if (reduction.attack) {
            const maxAttackReduction = Math.floor(prev.attack * 0.1);
            newAttack = Math.max(
              0,
              newAttack - Math.min(reduction.attack, maxAttackReduction)
            );
          }
          if (reduction.defense) {
            const maxDefenseReduction = Math.floor(prev.defense * 0.1);
            newDefense = Math.max(
              0,
              newDefense - Math.min(reduction.defense, maxDefenseReduction)
            );
          }
          if (reduction.spirit) {
            const maxSpiritReduction = Math.floor(prev.spirit * 0.1);
            newSpirit = Math.max(
              0,
              newSpirit - Math.min(reduction.spirit, maxSpiritReduction)
            );
          }
          if (reduction.physique) {
            const maxPhysiqueReduction = Math.floor(prev.physique * 0.1);
            newPhysique = Math.max(
              0,
              newPhysique - Math.min(reduction.physique, maxPhysiqueReduction)
            );
          }
          if (reduction.speed) {
            const maxSpeedReduction = Math.floor(prev.speed * 0.1);
            newSpeed = Math.max(
              0,
              newSpeed - Math.min(reduction.speed, maxSpeedReduction)
            );
          }
          if (reduction.maxHp) {
            const maxHpReduction = Math.floor(prev.maxHp * 0.1);
            const actualReduction = Math.min(reduction.maxHp, maxHpReduction);
            newMaxHp = Math.max(prev.maxHp * 0.5, newMaxHp - actualReduction);
            newHp = Math.min(newHp, newMaxHp);
          }

          // 如果确实发生了属性降低，确保有补偿（检查是否有物品或大量奖励）
          const hasCompensation =
            secretRealmResult.itemObtained ||
            secretRealmResult.expChange > 100 * realmMultiplier ||
            secretRealmResult.spiritStonesChange > 200 * realmMultiplier;

          if (!hasCompensation && totalReduction > 0) {
            // 如果没有补偿，自动增加一些奖励作为补偿
            newExp += Math.floor(50 * realmMultiplier);
            newStones += Math.floor(100 * realmMultiplier);
          }
        }

        return {
          ...prev,
          hp: Math.max(
            0,
            Math.min(newMaxHp, newHp + secretRealmResult.hpChange)
          ),
          exp: Math.max(0, newExp + secretRealmResult.expChange),
          spiritStones: Math.max(
            0,
            newStones + secretRealmResult.spiritStonesChange
          ),
          inventory: newInv,
          attack: newAttack,
          defense: newDefense,
          maxHp: newMaxHp,
          spirit: newSpirit,
          physique: newPhysique,
          speed: newSpeed,
        };
      });
      addLog(secretRealmResult.story, secretRealmResult.eventColor);
      if (secretRealmResult.itemObtained) {
        addLog(`获得物品: ${secretRealmResult.itemObtained.name}`, 'gain');
      }
    }, 1000);
  }
}
