import { CARDS, ENEMIES, STARTER_DECK } from './catalog';
import { assertTrialBuild } from './loadout';
import { getCardScaling, getTrialEnemy, getTrialMaxHp } from './progression';
import {
  applyCardEffects,
  applyCardEnemyHit,
  discardSelected,
  drawCards,
  isExactDiscard,
  previewCardEffects,
  shuffleCards,
} from '../../features/card-battle/shared';
import type {
  CardId,
  CardInstance,
  TrialBuild,
  TrialCommand,
  TrialIntent,
  TrialState,
} from './types';

export const MAX_TURNS = 18;
export const INITIAL_HP = 45;
export const HAND_LIMIT = 10;
export const DRAW_PER_TURN = 4;
const REWARD_POOL: CardId[] = (Object.keys(CARDS) as CardId[]).filter(
  (id) => id !== 'strike' && id !== 'guard' && !CARDS[id].source
);
const PHASES = [
  'battle',
  'discard',
  'reward',
  'complete',
  'defeat',
  'retreated',
  'stalemate',
];

function cloneBuild(build: TrialBuild): TrialBuild {
  return {
    profile: {
      ...build.profile,
      courseIds: [...build.profile.courseIds],
      equipment: build.profile.equipment.map((item) => ({ ...item })),
    },
    library: build.library.map((entry) => ({ ...entry })),
    resume: [...build.resume],
  };
}

function initialDeck(build?: TrialBuild): Omit<CardInstance, 'id'>[] {
  if (!build) return STARTER_DECK.map((cardId) => ({ cardId }));
  return build.resume.map((sourceId) => {
    const entry = build.library.find((item) => item.id === sourceId)!;
    return { cardId: entry.cardId, sourceId: entry.id, label: entry.label };
  });
}

function shuffle<T>(state: TrialState, values: readonly T[]): T[] {
  return shuffleCards(state, values);
}

function draw(state: TrialState, count: number): number {
  return drawCards(state, state.battle, count);
}

function log(
  state: TrialState,
  kind: TrialState['log'][number]['kind'],
  text: string
): void {
  state.log.push({
    seq: state.commandSeq,
    stage: state.stage,
    turn: state.battle.turn,
    kind,
    text,
  });
}

function startBattle(state: TrialState): void {
  const enemy = getTrialEnemy(state);
  state.phase = 'battle';
  state.player.energy = 3;
  state.player.block = 0;
  state.player.nextAttackBonus = 0;
  state.player.attacksPlayed = 0;
  state.rewards = [];
  state.battle = {
    turn: 1,
    hpBefore: state.player.hp,
    enemyHp: enemy.maxHp,
    enemyBlock: enemy.grade?.defense ?? 0,
    drawPile: shuffle(
      state,
      state.deck.map((card) => card.id)
    ),
    hand: [],
    discardPile: [],
    exhaustPile: [],
  };
  const drawn = draw(state, DRAW_PER_TURN);
  log(
    state,
    'system',
    `第 ${state.stage + 1} 场：${enemy.name}。专注 3，抽取 ${drawn} 张牌。`
  );
}

export function createTrial({
  seed,
  runId,
  build,
}: {
  seed: number;
  runId?: string;
  build?: TrialBuild;
}): TrialState {
  if (!Number.isSafeInteger(seed)) throw new Error('试炼种子必须是安全整数');
  if (build !== undefined) assertTrialBuild(build);
  const word = seed >>> 0 || 0x9e3779b9;
  const identity = runId ?? `trial-${word.toString(16)}`;
  if (typeof identity !== 'string' || !identity.trim() || identity.length > 128)
    throw new Error('试炼标识无效');
  const maxHp = getTrialMaxHp(build?.profile);
  const state: TrialState = {
    version: 1,
    runId: identity,
    seed: word,
    rngState: word,
    commandSeq: 0,
    phase: 'battle',
    stage: 0,
    ...(build ? { build: cloneBuild(build) } : {}),
    player: {
      hp: maxHp,
      maxHp,
      energy: 3,
      block: 0,
      nextAttackBonus: 0,
      attacksPlayed: 0,
    },
    battle: {
      turn: 1,
      hpBefore: maxHp,
      enemyHp: 30,
      enemyBlock: 0,
      drawPile: [],
      hand: [],
      discardPile: [],
      exhaustPile: [],
    },
    deck: initialDeck(build).map((card, index) => ({
      ...card,
      id: `${identity}:card:${index}`,
    })),
    rewards: [],
    chosenCards: [],
    summaries: [],
    log: [],
  };
  startBattle(state);
  return state;
}

export function getEnemyIntent(state: TrialState): TrialIntent {
  const pattern = getTrialEnemy(state).pattern;
  return { ...pattern[(state.battle.turn - 1) % pattern.length] };
}

export function getCardLabel(
  state: TrialState,
  cardInstanceId: string
): string {
  const card = state.deck.find((entry) => entry.id === cardInstanceId);
  return card?.label ?? (card ? CARDS[card.cardId].name : '未知卡牌');
}

export function getPlayableReason(
  state: TrialState,
  cardInstanceId: string
): string | null {
  if (state.phase === 'discard') return '请先完成弃牌或返回出牌';
  if (state.phase !== 'battle') return '本场已经结束';
  if (!state.battle.hand.includes(cardInstanceId)) return '这张牌不在手中';
  const card = state.deck.find((entry) => entry.id === cardInstanceId);
  if (!card || !CARDS[card.cardId]) return '找不到这张牌';
  if (CARDS[card.cardId].cost > state.player.energy) return '专注不足';
  return null;
}

export function getCardPreview(
  state: TrialState,
  cardInstanceId: string
): { damage: number; block: number; heal: number; draw: number } {
  const instance = state.deck.find((card) => card.id === cardInstanceId);
  if (!instance) return { damage: 0, block: 0, heal: 0, draw: 0 };
  const card = CARDS[instance.cardId];
  const scaling = getCardScaling(card, state.build?.profile);
  const damage =
    (card.damage ?? 0) + (scaling.effect === 'damage' ? scaling.bonus : 0);
  const block =
    (card.block ?? 0) + (scaling.effect === 'block' ? scaling.bonus : 0);
  const heal =
    (card.heal ?? 0) + (scaling.effect === 'heal' ? scaling.bonus : 0);
  return previewCardEffects({ ...card, damage, block, heal }, state.player);
}

function finishVictory(state: TrialState): void {
  state.summaries.push({
    stage: state.stage,
    turns: state.battle.turn,
    hpBefore: state.battle.hpBefore,
    hpAfter: state.player.hp,
  });
  state.phase = state.stage === ENEMIES.length - 1 ? 'complete' : 'reward';
  state.rewards =
    state.phase === 'reward' ? shuffle(state, REWARD_POOL).slice(0, 3) : [];
  log(
    state,
    'system',
    state.phase === 'complete'
      ? '三场试炼完成！本次牌组与战绩仅保留在独立试作中。'
      : '本场获胜。选择一张牌或跳过；进入下一场时恢复 6 点精力。'
  );
}

/** 结束操作已完成必要弃牌后，才执行一次已公布的敌人意图。 */
function finishTurn(state: TrialState): void {
  state.phase = 'battle';
  const intent = getEnemyIntent(state);
  const { prevented: absorbed, damage } = applyCardEnemyHit(
    state.player,
    intent.damage
  );
  state.battle.enemyBlock = intent.block;
  log(
    state,
    'enemy',
    `对手「${intent.name}」：防护抵消 ${absorbed}，精力 -${damage}${intent.block ? `，对手获得 ${intent.block} 防护` : ''}。本轮防护清空。`
  );
  if (state.player.hp === 0) {
    state.phase = 'defeat';
    log(state, 'system', '精力耗尽，本次试炼结束。');
  } else if (state.battle.turn === MAX_TURNS) {
    state.phase = 'stalemate';
    log(state, 'system', '已完成 18 回合，本场以僵局结束。');
  } else {
    state.battle.turn++;
    state.player.energy = 3;
    state.player.attacksPlayed = 0;
    const drawn = draw(state, DRAW_PER_TURN);
    log(
      state,
      'system',
      `第 ${state.battle.turn} 回合：保留未出手牌，恢复 3 点专注，抽取 ${drawn} 张牌。`
    );
  }
}

/** 纯状态转移。无效指令原对象返回，既不消耗序号也不推进随机数。 */
export function reduceTrial(
  state: TrialState,
  command: TrialCommand
): TrialState {
  if (
    !command ||
    command.runId !== state.runId ||
    !Number.isSafeInteger(command.seq) ||
    command.seq !== state.commandSeq + 1
  )
    return state;
  if (command.type === 'play') {
    if (getPlayableReason(state, command.cardInstanceId) !== null) return state;
  } else if (command.type === 'end-turn') {
    if (state.phase !== 'battle') return state;
  } else if (command.type === 'retreat') {
    if (state.phase !== 'battle' && state.phase !== 'discard') return state;
  } else if (command.type === 'cancel-discard') {
    if (state.phase !== 'discard') return state;
  } else if (command.type === 'confirm-discard') {
    if (
      state.phase !== 'discard' ||
      !isExactDiscard(state.battle.hand, command.cardInstanceIds)
    )
      return state;
  } else if (command.type === 'choose-reward') {
    if (
      state.phase !== 'reward' ||
      (command.cardId !== null && !state.rewards.includes(command.cardId))
    )
      return state;
  } else return state;

  const next: TrialState = {
    ...state,
    ...(state.build ? { build: cloneBuild(state.build) } : {}),
    commandSeq: command.seq,
    player: { ...state.player },
    battle: {
      ...state.battle,
      drawPile: [...state.battle.drawPile],
      hand: [...state.battle.hand],
      discardPile: [...state.battle.discardPile],
      exhaustPile: [...state.battle.exhaustPile],
    },
    deck: state.deck.map((card) => ({ ...card })),
    rewards: [...state.rewards],
    chosenCards: [...state.chosenCards],
    summaries: state.summaries.map((summary) => ({ ...summary })),
    log: state.log.map((entry) => ({ ...entry })),
  };
  if (command.type === 'retreat') {
    next.phase = 'retreated';
    log(next, 'system', '已退场。本次试炼结束，不影响主游戏。');
  } else if (command.type === 'cancel-discard') {
    next.phase = 'battle';
    log(next, 'system', '取消结束回合，返回出牌；敌人尚未行动。');
  } else if (command.type === 'confirm-discard') {
    // 选择视为集合，以原手牌顺序入弃牌堆；点击先后不改变后续洗牌顺序。
    const discarded = discardSelected(next.battle, command.cardInstanceIds);
    log(
      next,
      'system',
      `弃置 ${discarded.length} 张手牌：${discarded.map((id) => `「${getCardLabel(next, id)}」`).join('、')}。保留 ${HAND_LIMIT} 张后结束回合。`
    );
    finishTurn(next);
  } else if (command.type === 'choose-reward') {
    if (command.cardId !== null) {
      next.deck.push({
        id: `${next.runId}:card:${next.deck.length}`,
        cardId: command.cardId,
      });
      next.chosenCards.push(command.cardId);
      log(
        next,
        'reward',
        `选择「${CARDS[command.cardId].name}」，加入本次牌组。`
      );
    } else log(next, 'reward', '跳过加牌，保持当前牌组。');
    const healed = Math.min(6, next.player.maxHp - next.player.hp);
    next.player.hp += healed;
    log(
      next,
      'reward',
      `场间休整恢复 ${healed} 点精力（上限 ${next.player.maxHp}）。`
    );
    next.stage++;
    startBattle(next);
  } else if (command.type === 'play') {
    const instance = next.deck.find(
      (card) => card.id === command.cardInstanceId
    )!;
    const card = CARDS[instance.cardId];
    const scaling = getCardScaling(card, next.build?.profile);
    const resolved = {
      ...card,
      damage:
        (card.damage ?? 0) + (scaling.effect === 'damage' ? scaling.bonus : 0),
      block:
        (card.block ?? 0) + (scaling.effect === 'block' ? scaling.bonus : 0),
      heal: (card.heal ?? 0) + (scaling.effect === 'heal' ? scaling.bonus : 0),
    };
    const preview = getCardPreview(next, command.cardInstanceId);
    const runtime = {
      ...next.battle,
      rngState: next.rngState,
      player: next.player,
      enemyGuardRounds: 0,
    };
    const { cleared, absorbed, damage, drawn } = applyCardEffects(
      runtime,
      resolved,
      instance.id,
      next.player.maxHp
    );
    next.rngState = runtime.rngState;
    next.battle.enemyHp = runtime.enemyHp;
    next.battle.enemyBlock = runtime.enemyBlock;
    next.battle.drawPile = runtime.drawPile;
    next.battle.hand = runtime.hand;
    next.battle.discardPile = runtime.discardPile;
    next.battle.exhaustPile = runtime.exhaustPile;
    const effects = [
      cleared ? `清除防护 ${cleared}` : '',
      preview.damage
        ? `造成 ${damage} 点损耗${absorbed ? `（对手防护吸收 ${absorbed}）` : ''}`
        : '',
      preview.block ? `获得 ${preview.block} 防护` : '',
      card.heal ? `恢复 ${preview.heal} 精力` : '',
      card.draw ? `抽 ${drawn} 张牌` : '',
      card.nextAttackBonus ? `下次进攻 +${card.nextAttackBonus}` : '',
      card.exhaust ? '本场暂存' : '',
    ]
      .filter(Boolean)
      .join('；');
    log(
      next,
      'card',
      `「${getCardLabel(next, instance.id)}」消耗 ${card.cost} 专注：${effects}。`
    );
    if (next.battle.enemyHp === 0) finishVictory(next);
  } else if (command.type === 'end-turn') {
    if (next.battle.hand.length > HAND_LIMIT) {
      next.phase = 'discard';
      log(
        next,
        'system',
        `当前有 ${next.battle.hand.length} 张手牌。请先选择弃置 ${next.battle.hand.length - HAND_LIMIT} 张，再结算敌人行动。`
      );
    } else finishTurn(next);
  }
  return next;
}

function requireState(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`试炼存档无效：${message}`);
}
function integer(value: unknown, min: number, max: number): value is number {
  return (
    Number.isSafeInteger(value) && Number(value) >= min && Number(value) <= max
  );
}

/** 存档边界校验；旧无build记录继续有效，新增字段必须能从冻结来源重推。 */
export function assertTrialState(value: unknown): asserts value is TrialState {
  requireState(
    value && typeof value === 'object' && !Array.isArray(value),
    '不是对象'
  );
  const state = value as TrialState;
  requireState(state.version === 1, '不支持的版本');
  requireState(
    typeof state.runId === 'string' &&
      state.runId.trim() &&
      state.runId.length <= 128,
    '标识'
  );
  requireState(
    integer(state.seed, 1, 0xffffffff) &&
      integer(state.rngState, 1, 0xffffffff),
    '随机数状态'
  );
  requireState(integer(state.commandSeq, 0, 10000), '指令序号');
  requireState(
    PHASES.includes(state.phase) && integer(state.stage, 0, 2),
    '阶段'
  );
  if (state.build !== undefined) {
    try {
      assertTrialBuild(state.build);
    } catch {
      requireState(false, '角色或简历快照');
    }
  }
  const maxHp = getTrialMaxHp(state.build?.profile);
  const enemy = getTrialEnemy(state);
  const player = state.player;
  requireState(
    player && player.maxHp === maxHp && integer(player.hp, 0, maxHp),
    '精力'
  );
  requireState(
    integer(player.energy, 0, 3) && integer(player.block, 0, 10000),
    '专注或防护'
  );
  requireState(
    integer(player.nextAttackBonus, 0, 10000) &&
      integer(player.attacksPlayed, 0, 3),
    '回合效果'
  );
  const battle = state.battle;
  requireState(
    battle &&
      integer(battle.turn, 1, MAX_TURNS) &&
      integer(battle.hpBefore, 1, maxHp),
    '回合'
  );
  const maxEnemyBlock = Math.max(
    10,
    enemy.grade?.defense ?? 0,
    ...enemy.pattern.map((intent) => intent.block)
  );
  requireState(
    integer(battle.enemyHp, 0, enemy.maxHp) &&
      integer(battle.enemyBlock, 0, maxEnemyBlock),
    '敌人状态'
  );
  requireState(
    Array.isArray(state.chosenCards) &&
      state.chosenCards.length <= 2 &&
      state.chosenCards.every((id) => REWARD_POOL.includes(id)),
    '所选卡牌'
  );
  const expectedCards = [
    ...initialDeck(state.build),
    ...state.chosenCards.map((cardId) => ({
      cardId,
      sourceId: undefined,
      label: undefined,
    })),
  ];
  requireState(
    Array.isArray(state.deck) && state.deck.length === expectedCards.length,
    '牌组数量'
  );
  requireState(
    state.deck.every(
      (card, index) =>
        card &&
        card.id === `${state.runId}:card:${index}` &&
        card.cardId === expectedCards[index].cardId &&
        card.sourceId === expectedCards[index].sourceId &&
        card.label === expectedCards[index].label
    ),
    '牌组实例'
  );
  const zones = [
    battle.drawPile,
    battle.hand,
    battle.discardPile,
    battle.exhaustPile,
  ];
  requireState(zones.every(Array.isArray), '牌区');
  const allCards = zones.flat();
  const deckIds = new Set(state.deck.map((card) => card.id));
  requireState(
    allCards.length === state.deck.length &&
      new Set(allCards).size === allCards.length &&
      allCards.every((id) => deckIds.has(id)),
    '牌区重复或丢牌'
  );
  requireState(
    battle.exhaustPile.every(
      (id) => CARDS[state.deck.find((card) => card.id === id)!.cardId].exhaust
    ),
    '暂存区包含非暂存牌'
  );
  requireState(
    Array.isArray(state.rewards) &&
      new Set(state.rewards).size === state.rewards.length &&
      state.rewards.every((id) => REWARD_POOL.includes(id)),
    '候选卡牌'
  );
  requireState(Array.isArray(state.summaries), '战绩');
  const wins =
    state.stage +
    (state.phase === 'reward' || state.phase === 'complete' ? 1 : 0);
  requireState(
    state.summaries.length === wins &&
      state.summaries.every(
        (summary, index) =>
          summary &&
          summary.stage === index &&
          integer(summary.turns, 1, MAX_TURNS) &&
          integer(summary.hpBefore, 1, maxHp) &&
          integer(summary.hpAfter, 1, maxHp)
      ),
    '重复或缺失战绩'
  );
  requireState(state.chosenCards.length <= state.stage, '提前领取奖励');
  if (state.phase === 'reward')
    requireState(
      state.stage < 2 &&
        battle.enemyHp === 0 &&
        player.hp > 0 &&
        state.rewards.length === 3,
      '选牌阶段'
    );
  else requireState(state.rewards.length === 0, '非选牌阶段有候选');
  if (state.phase === 'complete')
    requireState(
      state.stage === 2 && battle.enemyHp === 0 && player.hp > 0,
      '通关阶段'
    );
  if (state.phase === 'defeat')
    requireState(player.hp === 0 && battle.enemyHp > 0, '失败阶段');
  if (['battle', 'discard', 'retreated', 'stalemate'].includes(state.phase))
    requireState(player.hp > 0 && battle.enemyHp > 0, '未结束的战场');
  if (state.phase === 'discard')
    requireState(battle.hand.length > HAND_LIMIT, '弃牌阶段手牌未超限');
  if (state.phase === 'stalemate')
    requireState(battle.turn === MAX_TURNS, '僵局回合');
  if (state.phase !== 'defeat')
    requireState(player.hp > 0, '非失败阶段精力耗尽');
  if (state.summaries.length > state.stage)
    requireState(
      state.summaries[state.stage].hpBefore === battle.hpBefore &&
        state.summaries[state.stage].hpAfter === player.hp &&
        state.summaries[state.stage].turns === battle.turn,
      '当前战绩与战场不符'
    );
  requireState(
    Array.isArray(state.log) &&
      state.log.length > 0 &&
      state.log.length <= 2000,
    '日志'
  );
  let previousSeq = -1;
  let previousStage = -1;
  for (const entry of state.log) {
    requireState(
      entry &&
        integer(entry.seq, 0, state.commandSeq) &&
        entry.seq >= previousSeq &&
        integer(entry.stage, 0, state.stage) &&
        entry.stage >= previousStage &&
        integer(entry.turn, 1, MAX_TURNS),
      '日志顺序'
    );
    requireState(
      ['card', 'enemy', 'system', 'reward'].includes(entry.kind) &&
        typeof entry.text === 'string' &&
        entry.text.length > 0 &&
        entry.text.length <= 1000,
      '日志条目'
    );
    previousSeq = entry.seq;
    previousStage = entry.stage;
  }
  requireState(
    state.log[state.log.length - 1].seq === state.commandSeq,
    '日志与指令不一致'
  );
}
