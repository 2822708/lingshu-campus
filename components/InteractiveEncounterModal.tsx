import React, { useEffect, useId, useRef } from 'react';
import type { PlayerStats } from '../types';
import type { PendingInteractiveAction } from '../features/interactive/state';
import {
  BATTLE_ACTION_LABELS,
  ENEMY_INTENT_DESCRIPTIONS,
  ENEMY_INTENT_LABELS,
  INTERACTIVE_BATTLE_MAX_ROUNDS,
  chooseAutoBattleAction,
} from '../features/interactive/battle';
import type { BattleAction } from '../features/interactive/battle';
import { getEncounterChoiceAvailability } from '../features/interactive/encounters';

interface InteractiveEncounterModalProps {
  pending: PendingInteractiveAction | null;
  player: PlayerStats;
  error?: string;
  onChoose: (actionId: string, choiceId: string) => void;
  onCommand: (actionId: string, seq: number, action: BattleAction) => void;
  onAcknowledge: (actionId: string) => void;
}

const actionDescriptions: Record<Exclude<BattleAction, 'retreat'>, string> = {
  attack: '正常出手，稳定造成伤害。',
  defend: '本轮不攻击，实际来袭减半。',
  break: '清除固守；对方未固守时仅造成七成半伤害。',
};

function EnergyLine({
  name,
  hp,
  maxHp,
  opponent = false,
}: {
  name: string;
  hp: number;
  maxHp: number;
  opponent?: boolean;
}) {
  return (
    <div className="min-w-0">
      <div className="mb-2 flex items-baseline justify-between gap-3 text-sm">
        <span className="truncate font-semibold">{name}</span>
        <span className="shrink-0 text-npu-dim">
          {hp} / {maxHp}
        </span>
      </div>
      <div
        role="progressbar"
        aria-label={`${name}的精力`}
        aria-valuenow={Math.max(0, Math.min(maxHp, hp))}
        aria-valuemin={0}
        aria-valuemax={maxHp}
        className="h-2 overflow-hidden bg-npu-bg border border-npu-border"
      >
        <div
          className={`h-full ${opponent ? 'bg-npu-warn' : 'bg-npu-code'}`}
          style={{
            width: `${Math.max(0, Math.min(100, (hp / Math.max(1, maxHp)) * 100))}%`,
          }}
        />
      </div>
    </div>
  );
}

/** 当前行动完成前保持一个入口，避免关闭弹层后继续其他成长操作。 */
const InteractiveEncounterModal: React.FC<InteractiveEncounterModalProps> = ({
  pending,
  player,
  error,
  onChoose,
  onCommand,
  onAcknowledge,
}) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const pendingId = pending?.id;
  const phase = pending?.phase;

  useEffect(() => {
    if (!pendingId) return;
    const previousFocus = document.activeElement;
    const focusDialog = () => dialogRef.current?.focus();
    focusDialog();

    const containFocus = (event: FocusEvent) => {
      if (
        event.target instanceof Node &&
        !dialogRef.current?.contains(event.target)
      ) {
        focusDialog();
      }
    };
    const containKeyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (event.key !== 'Tab') return;
      const buttons = dialogRef.current?.querySelectorAll<HTMLButtonElement>(
        'button:not([disabled])'
      );
      if (!buttons?.length) {
        event.preventDefault();
        focusDialog();
        return;
      }
      const first = buttons[0];
      const last = buttons[buttons.length - 1];
      const active = document.activeElement;
      if (
        event.shiftKey &&
        (active === first || active === dialogRef.current)
      ) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        (active === last || !dialogRef.current?.contains(active))
      ) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('focusin', containFocus);
    document.addEventListener('keydown', containKeyboard, true);
    return () => {
      document.removeEventListener('focusin', containFocus);
      document.removeEventListener('keydown', containKeyboard, true);
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) {
        previousFocus.focus();
      }
    };
  }, [pendingId]);

  useEffect(() => {
    if (pendingId) dialogRef.current?.focus();
  }, [pendingId, phase]);

  if (!pending) return null;
  const battle = pending.battle;
  const result = pending.result;

  return (
    <div
      className="fixed inset-0 z-[90] paper-overlay flex items-end justify-center p-0 md:items-center md:p-6"
      onKeyDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
        className="flex max-h-[96dvh] w-full flex-col overflow-hidden border border-npu-border bg-npu-panel text-npu-text shadow-xl outline-none md:max-h-[90dvh] md:max-w-2xl"
      >
        <header className="shrink-0 border-b border-npu-border px-5 py-4 md:px-7">
          <p className="text-xs tracking-widest text-npu-dim">
            校园成长档案 ·{' '}
            {pending.phase === 'battle'
              ? '挑战记录'
              : pending.phase === 'result'
                ? '本次反馈'
                : '机缘待办'}
          </p>
          <h2 id={titleId} className="mt-1 font-serif text-xl font-semibold">
            {pending.encounter.title}
          </h2>
          <p id={descriptionId} className="mt-2 text-xs text-npu-dim">
            {pending.phase === 'result'
              ? '本次结果已保存，确认后继续校园生活。'
              : '选择与每轮进度会保存，刷新后可继续。其他成长操作暂时暂停。'}
          </p>
        </header>

        {error && (
          <p
            role="alert"
            className="shrink-0 border-b border-npu-border bg-npu-bg px-5 py-3 text-sm text-npu-warn md:px-7"
          >
            {error}
          </p>
        )}

        {pending.phase === 'choice' && (
          <div className="overflow-y-auto overscroll-contain px-5 py-5 md:px-7">
            <p className="whitespace-pre-line text-sm leading-7">
              {pending.encounter.story}
            </p>
            <p className="mt-4 text-xs text-npu-dim">
              当前精力 {player.hp} / {player.maxHp} · 学分 {player.spiritStones}
            </p>
            <div className="mt-5 space-y-3">
              {/* 选项由规则配置提供，费用和可用性随当前角色数据校验。 */}
              {pending.encounter.choices.map((choice) => {
                const availability = getEncounterChoiceAvailability(
                  choice,
                  player
                );
                const costs =
                  [
                    choice.cost.hp ? `精力 −${choice.cost.hp}` : '',
                    choice.cost.spiritStones
                      ? `学分 −${choice.cost.spiritStones}`
                      : '',
                  ]
                    .filter(Boolean)
                    .join(' · ') || '无入场费用';
                const rewards =
                  [
                    choice.reward.exp ? `绩点 +${choice.reward.exp}` : '',
                    choice.reward.spiritStones
                      ? `学分 +${choice.reward.spiritStones}`
                      : '',
                    choice.affectionGain
                      ? `室友默契 +${choice.affectionGain}`
                      : '',
                  ]
                    .filter(Boolean)
                    .join(' · ') || '无资源奖励';
                return (
                  <button
                    key={choice.id}
                    type="button"
                    disabled={!availability.available}
                    onClick={() => onChoose(pending.id, choice.id)}
                    className="block w-full border border-npu-border px-4 py-3 text-left hover:border-npu-code hover:bg-npu-bg disabled:opacity-60 disabled:hover:border-npu-border"
                  >
                    <span className="block font-semibold">{choice.label}</span>
                    <span className="mt-1 block text-sm leading-6 text-npu-dim">
                      {choice.description}
                    </span>
                    <span className="mt-2 block text-xs text-npu-dim">
                      {costs}
                    </span>
                    <span className="mt-1 block text-xs text-npu-code">
                      {choice.battle ? '胜利总奖励：' : '完成可得：'}
                      {rewards}
                    </span>
                    {!availability.available && (
                      <span className="mt-2 block text-xs text-npu-warn">
                        {availability.reason}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {pending.phase === 'battle' && battle && (
          <>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 md:px-7">
              {pending.adventurePlan && (
                <div className="mb-4 border-b border-npu-border pb-3 text-xs leading-6 text-npu-dim">
                  <p className="whitespace-pre-line">
                    {pending.encounter.story}
                  </p>
                  {pending.adventurePlan.request.riskLevel && (
                    <p>本次风险：{pending.adventurePlan.request.riskLevel}。</p>
                  )}
                  {pending.adventurePlan.request.sectTask && (
                    <p>
                      本次已占用一次社团任务次数；撤离或失败也会保留已支付的材料与费用。
                    </p>
                  )}
                  <p>
                    胜利奖励：绩点 +{pending.adventurePlan.reward.exp}、学分 +
                    {pending.adventurePlan.reward.spiritStones}
                    {pending.adventurePlan.reward.contribution
                      ? `、贡献 +${pending.adventurePlan.reward.contribution}`
                      : ''}
                    。
                  </p>
                  {(pending.adventurePlan.failure.exp < 0 ||
                    pending.adventurePlan.failure.spiritStones < 0) && (
                    <p>
                      战败最多损失：绩点{' '}
                      {Math.min(player.exp, -pending.adventurePlan.failure.exp)}
                      、学分{' '}
                      {Math.min(
                        player.spiritStones,
                        -pending.adventurePlan.failure.spiritStones
                      )}
                      ；撤离不追加这项扣分。
                    </p>
                  )}
                  {(pending.adventurePlan.independentReward.exp > 0 ||
                    pending.adventurePlan.independentReward.spiritStones > 0 ||
                    pending.adventurePlan.independentReward.items.length >
                      0) && (
                    <p>本次另有已遇到的非战斗机缘收益，结算时单独列出。</p>
                  )}
                </div>
              )}
              <div className="grid grid-cols-2 gap-5">
                <EnergyLine
                  name="你"
                  hp={battle.player.hp}
                  maxHp={battle.player.maxHp}
                />
                <EnergyLine
                  name={`${battle.enemy.title}${battle.enemy.name}`}
                  hp={battle.enemy.hp}
                  maxHp={battle.enemy.maxHp}
                  opponent
                />
              </div>
              <p className="mt-3 text-xs text-npu-dim">
                手速：你 {battle.player.speed} · 对方 {battle.enemy.speed}
                。手速较高者先出手。
              </p>
              <p className="mt-1 text-xs text-npu-dim">
                对手倾向：
                {
                  {
                    balanced: '攻守均衡',
                    aggressive: '偏好强攻',
                    defensive: '偏好固守',
                  }[battle.enemy.behavior]
                }
              </p>
              <div className="mt-5 border-l-2 border-npu-code bg-npu-bg px-4 py-3">
                <p className="text-sm font-semibold">
                  对手意图：{ENEMY_INTENT_LABELS[battle.intent]}
                </p>
                <p className="mt-1 text-sm text-npu-dim">
                  {ENEMY_INTENT_DESCRIPTIONS[battle.intent]}
                </p>
                {battle.enemyGuardRounds > 0 && (
                  <p className="mt-1 text-xs text-npu-dim">
                    固守剩余 {battle.enemyGuardRounds} 轮。
                  </p>
                )}
              </div>
              <div className="mt-5" aria-live="polite" aria-atomic="true">
                {battle.rounds.length === 0 ? (
                  <p className="text-sm text-npu-dim">
                    先看清对手意图，再选择应对。本轮结果将在出手后产生。
                  </p>
                ) : (
                  <div className="border-t border-npu-border pt-4">
                    <p className="mb-2 text-xs text-npu-dim">
                      上一轮 ·{' '}
                      {BATTLE_ACTION_LABELS[battle.rounds.at(-1)!.action]}
                    </p>
                    <p className="text-sm">{battle.rounds.at(-1)!.message}</p>
                    <ul className="mt-2 space-y-2 text-sm">
                      {battle.rounds.at(-1)!.entries.map((entry) => (
                        <li key={entry.id}>{entry.description}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
              <p className="mt-4 text-xs text-npu-dim">
                已完成 {battle.completedRounds} /{' '}
                {INTERACTIVE_BATTLE_MAX_ROUNDS}{' '}
                轮；到达上限会结束挑战，不按胜利发奖。
              </p>
            </div>
            <footer className="max-h-[45dvh] shrink-0 overflow-y-auto overscroll-contain border-t border-npu-border bg-npu-panel px-5 py-4 md:px-7">
              <div className="grid grid-cols-3 gap-2">
                {(['attack', 'defend', 'break'] as const).map((action) => (
                  <button
                    key={action}
                    type="button"
                    disabled={
                      battle.outcome !== 'ongoing' ||
                      (action === 'break' && battle.breakCooldown > 0)
                    }
                    onClick={() =>
                      onCommand(pending.id, battle.commandSeq + 1, action)
                    }
                    className="min-h-12 border border-npu-code px-2 py-2 text-sm font-semibold text-npu-code hover:bg-npu-bg disabled:border-npu-border disabled:text-npu-muted disabled:opacity-60"
                    title={actionDescriptions[action]}
                  >
                    {BATTLE_ACTION_LABELS[action]}
                    {action === 'break' && battle.breakCooldown > 0 && (
                      <span className="mt-1 block text-xs font-normal">
                        还需 {battle.breakCooldown} 轮
                      </span>
                    )}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-xs leading-5 text-npu-dim">
                稳攻：正常伤害 · 防守：不攻击、来袭减半 ·
                破势：解除固守，未固守时输出较低，用后间隔两轮。
              </p>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm">
                <button
                  type="button"
                  disabled={battle.outcome !== 'ongoing'}
                  onClick={() =>
                    onCommand(
                      pending.id,
                      battle.commandSeq + 1,
                      chooseAutoBattleAction(battle)
                    )
                  }
                  className="border-b border-npu-border py-1 text-npu-code disabled:opacity-60"
                >
                  自动应对一轮
                </button>
                <button
                  type="button"
                  disabled={battle.outcome !== 'ongoing'}
                  onClick={() =>
                    onCommand(pending.id, battle.commandSeq + 1, 'retreat')
                  }
                  className="border-b border-npu-border py-1 text-npu-warn disabled:opacity-60"
                >
                  撤离 · 保留已受损耗
                </button>
              </div>
            </footer>
          </>
        )}

        {pending.phase === 'result' && result && (
          <>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 md:px-7">
              <h3 className="font-serif text-lg font-semibold">
                {result.title}
              </h3>
              <p className="mt-3 whitespace-pre-line text-sm leading-7">
                {result.text}
              </p>
              <ul className="mt-4 space-y-2 border-y border-npu-border py-4 text-sm">
                {result.changes.map((change, index) => (
                  <li key={`${index}-${change}`}>{change}</li>
                ))}
              </ul>
              {result.followUp && (
                <p className="mt-4 text-sm text-npu-code">
                  后续线索：{result.followUp}
                </p>
              )}
            </div>
            <footer className="shrink-0 border-t border-npu-border px-5 py-4 md:px-7">
              <button
                type="button"
                onClick={() => onAcknowledge(pending.id)}
                className="min-h-12 w-full border border-npu-code bg-npu-code px-4 py-3 text-sm font-semibold text-npu-panel hover:opacity-90"
              >
                记入档案，继续
              </button>
            </footer>
          </>
        )}
      </div>
    </div>
  );
};

export default InteractiveEncounterModal;
