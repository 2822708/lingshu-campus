import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { CardId } from '../card-battle/types';
import CardBattleView from '../card-battle/ui/CardBattleView';
import {
  JOBS,
  RELICS,
  ROGUE_CARDS,
  getBoss,
  getChapter,
  getRogueChapter,
  getNodeKind,
  getShopPrices,
  resolveRogueCard,
} from './catalog';
import { createRogueRun, getRogueCurrentKind, stepRogueRun } from './engine';
import RogueRouteMap, { getRogueNodeLabel } from './RogueRouteMap';
import { presentRogueBattle, presentRogueText } from './presentation';
import { commitRogueRun, loadRogueRun, ROGUE_SAVE_KEY } from './persistence';
import type { RogueStorage } from './persistence';
import type {
  RogueAction,
  RogueCard,
  RogueJobId,
  RogueRun,
  RogueStarterId,
} from './types';
import './rogue-mode.css';

const NODE_LABELS = {
  battle: '遭遇',
  elite: '精英',
  boss: 'BOSS',
  camp: '休整',
  shop: '商店',
  event: '事件',
};
const PHASE_LABELS = {
  route: '选择遭遇',
  battle: '交战',
  reward: '试炼所得',
  camp: '研习室休整',
  shop: '工坊服务',
  event: '校园机缘',
  defeat: '试炼结束',
  complete: '渡劫通关',
};
function getStorage(): RogueStorage {
  try {
    return window.localStorage;
  } catch {
    return {
      getItem() {
        throw Error('无法读取记录');
      },
      setItem() {
        throw Error('无法保存记录');
      },
    };
  }
}
function cardName(card: RogueCard) {
  return `${ROGUE_CARDS[card.cardId]?.name ?? card.cardId}${card.level ? ` +${card.level}` : ''}`;
}
interface Props {
  onExit: () => void;
  storage?: RogueStorage;
}
type CardPicker =
  | { type: 'camp'; choice: 'upgrade' | 'remove' }
  | { type: 'shop'; choice: 'upgrade' }
  | { type: 'event'; choice: 'remove' };

export default function RogueMode({ onExit, storage: providedStorage }: Props) {
  const [storage] = useState(() => providedStorage ?? getStorage());
  const [loaded] = useState(() => loadRogueRun(storage));
  const [run, setRun] = useState<RogueRun | null>(loaded.state);
  const current = useRef(run);
  const [view, setView] = useState<'setup' | 'run'>('setup');
  const [job, setJob] = useState<RogueJobId>('vanguard');
  const [starter, setStarter] = useState<RogueStarterId>('steady');
  const [error, setError] = useState(loaded.error);
  const [confirmNew, setConfirmNew] = useState(false);
  const [busy, setBusy] = useState(false);
  const writing = useRef(false);
  const [picker, setPicker] = useState<CardPicker | null>(null);
  const [inspect, setInspect] = useState<'deck' | 'relics' | 'map' | null>(
    null
  );
  const notebook = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!picker && !inspect) return;
    const element = notebook.current;
    const oldFocus = document.activeElement;
    element?.querySelector<HTMLButtonElement>('button')?.focus();
    function keydown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        setPicker(null);
        setInspect(null);
        return;
      }
      if (event.key !== 'Tab') return;
      const controls = [
        ...(element?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [tabindex="0"]'
        ) ?? []),
      ];
      const first = controls[0],
        last = controls[controls.length - 1];
      if (!first) {
        event.preventDefault();
        return;
      }
      if (
        event.shiftKey &&
        (document.activeElement === first ||
          !element?.contains(document.activeElement))
      ) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        (document.activeElement === last ||
          !element?.contains(document.activeElement))
      ) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener('keydown', keydown, true);
    return () => {
      document.removeEventListener('keydown', keydown, true);
      if (oldFocus instanceof HTMLElement && oldFocus.isConnected)
        oldFocus.focus();
    };
  }, [picker, inspect]);

  async function publish(next: RogueRun, replaceInvalid = false) {
    if (writing.current) return;
    if (typeof navigator === 'undefined' || !navigator.locks) {
      setError(
        '当前浏览器不支持安全的页面存档锁。请在本地或 HTTPS 页面使用新版浏览器后重试。'
      );
      return;
    }
    writing.current = true;
    setBusy(true);
    const write = () => {
      const result = commitRogueRun(storage, current.current, next, {
        replaceInvalid,
      });
      if (!result.ok) {
        setError(result.error ?? '本次操作未能保存。');
        return;
      }
      current.current = next;
      setRun(next);
      setError('');
      setView('run');
      setConfirmNew(false);
      setPicker(null);
    };
    try {
      await navigator.locks.request(`${ROGUE_SAVE_KEY}:write`, write);
    } catch {
      setError('记录暂未保存，当前进度没有改变。请重试。');
    } finally {
      writing.current = false;
      setBusy(false);
    }
  }
  function command(action: RogueAction) {
    const before = current.current;
    if (!before || writing.current) return;
    try {
      const next = stepRogueRun(before, {
        ...action,
        runId: before.runId,
        seq: before.seq + 1,
      });
      if (next !== before) void publish(next);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '本次选择无法完成。');
    }
  }
  function newRun() {
    if ((run || loaded.error) && !confirmNew) {
      setConfirmNew(true);
      return;
    }
    try {
      const seed =
        globalThis.crypto?.getRandomValues(new Uint32Array(1))[0] ??
        Math.floor(Math.random() * 0x100000000);
      void publish(
        createRogueRun({
          runId: `rogue-${Date.now().toString(36)}-${seed.toString(36)}`,
          seed,
          jobId: job,
          starterId: starter,
        }),
        !current.current && Boolean(loaded.error)
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '未能建立新试炼。');
    }
  }
  function leave() {
    if (!writing.current) onExit();
  }
  const selectedJob = JOBS[job];
  const displayBattle = useMemo(
    () => (run?.battle ? presentRogueBattle(run.battle) : undefined),
    [run?.battle]
  );
  const selectedStarter =
    selectedJob.starters.find((s) => s.id === starter) ??
    selectedJob.starters[0];
  const panel = (title: string, description: string, children: ReactNode) => (
    <section className="rm-panel" data-phase={run?.phase}>
      <p className="rm-eyebrow">
        {run ? `第 ${run.floor} 关 · ${PHASE_LABELS[run.phase]}` : '新的试炼'}
      </p>
      <h2>{title}</h2>
      <p className="rm-muted">{description}</p>
      {children}
    </section>
  );

  if (view === 'setup' || !run)
    return (
      <main className="rm-app rm-setup">
        <header className="rm-header">
          <div>
            <p className="rm-eyebrow">灵枢试炼 · 工科学园考核</p>
            <h1>以课程悟道，闯五十重试炼</h1>
          </div>
          <button onClick={leave}>← 模式选择</button>
        </header>
        <div className="rm-content">
          {error && (
            <p className="rm-error" role="alert">
              {presentRogueText(error)}
            </p>
          )}
          {run && (
            <section className="rm-continue">
              <div>
                <b>
                  {JOBS[run.jobId].name} · 第 {run.floor} / 50 关
                </b>
                <p>
                  {run.map && run.phase === 'route'
                    ? '选择路线'
                    : PHASE_LABELS[run.phase]}{' '}
                  · 精力 {run.hp}/{run.maxHp} · 试炼学分 {run.gold}
                </p>
              </div>
              <button
                className="rm-primary"
                onClick={() => {
                  setView('run');
                  setError('');
                }}
              >
                继续上次试炼 →
              </button>
            </section>
          )}
          <section aria-label="选择职业">
            <div className="rm-section-title">
              <h2>选择职业</h2>
              <span>修习流派决定起始法器与课程术式</span>
            </div>
            <div className="rm-choice-grid rm-jobs">
              {Object.values(JOBS).map((definition, index) => (
                <button
                  key={definition.id}
                  title={definition.description}
                  className={`rm-choice${job === definition.id ? ' is-selected' : ''}`}
                  aria-pressed={job === definition.id}
                  onClick={() => {
                    setJob(definition.id);
                    setStarter('steady');
                    setConfirmNew(false);
                  }}
                >
                  <small>0{index + 1}</small>
                  <strong>{definition.name}</strong>
                  <span>{definition.description}</span>
                  <b>
                    精力 {definition.hp} ·{' '}
                    {RELICS[definition.starterRelic].name}
                  </b>
                </button>
              ))}
            </div>
            <p className="rm-job-note">{selectedJob.description}</p>
          </section>
          <section aria-label="选择初始卡组">
            <div className="rm-section-title">
              <h2>初始卡组</h2>
              <span>每套10张 · 每回合3专注，抽4张</span>
            </div>
            <div className="rm-starters">
              {selectedJob.starters.map((s) => (
                <button
                  key={s.id}
                  title={s.description}
                  aria-pressed={starter === s.id}
                  className={starter === s.id ? 'is-selected' : ''}
                  onClick={() => {
                    setStarter(s.id);
                    setConfirmNew(false);
                  }}
                >
                  <b>{s.name}</b>
                  <span>{s.description}</span>
                </button>
              ))}
            </div>
            <div className="rm-preview" aria-label="初始卡组预览">
              {[...new Set<CardId>(selectedStarter.cards)].map((id) => (
                <span key={id}>
                  {ROGUE_CARDS[id]?.name} ×
                  {selectedStarter.cards.filter((c) => c === id).length}
                </span>
              ))}
            </div>
            <p className="rm-start-relic">
              起始法器 · <b>{RELICS[selectedJob.starterRelic].name}</b>：
              {RELICS[selectedJob.starterRelic].description}
            </p>
          </section>
          <p className="rm-muted">
            从基础课筑基到结业渡劫。每10关一次考核，本局精力、学分与术式独立保存。
          </p>
          {confirmNew && (
            <p className="rm-error" role="status">
              {!run && loaded.error
                ? '旧记录无法读取。确认后会先备份原记录，再建立新局。'
                : '重新开始会替换当前试炼。校园修行档案不受影响。'}
            </p>
          )}
          <div className="rm-actions">
            <button className="rm-primary" disabled={busy} onClick={newRun}>
              {busy
                ? '正在保存…'
                : confirmNew
                  ? '确认重新开始'
                  : '开始新的试炼 →'}
            </button>
            {confirmNew && (
              <button onClick={() => setConfirmNew(false)}>取消</button>
            )}
          </div>
        </div>
      </main>
    );

  const chapter = getChapter(run.floor);
  const chapterTheme = getRogueChapter(chapter);
  const boss = getBoss(chapter);
  const node = getRogueCurrentKind(run);
  const choosingRoute = Boolean(run.map && run.phase === 'route');
  if (run.phase === 'battle' && run.battle) {
    const ended = !['battle', 'discard'].includes(run.battle.phase);
    const won = run.battle.phase === 'victory';
    const battle = displayBattle!;
    return (
      <CardBattleView
        mode="rogue"
        state={battle}
        title={`第${run.floor}关 · ${chapterTheme.name} · ${battle.enemy.name}`}
        story={`${chapterTheme.place} · ${chapterTheme.goal} 未出的手牌保留，观察试阵行动后作出选择。`}
        error={presentRogueText(error)}
        routeMap={run.map ? <RogueRouteMap run={run} /> : undefined}
        onPause={leave}
        onCommand={(action) => command({ type: 'battle', action })}
        result={
          ended
            ? {
                title: won ? '本场试阵已破' : '本次试炼暂告一段落',
                text: won
                  ? '完成考核，确认后领取试炼学分，再选择领悟术式或实验法器。'
                  : '精力耗尽、撤离或僵局都会结束本次试炼，可回到准备页重新修习。',
                changes: [
                  `精力 ${run.battle.player.entryHp} → ${run.battle.player.hp}`,
                  `完成 ${run.battle.turn} 回合`,
                ],
              }
            : undefined
        }
        onAcknowledge={() => command({ type: 'settle-battle' })}
      />
    );
  }
  const prices = getShopPrices(run);
  const eligible = picker
    ? run.deck.filter((c) =>
        picker.choice === 'upgrade' ? c.level < 2 : run.deck.length > 8
      )
    : [];
  return (
    <main className="rm-app">
      <header className="rm-header">
        <div>
          <p className="rm-eyebrow">
            灵枢试炼 · {chapterTheme.name} · {chapterTheme.place}
          </p>
          <h1>
            第 {run.floor} / 50 关 ·{' '}
            {choosingRoute ? '选择路线' : PHASE_LABELS[run.phase]}
          </h1>
        </div>
        <button disabled={busy} onClick={leave}>
          保存离开
        </button>
      </header>
      <div className="rm-run-strip">
        <span>{JOBS[run.jobId].name}</span>
        <strong>
          精力 {run.hp}/{run.maxHp}
        </strong>
        <strong>试炼学分 {run.gold}</strong>
        <button onClick={() => setInspect('deck')}>
          术式 {run.deck.length}
        </button>
        <button onClick={() => setInspect('relics')}>
          法器 {run.relics.length}
        </button>
        {run.map && !choosingRoute && (
          <button className="rm-route-launch" onClick={() => setInspect('map')}>
            路线图
          </button>
        )}
      </div>
      {!run.map && (
        <ol className="rm-progress" aria-label="本章进度">
          {Array.from({ length: 10 }, (_, i) => {
            const floor = (chapter - 1) * 10 + i + 1;
            return (
              <li
                key={floor}
                data-current={floor === run.floor}
                data-cleared={floor <= run.cleared}
              >
                <b>{floor}</b>
                <span>{NODE_LABELS[getNodeKind(floor)]}</span>
              </li>
            );
          })}
        </ol>
      )}
      <div className={`rm-content${choosingRoute ? ' rm-content--route' : ''}`}>
        {error && (
          <p className="rm-error" role="alert">
            {presentRogueText(error)}
          </p>
        )}
        {run.lastMessage && !error && (
          <p className="rm-feedback" role="status">
            {presentRogueText(run.lastMessage)}
          </p>
        )}
        {choosingRoute && (
          <RogueRouteMap
            run={run}
            busy={busy}
            onChoose={(id) => command({ type: 'choose-node', id })}
          />
        )}
        {run.phase === 'route' &&
          !run.map &&
          panel(
            node === 'boss' ? `章节考核 · ${boss.name}` : '选择下一场试阵',
            node === 'boss'
              ? `${chapterTheme.goal} ${boss.description}`
              : `${chapterTheme.goal} 本章考核：${boss.name}。${boss.description}`,
            <div className="rm-choice-grid">
              {run.rooms.map((room, index) => (
                <button
                  className="rm-choice"
                  key={room.id}
                  disabled={busy}
                  onClick={() => command({ type: 'choose-room', id: room.id })}
                >
                  <small>
                    {node === 'boss' ? 'BOSS' : `遭遇 0${index + 1}`}
                  </small>
                  <strong>{presentRogueText(room.name)}</strong>
                  <span>{presentRogueText(room.description)}</span>
                  <b>
                    精力 {room.enemy.maxHp} · 攻击 {room.enemy.attack}
                  </b>
                  <em>进入战斗 →</em>
                </button>
              ))}
            </div>
          )}
        {run.phase === 'reward' &&
          run.reward &&
          panel(
            run.reward.stage === 'card' ? '选择领悟的术式' : '选择实验法器',
            `考核报酬 +${run.reward.gold} 试炼学分已到账。可跳过，保持术式精简。`,
            <>
              <div className="rm-choice-grid">
                {run.reward.stage === 'card'
                  ? run.reward.cards.map((id) => {
                      const template = ROGUE_CARDS[id]!;
                      const card = resolveRogueCard(run, {
                        id: 'preview',
                        cardId: id,
                        level: 0,
                      });
                      return (
                        <button
                          className="rm-choice"
                          key={id}
                          disabled={busy || run.deck.length >= 30}
                          onClick={() =>
                            command({ type: 'choose-card', cardId: id })
                          }
                        >
                          <small>
                            {template.rarity === 'rare'
                              ? '稀有'
                              : template.rarity === 'uncommon'
                                ? '进阶'
                                : '常见'}{' '}
                            · {card.cost}专注
                          </small>
                          <strong>{card.name}</strong>
                          <span>{card.description}</span>
                          <small className="rm-origin">{template.origin}</small>
                          <em>
                            {run.deck.length >= 30
                              ? '术式已达30张上限'
                              : '领悟并加入 →'}
                          </em>
                        </button>
                      );
                    })
                  : run.reward.relics.map((id) => (
                      <button
                        className="rm-choice"
                        key={id}
                        disabled={busy}
                        onClick={() =>
                          command({ type: 'choose-relic', relicId: id })
                        }
                      >
                        <small>实验法器 · 持续生效</small>
                        <strong>{RELICS[id].name}</strong>
                        <span>{RELICS[id].description}</span>
                        <small className="rm-origin">{RELICS[id].origin}</small>
                        <em>携带法器 →</em>
                      </button>
                    ))}
              </div>
              <div className="rm-actions">
                <button
                  disabled={busy}
                  onClick={() =>
                    command(
                      run.reward!.stage === 'card'
                        ? { type: 'choose-card', cardId: null }
                        : { type: 'choose-relic', relicId: null }
                    )
                  }
                >
                  跳过本次选择 →
                </button>
              </div>
            </>
          )}
        {run.phase === 'camp' &&
          panel(
            '研习室 · 调息与参悟',
            '回到研习室，调息、参悟或整理术式，选一项后继续试炼。',
            <div className="rm-choice-grid">
              <button
                className="rm-choice"
                disabled={busy}
                onClick={() => command({ type: 'camp', choice: 'heal' })}
              >
                <strong>静坐调息</strong>
                <span>
                  恢复{' '}
                  {Math.min(run.maxHp - run.hp, Math.ceil(run.maxHp * 0.3))}{' '}
                  精力（30%上限）。
                </span>
                <em>恢复并继续 →</em>
              </button>
              <button
                className="rm-choice"
                disabled={busy || !run.deck.some((c) => c.level < 2)}
                onClick={() => setPicker({ type: 'camp', choice: 'upgrade' })}
              >
                <strong>参悟一式</strong>
                <span>复盘课程笔记，增强原有效果，最多参悟两次。</span>
                <em>选择卡牌 →</em>
              </button>
              <button
                className="rm-choice"
                disabled={busy || run.deck.length <= 8}
                onClick={() => setPicker({ type: 'camp', choice: 'remove' })}
              >
                <strong>整理术式</strong>
                <span>删去一式冗余笔记，至少保留8张。</span>
                <em>选择卡牌 →</em>
              </button>
            </div>
          )}
        {run.phase === 'shop' &&
          panel(
            '学园工坊 · 炼器与修习',
            '用考核所得试炼学分，换取一项工坊服务或保留学分离开。',
            <>
              <div className="rm-choice-grid">
                <button
                  className="rm-choice"
                  disabled={
                    busy || run.gold < prices.heal || run.hp === run.maxHp
                  }
                  onClick={() => command({ type: 'shop', choice: 'heal' })}
                >
                  <strong>提神灵饮</strong>
                  <span>
                    恢复{' '}
                    {Math.min(run.maxHp - run.hp, Math.ceil(run.maxHp * 0.3))}{' '}
                    精力。
                  </span>
                  <b>{prices.heal} 试炼学分</b>
                </button>
                <button
                  className="rm-choice"
                  disabled={
                    busy ||
                    run.gold < prices.upgrade ||
                    !run.deck.some((c) => c.level < 2)
                  }
                  onClick={() => setPicker({ type: 'shop', choice: 'upgrade' })}
                >
                  <strong>术式调校</strong>
                  <span>借助仿真台，升级一张未满级的术式。</span>
                  <b>{prices.upgrade} 试炼学分</b>
                </button>
                <button
                  className="rm-choice"
                  disabled={busy || !run.shopRelic || run.gold < prices.relic}
                  onClick={() => command({ type: 'shop', choice: 'relic' })}
                >
                  <strong>
                    {run.shopRelic ? RELICS[run.shopRelic].name : '法器已领完'}
                  </strong>
                  <span>
                    {run.shopRelic
                      ? RELICS[run.shopRelic].description
                      : '可选择其他服务。'}
                  </span>
                  {run.shopRelic && (
                    <small className="rm-origin">
                      {RELICS[run.shopRelic].origin}
                    </small>
                  )}
                  <b>{prices.relic} 试炼学分</b>
                </button>
              </div>
              <div className="rm-actions">
                <button
                  disabled={busy}
                  onClick={() => command({ type: 'shop', choice: 'leave' })}
                >
                  保留学分，离开工坊 →
                </button>
              </div>
            </>
          )}
        {run.phase === 'event' &&
          panel(
            '助研机缘 · 实验室来信',
            '同门邀你参与实验，也可领取基础补贴或到资料室整理术式。',
            <div className="rm-choice-grid">
              <button
                className="rm-choice"
                disabled={busy}
                onClick={() => command({ type: 'event', choice: 'supplies' })}
              >
                <strong>领取助研补贴</strong>
                <span>领取 {20 + (chapter - 1) * 5} 试炼学分，继续修习。</span>
                <em>领取补贴 →</em>
              </button>
              <button
                className="rm-choice"
                disabled={busy || run.hp <= 8}
                onClick={() => command({ type: 'event', choice: 'risk' })}
              >
                <strong>参与高负荷实验</strong>
                <span>
                  消耗8精力，获得 {45 + (chapter - 1) * 10} 试炼学分。
                </span>
                <em>协助实验 →</em>
              </button>
              <button
                className="rm-choice"
                disabled={busy || run.gold < 15 || run.deck.length <= 8}
                onClick={() => setPicker({ type: 'event', choice: 'remove' })}
              >
                <strong>资料室梳理术式</strong>
                <span>支付15试炼学分，移除一张术式。</span>
                <em>选择卡牌 →</em>
              </button>
            </div>
          )}
        {(run.phase === 'defeat' || run.phase === 'complete') &&
          panel(
            run.phase === 'complete'
              ? '五十重试炼，结业渡劫'
              : '带着所学，再入试境',
            `本局完成 ${run.cleared} 个节点，携带 ${run.relics.length} 件法器，领悟 ${run.deck.length} 张术式。`,
            <>
              <div className="rm-records">
                {run.history
                  .filter((h) => h.kind === 'boss')
                  .map((h) => (
                    <span key={h.floor}>
                      第{h.floor}关 · {getBoss(getChapter(h.floor)).name}
                    </span>
                  ))}
              </div>
              <div className="rm-actions">
                <button
                  className="rm-primary"
                  onClick={() => {
                    setView('setup');
                    setConfirmNew(false);
                  }}
                >
                  选择职业，再开一局
                </button>
                <button onClick={leave}>返回模式选择</button>
              </div>
            </>
          )}
      </div>
      {(picker || inspect) && (
        <section
          className="rm-notebook"
          ref={notebook}
          role="dialog"
          aria-modal="true"
          aria-label={
            picker
              ? '选择要调整的术式'
              : inspect === 'map'
                ? '本章路线图'
                : '试炼修习录'
          }
        >
          <header>
            <h2>
              {picker
                ? picker.choice === 'upgrade'
                  ? '选择参悟术式'
                  : '选择移除术式'
                : inspect === 'deck'
                  ? '本局术式牌组'
                  : inspect === 'map'
                    ? node
                      ? `当前节点 · ${getRogueNodeLabel(node)}`
                      : '本章路线'
                    : '本局法器'}
            </h2>
            <button
              onClick={() => {
                setPicker(null);
                setInspect(null);
              }}
            >
              返回 ×
            </button>
          </header>
          <div
            className={`rm-notebook-body${inspect === 'map' ? ' rm-notebook-body--route' : ''}`}
          >
            {inspect === 'map' ? (
              <RogueRouteMap run={run} />
            ) : inspect === 'relics' ? (
              run.relics.map((id) => (
                <article key={id}>
                  <div>
                    <strong>{RELICS[id].name}</strong>
                    <p>{RELICS[id].description}</p>
                    <small className="rm-origin">{RELICS[id].origin}</small>
                  </div>
                </article>
              ))
            ) : (
              (picker ? eligible : run.deck).map((card) => {
                const resolved = resolveRogueCard(run, card);
                return (
                  <article key={card.id}>
                    <div>
                      <strong>
                        {cardName(card)} · {resolved.cost}专注
                      </strong>
                      <p>{resolved.description}</p>
                      <small className="rm-origin">
                        {ROGUE_CARDS[card.cardId]?.origin}
                      </small>
                      {picker?.choice === 'upgrade' && (
                        <p className="rm-upgrade-preview">
                          升级后：
                          {
                            resolveRogueCard(run, {
                              ...card,
                              level: Math.min(2, card.level + 1) as 1 | 2,
                            }).description
                          }
                        </p>
                      )}
                    </div>
                    {picker && (
                      <button
                        disabled={busy}
                        onClick={() => command({ ...picker, cardId: card.id })}
                      >
                        {picker.choice === 'upgrade'
                          ? '升级这一张'
                          : '移除这一张'}
                      </button>
                    )}
                  </article>
                );
              })
            )}
          </div>
        </section>
      )}
    </main>
  );
}
