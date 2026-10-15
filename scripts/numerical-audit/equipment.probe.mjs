import { writeFileSync } from 'node:fs';
import { createInitialPlayer } from '../versioned-project/utils/playerUtils';
import {
  getItemStats,
  calculateItemSellPrice,
  KNOWN_ITEM_EFFECTS,
  normalizeItemEffect,
} from '../versioned-project/utils/itemUtils';
import { useEquipmentHandlers } from '../versioned-project/views/equipment/useEquipmentHandlers';
import { useItemHandlers } from '../versioned-project/views/items/useItemHandlers';
import { useShopHandlers } from '../versioned-project/views/shop/useShopHandlers';
import { useCultivationHandlers } from '../versioned-project/views/cultivation/useCultivationHandlers';
import { useCharacterHandlers } from '../versioned-project/views/character/useCharacterHandlers';
import { ItemType, EquipmentSlot } from '../versioned-project/types';
import {
  CULTIVATION_ARTS,
  TITLES,
  SHOPS,
  PILL_RECIPES,
  DISCOVERABLE_RECIPES,
  UPGRADE_MATERIAL_NAME,
  UPGRADE_STONE_NAME,
  getUpgradeMultiplier,
  INITIAL_ITEMS,
} from '../versioned-project/constants';
globalThis.window = { confirm: () => true };
globalThis.setTimeout = () => 0;
const originalRandom = Math.random;
Math.random = () => 0;
const findings = [];
function base() {
  return {
    ...structuredClone(createInitialPlayer('audit', 'none')),
    hp: 500,
    maxHp: 500,
    spiritStones: 1e4,
    inventory: [],
  };
}
function item(id, type = ItemType.Weapon, effect = { attack: 100 }) {
  return {
    id,
    name: id,
    type,
    description: '',
    rarity: '\u666E\u901A',
    quantity: 1,
    level: 0,
    isEquippable: true,
    equipmentSlot:
      type === ItemType.Artifact
        ? EquipmentSlot.Artifact1
        : type === ItemType.Ring
          ? EquipmentSlot.Ring1
          : EquipmentSlot.Weapon,
    effect,
  };
}
function harness(seed = base()) {
  let state = structuredClone(seed);
  const logs = [];
  const shared = {
    player: state,
    setPlayer: (value) => {
      state = typeof value === 'function' ? value(state) : value;
    },
    addLog: (text) => logs.push(text),
  };
  const equipment = useEquipmentHandlers(shared);
  const items = useItemHandlers(shared);
  const character = () => useCharacterHandlers({ ...shared, player: state });
  const courses = () => useCultivationHandlers({ ...shared, player: state });
  const shop = (currentShop = SHOPS[0]) =>
    useShopHandlers({
      ...shared,
      player: state,
      currentShop,
      setCurrentShop() {},
      setIsShopOpen() {},
      setPurchaseSuccess() {},
    });
  return {
    get state() {
      return state;
    },
    logs,
    equipment,
    items,
    character,
    courses,
    shop,
  };
}
function report(id, expected, observed, note) {
  findings.push({ id, expected, observed, note });
}
{
  const a = item('ordinary');
  report(
    'equipment-formula',
    { ordinaryAttack: 100, rareAttack: 150, natalRareAttack: 225 },
    {
      ordinaryAttack: getItemStats(a).attack,
      rareAttack: getItemStats({ ...a, rarity: '\u7A00\u6709' }).attack,
      natalRareAttack: getItemStats({ ...a, rarity: '\u7A00\u6709' }, true)
        .attack,
    },
    'Direct helper probe; successful diagnosis is not a system health result.'
  );
  const seed = base();
  seed.inventory = [a];
  const h = harness(seed);
  const before = h.state.attack;
  h.equipment.handleEquipItem(a, EquipmentSlot.Weapon);
  h.equipment.handleUnequipItem(EquipmentSlot.Weapon);
  report(
    'equip-unequip-roundtrip',
    before,
    h.state.attack,
    'Ordinary non-natal roundtrip restores attack.'
  );
  h.equipment.handleEquipItem(a, EquipmentSlot.Weapon);
  h.equipment.handleEquipItem(a, EquipmentSlot.Weapon);
  h.equipment.handleUnequipItem(EquipmentSlot.Weapon);
  report(
    'repeat-equip-not-idempotent',
    before,
    h.state.attack,
    'Direct handler double-call; UI normally hides equip once worn, but handler has no same-slot idempotence check.'
  );
}
{
  const artifact = item('hp-artifact', ItemType.Artifact, {
    attack: 10,
    hp: 100,
  });
  const seed = base();
  seed.inventory = [artifact];
  const h = harness(seed);
  h.equipment.handleEquipItem(artifact, EquipmentSlot.Artifact1);
  const afterEquip = h.state.maxHp;
  h.equipment.handleRefineNatalArtifact(h.state.inventory[0]);
  const afterRefine = h.state.maxHp;
  h.equipment.handleUnequipItem(EquipmentSlot.Artifact1);
  report(
    'natal-hp-drift',
    { afterEquip: 600, afterRefine: 600, afterUnequip: 450 },
    { afterEquip, afterRefine, afterUnequip: h.state.maxHp },
    '50 maxHP binding cost remains spent; missing +50 HP natal difference produces extra permanent loss.'
  );
}
{
  const ringA = item('ring-a', ItemType.Ring, { attack: 2 });
  const ringB = item('ring-b', ItemType.Ring, { attack: 5 });
  const seed = base();
  seed.inventory = [ringA, ringB];
  const h = harness(seed);
  h.equipment.handleEquipItem(ringA, EquipmentSlot.Ring1);
  h.equipment.handleEquipItem(ringB, EquipmentSlot.Ring2);
  h.equipment.handleUnequipItem(ringB.equipmentSlot);
  report(
    'inventory-wrong-slot-unload',
    { ring1: 'ring-a', ring2: null },
    h.state.equippedItems,
    'InventoryModal passes item.equipmentSlot instead of locating actual occupied slot, so clicking ring-b unloads ring-a.'
  );
}
{
  const a = item('upgrade-weapon');
  const mats = {
    id: 'mats',
    name: UPGRADE_MATERIAL_NAME,
    type: ItemType.Material,
    description: '',
    quantity: 100,
  };
  const card = {
    id: 'card',
    name: UPGRADE_STONE_NAME,
    type: ItemType.Material,
    description: '',
    quantity: 1,
  };
  const seed = base();
  seed.inventory = [a, mats];
  const h = harness(seed);
  const noCard = await h.equipment.handleUpgradeItem(a, 50, 2, 0);
  report(
    'zero-bonus-card-missing',
    'success at forced RNG 0 with 0 requested cards',
    noCard,
    'Upgrade unconditionally requires an upgrade-card inventory entry.'
  );
  seed.inventory = [a, mats, card];
  const batch = harness(seed);
  batch.equipment.handleEquipItem(a, EquipmentSlot.Weapon);
  const count = await batch.equipment.handleUpgradeItemAll(a, 50, 2, 3);
  const finalItem = batch.state.inventory.find((i) => i.id === a.id);
  report(
    'stale-batch-upgrade',
    {
      level: 3,
      rawAttack: 133,
      playerAttack: seed.attack + 133,
      totalCost: 300,
      matsSpent: 14,
    },
    {
      count,
      level: finalItem.level,
      rawAttack: finalItem.effect?.attack,
      playerAttack: batch.state.attack,
      totalCost: seed.spiritStones - batch.state.spiritStones,
      matsSpent:
        100 - batch.state.inventory.find((i) => i.id === 'mats').quantity,
    },
    'Each loop reuses raw100, level0 success rate and initial costs50/2; actual stored effect only110 while player applies +10 three times.'
  );
  const low = item('low-weapon', ItemType.Weapon, { attack: 5 });
  const small = base();
  small.inventory = [low, mats, card];
  const plateau = harness(small);
  await plateau.equipment.handleUpgradeItem(low, 50, 2, 0);
  report(
    'upgrade-small-stat-floor',
    'designer judgment: whether paid upgrade should improve a stat',
    {
      level: plateau.state.inventory[0].level,
      rawAttack: plateau.state.inventory[0].effect?.attack,
      growthRate: getUpgradeMultiplier('\u666E\u901A'),
    },
    'floor(5*1.1)=5; even repeated manual upgrades never grow raw5.'
  );
}
{
  const drink = {
    id: 'coldbrew',
    name: '\u51B7\u8403\u6C2E\u6C14\u5496\u5561',
    type: ItemType.Pill,
    description: '',
    quantity: 1,
    ...KNOWN_ITEM_EFFECTS['\u51B7\u8403\u6C2E\u6C14\u5496\u5561'],
  };
  const seed = base();
  seed.inventory = [drink];
  const h = harness(seed);
  h.items.handleUseItem(drink);
  report(
    'drink-flat-effect-ignored',
    {
      exp: seed.exp + 6e3,
      spirit: seed.spirit + 100,
      physique: seed.physique + 100,
    },
    { exp: h.state.exp, spirit: h.state.spirit, physique: h.state.physique },
    'Non-equipment effect only handles hp/exp/breakthroughBonus, never flat attributes.'
  );
  const protein = {
    id: 'protein',
    name: '\u86CB\u767D\u5976\u6614',
    type: ItemType.Pill,
    description: '',
    quantity: 1,
    ...KNOWN_ITEM_EFFECTS['\u86CB\u767D\u5976\u6614'],
  };
  const proteinSeed = base();
  proteinSeed.inventory = [protein];
  const p = harness(proteinSeed);
  p.items.handleUseItem(protein);
  report(
    'protein-false-egg',
    { newPets: 0, physiqueDelta: 2 },
    {
      newPets: p.state.pets.length - proteinSeed.pets.length,
      physiqueDelta: p.state.physique - proteinSeed.physique,
    },
    'Name substring \u86CB causes protein drink to hatch a roommate; physique effect is ignored.'
  );
}
{
  const seed = base();
  seed.inventory = [
    {
      id: 'board',
      name: '\u4E07\u80FD\u677F',
      type: ItemType.Material,
      description: '',
      quantity: 10,
    },
    {
      id: 'beans',
      name: '\u5496\u5561\u8C46',
      type: ItemType.Herb,
      description: '',
      quantity: 5,
      effect: {},
    },
    {
      id: 'contract',
      name: '\u5BA4\u53CB\u7B7E\u7EA6\u5361',
      type: ItemType.Material,
      description: '\u7B7E\u7EA6\u5BA4\u53CB',
      rarity: '\u666E\u901A',
      quantity: 1,
    },
    {
      id: 'buff',
      name: '\u7B54\u8FA9\u987A\u5229\u5496',
      type: ItemType.Pill,
      description: '',
      quantity: 2,
      effect: { exp: 200, breakthroughBonus: 0.3 },
    },
  ];
  const h = harness(seed);
  h.items.handleUseAllConsumables();
  report(
    'use-all-destroys-nonconsumables-and-buffs',
    {
      materialsPreserved: 10,
      beansPreserved: 5,
      contractPreservedOrPetAdded: true,
      bonus: 0.6,
      exp: 400,
    },
    {
      inventory: h.state.inventory,
      pets: h.state.pets.length,
      bonus: h.state.breakthroughBonus || 0,
      exp: h.state.exp,
    },
    'Actual one-click UI action selects every unequipped non-Recipe, including materials and pet cards; applies only hp/exp/permanent flat fields.'
  );
  const phantom = {
    id: 'one',
    name: 'test',
    type: ItemType.Pill,
    description: '',
    quantity: 1,
    effect: { exp: 100 },
  };
  const over = base();
  over.inventory = [phantom];
  const b = harness(over);
  b.items.handleUseItemBatch(phantom, 3);
  report(
    'batch-use-inventory-not-validated',
    { exp: 100 },
    { exp: b.state.exp, inventory: b.state.inventory },
    'Direct handler count beyond stock; current UI caps to min(5,item.quantity), so this requires stale/reentrant invocation.'
  );
}
{
  const oldTitle = TITLES.find((t) => (t.effects.hp || 0) > 0);
  const newTitle = TITLES.find((t) => !t.effects.hp);
  const seed = base();
  seed.titleId = oldTitle.id;
  seed.maxHp += oldTitle.effects.hp;
  seed.hp = 1;
  const h = harness(seed);
  h.character().handleSelectTitle(newTitle.id);
  report(
    'low-hp-title-switch-negative',
    { hpAtLeast: 0 },
    {
      oldTitle: oldTitle.name,
      newTitle: newTitle.name,
      hp: h.state.hp,
      maxHp: h.state.maxHp,
    },
    'Title subtracts old maxHP bonus from current HP without a lower clamp.'
  );
  const art = CULTIVATION_ARTS.find((a2) => a2.id === 'art-iron-skin');
  const c = harness(base());
  c.courses().handleLearnArt(art);
  c.courses().handleLearnArt(art);
  report(
    'duplicate-course-handler',
    { learnedOnce: true, defense: base().defense + 5 },
    {
      courseIds: c.state.cultivationArts,
      defense: c.state.defense,
      maxHp: c.state.maxHp,
    },
    'Direct handler lacks learned/realm guards; current UI normally disables learned course.'
  );
  const allocation = base();
  allocation.attributePoints = 1;
  const a = harness(allocation);
  const sameRender = a.character();
  sameRender.handleAllocateAttribute('attack');
  sameRender.handleAllocateAttribute('attack');
  report(
    'queued-point-allocation-negative',
    { attributePoints: 0, attack: allocation.attack + 5 },
    { attributePoints: a.state.attributePoints, attack: a.state.attack },
    'Guard reads outer player; queued callbacks can spend the same last point twice.'
  );
}
{
  const arbitrage = [];
  for (const source of SHOPS)
    for (const si of source.items)
      for (const target of SHOPS) {
        const same = target.items.find((t) => t.name === si.name);
        const sale =
          same?.sellPrice ||
          calculateItemSellPrice({
            ...si,
            quantity: 1,
            level: 0,
            id: 'price-probe',
          });
        if (sale > si.price)
          arbitrage.push({
            source: source.name,
            target: target.name,
            item: si.name,
            buy: si.price,
            sell: sale,
            gain: sale - si.price,
          });
      }
  report(
    'cross-shop-price-scan',
    'no positive buy/resell margin',
    arbitrage,
    'Scanned actual SHOPS inventory; no invented prices.'
  );
  const seed = base();
  const s = harness(seed);
  const phantom = { ...item('absent-item'), quantity: 1 };
  s.shop().handleSellItem(phantom);
  s.shop().handleSellItem(phantom);
  report(
    'sell-missing-item-credits',
    { credits: seed.spiritStones },
    {
      credits: s.state.spiritStones,
      delta: s.state.spiritStones - seed.spiritStones,
    },
    'Sell callback does not validate item exists/quantity; UI stale double invocation can credit absent item.'
  );
  const stackItem = {
    id: 'milk',
    name: '\u9C9C\u725B\u5976',
    type: ItemType.Herb,
    description: '',
    quantity: 10,
    effect: { hp: 20 },
  };
  const stackSeed = base();
  stackSeed.inventory = [stackItem];
  const stack = harness(stackSeed);
  stack.shop().handleSellItem(stackItem);
  report(
    'batch-sell-confirmation-mismatch',
    { confirmed: 30, quantitySold: 10, creditsDelta: 30 },
    {
      handlerCallsFromUI: 1,
      quantitySold: 1,
      creditsDelta: stack.state.spiritStones - stackSeed.spiritStones,
      quantityRemaining: stack.state.inventory[0].quantity,
    },
    'ShopModal handleBatchSell totals price*quantity then calls onSellItem once per stack; actual handler sells one.'
  );
}
report(
  'field-coverage',
  'flat effect/permanentEffect consumers match displayed values',
  {
    coursesWithSecondaryFields: CULTIVATION_ARTS.filter(
      (a) => a.effects.spirit || a.effects.physique || a.effects.speed
    ).map((a) => a.name),
    titlesWithUnusedFields: TITLES.filter(
      (t) =>
        t.effects.spirit ||
        t.effects.physique ||
        t.effects.speed ||
        t.effects.expRate
    ).map((t) => ({ name: t.name, effects: t.effects })),
    recipeFlatEffectItems: [...PILL_RECIPES, ...DISCOVERABLE_RECIPES]
      .filter(
        (r) =>
          r.result.effect &&
          ['attack', 'defense', 'spirit', 'physique', 'speed'].some(
            (k) => r.result.effect?.[k]
          )
      )
      .map((r) => ({ name: r.result.name, effect: r.result.effect })),
  },
  'Permanent breakthroughBonus is in Item type but neither single nor all-use handles it. No getPlayerTotalStats symbol exists in current source.'
);
{
  const milk = SHOPS.flatMap((s) => s.items).find(
    (i) => i.name === '\u751F\u6930\u62FF\u94C1'
  );
  const seed = base();
  seed.hp = 0;
  seed.inventory = [{ ...milk, id: 'latte', quantity: 1 }];
  const h = harness(seed);
  h.items.handleUseItem(seed.inventory[0]);
  report(
    'consumable-ui-rarity-mismatch',
    { displayedHp: getItemStats(seed.inventory[0]).hp },
    {
      actualHpDelta: h.state.hp - seed.hp,
      rawEffect: milk.effect,
      rarity: milk.rarity,
    },
    'InventoryModal local getItemStats applies rarity to every effect.hp even non-equipment; useItem applies raw200 instead of displayed300.'
  );
  const names = [
    '\u9C9C\u725B\u5976',
    '\u901F\u6EB6\u7F8E\u5F0F',
    '\u751F\u6930\u62FF\u94C1',
    '\u624B\u51B2\u7470\u590F',
  ];
  report(
    'same-name-source-values',
    'same named stack has stable numerical meaning',
    names.map((name) => ({
      name,
      shops: SHOPS.flatMap((s) => s.items)
        .filter((i) => i.name === name)
        .map((i) => i.effect),
      recipes: [...PILL_RECIPES, ...DISCOVERABLE_RECIPES]
        .filter((r) => r.result.name === name)
        .map((r) => r.result.effect),
      normalized: normalizeItemEffect(name).effect,
    })),
    'Shop and crafting do not normalize; adventure normalizes. Stacking matches only by name so first acquired effect remains for every later unit.'
  );
  const stackSeed = base();
  stackSeed.inventory = [
    {
      id: 'coffee',
      name: '\u901F\u6EB6\u7F8E\u5F0F',
      type: ItemType.Pill,
      description: '',
      quantity: 1,
      effect: { exp: 200, hp: 30 },
    },
  ];
  const shopCoffee = SHOPS.flatMap((s) => s.items).find(
    (i) => i.name === '\u901F\u6EB6\u7F8E\u5F0F'
  );
  const stack = harness(stackSeed);
  stack.shop().handleBuyItem(shopCoffee, 1);
  report(
    'same-name-stack-effect-order',
    { shopUnitExp: 50 },
    {
      quantity: stack.state.inventory[0].quantity,
      storedEffect: stack.state.inventory[0].effect,
      eachUnitExp: stack.state.inventory[0].effect?.exp,
    },
    'Bought raw50-exp coffee merges into existing normalized200-exp stack retaining200 on both units; reverse order also loses stronger effect.'
  );
  const initialSeed = createInitialPlayer('fresh-audit', 'none');
  const initialBefore = INITIAL_ITEMS.map((i) => ({
    name: i.name,
    quantity: i.quantity,
  }));
  let liveState = initialSeed;
  useItemHandlers({
    player: liveState,
    setPlayer: (update) => {
      liveState = typeof update === 'function' ? update(liveState) : update;
    },
    addLog() {},
  }).handleUseAllConsumables();
  report(
    'use-all-mutates-initial-item-templates',
    initialBefore,
    INITIAL_ITEMS.map((i) => ({ name: i.name, quantity: i.quantity })),
    'createInitialPlayer shallow-copies INITIAL_ITEMS; one-click consumption writes quantity=0 into shared item objects. Future new characters inherit zero-quantity starting supplies in same page session.'
  );
}
Math.random = originalRandom;
const output = {
  baseline: 'd021986',
  method:
    'Calls imported current views handlers with synchronous React functional-state harness; deterministic RNG=0; no UI/network integration. Findings document observed behavior, not regression tests approving bugs.',
  findings,
};
const path = new URL('./equipment-items-results.json', import.meta.url);
writeFileSync(path, JSON.stringify(output, null, 2));
process.stdout.write(JSON.stringify(output, null, 2) + '\n');
