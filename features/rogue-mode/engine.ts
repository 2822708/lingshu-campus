import {
  createCardBattle,
  stepCardBattle,
  assertCardBattleState,
} from '../card-battle/engine';
import { CARDS } from '../card-battle/catalog';
import { ENEMY_ARCHETYPES } from '../card-battle/enemies';
import type {
  CardEnemyArchetype,
  CardId,
  ResolvedBattleEquipment,
} from '../card-battle/types';
import {
  JOBS,
  RELICS,
  ROGUE_CARDS,
  getChapter,
  getNodeKind,
  createRogueRoom,
  resolveRogueCard,
  getShopPrices,
} from './catalog';
import { getRogueMap, getRogueMapChoices, getRogueMapNode } from './routeMap';
import type { RogueMapNode } from './routeMap';
import type {
  CreateRogueRunOptions,
  RogueCard,
  RogueCommand,
  RogueNodeKind,
  RogueReward,
  RogueRoom,
  RogueRun,
} from './types';

const PHASES = [
  'route',
  'battle',
  'reward',
  'camp',
  'shop',
  'event',
  'defeat',
  'complete',
];
const ARCHETYPES: CardEnemyArchetype[] = [
  'duelist',
  'sentinel',
  'sprinter',
  'disruptor',
  'regenerator',
  'counterguard',
];
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const natural = (value: unknown, min = 0, max = 1000000): value is number =>
  Number.isSafeInteger(value) && Number(value) >= min && Number(value) <= max;
const text = (value: unknown, max = 256): value is string =>
  typeof value === 'string' && value.trim().length > 0 && value.length <= max;
function requireRun(value: unknown, message: string): asserts value {
  if (!value) throw new Error(`试炼记录无效：${message}`);
}
function roll(run: RogueRun): number {
  let x = run.rngState;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  run.rngState = x >>> 0;
  return run.rngState / 0x100000000;
}
function choose<T>(run: RogueRun, items: readonly T[], count: number): T[] {
  const pool = [...items],
    result: T[] = [];
  while (result.length < count && pool.length)
    result.push(pool.splice(Math.floor(roll(run) * pool.length), 1)[0]);
  return result;
}
function availableRelics(run: RogueRun): string[] {
  return Object.keys(RELICS).filter((id) => !run.relics.includes(id));
}
export function getRogueCurrentKind(run: RogueRun): RogueNodeKind | undefined {
  if (!run.map) return getNodeKind(run.floor);
  const id = run.map.path[run.floor - run.map.startFloor];
  return id === undefined
    ? undefined
    : getRogueMapNode(run.seed, run.floor, id)?.kind;
}
function isCombat(kind: RogueNodeKind | undefined): boolean {
  return kind === 'battle' || kind === 'elite' || kind === 'boss';
}
function clearNode(run: RogueRun): void {
  delete run.battle;
  delete run.reward;
  delete run.shopRelic;
  run.rooms = [];
}
function openService(run: RogueRun, kind: 'camp' | 'shop' | 'event'): void {
  run.phase = kind;
  if (kind === 'shop' && run.relics.length < 12)
    run.shopRelic = choose(run, availableRelics(run), 1)[0];
}
function prepareNode(run: RogueRun): void {
  clearNode(run);
  if (run.map) {
    run.phase = 'route';
    return;
  }
  const kind = getNodeKind(run.floor);
  if (kind === 'battle' || kind === 'elite' || kind === 'boss') {
    run.phase = 'route';
    run.rooms = (
      kind === 'boss' ? ['duelist' as const] : choose(run, ARCHETYPES, 3)
    ).map((archetype, index) => createRogueRoom(run, index, archetype));
  } else {
    openService(run, kind);
  }
}
function advance(run: RogueRun, label: string): void {
  const kind = getRogueCurrentKind(run);
  requireRun(kind, '未进入试炼节点');
  run.cleared = run.floor;
  run.history.push({ floor: run.floor, kind, label });
  if (run.floor === 50) {
    run.phase = 'complete';
    clearNode(run);
    run.lastMessage =
      '答辩天劫已渡过，50关灵枢试炼完成。本局课程领悟与炼器成果已记入试炼手记。';
    return;
  }
  run.floor++;
  if (!run.map && run.floor % 10 === 1)
    run.map = { version: 1, startFloor: run.floor, path: [] };
  prepareNode(run);
}
function cardChoices(run: RogueRun, boss: boolean): CardId[] {
  const pool = Object.values(ROGUE_CARDS).filter(
    (card) => card && (!card.job || card.job === run.jobId)
  );
  const result: CardId[] = [];
  while (result.length < 3 && pool.length) {
    const weights = pool.map(
      (card) =>
        (card!.job === run.jobId ? 3 : 1) *
        (boss && card!.rarity === 'rare' ? 4 : 1)
    );
    let value = roll(run) * weights.reduce((sum, n) => sum + n, 0),
      index = weights.length - 1;
    for (let i = 0; i < weights.length; i++) {
      value -= weights[i];
      if (value < 0) {
        index = i;
        break;
      }
    }
    result.push(pool.splice(index, 1)[0]!.id);
  }
  return result;
}
function grantsRelic(run: RogueRun, kind: RogueNodeKind | undefined): boolean {
  if (kind === 'boss') return true;
  if (kind !== 'elite') return false;
  if (!run.map) return run.floor % 10 === 4;
  return !run.history
    .slice((getChapter(run.floor) - 1) * 10)
    .some((entry) => entry.kind === 'elite');
}
function makeReward(run: RogueRun, kind: RogueNodeKind): RogueReward {
  const chapter = getChapter(run.floor);
  const relicNode = grantsRelic(run, kind);
  const fullRelicCompensation = relicNode && run.relics.length >= 12 ? 30 : 0;
  const gold =
    (kind === 'boss'
      ? 65 + chapter * 4
      : kind === 'elite'
        ? 30 + chapter * 3
        : 18 + chapter * 2) +
    Math.floor(roll(run) * 9) +
    fullRelicCompensation;
  return {
    id: `${run.runId}:reward:${run.floor}`,
    gold,
    cards: cardChoices(run, kind === 'boss'),
    relics:
      run.relics.length < 12 && relicNode
        ? choose(run, availableRelics(run), 3)
        : [],
    stage: 'card',
  };
}
function getCard(run: RogueRun, id: string | undefined): RogueCard {
  const card = run.deck.find((value) => value.id === id);
  if (!card) throw new Error('请选择本局术式牌组中的卡牌。');
  return card;
}
function upgrade(run: RogueRun, id: string | undefined): void {
  const card = getCard(run, id);
  if (card.level >= 2) throw new Error('这门术式已经完成两次参悟。');
  card.level = (card.level + 1) as 1 | 2;
  run.lastMessage = `复盘课程笔记，参悟「${ROGUE_CARDS[card.cardId]!.name}」至第${card.level}级。`;
}
function remove(run: RogueRun, id: string | undefined): void {
  if (run.deck.length <= 8) throw new Error('术式牌组至少保留8张。');
  const card = getCard(run, id);
  if (
    !run.deck.some(
      (item) =>
        item.id !== card.id && (ROGUE_CARDS[item.cardId]?.damage ?? 0) > 0
    )
  )
    throw new Error('术式牌组至少需要保留一张进攻牌。');
  run.deck = run.deck.filter((item) => item.id !== card.id);
  run.lastMessage = `整理修习笔记，移除了「${ROGUE_CARDS[card.cardId]!.name}」。`;
}
function heal(run: RogueRun): number {
  const amount = Math.min(run.maxHp - run.hp, Math.ceil(run.maxHp * 0.3));
  run.hp += amount;
  return amount;
}
function equipment(run: RogueRun): ResolvedBattleEquipment[] {
  return run.relics.map((id) => ({
    ...RELICS[id],
    sourceId: `rogue-relic:${id}`,
  }));
}
function openBattle(run: RogueRun, room: RogueRoom): void {
  const job = JOBS[run.jobId];
  run.battle = createCardBattle({
    id: `${run.runId}:battle:${run.floor}`,
    seed: Math.floor(roll(run) * 0x100000000),
    player: {
      hp: run.hp,
      maxHp: run.maxHp,
      attack: job.attack,
      defense: job.defense,
      speed: job.speed,
    },
    enemy: room.enemy,
    cards: run.deck.map((card) => resolveRogueCard(run, card)),
    equipment: equipment(run),
    maxTurns: 26,
  });
  run.phase = 'battle';
  run.lastMessage = `进入第${run.floor}关考核：${room.name}。观察公开行动，再调度术式与法器。`;
}

export function createRogueRun(options: CreateRogueRunOptions): RogueRun {
  requireRun(
    options && text(options.runId, 80) && natural(options.seed, 0, 0xffffffff),
    '开局标识或种子'
  );
  const job = JOBS[options.jobId];
  requireRun(job, '职业');
  const starter = job.starters.find((item) => item.id === options.starterId);
  requireRun(starter, '初始卡组');
  const run: RogueRun = {
    version: 1,
    runId: options.runId,
    seed: options.seed,
    rngState: options.seed || 0x6d2b79f5,
    seq: 0,
    jobId: options.jobId,
    starterId: options.starterId,
    floor: 1,
    cleared: 0,
    phase: 'route',
    hp: job.hp,
    maxHp: job.hp,
    gold: 60,
    deck: starter.cards.map((cardId, index) => ({
      id: `${options.runId}:starter:${index}`,
      cardId,
      level: 0,
    })),
    relics: [job.starterRelic],
    rooms: [],
    map: { version: 1, startFloor: 1, path: [] },
    history: [],
    lastMessage: '从学园地图选择起点，开始本局灵枢试炼。',
  };
  assertRogueRun(run);
  return run;
}

/** Pure run reducer; callers persist the full returned snapshot before publishing it. */
export function stepRogueRun(state: RogueRun, command: RogueCommand): RogueRun {
  assertRogueRun(state);
  if (
    !command ||
    command.runId !== state.runId ||
    command.seq !== state.seq + 1 ||
    !natural(command.seq, 1) ||
    state.phase === 'complete' ||
    state.phase === 'defeat'
  )
    return state;
  const run = clone(state),
    phase = state.phase;
  let accepted = true;
  if (command.type === 'choose-node' && phase === 'route' && run.map) {
    const node = getRogueMapChoices(
      run.seed,
      run.floor,
      run.map.path.at(-1)
    ).find((item) => item.id === command.id);
    if (!node) throw new Error('这处节点与当前路线不相连。');
    run.map.path.push(node.id);
    if (node.kind === 'camp' || node.kind === 'shop' || node.kind === 'event') {
      openService(run, node.kind);
      run.lastMessage = {
        camp: '来到研习室，选择调息或整理术式。',
        shop: '来到学园工坊，可以兑换法器或调校术式。',
        event: '遇到同门的助研邀请，选择如何回应。',
      }[node.kind];
    } else {
      const archetype =
        node.kind === 'boss' ? 'duelist' : choose(run, ARCHETYPES, 1)[0];
      const room = createRogueRoom(run, 0, archetype, node.kind);
      room.nodeId = node.id;
      run.rooms = [room];
      openBattle(run, room);
    }
  } else if (command.type === 'choose-room' && phase === 'route' && !run.map) {
    const room = run.rooms.find((item) => item.id === command.id);
    if (!room) throw new Error('这项试炼考核已失效，请重新选择。');
    openBattle(run, room);
  } else if (command.type === 'battle' && phase === 'battle' && run.battle) {
    if (!['battle', 'discard'].includes(run.battle.phase)) return state;
    const next = stepCardBattle(run.battle, {
      ...command.action,
      id: run.battle.id,
      seq: run.battle.commandSeq + 1,
    });
    if (next === run.battle) return state;
    run.battle = next;
    run.hp = next.player.hp;
    if (next.phase === 'victory')
      run.lastMessage = '本场试炼通过，确认战果后领取考核学分与课程领悟。';
    else if (!['battle', 'discard'].includes(next.phase))
      run.lastMessage =
        next.phase === 'defeat'
          ? '精力耗尽，本局试炼结束。课程笔记可供下次修习复盘。'
          : '本场考核未通过，本局试炼结束。课程笔记可供下次修习复盘。';
  } else if (
    command.type === 'settle-battle' &&
    phase === 'battle' &&
    run.battle
  ) {
    if (['battle', 'discard'].includes(run.battle.phase)) return state;
    if (run.battle.phase !== 'victory') {
      run.phase = 'defeat';
      run.rooms = [];
      delete run.battle;
      run.lastMessage = '本局灵枢试炼结束。保留修习记录，或选定流派重新入境。';
    } else {
      const kind = getRogueCurrentKind(run);
      requireRun(kind && isCombat(kind), '战斗节点对应');
      const fullRelicCompensation =
        run.relics.length >= 12 && grantsRelic(run, kind);
      run.reward = makeReward(run, kind);
      run.gold += run.reward.gold;
      if (kind === 'boss') {
        run.maxHp += 8;
        run.hp = Math.min(run.maxHp, run.hp + Math.ceil(run.maxHp * 0.25));
      }
      run.phase = 'reward';
      delete run.battle;
      run.rooms = [];
      run.lastMessage = `通过考核，获得${run.reward.gold}试炼学分${kind === 'boss' ? '；完成本章突破，精力上限+8并恢复部分精力' : ''}。${fullRelicCompensation ? '法器位已满，折算30试炼学分。' : ''}从考核复盘中领悟一门术式，也可跳过。`;
    }
  } else if (
    command.type === 'choose-card' &&
    phase === 'reward' &&
    run.reward?.stage === 'card'
  ) {
    if (command.cardId !== null) {
      if (!run.reward.cards.includes(command.cardId))
        throw new Error('这门术式不在本次固定的课程领悟中。');
      if (run.deck.length >= 30)
        throw new Error('术式牌组已达30张，可以跳过本次领悟。');
      run.deck.push({
        id: `${run.runId}:card:${command.seq}`,
        cardId: command.cardId,
        level: 0,
      });
      run.lastMessage = `复盘考核，领悟术式「${ROGUE_CARDS[command.cardId]!.name}」，已加入本局牌组。`;
    } else run.lastMessage = '保留当前术式搭配，跳过本次课程领悟。';
    if (run.reward.relics.length) run.reward.stage = 'relic';
    else advance(run, '试炼考核通过，完成课程复盘');
  } else if (
    command.type === 'choose-relic' &&
    phase === 'reward' &&
    run.reward?.stage === 'relic'
  ) {
    if (command.relicId !== null) {
      if (
        !run.reward.relics.includes(command.relicId) ||
        run.relics.includes(command.relicId) ||
        run.relics.length >= 12
      )
        throw new Error('这件实验法器当前不可领取。');
      run.relics.push(command.relicId);
      run.lastMessage = `领取考核炼器成果「${RELICS[command.relicId].name}」，后续试炼中自动生效。`;
    } else run.lastMessage = '保留当前法器搭配，跳过本次炼器成果。';
    advance(run, '试炼考核通过，完成术式与法器整理');
  } else if (command.type === 'camp' && phase === 'camp') {
    if (command.choice === 'heal')
      run.lastMessage = `在研习室调息，恢复${heal(run)}精力。`;
    else if (command.choice === 'upgrade') upgrade(run, command.cardId);
    else if (command.choice === 'remove') remove(run, command.cardId);
    else accepted = false;
    if (accepted) advance(run, '完成研习室调息与修习复盘');
  } else if (command.type === 'shop' && phase === 'shop') {
    const prices = getShopPrices(run);
    if (command.choice === 'leave')
      run.lastMessage = '保留试炼学分，离开校园工坊，继续修习。';
    else if (command.choice === 'heal') {
      if (run.hp === run.maxHp) throw new Error('当前精力已满。');
      if (run.gold < prices.heal) throw new Error('试炼学分不足。');
      run.gold -= prices.heal;
      run.lastMessage = `在校园工坊领取调息灵饮，恢复${heal(run)}精力。`;
    } else if (command.choice === 'upgrade') {
      if (run.gold < prices.upgrade) throw new Error('试炼学分不足。');
      upgrade(run, command.cardId);
      run.gold -= prices.upgrade;
    } else if (command.choice === 'relic') {
      if (
        !run.shopRelic ||
        run.relics.length >= 12 ||
        run.relics.includes(run.shopRelic)
      )
        throw new Error('本次没有可领取的实验法器。');
      if (run.gold < prices.relic) throw new Error('试炼学分不足。');
      run.gold -= prices.relic;
      run.relics.push(run.shopRelic);
      run.lastMessage = `委托工坊炼制「${RELICS[run.shopRelic].name}」，已纳入本局法器。`;
    } else accepted = false;
    if (accepted) advance(run, '完成校园工坊委托');
  } else if (command.type === 'event' && phase === 'event') {
    const chapter = getChapter(run.floor);
    if (command.choice === 'supplies') {
      const gold = 20 + (chapter - 1) * 5;
      run.gold += gold;
      run.lastMessage = `协助同门整理实验记录，领取${gold}试炼学分的助研补贴。`;
    } else if (command.choice === 'risk') {
      if (run.hp <= 8) throw new Error('精力不足以承担8点实验损耗。');
      const gold = 45 + (chapter - 1) * 10;
      run.hp -= 8;
      run.gold += gold;
      run.lastMessage = `完成高负荷炼器实验，消耗8点精力，获得${gold}试炼学分。`;
    } else if (command.choice === 'remove') {
      if (run.gold < 15) throw new Error('资料室整理术式需要15试炼学分。');
      remove(run, command.cardId);
      run.gold -= 15;
    } else accepted = false;
    if (accepted) advance(run, '完成同门助研与修习选择');
  } else accepted = false;
  if (!accepted) return state;
  run.seq = command.seq;
  assertRogueRun(run);
  return run;
}

function assertMapPath(run: RogueRun): RogueMapNode[] {
  const map = run.map;
  if (map === undefined) return [];
  requireRun(
    map &&
      map.version === 1 &&
      natural(map.startFloor, 1, run.floor) &&
      map.startFloor % 10 === 1 &&
      Array.isArray(map.path),
    '路线版本或起始关数'
  );
  const through = run.phase === 'route' ? run.cleared : run.floor;
  requireRun(
    map.path.length === through - map.startFloor + 1 &&
      run.seq >= map.path.length,
    '路线进度与当前关数不符'
  );
  const nodes: RogueMapNode[] = [];
  let chapter = 0;
  let graph: RogueMapNode[] = [];
  for (const [index, id] of map.path.entries()) {
    const floor = map.startFloor + index;
    if (getChapter(floor) !== chapter) {
      chapter = getChapter(floor);
      graph = getRogueMap(run.seed, chapter);
    }
    const node = graph.find((item) => item.id === id && item.floor === floor);
    requireRun(
      node && (floor % 10 === 1 || nodes[index - 1]?.next.includes(node.id)),
      '路线节点无效或未连通'
    );
    nodes.push(node);
  }
  return nodes;
}

export function assertRogueRun(value: unknown): asserts value is RogueRun {
  requireRun(
    value && typeof value === 'object' && !Array.isArray(value),
    '不是对象'
  );
  const run = value as RogueRun;
  requireRun(
    run.version === 1 &&
      text(run.runId, 80) &&
      natural(run.seed, 0, 0xffffffff) &&
      natural(run.rngState, 1, 0xffffffff) &&
      natural(run.seq),
    '版本、标识或随机状态'
  );
  requireRun(
    Object.hasOwn(JOBS, run.jobId) &&
      JOBS[run.jobId].starters.some((item) => item.id === run.starterId),
    '职业与初始牌组'
  );
  requireRun(
    natural(run.floor, 1, 50) &&
      natural(run.cleared, 0, 50) &&
      PHASES.includes(run.phase),
    '关数或阶段'
  );
  requireRun(
    natural(run.maxHp, 1, 5000) &&
      natural(run.hp, 0, run.maxHp) &&
      natural(run.gold, 0, 1000000) &&
      text(run.lastMessage, 2000),
    '角色与资源'
  );
  requireRun(
    run.cleared === (run.phase === 'complete' ? 50 : run.floor - 1),
    '关数水位'
  );
  const mapPath = assertMapPath(run);
  const mapStart = run.map?.startFloor ?? 51;
  const currentNode = mapPath[run.floor - mapStart];
  const kind = run.map ? currentNode?.kind : getNodeKind(run.floor);
  const bossesCleared =
    Math.floor(run.cleared / 10) +
    (run.phase === 'reward' && kind === 'boss' ? 1 : 0);
  requireRun(
    run.maxHp === JOBS[run.jobId].hp + bossesCleared * 8 &&
      run.seq >= run.cleared,
    '章节生命成长或指令进度'
  );
  requireRun(
    Array.isArray(run.history) &&
      run.history.length === run.cleared &&
      run.history.every(
        (entry, index) =>
          entry &&
          entry.floor === index + 1 &&
          entry.kind ===
            (mapPath[entry.floor - mapStart]?.kind ??
              getNodeKind(entry.floor)) &&
          text(entry.label, 256)
      ),
    '历史进度'
  );
  requireRun(
    Array.isArray(run.deck) && run.deck.length >= 8 && run.deck.length <= 30,
    '牌组数量'
  );
  const ids = new Set<string>();
  for (const card of run.deck) {
    requireRun(
      card &&
        text(card.id, 128) &&
        !ids.has(card.id) &&
        Object.hasOwn(ROGUE_CARDS, card.cardId) &&
        Object.hasOwn(CARDS, card.cardId) &&
        natural(card.level, 0, 2),
      '牌组实例'
    );
    ids.add(card.id);
  }
  requireRun(
    run.deck.some((card) => (ROGUE_CARDS[card.cardId]?.damage ?? 0) > 0),
    '牌组缺少进攻'
  );
  requireRun(
    Array.isArray(run.relics) &&
      run.relics.length >= 1 &&
      run.relics.length <= 12 &&
      new Set(run.relics).size === run.relics.length &&
      run.relics.every(
        (id) => typeof id === 'string' && Object.hasOwn(RELICS, id)
      ) &&
      run.relics.includes(JOBS[run.jobId].starterRelic),
    '遗物'
  );
  requireRun(Array.isArray(run.rooms), '遭遇列表');
  const fighting = isCombat(kind);
  if (run.phase === 'battle' || (run.phase === 'route' && !run.map)) {
    requireRun(
      fighting &&
        run.rooms.length === (run.map || kind === 'boss' ? 1 : 3) &&
        new Set(run.rooms.map((room) => room.id)).size === run.rooms.length,
      '战斗遭遇数量'
    );
    for (const room of run.rooms) {
      requireRun(
        room &&
          text(room.id, 128) &&
          text(room.name, 128) &&
          text(room.description, 1000) &&
          room.enemy &&
          Object.hasOwn(ENEMY_ARCHETYPES, room.enemy.archetype ?? '') &&
          room.id.startsWith(`${run.runId}:room:${run.floor}:`) &&
          room.nodeId === currentNode?.id,
        '遭遇定义'
      );
      const index = Number(room.id.split(':').at(-1)),
        enemy = room.enemy;
      requireRun(
        natural(index, 0, run.map || kind === 'boss' ? 0 : 2) &&
          room.id === `${run.runId}:room:${run.floor}:${index}` &&
          natural(enemy.maxHp, 1, 100000) &&
          enemy.hp === enemy.maxHp &&
          natural(enemy.attack) &&
          natural(enemy.defense) &&
          natural(enemy.speed) &&
          text(enemy.name, 128) &&
          ['balanced', 'aggressive', 'defensive'].includes(enemy.behavior) &&
          text(enemy.title, 128) &&
          text(enemy.realm, 128),
        '遭遇计划'
      );
      if (enemy.pattern !== undefined) {
        requireRun(
          Array.isArray(enemy.pattern) &&
            enemy.pattern.length >= 2 &&
            enemy.pattern.length <= 8,
          '遭遇行动循环'
        );
        for (const move of enemy.pattern)
          requireRun(
            move &&
              ['strong', 'guard', 'adjust'].includes(move.type) &&
              text(move.name, 128) &&
              text(move.description, 1000) &&
              Number.isFinite(move.damageMultiplier) &&
              move.damageMultiplier >= 0 &&
              move.damageMultiplier <= 3 &&
              ['piercePercent', 'healPercent', 'thornsPercent'].every(
                (key) =>
                  move[key as keyof typeof move] === undefined ||
                  natural(move[key as keyof typeof move], 0, 100)
              ),
            '遭遇行动'
          );
      }
      if (kind === 'boss')
        requireRun(enemy.pattern !== undefined, 'BOSS缺少专属循环');
    }
  } else requireRun(run.rooms.length === 0, '非战斗阶段包含遭遇');
  if (run.phase === 'battle') {
    requireRun(run.battle, '缺少战斗');
    assertCardBattleState(run.battle);
    const battle = run.battle,
      job = JOBS[run.jobId];
    requireRun(
      battle.id === `${run.runId}:battle:${run.floor}` &&
        battle.seed === run.rngState &&
        battle.maxTurns === 26 &&
        battle.player.hp === run.hp &&
        battle.player.maxHp === run.maxHp &&
        battle.player.attack === job.attack &&
        battle.player.defense === job.defense &&
        battle.player.speed === job.speed,
      '战斗角色对应'
    );
    requireRun(
      battle.cards.length === run.deck.length &&
        battle.cards.every(
          (card, index) =>
            card.id === run.deck[index].id &&
            card.templateId === run.deck[index].cardId
        ) &&
        (battle.equipment?.length ?? 0) === run.relics.length &&
        battle.equipment!.every(
          (item, index) =>
            item.id === run.relics[index] &&
            item.sourceId === `rogue-relic:${run.relics[index]}`
        ),
      '战斗牌组或遗物对应'
    );
    const room = run.rooms.find(
      (item) =>
        item.enemy.name === battle.enemy.name &&
        item.enemy.maxHp === battle.enemy.maxHp &&
        item.enemy.archetype === battle.enemy.archetype
    );
    requireRun(
      room &&
        ['attack', 'defense', 'speed', 'behavior', 'title', 'realm'].every(
          (key) =>
            room.enemy[key as keyof typeof room.enemy] ===
            battle.enemy[key as keyof typeof battle.enemy]
        ),
      '战斗敌人对应'
    );
    const pattern =
      room.enemy.pattern ?? ENEMY_ARCHETYPES[room.enemy.archetype!].pattern;
    requireRun(
      JSON.stringify(battle.enemy.pattern) === JSON.stringify(pattern),
      '战斗行动循环'
    );
  } else requireRun(run.battle === undefined, '其他阶段包含战斗');
  if (run.phase === 'reward') {
    const reward = run.reward;
    requireRun(
      fighting &&
        reward &&
        reward.id === `${run.runId}:reward:${run.floor}` &&
        natural(reward.gold, 1, 200) &&
        ['card', 'relic'].includes(reward.stage),
      '奖励身份或阶段'
    );
    requireRun(
      Array.isArray(reward.cards) &&
        reward.cards.length === 3 &&
        new Set(reward.cards).size === 3 &&
        reward.cards.every(
          (id) =>
            Object.hasOwn(ROGUE_CARDS, id) &&
            (!ROGUE_CARDS[id]!.job || ROGUE_CARDS[id]!.job === run.jobId)
        ),
      '卡牌奖励'
    );
    requireRun(
      Array.isArray(reward.relics) &&
        (reward.relics.length === 0 || grantsRelic(run, kind)) &&
        reward.relics.length <= 3 &&
        new Set(reward.relics).size === reward.relics.length &&
        reward.relics.every(
          (id) => Object.hasOwn(RELICS, id) && !run.relics.includes(id)
        ) &&
        (reward.stage !== 'relic' || reward.relics.length > 0),
      '遗物奖励'
    );
  } else requireRun(run.reward === undefined, '其他阶段包含奖励');
  if (run.phase === 'shop')
    requireRun(
      kind === 'shop' &&
        (run.shopRelic === undefined ||
          (Object.hasOwn(RELICS, run.shopRelic) &&
            !run.relics.includes(run.shopRelic))),
      '商店货物'
    );
  else requireRun(run.shopRelic === undefined, '其他阶段包含商店货物');
  if (['camp', 'shop', 'event'].includes(run.phase))
    requireRun(run.phase === kind, '服务节点对应');
  if (run.phase === 'complete')
    requireRun(run.floor === 50 && run.hp > 0, '通关');
  if (run.phase === 'defeat') requireRun(fighting, '失败所在节点');
  if (run.hp === 0)
    requireRun(
      run.phase === 'defeat' ||
        (run.phase === 'battle' && run.battle?.phase === 'defeat'),
      '生命耗尽阶段'
    );
}
