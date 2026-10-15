/** 学阶：从大一一路读到院士 */
export enum RealmType {
  QiRefining = '大一',
  Foundation = '大二',
  GoldenCore = '大三',
  NascentSoul = '大四',
  SpiritSevering = '硕士',
  VoidRefining = '博士',
  ImmortalAscension = '院士',
}

export interface CultivationArt {
  id: string;
  name: string;
  type: 'mental' | 'body'; // Mental (理论课) 提升绩点效率，Body (实操课) 永久提升属性
  description: string;
  realmRequirement: RealmType;
  cost: number;
  effects: {
    attack?: number;
    defense?: number;
    hp?: number;
    spirit?: number;
    physique?: number;
    speed?: number;
    expRate?: number; // 例：0.1 表示自习绩点 +10%
  };
}

export enum ItemType {
  Herb = '食材',
  Pill = '饮品',
  Material = '元件',
  Artifact = '外设',
  Weapon = '键鼠',
  Armor = '穿戴',
  Accessory = '挂件',
  Ring = '手环',
  Recipe = '配方',
}

export type ItemRarity = '普通' | '稀有' | '传说' | '绝版';

// 装备部位枚举
export enum EquipmentSlot {
  Head = '头戴',
  Shoulder = '肩背',
  Chest = '上衣',
  Gloves = '手部',
  Legs = '裤装',
  Boots = '鞋履',
  Ring1 = '手环1',
  Ring2 = '手环2',
  Ring3 = '手环3',
  Ring4 = '手环4',
  Accessory1 = '挂件1',
  Accessory2 = '挂件2',
  Artifact1 = '外设1',
  Artifact2 = '外设2',
  Weapon = '键鼠',
}

export interface Item {
  id: string;
  name: string;
  type: ItemType;
  description: string;
  quantity: number;
  rarity?: ItemRarity; // Defaults to '普通' if undefined
  level?: number; // Upgrade level, defaults to 0
  isEquippable?: boolean;
  equipmentSlot?: EquipmentSlot; // 装备部位
  isNatal?: boolean; // 是否为主力外设
  recipeData?: Recipe; // 配方数据（仅当 type 为 Recipe 时使用）
  effect?: {
    hp?: number;
    exp?: number;
    attack?: number;
    defense?: number;
    spirit?: number;
    physique?: number;
    speed?: number;
    breakthroughBonus?: number; // 临时：下次突破成功率加成（0~1，如 0.3 = +30%）
  };
  permanentEffect?: {
    // 永久提升的属性（使用物品后永久增加）
    attack?: number;
    defense?: number;
    spirit?: number;
    physique?: number;
    speed?: number;
    maxHp?: number;
    breakthroughBonus?: number; // 永久：每次突破成功率加成（叠加）
  };
}

/** 社团职级 */
export enum SectRank {
  Outer = '新成员',
  Inner = '正式成员',
  Core = '核心成员',
  Elder = '负责人',
}

/** 副本（竞赛 / 实验室 / 自习室） */
export interface SecretRealm {
  id: string;
  name: string;
  description: string;
  minRealm: RealmType;
  cost: number; // 进入所需学分
  riskLevel: '低' | '中' | '高' | '极度危险';
  drops: string[]; // Description of potential drops
}

// 角色系统扩展
export interface Talent {
  id: string;
  name: string;
  description: string;
  rarity: ItemRarity;
  effects: {
    attack?: number;
    defense?: number;
    hp?: number;
    spirit?: number;
    physique?: number;
    speed?: number;
    expRate?: number;
    luck?: number; // 欧气，影响校园事件和掉落
  };
}

export interface Title {
  id: string;
  name: string;
  description: string;
  requirement: string;
  effects: {
    attack?: number;
    defense?: number;
    hp?: number;
    spirit?: number;
    physique?: number;
    speed?: number;
    expRate?: number;
  };
}

export interface PlayerStats {
  name: string;
  realm: RealmType;
  realmLevel: number; // 1-9
  exp: number;
  maxExp: number;
  hp: number;
  maxHp: number;
  attack: number; // 攻击力
  defense: number; // 防御力
  spirit: number; // 思维（影响解题威力和洞察力）
  physique: number; // 体能（影响精力上限和抗压能力）
  speed: number; // 手速（影响行动顺序和闪避）
  spiritStones: number;
  inventory: Item[];
  cultivationArts: string[]; // IDs of learned arts
  activeArtId: string | null; // 当前主修的理论课 ID
  equippedItems: Partial<Record<EquipmentSlot, string>>; // 装备栏位 -> 物品ID的映射
  sectId: string | null;
  sectRank: SectRank;
  sectContribution: number;
  // 角色系统扩展
  talentId: string | null; // 天赋ID = 灵根+命格（创号时确定，之后不可修改）
  titleId: string | null; // 称号ID
  attributePoints: number; // 可分配属性点
  luck: number; // 幸运值
  /** 临时突破成功率加成（喝特定咖啡后累加，下次突破后清零；0~1 小数） */
  breakthroughBonus?: number;
  // 成就系统
  achievements: string[]; // 已完成的成就ID
  // 室友系统
  pets: Pet[]; // 拥有的室友
  activePetId: string | null; // 当前出战的室友ID
  // 抽奖系统
  lotteryTickets: number; // 抽奖券
  lotteryCount: number; // 累计抽奖次数（用于保底）
  // 传承系统
  inheritanceLevel: number; // 传承等级（0-4，每次传承可跳升1-4个学阶）
  // 每日任务系统
  dailyTaskCount: {
    instant: number; // 今日已完成瞬时任务次数（限制10次）
    short: number; // 今日已完成短暂任务次数（限制5次）
    medium: number; // 今日已完成中等任务次数（限制3次）
    long: number; // 今日已完成较长任务次数（限制2次）
  };
  lastTaskResetDate: string; // 上次重置任务计数的日期（YYYY-MM-DD格式）
  // 成就系统扩展
  viewedAchievements: string[]; // 已查看过的成就ID（用于角标显示）
  // 主力外设系统
  natalArtifactId: string | null; // 主力外设ID
  // 配方系统
  unlockedRecipes: string[]; // 已解锁的配方名称列表
  // 自习回精力速度加成
  meditationHpRegenMultiplier: number; // 自习回精力速度加成倍数（默认1.0，自习时增加）
  meditationBoostEndTime: number | null; // 自习回精力加成结束时间戳（毫秒）
  playtimeSeconds: number; // 游戏时长累计（秒），用于排行榜
  lastLeaderboardSubmit: number; // 上次提交排行榜时间戳（毫秒），用于节流
}

export interface LogEntry {
  id: string;
  text: string;
  type: 'normal' | 'gain' | 'danger' | 'special';
  timestamp: number;
}

export type AdventureType = 'normal' | 'lucky' | 'secret_realm';

export interface AdventureResult {
  story: string;
  hpChange: number;
  expChange: number;
  spiritStonesChange: number;
  lotteryTicketsChange?: number; // 抽奖券变化
  inheritanceLevelChange?: number; // 传承等级变化（1-4，表示可跳升的学阶数）
  attributeReduction?: {
    // 属性降低（遭遇陷阱、邪修等危险事件时）
    attack?: number;
    defense?: number;
    spirit?: number;
    physique?: number;
    speed?: number;
    maxHp?: number;
  };
  triggerSecretRealm?: boolean; // 是否触发随机副本
  itemObtained?: {
    recipeName?: string;
    name: string;
    type: string; // "食材" | "元件" | "外设" | "键鼠" | "穿戴" | "挂件" | "手环"
    description: string;
    rarity?: string;
    isEquippable?: boolean;
    equipmentSlot?: string; // "头戴" | "肩背" | "上衣" | "手部" | "裤装" | "鞋履" | "手环1-4" | "挂件1-2" | "外设1-2" | "键鼠"
    effect?: {
      attack?: number;
      defense?: number;
      hp?: number;
      exp?: number;
      spirit?: number;
      physique?: number;
      speed?: number;
    };
    permanentEffect?: {
      // 永久提升的属性
      attack?: number;
      defense?: number;
      spirit?: number;
      physique?: number;
      speed?: number;
      maxHp?: number;
    };
  };
  itemsObtained?: Array<{
    recipeName?: string;
    // 多个物品（用于搜刮等）
    name: string;
    type: string;
    description: string;
    rarity?: string;
    isEquippable?: boolean;
    equipmentSlot?: string;
    effect?: {
      attack?: number;
      defense?: number;
      hp?: number;
      exp?: number;
      spirit?: number;
      physique?: number;
      speed?: number;
    };
    permanentEffect?: {
      attack?: number;
      defense?: number;
      spirit?: number;
      physique?: number;
      speed?: number;
      maxHp?: number;
    };
  }>;
  petObtained?: string; // 获得的室友模板ID（如 "pet-juanwang"）
  petOpportunity?: {
    // 室友机缘
    type: 'evolution' | 'level' | 'stats' | 'exp'; // 机缘类型：进化、提升等级、提升属性、获得经验
    petId?: string; // 影响的室友ID（可选，为空则随机选择一位室友）
    levelGain?: number; // 提升的等级数（type为'level'时）
    expGain?: number; // 获得的经验值（type为'exp'时）
    statsBoost?: {
      // 属性提升（type为'stats'时）
      attack?: number;
      defense?: number;
      hp?: number;
      speed?: number;
    };
  };
  eventColor: 'normal' | 'gain' | 'danger' | 'special';
}

export interface Recipe {
  name: string;
  cost: number;
  ingredients: { name: string; qty: number }[];
  result: {
    name: string;
    type: ItemType;
    description: string;
    rarity: ItemRarity;
    effect?: {
      hp?: number;
      exp?: number;
      attack?: number;
      defense?: number;
      spirit?: number;
      physique?: number;
      speed?: number;
      breakthroughBonus?: number; // 临时：下次突破成功率加成（0~1）
    };
  };
}

// 校园事件系统
export interface EncounterEvent {
  id: string;
  name: string;
  description: string;
  rarity: ItemRarity;
  triggerChance: number; // 触发概率 (0-1)
  minRealm?: RealmType; // 最低学阶要求
  rewards: {
    exp?: number;
    spiritStones?: number;
    items?: { name: string; rarity: ItemRarity; quantity?: number }[];
    hpChange?: number;
  };
  requirements?: {
    minLuck?: number;
    sectId?: string;
  };
  /** 战斗奇遇：触发后进入特殊战斗，打赢才给 rewards（替代纯奖励叠加） */
  battle?: {
    difficulty: '低' | '中' | '高' | '极度危险';
    enemyName?: string; // 敌人显示名（剧情里）
    enemyTitle?: string; // 敌人称号
    loseHpPenalty?: boolean; // 失败是否按正常战斗掉血（默认 true）
  };
}

// 探索系统
export interface ExplorationLocation {
  id: string;
  name: string;
  description: string;
  minRealm: RealmType;
  cost: number; // 进入消耗
  riskLevel: '低' | '中' | '高' | '极度危险';
  eventTypes: AdventureType[];
  specialEncounters?: string[]; // 特殊校园事件ID列表
}

// 成就系统
export interface Achievement {
  id: string;
  name: string;
  description: string;
  category: 'cultivation' | 'combat' | 'exploration' | 'collection' | 'special';
  requirement: {
    type: string; // 'realm' | 'level' | 'kill' | 'collect' | 'custom'
    value: number;
    target?: string; // 目标名称（如物品名、学阶名等）
  };
  reward: {
    exp?: number;
    spiritStones?: number;
    items?: Item[];
    titleId?: string;
  };
  rarity: ItemRarity;
}

// 室友系统
export interface Pet {
  id: string;
  name: string;
  species: string; // 人设
  level: number;
  exp: number;
  maxExp: number;
  rarity: ItemRarity;
  stats: {
    attack: number;
    defense: number;
    hp: number;
    speed: number; // 速度，影响战斗中的行动顺序
  };
  skills: PetSkill[];
  evolutionStage: number; // 成长阶段 0-2
  affection: number; // 默契度 0-100
  devouredNames?: string[]; // 吞噬过的室友记录（显示用）
}

export interface PetSkill {
  id: string;
  name: string;
  description: string;
  type: 'attack' | 'defense' | 'support' | 'passive';
  effect: {
    damage?: number;
    heal?: number;
    buff?: { attack?: number; defense?: number; hp?: number };
  };
  cooldown?: number;
}

export interface PetTemplate {
  id: string;
  name: string;
  species: string;
  description: string;
  rarity: ItemRarity;
  baseStats: {
    attack: number;
    defense: number;
    hp: number;
    speed: number;
  };
  skills: PetSkill[];
  evolutionRequirements?: {
    level: number;
    items?: { name: string; quantity: number }[];
  };
}

// 抽奖系统
export interface LotteryPrize {
  id: string;
  name: string;
  type: 'item' | 'spiritStones' | 'exp' | 'pet' | 'ticket';
  rarity: ItemRarity;
  weight: number; // 权重，越高越容易抽到
  value: {
    item?: Partial<Item>;
    spiritStones?: number;
    exp?: number;
    petId?: string;
    tickets?: number;
  };
}

// 设置系统
export interface GameSettings {
  soundEnabled: boolean;
  musicEnabled: boolean;
  soundVolume: number; // 0-100
  musicVolume: number; // 0-100
  autoSave: boolean;
  animationSpeed: 'slow' | 'normal' | 'fast';
  language: 'zh' | 'en';
}

// 商店系统
export enum ShopType {
  Village = '校内',
  City = '校外',
  Sect = '社团',
}

export interface ShopItem {
  id: string;
  name: string;
  type: ItemType;
  description: string;
  rarity: ItemRarity;
  price: number; // 购买价格
  sellPrice: number; // 出售价格（通常是购买价格的30-50%）
  effect?: {
    hp?: number;
    exp?: number;
    attack?: number;
    defense?: number;
    spirit?: number;
    physique?: number;
    speed?: number;
  };
  equipmentSlot?: EquipmentSlot;
  isEquippable?: boolean;
  minRealm?: RealmType; // 最低学阶要求
}

export interface Shop {
  id: string;
  name: string;
  type: ShopType;
  description: string;
  items: ShopItem[];
}
