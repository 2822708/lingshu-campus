import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import InventoryModal from '../components/InventoryModal';
import EquipmentPanel from '../components/EquipmentPanel';
import { DungeonPreparation } from '../features/card-dungeon/ui/DungeonPreparation';
import { createDefaultCardLoadout } from '../features/card-dungeon/loadout';
import { getDungeonCardSources } from '../features/card-dungeon/sources';
import { getEquipmentBattleDefinition } from '../features/card-dungeon/equipment';
import { createInitialPlayer } from '../utils/playerUtils';
import { EquipmentSlot, ItemType } from '../types';

function text(node) {
  if (node == null || typeof node === 'boolean') return '';
  if (Array.isArray(node)) return node.map(text).join('');
  return typeof node === 'object' ? text(node.props?.children) : String(node);
}
function walk(node) {
  if (!node || typeof node !== 'object') return [];
  if (Array.isArray(node)) return node.flatMap(walk);
  return [node, ...walk(node.props?.children)];
}
/** Real handlers and rendered content; browser layout/focus is checked separately. */
function mountPreparation(props) {
  const internals =
    React.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
  const slots = [];
  let cursor = 0;
  let tree;
  const dispatcher = {
    useState(initial) {
      const i = cursor++;
      slots[i] ??= {
        value: typeof initial === 'function' ? initial() : initial,
      };
      return [
        slots[i].value,
        (update) => {
          slots[i].value =
            typeof update === 'function' ? update(slots[i].value) : update;
        },
      ];
    },
    useMemo(create, deps) {
      const i = cursor++;
      if (
        !slots[i] ||
        deps.some((value, index) => value !== slots[i].deps[index])
      )
        slots[i] = { value: create(), deps };
      return slots[i].value;
    },
    useId: () => `content-ui-${cursor++}`,
    useEffect() {},
  };
  function flush() {
    cursor = 0;
    const previous = internals.H;
    internals.H = dispatcher;
    try {
      tree = DungeonPreparation(props);
    } finally {
      internals.H = previous;
    }
  }
  flush();
  const find = (type, predicate) => {
    const node = walk(tree).find(
      (entry) => entry.type === type && predicate(entry)
    );
    assert.ok(node, `missing ${type}`);
    return node;
  };
  const click = (node) => {
    assert.equal(Boolean(node.props.disabled), false);
    node.props.onClick();
    flush();
  };
  return {
    markup: () => renderToStaticMarkup(tree),
    button: (label) => find('button', (node) => text(node) === label),
    click: (label) => click(find('button', (node) => text(node) === label)),
    rowButton(name, label) {
      const row = find('article', (node) => text(node).startsWith(name));
      const node = walk(row).find(
        (entry) => entry.type === 'button' && text(entry) === label
      );
      assert.ok(node, `missing row button ${name}: ${label}`);
      return node;
    },
    clickNode: click,
  };
}
const gear = {
  id: 'content-keyboard',
  name: '入门薄膜键盘',
  type: ItemType.Weapon,
  equipmentSlot: EquipmentSlot.Weapon,
  description: '测试库存中的实际装备。',
  quantity: 1,
  isEquippable: true,
  effect: { attack: 5 },
};
const player = (overrides = {}) => ({
  ...createInitialPlayer('内容测试同学', 'talent-ordinary'),
  inventory: [gear],
  equippedItems: {},
  ...overrides,
});

test('可选战术牌通过牌库进入简历，移出牌库后同时移出简历，基础八张仍常驻', () => {
  const subject = player();
  const sources = getDungeonCardSources(subject);
  const tactic = sources.find((source) => source.id.startsWith('tactic:'));
  assert.ok(tactic);
  const loadout = createDefaultCardLoadout(5);
  const saved = [];
  const ui = mountPreparation({
    player: subject,
    loadout,
    onSave: (...args) => {
      saved.push(args);
      return true;
    },
    onBack() {},
  });
  ui.click(`可用来源 ${sources.length}`);
  assert.equal(ui.rowButton('演算', '基础常驻').props.disabled, true);
  ui.clickNode(ui.rowButton(tactic.name, '加入牌库'));
  ui.click('牌库 9');
  ui.clickNode(ui.rowButton(tactic.name, '加入简历'));
  ui.click('保存简历');
  assert.equal(saved[0][1], 5);
  assert.ok(saved[0][0].library.includes(tactic.id));
  assert.ok(saved[0][0].resume.includes(tactic.id));
  assert.equal(saved[0][0].resume.length, 9);
  ui.clickNode(ui.rowButton(tactic.name, '移出牌库'));
  ui.click('保存简历');
  assert.equal(saved[1][0].library.includes(tactic.id), false);
  assert.equal(saved[1][0].resume.includes(tactic.id), false);
  assert.equal(saved[1][0].resume.length, 8);
  assert.equal(loadout.library.length, 8);
  assert.equal(loadout.resume.length, 8);
});

test('准备页说明实际穿戴特性自动生效，未把装备卡自动塞进简历', () => {
  const subject = player({
    equippedItems: { [EquipmentSlot.Weapon]: gear.id },
  });
  const loadout = createDefaultCardLoadout();
  const html = renderToStaticMarkup(
    React.createElement(DungeonPreparation, {
      player: subject,
      loadout,
      onSave: () => true,
      onBack() {},
    })
  );
  assert.match(html, /已穿戴特性 1 · 入场自动生效/);
  assert.match(html, /装备特性无需放入简历/);
  assert.ok(html.includes(gear.name));
  assert.ok(html.includes(getEquipmentBattleDefinition(gear).description));
  assert.equal(loadout.resume.length, 8);
  assert.equal(
    loadout.library.some((id) => id.startsWith('equipment:')),
    false
  );
});

test('主背包展示可穿戴装备的副本特性，装备栏仅展示真实有效的穿戴特性', () => {
  const subject = player();
  const html = renderToStaticMarkup(
    React.createElement(InventoryModal, {
      isOpen: true,
      onClose() {},
      inventory: subject.inventory,
      equippedItems: subject.equippedItems,
      player: subject,
      onUseItem() {},
      onEquipItem() {},
      onUnequipItem() {},
      onUpgradeItem() {},
      onDiscardItem() {},
      onBatchDiscard() {},
    })
  );
  const description = getEquipmentBattleDefinition(gear).description;
  assert.match(html, /卡牌副本特性/);
  assert.ok(html.includes(description));
  const equipped = { [EquipmentSlot.Weapon]: gear.id };
  const renderPanel = (slots, inventory = [gear]) =>
    renderToStaticMarkup(
      React.createElement(EquipmentPanel, {
        equippedItems: slots,
        inventory,
        player: subject,
        onUnequip() {},
      })
    );
  assert.ok(renderPanel(equipped).includes(description));
  assert.doesNotMatch(renderPanel({}), /卡牌副本特性/);
  assert.doesNotMatch(
    renderPanel({ [EquipmentSlot.Chest]: gear.id }),
    /卡牌副本特性/
  );
  assert.doesNotMatch(
    renderPanel(equipped, [gear, { ...gear }]),
    /卡牌副本特性/
  );
});
