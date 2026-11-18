import type { CardEnemyArchetype } from '../types';

/** Presentation identifiers are separate from frozen mechanics and saved runs. */
export type BattlePresentation =
  | 'calculus'
  | 'resonator'
  | 'noise'
  | 'repair'
  | 'defense';
export type BattleChapterScene =
  | 'study'
  | 'circuit'
  | 'terminal'
  | 'workshop'
  | 'defense';
export type LayeredArtId =
  | Exclude<BattlePresentation, 'calculus'>
  | `elite-${CardEnemyArchetype}`;

// Vite expands this one-directory template into bundled, base-aware URLs.
export function battleArtUrl(name: string) {
  return new URL(`./assets/batch-two/${name}.webp`, import.meta.url).href;
}

export const BATTLE_ART_LAYERS: Record<LayeredArtId, readonly string[]> = {
  resonator: ['rear-ring', 'front-ring', 'base', 'core'],
  noise: ['tail-wide', 'tail-spike', 'body', 'waveform'],
  repair: ['frame', 'wiring', 'shoulder', 'module'],
  defense: ['back-frame', 'shield', 'page', 'front-frame', 'focus'],
  'elite-duelist': ['body', 'part'],
  'elite-sentinel': ['body', 'part'],
  'elite-sprinter': ['part', 'body'],
  'elite-disruptor': ['body', 'part'],
  'elite-regenerator': ['body', 'part'],
  'elite-counterguard': ['body', 'part'],
};

export const BATTLE_ART_HOTSPOTS: Record<
  LayeredArtId,
  readonly [number, number]
> = {
  resonator: [439, 334],
  noise: [385, 470],
  repair: [460, 350],
  defense: [480, 625],
  'elite-duelist': [480, 360],
  'elite-sentinel': [480, 480],
  'elite-sprinter': [430, 475],
  'elite-disruptor': [480, 444],
  'elite-regenerator': [420, 465],
  'elite-counterguard': [480, 415],
};

export function getBossPresentation(
  floor: number,
  boss: boolean
): BattlePresentation | undefined {
  if (!boss) return undefined;
  return (
    {
      10: 'calculus',
      20: 'resonator',
      30: 'noise',
      40: 'repair',
      50: 'defense',
    } as const
  )[floor as 10 | 20 | 30 | 40 | 50];
}

export function getChapterScene(chapter: number): BattleChapterScene {
  return (['study', 'circuit', 'terminal', 'workshop', 'defense'] as const)[
    Math.max(0, Math.min(4, chapter - 1))
  ];
}
