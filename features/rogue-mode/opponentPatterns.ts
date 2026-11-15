import type { CardEnemyArchetype, CardEnemyMove } from '../card-battle/types';

const ordinary = {
  duelist: {
    turn: 1,
    move: {
      name: '御器蓄能斩',
      description: '剑傀正在蓄能，本轮可连续进攻压低重击。',
      tactic: 'charge',
      damageMultiplier: 1.75,
    },
  },
  sentinel: {
    turn: 2,
    move: {
      name: '失盾追击',
      description: '稳压回路会锁定没有防护的位置。',
      tactic: 'lock-on',
    },
  },
  sprinter: {
    turn: 0,
    move: {
      name: '机蜂过载',
      description: '机蜂急于突进，可用进攻击扰驱动回路。',
      tactic: 'overload',
    },
  },
  disruptor: {
    turn: 1,
    move: {
      name: '连击回授',
      description: '灵影会放大连续进攻的信号。单次重击更稳妥。',
      tactic: 'feedback',
    },
  },
  regenerator: {
    turn: 1,
    move: {
      name: '修复后过载',
      description: '机关修复完毕，持续施压能抑制下一次放电。',
      tactic: 'overload',
    },
  },
  counterguard: {
    turn: 1,
    move: {
      name: '反射回授',
      description: '护阵已收起反震，但仍会放大连续进攻的信号。',
      tactic: 'feedback',
    },
  },
} satisfies Record<
  CardEnemyArchetype,
  { turn: number; move: Partial<CardEnemyMove> }
>;

const LOCK_ON = {
  name: '阵纹锁定',
  description: '精英瞄准无防护的目标。本轮至少留一层防护。',
  tactic: 'lock-on',
  damageMultiplier: 1,
} satisfies Partial<CardEnemyMove>;
const FEEDBACK = {
  name: '共振放大',
  description: '精英收集连续进攻的信号，再用回路反击。',
  tactic: 'feedback',
  damageMultiplier: 1,
} satisfies Partial<CardEnemyMove>;
const OVERLOAD = {
  name: '超频催逼',
  description: '精英抬高输出，用一次进攻就能扰乱它的回路。',
  tactic: 'overload',
  damageMultiplier: 1,
} satisfies Partial<CardEnemyMove>;

const elites = {
  duelist: { name: '双式剑傀', turn: 0, move: LOCK_ON },
  sentinel: { name: '稳压镇关偶', turn: 1, move: FEEDBACK },
  sprinter: { name: '超频蜂王', turn: 1, move: LOCK_ON },
  disruptor: { name: '回授灵影', turn: 2, move: OVERLOAD },
  regenerator: {
    name: '再生核心',
    turn: 0,
    move: { ...LOCK_ON, name: '自修护核' },
  },
  counterguard: { name: '镜相护阵', turn: 2, move: LOCK_ON },
};

export function createTrialOpponentPattern(
  base: CardEnemyMove[],
  archetype: CardEnemyArchetype,
  elite: boolean
): { name?: string; pattern: CardEnemyMove[] } {
  const tactic = ordinary[archetype];
  const variant = elite ? elites[archetype] : undefined;
  return {
    name: variant?.name,
    pattern: base.map((move, turn) => {
      if (tactic.turn === turn) return { ...move, ...tactic.move };
      if (variant?.turn === turn) return { ...move, ...variant.move };
      return move;
    }),
  };
}
