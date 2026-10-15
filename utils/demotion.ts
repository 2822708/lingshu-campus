/**
 * "延毕"降级系统（替代死亡删档）
 *
 * 设计（方案 B）：
 *  - hp <= 0 不再删档，而是触发"延毕"：
 *      * 学阶掉 1 级（realmLevel - 1）；若 realmLevel 已是 1，则学阶降 1 档
 *      * 本学阶绩点（exp）清零
 *      * 装备 / 宠物 / 学分 / 天赋 全部保留
 *      * 属性重算（降到新学阶的基础值 + 原有装备/天赋/功法/称号加成）
 *      * 精力回满
 *  - 已经是大一 Lv.1 无法再降 → 只清绩点、回满血（"补考"）
 */

import { PlayerStats, RealmType } from '../types';
import { REALM_DATA, REALM_ORDER, CULTIVATION_ARTS, TALENTS, TITLES } from '../constants';
import { getItemStats } from './itemUtils';

export interface DemotionResult {
  player: PlayerStats; // 降级后的玩家（hp 已回满）
  oldRealm: string;
  oldLevel: number;
  newRealm: string;
  newLevel: number;
  droppedRealm: boolean; // 是否降了学阶（还是只掉了级）
  message: string;
}

/** 按降级后的学阶/等级重算属性（复用突破的加成规则） */
function recomputeStats(prev: PlayerStats, realm: RealmType, realmLevel: number) {
  const stats = REALM_DATA[realm];
  const levelMultiplier = 1 + realmLevel * 0.1;

  let bonusAttack = 0;
  let bonusDefense = 0;
  let bonusHp = 0;
  let bonusSpirit = 0;
  let bonusPhysique = 0;
  let bonusSpeed = 0;

  // 功法加成
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

  // 装备加成
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

  // 天赋加成
  const talent = TALENTS.find((t) => t.id === prev.talentId);
  if (talent) {
    bonusAttack += talent.effects.attack || 0;
    bonusDefense += talent.effects.defense || 0;
    bonusHp += talent.effects.hp || 0;
    bonusSpirit += talent.effects.spirit || 0;
    bonusPhysique += talent.effects.physique || 0;
    bonusSpeed += talent.effects.speed || 0;
  }

  // 称号加成
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

  return {
    maxHp: newBaseMaxHp + bonusHp,
    attack: Math.floor(stats.baseAttack * levelMultiplier) + bonusAttack,
    defense: Math.floor(stats.baseDefense * levelMultiplier) + bonusDefense,
    spirit: Math.floor(stats.baseSpirit * levelMultiplier) + bonusSpirit,
    physique: Math.floor(stats.basePhysique * levelMultiplier) + bonusPhysique,
    speed: Math.max(0, Math.floor(stats.baseSpeed * levelMultiplier) + bonusSpeed),
    maxExp: newMaxExp,
  };
}

/**
 * 应用降级。返回降级后的完整结果。
 */
export function applyDemotion(prev: PlayerStats): DemotionResult {
  const oldRealm = prev.realm;
  const oldLevel = prev.realmLevel;

  let newRealm = oldRealm;
  let newLevel: number;
  let droppedRealm = false;

  if (oldLevel > 1) {
    // 只掉一级
    newLevel = oldLevel - 1;
  } else {
    // realmLevel === 1：尝试降学阶
    const idx = REALM_ORDER.indexOf(oldRealm as RealmType);
    if (idx > 0) {
      newRealm = REALM_ORDER[idx - 1];
      newLevel = 1;
      droppedRealm = true;
    } else {
      // 已经是大一 Lv.1：不能降，只能"补考"
      newLevel = 1;
    }
  }

  const recomputed = recomputeStats(prev, newRealm as RealmType, newLevel);

  const player: PlayerStats = {
    ...prev,
    realm: newRealm,
    realmLevel: newLevel,
    exp: 0, // 本学阶绩点清零
    maxExp: recomputed.maxExp,
    maxHp: recomputed.maxHp,
    hp: recomputed.maxHp, // 回满
    attack: recomputed.attack,
    defense: recomputed.defense,
    spirit: recomputed.spirit,
    physique: recomputed.physique,
    speed: recomputed.speed,
  };

  let message: string;
  if (droppedRealm) {
    message = `你被留级了！从 ${oldRealm} 降到了 ${newRealm}，本学阶绩点清零。`;
  } else if (oldLevel > 1) {
    message = `你挂科延毕了！从 ${oldRealm} Lv.${oldLevel} 掉到了 ${oldRealm} Lv.${newLevel}，本学阶绩点清零。`;
  } else {
    message = `你补考重修，绩点清零，好在保住了 ${newRealm} 的学籍。`;
  }

  return { player, oldRealm, oldLevel, newRealm, newLevel, droppedRealm, message };
}