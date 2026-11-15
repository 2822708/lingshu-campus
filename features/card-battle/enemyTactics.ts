import type { CardBattleState, CardEnemyTactic } from './types';

const TACTICS = {
  charge: {
    label: '蓄能重击',
    hint: '本轮打出两张带伤害的牌，重击减半。',
  },
  'lock-on': {
    label: '锁定追击',
    hint: '结束回合时没有防护，来袭提高 35%。',
  },
  feedback: {
    label: '连击回授',
    hint: '本轮打出两张带伤害的牌，来袭提高 35%。',
  },
  overload: {
    label: '过载催逼',
    hint: '本轮没打出带伤害的牌，来袭提高 35%。',
  },
} satisfies Record<CardEnemyTactic, { label: string; hint: string }>;

export function isEnemyTactic(value: unknown): value is CardEnemyTactic {
  return typeof value === 'string' && Object.hasOwn(TACTICS, value);
}

export function getEnemyTactic(state: CardBattleState) {
  const { tactic } = state.intent;
  if (!tactic) return;
  const { attacksPlayed, block } = state.player;
  const multiplier = {
    charge: attacksPlayed >= 2 ? 0.5 : 1,
    'lock-on': block === 0 ? 1.35 : 1,
    feedback: attacksPlayed >= 2 ? 1.35 : 1,
    overload: attacksPlayed === 0 ? 1.35 : 1,
  }[tactic];
  return { ...TACTICS[tactic], multiplier };
}
