import type { PlayerStats } from '../../types';
import type { AdventureBattlePlan } from '../interactive/adventureBattle';
import { CARDS } from '../card-battle/catalog';
import type { ResolvedBattleCard } from '../card-battle/types';
import { getDungeonCardSources } from './sources';
import type { CardLoadout } from './loadout';
import { validateDungeonLoadout } from './loadout';
import { DUNGEON_CARD_COEFFICIENTS, getDungeonCardBudgets } from './budgets';
import type { DungeonCardCoefficients } from './budgets';
export { DUNGEON_CARD_COEFFICIENTS, getDungeonCardBudgets } from './budgets';
export type { DungeonCardCoefficients } from './budgets';
const ATTRIBUTE_NAMES = {
  attack: '攻击',
  defense: '防御',
  spirit: '思维',
  physique: '体能',
  speed: '手速',
} as const;
const raw = (n: number) =>
  n > 0
    ? Math.max(
        1,
        Math.min(Math.floor(Number.MAX_SAFE_INTEGER / 1024), Math.round(n))
      )
    : 0;
export function resolveDungeonCards(
  player: PlayerStats,
  plan: AdventureBattlePlan,
  loadout: CardLoadout,
  coefficients: Readonly<DungeonCardCoefficients> = DUNGEON_CARD_COEFFICIENTS
): ResolvedBattleCard[] {
  const validation = validateDungeonLoadout(player, loadout);
  if (!validation.valid) throw new Error(validation.errors.join(' '));
  const sources = new Map(
    getDungeonCardSources(player).map((source) => [source.id, source])
  );
  const budget = getDungeonCardBudgets(player, plan, coefficients);
  return loadout.resume.map((id) => {
    const source = sources.get(id)!;
    const template = CARDS[source.templateId];
    const card: ResolvedBattleCard = {
      id,
      templateId: source.templateId,
      name: source.name,
      source: source.source,
      sourceId: source.sourceId,
      sourceLabel: source.sourceLabel,
      cost: template.cost,
      kind: template.kind,
      description: '',
    };
    if (template.damage)
      card.damage = raw((template.damage / 6) * budget.attack);
    if (template.block) card.block = raw((template.block / 5) * budget.defense);
    if (template.heal) card.heal = raw((template.heal / 4) * budget.recovery);
    if (template.nextAttackBonus)
      card.nextAttackBonus = raw(
        (template.nextAttackBonus / 6) * budget.attack
      );
    if (template.bonusAfterAttack)
      card.bonusAfterAttack = raw(
        (template.bonusAfterAttack / 6) * budget.attack
      );
    if (template.draw) card.draw = template.draw;
    if (template.clearEnemyBlock) card.clearEnemyBlock = true;
    if (template.exhaust) card.exhaust = true;
    if (template.expose) card.expose = true;
    if (template.counter)
      card.counter = raw((template.counter / 6) * budget.attack);
    if (template.retainBlock)
      card.retainBlock = raw((template.retainBlock / 5) * budget.defense);
    if (template.blockToDamage) card.blockToDamage = template.blockToDamage;
    if (template.blockDamageCap)
      card.blockDamageCap = raw((template.blockDamageCap / 6) * budget.attack);
    if (template.focusGain) card.focusGain = template.focusGain;
    if (template.scaling) {
      const scaling = template.scaling;
      const ticks = Math.min(
        scaling.cap,
        Math.max(0, scaling.coefficient * budget.ratio(scaling.stat))
      );
      const bonus = raw(
        (ticks /
          (scaling.effect === 'damage'
            ? 6
            : scaling.effect === 'block'
              ? 5
              : 4)) *
          (scaling.effect === 'damage'
            ? budget.attackReference
            : scaling.effect === 'block'
              ? budget.defenseReference
              : budget.recoveryReference)
      );
      card[scaling.effect] = (card[scaling.effect] ?? 0) + bonus;
      card.scalingLabel = `${ATTRIBUTE_NAMES[scaling.stat]}加成 +${bonus}（入场 ${Math.max(0, Math.round(player[scaling.stat]))}）`;
    }
    card.description =
      [
        card.clearEnemyBlock ? '清除固守与反震' : '',
        card.damage ? `基础进攻 ${card.damage}` : '',
        card.block ? `获得 ${card.block} 防护` : '',
        card.heal ? `恢复本场损耗 ${card.heal}，不超过入场精力` : '',
        card.draw ? `抽 ${card.draw} 张牌` : '',
        card.nextAttackBonus
          ? `下一次进攻 +${card.nextAttackBonus}，可跨回合保留`
          : '',
        card.bonusAfterAttack
          ? `本回合已进攻时再 +${card.bonusAfterAttack}`
          : '',
        card.expose ? '破绽：下次进攻+25%（一次，不叠加）' : '',
        card.counter ? `本轮挡伤且存活时反击 ${card.counter}` : '',
        card.retainBlock ? `本轮敌袭后最多留盾 ${card.retainBlock}` : '',
        card.blockToDamage
          ? `消耗全部防护，追加其${card.blockToDamage}%进攻（上限${card.blockDamageCap}）`
          : '',
        card.focusGain ? `恢复 ${card.focusGain} 专注，上限3` : '',
        card.exhaust ? '本场一次' : '',
      ]
        .filter(Boolean)
        .join('；') + '。';
    return card;
  });
}
