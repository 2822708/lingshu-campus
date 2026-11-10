import type { RealmType } from '../../types';
import type {
  CardId,
  CardInstance,
} from '../../features/card-battle/types';
export type {
  CardId,
  CardInstance,
  CardDefinition,
  CardAttribute as TrialAttribute,
} from '../../features/card-battle/types';
export interface TrialIntent {
  name: string;
  description: string;
  damage: number;
  block: number;
}

export interface TrialEnemy {
  id: string;
  name: string;
  description: string;
  maxHp: number;
  pattern: readonly TrialIntent[];
  grade?: {
    realm: RealmType;
    level: number;
    strength: '弱敌' | '普通' | '强敌';
    unit: number;
    attack: number;
    defense: number;
    raw: { maxHp: number; attack: number; defense: number };
  };
}

export type TrialPhase =
  | 'battle'
  | 'discard'
  | 'reward'
  | 'complete'
  | 'defeat'
  | 'retreated'
  | 'stalemate';

export interface TrialLogEntry {
  seq: number;
  stage: number;
  turn: number;
  kind: 'card' | 'enemy' | 'system' | 'reward';
  text: string;
}

export interface TrialBattleSummary {
  stage: number;
  turns: number;
  hpBefore: number;
  hpAfter: number;
}

export interface TrialProfile {
  source: 'demo' | 'import';
  name: string;
  realm: RealmType;
  realmLevel: number;
  attack: number;
  defense: number;
  spirit: number;
  physique: number;
  speed: number;
  maxHp: number;
  courseIds: string[];
  equipment: Array<{ id: string; name: string }>;
}
export interface TrialLibraryEntry {
  id: string;
  cardId: CardId;
  source: 'basic' | 'course' | 'equipment';
  sourceId: string;
  label: string;
}
/** 牌库与简历只是独立试玩配置，不保存主游戏原文或业务状态。 */
export interface TrialLoadout {
  version: 1;
  profile: TrialProfile;
  library: string[];
  resume: string[];
}
export interface TrialBuild {
  profile: TrialProfile;
  library: TrialLibraryEntry[];
  resume: string[];
}
/** 独立试作协议；可选build为冻结角色/简历快照，兼容此前无build记录。 */
export interface TrialState {
  version: 1;
  runId: string;
  seed: number;
  rngState: number;
  commandSeq: number;
  phase: TrialPhase;
  stage: number;
  build?: TrialBuild;
  player: {
    hp: number;
    maxHp: number;
    energy: number;
    block: number;
    nextAttackBonus: number;
    attacksPlayed: number;
  };
  battle: {
    turn: number;
    hpBefore: number;
    enemyHp: number;
    enemyBlock: number;
    drawPile: string[];
    hand: string[];
    discardPile: string[];
    exhaustPile: string[];
  };
  deck: CardInstance[];
  rewards: CardId[];
  chosenCards: CardId[];
  summaries: TrialBattleSummary[];
  log: TrialLogEntry[];
}

interface CommandIdentity {
  runId: string;
  seq: number;
}

export type TrialCommand = CommandIdentity &
  (
    | { type: 'play'; cardInstanceId: string }
    | { type: 'end-turn' }
    | { type: 'confirm-discard'; cardInstanceIds: string[] }
    | { type: 'cancel-discard' }
    | { type: 'choose-reward'; cardId: CardId | null }
    | { type: 'retreat' }
  );
