import { REALM_DATA, REALM_ORDER } from '../../constants';
import { RealmType } from '../../types';
import type { PlayerStats } from '../../types';
import type { BattleRoundLog } from '../../services/battleService';

export type BattleAction = 'attack' | 'defend' | 'break' | 'retreat';
export type EnemyIntent = 'strong' | 'guard' | 'adjust';
export type EnemyBehavior = 'balanced' | 'aggressive' | 'defensive';
export type BattleOutcome =
  | 'ongoing'
  | 'victory'
  | 'defeat'
  | 'retreat'
  | 'stalemate';

export const INTERACTIVE_BATTLE_MAX_ROUNDS = 12;
export const BATTLE_ACTION_LABELS: Record<BattleAction, string> = {
  attack: '稳攻',
  defend: '防守',
  break: '破势',
  retreat: '撤离',
};
export const ENEMY_INTENT_LABELS: Record<EnemyIntent, string> = {
  strong: '强攻',
  guard: '固守',
  adjust: '调整',
};
export const ENEMY_INTENT_DESCRIPTIONS: Record<EnemyIntent, string> = {
  strong:
    '对手准备强攻，下一轮必定调整。精力吃紧时可防守减半来袭，再抓住调整窗口进攻。',
  guard: '对手将固守两轮并弱攻；破势可清除固守，本轮正常输出。',
  adjust: '对手正在调整，本轮来袭较弱，可把握进攻窗口。',
};

export interface BattleFighter {
  hp: number;
  maxHp: number;
  attack: number;
  defense: number;
  speed: number;
}

export interface BattleEnemy extends BattleFighter {
  name: string;
  title: string;
  realm: RealmType;
  behavior: EnemyBehavior;
}

export interface InteractiveBattleEntry extends BattleRoundLog {
  /** 目标减伤之前的来袭，已包含暴击和已公布意图倍率。 */
  incomingDamage: number;
  preventedDamage: number;
}

export interface InteractiveBattleRound {
  round: number;
  commandSeq: number;
  action: BattleAction;
  intent: EnemyIntent;
  entries: InteractiveBattleEntry[];
  message: string;
}

/** 全部字段可序列化；角色、随机状态与已公布意图随每次指令一起保存。 */
export interface InteractiveBattleState {
  version: 1;
  id: string;
  player: BattleFighter;
  enemy: BattleEnemy;
  playerHpBefore: number;
  intent: EnemyIntent;
  enemyGuardRounds: number;
  breakCooldown: number;
  completedRounds: number;
  commandSeq: number;
  rngState: number;
  outcome: BattleOutcome;
  rounds: InteractiveBattleRound[];
}

export interface BattleCommand {
  seq: number;
  action: BattleAction;
}

export interface CreateInteractiveBattleOptions {
  id: string;
  player: Pick<PlayerStats, 'hp' | 'maxHp' | 'attack' | 'defense' | 'speed'> &
    Partial<Pick<PlayerStats, 'realm' | 'realmLevel'>>;
  enemy?: BattleEnemy;
  seed: number;
  behavior?: EnemyBehavior;
}

const validActions = new Set<BattleAction>([
  'attack',
  'defend',
  'break',
  'retreat',
]);
const validBehaviors = new Set<EnemyBehavior>([
  'balanced',
  'aggressive',
  'defensive',
]);
const normalizeSeed = (seed: number) => seed >>> 0 || 0x6d2b79f5;
const stat = (value: number, minimum: number) =>
  Math.max(
    minimum,
    Math.min(
      Number.MAX_SAFE_INTEGER / 16,
      Math.floor(Number.isFinite(value) ? value : minimum)
    )
  );

const snapshotFighter = (fighter: BattleFighter): BattleFighter => {
  const maxHp = stat(fighter.maxHp, 1);
  return {
    hp: Math.min(maxHp, stat(fighter.hp, 0)),
    maxHp,
    attack: stat(fighter.attack, 0),
    defense: stat(fighter.defense, 0),
    speed: stat(fighter.speed, 0),
  };
};

/** xorshift32：不读取时钟、Math.random 或模型，跨读档续接同一个随机序列。 */
const nextRandom = (state: { rngState: number }): number => {
  let value = state.rngState;
  value ^= value << 13;
  value ^= value >>> 17;
  value ^= value << 5;
  state.rngState = value >>> 0;
  return state.rngState / 0x100000000;
};

/** 按学阶基础成长，避免中后期被线性数值的敌人变成一击回放；不跟随装备膨胀。 */
export const generateInteractiveEnemy = (
  player: Partial<Pick<PlayerStats, 'realm' | 'realmLevel'>>,
  seed: number,
  behavior: EnemyBehavior = 'balanced'
): BattleEnemy => {
  const realm = REALM_ORDER.includes(player.realm)
    ? player.realm
    : RealmType.QiRefining;
  const level = Math.min(9, stat(player.realmLevel ?? 1, 1));
  const base = REALM_DATA[realm];
  const levelScale = 1 + (level - 1) * 0.1;
  const rng = { rngState: normalizeSeed(seed) };
  const variance = () => 0.9 + nextRandom(rng) * 0.2;
  // 各学阶基础精力与攻击的比例并不完全相同；以基础输出封顶，避免某一阶明显拖长。
  const baseEnemyHp = Math.min(base.baseMaxHp * 0.4, base.baseAttack * 4);
  const maxHp = Math.max(30, Math.round(baseEnemyHp * levelScale * variance()));
  const names = ['联调难题', '边界错误', '实验瓶颈'];
  return {
    name: names[Math.floor(nextRandom(rng) * names.length)],
    title: '待解的',
    realm,
    behavior: validBehaviors.has(behavior) ? behavior : 'balanced',
    hp: maxHp,
    maxHp,
    attack: Math.max(
      5,
      Math.round(base.baseAttack * 0.8 * levelScale * variance())
    ),
    defense: Math.max(
      3,
      Math.round(base.baseDefense * 0.8 * levelScale * variance())
    ),
    speed: Math.max(
      5,
      Math.round(base.baseSpeed * 0.95 * levelScale * variance())
    ),
  };
};

const chooseNextIntent = (
  state: InteractiveBattleState,
  previous?: EnemyIntent
): EnemyIntent => {
  // 强攻后必定出现可见的调整窗口，不引入额外状态或新的玩家动作。
  if (previous === 'strong') return 'adjust';
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
  // 同一固守最多延续两轮，不连续重新挂满持续时间。
  if (previous === 'guard' || state.enemyGuardRounds > 0) guard = 0;
  const roll = nextRandom(state);
  return roll < strong ? 'strong' : roll < strong + guard ? 'guard' : 'adjust';
};

export const createInteractiveBattle = (
  options: CreateInteractiveBattleOptions
): InteractiveBattleState => {
  const enemy =
    options.enemy ??
    generateInteractiveEnemy(options.player, options.seed, options.behavior);
  const player = snapshotFighter(options.player);
  const state: InteractiveBattleState = {
    version: 1,
    id: options.id,
    player,
    enemy: {
      ...snapshotFighter(enemy),
      name: enemy.name,
      title: enemy.title,
      realm: enemy.realm,
      behavior: validBehaviors.has(enemy.behavior)
        ? enemy.behavior
        : 'balanced',
    },
    playerHpBefore: player.hp,
    intent: 'adjust',
    enemyGuardRounds: 0,
    breakCooldown: 0,
    completedRounds: 0,
    commandSeq: 0,
    rngState: normalizeSeed(options.seed),
    outcome: 'ongoing',
    rounds: [],
  };
  state.outcome =
    state.player.hp <= 0
      ? 'defeat'
      : state.enemy.hp <= 0
        ? 'victory'
        : 'ongoing';
  if (state.outcome === 'ongoing') state.intent = chooseNextIntent(state);
  return state;
};

const rolledDamage = (
  state: InteractiveBattleState,
  attacker: BattleFighter,
  target: BattleFighter
) => {
  // 保持旧通道基础伤害及暴击公式；减伤放在这之后，最低伤害不吞掉防守。
  const base = Math.max(
    Math.max(5, attacker.attack * 0.25),
    attacker.attack * 0.9 - target.defense * 0.45
  );
  const damage = Math.round(base * (0.9 + nextRandom(state) * 0.25));
  const critChance =
    0.08 +
    (attacker.speed / ((state.player.speed || 1) + state.enemy.speed + 1)) *
      0.2;
  const crit = nextRandom(state) < critChance;
  return { damage: crit ? Math.round(damage * 1.5) : damage, crit };
};

/** 非下一序号、重复、终局和冷却中的指令均原样返回；调用方先保存，再公布新现场。 */
export const stepInteractiveBattle = (
  current: InteractiveBattleState,
  command: BattleCommand
): InteractiveBattleState => {
  if (
    current.outcome !== 'ongoing' ||
    command.seq !== current.commandSeq + 1 ||
    !Number.isSafeInteger(command.seq) ||
    !validActions.has(command.action) ||
    (command.action === 'break' && current.breakCooldown > 0)
  )
    return current;

  const state: InteractiveBattleState = {
    ...current,
    player: { ...current.player },
    enemy: { ...current.enemy },
    commandSeq: command.seq,
    rounds: [...current.rounds],
  };
  const round: InteractiveBattleRound = {
    round: state.completedRounds + 1,
    commandSeq: command.seq,
    action: command.action,
    intent: state.intent,
    entries: [],
    message: '',
  };
  if (command.action === 'retreat') {
    state.outcome = 'retreat';
    round.message = '你主动撤离，保留已经发生的精力损耗，不领取胜利奖励。';
    state.rounds.push(round);
    return state;
  }

  if (state.intent === 'guard') state.enemyGuardRounds = 2;
  const brokeGuard = command.action === 'break' && state.enemyGuardRounds > 0;
  if (brokeGuard) state.enemyGuardRounds = 0;
  const order: Array<'player' | 'enemy'> =
    state.player.speed >= state.enemy.speed
      ? ['player', 'enemy']
      : ['enemy', 'player'];

  for (const side of order) {
    if (state.player.hp <= 0 || state.enemy.hp <= 0) break;
    if (side === 'player' && command.action === 'defend') continue;
    const attacker = side === 'player' ? state.player : state.enemy;
    const target = side === 'player' ? state.enemy : state.player;
    const rolled = rolledDamage(state, attacker, target);
    const intentMultiplier =
      side === 'enemy'
        ? state.intent === 'strong'
          ? 1.3
          : state.intent === 'guard'
            ? 0.6
            : 0.35
        : command.action === 'break' && !brokeGuard
          ? 0.75
          : 1;
    const incomingDamage = Math.max(
      1,
      Math.round(rolled.damage * intentMultiplier)
    );
    const isGuarded = side === 'player' && state.enemyGuardRounds > 0;
    const isDefended = side === 'enemy' && command.action === 'defend';
    const afterMitigation =
      isGuarded || isDefended
        ? Math.max(1, Math.round(incomingDamage * 0.5))
        : incomingDamage;
    const preventedDamage = incomingDamage - afterMitigation;
    const damage = Math.min(target.hp, afterMitigation);
    target.hp -= damage;
    const description =
      side === 'player'
        ? `你${BATTLE_ACTION_LABELS[command.action]}，${brokeGuard ? '清除固守，' : ''}造成 ${damage} 点损耗${isGuarded ? `（固守减免 ${preventedDamage}）` : ''}。`
        : `对手${ENEMY_INTENT_LABELS[state.intent]}，造成 ${damage} 点损耗${isDefended ? `（来袭 ${incomingDamage}，防守减免 ${preventedDamage}）` : ''}。`;
    round.entries.push({
      id: `${state.id}:${command.seq}:${side}`,
      attacker: side,
      damage,
      crit: rolled.crit,
      description,
      incomingDamage,
      preventedDamage,
      playerHpAfter: state.player.hp,
      enemyHpAfter: state.enemy.hp,
    });
  }

  state.completedRounds += 1;
  state.enemyGuardRounds = Math.max(0, state.enemyGuardRounds - 1);
  state.breakCooldown =
    command.action === 'break' ? 2 : Math.max(0, state.breakCooldown - 1);
  state.outcome =
    state.player.hp <= 0
      ? 'defeat'
      : state.enemy.hp <= 0
        ? 'victory'
        : state.completedRounds >= INTERACTIVE_BATTLE_MAX_ROUNDS
          ? 'stalemate'
          : 'ongoing';
  round.message =
    command.action === 'defend'
      ? '你放弃本轮输出，先稳住精力。'
      : brokeGuard
        ? '破势清除了固守；还需完成两个其他行动轮才能再次使用。'
        : command.action === 'break'
          ? '对方没有固守，破势仅发挥七成五输出。'
          : '稳攻保持稳定输出。';
  state.rounds.push(round);
  if (state.outcome === 'ongoing')
    state.intent = chooseNextIntent(state, round.intent);
  return state;
};

/** 仅使用已经展示的现场，不代替玩家选择机缘，也不发放奖励。 */
export const chooseAutoBattleAction = (
  state: InteractiveBattleState
): BattleAction => {
  if (
    state.breakCooldown === 0 &&
    (state.enemyGuardRounds > 0 || state.intent === 'guard')
  )
    return 'break';
  const canFinish =
    state.player.speed >= state.enemy.speed &&
    state.enemy.hp <=
      Math.max(5, state.player.attack * 0.9 - state.enemy.defense * 0.45) * 0.9;
  if (
    state.intent === 'strong' &&
    state.player.hp < state.player.maxHp * 0.4 &&
    !canFinish
  )
    return 'defend';
  return 'attack';
};

export const autoInteractiveBattle = (
  current: InteractiveBattleState
): InteractiveBattleState => {
  let state = current;
  while (state.outcome === 'ongoing') {
    const next = stepInteractiveBattle(state, {
      seq: state.commandSeq + 1,
      action: chooseAutoBattleAction(state),
    });
    if (next === state) break;
    state = next;
  }
  return state;
};

/** 只返回已完成现场的事实；胜负费用与奖励由所属机缘统一、一次结算。 */
export const resolveInteractiveBattle = (state: InteractiveBattleState) =>
  state.outcome === 'ongoing'
    ? null
    : {
        outcome: state.outcome,
        hpChange: state.player.hp - state.playerHpBefore,
        hpLoss: state.playerHpBefore - state.player.hp,
        completedRounds: state.completedRounds,
      };
