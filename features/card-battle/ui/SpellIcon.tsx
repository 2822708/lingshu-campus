import type { CardEffects } from '../types';

export type SpellIconRole =
  | 'attack'
  | 'guard'
  | 'draw'
  | 'charge'
  | 'break'
  | 'counter';

/** Mechanism marks describe frozen card effects, including course/equipment cards. */
export function getSpellIconRole(card: CardEffects): SpellIconRole {
  if (card.clearEnemyBlock) return 'break';
  if (card.counter) return 'counter';
  if (card.nextAttackBonus || card.focusGain) return 'charge';
  if (card.damage || card.blockToDamage || card.expose) return 'attack';
  if (card.block || card.retainBlock || card.heal) return 'guard';
  if (card.draw) return 'draw';
  return card.kind === 'attack' ? 'attack' : 'guard';
}

/** Six original engraving marks share a 24px grid and remain distinct at 16px. */
export function SpellIcon({ role }: { role: SpellIconRole }) {
  const paths = {
    attack: (
      <>
        <path d="m6 19 2-7L18 3l3 3-9 10-6 3Z" />
        <path d="m8 12 4 4M10 11l3 3M5 15l4 4M4 20l2-2M14 8l3-3" />
      </>
    ),
    guard: (
      <>
        <path d="M12 3 4 6v7c0 4 5 7 8 9 3-2 8-5 8-9V6l-8-3Z" />
        <path d="m12 7-4 2v4c0 2 2 4 4 5 2-1 4-3 4-5V9l-4-2ZM5 8l2 1m10 0 2-1M6 15l2-1m8 0 2 1" />
      </>
    ),
    draw: (
      <>
        <path d="M5 7h12v14H5zM8 4h12v14M11 1h12v14" />
        <path d="M8 11h6m-6 3h6m-6 3h3M2 10v8m-1-2 1 2 1-2" />
      </>
    ),
    charge: (
      <>
        <path d="M12 3v4m0 10v4M3 12h4m10 0h4M5 5l3 3m8 8 3 3M5 19l3-3m8-8 3-3" />
        <path d="m12 7 5 5-5 5-5-5 5-5Z" />
        <path d="m10 11 2-1 2 2-2 2" />
      </>
    ),
    break: (
      <>
        <path d="m9 3-6 3v7c0 3 2 5 5 7l2-5-2-3 3-4-2-5Zm5 0 6 3v7c0 3-2 5-5 7l-1-4 3-4-3-2 2-4-2-3Z" />
        <path d="m8 7-2 1v4m12-4-2-1M12 2l-1 3m2 15-2 2" />
      </>
    ),
    counter: (
      <>
        <path d="M5 11a7 7 0 1 1 2 7M5 11V5m0 6h6" />
        <path d="m10 17 4-7 2 1-1 8-5-2ZM13 13l2 1M20 10l-2 1m0 7-1-1" />
      </>
    ),
  };
  return (
    <svg
      data-spell-icon={role}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {paths[role]}
    </svg>
  );
}
