import test from 'node:test';
import assert from 'node:assert/strict';
import { RealmType } from '../types';
import { createInitialPlayer } from '../utils/playerUtils';
import { applyDemotion } from '../utils/demotion';
import { getBattleChance } from '../services/battleService';
import { applyAdventureOutcome } from '../features/interactive/adventureBattle';
import {
  assertInteractiveProgress,
  emptyInteractiveProgress,
  normalizeInteractiveProgress,
  reduceInteractiveAction,
} from '../features/interactive/state';
import CardBattleView from '../features/card-battle/ui/CardBattleView';
import { mountApp } from './helpers/appHarness.mjs';

const clone = (value) => JSON.parse(JSON.stringify(value));
const offer = {
  id: 'integrity-offer',
  name: '校园实验室',
  description: '校园挑战',
  minRealm: RealmType.QiRefining,
  cost: 10,
  riskLevel: '中',
  drops: ['咖啡豆'],
};
const snapshot = (overrides = {}) => ({
  player: {
    ...createInitialPlayer('核验同学#ABCD', 'talent-ordinary'),
    spiritStones: 1000,
    maxExp: 1e9,
    ...overrides,
  },
  logs: [],
  interactive: emptyInteractiveProgress(),
});
function triggers(player, seed) {
  let word = (seed ^ 0x9e3779b9) >>> 0 || 0x6d2b79f5;
  word ^= word << 13;
  word ^= word >>> 17;
  word ^= word << 5;
  return (word >>> 0) / 0x100000000 < getBattleChance(player, 'secret_realm');
}
function begin(subject = snapshot(), { seed, realm = offer } = {}) {
  if (seed === undefined) {
    for (seed = 0; seed < 100000 && !triggers(subject.player, seed); seed++);
    assert.ok(seed < 100000, '需要可复现的战斗分支种子');
  }
  const next = reduceInteractiveAction(
    subject,
    {
      type: 'begin-dungeon',
      id: `integrity-${seed}`,
      seed,
      realm,
      batchRevision: 'integrity-batch',
      loadoutRevision: subject.interactive.cardLoadout.revision,
    },
    1000
  );
  assert.equal(next.interactive.pending.phase, 'battle');
  assertInteractiveProgress(next.interactive);
  return next;
}
function send(
  subject,
  action,
  seq = subject.interactive.pending.cardRun.commandSeq + 1
) {
  return reduceInteractiveAction(
    subject,
    { type: 'card', id: subject.interactive.pending.id, seq, action },
    2000
  );
}

test('冻结副本计划、费用、敌人、规则及简历错拼时拒绝读档，保留输入字节', () => {
  const valid = begin().interactive;
  const corruptions = [
    [
      '规则版本',
      (state) => {
        state.pending.cardRun.rulesetVersion = 'future-card-rules';
      },
    ],
    [
      '宿主规则',
      (state) => {
        state.pending.engine = 'round-v1';
      },
    ],
    [
      '计划种子',
      (state) => {
        state.pending.adventurePlan.seed ^= 17;
      },
    ],
    [
      '场景种子',
      (state) => {
        state.pending.cardRun.seed ^= 17;
      },
    ],
    [
      '计划敌人',
      (state) => {
        state.pending.adventurePlan.enemy.attack++;
      },
    ],
    [
      '入场精力',
      (state) => {
        state.pending.dungeon.entryHp++;
      },
    ],
    [
      '学阶参照',
      (state) => {
        state.pending.dungeon.referenceLevel = 0;
      },
    ],
    [
      '副本名称',
      (state) => {
        state.pending.dungeon.offer.name += '错误';
      },
    ],
    [
      '副本风险',
      (state) => {
        state.pending.dungeon.offer.riskLevel = '低';
      },
    ],
    [
      '副本学阶',
      (state) => {
        state.pending.dungeon.offer.minRealm = RealmType.Foundation;
      },
    ],
    [
      '副本描述',
      (state) => {
        state.pending.dungeon.offer.description += '错误';
      },
    ],
    [
      '副本掉落',
      (state) => {
        state.pending.dungeon.offer.drops.push('不一致掉落');
      },
    ],
    [
      '副本费用',
      (state) => {
        state.pending.dungeon.offer.cost++;
      },
    ],
    [
      '已付费用',
      (state) => {
        state.pending.entryPaid++;
      },
    ],
    [
      '简历版本',
      (state) => {
        state.cardLoadout.revision++;
      },
    ],
    [
      '入场简历版本',
      (state) => {
        state.pending.dungeon.loadoutRevision++;
      },
    ],
    [
      '简历顺序',
      (state) => {
        state.cardLoadout.resume.reverse();
      },
    ],
    [
      '简历数量',
      (state) => {
        state.cardLoadout.resume.push('base:extra');
        state.cardLoadout.library.push('base:extra');
      },
    ],
    [
      '重复牌区',
      (state) => {
        state.pending.cardRun.hand.push(state.pending.cardRun.drawPile[0]);
      },
    ],
    [
      '已结算水位',
      (state) => {
        state.lastSettledSeq = state.pending.seq;
      },
    ],
  ];
  for (const [label, corrupt] of corruptions) {
    const broken = clone(valid);
    corrupt(broken);
    const bytes = JSON.stringify(broken);
    assert.throws(() => normalizeInteractiveProgress(broken), undefined, label);
    assert.equal(
      JSON.stringify(broken),
      bytes,
      `${label}：不能自动修补或删除原现场`
    );
  }
  assert.deepEqual(normalizeInteractiveProgress(clone(valid)), valid);
});

test('零种子从副本主流程保存续接，乱序与重放不推进卡牌或战果', () => {
  const initial = snapshot({ speed: 1000, luck: 0, hp: 75, maxHp: 150 });
  const started = begin(initial, { seed: 0 });
  assert.equal(started.interactive.pending.seed, 0);
  assert.equal(started.interactive.pending.adventurePlan.seed, 0);
  assert.equal(started.interactive.pending.cardRun.seed, 0);
  const restored = clone(started);
  assertInteractiveProgress(restored.interactive);
  const id = restored.interactive.pending.cardRun.hand[0];
  const command = { type: 'play', cardId: id };
  const advanced = send(restored, command);
  assert.deepEqual(advanced, send(started, command));
  assert.equal(send(advanced, command, 1), advanced);
  assert.equal(send(advanced, { type: 'end-turn' }, 3), advanced);
  assert.equal(advanced.player.spiritStones, 990);
  const settled = send(clone(advanced), { type: 'retreat' });
  assertInteractiveProgress(settled.interactive);
  assert.equal(settled.interactive.lastSettledSeq, 1);
  assert.equal(
    settled.logs.filter((log) => log.id.endsWith(':settled')).length,
    1
  );
  const resumedResult = clone(settled);
  assert.equal(send(resumedResult, { type: 'retreat' }), resumedResult);
  const confirmed = reduceInteractiveAction(
    resumedResult,
    { type: 'acknowledge', id: settled.interactive.pending.id },
    3000
  );
  assert.equal(confirmed.interactive.pending, undefined);
  assert.deepEqual(confirmed.player, settled.player);
  assert.equal(
    reduceInteractiveAction(
      confirmed,
      { type: 'acknowledge', id: settled.interactive.pending.id },
      4000
    ),
    confirmed
  );
});

function lethalBattle() {
  const subject = snapshot({
    realm: RealmType.Foundation,
    realmLevel: 3,
    hp: 30,
    maxHp: 100,
    attack: 1,
    defense: 0,
    speed: 0,
    luck: 0,
    exp: 123,
  });
  const realm = {
    ...offer,
    minRealm: RealmType.Foundation,
    riskLevel: '极度危险',
  };
  for (let seed = 0; seed < 10000; seed++) {
    if (!triggers(subject.player, seed)) continue;
    const started = begin(subject, { seed, realm });
    const run = started.interactive.pending.cardRun;
    if (run.intent.damage < run.player.hp) continue;
    const raw = applyAdventureOutcome(
      started.player,
      started.interactive.pending.adventurePlan,
      { battleId: run.id, outcome: 'defeat', hpAfterRaw: 0 }
    );
    if (raw.player.hp > 0) continue;
    return { started, expected: applyDemotion(raw.player).player };
  }
  throw new Error('未找到自然力竭场景');
}

test('真实来袭力竭后旧失败经济与延毕同次结算，续档与确认不会二次降级', () => {
  const { started, expected } = lethalBattle();
  const stateBefore = clone(started);
  const settled = send(started, { type: 'end-turn' });
  assert.deepEqual(started, stateBefore, '力竭结算仍是纯状态转移');
  assert.equal(settled.interactive.pending.cardRun.phase, 'defeat');
  assert.equal(settled.interactive.pending.cardRun.player.hp, 0);
  assert.deepEqual(settled.player, expected);
  assert.equal(settled.player.realmLevel, 2);
  assert.equal(settled.player.hp, settled.player.maxHp);
  assert.equal(settled.player.exp, 0);
  assert.equal(settled.interactive.lastSettledSeq, 1);
  assertInteractiveProgress(clone(settled.interactive));
  const restored = clone(settled);
  assert.equal(send(restored, { type: 'end-turn' }, 1), restored);
  const confirmed = reduceInteractiveAction(
    restored,
    { type: 'acknowledge', id: restored.interactive.pending.id },
    3000
  );
  assert.deepEqual(confirmed.player, expected);
  assert.equal(
    confirmed.logs.filter((log) => log.id.endsWith(':settled')).length,
    1
  );
});

test('真实App力竭落盘失败保留旧现场，重试及刷新只延毕一次', async (t) => {
  const { started, expected } = lethalBattle();
  const { achievements: ignoredAchievements, ...overrides } = started.player;
  const app = await mountApp(t, overrides, {
    interactive: started.interactive,
  });
  const view = () => app.find(CardBattleView).props;
  const staleHandler = view().onCommand;
  const raw = app.rawSaved();
  app.fail(true);
  staleHandler({ type: 'end-turn' });
  app.flush();
  assert.equal(app.rawSaved(), raw);
  assert.equal(view().state.phase, 'battle');
  assert.equal(app.game().player.realmLevel, 3);
  app.fail(false);
  staleHandler({ type: 'end-turn' });
  app.flush();
  assert.equal(view().state.phase, 'defeat');
  assert.equal(app.game().player.realmLevel, expected.realmLevel);
  const playerAfter = clone(app.game().player);
  staleHandler({ type: 'end-turn' });
  app.flush();
  assert.deepEqual(clone(app.game().player), playerAfter);
  await app.reload();
  assert.equal(view().state.phase, 'defeat');
  assert.deepEqual(clone(app.game().player), playerAfter);
  view().onAcknowledge();
  app.flush();
  assert.equal(app.find(CardBattleView), undefined);
  assert.equal(app.game().player.realmLevel, 2);
  assert.equal(
    app.saved().logs.filter((log) => log.id.endsWith(':settled')).length,
    1
  );
  assert.equal(app.network.length, 0);
});

test('旧的后续副本意图在确认同次保存内消费；旧确认重放不会再次开副本', () => {
  let settled = send(begin(), { type: 'retreat' });
  settled.interactive.pending.result.continuation = { type: 'secret-realm' };
  assertInteractiveProgress(settled.interactive);
  const id = settled.interactive.pending.id;
  const next = reduceInteractiveAction(
    clone(settled),
    { type: 'acknowledge', id },
    3000
  );
  assert.equal(next.interactive.pending.id, `${id}:followup`);
  assert.equal(next.interactive.pending.seq, 2);
  assert.equal(next.interactive.nextSeq, 3);
  assert.ok(
    !next.interactive.pending.dungeon,
    '匿名后续不使用命名副本掉落加成'
  );
  assertInteractiveProgress(next.interactive);
  const resumed = clone(next);
  assert.equal(
    reduceInteractiveAction(resumed, { type: 'acknowledge', id }, 4000),
    resumed
  );
  assert.equal(resumed.interactive.nextSeq, 3);
});
