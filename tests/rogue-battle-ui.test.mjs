import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CardBattleView } from '../features/card-battle/ui/CardBattleView';
import { createCardBattle } from '../features/card-battle/engine';
import { CARDS } from '../features/card-battle/catalog';

function fixture() {
  const { id: ignored, scaling: ignoredScaling, ...template } = CARDS.strike;
  return createCardBattle({
    id: 'rogue-ui-fixture',
    seed: 213,
    maxTurns: 25,
    player: { hp: 70, maxHp: 80, attack: 12, defense: 9, speed: 10 },
    enemy: {
      name: '门卫',
      hp: 100,
      maxHp: 100,
      attack: 12,
      defense: 5,
      speed: 8,
      behavior: 'balanced',
      archetype: 'duelist',
    },
    cards: Array.from({ length: 8 }, (_, index) => ({
      ...template,
      id: `rogue-ui-card-${index}`,
      templateId: 'strike',
      description: '造成6损耗并恢复精力。',
      source: index === 0 ? 'course' : 'basic',
      sourceLabel: index === 0 ? '已学课程' : '基础牌',
    })),
    equipment: [
      {
        id: 'ui-relic',
        sourceId: 'ui-relic',
        name: '炉火护符',
        effect: 'opening-block',
        amount: 3,
        description: '开场防护，保护本场精力。',
      },
    ],
  });
}
const content = (node) =>
  node == null || typeof node === 'boolean'
    ? ''
    : Array.isArray(node)
      ? node.map(content).join('')
      : typeof node === 'object'
        ? content(node.props?.children)
        : String(node);
function walk(node) {
  if (!node || typeof node !== 'object') return [];
  if (Array.isArray(node)) return node.flatMap(walk);
  return [node, ...walk(node.props?.children)];
}
/** Controlled component state lets us render its actual notebook branches. */
function mount(props) {
  const internals =
    React.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
  const slots = [];
  let cursor = 0;
  let tree;
  const dispatcher = {
    useState(initial) {
      const slot = cursor++;
      slots[slot] ??= {
        value: typeof initial === 'function' ? initial() : initial,
      };
      return [
        slots[slot].value,
        (next) => {
          slots[slot].value =
            typeof next === 'function' ? next(slots[slot].value) : next;
        },
      ];
    },
    useRef(initial) {
      const slot = cursor++;
      slots[slot] ??= { value: { current: initial } };
      return slots[slot].value;
    },
    useId() {
      return `rogue-ui-${cursor++}`;
    },
    useEffect() {},
  };
  function flush() {
    const previous = internals.H;
    cursor = 0;
    internals.H = dispatcher;
    try {
      tree = CardBattleView(props);
    } finally {
      internals.H = previous;
    }
  }
  flush();
  return {
    markup: () => renderToStaticMarkup(tree),
    click(label) {
      const button = walk(tree).find(
        (node) => node.type === 'button' && content(node) === label
      );
      assert.ok(button, `missing button: ${label}`);
      assert.ok(!button.props.disabled);
      button.props.onClick();
      flush();
    },
  };
}
const props = (state) => ({ state, title: '第1关 · 林间哨站', onCommand() {} });

test('未指定mode时仍使用原副本文案，显式dungeon与默认渲染一致', () => {
  const state = fixture();
  const normal = mount(props(state)).markup();
  assert.equal(normal, mount({ ...props(state), mode: 'dungeon' }).markup());
  assert.match(normal, /考研副本 · 现场作答/);
  assert.match(normal, /简历 8/);
  assert.match(normal, /装备 1/);
  assert.match(normal, /data-shape="portrait-4-3"/);
  assert.match(normal, /data-hand-rows="1"/);
});

test('独立试炼展示精力、术式与法器，来源仍属于本局课程和实验', () => {
  const state = fixture();
  const original = structuredClone(state);
  const html = mount({ ...props(state), mode: 'rogue' }).markup();
  assert.match(html, /灵枢试炼 · 课程术式与工程法器/);
  assert.match(html, /术式 8/);
  assert.match(html, /法器 1/);
  assert.match(html, /aria-label="我的精力"/);
  assert.match(html, /aria-label="门卫精力"/);
  assert.doesNotMatch(
    html,
    /精力精力|考研副本|现场作答|已学课程|当前装备|生命|远征|遗物/
  );
  assert.match(html, /data-mode="rogue"/);
  assert.match(html, /data-shape="portrait-4-3"/);
  assert.match(html, /data-hand-rows="1"/);
  assert.deepEqual(state, original, '文案转换不得改写引擎快照');
});

test('独立规则使用本局生命周期和真实回合数，原副本规则继续保留', () => {
  const state = fixture();
  const rogue = mount({ ...props(state), mode: 'rogue' });
  rogue.click('规则');
  const html = rogue.markup();
  assert.match(html, /试炼战斗规则/);
  assert.match(html, /治疗最多回到本场入场精力/);
  assert.match(html, /25/);
  assert.match(html, /撤离、力竭或僵局会结束本次试炼/);
  assert.doesNotMatch(html, /取自本次入场记录|选入简历|生命|已学课程|当前装备/);
  const dungeon = mount(props(state));
  dungeon.click('规则');
  assert.match(dungeon.markup(), /装备卡仍需自行选入简历/);
});

test('独立牌组与遗物笔记展示本局记录，不把课程计数当作本局来源', () => {
  const state = fixture();
  const rogue = mount({ ...props(state), mode: 'rogue' });
  rogue.click('术式 8');
  assert.match(rogue.markup(), /本局术式说明/);
  assert.match(rogue.markup(), /术式与法器来自本局课程修习和实验/);
  assert.doesNotMatch(
    rogue.markup(),
    /已学课程|当前装备|取自入场角色|本场简历/
  );
  rogue.click('返回牌桌 ×');
  rogue.click('法器 1');
  assert.match(rogue.markup(), /本局法器/);
  assert.match(rogue.markup(), /保护本场精力/);
});

test('保存离开调用独立暂停回调，不冒充撤离指令；副本不显示该入口', () => {
  let paused = 0;
  const commands = [];
  const state = fixture();
  const rogue = mount({
    ...props(state),
    mode: 'rogue',
    onPause: () => paused++,
    onCommand: (command) => commands.push(command),
  });
  rogue.click('保存离开');
  assert.equal(paused, 1);
  assert.deepEqual(commands, []);
  rogue.click('撤离');
  assert.match(rogue.markup(), /本次试炼将结束/);
  rogue.click('确认撤离');
  assert.deepEqual(commands, [{ type: 'retreat' }]);
  assert.doesNotMatch(
    mount({ ...props(state), onPause: () => paused++ }).markup(),
    /保存离开/
  );
});

test('独立战果保留父流程确认回调，不提前宣称奖励已经结算', () => {
  let confirmed = 0;
  const state = fixture();
  const rogue = mount({
    ...props(state),
    mode: 'rogue',
    result: {
      title: '守卫已击败',
      text: '本场精力已保存，确认后领取关卡奖励。',
      changes: ['精力剩余70'],
    },
    onAcknowledge: () => confirmed++,
  });
  assert.match(rogue.markup(), /aria-label="本局战果"/);
  assert.match(rogue.markup(), /战斗结果已保存/);
  assert.doesNotMatch(rogue.markup(), /本场已结算|生命/);
  rogue.click('确认继续 →');
  assert.equal(confirmed, 1);
});
