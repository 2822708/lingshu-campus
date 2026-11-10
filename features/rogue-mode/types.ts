import type {
  CardId,
  CardEffects,
  CardBattleState,
  CardBattleAction,
  CardBattleEnemy,
  ResolvedBattleEquipment,
} from '../card-battle/types';
import type { RogueMapProgress } from './routeMap';

export type RogueJobId = 'vanguard' | 'warden' | 'seer';
export type RogueStarterId = 'steady' | 'focused';
export type RogueNodeKind =
  | 'battle'
  | 'elite'
  | 'boss'
  | 'camp'
  | 'shop'
  | 'event';
export type RoguePhase =
  | 'route'
  | 'battle'
  | 'reward'
  | 'camp'
  | 'shop'
  | 'event'
  | 'defeat'
  | 'complete';
export interface RogueCard {
  id: string;
  cardId: CardId;
  level: 0 | 1 | 2;
}
export interface RogueCardDefinition extends CardEffects {
  id: CardId;
  name: string;
  origin: string;
  job?: RogueJobId;
  rarity: 'common' | 'uncommon' | 'rare';
}
export interface RogueJobDefinition {
  id: RogueJobId;
  name: string;
  description: string;
  hp: number;
  attack: number;
  defense: number;
  speed: number;
  starterRelic: string;
  starters: Array<{
    id: RogueStarterId;
    name: string;
    description: string;
    cards: CardId[];
  }>;
}
export interface RogueRelicDefinition {
  id: string;
  name: string;
  origin: string;
  description: string;
  effect: ResolvedBattleEquipment['effect'];
  amount: number;
}
export interface RogueRoom {
  id: string;
  nodeId?: string;
  name: string;
  description: string;
  enemy: Omit<CardBattleEnemy, 'guardRounds'>;
}
export interface RogueReward {
  id: string;
  gold: number;
  cards: CardId[];
  relics: string[];
  stage: 'card' | 'relic';
}
export interface RogueHistoryEntry {
  floor: number;
  kind: RogueNodeKind;
  label: string;
}
export interface RogueRun {
  version: 1;
  runId: string;
  seed: number;
  rngState: number;
  seq: number;
  jobId: RogueJobId;
  starterId: RogueStarterId;
  floor: number;
  cleared: number;
  phase: RoguePhase;
  hp: number;
  maxHp: number;
  gold: number;
  deck: RogueCard[];
  relics: string[];
  rooms: RogueRoom[];
  map?: RogueMapProgress;
  battle?: CardBattleState;
  reward?: RogueReward;
  shopRelic?: string;
  history: RogueHistoryEntry[];
  lastMessage: string;
}
export type RogueAction =
  | { type: 'choose-node'; id: string }
  | { type: 'choose-room'; id: string }
  | { type: 'battle'; action: CardBattleAction }
  | { type: 'settle-battle' }
  | { type: 'choose-card'; cardId: CardId | null }
  | { type: 'choose-relic'; relicId: string | null }
  | { type: 'camp'; choice: 'heal' | 'upgrade' | 'remove'; cardId?: string }
  | {
      type: 'shop';
      choice: 'heal' | 'upgrade' | 'relic' | 'leave';
      cardId?: string;
    }
  | { type: 'event'; choice: 'supplies' | 'risk' | 'remove'; cardId?: string };
export type RogueCommand = RogueAction & { runId: string; seq: number };
export interface CreateRogueRunOptions {
  runId: string;
  seed: number;
  jobId: RogueJobId;
  starterId: RogueStarterId;
}
