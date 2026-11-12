import { useEffect, useId, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type {
  CardBattleAction,
  CardBattleState,
  ResolvedBattleCard,
} from '../types';
import {
  getCardBattleIncomingPreview,
  getCardBattlePlayableReason,
  getCardBattlePreview,
} from '../engine';
import { ENEMY_ARCHETYPES } from '../enemies';
import { BattleActor } from './BattleActor';
import type { BattleActorCue } from './BattleActor';
import { HandLayout } from './HandLayout';
import './card-battle.css';
import './battle-stage.css';
import './rogue-battle-theme.css';

export interface CardBattleViewProps {
  /** Presentation only; the host still owns combat, rewards, and persistence. */
  mode?: 'dungeon' | 'rogue';
  onPause?: () => void;
  routeMap?: ReactNode;
  state: CardBattleState;
  title: string;
  story?: string;
  error?: string;
  onCommand: (action: CardBattleAction) => void;
  result?: { title: string; text: string; changes: string[] };
  onAcknowledge?: () => void;
}

const COMPACT_HAND_QUERY =
  '(max-width: 600px), (max-width: 1000px) and (pointer: coarse) and (hover: none)';
const CARD_KIND_LABELS = { attack: '进攻', defense: '防御', utility: '准备' };

function describeCardPreview(state: CardBattleState, card: ResolvedBattleCard) {
  const preview = getCardBattlePreview(state, card.id);
  return (
    [
      preview.actualDamage > 0 ? `命中 ${preview.actualDamage}` : '',
      preview.block ? `防护 +${preview.block}` : '',
      preview.heal ? `恢复 +${preview.heal}` : '',
      preview.draw ? `抽牌 ${preview.draw}` : '',
      preview.nextAttackBonus ? `蓄势 +${preview.nextAttackBonus}` : '',
      preview.clearsGuard ? '清除固守' : '',
      card.clearEnemyBlock && state.enemy.thorns ? '解除反震' : '',
      card.expose ? '制造破绽' : '',
      preview.counter ? `反击 +${preview.counter}` : '',
      preview.retainBlock ? `留盾上限 ${preview.retainBlock}` : '',
      preview.focusGain ? `专注 +${preview.focusGain}` : '',
      preview.blockConsumed ? `消耗防护 ${preview.blockConsumed}` : '',
      preview.reflectedDamage ? `自身反震损耗 ${preview.reflectedDamage}` : '',
    ]
      .filter(Boolean)
      .join(' · ') || '准备下一步'
  );
}

/** Feedback derives only from committed snapshots; restoring a save never replays it. */
export function getCommittedBattleCue(
  before: CardBattleState,
  after: CardBattleState
): BattleActorCue | null {
  if (before.id !== after.id || after.commandSeq !== before.commandSeq + 1)
    return null;
  const entries = after.log.filter((entry) => entry.seq === after.commandSeq);
  const played = entries.find((entry) => entry.kind === 'card' && entry.cardId);
  const enemy = entries.find((entry) => entry.kind === 'enemy');
  const card = played
    ? before.cards.find((value) => value.id === played.cardId)
    : undefined;
  const playerHealing = entries
    .filter((entry) => entry.kind === 'card')
    .reduce((sum, entry) => sum + (entry.heal ?? 0), 0);
  return {
    key: `${after.id}:${after.commandSeq}`,
    action: enemy
      ? 'enemy-turn'
      : card?.damage || card?.blockToDamage
        ? 'attack'
        : card?.block
          ? 'guard'
          : card?.heal
            ? 'heal'
            : card?.nextAttackBonus
              ? 'charge'
              : 'draw',
    actor: enemy ? 'enemy' : played ? 'player' : 'none',
    playerDamage: Math.max(
      0,
      before.player.hp + playerHealing - after.player.hp
    ),
    enemyDamage: Math.max(
      0,
      before.enemy.hp - after.enemy.hp,
      entries
        .filter((entry) => entry.kind === 'card')
        .reduce((sum, entry) => sum + (entry.damage ?? 0), 0)
    ),
    playerBlock: Math.max(0, after.player.block - before.player.block),
    enemyBlock:
      before.enemy.guardRounds === 0 && after.enemy.guardRounds > 0 ? 1 : 0,
    blocked: entries.reduce(
      (sum, entry) => sum + (entry.preventedDamage ?? 0),
      0
    ),
    healed: playerHealing,
    enemyHealed: entries
      .filter((entry) => entry.kind === 'enemy')
      .reduce((sum, entry) => sum + (entry.heal ?? 0), 0),
    drawn: entries.reduce((sum, entry) => sum + (entry.draw ?? 0), 0),
    brokeBlock: card?.clearEnemyBlock
      ? before.enemy.guardRounds || before.enemy.thorns || 0
      : 0,
    guardLabel: '固守 · 减伤 50%',
    breakLabel: before.enemy.thorns ? '解除固守与反震' : '解除固守',
    statusNote: card?.expose
      ? '发现破绽'
      : card?.counter
        ? '准备反击'
        : card?.retainBlock
          ? '稳住防线'
          : card?.focusGain
            ? '恢复专注'
            : undefined,
    statusTarget: card?.expose ? 'enemy' : 'player',
    outcome:
      after.phase === 'victory'
        ? 'victory'
        : after.phase === 'defeat'
          ? 'defeat'
          : null,
  };
}
function Energy({
  label,
  hp,
  max,
  resource = '精力',
}: {
  label: string;
  hp: number;
  max: number;
  resource?: '精力' | '生命';
}) {
  return (
    <div className="cd-energy">
      <span>
        <span className="cd-energy-name">{label}</span>
        <b>
          {hp} / {max}
        </b>
      </span>
      <meter
        min={0}
        max={Math.max(1, max)}
        value={hp}
        aria-label={label.endsWith(resource) ? label : `${label}${resource}`}
      />
    </div>
  );
}
export function CardBattleView({
  mode = 'dungeon',
  onPause,
  routeMap,
  state,
  title,
  story,
  error,
  onCommand,
  result,
  onAcknowledge,
}: CardBattleViewProps) {
  const rogue = mode === 'rogue';
  const resource = '精力';
  const deckLabel = rogue ? '术式' : '简历';
  const gearLabel = rogue ? '法器' : '装备';
  const viewText = (value: string) =>
    rogue
      ? value
          .replaceAll('生命', '精力')
          .replaceAll('装备', '法器')
          .replaceAll('遗物', '法器')
      : value;
  const sourceText = (value?: string) =>
    rogue
      ? value === '已学课程'
        ? '本局课程术式'
        : value === '当前装备'
          ? '本局实验法器'
          : (value ?? '基础术式')
      : (value ?? '基础牌');
  const headingId = useId();
  const hintId = useId();
  const dialog = useRef<HTMLDivElement>(null);
  const routeButton = useRef<HTMLButtonElement>(null);
  const cardButton = useRef<HTMLButtonElement>(null);
  const notebookClose = useRef<HTMLButtonElement>(null);
  const previous = useRef(state);
  const [cue, setCue] = useState<BattleActorCue | null>(null);
  const [selection, setSelection] = useState<string[]>([]);
  const [retreatConfirmation, setRetreatConfirmation] = useState(false);
  const [previewCardId, setPreviewCardId] = useState<string | null>(null);
  const [compactHand, setCompactHand] = useState(
    () =>
      typeof window !== 'undefined' &&
      Boolean(window.matchMedia?.(COMPACT_HAND_QUERY).matches)
  );
  useEffect(() => {
    const query = window.matchMedia?.(COMPACT_HAND_QUERY);
    if (!query) return;
    const update = () => setCompactHand(query.matches);
    update();
    if (!query.addEventListener) {
      query.addListener(update);
      return () => query.removeListener(update);
    }
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  const [notebook, setNotebook] = useState<
    'rules' | 'log' | 'deck' | 'gear' | 'route' | 'card' | null
  >(null);
  const modalNotebook = notebook === 'route' || notebook === 'card';
  useEffect(() => {
    if (notebook !== 'route' && notebook !== 'card') return;
    const trigger =
      notebook === 'route' ? routeButton.current : cardButton.current;
    const battle = dialog.current;
    notebookClose.current?.focus();
    return () => {
      if (trigger?.isConnected && !trigger.disabled) trigger.focus();
      else if (battle?.isConnected) battle.focus();
    };
  }, [notebook]);
  useEffect(() => {
    const before = previous.current;
    previous.current = state;
    if (before !== state) {
      setCue(getCommittedBattleCue(before, state));
      setSelection([]);
      setRetreatConfirmation(false);
    }
  }, [state]);
  useEffect(() => {
    const element = dialog.current;
    const oldFocus = document.activeElement;
    element?.focus();
    const trap = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setNotebook(null);
        setRetreatConfirmation(false);
        return;
      }
      if (event.key !== 'Tab') return;
      const scope =
        element?.querySelector(
          '.cd-notebook:is([data-kind="route"], [data-kind="card"])'
        ) ?? element;
      const controls = [
        ...(scope?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [tabindex="0"]'
        ) ?? []),
      ];
      if (!controls.length) {
        event.preventDefault();
        element?.focus();
        return;
      }
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (
        event.shiftKey &&
        (document.activeElement === first || document.activeElement === element)
      ) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        (document.activeElement === last ||
          !scope?.contains(document.activeElement))
      ) {
        event.preventDefault();
        first.focus();
      }
    };
    const contain = (event: FocusEvent) => {
      if (event.target instanceof Node && !element?.contains(event.target))
        element?.focus();
    };
    document.addEventListener('keydown', trap, true);
    document.addEventListener('focusin', contain);
    return () => {
      document.removeEventListener('keydown', trap, true);
      document.removeEventListener('focusin', contain);
      if (oldFocus instanceof HTMLElement && oldFocus.isConnected)
        oldFocus.focus();
    };
  }, [state.id]);
  const discarding = state.phase === 'discard';
  const active = state.phase === 'battle' || discarding;
  const discardCount = Math.max(0, state.hand.length - 10);
  const previewCard =
    notebook === 'card' && previewCardId && state.hand.includes(previewCardId)
      ? state.cards.find((card) => card.id === previewCardId)
      : undefined;
  const previewBlocked = previewCard
    ? getCardBattlePlayableReason(state, previewCard.id)
    : undefined;
  const incoming = getCardBattleIncomingPreview(state);
  const prevented = incoming.prevented;
  const expectedLoss = incoming.damage;
  const archetype = state.enemy.archetype
    ? ENEMY_ARCHETYPES[state.enemy.archetype]
    : undefined;
  const archetypeName =
    rogue && state.enemy.archetype
      ? {
          duelist: '蓄力型',
          sentinel: '固守型',
          sprinter: '连击型',
          disruptor: '穿透型',
          regenerator: '修复型',
          counterguard: '反震型',
        }[state.enemy.archetype]
      : archetype?.name;
  const recentText = state.log
    .filter((entry) => entry.seq === state.commandSeq)
    .map((entry) => viewText(entry.text))
    .join(' ');
  function toggleDiscard(id: string) {
    setSelection((old) =>
      old.includes(id)
        ? old.filter((value) => value !== id)
        : old.length < discardCount
          ? [...old, id]
          : old
    );
  }
  return (
    <div className="cd-battle-overlay">
      <div
        className="cd-battle"
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby={modalNotebook ? `${headingId}-${notebook}` : headingId}
        tabIndex={-1}
        data-phase={state.phase}
        data-focus={state.player.energy === 0 ? 'empty' : 'ready'}
        data-shape="portrait-4-3"
        data-mode={mode}
        data-route-open={notebook === 'route' || undefined}
        data-card-open={notebook === 'card' || undefined}
        data-compact-hand={compactHand || undefined}
      >
        <header className="cd-battle-header">
          <div>
            <p>
              {rogue ? '灵枢试炼 · 课程术式与工程法器' : '考研副本 · 现场作答'}
            </p>
            <h2 id={headingId}>{title}</h2>
          </div>
          <div className="cd-round">
            第 {state.turn} / {state.maxTurns} 回合
            <strong>
              {active ? (discarding ? '整理手牌' : '我的回合') : '本场结束'}
            </strong>
          </div>
          <nav aria-label="作战笔记">
            <button onClick={() => setNotebook('rules')}>规则</button>
            <button onClick={() => setNotebook('deck')}>
              {deckLabel} {state.cards.length}
            </button>
            <button onClick={() => setNotebook('log')}>记录</button>
            {Boolean(state.equipment?.length) && (
              <button onClick={() => setNotebook('gear')}>
                {gearLabel} {state.equipment!.length}
              </button>
            )}
            {routeMap && (
              <button ref={routeButton} onClick={() => setNotebook('route')}>
                路线
              </button>
            )}
            {rogue && onPause && <button onClick={onPause}>保存离开</button>}
          </nav>
        </header>
        <section className="cd-arena" aria-label="战斗双方">
          <article className="cd-student">
            <BattleActor
              side="player"
              setting={rogue ? 'trial' : 'campus'}
              cue={cue ? { ...cue, guardLabel: undefined } : null}
            />
            <Energy
              label={`我的${resource}`}
              resource={resource}
              hp={state.player.hp}
              max={state.player.maxHp}
            />
            <p>
              防护 <b>{state.player.block}</b>
              {state.player.nextAttackBonus > 0 && (
                <> · 蓄势 +{state.player.nextAttackBonus}</>
              )}
              {(state.player.counter ?? 0) > 0 && (
                <span title="本轮挡伤且存活后触发一次反击">
                  {' '}
                  · 反击 {state.player.counter}
                </span>
              )}
              {(state.player.retainBlock ?? 0) > 0 && (
                <> · 最多留盾 {state.player.retainBlock}</>
              )}
            </p>
          </article>
          <div className="cd-duel-mark" aria-hidden="true">
            {rogue ? '试阵' : '答辩'}
          </div>
          <article className="cd-enemy">
            <BattleActor
              side="enemy"
              setting={rogue ? 'trial' : 'campus'}
              archetype={state.enemy.archetype}
              variant={
                state.enemy.behavior === 'defensive'
                  ? 1
                  : state.enemy.behavior === 'aggressive'
                    ? 2
                    : 0
              }
              cue={cue}
            />
            <Energy
              label={state.enemy.name}
              resource={resource}
              hp={state.enemy.hp}
              max={state.enemy.maxHp}
            />
            <p>
              {state.enemy.realm ?? state.enemy.title}
              {archetype && (
                <span
                  className="cd-enemy-archetype"
                  title={
                    rogue
                      ? state.enemy.pattern
                          ?.map((move) => move.description)
                          .join(' ')
                      : archetype.description
                  }
                >
                  {' '}
                  · {archetypeName}
                </span>
              )}
              {state.enemy.guardRounds > 0 && (
                <span title={`减伤 50%，剩余 ${state.enemy.guardRounds} 回合`}>
                  {' '}
                  · 固守 50% / {state.enemy.guardRounds} 轮
                </span>
              )}
              {state.enemy.exposed && (
                <b
                  className="cd-status-exposed"
                  title="下次受到主动攻击伤害增加 25%"
                >
                  {' '}
                  · 破绽 +25%
                </b>
              )}
              {(state.enemy.thorns ?? 0) > 0 && (
                <b
                  className="cd-status-thorns"
                  title="反震绕过防护，可用破势解除"
                >
                  {' '}
                  · 反震 {state.enemy.thorns}
                </b>
              )}
            </p>
            <div
              className="cd-enemy-intent"
              data-intent={active ? state.intent.type : state.phase}
              data-exposure={
                active ? (expectedLoss > 0 ? 'damage' : 'blocked') : undefined
              }
              aria-label={active ? '对手下一步' : '本场状态'}
              title={active ? viewText(state.intent.description) : undefined}
            >
              {active ? (
                <>
                  <div className="cd-enemy-plan">
                    <span className="cd-enemy-plan-label">下步</span>
                    <strong>{state.intent.name}</strong>
                    {state.intent.crit && <span>暴击</span>}
                  </div>
                  <div className="cd-enemy-forecast">
                    <span>
                      来袭 <b>{incoming.incoming}</b>
                    </span>
                    <span>
                      防护抵挡 <b>{prevented}</b>
                    </span>
                    <span className="cd-expected-loss">
                      预计损失 <b>{expectedLoss}</b> {resource}
                    </span>
                    {incoming.piercing > 0 && (
                      <span>
                        穿透 <b>{incoming.piercing}</b>
                      </span>
                    )}
                    {incoming.heal > 0 && (
                      <span>
                        对手修复 <b>+{incoming.heal}</b>
                      </span>
                    )}
                    {incoming.counterDamage > 0 && (
                      <span>
                        预计反击 <b>{incoming.counterDamage}</b>
                      </span>
                    )}
                    {incoming.retainedBlock > 0 && (
                      <span>
                        结余留盾 <b>{incoming.retainedBlock}</b>
                      </span>
                    )}
                  </div>
                  <p className="cd-enemy-plan-description">
                    {viewText(state.intent.description)}
                  </p>
                </>
              ) : (
                <>
                  <span>本场状态</span>
                  <strong>
                    {
                      {
                        victory: '胜利 · 本场结束',
                        defeat: '力竭 · 本场结束',
                        retreat: '已撤离 · 本场结束',
                        stalemate: '僵持 · 本场结束',
                      }[state.phase]
                    }
                  </strong>
                  <p>
                    {
                      {
                        victory: '对手已被击破。',
                        defeat: rogue ? '本次试炼已结束。' : '本场作答已结束。',
                        retreat: rogue
                          ? '已撤离本次试炼。'
                          : '已收起简历离场。',
                        stalemate: '已达到本场回合上限。',
                      }[state.phase]
                    }
                  </p>
                </>
              )}
            </div>
          </article>
        </section>
        {error && (
          <div className="cd-save-error" role="alert">
            {error}
          </div>
        )}
        <span
          className="cd-announcement"
          role="status"
          aria-live="polite"
          aria-atomic="true"
          key={cue?.key ?? 'entry'}
        >
          {discarding
            ? `请选择 ${discardCount} 张弃牌（已选 ${selection.length}），保留 10 张后对手才行动。`
            : recentText}
        </span>
        {result ? (
          <section
            className="cd-result-summary"
            aria-label={rogue ? '本局战果' : '副本结算'}
          >
            <div className="cd-result-title">
              <p>{rogue ? '战斗结果已保存' : '本场已结算 · 结果已保存'}</p>
              <h3>{result.title}</h3>
            </div>
            <div className="cd-result-body">
              <p>{viewText(result.text)}</p>
              <ul>
                {result.changes.map((change, index) => (
                  <li key={index}>{viewText(change)}</li>
                ))}
              </ul>
            </div>
          </section>
        ) : (
          <section className="cd-hand-area">
            <div className="cd-hand-heading">
              <div className="cd-hand-title">
                <h3>
                  {discarding ? '整理手牌' : '手牌'}{' '}
                  <small>{state.hand.length} 张</small>
                </h3>
                <div
                  className="cd-focus"
                  aria-label={`剩余专注 ${state.player.energy} / 3`}
                >
                  <strong>{state.player.energy}</strong>
                  <span>专注</span>
                  <div className="cd-focus-pips" aria-hidden="true">
                    {[0, 1, 2].map((index) => (
                      <i
                        key={index}
                        data-filled={index < state.player.energy}
                      />
                    ))}
                  </div>
                </div>
              </div>
              <p id={hintId}>
                {discarding
                  ? `选 ${discardCount} 张弃牌（已选 ${selection.length}），再结束回合`
                  : state.player.energy === 0
                    ? '专注已用尽，可以结束回合'
                    : compactHand
                      ? '点牌查看 · 确认出牌'
                      : '未出手牌保留 · 悬停或聚焦查看'}
              </p>
            </div>
            <HandLayout
              cardShape="portrait-4-3"
              ariaLabel={discarding ? '选择要弃置的手牌' : '全部手牌'}
              hintId={hintId}
            >
              {state.hand.map((id) => {
                const card = state.cards.find((value) => value.id === id)!;
                const reason = getCardBattlePlayableReason(state, id);
                const selected = selection.includes(id);
                return (
                  <div
                    key={id}
                    className="ct-card-slot"
                    tabIndex={
                      reason && !discarding && !compactHand ? 0 : undefined
                    }
                    aria-label={
                      reason && !discarding && !compactHand
                        ? `${card.name}，${reason}，${viewText(card.description)}`
                        : undefined
                    }
                  >
                    <button
                      type="button"
                      className={`ct-card cd-card-${card.kind}${selected ? ' is-selected' : ''}`}
                      disabled={
                        !active ||
                        (!compactHand && !discarding && Boolean(reason))
                      }
                      data-unplayable={
                        (!discarding && Boolean(reason)) || undefined
                      }
                      aria-pressed={discarding ? selected : undefined}
                      onClick={(event) => {
                        if (discarding) toggleDiscard(id);
                        else if (compactHand) {
                          cardButton.current = event.currentTarget;
                          setPreviewCardId(id);
                          setNotebook('card');
                        } else onCommand({ type: 'play', cardId: id });
                      }}
                      aria-label={`${card.name}，消耗 ${card.cost} 专注，${viewText(card.description)}${discarding ? (selected ? '，已选择弃置' : '，选择弃置') : ''}`}
                    >
                      <span className="ct-card-heading">
                        <span className="ct-card-cost">{card.cost}</span>
                        <strong>{card.name}</strong>
                      </span>
                      <span className="cd-card-compact-kind" aria-hidden="true">
                        {selected ? '已选弃置' : CARD_KIND_LABELS[card.kind]}
                      </span>
                      <span className="ct-card-kind">
                        {CARD_KIND_LABELS[card.kind]} ·{' '}
                        {sourceText(card.sourceLabel)}
                        {card.exhaust ? ' · 本场一次' : ''}
                      </span>
                      <span className="ct-card-description">
                        {viewText(card.description)}
                      </span>
                      <span className="ct-card-preview">
                        {describeCardPreview(state, card)}
                      </span>
                      {card.scalingLabel && (
                        <span className="ct-card-scaling">
                          {viewText(card.scalingLabel)}
                        </span>
                      )}
                      <span className="ct-card-action">
                        {discarding
                          ? selected
                            ? '已选弃置 · 再点取消'
                            : '点击选择弃置'
                          : reason || '点击出牌'}
                      </span>
                    </button>
                  </div>
                );
              })}
            </HandLayout>
          </section>
        )}
        <footer className="cd-controls">
          <span>
            牌堆 {state.drawPile.length} · 弃牌 {state.discardPile.length} ·
            暂存 {state.exhaustPile.length}
          </span>
          <div>
            {result ? (
              <button
                className="cd-primary"
                onClick={onAcknowledge}
                disabled={!onAcknowledge}
              >
                确认继续 →
              </button>
            ) : retreatConfirmation ? (
              <>
                <span>
                  {rogue
                    ? '确认撤离？本次试炼将结束。'
                    : '确认撤离？本场损耗会保留。'}
                </span>
                <button onClick={() => setRetreatConfirmation(false)}>
                  {rogue ? '继续战斗' : '继续作答'}
                </button>
                <button
                  className="cd-danger"
                  onClick={() => onCommand({ type: 'retreat' })}
                >
                  确认撤离
                </button>
              </>
            ) : (
              <>
                <button
                  disabled={!active}
                  onClick={() => setRetreatConfirmation(true)}
                >
                  撤离
                </button>
                {discarding ? (
                  <>
                    <button
                      onClick={() => onCommand({ type: 'cancel-discard' })}
                    >
                      返回出牌
                    </button>
                    <button
                      className="cd-primary"
                      disabled={selection.length !== discardCount}
                      onClick={() =>
                        onCommand({
                          type: 'confirm-discard',
                          cardIds: selection,
                        })
                      }
                    >
                      弃置 {selection.length} 张并结束回合
                    </button>
                  </>
                ) : (
                  <button
                    className="cd-primary"
                    disabled={!active}
                    onClick={() => onCommand({ type: 'end-turn' })}
                  >
                    结束回合 →
                  </button>
                )}
              </>
            )}
          </div>
        </footer>
        {notebook && (
          <section
            className="cd-notebook"
            data-kind={modalNotebook ? notebook : undefined}
            aria-label={
              notebook === 'route'
                ? '本章路线'
                : notebook === 'card'
                  ? '手牌详情'
                  : '作战笔记'
            }
          >
            <header>
              <h3 id={modalNotebook ? `${headingId}-${notebook}` : undefined}>
                {
                  {
                    rules: rogue ? '试炼战斗规则' : '作答规则',
                    log: '本场记录',
                    deck: `本场${deckLabel}`,
                    gear: rogue ? '本局法器' : '本场装备特性',
                    route: '本章路线',
                    card: previewCard?.name ?? '手牌详情',
                  }[notebook]
                }
              </h3>
              <button
                ref={modalNotebook ? notebookClose : undefined}
                onClick={() => setNotebook(null)}
              >
                返回牌桌 ×
              </button>
            </header>
            {notebook === 'route' ? (
              routeMap
            ) : notebook === 'card' ? (
              previewCard && (
                <div className="cd-card-details">
                  <p>
                    {previewCard.cost} 专注 ·{' '}
                    {sourceText(previewCard.sourceLabel)}
                    {previewCard.exhaust && ' · 本场一次'}
                  </p>
                  <p>{viewText(previewCard.description)}</p>
                  <p>
                    <strong>{describeCardPreview(state, previewCard)}</strong>
                  </p>
                  {previewCard.scalingLabel && (
                    <p>{viewText(previewCard.scalingLabel)}</p>
                  )}
                  {previewBlocked && <p role="status">{previewBlocked}</p>}
                  <button
                    type="button"
                    className="cd-primary"
                    disabled={
                      state.phase !== 'battle' || Boolean(previewBlocked)
                    }
                    onClick={() => {
                      setNotebook(null);
                      onCommand({ type: 'play', cardId: previewCard.id });
                    }}
                  >
                    确认出牌
                  </button>
                </div>
              )
            ) : notebook === 'rules' ? (
              <>
                {archetype && (
                  <p className="cd-enemy-guide">
                    <b>{archetypeName}</b>
                    {!rogue && (
                      <>
                        ：{archetype.description}
                        <br />
                      </>
                    )}
                    行动循环：
                    {state.enemy.pattern?.map((move) => move.name).join(' → ')}
                    。
                  </p>
                )}
                <p>{story && viewText(story)}</p>
                <ol>
                  <li>
                    每回合 3 点专注，抽 4
                    张牌。可以连续出牌，点击结束回合后对手才行动。
                  </li>
                  <li>
                    未出的手牌跨回合保留。结束时超过 10 张，手动弃到 10 张。
                  </li>
                  <li>
                    防护在对手行动后清空；留盾可保留未消耗的部分。固守减伤50%，破势可解除固守与反震。
                  </li>
                  <li>
                    破绽让下一张进攻威力增加25%；反击须在本轮挡住损耗且仍存活才触发。转守为攻会消耗当前防护，出牌前注意预计损失。
                  </li>
                  <li>
                    {rogue
                      ? '试阵按公开节奏轮换，穿透、修复与反震会提前显示。实验法器自动生效，术式通过考核领悟、参悟升级与整理笔记调整。'
                      : '对手的行动按已公布节奏轮换，穿透、修复与反震会提前显示。装备特性穿戴后自动生效，装备卡仍需自行选入简历。'}
                  </li>
                  <li>
                    {rogue
                      ? '精力、术式牌组和法器均取自本局记录。战斗内治疗最多回到本场入场精力；研习室调息和章节恢复在战斗之外生效。'
                      : '精力、角色属性和来源牌均取自本次入场记录，治疗最多回到入场精力。'}
                  </li>
                  <li>
                    一场战斗最多 {state.maxTurns} 回合。
                    {rogue
                      ? '撤离、力竭或僵局会结束本次试炼，不发放胜利奖励。'
                      : '撤离与僵局保留已受损耗，不获得战斗胜利奖励。'}
                  </li>
                  <li>
                    动作自动保存。关闭页面后继续本场，保存失败时动作不生效。
                  </li>
                </ol>
              </>
            ) : notebook === 'gear' ? (
              <ul>
                {state.equipment?.map((trait) => (
                  <li key={trait.id}>
                    <b>{trait.name}</b> · {viewText(trait.description)}
                  </li>
                ))}
              </ul>
            ) : notebook === 'log' ? (
              <ol>
                {state.log.map((entry, index) => (
                  <li key={`${entry.seq}:${index}`}>
                    <b>回合 {entry.turn}</b> {viewText(entry.text)}
                  </li>
                ))}
              </ol>
            ) : (
              <>
                {rogue ? (
                  <p className="cd-deck-origin" aria-label="本局术式说明">
                    本局术式 {state.cards.length} 张，法器{' '}
                    {state.equipment?.length ?? 0} 件。
                    术式与法器来自本局课程修习和实验，精力与试炼学分独立保存。
                    当前战斗使用入场时保存的牌面，考核奖励与术式调整在战斗结束后进行。
                  </p>
                ) : (
                  <p className="cd-deck-origin" aria-label="角色与卡牌联系">
                    本场简历：基础与战术{' '}
                    {
                      state.cards.filter(
                        (card) => !card.source || card.source === 'basic'
                      ).length
                    }{' '}
                    张 · 已学课程{' '}
                    {
                      state.cards.filter((card) => card.source === 'course')
                        .length
                    }{' '}
                    张 · 当前装备{' '}
                    {
                      state.cards.filter((card) => card.source === 'equipment')
                        .length
                    }{' '}
                    张。 攻击 {state.player.attack}、防御 {state.player.defense}
                    、手速 {state.player.speed}{' '}
                    取自入场角色；课程与装备的具体加成见牌面。
                  </p>
                )}
                <ul>
                  {state.cards.map((card) => (
                    <li key={card.id}>
                      <b>{card.name}</b>（{card.cost} 专注 ·{' '}
                      {sourceText(card.sourceLabel)}）
                      {viewText(card.description)}
                      {card.scalingLabel && ` ${viewText(card.scalingLabel)}`}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
export default CardBattleView;
