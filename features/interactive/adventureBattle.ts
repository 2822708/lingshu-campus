import {
  CULTIVATION_ARTS,
  DISCOVERABLE_RECIPES,
  RARITY_MULTIPLIERS,
  REALM_DATA,
  REALM_ORDER,
  TALENTS,
} from '../../constants';
import {
  EquipmentSlot,
  ItemType,
  type AdventureResult,
  type AdventureType,
  type EncounterEvent,
  type Item,
  type ItemRarity,
  type PlayerStats,
  type RealmType,
} from '../../types';
import {
  createBattleEnemySnapshot,
  generateBattleLoot,
  getBattleDifficulty,
} from '../../services/battleService';
import {
  inferItemTypeAndSlot,
  normalizeItemEffect,
} from '../../utils/itemUtils';
import type { BattleEnemy, InteractiveBattleState } from './battle';
import type { RandomSectTask } from '../../services/randomService';

export interface AdventureBattleRequest {
  adventureType: AdventureType;
  riskLevel?: '低' | '中' | '高' | '极度危险';
  realmName?: string;
  realmMinRealm?: RealmType;
  realmDescription?: string;
  realmDrops?: string[];
  /** 调用方开始行动时一次扣取；本模块结算时绝不再次收费。 */
  entryCost?: number;
  battleEncounter?: EncounterEvent | null;
  rewardEncounter?: AdventureResult | null;
  sectTask?: { sectId: string; task: RandomSectTask; day: string };
}

export interface AdventureBattlePlan {
  version: 1;
  seed: number;
  request: AdventureBattleRequest;
  enemy: BattleEnemy;
  strengthMultiplier: number;
  story: string;
  reward: {
    exp: number;
    spiritStones: number;
    items: Item[];
    contribution?: number;
  };
  failure: { exp: number; spiritStones: number };
  independentReward: { exp: number; spiritStones: number; items: Item[] };
  discoveries: { artId?: string; talentId?: string };
}

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const randomFromSeed = (seed: number) => {
  let state = seed >>> 0 || 0x6d2b79f5;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x100000000;
  };
};
const pick = <T>(values: readonly T[], random: () => number) =>
  values[Math.floor(random() * values.length)];

/** 与现有物品入库规则一致；随机属性与配方均在战前固定，结算不会重新抽取。 */
function prepareItem(
  item: NonNullable<AdventureResult['itemObtained']>,
  id: string,
  random: () => number
): Item {
  const inferred = inferItemTypeAndSlot(
    item.name,
    (item.type as ItemType) || ItemType.Material,
    item.description || '',
    item.isEquippable
  );
  const normalized = normalizeItemEffect(
    item.name,
    item.effect,
    item.permanentEffect
  );
  let effect = { ...normalized.effect };
  const permanentEffect = { ...normalized.permanentEffect };
  const slot = inferred.equipmentSlot || (item.equipmentSlot as EquipmentSlot);
  // normalizeItemEffect 为缺省值返回空对象，故按实际属性判断，避免空效果吞掉装备属性。
  if (
    inferred.isEquippable &&
    Object.keys(effect).length === 0 &&
    Object.keys(permanentEffect).length > 0
  ) {
    const { maxHp, ...attributes } = permanentEffect;
    effect = { ...attributes, ...(maxHp ? { hp: maxHp } : {}) };
    for (const key of Object.keys(permanentEffect)) {
      delete permanentEffect[key as keyof typeof permanentEffect];
    }
  }
  const rarity = (item.rarity as ItemRarity) || '普通';
  if (inferred.type === ItemType.Artifact) {
    delete effect.exp;
    const attributes = [
      'attack',
      'defense',
      'hp',
      'spirit',
      'physique',
      'speed',
    ] as const;
    if (!attributes.some((key) => effect[key])) {
      const base = { 普通: 10, 稀有: 30, 传说: 80, 绝版: 200 }[rarity];
      const remaining = [...attributes];
      const count = 1 + Math.floor(random() * 3);
      for (let index = 0; index < count; index += 1) {
        const attribute = remaining.splice(
          Math.floor(random() * remaining.length),
          1
        )[0];
        effect[attribute] = Math.floor(
          base * RARITY_MULTIPLIERS[rarity] * (0.8 + random() * 0.4)
        );
      }
    }
  }
  return clone({
    id,
    name: item.name,
    type: inferred.type,
    description: item.description,
    quantity: 1,
    rarity,
    level: 0,
    isEquippable: inferred.isEquippable,
    equipmentSlot: slot,
    effect,
    permanentEffect,
    recipeData: item.recipeName
      ? DISCOVERABLE_RECIPES.find((recipe) => recipe.name === item.recipeName)
      : undefined,
  });
}

/** 只创建现场和固定奖池；不运行战斗、不预算胜负，也不请求模型。 */
export function createAdventureBattlePlan(
  player: PlayerStats,
  request: AdventureBattleRequest,
  seed: number
): AdventureBattlePlan {
  const random = randomFromSeed(seed);
  const sectTask = request.sectTask?.task;
  const risk = request.battleEncounter?.battle?.difficulty ?? request.riskLevel;
  // The old linear enemy table could add a realm. REALM_DATA grows by multiples,
  // so realm challenges use their entry realm as the base and risk controls difficulty.
  const dungeonRealm =
    request.adventureType === 'secret_realm'
      ? (request.realmMinRealm ?? player.realm)
      : undefined;
  const generated = createBattleEnemySnapshot(
    player,
    request.adventureType,
    risk,
    request.realmMinRealm,
    random,
    (realm, level) => {
      const base = REALM_DATA[dungeonRealm ?? realm];
      const scale = 1 + (Math.min(9, Math.max(1, level)) - 1) * 0.1;
      return {
        baseAttack: base.baseAttack * 0.8 * scale,
        baseDefense: base.baseDefense * 0.8 * scale,
        baseMaxHp: Math.min(base.baseMaxHp * 0.4, base.baseAttack * 4) * scale,
        baseSpeed: base.baseSpeed * 0.95 * scale,
      };
    }
  );
  const enemy: BattleEnemy = {
    ...generated,
    realm: dungeonRealm ?? generated.realm,
    hp: generated.maxHp,
    name: request.battleEncounter?.battle?.enemyName || generated.name,
    title: request.battleEncounter?.battle?.enemyTitle || generated.title,
    behavior: pick(['balanced', 'aggressive', 'defensive'] as const, random),
  };
  const difficulty = getBattleDifficulty(request.adventureType, risk);
  const multiplier =
    request.adventureType === 'secret_realm'
      ? { 低: 1, 中: 1.3, 高: 1.6, 极度危险: 2.2 }[risk ?? '低']
      : 1;
  const exp = Math.round(
    (25 + player.realmLevel * 12) * difficulty * multiplier
  );
  const spiritStones = Math.max(
    3,
    Math.round((6 + player.realmLevel * 2) * difficulty * multiplier)
  );
  const rewardItems: Array<
    NonNullable<AdventureResult['itemObtained']> & { quantity?: number }
  > = sectTask
    ? (sectTask.reward.items ?? []).map((item) => ({
        name: item.name,
        type: ItemType.Material,
        description: `完成任务获得的${item.name}`,
        rarity: '普通',
        quantity: item.quantity || 1,
      }))
    : generateBattleLoot(
        generated.strengthMultiplier,
        request.adventureType,
        player.realm,
        risk,
        request.realmDrops,
        random
      ).filter((item): item is NonNullable<typeof item> => Boolean(item));
  // 强制战斗机缘保留全量搜刮掉落，再叠加其明确配置的奖励物品。
  for (const item of request.battleEncounter?.rewards.items ?? []) {
    const count = Math.max(1, Math.floor(item.quantity ?? 1));
    for (let index = 0; index < count; index += 1) {
      rewardItems.push({
        name: item.name,
        type: ItemType.Material,
        description: `${request.battleEncounter!.name}的战利品`,
        rarity: item.rarity,
      });
    }
  }
  const independentItems = [request.rewardEncounter?.itemObtained].filter(
    (item): item is NonNullable<typeof item> => Boolean(item)
  );
  const discoveries: AdventureBattlePlan['discoveries'] = {};
  if (
    !sectTask &&
    random() < (request.realmName ? 0.05 : 0.03) &&
    request.adventureType !== 'lucky'
  ) {
    const eligible = CULTIVATION_ARTS.filter(
      (art) =>
        !player.cultivationArts.includes(art.id) &&
        REALM_ORDER.indexOf(art.realmRequirement) <=
          REALM_ORDER.indexOf(player.realm)
    );
    if (eligible.length) discoveries.artId = pick(eligible, random).id;
  }
  if (
    !sectTask &&
    random() <
      (request.adventureType === 'lucky'
        ? 0.05
        : request.realmName
          ? 0.02
          : 0.01) &&
    !player.talentId
  ) {
    const eligible = TALENTS.filter(
      (talent) => talent.id !== 'talent-ordinary' && talent.rarity !== '绝版'
    );
    if (eligible.length) discoveries.talentId = pick(eligible, random).id;
  }
  const normalizedSeed = seed >>> 0;
  return clone({
    version: 1,
    seed: normalizedSeed,
    request,
    enemy,
    strengthMultiplier: generated.strengthMultiplier,
    story: [
      sectTask?.description,
      request.battleEncounter?.description,
      request.realmDescription,
      `在${sectTask?.name || request.battleEncounter?.name || request.realmName || (request.adventureType === 'lucky' ? '幸运机缘' : '期末冲刺')}中遇到${enemy.title}${enemy.name}。请根据已公布意图逐轮应对。`,
    ]
      .filter(Boolean)
      .join('\n'),
    reward: {
      exp: sectTask
        ? (sectTask.reward.exp ?? 0)
        : exp + (request.battleEncounter?.rewards.exp ?? 0),
      spiritStones: sectTask
        ? (sectTask.reward.spiritStones ?? 0)
        : spiritStones + (request.battleEncounter?.rewards.spiritStones ?? 0),
      ...(sectTask ? { contribution: sectTask.reward.contribution } : {}),
      items: rewardItems.map((item, index) => ({
        ...prepareItem(item, `battle-${normalizedSeed}-loot-${index}`, random),
        quantity: item.quantity ?? 1,
      })),
    },
    failure: sectTask
      ? { exp: 0, spiritStones: 0 }
      : {
          exp: -Math.max(5, Math.round(exp * 0.5)),
          spiritStones: -Math.max(2, Math.round(spiritStones * 0.6)),
        },
    independentReward: {
      exp: request.rewardEncounter?.expChange ?? 0,
      spiritStones: request.rewardEncounter?.spiritStonesChange ?? 0,
      items: independentItems.map((item, index) =>
        prepareItem(item, `battle-${normalizedSeed}-encounter-${index}`, random)
      ),
    },
    discoveries,
  });
}

const record = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const amount = (value: unknown): value is number =>
  typeof value === 'number' &&
  Number.isFinite(value) &&
  Math.abs(value) <= Number.MAX_SAFE_INTEGER;
const natural = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const text = (value: unknown): value is string => typeof value === 'string';
const optionalText = (value: unknown) => value === undefined || text(value);
const validRealm = (value: unknown) => REALM_ORDER.includes(value as RealmType);
const validRisk = (value: unknown) =>
  ['低', '中', '高', '极度危险'].includes(value as string);
const validEffect = (value: unknown) =>
  value === undefined || (record(value) && Object.values(value).every(amount));
const validTaskItems = (value: unknown) =>
  value === undefined ||
  (Array.isArray(value) &&
    value.every(
      (item) =>
        record(item) &&
        text(item.name) &&
        natural(item.quantity) &&
        item.quantity > 0
    ));
const validTask = (value: unknown) =>
  record(value) &&
  text(value.id) &&
  text(value.name) &&
  text(value.description) &&
  value.type === 'hunt' &&
  ['instant', 'short', 'medium', 'long'].includes(value.timeCost as string) &&
  (value.cost === undefined ||
    (record(value.cost) &&
      (value.cost.spiritStones === undefined ||
        natural(value.cost.spiritStones)) &&
      validTaskItems(value.cost.items))) &&
  record(value.reward) &&
  natural(value.reward.contribution) &&
  (value.reward.exp === undefined || natural(value.reward.exp)) &&
  (value.reward.spiritStones === undefined ||
    natural(value.reward.spiritStones)) &&
  validTaskItems(value.reward.items);
const validItem = (value: unknown) => {
  if (
    !record(value) ||
    !text(value.id) ||
    !text(value.name) ||
    !text(value.description) ||
    !Object.values(ItemType).includes(value.type as ItemType) ||
    !natural(value.quantity) ||
    value.quantity < 1 ||
    (value.rarity !== undefined &&
      !['普通', '稀有', '传说', '绝版'].includes(value.rarity as string)) ||
    (value.isEquippable !== undefined &&
      typeof value.isEquippable !== 'boolean') ||
    (value.equipmentSlot !== undefined &&
      !Object.values(EquipmentSlot).includes(
        value.equipmentSlot as EquipmentSlot
      )) ||
    !validEffect(value.effect) ||
    !validEffect(value.permanentEffect)
  )
    return false;
  if (value.recipeData !== undefined) {
    const recipe = value.recipeData;
    if (
      !record(recipe) ||
      !text(recipe.name) ||
      !amount(recipe.cost) ||
      !Array.isArray(recipe.ingredients) ||
      !recipe.ingredients.every(
        (ingredient) =>
          record(ingredient) && text(ingredient.name) && natural(ingredient.qty)
      ) ||
      !record(recipe.result) ||
      !text(recipe.result.name) ||
      !text(recipe.result.description) ||
      !Object.values(ItemType).includes(recipe.result.type as ItemType) ||
      !['普通', '稀有', '传说', '绝版'].includes(
        recipe.result.rarity as string
      ) ||
      !validEffect(recipe.result.effect)
    )
      return false;
  }
  return true;
};

/** 继续/导入的最小结构检查，拒绝无法执行或会渲染成对象的战斗计划。 */
export function assertAdventureBattlePlan(
  value: unknown
): asserts value is AdventureBattlePlan {
  const invalid = () => {
    throw new Error('战斗计划数据无效，请检查存档。');
  };
  if (
    !record(value) ||
    value.version !== 1 ||
    !natural(value.seed) ||
    value.seed > 0xffffffff ||
    !text(value.story) ||
    !amount(value.strengthMultiplier) ||
    value.strengthMultiplier <= 0 ||
    !record(value.request) ||
    !record(value.enemy) ||
    !record(value.discoveries)
  )
    return invalid();
  const request = value.request;
  if (
    !['normal', 'lucky', 'secret_realm'].includes(
      request.adventureType as string
    ) ||
    (request.riskLevel !== undefined && !validRisk(request.riskLevel)) ||
    (request.realmMinRealm !== undefined &&
      !validRealm(request.realmMinRealm)) ||
    (request.entryCost !== undefined && !natural(request.entryCost)) ||
    !optionalText(request.realmName) ||
    !optionalText(request.realmDescription) ||
    (request.realmDrops !== undefined &&
      (!Array.isArray(request.realmDrops) || !request.realmDrops.every(text)))
  )
    return invalid();
  if (request.battleEncounter != null) {
    const encounter = request.battleEncounter;
    if (
      !record(encounter) ||
      !text(encounter.name) ||
      !text(encounter.description) ||
      !record(encounter.rewards) ||
      (encounter.battle !== undefined &&
        (!record(encounter.battle) || !validRisk(encounter.battle.difficulty)))
    )
      return invalid();
  }
  if (
    request.rewardEncounter != null &&
    (!record(request.rewardEncounter) || !text(request.rewardEncounter.story))
  )
    return invalid();
  if (request.sectTask !== undefined) {
    const sectTask = request.sectTask;
    if (
      !record(sectTask) ||
      !text(sectTask.sectId) ||
      !text(sectTask.day) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(sectTask.day) ||
      !validTask(sectTask.task) ||
      request.battleEncounter != null ||
      request.rewardEncounter != null
    )
      return invalid();
  }
  const enemy = value.enemy;
  if (
    !text(enemy.name) ||
    !text(enemy.title) ||
    !validRealm(enemy.realm) ||
    !['balanced', 'aggressive', 'defensive'].includes(
      enemy.behavior as string
    ) ||
    !['hp', 'maxHp', 'attack', 'defense', 'speed'].every((key) =>
      natural(enemy[key])
    ) ||
    (enemy.maxHp as number) < 1 ||
    (enemy.hp as number) > (enemy.maxHp as number)
  )
    return invalid();
  for (const key of ['reward', 'failure', 'independentReward']) {
    const reward = value[key];
    if (
      !record(reward) ||
      !amount(reward.exp) ||
      !amount(reward.spiritStones) ||
      (reward.contribution !== undefined && !natural(reward.contribution)) ||
      (key !== 'failure' &&
        (!Array.isArray(reward.items) || !reward.items.every(validItem)))
    )
      return invalid();
  }
  if (
    !optionalText(value.discoveries.artId) ||
    !optionalText(value.discoveries.talentId)
  )
    return invalid();
}

/** 在父行动的同一次持久化中支付入场成本、预占社团挑战额度。 */
export function applyAdventureBattleEntry(
  player: PlayerStats,
  plan: AdventureBattlePlan
): PlayerStats {
  const cost = plan.request.entryCost ?? 0;
  if (!natural(cost) || player.spiritStones < cost)
    throw new Error(`学分不足，需要 ${cost} 学分。`);
  const sectTask = plan.request.sectTask;
  if (!sectTask) return { ...player, spiritStones: player.spiritStones - cost };
  if (player.sectId !== sectTask.sectId || !validTask(sectTask.task))
    throw new Error('社团任务资格已变化。');
  const { task, day } = sectTask;
  if (cost !== (task.cost?.spiritStones ?? 0))
    throw new Error('社团任务的入场成本不一致。');
  const counters =
    player.lastTaskResetDate === day
      ? { ...player.dailyTaskCount }
      : { instant: 0, short: 0, medium: 0, long: 0 };
  const limits = { instant: 20, short: 10, medium: 5, long: 3 };
  if ((counters[task.timeCost] ?? 0) >= limits[task.timeCost])
    throw new Error('今日该类社团任务挑战次数已用完，请明日再来。');
  const required = new Map<string, number>();
  for (const item of task.cost?.items ?? [])
    required.set(item.name, (required.get(item.name) ?? 0) + item.quantity);
  for (const [name, quantity] of required) {
    const owned = player.inventory
      .filter((item) => item.name === name)
      .reduce((sum, item) => sum + item.quantity, 0);
    if (owned < quantity)
      throw new Error(`物品不足，需要 ${quantity} 个【${name}】。`);
  }
  const inventory = player.inventory
    .map((item) => {
      const needed = required.get(item.name) ?? 0;
      if (needed <= 0) return item;
      const used = Math.min(needed, item.quantity);
      required.set(item.name, needed - used);
      return { ...item, quantity: item.quantity - used };
    })
    .filter((item) => item.quantity > 0);
  return {
    ...player,
    spiritStones: player.spiritStones - cost,
    inventory,
    dailyTaskCount: {
      ...counters,
      [task.timeCost]: (counters[task.timeCost] ?? 0) + 1,
    },
    lastTaskResetDate: day,
  };
}

function addItems(inventory: Item[], items: Item[], battleId: string): Item[] {
  const result = [...inventory];
  for (const item of items) {
    const equipment = item.isEquippable && item.equipmentSlot;
    const index = result.findIndex((owned) => owned.name === item.name);
    if (index >= 0 && !equipment && item.type !== ItemType.Recipe) {
      result[index] = {
        ...result[index],
        quantity: result[index].quantity + item.quantity,
      };
    } else {
      result.push(clone({ ...item, id: `${battleId}:${item.id}` }));
    }
  }
  return result;
}

/** 只处理终局的纯结算；父行动负责持久化、去重和精力归零后的原有降级。 */
export function applyAdventureBattleOutcome(
  player: PlayerStats,
  plan: AdventureBattlePlan,
  battle: InteractiveBattleState
): { player: PlayerStats; feedback: string; changes: string[] } | null {
  if (battle.outcome === 'ongoing') return null;
  const victory = battle.outcome === 'victory';
  const defeated = battle.outcome === 'defeat';
  const reward = victory
    ? plan.reward
    : defeated
      ? plan.failure
      : { exp: 0, spiritStones: 0 };
  let next: PlayerStats = {
    ...player,
    hp: battle.player.hp,
    exp: Math.max(0, player.exp + reward.exp + plan.independentReward.exp),
    spiritStones: Math.max(
      0,
      player.spiritStones +
        reward.spiritStones +
        plan.independentReward.spiritStones
    ),
    sectContribution:
      player.sectContribution + (victory ? (plan.reward.contribution ?? 0) : 0),
    inventory: addItems(
      player.inventory,
      [...(victory ? plan.reward.items : []), ...plan.independentReward.items],
      battle.id
    ),
  };
  const extraFeedback: string[] = [];
  if (victory || defeated) {
    const art = CULTIVATION_ARTS.find(
      (item) => item.id === plan.discoveries.artId
    );
    if (art && !next.cultivationArts.includes(art.id)) {
      next = {
        ...next,
        cultivationArts: [...next.cultivationArts, art.id],
        attack: next.attack + (art.effects.attack ?? 0),
        defense: next.defense + (art.effects.defense ?? 0),
        maxHp: next.maxHp + (art.effects.hp ?? 0),
        hp: battle.player.hp > 0 ? next.hp + (art.effects.hp ?? 0) : 0,
      };
      extraFeedback.push(`你在交手中领悟了课程【${art.name}】。`);
    }
    const talent = TALENTS.find(
      (item) => item.id === plan.discoveries.talentId
    );
    if (talent && !next.talentId) {
      next = {
        ...next,
        talentId: talent.id,
        attack: next.attack + (talent.effects.attack ?? 0),
        defense: next.defense + (talent.effects.defense ?? 0),
        maxHp: next.maxHp + (talent.effects.hp ?? 0),
        hp: battle.player.hp > 0 ? next.hp + (talent.effects.hp ?? 0) : 0,
        luck: next.luck + (talent.effects.luck ?? 0),
      };
      extraFeedback.push(`你在交手中觉醒了天赋【${talent.name}】。`);
    }
  }
  const independent = plan.request.rewardEncounter;
  const signed = (value: number) => (value >= 0 ? `+${value}` : `${value}`);
  const outcome = victory
    ? '挑战完成，领取固定的战斗奖励。'
    : defeated
      ? plan.request.sectTask
        ? '社团挑战未完成，保留伤耗、已付成本和本次挑战次数，不发任务奖励。'
        : '挑战失利，按原规则结算绩点与学分损失。'
      : battle.outcome === 'retreat'
        ? '你主动撤离，保留伤耗和已支付的入场费，不发战斗奖励，不追加扣分。'
        : '本次僵持撤离，保留伤耗和已支付的入场费，不发战斗奖励，不追加扣分。';
  return {
    player: next,
    feedback: [
      outcome,
      independent
        ? `独立校园机缘：${independent.story}（绩点 ${signed(plan.independentReward.exp)}，学分 ${signed(plan.independentReward.spiritStones)}${plan.independentReward.items.length ? `，物品：${plan.independentReward.items.map((item) => item.name).join('、')}` : ''}）。`
        : '',
      ...extraFeedback,
    ]
      .filter(Boolean)
      .join('\n'),
    changes: [
      `精力 ${player.hp} → ${next.hp}`,
      `绩点 ${signed(next.exp - player.exp)}`,
      `学分 ${signed(next.spiritStones - player.spiritStones)}`,
      ...(plan.request.sectTask
        ? [
            `社团贡献 ${signed(next.sectContribution - player.sectContribution)}`,
          ]
        : []),
      ...[
        ...(victory ? plan.reward.items : []),
        ...plan.independentReward.items,
      ].map((item) => `获得 ${item.name} ×${item.quantity}`),
    ],
  };
}
