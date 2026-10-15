import React from 'react';
import { X, Trophy, Star } from 'lucide-react';
import { PlayerStats } from '../types';
import { ACHIEVEMENTS } from '../constants';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  player: PlayerStats;
}

const AchievementModal: React.FC<Props> = ({ isOpen, onClose, player }) => {
  if (!isOpen) return null;

  const getRarityColor = (rarity: string) => {
    switch (rarity) {
      case '普通':
        return 'text-npu-dim border-npu-border';
      case '稀有':
        return 'text-npu-signal border-npu-signal';
      case '传说':
        return 'text-npu-network border-npu-network';
      case '绝版':
        return 'text-npu-circuit border-npu-circuit';
      default:
        return 'text-npu-dim border-npu-border';
    }
  };

  const completedAchievements = ACHIEVEMENTS.filter((a) =>
    player.achievements.includes(a.id)
  );
  const incompleteAchievements = ACHIEVEMENTS.filter(
    (a) => !player.achievements.includes(a.id)
  );

  return (
    <div
      className="fixed inset-0 paper-overlay flex items-end md:items-center justify-center z-50 p-0 md:p-4 touch-manipulation font-mono"
      onClick={onClose}
    >
      <div
        className="bg-npu-panel border-0 md:border border-npu-border w-full h-[80vh] md:h-auto md:max-w-3xl md:max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-npu-bg border-b border-npu-border p-3 md:p-4 flex justify-between items-center">
          <h2 className="text-lg md:text-xl text-npu-code flex items-center gap-2">
            <Trophy className="text-npu-circuit w-5 h-5 md:w-6 md:h-6" />
            成就系统
          </h2>
          <button
            onClick={onClose}
            aria-label="关闭"
            className="text-npu-dim active:text-npu-text min-w-[44px] min-h-[44px] flex items-center justify-center touch-manipulation"
          >
            <X size={24} />
          </button>
        </div>

        <div className="p-6">
          <div className="mb-4 text-center">
            <p className="text-npu-dim">
              已完成: {completedAchievements.length} / {ACHIEVEMENTS.length}
            </p>
          </div>

          {/* 已完成的成就 */}
          {completedAchievements.length > 0 && (
            <div className="mb-6">
              <h3 className="text-lg font-bold mb-3 text-npu-code">已达成</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {completedAchievements.map((achievement) => (
                  <div
                    key={achievement.id}
                    className={`bg-npu-bg p-4 border ${getRarityColor(achievement.rarity)}`}
                  >
                    <div className="flex items-start gap-3">
                      <Trophy
                        className="text-npu-circuit flex-shrink-0 mt-1"
                        size={20}
                      />
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-bold text-npu-text">
                            {achievement.name}
                          </span>
                          <span
                            className={`text-xs ${getRarityColor(achievement.rarity).split(' ')[0]}`}
                          >
                            ({achievement.rarity})
                          </span>
                        </div>
                        <p className="text-sm text-npu-dim mb-2">
                          {achievement.description}
                        </p>
                        <div className="text-xs text-npu-code">✓ 已完成</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 未完成的成就 */}
          {incompleteAchievements.length > 0 && (
            <div>
              <h3 className="text-lg font-bold mb-3 text-npu-dim">进行中</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {incompleteAchievements.map((achievement) => (
                  <div
                    key={achievement.id}
                    className="bg-npu-bg p-4 border border-npu-border opacity-60"
                  >
                    <div className="flex items-start gap-3">
                      <Star
                        className="text-npu-muted flex-shrink-0 mt-1"
                        size={20}
                      />
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-bold text-npu-muted">
                            {achievement.name}
                          </span>
                          <span className="text-xs text-npu-muted">
                            ({achievement.rarity})
                          </span>
                        </div>
                        <p className="text-sm text-npu-muted mb-2">
                          {achievement.description}
                        </p>
                        <p className="text-xs text-npu-muted">
                          要求: {achievement.requirement.type} -{' '}
                          {achievement.requirement.value}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AchievementModal;
