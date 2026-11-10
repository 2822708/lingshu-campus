import type {
  CardEffects,
  CardId,
  CardEnemyArchetype,
  CardEnemyMove,
  ResolvedBattleCard,
} from '../card-battle/types';
import { ENEMY_ARCHETYPES } from '../card-battle/enemies';
import type {
  RogueCard,
  RogueCardDefinition,
  RogueJobDefinition,
  RogueJobId,
  RogueNodeKind,
  RogueRelicDefinition,
  RogueRoom,
  RogueRun,
} from './types';

export const JOBS: Record<RogueJobId, RogueJobDefinition> = {
  vanguard: {
    id: 'vanguard',
    name: '机巧器修',
    description: '工坊实训出身，以线圈蓄能与机巧连动炼器破阵。',
    hp: 84,
    attack: 12,
    defense: 8,
    speed: 11,
    starterRelic: 'edge',
    starters: [
      {
        id: 'steady',
        name: '御器基础',
        description: '从机巧实训入门，兼修护体与断路破阵，稳步完成考核。',
        cards: [
          'strike',
          'strike',
          'strike',
          'strike',
          'guard',
          'guard',
          'guard',
          'break',
          'prepare',
          'pressure',
        ],
      },
      {
        id: 'focused',
        name: '谐振爆发',
        description: '先给线圈蓄能，再让机巧接连出手；护体较少，重在抢攻。',
        cards: [
          'strike',
          'strike',
          'strike',
          'guard',
          'guard',
          'windup',
          'windup',
          'followup',
          'pressure',
          'break',
        ],
      },
    ],
  },
  warden: {
    id: 'warden',
    name: '电路阵修',
    description: '电路实验出身，以稳压护阵、负反馈与电容储能守中求胜。',
    hp: 96,
    attack: 10,
    defense: 13,
    speed: 7,
    starterRelic: 'rampart',
    starters: [
      {
        id: 'steady',
        name: '稳压反制',
        description: '观察试炼机巧的行动，以负反馈护阵抵挡后反击。',
        cards: [
          'strike',
          'strike',
          'strike',
          'guard',
          'guard',
          'guard',
          'tactic-riposte',
          'tactic-riposte',
          'prepare',
          'break',
        ],
      },
      {
        id: 'focused',
        name: '储能转攻',
        description: '用电容护阵积存防护，再将储能释放成破阵一击。',
        cards: [
          'strike',
          'strike',
          'guard',
          'guard',
          'tactic-reserve',
          'tactic-reserve',
          'tactic-convert',
          'tactic-convert',
          'break',
          'prepare',
        ],
      },
    ],
  },
  seer: {
    id: 'seer',
    name: '符算修士',
    description: '研习算法与信号，以仿真推演、故障定位和时序调度悟道。',
    hp: 78,
    attack: 10,
    defense: 9,
    speed: 14,
    starterRelic: 'lantern',
    starters: [
      {
        id: 'steady',
        name: '仿真参悟',
        description: '先推演程序、抽取术式，再用微分破势完成集中进攻。',
        cards: [
          'strike',
          'strike',
          'strike',
          'guard',
          'guard',
          'course-code',
          'course-code',
          'insight',
          'course-math',
          'prepare',
        ],
      },
      {
        id: 'focused',
        name: '定位破阵',
        description: '定位阵眼故障，调度专注，为高威力术式腾出出手时机。',
        cards: [
          'strike',
          'strike',
          'strike',
          'guard',
          'guard',
          'tactic-feint',
          'tactic-feint',
          'tactic-reset',
          'course-math',
          'break',
        ],
      },
    ],
  },
};

function describe(card: CardEffects): string {
  return (
    [
      card.clearEnemyBlock ? '清除固守与反震' : '',
      card.damage ? `进攻 ${card.damage}` : '',
      card.block ? `防护 +${card.block}` : '',
      card.heal ? `恢复本场损耗 ${card.heal}` : '',
      card.draw ? `抽 ${card.draw} 张` : '',
      card.nextAttackBonus ? `下次进攻 +${card.nextAttackBonus}` : '',
      card.bonusAfterAttack ? `本轮已进攻时再 +${card.bonusAfterAttack}` : '',
      card.expose ? '破绽：下次进攻 +25%' : '',
      card.counter ? `挡伤且存活时反击 ${card.counter}` : '',
      card.retainBlock ? `本轮最多留盾 ${card.retainBlock}` : '',
      card.blockToDamage
        ? `消耗全部防护，转为${card.blockToDamage}%进攻（上限${card.blockDamageCap}）`
        : '',
      card.focusGain ? `专注 +${card.focusGain}（上限3）` : '',
      card.exhaust ? '本场一次' : '',
    ]
      .filter(Boolean)
      .join('；') + '。'
  );
}
const CARD_ORIGINS: Partial<Record<CardId, string>> = {
  strike: '机巧实训·御器诀',
  guard: '入门功课·护体诀',
  break: '电路分析·断路破阵',
  prepare: '研习室·复盘手记',
  windup: '电磁学·线圈炼器',
  followup: '程序设计·迭代术式',
  fortify: '电源实验·稳压护阵',
  precise: '振动实验·谐振炼器',
  recover: '宿舍静修·调息法',
  'quick-guard': '实训守则·过载保护',
  insight: '仿真实验·预演术',
  pressure: '机巧实训·连动机关',
  'course-code': '程序设计·符算推演',
  'course-early': '晨课·凝神入定',
  'course-math': '高等数学·微分术',
  'course-algorithms': '算法研习·递归术',
  'course-linear': '线性代数·矩阵演算',
  'course-physics': '大学物理·守恒法阵',
  'gear-keyboard': '工坊·机械键盘',
  'gear-uniform': '实训室·防护实验服',
  'gear-earplugs': '研习室·隔音耳塞',
  'gear-wrist': '实验室·调息腕带',
  'tactic-feint': '调试实践·故障定位',
  'tactic-riposte': '控制原理·负反馈',
  'tactic-reserve': '电路实验·电容储能',
  'tactic-convert': '电路实验·储能放电',
  'tactic-reset': '操作系统·时序调度',
  'tactic-observe': '测量实验·误差分析',
  'gear-mechanical': '机巧工坊·齿轮组',
  'gear-red-switch': '程序调试·中断响应',
  'gear-band': '电磁实验·稳流磁环',
  'gear-badge': '资料室·学部工牌',
  'gear-monitor': '信号实验·示波显示器',
  'gear-cooler': '热学实验·散热模组',
};
const make = (
  id: CardId,
  name: string,
  rarity: RogueCardDefinition['rarity'],
  effects: Omit<CardEffects, 'description'>,
  job?: RogueJobId
): RogueCardDefinition => ({
  id,
  name,
  origin: CARD_ORIGINS[id] ?? '基础实训·入门术式',
  rarity,
  ...effects,
  description: describe({ ...effects, description: '' }),
  ...(job ? { job } : {}),
});
export const ROGUE_CARDS: Partial<Record<CardId, RogueCardDefinition>> = {
  strike: make('strike', '基础御器', 'common', {
    cost: 1,
    kind: 'attack',
    damage: 7,
  }),
  guard: make('guard', '凝息护体', 'common', {
    cost: 1,
    kind: 'defense',
    block: 7,
  }),
  break: make('break', '阵眼击破', 'common', {
    cost: 2,
    kind: 'attack',
    damage: 13,
    clearEnemyBlock: true,
  }),
  prepare: make('prepare', '复盘参悟', 'common', {
    cost: 1,
    kind: 'utility',
    draw: 2,
  }),
  windup: make(
    'windup',
    '线圈蓄能',
    'common',
    { cost: 1, kind: 'utility', nextAttackBonus: 9 },
    'vanguard'
  ),
  followup: make(
    'followup',
    '迭代追击',
    'uncommon',
    { cost: 1, kind: 'attack', damage: 6, draw: 1 },
    'vanguard'
  ),
  fortify: make(
    'fortify',
    '稳压护阵',
    'uncommon',
    { cost: 2, kind: 'defense', block: 17 },
    'warden'
  ),
  precise: make(
    'precise',
    '谐振贯击',
    'rare',
    { cost: 2, kind: 'attack', damage: 20 },
    'vanguard'
  ),
  recover: make('recover', '调息归元', 'common', {
    cost: 1,
    kind: 'utility',
    heal: 7,
  }),
  'quick-guard': make('quick-guard', '过载保护', 'common', {
    cost: 0,
    kind: 'defense',
    block: 5,
    exhaust: true,
  }),
  insight: make(
    'insight',
    '仿真预演',
    'uncommon',
    { cost: 0, kind: 'utility', draw: 2, exhaust: true },
    'seer'
  ),
  pressure: make(
    'pressure',
    '机巧连动',
    'common',
    { cost: 1, kind: 'attack', damage: 6, bonusAfterAttack: 5 },
    'vanguard'
  ),
  'course-code': make(
    'course-code',
    '程序推演',
    'common',
    { cost: 1, kind: 'utility', draw: 2, nextAttackBonus: 4 },
    'seer'
  ),
  'course-early': make(
    'course-early',
    '晨课凝神',
    'common',
    { cost: 1, kind: 'defense', block: 6, draw: 1 },
    'warden'
  ),
  'course-math': make(
    'course-math',
    '微分破势',
    'uncommon',
    { cost: 2, kind: 'attack', damage: 18 },
    'seer'
  ),
  'course-algorithms': make(
    'course-algorithms',
    '递归连斩',
    'uncommon',
    { cost: 1, kind: 'attack', damage: 7, bonusAfterAttack: 7 },
    'vanguard'
  ),
  'course-linear': make(
    'course-linear',
    '矩阵护算',
    'common',
    { cost: 1, kind: 'defense', block: 5, draw: 1 },
    'seer'
  ),
  'course-physics': make(
    'course-physics',
    '守恒护阵',
    'rare',
    { cost: 2, kind: 'defense', block: 20, retainBlock: 8 },
    'warden'
  ),
  'gear-keyboard': make(
    'gear-keyboard',
    '键阵敕令',
    'common',
    { cost: 1, kind: 'attack', damage: 10 },
    'vanguard'
  ),
  'gear-uniform': make(
    'gear-uniform',
    '实验服护体',
    'common',
    { cost: 1, kind: 'defense', block: 9 },
    'warden'
  ),
  'gear-earplugs': make('gear-earplugs', '静音入定', 'common', {
    cost: 0,
    kind: 'utility',
    draw: 1,
    exhaust: true,
  }),
  'gear-wrist': make(
    'gear-wrist',
    '腕带调息',
    'uncommon',
    { cost: 1, kind: 'defense', block: 5, heal: 4 },
    'warden'
  ),
  'tactic-feint': make(
    'tactic-feint',
    '故障定位',
    'common',
    { cost: 1, kind: 'utility', draw: 1, expose: true },
    'seer'
  ),
  'tactic-riposte': make(
    'tactic-riposte',
    '负反馈反击',
    'common',
    { cost: 1, kind: 'defense', block: 6, counter: 7 },
    'warden'
  ),
  'tactic-reserve': make(
    'tactic-reserve',
    '电容护阵',
    'common',
    { cost: 1, kind: 'defense', block: 9, retainBlock: 7 },
    'warden'
  ),
  'tactic-convert': make(
    'tactic-convert',
    '储能释放',
    'uncommon',
    {
      cost: 1,
      kind: 'attack',
      damage: 4,
      blockToDamage: 75,
      blockDamageCap: 18,
    },
    'warden'
  ),
  'tactic-reset': make(
    'tactic-reset',
    '时序调度',
    'uncommon',
    { cost: 0, kind: 'utility', focusGain: 1, exhaust: true },
    'seer'
  ),
  'tactic-observe': make('tactic-observe', '误差分析', 'common', {
    cost: 0,
    kind: 'utility',
    expose: true,
    exhaust: true,
  }),
  'gear-mechanical': make(
    'gear-mechanical',
    '齿轮追击',
    'uncommon',
    { cost: 1, kind: 'attack', damage: 5, bonusAfterAttack: 8 },
    'vanguard'
  ),
  'gear-red-switch': make(
    'gear-red-switch',
    '灵感中断',
    'rare',
    { cost: 0, kind: 'utility', draw: 1, focusGain: 1, exhaust: true },
    'seer'
  ),
  'gear-band': make(
    'gear-band',
    '磁环稳流',
    'uncommon',
    { cost: 1, kind: 'defense', block: 5, retainBlock: 10 },
    'warden'
  ),
  'gear-badge': make(
    'gear-badge',
    '铭牌索引',
    'uncommon',
    { cost: 1, kind: 'utility', draw: 1, expose: true },
    'seer'
  ),
  'gear-monitor': make('gear-monitor', '波形解阵', 'uncommon', {
    cost: 1,
    kind: 'utility',
    draw: 1,
    clearEnemyBlock: true,
  }),
  'gear-cooler': make(
    'gear-cooler',
    '热流回馈',
    'rare',
    { cost: 2, kind: 'defense', block: 15, counter: 10 },
    'warden'
  ),
};

const RELIC_ORIGINS: Record<string, string> = {
  edge: '机巧工坊·精密调试',
  rampart: '电路实验室·静电防护',
  lantern: '信号实验室·波形观测',
  fang: '数字电路·逻辑测试',
  ember: '电磁实验·谐振炼器',
  carapace: '电源实验·稳压炼器',
  buckler: '实训室·入场防护',
  anchor: '电路工坊·储能改造',
  thread: '电磁实验·滤波稳阵',
  mirror: '控制实验·反馈耦合',
  thorn: '材料实验·压电回馈',
  compass: '信号实验室·频谱辨识',
  atlas: '资料室·开源术式整理',
  pauldrons: '实训工坊·屏蔽织阵',
  watch: '电路实验室·断路保护',
  blade: '机巧工坊·脉冲炼器',
  cloak: '实训室·绝缘护具',
  tether: '电源实验·稳态储能',
};
const relic = (
  id: string,
  name: string,
  effect: RogueRelicDefinition['effect'],
  amount: number,
  description: string
): RogueRelicDefinition => ({
  id,
  name,
  origin: RELIC_ORIGINS[id],
  effect,
  amount,
  description,
});
export const RELICS: Record<string, RogueRelicDefinition> = {
  edge: relic(
    'edge',
    '调试探针',
    'first-attack',
    2,
    '每轮首次进攻额外造成2点损耗。'
  ),
  rampart: relic(
    'rampart',
    '防静电腕带',
    'opening-block',
    8,
    '每场入场获得8点防护。'
  ),
  lantern: relic('lantern', '示波镜', 'opening-draw', 1, '每场开局多抽1张牌。'),
  fang: relic(
    'fang',
    '逻辑探针',
    'first-attack',
    2,
    '每轮首次进攻额外造成2点损耗。'
  ),
  ember: relic(
    'ember',
    '谐振线圈',
    'first-attack',
    3,
    '每轮首次进攻额外造成3点损耗。'
  ),
  carapace: relic(
    'carapace',
    '稳压护符',
    'first-defense',
    3,
    '每轮首次防御额外获得3点防护。'
  ),
  buckler: relic(
    'buckler',
    '实验护目镜',
    'opening-block',
    7,
    '每场入场获得7点防护。'
  ),
  anchor: relic(
    'anchor',
    '储能模组',
    'retain-block',
    4,
    '每轮敌袭后最多保留额外4点未消耗防护。'
  ),
  thread: relic(
    'thread',
    '铁氧体磁环',
    'retain-block',
    3,
    '每轮敌袭后最多保留额外3点未消耗防护。'
  ),
  mirror: relic(
    'mirror',
    '反馈耦合器',
    'guard-counter',
    3,
    '每轮抵挡损耗且存活时，反击3点损耗。'
  ),
  thorn: relic(
    'thorn',
    '压电晶片',
    'guard-counter',
    4,
    '每轮抵挡损耗且存活时，反击4点损耗。'
  ),
  compass: relic('compass', '频谱仪', 'opening-draw', 1, '每场开局多抽1张牌。'),
  atlas: relic('atlas', '开源术式册', 'opening-draw', 1, '每场开局多抽1张牌。'),
  pauldrons: relic(
    'pauldrons',
    '屏蔽实验服',
    'first-defense',
    4,
    '每轮首次防御额外获得4点防护。'
  ),
  watch: relic(
    'watch',
    '断路保护器',
    'opening-block',
    10,
    '每场入场获得10点防护。'
  ),
  blade: relic(
    'blade',
    '高压脉冲器',
    'first-attack',
    4,
    '每轮首次进攻额外造成4点损耗。'
  ),
  cloak: relic(
    'cloak',
    '绝缘手套',
    'first-defense',
    2,
    '每轮首次防御额外获得2点防护。'
  ),
  tether: relic(
    'tether',
    '稳态电容组',
    'retain-block',
    5,
    '每轮敌袭后最多保留额外5点未消耗防护。'
  ),
};

const ROGUE_CHAPTERS = [
  {
    name: '基础课筑基',
    place: '公共研习室',
    goal: '由入门术式筑牢根基，直面高数心魔。',
  },
  {
    name: '实验炼器',
    place: '电路实训室',
    goal: '在实验中炼制法器，校准失控谐振阵。',
  },
  {
    name: '竞赛论道',
    place: '学部竞赛试境',
    goal: '用专业术式穿过噪声干扰，完成竞赛考核。',
  },
  {
    name: '课题攻关',
    place: '课题组工坊',
    goal: '抓住维护窗口，破解自修复灵傀的循环。',
  },
  {
    name: '结业渡劫',
    place: '综合答辩试境',
    goal: '贯通课程与炼器所得，迎接最后的答辩天劫。',
  },
];

export function getRogueChapter(chapter: number): {
  name: string;
  place: string;
  goal: string;
} {
  if (!Number.isInteger(chapter) || chapter < 1 || chapter > 5)
    throw new Error('章节必须为1–5。');
  return { ...ROGUE_CHAPTERS[chapter - 1] };
}

export function getChapter(floor: number): number {
  return Math.max(1, Math.min(5, Math.ceil(floor / 10)));
}
export function getNodeKind(floor: number): RogueNodeKind {
  if (!Number.isInteger(floor) || floor < 1 || floor > 50)
    throw new Error('关数必须为1–50。');
  const position = floor % 10;
  return position === 0
    ? 'boss'
    : position === 3
      ? 'event'
      : position === 4 || position === 8
        ? 'elite'
        : position === 5 || position === 9
          ? 'camp'
          : position === 7
            ? 'shop'
            : 'battle';
}
const BOSSES = [
  {
    name: '高数心魔',
    description:
      '基础课试境凝成的高数心魔。观察推导蓄力，挡住压轴重击后集中破势。',
    archetype: 'duelist',
    pattern: [
      {
        type: 'adjust',
        name: '压轴起式',
        description: '心魔铺开压轴推导，本轮蓄力，下一轮发动重击。',
        damageMultiplier: 0.15,
      },
      {
        type: 'strong',
        name: '极限追问',
        description: '压轴追问化为重击；准备护体术式，或在其出手前击破。',
        damageMultiplier: 1.4,
      },
      {
        type: 'adjust',
        name: '推导间隙',
        description: '心魔重整推导，本轮来袭较弱，适合复盘抽牌。',
        damageMultiplier: 0.35,
      },
    ],
  },
  {
    name: '失控谐振阵',
    description:
      '电路实验中失稳的谐振阵。正反馈会反震，阵眼击破可同时清除固守与反震。',
    archetype: 'sentinel',
    pattern: [
      {
        type: 'guard',
        name: '正反馈成环',
        description: '正反馈环路凝成护阵，固守两轮并带反震；先破阵眼再进攻。',
        damageMultiplier: 0.4,
        thornsPercent: 8,
      },
      {
        type: 'strong',
        name: '谐振脉冲',
        description: '积蓄的振荡化为脉冲横扫，尚未破除的固守仍然生效。',
        damageMultiplier: 0.9,
      },
      {
        type: 'adjust',
        name: '断电校准',
        description: '谐振阵短暂断电校准，本轮没有反震，适合集中进攻。',
        damageMultiplier: 0.25,
      },
    ],
  },
  {
    name: '噪声灵障',
    description:
      '竞赛试境中的噪声聚形。干扰会穿透部分防护，兼顾精力与进攻节奏。',
    archetype: 'disruptor',
    pattern: [
      {
        type: 'adjust',
        name: '宽带噪声',
        description: '宽带噪声侵入护阵，50%的来袭穿透防护。',
        damageMultiplier: 0.45,
        piercePercent: 50,
      },
      {
        type: 'strong',
        name: '尖峰干扰',
        description: '尖峰干扰化为重击，其中35%穿透防护。',
        damageMultiplier: 0.95,
        piercePercent: 35,
      },
      {
        type: 'adjust',
        name: '信道切换',
        description: '噪声灵障正在切换信道，本轮没有穿透，可稳住阵线。',
        damageMultiplier: 0.25,
      },
    ],
  },
  {
    name: '自修复灵傀',
    description:
      '课题组试验中的自修复机巧。修补循环不断发生，维护窗口是集中破阵的时机。',
    archetype: 'regenerator',
    pattern: [
      {
        type: 'adjust',
        name: '自适应修补',
        description: '自适应回路重建灵件，行动时修复自身精力上限的5%。',
        damageMultiplier: 0.25,
        healPercent: 5,
      },
      {
        type: 'strong',
        name: '故障复现',
        description: '旧故障再次爆发，本轮重击；下一轮将继续重组灵件。',
        damageMultiplier: 1.1,
      },
      {
        type: 'adjust',
        name: '重组灵件',
        description: '回收散落元件重组，行动时修复自身精力上限的3%。',
        damageMultiplier: 0.4,
        healPercent: 3,
      },
      {
        type: 'adjust',
        name: '维护窗口',
        description: '机巧进入维护窗口，本轮没有修复，适合集中进攻。',
        damageMultiplier: 0.2,
      },
    ],
  },
  {
    name: '答辩天劫',
    description:
      '综合答辩凝成的结业天劫。依次检验破阵、抗扰、护体与爆发，贯通整套术式。',
    archetype: 'counterguard',
    pattern: [
      {
        type: 'guard',
        name: '论证护阵',
        description: '论证凝成护阵，固守两轮并带反震；阵眼击破可解除。',
        damageMultiplier: 0.4,
        thornsPercent: 10,
      },
      {
        type: 'adjust',
        name: '追问阵眼',
        description: '追问直指阵眼，本轮40%的来袭穿透防护。',
        damageMultiplier: 0.45,
        piercePercent: 40,
      },
      {
        type: 'strong',
        name: '结业劫雷',
        description: '结业劫雷将落，本轮发动最强重击，提前准备护体术式。',
        damageMultiplier: 1.25,
      },
      {
        type: 'adjust',
        name: '补全论证',
        description: '天劫补全论证，本轮修复自身精力上限的4%。',
        damageMultiplier: 0.25,
        healPercent: 4,
      },
      {
        type: 'adjust',
        name: '答辩间隙',
        description: '答辩进入停顿，劫势最弱，适合用已领悟的术式集中突破。',
        damageMultiplier: 0.1,
      },
    ],
  },
] satisfies Array<{
  name: string;
  description: string;
  archetype: CardEnemyArchetype;
  pattern: CardEnemyMove[];
}>;
export function getBoss(chapter: number): {
  name: string;
  description: string;
} {
  if (!Number.isInteger(chapter) || chapter < 1 || chapter > 5)
    throw new Error('章节必须为1–5。');
  return {
    name: BOSSES[chapter - 1].name,
    description: BOSSES[chapter - 1].description,
  };
}
const NAMES: Record<CardEnemyArchetype, string> = {
  duelist: '试炼剑傀',
  sentinel: '稳压阵偶',
  sprinter: '过载机蜂',
  disruptor: '干扰灵影',
  regenerator: '自修复机关',
  counterguard: '反射护阵',
};
const GUIDES: Record<CardEnemyArchetype, string> = {
  duelist: '剑傀先校验御器回路，再集中重斩。复位时适合调度术式。',
  sentinel: '稳压阵偶先固守再放电。阵眼击破可以打开进攻窗口。',
  sprinter: '机蜂开场过载，带少量穿透，随后逐轮散热。',
  disruptor: '干扰灵影的脉冲会穿透部分防护。留意预计损失。',
  regenerator: '机巧定期修补灵件。抓住扫描窗口集中进攻。',
  counterguard: '护阵起式时会反震。先破阵眼，再集中出手。',
};

type RogueMoveText = Pick<CardEnemyMove, 'name' | 'description'>;

// Keys are the shared battle actions used by older trial snapshots.
const TRIAL_MOVES: Record<string, RogueMoveText> = {
  开场试探: {
    name: '入门校验',
    description: '剑傀校验御器回路，以试斩探路。下一轮会集中重斩。',
  },
  集中追问: {
    name: '御器重斩',
    description: '回路校验完成，剑傀集中重斩。准备护体或在它出手前击破。',
  },
  整理提纲: {
    name: '剑阵复位',
    description: '重斩后剑阵复位，本轮来袭较弱，适合复盘抽牌。',
  },
  封闭论证: {
    name: '稳压成阵',
    description:
      '稳压回路撑起两轮固守，受到的进攻损耗减半。阵眼击破可提前解除。',
  },
  交叉检查: {
    name: '采样校准',
    description: '阵偶校准采样回路，本轮来袭较弱。未解除的固守仍然生效。',
  },
  核心质疑: {
    name: '脉冲放电',
    description: '固守结束，储存的灵力化为脉冲重击。可提前布下防护。',
  },
  抢占先手: {
    name: '过载突进',
    description: '机蜂过载突进，部分来袭穿透防护。剩余部分仍可抵挡。',
  },
  连续发问: {
    name: '高频连扰',
    description: '驱动回路维持高频攻势，本轮来袭没有穿透。',
  },
  换气停顿: {
    name: '散热冷却',
    description: '机蜂放缓输出以散热，本轮适合整理手牌。',
  },
  突发打断: {
    name: '脉冲干扰',
    description: '干扰灵影发出短脉冲，总来袭较低，部分伤害穿透防护。',
  },
  重点干扰: {
    name: '频段侵入',
    description: '干扰锁定频段后发动重击，部分伤害穿透防护。',
  },
  重新提问: {
    name: '信道复位',
    description: '干扰信道正在复位，本轮没有穿透，可用防护与反击稳住节奏。',
  },
  自我修补: {
    name: '回路自修',
    description: '机巧修补回路，行动时恢复部分已损耗的精力。可提前击破。',
  },
  错误复现: {
    name: '缺陷爆发',
    description: '故障复现，刚修补的机巧会发出重击。提前布下护阵。',
  },
  定位残留: {
    name: '灵件扫描',
    description: '机巧扫描故障灵件，本轮没有修复，是集中进攻的机会。',
  },
  反问架势: {
    name: '反射成阵',
    description: '反射回路固守两轮，本轮受到非致命进攻时反震。阵眼击破可解除。',
  },
  追究细节: {
    name: '反馈冲击',
    description: '回路发动反馈冲击，本轮没有反震。若固守仍在，可先破阵。',
  },
  倾听结论: {
    name: '阵纹消散',
    description: '反射阵纹消散，本轮来袭较弱，适合集中进攻。',
  },
};

const MOVE_TEXT_BY_NAME = new Map<string, RogueMoveText>([
  ...Object.entries(TRIAL_MOVES),
  ...Object.values(TRIAL_MOVES).map((move) => [move.name, move] as const),
  ...BOSSES.flatMap(({ pattern }) =>
    pattern.map(
      ({ name, description }) => [name, { name, description }] as const
    )
  ),
]);

/** Theme text only. The caller preserves the original action and all values. */
export function getRogueMoveText(name: string): RogueMoveText | undefined {
  return (
    MOVE_TEXT_BY_NAME.get(name) ??
    (Object.hasOwn(ROGUE_LEGACY_NAMES, name)
      ? MOVE_TEXT_BY_NAME.get(ROGUE_LEGACY_NAMES[name])
      : undefined)
  );
}

export function createRogueRoom(
  run: RogueRun,
  index: number,
  archetype: CardEnemyArchetype,
  kind = getNodeKind(run.floor)
): RogueRoom {
  const chapter = getChapter(run.floor),
    local = (run.floor - 1) % 10;
  const boss = kind === 'boss' ? BOSSES[chapter - 1] : undefined;
  const actualArchetype = boss?.archetype ?? archetype;
  const elite = kind === 'elite';
  const hp = boss
    ? 58 + chapter * 15
    : Math.round(
        (24 + chapter * 7 + local * 1.8) *
          (elite ? 1.45 : 1) *
          (archetype === 'sentinel' ? 1.1 : archetype === 'sprinter' ? 0.9 : 1)
      );
  const attack = boss
    ? 11 + chapter * 3
    : 7 + chapter * 2 + Math.floor(local / 3) + (elite ? 2 : 0);
  return {
    id: `${run.runId}:room:${run.floor}:${index}`,
    name: boss?.name ?? `${elite ? '精英·' : ''}${NAMES[archetype]}`,
    description: boss?.description ?? GUIDES[archetype],
    enemy: {
      name: boss?.name ?? NAMES[archetype],
      title: boss ? '章节考核' : elite ? '实训精英' : '学园试阵',
      realm: `第${chapter}章`,
      hp,
      maxHp: hp,
      attack,
      defense: 2 + chapter,
      speed: 7 + chapter * 2,
      behavior:
        actualArchetype === 'sentinel' || actualArchetype === 'counterguard'
          ? 'defensive'
          : actualArchetype === 'sprinter'
            ? 'aggressive'
            : 'balanced',
      archetype: actualArchetype,
      pattern: (boss?.pattern ?? ENEMY_ARCHETYPES[actualArchetype].pattern).map(
        (move) => ({ ...move, ...getRogueMoveText(move.name) })
      ),
    },
  };
}

export function resolveRogueCard(
  run: RogueRun,
  card: RogueCard
): ResolvedBattleCard {
  const definition = ROGUE_CARDS[card.cardId];
  if (!definition) throw new Error('找不到试炼术式。');
  const { id, name, origin, ...base } = definition;
  const effects: CardEffects &
    Partial<Pick<RogueCardDefinition, 'rarity' | 'job'>> = base;
  delete effects.rarity;
  delete effects.job;
  const growth = 1 + (getChapter(run.floor) - 1) * 0.12;
  for (const field of [
    'damage',
    'block',
    'heal',
    'nextAttackBonus',
    'bonusAfterAttack',
    'counter',
    'retainBlock',
    'blockDamageCap',
  ] as const) {
    const amount = effects[field];
    const roleScale =
      field === 'block' || field === 'retainBlock'
        ? JOBS[run.jobId].defense / 10
        : field === 'heal'
          ? 1
          : JOBS[run.jobId].attack / 10;
    if (amount)
      effects[field] = Math.max(
        1,
        Math.round(
          (amount + card.level * (field === 'nextAttackBonus' ? 3 : 2)) *
            growth *
            roleScale
        )
      );
  }
  if (effects.draw) effects.draw = Math.min(4, effects.draw + card.level);
  if (effects.focusGain)
    effects.focusGain = Math.min(3, effects.focusGain + card.level);
  if (effects.expose && !effects.draw && card.level) effects.draw = card.level;
  effects.description = describe(effects);
  return {
    id: card.id,
    templateId: id,
    name: `${name}${card.level ? ` +${card.level}` : ''}`,
    ...effects,
    source: 'basic',
    sourceLabel: origin,
    scalingLabel: `${getRogueChapter(getChapter(run.floor)).name} · 参悟${card.level}/2`,
  };
}
export function getShopPrices(run: RogueRun): {
  heal: number;
  upgrade: number;
  relic: number;
} {
  const chapter = getChapter(run.floor) - 1;
  return {
    heal: 30 + chapter * 5,
    upgrade: 50 + chapter * 8,
    relic: 90 + chapter * 15,
  };
}

/** Legacy names are projected only for display; frozen battle values keep their original meaning. */
export const ROGUE_LEGACY_NAMES: Record<string, string> = {
  锋行者: '机巧器修',
  守阵者: '电路阵修',
  推演师: '符算修士',
  均衡强攻: '御器基础',
  连击蓄势: '谐振爆发',
  稳守反击: '稳压反制',
  盾势转攻: '储能转攻',
  抽牌准备: '仿真参悟',
  破绽爆发: '定位破阵',
  踏前斩: '基础御器',
  架起防线: '凝息护体',
  破阵: '阵眼击破',
  整理思路: '复盘参悟',
  凝神蓄势: '线圈蓄能',
  追步: '迭代追击',
  坚壁: '稳压护阵',
  一锤定音: '谐振贯击',
  稳住呼吸: '调息归元',
  紧急招架: '过载保护',
  预见: '仿真预演',
  连贯突击: '机巧连动',
  推演线索: '程序推演',
  守中待机: '晨课凝神',
  洞悉核心: '微分破势',
  疾风连段: '递归连斩',
  预判架势: '矩阵护算',
  不动阵: '守恒护阵',
  快刃: '键阵敕令',
  重整甲胄: '实验服护体',
  片刻专注: '静音入定',
  疗伤戒备: '腕带调息',
  虚实探路: '故障定位',
  迎击: '负反馈反击',
  固守余势: '电容护阵',
  盾势反攻: '储能释放',
  拨转时机: '时序调度',
  看破: '误差分析',
  双重追击: '齿轮追击',
  灵光转念: '灵感中断',
  延展防线: '磁环稳流',
  识破弱点: '铭牌索引',
  拆解阵势: '波形解阵',
  铜墙反震: '热流回馈',
  磨锋石: '调试探针',
  旧城壁垒: '防静电腕带',
  引路灯: '示波镜',
  猎牙: '逻辑探针',
  余烬徽记: '谐振线圈',
  龟甲片: '稳压护符',
  折叠圆盾: '实验护目镜',
  石锚: '储能模组',
  记忆丝线: '铁氧体磁环',
  回声镜: '反馈耦合器',
  荆棘扣: '压电晶片',
  旧罗盘: '频谱仪',
  远行图册: '开源术式册',
  青铜肩甲: '屏蔽实验服',
  守夜印章: '断路保护器',
  残刃: '高压脉冲器',
  旅人披风: '绝缘手套',
  系留绳: '稳态电容组',
  钟塔守望: '高数心魔',
  镜甲司书: '失控谐振阵',
  裂隙游猎者: '噪声灵障',
  回响缝合者: '自修复灵傀',
  终页裁决者: '答辩天劫',
  敲响前奏: '压轴起式',
  钟摆重锤: '极限追问',
  摆锤回落: '推导间隙',
  镜甲封卷: '正反馈成环',
  断章横扫: '谐振脉冲',
  翻阅空白: '断电校准',
  裂隙试探: '宽带噪声',
  虚空穿刺: '尖峰干扰',
  追猎换位: '信道切换',
  回响缝合: '自适应修补',
  回声迸发: '故障复现',
  残片回收: '重组灵件',
  针脚停顿: '维护窗口',
  封存终页: '论证护阵',
  直抵本心: '追问阵眼',
  终页裁决: '结业劫雷',
  回收文字: '补全论证',
  余墨将尽: '答辩间隙',
  巡路剑客: '试炼剑傀',
  石甲守卫: '稳压阵偶',
  逐风斥候: '过载机蜂',
  裂隙侍从: '干扰灵影',
  回响残影: '自修复机关',
  荆棘监守: '反射护阵',
  ...Object.fromEntries(
    Object.entries(TRIAL_MOVES).map(([old, move]) => [old, move.name])
  ),
};
