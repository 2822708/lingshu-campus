import type { CardBattleState } from '../card-battle/types';
import { getRogueMoveText, ROGUE_CARDS, ROGUE_LEGACY_NAMES } from './catalog';

/** Display aliases only. Saved names, source IDs, rules and numbers stay frozen. */
const LEGACY_PHRASES: Record<string, string> = {
  '选择第一场遭遇，开始本局远征。': '领取基础课考核，开始本局灵枢试炼。',
  '第五章BOSS已击败，50关远征完成。': '答辩天劫已渡过，50关灵枢试炼完成。',
  '收集安全补给，获得': '完成助研记录，领取',
  '承担8点生命损耗，获得': '完成高负荷炼器实验，消耗8点精力，获得',
  '购买补给，恢复': '领取调息灵饮，恢复',
  '没有交易，继续远征。': '保留试炼学分，离开校园工坊。',
  战斗胜利并处理遗物: '通过考核并整理法器',
  战斗胜利: '试炼考核通过',
  事件处理完成: '完成同门助研与修习选择',
  休整完成: '完成研习室调息',
  商店交易结束: '完成校园工坊委托',
  岔路上的旅行笔记: '同门助研与实验机缘',
  请旅人整理牌组: '请资料室同门整理术式',
  沿途补给: '助研补贴',
  搬运沉重物资: '参加高负荷炼器实验',
  卡牌奖励: '课程领悟',
  遗物奖励: '炼器成果',
  旧城壁垒: '防静电腕带',
  道路遭遇: '学园试阵',
  精英遭遇: '实训精英',
  章节BOSS: '章节考核',
};

const escapeRegExp = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const aliases: Record<string, string> = {
  ...LEGACY_PHRASES,
  ...ROGUE_LEGACY_NAMES,
};
const currentNames = new Set(Object.values(ROGUE_LEGACY_NAMES));
const aliasPattern = new RegExp(
  [
    ...new Set([
      // Short card names like “破阵” are also normal prose. Only replace those
      // when the entire label matches or they appear as a quoted card name.
      ...Object.keys(aliases).filter((name) => name.length >= 3),
      ...currentNames,
    ]),
  ]
    .sort((left, right) => right.length - left.length)
    .map(escapeRegExp)
    .join('|'),
  'g'
);
function projectName(name: string): string {
  const upgrade = name.match(/ \+[12]$/)?.[0] ?? '';
  const base = upgrade ? name.slice(0, -upgrade.length) : name;
  return (
    (!currentNames.has(base) && Object.hasOwn(aliases, base)
      ? aliases[base]
      : base) + upgrade
  );
}

/** One longest-first pass avoids aliases rewriting another alias's new name. */
export function presentRogueText(value: string): string {
  return projectName(value)
    .replace(aliasPattern, projectName)
    .replace(
      /「([^」]+)」/g,
      (_match, name: string) => `「${projectName(name)}」`
    )
    .replaceAll('生命', '精力')
    .replaceAll('金币', '试炼学分')
    .replaceAll('遗物', '法器')
    .replaceAll('装备', '法器')
    .replaceAll('远征', '试炼')
    .replaceAll('冒险', '试炼')
    .replaceAll('商店', '工坊')
    .replaceAll('休整', '调息')
    .replaceAll('旅人', '资料室同门')
    .replaceAll('强化', '参悟')
    .replace(/(?<!术式)牌组/g, '术式牌组');
}

function presentRogueMove<T extends { name: string; description: string }>(
  move: T
): T {
  const text = getRogueMoveText(move.name);
  return {
    ...move,
    name: text?.name ?? presentRogueText(move.name),
    description: text?.description ?? presentRogueText(move.description),
  };
}

/** A view snapshot; never submit this projection to the reducer or persistence. */
export function presentRogueBattle(battle: CardBattleState): CardBattleState {
  return {
    ...battle,
    enemy: {
      ...battle.enemy,
      name: presentRogueText(battle.enemy.name),
      ...(battle.enemy.title === undefined
        ? {}
        : { title: presentRogueText(battle.enemy.title) }),
      ...(battle.enemy.realm === undefined
        ? {}
        : { realm: presentRogueText(battle.enemy.realm) }),
      ...(battle.enemy.pattern === undefined
        ? {}
        : {
            pattern: battle.enemy.pattern.map(presentRogueMove),
          }),
    },
    intent: presentRogueMove(battle.intent),
    cards: battle.cards.map((card) => ({
      ...card,
      name: presentRogueText(card.name),
      description: presentRogueText(card.description),
      sourceLabel:
        ROGUE_CARDS[card.templateId]?.origin ??
        (card.sourceLabel === undefined
          ? '本局课程术式'
          : presentRogueText(card.sourceLabel)),
      ...(card.scalingLabel === undefined
        ? {}
        : { scalingLabel: presentRogueText(card.scalingLabel) }),
    })),
    ...(battle.equipment === undefined
      ? {}
      : {
          equipment: battle.equipment.map((item) => ({
            ...item,
            name: presentRogueText(item.name),
            description: presentRogueText(item.description),
          })),
        }),
    log: battle.log.map((entry) => ({
      ...entry,
      text: presentRogueText(entry.text),
    })),
  };
}
