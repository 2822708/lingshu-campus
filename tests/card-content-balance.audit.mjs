import { mkdirSync, writeFileSync } from 'node:fs';
import { REALM_DATA, REALM_ORDER } from '../constants';
import { EquipmentSlot, ItemType } from '../types';
import { createInitialPlayer } from '../utils/playerUtils';
import { createAdventureBattlePlan } from '../features/interactive/adventureBattle';
import { createCardBattle } from '../features/card-battle/engine';
import { ENEMY_ARCHETYPES } from '../features/card-battle/enemies';
import { createDefaultCardLoadout } from '../features/card-dungeon/loadout';
import { TACTIC_DUNGEON_CARD_IDS } from '../features/card-dungeon/sources';
import { resolveDungeonCards } from '../features/card-dungeon/numericAdapter';
import { resolveDungeonEquipment } from '../features/card-dungeon/equipment';
import { runVisibleContentStrategy } from './helpers/cardContentStrategy.mjs';

const equipment = [
  ['青轴机械键盘', ItemType.Weapon, EquipmentSlot.Weapon],
  ['军训迷彩服', ItemType.Armor, EquipmentSlot.Chest],
  ['智能手环', ItemType.Ring, EquipmentSlot.Ring1],
  ['实验室工牌', ItemType.Accessory, EquipmentSlot.Accessory1],
  ['运动护腕', ItemType.Artifact, EquipmentSlot.Artifact1],
  ['笔记本散热底座', ItemType.Artifact, EquipmentSlot.Artifact2],
].map(([name, type, equipmentSlot], i) => ({
  id: `audit-gear-${i}`,
  name,
  type,
  equipmentSlot,
  description: '',
  rarity: '普通',
  quantity: 1,
  isEquippable: true,
}));
const rows = [];
for (const realm of REALM_ORDER) {
  const base = REALM_DATA[realm];
  const scale = 1.4;
  const player = {
    ...createInitialPlayer('内容校准', 'talent-ordinary'),
    realm,
    realmLevel: 5,
    hp: Math.round(base.baseMaxHp * scale),
    maxHp: Math.round(base.baseMaxHp * scale),
    attack: Math.round(base.baseAttack * scale),
    defense: Math.round(base.baseDefense * scale),
    spirit: Math.round(base.baseSpirit * scale),
    physique: Math.round(base.basePhysique * scale),
    speed: Math.round(base.baseSpeed * scale),
    inventory: [],
    equippedItems: {},
  };
  for (const risk of ['低', '中', '高', '极度危险'])
    for (const archetype of Object.keys(ENEMY_ARCHETYPES))
      for (const build of ['base', 'equipment', 'tactics']) {
        const subject =
          build === 'base'
            ? player
            : {
                ...player,
                inventory: equipment,
                equippedItems: Object.fromEntries(
                  equipment.map((item) => [item.equipmentSlot, item.id])
                ),
              };
        const loadout = createDefaultCardLoadout();
        if (build === 'tactics') {
          loadout.library.push(...TACTIC_DUNGEON_CARD_IDS);
          loadout.resume.push(...TACTIC_DUNGEON_CARD_IDS);
        }
        for (let sample = 1; sample <= 3; sample++) {
          const seed = Math.imul(sample, 0x9e3779b1) >>> 0;
          const plan = createAdventureBattlePlan(
            subject,
            {
              adventureType: 'secret_realm',
              realmMinRealm: realm,
              riskLevel: risk,
            },
            seed
          );
          const end = runVisibleContentStrategy(
            createCardBattle({
              id: 'content-audit',
              seed,
              player: subject,
              enemy: { ...plan.enemy, archetype },
              cards: resolveDungeonCards(subject, plan, loadout),
              equipment: resolveDungeonEquipment(subject, plan),
            })
          );
          rows.push({
            realm,
            risk,
            archetype,
            build,
            seed,
            phase: end.phase,
            turns: end.turn,
            loss: (subject.hp - end.player.hp) / subject.hp,
          });
        }
      }
}
function aggregate(group, identity) {
  return {
    ...identity,
    count: group.length,
    winRate: group.filter((r) => r.phase === 'victory').length / group.length,
    loss: group.reduce((sum, r) => sum + r.loss, 0) / group.length,
    turns: group.reduce((sum, r) => sum + r.turns, 0) / group.length,
    stalemates: group.filter((r) => r.phase === 'stalemate').length,
  };
}
const summary = [];
for (const risk of ['低', '中', '高', '极度危险'])
  for (const build of ['base', 'equipment', 'tactics'])
    summary.push(
      aggregate(
        rows.filter((r) => r.risk === risk && r.build === build),
        { risk, build }
      )
    );
const byEnemy = Object.keys(ENEMY_ARCHETYPES).map((archetype) =>
  aggregate(
    rows.filter(
      (r) => r.archetype === archetype && r.risk === '低' && r.build === 'base'
    ),
    { archetype }
  )
);
const output = 'outputs/战斗内容扩充-2026-10-29';
mkdirSync(output, { recursive: true });
writeFileSync(
  `${output}/balance.json`,
  JSON.stringify(
    {
      note: '七学阶5级、四风险、六敌型、三个可见策略构筑、各3种子。装备构筑保持最终角色属性相同，仅比较被动；非真人平衡结论。',
      summary,
      byEnemy,
      rows,
    },
    null,
    2
  )
);
console.log(JSON.stringify({ count: rows.length, summary, byEnemy }, null, 2));
