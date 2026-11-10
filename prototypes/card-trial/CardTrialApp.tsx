import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { CARDS, ENEMIES } from './catalog';
import { BattleActor } from './BattleActor';
import { HandLayout } from './HandLayout';
import { LoadoutWorkshop, ATTRIBUTE_LABELS } from './LoadoutWorkshop';
import { createTrialBuild, loadLoadout } from './loadout';
import { getCardScaling, getTrialEnemy } from './progression';
import { createTrialMotion } from './motion';
import type { TrialMotion } from './motion';
import {
  createTrial,
  DRAW_PER_TURN,
  HAND_LIMIT,
  getCardLabel,
  getCardPreview,
  getEnemyIntent,
  getPlayableReason,
  MAX_TURNS,
  reduceTrial,
} from './engine';
import { commitTrial, loadTrial } from './persistence';
import type {
  CardDefinition,
  TrialBuild,
  TrialCommand,
  TrialState,
} from './types';

type TrialStorage = Pick<Storage, 'getItem' | 'setItem'>;
type TrialAction = TrialCommand extends infer Command
  ? Command extends TrialCommand
    ? Omit<Command, 'runId' | 'seq'>
    : never
  : never;
interface PendingSave {
  previous: TrialState | null;
  next: TrialState;
  command?: TrialCommand;
}
export interface CardTrialAppProps {
  storage?: TrialStorage;
}

function browserStorage(): TrialStorage {
  try {
    return window.localStorage;
  } catch {
    return {
      getItem() {
        throw new Error('浏览器存储不可用，请允许本站保存数据后重试。');
      },
      setItem() {
        throw new Error('浏览器存储不可用，本次操作尚未发生。');
      },
    };
  }
}

function newRunId() {
  return `trial-${Date.now()}-${globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)}`;
}

function summarizeDeck(state: TrialState) {
  const grouped = new Map<
    string,
    { card: CardDefinition; label: string; count: number }
  >();
  for (const instance of state.deck) {
    const card = CARDS[instance.cardId];
    const label = getCardLabel(state, instance.id);
    const key = `${card.id}:${label}`;
    const entry = grouped.get(key);
    if (entry) entry.count++;
    else grouped.set(key, { card, label, count: 1 });
  }
  return [...grouped.values()];
}
function CardFace({
  card,
  name,
  compact = false,
}: {
  card: CardDefinition;
  name?: string;
  compact?: boolean;
}) {
  const description =
    compact && card.source
      ? [
          card.clearEnemyBlock ? '先清除对手防护' : '',
          card.damage ? `基础 ${card.damage} 点损耗` : '',
          card.block ? `基础 ${card.block} 点防护` : '',
          card.heal ? `基础恢复 ${card.heal} 点精力` : '',
          card.draw ? `抽 ${card.draw} 张牌` : '',
          card.nextAttackBonus ? `下次进攻 +${card.nextAttackBonus}` : '',
          card.bonusAfterAttack
            ? `本回合已进攻时再 +${card.bonusAfterAttack}`
            : '',
        ]
          .filter(Boolean)
          .join('；') + '。'
      : card.description;
  return (
    <>
      <span className="ct-card-heading">
        <span className="ct-card-cost" aria-label={`消耗 ${card.cost} 点专注`}>
          {card.cost}
        </span>
        <strong>{name ?? card.name}</strong>
      </span>
      <span className="ct-card-kind">
        {{ attack: '进攻', defense: '防御', utility: '准备' }[card.kind]}
        {card.exhaust ? ' · 本场一次' : ''}
      </span>
      <span className="ct-card-description">{description}</span>
    </>
  );
}

function Meter({
  label,
  value,
  max,
  ariaLabel = label,
}: {
  label: string;
  ariaLabel?: string;
  value: number;
  max: number;
}) {
  return (
    <div className="ct-meter">
      <div>
        <span>{label}</span>
        <strong>
          {value} / {max}
        </strong>
      </div>
      <meter min={0} max={max} value={value} aria-label={ariaLabel} />
    </div>
  );
}

function NotebookPanel({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  function close(details: HTMLDetailsElement | null) {
    if (!details) return;
    details.open = false;
    details.querySelector('summary')?.focus({ preventScroll: true });
  }
  return (
    <details
      onKeyDown={(event) => {
        if (event.key === 'Escape' && event.currentTarget.open) {
          event.preventDefault();
          close(event.currentTarget);
        }
      }}
    >
      <summary>{title}</summary>
      <div className="ct-notebook-body">
        <button
          type="button"
          className="ct-text-button ct-notebook-close"
          onClick={(event) => close(event.currentTarget.closest('details'))}
        >
          返回牌桌
        </button>
        {children}
      </div>
    </details>
  );
}

function Rules({
  open = false,
  embedded = false,
}: {
  open?: boolean;
  embedded?: boolean;
}) {
  const content = (
    <>
      <ol>
        <li>
          出发简历选择 8–16 张，每回合抽 4 张，获得 3 点专注。可以连续出牌。
        </li>
        <li>
          看清对手的下一步，再决定进攻或防御。点击“结束回合”，对手才行动。
        </li>
        <li>
          未出的手牌跨回合保留。回合结束超过 10 张，先自行选弃至 10
          张；本回合抽牌后可暂时超过上限。防护抵挡损耗后清空，抽牌堆用完会洗回弃牌，牌不足时只抽实际可用的牌。
        </li>
        <li>前两场获胜后，三选一加牌，也可跳过。进入下一场恢复 6 点精力。</li>
        <li>连续完成 3 场即通关；没有倒计时，可以随时关页后继续。</li>
        <li>每场最多 {MAX_TURNS} 回合；届时未分胜负，本次试炼以僵局结束。</li>
      </ol>
      <p>所有卡牌和奖励只属于这次试炼，不影响主游戏。</p>
    </>
  );
  return embedded ? (
    content
  ) : (
    <details className="ct-rules" open={open}>
      <summary>试炼规则 · 三场短试炼</summary>
      {content}
    </details>
  );
}
export default function CardTrialApp({ storage }: CardTrialAppProps) {
  const [storageSource] = useState(() => storage ?? browserStorage());
  const [initial] = useState(() => loadTrial(storageSource));
  const [state, setState] = useState<TrialState | null>(initial.state);
  const current = useRef(state);
  const [error, setError] = useState(initial.error);
  const [pending, setPending] = useState<PendingSave | null>(null);
  const pendingRef = useRef<PendingSave | null>(null);
  const [seed, setSeed] = useState(String(initial.state?.seed ?? 314159));
  const [confirmRestart, setConfirmRestart] = useState(false);
  const [motion, setMotion] = useState<TrialMotion | null>(null);
  const [initialLoadout] = useState(() => loadLoadout(storageSource));
  const [loadout, setLoadout] = useState(initialLoadout.loadout);
  const [loadoutError, setLoadoutError] = useState(initialLoadout.error);
  const [workshopOpen, setWorkshopOpen] = useState(false);
  const [preparedBuild, setPreparedBuild] = useState<TrialBuild | null>(null);
  const [discardSelection, setDiscardSelection] = useState<string[]>([]);
  const phase = state?.phase;
  const stage = state?.stage;
  const runId = state?.runId;
  useEffect(() => {
    if (!phase || typeof document === 'undefined') return;
    const heading = document.getElementById('ct-stage-heading');
    heading?.focus({ preventScroll: true });
  }, [phase, stage, runId]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const id = error
      ? 'ct-error-heading'
      : confirmRestart
        ? 'ct-restart-heading'
        : null;
    if (!id) return;
    const heading = document.getElementById(id);
    heading?.focus({ preventScroll: true });
    heading?.scrollIntoView({ block: 'center', behavior: 'instant' });
  }, [error, pending, confirmRestart]);

  function save(
    previous: TrialState | null,
    next: TrialState,
    command?: TrialCommand
  ) {
    const result = commitTrial(storageSource, previous, next);
    if (!result.ok) {
      const attempt = { previous, next, command };
      pendingRef.current = attempt;
      setPending(attempt);
      setError(result.error ?? '保存失败，本次操作尚未发生。');
      return;
    }
    setMotion(createTrialMotion(previous, next, command));
    setDiscardSelection([]);
    if (next.runId !== previous?.runId) setPreparedBuild(null);
    current.current = next;
    pendingRef.current = null;
    setPending(null);
    setState(next);
    setError('');
    setConfirmRestart(false);
  }

  function start(buildOverride?: TrialBuild) {
    if (pendingRef.current) return;
    const value = Number(seed);
    if (
      seed.trim() === '' ||
      !Number.isInteger(value) ||
      value < 0 ||
      value > 0xffffffff
    ) {
      setError('试炼编号请输入 0 到 4294967295 之间的整数。');
      return;
    }
    let build: TrialBuild;
    try {
      build = buildOverride ?? preparedBuild ?? createTrialBuild(loadout);
    } catch {
      setConfirmRestart(false);
      setWorkshopOpen(true);
      return;
    }
    save(
      current.current,
      createTrial({ seed: value, runId: newRunId(), build })
    );
  }

  function act(command: TrialAction) {
    const previous = current.current;
    if (!previous || pendingRef.current) return;
    const acceptedCommand = {
      ...command,
      runId: previous.runId,
      seq: previous.commandSeq + 1,
    } as TrialCommand;
    const next = reduceTrial(previous, acceptedCommand);
    if (next !== previous) save(previous, next, acceptedCommand);
  }

  function reread() {
    const loaded = loadTrial(storageSource);
    setMotion(null);
    setDiscardSelection([]);
    current.current = loaded.state;
    pendingRef.current = null;
    setPending(null);
    setState(loaded.state);
    setError(loaded.error);
    setConfirmRestart(false);
    setPreparedBuild(null);
  }

  const enemy = state ? getTrialEnemy(state) : null;
  const combatActive = state?.phase === 'battle' || state?.phase === 'discard';
  const intent = state && combatActive ? getEnemyIntent(state) : null;
  const discardNeeded =
    state?.phase === 'discard' ? state.battle.hand.length - HAND_LIMIT : 0;
  const latest =
    state?.log.filter((entry) => entry.seq === state.commandSeq).slice(-3) ??
    [];
  const terminal =
    state && !['battle', 'discard', 'reward'].includes(state.phase);
  const statusTitle = state
    ? {
        battle: '轮到你了',
        discard: '整理手牌 · 选出要弃的牌',
        reward: '本场获胜 · 为下一场选牌',
        complete: '试炼完成',
        defeat: '这次先到这里',
        retreated: '已离开试炼',
        stalemate: '演练暂告一段落',
      }[state.phase]
    : '给自己一场小试炼';

  return (
    <main className="ct-app" data-screen={state?.phase ?? 'welcome'}>
      <header className="ct-header">
        <div>
          <p className="ct-eyebrow">灵枢录 · 独立玩法试作</p>
          <h1>课后演练</h1>
        </div>
        <span className="ct-header-stamp">三场卡牌试炼</span>
      </header>
      <p className="ct-isolation">独立试玩，进度单独保存。</p>

      {error && (
        <section className="ct-error ct-overlay" role="alert">
          <strong id="ct-error-heading" tabIndex={-1}>
            {pending ? '当前操作未保存' : '请检查试炼记录'}
          </strong>
          <p>{error}</p>
          {pending && <p>现场已保留。恢复存储后，可重试同一次操作。</p>}
          <div className="ct-button-row">
            {pending && (
              <button
                type="button"
                onClick={() =>
                  save(pending.previous, pending.next, pending.command)
                }
              >
                重试保存本次操作
              </button>
            )}
            <button type="button" className="ct-text-button" onClick={reread}>
              重新读取存档
            </button>
          </div>
        </section>
      )}

      {!state ? (
        <section className="ct-welcome">
          <p className="ct-section-label">演练登记表</p>
          <h2>{statusTitle}</h2>
          <p className="ct-lead">
            出几张牌，挡一次进攻。让下一次选择，改变下一场的打法。
          </p>
          <Rules open />
          <div className="ct-start-row">
            <label>
              试炼编号
              <input
                type="number"
                inputMode="numeric"
                min="0"
                max="4294967295"
                step="1"
                value={seed}
                disabled={Boolean(pending)}
                onChange={(event) => setSeed(event.target.value)}
              />
            </label>
            <button
              type="button"
              className="ct-primary"
              disabled={Boolean(pending)}
              onClick={() => start()}
            >
              {error ? '明确新开一场试炼' : '开始试炼'}
            </button>
            <button
              type="button"
              className="ct-text-button"
              disabled={Boolean(pending)}
              onClick={() => setWorkshopOpen(true)}
            >
              编辑牌库与简历
            </button>
          </div>
          <p className="ct-footnote">
            同一编号从相同初始条件开始；采用相同选择，可复现相同过程。
          </p>
        </section>
      ) : (
        <>
          <nav className="ct-route" aria-label="三场试炼进度">
            {ENEMIES.map((item, index) => (
              <span
                key={item.id}
                aria-current={index === state.stage ? 'step' : undefined}
                className={
                  index < state.stage || state.phase === 'complete'
                    ? 'is-done'
                    : ''
                }
              >
                <small>{String(index + 1).padStart(2, '0')}</small>
                {item.name}
              </span>
            ))}
          </nav>

          <section className="ct-table" data-phase={state.phase}>
            <div className="ct-table-heading">
              <div>
                <p className="ct-section-label">
                  第 {state.stage + 1} 场 / 共 3 场 · 第 {state.battle.turn}{' '}
                  回合
                </p>
                <h2 id="ct-stage-heading" tabIndex={-1}>
                  {statusTitle}
                </h2>
              </div>
              <span className="ct-seed-label">编号 {state.seed}</span>
            </div>

            {combatActive && (
              <aside className="ct-pocket" aria-label="随手查看的战斗状态">
                <div>
                  <span>
                    精力 <b>{state.player.hp}</b>/{state.player.maxHp} · 专注{' '}
                    <b>{state.player.energy}</b> · 防护{' '}
                    <b>{state.player.block}</b>
                  </span>
                  <span>
                    来袭 {intent?.damage ?? 0} · 将损失{' '}
                    {Math.min(
                      state.player.hp,
                      Math.max(0, (intent?.damage ?? 0) - state.player.block)
                    )}
                  </span>
                </div>
                <button
                  type="button"
                  aria-label="便捷结束回合"
                  disabled={Boolean(pending)}
                  onClick={() => act({ type: 'end-turn' })}
                >
                  结束回合
                </button>
              </aside>
            )}

            <div
              className="ct-combatants"
              role="group"
              aria-label="双方状态与对手意图"
              tabIndex={0}
              data-motion-key={motion?.key}
              data-action={motion?.action}
            >
              <span className="ct-duel-mark" aria-hidden="true">
                交手
              </span>
              {motion?.cardId && (
                <span
                  key={motion.key}
                  className="ct-played-note"
                  aria-hidden="true"
                >
                  {motion.cardLabel ?? CARDS[motion.cardId].name}
                </span>
              )}
              <section className="ct-student" aria-label="你的状态">
                <BattleActor side="player" cue={motion} />
                <h3>你</h3>
                <Meter
                  label="精力"
                  value={state.player.hp}
                  max={state.player.maxHp}
                />
                <dl className="ct-stats">
                  <div>
                    <dt>专注</dt>
                    <dd>
                      {state.player.energy}
                      <span> / 3</span>
                    </dd>
                  </div>
                  <div>
                    <dt>防护</dt>
                    <dd>{state.player.block}</dd>
                  </div>
                </dl>
                {state.player.nextAttackBonus > 0 && (
                  <p className="ct-bonus">
                    下一次进攻 +{state.player.nextAttackBonus}
                  </p>
                )}
                {combatActive && (
                  <p className="ct-incoming">
                    若现在结束回合，预计损失{' '}
                    <strong>
                      {Math.min(
                        state.player.hp,
                        Math.max(0, (intent?.damage ?? 0) - state.player.block)
                      )}
                    </strong>{' '}
                    点精力
                    {(intent?.damage ?? 0) - state.player.block >=
                      state.player.hp && '，精力将耗尽'}
                  </p>
                )}
              </section>
              <section className="ct-opponent" aria-label="对手状态与意图">
                <BattleActor side="enemy" variant={state.stage} cue={motion} />
                <p className="ct-section-label">
                  {enemy?.grade
                    ? `${enemy.grade.realm} ${enemy.grade.level} 层 · ${enemy.grade.strength}`
                    : '本场对手 · 旧版固定试炼'}
                </p>
                <h3>{enemy?.name}</h3>
                <Meter
                  label="精力"
                  ariaLabel="对手精力"
                  value={state.battle.enemyHp}
                  max={enemy?.maxHp ?? 1}
                />
                <p className="ct-enemy-block">
                  现有防护 <strong>{state.battle.enemyBlock}</strong>
                </p>
                {intent ? (
                  <div className="ct-intent">
                    <strong>下一步：{intent.name}</strong>
                    <span>
                      造成 {intent.damage} 点损耗 · 获得 {intent.block} 点防护
                    </span>
                    <p>{intent.description}</p>
                  </div>
                ) : (
                  <p className="ct-muted">
                    {state.phase === 'reward' || state.phase === 'complete'
                      ? '本场对手已完成演练。'
                      : '本场演练已结束。'}
                  </p>
                )}
              </section>
            </div>

            <section
              className="ct-feedback"
              role="status"
              aria-live="polite"
              aria-label="最近操作反馈"
            >
              <span className="ct-section-label">刚刚发生</span>
              {motion ? (
                <div
                  className="ct-motion-caption"
                  data-cue-key={motion.key}
                  data-action={motion.action}
                >
                  <strong className="ct-feedback-title">{motion.title}</strong>
                  <p>{motion.detail}</p>
                </div>
              ) : (
                latest.map((entry, index) => (
                  <p key={`${entry.seq}-${index}`}>{entry.text}</p>
                ))
              )}
            </section>

            {combatActive && (
              <section className="ct-hand-area" aria-label="手牌与出牌操作">
                <div className="ct-hand-heading">
                  <span className="ct-hand-hint" id="ct-hand-hint">
                    全部手牌 · 悬停或聚焦放大 · 结束限 10 张
                  </span>
                  <h3>
                    手牌{' '}
                    <small>
                      {state.battle.hand.length} / {HAND_LIMIT} 张
                    </small>
                  </h3>
                  <p>
                    抽牌 {state.battle.drawPile.length} · 弃牌{' '}
                    {state.battle.discardPile.length} · 本场已用尽{' '}
                    {state.battle.exhaustPile.length}
                  </p>
                </div>
                <HandLayout>
                  {state.battle.hand.map((instanceId) => {
                    const instance = state.deck.find(
                      (item) => item.id === instanceId
                    )!;
                    const card = CARDS[instance.cardId];
                    const cardName = getCardLabel(state, instanceId);
                    const choosingDiscard = state.phase === 'discard';
                    const selected = discardSelection.includes(instanceId);
                    const scaling = getCardScaling(card, state.build?.profile);
                    const reason = choosingDiscard
                      ? null
                      : getPlayableReason(state, instanceId);
                    const preview = getCardPreview(state, instanceId);
                    return (
                      <div
                        className="ct-card-slot"
                        key={instanceId}
                        tabIndex={reason || pending ? 0 : undefined}
                        aria-label={
                          reason || pending
                            ? `${cardName}，${reason ?? '等待保存'}`
                            : undefined
                        }
                      >
                        <button
                          type="button"
                          className={`ct-card ct-card-${card.kind}${card.source ? ' ct-card-source' : ''}${selected ? ' is-discard-selected' : ''}`}
                          disabled={Boolean(reason || pending)}
                          onClick={() =>
                            choosingDiscard
                              ? setDiscardSelection((previous) =>
                                  selected
                                    ? previous.filter((id) => id !== instanceId)
                                    : previous.length < discardNeeded
                                      ? [...previous, instanceId]
                                      : previous
                                )
                              : act({
                                  type: 'play',
                                  cardInstanceId: instanceId,
                                })
                          }
                          aria-pressed={choosingDiscard ? selected : undefined}
                          aria-label={
                            choosingDiscard
                              ? `${selected ? '取消弃置' : '选择弃置'}${cardName}`
                              : `打出${cardName}，消耗 ${card.cost} 点专注${reason ? `，${reason}` : ''}`
                          }
                        >
                          <CardFace card={card} name={cardName} compact />
                          <span className="ct-card-preview">
                            {card.scaling && (
                              <span>
                                {ATTRIBUTE_LABELS[card.scaling.stat]}加成 +
                                {scaling.bonus}
                              </span>
                            )}
                            {preview.damage > 0 && (
                              <span>
                                进攻 {preview.damage}，实际损耗{' '}
                                {Math.min(
                                  state.battle.enemyHp,
                                  Math.max(
                                    0,
                                    preview.damage -
                                      (card.clearEnemyBlock
                                        ? 0
                                        : state.battle.enemyBlock)
                                  )
                                )}
                              </span>
                            )}
                            {preview.block > 0 && (
                              <span>本次获得 {preview.block} 点防护</span>
                            )}
                            {preview.heal > 0 && (
                              <span>本次恢复 {preview.heal} 点精力</span>
                            )}
                            {preview.draw > 0 && (
                              <span>
                                本次可抽{' '}
                                {Math.min(
                                  preview.draw,
                                  state.battle.drawPile.length +
                                    state.battle.discardPile.length
                                )}{' '}
                                张牌
                              </span>
                            )}
                            {card.nextAttackBonus && (
                              <span>下一次进攻 +{card.nextAttackBonus}</span>
                            )}
                            {card.clearEnemyBlock && (
                              <span>先移除对手防护</span>
                            )}
                            {card.heal && preview.heal === 0 ? (
                              <span>精力已满，本次恢复 0</span>
                            ) : null}
                          </span>
                          <span className="ct-card-action">
                            {pending
                              ? '等待保存'
                              : choosingDiscard
                                ? selected
                                  ? '已选中 · 将弃置'
                                  : '点击选择弃牌'
                                : (reason ?? '点击出牌')}
                          </span>
                        </button>
                      </div>
                    );
                  })}
                </HandLayout>
                {state.battle.hand.length === 0 && (
                  <p className="ct-empty">
                    手牌已用完。结束回合后，重新获得专注并抽牌。
                  </p>
                )}
                <div
                  className={`ct-turn-controls${state.phase === 'discard' ? ' ct-discard-controls' : ''}`}
                >
                  {state.phase === 'discard' ? (
                    <>
                      <p id="ct-discard-count" role="status" aria-live="polite">
                        需弃 {discardNeeded} 张，已选 {discardSelection.length}{' '}
                        张；确认后对手才行动。
                      </p>
                      <button
                        type="button"
                        className="ct-text-button"
                        disabled={Boolean(pending)}
                        onClick={() => act({ type: 'cancel-discard' })}
                      >
                        返回出牌
                      </button>
                      <button
                        type="button"
                        className="ct-primary"
                        aria-label="确认弃牌并结束"
                        aria-describedby="ct-discard-count"
                        disabled={
                          Boolean(pending) ||
                          discardSelection.length !== discardNeeded
                        }
                        onClick={() =>
                          act({
                            type: 'confirm-discard',
                            cardInstanceIds: discardSelection,
                          })
                        }
                      >
                        确认弃牌 {discardSelection.length}/{discardNeeded} ·
                        结束
                      </button>
                    </>
                  ) : (
                    <>
                      <p>
                        未出手牌保留；结束时超 {HAND_LIMIT} 张需选弃。下回合抽{' '}
                        {DRAW_PER_TURN} 张。
                      </p>
                      <button
                        type="button"
                        className="ct-primary"
                        disabled={Boolean(pending)}
                        onClick={() => act({ type: 'end-turn' })}
                      >
                        结束回合
                      </button>
                    </>
                  )}
                </div>
              </section>
            )}

            {state.phase === 'reward' && (
              <section className="ct-rewards" aria-label="胜利后选牌">
                <h3>给下一场留一个新解法</h3>
                <p>
                  三选一加入牌组。选好后恢复 6 点精力（至多 {state.player.maxHp}{' '}
                  点），进入第 {state.stage + 2} 场。
                  <span className="ct-reward-hint">
                    全部候选已展开，悬停看清。
                  </span>
                </p>
                <HandLayout
                  className="ct-reward-cards"
                  ariaLabel="全部奖励牌"
                  hintId={undefined}
                >
                  {state.rewards.map((cardId) => (
                    <div className="ct-card-slot" key={cardId}>
                      <button
                        type="button"
                        className={`ct-card ct-card-${CARDS[cardId].kind}`}
                        disabled={Boolean(pending)}
                        onClick={() => act({ type: 'choose-reward', cardId })}
                        aria-label={`选择${CARDS[cardId].name}加入牌组`}
                      >
                        <CardFace card={CARDS[cardId]} />
                        <span className="ct-card-action">加入牌组并继续</span>
                      </button>
                    </div>
                  ))}
                </HandLayout>
                <button
                  type="button"
                  className="ct-text-button"
                  disabled={Boolean(pending)}
                  onClick={() => act({ type: 'choose-reward', cardId: null })}
                >
                  跳过选牌，恢复精力后继续
                </button>
              </section>
            )}

            {terminal && (
              <section className="ct-result" aria-label="本次试炼结果">
                <p className="ct-section-label">演练小结</p>
                <h3>
                  {state.phase === 'complete'
                    ? '三场都完成了，记下这次的打法。'
                    : '可以换一种出牌顺序，再试一次。'}
                </h3>
                <p>
                  完成 {state.summaries.length} / 3 场 · 剩余精力{' '}
                  {state.player.hp} · 牌组 {state.deck.length} 张
                </p>
                <p>
                  共经历{' '}
                  {state.summaries.reduce(
                    (total, summary) => total + summary.turns,
                    0
                  ) + (state.phase === 'complete' ? 0 : state.battle.turn)}{' '}
                  回合
                </p>
                <p>
                  选入的牌：
                  {state.chosenCards.length
                    ? state.chosenCards.map((id) => CARDS[id].name).join('、')
                    : '保持初始牌组'}
                </p>
                <p className="ct-footnote">
                  这次试炼没有主游戏奖励。编号 {state.seed}{' '}
                  可用于从相同初始条件重试。
                </p>
              </section>
            )}
          </section>

          <div className="ct-notebook">
            <NotebookPanel title={`简历档案 · ${state.deck.length} 张`}>
              <p className="ct-profile-note">
                {state.build
                  ? `${state.build.profile.name} · ${state.build.profile.realm} ${state.build.profile.realmLevel} 层 · ${state.build.resume.length} 张出发简历，当前 ${state.deck.length} 张`
                  : '当前为旧版固定牌组。编辑简历后确认新开，启用角色属性与同阶对手。'}
              </p>
              {enemy?.grade && (
                <p className="ct-profile-note">
                  对手攻 {enemy.grade.attack} · 防御 {enemy.grade.defense}
                  ；原游戏精力 {enemy.grade.raw.maxHp} / 攻击{' '}
                  {enemy.grade.raw.attack} / 防御 {enemy.grade.raw.defense}，每{' '}
                  {enemy.grade.unit} 原数值折算 1
                  卡牌单位。防御用于开场防护与固守。
                </p>
              )}
              <ul className="ct-deck-list">
                {summarizeDeck(state).map(({ card, label, count }) => (
                  <li key={`${card.id}:${label}`}>
                    <strong>
                      {label} × {count}
                    </strong>
                    <span>
                      {card.cost} 专注 · {card.description}
                    </span>
                  </li>
                ))}
              </ul>
            </NotebookPanel>
            <NotebookPanel title={`回合记录 · ${state.log.length} 条`}>
              <ol className="ct-log">
                {state.log.map((entry, index) => (
                  <li key={`${entry.seq}-${index}`}>
                    <small>
                      第 {entry.stage + 1} 场 · 回合 {entry.turn}
                    </small>
                    <span>{entry.text}</span>
                  </li>
                ))}
              </ol>
            </NotebookPanel>
            <NotebookPanel title="试炼规则 · 三场短试炼">
              <Rules embedded />
            </NotebookPanel>
          </div>

          <footer className="ct-footer">
            <span>每次操作保存后生效 · 关闭页面可续玩</span>
            <button
              type="button"
              className="ct-text-button"
              disabled={Boolean(pending)}
              onClick={() => setWorkshopOpen(true)}
            >
              编辑简历
            </button>
            <button
              type="button"
              className="ct-text-button"
              disabled={Boolean(pending)}
              onClick={() => setConfirmRestart(true)}
            >
              重新开一场
            </button>
            {combatActive && (
              <button
                type="button"
                className="ct-text-button"
                disabled={Boolean(pending)}
                onClick={() => act({ type: 'retreat' })}
              >
                离开本次试炼
              </button>
            )}
          </footer>
          {confirmRestart && (
            <section
              className="ct-restart ct-overlay"
              aria-label="确认重新开始"
            >
              <h3 id="ct-restart-heading" tabIndex={-1}>
                覆盖这次试炼记录？
              </h3>
              <p>当前牌组与进度将被替换。新试炼仍与主游戏分开。</p>
              <p>
                {preparedBuild
                  ? `${preparedBuild.profile.name} · ${preparedBuild.profile.realm} ${preparedBuild.profile.realmLevel} 层 · ${preparedBuild.resume.length} 张出发简历`
                  : `使用已保存的 ${loadout.resume.length} 张简历和角色快照。`}
              </p>
              <label>
                新试炼编号
                <input
                  type="number"
                  min="0"
                  max="4294967295"
                  step="1"
                  value={seed}
                  disabled={Boolean(pending)}
                  onChange={(event) => setSeed(event.target.value)}
                />
              </label>
              <div className="ct-button-row">
                <button
                  type="button"
                  className="ct-danger"
                  disabled={Boolean(pending)}
                  onClick={() => start()}
                >
                  确认覆盖并开始
                </button>
                <button
                  type="button"
                  className="ct-text-button"
                  onClick={() => {
                    setConfirmRestart(false);
                    setPreparedBuild(null);
                  }}
                >
                  保留当前试炼
                </button>
              </div>
            </section>
          )}
        </>
      )}
      {workshopOpen && (
        <LoadoutWorkshop
          initial={loadout}
          initialError={loadoutError}
          storage={storageSource}
          hasRun={Boolean(state)}
          onClose={() => setWorkshopOpen(false)}
          onSaved={(nextLoadout) => {
            setLoadout(nextLoadout);
            setLoadoutError('');
            setPreparedBuild(null);
          }}
          onUse={(build, nextLoadout) => {
            setLoadout(nextLoadout);
            setPreparedBuild(build);
            setWorkshopOpen(false);
            if (current.current) setConfirmRestart(true);
            else start(build);
          }}
        />
      )}
    </main>
  );
}
