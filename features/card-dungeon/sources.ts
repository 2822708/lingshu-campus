import { CULTIVATION_ARTS } from '../../constants';
import type { CultivationArt, PlayerStats } from '../../types';
import { CARDS, STARTER_DECK } from '../card-battle/catalog';
import type { CardDefinition, CardId } from '../card-battle/types';
import { getEquippedDungeonEquipment } from './equipment';

export interface DungeonCardSource {
  id: string;
  templateId: CardId;
  name: string;
  source: 'basic' | 'course' | 'equipment';
  sourceId: string;
  sourceLabel: string;
  description: string;
}
const COURSE_CARDS: Readonly<Record<string, CardId>> = {
  'art-basic-breath': 'course-code',
  'art-iron-skin': 'course-early',
  'art-spirit-cloud': 'course-math',
  'art-fiery-fist': 'course-algorithms',
  'art-water-mirror': 'course-linear',
  'art-earth-shield': 'course-physics',
};
const TACTIC_CARDS = [
  ['feint', 'tactic-feint'],
  ['riposte', 'tactic-riposte'],
  ['reserve', 'tactic-reserve'],
  ['convert', 'tactic-convert'],
  ['reset', 'tactic-reset'],
  ['observe', 'tactic-observe'],
] as const;
const courseCard = (art: CultivationArt): CardId =>
  COURSE_CARDS[art.id] ??
  (art.type === 'mental'
    ? art.effects.attack
      ? 'course-math'
      : art.effects.defense
        ? 'course-linear'
        : 'course-code'
    : (art.effects.attack ?? 0) > (art.effects.defense ?? 0)
      ? 'course-algorithms'
      : 'course-physics');
/** Preparation describes the mechanic; actual raw values are resolved at entry. */
function describeTemplate(card: CardDefinition): string {
  return (
    [
      card.clearEnemyBlock ? '先清除对手固守与反震' : '',
      card.damage ? '进攻威力随角色攻击与对手防御计算' : '',
      card.block ? '获得防护，抵挡来袭' : '',
      card.heal ? '恢复本场损耗，不超过入场精力' : '',
      card.draw ? `抽 ${card.draw} 张牌` : '',
      card.nextAttackBonus ? '强化下一次进攻，可跨回合保留' : '',
      card.bonusAfterAttack ? '本回合已进攻时追加损耗' : '',
      card.expose ? '标记一次破绽，下一次命中增加25%损耗，不叠加' : '',
      card.counter ? '本轮抵挡来袭且存活时反击，每轮一次' : '',
      card.retainBlock ? '本轮敌袭后可保留部分未消耗防护' : '',
      card.blockToDamage
        ? `消耗出牌前全部防护，按${card.blockToDamage}%追加损耗（有上限）`
        : '',
      card.focusGain ? `恢复${card.focusGain}点专注，上限3` : '',
      card.scaling ? '来源属性提供额外加成' : '',
      card.exhaust ? '本场一次' : '',
    ]
      .filter(Boolean)
      .join('；') + '。'
  );
}
export const BASIC_DUNGEON_CARD_IDS = STARTER_DECK.map(
  (_, index) => `base:${index}`
);
export const TACTIC_DUNGEON_CARD_IDS = TACTIC_CARDS.map(
  ([id]) => `tactic:${id}`
);

/** Player final stats are already equipment/course-adjusted; sources add no stats. */
export function getDungeonCardSources(
  player: PlayerStats
): DungeonCardSource[] {
  const result: DungeonCardSource[] = STARTER_DECK.map((templateId, index) => ({
    id: `base:${index}`,
    templateId,
    name: CARDS[templateId].name,
    source: 'basic',
    sourceId: `base:${index}`,
    sourceLabel: '基础牌',
    description: describeTemplate(CARDS[templateId]),
  }));
  for (const [id, templateId] of TACTIC_CARDS) {
    result.push({
      id: `tactic:${id}`,
      templateId,
      name: CARDS[templateId].name,
      source: 'basic',
      sourceId: `tactic:${id}`,
      sourceLabel: '战术牌',
      description: describeTemplate(CARDS[templateId]),
    });
  }
  for (const id of new Set(player.cultivationArts)) {
    const art = CULTIVATION_ARTS.find((value) => value.id === id);
    if (!art) continue;
    const templateId = courseCard(art);
    result.push({
      id: `course:${id}`,
      templateId,
      name: art.name,
      source: 'course',
      sourceId: id,
      sourceLabel: '已学课程',
      description: describeTemplate(CARDS[templateId]),
    });
  }
  for (const { item, definition } of getEquippedDungeonEquipment(player)) {
    const id = item.id;
    const templateId = definition.card;
    result.push({
      id: `equipment:${id}`,
      templateId,
      name: item.name,
      source: 'equipment',
      sourceId: id,
      sourceLabel: '当前装备',
      description: describeTemplate(CARDS[templateId]),
    });
  }
  return result;
}
