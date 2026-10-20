import type {
  PlayerStats,
  AdventureResult,
  AdventureType,
  RealmType,
} from '../types';
import { findLingGen, findMingGe, getNpuTalent } from '../npu-data';
import { getAIConfig } from '../config/aiConfig';
import { neutralizeCampusText } from '../utils/campusText';
import {
  generateLocalAdventureEvent,
  generateLocalBreakthroughText,
  generateLocalEnemyName,
} from '../utils/localEvents';
import { AIContextCancelledError, runGameAISkill } from './ai/runtime';

/** 投影既成结果；不发送姓名、UID、背包或完整存档。 */
function describeOutcome(plan: AdventureResult): Record<string, unknown> {
  return {
    hpChange: plan.hpChange,
    expChange: plan.expChange,
    spiritStonesChange: plan.spiritStonesChange,
    lotteryTicketsChange: plan.lotteryTicketsChange || 0,
    itemNames: [
      ...(plan.itemObtained ? [plan.itemObtained.name] : []),
      ...(plan.itemsObtained || []).map((item) => item.name),
    ],
    roommateId: plan.petObtained || null,
  };
}

/** 数值、物品及随机结果只由本地规则生成一次，AI 只填写 story。 */
export const generateAdventureEvent = async (
  player: PlayerStats,
  adventureType: AdventureType = 'normal',
  riskLevel?: '低' | '中' | '高' | '极度危险',
  realmName?: string,
  _realmDescription?: string
): Promise<AdventureResult> => {
  // 保留旧调用签名；地点描述不作为模型事实来源。
  void _realmDescription;
  const plan = generateLocalAdventureEvent(player, adventureType, riskLevel);
  if (!getAIConfig().enabled) return plan;
  const talent = getNpuTalent(player.talentId || '');
  const [, departmentId, personalityId] = talent ? talent.id.split(':') : [];
  try {
    const text = await runGameAISkill('adventure', {
      realm: player.realm,
      department: findLingGen(departmentId)?.college,
      personality: findMingGe(personalityId)?.name,
      adventureType,
      location: realmName,
      localStory: plan.story,
      outcome: describeOutcome(plan),
    });
    return { ...plan, story: neutralizeCampusText(text.story) };
  } catch (error) {
    if (error instanceof AIContextCancelledError) throw error;
    return plan;
  }
};

export const generateBreakthroughFlavorText = async (
  realm: string,
  success: boolean
): Promise<string> => {
  const fallback = generateLocalBreakthroughText(realm, success);
  if (!getAIConfig().enabled) return fallback;
  try {
    const result = await runGameAISkill('breakthrough', { realm, success });
    return neutralizeCampusText(result.text);
  } catch (error) {
    if (error instanceof AIContextCancelledError) throw error;
    return fallback;
  }
};

export const generateEnemyName = async (
  realm: RealmType,
  adventureType: AdventureType
): Promise<{ name: string; title: string }> => {
  const fallback = generateLocalEnemyName(realm);
  if (!getAIConfig().enabled) return fallback;
  try {
    const result = await runGameAISkill('enemy-name', { realm, adventureType });
    return {
      name: neutralizeCampusText(result.name),
      title: neutralizeCampusText(result.title),
    };
  } catch (error) {
    if (error instanceof AIContextCancelledError) throw error;
    return fallback;
  }
};
