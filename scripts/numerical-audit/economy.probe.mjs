import { createRequire } from 'node:module';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';

// Read-only diagnostic harness: call the actual current handlers without mounting UI.
const repo = process.env.AUDIT_REPO;
if (!repo)
  throw new Error('Run through run.mjs with an explicit repository path');
const require = createRequire(join(repo, 'package.json'));
const { build } = require('esbuild');
const output = join(import.meta.dirname, 'economy-runtime.mjs');
await build({
  stdin: {
    contents: [
      './constants',
      './types',
      './utils/playerUtils',
      './utils/itemUtils',
      './views/lottery/useLotteryHandlers',
      './views/sect/useSectHandlers',
      './views/alchemy/useAlchemyHandlers',
      './views/pet/usePetHandlers',
      './views/items/useItemHandlers',
      './views/shop/useShopHandlers',
      './services/battleService',
      './services/randomService',
      './utils/localEvents',
      './utils/encounter',
    ]
      .map((p) => `export * from '${p}';`)
      .join('\n'),
    resolveDir: repo,
    loader: 'ts',
  },
  outfile: output,
  bundle: true,
  format: 'esm',
  platform: 'node',
  define: { 'import.meta.env': '{}' },
  logLevel: 'error',
});
globalThis.localStorage = { getItem: () => null };
globalThis.fetch = () => {
  throw new Error('No network allowed during numerical audit');
};
const g = await import(pathToFileURL(output));
const originalRandom = Math.random;
const originalTimeout = globalThis.setTimeout;
const originalNow = Date.now;
Date.now = () => 1792022400000;
globalThis.setTimeout = () => 0;
const report = {
  baseline: execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: repo,
    encoding: 'utf8',
  }).trim(),
  method:
    'Actual handlers; synchronous functional-updater harness; controlled randomness; no network; no production file changes',
  lottery: {},
  sect: {},
  coffee: {},
  pets: {},
  dropsAndLuck: {},
  shop: {},
};
const initial = () =>
  g.createInitialPlayer('数值审计', 'npu:algorithm:pingmin');
const pet = (overrides = {}) => ({
  ...structuredClone(g.PET_TEMPLATES[0]),
  id: 'audit-pet',
  level: 1,
  exp: 0,
  maxExp: 100,
  evolutionStage: 0,
  affection: 50,
  stats: { ...g.PET_TEMPLATES[0].baseStats },
  ...overrides,
});
function harness(player) {
  let state = structuredClone(player);
  const logs = [],
    rewards = [];
  const props = {
    player,
    setPlayer: (update) => {
      state = typeof update === 'function' ? update(state) : update;
    },
    addLog: (text, type) => logs.push({ text, type }),
    setLotteryRewards: (values) => rewards.push(...values),
    setIsSectOpen() {},
    setPurchaseSuccess() {},
    setCurrentShop() {},
    setIsShopOpen() {},
  };
  return {
    props,
    get state() {
      return state;
    },
    logs,
    rewards,
  };
}
function seeded(seed) {
  let state = seed;
  Math.random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}
const snapshot = (player) => ({
  hp: player.hp,
  maxHp: player.maxHp,
  exp: player.exp,
  attack: player.attack,
  defense: player.defense,
  spirit: player.spirit,
  physique: player.physique,
  speed: player.speed,
  breakthroughBonus: player.breakthroughBonus || 0,
  pets: player.pets.map((p) => ({
    name: p.name,
    level: p.level,
    exp: p.exp,
    maxExp: p.maxExp,
    evolutionStage: p.evolutionStage,
    affection: p.affection,
    stats: p.stats,
  })),
  inventory: player.inventory.map((i) => ({
    name: i.name,
    quantity: i.quantity,
    effect: i.effect,
  })),
});

try {
  const total = g.LOTTERY_PRIZES.reduce((s, p) => s + p.weight, 0);
  const rarities = {};
  for (const p of g.LOTTERY_PRIZES)
    rarities[p.rarity] = (rarities[p.rarity] || 0) + p.weight;
  report.lottery.distribution = {
    prizeCount: g.LOTTERY_PRIZES.length,
    totalWeight: total,
    rarityWeights: rarities,
    rarityProbability: Object.fromEntries(
      Object.entries(rarities).map(([k, v]) => [k, v / total])
    ),
    tenPullAllCommonChanceWithoutPity: (rarities['普通'] / total) ** 10,
    expectedCreditsPerPull:
      g.LOTTERY_PRIZES.reduce(
        (s, p) => s + p.weight * (p.value.spiritStones || 0),
        0
      ) / total,
    expectedExpPerPull:
      g.LOTTERY_PRIZES.reduce((s, p) => s + p.weight * (p.value.exp || 0), 0) /
      total,
    expectedRefundTickets:
      g.LOTTERY_PRIZES.reduce(
        (s, p) => s + p.weight * (p.value.tickets || 0),
        0
      ) / total,
  };
  report.lottery.pityCases = [];
  for (const [lotteryCount, count] of [
    [0, 10],
    [10, 10],
    [9, 1],
    [9, 10],
  ]) {
    Math.random = () => 0;
    const h = harness({
      ...initial(),
      lotteryTickets: 20,
      lotteryCount,
      spiritStones: 0,
    });
    g.useLotteryHandlers(h.props).handleDraw(count);
    report.lottery.pityCases.push({
      startingCount: lotteryCount,
      pulls: count,
      creditsAwarded: h.state.spiritStones,
      actualRareOrBetterReceipts: h.rewards.filter((r) => r.quantity >= 100)
        .length,
      receipts: h.rewards,
      ticketsAfter: h.state.lotteryTickets,
    });
  }
  report.lottery.quantityCases = [];
  for (const id of [
    'lottery-pill-qi-2',
    'lottery-material-refining',
    'lottery-material-upgrade-stone-3',
    'lottery-material-herb-2',
  ]) {
    const p = g.LOTTERY_PRIZES.find((p) => p.id === id);
    const before = g.LOTTERY_PRIZES.slice(
      0,
      g.LOTTERY_PRIZES.indexOf(p)
    ).reduce((s, p) => s + p.weight, 0);
    Math.random = () => (before + p.weight / 2) / total;
    const h = harness({ ...initial(), inventory: [], lotteryTickets: 1 });
    g.useLotteryHandlers(h.props).handleDraw(1);
    report.lottery.quantityCases.push({
      prize: p.name,
      configuredQuantity: p.value.item.quantity,
      receivedQuantity: h.state.inventory[0]?.quantity,
      popup: h.rewards,
    });
  }
  Math.random = () => 0.5;
  const today = new Date().toISOString().slice(0, 10);
  const task = {
    id: 'audit-hunt',
    name: '审计任务',
    description: '',
    type: 'hunt',
    cost: {},
    reward: { contribution: 50, exp: 100 },
    timeCost: 'long',
  };
  const sh = harness({
    ...initial(),
    sectId: 'sect-test',
    sectContribution: 0,
    lastTaskResetDate: today,
  });
  const sect = g.useSectHandlers(sh.props);
  for (let i = 0; i < 5; i++) sect.handleSectTask(task);
  report.sect.longTaskNoWait = {
    attempted: 5,
    credited: sh.state.sectContribution / 50,
    contribution: sh.state.sectContribution,
    expAdded: sh.state.exp,
    hpLost: sh.props.player.hp - sh.state.hp,
    count: sh.state.dailyTaskCount,
    logs: sh.logs,
  };
  const ph = harness({
    ...initial(),
    sectId: 'sect-test',
    sectContribution: 0,
    lastTaskResetDate: today,
  });
  const patrol = g.useSectHandlers(ph.props);
  for (let i = 0; i < 25; i++)
    patrol.handleSectTask({
      ...task,
      type: 'patrol',
      timeCost: 'instant',
      reward: { contribution: 30 },
    });
  report.sect.instantCap = {
    attempted: 25,
    accepted: ph.state.dailyTaskCount.instant,
    creditedContribution: ph.state.sectContribution,
    uiCap: 10,
    handlerCap: 20,
  };
  const collect = {
    ...task,
    type: 'collect',
    timeCost: 'instant',
    reward: { contribution: 40, items: [{ name: '冰美式', quantity: 1 }] },
  };
  const rewardH = harness({
    ...initial(),
    inventory: [],
    sectId: 'sect-test',
    lastTaskResetDate: today,
  });
  g.useSectHandlers(rewardH.props).handleSectTask(collect);
  const rewardItem = structuredClone(rewardH.state.inventory[0]);
  g.useItemHandlers(rewardH.props).handleUseItem(rewardH.state.inventory[0]);
  report.sect.collectReward = {
    advertised: '冰美式',
    obtainedItem: rewardItem,
    expGainedWhenUsed: rewardH.state.exp,
  };
  seeded(23);
  report.sect.generatedTaskExample = g
    .generateRandomSectTasks('核心成员', 12)
    .map(({ type, cost, reward, timeCost }) => ({
      type,
      cost,
      reward,
      timeCost,
    }));

  report.coffee.craftedRecipes = [];
  for (const recipe of [...g.PILL_RECIPES, ...g.DISCOVERABLE_RECIPES]) {
    Math.random = () => 0.5;
    const player = {
      ...initial(),
      hp: 1,
      inventory: recipe.ingredients.map((i, n) => ({
        id: `material-${n}`,
        name: i.name,
        quantity: i.qty,
        type: g.ItemType.Herb,
        description: '',
      })),
      spiritStones: recipe.cost,
    };
    const h = harness(player);
    g.useAlchemyHandlers(h.props).handleCraft(recipe, 1);
    const crafted = h.state.inventory.find(
      (i) => i.name === recipe.result.name
    );
    const itemHandler = g.useItemHandlers({ ...h.props, player: h.state });
    itemHandler.handleUseItem(crafted);
    report.coffee.craftedRecipes.push({
      recipe: recipe.name,
      cost: recipe.cost,
      ingredients: recipe.ingredients,
      declaredEffects: recipe.result.effect,
      after: snapshot(h.state),
      actualGains: {
        hp: h.state.hp - 1,
        maxHp: h.state.maxHp - player.maxHp,
        exp: h.state.exp - player.exp,
        attack: h.state.attack - player.attack,
        defense: h.state.defense - player.defense,
        spirit: h.state.spirit - player.spirit,
        physique: h.state.physique - player.physique,
        speed: h.state.speed - player.speed,
        bonus:
          (h.state.breakthroughBonus || 0) - (player.breakthroughBonus || 0),
        newPets: h.state.pets.length - player.pets.length,
      },
    });
  }
  const bonusRecipe = g.DISCOVERABLE_RECIPES.find(
    (r) => r.result.effect?.breakthroughBonus
  );
  for (const mode of ['single', 'all']) {
    const h = harness({
      ...initial(),
      inventory: [
        {
          id: 'bonus',
          name: bonusRecipe.name,
          type: g.ItemType.Pill,
          description: bonusRecipe.result.description,
          quantity: 1,
          rarity: bonusRecipe.result.rarity,
          effect: bonusRecipe.result.effect,
        },
      ],
    });
    const use = g.useItemHandlers(h.props);
    if (mode === 'single') use.handleUseItem(h.state.inventory[0]);
    else use.handleUseAllConsumables();
    report.coffee[`breakthroughBonus${mode}`] = snapshot(h.state);
  }
  const plain = g.PILL_RECIPES[0];
  const normalized = g.normalizeItemEffect(plain.name, plain.result.effect);
  const stacked = harness({
    ...initial(),
    inventory: [
      {
        id: 'existing',
        ...plain.result,
        effect: normalized.effect,
        quantity: 1,
      },
      ...plain.ingredients.map((i, n) => ({
        id: `mat-${n}`,
        name: i.name,
        type: g.ItemType.Herb,
        quantity: i.qty,
        description: '',
      })),
    ],
    spiritStones: plain.cost,
  });
  g.useAlchemyHandlers(stacked.props).handleCraft(plain, 1);
  report.coffee.sourceDependentStack = {
    craftedDefinition: plain.result.effect,
    adventureDefinition: normalized.effect,
    afterStack: stacked.state.inventory.map((i) => ({
      name: i.name,
      quantity: i.quantity,
      effect: i.effect,
    })),
  };

  Math.random = () => 0.5;
  const eh = harness({
    ...initial(),
    pets: [pet({ level: 10 })],
    inventory: [
      { id: 'beans', name: '咖啡豆', type: g.ItemType.Herb, quantity: 10 },
    ],
  });
  g.usePetHandlers(eh.props).handleEvolvePet('audit-pet');
  report.pets.evolution = {
    required: g.PET_TEMPLATES[0].evolutionRequirements,
    stageAfter: eh.state.pets[0].evolutionStage,
    materialsAfter: eh.state.inventory,
    statsAfter: eh.state.pets[0].stats,
  };
  report.pets.batchExhaustion = [];
  for (const feedType of ['hp', 'exp']) {
    const h = harness({
      ...initial(),
      hp: 200,
      maxHp: 200,
      exp: 1,
      pets: [pet()],
    });
    const handler = g.usePetHandlers(h.props);
    for (let i = 0; i < 20; i++) handler.handleFeedPet('audit-pet', feedType);
    report.pets.batchExhaustion.push({
      feedType,
      attempts: 20,
      startingHp: 200,
      startingExp: 1,
      result: snapshot(h.state),
      receivedFeedLogs: h.logs.filter((l) => l.text.includes('获得了')).length,
    });
  }
  const nearLevel = {
    ...initial(),
    pets: [pet({ exp: 99 })],
    inventory: [
      {
        id: 'feed',
        name: '食物',
        type: g.ItemType.Herb,
        quantity: 1,
        rarity: '稀有',
      },
    ],
  };
  const manual = harness(nearLevel);
  g.usePetHandlers(manual.props).handleFeedPet('audit-pet', 'item', 'feed');
  report.pets.manualVsAuto = {
    manual: snapshot(manual.state),
    auto: snapshot(g.autoFeedPet(structuredClone(nearLevel), 'audit-pet')),
  };
  report.pets.devourPreview = g.calcDevourGain(
    pet({
      rarity: '绝版',
      level: 100,
      stats: { attack: 200, defense: 150, hp: 1000, speed: 80 },
    })
  );
  const thresholds = [];
  let xp = 100,
    cumulative = 0;
  for (let level = 1; level <= 100; level++) {
    if ([1, 10, 20, 50, 100].includes(level))
      thresholds.push({ level, maxExp: xp, totalExpToReach: cumulative });
    cumulative += xp;
    xp = Math.floor(xp * 1.5);
  }
  report.pets.exponentialThresholds = {
    thresholds,
    maximumBaseFeedBeforeRandom:
      Math.floor(10 * (1 + 6 * 0.5) * (1 + 9 * 0.1)) * 5,
  };
  const playerBase = initial();
  const playerWithPet = {
    ...playerBase,
    activePetId: 'audit-pet',
    pets: [
      pet({
        stats: { attack: 999999, defense: 999999, hp: 999999, speed: 999999 },
        affection: 100,
      }),
    ],
  };
  seeded(83);
  const baseBattle = await g.resolveBattleEncounter(playerBase, 'normal');
  seeded(83);
  const petBattle = await g.resolveBattleEncounter(playerWithPet, 'normal');
  report.pets.combatEffect = {
    seed: 83,
    exactBattleEqual: JSON.stringify(baseBattle) === JSON.stringify(petBattle),
    withoutPet: baseBattle.replay,
    withPet: petBattle.replay,
  };

  const lowLuck = {
    ...initial(),
    luck: 0,
    attack: 10000,
    hp: 10000,
    maxHp: 10000,
  };
  const highLuck = { ...lowLuck, luck: 1000 };
  seeded(52);
  const lowLuckBattle = await g.resolveBattleEncounter(
    lowLuck,
    'secret_realm',
    '高',
    g.RealmType.QiRefining,
    '固定副本',
    '',
    ['红轴机械键盘', '瑰夏咖啡豆']
  );
  seeded(52);
  const highLuckBattle = await g.resolveBattleEncounter(
    highLuck,
    'secret_realm',
    '高',
    g.RealmType.QiRefining,
    '固定副本',
    '',
    ['红轴机械键盘', '瑰夏咖啡豆']
  );
  report.dropsAndLuck.directLoot = {
    lowLuck: 0,
    highLuck: 1000,
    exactBattleAndLootEqual:
      JSON.stringify(lowLuckBattle) === JSON.stringify(highLuckBattle),
    loot: lowLuckBattle.adventureResult.itemsObtained,
  };
  seeded(52);
  const lowEvent = g.generateLocalAdventureEvent(lowLuck, 'normal');
  seeded(52);
  const highEvent = g.generateLocalAdventureEvent(highLuck, 'normal');
  report.dropsAndLuck.localEvent = {
    exactResultEqual: JSON.stringify(lowEvent) === JSON.stringify(highEvent),
  };
  seeded(52);
  const lowReward = g.pickRewardForced(lowLuck);
  seeded(52);
  const highReward = g.pickRewardForced(highLuck);
  report.dropsAndLuck.forcedEncounter = {
    exactResultEqual: JSON.stringify(lowReward) === JSON.stringify(highReward),
    warning:
      'Luck can still gate encounters with requirements.minLuck; no current pickForced probability multiplier.',
  };
  report.dropsAndLuck.formulas = {
    luckyChance:
      'min(0.30, 0.05 + realmIndex*0.02 + (realmLevel-1)*0.01 + luck*0.001)',
    genericBattleChance:
      'max(0.05,min(0.75,base[normal=.22,lucky=.08,secret=.45]+realmIndex*.015+speed*.0004-luck*.0002))',
    targetRarity: {
      normal: { 普通: 0.8, 稀有: 0.17, 传说: 0.03, 绝版: 0 },
      lucky: { 普通: 0.75, 稀有: 0.2, 传说: 0.05, 绝版: 0 },
      secretLow: { 普通: 0.45, 稀有: 0.35, 传说: 0.15, 绝版: 0.05 },
      secretMedium: { 普通: 0.35, 稀有: 0.35, 传说: 0.22, 绝版: 0.08 },
      secretHigh: { 普通: 0.25, 稀有: 0.35, 传说: 0.28, 绝版: 0.12 },
      secretExtreme: { 普通: 0.15, 稀有: 0.35, 传说: 0.3, 绝版: 0.2 },
    },
    note: 'Target rarity before pool availability fallback, recipe filtering, and realm-specific-name overrides. Not final actual probability.',
  };
  report.shop.crossShopArbitrageCandidates = g.SHOPS.flatMap((shop) =>
    shop.items.map((item) => {
      const inventoryItem = { ...item, id: 'purchase', quantity: 1, level: 0 };
      const otherShops = g.SHOPS.filter((other) => other.id !== shop.id)
        .map((other) => ({
          shop: other.name,
          proceeds:
            other.items.find((i) => i.name === item.name)?.sellPrice ||
            g.calculateItemSellPrice(inventoryItem),
        }))
        .filter((other) => other.proceeds > item.price);
      return {
        purchaseShop: shop.name,
        name: item.name,
        cost: item.price,
        otherShops,
      };
    })
  ).filter((item) => item.otherShops.length);
  await writeFile(
    join(import.meta.dirname, 'economy-results.json'),
    `${JSON.stringify(report, null, 2)}\n`
  );
  console.log(
    JSON.stringify(
      {
        baseline: report.baseline,
        lottery: report.lottery.distribution,
        pity: report.lottery.pityCases.map(
          ({
            startingCount,
            pulls,
            creditsAwarded,
            actualRareOrBetterReceipts,
          }) => ({
            startingCount,
            pulls,
            creditsAwarded,
            actualRareOrBetterReceipts,
          })
        ),
        petBattleEqual: report.pets.combatEffect.exactBattleEqual,
        arbitrage: report.shop.crossShopArbitrageCandidates,
        output: join(import.meta.dirname, 'economy-results.json'),
      },
      null,
      2
    )
  );
} finally {
  Math.random = originalRandom;
  globalThis.setTimeout = originalTimeout;
  Date.now = originalNow;
}
