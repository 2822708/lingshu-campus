import type { playSound } from '../../../utils/sound';
import type { BattleActorCue } from './BattleActor';
import type { BattlePresentation } from './battle-art';

type SoundName = Parameters<typeof playSound>[0];
export interface BattleSoundCue {
  name: SoundName;
  delay: number;
}

/** Only called for a successful committed command, never while restoring a save. */
export function getConstructSounds(
  presentation: BattlePresentation | undefined,
  cue: BattleActorCue,
  release: number
): BattleSoundCue[] {
  if (!presentation || presentation === 'calculus') return [];
  const sounds: BattleSoundCue[] = [];
  const contact = release + 90;
  if (cue.actor === 'enemy') {
    const name: SoundName | undefined = (
      {
        正反馈成环: 'trial-ring',
        谐振脉冲: 'trial-ring',
        断电校准: 'trial-cutoff',
        宽带噪声: 'trial-noise-wide',
        尖峰干扰: 'trial-noise-spike',
        信道切换: 'trial-cutoff',
        论证护阵: 'trial-ring',
        结业劫雷: 'trial-thunder',
      } as Record<string, SoundName>
    )[cue.enemyMoveName ?? ''];
    if (name) sounds.push({ name, delay: release });
  }
  if ((cue.reflected ?? 0) > 0)
    sounds.push({ name: 'trial-feedback', delay: contact + 65 });
  if ((cue.enemyHealed ?? 0) > 0)
    sounds.push({ name: 'trial-repair', delay: contact });
  return sounds;
}
