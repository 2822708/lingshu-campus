import test from 'node:test';
import assert from 'node:assert/strict';
import { EquipmentSlot, ItemType, RealmType } from '../types';
import { createInitialPlayer } from '../utils/playerUtils';
import { getBattleChance } from '../services/battleService';
import { createGameSave, parseImportSave } from '../features/save/saveCodec';
import {
  emptyInteractiveProgress,
  assertInteractiveProgress,
  reduceInteractiveAction,
} from '../features/interactive/state';
import { createDefaultCardLoadout } from '../features/card-dungeon/loadout';
import CardBattleView from '../features/card-battle/ui/CardBattleView';
import ModalsContainer from '../views/modals/ModalsContainer';
import { mountApp } from './helpers/appHarness.mjs';

const realm = {
  id: 'rogue-offer',
  name: '开放机房',
  description: '现场演算与实验复盘。',
  minRealm: RealmType.QiRefining,
  cost: 40,
  riskLevel: '低',
  drops: ['咖啡豆'],
};
const gear = {
  id: 'owned-keyboard',
  name: '青轴机械键盘',
  type: ItemType.Weapon,
  equipmentSlot: EquipmentSlot.Weapon,
  isEquippable: true,
  quantity: 1,
  description: '自己的装备',
  rarity: '普通',
};
const player = () => ({
  ...createInitialPlayer('遭遇测试#ABCD', 'talent-ordinary'),
  spiritStones: 1000,
  hp: 100,
  maxHp: 140,
  maxExp: 1e12,
  cultivationArts: ['art-basic-breath'],
  inventory: [{ ...gear }],
  equippedItems: { [EquipmentSlot.Weapon]: gear.id },
});
function snapshot() {
  const interactive = emptyInteractiveProgress();
  // A previously selected item disappeared; automatic entry must not erase the manual draft.
  interactive.cardLoadout = createDefaultCardLoadout(4);
  interactive.cardLoadout.library.push('equipment:old-missing');
  interactive.cardLoadout.resume.push('equipment:old-missing');
  return { player: player(), logs: [], interactive };
}
function begin(subject, seed = 7) {
  return reduceInteractiveAction(
    subject,
    {
      type: 'begin-dungeon',
      id: `rogue-${seed}`,
      seed,
      realm,
      batchRevision: 'three-choices',
      loadoutRevision: subject.interactive.cardLoadout.revision,
      entryMode: 'rogue',
    },
    1000
  );
}
function legacyNonBattleSeed(subject) {
  for (let seed = 0; seed < 10000; seed++) {
    let word = (seed ^ 0x9e3779b9) >>> 0 || 0x6d2b79f5;
    word ^= word << 13;
    word ^= word >>> 17;
    word ^= word << 5;
    if ((word >>> 0) / 0x100000000 >= getBattleChance(subject, 'secret_realm'))
      return seed;
  }
  throw new Error('Missing exploration seed');
}

test('三选一新入口固定开战，当前来源自动入组且旧手配原样保留', () => {
  const before = snapshot();
  const original = structuredClone(before);
  const next = begin(before, legacyNonBattleSeed(before.player));
  const pending = next.interactive.pending;
  assert.equal(pending.phase, 'battle');
  assert.equal(pending.engine, 'card-dungeon-v1');
  assert.deepEqual(
    next.interactive.cardLoadout,
    before.interactive.cardLoadout
  );
  assert.equal(next.player.spiritStones, 960);
  assert.equal(pending.cardRun.player.entryHp, 100);
  assert.ok(
    pending.dungeon.entryLoadout.resume.includes('course:art-basic-breath')
  );
  assert.ok(
    pending.dungeon.entryLoadout.resume.includes(`equipment:${gear.id}`)
  );
  assert.ok(
    !pending.dungeon.entryLoadout.library.includes('equipment:old-missing')
  );
  const hand = pending.cardRun.hand.map((id) =>
    pending.cardRun.cards.find((c) => c.id === id)
  );
  assert.ok(hand.some((card) => card.source === 'course'));
  assert.ok(hand.some((card) => card.source === 'equipment'));
  assert.equal(hand.length, 4);
  assert.deepEqual(before, original);
  assertInteractiveProgress(next.interactive);
  assert.equal(begin(next), next, '未结束的现场拒绝第二次入场和扣费');
});

test('自动简历、原手配和冻结牌面能一并导出导入并确定性继续', () => {
  const next = begin(snapshot());
  const saved = parseImportSave(
    JSON.stringify(
      createGameSave(next.player, next.logs, 1000, next.interactive)
    )
  );
  assert.deepEqual(saved.interactive, next.interactive);
  const run = next.interactive.pending.cardRun;
  const command = {
    type: 'card',
    id: run.id,
    seq: 1,
    action: { type: 'play', cardId: run.hand[0] },
  };
  assert.deepEqual(
    reduceInteractiveAction(
      {
        player: saved.player,
        logs: saved.logs,
        interactive: saved.interactive,
      },
      command,
      2000
    ),
    reduceInteractiveAction(next, command, 2000)
  );
});

test('自动简历顺序、修订和现场不一致时明确拒绝读档', () => {
  const next = begin(snapshot());
  for (const mutate of [
    (p) => p.dungeon.entryLoadout.resume.reverse(),
    (p) => p.dungeon.entryLoadout.revision++,
    (p) => {
      delete p.cardRun;
    },
    (p) => {
      p.dungeon.entryLoadout = null;
    },
  ]) {
    const tampered = structuredClone(next.interactive);
    mutate(tampered.pending);
    assert.throws(() => assertInteractiveProgress(tampered));
  }
});

test('课程与装备变化只影响下一次入场，不改写已保存现场', () => {
  const entered = begin(snapshot());
  const originalRun = structuredClone(entered.interactive.pending.cardRun);
  const run = entered.interactive.pending.cardRun;
  const settled = reduceInteractiveAction(
    entered,
    {
      type: 'card',
      id: run.id,
      seq: 1,
      action: { type: 'retreat' },
    },
    2000
  );
  const acknowledged = reduceInteractiveAction(
    settled,
    { type: 'acknowledge', id: run.id },
    3000
  );
  const changed = {
    ...acknowledged,
    player: {
      ...acknowledged.player,
      cultivationArts: ['art-spirit-cloud'],
      equippedItems: {},
    },
  };
  const second = begin(changed, 99);
  const cards = second.interactive.pending.cardRun.cards;
  assert.ok(cards.some((card) => card.id === 'course:art-spirit-cloud'));
  assert.ok(!cards.some((card) => card.id === 'course:art-basic-breath'));
  assert.ok(!cards.some((card) => card.source === 'equipment'));
  assert.deepEqual(entered.interactive.pending.cardRun, originalRun);
  assert.equal(second.player.spiritStones, 920);
  assertInteractiveProgress(second.interactive);
});

test('新入口仍在扣费前拒绝精力、学分及过期修订，旧入口不自动替换手配', () => {
  for (const change of [
    (subject) => {
      subject.player.hp = 41;
    },
    (subject) => {
      subject.player.spiritStones = 39;
    },
  ]) {
    const subject = snapshot();
    change(subject);
    const copy = structuredClone(subject);
    assert.throws(() => begin(subject));
    assert.deepEqual(subject, copy);
  }
  const subject = snapshot();
  assert.throws(
    () =>
      reduceInteractiveAction(subject, {
        type: 'begin-dungeon',
        id: 'stale',
        seed: 7,
        realm,
        batchRevision: 'three-choices',
        loadoutRevision: 3,
        entryMode: 'rogue',
      }),
    /简历已变化/
  );
  assert.throws(
    () =>
      reduceInteractiveAction(subject, {
        type: 'begin-dungeon',
        id: 'manual',
        seed: 7,
        realm,
        batchRevision: 'old',
        loadoutRevision: 4,
      }),
    /来源已失效/
  );
});

test('真实App新入口先落盘，保存失败不换牌不扣费，成功后刷新恢复同一现场', async (t) => {
  const subject = snapshot();
  const app = await mountApp(t, subject.player, {
    interactive: subject.interactive,
  });
  const hall = () => app.find(ModalsContainer).props;
  const battle = () => app.find(CardBattleView)?.props;
  hall().onRealmOffersChange({ revision: 'three-choices', offers: [realm] });
  const seed = legacyNonBattleSeed(app.game().player);
  app.random([0.123, seed / 0x100000000]);
  app.fail(true);
  const before = app.rawSaved();
  assert.equal(hall().onEnterCardDungeon(realm.id, 'three-choices', 4), false);
  app.flush();
  assert.equal(app.rawSaved(), before);
  assert.equal(app.game().player.spiritStones, 1000);
  assert.equal(battle(), undefined);
  app.fail(false);
  app.random([0.123, seed / 0x100000000]);
  assert.equal(hall().onEnterCardDungeon(realm.id, 'three-choices', 4), true);
  app.flush();
  assert.ok(battle());
  const frozen = structuredClone(battle().state);
  assert.equal(app.game().player.spiritStones, 960);
  assert.deepEqual(
    app.saved().interactive.cardLoadout,
    subject.interactive.cardLoadout
  );
  assert.ok(app.saved().interactive.pending.dungeon.entryLoadout);
  assert.equal(hall().onEnterCardDungeon(realm.id, 'three-choices', 4), false);
  await app.reload();
  assert.deepEqual(battle().state, frozen);
  assert.equal(app.network.length, 0);
});
