import React, { useState } from 'react';
import { X, Gift, Sparkles } from 'lucide-react';
import { PlayerStats, LotteryPrize } from '../types';
import { LOTTERY_PRIZES } from '../constants';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  player: PlayerStats;
  onDraw: (count: 1 | 10) => void;
}

const LotteryModal: React.FC<Props> = ({ isOpen, onClose, player, onDraw }) => {
  const [isDrawing, setIsDrawing] = useState(false);
  const [, setLastResult] = useState<LotteryPrize[] | null>(null);

  if (!isOpen || !player) return null;

  const handleDraw = async (count: 1 | 10) => {
    if (player.lotteryTickets < count) {
      alert(
        `抽奖券不足！需要 ${count} 张，当前拥有 ${player.lotteryTickets} 张`
      );
      return;
    }

    setIsDrawing(true);
    setLastResult(null);

    // 模拟抽奖动画
    setTimeout(() => {
      setIsDrawing(false);
      onDraw(count);
      // 这里应该从实际抽奖结果中获取，暂时用空数组
      setLastResult([]);
    }, 1500);
  };

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
          <h2 className="text-lg md:text-xl text-npu-code flex items-center gap-2">
            <Gift className="text-npu-circuit w-5 h-5 md:w-6 md:h-6" />
            抽奖系统
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
          {/* 抽奖券信息 */}
          <div className="bg-npu-bg p-4 border border-npu-border text-center">
            <div className="text-2xl font-bold text-npu-circuit mb-2">
              {player.lotteryTickets} 张
            </div>
            <div className="text-npu-dim">抽奖券</div>
            <div className="text-xs text-npu-muted mt-2">
              累计抽奖: {player.lotteryCount} 次
              {player.lotteryCount >= 10 && player.lotteryCount % 10 !== 0 && (
                <span className="text-npu-circuit ml-2">
                  (再抽 {10 - (player.lotteryCount % 10)} 次必出稀有以上)
                </span>
              )}
            </div>
          </div>

          {/* 抽奖按钮 */}
          <div className="grid grid-cols-2 gap-4">
            <button
              onClick={() => handleDraw(1)}
              disabled={isDrawing || player.lotteryTickets < 1}
              className="relative px-6 py-8 bg-npu-bg hover:border-npu-code text-npu-text border border-npu-border disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isDrawing ? (
                <div className="flex flex-col items-center gap-2">
                  <Sparkles className="animate-spin text-npu-code" size={32} />
                  <span>抽奖中...</span>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <Gift size={32} className="text-npu-circuit" />
                  <span className="font-bold">单抽</span>
                  <span className="text-xs text-npu-dim">消耗 1 张</span>
                </div>
              )}
            </button>

            <button
              onClick={() => handleDraw(10)}
              disabled={isDrawing || player.lotteryTickets < 10}
              className="relative px-6 py-8 bg-npu-bg hover:border-npu-code text-npu-text border border-npu-circuit disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isDrawing ? (
                <div className="flex flex-col items-center gap-2">
                  <Sparkles className="animate-spin text-npu-code" size={32} />
                  <span>抽奖中...</span>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <Gift size={32} className="text-npu-circuit" />
                  <span className="font-bold">十连抽</span>
                  <span className="text-xs text-npu-dim">
                    消耗 10 张 (必出稀有以上)
                  </span>
                </div>
              )}
            </button>
          </div>

          {/* 奖品池预览 */}
          <div>
            <h3 className="text-lg font-bold mb-3 text-npu-text">奖品池</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 max-h-60 overflow-y-auto">
              {LOTTERY_PRIZES.map((prize) => (
                <div
                  key={prize.id}
                  className={`bg-npu-bg p-3 border ${getRarityColor(prize.rarity).split(' ')[1]}`}
                >
                  <div
                    className={`text-sm font-bold ${getRarityColor(prize.rarity).split(' ')[0]} mb-1`}
                  >
                    {prize.name}
                  </div>
                  <div className="text-xs text-npu-muted">{prize.rarity}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LotteryModal;
