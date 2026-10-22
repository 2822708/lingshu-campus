import React from 'react';
import {
  BATTLE_ACTION_LABELS,
  ENEMY_INTENT_LABELS,
} from '../features/interactive/battle';
import type {
  InteractiveBattleRound,
  InteractiveBattleState,
} from '../features/interactive/battle';

interface BattleRoundFeedbackProps {
  round: InteractiveBattleRound;
  compact?: boolean;
  terminal?: boolean;
}

/** 只汇总已保存的出手记录，不预测伤害，也不再次执行战斗。 */
export function BattleRoundFeedback({
  round,
  compact = false,
  terminal = false,
}: BattleRoundFeedbackProps) {
  const playerEntries = round.entries.filter(
    (entry) => entry.attacker === 'player'
  );
  const enemyEntries = round.entries.filter(
    (entry) => entry.attacker === 'enemy'
  );
  const dealt = playerEntries.reduce((sum, entry) => sum + entry.damage, 0);
  const received = enemyEntries.reduce((sum, entry) => sum + entry.damage, 0);
  const defensePrevented = enemyEntries.reduce(
    (sum, entry) => sum + entry.preventedDamage,
    0
  );
  const guardPrevented = playerEntries.reduce(
    (sum, entry) => sum + entry.preventedDamage,
    0
  );
  const playerCrits = playerEntries.filter((entry) => entry.crit).length;
  const enemyCrits = enemyEntries.filter((entry) => entry.crit).length;
  const effects = [
    round.action === 'defend' && enemyEntries.length
      ? `防守减免 ${defensePrevented}`
      : '',
    guardPrevented > 0 ? `对方固守减免 ${guardPrevented}` : '',
    playerCrits ? `你暴击 ${playerCrits} 次` : '',
    enemyCrits ? `对手暴击 ${enemyCrits} 次` : '',
    // 破势成功与空放的区别由该轮原有反馈提供，避免展示层重算固守规则。
    compact && round.action === 'break'
      ? round.message.split(/[；。]/, 1)[0]
      : '',
  ].filter(Boolean);

  return (
    <section
      aria-label={`第${round.round}轮反馈`}
      className={
        compact
          ? 'border-l-2 border-npu-code bg-npu-bg px-3 py-2'
          : 'border-l-2 border-npu-code bg-npu-bg px-4 py-3'
      }
    >
      <p className="text-xs text-npu-dim">
        第 {round.round} 轮 · {BATTLE_ACTION_LABELS[round.action]} · 对手
        {ENEMY_INTENT_LABELS[round.intent]}
      </p>
      <p className="mt-1 text-sm font-semibold tabular-nums">
        {playerEntries.length ? `造成 ${dealt} 点损耗` : '你未出手'}
        {' · '}
        {enemyEntries.length ? `承受 ${received} 点损耗` : '对手未出手'}
      </p>
      {effects.length > 0 && (
        <p className="mt-1 text-xs leading-5 text-npu-code">
          {effects.join(' · ')}
        </p>
      )}
      {!compact && (
        <>
          <p className="mt-2 text-sm leading-6">
            {terminal && round.action === 'break'
              ? `${round.message.split('；', 1)[0].replace(/。$/, '')}。`
              : round.message}
          </p>
          {round.entries.length > 0 && (
            <ol className="mt-2 list-inside list-decimal space-y-1 text-sm leading-6">
              {round.entries.map((entry) => (
                <li key={entry.id}>
                  {entry.description}
                  {entry.crit && (
                    <span className="ml-2 border border-npu-border px-1 text-xs font-semibold text-npu-warn">
                      暴击
                    </span>
                  )}
                </li>
              ))}
            </ol>
          )}
        </>
      )}
    </section>
  );
}

/** 使用原生折叠区域，终局后仍可查阅包括最后一次指令在内的真实记录。 */
export function BattleRecord({ battle }: { battle: InteractiveBattleState }) {
  return (
    <details className="mt-4 border-t border-npu-border pt-3">
      <summary className="cursor-pointer text-sm text-npu-code">
        回合记录 · 已记录 {battle.rounds.length} 次行动
      </summary>
      <div className="mt-3 space-y-3">
        {battle.rounds.length > 0 ? (
          battle.rounds.map((round) => (
            <div key={`${round.commandSeq}-${round.round}`}>
              <BattleRoundFeedback round={round} />
            </div>
          ))
        ) : (
          <p className="text-sm text-npu-dim">尚未出手，暂无回合记录。</p>
        )}
      </div>
    </details>
  );
}
