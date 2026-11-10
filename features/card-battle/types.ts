/** Static templates are shared by the standalone trial and the dungeon adapter. */
export type CardId =
  | 'strike'
  | 'guard'
  | 'break'
  | 'prepare'
  | 'windup'
  | 'followup'
  | 'fortify'
  | 'precise'
  | 'recover'
  | 'quick-guard'
  | 'insight'
  | 'pressure'
  | 'course-code'
  | 'course-early'
  | 'course-math'
  | 'course-algorithms'
  | 'course-linear'
  | 'course-physics'
  | 'gear-keyboard'
  | 'gear-uniform'
  | 'gear-earplugs'
  | 'gear-wrist'
  | 'tactic-feint'
  | 'tactic-riposte'
  | 'tactic-reserve'
  | 'tactic-convert'
  | 'tactic-reset'
  | 'tactic-observe'
  | 'gear-mechanical'
  | 'gear-red-switch'
  | 'gear-band'
  | 'gear-badge'
  | 'gear-monitor'
  | 'gear-cooler';
export type CardAttribute =
  | 'attack'
  | 'defense'
  | 'spirit'
  | 'physique'
  | 'speed';
export interface CardEffects {
  cost: number;
  kind: 'attack' | 'defense' | 'utility';
  description: string;
  damage?: number;
  block?: number;
  heal?: number;
  draw?: number;
  nextAttackBonus?: number;
  bonusAfterAttack?: number;
  clearEnemyBlock?: boolean;
  exhaust?: boolean;
  expose?: boolean;
  counter?: number;
  retainBlock?: number;
  blockToDamage?: number;
  blockDamageCap?: number;
  focusGain?: number;
}
export interface CardDefinition extends CardEffects {
  id: CardId;
  name: string;
  source?: 'course' | 'equipment' | 'tactic';
  scaling?: {
    stat: CardAttribute;
    effect: 'damage' | 'block' | 'heal';
    coefficient: number;
    cap: number;
  };
}
export interface CardInstance {
  id: string;
  cardId: CardId;
  sourceId?: string;
  label?: string;
}
/** Fully resolved, serialized raw effects. Active runs never consult a live catalog. */
export interface ResolvedBattleCard extends CardEffects {
  id: string;
  templateId: CardId;
  name: string;
  source?: 'basic' | 'course' | 'equipment';
  sourceId?: string;
  sourceLabel?: string;
  scalingLabel?: string;
}
export type CardEnemyBehavior = 'balanced' | 'aggressive' | 'defensive';
export type CardEnemyIntentType = 'strong' | 'guard' | 'adjust';
export type CardEnemyArchetype =
  | 'duelist'
  | 'sentinel'
  | 'sprinter'
  | 'disruptor'
  | 'regenerator'
  | 'counterguard';
export interface CardEnemyMove {
  type: CardEnemyIntentType;
  name: string;
  description: string;
  damageMultiplier: number;
  piercePercent?: number;
  healPercent?: number;
  thornsPercent?: number;
}
export interface ResolvedBattleEquipment {
  id: string;
  sourceId: string;
  name: string;
  effect:
    | 'opening-block'
    | 'opening-draw'
    | 'first-attack'
    | 'first-defense'
    | 'guard-counter'
    | 'retain-block';
  amount: number;
  description: string;
}
export type CardBattlePhase =
  | 'battle'
  | 'discard'
  | 'victory'
  | 'defeat'
  | 'retreat'
  | 'stalemate';
export interface CardBattleFighter {
  hp: number;
  maxHp: number;
  attack: number;
  defense: number;
  speed: number;
}
export interface CardBattleEnemy extends CardBattleFighter {
  name: string;
  title?: string;
  realm?: string;
  behavior: CardEnemyBehavior;
  guardRounds: number;
  archetype?: CardEnemyArchetype;
  /** Frozen at entry; catalog changes never rewrite an active opponent. */
  pattern?: CardEnemyMove[];
  exposed?: boolean;
  thorns?: number;
}
export interface CardBattleIntent {
  type: CardEnemyIntentType;
  name: string;
  description: string;
  damage: number;
  crit: boolean;
  piercePercent?: number;
  heal?: number;
  thorns?: number;
}
export interface CardBattleLogEntry {
  seq: number;
  turn: number;
  kind: 'card' | 'enemy' | 'system';
  text: string;
  cardId?: string;
  damage?: number;
  preventedDamage?: number;
  block?: number;
  heal?: number;
  draw?: number;
  playerHpAfter: number;
  enemyHpAfter: number;
}
export interface CardBattleState {
  version: 1;
  rulesetVersion: 'card-dungeon-v1';
  id: string;
  seed: number;
  rngState: number;
  intentRngState: number;
  commandSeq: number;
  phase: CardBattlePhase;
  turn: number;
  maxTurns: number;
  player: CardBattleFighter & {
    entryHp: number;
    energy: number;
    block: number;
    nextAttackBonus: number;
    attacksPlayed: number;
    defensesPlayed?: number;
    counter?: number;
    retainBlock?: number;
  };
  enemy: CardBattleEnemy;
  intent: CardBattleIntent;
  cards: ResolvedBattleCard[];
  drawPile: string[];
  hand: string[];
  discardPile: string[];
  exhaustPile: string[];
  log: CardBattleLogEntry[];
  equipment?: ResolvedBattleEquipment[];
}
export type CardBattleAction =
  | { type: 'play'; cardId: string }
  | { type: 'end-turn' }
  | { type: 'confirm-discard'; cardIds: string[] }
  | { type: 'cancel-discard' }
  | { type: 'retreat' };
export type CardBattleCommand = CardBattleAction & { id: string; seq: number };
export interface CreateCardBattleOptions {
  id: string;
  seed: number;
  player: CardBattleFighter;
  enemy: Omit<CardBattleEnemy, 'guardRounds'>;
  cards: ResolvedBattleCard[];
  maxTurns?: number;
  equipment?: ResolvedBattleEquipment[];
}
export interface CardBattlePreview {
  damage: number;
  actualDamage: number;
  block: number;
  heal: number;
  draw: number;
  nextAttackBonus: number;
  clearsGuard: boolean;
  exposed?: boolean;
  counter?: number;
  retainBlock?: number;
  focusGain?: number;
  blockConsumed?: number;
  reflectedDamage?: number;
}
export interface CardBattleIncomingPreview {
  incoming: number;
  prevented: number;
  damage: number;
  piercing: number;
  heal: number;
  retainedBlock: number;
  counterDamage: number;
}
