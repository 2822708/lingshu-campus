import { writeFileSync, mkdirSync } from 'node:fs';
import { runVisibleCardStrategy } from './helpers/cardDungeonStrategy.mjs';
import { REALM_DATA, REALM_ORDER } from '../constants';
import { createInitialPlayer } from '../utils/playerUtils';
import { createAdventureBattlePlan } from '../features/interactive/adventureBattle';
import {
  createInteractiveBattle,
  autoInteractiveBattle,
} from '../features/interactive/battle';
import { createCardBattle } from '../features/card-battle/engine';
import { createDefaultCardLoadout } from '../features/card-dungeon/loadout';
import {
  resolveDungeonCards,
  DUNGEON_CARD_COEFFICIENTS,
} from '../features/card-dungeon/numericAdapter';

const attackCoefficient = Number(
  process.env.CARD_ATTACK_COEFFICIENT ?? DUNGEON_CARD_COEFFICIENTS.attack
);
const rows = [];
const count = 12;
for (const realm of REALM_ORDER)
  for (const level of [1, 5, 9])
    for (const risk of ['低', '中', '高', '极度危险'])
      for (const enhanced of [false, true]) {
        const base = REALM_DATA[realm],
          scale = 1 + (level - 1) * 0.1;
        const subject = {
          ...createInitialPlayer('校准', 'npu:algorithm:pingmin'),
          realm,
          realmLevel: level,
          hp: Math.floor(base.baseMaxHp * scale),
          maxHp: Math.floor(base.baseMaxHp * scale),
          attack: Math.floor(base.baseAttack * scale * (enhanced ? 1.5 : 1)),
          defense: Math.floor(base.baseDefense * scale * (enhanced ? 1.5 : 1)),
          spirit: Math.floor(base.baseSpirit * scale * (enhanced ? 1.5 : 1)),
          physique: Math.floor(base.basePhysique * scale),
          speed: Math.floor(base.baseSpeed * scale * (enhanced ? 1.2 : 1)),
        };
        const old = { wins: 0, loss: 0, rounds: 0, stalemate: 0 },
          card = { wins: 0, loss: 0, rounds: 0, stalemate: 0 };
        for (let index = 1; index <= count; index++) {
          const seed = Math.imul(index, 0x9e3779b1) >>> 0;
          const plan = createAdventureBattlePlan(
            subject,
            {
              adventureType: 'secret_realm',
              realmMinRealm: realm,
              riskLevel: risk,
            },
            seed
          );
          const legacy = autoInteractiveBattle(
            createInteractiveBattle({
              id: 'calibration',
              seed,
              player: subject,
              enemy: plan.enemy,
            })
          );
          const next = runVisibleCardStrategy(
            createCardBattle({
              id: 'calibration',
              seed,
              player: {
                hp: subject.hp,
                maxHp: subject.maxHp,
                attack: subject.attack,
                defense: subject.defense,
                speed: subject.speed,
              },
              enemy: plan.enemy,
              cards: resolveDungeonCards(
                subject,
                plan,
                createDefaultCardLoadout(),
                { attack: attackCoefficient, defense: 0.2, recovery: 0.5 }
              ),
            })
          );
          old.wins += Number(legacy.outcome === 'victory');
          old.loss += (subject.hp - legacy.player.hp) / subject.hp;
          old.rounds += legacy.completedRounds;
          old.stalemate += Number(legacy.outcome === 'stalemate');
          card.wins += Number(next.phase === 'victory');
          card.loss += (subject.hp - next.player.hp) / subject.hp;
          card.rounds += next.turn;
          card.stalemate += Number(next.phase === 'stalemate');
        }
        for (const value of [old, card]) {
          value.winRate = value.wins / count;
          value.loss /= count;
          value.rounds /= count;
        }
        rows.push({ realm, level, risk, enhanced, count, old, card });
      }
const aggregates = [];
for (const risk of ['低', '中', '高', '极度危险'])
  for (const enhanced of [false, true]) {
    const group = rows.filter(
      (r) => r.risk === risk && r.enhanced === enhanced
    );
    const aggregate = { risk, enhanced, count: group.length * count };
    for (const type of ['old', 'card'])
      aggregate[type] = {
        winRate: group.reduce((n, r) => n + r[type].winRate, 0) / group.length,
        loss: group.reduce((n, r) => n + r[type].loss, 0) / group.length,
        rounds: group.reduce((n, r) => n + r[type].rounds, 0) / group.length,
        stalemate: group.reduce((n, r) => n + r[type].stalemate, 0),
      };
    aggregates.push(aggregate);
  }
const result = {
  attackCoefficient,
  note: '自动策略基于可见牌/意图，有限种子回归，仅用于校准；不能代替玩家试玩。',
  seedsPerCell: count,
  rows,
  aggregates,
};
const output = 'outputs/卡牌副本接入-2026-10-27';
mkdirSync(output, { recursive: true });
writeFileSync(
  `${output}/balance-attack-${attackCoefficient}.json`,
  JSON.stringify(result, null, 2)
);
console.log(JSON.stringify(aggregates, null, 2));
