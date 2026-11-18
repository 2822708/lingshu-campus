import type { CSSProperties } from 'react';
import { PlayerBattleArt } from './PlayerBattleArt';
import type { CardEnemyArchetype, ResolvedBattleCard } from '../types';
import { TrialConstruct } from './TrialConstruct';
import { LayeredConstruct } from './LayeredConstruct';
import type { ConstructState } from './LayeredConstruct';
import { BATTLE_ART_HOTSPOTS } from './battle-art';
import type { BattlePresentation } from './battle-art';

/** Shared presentation cue. It contains no game state or storage dependency. */
export interface BattleActorCue {
  key: string;
  action: string;
  actor: 'player' | 'enemy' | 'none';
  playedCard?: Pick<ResolvedBattleCard, 'name' | 'kind' | 'cost'>;
  playerDamage: number;
  enemyDamage: number;
  playerBlock: number;
  enemyBlock: number;
  blocked: number;
  healed: number;
  enemyHealed?: number;
  enemyMoveName?: string;
  reflected?: number;
  piercing?: number;
  drawn: number;
  brokeBlock: number;
  guardLabel?: string;
  breakLabel?: string;
  statusNote?: string;
  statusTarget?: 'player' | 'enemy';
  outcome: 'victory' | 'defeat' | null;
}

interface BattleActorProps {
  side: 'player' | 'enemy';
  variant?: number;
  archetype?: CardEnemyArchetype;
  cue?: BattleActorCue | null;
  setting?: 'campus' | 'trial';
  presentation?: BattlePresentation;
  elite?: boolean;
  constructState?: ConstructState;
}

type PortraitId = 'player' | 'duelist' | 'sentinel';
const IMPACT_ANGLES = [-152, -113, -66, -31, 3, 47, 111, 156];

// Static URLs are bundled by Vite for both entry points and remain SSR-safe.
const PORTRAITS: Record<PortraitId, string> = {
  player: new URL('./assets/print-player.webp', import.meta.url).href,
  duelist: new URL('./assets/print-duelist.webp', import.meta.url).href,
  sentinel: new URL('./assets/print-sentinel.webp', import.meta.url).href,
};

/** Three shared base portraits; identity never changes battle rules or saves. */
function getPortrait(
  side: BattleActorProps['side'],
  archetype: CardEnemyArchetype | undefined,
  variant: number
): PortraitId {
  if (side === 'player') return 'player';
  switch (archetype) {
    case 'sentinel':
    case 'counterguard':
    case 'regenerator':
      return 'sentinel';
    case 'duelist':
    case 'sprinter':
    case 'disruptor':
      return 'duelist';
    default:
      return variant === 1 ? 'sentinel' : 'duelist';
  }
}
/** 只呈现已成功保存的动作，不参与任何结算或存档。 */
export function BattleActor({
  side,
  variant = 0,
  archetype,
  cue = null,
  setting = 'campus',
  presentation,
  elite = false,
  constructState = {
    guard: false,
    thorns: false,
    lowHealth: false,
    defeated: false,
  },
}: BattleActorProps) {
  const portrait = getPortrait(side, archetype, variant);
  const damage =
    side === 'player' ? (cue?.playerDamage ?? 0) : (cue?.enemyDamage ?? 0);
  const blockGain =
    side === 'player' ? (cue?.playerBlock ?? 0) : (cue?.enemyBlock ?? 0);
  const blocked = cue?.actor !== side ? (cue?.blocked ?? 0) : 0;
  const attacking =
    cue?.actor === side &&
    (side === 'player'
      ? cue.action === 'attack' || cue.enemyDamage > 0
      : cue.playerDamage > 0 || cue.blocked > 0);
  const downed =
    (side === 'enemy' && cue?.outcome === 'victory') ||
    (side === 'player' && cue?.outcome === 'defeat');
  const classes = [
    'ct-actor-scene',
    attacking ? 'is-attacking' : '',
    damage > 0 ? 'is-hit' : '',
    blockGain > 0 || blocked > 0 ? 'is-guarding' : '',
    downed ? 'is-downed' : '',
    side === 'player' && cue?.action === 'charge' ? 'is-charging' : '',
  ]
    .filter(Boolean)
    .join(' ');
  const layeredArt =
    presentation && presentation !== 'calculus'
      ? presentation
      : elite && archetype
        ? (`elite-${archetype}` as const)
        : undefined;
  const playerPose = attacking
    ? 'strike'
    : blockGain > 0 || blocked > 0
      ? 'guard'
      : damage > 0
        ? 'hit'
        : undefined;
  const followedByHit = damage > 0 && playerPose !== 'hit';
  return (
    <div
      className={`ct-actor ct-actor-${side}`}
      data-action={cue?.action ?? 'idle'}
      data-portrait={portrait}
      data-setting={setting}
      data-contact={
        blocked > 0 ? (damage > 0 ? 'partial' : 'blocked') : undefined
      }
      data-presentation={presentation}
      data-layered={layeredArt}
      data-reflected={
        (side === 'player' && (cue?.reflected ?? 0) > 0) || undefined
      }
      style={
        layeredArt
          ? ({
              '--ct-core-x': BATTLE_ART_HOTSPOTS[layeredArt][0] / 960 - 0.5,
              '--ct-core-y': (680 - BATTLE_ART_HOTSPOTS[layeredArt][1]) / 720,
            } as CSSProperties)
          : undefined
      }
      aria-hidden="true"
    >
      <div key={cue?.key ?? 'idle'} className={classes}>
        <div className="ct-actor-image-frame">
          <div className="ct-actor-figure">
            {setting === 'trial' && side === 'enemy' ? (
              layeredArt ? (
                <LayeredConstruct
                  art={layeredArt}
                  state={constructState}
                  cue={cue}
                />
              ) : (
                <TrialConstruct
                  archetype={archetype}
                  presentation={
                    presentation === 'calculus' ? 'calculus' : undefined
                  }
                />
              )
            ) : side === 'player' &&
              setting === 'trial' &&
              presentation !== 'calculus' ? (
              <PlayerBattleArt
                idle={PORTRAITS.player}
                pose={playerPose}
                followedByHit={followedByHit}
              />
            ) : (
              <img
                className="ct-actor-art"
                src={PORTRAITS[portrait]}
                alt=""
                aria-hidden="true"
                draggable={false}
                decoding="async"
              />
            )}
          </div>
        </div>
        {attacking && (
          <span className="ct-effect-swipe">
            <i />
            <i />
          </span>
        )}
        {(blockGain > 0 || blocked > 0) && (
          <span className="ct-effect-shield" />
        )}
        {damage > 0 && (
          <>
            <span className="ct-impact">
              {IMPACT_ANGLES.map((angle) => (
                <i
                  key={angle}
                  style={{ '--ct-spark-angle': `${angle}deg` } as CSSProperties}
                />
              ))}
            </span>
            <b className="ct-effect-number ct-effect-damage">−{damage}</b>
          </>
        )}
        {blocked > 0 && (
          <span className="ct-effect-note ct-effect-block">挡住 {blocked}</span>
        )}
        {side === 'player' && (cue?.reflected ?? 0) > 0 && (
          <span className="ct-effect-note ct-effect-reflected">
            反震 −{cue?.reflected}
          </span>
        )}
        {side === 'player' && (cue?.piercing ?? 0) > 0 && (
          <span className="ct-effect-note ct-effect-piercing">
            穿透 {cue?.piercing}
          </span>
        )}
        {blockGain > 0 && (
          <span className="ct-effect-note ct-effect-block-gain">
            {cue?.guardLabel ?? `防护 +${blockGain}`}
          </span>
        )}
        {side === 'player' && (cue?.healed ?? 0) > 0 && (
          <b className="ct-effect-number ct-effect-heal">+{cue?.healed}</b>
        )}
        {side === 'enemy' && (cue?.enemyHealed ?? 0) > 0 && (
          <b className="ct-effect-number ct-effect-heal">+{cue?.enemyHealed}</b>
        )}
        {cue?.statusNote && cue.statusTarget === side && (
          <span className="ct-effect-note ct-effect-status">
            {cue.statusNote}
          </span>
        )}
        {side === 'player' && (cue?.drawn ?? 0) > 0 && (
          <span className="ct-effect-note ct-effect-draw">
            抽牌 +{cue?.drawn}
          </span>
        )}
        {side === 'enemy' && (cue?.brokeBlock ?? 0) > 0 && (
          <span className="ct-effect-break">
            <i />
            <i />
            <i />
            <b>{cue?.breakLabel ?? `破防 ${cue?.brokeBlock}`}</b>
          </span>
        )}
        {side === 'player' && cue?.action === 'charge' && (
          <span className="ct-effect-note ct-effect-charge">蓄势</span>
        )}
      </div>
    </div>
  );
}
