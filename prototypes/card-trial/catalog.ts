import type { TrialEnemy } from './types';
export { CARDS, STARTER_DECK } from '../../features/card-battle/catalog';

export const ENEMIES: readonly TrialEnemy[] = [
  {
    id: 'warmup',
    name: '热身练习',
    maxHp: 30,
    description: '先试探，再强攻，最后调整。把调整回合留给输出。',
    pattern: [
      {
        name: '试探',
        description: '下一次行动造成 6 点损耗。',
        damage: 6,
        block: 0,
      },
      {
        name: '强攻',
        description: '下一次行动造成 10 点损耗。',
        damage: 10,
        block: 0,
      },
      {
        name: '调整',
        description: '下一次行动不攻击，也不增加防护。',
        damage: 0,
        block: 0,
      },
    ],
  },
  {
    id: 'rigorous',
    name: '严谨辩手',
    maxHp: 42,
    description: '固守后强攻，再短暂调整。破势牌适合处理留下的防护。',
    pattern: [
      {
        name: '固守',
        description: '下一次行动获得 10 点防护，并造成 3 点损耗。',
        damage: 3,
        block: 10,
      },
      {
        name: '强攻',
        description: '下一次行动造成 12 点损耗。',
        damage: 12,
        block: 0,
      },
      {
        name: '调整',
        description: '下一次行动不攻击，也不增加防护。',
        damage: 0,
        block: 0,
      },
    ],
  },
  {
    id: 'finale',
    name: '压轴答辩',
    maxHp: 58,
    description: '试探、设防、强攻、调整。提前为 18 点强攻安排防护。',
    pattern: [
      {
        name: '连续追问',
        description: '下一次行动造成 8 点损耗。',
        damage: 8,
        block: 0,
      },
      {
        name: '严密设防',
        description: '下一次行动获得 8 点防护，并造成 5 点损耗。',
        damage: 5,
        block: 8,
      },
      {
        name: '集中强攻',
        description: '下一次行动造成 18 点损耗。',
        damage: 18,
        block: 0,
      },
      {
        name: '调整',
        description: '下一次行动不攻击，也不增加防护。',
        damage: 0,
        block: 0,
      },
    ],
  },
];
