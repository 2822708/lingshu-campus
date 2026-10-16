import { neutralizeCampusText } from '../utils/campusText';
import React from 'react';
import { EquipmentSlot, Item, PlayerStats } from '../types';
import { ShieldCheck, X } from 'lucide-react';
import { getItemStats } from '../utils/itemUtils';

interface Props {
  equippedItems: Partial<Record<EquipmentSlot, string>>;
  inventory: Item[];
  player: PlayerStats;
  onUnequip: (slot: EquipmentSlot) => void;
}

const EquipmentPanel: React.FC<Props> = ({
  equippedItems,
  inventory,
  player,
  onUnequip,
}) => {
  const getItemById = (id: string | undefined): Item | null => {
    if (!id) return null;
    return inventory.find((item) => item.id === id) || null;
  };

  const getRarityColor = (rarity: string) => {
    switch (rarity) {
      case '稀有':
        return 'border-blue-600 bg-npu-signal/10';
      case '传说':
        return 'border-purple-600 bg-npu-network/10';
      case '绝版':
        return 'border-yellow-600 bg-npu-circuit/10';
      default:
        return 'border-npu-border bg-npu-panel';
    }
  };

  const slotConfig: { slot: EquipmentSlot; label: string; icon?: string }[] = [
    { slot: EquipmentSlot.Head, label: '头戴' },
    { slot: EquipmentSlot.Shoulder, label: '肩背' },
    { slot: EquipmentSlot.Chest, label: '上衣' },
    { slot: EquipmentSlot.Gloves, label: '手部' },
    { slot: EquipmentSlot.Legs, label: '裤装' },
    { slot: EquipmentSlot.Boots, label: '鞋履' },
    { slot: EquipmentSlot.Ring1, label: '手环1' },
    { slot: EquipmentSlot.Ring2, label: '手环2' },
    { slot: EquipmentSlot.Ring3, label: '手环3' },
    { slot: EquipmentSlot.Ring4, label: '手环4' },
    { slot: EquipmentSlot.Accessory1, label: '挂件1' },
    { slot: EquipmentSlot.Accessory2, label: '挂件2' },
    { slot: EquipmentSlot.Artifact1, label: '外设1' },
    { slot: EquipmentSlot.Artifact2, label: '外设2' },
    { slot: EquipmentSlot.Weapon, label: '键鼠' },
  ];

  return (
    <div className="bg-npu-bg  border border-npu-border p-4">
      <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
        <ShieldCheck size={20} className="text-npu-code" />
        装备栏位
      </h3>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {slotConfig.map(({ slot, label }) => {
          const itemId = equippedItems[slot];
          const item = getItemById(itemId);
          const isNatal = item ? item.id === player.natalArtifactId : false;
          const stats = item ? getItemStats(item, isNatal) : null;
          const rarity = item?.rarity || '普通';

          return (
            <div
              key={slot}
              className={`relative border-2  p-3 min-h-[100px] flex flex-col ${
                item
                  ? getRarityColor(rarity)
                  : 'border-npu-border bg-npu-panel/50'
              }`}
            >
              <div className="text-xs text-npu-dim mb-2">{label}</div>

              {item ? (
                <>
                  <div className="flex-1">
                    <div className="font-bold text-sm mb-1 text-npu-text">
                      {neutralizeCampusText(item.name)}
                      {item.level && item.level > 0 && (
                        <span className="text-xs text-npu-muted ml-1">
                          +{item.level}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-npu-dim mb-2">{rarity}</div>
                    {stats && (
                      <div className="text-xs space-y-0.5">
                        {stats.attack > 0 && (
                          <div className="text-npu-warn">
                            攻 +{stats.attack}
                          </div>
                        )}
                        {stats.defense > 0 && (
                          <div className="text-blue-400">
                            防 +{stats.defense}
                          </div>
                        )}
                        {stats.hp > 0 && (
                          <div className="text-green-400">血 +{stats.hp}</div>
                        )}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => onUnequip(slot)}
                    className="mt-2 w-full px-2 py-1 bg-npu-border hover:bg-npu-muted text-npu-text text-xs rounded transition-colors flex items-center justify-center gap-1"
                  >
                    <X size={12} />
                    卸下
                  </button>
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center text-npu-muted text-xs">
                  空
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default EquipmentPanel;
