import test from 'node:test';
import assert from 'node:assert/strict';
import { REALM_ORDER } from '../constants';
import { generateRogueDungeonOffers } from '../features/card-dungeon/offers';

test('三选一在每个学阶均给出可入场的低中高选择，不会全锁或重复ID', () => {
  for (const realm of REALM_ORDER) {
    for (const roll of [0, 0.35, 0.999999]) {
      const offers = generateRogueDungeonOffers(realm, () => roll);
      assert.equal(offers.length, 3);
      assert.deepEqual(
        offers.map((offer) => offer.riskLevel),
        ['低', '中', '高']
      );
      assert.equal(new Set(offers.map((offer) => offer.id)).size, 3);
      assert.ok(offers.every((offer) => offer.minRealm === realm));
    }
  }
});

test('报名费用沿用学阶基价、风险倍率与上下10%浮动，高风险确实更贵', () => {
  const multipliers = [0.8, 1, 1.5];
  for (const [realmIndex, realm] of REALM_ORDER.entries()) {
    for (const roll of [0, 0.5, 0.999999]) {
      const offers = generateRogueDungeonOffers(realm, () => roll);
      offers.forEach((offer, index) => {
        assert.equal(
          offer.cost,
          Math.floor(
            (50 + realmIndex * 50) * multipliers[index] * (0.9 + roll * 0.2)
          )
        );
      });
      assert.ok(offers[0].cost < offers[1].cost);
      assert.ok(offers[1].cost < offers[2].cost);
    }
  }
});

test('刷新可以换主题，名称绑定风险描述和实际掉落，外部修改不污染池', () => {
  const known = new Map();
  const seen = new Set();
  for (const roll of [0, 0.4, 0.8, 0.2, 0.6, 0.99]) {
    for (const offer of generateRogueDungeonOffers(
      REALM_ORDER[0],
      () => roll
    )) {
      const details = {
        risk: offer.riskLevel,
        description: offer.description,
        drops: offer.drops,
      };
      assert.ok(offer.description.length > 10);
      assert.ok(offer.drops.length >= 2);
      assert.equal(new Set(offer.drops).size, offer.drops.length);
      if (known.has(offer.name))
        assert.deepEqual(details, known.get(offer.name));
      else known.set(offer.name, structuredClone(details));
      seen.add(offer.name);
      offer.drops.push('外部改动');
    }
  }
  assert.equal(seen.size, 9);
  const first = generateRogueDungeonOffers(REALM_ORDER[0], () => 0);
  const next = generateRogueDungeonOffers(REALM_ORDER[0], () => 0);
  assert.notEqual(first[0].id, next[0].id);
});
