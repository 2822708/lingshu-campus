import {
  applyCardEffects,
  CARD_DRAW_PER_TURN,
  CARD_FOCUS_PER_TURN,
  CARD_HAND_LIMIT,
  CARD_MAX_VALUE,
  discardSelected,
  drawCards,
  isExactDiscard,
  nextCardRandom,
  previewCardEffects,
  shuffleCards,
} from './shared';
import { CARDS } from './catalog';
import { ENEMY_ARCHETYPES } from './enemies';
import type {
  CardBattleCommand,
  CardBattleFighter,
  CardBattleIntent,
  CardBattleIncomingPreview,
  CardBattleLogEntry,
  CardBattlePreview,
  CardBattleState,
  CreateCardBattleOptions,
  ResolvedBattleCard,
  ResolvedBattleEquipment,
  CardEnemyMove,
} from './types';

export const MAX_TURNS = 12;
export const HAND_LIMIT = CARD_HAND_LIMIT;
export const DRAW_PER_TURN = CARD_DRAW_PER_TURN;
export const FOCUS_PER_TURN = CARD_FOCUS_PER_TURN;
const MAX_COMMANDS = 100000;
const PHASES = [
  'battle',
  'discard',
  'victory',
  'defeat',
  'retreat',
  'stalemate',
];
const BEHAVIORS = ['balanced', 'aggressive', 'defensive'];
const INTENTS = ['strong', 'guard', 'adjust'];
const EQUIPMENT_EFFECTS = [
  'opening-block',
  'opening-draw',
  'first-attack',
  'first-defense',
  'guard-counter',
  'retain-block',
];
const LABELS = { strong: '强攻', guard: '固守', adjust: '调整' } as const;
const DESCRIPTIONS = {
  strong: '对手准备强攻，下一轮必定调整。可先用防护抵消来袭。',
  guard: '对手固守两轮并弱攻。直击要点可先清除固守。',
  adjust: '对手正在调整，本轮来袭较弱。',
} as const;

function integer(
  value: unknown,
  min = 0,
  max = CARD_MAX_VALUE
): value is number {
  return (
    Number.isSafeInteger(value) && Number(value) >= min && Number(value) <= max
  );
}
function requireState(value: unknown, message: string): asserts value {
  if (!value) throw new Error(`卡牌战斗存档无效：${message}`);
}
function text(value: unknown, max = 256): value is string {
  return (
    typeof value === 'string' && value.trim().length > 0 && value.length <= max
  );
}
function fighter(value: CardBattleFighter): boolean {
  return Boolean(
    value &&
    integer(value.maxHp, 1) &&
    integer(value.hp, 0, value.maxHp) &&
    integer(value.attack) &&
    integer(value.defense) &&
    integer(value.speed)
  );
}
function snapshotFighter(value: CardBattleFighter): CardBattleFighter {
  return {
    hp: value.hp,
    maxHp: value.maxHp,
    attack: value.attack,
    defense: value.defense,
    speed: value.speed,
  };
}
function intentSeed(seed: number): number {
  // 对连续种子也充分混合，敌意流独立于洗牌消耗。
  let word = (seed ^ 0xa5a5a5a5) >>> 0;
  word = Math.imul(word ^ (word >>> 16), 0x21f0aaad);
  word = Math.imul(word ^ (word >>> 15), 0x735a2d97);
  return (word ^ (word >>> 15)) >>> 0 || 0x9e3779b9;
}
function bounded(value: number): number {
  return Math.min(CARD_MAX_VALUE, Math.max(0, Math.round(value)));
}
function equipmentAmount(
  state: CardBattleState,
  effect: ResolvedBattleEquipment['effect']
): number {
  return (state.equipment ?? [])
    .filter((item) => item.effect === effect)
    .reduce((sum, item) => Math.min(CARD_MAX_VALUE, sum + item.amount), 0);
}
function assertEquipment(equipment: unknown): void {
  if (equipment === undefined) return;
  requireState(Array.isArray(equipment) && equipment.length <= 12, '装备效果');
  const ids = new Set<string>();
  const sources = new Set<string>();
  for (const item of equipment as ResolvedBattleEquipment[]) {
    requireState(
      item &&
        text(item.id) &&
        text(item.sourceId) &&
        !ids.has(item.id) &&
        !sources.has(item.sourceId) &&
        text(item.name, 128) &&
        text(item.description, 1000) &&
        EQUIPMENT_EFFECTS.includes(item.effect) &&
        integer(item.amount, 1) &&
        (item.effect !== 'opening-draw' || item.amount <= 4),
      '装备来源或效果'
    );
    ids.add(item.id);
    sources.add(item.sourceId);
  }
}
function assertPattern(pattern: unknown): asserts pattern is CardEnemyMove[] {
  requireState(
    Array.isArray(pattern) && pattern.length >= 2 && pattern.length <= 8,
    '敌人行动循环'
  );
  for (const move of pattern as CardEnemyMove[]) {
    requireState(
      move &&
        INTENTS.includes(move.type) &&
        text(move.name, 128) &&
        text(move.description, 1000) &&
        Number.isFinite(move.damageMultiplier) &&
        move.damageMultiplier >= 0 &&
        move.damageMultiplier <= 3,
      '敌人行动定义'
    );
    for (const field of [
      'piercePercent',
      'healPercent',
      'thornsPercent',
    ] as const)
      requireState(
        move[field] === undefined || integer(move[field], 0, 100),
        '敌人行动比例'
      );
  }
}
function assertCards(cards: ResolvedBattleCard[]): void {
  requireState(
    Array.isArray(cards) && cards.length > 0 && cards.length <= 100,
    '牌组数量'
  );
  const ids = new Set<string>();
  for (const card of cards) {
    requireState(
      card && text(card.id) && !ids.has(card.id),
      '卡牌实例重复或缺失'
    );
    ids.add(card.id);
    // 已结算的数值随现场冻结；只检查结构，不用当前模板重算旧存档。
    requireState(
      Object.hasOwn(CARDS, card.templateId) &&
        text(card.name, 128) &&
        ['attack', 'defense', 'utility'].includes(card.kind) &&
        integer(card.cost, 0, 3) &&
        typeof card.description === 'string' &&
        card.description.length <= 2000,
      '卡牌定义'
    );
    for (const field of [
      'damage',
      'block',
      'heal',
      'nextAttackBonus',
      'bonusAfterAttack',
      'counter',
      'retainBlock',
      'blockDamageCap',
    ] as const)
      requireState(
        card[field] === undefined || integer(card[field]),
        `卡牌${field}`
      );
    requireState(
      card.draw === undefined || integer(card.draw, 0, 100),
      '抽牌数'
    );
    for (const field of ['clearEnemyBlock', 'exhaust', 'expose'] as const)
      requireState(
        card[field] === undefined || typeof card[field] === 'boolean',
        '卡牌标记'
      );
    requireState(
      card.blockToDamage === undefined ||
        (integer(card.blockToDamage, 0, 100) &&
          integer(card.blockDamageCap, 1)),
      '防护转进攻'
    );
    requireState(
      card.focusGain === undefined ||
        integer(card.focusGain, 0, FOCUS_PER_TURN),
      '恢复专注'
    );
    requireState(
      !card.focusGain || card.exhaust === true,
      '恢复专注必须本场暂存'
    );
    requireState(
      card.source === undefined ||
        ['basic', 'course', 'equipment'].includes(card.source),
      '卡牌来源'
    );
    for (const field of ['sourceId', 'sourceLabel', 'scalingLabel'] as const)
      requireState(
        card[field] === undefined || text(card[field], 512),
        '卡牌来源说明'
      );
  }
}
function appendLog(
  state: CardBattleState,
  kind: CardBattleLogEntry['kind'],
  message: string,
  fields: Partial<CardBattleLogEntry> = {}
): void {
  state.log.push({
    seq: state.commandSeq,
    turn: state.turn,
    kind,
    text: message,
    ...fields,
    playerHpAfter: state.player.hp,
    enemyHpAfter: state.enemy.hp,
  });
  if (state.log.length > 2000) state.log = state.log.slice(-2000);
}
function randomIntent(
  state: CardBattleState,
  previous?: CardBattleIntent['type']
): CardBattleIntent {
  const rng = { rngState: state.intentRngState };
  const move =
    state.enemy.pattern?.[(state.turn - 1) % state.enemy.pattern.length];
  const strong =
    state.enemy.behavior === 'aggressive'
      ? 0.55
      : state.enemy.behavior === 'defensive'
        ? 0.25
        : 0.4;
  let guard =
    state.enemy.behavior === 'defensive'
      ? 0.45
      : state.enemy.behavior === 'aggressive'
        ? 0.15
        : 0.3;
  if (state.enemy.hp < state.enemy.maxHp * 0.4) guard += 0.1;
  if (previous === 'guard' || state.enemy.guardRounds > 0) guard = 0;
  const roll = move || previous === 'strong' ? 1 : nextCardRandom(rng);
  const type = move
    ? move.type
    : previous === 'strong'
      ? 'adjust'
      : roll < strong
        ? 'strong'
        : roll < strong + guard
          ? 'guard'
          : 'adjust';
  const base = Math.max(
    5,
    state.enemy.attack * 0.25,
    state.enemy.attack * 0.9 - state.player.defense * 0.45
  );
  const rolled = Math.round(base * (0.9 + nextCardRandom(rng) * 0.25));
  const critChance =
    0.08 +
    (state.enemy.speed / ((state.player.speed || 1) + state.enemy.speed + 1)) *
      0.2;
  const crit = nextCardRandom(rng) < critChance;
  const multiplier =
    move?.damageMultiplier ??
    (type === 'strong' ? 1.3 : type === 'guard' ? 0.6 : 0.35);
  const damage = Math.max(
    move?.damageMultiplier === 0 ? 0 : 1,
    Math.min(CARD_MAX_VALUE, Math.round(rolled * (crit ? 1.5 : 1) * multiplier))
  );
  state.intentRngState = rng.rngState;
  // 固守从公布起生效，覆盖当前与下一玩家回合；破势可以提前解除。
  if (type === 'guard') state.enemy.guardRounds = 2;
  const thorns = move?.thornsPercent
    ? Math.max(1, bounded((state.enemy.attack * move.thornsPercent) / 100))
    : 0;
  if (move) state.enemy.thorns = thorns;
  return {
    type,
    name: move?.name ?? LABELS[type],
    description: move?.description ?? DESCRIPTIONS[type],
    damage,
    crit,
    ...(move?.piercePercent ? { piercePercent: move.piercePercent } : {}),
    ...(move?.healPercent
      ? {
          heal: Math.max(
            1,
            bounded((state.enemy.maxHp * move.healPercent) / 100)
          ),
        }
      : {}),
    ...(thorns ? { thorns } : {}),
  };
}

/** 一场副本战斗。全部数值与牌源已由宿主冻结，不访问主游戏、存储或时钟。 */
export function createCardBattle(
  options: CreateCardBattleOptions
): CardBattleState {
  requireState(options && text(options.id, 128), '战斗标识');
  requireState(Number.isSafeInteger(options.seed), '种子');
  requireState(fighter(options.player) && options.player.hp > 0, '入场角色');
  requireState(
    fighter(options.enemy) &&
      options.enemy.hp > 0 &&
      text(options.enemy.name, 128) &&
      BEHAVIORS.includes(options.enemy.behavior),
    '入场敌人'
  );
  requireState(
    options.enemy.archetype === undefined ||
      Object.hasOwn(ENEMY_ARCHETYPES, options.enemy.archetype),
    '入场敌人类型'
  );
  if (options.enemy.pattern !== undefined) {
    requireState(
      options.enemy.archetype !== undefined,
      '自定义循环缺少敌人类型'
    );
    assertPattern(options.enemy.pattern);
  }
  assertEquipment(options.equipment);
  assertCards(options.cards);
  const seed = options.seed >>> 0;
  const state: CardBattleState = {
    version: 1,
    rulesetVersion: 'card-dungeon-v1',
    id: options.id,
    seed,
    rngState: seed || 0x6d2b79f5,
    intentRngState: intentSeed(seed),
    commandSeq: 0,
    phase: 'battle',
    turn: 1,
    maxTurns: options.maxTurns ?? MAX_TURNS,
    player: {
      ...snapshotFighter(options.player),
      entryHp: options.player.hp,
      energy: FOCUS_PER_TURN,
      block: 0,
      nextAttackBonus: 0,
      attacksPlayed: 0,
    },
    enemy: {
      ...snapshotFighter(options.enemy),
      name: options.enemy.name,
      ...(options.enemy.title === undefined
        ? {}
        : { title: options.enemy.title }),
      ...(options.enemy.realm === undefined
        ? {}
        : { realm: options.enemy.realm }),
      behavior: options.enemy.behavior,
      guardRounds: 0,
      ...(options.enemy.archetype === undefined
        ? {}
        : {
            archetype: options.enemy.archetype,
            pattern: (
              options.enemy.pattern ??
              ENEMY_ARCHETYPES[options.enemy.archetype].pattern
            ).map((move) => ({ ...move })),
          }),
    },
    intent: {
      type: 'adjust',
      name: LABELS.adjust,
      description: DESCRIPTIONS.adjust,
      damage: 1,
      crit: false,
    },
    cards: options.cards.map((card) => ({ ...card })),
    drawPile: [],
    hand: [],
    discardPile: [],
    exhaustPile: [],
    log: [],
    ...(options.equipment === undefined
      ? {}
      : {
          equipment: options.equipment.map((item) => ({ ...item })),
        }),
  };
  requireState(integer(state.maxTurns, 1, 100), '回合上限');
  state.drawPile = shuffleCards(
    state,
    state.cards.map((card) => card.id)
  );
  const drawn = drawCards(state, state, DRAW_PER_TURN);
  state.intent = randomIntent(state);
  appendLog(
    state,
    'system',
    `第 1 回合：专注 ${FOCUS_PER_TURN}，抽取 ${drawn} 张牌。`,
    { draw: drawn }
  );
  const openingBlock = equipmentAmount(state, 'opening-block');
  if (openingBlock) state.player.block = openingBlock;
  const openingDraw = drawCards(
    state,
    state,
    Math.min(4, equipmentAmount(state, 'opening-draw'))
  );
  for (const item of state.equipment ?? []) {
    if (item.effect === 'opening-block')
      appendLog(
        state,
        'system',
        `装备「${item.name}」：入场获得 ${item.amount} 防护。`,
        { block: item.amount }
      );
  }
  if (openingDraw)
    appendLog(
      state,
      'system',
      `装备「${(state.equipment ?? [])
        .filter((item) => item.effect === 'opening-draw')
        .map((item) => item.name)
        .join(
          '、'
        )}」开场准备：额外抽取 ${openingDraw} 张牌（额外抽牌总上限4）。`,
      { draw: openingDraw }
    );
  assertCardBattleState(state);
  return state;
}

export function getCardBattlePlayableReason(
  state: CardBattleState,
  cardId: string
): string | null {
  if (state.phase === 'discard') return '请先完成弃牌或返回出牌';
  if (state.phase !== 'battle') return '本场已经结束';
  if (!state.hand.includes(cardId)) return '这张牌不在手中';
  const card = state.cards.find((entry) => entry.id === cardId);
  if (!card) return '找不到这张牌';
  return card.cost > state.player.energy ? '专注不足' : null;
}

function mechanicCard(state: CardBattleState, card: ResolvedBattleCard) {
  const blockConsumed = card.blockToDamage ? state.player.block : 0;
  const converted = card.blockToDamage
    ? Math.min(
        card.blockDamageCap ?? 0,
        Math.floor((blockConsumed * card.blockToDamage) / 100)
      )
    : 0;
  const attackEquipment =
    card.kind === 'attack' && state.player.attacksPlayed === 0
      ? equipmentAmount(state, 'first-attack')
      : 0;
  const defenseEquipment =
    card.kind === 'defense' && (state.player.defensesPlayed ?? 0) === 0
      ? equipmentAmount(state, 'first-defense')
      : 0;
  const baseDamage = bounded((card.damage ?? 0) + converted + attackEquipment);
  const effective = { ...card, damage: baseDamage };
  const rawPreview = previewCardEffects(
    effective,
    state.player,
    state.player.entryHp
  );
  const exposed = Boolean(rawPreview.damage > 0 && state.enemy.exposed);
  if (exposed)
    effective.damage = bounded(
      baseDamage + bounded(rawPreview.damage * 1.25) - rawPreview.damage
    );
  effective.block = Math.min(
    CARD_MAX_VALUE - (blockConsumed ? 0 : state.player.block),
    bounded((card.block ?? 0) + defenseEquipment)
  );
  return {
    effective,
    exposed,
    blockConsumed,
    attackEquipment,
    defenseEquipment,
  };
}

export function getCardBattlePreview(
  state: CardBattleState,
  cardId: string
): CardBattlePreview {
  const card = state.cards.find((entry) => entry.id === cardId);
  if (!card)
    return {
      damage: 0,
      actualDamage: 0,
      block: 0,
      heal: 0,
      draw: 0,
      nextAttackBonus: 0,
      clearsGuard: false,
    };
  const mechanic = mechanicCard(state, card);
  const preview = previewCardEffects(
    mechanic.effective,
    state.player,
    state.player.entryHp
  );
  const damage =
    preview.damage > 0 && state.enemy.guardRounds > 0 && !card.clearEnemyBlock
      ? Math.max(1, Math.round(preview.damage * 0.5))
      : preview.damage;
  return {
    ...preview,
    actualDamage: Math.min(state.enemy.hp, damage),
    nextAttackBonus: card.nextAttackBonus ?? 0,
    clearsGuard: Boolean(
      card.clearEnemyBlock &&
      (state.enemy.guardRounds > 0 || (state.enemy.thorns ?? 0) > 0)
    ),
    ...(mechanic.exposed ? { exposed: true } : {}),
    ...(card.counter
      ? {
          counter: Math.min(
            card.counter,
            CARD_MAX_VALUE - (state.player.counter ?? 0)
          ),
        }
      : {}),
    ...(card.retainBlock
      ? {
          retainBlock: Math.min(
            card.retainBlock,
            CARD_MAX_VALUE - (state.player.retainBlock ?? 0)
          ),
        }
      : {}),
    ...(card.focusGain
      ? {
          focusGain: Math.min(
            card.focusGain,
            FOCUS_PER_TURN - Math.max(0, state.player.energy - card.cost)
          ),
        }
      : {}),
    ...(card.blockToDamage ? { blockConsumed: mechanic.blockConsumed } : {}),
    ...((state.enemy.thorns ?? 0) > 0 &&
    preview.damage > 0 &&
    damage < state.enemy.hp &&
    !card.clearEnemyBlock
      ? {
          reflectedDamage: Math.min(
            state.player.hp + preview.heal,
            state.enemy.thorns!
          ),
        }
      : {}),
  };
}

/** Exact next enemy action, including bypass, retaliation, recovery and retained guard. */
export function getCardBattleIncomingPreview(
  state: CardBattleState
): CardBattleIncomingPreview {
  const incoming = state.intent.damage;
  const piercing = Math.floor(
    (incoming * (state.intent.piercePercent ?? 0)) / 100
  );
  const prevented = Math.min(state.player.block, incoming - piercing);
  const damage = Math.min(state.player.hp, incoming - prevented);
  const counterDamage =
    prevented > 0 && damage < state.player.hp
      ? Math.min(
          state.enemy.hp,
          bounded(
            (state.player.counter ?? 0) +
              equipmentAmount(state, 'guard-counter')
          )
        )
      : 0;
  const retainedBlock = Math.min(
    state.player.block - prevented,
    bounded(
      (state.player.retainBlock ?? 0) + equipmentAmount(state, 'retain-block')
    )
  );
  const heal =
    damage < state.player.hp && state.enemy.hp > counterDamage
      ? Math.min(
          state.intent.heal ?? 0,
          state.enemy.maxHp - state.enemy.hp + counterDamage
        )
      : 0;
  return {
    incoming,
    prevented,
    damage,
    piercing,
    heal,
    retainedBlock,
    counterDamage,
  };
}

function finishTurn(state: CardBattleState): void {
  state.phase = 'battle';
  const hit = getCardBattleIncomingPreview(state);
  state.player.hp -= hit.damage;
  state.player.block = hit.retainedBlock;
  if (state.player.counter !== undefined) state.player.counter = 0;
  if (state.player.retainBlock !== undefined) state.player.retainBlock = 0;
  appendLog(
    state,
    'enemy',
    `对手「${state.intent.name}」${state.intent.crit ? '暴击' : ''}：来袭 ${state.intent.damage}${hit.piercing ? `（其中穿透 ${hit.piercing}）` : ''}，防护抵消 ${hit.prevented}，精力 -${hit.damage}。${hit.retainedBlock ? `剩余防护留存 ${hit.retainedBlock}。` : '本轮防护清空。'}`,
    { damage: hit.damage, preventedDamage: hit.prevented }
  );
  if (hit.counterDamage) {
    state.enemy.hp -= hit.counterDamage;
    appendLog(
      state,
      'card',
      `成功抵挡触发反击：造成 ${hit.counterDamage} 点损耗（反击不受固守影响）。`,
      { damage: hit.counterDamage }
    );
    for (const item of state.equipment ?? [])
      if (item.effect === 'guard-counter')
        appendLog(
          state,
          'system',
          `装备「${item.name}」触发：本轮反击额外 +${item.amount}。`
        );
  }
  if (hit.retainedBlock)
    for (const item of state.equipment ?? [])
      if (item.effect === 'retain-block')
        appendLog(
          state,
          'system',
          `装备「${item.name}」触发：提高剩余防护留存上限 ${item.amount}，本轮合计留存 ${hit.retainedBlock}。`
        );
  if (hit.heal && state.player.hp > 0) {
    state.enemy.hp += hit.heal;
    appendLog(
      state,
      'enemy',
      `对手「${state.intent.name}」恢复 ${hit.heal} 精力。`,
      { heal: hit.heal }
    );
  }
  state.enemy.guardRounds = Math.max(0, state.enemy.guardRounds - 1);
  if (state.player.hp === 0) {
    state.phase = 'defeat';
    appendLog(state, 'system', '精力耗尽，本场结束。');
  } else if (state.enemy.hp === 0) {
    state.phase = 'victory';
    appendLog(state, 'system', '反击击破对手，本场获胜。');
  } else if (state.turn === state.maxTurns) {
    state.phase = 'stalemate';
    appendLog(
      state,
      'system',
      `已完成 ${state.maxTurns} 回合，本场以僵局结束。`
    );
  } else {
    state.turn++;
    state.player.energy = FOCUS_PER_TURN;
    state.player.attacksPlayed = 0;
    if (state.player.defensesPlayed !== undefined)
      state.player.defensesPlayed = 0;
    const drawn = drawCards(state, state, DRAW_PER_TURN);
    state.intent = randomIntent(state, state.intent.type);
    appendLog(
      state,
      'system',
      `第 ${state.turn} 回合：保留未出手牌，恢复 ${FOCUS_PER_TURN} 点专注，抽取 ${drawn} 张牌。`,
      { draw: drawn }
    );
  }
}

/** 无效、重放或乱序指令返回原对象；保存失败时宿主可直接保留旧现场。 */
export function stepCardBattle(
  current: CardBattleState,
  command: CardBattleCommand
): CardBattleState {
  if (
    !command ||
    command.id !== current.id ||
    !integer(command.seq, 1, MAX_COMMANDS) ||
    command.seq !== current.commandSeq + 1
  )
    return current;
  if (command.type === 'play') {
    if (getCardBattlePlayableReason(current, command.cardId) !== null)
      return current;
  } else if (command.type === 'end-turn') {
    if (current.phase !== 'battle') return current;
  } else if (command.type === 'retreat') {
    if (!['battle', 'discard'].includes(current.phase)) return current;
  } else if (command.type === 'cancel-discard') {
    if (current.phase !== 'discard') return current;
  } else if (command.type === 'confirm-discard') {
    if (
      current.phase !== 'discard' ||
      !isExactDiscard(current.hand, command.cardIds)
    )
      return current;
  } else return current;
  const state: CardBattleState = {
    ...current,
    commandSeq: command.seq,
    player: { ...current.player },
    enemy: {
      ...current.enemy,
      ...(current.enemy.pattern === undefined
        ? {}
        : {
            pattern: current.enemy.pattern.map((move) => ({ ...move })),
          }),
    },
    intent: { ...current.intent },
    cards: current.cards.map((card) => ({ ...card })),
    drawPile: [...current.drawPile],
    hand: [...current.hand],
    discardPile: [...current.discardPile],
    exhaustPile: [...current.exhaustPile],
    log: current.log.map((entry) => ({ ...entry })),
    ...(current.equipment === undefined
      ? {}
      : {
          equipment: current.equipment.map((item) => ({ ...item })),
        }),
  };
  if (command.type === 'retreat') {
    state.phase = 'retreat';
    appendLog(
      state,
      'system',
      '你主动撤离，保留本场精力损耗，不领取胜利奖励。'
    );
  } else if (command.type === 'cancel-discard') {
    state.phase = 'battle';
    appendLog(state, 'system', '返回出牌；敌人尚未行动。');
  } else if (command.type === 'confirm-discard') {
    const ids = discardSelected(state, command.cardIds);
    appendLog(
      state,
      'system',
      `弃置 ${ids.length} 张手牌，保留 ${HAND_LIMIT} 张后结束回合。`
    );
    finishTurn(state);
  } else if (command.type === 'end-turn') {
    if (state.hand.length > HAND_LIMIT) {
      state.phase = 'discard';
      appendLog(
        state,
        'system',
        `当前有 ${state.hand.length} 张手牌。请弃置 ${state.hand.length - HAND_LIMIT} 张，再结算敌人行动。`
      );
    } else finishTurn(state);
  } else if (command.type === 'play') {
    const card = state.cards.find((entry) => entry.id === command.cardId)!;
    const mechanic = mechanicCard(state, card);
    const reflectedDamage =
      getCardBattlePreview(state, card.id).reflectedDamage ?? 0;
    const clearedThorns = Boolean(card.clearEnemyBlock && state.enemy.thorns);
    if (mechanic.blockConsumed) state.player.block = 0;
    if (card.clearEnemyBlock && state.enemy.thorns !== undefined)
      state.enemy.thorns = 0;
    const runtime = {
      rngState: state.rngState,
      player: state.player,
      enemyHp: state.enemy.hp,
      enemyBlock: 0,
      enemyGuardRounds: state.enemy.guardRounds,
      drawPile: state.drawPile,
      hand: state.hand,
      discardPile: state.discardPile,
      exhaustPile: state.exhaustPile,
    };
    const applied = applyCardEffects(
      runtime,
      mechanic.effective,
      command.cardId,
      state.player.entryHp
    );
    state.rngState = runtime.rngState;
    state.enemy.hp = runtime.enemyHp;
    state.enemy.guardRounds = runtime.enemyGuardRounds;
    state.drawPile = runtime.drawPile;
    state.hand = runtime.hand;
    state.discardPile = runtime.discardPile;
    state.exhaustPile = runtime.exhaustPile;
    if (applied.damage > 0 && state.enemy.exposed) state.enemy.exposed = false;
    if (card.expose) state.enemy.exposed = true;
    if (card.counter)
      state.player.counter = bounded(
        (state.player.counter ?? 0) + card.counter
      );
    if (card.retainBlock)
      state.player.retainBlock = bounded(
        (state.player.retainBlock ?? 0) + card.retainBlock
      );
    const focusGain = Math.min(
      card.focusGain ?? 0,
      FOCUS_PER_TURN - state.player.energy
    );
    state.player.energy += focusGain;
    if (
      card.kind === 'defense' &&
      (state.player.defensesPlayed !== undefined ||
        equipmentAmount(state, 'first-defense') > 0)
    )
      state.player.defensesPlayed = (state.player.defensesPlayed ?? 0) + 1;
    if (reflectedDamage) state.player.hp -= reflectedDamage;
    const effects = [
      applied.clearedGuard ? '清除固守' : '',
      clearedThorns ? '解除反震' : '',
      mechanic.blockConsumed
        ? `消耗 ${mechanic.blockConsumed} 防护转为进攻`
        : '',
      mechanic.exposed ? '利用破绽，进攻提升25%' : '',
      applied.damage || (card.damage ?? 0) > 0
        ? `造成 ${applied.damage} 点损耗${applied.guardPrevented ? `（固守减免 ${applied.guardPrevented}）` : ''}`
        : '',
      applied.block ? `获得 ${applied.block} 防护` : '',
      card.heal ? `恢复 ${applied.heal} 精力` : '',
      card.draw ? `抽 ${applied.drawn} 张牌` : '',
      card.nextAttackBonus ? `下次进攻 +${card.nextAttackBonus}` : '',
      card.expose ? '施加破绽：下次受到进攻提升25%' : '',
      card.counter ? `本轮成功抵挡后反击 ${card.counter}` : '',
      card.retainBlock ? `本轮敌袭后最多留存 ${card.retainBlock} 剩余防护` : '',
      focusGain ? `恢复 ${focusGain} 专注` : '',
      reflectedDamage ? `受到反震，精力 -${reflectedDamage}（穿过防护）` : '',
      card.exhaust ? '本场暂存' : '',
    ]
      .filter(Boolean)
      .join('；');
    appendLog(
      state,
      'card',
      `「${card.name}」消耗 ${card.cost} 专注：${effects}。`,
      {
        cardId: card.id,
        damage: applied.damage,
        preventedDamage: applied.guardPrevented,
        block: applied.block,
        heal: applied.heal,
        draw: applied.drawn,
      }
    );
    for (const item of state.equipment ?? []) {
      if (
        (item.effect === 'first-attack' && mechanic.attackEquipment) ||
        (item.effect === 'first-defense' && mechanic.defenseEquipment)
      )
        appendLog(
          state,
          'system',
          `装备「${item.name}」触发：本回合首次${item.effect === 'first-attack' ? '进攻' : '防御'}额外 +${item.amount}。`
        );
    }
    if (state.enemy.hp === 0) {
      state.phase = 'victory';
      appendLog(state, 'system', '解题成功，本场获胜。');
    } else if (state.player.hp === 0) {
      state.phase = 'defeat';
      appendLog(state, 'system', '反震导致精力耗尽，本场结束。');
    }
  }
  return state;
}

/** 导入/读档边界：检查冻结结构、牌区唯一分区、终局与指令日志。 */
export function assertCardBattleState(
  value: unknown
): asserts value is CardBattleState {
  requireState(
    value && typeof value === 'object' && !Array.isArray(value),
    '不是对象'
  );
  const state = value as CardBattleState;
  requireState(
    state.version === 1 && state.rulesetVersion === 'card-dungeon-v1',
    '规则版本'
  );
  requireState(
    text(state.id, 128) &&
      integer(state.seed, 0, 0xffffffff) &&
      integer(state.rngState, 1, 0xffffffff) &&
      integer(state.intentRngState, 1, 0xffffffff),
    '标识或随机状态'
  );
  requireState(
    integer(state.commandSeq, 0, MAX_COMMANDS) &&
      PHASES.includes(state.phase) &&
      integer(state.maxTurns, 1, 100) &&
      integer(state.turn, 1, state.maxTurns),
    '阶段或指令'
  );
  const p = state.player;
  const e = state.enemy;
  requireState(
    fighter(p) &&
      integer(p.entryHp, 1, p.maxHp) &&
      p.hp <= p.entryHp &&
      integer(p.energy, 0, FOCUS_PER_TURN) &&
      integer(p.block) &&
      integer(p.nextAttackBonus) &&
      integer(p.attacksPlayed, 0, MAX_COMMANDS),
    '角色'
  );
  for (const field of ['counter', 'retainBlock', 'defensesPlayed'] as const)
    requireState(
      p[field] === undefined ||
        integer(
          p[field],
          0,
          field === 'defensesPlayed' ? MAX_COMMANDS : CARD_MAX_VALUE
        ),
      '角色机制状态'
    );
  requireState(
    fighter(e) &&
      text(e.name, 128) &&
      BEHAVIORS.includes(e.behavior) &&
      integer(e.guardRounds, 0, 2) &&
      (e.title === undefined ||
        (typeof e.title === 'string' && e.title.length <= 128)) &&
      (e.realm === undefined || text(e.realm, 128)),
    '敌人'
  );
  requireState(
    (e.archetype === undefined && e.pattern === undefined) ||
      (e.archetype !== undefined &&
        Object.hasOwn(ENEMY_ARCHETYPES, e.archetype) &&
        e.pattern !== undefined),
    '敌人类型与行动循环'
  );
  if (e.pattern !== undefined) assertPattern(e.pattern);
  requireState(
    e.exposed === undefined || typeof e.exposed === 'boolean',
    '敌人破绽'
  );
  requireState(e.thorns === undefined || integer(e.thorns), '敌人反震');
  const intent = state.intent;
  requireState(
    intent &&
      INTENTS.includes(intent.type) &&
      text(intent.name, 128) &&
      text(intent.description, 1000) &&
      integer(intent.damage, 0) &&
      typeof intent.crit === 'boolean',
    '已公布意图'
  );
  requireState(
    intent.piercePercent === undefined || integer(intent.piercePercent, 0, 100),
    '意图穿透'
  );
  for (const field of ['heal', 'thorns'] as const)
    requireState(
      intent[field] === undefined || integer(intent[field]),
      '意图机制数值'
    );
  assertEquipment(state.equipment);
  assertCards(state.cards);
  const zones = [
    state.drawPile,
    state.hand,
    state.discardPile,
    state.exhaustPile,
  ];
  requireState(zones.every(Array.isArray), '牌区');
  const ids = new Set(state.cards.map((card) => card.id));
  const all = zones.flat();
  requireState(
    all.length === ids.size &&
      new Set(all).size === ids.size &&
      all.every((id) => ids.has(id)),
    '牌区重复或丢牌'
  );
  requireState(
    state.exhaustPile.every(
      (id) => state.cards.find((card) => card.id === id)!.exhaust
    ),
    '暂存区'
  );
  if (state.phase === 'victory') requireState(e.hp === 0 && p.hp > 0, '胜利');
  else if (state.phase === 'defeat')
    requireState(p.hp === 0 && e.hp > 0, '失败');
  else requireState(e.hp > 0 && p.hp > 0, '未结束战场');
  if (state.phase === 'discard')
    requireState(state.hand.length > HAND_LIMIT, '弃牌未超限');
  if (state.phase === 'stalemate')
    requireState(state.turn === state.maxTurns, '僵局回合');
  requireState(
    Array.isArray(state.log) &&
      state.log.length > 0 &&
      state.log.length <= 2000,
    '日志'
  );
  let previousSeq = -1;
  let previousTurn = 0;
  for (const entry of state.log) {
    requireState(
      entry &&
        integer(entry.seq, 0, state.commandSeq) &&
        entry.seq >= previousSeq &&
        integer(entry.turn, 1, state.turn) &&
        entry.turn >= previousTurn &&
        ['card', 'enemy', 'system'].includes(entry.kind) &&
        text(entry.text, 2000) &&
        integer(entry.playerHpAfter, 0, p.entryHp) &&
        integer(entry.enemyHpAfter, 0, e.maxHp),
      '日志条目'
    );
    requireState(
      entry.cardId === undefined || ids.has(entry.cardId),
      '日志卡牌'
    );
    for (const field of [
      'damage',
      'preventedDamage',
      'block',
      'heal',
      'draw',
    ] as const)
      requireState(
        entry[field] === undefined || integer(entry[field]),
        '日志数值'
      );
    previousSeq = entry.seq;
    previousTurn = entry.turn;
  }
  const last = state.log[state.log.length - 1];
  requireState(
    last.seq === state.commandSeq &&
      last.turn === state.turn &&
      last.playerHpAfter === p.hp &&
      last.enemyHpAfter === e.hp,
    '日志与当前现场不符'
  );
}
