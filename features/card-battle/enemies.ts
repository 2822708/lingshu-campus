import type { CardEnemyArchetype, CardEnemyIntentType } from './types';

export interface CardEnemyPatternStep {
  type: CardEnemyIntentType;
  name: string;
  description: string;
  damageMultiplier: number;
  piercePercent?: number;
  healPercent?: number;
  thornsPercent?: number;
}
export interface CardEnemyArchetypeDefinition {
  id: CardEnemyArchetype;
  name: string;
  description: string;
  pattern: readonly CardEnemyPatternStep[];
}
/** Patterns add decisions while preserving the main game's frozen enemy stat tier. */
export const ENEMY_ARCHETYPES: Record<
  CardEnemyArchetype,
  CardEnemyArchetypeDefinition
> = {
  duelist: {
    id: 'duelist',
    name: '追问辩手',
    description: '试探后集中追问，重击后有调整窗口。保留防护迎接第二轮。',
    pattern: [
      {
        type: 'adjust',
        name: '开场试探',
        description: '本轮试探来袭；下一轮将集中追问。',
        damageMultiplier: 0.6,
      },
      {
        type: 'strong',
        name: '集中追问',
        description: '本轮集中重击，随后进入调整；适合提前准备防护或反击。',
        damageMultiplier: 1.2,
      },
      {
        type: 'adjust',
        name: '整理提纲',
        description: '重击后的薄弱窗口，可准备下一次爆发。',
        damageMultiplier: 0.35,
      },
    ],
  },
  sentinel: {
    id: 'sentinel',
    name: '论证守门人',
    description: '先固守两轮，再提出核心质疑。先破势能打开进攻窗口。',
    pattern: [
      {
        type: 'guard',
        name: '封闭论证',
        description: '从公布起固守两轮，受到的进攻减半；破势可提前清除。',
        damageMultiplier: 0.55,
      },
      {
        type: 'adjust',
        name: '交叉检查',
        description: '本轮来袭较弱，固守若未被破除仍然生效。',
        damageMultiplier: 0.25,
      },
      {
        type: 'strong',
        name: '核心质疑',
        description: '固守结束后重击，提前防御或将积蓄的防护转为进攻。',
        damageMultiplier: 1,
      },
    ],
  },
  sprinter: {
    id: 'sprinter',
    name: '抢答快手',
    description:
      '开场压迫强，先手有少量穿透，随后逐渐放缓。首轮需兼顾精力与抢攻。',
    pattern: [
      {
        type: 'strong',
        name: '抢占先手',
        description: '开场快攻，其中 20% 来袭穿透防护；剩余部分仍能抵挡。',
        damageMultiplier: 0.9,
        piercePercent: 20,
      },
      {
        type: 'adjust',
        name: '连续发问',
        description: '保持来袭压力，但没有穿透。',
        damageMultiplier: 0.7,
      },
      {
        type: 'adjust',
        name: '换气停顿',
        description: '本轮来袭明显放缓，是整理手牌的机会。',
        damageMultiplier: 0.35,
      },
    ],
  },
  disruptor: {
    id: 'disruptor',
    name: '干扰考官',
    description:
      '部分质疑穿透防护，单纯堆防无法完全应付。观察穿透量，及时进攻。',
    pattern: [
      {
        type: 'adjust',
        name: '突发打断',
        description: '本轮总来袭较低，但其中 50% 穿透防护。',
        damageMultiplier: 0.4,
        piercePercent: 50,
      },
      {
        type: 'strong',
        name: '重点干扰',
        description: '本轮强攻，其中 30% 穿透防护。',
        damageMultiplier: 0.9,
        piercePercent: 30,
      },
      {
        type: 'adjust',
        name: '重新提问',
        description: '本轮没有穿透，可用防护和反击稳定节奏。',
        damageMultiplier: 0.35,
      },
    ],
  },
  regenerator: {
    id: 'regenerator',
    name: '漏洞聚合体',
    description: '每三轮修复少量精力。抓住修复前的机会集中输出，避免长期空转。',
    pattern: [
      {
        type: 'adjust',
        name: '自我修补',
        description:
          '敌人行动时修复最多自身精力上限的4%，不超过已损耗部分；可提前击破。',
        damageMultiplier: 0.3,
        healPercent: 4,
      },
      {
        type: 'strong',
        name: '错误复现',
        description: '修补后发起重击，提前防护可以保留进攻资源。',
        damageMultiplier: 0.9,
      },
      {
        type: 'adjust',
        name: '定位残留',
        description: '本轮没有修复；下一轮会再次尝试修补。',
        damageMultiplier: 0.5,
      },
    ],
  },
  counterguard: {
    id: 'counterguard',
    name: '反问评审',
    description: '架起固守时对进攻回敬质疑；先破势可同时清除固守与反问架势。',
    pattern: [
      {
        type: 'guard',
        name: '反问架势',
        description:
          '固守两轮；本轮每次受到非致命进攻会反问。先破势可清除架势。',
        damageMultiplier: 0.5,
        thornsPercent: 15,
      },
      {
        type: 'strong',
        name: '追究细节',
        description: '本轮没有反问，若固守仍在，可先破势再集中作答。',
        damageMultiplier: 0.7,
      },
      {
        type: 'adjust',
        name: '倾听结论',
        description: '本轮来袭较弱，没有固守与反问。',
        damageMultiplier: 0.3,
      },
    ],
  },
};

export function selectDungeonEnemyArchetype(seed: number): CardEnemyArchetype {
  let word = ((seed >>> 0) ^ 0x7f4a7c15) >>> 0;
  word = Math.imul(word ^ (word >>> 16), 0x21f0aaad);
  word = Math.imul(word ^ (word >>> 15), 0x735a2d97);
  const ids = Object.keys(ENEMY_ARCHETYPES) as CardEnemyArchetype[];
  return ids[((word ^ (word >>> 15)) >>> 0) % ids.length];
}
