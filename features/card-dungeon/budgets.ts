import { REALM_DATA, REALM_ORDER } from '../../constants';
import type { PlayerStats } from '../../types';
import type { AdventureBattlePlan } from '../interactive/adventureBattle';

import type { CardAttribute } from '../card-battle/types';

export interface DungeonCardCoefficients {
  attack: number;
  defense: number;
  recovery: number;
}
export const DUNGEON_CARD_COEFFICIENTS: Readonly<DungeonCardCoefficients> =
  Object.freeze({ attack: 0.35, defense: 0.2, recovery: 0.5 });
const BASE_STAT = {
  attack: 'baseAttack',
  defense: 'baseDefense',
  spirit: 'baseSpirit',
  physique: 'basePhysique',
  speed: 'baseSpeed',
} as const;
const finite = (n: number) => (Number.isFinite(n) ? Math.max(0, n) : 0);
const raw = (n: number) =>
  n > 0
    ? Math.max(
        1,
        Math.min(Math.floor(Number.MAX_SAFE_INTEGER / 1024), Math.round(n))
      )
    : 0;
function attackBudget(
  attack: number,
  speed: number,
  enemy: AdventureBattlePlan['enemy']
): number {
  const a = finite(attack);
  const s = finite(speed);
  const base = Math.max(5, a * 0.25, a * 0.9 - finite(enemy.defense) * 0.45);
  const crit = 0.08 + (0.2 * s) / ((s || 1) + finite(enemy.speed) + 1);
  return base * 1.025 * (1 + 0.5 * crit);
}
export function getDungeonCardBudgets(
  player: PlayerStats,
  plan: AdventureBattlePlan,
  coefficients: Readonly<DungeonCardCoefficients> = DUNGEON_CARD_COEFFICIENTS
) {
  if (
    ![coefficients.attack, coefficients.defense, coefficients.recovery].every(
      (n) => Number.isFinite(n) && n >= 0 && n <= 4
    )
  )
    throw new Error('卡牌预算系数无效。');
  const realm = plan.request.realmMinRealm ?? player.realm;
  if (!REALM_ORDER.includes(realm)) throw new Error('副本学阶无效。');
  const referenceLevel = Math.max(
    1,
    Math.min(9, Math.floor(player.realmLevel))
  );
  const scale = 1 + (referenceLevel - 1) * 0.1;
  const base = REALM_DATA[realm];
  const attack = raw(
    coefficients.attack * attackBudget(player.attack, player.speed, plan.enemy)
  );
  const defense = raw(coefficients.defense * finite(player.defense));
  const recovery = raw(coefficients.recovery * defense);
  const attackReference = raw(
    coefficients.attack *
      attackBudget(base.baseAttack * scale, base.baseSpeed * scale, plan.enemy)
  );
  const defenseReference = raw(coefficients.defense * base.baseDefense * scale);
  const recoveryReference = raw(coefficients.recovery * defenseReference);
  return {
    attack,
    defense,
    recovery,
    attackReference,
    defenseReference,
    recoveryReference,
    referenceLevel,
    referenceRealm: realm,
    ratio: (stat: CardAttribute) =>
      finite(player[stat]) / (base[BASE_STAT[stat]] * scale),
  };
}
