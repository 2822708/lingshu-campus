import test from 'node:test';
import assert from 'node:assert/strict';
import {
  JOBS,
  RELICS,
  ROGUE_CARDS,
  getNodeKind,
  getChapter,
  getBoss,
  getShopPrices,
  resolveRogueCard,
} from '../features/rogue-mode/catalog';
import {
  createRogueRun,
  getRogueCurrentKind,
  stepRogueRun,
  assertRogueRun,
} from '../features/rogue-mode/engine';
import {
  getRogueMap,
  getRogueMapChoices,
  getRogueMapNode,
} from '../features/rogue-mode/routeMap';
import {
  createCardBattle,
  getCardBattleIncomingPreview,
  getCardBattlePlayableReason,
  getCardBattlePreview,
  stepCardBattle,
} from '../features/card-battle/engine';
import { ENEMY_ARCHETYPES } from '../features/card-battle/enemies';

const create = (jobId = 'vanguard', starterId = 'steady', seed = 17) =>
  createRogueRun({
    runId: `check-${jobId}-${starterId}-${seed}`,
    seed,
    jobId,
    starterId,
  });
const send = (run, action) =>
  stepRogueRun(run, { ...action, runId: run.runId, seq: run.seq + 1 });
const mapChoices = (run) =>
  getRogueMapChoices(run.seed, run.floor, run.map.path.at(-1));
const enterFirst = (run) =>
  send(run, { type: 'choose-node', id: mapChoices(run)[0].id });
function score(battle, id) {
  const card = battle.cards.find((item) => item.id === id),
    p = getCardBattlePreview(battle, id),
    incoming = getCardBattleIncomingPreview(battle);
  if (p.actualDamage >= battle.enemy.hp) return 1e9;
  if ((p.reflectedDamage ?? 0) >= battle.player.hp + p.heal) return -Infinity;
  const future = Math.max(
    0,
    ...battle.hand
      .filter((other) => other !== id)
      .map((other) => getCardBattlePreview(battle, other).actualDamage)
  );
  const missing = Math.max(
    0,
    incoming.incoming - incoming.piercing - battle.player.block
  );
  let value = p.actualDamage + Math.min(missing, p.block) * 1.05 + p.heal * 1.1;
  if (card.expose && !battle.enemy.exposed) value += future * 0.3;
  if (p.clearsGuard) value += future * 0.55 + (battle.enemy.thorns ?? 0) * 2;
  if (p.draw && battle.player.energy > card.cost)
    value += p.draw * Math.max(2, future * 0.35);
  if (p.nextAttackBonus) value += p.nextAttackBonus * 0.75;
  if (p.focusGain) value += p.focusGain * Math.max(2, future);
  if (
    p.counter &&
    battle.player.block + p.block > 0 &&
    incoming.incoming > incoming.piercing
  )
    value += p.counter * 0.95;
  if (p.retainBlock)
    value +=
      Math.min(
        p.retainBlock,
        Math.max(0, battle.player.block + p.block - missing)
      ) * 0.5;
  value -= (p.reflectedDamage ?? 0) * 1.2;
  if (p.blockConsumed) value -= Math.min(missing, p.blockConsumed) * 0.8;
  return value / Math.max(1, card.cost);
}
function battleAction(run) {
  const battle = run.battle;
  if (battle.phase === 'discard')
    return {
      type: 'confirm-discard',
      cardIds: [...battle.hand]
        .sort((a, b) => score(battle, a) - score(battle, b))
        .slice(0, battle.hand.length - 10),
    };
  const choices = battle.hand
    .filter((id) => getCardBattlePlayableReason(battle, id) === null)
    .map((id) => ({ id, value: score(battle, id) }))
    .sort((a, b) => b.value - a.value || a.id.localeCompare(b.id));
  return choices[0]?.value > 0
    ? { type: 'play', cardId: choices[0].id }
    : { type: 'end-turn' };
}
function chooseService(run, preferElite = false) {
  switch (run.phase) {
    case 'route':
      if (run.map) {
        const rank = {
          shop: 5,
          camp: 4,
          event: 3,
          battle: 2,
          elite: preferElite ? 6 : 1,
          boss: 0,
        };
        const node = mapChoices(run).sort(
          (a, b) => rank[b.kind] - rank[a.kind]
        )[0];
        return { type: 'choose-node', id: node.id };
      }
      return {
        type: 'choose-room',
        id: [...run.rooms].sort(
          (a, b) =>
            a.enemy.maxHp +
            a.enemy.attack * 2 -
            (b.enemy.maxHp + b.enemy.attack * 2)
        )[0].id,
      };
    case 'battle':
      return ['battle', 'discard'].includes(run.battle.phase)
        ? { type: 'battle', action: battleAction(run) }
        : { type: 'settle-battle' };
    case 'reward':
      return run.reward.stage === 'card'
        ? { type: 'choose-card', cardId: null }
        : { type: 'choose-relic', relicId: run.reward.relics[0] ?? null };
    case 'camp':
      return run.hp < run.maxHp * 0.8
        ? { type: 'camp', choice: 'heal' }
        : {
            type: 'camp',
            choice: 'upgrade',
            cardId: run.deck
              .filter((c) => c.level < 2)
              .sort(
                (a, b) =>
                  (ROGUE_CARDS[b.cardId].damage ?? 0) +
                  (ROGUE_CARDS[b.cardId].block ?? 0) -
                  ((ROGUE_CARDS[a.cardId].damage ?? 0) +
                    (ROGUE_CARDS[a.cardId].block ?? 0))
              )[0]?.id,
          };
    case 'event':
      return { type: 'event', choice: 'supplies' };
    case 'shop':
      return run.shopRelic && run.gold >= getShopPrices(run).relic
        ? { type: 'shop', choice: 'relic' }
        : run.hp < run.maxHp * 0.7 && run.gold >= getShopPrices(run).heal
          ? { type: 'shop', choice: 'heal' }
          : { type: 'shop', choice: 'leave' };
    default:
      return null;
  }
}
function drive(initial, stop = () => false, preferElite = false) {
  let run = initial;
  for (
    let step = 0;
    step < 6000 && !['defeat', 'complete'].includes(run.phase) && !stop(run);
    step++
  ) {
    let action = chooseService(run, preferElite);
    if (
      action?.type === 'camp' &&
      action.choice === 'upgrade' &&
      !action.cardId
    )
      action = { type: 'camp', choice: 'heal' };
    const next = send(run, action);
    assert.notEqual(next, run, '策略必须推进真实指令');
    run = next;
  }
  return run;
}

test('旧版固定关序仍可校验，新开局生成地图与六套初始牌组', () => {
  const kinds = Array.from({ length: 50 }, (_, i) => getNodeKind(i + 1));
  assert.equal(kinds.filter((k) => k === 'boss').length, 5);
  assert.equal(
    kinds.filter((k) => ['battle', 'elite', 'boss'].includes(k)).length,
    30
  );
  assert.deepEqual(kinds.slice(0, 10), [
    'battle',
    'battle',
    'event',
    'elite',
    'camp',
    'battle',
    'shop',
    'elite',
    'camp',
    'boss',
  ]);
  assert.equal(new Set([1, 2, 3, 4, 5].map((ch) => getBoss(ch).name)).size, 5);
  assert.ok(Object.keys(RELICS).length >= 15);
  assert.ok(Object.keys(ROGUE_CARDS).length >= 24);
  for (const job of Object.values(JOBS))
    for (const starter of job.starters) {
      const run = create(job.id, starter.id);
      assert.equal(run.deck.length, 10);
      assert.equal(run.hp, job.hp);
      assert.equal(run.gold, 60);
      assert.equal(run.rooms.length, 0);
      assert.deepEqual(run.map, { version: 1, startFloor: 1, path: [] });
      assert.ok(mapChoices(run).length > 1);
      assert.equal(run.floor, 1);
      assert.equal(run.seq, 0);
      assertRogueRun(run);
      assert.deepEqual(run, create(job.id, starter.id));
    }
  assert.throws(() => getNodeKind(0));
  assert.throws(() => getNodeKind(51));
  assert.throws(() => getBoss(0));
  assert.throws(() => create('unknown'));
});

test('卡牌所有强化等级都有实际机制变化，章节成长也作用于牌值', () => {
  const run = create('seer');
  const fields = [
    'damage',
    'block',
    'heal',
    'draw',
    'nextAttackBonus',
    'bonusAfterAttack',
    'counter',
    'retainBlock',
    'blockDamageCap',
    'focusGain',
  ];
  for (const id of Object.keys(ROGUE_CARDS)) {
    const cards = [0, 1, 2].map((level) =>
      resolveRogueCard(run, { id: 'check', cardId: id, level })
    );
    const signature = (card) =>
      JSON.stringify(fields.map((key) => card[key] ?? 0));
    assert.notEqual(
      signature(cards[0]),
      signature(cards[1]),
      `${id}第一次强化需生效`
    );
    assert.notEqual(
      signature(cards[1]),
      signature(cards[2]),
      `${id}第二次强化需生效`
    );
  }
  assert.ok(
    resolveRogueCard(
      { ...run, floor: 41 },
      { id: 'grow', cardId: 'strike', level: 0 }
    ).damage >
      resolveRogueCard(run, { id: 'grow', cardId: 'strike', level: 0 }).damage
  );
});

test('入场与每步为纯函数，旧序号/其他局/无效阶段不推进', () => {
  const before = create();
  const copy = structuredClone(before);
  const action = {
    type: 'choose-node',
    id: mapChoices(before)[0].id,
    runId: before.runId,
    seq: 1,
  };
  const next = stepRogueRun(before, action);
  assert.deepEqual(before, copy);
  assert.equal(next.phase, 'battle');
  assert.deepEqual(next.map.path, [action.id]);
  assert.equal(next.rooms[0].nodeId, action.id);
  assert.equal(stepRogueRun(next, action), next);
  assert.equal(stepRogueRun(next, { ...action, seq: 2, runId: 'other' }), next);
  assert.equal(send(next, { type: 'choose-card', cardId: null }), next);
  assert.deepEqual(JSON.parse(JSON.stringify(next)), next);
  assertRogueRun(JSON.parse(JSON.stringify(next)));
});

test('只能从当前节点走连线，不能越层、返回或绕开地图', () => {
  const start = create();
  const secondFloor = getRogueMap(start.seed, 1).filter(
    (node) => node.floor === 2
  );
  assert.throws(() =>
    send(start, { type: 'choose-node', id: secondFloor[0].id })
  );
  assert.equal(send(start, { type: 'choose-room', id: 'legacy' }), start);
  const next = drive(enterFirst(start), (run) => run.phase === 'route');
  assert.equal(next.floor, 2);
  const allowed = mapChoices(next);
  const disconnected = secondFloor.find(
    (node) => !allowed.some((choice) => choice.id === node.id)
  );
  assert.ok(disconnected);
  assert.throws(() => send(next, { type: 'choose-node', id: disconnected.id }));
  assert.throws(() =>
    send(next, { type: 'choose-node', id: next.map.path[0] })
  );
  const entered = send(next, { type: 'choose-node', id: allowed[0].id });
  assert.equal(getRogueCurrentKind(entered), allowed[0].kind);
  assert.equal(entered.map.path.at(-1), allowed[0].id);
});

test('胜利确认才唯一发金币，奖励与跳过后进度可确定性续接', () => {
  const initial = create();
  let run = drive(
    initial,
    (s) => s.phase === 'battle' && s.battle.phase === 'victory'
  );
  assert.equal(run.floor, 1);
  assert.equal(run.gold, 60);
  assert.equal(run.cleared, 0);
  const action = { type: 'settle-battle', runId: run.runId, seq: run.seq + 1 };
  const reward = stepRogueRun(run, action);
  assert.equal(reward.phase, 'reward');
  assert.equal(reward.gold, 60 + reward.reward.gold);
  assert.equal(stepRogueRun(reward, action), reward);
  assert.equal(send(reward, { type: 'settle-battle' }), reward);
  const restored = JSON.parse(JSON.stringify(reward));
  assert.deepEqual(
    send(restored, { type: 'choose-card', cardId: null }),
    send(reward, { type: 'choose-card', cardId: null })
  );
  const picked = send(reward, {
    type: 'choose-card',
    cardId: reward.reward.cards[0],
  });
  assert.equal(picked.deck.length, 11);
  assert.equal(picked.floor, 2);
  assert.equal(picked.cleared, 1);
  assert.throws(() =>
    send(reward, { type: 'choose-card', cardId: 'not-a-card' })
  );
});

test('事件代价、休整强化删牌和商店单次交易都有真实后果', () => {
  const event = drive(create(), (s) => s.phase === 'event');
  const chapter = getChapter(event.floor);
  const supplies = send(event, { type: 'event', choice: 'supplies' });
  assert.equal(supplies.gold, event.gold + 20 + (chapter - 1) * 5);
  assert.equal(supplies.hp, event.hp);
  const risk = send(event, { type: 'event', choice: 'risk' });
  assert.equal(risk.gold, event.gold + 45 + (chapter - 1) * 10);
  assert.equal(risk.hp, event.hp - 8);
  const removed = send(event, {
    type: 'event',
    choice: 'remove',
    cardId: event.deck[0].id,
  });
  assert.equal(removed.gold, event.gold - 15);
  assert.equal(removed.deck.length, event.deck.length - 1);
  const camp = drive(create(), (s) => s.phase === 'camp');
  const upgraded = send(camp, {
    type: 'camp',
    choice: 'upgrade',
    cardId: camp.deck[0].id,
  });
  assert.equal(upgraded.deck[0].level, 1);
  assert.equal(upgraded.floor, camp.floor + 1);
  assert.equal(upgraded.phase, 'route');
  assert.equal(upgraded.history.at(-1).kind, 'camp');
  const rested = send(camp, { type: 'camp', choice: 'heal' });
  assert.equal(
    rested.hp,
    Math.min(camp.maxHp, camp.hp + Math.ceil(camp.maxHp * 0.3))
  );
  const shop = drive(
    create(),
    (s) => s.phase === 'shop' && s.shopRelic && s.gold >= getShopPrices(s).relic
  );
  const price = getShopPrices(shop).relic;
  assert.ok(shop.gold >= price);
  const bought = send(shop, { type: 'shop', choice: 'relic' });
  assert.equal(bought.gold, shop.gold - price);
  assert.ok(bought.relics.includes(shop.shopRelic));
  assert.equal(bought.floor, shop.floor + 1);
  assert.equal(bought.phase, 'route');
  assert.equal(bought.history.at(-1).kind, 'shop');
  assert.equal(send(bought, { type: 'shop', choice: 'relic' }), bought);
});

test('撤离或回合上限导致本局结束，未获胜不能发奖励', () => {
  let run = create();
  run = enterFirst(run);
  run = send(run, { type: 'battle', action: { type: 'retreat' } });
  assert.equal(run.phase, 'battle');
  assert.equal(run.battle.phase, 'retreat');
  const ended = send(run, { type: 'settle-battle' });
  assert.equal(ended.phase, 'defeat');
  assert.equal(ended.gold, 60);
  assert.equal(ended.cleared, 0);
  assert.equal(send(ended, { type: 'choose-room', id: 'x' }), ended);
  assertRogueRun(ended);
});

test('自定义BOSS循环从首轮就冻结，默认循环及输入对象保持不变', () => {
  const run = create(),
    base = enterFirst(run).rooms[0].enemy;
  const pattern = [
    {
      type: 'adjust',
      name: '自定义第一步',
      description: '首轮不攻击',
      damageMultiplier: 0,
    },
    {
      type: 'strong',
      name: '自定义重击',
      description: '第二轮重击',
      damageMultiplier: 1.5,
    },
  ];
  const options = {
    id: 'custom-pattern',
    seed: 11,
    player: { hp: 100, maxHp: 100, attack: 10, defense: 10, speed: 10 },
    enemy: { ...base, archetype: 'duelist', pattern },
    cards: run.deck.map((card) => resolveRogueCard(run, card)),
  };
  const before = structuredClone(options);
  const battle = createCardBattle(options);
  assert.equal(battle.intent.name, '自定义第一步');
  assert.equal(battle.intent.damage, 0);
  assert.deepEqual(battle.enemy.pattern, pattern);
  const next = stepCardBattle(battle, {
    id: battle.id,
    seq: 1,
    type: 'end-turn',
  });
  assert.equal(next.intent.name, '自定义重击');
  assert.deepEqual(options, before);
  const normal = createCardBattle({
    ...options,
    enemy: { ...base, archetype: 'duelist', pattern: undefined },
  });
  assert.deepEqual(normal.enemy.pattern, ENEMY_ARCHETYPES.duelist.pattern);
  assert.equal(normal.intent.name, ENEMY_ARCHETYPES.duelist.pattern[0].name);
  assert.throws(() =>
    createCardBattle({
      ...options,
      enemy: { ...base, archetype: undefined, pattern },
    })
  );
  assert.throws(() =>
    createCardBattle({
      ...options,
      enemy: {
        ...base,
        pattern: [{ ...pattern[0], damageMultiplier: 4 }, pattern[1]],
      },
    })
  );
});

test('篡改关数、奖励、牌区、职业或冻结敌人均明确拒绝', () => {
  const run = enterFirst(create());
  for (const change of [
    (s) => s.floor++,
    (s) => s.history.push({ floor: 1, kind: 'battle', label: 'x' }),
    (s) => (s.deck[0].id = s.deck[1].id),
    (s) => s.relics.push(s.relics[0]),
    (s) => s.battle.cards.reverse(),
    (s) => s.battle.enemy.attack++,
    (s) => (s.jobId = 'unknown'),
    (s) => s.hp++,
    (s) => (s.rooms[0].enemy.pattern = [{}]),
    (s) => (s.map.path = []),
    (s) => (s.seq = 0),
    (s) => (s.map.path[0] = mapChoices(create())[1].id),
  ]) {
    const bad = structuredClone(run);
    change(bad);
    assert.throws(() => assertRogueRun(bad));
  }
});

test('三职业六套开局可通过真实指令走完50混合节点和五BOSS', () => {
  const rows = [];
  for (const job of Object.values(JOBS))
    for (const starter of job.starters) {
      const run = drive(create(job.id, starter.id, 17));
      rows.push({
        job: job.id,
        starter: starter.id,
        phase: run.phase,
        floor: run.floor,
        hp: run.hp,
        relics: run.relics.length,
      });
      assert.equal(run.phase, 'complete', JSON.stringify(rows));
      assert.equal(run.cleared, 50);
      assert.equal(run.history.length, 50);
      assert.equal(run.map.path.length, 50);
      assert.deepEqual(
        run.history.map((entry) => entry.kind),
        run.map.path.map(
          (id, index) => getRogueMapNode(run.seed, index + 1, id).kind
        )
      );
      assert.equal(
        run.history.filter((item) => item.kind === 'boss').length,
        5
      );
      assert.ok(run.maxHp === job.hp + 40);
      assert.ok(run.relics.length <= 12);
      assertRogueRun(JSON.parse(JSON.stringify(run)));
    }
});

test('满12件法器时应给法器的精英与BOSS折算30试炼学分，普通战斗不补偿且不重发', () => {
  for (const kind of ['elite', 'battle', 'boss']) {
    const won = drive(
      create(),
      (run) =>
        run.floor >= 41 &&
        run.phase === 'battle' &&
        run.battle.phase === 'victory' &&
        getRogueCurrentKind(run) === kind,
      true
    );
    assert.equal(won.phase, 'battle');
    assert.equal(getRogueCurrentKind(won), kind);
    const full = structuredClone(won);
    // Use real combat and isolate the inventory capacity boundary at settlement.
    for (const id of Object.keys(RELICS)) {
      if (full.relics.length >= 12) break;
      if (full.relics.includes(id)) continue;
      full.relics.push(id);
      full.battle.equipment.push({
        ...RELICS[id],
        sourceId: `rogue-relic:${id}`,
      });
    }
    assert.equal(full.relics.length, 12);
    const control = structuredClone(full);
    control.relics.pop();
    control.battle.equipment.pop();
    assertRogueRun(control);
    const fullReward = send(full, { type: 'settle-battle' }),
      controlReward = send(control, { type: 'settle-battle' });
    const entitled = kind !== 'battle';
    assert.equal(
      fullReward.reward.gold - controlReward.reward.gold,
      entitled ? 30 : 0
    );
    assert.equal(fullReward.gold - full.gold, fullReward.reward.gold);
    assert.equal(fullReward.reward.relics.length, 0);
    if (entitled) {
      assert.match(fullReward.lastMessage, /法器位已满，折算30试炼学分/);
      assert.equal(controlReward.reward.relics.length, 3);
    } else assert.doesNotMatch(fullReward.lastMessage, /折算30试炼学分/);
    assert.equal(send(fullReward, { type: 'settle-battle' }), fullReward);
    const advanced = send(fullReward, { type: 'choose-card', cardId: null });
    assert.equal(advanced.gold, fullReward.gold);
    assert.equal(advanced.phase, full.floor === 50 ? 'complete' : 'route');
    assertRogueRun(advanced);
  }
});
