import { applyAdventureResult } from '../../utils/adventureResult';
import React from 'react';
import {
  PlayerStats,
  AdventureResult,
  AdventureType,
  Item,
  ItemType,
  ItemRarity,
  EquipmentSlot,
} from '../../types';
import { REALM_ORDER } from '../../constants';
import { BattleReplay } from '../../services/battleService';
import { generateAdventureEvent } from '../../services/aiService';
import {
  getAIContextEpoch,
  isAIContextCurrent,
} from '../../services/ai/runtime';
import { uid } from '../../utils/gameUtils';
import { normalizeItemEffect } from '../../utils/itemUtils';

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

  // Resource rules are shared with the saved, synchronous dungeon flow.
  setPlayer((prev) => {
    if (!prev) return prev;
    const applied = applyAdventureResult(prev, result, {
      adventureType,
      realmName,
      random: Math.random,
      createId: uid,
    });
    applied.logs.forEach((entry) => addLog(entry.text, entry.type));
    return applied.player;
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
