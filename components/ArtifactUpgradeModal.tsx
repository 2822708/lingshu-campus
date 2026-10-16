import React, { useState } from 'react';
import { Item, PlayerStats } from '../types';
import { neutralizeCampusText } from '../utils/campusText';
import {
  UPGRADE_MATERIAL_NAME,
  UPGRADE_STONE_NAME,
  BASE_UPGRADE_COST_STONES,
  BASE_UPGRADE_COST_MATS,
  getUpgradeMultiplier,
  RARITY_MULTIPLIERS,
  UPGRADE_STONE_SUCCESS_BONUS,
} from '../constants';
import {
  X,
  Hammer,
  ArrowRight,
  Shield,
  Zap,
  Heart,
  Plus,
  Minus,
  Sparkles,
} from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  item: Item | null;
  player: PlayerStats;
  onConfirm: (
    item: Item,
    costStones: number,
    costMats: number,
    upgradeStones: number
  ) => void;
  onUpgradeAll?: (
    item: Item,
    costStones: number,
    costMats: number
  ) => Promise<number>;
  setItemActionLog?: (log: { text: string; type: string } | null) => void;
}

const ArtifactUpgradeModal: React.FC<Props> = ({
  isOpen,
  onClose,
  item,
  player,
  onConfirm,
  onUpgradeAll,
  setItemActionLog,
}) => {
  const [upgradeStones, setUpgradeStones] = useState(0);
  const [isUpgrading, setIsUpgrading] = useState(false);

  if (!isOpen || !item) return null;

  // 从玩家库存中获取最新的物品信息（确保显示的是最新数据）
  const currentItem = player.inventory.find((i) => i.id === item.id) || item;

  const currentLevel = currentItem.level || 0;
  const rarity = currentItem.rarity || '普通';
  const rarityMult = RARITY_MULTIPLIERS[rarity];

  // Cost Calculation - 每次强化后元件需求增加
  const costStones = Math.floor(
    BASE_UPGRADE_COST_STONES * (currentLevel + 1) * rarityMult
  );
  const costMats = Math.floor(
    BASE_UPGRADE_COST_MATS * (currentLevel + 1) * (1 + currentLevel * 0.2)
  ); // 每次强化后增加20%

  // 计算基础成功率（根据稀有度和等级）
  const baseSuccessRate = Math.max(
    0.1,
    1 - currentLevel * 0.1 - (rarityMult - 1) * 0.15
  );
  const successRate = Math.min(
    1,
    baseSuccessRate + upgradeStones * UPGRADE_STONE_SUCCESS_BONUS
  );

  // Stat Calculation
  const growthRate = getUpgradeMultiplier(rarity);
  const getNextStat = (val: number) => Math.floor(val * (1 + growthRate));

  // Current Stats (with Rarity applied already in display logic usually, but here we work on base effect for persistent updates or raw numbers)
  // Note: Inventory stores RAW base effects. InventoryModal applies rarity visual multiplier.
  // HOWEVER, the `handleUpgrade` logic updates the raw effect in inventory.
  // So `item.effect` is the source of truth.

  const currentEffect = currentItem.effect || {};
  const nextEffect = {
    attack: currentEffect.attack ? getNextStat(currentEffect.attack) : 0,
    defense: currentEffect.defense ? getNextStat(currentEffect.defense) : 0,
    hp: currentEffect.hp ? getNextStat(currentEffect.hp) : 0,
  };

  // Check Resources
  const playerStones = player.spiritStones;
  const playerMats =
    player.inventory.find((i) => i.name === UPGRADE_MATERIAL_NAME)?.quantity ||
    0;
  const playerUpgradeStones =
    player.inventory.find((i) => i.name === UPGRADE_STONE_NAME)?.quantity || 0;
  const canAfford = playerStones >= costStones && playerMats >= costMats;

  return (
    <div
      className="fixed inset-0 font-mono text-npu-text paper-overlay flex items-end md:items-center justify-center z-[60] p-0 md:p-4 touch-manipulation"
      onClick={isUpgrading ? undefined : onClose}
    >
      <div
        className="bg-npu-panel w-full h-[80vh] md:h-auto md:max-w-md md: md: border-0 md:border border-npu-border shadow-2xl flex flex-col relative overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 强化动画覆盖层 */}
        {isUpgrading && (
          <div className="absolute inset-0 paper-overlay z-50 flex items-center justify-center">
            <div className="text-center">
              <div className="relative w-32 h-32 mx-auto mb-4">
                {/* 旋转的圆圈动画 */}
                <div className="absolute inset-0 border-4 border-npu-code border-t-transparent rounded-full animate-spin"></div>
                {/* 中心闪烁效果 */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <Sparkles className="text-npu-code animate-pulse" size={48} />
                </div>
              </div>
              <div className="text-npu-code text-xl font-mono font-bold animate-pulse">
                正在升级中...
              </div>
              <div className="text-npu-dim text-sm mt-2">
                系统处理中，请稍候
              </div>
            </div>
          </div>
        )}
        <div className="p-4 border-b border-npu-border flex justify-between items-center bg-npu-panel ">
          <h3 className="text-xl font-mono text-npu-code flex items-center gap-2">
            <Hammer size={20} /> 外设升级
          </h3>
          <button
            onClick={onClose}
            aria-label="关闭"
            className="text-npu-dim hover:text-npu-text"
          >
            <X size={24} />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Header Item Info */}
          <div className="text-center">
            <h4 className="text-2xl font-bold font-mono text-npu-text">
                        {neutralizeCampusText(currentItem.name)}
            </h4>
            <div className="text-npu-dim text-sm mt-1">
              {currentItem.rarity} · +{currentLevel}
            </div>
          </div>

          {/* Stats Comparison */}
          <div className="bg-npu-bg p-4 rounded border border-npu-border grid grid-cols-3 gap-4 items-center">
            {/* Current */}
            <div className="space-y-2 text-right">
              {currentEffect.attack !== undefined && (
                <div className="text-npu-dim flex items-center justify-end gap-1">
                  {currentEffect.attack} <Zap size={14} />
                </div>
              )}
              {currentEffect.defense !== undefined && (
                <div className="text-npu-dim flex items-center justify-end gap-1">
                  {currentEffect.defense} <Shield size={14} />
                </div>
              )}
              {currentEffect.hp !== undefined && (
                <div className="text-npu-dim flex items-center justify-end gap-1">
                  {currentEffect.hp} <Heart size={14} />
                </div>
              )}
            </div>

            {/* Arrow */}
            <div className="flex justify-center text-npu-muted">
              <ArrowRight size={24} />
            </div>

            {/* Next */}
            <div className="space-y-2 text-left font-bold">
              {currentEffect.attack !== undefined && (
                <div className="text-npu-code flex items-center gap-1">
                  <Zap size={14} /> {nextEffect.attack}
                </div>
              )}
              {currentEffect.defense !== undefined && (
                <div className="text-npu-code flex items-center gap-1">
                  <Shield size={14} /> {nextEffect.defense}
                </div>
              )}
              {currentEffect.hp !== undefined && (
                <div className="text-npu-code flex items-center gap-1">
                  <Heart size={14} /> {nextEffect.hp}
                </div>
              )}
            </div>
          </div>

          {/* Success Rate */}
          <div className="bg-npu-bg p-4 rounded border border-npu-border">
            <div className="flex justify-between items-center mb-2">
              <span className="text-npu-dim text-sm">成功率</span>
              <span
                className={`text-lg font-bold ${successRate >= 0.7 ? 'text-green-400' : successRate >= 0.5 ? 'text-yellow-400' : 'text-npu-warn'}`}
              >
                {Math.floor(successRate * 100)}%
              </span>
            </div>
            <div className="w-full bg-npu-panel rounded-full h-2">
              <div
                className={`h-2 rounded-full transition-all ${
                  successRate >= 0.7
                    ? 'bg-green-500'
                    : successRate >= 0.5
                      ? 'bg-yellow-500'
                      : 'bg-red-500'
                }`}
                style={{ width: `${Math.min(100, successRate * 100)}%` }}
              />
            </div>
          </div>

          {/* Cost */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-npu-dim">学分消耗</span>
              <span
                className={
                  playerStones >= costStones ? 'text-npu-code' : 'text-npu-warn'
                }
              >
                {playerStones} / {costStones}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-npu-dim">{UPGRADE_MATERIAL_NAME}</span>
              <span
                className={
                  playerMats >= costMats ? 'text-npu-text' : 'text-npu-warn'
                }
              >
                {playerMats} / {costMats}
              </span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-npu-dim">
                {UPGRADE_STONE_NAME} (每颗+10%成功率)
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() =>
                    setUpgradeStones(Math.max(0, upgradeStones - 1))
                  }
                  disabled={upgradeStones === 0}
                  className="p-1 rounded border border-npu-border hover:bg-npu-border disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Minus size={14} />
                </button>
                <span
                  className={
                    upgradeStones > playerUpgradeStones
                      ? 'text-npu-warn'
                      : 'text-npu-text'
                  }
                >
                  {upgradeStones} / {playerUpgradeStones}
                </span>
                <button
                  onClick={() =>
                    setUpgradeStones(
                      Math.min(playerUpgradeStones, upgradeStones + 1)
                    )
                  }
                  disabled={upgradeStones >= playerUpgradeStones}
                  className="p-1 rounded border border-npu-border hover:bg-npu-border disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Plus size={14} />
                </button>
              </div>
            </div>
          </div>

          {/* 一键强化（连续强化直到材料不足） */}
          {onUpgradeAll && canAfford && !isUpgrading && (
            <button
              onClick={async () => {
                setIsUpgrading(true);
                try {
                  const times = await onUpgradeAll(
                    currentItem,
                    costStones,
                    costMats
                  );
                  if (setItemActionLog) {
                    setItemActionLog({
                      text: `⚡ 一键强化完成！${currentItem.name} 成功 ${times} 次`,
                      type: 'special',
                    });
                    setTimeout(
                      () => setItemActionLog && setItemActionLog(null),
                      3000
                    );
                  }
                } finally {
                  setIsUpgrading(false);
                }
              }}
              className="w-full py-2 mb-2 rounded font-mono font-bold text-sm border transition-all bg-npu-network/10 text-purple-300 border-purple-500/40 hover:bg-npu-network/15"
            >
              ⚡ 一键强化（直到材料不足）
            </button>
          )}

          <button
            onClick={async () => {
              if (!canAfford || isUpgrading) return;

              setIsUpgrading(true);

              // 延迟1.5秒模拟强化动画
              await new Promise((resolve) => setTimeout(resolve, 1500));

              try {
                const result = await onConfirm(
                  currentItem,
                  costStones,
                  costMats,
                  upgradeStones
                );

                if (result === 'success') {
                  if (setItemActionLog) {
                    setItemActionLog({
                      text: `✨ 升级成功！${currentItem.name} 品质提升了！`,
                      type: 'special',
                    });
                    setTimeout(
                      () => setItemActionLog && setItemActionLog(null),
                      3000
                    );
                  }
                  setUpgradeStones(0);
                  // 延迟一下再关闭，让用户看到结果
                  setTimeout(() => {
                    setIsUpgrading(false);
                    onClose();
                  }, 500);
                } else if (result === 'failure') {
                  if (setItemActionLog) {
                    setItemActionLog({
                      text: `❌ 升级失败！${currentItem.name} 未能提升品质，元件已消耗。`,
                      type: 'danger',
                    });
                    setTimeout(
                      () => setItemActionLog && setItemActionLog(null),
                      3000
                    );
                  }
                  setIsUpgrading(false);
                  setUpgradeStones(0);
                } else {
                  // error - 元件不足等情况
                  setIsUpgrading(false);
                }
              } catch (error) {
                setIsUpgrading(false);
                console.error('Upgrade error:', error);
              }
            }}
            disabled={!canAfford || isUpgrading}
            className={`
              w-full py-3 rounded font-mono font-bold text-lg transition-all relative overflow-hidden
              ${
                canAfford && !isUpgrading
                  ? 'bg-npu-code/20 text-npu-code hover:bg-npu-code/30 border border-npu-code'
                  : 'bg-npu-panel text-npu-muted cursor-not-allowed border border-npu-border'
              }
            `}
          >
            {isUpgrading ? (
              <div className="flex items-center justify-center gap-2">
                <Sparkles className="animate-spin" size={20} />
                <span>升级中...</span>
              </div>
            ) : canAfford ? (
              '开始升级'
            ) : (
              '元件不足'
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ArtifactUpgradeModal;
