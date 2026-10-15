import React, { useEffect, useMemo, useRef } from 'react';
import { Shield, Sword, X, SkipForward } from 'lucide-react';
import { BattleReplay } from '../services/battleService';

interface BattleModalProps {
  isOpen: boolean;
  replay: BattleReplay | null;
  revealedRounds: number;
  onSkip: () => void;
  onClose: () => void;
}

const BattleModal: React.FC<BattleModalProps> = ({
  isOpen,
  replay,
  revealedRounds,
  onSkip,
  onClose,
}) => {
  const logRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!logRef.current) return;
    logRef.current.scrollTo({
      top: logRef.current.scrollHeight,
      behavior: 'smooth',
    });
  }, [revealedRounds, replay]);

  const { visibleRounds, isResolved, progressText } = useMemo(() => {
    if (!replay) {
      return {
        visibleRounds: [],
        isResolved: true,
        progressText: '0 / 0',
      };
    }
    const total = replay.rounds.length || 1;
    const progress = Math.min(revealedRounds, total);
    return {
      visibleRounds: replay.rounds.slice(0, progress),
      isResolved: progress >= total,
      progressText: `${progress} / ${total}`,
    };
  }, [replay, revealedRounds]);

  if (!isOpen || !replay) return null;

  const closeDisabled = !isResolved;

  return (
    <div
      className="fixed inset-0 paper-overlay flex items-end md:items-center justify-center z-[80] p-0 md:p-8 font-mono"
      onClick={() => {
        if (!closeDisabled) onClose();
      }}
    >
      <div
        className="bg-npu-panel border border-npu-border w-full md:max-w-3xl max-h-[92vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 md:px-6 py-4 border-b border-npu-border bg-npu-bg">
          <div>
            <div className="text-xs text-npu-muted uppercase tracking-widest">
              {'> ENCOUNTER'}
            </div>
            <div className="flex items-center gap-2 text-lg md:text-xl text-npu-code">
              <Sword size={18} className="text-npu-code" />
              {replay.enemy.title}·{replay.enemy.name}
              <span className="text-[11px] text-npu-dim bg-npu-panel px-2 py-0.5 border border-npu-border">
                {replay.enemy.realm}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={closeDisabled}
            className={`p-2 border ${
              closeDisabled
                ? 'border-npu-border text-npu-muted cursor-not-allowed'
                : 'border-npu-border text-npu-text hover:border-npu-code hover:text-npu-code'
            }`}
            title={closeDisabled ? '还没打完' : '关闭战斗日志'}
          >
            <X size={18} />
          </button>
        </div>

        <div className="px-5 md:px-6 py-4 border-b border-npu-border bg-npu-panel">
          <div className="flex flex-wrap gap-4 text-xs text-npu-dim">
            <span>对方精力：{replay.enemy.maxHp}</span>
            <span>对方攻击：{replay.enemy.attack}</span>
            <span>对方防御：{replay.enemy.defense}</span>
            <span>对方手速：{replay.enemy.speed}</span>
          </div>
          <p
            className={`mt-3 text-sm md:text-base font-semibold ${
              replay.victory ? 'text-npu-code' : 'text-npu-warn'
            }`}
          >
            {replay.summary}
          </p>
        </div>

        <div
          ref={logRef}
          className="flex-1 overflow-y-auto px-5 md:px-6 py-4 space-y-3 bg-npu-bg text-sm"
        >
          {visibleRounds.length === 0 ? (
            <div className="text-center text-npu-muted py-6">
              {'> 战斗记录加载中...'}
            </div>
          ) : (
            visibleRounds.map((round, idx) => (
              <div
                key={round.id}
                className={`p-3 border-l-2 pl-3 text-npu-text ${
                  round.attacker === 'player'
                    ? 'bg-npu-panel border-npu-code'
                    : 'bg-npu-panel border-npu-warn'
                }`}
              >
                <div className="flex justify-between text-[11px] text-npu-muted mb-1">
                  <span>
                    第 {idx + 1} 回合 ·{' '}
                    {round.attacker === 'player' ? '你的出手' : '对方出手'}
                  </span>
                  <span>
                    伤害 {round.damage}
                    {round.crit && (
                      <span className="text-npu-circuit ml-1">· 暴击</span>
                    )}
                  </span>
                </div>
                <p>{round.description}</p>
                <div className="mt-2 flex items-center justify-between text-[11px] text-npu-muted">
                  <span>你的精力：{round.playerHpAfter}</span>
                  <span>对方精力：{round.enemyHpAfter}</span>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="border-t border-npu-border px-5 md:px-6 py-4 bg-npu-panel flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="text-xs text-npu-dim space-y-1">
            <div>战斗进度：{progressText} 回合</div>
            <div>损耗精力：{replay.hpLoss}</div>
            <div className="text-npu-text">
              奖励：
              {replay.expChange >= 0
                ? `+${replay.expChange}`
                : replay.expChange}{' '}
              绩点 ·{' '}
              {replay.spiritChange >= 0
                ? `+${replay.spiritChange}`
                : replay.spiritChange}{' '}
              学分
            </div>
            <div>当前精力：{replay.playerHpAfter}</div>
          </div>
          <div className="flex gap-2">
            {!isResolved && (
              <button
                onClick={onSkip}
                className="flex items-center gap-1 px-3 py-2 border border-npu-circuit text-npu-circuit hover:bg-npu-circuit hover:text-npu-bg text-sm transition-colors"
              >
                <SkipForward size={16} />
                跳过战斗
              </button>
            )}
            <button
              onClick={onClose}
              disabled={closeDisabled}
              className={`flex items-center gap-1 px-3 py-2 border text-sm transition-colors ${
                closeDisabled
                  ? 'border-npu-border text-npu-muted cursor-not-allowed'
                  : 'border-npu-code text-npu-code hover:bg-npu-code hover:text-npu-bg'
              }`}
            >
              <Shield size={16} />
              {closeDisabled ? '战斗进行中' : '结束战斗'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BattleModal;
