import { EquipmentSlot, ItemType } from '../../types';
import type { Item, PlayerStats } from '../../types';
import type { CardId, ResolvedBattleEquipment } from '../card-battle/types';
import type { AdventureBattlePlan } from '../interactive/adventureBattle';
import { getDungeonCardBudgets } from './budgets';

export interface EquipmentBattleDefinition {
  name: string;
  type: ItemType;
  slots: readonly EquipmentSlot[];
  card: CardId;
  effect: ResolvedBattleEquipment['effect'];
  coefficient: number;
  budget: 'attack' | 'defense' | 'fixed';
  description: string;
}
const artifactSlots = [EquipmentSlot.Artifact1, EquipmentSlot.Artifact2];
const ringSlots = [
  EquipmentSlot.Ring1,
  EquipmentSlot.Ring2,
  EquipmentSlot.Ring3,
  EquipmentSlot.Ring4,
];
const accessorySlots = [EquipmentSlot.Accessory1, EquipmentSlot.Accessory2];
/** Name/type/slot metadata also recognizes existing items, without rewriting saves. */
export const EQUIPMENT_BATTLE_DEFINITIONS: readonly EquipmentBattleDefinition[] =
  [
    {
      name: '入门薄膜键盘',
      type: ItemType.Weapon,
      slots: [EquipmentSlot.Weapon],
      card: 'gear-keyboard',
      effect: 'first-attack',
      coefficient: 0.25,
      budget: 'attack',
      description:
        '每回合首次进攻追加少量损耗。装备后自动生效，无需把装备牌放入简历。',
    },
    {
      name: '军训迷彩服',
      type: ItemType.Armor,
      slots: [EquipmentSlot.Chest],
      card: 'gear-uniform',
      effect: 'opening-block',
      coefficient: 0.75,
      budget: 'defense',
      description: '入场时获得防护。装备后自动生效，无需把装备牌放入简历。',
    },
    {
      name: '青轴机械键盘',
      type: ItemType.Weapon,
      slots: [EquipmentSlot.Weapon],
      card: 'gear-mechanical',
      effect: 'first-attack',
      coefficient: 0.4,
      budget: 'attack',
      description:
        '每回合首次进攻追加损耗，强于入门薄膜键盘。装备后自动生效，无需把装备牌放入简历。',
    },
    {
      name: '静音红轴键盘',
      type: ItemType.Weapon,
      slots: [EquipmentSlot.Weapon],
      card: 'gear-red-switch',
      effect: 'opening-draw',
      coefficient: 1,
      budget: 'fixed',
      description:
        '入场时额外抽 1 张牌。装备后自动生效，无需把装备牌放入简历。',
    },
    {
      name: '智能手环',
      type: ItemType.Ring,
      slots: ringSlots,
      card: 'gear-band',
      effect: 'retain-block',
      coefficient: 0.4,
      budget: 'defense',
      description:
        '每轮敌袭后保留少量未消耗防护。装备后自动生效，无需把装备牌放入简历。',
    },
    {
      name: '实验室工牌',
      type: ItemType.Accessory,
      slots: accessorySlots,
      card: 'gear-badge',
      effect: 'first-defense',
      coefficient: 0.4,
      budget: 'defense',
      description:
        '每回合首次打出防御牌时额外获得防护。装备后自动生效，无需把装备牌放入简历。',
    },
    {
      name: '降噪耳塞',
      type: ItemType.Artifact,
      slots: artifactSlots,
      card: 'gear-earplugs',
      effect: 'opening-draw',
      coefficient: 1,
      budget: 'fixed',
      description:
        '入场时额外抽 1 张牌。装备后自动生效，无需把装备牌放入简历。',
    },
    {
      name: '运动护腕',
      type: ItemType.Artifact,
      slots: artifactSlots,
      card: 'gear-wrist',
      effect: 'guard-counter',
      coefficient: 0.25,
      budget: 'attack',
      description:
        '本轮抵挡来袭且存活时追加反击；每轮只触发一次。装备后自动生效，无需把装备牌放入简历。',
    },
    {
      name: '双屏支架',
      type: ItemType.Artifact,
      slots: artifactSlots,
      card: 'gear-monitor',
      effect: 'first-defense',
      coefficient: 0.6,
      budget: 'defense',
      description:
        '每回合首次打出防御牌时额外获得防护。装备后自动生效，无需把装备牌放入简历。',
    },
    {
      name: '笔记本散热底座',
      type: ItemType.Artifact,
      slots: artifactSlots,
      card: 'gear-cooler',
      effect: 'retain-block',
      coefficient: 0.6,
      budget: 'defense',
      description:
        '每轮敌袭后保留部分未消耗防护。装备后自动生效，无需把装备牌放入简历。',
    },
  ];

export function getEquipmentBattleDefinition(
  item: Item,
  slot?: EquipmentSlot
): EquipmentBattleDefinition | undefined {
  if (!item?.isEquippable) return undefined;
  const target = slot ?? item.equipmentSlot;
  if (!target) return undefined;
  return EQUIPMENT_BATTLE_DEFINITIONS.find(
    (definition) =>
      definition.name === item.name &&
      definition.type === item.type &&
      definition.slots.includes(target)
  );
}

/** Only one unambiguous, owned inventory instance per equipped ID can contribute. */
export function getEquippedDungeonEquipment(player: PlayerStats) {
  const equipped = new Map<string, EquipmentSlot[]>();
  for (const [slot, id] of Object.entries(player.equippedItems ?? {})) {
    if (id)
      equipped.set(id, [...(equipped.get(id) ?? []), slot as EquipmentSlot]);
  }
  const result: Array<{ item: Item; definition: EquipmentBattleDefinition }> =
    [];
  for (const [id, slots] of equipped) {
    const matches = player.inventory.filter((item) => item.id === id);
    if (matches.length !== 1) continue;
    const item = matches[0];
    if (!Number.isSafeInteger(item.quantity) || item.quantity < 1) continue;
    const definition = slots
      .map((slot) => getEquipmentBattleDefinition(item, slot))
      .find(Boolean);
    if (definition) result.push({ item, definition });
  }
  return result;
}

export interface DungeonEquipmentTrait {
  id: string;
  sourceId: string;
  name: string;
  effect: ResolvedBattleEquipment['effect'];
  description: string;
  templateId: CardId;
}
export function getDungeonEquipmentTraits(
  player: PlayerStats
): DungeonEquipmentTrait[] {
  return getEquippedDungeonEquipment(player).map(({ item, definition }) => ({
    id: `equipment:${item.id}`,
    sourceId: item.id,
    name: item.name,
    effect: definition.effect,
    description: definition.description,
    templateId: definition.card,
  }));
}

export function resolveDungeonEquipment(
  player: PlayerStats,
  plan: AdventureBattlePlan
): ResolvedBattleEquipment[] {
  const budgets = getDungeonCardBudgets(player, plan);
  return getEquippedDungeonEquipment(player).map(({ item, definition }) => {
    const amount = Math.max(
      1,
      Math.min(
        Math.floor(Number.MAX_SAFE_INTEGER / 1024),
        Math.round(
          definition.coefficient *
            (definition.budget === 'fixed' ? 1 : budgets[definition.budget])
        )
      )
    );
    const descriptions: Record<ResolvedBattleEquipment['effect'], string> = {
      'opening-block': `入场获得 ${amount} 防护`,
      'opening-draw': `入场额外抽 ${amount} 张牌`,
      'first-attack': `每回合首次进攻追加 ${amount} 损耗`,
      'first-defense': `每回合首次防御额外获得 ${amount} 防护`,
      'guard-counter': `抵挡来袭且存活时反击 ${amount} 损耗，每轮一次`,
      'retain-block': `每轮敌袭后最多保留 ${amount} 未消耗防护`,
    };
    return {
      id: `equipment:${item.id}`,
      sourceId: item.id,
      name: item.name,
      effect: definition.effect,
      amount,
      description: `${descriptions[definition.effect]}。装备自动生效。`,
    };
  });
}
