import { SecretRealm, RealmType, Item, ItemType } from '../types';
import { REALM_ORDER, SectInfo } from '../constants';

const randomId = () => Math.random().toString(36).slice(2, 9);

// 副本名称池 - 按风险等级分类（竞赛 / 实验室 / 自习室 / 实战副本）
const REALM_NAMES_BY_RISK: Record<'低' | '中' | '高' | '极度危险', string[]> = {
  '低': [
    '校图书馆自习区', '学科作业副本', '期末复习周', '学园英语等级考场',
    '基础实验实训', '校史馆讲解', '社团迎新', '校园跑副本',
    '宿舍自习夜', '通识课教室'
  ],
  '中': [
    '电子设计竞赛集训', '程序设计队选拔', '学园数学建模赛',
    '嵌入式开发实训', '实验室深夜档', '考研自习室',
    '学园创新杯答辩', '期末考试周', '综合实训基地', '求职面试副本'
  ],
  '高': [
    '智能车竞赛决赛', '学园创意项目决赛', '毕业设计答辩',
    '保研夏令营', '考研冲刺百日', '学园研讨会投稿',
    '大厂实习面试', 'CTF 授权靶场演练', '跨专业考研副本', '考研最后三天'
  ],
  '极度危险': [
    '博士资格考试', '毕业论文盲审', '学术不端调查',
    '学园年度答辩现场', '退学警示谈话', '延毕最后一年',
    '期末四门联考', '毕业前最后的 deadline', '导师连环催稿',
    '毕业前最后一周'
  ]
};

// 副本描述池 - 按风险等级分类
const REALM_DESCRIPTIONS_BY_RISK: Record<'低' | '中' | '高' | '极度危险', string[]> = {
  '低': [
    '图书馆自习区氛围安静，适合写作业，相对安全。',
    '期末复习周里大家挑灯夜战，氛围浓厚，但请保持精力。',
    '入门级作业，难度适中，适合巩固基础。',
    '学园英语等级考场里同学们奋笔疾书，速战速决。',
    '基础实验课，跟着实验手册走，问题不大。',
    '社团迎新摊位，人来人往，热闹且不危险。',
    '校园跑 APP 提醒你该跑步了，绕学校一圈。',
    '宿舍熄灯后的自习时段，室友的键盘声相伴。',
    '通识大教室里老师讲到哪儿算哪儿，别睡着就行。',
    '选修课教室，自由度较高，按时交作业即可。'
  ],
  '中': [
    '电赛集训现场，焊台滋滋作响，需要小心短路。',
    '程序设计队选拔现场，键盘声此起彼伏。',
    '数学建模三天三夜，咖啡就是血液。',
    '嵌入式调试现场，看 datasheet 到凌晨是常态。',
    '实验室深夜档，导师随时可能 @ 你。',
    '考研自习室里，背单词声此起彼伏。',
    '学园创新杯答辩，评委连环追问，需要镇定。',
    '期末考试周，连考三天，精力是稀缺资源。',
    '综合实训基地，项目组分工协作，deadline 临近。',
    '求职面试副本，HR 各种刁钻问题等着你。'
  ],
  '高': [
    '智能车竞赛决赛现场，赛道急弯一个接一个。',
    '学园创意项目决赛 PPT 改了 27 版仍未定稿。',
    '毕业设计答辩现场，评委连续追问细节。',
    '保研夏令营里高手云集，需要拿出真本事。',
    '考研最后百日倒计时，每天都在和时间赛跑。',
    '学园研讨会投稿，评阅意见让你重新做实验。',
    '大厂实习面试现场，算法题连环轰炸。',
    'CTF 授权靶场演练，凌晨三点还在隔离环境里解题。',
    '跨专业考研，从零开始补专业课。',
    '考研最后冲刺三天，靠咖啡和意志力撑着。'
  ],
  '极度危险': [
    '博士资格考试现场，导师连环追问，停不下来。',
    '毕业论文盲审，三位专家匿名评审，命运未卜。',
    '学术不端调查谈话，气氛极度紧张。',
    '学园年度答辩现场，几位资深研习导师连续追问。',
    '延毕预警谈话，辅导员语重心长。',
    '延毕最后一年，论文进展缓慢，焦虑爆表。',
    '期末四门联考周，一周考四科，高强度作战。',
    '毕业前最后的 deadline，所有事情都挤在一起。',
    '导师连环催稿，论文一改再改，无休无止。',
    '毕业前最后一周，答辩、改工、离校手续一起涌来。'
  ]
};

// 掉落物池（不违反禁用词的前提下尽量贴近主题）
const DROP_ITEMS = [
  '实验室元器件包',
  '稀有实验耗材',
  '高转速机械键盘',
  '算法导论笔记',
  '二手显示器',
  '示波器探头',
  '电竞鼠标',
  '压箱底的课程笔记',
  '考研英语真题',
  '学长学姐整理的资料',
  '实习内推码',
  '杜邦线一捆',
  '草稿纸一沓',
  '奖学金证书',
  'U 盘里神秘文件',
  '咖啡豆',
  '烙铁',
  '显卡'
];

// 社团名称和描述绑定池（名称和描述一一对应）
const SECT_DATA: Array<{ name: string; description: string }> = [
  { name: '程序设计研习队', description: '学园程序设计竞赛集训队，氛围卷且专注。' },
  { name: '电子设计协会', description: '玩转 PCB 与单片机，焊台永远热着。' },
  { name: '智能车俱乐部', description: '学园智能车赛集训营，工程能力拉满。' },
  { name: '数学建模协会', description: '三天三夜一整题，咖啡就是血液。' },
  { name: '网安研习社', description: '在授权的隔离靶场里练习 CTF，复盘漏洞与防护方法。' },
  { name: '机器人战队', description: '做机甲，参加学园机甲对抗赛，强度不低。' },
  { name: 'Linux 用户组', description: '命令行是信仰，开源是日常。' },
  { name: '辩论队', description: '嘴上功夫一流，临场反应极快。' },
  { name: '动漫社', description: '二次元浓度极高，周边多多。' },
  { name: '摄影协会', description: '校园风景摄影师们，按快门不停。' },
  { name: '创业者联盟', description: '路演常客，PPT 改了 27 版。' },
  { name: '羽毛球社', description: '学园里热闹的运动社团，一起挥拍出汗。' },
  { name: '咖啡社', description: '不喝咖啡会死星人聚集地。' },
  { name: '考研互助社', description: '一起刷题、一起崩溃、一起上岸。' },
  { name: '志愿者服务队', description: '校园公益在行动，时长攒起来。' },
  { name: '校园广播站', description: '声音好听的小哥哥小姐姐扎堆。' },
  { name: '主持队', description: '舞台上的主角，台风稳健。' },
  { name: '创意工坊', description: '学园创意项目孵化地，路演常客。' }
];

// 任务名称池
const TASK_NAMES = [
  '社团迎新值班',
  '采集实验耗材',
  '组队打比赛',
  '护送物资到实验室',
  '清理机房租物',
  '协助设备调试',
  '撰写社团推送',
  '探索新食堂',
  '维护社团公众号',
  '驱逐占座书本',
  '收集参考资料',
  '维护机房门禁',
  '辅导社团新人',
  '整理活动海报',
  '打扫社团活动室',
];

// 任务描述池
const TASK_DESCRIPTIONS = [
  '在社团值班，负责迎新答疑，维护秩序。',
  '前往实验室领取指定数量的实验耗材。',
  '拉几个同学组队，报名一项校级竞赛。',
  '把一批元器件送到指定实验室。',
  '清理机房租物，把前人留下的杂物收掉。',
  '协助学长学姐完成设备调试工作。',
  '为社团公众号撰写一篇主题推文。',
  '探索学校新开的食堂窗口并写测评。',
  '更新社团公众号文章，保持活跃度。',
  '帮社团清理占座的书本和私人物品。',
  '收集下一阶段项目需要的参考资料。',
  '维护社团活动室门禁刷卡系统。',
  '为社团新成员解答入门问题。',
  '为社团活动设计并张贴海报。',
  '打扫社团活动室，整理桌椅。',
];

export interface RandomSectTask {
  id: string;
  name: string;
  description: string;
  type: 'patrol' | 'donate_stone' | 'donate_herb' | 'collect' | 'hunt';
  cost?: {
    spiritStones?: number;
    items?: { name: string; quantity: number }[];
  };
  reward: {
    contribution: number;
    exp?: number;
    spiritStones?: number;
    items?: { name: string; quantity: number }[];
  };
  timeCost: 'instant' | 'short' | 'medium' | 'long';
}

// 生成随机副本
export const generateRandomRealms = (
  playerRealm: RealmType,
  count: number = 6
): SecretRealm[] => {
  const playerRealmIndex = REALM_ORDER.indexOf(playerRealm);
  const realms: SecretRealm[] = [];

  for (let i = 0; i < count; i++) {
    // 随机选择境界要求（不能超过玩家境界太多）
    const maxRealmIndex = Math.min(
      playerRealmIndex + 2,
      REALM_ORDER.length - 1
    );
    const minRealmIndex = Math.max(0, playerRealmIndex - 1);
    const realmIndex =
      Math.floor(Math.random() * (maxRealmIndex - minRealmIndex + 1)) +
      minRealmIndex;
    const minRealm = REALM_ORDER[realmIndex];

    // 随机选择风险等级
    const riskLevels: ('低' | '中' | '高' | '极度危险')[] = [
      '低',
      '中',
      '高',
      '极度危险',
    ];
    const riskLevel = riskLevels[Math.floor(Math.random() * riskLevels.length)];

    // 根据风险等级和境界计算成本
    const baseCost = 50 + realmIndex * 50;
    const riskMultiplier =
      riskLevel === '低'
        ? 0.8
        : riskLevel === '中'
          ? 1
          : riskLevel === '高'
            ? 1.5
            : 2;
    const cost = Math.floor(
      baseCost * riskMultiplier * (0.9 + Math.random() * 0.2)
    );

    // 根据风险等级选择对应的名称和描述
    const availableNames = REALM_NAMES_BY_RISK[riskLevel];
    const availableDescriptions = REALM_DESCRIPTIONS_BY_RISK[riskLevel];
    const name = availableNames[Math.floor(Math.random() * availableNames.length)];
    const description = availableDescriptions[Math.floor(Math.random() * availableDescriptions.length)];

    // 随机生成掉落物（2-4个）
    const dropCount = 2 + Math.floor(Math.random() * 3);
    const drops: string[] = [];
    const usedDrops = new Set<string>();
    for (let j = 0; j < dropCount; j++) {
      let drop = DROP_ITEMS[Math.floor(Math.random() * DROP_ITEMS.length)];
      while (usedDrops.has(drop) && usedDrops.size < DROP_ITEMS.length) {
        drop = DROP_ITEMS[Math.floor(Math.random() * DROP_ITEMS.length)];
      }
      usedDrops.add(drop);
      drops.push(drop);
    }

    realms.push({
      id: `realm-${randomId()}`,
      name,
      description,
      minRealm,
      cost,
      riskLevel,
      drops,
    });
  }

  return realms;
};

// 生成随机社团
export const generateRandomSects = (
  playerRealm: RealmType,
  count: number = 6
): SectInfo[] => {
  const playerRealmIndex = REALM_ORDER.indexOf(playerRealm);
  const sects: SectInfo[] = [];

  for (let i = 0; i < count; i++) {
    // 随机选择境界要求
    const maxRealmIndex = Math.min(
      playerRealmIndex + 1,
      REALM_ORDER.length - 1
    );
    const realmIndex = Math.floor(Math.random() * (maxRealmIndex + 1));
    const reqRealm = REALM_ORDER[realmIndex];

    // 随机选择一个社团（名称和描述绑定）
    const sectData = SECT_DATA[Math.floor(Math.random() * SECT_DATA.length)];
    const name = sectData.name;
    const description = sectData.description;

    sects.push({
      id: `sect-${randomId()}`,
      name,
      description,
      reqRealm,
    });
  }

  return sects;
};

// 生成随机社团任务
export const generateRandomSectTasks = (
  playerRank: string,
  count: number = 3
): RandomSectTask[] => {
  const tasks: RandomSectTask[] = [];
  const taskTypes: Array<
    'patrol' | 'donate_stone' | 'donate_herb' | 'collect' | 'hunt'
  > = ['patrol', 'donate_stone', 'donate_herb', 'collect', 'hunt'];

  // 根据等级调整奖励基数
  const rankMultiplier =
    playerRank === '新成员'
      ? 1
      : playerRank === '正式成员'
        ? 1.5
        : playerRank === '核心成员'
          ? 2
          : 3;

  for (let i = 0; i < count; i++) {
    const type = taskTypes[Math.floor(Math.random() * taskTypes.length)];
    const name = TASK_NAMES[Math.floor(Math.random() * TASK_NAMES.length)];
    const description =
      TASK_DESCRIPTIONS[Math.floor(Math.random() * TASK_DESCRIPTIONS.length)];

    const cost: RandomSectTask['cost'] = {};
    const reward: RandomSectTask['reward'] = {
      contribution: Math.floor((10 + Math.random() * 40) * rankMultiplier),
    };
    const timeCosts: Array<'instant' | 'short' | 'medium' | 'long'> = [
      'instant',
      'short',
      'medium',
      'long',
    ];
    const timeCost = timeCosts[Math.floor(Math.random() * timeCosts.length)];

    switch (type) {
      case 'patrol':
        // 巡逻任务：瞬时完成，只给贡献（基础值 ×1.3）
        reward.contribution = Math.floor(
          (13 + Math.random() * 26) * rankMultiplier
        );
        break;
      case 'donate_stone':
        // 上交学分：消耗学分，给贡献和少量学分（贡献 ×1.3）
        cost.spiritStones = Math.floor(50 + Math.random() * 150);
        reward.contribution = Math.floor(
          (26 + Math.random() * 39) * rankMultiplier
        );
        reward.spiritStones = Math.floor(cost.spiritStones * 0.3);
        break;
      case 'donate_herb': {
        // 上交食材：消耗食材，给贡献（×1.3）
        const herbNames = ['速溶咖啡粉', '乌龙茶叶茶包', '挂耳咖啡', '可可粉', '抹茶粉'];
        cost.items = [
          {
            name: herbNames[Math.floor(Math.random() * herbNames.length)],
            quantity: 1 + Math.floor(Math.random() * 3),
          },
        ];
        reward.contribution = Math.floor(
          (19 + Math.random() * 32) * rankMultiplier
        );
        break;
      }
      case 'collect': {
        // 收集任务：需要收集元件，给贡献和物品（贡献 ×1.3）
        const materialNames = ['杜邦线', '电阻若干', '面包板', 'A4 草稿纸'];
        cost.items = [
          {
            name: materialNames[
              Math.floor(Math.random() * materialNames.length)
            ],
            quantity: 1 + Math.floor(Math.random() * 2),
          },
        ];
        reward.contribution = Math.floor(
          (32 + Math.random() * 45) * rankMultiplier
        );
        reward.items = [
          {
            name: '冰美式',
            quantity: 1,
          },
        ];
        break;
      }
      case 'hunt':
        // 猎杀任务：需要战斗，给贡献和经验（贡献 ×1.3，经验 ×1.3）
        reward.contribution = Math.floor(
          (39 + Math.random() * 52) * rankMultiplier
        );
        reward.exp = Math.floor((65 + Math.random() * 130) * rankMultiplier);
        break;
    }

    tasks.push({
      id: `task-${randomId()}`,
      name,
      description,
      type,
      cost,
      reward,
      timeCost,
    });
  }

  return tasks;
};

// 社团商店物品池（用于生成社团商店物品）
const SECT_SHOP_ITEM_POOL: Array<{ name: string; cost: number; item: Omit<Item, 'id'> }> = [
  { name: '杜邦线一捆', cost: 10, item: { name: '杜邦线一捆', type: ItemType.Material, description: '用于基础实验的电子元件。', quantity: 1, rarity: '普通' } },
  { name: '冰美式', cost: 20, item: { name: '冰美式', type: ItemType.Pill, description: '短时间内大幅提升刷题效率。', quantity: 1, rarity: '普通', effect: { exp: 50 } } },
  { name: '挂耳咖啡', cost: 50, item: { name: '挂耳咖啡', type: ItemType.Herb, description: '熬夜提神利器，生长在实验室茶水间。', quantity: 1, rarity: '稀有' } },
  { name: '能量饮料', cost: 100, item: { name: '能量饮料', type: ItemType.Pill, description: '恢复精力，略微提升精力上限。', quantity: 1, rarity: '稀有', effect: { hp: 50 } } },
  { name: '绩点冲刺券', cost: 1000, item: { name: '绩点冲刺券', type: ItemType.Pill, description: '增加学期绩点的成功率。', quantity: 1, rarity: '传说', effect: { exp: 500 } } },
  { name: '学长内推码', cost: 500, item: { name: '学长内推码', type: ItemType.Material, description: '直通大厂实习的稀有凭证。', quantity: 1, rarity: '稀有' } },
  { name: '强化元件', cost: 30, item: { name: '强化元件', type: ItemType.Material, description: '用于升级外设的珍贵材料。', quantity: 1, rarity: '稀有' } },
  { name: '醒脑薄荷糖', cost: 80, item: { name: '醒脑薄荷糖', type: ItemType.Pill, description: '提神醒脑，提升思维。', quantity: 1, rarity: '稀有', effect: { spirit: 10 } } },
  { name: '蛋白棒', cost: 80, item: { name: '蛋白棒', type: ItemType.Pill, description: '补充体能，提升体能。', quantity: 1, rarity: '稀有', effect: { physique: 10 } } },
  { name: '葡萄糖补水液', cost: 15, item: { name: '葡萄糖补水液', type: ItemType.Pill, description: '快速恢复精力。', quantity: 1, rarity: '普通', effect: { hp: 50 } } },
  { name: '挂耳咖啡盒', cost: 25, item: { name: '挂耳咖啡盒', type: ItemType.Herb, description: '提神醒脑的常见咖啡饮品。', quantity: 1, rarity: '普通' } },
  { name: '电阻若干', cost: 40, item: { name: '电阻若干', type: ItemType.Material, description: '珍贵的实验耗材。', quantity: 1, rarity: '稀有' } },
  { name: '示波器探头', cost: 60, item: { name: '示波器探头', type: ItemType.Material, description: '实验室里稀缺的设备耗材。', quantity: 1, rarity: '稀有' } },
  { name: '杜邦线散装', cost: 20, item: { name: '杜邦线散装', type: ItemType.Material, description: '常用的电子元件。', quantity: 1, rarity: '普通' } },
  { name: '乌龙茶包', cost: 35, item: { name: '乌龙茶包', type: ItemType.Herb, description: '珍贵的茶饮，可用于深夜续命。', quantity: 1, rarity: '稀有' } },
];

// 生成社团商店物品（每次刷新4-8个）
export const generateSectShopItems = (): Array<{ name: string; cost: number; item: Omit<Item, 'id'> }> => {
  const itemCount = 4 + Math.floor(Math.random() * 5); // 4-8个物品
  const items: Array<{ name: string; cost: number; item: Omit<Item, 'id'> }> = [];
  const usedItems = new Set<string>();

  for (let i = 0; i < itemCount; i++) {
    // 随机选择一个物品
    let selectedItem = SECT_SHOP_ITEM_POOL[Math.floor(Math.random() * SECT_SHOP_ITEM_POOL.length)];

    // 避免重复（但如果池子不够大，允许少量重复）
    let attempts = 0;
    while (usedItems.has(selectedItem.name) && attempts < 10 && usedItems.size < SECT_SHOP_ITEM_POOL.length) {
      selectedItem = SECT_SHOP_ITEM_POOL[Math.floor(Math.random() * SECT_SHOP_ITEM_POOL.length)];
      attempts++;
    }

    usedItems.add(selectedItem.name);
    items.push({ ...selectedItem });
  }

  return items;
};
