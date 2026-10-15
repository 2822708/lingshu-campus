import React, { useState } from 'react';
import {
  X,
  Heart,
  Zap,
  Shield,
  Swords,
  Droplet,
  Package,
  Sparkles,
} from 'lucide-react';
import { PlayerStats } from '../types';
import { PET_TEMPLATES, RARITY_MULTIPLIERS, REALM_ORDER } from '../constants';
import { calcDevourGain } from '../views/pet/usePetHandlers';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  player: PlayerStats;
  onActivatePet: (petId: string) => void;
  onFeedPet: (
    petId: string,
    feedType: 'hp' | 'item' | 'exp',
    itemId?: string
  ) => void;
  onEvolvePet: (petId: string) => void;
  onAutoFeed?: (petId: string) => void;
  onDevourPet?: (petId: string, sacrificedId: string) => void;
}

const PetModal: React.FC<Props> = ({
  isOpen,
  onClose,
  player,
  onActivatePet,
  onFeedPet,
  onEvolvePet,
  onAutoFeed,
  onDevourPet,
}) => {
  const [selectedPetId, setSelectedPetId] = useState<string | null>(null);
  const [feedType, setFeedType] = useState<'hp' | 'item' | 'exp' | null>(null);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [devourOpen, setDevourOpen] = useState(false);
  const [devourFlash, setDevourFlash] = useState<string | null>(null); // 吞噬动画提示
  const [feedCount, setFeedCount] = useState(1); // 血量/绩点喂养次数

  if (!isOpen) return null;

  const getRarityColor = (rarity: string) => {
    switch (rarity) {
      case '普通':
        return 'text-gray-400';
      case '稀有':
        return 'text-blue-400';
      case '传说':
        return 'text-purple-400';
      case '绝版':
        return 'text-yellow-400';
      default:
        return 'text-gray-400';
    }
  };

  const activePet = player.pets.find((p) => p.id === player.activePetId);

  // 可喂养的物品（所有未装备的物品）
  const equippedItemIds = new Set(
    Object.values(player.equippedItems).filter(Boolean)
  );
  const feedableItems = player.inventory.filter(
    (item) => !equippedItemIds.has(item.id) && item.quantity > 0
  );

  const handleFeedClick = (petId: string) => {
    setSelectedPetId(petId);
    setFeedType(null);
    setSelectedItemId(null);
  };

  const handleFeedConfirm = () => {
    if (!selectedPetId || !feedType) return;
    if (feedType === 'item' && !selectedItemId) return;

    // 血量/绩点喂养支持批量（循环调 handler，React 函数式更新会排队依次应用）
    const count = feedType === 'item' ? 1 : Math.max(1, feedCount);
    for (let i = 0; i < count; i++) {
      onFeedPet(selectedPetId, feedType, selectedItemId || undefined);
    }
    setSelectedPetId(null);
    setFeedType(null);
    setSelectedItemId(null);
    setFeedCount(1);
  };

  const handleFeedCancel = () => {
    setSelectedPetId(null);
    setFeedType(null);
    setSelectedItemId(null);
    setFeedCount(1);
  };

  return (
    <div
      className="fixed inset-0 font-mono text-npu-text paper-overlay flex items-end md:items-center justify-center z-50 p-0 md:p-4 touch-manipulation"
      onClick={onClose}
    >
      <div
        className="bg-npu-panel md: md: border-0 md:border border-npu-border w-full h-[80vh] md:h-auto md:max-w-3xl md:max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-npu-panel border-b border-npu-border p-3 md:p-4 flex justify-between items-center">
          <h2 className="text-lg md:text-xl font-mono text-npu-code">
            室友系统
          </h2>
          <button
            onClick={onClose}
            aria-label="关闭"
            className="text-npu-dim active:text-npu-text min-w-[44px] min-h-[44px] flex items-center justify-center touch-manipulation"
          >
            <X size={24} />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* 当前激活的室友 */}
          {activePet && (
            <div className="bg-npu-bg rounded p-4 border-2 border-yellow-600">
              <div className="flex items-center gap-2 mb-3">
                <span className="font-bold text-yellow-400">
                  {activePet.name}
                </span>
                <span className="text-xs text-npu-muted">
                  ({activePet.species})
                </span>
                <span className="ml-auto text-xs bg-yellow-600 text-black px-2 py-1 rounded">
                  已激活
                </span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-3">
                <div className="flex items-center gap-2">
                  <Swords className="text-npu-warn" size={16} />
                  <span className="text-sm">
                    攻击: {activePet.stats.attack}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Shield className="text-blue-400" size={16} />
                  <span className="text-sm">
                    防御: {activePet.stats.defense}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Heart className="text-green-400" size={16} />
                  <span className="text-sm">精力: {activePet.stats.hp}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Zap className="text-yellow-400" size={16} />
                  <span className="text-sm">速度: {activePet.stats.speed}</span>
                </div>
              </div>
              <div className="mb-3">
                <div className="flex justify-between text-sm mb-1">
                  <span>等级: {activePet.level}</span>
                  <span>
                    经验: {activePet.exp} / {activePet.maxExp}
                  </span>
                </div>
                <div className="w-full bg-npu-border rounded-full h-2">
                  <div
                    className="bg-blue-500 h-2 rounded-full"
                    style={{
                      width: `${(activePet.exp / activePet.maxExp) * 100}%`,
                    }}
                  />
                </div>
              </div>
              <div className="mb-3">
                <div className="flex justify-between text-sm mb-1">
                  <span>默契度</span>
                  <span>{activePet.affection} / 100</span>
                </div>
                <div className="w-full bg-npu-border rounded-full h-2">
                  <div
                    className="bg-pink-500 h-2 rounded-full"
                    style={{ width: `${activePet.affection}%` }}
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => handleFeedClick(activePet.id)}
                  className="flex-1 px-4 py-2 bg-npu-code/10 hover:bg-npu-code/20 rounded border border-green-700 text-sm"
                >
                  喂养
                </button>
                {onDevourPet && player.pets.length > 1 && (
                  <button
                    onClick={() => setDevourOpen(true)}
                    className="flex-1 px-4 py-2 bg-npu-network/10 hover:bg-npu-network/20 rounded border border-purple-700 text-sm"
                    title="吞噬其他室友，提升基础属性"
                  >
                    吞噬
                  </button>
                )}
                {(() => {
                  // 进化状态计算（含等级检查 + 材料检查 + 顶级判断）
                  if (activePet.evolutionStage >= 2) return null;
                  const tpl = PET_TEMPLATES.find(
                    (t) => t.species === activePet.species
                  );
                  if (!tpl?.evolutionRequirements) {
                    // 没设进化条件 = 已是顶级（卷王室友）
                    return (
                      <button
                        disabled
                        title="此室友已是顶级，无法再进化"
                        className="flex-1 px-4 py-2 bg-npu-border text-npu-muted border border-npu-border text-sm cursor-not-allowed"
                      >
                        进化（已顶级）
                      </button>
                    );
                  }
                  const reqLevel = tpl.evolutionRequirements.level;
                  const reqItems = tpl.evolutionRequirements.items || [];
                  let reason = `可进化至阶段 ${activePet.evolutionStage + 1}`;
                  if (activePet.level < reqLevel) {
                    reason = `需 Lv.${reqLevel}（当前 Lv.${activePet.level}）`;
                  } else {
                    for (const need of reqItems) {
                      const has = player.inventory
                        .filter((i) => i.name === need.name)
                        .reduce((s, i) => s + (i.quantity || 0), 0);
                      if (has < need.quantity) {
                        reason = `缺【${need.name}】×${need.quantity - has}`;
                        break;
                      }
                    }
                  }
                  const canEvolve =
                    activePet.level >= reqLevel &&
                    reqItems.every((need) => {
                      const has = player.inventory
                        .filter((i) => i.name === need.name)
                        .reduce((s, i) => s + (i.quantity || 0), 0);
                      return has >= need.quantity;
                    });
                  return (
                    <button
                      onClick={() => onEvolvePet(activePet.id)}
                      disabled={!canEvolve}
                      title={reason}
                      className={[
                        'flex-1 px-4 py-2 border text-sm transition-colors',
                        canEvolve
                          ? 'bg-npu-network/10 hover:bg-npu-network/20 border-npu-network/50 text-npu-text'
                          : 'bg-npu-border text-npu-muted border-npu-border cursor-not-allowed',
                      ].join(' ')}
                    >
                      进化
                    </button>
                  );
                })()}
              </div>

              {/* 吞噬记录 */}
              {activePet.devouredNames &&
                activePet.devouredNames.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-npu-border">
                    <div className="text-xs text-npu-muted mb-1 font-bold uppercase tracking-wider">
                      {'// 吞噬记录'}
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {activePet.devouredNames.map((n, i) => (
                        <span
                          key={i}
                          className="text-[10px] px-1.5 py-0.5 bg-npu-network/10 border border-purple-700/30 text-purple-300 rounded"
                        >
                          {n}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
            </div>
          )}

          {/* 所有室友列表 */}
          <div>
            <h3 className="text-lg font-bold mb-3">
              我的室友 ({player.pets.length})
            </h3>
            {player.pets.length === 0 ? (
              <div className="bg-npu-bg rounded p-4 border border-npu-border text-center text-npu-muted">
                还没有室友，快去抽奖或探索获得吧！
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {player.pets.map((pet) => (
                  <div
                    key={pet.id}
                    className={`bg-npu-bg rounded p-4 border ${
                      pet.id === player.activePetId
                        ? 'border-yellow-600'
                        : 'border-npu-border'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <span
                          className={`font-bold ${getRarityColor(pet.rarity)}`}
                        >
                          {pet.name}
                        </span>
                        <span className="text-xs text-npu-muted ml-2">
                          Lv.{pet.level}
                        </span>
                      </div>
                      {pet.id === player.activePetId ? (
                        <span className="text-xs bg-yellow-600 text-black px-2 py-1 rounded">
                          激活中
                        </span>
                      ) : (
                        <button
                          onClick={() => onActivatePet(pet.id)}
                          className="text-xs px-2 py-1 bg-npu-border hover:bg-npu-muted rounded"
                        >
                          激活
                        </button>
                      )}
                    </div>
                    <div className="text-sm text-npu-dim mb-2">
                      {pet.species}
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs mb-2">
                      <div>攻击: {pet.stats.attack}</div>
                      <div>防御: {pet.stats.defense}</div>
                      <div>精力: {pet.stats.hp}</div>
                      <div>速度: {pet.stats.speed}</div>
                    </div>
                    <div className="text-xs text-npu-muted mb-2">
                      经验: {pet.exp} / {pet.maxExp}
                    </div>
                    <div className="w-full bg-npu-border rounded-full h-1.5 mb-2">
                      <div
                        className="bg-blue-500 h-1.5 rounded-full"
                        style={{ width: `${(pet.exp / pet.maxExp) * 100}%` }}
                      />
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleFeedClick(pet.id)}
                        className="flex-1 px-3 py-1.5 bg-npu-code/10 hover:bg-npu-code/20 rounded border border-green-700 text-xs"
                      >
                        喂养
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 喂养方式选择弹窗 */}
        {selectedPetId && (
          <div className="fixed inset-0 paper-overlay flex items-center justify-center z-[60] p-4">
            <div className="bg-npu-panel  border border-npu-border w-full max-w-md p-6">
              <h3 className="text-lg font-bold mb-4 text-npu-code">
                选择喂养方式
              </h3>

              {!feedType ? (
                <div className="space-y-3">
                  <button
                    onClick={() => setFeedType('hp')}
                    className="w-full px-4 py-3 bg-npu-warn/10 hover:bg-npu-warn/20 rounded border border-npu-warn flex items-center gap-3"
                  >
                    <Droplet className="text-npu-warn" size={20} />
                    <div className="flex-1 text-left">
                      <div className="font-bold">血量喂养</div>
                      <div className="text-xs text-npu-dim">
                        消耗 200 点精力 (经验根据学阶计算，+2~5默契度)
                      </div>
                    </div>
                  </button>

                  <button
                    onClick={() => setFeedType('item')}
                    className="w-full px-4 py-3 bg-npu-signal/10 hover:bg-npu-signal/20 rounded border border-blue-700 flex items-center gap-3"
                    disabled={feedableItems.length === 0}
                  >
                    <Package className="text-blue-400" size={20} />
                    <div className="flex-1 text-left">
                      <div className="font-bold">物品喂养</div>
                      <div className="text-xs text-npu-dim">
                        {feedableItems.length === 0
                          ? '背包中没有可喂养物品'
                          : `消耗物品 (经验根据学阶和物品品质计算，+2~5默契度)`}
                      </div>
                    </div>
                  </button>

                  <button
                    onClick={() => setFeedType('exp')}
                    className="w-full px-4 py-3 bg-npu-network/10 hover:bg-npu-network/20 rounded border border-purple-700 flex items-center gap-3"
                  >
                    <Sparkles className="text-purple-400" size={20} />
                    <div className="flex-1 text-left">
                      <div className="font-bold">绩点喂养</div>
                      <div className="text-xs text-npu-dim">
                        消耗 5% 当前绩点 (经验根据学阶计算，+2~5默契度)
                      </div>
                    </div>
                  </button>
                </div>
              ) : feedType === 'hp' || feedType === 'exp' ? (
                <div className="space-y-3">
                  <div className="text-sm text-npu-dim">
                    {feedType === 'hp'
                      ? `每次消耗 200 点精力，当前精力 ${player.hp}`
                      : `每次消耗 5% 当前绩点，当前绩点 ${player.exp}`}
                  </div>
                  {/* 数量选择 */}
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-npu-muted flex items-center gap-1">
                      <Zap size={12} />
                      喂养次数
                    </span>
                    <div className="flex gap-1">
                      {[1, 5, 10].map((n) => (
                        <button
                          key={n}
                          onClick={() => setFeedCount(n)}
                          className={[
                            'px-2 py-1 text-xs border rounded',
                            feedCount === n
                              ? 'bg-npu-code/20 text-npu-code border-npu-code'
                              : 'text-npu-muted border-npu-border hover:border-npu-code',
                          ].join(' ')}
                        >
                          ×{n}
                        </button>
                      ))}
                      <button
                        onClick={() => setFeedCount(20)}
                        className={[
                          'px-2 py-1 text-xs border rounded',
                          feedCount === 20
                            ? 'bg-npu-code/20 text-npu-code border-npu-code'
                            : 'text-npu-muted border-npu-border hover:border-npu-code',
                        ].join(' ')}
                      >
                        ×20
                      </button>
                    </div>
                  </div>
                  <p className="text-[10px] text-npu-muted">
                    共消耗{' '}
                    {feedType === 'hp'
                      ? 200 * feedCount
                      : `${Math.round(player.exp * 0.05 * feedCount)} 绩点`}
                    {feedType === 'hp' && player.hp < 200 * feedCount
                      ? ' ⚠ 精力不足！'
                      : ''}
                  </p>
                </div>
              ) : feedType === 'item' ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between mb-3">
                    <div className="text-sm text-npu-dim">
                      选择要喂养的物品：
                    </div>
                    {onAutoFeed && (
                      <button
                        onClick={() => {
                          if (selectedPetId) {
                            onAutoFeed(selectedPetId);
                            setSelectedPetId(null);
                            setFeedType(null);
                            setSelectedItemId(null);
                          }
                        }}
                        className="px-3 py-1 bg-npu-signal/10 hover:bg-npu-signal/20 rounded border border-blue-700 text-xs"
                        title="自动用背包里最好的食物喂到满级/材料用完"
                      >
                        ⚡ 一键喂食
                      </button>
                    )}
                  </div>
                  <div className="max-h-60 overflow-y-auto space-y-2">
                    {feedableItems.length === 0 ? (
                      <div className="text-center text-npu-muted py-4">
                        背包中没有可喂养物品
                      </div>
                    ) : (
                      feedableItems.map((item) => {
                        // 计算预估经验值
                        const rarity = item.rarity || '普通';
                        const rarityMultiplier =
                          RARITY_MULTIPLIERS[rarity] || 1;
                        const realmIndex = REALM_ORDER.indexOf(player.realm);
                        const realmMultiplier = 1 + realmIndex * 0.5;
                        const levelMultiplier = 1 + player.realmLevel * 0.1;
                        const baseExp = Math.floor(
                          10 * realmMultiplier * levelMultiplier
                        );
                        const estimatedExp = Math.floor(
                          baseExp * rarityMultiplier
                        );

                        return (
                          <button
                            key={item.id}
                            onClick={() => setSelectedItemId(item.id)}
                            className={`w-full px-3 py-2 rounded border text-left ${
                              selectedItemId === item.id
                                ? 'bg-npu-signal/10 border-blue-600'
                                : 'bg-npu-border border-npu-border hover:bg-npu-muted'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <div className="font-bold text-sm">
                                {item.name}
                              </div>
                              <div
                                className={`text-xs px-1.5 py-0.5 rounded ${getRarityColor(rarity)}`}
                              >
                                {rarity}
                              </div>
                            </div>
                            <div className="text-xs text-npu-dim mt-1">
                              数量: {item.quantity} · 预估经验: {estimatedExp}~
                              {Math.floor(estimatedExp * 1.2)}
                            </div>
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              ) : null}

              <div className="flex gap-2 mt-6">
                <button
                  onClick={handleFeedCancel}
                  className="flex-1 px-4 py-2 bg-npu-border hover:bg-npu-muted rounded border border-npu-border"
                >
                  取消
                </button>
                {feedType && (feedType !== 'item' || selectedItemId) && (
                  <button
                    onClick={handleFeedConfirm}
                    className="flex-1 px-4 py-2 bg-npu-code/10 hover:bg-npu-code/20 rounded border border-green-700"
                  >
                    {feedType === 'item'
                      ? '确认喂养'
                      : `确认喂养 ×${feedCount}`}
                  </button>
                )}
                {feedType && feedType !== 'item' && (
                  <button
                    onClick={() => setFeedType(null)}
                    className="px-4 py-2 bg-npu-border hover:bg-npu-muted rounded border border-npu-border"
                  >
                    返回
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* 吞噬选择弹窗 */}
        {devourOpen && activePet && onDevourPet && (
          <div className="fixed inset-0 paper-overlay flex items-center justify-center z-[60] p-4">
            <div className="bg-npu-panel border border-npu-border w-full max-w-md p-6">
              <h3 className="text-lg font-bold mb-1 text-npu-code">吞噬室友</h3>
              <p className="text-sm text-npu-muted mb-4">
                【{activePet.name}
                】将吞噬以下室友，按稀有度+等级加权提升基础属性（被吞噬的室友会消失）。
              </p>
              {player.pets.filter(
                (p) => p.id !== activePet.id && p.id !== player.activePetId
              ).length === 0 ? (
                <div className="text-center text-npu-muted py-4">
                  没有其他可吞噬的室友
                </div>
              ) : (
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {player.pets
                    .filter(
                      (p) =>
                        p.id !== activePet.id && p.id !== player.activePetId
                    )
                    .map((sacrificed) => {
                      const gain = calcDevourGain(sacrificed);
                      return (
                        <button
                          key={sacrificed.id}
                          onClick={() => {
                            onDevourPet(activePet.id, sacrificed.id);
                            setDevourOpen(false);
                            // 吞噬动画：短暂提示增益
                            setDevourFlash(
                              `攻+${gain.attack} 防+${gain.defense} 精+${gain.hp} 速+${gain.speed}`
                            );
                            setTimeout(() => setDevourFlash(null), 2500);
                          }}
                          className="w-full flex items-center justify-between px-3 py-2 bg-npu-bg border border-npu-border hover:border-purple-500 hover:bg-npu-network/10 rounded transition-colors"
                        >
                          <div>
                            <span
                              className={`font-bold ${getRarityColor(sacrificed.rarity)}`}
                            >
                              {sacrificed.name}
                            </span>
                            <span className="text-xs text-npu-muted ml-2">
                              Lv.{sacrificed.level}
                            </span>
                          </div>
                          <div className="text-right">
                            <div className="text-[10px] text-purple-300">
                              预计攻+{gain.attack} 防+{gain.defense} 精+
                              {gain.hp} 速+{gain.speed}
                            </div>
                            <div className="text-xs text-npu-muted">
                              {sacrificed.species}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                </div>
              )}
              <button
                onClick={() => setDevourOpen(false)}
                className="w-full mt-4 px-3 py-2 border border-npu-border text-npu-muted hover:text-npu-text rounded text-sm"
              >
                取消
              </button>
            </div>
          </div>
        )}

        {/* 吞噬成功动画 */}
        {devourFlash && (
          <div className="fixed inset-0 flex items-center justify-center z-[70] pointer-events-none">
            <div className="animate-pulse bg-npu-network/15 border-2 border-purple-400 text-npu-network px-6 py-4 rounded-lg text-center">
              <div className="text-2xl mb-1">🫀</div>
              <div className="font-bold text-lg">吞噬成功！</div>
              <div className="text-sm text-purple-300 mt-1">{devourFlash}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PetModal;
