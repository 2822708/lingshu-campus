import type { LogEntry, PlayerStats, SecretRealm } from '../../types';
import { getBattleChance } from '../../services/battleService';
import {
  createCardBattle,
  stepCardBattle,
  assertCardBattleState,
} from '../card-battle/engine';
import type { CardBattleAction, CardBattleState } from '../card-battle/types';
import {
  createDefaultCardLoadout,
  assertCardLoadout,
  validateDungeonLoadout,
  type CardLoadout,
} from '../card-dungeon/loadout';
import { resolveDungeonCards } from '../card-dungeon/numericAdapter';
import { resolveDungeonEquipment } from '../card-dungeon/equipment';
import {
  createRogueDungeonLoadout,
  ensureRogueOpeningSources,
} from '../card-dungeon/rogueLoadout';
import { selectDungeonEnemyArchetype } from '../card-battle/enemies';
import {
  prepareDungeonExploration,
  prepareAnonymousDungeonExploration,
} from '../card-dungeon/exploration';
import { applyDemotion } from '../../utils/demotion';
import { REALM_ORDER } from '../../constants';
import {
  createAdventureBattlePlan,
  applyAdventureBattleEntry,
  applyAdventureBattleOutcome,
  applyAdventureOutcome,
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
  continuation?: { type: 'secret-realm' };
}

export interface PendingInteractiveAction {
  id: string;
  seq: number;
  seed: number;
  encounter:
    | InteractiveEncounter
    | {
        id: 'adventure-battle' | 'dungeon-exploration' | 'dungeon-followup';
        title: string;
        story: string;
        choices: [];
      };
  phase: 'choice' | 'battle' | 'result';
  choiceId?: string;
  battle?: InteractiveBattleState;
  result?: InteractiveResult;
  adventurePlan?: AdventureBattlePlan;
  entryPaid?: number;
  engine?: 'round-v1' | 'card-dungeon-v1';
  cardRun?: CardBattleState;
  dungeon?: {
    offer: SecretRealm;
    batchRevision: string;
    loadoutRevision: number;
    entryHp: number;
    referenceLevel: number;
    /** Automatic entry deck; the player's previous manual resume stays intact. */
    entryLoadout?: CardLoadout;
  };
}

export interface InteractiveProgress {
  version: 1 | 2;
  cardLoadout?: CardLoadout;
  nextSeq: number;
  lastSettledSeq: number;
  facts: EncounterFacts;
  /** Separate content rotation from the global action/settlement sequence. */
  encounterCursor?: number;
  pending?: PendingInteractiveAction;
}

function isChoiceEncounter(
  scene: PendingInteractiveAction['encounter']
): scene is InteractiveEncounter {
  return isEncounterId(scene.id);
}

export interface InteractiveSnapshot {
  player: PlayerStats;
  logs: LogEntry[];
  interactive: InteractiveProgress;
}

export type InteractiveCommand =
  | {
      type: 'save-card-loadout';
      loadout: CardLoadout;
      expectedRevision: number;
    }
  | {
      type: 'begin-dungeon';
      id: string;
      seed: number;
      realm: SecretRealm;
      batchRevision: string;
      loadoutRevision: number;
      entryMode?: 'rogue';
    }
  | { type: 'card'; id: string; seq: number; action: CardBattleAction }
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
  version: 2,
  cardLoadout: createDefaultCardLoadout(),
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
  if (command.type === 'save-card-loadout') {
    if (pending) return snapshot;
    const current = progress.cardLoadout ?? createDefaultCardLoadout();
    if (command.expectedRevision !== current.revision)
      throw new Error('简历已在其他操作中更新，请重新打开准备页。');
    assertCardLoadout(command.loadout);
    const validation = validateDungeonLoadout(snapshot.player, command.loadout);
    if (!validation.valid) throw new Error(validation.errors.join(' '));
    return {
      ...snapshot,
      interactive: {
        ...progress,
        version: 2,
        cardLoadout: {
          ...command.loadout,
          library: [...command.loadout.library],
          resume: [...command.loadout.resume],
          revision: current.revision + 1,
        },
      },
    };
  }
  if (command.type === 'begin-dungeon') {
    if (pending || snapshot.player.hp <= 0) return snapshot;
    if (
      !Number.isInteger(command.seed) ||
      command.seed < 0 ||
      command.seed > 0xffffffff ||
      typeof command.id !== 'string' ||
      !command.id ||
      command.id.length > 256 ||
      (command.entryMode !== undefined && command.entryMode !== 'rogue')
    )
      throw new Error('副本行动标识无效。');
    const realm = command.realm;
    assertDungeonOffer(realm);
    if (!command.batchRevision || command.batchRevision.length > 256)
      throw new Error('副本列表已失效，请重新打开。');
    if (snapshot.player.hp < snapshot.player.maxHp * 0.3)
      throw new Error('精力不足三成，请先休息再进入副本。');
    if (
      REALM_ORDER.indexOf(snapshot.player.realm) <
      REALM_ORDER.indexOf(realm.minRealm)
    )
      throw new Error('当前学阶尚未达到该副本的要求。');
    if (snapshot.player.spiritStones < realm.cost)
      throw new Error('学分不足，未进入副本，也未扣费。');
    const configuredLoadout =
      progress.cardLoadout ?? createDefaultCardLoadout();
    if (configuredLoadout.revision !== command.loadoutRevision)
      throw new Error('简历已变化，请重新确认后进入副本。');
    const seed = command.seed >>> 0;
    const automatic = command.entryMode === 'rogue';
    const loadout = automatic
      ? createRogueDungeonLoadout(
          snapshot.player,
          seed,
          configuredLoadout.revision
        )
      : configuredLoadout;
    const validation = validateDungeonLoadout(snapshot.player, loadout);
    if (!validation.valid) throw new Error(validation.errors.join(' '));
    const seq = progress.nextSeq;
    const player = {
      ...snapshot.player,
      spiritStones: snapshot.player.spiritStones - realm.cost,
    };
    const dungeon = {
      offer: JSON.parse(JSON.stringify(realm)) as SecretRealm,
      batchRevision: command.batchRevision,
      loadoutRevision: loadout.revision,
      entryHp: player.hp,
      referenceLevel: Math.max(1, Math.min(9, Math.floor(player.realmLevel))),
      ...(automatic ? { entryLoadout: loadout } : {}),
    };
    const nextProgress: InteractiveProgress = {
      ...progress,
      version: 2,
      cardLoadout: configuredLoadout,
      nextSeq: seq + 1,
      encounterCursor: progress.encounterCursor ?? seq - 1,
    };
    let chanceWord = (seed ^ 0x9e3779b9) >>> 0 || 0x6d2b79f5;
    chanceWord ^= chanceWord << 13;
    chanceWord ^= chanceWord >>> 17;
    chanceWord ^= chanceWord << 5;
    const battleTriggered =
      automatic ||
      (chanceWord >>> 0) / 0x100000000 <
        getBattleChance(player, 'secret_realm');
    if (battleTriggered) {
      const plan = createAdventureBattlePlan(
        player,
        {
          adventureType: 'secret_realm',
          realmName: realm.name,
          realmMinRealm: realm.minRealm,
          realmDescription: realm.description,
          realmDrops: realm.drops,
          riskLevel: realm.riskLevel,
          entryCost: realm.cost,
        },
        seed
      );
      assertAdventureBattlePlan(plan);
      const initialRun = createCardBattle({
        id: command.id,
        seed,
        player,
        enemy: {
          ...plan.enemy,
          archetype: selectDungeonEnemyArchetype(seed),
        },
        cards: resolveDungeonCards(player, plan, loadout),
        equipment: resolveDungeonEquipment(player, plan),
        maxTurns: 12,
      });
      const cardRun = automatic
        ? ensureRogueOpeningSources(initialRun)
        : initialRun;
      return {
        ...snapshot,
        player,
        interactive: {
          ...nextProgress,
          pending: {
            id: command.id,
            seq,
            seed,
            phase: 'battle',
            engine: 'card-dungeon-v1',
            cardRun,
            adventurePlan: plan,
            entryPaid: realm.cost,
            dungeon,
            encounter: {
              id: 'adventure-battle',
              title: realm.name,
              story: `${plan.story}\n${automatic ? '本场简历由基础牌、随机战术及当前已学课程和穿戴装备自动组成，开局优先展示课程与装备牌。' : ''}入场学分 ${realm.cost} 已支付，撤离也不会退还。`,
              choices: [],
            },
          },
        },
      };
    }
    const exploration = prepareDungeonExploration(player, realm, seed, now);
    const action: PendingInteractiveAction = {
      id: command.id,
      seq,
      seed,
      phase: 'result',
      entryPaid: realm.cost,
      dungeon,
      encounter: {
        id: 'dungeon-exploration',
        title: realm.name,
        story: realm.description,
        choices: [],
      },
    };
    const withEntry = {
      ...snapshot,
      player,
      logs: [
        ...snapshot.logs,
        ...exploration.logs.map((entry, index) => ({
          ...entry,
          type: entry.type as LogEntry['type'],
          id: `${command.id}:explore:${index}`,
          timestamp: now,
        })),
      ].slice(-500),
      interactive: nextProgress,
    };
    return finishWithDemotion(
      withEntry,
      action,
      exploration.player,
      {},
      {
        title: '探索完成',
        text: exploration.result.story,
        changes: [
          ...exploration.changes,
          `入场学分 −${realm.cost}（此前已扣）；本次净学分变化 ${exploration.player.spiritStones - snapshot.player.spiritStones}`,
        ],
        ...(exploration.continuation
          ? { continuation: exploration.continuation }
          : {}),
      },
      now
    );
  }
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
    if (pending.result?.continuation) {
      // Compatibility for the old anonymous follow-up: consume and start in one save.
      const id = `${pending.id}:followup`;
      const seed = (pending.seed ^ 0x85ebca6b) >>> 0;
      const next = { ...snapshot, interactive };
      if (
        snapshot.player.hp >= snapshot.player.maxHp * 0.3 &&
        seed / 0x100000000 < getBattleChance(snapshot.player, 'secret_realm')
      )
        return reduceInteractiveAction(
          next,
          {
            type: 'begin-battle',
            id,
            seed,
            request: { adventureType: 'secret_realm', entryCost: 0 },
          },
          now
        );
      const exploration = prepareAnonymousDungeonExploration(
        snapshot.player,
        seed,
        now
      );
      const action: PendingInteractiveAction = {
        id,
        seq: progress.nextSeq,
        seed,
        phase: 'result',
        encounter: {
          id: 'dungeon-followup',
          title: '后续校园探索',
          story: exploration.result.story,
          choices: [],
        },
      };
      return finishWithDemotion(
        {
          ...next,
          interactive: { ...interactive, nextSeq: progress.nextSeq + 1 },
          logs: [
            ...next.logs,
            ...exploration.logs.map((entry, index) => ({
              ...entry,
              type: entry.type as LogEntry['type'],
              id: `${id}:explore:${index}`,
              timestamp: now,
            })),
          ].slice(-500),
        },
        action,
        exploration.player,
        {},
        {
          title: '后续探索完成',
          text: exploration.result.story,
          changes: exploration.changes,
          ...(exploration.continuation
            ? { continuation: exploration.continuation }
            : {}),
        },
        now
      );
    }
    return { ...snapshot, interactive };
  }
  if (command.type === 'choose') {
    if (pending.phase !== 'choice' || !isChoiceEncounter(pending.encounter))
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
  if (command.type === 'card') {
    if (
      pending.phase !== 'battle' ||
      !pending.cardRun ||
      !pending.adventurePlan
    )
      return snapshot;
    const cardRun = stepCardBattle(pending.cardRun, {
      ...command.action,
      id: pending.id,
      seq: command.seq,
    });
    if (cardRun === pending.cardRun) return snapshot;
    const advanced = { ...pending, cardRun };
    if (cardRun.phase === 'battle' || cardRun.phase === 'discard')
      return { ...snapshot, interactive: { ...progress, pending: advanced } };
    const resolution = applyAdventureOutcome(
      snapshot.player,
      pending.adventurePlan,
      {
        battleId: pending.id,
        outcome: cardRun.phase,
        hpAfterRaw: cardRun.player.hp,
      }
    );
    return finishWithDemotion(
      snapshot,
      advanced,
      resolution.player,
      {},
      {
        title: {
          victory: '挑战完成',
          defeat: '力竭，挑战未完成',
          retreat: '主动撤离',
          stalemate: '僵持撤离',
        }[cardRun.phase],
        text: resolution.feedback,
        changes: [
          ...resolution.changes,
          `入场学分 −${pending.entryPaid ?? 0}（此前已扣）；本次净学分变化 ${resolution.player.spiritStones - snapshot.player.spiritStones - (pending.entryPaid ?? 0)}`,
        ],
      },
      now
    );
  }
  if (
    command.type !== 'battle' ||
    pending.phase !== 'battle' ||
    !pending.battle
  )
    return snapshot;
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
  if (pending.cardRun) {
    result.changes = result.changes.filter((line) => !line.startsWith('精力 '));
    result.changes.unshift(
      `精力：入场 ${pending.cardRun.player.entryHp} → 战斗结束 ${pending.cardRun.player.hp} → 最终 ${finalPlayer.hp}`
    );
  }
  return finish(snapshot, pending, finalPlayer, facts, result, now);
}

function assertDungeonOffer(value: unknown): asserts value is SecretRealm {
  const offer = value as SecretRealm;
  if (
    !offer ||
    typeof offer !== 'object' ||
    typeof offer.id !== 'string' ||
    !offer.id ||
    typeof offer.name !== 'string' ||
    !offer.name ||
    typeof offer.description !== 'string' ||
    !REALM_ORDER.includes(offer.minRealm) ||
    !Number.isSafeInteger(offer.cost) ||
    offer.cost < 0 ||
    !['低', '中', '高', '极度危险'].includes(offer.riskLevel) ||
    !Array.isArray(offer.drops) ||
    offer.drops.length > 100 ||
    offer.drops.some((item) => typeof item !== 'string')
  )
    throw new Error('副本信息无效，请重新打开副本列表。');
}

/** Upgrade only the protocol envelope; old in-progress rounds and RNG stay intact. */
export function normalizeInteractiveProgress(
  value?: unknown
): InteractiveProgress {
  if (value === undefined) return emptyInteractiveProgress();
  assertInteractiveProgress(value);
  if (value.version === 2) return value;
  return {
    ...value,
    version: 2,
    cardLoadout: createDefaultCardLoadout(),
    ...(value.pending?.battle
      ? { pending: { ...value.pending, engine: 'round-v1' as const } }
      : {}),
  };
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
    ![1, 2].includes(state.version) ||
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
  if (state.version === 2) assertCardLoadout(state.cardLoadout);
  else if (state.cardLoadout !== undefined)
    throw new Error('旧协议包含未知的简历数据。');
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
      pending.encounter.id !== 'adventure-battle' &&
      pending.encounter.id !== 'dungeon-exploration' &&
      pending.encounter.id !== 'dungeon-followup') ||
    typeof pending.encounter.title !== 'string' ||
    typeof pending.encounter.story !== 'string' ||
    !Array.isArray(pending.encounter.choices) ||
    (pending.encounter.id === 'adventure-battle' ||
    pending.encounter.id === 'dungeon-exploration' ||
    pending.encounter.id === 'dungeon-followup'
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
  } else if (pending.encounter.id === 'dungeon-exploration') {
    if (
      state.version !== 2 ||
      !pending.dungeon ||
      pending.phase !== 'result' ||
      pending.adventurePlan ||
      pending.battle ||
      pending.cardRun ||
      pending.entryPaid !== pending.dungeon.offer.cost
    )
      throw new Error('副本探索记录无效。');
  } else if (pending.encounter.id === 'dungeon-followup') {
    if (
      state.version !== 2 ||
      pending.phase !== 'result' ||
      pending.dungeon ||
      pending.entryPaid !== undefined ||
      pending.adventurePlan ||
      pending.battle ||
      pending.cardRun
    )
      throw new Error('后续探索记录无效。');
  } else if (
    pending.adventurePlan !== undefined ||
    pending.entryPaid !== undefined
  )
    throw new Error('机缘与挑战来源冲突。');
  if (
    pending.engine !== undefined &&
    !['round-v1', 'card-dungeon-v1'].includes(pending.engine)
  )
    throw new Error('战斗规则版本未知，请保留原存档。');
  if (pending.dungeon) {
    assertDungeonOffer(pending.dungeon.offer);
    if (pending.dungeon.entryLoadout !== undefined) {
      assertCardLoadout(pending.dungeon.entryLoadout);
      if (
        !pending.cardRun ||
        pending.dungeon.entryLoadout.revision !==
          pending.dungeon.loadoutRevision
      )
        throw new Error('副本自动简历与入场记录不一致。');
    }
    if (
      state.version !== 2 ||
      typeof pending.dungeon.batchRevision !== 'string' ||
      !pending.dungeon.batchRevision ||
      !natural(pending.dungeon.loadoutRevision) ||
      pending.dungeon.loadoutRevision !== state.cardLoadout!.revision ||
      !natural(pending.dungeon.referenceLevel) ||
      pending.dungeon.referenceLevel < 1 ||
      pending.dungeon.referenceLevel > 9 ||
      !natural(pending.dungeon.entryHp) ||
      pending.dungeon.entryHp <= 0
    )
      throw new Error('副本入场快照无效。');
  }
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
      (pending.result.continuation !== undefined &&
        pending.result.continuation?.type !== 'secret-realm') ||
      !Array.isArray(pending.result.changes) ||
      pending.result.changes.some((line) => typeof line !== 'string')
    ) {
      throw new Error('机缘结算记录不完整。');
    }
  } else if (pending.seq <= state.lastSettledSeq)
    throw new Error('机缘序号与结算记录冲突。');
  if (pending.cardRun || pending.engine === 'card-dungeon-v1') {
    if (
      state.version !== 2 ||
      pending.engine !== 'card-dungeon-v1' ||
      !pending.cardRun ||
      pending.battle ||
      !pending.adventurePlan ||
      !pending.dungeon ||
      pending.encounter.id !== 'adventure-battle'
    )
      throw new Error('卡牌挑战现场无效。');
    assertCardBattleState(pending.cardRun);
    const run = pending.cardRun;
    const offer = pending.dungeon.offer;
    const request = pending.adventurePlan.request;
    const frozenLoadout = pending.dungeon.entryLoadout ?? state.cardLoadout!;
    if (
      run.id !== pending.id ||
      run.seed !== pending.seed ||
      run.player.entryHp !== pending.dungeon.entryHp ||
      run.maxTurns !== 12 ||
      request.adventureType !== 'secret_realm' ||
      request.realmName !== offer.name ||
      request.realmDescription !== offer.description ||
      request.realmMinRealm !== offer.minRealm ||
      request.riskLevel !== offer.riskLevel ||
      request.entryCost !== offer.cost ||
      JSON.stringify(request.realmDrops) !== JSON.stringify(offer.drops) ||
      run.cards.length !== frozenLoadout.resume.length ||
      run.cards.some(
        (card, index) => card.id !== frozenLoadout.resume[index]
      ) ||
      (pending.phase === 'battle'
        ? !['battle', 'discard'].includes(run.phase)
        : ['battle', 'discard'].includes(run.phase)) ||
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
          pending.adventurePlan!.enemy[
            key as keyof typeof pending.adventurePlan.enemy
          ] !== run.enemy[key as keyof typeof run.enemy]
      )
    )
      throw new Error('卡牌挑战与冻结的副本计划不一致。');
  } else if (pending.phase === 'battle' || pending.battle) {
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
