import {
  AdventureResult,
  AdventureType,
  PlayerStats,
  RealmType,
  ItemRarity,
  ItemType,
  EquipmentSlot,
  Item,
} from '../types';
import { REALM_ORDER, DISCOVERABLE_RECIPES } from '../constants';
import { generateEnemyName } from './aiService';

const randomId = () => Math.random().toString(36).slice(2, 9);

/**
 * 敌人数值基础表（按境界 + 玩家层级查表，**与玩家属性完全脱钩**）
 *
 * 设计原则：
 *   - 每个境界有独立的敌人基准，与玩家 REALM_DATA 数值无关
 *   - 玩家再强，敌人数值也只受境界档位 + 玩家层级约束
 *   - 数值范围：大一怪 ~10 攻 / 50 血；院士怪 ~80 攻 / 700 血（安全范围）
 *
 * 索引 [境界索引][玩家层级 1-9]：
 *   - 每个境界 9 行（realmLevel 1~9）
 *   - 行：baseAttack / baseDefense / baseMaxHp / baseSpeed
 */
type EnemyBaseRow = {
  baseAttack: number;
  baseDefense: number;
  baseMaxHp: number;
  baseSpeed: number;
};

/** 按境界 × 玩家层级生成敌人基础数值 */
function getEnemyBaseForRealm(
  realm: RealmType,
  realmLevel: number
): EnemyBaseRow {
  const idx = REALM_ORDER.indexOf(realm);
  // 公式（与玩家 REALM_DATA 解耦，曲线更平缓）：
  //   attack  = 8 + idx*9 + (level-1)*2
  //   defense = 5 + idx*6 + (level-1)*1
  //   maxHp   = 50 + idx*100 + (level-1)*25
  //   speed   = 6 + idx*3 + (level-1)*1
  const lvl = Math.max(1, Math.min(9, realmLevel));
  return {
    baseAttack: 8 + idx * 9 + (lvl - 1) * 2,
    baseDefense: 5 + idx * 6 + (lvl - 1) * 1,
    baseMaxHp: 50 + idx * 100 + (lvl - 1) * 25,
    baseSpeed: 6 + idx * 3 + (lvl - 1) * 1,
  };
}

const ENEMY_NAMES = [
  // BUG 类（大一大二低阶）
  '空指针异常',
  '内存泄漏',
  '段错误',
  '死循环',
  '编译错误',
  '语法报错',
  '玄学 BUG',
  '环境变量错',
  '头文件失踪',
  '链接失败',
  '栈溢出',
  '数组越界',
  '野指针',
  '竞态条件',
  '未定义行为',
  '死锁',
  '内存爆栈',
  '缓存击穿',
  '雪崩请求',
  '蓝屏报错',
  '核心转储',
  '段错误刺客',
  '除零异常',
  '未捕获异常',
  '协议握手失败',
  '超时连接',
  '丢包幽灵',
  '404 幽灵',
  '断网怨灵',
  '卡顿魔',
  '蓝屏使',
  '乱码妖',

  // DDL 类（大二大三）
  'DDL 幽灵',
  '通宵 DDL',
  '三重 DDL',
  '实验报告 DDL',
  '课程设计 DDL',
  '期末周 DDL',
  '小组作业 DDL',
  '选课截止 DDL',
  '奖学金 DDL',
  '抢课系统',
  '刷课机',
  '退补选日',
  '查寝阿姨',
  '严苛助教',
  '点名老师',
  '监考老登',
  '突击检查',
  '随堂测验',
  '课堂提问',
  '小组答辩',
  '盲审评委',

  // 考试类（大三大四）
  '高数期末',
  '模电实验',
  '信号与系统',
  '考研数学',
  '六级听力',
  '计算机网络',
  '数据结构机考',
  '嵌入式实验',
  '通信原理',
  '数字电路',
  '概率论大题',
  '线代证明题',
  '考研政治',
  '考研英语',
  '复试现场',

  // 人物类 / 答辩 / 高阶敌人（硕博）
  '严厉助教',
  '点名的老师',
  '答辩委员',
  '查寝阿姨',
  '抢课系统',
  '实验室断电王',
  '服务器宕机',
  '机房爆炸',
  '路由器罢工',
  '期末突击队',
  '盲审老登',
  '开题答辩团',
  '中期检查组',
  '查重 AI',
  '外审专家',
  '评审组长',
  '学位委员会',
];

const ENEMY_TITLES = [
  // BUG 称号
  '低级 Bug',
  '中级 Bug',
  '高级 Bug',
  '致命 Bug',
  '潜伏 Bug',
  '玄学 Bug',
  '间歇性 Bug',
  '复现不出',
  '环境专属',
  '众测报告',

  // DDL 称号
  'DDL 终结者',
  '催命 DDL',
  '死亡周线',
  '退补选日',
  '查寝阿姨',
  '随堂测验',
  '课堂提问',
  '突击点名',

  // 考试称号
  '期中考霸',
  '期末魔王',
  '机考老登',
  '实验课杀手',
  '考研拦路虎',
  '复试把关人',
  '盲审老登',

  // 人物 / 答辩 / 高阶称号
  '答辩委员',
  '评审组长',
  '学位委员',
  '外审专家',
  '查重 AI',
  '开题团长',
  '中期检查员',
  '严苛助教',
  '实验课助教',
  '机房管理员',
  '宿管阿姨',
  '教务处老登',
  '选课系统',
  '抢课服务器',

  // 其他校园头衔
  '失意学子',
  '延毕预备役',
  '挂科边缘人',
  '重修常客',
  '通宵常客',
  '赶 DDL 王',
  '退学警告',
  '小组划水王',
  '代码搬运工',
];

// 根据风险等级计算战斗难度
export const getBattleDifficulty = (
  adventureType: AdventureType,
  riskLevel?: '低' | '中' | '高' | '极度危险'
): number => {
  if (adventureType === 'secret_realm' && riskLevel) {
    // 副本根据风险等级调整难度
    const riskMultipliers = {
      低: 1.0,
      中: 1.25,
      高: 1.5,
      极度危险: 2.0,
    };
    return riskMultipliers[riskLevel];
  }
  // 非副本使用固定难度
  const baseDifficulty: Record<AdventureType, number> = {
    normal: 1,
    lucky: 0.85,
    secret_realm: 1.25,
  };
  return baseDifficulty[adventureType];
};

const baseBattleChance: Record<AdventureType, number> = {
  normal: 0.22,
  lucky: 0.08,
  secret_realm: 0.45,
};

const pickOne = <T>(list: T[], random = Math.random): T =>
  list[Math.floor(random() * list.length)];

// 搜刮奖励物品名称库（校园版）
interface LootItem {
  name: string;
  type: ItemType;
  rarity: ItemRarity;
  slot?: EquipmentSlot;
  // 旧掉落表包含 maxHp；保留该字段以兼容既有掉落结果。
  effect?: Item['effect'] & Pick<Item['permanentEffect'], 'maxHp'>;
  permanentEffect?: Item['permanentEffect'];
}

const LOOT_ITEMS: Record<
  | 'herbs'
  | 'pills'
  | 'materials'
  | 'weapons'
  | 'armors'
  | 'accessories'
  | 'rings'
  | 'artifacts',
  LootItem[]
> = {
  // 食材类（咖啡豆 / 茶包 / 柠檬片）
  herbs: [
    {
      name: '速溶咖啡粉',
      type: ItemType.Herb,
      rarity: '普通' as ItemRarity,
      effect: { hp: 20 },
    },
    { name: '绿茶茶包', type: ItemType.Herb, rarity: '普通' as ItemRarity },
    {
      name: '红茶叶',
      type: ItemType.Herb,
      rarity: '普通' as ItemRarity,
      effect: { hp: 30 },
    },
    {
      name: '挂耳咖啡',
      type: ItemType.Herb,
      rarity: '稀有' as ItemRarity,
      effect: { hp: 50, spirit: 5 },
    },
    {
      name: '手冲咖啡豆',
      type: ItemType.Herb,
      rarity: '稀有' as ItemRarity,
      effect: { hp: 80 },
    },
    {
      name: '耶加雪菲豆',
      type: ItemType.Herb,
      rarity: '传说' as ItemRarity,
      effect: { hp: 150, maxHp: 20 },
    },
    {
      name: '瑰夏咖啡豆',
      type: ItemType.Herb,
      rarity: '绝版' as ItemRarity,
      effect: { hp: 300, maxHp: 50 },
    },
  ],
  // 饮品类（美式 / 拿铁 / 红牛）
  pills: [
    {
      name: '冰美式',
      type: ItemType.Pill,
      rarity: '普通' as ItemRarity,
      effect: { hp: 50 },
    },
    {
      name: '生椰拿铁',
      type: ItemType.Pill,
      rarity: '普通' as ItemRarity,
      effect: { exp: 20 },
    },
    {
      name: '红牛',
      type: ItemType.Pill,
      rarity: '稀有' as ItemRarity,
      permanentEffect: { physique: 5 },
    },
    {
      name: '东鹏特饮',
      type: ItemType.Pill,
      rarity: '稀有' as ItemRarity,
      permanentEffect: { spirit: 5 },
    },
    {
      name: '手冲特调',
      type: ItemType.Pill,
      rarity: '传说' as ItemRarity,
      effect: { exp: 100 },
    },
    {
      name: '冰博克浓缩',
      type: ItemType.Pill,
      rarity: '传说' as ItemRarity,
      effect: { exp: 200 },
    },
    {
      name: '深夜冰美式',
      type: ItemType.Pill,
      rarity: '绝版' as ItemRarity,
      effect: { exp: 500 },
      permanentEffect: { maxHp: 100 },
    },
  ],
  // 元件类（电阻 / 杜邦线 / STM32 开发板）
  materials: [
    { name: '电阻包', type: ItemType.Material, rarity: '普通' as ItemRarity },
    { name: '杜邦线', type: ItemType.Material, rarity: '普通' as ItemRarity },
    { name: '面包板', type: ItemType.Material, rarity: '稀有' as ItemRarity },
    { name: '贴片电容', type: ItemType.Material, rarity: '普通' as ItemRarity },
    { name: '运放芯片', type: ItemType.Material, rarity: '稀有' as ItemRarity },
    {
      name: 'STM32 开发板',
      type: ItemType.Material,
      rarity: '稀有' as ItemRarity,
    },
    {
      name: 'FPGA 实验板',
      type: ItemType.Material,
      rarity: '传说' as ItemRarity,
    },
    {
      name: '示波器探头',
      type: ItemType.Material,
      rarity: '绝版' as ItemRarity,
    },
  ],
  // 装备类（键鼠）
  weapons: [
    {
      name: '入门薄膜键盘',
      type: ItemType.Weapon,
      rarity: '普通' as ItemRarity,
      slot: EquipmentSlot.Weapon,
      effect: { attack: 10 },
    },
    {
      name: '红轴机械键盘',
      type: ItemType.Weapon,
      rarity: '稀有' as ItemRarity,
      slot: EquipmentSlot.Weapon,
      effect: { attack: 30 },
    },
    {
      name: '光轴电竞键盘',
      type: ItemType.Weapon,
      rarity: '传说' as ItemRarity,
      slot: EquipmentSlot.Weapon,
      effect: { attack: 80, speed: 10 },
    },
    {
      name: '客制化静电容键盘',
      type: ItemType.Weapon,
      rarity: '绝版' as ItemRarity,
      slot: EquipmentSlot.Weapon,
      effect: { attack: 200, spirit: 50 },
    },
  ],
  // 装备类（穿戴）- 包含所有部位
  armors: [
    // 普通 - 头戴
    {
      name: '鸭舌帽',
      type: ItemType.Armor,
      rarity: '普通' as ItemRarity,
      slot: EquipmentSlot.Head,
      effect: { defense: 3, hp: 15 },
    },
    // 普通 - 肩背
    {
      name: '双肩电脑包',
      type: ItemType.Armor,
      rarity: '普通' as ItemRarity,
      slot: EquipmentSlot.Shoulder,
      effect: { defense: 3, hp: 15 },
    },
    // 普通 - 上衣
    {
      name: '素色卫衣',
      type: ItemType.Armor,
      rarity: '普通' as ItemRarity,
      slot: EquipmentSlot.Chest,
      effect: { defense: 5, hp: 20 },
    },
    // 普通 - 手部
    {
      name: '防静电手套',
      type: ItemType.Armor,
      rarity: '普通' as ItemRarity,
      slot: EquipmentSlot.Gloves,
      effect: { defense: 3, hp: 15 },
    },
    // 普通 - 裤装
    {
      name: '运动长裤',
      type: ItemType.Armor,
      rarity: '普通' as ItemRarity,
      slot: EquipmentSlot.Legs,
      effect: { defense: 4, hp: 18 },
    },
    // 普通 - 鞋履
    {
      name: '板鞋',
      type: ItemType.Armor,
      rarity: '普通' as ItemRarity,
      slot: EquipmentSlot.Boots,
      effect: { defense: 3, speed: 2 },
    },

    // 普通 - 实验服套装
    {
      name: '实验室鸭舌帽',
      type: ItemType.Armor,
      rarity: '普通' as ItemRarity,
      slot: EquipmentSlot.Head,
      effect: { defense: 8, hp: 30 },
    },
    {
      name: '普通电脑包',
      type: ItemType.Armor,
      rarity: '普通' as ItemRarity,
      slot: EquipmentSlot.Shoulder,
      effect: { defense: 8, hp: 30 },
    },
    {
      name: '实验服',
      type: ItemType.Armor,
      rarity: '普通' as ItemRarity,
      slot: EquipmentSlot.Chest,
      effect: { defense: 15, hp: 50 },
    },
    {
      name: '护腕手套',
      type: ItemType.Armor,
      rarity: '普通' as ItemRarity,
      slot: EquipmentSlot.Gloves,
      effect: { defense: 8, hp: 30 },
    },
    {
      name: '工装裤',
      type: ItemType.Armor,
      rarity: '普通' as ItemRarity,
      slot: EquipmentSlot.Legs,
      effect: { defense: 10, hp: 40 },
    },
    {
      name: '运动跑鞋',
      type: ItemType.Armor,
      rarity: '普通' as ItemRarity,
      slot: EquipmentSlot.Boots,
      effect: { defense: 8, speed: 5 },
    },

    // 稀有 - 头戴
    {
      name: '降噪耳机',
      type: ItemType.Armor,
      rarity: '稀有' as ItemRarity,
      slot: EquipmentSlot.Head,
      effect: { defense: 25, hp: 60, spirit: 10 },
    },
    // 稀有 - 肩背
    {
      name: '通勤双肩包',
      type: ItemType.Armor,
      rarity: '稀有' as ItemRarity,
      slot: EquipmentSlot.Shoulder,
      effect: { defense: 25, hp: 60, spirit: 10 },
    },
    // 稀有 - 上衣
    {
      name: '院服冲锋衣',
      type: ItemType.Armor,
      rarity: '稀有' as ItemRarity,
      slot: EquipmentSlot.Chest,
      effect: { defense: 40, hp: 100 },
    },
    // 稀有 - 手部
    {
      name: '机械护腕',
      type: ItemType.Armor,
      rarity: '稀有' as ItemRarity,
      slot: EquipmentSlot.Gloves,
      effect: { defense: 25, hp: 60, spirit: 10 },
    },
    // 稀有 - 裤装
    {
      name: '速干工装裤',
      type: ItemType.Armor,
      rarity: '稀有' as ItemRarity,
      slot: EquipmentSlot.Legs,
      effect: { defense: 30, hp: 80 },
    },
    // 稀有 - 鞋履
    {
      name: '越野跑鞋',
      type: ItemType.Armor,
      rarity: '稀有' as ItemRarity,
      slot: EquipmentSlot.Boots,
      effect: { defense: 25, speed: 12 },
    },

    // 传说 - 头戴
    {
      name: '旗舰降噪大耳',
      type: ItemType.Armor,
      rarity: '传说' as ItemRarity,
      slot: EquipmentSlot.Head,
      effect: { defense: 60, hp: 150, spirit: 20, attack: 10 },
    },
    // 传说 - 肩背
    {
      name: 'OSPREY 背包',
      type: ItemType.Armor,
      rarity: '传说' as ItemRarity,
      slot: EquipmentSlot.Shoulder,
      effect: { defense: 60, hp: 150, spirit: 20, attack: 10 },
    },
    // 传说 - 上衣
    {
      name: '始祖鸟冲锋衣',
      type: ItemType.Armor,
      rarity: '传说' as ItemRarity,
      slot: EquipmentSlot.Chest,
      effect: { defense: 100, hp: 300, attack: 20 },
    },
    // 传说 - 手部
    {
      name: '电竞护腕',
      type: ItemType.Armor,
      rarity: '传说' as ItemRarity,
      slot: EquipmentSlot.Gloves,
      effect: { defense: 60, hp: 150, spirit: 20, attack: 10 },
    },
    // 传说 - 裤装
    {
      name: '机能工装裤',
      type: ItemType.Armor,
      rarity: '传说' as ItemRarity,
      slot: EquipmentSlot.Legs,
      effect: { defense: 75, hp: 200, attack: 15 },
    },
    // 传说 - 鞋履
    {
      name: '碳板跑鞋',
      type: ItemType.Armor,
      rarity: '传说' as ItemRarity,
      slot: EquipmentSlot.Boots,
      effect: { defense: 60, hp: 150, speed: 25 },
    },

    // 绝版 - 头戴
    {
      name: '监听级耳机',
      type: ItemType.Armor,
      rarity: '绝版' as ItemRarity,
      slot: EquipmentSlot.Head,
      effect: { defense: 150, hp: 400, spirit: 50, attack: 30 },
    },
    // 绝版 - 肩背
    {
      name: '神秘开发者背包',
      type: ItemType.Armor,
      rarity: '绝版' as ItemRarity,
      slot: EquipmentSlot.Shoulder,
      effect: { defense: 150, hp: 400, spirit: 50, attack: 30 },
    },
    // 绝版 - 上衣
    {
      name: 'ACM 决赛队服',
      type: ItemType.Armor,
      rarity: '绝版' as ItemRarity,
      slot: EquipmentSlot.Chest,
      effect: { defense: 250, hp: 800, spirit: 100 },
    },
    // 绝版 - 手部
    {
      name: '发烧友护腕',
      type: ItemType.Armor,
      rarity: '绝版' as ItemRarity,
      slot: EquipmentSlot.Gloves,
      effect: { defense: 150, hp: 400, spirit: 50, attack: 30 },
    },
    // 绝版 - 裤装
    {
      name: '极客机能裤',
      type: ItemType.Armor,
      rarity: '绝版' as ItemRarity,
      slot: EquipmentSlot.Legs,
      effect: { defense: 180, hp: 500, spirit: 60 },
    },
    // 绝版 - 鞋履
    {
      name: '签名限定球鞋',
      type: ItemType.Armor,
      rarity: '绝版' as ItemRarity,
      slot: EquipmentSlot.Boots,
      effect: { defense: 150, hp: 400, speed: 60 },
    },
  ],
  // 装备类（挂件）
  accessories: [
    {
      name: '校园卡',
      type: ItemType.Accessory,
      rarity: '普通' as ItemRarity,
      slot: EquipmentSlot.Accessory1,
      effect: { defense: 3, hp: 15 },
    },
    {
      name: '社团工牌',
      type: ItemType.Accessory,
      rarity: '稀有' as ItemRarity,
      slot: EquipmentSlot.Accessory1,
      effect: { spirit: 20, exp: 10 },
    },
    {
      name: '实验室门禁卡',
      type: ItemType.Accessory,
      rarity: '传说' as ItemRarity,
      slot: EquipmentSlot.Accessory1,
      effect: { attack: 30, defense: 30, speed: 15 },
    },
    {
      name: '挑战杯金牌挂件',
      type: ItemType.Accessory,
      rarity: '绝版' as ItemRarity,
      slot: EquipmentSlot.Accessory1,
      effect: { attack: 80, defense: 80, hp: 200 },
    },
  ],
  // 装备类（手环）
  rings: [
    {
      name: '小米手环',
      type: ItemType.Ring,
      rarity: '普通' as ItemRarity,
      slot: EquipmentSlot.Ring1,
      effect: { attack: 5 },
    },
    {
      name: '荣耀手环',
      type: ItemType.Ring,
      rarity: '普通' as ItemRarity,
      slot: EquipmentSlot.Ring1,
      effect: { defense: 5 },
    },
    {
      name: '华为手环',
      type: ItemType.Ring,
      rarity: '稀有' as ItemRarity,
      slot: EquipmentSlot.Ring1,
      effect: { attack: 15, defense: 15 },
    },
    {
      name: 'Apple Watch',
      type: ItemType.Ring,
      rarity: '传说' as ItemRarity,
      slot: EquipmentSlot.Ring1,
      effect: { attack: 40, defense: 40, speed: 20 },
    },
    {
      name: '实验室定制手环',
      type: ItemType.Ring,
      rarity: '绝版' as ItemRarity,
      slot: EquipmentSlot.Ring1,
      effect: { attack: 100, defense: 100, spirit: 50 },
    },
  ],
  // 外设类（显示器 / 扩展坞 / 机械键盘）
  artifacts: [
    {
      name: '便携扩展坞',
      type: ItemType.Artifact,
      rarity: '普通' as ItemRarity,
      slot: EquipmentSlot.Artifact1,
      effect: { spirit: 10, exp: 5 },
    },
    {
      name: 'USB Hub',
      type: ItemType.Artifact,
      rarity: '普通' as ItemRarity,
      slot: EquipmentSlot.Artifact1,
      effect: { defense: 10, hp: 30 },
    },
    {
      name: '4K 显示器',
      type: ItemType.Artifact,
      rarity: '稀有' as ItemRarity,
      slot: EquipmentSlot.Artifact1,
      effect: { spirit: 30, defense: 20 },
    },
    {
      name: '曲面带鱼屏',
      type: ItemType.Artifact,
      rarity: '传说' as ItemRarity,
      slot: EquipmentSlot.Artifact1,
      effect: { attack: 50, defense: 50, spirit: 50 },
    },
    {
      name: '实验室示波器',
      type: ItemType.Artifact,
      rarity: '绝版' as ItemRarity,
      slot: EquipmentSlot.Artifact1,
      effect: { attack: 150, defense: 150, spirit: 150, hp: 500 },
    },
  ],
};

/**
 * 在 LOOT_ITEMS 全池中按物品名查找（用于副本 drops 兑现）
 * 命中返回完整物品定义（含 effect / slot / rarity）
 * 未命中返回 null（调用方走全局池兜底）
 */
function findItemInGlobalPool(name: string): LootItem | null {
  const allItems: LootItem[] = [
    ...LOOT_ITEMS.herbs,
    ...LOOT_ITEMS.pills,
    ...LOOT_ITEMS.materials,
    ...LOOT_ITEMS.weapons,
    ...LOOT_ITEMS.armors,
    ...LOOT_ITEMS.accessories,
    ...LOOT_ITEMS.rings,
    ...LOOT_ITEMS.artifacts,
  ];
  return allItems.find((i) => i.name === name) || null;
}

/**
 * 副本专属池稀有度降档
 *  - 低风险：绝版→传说→稀有→普通（降 2 档）
 *  - 中风险：绝版→稀有（降 1 档）
 *  - 高 / 极度危险：保留原稀有度
 * 防止"低风险副本一上来就掉绝版神器"破坏节奏
 */
function downgradeRarityByRisk(
  rarity: ItemRarity,
  riskLevel?: '低' | '中' | '高' | '极度危险'
): ItemRarity {
  if (riskLevel === '极度危险' || riskLevel === '高') return rarity;
  if (riskLevel === '中') {
    if (rarity === '绝版') return '传说';
    return rarity;
  }
  // 低风险或未指定
  if (rarity === '绝版') return '传说';
  if (rarity === '传说') return '稀有';
  return rarity;
}

// 根据敌人强度和类型生成搜刮奖励
export const generateBattleLoot = (
  enemyStrength: number,
  adventureType: AdventureType,
  playerRealm: RealmType,
  riskLevel?: '低' | '中' | '高' | '极度危险',
  realmDrops?: string[], // 🆕 副本"可能掉落"列表，按概率兑现
  random = Math.random
): AdventureResult['itemObtained'][] => {
  const lootItems: AdventureResult['itemObtained'][] = [];

  // 根据敌人强度决定奖励数量（1-3个物品）
  const numItems =
    enemyStrength < 0.7
      ? 1
      : enemyStrength < 1.0
        ? 1 + Math.floor(random() * 2)
        : 2 + Math.floor(random() * 2);

  // 🆕 副本专属池命中率：风险越高，从专属池抽的比例越大
  // 低 40% / 中 55% / 高 70% / 极度危险 80%
  const realmDropChance =
    adventureType === 'secret_realm' && realmDrops && realmDrops.length > 0
      ? riskLevel === '极度危险'
        ? 0.8
        : riskLevel === '高'
          ? 0.7
          : riskLevel === '中'
            ? 0.55
            : 0.4
      : 0;

  // 根据敌人强度和类型决定稀有度分布
  const getRarityChance = (): ItemRarity => {
    const roll = random();
    if (adventureType === 'secret_realm') {
      // 副本：根据风险等级调整稀有度概率
      if (riskLevel === '极度危险') {
        // 极度危险：更高概率获得顶级物品
        if (roll < 0.2) return '绝版';
        if (roll < 0.5) return '传说';
        if (roll < 0.85) return '稀有';
        return '普通';
      } else if (riskLevel === '高') {
        // 高风险：较高概率
        if (roll < 0.12) return '绝版';
        if (roll < 0.4) return '传说';
        if (roll < 0.75) return '稀有';
        return '普通';
      } else if (riskLevel === '中') {
        // 中风险：中等概率
        if (roll < 0.08) return '绝版';
        if (roll < 0.3) return '传说';
        if (roll < 0.65) return '稀有';
        return '普通';
      } else {
        // 低风险：较低概率（但比普通副本高）
        if (roll < 0.05) return '绝版';
        if (roll < 0.2) return '传说';
        if (roll < 0.55) return '稀有';
        return '普通';
      }
    } else if (adventureType === 'lucky') {
      // 机缘：中等概率
      if (roll < 0.05) return '传说';
      if (roll < 0.25) return '稀有';
      return '普通';
    } else {
      // 普通副本：较低概率（略微提升稀有度概率）
      if (roll < 0.03) return '传说';
      if (roll < 0.2) return '稀有';
      return '普通';
    }
  };

  for (let i = 0; i < numItems; i++) {
    const targetRarity = getRarityChance();

    // 🆕 副本专属池分支：命中则从 realmDrops 抽
    if (realmDropChance > 0 && random() < realmDropChance) {
      const dropName = realmDrops![Math.floor(random() * realmDrops!.length)];
      const matched = findItemInGlobalPool(dropName);
      if (matched) {
        const rarity = (matched.rarity as ItemRarity) || '普通';
        // 专属池物品按风险等级再降一档（避免一上来就绝版）
        const adjustedRarity = downgradeRarityByRisk(rarity, riskLevel);
        lootItems.push({
          name: matched.name,
          type: matched.type,
          rarity: adjustedRarity,
          description: `${matched.name}，从副本搜刮获得。`,
          isEquippable: matched.slot !== undefined,
          equipmentSlot: matched.slot as string | undefined,
          effect: matched.effect,
          permanentEffect: matched.permanentEffect,
        });
        continue;
      }
      // 没匹配上 → 落到全局池兜底（continue 到下一个 i 之前不要走后面的逻辑）
    }

    // 根据稀有度选择物品类型
    const itemTypeRoll = random();
    let itemPool: LootItem[];
    let itemType: string;

    if (itemTypeRoll < 0.25) {
      // 25% 食材
      itemPool = LOOT_ITEMS.herbs;
      itemType = '食材';
    } else if (itemTypeRoll < 0.45) {
      // 20% 饮品
      itemPool = LOOT_ITEMS.pills;
      itemType = '饮品';
    } else if (itemTypeRoll < 0.6) {
      // 15% 元件
      itemPool = LOOT_ITEMS.materials;
      itemType = '元件';
    } else if (itemTypeRoll < 0.8) {
      // 20% 装备（键鼠/穿戴/挂件/手环）
      const equipRoll = random();
      if (equipRoll < 0.25) {
        itemPool = LOOT_ITEMS.weapons;
        itemType = '键鼠';
      } else if (equipRoll < 0.65) {
        // 穿戴概率提升到40%，因为穿戴有6个部位需要覆盖
        itemPool = LOOT_ITEMS.armors;
        itemType = '穿戴';
      } else if (equipRoll < 0.85) {
        itemPool = LOOT_ITEMS.accessories;
        itemType = '挂件';
      } else {
        itemPool = LOOT_ITEMS.rings;
        itemType = '手环';
      }
    } else if (itemTypeRoll < 0.92) {
      // 12% 外设
      itemPool = LOOT_ITEMS.artifacts;
      itemType = '外设';
    } else {
      // 8% 配方（稀有奖励）
      // 配方将在后面特殊处理
      itemType = '配方';
      itemPool = []; // 配方不使用常规物品池
    }

    // 特殊处理：配方
    if (itemType === '配方') {
      // 根据稀有度筛选可获得的配方
      const availableRecipes = DISCOVERABLE_RECIPES.filter((recipe) => {
        const rarityOrder: ItemRarity[] = ['普通', '稀有', '传说', '绝版'];
        const targetIndex = rarityOrder.indexOf(targetRarity);
        const recipeIndex = rarityOrder.indexOf(recipe.result.rarity);
        return recipeIndex <= targetIndex;
      });

      if (availableRecipes.length > 0) {
        const selectedRecipe = pickOne(availableRecipes, random);
        const item: AdventureResult['itemObtained'] & { recipeName?: string } =
          {
            name: `${selectedRecipe.name}配方`,
            type: '配方',
            description: `记载了【${selectedRecipe.name}】冲调方法的笔记。使用后可学会冲调此饮品。`,
            rarity: selectedRecipe.result.rarity,
            isEquippable: false,
            recipeName: selectedRecipe.name, // 用于在 executeAdventureCore 中查找对应的配方
          };
        lootItems.push(item);
      }
      // 如果没有可用的配方，跳过这次生成
      continue;
    }

    // 从对应稀有度的物品中随机选择
    const availableItems = itemPool.filter(
      (item) => item.rarity === targetRarity
    );
    if (availableItems.length === 0) {
      // 如果没有对应稀有度的物品，降级选择
      const fallbackItems = itemPool.filter((item) => {
        const rarityOrder: ItemRarity[] = ['普通', '稀有', '传说', '绝版'];
        const targetIndex = rarityOrder.indexOf(targetRarity);
        const itemIndex = rarityOrder.indexOf(item.rarity);
        return itemIndex <= targetIndex;
      });
      if (fallbackItems.length > 0) {
        const selected = pickOne(fallbackItems, random);
        const item: AdventureResult['itemObtained'] = {
          name: selected.name,
          type: itemType,
          description: `${selected.name}，从敌人身上搜刮获得。`,
          rarity: selected.rarity,
          isEquippable: selected.slot !== undefined,
          equipmentSlot: selected.slot as string | undefined,
          effect: selected.effect,
          permanentEffect: selected.permanentEffect,
        };
        lootItems.push(item);
      }
    } else {
      const selected = pickOne(availableItems, random);
      const item: AdventureResult['itemObtained'] = {
        name: selected.name,
        type: itemType,
        description: `${selected.name}，击败敌人后获得。`,
        rarity: selected.rarity,
        isEquippable: selected.slot !== undefined,
        equipmentSlot: selected.slot as string | undefined,
        effect: selected.effect,
        permanentEffect: selected.permanentEffect,
      };
      lootItems.push(item);
    }
  }

  return lootItems;
};

export interface BattleRoundLog {
  id: string;
  attacker: 'player' | 'enemy';
  damage: number;
  crit: boolean;
  description: string;
  playerHpAfter: number;
  enemyHpAfter: number;
}

export interface BattleReplay {
  id: string;
  enemy: {
    name: string;
    title: string;
    realm: RealmType;
    maxHp: number;
    attack: number;
    defense: number;
    speed: number;
    strengthMultiplier?: number; // 敌人强度倍数
  };
  rounds: BattleRoundLog[];
  victory: boolean;
  hpLoss: number;
  playerHpBefore: number;
  playerHpAfter: number;
  summary: string;
  expChange: number;
  spiritChange: number;
}

export interface BattleResolution {
  adventureResult: AdventureResult;
  replay: BattleReplay;
}

const clampMin = (value: number, min: number) => (value < min ? min : value);

const prepareBattleEnemy = (
  player: PlayerStats,
  adventureType: AdventureType,
  riskLevel?: '低' | '中' | '高' | '极度危险',
  realmMinRealm?: RealmType,
  random = Math.random,
  getBase = getEnemyBaseForRealm
) => {
  const currentRealmIndex = REALM_ORDER.indexOf(player.realm);

  // 如果进入副本且有副本的最低学阶要求，基于副本学阶计算敌人强度
  let targetRealmIndex: number;
  let realmLevelReduction = 1.0; // 学阶压制倍率（玩家学阶高于副本要求时降低难度）

  if (adventureType === 'secret_realm' && realmMinRealm) {
    const realmMinIndex = REALM_ORDER.indexOf(realmMinRealm);
    // 敌人学阶基于副本最低学阶，而不是玩家学阶
    const realmOffset = 1; // 副本中敌人比副本要求高1个学阶
    targetRealmIndex = clampMin(
      Math.min(REALM_ORDER.length - 1, realmMinIndex + realmOffset),
      0
    );

    // 如果玩家学阶高于副本要求，降低敌人强度（学阶压制）
    if (currentRealmIndex > realmMinIndex) {
      const realmDiff = currentRealmIndex - realmMinIndex;
      // 每高1个学阶，降低15%难度，最多降低60%
      realmLevelReduction = Math.max(0.4, 1.0 - realmDiff * 0.15);
    }
  } else {
    // 普通副本和机缘副本，按原逻辑
    const realmOffset =
      adventureType === 'secret_realm' ? 1 : adventureType === 'lucky' ? -1 : 0;
    targetRealmIndex = clampMin(
      Math.min(REALM_ORDER.length - 1, currentRealmIndex + realmOffset),
      0
    );
  }

  const realm = REALM_ORDER[targetRealmIndex];
  const baseDifficulty = getBattleDifficulty(adventureType, riskLevel);

  // 引入强度等级系统：弱敌、普通、强敌
  // 普通副本：40%弱敌，50%普通，10%强敌
  // 机缘副本：60%弱敌，35%普通，5%强敌
  // 困难副本：20%弱敌，50%普通，30%强敌
  const strengthRoll = random();
  let strengthMultiplier = 1;
  let strengthVariance = { min: 0.85, max: 1.2 };

  if (adventureType === 'normal') {
    if (strengthRoll < 0.4) {
      // 弱敌 40%
      strengthMultiplier = 0.6 + random() * 0.2; // 0.6 - 0.8
      strengthVariance = { min: 0.6, max: 0.9 };
    } else if (strengthRoll < 0.9) {
      // 普通 50%
      strengthMultiplier = 0.8 + random() * 0.2; // 0.8 - 1.0
      strengthVariance = { min: 0.75, max: 1.1 };
    } else {
      // 强敌 10%
      strengthMultiplier = 1.0 + random() * 0.2; // 1.0 - 1.2
      strengthVariance = { min: 0.9, max: 1.3 };
    }
  } else if (adventureType === 'lucky') {
    if (strengthRoll < 0.6) {
      // 弱敌 60%
      strengthMultiplier = 0.5 + random() * 0.2; // 0.5 - 0.7
      strengthVariance = { min: 0.5, max: 0.85 };
    } else if (strengthRoll < 0.95) {
      // 普通 35%
      strengthMultiplier = 0.7 + random() * 0.2; // 0.7 - 0.9
      strengthVariance = { min: 0.65, max: 1.0 };
    } else {
      // 强敌 5%
      strengthMultiplier = 0.9 + random() * 0.2; // 0.9 - 1.1
      strengthVariance = { min: 0.8, max: 1.2 };
    }
  } else if (adventureType === 'secret_realm') {
    // 困难副本：根据风险等级调整敌人强度分布
    if (riskLevel === '极度危险') {
      // 极度危险：5%弱敌，30%普通，65%强敌
      if (strengthRoll < 0.05) {
        strengthMultiplier = 0.9 + random() * 0.2; // 0.9 - 1.1
        strengthVariance = { min: 0.85, max: 1.2 };
      } else if (strengthRoll < 0.35) {
        strengthMultiplier = 1.1 + random() * 0.2; // 1.1 - 1.3
        strengthVariance = { min: 1.0, max: 1.4 };
      } else {
        strengthMultiplier = 1.3 + random() * 0.4; // 1.3 - 1.7
        strengthVariance = { min: 1.2, max: 1.8 };
      }
    } else if (riskLevel === '高') {
      // 高风险：10%弱敌，40%普通，50%强敌
      if (strengthRoll < 0.1) {
        strengthMultiplier = 0.8 + random() * 0.2; // 0.8 - 1.0
        strengthVariance = { min: 0.75, max: 1.1 };
      } else if (strengthRoll < 0.5) {
        strengthMultiplier = 1.0 + random() * 0.2; // 1.0 - 1.2
        strengthVariance = { min: 0.9, max: 1.3 };
      } else {
        strengthMultiplier = 1.2 + random() * 0.3; // 1.2 - 1.5
        strengthVariance = { min: 1.1, max: 1.6 };
      }
    } else if (riskLevel === '中') {
      // 中风险：20%弱敌，50%普通，30%强敌
      if (strengthRoll < 0.2) {
        strengthMultiplier = 0.7 + random() * 0.2; // 0.7 - 0.9
        strengthVariance = { min: 0.65, max: 1.0 };
      } else if (strengthRoll < 0.7) {
        strengthMultiplier = 0.9 + random() * 0.2; // 0.9 - 1.1
        strengthVariance = { min: 0.8, max: 1.2 };
      } else {
        strengthMultiplier = 1.1 + random() * 0.3; // 1.1 - 1.4
        strengthVariance = { min: 1.0, max: 1.5 };
      }
    } else {
      // 低风险：30%弱敌，55%普通，15%强敌
      if (strengthRoll < 0.3) {
        strengthMultiplier = 0.6 + random() * 0.2; // 0.6 - 0.8
        strengthVariance = { min: 0.55, max: 0.9 };
      } else if (strengthRoll < 0.85) {
        strengthMultiplier = 0.8 + random() * 0.2; // 0.8 - 1.0
        strengthVariance = { min: 0.75, max: 1.1 };
      } else {
        strengthMultiplier = 1.0 + random() * 0.2; // 1.0 - 1.2
        strengthVariance = { min: 0.9, max: 1.3 };
      }
    }
  }

  const variance = () =>
    strengthVariance.min +
    random() * (strengthVariance.max - strengthVariance.min);
  // 应用学阶压制倍率到最终难度
  const finalDifficulty =
    baseDifficulty * strengthMultiplier * realmLevelReduction;

  const name = pickOne(ENEMY_NAMES, random);
  const title = pickOne(ENEMY_TITLES, random);

  // ===== 敌人数值 = 按境界档位 + 玩家层级查表（与玩家属性完全脱钩）=====
  // 不再读取 player.attack / player.defense / player.maxHp / player.speed
  // 防止玩家装备/传承/旧存档膨胀时敌人也跟着爆炸
  const enemyBase = getBase(realm, player.realmLevel);

  return {
    name,
    title,
    realm,
    finish: (finalName = name, finalTitle = title) => ({
      name: finalName,
      title: finalTitle,
      realm,
      attack: Math.max(
        5,
        Math.round(enemyBase.baseAttack * variance() * finalDifficulty)
      ),
      defense: Math.max(
        3,
        Math.round(enemyBase.baseDefense * variance() * finalDifficulty)
      ),
      maxHp: Math.max(
        30,
        Math.round(enemyBase.baseMaxHp * variance() * finalDifficulty)
      ),
      speed: Math.max(
        5,
        Math.round(enemyBase.baseSpeed * variance() * strengthMultiplier)
      ),
      strengthMultiplier, // 保存强度倍数用于生成奖励
    }),
  };
};

/** Synchronous preparation for saved turn-based battles; does not call a model. */
export const createBattleEnemySnapshot = (
  player: PlayerStats,
  adventureType: AdventureType,
  riskLevel?: '低' | '中' | '高' | '极度危险',
  realmMinRealm?: RealmType,
  random = Math.random,
  getBase = getEnemyBaseForRealm
) =>
  prepareBattleEnemy(
    player,
    adventureType,
    riskLevel,
    realmMinRealm,
    random,
    getBase
  ).finish();

/** 旧自动结算入口继续保留；同步数值/掉落生成可由指令制战斗复用。 */
const createEnemy = async (
  player: PlayerStats,
  adventureType: AdventureType,
  riskLevel?: '低' | '中' | '高' | '极度危险',
  realmMinRealm?: RealmType
) => {
  const prepared = prepareBattleEnemy(
    player,
    adventureType,
    riskLevel,
    realmMinRealm
  );
  let name = prepared.name;
  let title = prepared.title;
  if (Math.random() < 0.15) {
    try {
      const generated = await generateEnemyName(prepared.realm, adventureType);
      if (generated.name && generated.title) {
        name = generated.name;
        title = generated.title;
      }
    } catch {
      // Keep the historical RNG order: optional name generation precedes stat rolls.
    }
  }
  return prepared.finish(name, title);
};

const calcDamage = (attack: number, defense: number) => {
  const base = attack * 0.9 - defense * 0.45;
  const minDamage = Math.max(5, attack * 0.25);
  const randomFactor = 0.9 + Math.random() * 0.25;
  return Math.round(Math.max(minDamage, base) * randomFactor);
};

export const shouldTriggerBattle = (
  player: PlayerStats,
  adventureType: AdventureType
): boolean => {
  const base = baseBattleChance[adventureType] ?? 0.2;
  const realmBonus = REALM_ORDER.indexOf(player.realm) * 0.015;
  const speedBonus = (player.speed || 0) * 0.0004;
  const luckMitigation = (player.luck || 0) * 0.0002;
  const chance = Math.min(
    0.75,
    base + realmBonus + speedBonus - luckMitigation
  );
  return Math.random() < Math.max(0.05, chance);
};

export const resolveBattleEncounter = async (
  player: PlayerStats,
  adventureType: AdventureType,
  riskLevel?: '低' | '中' | '高' | '极度危险',
  realmMinRealm?: RealmType,
  realmName?: string,
  realmDescription?: string,
  realmDrops?: string[]
): Promise<BattleResolution> => {
  const enemy = await createEnemy(
    player,
    adventureType,
    riskLevel,
    realmMinRealm
  );
  const difficulty = getBattleDifficulty(adventureType, riskLevel);
  let playerHp = player.hp;
  let enemyHp = enemy.maxHp;
  const rounds: BattleRoundLog[] = [];
  let attacker: 'player' | 'enemy' =
    (player.speed || 0) >= enemy.speed ? 'player' : 'enemy';

  while (playerHp > 0 && enemyHp > 0 && rounds.length < 40) {
    const isPlayerTurn = attacker === 'player';
    const damage = calcDamage(
      isPlayerTurn ? player.attack : enemy.attack,
      isPlayerTurn ? enemy.defense : player.defense
    );
    const critChanceBase =
      0.08 +
      ((isPlayerTurn ? player.speed : enemy.speed) /
        ((player.speed || 1) + enemy.speed + 1)) *
        0.2;
    const crit = Math.random() < critChanceBase;
    const finalDamage = crit ? Math.round(damage * 1.5) : damage;

    if (isPlayerTurn) {
      enemyHp = Math.max(0, enemyHp - finalDamage);
    } else {
      playerHp = Math.max(0, playerHp - finalDamage);
    }

    rounds.push({
      id: randomId(),
      attacker,
      damage: finalDamage,
      crit,
      description: isPlayerTurn
        ? `你敲下一段代码，造成 ${finalDamage}${crit ? '（暴击）' : ''} 点伤害。`
        : `${enemy.title}${enemy.name}反扑，造成 ${finalDamage}${crit ? '（暴击）' : ''} 点伤害。`,
      playerHpAfter: playerHp,
      enemyHpAfter: enemyHp,
    });

    if (playerHp <= 0 || enemyHp <= 0) {
      break;
    }

    attacker = attacker === 'player' ? 'enemy' : 'player';
  }

  const victory = enemyHp <= 0 && playerHp > 0;
  // 移除战斗失败时的血量保护，允许死亡
  // if (!victory) {
  //   playerHp = Math.max(1, Math.round(player.maxHp * 0.08));
  // }

  const hpLoss = Math.max(0, player.hp - playerHp);

  // 根据风险等级调整奖励倍数
  const getRewardMultiplier = (
    riskLevel?: '低' | '中' | '高' | '极度危险'
  ): number => {
    if (!riskLevel) return 1.0;
    const multipliers = {
      低: 1.0,
      中: 1.3,
      高: 1.6,
      极度危险: 2.2,
    };
    return multipliers[riskLevel];
  };

  const rewardMultiplier =
    adventureType === 'secret_realm' ? getRewardMultiplier(riskLevel) : 1.0;
  const baseExp = 25 + player.realmLevel * 12;
  const rewardExp = Math.round(baseExp * difficulty * rewardMultiplier);
  const rewardStones = Math.max(
    3,
    Math.round((6 + player.realmLevel * 2) * difficulty * rewardMultiplier)
  );

  const expChange = victory
    ? rewardExp
    : -Math.max(5, Math.round(rewardExp * 0.5));
  const spiritChange = victory
    ? rewardStones
    : -Math.max(2, Math.round(rewardStones * 0.6));

  // 如果胜利，生成搜刮奖励
  const lootItems: AdventureResult['itemObtained'][] = [];
  if (victory) {
    const loot = generateBattleLoot(
      enemy.strengthMultiplier,
      adventureType,
      player.realm,
      riskLevel,
      realmDrops // 🆕 副本专属掉落池
    );
    lootItems.push(...loot);
  }

  // Enemy 类型从 createEnemy 返回值推断（避免重复定义）
  type Enemy = Awaited<ReturnType<typeof createEnemy>>;

  // 生成更丰富的战斗描述（如果有副本信息，会结合副本特点）
  const generateBattleSummary = (
    victory: boolean,
    enemy: Enemy,
    hpLoss: number,
    hasLoot: boolean,
    realmName?: string
  ): string => {
    // 如果有副本名称，生成与副本相关的描述
    if (realmName && adventureType === 'secret_realm') {
      const realmContext = `在${realmName}中，`;
      const victoryScenarios = [
        `${realmContext}你与${enemy.title}${enemy.name}展开激战。最终，你顺利把它调通了，但也爆肝了 ${hpLoss} 点精力。${hasLoot ? '你仔细搜刮了现场遗留的好物。' : ''}`,
        `${realmContext}你遭遇了${enemy.title}${enemy.name}的袭击。经过一番 debug，你成功把它按在地上摩擦，消耗了 ${hpLoss} 点精力。${hasLoot ? '你从敌人身上找到了战利品。' : ''}`,
        `${realmContext}你与${enemy.title}${enemy.name}在副本中展开对决。最终，你凭借更强的实力将其拿捏，损失了 ${hpLoss} 点精力。${hasLoot ? '你检查了敌人的遗物，收获颇丰。' : ''}`,
      ];
      const defeatScenarios = [
        `${realmContext}你与${enemy.title}${enemy.name}的战斗异常艰难。对方实力强大，你拼尽全力仍不敌，只得带着满屏报错撤退，损失了 ${hpLoss} 点精力。`,
        `${realmContext}你遭遇了强大的${enemy.title}${enemy.name}。面对其猛烈的输出，你渐渐落入下风，只能带着崩溃的心态逃离，损失了 ${hpLoss} 点精力。`,
      ];
      const scenarios = victory ? victoryScenarios : defeatScenarios;
      return scenarios[Math.floor(Math.random() * scenarios.length)];
    }

    // 默认描述（非副本）
    const battleScenarios = victory
      ? [
          `经过一番激烈的 debug，你最终把${enemy.title}${enemy.name}给拿下了。虽然爆肝了 ${hpLoss} 点精力，但你成功获得了胜利。${hasLoot ? '你仔细搜刮了战利品，发现了一些有用的物品。' : ''}`,
          `你与${enemy.title}${enemy.name}展开了殊死搏斗，键盘敲得啪啪响。最终，你凭借精湛的姿势将其击败，但也消耗了 ${hpLoss} 点精力。${hasLoot ? '你从敌人身上搜刮到了一些好东西。' : ''}`,
          `面对${enemy.title}${enemy.name}的疯狂报错，你沉着应对，疯狂按 F5。经过一番苦战，你终于找到破绽，将其一击毙命。虽然损失了 ${hpLoss} 点精力，但胜利的喜悦让你忘记了爆肝的痛苦。${hasLoot ? '你检查了现场，收获颇丰。' : ''}`,
          `你与${enemy.title}${enemy.name}的战斗异常激烈，双方都拼命输出。最终，你凭借更强的实力将其拿下，但也被其临死反扑的报错糊脸，损失了 ${hpLoss} 点精力。${hasLoot ? '战斗结束后，你搜刮了战利品。' : ''}`,
          `你掏出装备，与${enemy.title}${enemy.name}展开对决。战斗持续了数个回合，IDE 的报错不断弹出。最终，你技高一筹，成功将其击杀，但精力也损耗了 ${hpLoss} 点。${hasLoot ? '你在敌人身上找到了一些有价值的物品。' : ''}`,
          `你施展必杀技，与${enemy.title}${enemy.name}展开激战。双方你来我往，commit 推得飞起。最终，你抓住机会，ctrl+S 之后一击必杀。虽然耗费了 ${hpLoss} 点精力，但你的实力也在这场战斗中得到了提升。${hasLoot ? '你仔细搜刮了敌人的遗物。' : ''}`,
        ]
      : [
          `你与${enemy.title}${enemy.name}展开了激烈的战斗，但对方的实力远超你的想象。你拼尽全力抵抗，却依然不敌，只得带着满屏红字撤离，损失了 ${hpLoss} 点精力。`,
          `面对强大的${enemy.title}${enemy.name}，你奋力迎战。然而，对方的输出太过猛烈，你渐渐落入下风。最终，你不得不放弃战斗，带着濒危的电脑逃离，损失了 ${hpLoss} 点精力。`,
          `你与${enemy.title}${enemy.name}的战斗异常艰难。对方的速度和报错的密度都远超你的预期，你虽然拼尽全力，却依然无法战胜。为了保全性命，你只能带着濒临崩溃的进度撤离，损失了 ${hpLoss} 点精力。`,
          `你掏出装备与${enemy.title}${enemy.name}交战，但对方的防御力极强，你的提交全部被拒。眼看局势不妙，你只得放弃战斗，带着残血的进度条撤离，损失了 ${hpLoss} 点精力。`,
          `你施展必杀技与${enemy.title}${enemy.name}对决，但对方的实力深不可测。经过一番苦战，你意识到无法取胜，只得选择撤退，损失了 ${hpLoss} 点精力。`,
        ];

    // 随机选择一个场景描述
    return battleScenarios[Math.floor(Math.random() * battleScenarios.length)];
  };

  const summary = generateBattleSummary(
    victory,
    enemy,
    hpLoss,
    lootItems.length > 0,
    realmName
  );

  const adventureResult: AdventureResult = {
    story: summary,
    hpChange: playerHp - player.hp,
    expChange,
    spiritStonesChange: spiritChange,
    eventColor: 'danger',
    itemsObtained: lootItems.length > 0 ? lootItems : undefined,
  };

  return {
    adventureResult,
    replay: {
      id: randomId(),
      enemy,
      rounds,
      victory,
      hpLoss,
      playerHpBefore: player.hp,
      playerHpAfter: playerHp,
      summary,
      expChange,
      spiritChange,
    },
  };
};
