import React, { useState, useMemo } from 'react';
import {
  Item,
  ItemType,
  ItemRarity,
  PlayerStats,
  EquipmentSlot,
} from '../types';
import {
  X,
  Package,
  ShieldCheck,
  Hammer,
  Trash2,
  Sparkles,
  ArrowUpDown,
  Trash,
  Zap,
} from 'lucide-react';
import { RARITY_MULTIPLIERS } from '../constants';
import EquipmentPanel from './EquipmentPanel';
import BatchDiscardModal from './BatchDiscardModal';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  inventory: Item[];
  equippedItems: Partial<Record<EquipmentSlot, string>>;
  player: PlayerStats;
  onUseItem: (item: Item) => void;
  onUseItemBatch?: (item: Item, count: number) => void;
  onUseAllConsumables?: () => void;
  onEquipItem: (item: Item, slot: EquipmentSlot) => void;
  onUnequipItem: (slot: EquipmentSlot) => void;
  onAutoEquip?: () => void;
  onUpgradeItem: (item: Item) => void;
  onDiscardItem: (item: Item) => void;
  onBatchDiscard: (itemIds: string[]) => void;
  onRefineNatalArtifact?: (item: Item) => void;
  onUnrefineNatalArtifact?: () => void;
}

type ItemCategory = 'all' | 'equipment' | 'pill' | 'consumable';

const InventoryModal: React.FC<Props> = ({
  isOpen,
  onClose,
  inventory,
  equippedItems,
  player,
  onUseItem,
  onUseItemBatch,
  onUseAllConsumables,
  onEquipItem,
  onUnequipItem,
  onAutoEquip,
  onUpgradeItem,
  onDiscardItem,
  onBatchDiscard,
  onRefineNatalArtifact,
  onUnrefineNatalArtifact,
}) => {
  const [hoveredItem, setHoveredItem] = useState<Item | null>(null);
  const [showEquipment, setShowEquipment] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<ItemCategory>('all');
  const [selectedEquipmentSlot, setSelectedEquipmentSlot] = useState<
    EquipmentSlot | 'all'
  >('all');
  const [sortByRarity, setSortByRarity] = useState(true);
  const [isBatchDiscardOpen, setIsBatchDiscardOpen] = useState(false);
  const [mobileActiveTab, setMobileActiveTab] = useState<
    'equipment' | 'inventory'
  >('inventory');

  const handleBatchDiscard = (itemIds: string[]) => {
    onBatchDiscard(itemIds);
  };

  // 过滤和排序物品
  const filteredAndSortedInventory = useMemo(() => {
    // 品级排序权重
    const getRarityOrder = (rarity: ItemRarity | undefined): number => {
      const rarityOrder: Record<ItemRarity, number> = {
        绝版: 4,
        传说: 3,
        稀有: 2,
        普通: 1,
      };
      return rarityOrder[rarity || '普通'];
    };

    // 判断物品分类
    const getItemCategory = (item: Item): ItemCategory => {
      if (
        item.isEquippable ||
        item.type === ItemType.Weapon ||
        item.type === ItemType.Armor ||
        item.type === ItemType.Artifact ||
        item.type === ItemType.Accessory ||
        item.type === ItemType.Ring
      ) {
        return 'equipment';
      }
      if (item.type === ItemType.Pill) {
        return 'pill';
      }
      if (item.type === ItemType.Recipe) {
        return 'consumable'; // 配方归类为消耗品
      }
      return 'consumable';
    };

    let filtered = inventory;

    // 按分类过滤
    if (selectedCategory !== 'all') {
      filtered = inventory.filter(
        (item) => getItemCategory(item) === selectedCategory
      );
    }

    // 如果是装备分类，进一步按部位过滤
    if (selectedCategory === 'equipment' && selectedEquipmentSlot !== 'all') {
      filtered = filtered.filter((item) => {
        if (!item.equipmentSlot) return false;
        // 对于手环、挂件、外设，需要匹配对应的槽位组
        if (
          selectedEquipmentSlot === EquipmentSlot.Ring1 ||
          selectedEquipmentSlot === EquipmentSlot.Ring2 ||
          selectedEquipmentSlot === EquipmentSlot.Ring3 ||
          selectedEquipmentSlot === EquipmentSlot.Ring4
        ) {
          // 如果选择的是某个手环槽位，显示所有手环
          return (
            item.equipmentSlot === EquipmentSlot.Ring1 ||
            item.equipmentSlot === EquipmentSlot.Ring2 ||
            item.equipmentSlot === EquipmentSlot.Ring3 ||
            item.equipmentSlot === EquipmentSlot.Ring4
          );
        }
        if (
          selectedEquipmentSlot === EquipmentSlot.Accessory1 ||
          selectedEquipmentSlot === EquipmentSlot.Accessory2
        ) {
          // 如果选择的是某个挂件槽位，显示所有挂件
          return (
            item.equipmentSlot === EquipmentSlot.Accessory1 ||
            item.equipmentSlot === EquipmentSlot.Accessory2
          );
        }
        if (
          selectedEquipmentSlot === EquipmentSlot.Artifact1 ||
          selectedEquipmentSlot === EquipmentSlot.Artifact2
        ) {
          // 如果选择的是某个外设槽位，显示所有外设
          return (
            item.equipmentSlot === EquipmentSlot.Artifact1 ||
            item.equipmentSlot === EquipmentSlot.Artifact2
          );
        }
        // 其他部位直接匹配
        return item.equipmentSlot === selectedEquipmentSlot;
      });
    }

    // 按品级排序（从高到低）
    if (sortByRarity) {
      filtered = [...filtered].sort((a, b) => {
        const rarityA = getRarityOrder(a.rarity);
        const rarityB = getRarityOrder(b.rarity);
        if (rarityB !== rarityA) {
          return rarityB - rarityA; // 品级从高到低
        }
        // 如果品级相同，按名称排序
        return a.name.localeCompare(b.name, 'zh-CN');
      });
    }

    return filtered;
  }, [inventory, selectedCategory, selectedEquipmentSlot, sortByRarity]);

  // 计算所有已装备物品的总属性（必须在条件返回之前）
  const calculateTotalEquippedStats = useMemo(() => {
    let totalAttack = 0;
    let totalDefense = 0;
    let totalHp = 0;

    Object.values(equippedItems).forEach((itemId) => {
      if (itemId) {
        const item = inventory.find((i) => i.id === itemId);
        if (item) {
          // 在 useMemo 中直接计算属性，确保使用最新的 player.natalArtifactId
          const isNatal = item.id === player.natalArtifactId;
          const rarity = item.rarity || '普通';
          const multiplier = RARITY_MULTIPLIERS[rarity] || 1;
          const natalMultiplier = isNatal ? 1.5 : 1;

          const stats = {
            attack: item.effect?.attack
              ? Math.floor(item.effect.attack * multiplier * natalMultiplier)
              : 0,
            defense: item.effect?.defense
              ? Math.floor(item.effect.defense * multiplier * natalMultiplier)
              : 0,
            hp: item.effect?.hp
              ? Math.floor(item.effect.hp * multiplier * natalMultiplier)
              : 0,
          };

          totalAttack += stats.attack;
          totalDefense += stats.defense;
          totalHp += stats.hp;
        }
      }
    });

    return { attack: totalAttack, defense: totalDefense, hp: totalHp };
  }, [equippedItems, inventory, player.natalArtifactId]);

  if (!isOpen) return null;

  const getRarityNameClasses = (rarity: ItemRarity | undefined) => {
    const base = 'font-bold transition-colors duration-300 cursor-default ';
    switch (rarity) {
      case '稀有':
        return base + 'text-npu-text hover:text-blue-400';
      case '传说':
        return base + 'text-npu-text hover:text-purple-400';
      case '绝版':
        return base + 'text-npu-text hover:text-npu-code';
      default:
        return base + 'text-npu-text hover:text-npu-text';
    }
  };

  const getRarityBorder = (rarity: ItemRarity | undefined) => {
    switch (rarity) {
      case '稀有':
        return 'border-blue-800';
      case '传说':
        return 'border-purple-800';
      case '绝版':
        return 'border-npu-code';
      default:
        return 'border-npu-border';
    }
  };

  const getRarityBadge = (rarity: ItemRarity | undefined) => {
    switch (rarity) {
      case '稀有':
        return 'bg-npu-signal/15 text-blue-300 border-blue-700';
      case '传说':
        return 'bg-npu-network/15 text-purple-300 border-purple-700';
      case '绝版':
        return 'bg-npu-circuit/15 text-yellow-300 border-yellow-700';
      default:
        return 'bg-npu-border text-npu-dim border-npu-border';
    }
  };

  const getItemStats = (item: Item) => {
    const isNatal = item.id === player.natalArtifactId;
    // 使用标准的 getItemStats 函数，但这里我们需要直接计算以保持兼容性
    const rarity = item.rarity || '普通';
    const multiplier = RARITY_MULTIPLIERS[rarity] || 1;
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
      exp: item.effect?.exp || 0, // Exp usually static
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

  const calculateComparison = () => {
    if (!hoveredItem || !hoveredItem.isEquippable || !hoveredItem.equipmentSlot)
      return null;

    // 1. Get currently equipped stats for this slot
    const slot = hoveredItem.equipmentSlot;
    const currentEquippedId = equippedItems[slot];
    let currentEquippedStats = { attack: 0, defense: 0, hp: 0 };
    if (currentEquippedId) {
      const currentEquippedItem = inventory.find(
        (i) => i.id === currentEquippedId
      );
      if (currentEquippedItem) {
        currentEquippedStats = getItemStats(currentEquippedItem);
      }
    }

    // 2. Get hovered item stats
    const hoveredStats = getItemStats(hoveredItem);

    // 3. Calculate difference
    return {
      attack: hoveredStats.attack - currentEquippedStats.attack,
      defense: hoveredStats.defense - currentEquippedStats.defense,
      hp: hoveredStats.hp - currentEquippedStats.hp,
    };
  };

  const isItemEquipped = (item: Item): boolean => {
    if (!item.equipmentSlot) return false;

    // 检查物品是否在任何槽位装备
    // 对于手环、挂件、外设，需要检查所有同类型槽位
    if (item.type === ItemType.Ring) {
      const ringSlots = [
        EquipmentSlot.Ring1,
        EquipmentSlot.Ring2,
        EquipmentSlot.Ring3,
        EquipmentSlot.Ring4,
      ];
      return ringSlots.some((slot) => equippedItems[slot] === item.id);
    } else if (item.type === ItemType.Accessory) {
      const accessorySlots = [
        EquipmentSlot.Accessory1,
        EquipmentSlot.Accessory2,
      ];
      return accessorySlots.some((slot) => equippedItems[slot] === item.id);
    } else if (item.type === ItemType.Artifact) {
      const artifactSlots = [EquipmentSlot.Artifact1, EquipmentSlot.Artifact2];
      return artifactSlots.some((slot) => equippedItems[slot] === item.id);
    } else {
      // 其他装备类型直接检查对应槽位
      return equippedItems[item.equipmentSlot] === item.id;
    }
  };

  const comparison = calculateComparison();

  return (
    <div
      className="fixed inset-0 font-mono text-npu-text paper-overlay flex items-end md:items-center justify-center z-50 p-0 md:p-4 touch-manipulation"
      onClick={onClose}
    >
      <div
        className="bg-npu-panel w-full h-[80vh] md:h-auto md:max-w-6xl border-0 md:border border-npu-border shadow-2xl flex flex-col md:max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="paper-inventory-heading border-b border-npu-border bg-npu-panel">
          <h3 className="text-lg md:text-xl font-serif text-npu-code flex items-center gap-2">
            <Package size={18} className="md:w-5 md:h-5" /> 背包
          </h3>
          <div className="paper-inventory-tools">
            {onAutoEquip && (
              <button
                onClick={onAutoEquip}
                className="px-2 md:px-3 py-1.5 md:py-1 text-xs md:text-sm border border-npu-border transition-colors min-h-[44px] touch-manipulation text-npu-code hover:bg-npu-bg"
                title="自动从背包选最优装备穿上"
              >
                <Zap size={14} className="inline mr-1" />
                一键装备
              </button>
            )}
            {onUseAllConsumables && (
              <button
                onClick={onUseAllConsumables}
                className="px-2 md:px-3 py-1.5 md:py-1 text-xs md:text-sm border border-npu-border transition-colors min-h-[44px] touch-manipulation text-npu-code hover:bg-npu-bg"
                title="一键使用背包里所有可用的消耗品"
              >
                <Sparkles size={14} className="inline mr-1" />
                一键消耗
              </button>
            )}
            <button
              onClick={() => setIsBatchDiscardOpen(true)}
              className="px-2 md:px-3 py-1.5 md:py-1 rounded text-xs md:text-sm border transition-colors min-h-[44px] md:min-h-0 touch-manipulation bg-npu-warn/10 border-npu-warn text-npu-warn hover:bg-npu-warn/10"
            >
              <Trash size={14} className="inline mr-1" />
              批量丢弃
            </button>
            <button
              onClick={() => setShowEquipment(!showEquipment)}
              className={`hidden flex items-center justify-center md:flex px-3 py-1 rounded text-sm border transition-colors ${
                showEquipment
                  ? 'bg-npu-code/20 border-npu-code text-npu-code'
                  : 'bg-npu-border border-npu-border text-npu-text'
              }`}
            >
              {showEquipment ? '隐藏' : '显示'}装备栏
            </button>
            <button
              onClick={onClose}
              className="text-npu-dim active:text-npu-text min-w-[44px] min-h-[44px] flex items-center justify-center touch-manipulation"
              aria-label="关闭"
              title="关闭"
            >
              <X size={24} />
            </button>
          </div>
        </div>

        {/* 移动端Tab切换 */}
        <div className="md:hidden border-b border-npu-border bg-npu-panel">
          <div className="flex">
            <button
              onClick={() => setMobileActiveTab('equipment')}
              className={`flex-1 px-4 py-3 text-sm font-medium transition-colors border-b-2 ${
                mobileActiveTab === 'equipment'
                  ? 'border-npu-code text-npu-code bg-npu-code/10'
                  : 'border-transparent text-npu-dim hover:text-npu-text'
              }`}
            >
              <ShieldCheck size={16} className="inline mr-2" />
              装备栏位
            </button>
            <button
              onClick={() => setMobileActiveTab('inventory')}
              className={`flex-1 px-4 py-3 text-sm font-medium transition-colors border-b-2 ${
                mobileActiveTab === 'inventory'
                  ? 'border-npu-code text-npu-code bg-npu-code/10'
                  : 'border-transparent text-npu-dim hover:text-npu-text'
              }`}
            >
              <Package size={16} className="inline mr-2" />
              背包
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
          {/* 装备面板 */}
          {(showEquipment || mobileActiveTab === 'equipment') && (
            <div
              className={`w-full md:w-1/2 border-b md:border-b-0 md:border-r border-npu-border p-3 md:p-4 overflow-y-auto ${
                mobileActiveTab !== 'equipment' ? 'hidden md:block' : ''
              }`}
            >
              <EquipmentPanel
                equippedItems={equippedItems}
                inventory={inventory}
                player={player}
                onUnequip={onUnequipItem}
              />
            </div>
          )}

          {/* 物品列表 */}
          <div
            className={`${showEquipment ? 'w-full md:w-1/2' : 'w-full'} p-4 overflow-y-auto flex flex-col ${
              mobileActiveTab !== 'inventory' ? 'hidden md:flex' : ''
            }`}
          >
            {/* 分类标签和排序按钮 */}
            <div className="mb-4 flex flex-col gap-2">
              {/* 分类标签 */}
              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={() => {
                    setSelectedCategory('all');
                    setSelectedEquipmentSlot('all');
                  }}
                  className={`px-3 py-1.5 rounded text-sm border transition-colors ${
                    selectedCategory === 'all'
                      ? 'bg-npu-code/20 border-npu-code text-npu-code'
                      : 'bg-npu-border border-npu-border text-npu-text hover:bg-npu-muted'
                  }`}
                >
                  全部
                </button>
                <button
                  onClick={() => {
                    setSelectedCategory('equipment');
                    setSelectedEquipmentSlot('all');
                  }}
                  className={`px-3 py-1.5 rounded text-sm border transition-colors ${
                    selectedCategory === 'equipment'
                      ? 'bg-npu-code/20 border-npu-code text-npu-code'
                      : 'bg-npu-border border-npu-border text-npu-text hover:bg-npu-muted'
                  }`}
                >
                  装备
                </button>
                <button
                  onClick={() => {
                    setSelectedCategory('pill');
                    setSelectedEquipmentSlot('all');
                  }}
                  className={`px-3 py-1.5 rounded text-sm border transition-colors ${
                    selectedCategory === 'pill'
                      ? 'bg-npu-code/20 border-npu-code text-npu-code'
                      : 'bg-npu-border border-npu-border text-npu-text hover:bg-npu-muted'
                  }`}
                >
                  饮品
                </button>
                <button
                  onClick={() => {
                    setSelectedCategory('consumable');
                    setSelectedEquipmentSlot('all');
                  }}
                  className={`px-3 py-1.5 rounded text-sm border transition-colors ${
                    selectedCategory === 'consumable'
                      ? 'bg-npu-code/20 border-npu-code text-npu-code'
                      : 'bg-npu-border border-npu-border text-npu-text hover:bg-npu-muted'
                  }`}
                >
                  用品
                </button>
              </div>
              {/* 装备部位细分（仅在装备分类时显示） */}
              {selectedCategory === 'equipment' && (
                <div className="flex gap-2 flex-wrap">
                  <button
                    onClick={() => setSelectedEquipmentSlot('all')}
                    className={`px-2 py-1 rounded text-xs border transition-colors ${
                      selectedEquipmentSlot === 'all'
                        ? 'bg-npu-code/20 border-npu-code text-npu-code'
                        : 'bg-npu-border border-npu-border text-npu-text hover:bg-npu-muted'
                    }`}
                  >
                    全部装备
                  </button>
                  <button
                    onClick={() =>
                      setSelectedEquipmentSlot(EquipmentSlot.Weapon)
                    }
                    className={`px-2 py-1 rounded text-xs border transition-colors ${
                      selectedEquipmentSlot === EquipmentSlot.Weapon
                        ? 'bg-npu-code/20 border-npu-code text-npu-code'
                        : 'bg-npu-border border-npu-border text-npu-text hover:bg-npu-muted'
                    }`}
                  >
                    键鼠
                  </button>
                  <button
                    onClick={() => setSelectedEquipmentSlot(EquipmentSlot.Head)}
                    className={`px-2 py-1 rounded text-xs border transition-colors ${
                      selectedEquipmentSlot === EquipmentSlot.Head
                        ? 'bg-npu-code/20 border-npu-code text-npu-code'
                        : 'bg-npu-border border-npu-border text-npu-text hover:bg-npu-muted'
                    }`}
                  >
                    头戴
                  </button>
                  <button
                    onClick={() =>
                      setSelectedEquipmentSlot(EquipmentSlot.Shoulder)
                    }
                    className={`px-2 py-1 rounded text-xs border transition-colors ${
                      selectedEquipmentSlot === EquipmentSlot.Shoulder
                        ? 'bg-npu-code/20 border-npu-code text-npu-code'
                        : 'bg-npu-border border-npu-border text-npu-text hover:bg-npu-muted'
                    }`}
                  >
                    肩背
                  </button>
                  <button
                    onClick={() =>
                      setSelectedEquipmentSlot(EquipmentSlot.Chest)
                    }
                    className={`px-2 py-1 rounded text-xs border transition-colors ${
                      selectedEquipmentSlot === EquipmentSlot.Chest
                        ? 'bg-npu-code/20 border-npu-code text-npu-code'
                        : 'bg-npu-border border-npu-border text-npu-text hover:bg-npu-muted'
                    }`}
                  >
                    上衣
                  </button>
                  <button
                    onClick={() =>
                      setSelectedEquipmentSlot(EquipmentSlot.Gloves)
                    }
                    className={`px-2 py-1 rounded text-xs border transition-colors ${
                      selectedEquipmentSlot === EquipmentSlot.Gloves
                        ? 'bg-npu-code/20 border-npu-code text-npu-code'
                        : 'bg-npu-border border-npu-border text-npu-text hover:bg-npu-muted'
                    }`}
                  >
                    手部
                  </button>
                  <button
                    onClick={() => setSelectedEquipmentSlot(EquipmentSlot.Legs)}
                    className={`px-2 py-1 rounded text-xs border transition-colors ${
                      selectedEquipmentSlot === EquipmentSlot.Legs
                        ? 'bg-npu-code/20 border-npu-code text-npu-code'
                        : 'bg-npu-border border-npu-border text-npu-text hover:bg-npu-muted'
                    }`}
                  >
                    裤装
                  </button>
                  <button
                    onClick={() =>
                      setSelectedEquipmentSlot(EquipmentSlot.Boots)
                    }
                    className={`px-2 py-1 rounded text-xs border transition-colors ${
                      selectedEquipmentSlot === EquipmentSlot.Boots
                        ? 'bg-npu-code/20 border-npu-code text-npu-code'
                        : 'bg-npu-border border-npu-border text-npu-text hover:bg-npu-muted'
                    }`}
                  >
                    鞋履
                  </button>
                  <button
                    onClick={() =>
                      setSelectedEquipmentSlot(EquipmentSlot.Ring1)
                    }
                    className={`px-2 py-1 rounded text-xs border transition-colors ${
                      selectedEquipmentSlot === EquipmentSlot.Ring1 ||
                      selectedEquipmentSlot === EquipmentSlot.Ring2 ||
                      selectedEquipmentSlot === EquipmentSlot.Ring3 ||
                      selectedEquipmentSlot === EquipmentSlot.Ring4
                        ? 'bg-npu-code/20 border-npu-code text-npu-code'
                        : 'bg-npu-border border-npu-border text-npu-text hover:bg-npu-muted'
                    }`}
                  >
                    手环
                  </button>
                  <button
                    onClick={() =>
                      setSelectedEquipmentSlot(EquipmentSlot.Accessory1)
                    }
                    className={`px-2 py-1 rounded text-xs border transition-colors ${
                      selectedEquipmentSlot === EquipmentSlot.Accessory1 ||
                      selectedEquipmentSlot === EquipmentSlot.Accessory2
                        ? 'bg-npu-code/20 border-npu-code text-npu-code'
                        : 'bg-npu-border border-npu-border text-npu-text hover:bg-npu-muted'
                    }`}
                  >
                    挂件
                  </button>
                  <button
                    onClick={() =>
                      setSelectedEquipmentSlot(EquipmentSlot.Artifact1)
                    }
                    className={`px-2 py-1 rounded text-xs border transition-colors ${
                      selectedEquipmentSlot === EquipmentSlot.Artifact1 ||
                      selectedEquipmentSlot === EquipmentSlot.Artifact2
                        ? 'bg-npu-code/20 border-npu-code text-npu-code'
                        : 'bg-npu-border border-npu-border text-npu-text hover:bg-npu-muted'
                    }`}
                  >
                    外设
                  </button>
                </div>
              )}
              {/* 排序按钮 */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setSortByRarity(!sortByRarity)}
                  className={`px-3 py-1.5 rounded text-sm border transition-colors flex items-center gap-1.5 ${
                    sortByRarity
                      ? 'bg-npu-code/20 border-npu-code text-npu-code'
                      : 'bg-npu-border border-npu-border text-npu-text hover:bg-npu-muted'
                  }`}
                >
                  <ArrowUpDown size={14} />
                  {sortByRarity ? '按品级排序' : '原始顺序'}
                </button>
                <span className="text-xs text-npu-muted">
                  {filteredAndSortedInventory.length} 件物品
                </span>
              </div>
            </div>

            {/* 物品网格 */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 flex-1">
              {filteredAndSortedInventory.length === 0 ? (
                <div className="col-span-full text-center text-npu-muted py-10 font-mono">
                  {selectedCategory === 'all'
                    ? '背包空空如也，快去刷一波副本吧！'
                    : `当前分类暂无物品`}
                </div>
              ) : (
                filteredAndSortedInventory.map((item, idx) => {
                  const isEquipped = isItemEquipped(item);
                  const stats = getItemStats(item);
                  const rarity = item.rarity || '普通';
                  const level = item.level || 0;

                  return (
                    <div
                      key={`${item.id}-${idx}`}
                      className={`p-3 rounded border flex flex-col justify-between relative transition-colors ${isEquipped ? 'bg-npu-panel border-npu-code shadow-md' : `bg-npu-panel hover:bg-npu-border ${getRarityBorder(item.rarity)}`}`}
                      onMouseEnter={() => setHoveredItem(item)}
                      onMouseLeave={() => setHoveredItem(null)}
                    >
                      {isEquipped && (
                        <div className="absolute top-2 right-2 text-npu-code bg-npu-code/10 px-2 py-0.5 rounded text-xs border border-npu-code/30 flex items-center gap-1">
                          <ShieldCheck size={12} /> 已装备
                        </div>
                      )}

                      <div>
                        <div className="flex justify-between items-start pr-16 mb-1">
                          <h4 className={getRarityNameClasses(item.rarity)}>
                            {item.name}{' '}
                            {level > 0 && (
                              <span className="text-npu-muted text-xs font-normal ml-1">
                                + {level}
                              </span>
                            )}
                          </h4>
                          <span className="text-xs bg-npu-border text-npu-text px-1.5 py-0.5 rounded shrink-0 h-fit">
                            x{item.quantity}
                          </span>
                        </div>

                        <div className="flex gap-2 mb-2">
                          <span
                            className={`text-[10px] px-1.5 py-0.5 rounded border ${getRarityBadge(item.rarity)}`}
                          >
                            {rarity}
                          </span>
                          <span className="text-xs text-npu-muted py-0.5">
                            {item.type}
                          </span>
                        </div>

                        <p className="text-xs text-npu-muted italic mb-3">
                          {item.description}
                        </p>

                        {item.isNatal && (
                          <div className="text-xs text-npu-code mb-2 flex items-center gap-1">
                            <Sparkles size={12} />
                            <span className="font-bold">
                              主力外设（属性+50%）
                            </span>
                          </div>
                        )}

                        {item.effect && (
                          <div className="text-xs text-npu-dim mb-2 grid grid-cols-2 gap-1">
                            {stats.attack > 0 && (
                              <span>攻 +{stats.attack}</span>
                            )}
                            {stats.defense > 0 && (
                              <span>防 +{stats.defense}</span>
                            )}
                            {stats.hp > 0 && <span>血 +{stats.hp}</span>}
                            {stats.exp > 0 && <span>修 +{stats.exp}</span>}
                            {stats.spirit > 0 && (
                              <span>思维 +{stats.spirit}</span>
                            )}
                            {stats.physique > 0 && (
                              <span>体能 +{stats.physique}</span>
                            )}
                            {stats.speed > 0 && (
                              <span>速度 +{stats.speed}</span>
                            )}
                          </div>
                        )}
                      </div>

                      <div className="mt-2 flex gap-1.5 flex-wrap">
                        {item.isEquippable && item.equipmentSlot ? (
                          <>
                            {isEquipped ? (
                              <button
                                onClick={() =>
                                  onUnequipItem(item.equipmentSlot!)
                                }
                                className="flex-1 bg-npu-border hover:bg-npu-muted text-npu-text text-xs py-2 rounded transition-colors border border-npu-muted"
                              >
                                卸下
                              </button>
                            ) : (
                              <button
                                onClick={() => {
                                  // 对于手环、挂件、外设，自动找到第一个空槽位
                                  let targetSlot = item.equipmentSlot!;
                                  let hasEmptySlot = true;

                                  if (item.type === ItemType.Ring) {
                                    // 查找第一个空的手环槽位
                                    const ringSlots = [
                                      EquipmentSlot.Ring1,
                                      EquipmentSlot.Ring2,
                                      EquipmentSlot.Ring3,
                                      EquipmentSlot.Ring4,
                                    ];
                                    const emptyRingSlot = ringSlots.find(
                                      (slot) => !equippedItems[slot]
                                    );
                                    if (emptyRingSlot) {
                                      targetSlot = emptyRingSlot;
                                    } else {
                                      hasEmptySlot = false;
                                    }
                                  } else if (item.type === ItemType.Accessory) {
                                    // 查找第一个空的挂件槽位
                                    const accessorySlots = [
                                      EquipmentSlot.Accessory1,
                                      EquipmentSlot.Accessory2,
                                    ];
                                    const emptyAccessorySlot =
                                      accessorySlots.find(
                                        (slot) => !equippedItems[slot]
                                      );
                                    if (emptyAccessorySlot) {
                                      targetSlot = emptyAccessorySlot;
                                    } else {
                                      hasEmptySlot = false;
                                    }
                                  } else if (item.type === ItemType.Artifact) {
                                    // 查找第一个空的外设槽位
                                    const artifactSlots = [
                                      EquipmentSlot.Artifact1,
                                      EquipmentSlot.Artifact2,
                                    ];
                                    const emptyArtifactSlot =
                                      artifactSlots.find(
                                        (slot) => !equippedItems[slot]
                                      );
                                    if (emptyArtifactSlot) {
                                      targetSlot = emptyArtifactSlot;
                                    } else {
                                      hasEmptySlot = false;
                                    }
                                  }

                                  if (hasEmptySlot) {
                                    onEquipItem(item, targetSlot);
                                  } else {
                                    // 如果没有空槽位，仍然尝试装备（会替换已装备的物品）
                                    onEquipItem(item, targetSlot);
                                  }
                                }}
                                className="flex-1 bg-npu-code/20 hover:bg-npu-code/30 text-npu-code text-xs py-2 rounded transition-colors border border-npu-code/50"
                              >
                                装备
                              </button>
                            )}
                            {/* 主力外设升级按钮（仅对外设显示） */}
                            {item.type === ItemType.Artifact &&
                              onRefineNatalArtifact && (
                                <button
                                  onClick={() => {
                                    if (
                                      item.isNatal &&
                                      onUnrefineNatalArtifact
                                    ) {
                                      onUnrefineNatalArtifact();
                                    } else if (!item.isNatal) {
                                      onRefineNatalArtifact(item);
                                    }
                                  }}
                                  className={`px-3 text-xs py-2 rounded transition-colors border ${
                                    item.isNatal
                                      ? 'bg-npu-code/20 hover:bg-npu-code/30 text-npu-code border-npu-code/50'
                                      : 'bg-npu-network/10 hover:bg-npu-network/15 text-purple-300 border-purple-700/50'
                                  }`}
                                  title={
                                    item.isNatal
                                      ? '解除本命升级'
                                      : '升级为主力外设'
                                  }
                                >
                                  <Sparkles size={14} />
                                </button>
                              )}
                            <button
                              onClick={() => onUpgradeItem(item)}
                              className="px-3 bg-npu-border hover:bg-npu-muted text-npu-text text-xs py-2 rounded transition-colors border border-npu-muted"
                              title="强化"
                            >
                              <Hammer size={14} />
                            </button>
                            <button
                              onClick={() => onDiscardItem(item)}
                              className="px-3 bg-npu-warn/10 hover:bg-npu-warn/20 text-npu-warn text-xs py-2 rounded transition-colors border border-npu-warn"
                              title="丢弃"
                            >
                              <Trash2 size={14} />
                            </button>
                          </>
                        ) : (
                          <>
                            {(item.effect || item.type === ItemType.Recipe) &&
                              item.type !== ItemType.Material && (
                                <>
                                  <button
                                    onClick={() => onUseItem(item)}
                                    className="flex-1 bg-npu-border hover:bg-npu-muted text-npu-text text-xs py-2 rounded transition-colors"
                                  >
                                    {item.type === ItemType.Recipe
                                      ? '研读'
                                      : '使用'}
                                  </button>
                                  {onUseItemBatch &&
                                    !item.isEquippable &&
                                    item.type !== ItemType.Recipe &&
                                    item.quantity > 1 && (
                                      <button
                                        onClick={() =>
                                          onUseItemBatch(
                                            item,
                                            Math.min(5, item.quantity)
                                          )
                                        }
                                        className="px-2 bg-npu-signal/10 hover:bg-npu-signal/20 text-blue-300 text-xs py-2 rounded transition-colors"
                                        title={`批量使用 5 个（共 ${item.quantity}）`}
                                      >
                                        ×5
                                      </button>
                                    )}
                                </>
                              )}
                            <button
                              onClick={() => onDiscardItem(item)}
                              className="px-3 bg-npu-warn/10 hover:bg-npu-warn/20 text-npu-warn text-xs py-2 rounded transition-colors border border-npu-warn"
                              title="丢弃"
                            >
                              <Trash2 size={14} />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Stat Comparison Footer */}
        <div className="p-3 border-t border-npu-border bg-npu-bg  text-sm font-mono min-h-[3rem] flex items-center justify-center">
          {comparison ? (
            <div className="flex items-center gap-4">
              <span className="text-npu-dim">装备预览:</span>
              {comparison.attack !== 0 && (
                <span
                  className={`${comparison.attack > 0 ? 'text-npu-code' : 'text-npu-warn'}`}
                >
                  攻击 {comparison.attack > 0 ? '+' : ''}
                  {comparison.attack}
                </span>
              )}
              {comparison.defense !== 0 && (
                <span
                  className={`${comparison.defense > 0 ? 'text-npu-code' : 'text-npu-warn'}`}
                >
                  防御 {comparison.defense > 0 ? '+' : ''}
                  {comparison.defense}
                </span>
              )}
              {comparison.hp !== 0 && (
                <span
                  className={`${comparison.hp > 0 ? 'text-npu-code' : 'text-npu-warn'}`}
                >
                  精力 {comparison.hp > 0 ? '+' : ''}
                  {comparison.hp}
                </span>
              )}
              {comparison.attack === 0 &&
                comparison.defense === 0 &&
                comparison.hp === 0 && (
                  <span className="text-npu-muted">属性无变化</span>
                )}
            </div>
          ) : (
            <div className="flex items-center gap-4">
              <span className="text-npu-dim">装备预览:</span>
              {calculateTotalEquippedStats.attack > 0 && (
                <span className="text-npu-code">
                  攻击 +{calculateTotalEquippedStats.attack}
                </span>
              )}
              {calculateTotalEquippedStats.defense > 0 && (
                <span className="text-npu-code">
                  防御 +{calculateTotalEquippedStats.defense}
                </span>
              )}
              {calculateTotalEquippedStats.hp > 0 && (
                <span className="text-npu-code">
                  精力 +{calculateTotalEquippedStats.hp}
                </span>
              )}
              {calculateTotalEquippedStats.attack === 0 &&
                calculateTotalEquippedStats.defense === 0 &&
                calculateTotalEquippedStats.hp === 0 && (
                  <span className="text-npu-muted">暂无装备</span>
                )}
            </div>
          )}
        </div>
      </div>

      <BatchDiscardModal
        isOpen={isBatchDiscardOpen}
        onClose={() => setIsBatchDiscardOpen(false)}
        inventory={inventory}
        equippedItems={equippedItems}
        onDiscardItems={handleBatchDiscard}
      />
    </div>
  );
};

export default InventoryModal;
