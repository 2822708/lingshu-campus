/**
 * 南邮专属数据
 *
 * 存放与南邮校园/工科元素绑定的游戏内容：
 * - 8 大专业灵根（对应南邮 8 大学院）
 * - 10 种命格
 * - 外设清单（笔记本/外设）
 * - 咖啡配方
 * - 校园事件
 * - 室友类型
 * - 社团信息
 *
 * @author 灵枢
 */

import { Talent } from './types';

// ============ 专业灵根（8 大学院）============

export type LingGenId =
  | 'circuit'      // 电路灵根 - 电子与光学工程学院
  | 'signal'       // 信号灵根 - 通信与信息工程学院
  | 'algorithm'    // 算法灵根 - 计算机学院
  | 'network'      // 网络灵根 - 网络空间安全学院
  | 'optoelectronic' // 光电灵根 - 柔性电子（未来技术）学院
  | 'iot'          // 物联网灵根 - 物联网学院
  | 'material'     // 材料灵根 - 材料科学与工程学院
  | 'automation';  // 自动化灵根 - 自动化学院

export interface LingGen {
  id: LingGenId;
  name: string;           // 灵根名
  college: string;        // 学院名
  slogan: string;         // 学院口号
  description: string;    // 灵根描述
  effects: {
    attack?: number;
    defense?: number;
    hp?: number;
    spirit?: number;
    physique?: number;
    speed?: number;
    expRate?: number;     // 学分积累速度
    luck?: number;
  };
  color: string;          // 主题色（Tailwind class）
  emoji: string;          // emoji 图标
  hiddenPlot: string;     // 隐藏剧情钩子
}

export const LING_GENS: LingGen[] = [
  {
    id: 'circuit',
    name: '电路灵根',
    college: '电子与光学工程学院',
    slogan: '集成万物，电路通神',
    description: '电子在手，天下我有。精通 PCB 设计、芯片验证、模拟电路，玩转 FPGA。',
    effects: { attack: 6, speed: 4 },
    color: 'text-amber-400',
    emoji: '⚡',
    hiddenPlot: '集成电路国家实验室的深夜传说',
  },
  {
    id: 'signal',
    name: '信号灵根',
    college: '通信与信息工程学院',
    slogan: '通达寰宇，信连万物',
    description: '从 5G 到 6G，从电磁波到光通信，掌握信息时代的血脉。',
    effects: { spirit: 8, luck: 2 },
    color: 'text-blue-400',
    emoji: '📡',
    hiddenPlot: '与诺贝尔级老教授的实验室对话',
  },
  {
    id: 'algorithm',
    name: '算法灵根',
    college: '计算机学院',
    slogan: '码行千里，算法为道',
    description: '数据结构与算法是基本功，ACM 校队集训场是圣地。',
    effects: { attack: 4, expRate: 0.15 },
    color: 'text-emerald-400',
    emoji: '💻',
    hiddenPlot: 'ICPC 金牌的师兄传授快速傅里叶变换',
  },
  {
    id: 'network',
    name: '网络灵根',
    college: '网络空间安全学院',
    slogan: '攻防一体，守望网安',
    description: 'CTF 夺旗赛是日常，挖漏洞是本能，能在凌晨三点攻破校园网防火墙。',
    effects: { defense: 8, luck: 3 },
    color: 'text-purple-400',
    emoji: '🛡️',
    hiddenPlot: '国家级护网行动的幕后英雄',
  },
  {
    id: 'optoelectronic',
    name: '光电灵根',
    college: '柔性电子（未来技术）学院',
    slogan: '柔光万象，电照未来',
    description: '从柔性显示到生物电子，研究最前沿的"未来已来"科技。',
    effects: { hp: 10, expRate: 0.1 },
    color: 'text-cyan-400',
    emoji: '🔬',
    hiddenPlot: 'Nature 论文背后的灵感来源',
  },
  {
    id: 'iot',
    name: '物联网灵根',
    college: '物联网学院',
    slogan: '万物互联，感知天下',
    description: '从嵌入式到智慧城市，让每个设备都开口说话。',
    effects: { speed: 6, luck: 4 },
    color: 'text-orange-400',
    emoji: '📱',
    hiddenPlot: '智慧城市大创项目的国家级答辩',
  },
  {
    id: 'material',
    name: '材料灵根',
    college: '材料科学与工程学院',
    slogan: '造物致知，格物穷理',
    description: '从半导体到石墨烯，从纳米到宏观，材料是所有科技的基石。',
    effects: { physique: 8, hp: 6 },
    color: 'text-rose-400',
    emoji: '⚙️',
    hiddenPlot: '半导体材料突破背后的故事',
  },
  {
    id: 'automation',
    name: '自动化灵根',
    college: '自动化学院',
    slogan: '智能控制，自动巡航',
    description: '智能车竞赛是试炼场，从 PID 到深度学习无所不包。',
    effects: { speed: 8, attack: 3 },
    color: 'text-pink-400',
    emoji: '🤖',
    hiddenPlot: '全国大学生智能车竞赛一等奖之路',
  },
];

// ============ 命格（10 种后天属性）============

export type MingGeId =
  | 'juanwang'   // 卷王命
  | 'baizi'      // 摆子命
  | 'ouhuang'     // 欧皇命
  | 'pingmin'     // 平民命
  | 'shekong'     // 社恐命
  | 'sheniu'      // 社牛命
  | 'aoye'        // 熬夜命
  | 'zaoqi'       // 早起命
  | 'tongxiao'    // 通宵命
  | 'danshen';    // 单身命

export interface MingGe {
  id: MingGeId;
  name: string;
  description: string;
  effects: {
    attack?: number;
    defense?: number;
    hp?: number;
    spirit?: number;
    physique?: number;
    speed?: number;
    expRate?: number;
    luck?: number;
  };
  emoji: string;
  flavor: string;       // 一句话点评
}

export const MING_GE: MingGe[] = [
  {
    id: 'juanwang',
    name: '卷王命',
    description: '以卷为道，绩点封神。三点一线是常态，图书馆关门才回宿舍。',
    effects: { expRate: 0.3 },
    emoji: '📚',
    flavor: '"我不是卷，我只是醒得比鸡早。"',
  },
  {
    id: 'baizi',
    name: '摆子命',
    description: '能躺不坐，能坐不站。60 分万岁，多一分浪费。',
    effects: { expRate: -0.3 },
    emoji: '🛌',
    flavor: '"什么是 GPA？能吃吗？"',
  },
  {
    id: 'ouhuang',
    name: '欧皇命',
    description: '欧气爆棚，奇迹常伴。选课不撞雷，食堂阿姨多打菜。',
    effects: { luck: 10 },
    emoji: '🍀',
    flavor: '"不是我强，是命好。"',
  },
  {
    id: 'pingmin',
    name: '平民命',
    description: '没有天赋异禀，也没有校园奇事。平平淡淡才是真。',
    effects: {},
    emoji: '👤',
    flavor: '"愿你出走半生，归来仍是普通人。"',
  },
  {
    id: 'shekong',
    name: '社恐命',
    description: '独处时方为真我。小组作业最怕发言，食堂永远找角落。',
    effects: { expRate: 0.2 }, // 独处时加成
    emoji: '🤐',
    flavor: '"我已经三天没和活人说话了。"',
  },
  {
    id: 'sheniu',
    name: '社牛命',
    description: '自来熟，自带 BGM。社团招新永远第一桌，朋友遍校园。',
    effects: { speed: 5, luck: 3 },
    emoji: '🤩',
    flavor: '"走，我请你喝奶茶。"',
  },
  {
    id: 'aoye',
    name: '熬夜命',
    description: '日落而作，日出而息。晚上效率爆炸，白天半死不活。',
    effects: { expRate: 0.25 }, // 夜间加成
    emoji: '🌙',
    flavor: '"两点之前睡觉的都是弟弟。"',
  },
  {
    id: 'zaoqi',
    name: '早起命',
    description: '日出即起，精神百倍。早餐摊的常驻嘉宾。',
    effects: { expRate: 0.15 }, // 早晨加成
    emoji: '🌅',
    flavor: '"六点的图书馆永远有座位。"',
  },
  {
    id: 'tongxiao',
    name: '通宵命',
    description: '通宵是常态，咖啡是血液。deadline 是第一生产力。',
    effects: { expRate: 0.4 }, // 通宵时加成
    emoji: '🦉',
    flavor: '"今晚做个早睡的人（设了 6 个闹钟）。"',
  },
  {
    id: 'danshen',
    name: '单身命',
    description: '单身二十载，专注力 MAX。爱情？不存在的。',
    effects: { attack: 5, spirit: 5 },
    emoji: '🐕',
    flavor: '"甜甜的爱情什么时候轮到我？"',
  },
];

// ============ 工具函数 ============

/** 根据 ID 查找灵根 */
export function findLingGen(id: string): LingGen | undefined {
  return LING_GENS.find((g) => g.id === id);
}

/** 根据 ID 查找命格 */
export function findMingGe(id: string): MingGe | undefined {
  return MING_GE.find((g) => g.id === id);
}

/** 随机抽取命格 */
export function rollMingGe(): MingGe {
  return MING_GE[Math.floor(Math.random() * MING_GE.length)];
}

/**
 * 把灵根+命格的 effects 合并成 Talent（兼容原游戏系统）
 *
 * 返回的 Talent 可以以特殊 id（如 `npu:circuit:juanwang`）传给 handleStartGame
 * 原游戏系统会通过 getNpuTalent() 查到对应效果
 */
export function mergeNpuTalent(lingGenId: string, mingGeId: string): Talent | null {
  const lingGen = findLingGen(lingGenId);
  const mingGe = findMingGe(mingGeId);
  if (!lingGen || !mingGe) return null;

  const merged: Talent = {
    id: `npu:${lingGenId}:${mingGeId}`,
    name: `${lingGen.emoji}${lingGen.name}·${mingGe.name}`,
    description: `${lingGen.description} ${mingGe.flavor}`,
    rarity: '传说',
    effects: {
      attack: (lingGen.effects.attack || 0) + (mingGe.effects.attack || 0),
      defense: (lingGen.effects.defense || 0) + (mingGe.effects.defense || 0),
      hp: (lingGen.effects.hp || 0) + (mingGe.effects.hp || 0),
      spirit: (lingGen.effects.spirit || 0) + (mingGe.effects.spirit || 0),
      physique: (lingGen.effects.physique || 0) + (mingGe.effects.physique || 0),
      speed: (lingGen.effects.speed || 0) + (mingGe.effects.speed || 0),
      expRate: (lingGen.effects.expRate || 0) + (mingGe.effects.expRate || 0),
      luck: (lingGen.effects.luck || 0) + (mingGe.effects.luck || 0),
    },
  };
  return merged;
}

/**
 * 根据 npu:xxx:yyy 这种 id 反查 Talent
 */
export function getNpuTalent(id: string): Talent | null {
  if (!id.startsWith('npu:')) return null;
  const parts = id.split(':');
  if (parts.length !== 3) return null;
  return mergeNpuTalent(parts[1], parts[2]);
}