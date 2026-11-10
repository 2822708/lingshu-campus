import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateHandLayout,
  HAND_CARD_HOVER_SCALE,
} from '../features/card-battle/ui/handGeometry';

const desktop = {
  width: 1220,
  height: 276,
  left: 30,
  top: 300,
  viewportWidth: 1280,
  viewportHeight: 720,
};
const phone = {
  width: 294,
  height: 240,
  left: 13,
  top: 293,
  viewportWidth: 320,
  viewportHeight: 568,
};

function assertHoverFits(layout, bounds) {
  for (const card of layout.cards) {
    const width = card.width * HAND_CARD_HOVER_SCALE;
    const height = card.expandedHeight * HAND_CARD_HOVER_SCALE;
    const left = bounds.left + card.x - (width - card.width) / 2 + card.hoverX;
    const top = bounds.top + card.y + card.hoverY;
    assert.ok(left >= 11.98);
    assert.ok(left + width <= bounds.viewportWidth - 11.98);
    assert.ok(top >= 11.98);
    assert.ok(top + height <= bounds.top + bounds.height - 3.98);
    assert.ok(top + height <= bounds.viewportHeight - 11.98);
  }
}

test('正式竖牌高宽4:3，4/14/18张都保持192x256单行且不因牌数缩小', () => {
  for (const count of [4, 14, 18]) {
    const layout = calculateHandLayout(count, desktop, 'portrait-4-3');
    assert.equal(layout.cardWidth, 192);
    assert.equal(layout.cardHeight, 256);
    assert.equal(layout.expandedHeight, 256);
    assert.equal(layout.rows, 1);
    assert.equal(new Set(layout.cards.map((card) => card.y)).size, 1);
    assert.equal(layout.mode, count === 4 ? 'spread' : 'overlap');
    assert.ok(layout.cards.every((card) => card.height / card.width === 4 / 3));
    assertHoverFits(layout, desktop);
  }
});

test('窄屏竖牌168x224，左右边牌悬停保持高宽4:3且避开窗口和操作区', () => {
  for (const count of [1, 4, 10, 14, 18]) {
    const layout = calculateHandLayout(count, phone, 'portrait-4-3');
    assert.equal(layout.cardWidth, 168);
    assert.equal(layout.cardHeight, 224);
    assert.equal(layout.expandedHeight, 224);
    assert.equal(layout.rows, 1);
    assert.ok(layout.cards.every((card) => card.height / card.width === 4 / 3));
    assertHoverFits(layout, phone);
  }
});

test('短牌区同比缩放而不压扁，4/14/18张展开后仍不覆盖底部操作区', () => {
  const bounds = { ...phone, height: 200, top: 200, viewportHeight: 440 };
  for (const count of [4, 14, 18]) {
    const layout = calculateHandLayout(count, bounds, 'portrait-4-3');
    assert.ok(layout.cardWidth < 168);
    assert.ok(Math.abs(layout.cardHeight / layout.cardWidth - 4 / 3) < 0.0002);
    assert.equal(layout.expandedHeight, layout.cardHeight);
    assert.equal(layout.rows, 1);
    assertHoverFits(layout, bounds);
  }
});

test('未指定新竖牌形状时保留独立试作旧尺寸和纵向展开规则', () => {
  const bounds = { ...desktop, height: 340 };
  const normal = calculateHandLayout(14, bounds);
  assert.equal(normal.cardWidth, 192);
  assert.equal(normal.cardHeight, 190);
  assert.equal(normal.expandedHeight, 232);
  assert.deepEqual(normal, calculateHandLayout(14, bounds, 'portrait'));
});
