import { getChapter, getShopPrices } from './catalog';
import { getRogueFloor } from './floors';
import type { RogueRun } from './types';

/** The same quote drives button availability, previews, and command settlement. */
export function getRogueServiceQuote(run: RogueRun) {
  const chapter = getChapter(run.floor) - 1;
  const remainingCredits = 1_000_000 - run.gold;
  const available = (credits: number) => Math.min(remainingCredits, credits);
  const recovery = (percent: number) =>
    Math.min(run.maxHp - run.hp, Math.ceil(run.maxHp * (percent / 100)));
  const discount = (price: number, amount: number) =>
    Math.max(0, price - amount);
  const floor =
    run.floorRulesVersion === 1 ? getRogueFloor(run.floor) : undefined;
  const camp = {
    heal: recovery(30),
    healCredits: 0,
    upgradeHeal: 0,
    upgradeCredits: 0,
    removeHeal: 0,
    removeCredits: 0,
  };
  const shop = {
    ...getShopPrices(run),
    healAmount: recovery(30),
    upgradeHeal: 0,
    relicHeal: 0,
  };
  const event = {
    supplies: available(20 + chapter * 5),
    suppliesHeal: 0,
    riskHp: 8,
    riskCredits: available(45 + chapter * 10),
    removeCost: 15,
  };
  const style = floor?.service.style;
  const strength = floor?.service.strength ?? 0;
  const recoveryBonus = recovery(4 + 2 * strength);

  switch (style) {
    case 'recovery':
      camp.heal = recovery(30 + 5 * strength);
      shop.heal = discount(shop.heal, 4 * strength);
      event.suppliesHeal = recoveryBonus;
      break;
    case 'upgrade':
      camp.upgradeCredits = available(6 * strength);
      shop.upgrade = discount(shop.upgrade, 6 * strength);
      event.riskCredits = available(45 + chapter * 10 + 8 * strength);
      break;
    case 'salvage':
      camp.removeCredits = available(8 * strength);
      shop.relic = discount(shop.relic, 4 * strength);
      event.removeCost = discount(event.removeCost, 3 * strength);
      break;
    case 'fieldwork':
      camp.upgradeHeal = recoveryBonus;
      shop.upgradeHeal = recoveryBonus;
      event.riskHp += strength;
      event.riskCredits = available(45 + chapter * 10 + 9 * strength);
      break;
    case 'supply':
      camp.healCredits = available(5 * strength);
      shop.heal = discount(shop.heal, 2 * strength);
      shop.upgrade = discount(shop.upgrade, 2 * strength);
      shop.relic = discount(shop.relic, 2 * strength);
      event.supplies = available(20 + chapter * 5 + 7 * strength);
      break;
    case 'fabrication':
      camp.removeHeal = recoveryBonus;
      shop.relicHeal = recoveryBonus;
      event.riskHp = Math.max(1, event.riskHp - strength);
      event.riskCredits = available(45 + chapter * 10 + 3 * strength);
      break;
  }

  return { title: floor?.title, camp, shop, event };
}

export function describeRogueServiceBonus(heal: number, credits = 0): string {
  if (heal && credits) return ` 另恢复${heal}精力、获得${credits}试炼学分。`;
  if (heal) return ` 另恢复${heal}精力。`;
  if (credits) return ` 另获得${credits}试炼学分。`;
  return '';
}
