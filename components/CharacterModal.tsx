import React from 'react';
import { X, Star, Award } from 'lucide-react';
import { PlayerStats } from '../types';
import { TALENTS, TITLES, ACHIEVEMENTS } from '../constants';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  player: PlayerStats;
  onSelectTalent: (talentId: string) => void;
  onSelectTitle: (titleId: string) => void;
  onAllocateAttribute: (type: 'attack' | 'defense' | 'hp') => void;
  onAllocateAll?: () => void;
  onUseInheritance?: () => void;
}

const CharacterModal: React.FC<Props> = ({
  isOpen,
  onClose,
  player,
  onSelectTitle,
  onAllocateAttribute,
  onAllocateAll,
  onUseInheritance,
}) => {
  if (!isOpen) return null;

  const currentTalent = TALENTS.find((t) => t.id === player.talentId);
  const currentTitle = TITLES.find((t) => t.id === player.titleId);

  const getRarityColor = (rarity: string) => {
    switch (rarity) {
      case '普通':
        return 'text-npu-dim';
      case '稀有':
        return 'text-npu-signal';
      case '传说':
        return 'text-npu-network';
      case '绝版':
        return 'text-npu-circuit';
      default:
        return 'text-npu-dim';
    }
  };

  return (
    <div
      className="fixed inset-0 paper-overlay flex items-end md:items-center justify-center z-50 p-0 md:p-4 touch-manipulation font-mono"
      onClick={onClose}
    >
      <div
        className="bg-npu-panel border-0 md:border border-npu-border w-full h-[80vh] md:h-auto md:max-w-2xl md:max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-npu-bg border-b border-npu-border p-3 md:p-4 flex justify-between items-center">
          <h2 className="text-lg md:text-xl text-npu-code">个人档案</h2>
          <button
            onClick={onClose}
            aria-label="关闭"
            className="text-npu-dim active:text-npu-text min-w-[44px] min-h-[44px] flex items-center justify-center touch-manipulation"
          >
            <X size={24} />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* 保研加分系统 */}
          {player.inheritanceLevel > 0 && onUseInheritance && (
            <div className="bg-npu-bg p-4 border border-npu-network">
              <h3 className="text-lg font-bold mb-3 flex items-center gap-2 text-npu-text">
                <Star className="text-npu-network" size={20} />
                保研加分: {player.inheritanceLevel} 级
              </h3>
              <p className="text-sm text-npu-dim mb-3">
                使用加分可直接跳过升学考核，每次最多跳升 4 个学阶。
              </p>
              <button
                onClick={onUseInheritance}
                className="w-full px-4 py-3 bg-npu-network/10 hover:bg-npu-network hover:text-npu-bg border border-npu-network font-bold text-npu-network transition-colors"
              >
                使用加分直接升学
              </button>
            </div>
          )}

          {/* 属性点分配 */}
          {player.attributePoints > 0 && (
            <div className="bg-npu-bg p-4 border border-npu-border">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-bold flex items-center gap-2 text-npu-text">
                  <Star className="text-npu-circuit" size={20} />
                  可分配属性点: {player.attributePoints}
                </h3>
                {onAllocateAll && (
                  <button
                    onClick={onAllocateAll}
                    className="px-3 py-1 rounded text-xs border bg-npu-network/10 border-purple-500 text-purple-300 hover:bg-npu-network/15"
                  >
                    ⚡ 一键分配
                  </button>
                )}
              </div>
              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={() => onAllocateAttribute('attack')}
                  className="px-4 py-2 bg-npu-panel hover:border-npu-warn hover:text-npu-warn text-npu-text border border-npu-border transition-colors"
                >
                  攻击 +5
                </button>
                <button
                  onClick={() => onAllocateAttribute('defense')}
                  className="px-4 py-2 bg-npu-panel hover:border-npu-signal hover:text-npu-signal text-npu-text border border-npu-border transition-colors"
                >
                  防御 +3
                </button>
                <button
                  onClick={() => onAllocateAttribute('hp')}
                  className="px-4 py-2 bg-npu-panel hover:border-npu-code hover:text-npu-code text-npu-text border border-npu-border transition-colors"
                >
                  精力 +20
                </button>
              </div>
            </div>
          )}

          {/* 天赋显示（不可修改） */}
          <div>
            <h3 className="text-lg font-bold mb-3 flex items-center gap-2 text-npu-text">
              <Star className="text-npu-network" size={20} />
              天赋
            </h3>
            {currentTalent ? (
              <div className="bg-npu-bg p-4 border border-npu-border">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span
                        className={`font-bold ${getRarityColor(currentTalent.rarity)}`}
                      >
                        {currentTalent.name}
                      </span>
                      <span className="text-xs text-npu-muted">
                        ({currentTalent.rarity})
                      </span>
                    </div>
                    <p className="text-sm text-npu-dim mb-2">
                      {currentTalent.description}
                    </p>
                    <div className="text-xs text-npu-muted">
                      {'// 天赋在入学时随机生成，之后不可修改'}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-npu-bg p-4 border border-npu-border">
                <p className="text-npu-muted">未选择天赋</p>
              </div>
            )}
          </div>

          {/* 称号系统 */}
          <div>
            <h3 className="text-lg font-bold mb-3 flex items-center gap-2 text-npu-text">
              <Award className="text-npu-circuit" size={20} />
              称号
            </h3>
            {currentTitle ? (
              <div className="bg-npu-bg p-4 border border-npu-border mb-3">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="font-bold text-npu-circuit">
                        {currentTitle.name}
                      </span>
                    </div>
                    <p className="text-sm text-npu-dim mb-1">
                      {currentTitle.description}
                    </p>
                    <p className="text-xs text-npu-muted">
                      获得条件: {currentTitle.requirement}
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-npu-bg p-4 border border-npu-border mb-3">
                <p className="text-npu-muted">未获得称号</p>
              </div>
            )}
            <div className="grid grid-cols-1 gap-2 max-h-60 overflow-y-auto">
              {TITLES.filter(
                (t) =>
                  t.id !== player.titleId &&
                  player.achievements.some((a) => {
                    const achievement = ACHIEVEMENTS.find(
                      (ach) => ach.id === a
                    );
                    return achievement?.reward?.titleId === t.id;
                  })
              ).map((title) => (
                <button
                  key={title.id}
                  onClick={() => onSelectTitle(title.id)}
                  className="text-left bg-npu-bg hover:border-npu-code p-3 border border-npu-border transition-colors"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="font-bold text-npu-circuit">
                        {title.name}
                      </span>
                      <p className="text-sm text-npu-dim mt-1">
                        {title.description}
                      </p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CharacterModal;
