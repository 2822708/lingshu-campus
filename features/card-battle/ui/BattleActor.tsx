import type { CardEnemyArchetype } from '../types';
import { TrialConstruct } from './TrialConstruct';

/** Shared presentation cue. It contains no game state or storage dependency. */
export interface BattleActorCue {
  key: string;
  action: string;
  actor: 'player' | 'enemy' | 'none';
  playerDamage: number;
  enemyDamage: number;
  playerBlock: number;
  enemyBlock: number;
  blocked: number;
  healed: number;
  enemyHealed?: number;
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
}

type PortraitId = 'player' | 'duelist' | 'sentinel';

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
  return (
    <div
      className={`ct-actor ct-actor-${side}`}
      data-action={cue?.action ?? 'idle'}
      data-portrait={portrait}
      data-setting={setting}
      aria-hidden="true"
    >
      <div key={cue?.key ?? 'idle'} className={classes}>
        <div className="ct-actor-image-frame">
          <div className="ct-actor-figure">
            {setting === 'trial' && side === 'enemy' ? (
              <TrialConstruct archetype={archetype} />
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
          <b className="ct-effect-number ct-effect-damage">−{damage}</b>
        )}
        {blocked > 0 && (
          <span className="ct-effect-note ct-effect-block">挡住 {blocked}</span>
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
