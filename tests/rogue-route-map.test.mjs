import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
  getRogueMap,
  getRogueMapChoices,
  getRogueMapNode,
} from '../features/rogue-mode/routeMap';

test('试炼地图按种子固定，各章覆盖连续十关', () => {
  const first = getRogueMap(42, 1);
  assert.deepEqual(getRogueMap(42, 1), first);
  assert.notDeepEqual(getRogueMap(43, 1), first);
  for (let chapter = 1; chapter <= 5; chapter++) {
    const map = getRogueMap(42, chapter);
    const startFloor = (chapter - 1) * 10 + 1;
    assert.deepEqual(
      [...new Set(map.map((node) => node.floor))],
      Array.from({ length: 10 }, (_, index) => startFloor + index)
    );
    assert.equal(new Set(map.map((node) => node.id)).size, map.length);
  }
});

test('分岔和汇合都可通向章末考核，各层提供战斗和补给取舍', () => {
  for (const seed of [0, 7, 82, 0xffffffff]) {
    for (let chapter = 1; chapter <= 5; chapter++) {
      const map = getRogueMap(seed, chapter);
      const firstFloor = (chapter - 1) * 10 + 1;
      const rows = Array.from({ length: 10 }, (_, index) =>
        map.filter((node) => node.floor === firstFloor + index)
      );
      const [boss] = rows[9];
      assert.equal(rows[9].length, 1);
      assert.equal(boss.kind, 'boss');
      assert.deepEqual(boss.next, []);
      for (const floor of [1, 6])
        assert.ok(rows[floor - 1].every((node) => node.kind === 'battle'));
      for (const floor of [4, 8])
        assert.deepEqual(
          new Set(rows[floor - 1].map((node) => node.kind)),
          new Set(['battle', 'elite'])
        );
      assert.ok(rows[8].every((node) => node.kind === 'camp'));
      assert.ok(map.some((node) => node.next.length > 1));
      assert.ok(
        map.some(
          (node) =>
            node.kind !== 'boss' &&
            map.filter((lower) => lower.next.includes(node.id)).length > 1
        )
      );
      assert.ok(
        map.some((node) => {
          const kinds = node.next.map(
            (target) => map.find((next) => next.id === target).kind
          );
          return new Set(kinds).size > 1;
        })
      );

      let reachable = new Set(rows[0].map((node) => node.id));
      for (let layer = 0; layer < 9; layer++) {
        const upper = new Set(rows[layer + 1].map((node) => node.id));
        const next = new Set();
        for (const node of rows[layer]) {
          assert.ok(reachable.has(node.id));
          assert.ok(node.next.length > 0);
          for (const target of node.next) {
            assert.ok(upper.has(target), '连线必须指向紧邻的下一关');
            next.add(target);
          }
        }
        assert.deepEqual(next, upper);
        reachable = next;
      }
      assert.deepEqual([...reachable], [boss.id]);
    }
  }
});

test('仅允许选择当前位置的直接连线，换章可重新选择起点', () => {
  const seed = 42;
  const map = getRogueMap(seed, 2);
  const starts = map.filter((node) => node.floor === 11);
  assert.deepEqual(getRogueMapChoices(seed, 11, 'floor-10-boss'), starts);
  const previous = starts.find(
    (node) => node.next.length < map.filter((room) => room.floor === 12).length
  );
  assert.ok(previous);
  const choices = getRogueMapChoices(seed, 12, previous.id);
  assert.deepEqual(
    new Set(choices.map((node) => node.id)),
    new Set(previous.next)
  );
  assert.deepEqual(getRogueMapChoices(seed, 12, 'floor-10-boss'), []);
  assert.deepEqual(getRogueMapChoices(seed, 13, previous.id), []);
  assert.equal(getRogueMapNode(seed, 11, choices[0].id), undefined);
  assert.deepEqual(getRogueMapNode(seed, 12, choices[0].id), choices[0]);
});
