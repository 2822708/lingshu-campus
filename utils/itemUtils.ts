import { Item, ItemType, ItemRarity, EquipmentSlot } from '../types';
import { RARITY_MULTIPLIERS } from '../constants';

// 已知物品的效果映射表（确保描述和实际效果一致）
// 物品名使用虚构工科学园主题：食材类→鲜牛奶/咖啡豆，饮品类→速溶美式/...
export const KNOWN_ITEM_EFFECTS: Record<
  string,
  Pick<Item, 'effect' | 'permanentEffect'>
> = {
  // 初始物品
  鲜牛奶: { effect: { hp: 50 } },
  咖啡豆: { effect: {} },
  万能板: { effect: {} },
  入门薄膜键盘: { effect: { attack: 5 } },
  军训迷彩服: { effect: { defense: 3, hp: 10 } },
  // 配方产物（饮品）—— 增幅全面提升
  速溶美式: { effect: { exp: 200, hp: 30 } },
  生椰拿铁: { effect: { hp: 500, exp: 50 } },
  蛋白奶昔: { effect: { hp: 150, physique: 2 } },
  东鹏特饮: { effect: { exp: 2000, spirit: 5 } },
  三倍浓缩冰美式: { effect: { hp: 1500, attack: 10 } },
  手冲瑰夏: { effect: { exp: 15000, attack: 30, defense: 30 } },
  // 可发现配方
  薄荷气泡水: { effect: { spirit: 40 } },
  能量蛋白棒: { effect: { physique: 40, hp: 100 } },
  双份浓缩续命水: { effect: { exp: 3000, hp: 200 } },
  冷萃氮气咖啡: { effect: { exp: 6000, spirit: 100, physique: 100 } },
  学神特调: {
    effect: {
      exp: 30000,
      attack: 100,
      defense: 100,
      spirit: 150,
      physique: 150,
      speed: 50,
    },
  },
  // 🆕 提高晋升成功率的咖啡（临时 buff，下次突破成功率 +N%）
  答辩顺利咖: { effect: { breakthroughBonus: 0.3, exp: 200 } },
  期末冲刺浓缩: { effect: { breakthroughBonus: 0.5, exp: 1000 } },
  学神护体特调: {
    effect: { breakthroughBonus: 0.99, exp: 5000 }, // 临时必过
  },
};

// 规范化物品效果，确保已知物品的效果与描述一致
export const normalizeItemEffect = (
  itemName: string,
  aiEffect?: Item['effect'],
  aiPermanentEffect?: Item['permanentEffect']
) => {
  const knownItem = KNOWN_ITEM_EFFECTS[itemName];
  if (knownItem) {
    // 如果物品在已知列表中，使用预定义的效果
    return {
      effect: knownItem.effect || aiEffect || {},
      permanentEffect: knownItem.permanentEffect || aiPermanentEffect || {},
    };
  }
  // 否则使用AI生成的效果
  return {
    effect: aiEffect || {},
    permanentEffect: aiPermanentEffect || {},
  };
};

// 根据物品名称和描述推断物品类型和装备槽位
export const inferItemTypeAndSlot = (
  name: string,
  currentType: ItemType | '防具',
  description: string,
  currentIsEquippable?: boolean
): {
  type: ItemType;
  isEquippable: boolean;
  equipmentSlot?: EquipmentSlot;
} => {
  const nameLower = name.toLowerCase();
  const descLower = description.toLowerCase();
  const combined = nameLower + descLower;

  // 武器类（键鼠：键盘/鼠标，优先级最高）
  // 关键词：薄膜键盘/机械键盘/静电容键盘/光轴键盘/青轴/红轴/茶轴/黑轴 等轴体术语
  if (
    combined.match(
      /键盘|鼠标|键鼠|薄膜键盘|机械键盘|静电容|光轴|轴体|青轴|红轴|茶轴|黑轴|无线鼠标|蓝牙鼠标/
    )
  ) {
    return {
      type: ItemType.Weapon,
      isEquippable: true,
      equipmentSlot: EquipmentSlot.Weapon,
    };
  }

  // 头部装备（帽子/耳机/头戴），优先检查避免被其他规则误判
  if (
    combined.match(
      /帽子|鸭舌帽|棒球帽|针织帽|渔夫帽|耳罩|头戴式|耳机|降噪耳机|有线耳机|蓝牙耳机|耳麦|头戴/
    )
  ) {
    return {
      type: ItemType.Armor,
      isEquippable: true,
      equipmentSlot: EquipmentSlot.Head,
    };
  }

  // 肩部装备（双肩包/斜挎包/书包）
  if (
    combined.match(/双肩包|单肩包|斜挎包|书包|背包|登山包|电脑包|邮差包|胸包/)
  ) {
    return {
      type: ItemType.Armor,
      isEquippable: true,
      equipmentSlot: EquipmentSlot.Shoulder,
    };
  }

  // 手部装备（手套/护腕/键盘手托）
  if (combined.match(/手套|护腕|手部|腕托|半指手套|全指手套|电竞手套|键盘手托/)) {
    return {
      type: ItemType.Armor,
      isEquippable: true,
      equipmentSlot: EquipmentSlot.Gloves,
    };
  }

  // 鞋履
  if (
    combined.match(
      /跑鞋|登山鞋|运动鞋|板鞋|帆布鞋|碳板鞋|缓震|球鞋|拖鞋|凉鞋|靴子|皮鞋|休闲鞋/
    )
  ) {
    return {
      type: ItemType.Armor,
      isEquippable: true,
      equipmentSlot: EquipmentSlot.Boots,
    };
  }

  // 裤装
  if (
    combined.match(
      /裤子|长裤|短裤|工装裤|运动裤|冲锋裤|速干裤|加绒裤|阔腿裤|铅笔裤|机能裤|机能工装裤/
    )
  ) {
    return {
      type: ItemType.Armor,
      isEquippable: true,
      equipmentSlot: EquipmentSlot.Legs,
    };
  }

  // 上衣装备（放在最后，作为默认护甲类型）
  if (
    combined.match(
      /卫衣|T恤|文化衫|班服|冲锋衣|夹克|外套|衬衫|实验服|白大褂|院服|大褂|上衣|长袖/
    )
  ) {
    return {
      type: ItemType.Armor,
      isEquippable: true,
      equipmentSlot: EquipmentSlot.Chest,
    };
  }

  // 手环（智能手环/运动手环）
  if (combined.match(/手环|腕表|手表|运动表|智能环|计步环|小米手环|华为手环|苹果表/)) {
    // 随机分配一个手环槽位
    const ringSlots = [
      EquipmentSlot.Ring1,
      EquipmentSlot.Ring2,
      EquipmentSlot.Ring3,
      EquipmentSlot.Ring4,
    ];
    return {
      type: ItemType.Ring,
      isEquippable: true,
      equipmentSlot: ringSlots[Math.floor(Math.random() * ringSlots.length)],
    };
  }

  // 挂件（校园卡挂绳/工牌/挂牌）
  if (combined.match(/挂绳|校园卡|工牌|挂牌|证件挂|钥匙扣|挂件|校园卡套/)) {
    const accessorySlots = [EquipmentSlot.Accessory1, EquipmentSlot.Accessory2];
    return {
      type: ItemType.Accessory,
      isEquippable: true,
      equipmentSlot:
        accessorySlots[Math.floor(Math.random() * accessorySlots.length)],
    };
  }

  // 外设（注意：如果名称包含键鼠关键词，已经在上面被判定为武器了，不会到这里）
  // 关键词：显示器、扩展坞、数位板、风冷/水冷、相机、示波器等
  if (
    combined.match(
      /显示器|扩展坞|数位板|坞站|硬盘|充电器|充电宝|路由器|摄像头|麦克风|音箱|投影仪|打印机|扫描仪|集线器|风冷|水冷|压感笔|显示器支架|屏幕挂灯|人体工学椅|数位屏|手柄/
    ) &&
    !combined.match(/键盘|鼠标|键鼠|薄膜键盘|机械键盘|静电容|光轴|轴体|青轴|红轴|茶轴|黑轴/) // 确保不包含键鼠关键词
  ) {
    const artifactSlots = [EquipmentSlot.Artifact1, EquipmentSlot.Artifact2];
    return {
      type: ItemType.Artifact,
      isEquippable: true,
      equipmentSlot:
        artifactSlots[Math.floor(Math.random() * artifactSlots.length)],
    };
  }

  // 如果当前类型是"防具"等非标准类型，转换为护甲
  if (currentType === '防具') {
    // 默认作为胸甲处理
    return {
      type: ItemType.Armor,
      isEquippable: true,
      equipmentSlot: EquipmentSlot.Chest,
    };
  }

  // 保持原有类型，但如果是装备类且没有槽位，尝试推断
  if (currentIsEquippable) {
    if (currentType === ItemType.Armor) {
      return {
        type: ItemType.Armor,
        isEquippable: true,
        equipmentSlot: EquipmentSlot.Chest, // 默认胸甲
      };
    } else if (currentType === ItemType.Weapon) {
      return {
        type: ItemType.Weapon,
        isEquippable: true,
        equipmentSlot: EquipmentSlot.Weapon,
      };
    }
  }

  return {
    type: currentType,
    isEquippable: currentIsEquippable || false,
  };
};

// Helper to calculate item stats based on rarity
export const getItemStats = (item: Item, isNatal: boolean = false) => {
  const rarity = item.rarity || '普通';
  const multiplier = RARITY_MULTIPLIERS[rarity] || 1;
  // 主力外设额外50%加成
  const natalMultiplier = isNatal ? 1.5 : 1;

  return {
    attack: item.effect?.attack
      ? Math.floor(item.effect.attack * multiplier * natalMultiplier)
      : 0,
    defense: item.effect?.defense
      ? Math.floor(item.effect.defense * multiplier * natalMultiplier)
      : 0,
    hp: item.effect?.hp
      ? Math.floor(item.effect.hp * multiplier * natalMultiplier)
      : 0,
    spirit: item.effect?.spirit
      ? Math.floor(item.effect.spirit * multiplier * natalMultiplier)
      : 0,
    physique: item.effect?.physique
      ? Math.floor(item.effect.physique * multiplier * natalMultiplier)
      : 0,
    speed: item.effect?.speed
      ? Math.floor(item.effect.speed * multiplier * natalMultiplier)
      : 0,
  };
};

// 生成属性预览文本
export const generateAttributePreview = (effect: Item['effect']): string => {
  if (!effect) return '';
  const attrs: string[] = [];
  if (effect.attack) attrs.push(`攻+${effect.attack}`);
  if (effect.defense) attrs.push(`防+${effect.defense}`);
  if (effect.hp) attrs.push(`精力+${effect.hp}`);
  if (effect.spirit) attrs.push(`思维+${effect.spirit}`);
  if (effect.physique) attrs.push(`体能+${effect.physique}`);
  if (effect.speed) attrs.push(`手速+${effect.speed}`);
  return attrs.length > 0 ? ` [${attrs.join(' ')}]` : '';
};

// 计算物品出售价格
export const calculateItemSellPrice = (item: Item): number => {
  const rarity = item.rarity || '普通';
  const level = item.level || 0;

  // 基础价格（根据稀有度）
  const basePrices: Record<ItemRarity, number> = {
    普通: 10,
    稀有: 50,
    传说: 300,
    绝版: 2000,
  };
  const basePrice = basePrices[rarity];

  // 计算属性价值
  let attributeValue = 0;
  const rarityMultiplier = RARITY_MULTIPLIERS[rarity];

  // 临时效果价值（effect）
  if (item.effect) {
    const effect = item.effect;
    attributeValue += (effect.attack || 0) * 2; // 攻击力每点值2学分
    attributeValue += (effect.defense || 0) * 1.5; // 防御力每点值1.5学分
    attributeValue += (effect.hp || 0) * 0.5; // 精力每点值0.5学分
    attributeValue += (effect.spirit || 0) * 1.5; // 思维每点值1.5学分
    attributeValue += (effect.physique || 0) * 1.5; // 体能每点值1.5学分
    attributeValue += (effect.speed || 0) * 2; // 手速每点值2学分
    attributeValue += (effect.exp || 0) * 0.1; // 绩点每点值0.1学分（临时效果）
  }

  // 永久效果价值（permanentEffect，更值钱）
  if (item.permanentEffect) {
    const permEffect = item.permanentEffect;
    attributeValue += (permEffect.attack || 0) * 10; // 永久攻击每点值10学分
    attributeValue += (permEffect.defense || 0) * 8; // 永久防御每点值8学分
    attributeValue += (permEffect.maxHp || 0) * 3; // 永久精力上限每点值3学分
    attributeValue += (permEffect.spirit || 0) * 8; // 永久思维每点值8学分
    attributeValue += (permEffect.physique || 0) * 8; // 永久体能每点值8学分
    attributeValue += (permEffect.speed || 0) * 10; // 永久手速每点值10学分
  }

  // 应用稀有度倍率到属性价值
  attributeValue = Math.floor(attributeValue * rarityMultiplier);

  // 装备类物品额外价值加成
  let equipmentBonus = 0;
  if (item.isEquippable) {
    // 装备类物品根据类型有不同的基础价值
    switch (item.type) {
      case ItemType.Weapon:
        equipmentBonus = basePrice * 1.5; // 键鼠额外50%价值
        break;
      case ItemType.Armor:
        equipmentBonus = basePrice * 1.2; // 穿戴额外20%价值
        break;
      case ItemType.Artifact:
        equipmentBonus = basePrice * 2; // 外设额外100%价值
        break;
      case ItemType.Ring:
      case ItemType.Accessory:
        equipmentBonus = basePrice * 1.3; // 手环和挂件额外30%价值
        break;
    }
  }

  // 强化等级加成（每级增加20%价值）
  const levelMultiplier = 1 + level * 0.2;

  // 计算最终价格
  const totalValue =
    (basePrice + attributeValue + equipmentBonus) * levelMultiplier;

  // 根据物品类型调整（消耗品价值较低）
  let typeMultiplier = 1;
  if (item.type === ItemType.Herb || item.type === ItemType.Pill) {
    typeMultiplier = 0.5; // 消耗品价值减半
  } else if (item.type === ItemType.Material) {
    typeMultiplier = 0.3; // 元件价值更低
  }

  // 最终价格（取整，最低为1）
  return Math.max(1, Math.floor(totalValue * typeMultiplier));
};
