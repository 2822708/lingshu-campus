import { BATTLE_ART_LAYERS, battleArtUrl } from './battle-art';
import type { LayeredArtId } from './battle-art';
import type { BattleActorCue } from './BattleActor';

export interface ConstructState {
  guard: boolean;
  thorns: boolean;
  lowHealth: boolean;
  defeated: boolean;
}

/** Every part shares the same 960×720 origin; animation never changes combat. */
export function LayeredConstruct({
  art,
  state,
  cue,
}: {
  art: LayeredArtId;
  state: ConstructState;
  cue?: BattleActorCue | null;
}) {
  return (
    <div
      className="ct-layered-construct"
      data-art={art}
      data-guard={state.guard || undefined}
      data-thorns={state.thorns || undefined}
      data-low-health={state.lowHealth || undefined}
      data-defeated={state.defeated || undefined}
      data-repairing={(cue?.enemyHealed ?? 0) > 0 || undefined}
      data-enemy-move={cue?.actor === 'enemy' ? cue.enemyMoveName : undefined}
      aria-hidden="true"
    >
      <div className="ct-layered-canvas">
        {BATTLE_ART_LAYERS[art].map((layer) => (
          <img
            key={layer}
            data-layer={layer}
            src={battleArtUrl(`${art}-${layer}`)}
            alt=""
            draggable={false}
            decoding="async"
          />
        ))}
        {state.guard && <i className="ct-state-guard" />}
        {state.thorns && (
          <i className="ct-state-thorns">
            <b />
            <b />
          </i>
        )}
        {state.lowHealth &&
          !state.defeated &&
          (art === 'repair' || art === 'defense') && (
            <i className="ct-state-half" />
          )}
      </div>
    </div>
  );
}
