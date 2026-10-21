import type { LogEntry, PlayerStats } from '../../types';
import { applyDemotion } from '../../utils/demotion';
import { REALM_ORDER } from '../../constants';
import {
  createAdventureBattlePlan,
  applyAdventureBattleEntry,
  applyAdventureBattleOutcome,
  assertAdventureBattlePlan,
  type AdventureBattleRequest,
  type AdventureBattlePlan,
} from './adventureBattle';
import {
  createInteractiveBattle,
  generateInteractiveEnemy,
  stepInteractiveBattle,
  type BattleAction,
  type InteractiveBattleState,
} from './battle';
import {
  ENCOUNTER_IDS,
  createInteractiveEncounter,
  resolveEncounterChoice,
  type EncounterFacts,
  type InteractiveEncounter,
  isEncounterId,
} from './encounters';

export interface InteractiveResult {
  title: string;
  text: string;
  changes: string[];
  followUp?: string;
}

export interface PendingInteractiveAction {
  id: string;
  seq: number;
  seed: number;
  encounter:
    | InteractiveEncounter
    | { id: 'adventure-battle'; title: string; story: string; choices: [] };
  phase: 'choice' | 'battle' | 'result';
  choiceId?: string;
  battle?: InteractiveBattleState;
  result?: InteractiveResult;
  adventurePlan?: AdventureBattlePlan;
  entryPaid?: number;
}

export interface InteractiveProgress {
  version: 1;
  nextSeq: number;
  lastSettledSeq: number;
  facts: EncounterFacts;
  /** Separate content rotation from the global action/settlement sequence. */
  encounterCursor?: number;
  pending?: PendingInteractiveAction;
}

export interface InteractiveSnapshot {
  player: PlayerStats;
  logs: LogEntry[];
  interactive: InteractiveProgress;
}

export type InteractiveCommand =
  | { type: 'begin'; id: string; seed: number }
  | {
      type: 'begin-battle';
      id: string;
      seed: number;
      request: AdventureBattleRequest;
    }
  | { type: 'choose'; id: string; choiceId: string }
  | { type: 'battle'; id: string; seq: number; action: BattleAction }
  | { type: 'acknowledge'; id: string };

export const emptyInteractiveProgress = (): InteractiveProgress => ({
  version: 1,
  nextSeq: 1,
  lastSettledSeq: 0,
  facts: {},
  encounterCursor: 0,
});

function changes(before: PlayerStats, after: PlayerStats): string[] {
  const signed = (value: number) => (value >= 0 ? `+${value}` : `${value}`);
  const result = [
    `精力 ${before.hp} → ${after.hp}`,
    `绩点 ${signed(after.exp - before.exp)}`,
    `学分 ${signed(after.spiritStones - before.spiritStones)}`,
  ];
  for (const pet of after.pets) {
    const old = before.pets.find((item) => item.id === pet.id);
    if (old && old.affection !== pet.affection) {
      result.push(`${pet.name}默契 ${signed(pet.affection - old.affection)}`);
    }
  }
  return result;
}

function finish(
  snapshot: InteractiveSnapshot,
  pending: PendingInteractiveAction,
  player: PlayerStats,
  facts: EncounterFacts,
  result: InteractiveResult,
  now: number
): InteractiveSnapshot {
  // Watermark and terminal UI are saved together with the sole resource update.
  if (pending.seq <= snapshot.interactive.lastSettledSeq) return snapshot;
  return {
    player,
    logs: [
      ...snapshot.logs,
      {
        id: `${pending.id}:settled`,
        timestamp: now,
        type: 'special' as const,
        text: `【${pending.encounter.title}】${result.title}。${result.text}\n${result.changes.join('；')}${result.followUp ? `\n后续：${result.followUp}` : ''}`,
      },
    ].slice(-500),
    interactive: {
      ...snapshot.interactive,
      lastSettledSeq: pending.seq,
      facts: { ...snapshot.interactive.facts, ...facts },
      pending: { ...pending, phase: 'result', result },
    },
  };
}

/** Pure parent-action reducer. The caller must persist this complete snapshot before displaying it. */
export function reduceInteractiveAction(
  snapshot: InteractiveSnapshot,
  command: InteractiveCommand,
  now = Date.now()
): InteractiveSnapshot {
  const progress = snapshot.interactive;
  const pending = progress.pending;
  if (command.type === 'begin-battle') {
    if (pending || snapshot.player.hp <= 0) return snapshot;
    const entryCost = command.request.entryCost ?? 0;
    if (!Number.isSafeInteger(entryCost) || entryCost < 0)
      throw new Error('副本入场费用无效。');
    if (snapshot.player.spiritStones < entryCost)
      throw new Error('学分不足，未进入副本，也未扣费。');
    if (command.request.adventureType === 'secret_realm') {
      if (snapshot.player.hp < snapshot.player.maxHp * 0.3)
        throw new Error('精力不足三成，请先休息再进入副本。');
      if (
        command.request.realmMinRealm &&
        REALM_ORDER.indexOf(snapshot.player.realm) <
          REALM_ORDER.indexOf(command.request.realmMinRealm)
      ) {
        throw new Error('当前学阶尚未达到该副本的要求。');
      }
    }
    const plan = createAdventureBattlePlan(
      snapshot.player,
      command.request,
      command.seed
    );
    assertAdventureBattlePlan(plan);
    const seq = progress.nextSeq;
    const player = applyAdventureBattleEntry(snapshot.player, plan);
    const battle = createInteractiveBattle({
      id: command.id,
      player,
      enemy: plan.enemy,
      seed: command.seed,
      behavior: plan.enemy.behavior,
    });
    return {
      ...snapshot,
      player,
      interactive: {
        ...progress,
        nextSeq: seq + 1,
        encounterCursor: progress.encounterCursor ?? progress.nextSeq - 1,
        pending: {
          id: command.id,
          seq,
          seed: command.seed >>> 0,
          phase: 'battle',
          encounter: {
            id: 'adventure-battle',
            title:
              command.request.realmName ??
              command.request.battleEncounter?.name ??
              (command.request.adventureType === 'lucky'
                ? '机缘中的挑战'
                : command.request.adventureType === 'secret_realm'
                  ? '副本深处的挑战'
                  : '期末冲刺的挑战'),
            story: `${plan.story}${entryCost ? `\n入场学分 ${entryCost} 已支付，撤离也不会退还。` : ''}`,
            choices: [],
          },
          adventurePlan: plan,
          entryPaid: entryCost,
          battle,
        },
      },
    };
  }
  if (command.type === 'begin') {
    if (pending || snapshot.player.hp <= 0) return snapshot;
    const seq = progress.nextSeq;
    return {
      ...snapshot,
      interactive: {
        ...progress,
        nextSeq: seq + 1,
        encounterCursor: (progress.encounterCursor ?? seq - 1) + 1,
        pending: {
          id: command.id,
          seq,
          seed: command.seed >>> 0,
          phase: 'choice',
          encounter: createInteractiveEncounter(
            ENCOUNTER_IDS[
              (progress.encounterCursor ?? seq - 1) % ENCOUNTER_IDS.length
            ],
            snapshot.player,
            progress.facts
          ),
        },
      },
    };
  }
  if (!pending || pending.id !== command.id) return snapshot;
  if (command.type === 'acknowledge') {
    if (pending.phase !== 'result') return snapshot;
    const interactive = { ...progress };
    delete interactive.pending;
    return { ...snapshot, interactive };
  }
  if (command.type === 'choose') {
    if (
      pending.phase !== 'choice' ||
      pending.encounter.id === 'adventure-battle'
    )
      return snapshot;
    const resolution = resolveEncounterChoice(
      pending.encounter,
      command.choiceId,
      snapshot.player
    );
    if (resolution.status === 'rejected') throw new Error(resolution.reason);
    const choice = pending.encounter.choices.find(
      (item) => item.id === command.choiceId
    )!;
    const chosen = { ...pending, choiceId: choice.id };
    if (resolution.status === 'battle' && choice.battle) {
      // All three public behavior types appear without adding another event system.
      const behavior =
        pending.encounter.id === 'practice-invitation'
          ? (['aggressive', 'defensive', 'balanced'] as const)[
              Math.floor((pending.seq - 1) / 6) % 3
            ]
          : choice.battle.archetype;
      const enemy = generateInteractiveEnemy(
        resolution.player,
        pending.seed,
        behavior
      );
      enemy.name = choice.battle.label;
      return {
        ...snapshot,
        player: resolution.player,
        interactive: {
          ...progress,
          pending: {
            ...chosen,
            phase: 'battle',
            battle: createInteractiveBattle({
              id: pending.id,
              player: resolution.player,
              enemy,
              seed: pending.seed,
              behavior,
            }),
          },
        },
      };
    }
    if (resolution.status !== 'settled') return snapshot;
    return finish(
      snapshot,
      chosen,
      resolution.player,
      resolution.facts,
      {
        title: choice.id === 'leave' ? '暂别这次机缘' : choice.label,
        text: resolution.feedback,
        changes: changes(snapshot.player, resolution.player),
        followUp: choice.followUp,
      },
      now
    );
  }
  if (pending.phase !== 'battle' || !pending.battle) return snapshot;
  const battle = stepInteractiveBattle(pending.battle, {
    seq: command.seq,
    action: command.action,
  });
  if (battle === pending.battle) return snapshot;
  const advanced = { ...pending, battle };
  if (battle.outcome === 'ongoing') {
    return { ...snapshot, interactive: { ...progress, pending: advanced } };
  }
  if (pending.adventurePlan) {
    const resolution = applyAdventureBattleOutcome(
      snapshot.player,
      pending.adventurePlan,
      battle
    );
    if (!resolution) return snapshot;
    const titles = {
      victory: '挑战完成',
      defeat: '力竭，挑战未完成',
      retreat: '主动撤离',
      stalemate: '僵持撤离',
    };
    const result: InteractiveResult = {
      title: titles[battle.outcome],
      text: resolution.feedback,
      changes: [...resolution.changes],
    };
    if (pending.entryPaid)
      result.changes.push(
        `入场学分 −${pending.entryPaid}（此前已扣）；本次净学分变化 ${resolution.player.spiritStones - snapshot.player.spiritStones - pending.entryPaid}`
      );
    return finishWithDemotion(
      snapshot,
      advanced,
      resolution.player,
      {},
      result,
      now
    );
  }
  const choice = pending.encounter.choices.find(
    (item) => item.id === pending.choiceId
  )!;
  const victory = battle.outcome === 'victory';
  const player = {
    ...snapshot.player,
    hp: battle.player.hp,
    exp: snapshot.player.exp + (victory ? choice.reward.exp : 0),
    spiritStones:
      snapshot.player.spiritStones + (victory ? choice.reward.spiritStones : 0),
  };
  const titles = {
    victory: '挑战完成',
    defeat: '力竭，挑战未完成',
    retreat: '主动撤离',
    stalemate: '僵持撤离',
  };
  const result: InteractiveResult = {
    title: titles[battle.outcome],
    text: victory
      ? choice.feedback
      : '这次挑战暂未完成，保留已发生的伤耗，不发胜利奖励，也不追加扣分。',
    changes: changes(snapshot.player, player),
    followUp: victory
      ? choice.followUp
      : '你留下了未完成的记录，下次来到这里仍可选择其他办法。',
  };
  return finishWithDemotion(
    snapshot,
    advanced,
    player,
    victory
      ? { ...choice.facts, ...choice.battle?.victoryFacts }
      : (choice.battle?.unfinishedFacts ?? {}),
    result,
    now
  );
}

function finishWithDemotion(
  snapshot: InteractiveSnapshot,
  pending: PendingInteractiveAction,
  player: PlayerStats,
  facts: EncounterFacts,
  result: InteractiveResult,
  now: number
): InteractiveSnapshot {
  let finalPlayer = player;
  if (player.hp <= 0) {
    // Existing demotion is part of the same terminal write, never an intermediate hp=0 save.
    const demotion = applyDemotion(player);
    finalPlayer = demotion.player;
    result.text += ` ${demotion.message}`;
    result.changes.push(
      `延毕后：${finalPlayer.realm} ${finalPlayer.realmLevel}级，绩点归零，精力恢复至 ${finalPlayer.hp}`
    );
  }
  return finish(snapshot, pending, finalPlayer, facts, result, now);
}

/** Reject malformed extensions instead of silently discarding a pending action. */
export function assertInteractiveProgress(
  value: unknown
): asserts value is InteractiveProgress {
  if (!value || typeof value !== 'object')
    throw new Error('机缘记录无效，请保留原存档备份。');
  const state = value as InteractiveProgress;
  const natural = (n: number) => Number.isSafeInteger(n) && n >= 0;
  const optionalText = (text: unknown) =>
    text === undefined || typeof text === 'string';
  const factsValid = (facts: unknown) =>
    Boolean(facts) &&
    typeof facts === 'object' &&
    !Array.isArray(facts) &&
    Object.values(facts).every(
      (fact) => typeof fact === 'string' || typeof fact === 'boolean'
    );
  if (
    state.version !== 1 ||
    !natural(state.nextSeq) ||
    state.nextSeq < 1 ||
    state.nextSeq >= Number.MAX_SAFE_INTEGER ||
    !natural(state.lastSettledSeq) ||
    state.lastSettledSeq >= state.nextSeq ||
    (state.encounterCursor !== undefined &&
      (!natural(state.encounterCursor) ||
        state.encounterCursor >= state.nextSeq)) ||
    !state.facts ||
    typeof state.facts !== 'object' ||
    Array.isArray(state.facts) ||
    Object.keys(state.facts).length > 100 ||
    Object.values(state.facts).some(
      (fact) => typeof fact !== 'string' && typeof fact !== 'boolean'
    )
  ) {
    throw new Error('机缘记录版本或进度无效，请保留原存档备份。');
  }
  const pending = state.pending;
  if (pending === undefined) return;
  if (!pending || typeof pending !== 'object')
    throw new Error('待处理机缘无效。');
  const sceneChoices: InteractiveEncounter['choices'] =
    pending.encounter?.choices;
  if (
    typeof pending.id !== 'string' ||
    !pending.id ||
    !natural(pending.seq) ||
    pending.seq !== state.nextSeq - 1 ||
    !natural(pending.seed) ||
    pending.seed > 0xffffffff ||
    !['choice', 'battle', 'result'].includes(pending.phase) ||
    !pending.encounter ||
    (!isEncounterId(pending.encounter.id) &&
      pending.encounter.id !== 'adventure-battle') ||
    typeof pending.encounter.title !== 'string' ||
    typeof pending.encounter.story !== 'string' ||
    !Array.isArray(pending.encounter.choices) ||
    (pending.encounter.id === 'adventure-battle'
      ? pending.encounter.choices.length !== 0
      : pending.encounter.choices.length < 2) ||
    pending.encounter.choices.length > 6
  ) {
    throw new Error('待处理机缘不完整，请保留原存档备份。');
  }
  if (pending.encounter.id === 'adventure-battle') {
    if (
      !pending.adventurePlan ||
      pending.phase === 'choice' ||
      !natural(pending.entryPaid!) ||
      pending.entryPaid !== (pending.adventurePlan.request.entryCost ?? 0)
    )
      throw new Error('挑战来源或入场记录无效。');
    assertAdventureBattlePlan(pending.adventurePlan);
    if (pending.adventurePlan.seed !== pending.seed)
      throw new Error('战斗计划与现场随机记录不一致。');
  } else if (
    pending.adventurePlan !== undefined ||
    pending.entryPaid !== undefined
  )
    throw new Error('机缘与挑战来源冲突。');
  for (const choice of pending.encounter.choices) {
    if (
      typeof choice.id !== 'string' ||
      typeof choice.label !== 'string' ||
      typeof choice.description !== 'string' ||
      typeof choice.feedback !== 'string' ||
      !optionalText(choice.followUp) ||
      !optionalText(choice.roommateId) ||
      (choice.affectionGain !== undefined &&
        (!natural(choice.affectionGain) || choice.affectionGain > 100)) ||
      !factsValid(choice.facts) ||
      (choice.battle &&
        (typeof choice.battle.label !== 'string' ||
          !['balanced', 'aggressive', 'defensive'].includes(
            choice.battle.archetype
          ) ||
          !factsValid(choice.battle.victoryFacts) ||
          !factsValid(choice.battle.unfinishedFacts))) ||
      !choice.cost ||
      !choice.reward ||
      ![
        choice.cost.hp,
        choice.cost.spiritStones,
        choice.reward.exp,
        choice.reward.spiritStones,
      ].every(natural)
    ) {
      throw new Error('机缘选项数据无效。');
    }
  }
  if (pending.phase === 'result') {
    if (
      state.lastSettledSeq !== pending.seq ||
      !pending.result ||
      typeof pending.result.title !== 'string' ||
      typeof pending.result.text !== 'string' ||
      !optionalText(pending.result.followUp) ||
      !Array.isArray(pending.result.changes) ||
      pending.result.changes.some((line) => typeof line !== 'string')
    ) {
      throw new Error('机缘结算记录不完整。');
    }
  } else if (pending.seq <= state.lastSettledSeq)
    throw new Error('机缘序号与结算记录冲突。');
  if (pending.phase === 'battle' || pending.battle) {
    const battle = pending.battle;
    if (
      !battle ||
      battle.version !== 1 ||
      battle.id !== pending.id ||
      !natural(battle.commandSeq) ||
      !natural(battle.completedRounds) ||
      battle.completedRounds > 12 ||
      !natural(battle.rngState) ||
      battle.rngState === 0 ||
      battle.rngState > 0xffffffff ||
      !natural(battle.breakCooldown) ||
      battle.breakCooldown > 2 ||
      !natural(battle.enemyGuardRounds) ||
      battle.enemyGuardRounds > 2 ||
      !natural(battle.playerHpBefore) ||
      battle.playerHpBefore > battle.player.maxHp ||
      !['ongoing', 'victory', 'defeat', 'retreat', 'stalemate'].includes(
        battle.outcome
      ) ||
      !['strong', 'guard', 'adjust'].includes(battle.intent) ||
      !Array.isArray(battle.rounds) ||
      battle.rounds.length > 13 ||
      battle.commandSeq !== battle.rounds.length ||
      battle.rounds.some(
        (round) =>
          !round ||
          !['attack', 'defend', 'break', 'retreat'].includes(round.action) ||
          typeof round.message !== 'string' ||
          !Array.isArray(round.entries) ||
          round.entries.length > 2 ||
          round.entries.some(
            (entry) =>
              !entry ||
              typeof entry.description !== 'string' ||
              !natural(entry.damage) ||
              !natural(entry.preventedDamage)
          )
      ) ||
      ![battle.player, battle.enemy].every(
        (fighter) =>
          fighter &&
          [
            fighter.hp,
            fighter.maxHp,
            fighter.attack,
            fighter.defense,
            fighter.speed,
          ].every(natural) &&
          fighter.maxHp > 0 &&
          fighter.hp <= fighter.maxHp
      ) ||
      typeof battle.enemy.name !== 'string' ||
      typeof battle.enemy.title !== 'string' ||
      !['balanced', 'aggressive', 'defensive'].includes(
        battle.enemy.behavior
      ) ||
      (pending.phase === 'battle' && battle.outcome !== 'ongoing') ||
      (!pending.adventurePlan &&
        !sceneChoices.some(
          (choice) => choice.id === pending.choiceId && choice.battle
        ))
    ) {
      throw new Error('挑战现场不完整，请保留原存档备份。');
    }
    if (pending.adventurePlan) {
      const planned = pending.adventurePlan.enemy;
      if (
        [
          'name',
          'title',
          'realm',
          'behavior',
          'maxHp',
          'attack',
          'defense',
          'speed',
        ].some(
          (key) =>
            planned[key as keyof typeof planned] !==
            battle.enemy[key as keyof typeof battle.enemy]
        )
      ) {
        throw new Error('挑战对手与已保存的战斗计划不一致。');
      }
    }
  }
}
