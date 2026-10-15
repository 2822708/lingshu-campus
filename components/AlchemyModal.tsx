import React, { useMemo, useState } from 'react';
import { PlayerStats, Recipe } from '../types';
import { PILL_RECIPES, DISCOVERABLE_RECIPES } from '../constants';
import { X, Sparkles, FlaskConical, CircleOff, Layers } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  player: PlayerStats;
  onCraft: (recipe: Recipe, count?: number) => void;
}

const AlchemyModal: React.FC<Props> = ({
  isOpen,
  onClose,
  player,
  onCraft,
}) => {
  const [craftCount, setCraftCount] = useState<Record<string, number>>({});

  // 合并基础配方和已解锁的配方
  // 注意：hooks 必须在 return null 之前调用，否则 isOpen 切换会导致 hooks 数量变化崩溃
  const availableRecipes = useMemo(() => {
    const unlockedRecipes = player.unlockedRecipes || [];
    const unlocked = DISCOVERABLE_RECIPES.filter((recipe) =>
      unlockedRecipes.includes(recipe.name)
    );
    return [...PILL_RECIPES, ...unlocked];
  }, [player.unlockedRecipes]);

  if (!isOpen) return null;

  // 计算某配方最多能做几杯（按材料+学分）
  const maxCraftable = (recipe: Recipe): number => {
    let max = player.spiritStones >= recipe.cost ? Math.floor(player.spiritStones / recipe.cost) : 0;
    for (const req of recipe.ingredients) {
      const item = player.inventory.find((i) => i.name === req.name);
      const owned = item ? item.quantity : 0;
      max = Math.min(max, Math.floor(owned / req.qty));
    }
    return max;
  };

  const countItem = (itemName: string) => {
    const item = player.inventory.find((i) => i.name === itemName);
    return item ? item.quantity : 0;
  };

  return (
    <div
      className="fixed inset-0 paper-overlay flex items-end md:items-center justify-center z-50 p-0 md:p-4 touch-manipulation font-mono"
      onClick={onClose}
    >
      <div
        className="bg-npu-panel w-full h-[80vh] md:h-auto md:max-w-3xl border-0 md:border border-npu-border flex flex-col md:max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-3 md:p-4 border-b border-npu-border flex justify-between items-center bg-npu-bg">
          <h3 className="text-lg md:text-xl text-npu-code flex items-center gap-2">
            <Sparkles size={18} className="md:w-5 md:h-5" /> 冲调台
          </h3>
          <button
            onClick={onClose}
            aria-label="关闭"
            className="text-npu-dim active:text-npu-text min-w-[44px] min-h-[44px] flex items-center justify-center touch-manipulation"
          >
            <X size={24} />
          </button>
        </div>

        <div className="p-3 md:p-4 bg-npu-panel overflow-y-auto flex-1 grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
          <div className="col-span-full mb-2 bg-npu-bg p-3 border border-npu-border text-sm text-npu-dim flex justify-between">
            <span>
              持有学分：
              <span className="text-npu-code font-bold">
                {player.spiritStones}
              </span>
            </span>
            <span>咖啡机不是永动机，冲一杯要食材也要学分。</span>
          </div>

          {availableRecipes.map((recipe, idx) => {
            const canAfford = player.spiritStones >= recipe.cost;
            let hasIngredients = true;
            const maxCount = maxCraftable(recipe);
            const count = craftCount[recipe.name] || 1;

            return (
              <div
                key={idx}
                className="bg-npu-bg border border-npu-border p-4 flex flex-col"
              >
                <div className="flex justify-between items-start mb-2">
                  <h4 className="text-lg font-bold text-npu-text">
                    {recipe.name}
                  </h4>
                  <span className="text-xs bg-npu-code/10 text-npu-code border border-npu-code/30 px-2 py-0.5">
                    饮品
                  </span>
                </div>

                <p className="text-sm text-npu-muted mb-4 h-10 overflow-hidden">
                  {recipe.result.description}
                </p>

                <div className="bg-npu-panel p-2 border border-npu-border mb-4 flex-1">
                  <div className="text-xs text-npu-muted mb-2 font-bold uppercase tracking-wider">
                    {'// 所需食材'}
                  </div>
                  <ul className="space-y-1">
                    {recipe.ingredients.map((ing, i) => {
                      const owned = countItem(ing.name);
                      if (owned < ing.qty) hasIngredients = false;

                      return (
                        <li key={i} className="flex justify-between text-sm">
                          <span className="text-npu-dim">{ing.name}</span>
                          <span
                            className={
                              owned >= ing.qty
                                ? 'text-npu-code'
                                : 'text-npu-warn'
                            }
                          >
                            {owned}/{ing.qty}
                          </span>
                        </li>
                      );
                    })}
                    <li className="flex justify-between text-sm pt-1 border-t border-npu-border mt-1">
                      <span className="text-npu-dim">学分消耗</span>
                      <span
                        className={canAfford ? 'text-npu-code' : 'text-npu-warn'}
                      >
                        {recipe.cost}
                      </span>
                    </li>
                  </ul>
                </div>

                {/* 批量合成数量选择 */}
                {hasIngredients && maxCount > 0 && (
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-npu-muted flex items-center gap-1">
                      <Layers size={12} />
                      批量
                    </span>
                    <div className="flex gap-1">
                      {[1, 5, 10].map((n) => (
                        <button
                          key={n}
                          onClick={() =>
                            setCraftCount((c) => ({ ...c, [recipe.name]: n }))
                          }
                          className={[
                            'px-2 py-1 text-xs border',
                            count === n
                              ? 'bg-npu-code/20 text-npu-code border-npu-code'
                              : 'text-npu-muted border-npu-border hover:border-npu-code',
                          ].join(' ')}
                        >
                          ×{n}
                        </button>
                      ))}
                      <button
                        onClick={() =>
                          setCraftCount((c) => ({
                            ...c,
                            [recipe.name]: maxCount,
                          }))
                        }
                        className={[
                          'px-2 py-1 text-xs border',
                          count === maxCount
                            ? 'bg-npu-code/20 text-npu-code border-npu-code'
                            : 'text-npu-muted border-npu-border hover:border-npu-code',
                        ].join(' ')}
                      >
                        最大({maxCount})
                      </button>
                    </div>
                  </div>
                )}

                <button
                  onClick={() => onCraft(recipe, count)}
                  disabled={!canAfford || !hasIngredients}
                  className={`
                    w-full py-2 font-bold text-sm flex items-center justify-center gap-2 transition-colors
                    ${
                      canAfford && hasIngredients
                        ? 'bg-npu-code/10 text-npu-code hover:bg-npu-code hover:text-npu-bg border border-npu-code'
                        : 'bg-npu-panel text-npu-muted cursor-not-allowed border border-npu-border'
                    }
                  `}
                >
                  {!canAfford || !hasIngredients ? (
                    <CircleOff size={16} />
                  ) : (
                    <FlaskConical size={16} />
                  )}
                  {canAfford && hasIngredients
                    ? `冲调 ×${count}`
                    : '食材不足'}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default AlchemyModal;
