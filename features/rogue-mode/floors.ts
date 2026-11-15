import type { BattleRule, CardEnemyArchetype } from '../card-battle/types';

export interface RogueFloor {
  floor: number;
  title: string;
  combat?: BattleRule;
  bossRule?: BattleRule;
  service: {
    style:
      | 'recovery'
      | 'upgrade'
      | 'salvage'
      | 'fieldwork'
      | 'supply'
      | 'fabrication';
    strength: number;
  };
}

type FloorDefinition = Omit<RogueFloor, 'floor'>;

/** Each entry gives this floor a rule independently of the lane and opponent. */
const definitions: readonly FloorDefinition[] = [
  // Chapter 1
  {
    title: '入门校验',
    combat: {
      label: '起手试斩',
      check: 'attacks',
      min: 1,
      timing: 'opening',
      fail: 2,
    },
    service: { style: 'recovery', strength: 6 },
  },
  {
    title: '护体登记',
    combat: {
      label: '入门御守',
      check: 'block',
      min: 1,
      timing: 'opening',
      fail: 3,
    },
    service: { style: 'recovery', strength: 1 },
  },
  {
    title: '专注配额',
    combat: {
      label: '留用一格',
      check: 'focus',
      min: 1,
      timing: 'opening',
      fail: 4,
    },
    service: { style: 'upgrade', strength: 1 },
  },
  {
    title: '基础实训',
    combat: {
      label: '偶轮限连',
      check: 'attacks',
      max: 1,
      timing: 'even',
      fail: 4,
    },
    service: { style: 'upgrade', strength: 6 },
  },
  { title: '新生助研', service: { style: 'fieldwork', strength: 1 } },
  {
    title: '回路通电',
    combat: {
      label: '奇轮通电',
      check: 'attacks',
      min: 1,
      timing: 'odd',
      pass: -1,
      fail: 3,
    },
    service: { style: 'salvage', strength: 6 },
  },
  {
    title: '术式盘点',
    combat: {
      label: '库存抽查',
      check: 'hand',
      min: 3,
      timing: 'late',
      fail: 4,
    },
    service: { style: 'salvage', strength: 1 },
  },
  {
    title: '识图与布阵',
    combat: {
      label: '护式抽查',
      check: 'defenses',
      min: 1,
      timing: 'late',
      fail: 5,
    },
    service: { style: 'fieldwork', strength: 6 },
  },
  { title: '自习楼夜灯', service: { style: 'recovery', strength: 2 } },
  {
    title: '极限推导',
    combat: {
      label: '偶轮推导',
      check: 'attacks',
      min: 2,
      timing: 'even',
      pass: -2,
      fail: 4,
    },
    bossRule: {
      label: '奇轮验算',
      check: 'block',
      min: 3,
      timing: 'odd',
      fail: 3,
    },
    service: { style: 'supply', strength: 6 },
  },
  // Chapter 2
  {
    title: '稳压预热',
    combat: {
      label: '预热隔离',
      check: 'block',
      min: 2,
      timing: 'opening',
      pass: -1,
      fail: 4,
    },
    service: { style: 'fabrication', strength: 6 },
  },
  {
    title: '耗能登记',
    combat: {
      label: '偶轮余量',
      check: 'focus',
      min: 1,
      timing: 'even',
      fail: 4,
    },
    service: { style: 'supply', strength: 1 },
  },
  {
    title: '护阵检修',
    combat: {
      label: '断流检修',
      check: 'attacks',
      min: 1,
      timing: 'late',
      channel: 'heal',
      fail: 4,
    },
    service: { style: 'fabrication', strength: 1 },
  },
  {
    title: '焊台抽查',
    combat: {
      label: '预留保险',
      check: 'focus',
      min: 1,
      timing: 'opening',
      channel: 'pierce',
      fail: 16,
    },
    service: { style: 'recovery', strength: 7 },
  },
  { title: '耗材领用', service: { style: 'upgrade', strength: 2 } },
  {
    title: '交替散热',
    combat: {
      label: '偶轮散热',
      check: 'attacks',
      min: 1,
      timing: 'even',
      pass: -2,
      fail: 4,
    },
    service: { style: 'upgrade', strength: 7 },
  },
  {
    title: '清空工位',
    combat: {
      label: '奇轮减负',
      check: 'hand',
      max: 4,
      timing: 'odd',
      fail: 5,
    },
    service: { style: 'salvage', strength: 2 },
  },
  {
    title: '冗余检验',
    combat: {
      label: '术式备份',
      check: 'hand',
      min: 2,
      timing: 'late',
      channel: 'pierce',
      fail: 15,
    },
    service: { style: 'salvage', strength: 7 },
  },
  { title: '组间复盘', service: { style: 'upgrade', strength: 3 } },
  {
    title: '谐振校验',
    combat: {
      label: '断环窗口',
      check: 'guard',
      max: 0,
      timing: 'odd',
      channel: 'heal',
      fail: 6,
    },
    bossRule: {
      label: '余量隔离',
      check: 'focus',
      min: 1,
      timing: 'even',
      channel: 'pierce',
      fail: 18,
    },
    service: { style: 'fieldwork', strength: 7 },
  },
  // Chapter 3
  {
    title: '上场热身',
    combat: {
      label: '起手控速',
      check: 'attacks',
      max: 1,
      timing: 'opening',
      fail: 5,
    },
    service: { style: 'supply', strength: 7 },
  },
  {
    title: '接力论证',
    combat: {
      label: '接力压制',
      check: 'attacks',
      min: 2,
      timing: 'late',
      pass: -2,
      fail: 4,
    },
    service: { style: 'fieldwork', strength: 2 },
  },
  {
    title: '快速演算',
    combat: {
      label: '偶轮收卷',
      check: 'hand',
      max: 3,
      timing: 'even',
      fail: 6,
    },
    service: { style: 'fabrication', strength: 2 },
  },
  {
    title: '赛台隔离',
    combat: {
      label: '留盾屏蔽',
      check: 'block',
      min: 3,
      timing: 'even',
      channel: 'pierce',
      fail: 18,
    },
    service: { style: 'fabrication', strength: 7 },
  },
  { title: '竞赛备品', service: { style: 'supply', strength: 2 } },
  {
    title: '错峰攻守',
    combat: {
      label: '奇轮限护',
      check: 'defenses',
      max: 1,
      timing: 'odd',
      fail: 6,
    },
    service: { style: 'recovery', strength: 8 },
  },
  {
    title: '预留反问',
    combat: {
      label: '专注预备',
      check: 'focus',
      min: 1,
      timing: 'late',
      pass: -2,
      fail: 4,
    },
    service: { style: 'recovery', strength: 3 },
  },
  {
    title: '单式验收',
    combat: {
      label: '单式作答',
      check: 'attacks',
      min: 1,
      max: 1,
      timing: 'odd',
      fail: 5,
    },
    service: { style: 'upgrade', strength: 8 },
  },
  { title: '赛后复盘', service: { style: 'salvage', strength: 3 } },
  {
    title: '频谱问答',
    combat: {
      label: '奇轮信号',
      check: 'attacks',
      min: 2,
      timing: 'odd',
      fail: 5,
    },
    bossRule: {
      label: '偶轮缓存',
      check: 'hand',
      min: 3,
      timing: 'even',
      pass: -2,
      fail: 5,
    },
    service: { style: 'salvage', strength: 8 },
  },
  // Chapter 4
  {
    title: '检修试阵',
    combat: {
      label: '偶轮封修',
      check: 'focus',
      min: 1,
      timing: 'even',
      channel: 'heal',
      fail: 5,
    },
    service: { style: 'fieldwork', strength: 8 },
  },
  {
    title: '信道裕量',
    combat: {
      label: '奇轮防串扰',
      check: 'focus',
      min: 1,
      timing: 'odd',
      channel: 'pierce',
      fail: 12,
    },
    service: { style: 'supply', strength: 3 },
  },
  {
    title: '耐损评估',
    combat: {
      label: '磨损补偿',
      check: 'injury',
      min: 8,
      timing: 'late',
      pass: -3,
    },
    service: { style: 'fabrication', strength: 3 },
  },
  {
    title: '故障复现',
    combat: {
      label: '故障隔离',
      check: 'defenses',
      min: 1,
      timing: 'late',
      channel: 'pierce',
      fail: 20,
    },
    service: { style: 'supply', strength: 8 },
  },
  { title: '中期实验', service: { style: 'recovery', strength: 5 } },
  {
    title: '热备切换',
    combat: {
      label: '热备护盾',
      check: 'block',
      min: 5,
      timing: 'odd',
      pass: -2,
      fail: 5,
    },
    service: { style: 'fabrication', strength: 8 },
  },
  {
    title: '净化缓存',
    combat: {
      label: '冷备清空',
      check: 'hand',
      max: 5,
      timing: 'late',
      channel: 'heal',
      fail: 5,
    },
    service: { style: 'salvage', strength: 4 },
  },
  {
    title: '故障注入',
    combat: {
      label: '残阵限幅',
      check: 'attacks',
      max: 1,
      timing: 'below-half',
      channel: 'pierce',
      fail: 18,
    },
    service: { style: 'recovery', strength: 9 },
  },
  { title: '补全报告', service: { style: 'fabrication', strength: 4 } },
  {
    title: '维修封锁',
    combat: {
      label: '带载复测',
      check: 'attacks',
      min: 1,
      timing: 'even',
      channel: 'heal',
      fail: 7,
    },
    bossRule: {
      label: '半载隔离',
      check: 'block',
      min: 4,
      timing: 'below-half',
      channel: 'pierce',
      fail: 19,
    },
    service: { style: 'upgrade', strength: 9 },
  },
  // Chapter 5
  {
    title: '结业联调',
    combat: {
      label: '开场留式',
      check: 'hand',
      min: 2,
      timing: 'opening',
      pass: -2,
      fail: 5,
    },
    service: { style: 'salvage', strength: 9 },
  },
  {
    title: '现场答疑',
    combat: {
      label: '偶轮独式',
      check: 'attacks',
      min: 1,
      max: 1,
      timing: 'even',
      pass: -1,
      fail: 6,
    },
    service: { style: 'upgrade', strength: 4 },
  },
  {
    title: '联合预演',
    combat: {
      label: '二层防线',
      check: 'defenses',
      min: 2,
      timing: 'even',
      pass: -3,
      fail: 5,
    },
    service: { style: 'supply', strength: 4 },
  },
  {
    title: '失效演习',
    combat: {
      label: '零盾告警',
      check: 'block',
      min: 1,
      timing: 'below-half',
      pass: -2,
      fail: 6,
    },
    service: { style: 'fieldwork', strength: 9 },
  },
  { title: '封卷委托', service: { style: 'fabrication', strength: 5 } },
  {
    title: '成果展示',
    combat: {
      label: '节奏换挡',
      check: 'focus',
      min: 2,
      timing: 'odd',
      pass: -3,
      fail: 5,
    },
    service: { style: 'supply', strength: 9 },
  },
  {
    title: '答辩资料',
    combat: {
      label: '资料冗余',
      check: 'hand',
      min: 4,
      timing: 'late',
      channel: 'heal',
      fail: 6,
    },
    service: { style: 'recovery', strength: 4 },
  },
  {
    title: '压力预检',
    combat: {
      label: '应急回切',
      check: 'injury',
      min: 14,
      timing: 'below-half',
      pass: -4,
      fail: 4,
    },
    service: { style: 'fabrication', strength: 9 },
  },
  { title: '最后调息', service: { style: 'supply', strength: 5 } },
  {
    title: '联合答辩',
    combat: {
      label: '交错答辩',
      check: 'attacks',
      min: 1,
      max: 2,
      timing: 'odd',
      pass: -2,
      fail: 6,
    },
    bossRule: {
      label: '劫雷验盾',
      check: 'block',
      min: 6,
      timing: 'below-half',
      channel: 'pierce',
      fail: 20,
    },
    service: { style: 'recovery', strength: 10 },
  },
];

export const ROGUE_FLOORS: readonly RogueFloor[] = definitions.map(
  (definition, index) => ({ ...definition, floor: index + 1 })
);

export function getRogueFloor(floor: number): RogueFloor {
  const rule = ROGUE_FLOORS[floor - 1];
  if (!rule) throw new Error('试炼层数必须为 1–50。');
  return rule;
}

/** These checks stack with the floor rule; elite intent cycles remain distinct. */
export const ELITE_TRIAL_RULES: Record<CardEnemyArchetype, BattleRule> = {
  duelist: {
    label: '起式验算',
    check: 'focus',
    min: 1,
    timing: 'opening',
    fail: 3,
  },
  sentinel: {
    label: '护墙自检',
    check: 'guard',
    max: 0,
    timing: 'even',
    channel: 'heal',
    fail: 4,
  },
  sprinter: {
    label: '噪热叠峰',
    check: 'block',
    min: 4,
    timing: 'odd',
    channel: 'pierce',
    fail: 14,
  },
  disruptor: {
    label: '信道挤占',
    check: 'hand',
    max: 4,
    timing: 'late',
    fail: 4,
  },
  regenerator: {
    label: '活性修补',
    check: 'defenses',
    max: 1,
    timing: 'odd',
    channel: 'heal',
    fail: 6,
  },
  counterguard: {
    label: '镜面余量',
    check: 'focus',
    min: 1,
    timing: 'even',
    fail: 5,
  },
};
