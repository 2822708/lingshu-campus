import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import SecretRealmModal from '../components/SecretRealmModal';
import { DungeonPreparation } from '../features/card-dungeon/ui/DungeonPreparation';
import {
  CardBattleView,
  getCommittedBattleCue,
} from '../features/card-battle/ui/CardBattleView';
import { BattleActor } from '../features/card-battle/ui/BattleActor';
import { createDefaultCardLoadout } from '../features/card-dungeon/loadout';
import { getDungeonCardSources } from '../features/card-dungeon/sources';
import { CARDS } from '../features/card-battle/catalog';
import {
  createCardBattle,
  stepCardBattle,
} from '../features/card-battle/engine';
import { createInitialPlayer } from '../utils/playerUtils';
import { RealmType } from '../types';
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
/** Real component handlers with controlled hooks. DOM/focus/viewport require browser QA. */
function mount(Component, initialProps) {
  const internals =
    React.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
  const slots = [];
  let cursor = 0;
  let tree;
  let props = initialProps;
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
    useRef(initial) {
      const i = cursor++;
      slots[i] ??= { value: { current: initial } };
      return slots[i].value;
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
    useId() {
      return `ui-${cursor++}`;
    },
    useEffect() {},
  };
  function flush() {
    cursor = 0;
    const old = internals.H;
    internals.H = dispatcher;
    try {
      tree = Component(props);
    } finally {
      internals.H = old;
    }
  }
  flush();
  return {
    flush,
    setProps(next) {
      props = { ...props, ...next };
      flush();
    },
    nodes: () => walk(tree),
    markup: () => renderToStaticMarkup(tree),
    find(type, predicate) {
      const node = walk(tree).find(
        (entry) => entry.type === type && predicate(entry)
      );
      assert.ok(node, `missing ${type}`);
      return node;
    },
    button(label) {
      return this.find(
        'button',
        (node) => text(node) === label || node.props['aria-label'] === label
      );
    },
    clickNode(node) {
      assert.equal(Boolean(node.props.disabled), false);
      node.props.onClick();
      flush();
    },
    click(label) {
      this.clickNode(this.button(label));
    },
  };
}
const player = (extra = {}) => ({
  ...createInitialPlayer('测试', 'npu:algorithm:pingmin'),
  spiritStones: 100000,
  hp: 500,
  maxHp: 500,
  realm: RealmType.ImmortalAscension,
  ...extra,
});
function card(i, templateId = 'strike') {
  const {
    id: ignored,
    scaling: ignoredScaling,
    ...template
  } = CARDS[templateId];
  return { ...template, id: `ui-card-${i}`, templateId };
}
function battle(count = 16) {
  return createCardBattle({
    id: 'ui-main',
    seed: 77,
    player: { hp: 90, maxHp: 100, attack: 40, defense: 30, speed: 20 },
    enemy: {
      name: '实验问题',
      hp: 1000,
      maxHp: 1000,
      attack: 20,
      defense: 10,
      speed: 10,
      behavior: 'balanced',
    },
    cards: Array.from({ length: count }, (_, i) => card(i)),
  });
}
function rowButton(ui, name, label) {
  const row = ui.find('article', (node) => text(node).startsWith(name));
  const node = walk(row).find(
    (entry) => entry.type === 'button' && text(entry) === label
  );
  assert.ok(node);
  return node;
}

test('准备页先加入课程牌库，再选入简历；只把草稿及期望修订交给主存档', () => {
  const saved = [];
  const loadout = createDefaultCardLoadout(7);
  const ui = mount(DungeonPreparation, {
    player: player({ cultivationArts: ['art-basic-breath'] }),
    loadout,
    onSave: (...args) => {
      saved.push(args);
      return true;
    },
    onBack() {},
  });
  ui.click(
    `可用来源 ${getDungeonCardSources(player({ cultivationArts: ['art-basic-breath'] })).length}`
  );
  const course = ui
    .nodes()
    .find((node) => node.type === 'article' && text(node).includes('已学课程'));
  const name = text(course.props.children[0].props.children[0]);
  ui.clickNode(walk(course).find((node) => node.type === 'button'));
  assert.match(ui.markup(), /简历 8 \/ 16/);
  assert.equal(saved.length, 0);
  ui.click('牌库 9');
  ui.clickNode(rowButton(ui, name, '加入简历'));
  ui.click('保存简历');
  assert.equal(saved.length, 1);
  assert.equal(saved[0][1], 7);
  assert.equal(saved[0][0].revision, 7);
  assert.equal(saved[0][0].resume.length, 9);
  assert.ok(saved[0][0].resume.includes('course:art-basic-breath'));
  assert.equal(loadout.resume.length, 8);
  assert.match(ui.markup(), /简历已保存/);
});

test('准备页保存失败不覆盖草稿，失效来源由明确整理操作修复', () => {
  const loadout = createDefaultCardLoadout();
  loadout.library.push('equipment:missing');
  loadout.resume.push('equipment:missing');
  const ui = mount(DungeonPreparation, {
    player: player(),
    loadout,
    onSave: () => false,
    onBack() {},
  });
  assert.equal(ui.button('保存简历').props.disabled, true);
  ui.click('整理失效来源');
  assert.equal(ui.button('保存简历').props.disabled, false);
  ui.click('保存简历');
  assert.match(ui.markup(), /暂未保存/);
  assert.equal(loadout.resume.length, 9);
});

test('副本列表把稳定批次和简历修订传给宿主，普通重渲染不会刷新报价', () => {
  const entered = [];
  const loadout = createDefaultCardLoadout(4);
  const ui = mount(SecretRealmModal, {
    isOpen: true,
    onClose() {},
    player: player(),
    cardLoadout: loadout,
    onEnterCardDungeon: (...args) => {
      entered.push(args);
      return false;
    },
    onSaveCardLoadout: () => true,
  });
  const enter = () =>
    ui.clickNode(
      ui
        .nodes()
        .find(
          (node) =>
            node.type === 'button' &&
            node.props['data-testid'] === 'dungeon-offer' &&
            !node.props.disabled
        )
    );
  enter();
  ui.setProps({ player: player({ spiritStones: 50000 }) });
  enter();
  assert.equal(entered.length, 2);
  assert.deepEqual(entered[0], entered[1]);
  assert.equal(entered[0][2], 4);
  assert.match(ui.markup(), /本次挑战尚未开始/);
  ui.clickNode(
    ui.find('button', (node) => node.props.title === '刷新副本列表')
  );
  enter();
  assert.notEqual(entered[2][1], entered[0][1]);
  ui.setProps({ error: '存储空间不足，动作尚未发生' });
  assert.match(ui.markup(), /role="alert"[^>]*>存储空间不足/);
});

test('副本列表仍支持旧入口，并保留真实精力不足限制', () => {
  const entered = [];
  const ui = mount(SecretRealmModal, {
    isOpen: true,
    onClose() {},
    player: player(),
    onEnter: (offer) => entered.push(offer),
  });
  ui.clickNode(
    ui
      .nodes()
      .find(
        (node) =>
          node.type === 'button' &&
          node.props['data-testid'] === 'dungeon-offer' &&
          !node.props.disabled
      )
  );
  assert.equal(entered.length, 1);
  assert.equal(typeof entered[0].cost, 'number');
  ui.setProps({ player: player({ hp: 149, maxHp: 500 }) });
  const buttons = ui
    .nodes()
    .filter(
      (node) =>
        node.type === 'button' && node.props['data-testid'] === 'dungeon-offer'
    );
  assert.equal(buttons.length, 3);
  assert.ok(buttons.every((node) => node.props.disabled));
});

test('新入口只有三个遭遇与刷新/关闭，无需准备页，旧失效手配不阻挡点击', () => {
  const entered = [];
  const loadout = createDefaultCardLoadout(5);
  loadout.library.push('equipment:missing');
  loadout.resume.push('equipment:missing');
  const ui = mount(SecretRealmModal, {
    isOpen: true,
    onClose() {},
    player: player(),
    cardLoadout: loadout,
    onEnterCardDungeon: (...args) => entered.push(args),
    onSaveCardLoadout: () => {
      throw new Error('入口不得先保存手配');
    },
  });
  const offers = ui
    .nodes()
    .filter(
      (node) =>
        node.type === 'button' && node.props['data-testid'] === 'dungeon-offer'
    );
  assert.equal(offers.length, 3);
  assert.deepEqual(
    offers.map((node) => node.props['data-risk']),
    ['低', '中', '高']
  );
  assert.equal(ui.nodes().filter((node) => node.type === 'button').length, 5);
  assert.ok(!ui.nodes().some((node) => node.type === DungeonPreparation));
  assert.doesNotMatch(ui.markup(), /整理简历|请先整理|报名进入副本/);
  ui.clickNode(offers[0]);
  assert.equal(entered.length, 1);
  assert.equal(entered[0][2], 5);
});

test('卡牌界面发出实例 ID 操作，结束回合与确认撤离分离', () => {
  const state = battle();
  const commands = [];
  const ui = mount(CardBattleView, {
    state,
    title: '实验室',
    onCommand: (command) => commands.push(command),
  });
  const button = ui.find('button', (node) =>
    node.props['aria-label']?.startsWith('演算，')
  );
  ui.clickNode(button);
  assert.deepEqual(commands[0], { type: 'play', cardId: state.hand[0] });
  ui.click('结束回合 →');
  assert.deepEqual(commands[1], { type: 'end-turn' });
  ui.click('撤离');
  assert.equal(commands.length, 2);
  ui.click('确认撤离');
  assert.deepEqual(commands[2], { type: 'retreat' });
  assert.match(ui.markup(), /role="dialog" aria-modal="true"/);
  assert.match(ui.markup(), /data-hand-rows="1"/);
  const actor = ui
    .nodes()
    .find((node) => node.type === BattleActor && node.props.side === 'player');
  assert.equal(actor.props.cue, null);
});

test('版画角色按双方身份与敌人类型选择，旧现场缺少类型时仍有合适立绘', () => {
  const cases = [
    [{ side: 'player', archetype: 'sentinel', variant: 1 }, 'player'],
    [{ side: 'enemy', archetype: 'sentinel', variant: 0 }, 'sentinel'],
    [{ side: 'enemy', archetype: 'counterguard', variant: 0 }, 'sentinel'],
    [{ side: 'enemy', archetype: 'regenerator', variant: 0 }, 'sentinel'],
    [{ side: 'enemy', archetype: 'duelist', variant: 1 }, 'duelist'],
    [{ side: 'enemy', archetype: 'sprinter', variant: 1 }, 'duelist'],
    [{ side: 'enemy', archetype: 'disruptor', variant: 1 }, 'duelist'],
    [{ side: 'enemy', variant: 0 }, 'duelist'],
    [{ side: 'enemy', variant: 1 }, 'sentinel'],
    [{ side: 'enemy', variant: 2 }, 'duelist'],
  ];
  for (const [props, portrait] of cases) {
    const snapshot = structuredClone(props);
    const tree = BattleActor(props);
    const images = walk(tree).filter((node) => node.type === 'img');
    assert.equal(tree.props['data-portrait'], portrait);
    assert.equal(images.length, 1);
    assert.ok(images[0].props.src.endsWith(`/assets/print-${portrait}.webp`));
    assert.equal(images[0].props.alt, '');
    assert.equal(images[0].props.draggable, false);
    assert.notEqual(images[0].props.loading, 'lazy');
    assert.deepEqual(props, snapshot, '人物选择不能改写输入现场');
  }
});

test('同轮反击和敌人修复分别反馈，精力净增长不会吞掉实际反击动画', () => {
  const before = battle();
  before.enemy.hp = 500;
  before.player.block = 20;
  before.player.counter = 7;
  before.intent = {
    type: 'adjust',
    name: '修补',
    description: '反击后修复',
    damage: 5,
    crit: false,
    heal: 8,
  };
  const after = stepCardBattle(before, {
    id: before.id,
    seq: 1,
    type: 'end-turn',
  });
  assert.equal(after.enemy.hp, 501);
  const cue = getCommittedBattleCue(before, after);
  assert.equal(cue.enemyDamage, 7);
  assert.equal(cue.enemyHealed, 8);
  const markup = renderToStaticMarkup(
    React.createElement(BattleActor, { side: 'enemy', cue })
  );
  assert.match(markup, /−7/);
  assert.match(markup, /\+8/);
  assert.match(markup, /ct-actor-image-frame/);
  assert.match(markup, /is-attacking is-hit/);
});

test('手动弃牌只确认精确数量，关闭整理返回出牌', () => {
  const state = battle();
  state.hand = state.cards.slice(0, 14).map((entry) => entry.id);
  state.drawPile = state.cards.slice(14).map((entry) => entry.id);
  state.phase = 'discard';
  const commands = [];
  const ui = mount(CardBattleView, {
    state,
    title: '弃牌',
    onCommand: (command) => commands.push(command),
  });
  assert.equal(ui.button('弃置 0 张并结束回合').props.disabled, true);
  for (let i = 0; i < 4; i++)
    ui.clickNode(
      ui.find('button', (node) =>
        node.props['aria-label']?.endsWith('，选择弃置')
      )
    );
  assert.equal(commands.length, 0);
  ui.click('弃置 4 张并结束回合');
  assert.equal(commands[0].type, 'confirm-discard');
  assert.equal(commands[0].cardIds.length, 4);
  assert.equal(new Set(commands[0].cardIds).size, 4);
  ui.click('返回出牌');
  assert.deepEqual(commands[1], { type: 'cancel-discard' });
});

test('终局保留角色舞台且仅确认继续，结算无重复战斗操作', () => {
  let state = battle();
  state = stepCardBattle(state, {
    id: state.id,
    seq: state.commandSeq + 1,
    type: 'retreat',
  });
  const commands = [];
  let acknowledged = 0;
  const ui = mount(CardBattleView, {
    state,
    title: '结算',
    result: {
      title: '安全撤离',
      text: '损耗已保留',
      changes: ['报名学分 -10'],
    },
    onCommand: (command) => commands.push(command),
    onAcknowledge: () => {
      acknowledged++;
    },
  });
  assert.equal(
    ui.nodes().filter((node) => node.type === BattleActor).length,
    2
  );
  assert.equal(
    ui
      .nodes()
      .filter((node) => node.type === 'button' && text(node) === '结束回合 →')
      .length,
    0
  );
  assert.match(ui.markup(), /本场已结算/);
  ui.click('确认继续 →');
  assert.equal(acknowledged, 1);
  assert.equal(commands.length, 0);
});

for (const [phase, label] of Object.entries({
  victory: '胜利 · 本场结束',
  defeat: '力竭 · 本场结束',
  retreat: '已撤离 · 本场结束',
  stalemate: '僵持 · 本场结束',
})) {
  test(`终局${phase}移除未来敌意预告并保持结算流水局部容器`, () => {
    const state = battle();
    state.phase = phase;
    if (phase === 'victory') state.enemy.hp = 0;
    if (phase === 'defeat') state.player.hp = 0;
    const ui = mount(CardBattleView, {
      state,
      title: '结算',
      result: {
        title: '本场结束',
        text: '损耗已保留',
        changes: Array.from(
          { length: 30 },
          (_, index) => `结算项 ${index + 1}`
        ),
      },
      onCommand() {},
      onAcknowledge() {},
    });
    const markup = ui.markup();
    assert.match(markup, new RegExp(label));
    assert.doesNotMatch(markup, /对手下一步|预计损失/);
    assert.match(markup, /class="cd-result-title"/);
    assert.match(markup, /class="cd-result-body"/);
    assert.equal(ui.button('确认继续 →').props.disabled, false);
  });
}
