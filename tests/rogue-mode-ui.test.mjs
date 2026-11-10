import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import GameEntry from '../GameEntry';
import RogueMode from '../features/rogue-mode/RogueMode';
import RogueRouteMap from '../features/rogue-mode/RogueRouteMap';
import { createRogueRun } from '../features/rogue-mode/engine';
import { ROGUE_SAVE_KEY } from '../features/rogue-mode/persistence';
import { JOBS } from '../features/rogue-mode/catalog';
import { getRogueMap } from '../features/rogue-mode/routeMap';

function words(node) {
  if (node === null || node === undefined || typeof node === 'boolean')
    return '';
  if (Array.isArray(node)) return node.map(words).join('');
  return typeof node === 'object' ? words(node.props?.children) : String(node);
}
function nodes(node) {
  if (!node || typeof node !== 'object') return [];
  if (Array.isArray(node)) return node.flatMap(nodes);
  return [node, ...nodes(node.props?.children)];
}
test('启动只展示两种模式，选择与返回时只挂载一个模式组件', () => {
  const internals =
    React.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
  let mode = 'choose',
    tree;
  function render() {
    const previous = internals.H;
    internals.H = {
      useState() {
        return [
          mode,
          (value) => {
            mode = value;
          },
        ];
      },
    };
    try {
      tree = GameEntry();
    } finally {
      internals.H = previous;
    }
  }
  const click = (name) => {
    const button = nodes(tree).find(
      (node) => node.type === 'button' && words(node).includes(name)
    );
    assert.ok(button);
    button.props.onClick();
    render();
  };
  render();
  assert.equal(nodes(tree).filter((n) => n.type === 'button').length, 2);
  click('校园修行');
  assert.equal(tree.type, React.Suspense);
  const campus = tree.props.children;
  assert.equal(typeof campus.props.onChooseMode, 'function');
  campus.props.onChooseMode();
  render();
  click('灵枢试炼');
  const rogue = tree.props.children;
  assert.notEqual(rogue.type, campus.type);
  assert.equal(typeof rogue.props.onExit, 'function');
  rogue.props.onExit();
  render();
  assert.match(words(tree), /同一座学园，两种修行/);
});
test('独立准备页提供三职业和两初始卡组，不读取主游戏记录', () => {
  const calls = [];
  const storage = {
    getItem(key) {
      calls.push(key);
      assert.equal(key, ROGUE_SAVE_KEY);
      return null;
    },
    setItem() {
      throw Error('初始渲染不得写入');
    },
  };
  const markup = renderToStaticMarkup(
    React.createElement(RogueMode, { storage, onExit() {} })
  );
  for (const job of Object.values(JOBS)) assert.ok(markup.includes(job.name));
  assert.equal((markup.match(/aria-pressed="/g) ?? []).length, 5);
  assert.match(markup, /初始卡组预览/);
  assert.match(markup, /开始新的试炼/);
  assert.match(markup, /课程悟道|课程术式/);
  assert.match(markup, /起始法器/);
  assert.deepEqual(calls, [ROGUE_SAVE_KEY]);
});
test('合法肉鸽存档显示继续入口，坏档仅显示说明，不自动删除覆盖', () => {
  const run = createRogueRun({
    runId: 'ui-resume',
    seed: 77,
    jobId: 'warden',
    starterId: 'focused',
  });
  let writes = 0;
  const storage = {
    getItem: () => JSON.stringify(run),
    setItem() {
      writes++;
    },
  };
  let markup = renderToStaticMarkup(
    React.createElement(RogueMode, { storage, onExit() {} })
  );
  assert.match(markup, /继续上次试炼/);
  assert.match(markup, /第 1 \/ 50 关/);
  const corrupt = {
    getItem: () => '{bad record',
    setItem() {
      writes++;
    },
  };
  markup = renderToStaticMarkup(
    React.createElement(RogueMode, { storage: corrupt, onExit() {} })
  );
  assert.match(markup, /原记录已保留/);
  assert.equal(writes, 0);
});

test('路线图只把相连的下一关作为按钮，只读地图保留当前位置', () => {
  const run = createRogueRun({
    runId: 'ui-route',
    seed: 77,
    jobId: 'warden',
    starterId: 'steady',
  });
  const graph = getRogueMap(run.seed, 1);
  const floorTwo = graph.filter((node) => node.floor === 2);
  const start = graph.find(
    (node) => node.floor === 1 && node.next.length < floorTwo.length
  );
  assert.ok(start);
  const branch = {
    ...run,
    floor: 2,
    cleared: 1,
    map: { ...run.map, path: [start.id] },
  };
  const markup = renderToStaticMarkup(
    React.createElement(RogueRouteMap, { run: branch, onChoose() {} })
  );
  const buttons = Array.from(
    markup.matchAll(/<button\b[^>]*data-node-id="([^"]+)"/g),
    ([, id]) => id
  );
  assert.deepEqual(buttons.sort(), [...start.next].sort());
  assert.match(markup, /第1关 · 第\d列 · 遭遇 · 当前位置/);
  assert.match(markup, /data-edge-state="available"/);
  assert.match(markup, /第10关 · 高数心魔 · 暂不可前往/);
  const preview = renderToStaticMarkup(
    React.createElement(RogueRouteMap, { run: branch })
  );
  assert.doesNotMatch(preview, /<button\b/);
  assert.match(preview, /aria-current="step"/);
});

test('无页面存档锁时点击开局明确拒绝写入，不发布新局或离开准备页', async (t) => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {},
  });
  t.after(() => {
    if (descriptor) Object.defineProperty(globalThis, 'navigator', descriptor);
    else delete globalThis.navigator;
  });
  let writes = 0;
  let exits = 0;
  const storage = {
    getItem(key) {
      assert.equal(key, ROGUE_SAVE_KEY);
      return null;
    },
    setItem() {
      writes++;
    },
  };
  const slots = [];
  let cursor = 0;
  let tree;
  const internals =
    React.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
  const dispatcher = {
    useState(initial) {
      const index = cursor++;
      slots[index] ??= {
        value: typeof initial === 'function' ? initial() : initial,
      };
      return [
        slots[index].value,
        (update) => {
          slots[index].value =
            typeof update === 'function' ? update(slots[index].value) : update;
        },
      ];
    },
    useRef(initial) {
      const index = cursor++;
      slots[index] ??= { value: { current: initial } };
      return slots[index].value;
    },
    useEffect() {
      cursor++;
    },
    useMemo(create) {
      cursor++;
      return create();
    },
  };
  function render() {
    cursor = 0;
    const previous = internals.H;
    internals.H = dispatcher;
    try {
      tree = RogueMode({
        storage,
        onExit() {
          exits++;
        },
      });
    } finally {
      internals.H = previous;
    }
  }
  render();
  const button = nodes(tree).find(
    (node) => node.type === 'button' && words(node) === '开始新的试炼 →'
  );
  assert.ok(button);
  button.props.onClick();
  await Promise.resolve();
  render();
  const markup = renderToStaticMarkup(tree);
  assert.match(markup, /role="alert"[^>]*>当前浏览器不支持安全的页面存档锁/);
  assert.match(markup, /HTTPS/);
  assert.match(markup, /rm-app rm-setup/);
  assert.doesNotMatch(markup, /rm-continue/);
  assert.equal(writes, 0);
  assert.equal(exits, 0);
});
