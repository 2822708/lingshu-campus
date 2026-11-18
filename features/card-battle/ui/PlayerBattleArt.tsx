import { useState } from 'react';
import { battleArtUrl } from './battle-art';

const POSES = ['strike', 'guard', 'hit'] as const;
type PlayerPose = (typeof POSES)[number];
const decodedPoses = new Set<PlayerPose>();

/** Load once at entry; a cold or failed image keeps the existing idle portrait. */
export function PlayerBattleArt({
  idle,
  pose,
  followedByHit,
}: {
  idle: string;
  pose?: PlayerPose;
  followedByHit: boolean;
}) {
  const [loaded, setLoaded] = useState(() => new Set(decodedPoses));
  const ready =
    (!pose || loaded.has(pose)) && (!followedByHit || loaded.has('hit'));
  return (
    <div
      className="ct-player-poses"
      data-pose={pose}
      data-then-hit={followedByHit || undefined}
      data-ready={ready || undefined}
    >
      <img
        className="ct-actor-art ct-player-idle"
        src={idle}
        alt=""
        draggable={false}
      />
      {POSES.map((value) => (
        <img
          key={value}
          className={
            value === pose
              ? 'ct-actor-art ct-player-pose'
              : followedByHit && value === 'hit'
                ? 'ct-actor-art ct-player-follow-hit'
                : 'ct-player-preload'
          }
          src={battleArtUrl(`player-${value}`)}
          alt=""
          draggable={false}
          onLoad={() => {
            decodedPoses.add(value);
            setLoaded((previous) =>
              previous.has(value) ? previous : new Set([...previous, value])
            );
          }}
        />
      ))}
    </div>
  );
}
