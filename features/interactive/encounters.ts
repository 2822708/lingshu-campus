import type { PlayerStats } from '../../types';
import { REALM_DATA, REALM_ORDER } from '../../constants';

/** 首版只有六类校园机缘；后续在原事件内兑现，不再叠加新的任务系统。 */
export const ENCOUNTER_IDS = [
  'lab-device',
  'study-table',
  'library-notes',
  'club-poster',
  'campus-errand',
  'practice-invitation',
] as const;

export type EncounterId = (typeof ENCOUNTER_IDS)[number];
export type EncounterFacts = Record<string, string | boolean>;
export type EncounterBattleArchetype = 'balanced' | 'aggressive' | 'defensive';

export interface EncounterChoice {
  id: string;
  label: string;
  description: string;
  cost: { hp: number; spiritStones: number };
  /** 挑战分支为胜利总额，不与普通冒险或战斗默认奖励叠加。 */
  reward: { exp: number; spiritStones: number };
  feedback: string;
  followUp?: string;
  facts: EncounterFacts;
  roommateId?: string;
  affectionGain?: number;
  battle?: {
    archetype: EncounterBattleArchetype;
    label: string;
    victoryFacts: EncounterFacts;
    unfinishedFacts: EncounterFacts;
  };
}

export interface InteractiveEncounter {
  id: EncounterId;
  title: string;
  story: string;
  choices: EncounterChoice[];
}

export interface EncounterChoiceAvailability {
  available: boolean;
  reason?: string;
}

export interface EncounterChanges {
  hp: number;
  exp: number;
  spiritStones: number;
  affection: number;
}

export type EncounterResolution =
  | { status: 'rejected'; reason: string }
  | {
      status: 'battle';
      player: PlayerStats;
      choice: EncounterChoice;
      /** 这里只包含已支付的入场成本；胜利收益由父行动终局统一发放。 */
      changes: EncounterChanges;
    }
  | {
      status: 'settled';
      player: PlayerStats;
      facts: EncounterFacts;
      feedback: string;
      changes: EncounterChanges;
    };

const choice = (
  id: string,
  label: string,
  description: string,
  hp: number,
  credits: number,
  exp: number,
  earnedCredits: number,
  feedback: string,
  facts: EncounterFacts = {},
  extra: Partial<EncounterChoice> = {}
): EncounterChoice => ({
  id,
  label,
  description,
  cost: { hp, spiritStones: credits },
  reward: { exp, spiritStones: earnedCredits },
  feedback,
  facts,
  ...extra,
});

const leave = (): EncounterChoice =>
  choice(
    'leave',
    '这次先离开',
    '结束本次机缘，不扣费用、不领奖励。',
    0,
    0,
    0,
    0,
    '你记下了地点，结束了这次机缘。没有扣费，也没有产生完成或合作记录。'
  );

function boundRoommate(player: PlayerStats) {
  return (
    player.pets.find((pet) => pet.id === player.activePetId) ?? player.pets[0]
  );
}

export function isEncounterId(value: unknown): value is EncounterId {
  return (
    typeof value === 'string' && ENCOUNTER_IDS.includes(value as EncounterId)
  );
}

/** 只读取本地事实和玩家已有角色，生成可以原样存档的选项快照。 */
export function createInteractiveEncounter(
  id: EncounterId,
  player: PlayerStats,
  facts: EncounterFacts = {}
): InteractiveEncounter {
  const roommate = boundRoommate(player);
  const partner = roommate ? `室友${roommate.name}` : '同学';
  const cooperation = (
    event: 'lab' | 'study',
    hp: number,
    credits: number,
    exp: number
  ) =>
    choice(
      'cooperate',
      `邀请${partner}分工`,
      roommate
        ? `一起检查关键步骤；该室友默契最多增加2点（上限100）。`
        : '和同学核对步骤，留下协作记录。',
      hp,
      credits,
      exp,
      0,
      `你与${partner}完成分工，把各自核对过的步骤写在了同一张记录单上。`,
      {
        [`${event}-cooperated`]: true,
        [`${event}-partner`]: roommate?.id ?? 'classmate',
      },
      {
        roommateId: roommate?.id,
        affectionGain: roommate
          ? Math.min(2, Math.max(0, 100 - roommate.affection))
          : 0,
        followUp: '下一次来到这里，可以直接复测这次分工的结果。',
      }
    );

  let title: string;
  let story: string;
  let choices: EncounterChoice[];
  switch (id) {
    case 'lab-device': {
      title = '研习室的旧装置';
      story = '旧装置的指示灯闪个不停。记录本就在桌边，是否深入联调由你决定。';
      const diagnosed = facts['lab-diagnosed'] === true;
      const won = facts['lab-challenge-won'] === true;
      const cooperating = facts['lab-cooperated'] === true;
      choices = [
        diagnosed
          ? choice(
              'apply-notes',
              '按上次笔记排查',
              '上次的排查记录缩短了检查过程。',
              2,
              0,
              10,
              0,
              '你沿着自己上次标出的线索复测，确认了接触不良的位置。旧笔记这次确实省下了精力。',
              { 'lab-notes-used': true }
            )
          : choice(
              'diagnose',
              '先查记录，稳妥排查',
              '用少量精力整理故障线索，不进入战斗。',
              6,
              0,
              10,
              0,
              '你找出了报警前后的差别，把排查步骤留在记录本里。',
              { 'lab-diagnosed': true },
              { followUp: '下次再遇到旧装置，会出现“按上次笔记排查”。' }
            ),
        choice(
          'challenge',
          won ? '接受进阶联调' : '直接联调，挑战核心',
          '进入一场可手动应对的挑战；只有胜利获得下列总奖励，撤离不领奖。',
          0,
          0,
          won ? 28 : 24,
          won ? 10 : 8,
          '你完成了联调，把异常发生的条件整理成了可复现记录。',
          {},
          {
            followUp: '完成挑战后，下次可以接受进阶联调。',
            battle: {
              archetype: won ? 'aggressive' : 'defensive',
              label: won ? '旧装置进阶联调' : '旧装置核心联调',
              victoryFacts: { 'lab-challenge-won': true },
              unfinishedFacts: { 'lab-challenge-unfinished': true },
            },
          }
        ),
        cooperating
          ? choice(
              'retest',
              '复测上次的分工结果',
              '根据上次留下的协作记录逐项复核。',
              2,
              0,
              9,
              0,
              '上次的两份检查记录对上了同一个问题。你完成复测，这条线索有了清楚的结论。',
              { 'lab-retested': true }
            )
          : cooperation('lab', 3, 4, 6),
      ];
      if (facts['lab-challenge-unfinished'] === true && !won) {
        story += '上次的核心挑战还没有完成，留下的现场记录仍可参考。';
      }
      break;
    }
    case 'study-table': {
      title = '晚自习的空白草稿';
      const prepared = facts['study-prepared'] === true;
      const collaborated = facts['study-cooperated'] === true;
      story =
        '一道例题旁留着两页空白草稿。你可以独立梳理，也可以找人核对思路。';
      choices = [
        prepared
          ? choice(
              'explain-notes',
              '用自己的笔记讲解',
              '上次整理的步骤现在能直接用于讲解。',
              2,
              0,
              10,
              0,
              '你把自己的推导讲清楚了。上次多写的步骤省去了重新摸索的精力。',
              { 'study-explained': true }
            )
          : choice(
              'prepare',
              '独立梳理完整解法',
              '多花一点精力，留下可重复使用的笔记。',
              6,
              0,
              12,
              0,
              '你补齐了关键推导，还在页边写下了容易遗漏的前提。',
              { 'study-prepared': true },
              { followUp: '下次晚自习可以“用自己的笔记讲解”。' }
            ),
        collaborated
          ? choice(
              'compare',
              '核对上次的两份解法',
              '沿用上次的分工记录，不再次收协作费用。',
              2,
              0,
              8,
              0,
              '你对照了上次的两份解法，找到了结论相同而路径不同的原因。',
              { 'study-compared': true }
            )
          : cooperation('study', 3, 2, 8),
      ];
      break;
    }
    case 'library-notes': {
      title = '书页间的检索卡';
      const indexed = facts['library-indexed'] === true;
      story = '几张检索卡夹在资料书里。整理索引和帮忙归架都能让这里更好用。';
      choices = [
        indexed
          ? choice(
              'reuse-index',
              '沿用自己的资料索引',
              '之前建立的索引让检索更省力。',
              1,
              0,
              8,
              0,
              '你很快找到对应资料，旧索引把零散线索串成了一条完整路径。',
              { 'library-index-reused': true }
            )
          : choice(
              'index',
              '按主题整理检索卡',
              '建立一份下次可用的索引。',
              4,
              0,
              9,
              0,
              '你按主题重排了检索卡，给重要资料留下了准确的页码。',
              { 'library-indexed': true },
              { followUp: '下次来到图书角可以直接沿用索引。' }
            ),
        choice(
          'shelve',
          '帮值班同学归架',
          '学习收益较少，但可取得一笔勤工学分。',
          3,
          0,
          4,
          5,
          '你把散放的书归回原位，值班同学核对后记下了这次勤工。',
          { 'library-helped': true }
        ),
      ];
      if (facts['library-helped'] === true)
        story += '值班同学认出了上次帮忙归架的你，指了指新到资料的位置。';
      break;
    }
    case 'club-poster': {
      title = '社团展板的空角';
      const drafted = facts['poster-drafted'] === true;
      story = '活动展板还缺一块说明。可以认真补写内容，也可以帮忙整理印件。';
      choices = [
        drafted
          ? choice(
              'reuse-draft',
              '沿用上次的说明稿',
              '复用已核对的结构，只更新本次内容。',
              2,
              0,
              9,
              0,
              '上次的说明结构仍然清楚，你很快完成了更新。旁边还保留着你的修订记号。',
              { 'poster-draft-reused': true }
            )
          : choice(
              'draft',
              '补写清楚的原理说明',
              '以精力换取完整的内容练习。',
              5,
              0,
              11,
              0,
              '你把含混的术语改成了可理解的步骤，说明稿通过了核对。',
              { 'poster-drafted': true },
              { followUp: '下次可以沿用这份说明稿，减少精力消耗。' }
            ),
        choice(
          'print',
          '承担印件整理',
          '支付印制学分、节省精力，完成本次排版整理。',
          1,
          4,
          7,
          0,
          '你核对了页序与印件数量，展板按时补齐了缺少的内容。',
          { 'poster-printed': true }
        ),
      ];
      if (facts['poster-printed'] === true)
        story += '展板旁还贴着你上次整理好的页序标签。';
      break;
    }
    case 'campus-errand': {
      title = '器材室的送还单';
      const routed = facts['errand-route-known'] === true;
      story = '一批借出的器材正待送还。你可以跑一趟，也可以留在原地检查登记。';
      choices = [
        routed
          ? choice(
              'known-route',
              '按熟悉的路线送还',
              '上次标出的近路让这次少费精力。',
              2,
              0,
              3,
              7,
              '你沿着上次确认的路线完成送还，交接单一次核对通过。',
              { 'errand-route-reused': true }
            )
          : choice(
              'deliver',
              '亲自送还并记下路线',
              '花费精力，换取勤工学分并熟悉路线。',
              5,
              0,
              3,
              7,
              '你跑完了器材交接，顺手记下了少走弯路的路线。',
              { 'errand-route-known': true },
              { followUp: '下次送还器材可以按熟悉的路线，精力费用更少。' }
            ),
        choice(
          'check-list',
          '留在器材室核对登记',
          '不领取勤工学分，专注学习登记与检查流程。',
          2,
          0,
          8,
          0,
          '你找出了登记中的漏项，补齐了检查流程。每件器材都有了清楚的去向。',
          { 'errand-checked': true }
        ),
      ];
      break;
    }
    case 'practice-invitation': {
      title = '公开练习的邀请';
      const observed = facts['practice-observed'] === true;
      const won = facts['practice-won'] === true;
      story = '练习区开放了一个挑战席位。你也可以先旁观，记下对手发力的时机。';
      choices = [
        choice(
          'observe',
          observed ? '对照上次的观察再看一场' : '先旁观，整理对手意图',
          '不进入战斗；观察记录会让下次邀请给出更具体的提示。',
          2,
          0,
          6,
          0,
          observed
            ? '你对照旧记录再次观察，确认了强攻后的调整窗口。'
            : '你记下了强攻、固守与调整的区别，准备下次再决定是否上场。',
          { 'practice-observed': true },
          { followUp: '下一次邀请会引用这份观察记录。' }
        ),
        choice(
          'challenge',
          won ? '接受公开进阶挑战' : '接受公开挑战',
          '进入一场手动挑战；下列为胜利总奖励，战败或撤离不发胜利奖励。',
          0,
          0,
          won ? 26 : 20,
          won ? 9 : 6,
          '你完成了公开练习，记录单上留下了这次应对过程。',
          {},
          {
            battle: {
              archetype: observed ? 'balanced' : 'aggressive',
              label: won ? '公开进阶练习' : '公开练习',
              victoryFacts: { 'practice-won': true },
              unfinishedFacts: { 'practice-unfinished': true },
            },
          }
        ),
      ];
      if (observed)
        story +=
          '你上次的笔记提醒：防守适合承受强攻，破势适合处理固守；调整时可以稳攻。';
      if (won) story += '负责人认出了上次完成挑战的你，换上了进阶记录单。';
      break;
    }
    default:
      throw new Error('未知机缘');
  }
  // 首版试作初值：按学阶基础量缩放，不读取装备、当前精力或当前绩点上限。
  // 这样高学阶仍有实际反馈，也不会因换装让同类机缘费用随之上涨。
  const realmIndex = Math.max(0, REALM_ORDER.indexOf(player.realm));
  const realm = REALM_DATA[player.realm] ?? REALM_DATA[REALM_ORDER[0]];
  const level = Number.isSafeInteger(player.realmLevel)
    ? Math.max(1, Math.min(9, player.realmLevel))
    : 1;
  const levelMultiplier = 1 + (level - 1) * 0.1;
  const hpMultiplier = (realm.baseMaxHp / 100) * levelMultiplier;
  const expMultiplier = (realm.maxExpBase / 100) * levelMultiplier;
  const creditMultiplier = 1 + realmIndex * 0.35;
  const scale = (value: number, multiplier: number) =>
    value === 0 ? 0 : Math.max(1, Math.round(value * multiplier));
  return {
    id,
    title,
    story,
    choices: [...choices, leave()].map((item) => ({
      ...item,
      cost: {
        hp: scale(item.cost.hp, hpMultiplier),
        spiritStones: scale(item.cost.spiritStones, creditMultiplier),
      },
      reward: {
        exp: scale(item.reward.exp, expMultiplier),
        spiritStones: scale(item.reward.spiritStones, creditMultiplier),
      },
    })),
  };
}

/** 提交时重新检查实际资源及绑定角色；奖励不能拿来抵扣入场费用。 */
export function getEncounterChoiceAvailability(
  choice: EncounterChoice,
  player: PlayerStats
): EncounterChoiceAvailability {
  const amounts = [
    choice.cost.hp,
    choice.cost.spiritStones,
    choice.reward.exp,
    choice.reward.spiritStones,
    choice.affectionGain ?? 0,
  ];
  if (amounts.some((value) => !Number.isSafeInteger(value) || value < 0)) {
    return { available: false, reason: '选项数值无效，请重新载入有效存档。' };
  }
  if (
    ![player.hp, player.exp, player.spiritStones].every(Number.isFinite) ||
    player.hp < 0 ||
    player.exp < 0 ||
    player.spiritStones < 0
  ) {
    return { available: false, reason: '当前角色资源无效，无法提交选项。' };
  }
  if (
    choice.roommateId &&
    !player.pets.some((pet) => pet.id === choice.roommateId)
  ) {
    return {
      available: false,
      reason: '这次约定的室友已不在队伍中，不能将合作转交他人。',
    };
  }
  const roommate = player.pets.find((pet) => pet.id === choice.roommateId);
  if (
    roommate &&
    (!Number.isFinite(roommate.affection) ||
      roommate.affection < 0 ||
      roommate.affection > 100)
  ) {
    return { available: false, reason: '室友默契数据无效，无法提交合作。' };
  }
  if (choice.battle && player.hp < 1) {
    return { available: false, reason: '至少需要1点精力才能进入挑战。' };
  }
  const missing: string[] = [];
  if (choice.cost.hp > 0 && player.hp <= choice.cost.hp)
    missing.push(`精力还差${choice.cost.hp + 1 - player.hp}（需保留1点）`);
  if (player.spiritStones < choice.cost.spiritStones)
    missing.push(`学分还差${choice.cost.spiritStones - player.spiritStones}`);
  return missing.length
    ? { available: false, reason: missing.join('；') }
    : { available: true };
}

export function describeEncounterChanges(changes: EncounterChanges): string {
  const signed = (value: number) => (value > 0 ? `+${value}` : `${value}`);
  const parts: string[] = [];
  if (changes.hp) parts.push(`精力${signed(changes.hp)}`);
  if (changes.exp) parts.push(`绩点${signed(changes.exp)}`);
  if (changes.spiritStones) parts.push(`学分${signed(changes.spiritStones)}`);
  if (changes.affection) parts.push(`室友默契${signed(changes.affection)}`);
  return parts.length ? parts.join('，') : '资源无变化';
}

/** 纯领域计算，不写存档；幂等提交和结算账本由同一次父行动统一管理。 */
export function resolveEncounterChoice(
  encounter: InteractiveEncounter,
  choiceId: string,
  player: PlayerStats
): EncounterResolution {
  const selected = encounter.choices.find((item) => item.id === choiceId);
  if (!selected)
    return { status: 'rejected', reason: '该选项不属于当前机缘。' };
  const availability = getEncounterChoiceAvailability(selected, player);
  if (!availability.available)
    return { status: 'rejected', reason: availability.reason! };
  let next: PlayerStats = {
    ...player,
    hp: player.hp - selected.cost.hp,
    spiritStones: player.spiritStones - selected.cost.spiritStones,
  };
  const changes: EncounterChanges = {
    hp: selected.cost.hp ? -selected.cost.hp : 0,
    exp: 0,
    spiritStones: selected.cost.spiritStones ? -selected.cost.spiritStones : 0,
    affection: 0,
  };
  if (selected.battle)
    return { status: 'battle', player: next, choice: selected, changes };

  next = {
    ...next,
    exp: next.exp + selected.reward.exp,
    spiritStones: next.spiritStones + selected.reward.spiritStones,
  };
  changes.exp = selected.reward.exp;
  changes.spiritStones += selected.reward.spiritStones;
  if (selected.roommateId && selected.affectionGain) {
    next.pets = next.pets.map((pet) => {
      if (pet.id !== selected.roommateId) return pet;
      const affection = Math.min(100, pet.affection + selected.affectionGain!);
      changes.affection = affection - pet.affection;
      return { ...pet, affection };
    });
  }
  return {
    status: 'settled',
    player: next,
    facts: { ...selected.facts },
    feedback: selected.feedback,
    changes,
  };
}
