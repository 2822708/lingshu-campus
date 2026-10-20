import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import AIConfigPanel from '../components/AIConfigPanel';
import { getAIConfig } from '../config/aiConfig';
import { loadUserAIConfig, saveUserAIConfig } from '../config/userAIConfig';

const LOCAL_KEY = 'npu-user-ai-config';
const SESSION_KEY = 'lingshu-ai-session-key';
const KEY_A = 'test-panel-placeholder-a';
const KEY_B = 'test-panel-placeholder-b';

/**
 * No DOM library is available in either this project or the bundled runtime.
 * This controlled React 19 Hook dispatcher executes the real component's render,
 * effects, and event callbacks. It does NOT simulate DOM layout, browser input
 * event bubbling, React DOM scheduling, or real browser storage/CORS.
 * Every key/storage/fetch in these tests is an isolated synthetic fixture.
 */
function mountPanel(t, initial = null) {
  const local = storage();
  const session = storage();
  const browser = new EventTarget();
  browser.confirm = () => true;
  const globalDescriptors = [];
  for (const [name, value] of [['localStorage', local], ['sessionStorage', session], ['window', browser]]) {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { configurable: true, value });
    globalDescriptors.push([name, descriptor]);
  }
  if (initial) saveUserAIConfig(initial);
  const calls = [];
  t.mock.method(globalThis, 'fetch', (url, options) => {
    let resolve, reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    const call = { url, options, resolve, reject };
    calls.push(call);
    options.signal?.addEventListener('abort', () => reject(new DOMException('test abort', 'AbortError')), { once: true });
    return promise;
  });
  const slots = [];
  let cursor = 0;
  let tree;
  let dirty = false;
  let unmounted = false;
  let pendingEffects = [];
  const sameDeps = (left, right) => Array.isArray(left) && Array.isArray(right) && left.length === right.length && left.every((value, index) => Object.is(value, right[index]));
  function slot(kind, create) {
    const index = cursor++;
    if (!slots[index]) slots[index] = { kind, ...create() };
    assert.equal(slots[index].kind, kind, 'Hook order changed');
    return slots[index];
  }
  const dispatcher = {
    useState(initialState) {
      const entry = slot('state', () => ({ value: typeof initialState === 'function' ? initialState() : initialState }));
      if (!entry.set) entry.set = (next) => {
        if (unmounted) return;
        entry.value = typeof next === 'function' ? next(entry.value) : next;
        dirty = true;
      };
      return [entry.value, entry.set];
    },
    useRef(value) { return slot('ref', () => ({ value: { current: value } })).value; },
    useCallback(callback, deps) {
      const entry = slot('callback', () => ({ callback, deps }));
      if (!sameDeps(entry.deps, deps)) { entry.callback = callback; entry.deps = deps; }
      return entry.callback;
    },
    useId() { return slot('id', () => ({ value: 'test-ai-panel' })).value; },
    useEffect(callback, deps) {
      const entry = slot('effect', () => ({ deps: undefined, cleanup: null }));
      if (!sameDeps(entry.deps, deps)) pendingEffects.push(() => {
        entry.cleanup?.();
        entry.cleanup = callback();
        entry.deps = deps;
      });
    },
  };
  const internals = React.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
  assert.ok(internals, 'This controlled harness requires the project pinned React 19 runtime.');
  function flush() {
    if (unmounted) return;
    for (let pass = 0; pass < 30; pass++) {
      cursor = 0;
      dirty = false;
      pendingEffects = [];
      const previous = internals.H;
      internals.H = dispatcher;
      try { tree = AIConfigPanel({ defaultCollapsed: false }); }
      finally { internals.H = previous; }
      const effects = pendingEffects;
      pendingEffects = [];
      effects.forEach(effect => effect());
      if (!dirty) return;
    }
    throw new Error('Controlled panel render did not settle');
  }
  function unmount() {
    if (unmounted) return;
    unmounted = true;
    slots.filter(entry => entry.kind === 'effect').forEach(entry => entry.cleanup?.());
  }
  t.after(() => {
    unmount();
    for (const [name, descriptor] of globalDescriptors) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  });
  function elements(node) {
    if (!node || typeof node !== 'object') return [];
    if (Array.isArray(node)) return node.flatMap(child => elements(child));
    return [node, ...elements(node.props?.children)];
  }
  function text(node) {
    if (node === null || node === undefined || typeof node === 'boolean') return '';
    if (typeof node === 'string' || typeof node === 'number') return String(node);
    if (Array.isArray(node)) return node.map(child => text(child)).join('');
    return text(node.props?.children);
  }
  function field(name) {
    if (name === 'enabled' || name === 'remember') {
      const checkboxes = elements(tree).filter(node => node.type === 'input' && node.props.type === 'checkbox');
      return checkboxes[name === 'enabled' ? 0 : 1];
    }
    return elements(tree).find(node => typeof node.props?.id === 'string' && node.props.id.endsWith('-' + name));
  }
  function change(name, value) {
    const node = field(name);
    assert.ok(node, 'Missing field: ' + name);
    node.props.onChange({ target: name === 'enabled' || name === 'remember' ? { checked: value } : { value } });
    flush();
  }
  function button(label) {
    const node = elements(tree).find(node => node.type === 'button' && text(node).trim() === label);
    assert.ok(node, 'Missing button: ' + label);
    return node;
  }
  function click(label) {
    const node = button(label);
    assert.ok(!node.props.disabled, 'Disabled button: ' + label);
    const result = node.props.onClick({ stopPropagation() {} });
    flush();
    return result;
  }
  async function settle() {
    await new Promise(resolve => setImmediate(resolve));
    flush();
    await new Promise(resolve => setImmediate(resolve));
    flush();
  }
  function reply(index, story = '你在研习室完成了这次文案测试。') {
    calls[index].resolve(new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({ story }) }, finish_reason: 'stop' }],
    }), { headers: { 'Content-Type': 'application/json' } }));
  }
  function external(value) {
    if (value === null) local.removeItem(LOCAL_KEY);
    else local.setItem(LOCAL_KEY, JSON.stringify(value));
    const event = new Event('storage');
    Object.defineProperty(event, 'key', { value: LOCAL_KEY });
    browser.dispatchEvent(event);
    flush();
  }
  flush();
  return { local, session, browser, calls, field, change, button, click, settle, reply, external, unmount, flush, text: () => text(tree) };
}
function storage() {
  return {
    data: new Map(),
    getItem(key) { return this.data.get(key) ?? null; },
    setItem(key, value) { this.data.set(key, String(value)); },
    removeItem(key) { this.data.delete(key); },
  };
}
function config(overrides = {}) {
  return { enabled: true, provider: 'custom', apiKey: KEY_A, model: 'panel-model-a', customUrl: 'https://panel-a.invalid/mock', protocol: 'openai', rememberKey: false, ...overrides };
}

test('受控Hook交互：默认本地、不自动请求，编辑草稿不改变运行配置', (t) => {
  const h = mountPanel(t);
  assert.equal(h.calls.length, 0);
  assert.match(h.text(), /本地文案/);
  h.change('enabled', true);
  h.change('provider', 'custom');
  h.change('model', 'draft-model');
  h.change('url', 'https://draft.invalid/mock');
  h.change('key', KEY_A);
  assert.equal(getAIConfig().enabled, false);
  assert.equal(h.local.getItem(LOCAL_KEY), null);
  assert.equal(h.session.getItem(SESSION_KEY), null);
  assert.match(h.text(), /当前有未保存更改/);
  assert.equal(h.calls.length, 0);
});

test('受控Hook交互：测试只发送当前草稿；成功不保存，保存后业务才切换', async (t) => {
  const h = mountPanel(t, config());
  h.change('model', 'panel-draft-model');
  h.change('key', KEY_B);
  const beforeLocal = h.local.getItem(LOCAL_KEY);
  const beforeSession = h.session.getItem(SESSION_KEY);
  const pending = h.click('测试当前草稿');
  assert.equal(h.calls.length, 1);
  assert.equal(JSON.parse(h.calls[0].options.body).model, 'panel-draft-model');
  assert.equal(h.calls[0].options.headers.Authorization, 'Bearer ' + KEY_B);
  assert.equal(getAIConfig().model, 'panel-model-a');
  h.reply(0);
  await pending;
  await h.settle();
  assert.match(h.text(), /事件文案生成通过/);
  assert.equal(h.local.getItem(LOCAL_KEY), beforeLocal);
  assert.equal(h.session.getItem(SESSION_KEY), beforeSession);
  h.click('保存配置');
  assert.equal(getAIConfig().model, 'panel-draft-model');
  assert.equal(getAIConfig().apiKey, KEY_B);
  assert.equal(JSON.parse(h.local.getItem(LOCAL_KEY)).apiKey, '');
  h.change('model', 'uncommitted-next');
  assert.doesNotMatch(h.text(), /事件文案生成通过/);
  assert.equal(getAIConfig().model, 'panel-draft-model');
});

test('受控Hook交互：provider切换清空草稿密钥和地址，旧保存配置不受影响', (t) => {
  const h = mountPanel(t, config());
  h.change('provider', 'deepseek');
  assert.equal(h.field('key').props.value, '');
  assert.equal(h.field('url').props.value, '');
  assert.equal(h.button('测试当前草稿').props.disabled, true);
  assert.equal(getAIConfig().apiKey, KEY_A);
  assert.equal(getAIConfig().provider, 'custom');
  h.change('provider', 'ollama');
  assert.equal(h.field('key').props.value, '');
  assert.equal(h.button('测试当前草稿').props.disabled, false);
  assert.match(h.text(), /localhost:11434/);
});

test('受控Hook交互：修改endpoint取消在途测试，取消结果不会覆盖新草稿', async (t) => {
  const h = mountPanel(t, config());
  const pending = h.click('测试当前草稿');
  h.change('url', 'https://panel-b.invalid/mock');
  assert.equal(h.calls[0].options.signal.aborted, true);
  await pending;
  await h.settle();
  assert.doesNotMatch(h.text(), /事件文案生成通过/);
  assert.equal(h.button('测试当前草稿').props.disabled, false);
  assert.equal(getAIConfig().apiUrl, 'https://panel-a.invalid/mock');
  assert.match(h.text(), /panel-b.invalid/);
});

test('受控Hook交互：显式取消、清除及卸载都终止真实runtime的mock请求', async (t) => {
  const h = mountPanel(t, config());
  const first = h.click('测试当前草稿');
  h.click('取消测试');
  assert.equal(h.calls[0].options.signal.aborted, true);
  await first;
  await h.settle();
  assert.match(h.text(), /已取消测试/);
  const second = h.click('测试当前草稿');
  h.click('清除配置与密钥');
  assert.equal(h.calls[1].options.signal.aborted, true);
  await second;
  await h.settle();
  assert.equal(loadUserAIConfig(), null);
  assert.equal(h.field('key').props.value, '');
  h.change('provider', 'ollama');
  const third = h.click('测试当前草稿');
  h.unmount();
  assert.equal(h.calls[2].options.signal.aborted, true);
  await third;
});

test('受控Hook交互：HTTP200但空文本显示失败，不虚报连接成功', async (t) => {
  const h = mountPanel(t, config());
  const pending = h.click('测试当前草稿');
  h.calls[0].resolve(new Response(JSON.stringify({ choices: [{ message: { content: '' }, finish_reason: 'stop' }] }), { headers: { 'Content-Type': 'application/json' } }));
  await pending;
  await h.settle();
  assert.doesNotMatch(h.text(), /事件文案生成通过/);
  assert.match(h.text(), /未返回有效文本|没有返回可用文本|空|有效文本/);
});

test('受控Hook交互：旧local密钥默认迁移session，明确记住才长期留存', (t) => {
  const h = mountPanel(t);
  h.external(config({ rememberKey: undefined }));
  assert.match(h.text(), /检测到旧版长期保留的密钥/);
  assert.equal(h.field('remember').props.checked, false);
  h.click('保存配置');
  assert.equal(JSON.parse(h.local.getItem(LOCAL_KEY)).apiKey, '');
  assert.equal(JSON.parse(h.session.getItem(SESSION_KEY)).apiKey, KEY_A);
  assert.doesNotMatch(h.text(), /检测到旧版长期保留的密钥/);
  h.change('remember', true);
  h.click('保存配置');
  assert.equal(JSON.parse(h.local.getItem(LOCAL_KEY)).apiKey, KEY_A);
  assert.equal(h.session.getItem(SESSION_KEY), null);
  h.change('remember', false);
  h.click('保存配置');
  assert.equal(JSON.parse(h.local.getItem(LOCAL_KEY)).apiKey, '');
  assert.equal(JSON.parse(h.session.getItem(SESSION_KEY)).apiKey, KEY_A);
});

test('受控Hook交互：保存失败保留旧有效配置，恢复权限后可重试成功', (t) => {
  const h = mountPanel(t, config());
  const originalLocal = h.local.getItem(LOCAL_KEY);
  const originalSession = h.session.getItem(SESSION_KEY);
  h.change('model', 'next-model');
  h.change('key', KEY_B);
  const blocked = t.mock.method(h.local, 'setItem', () => { throw new Error('synthetic quota denial'); });
  h.click('保存配置');
  assert.match(h.text(), /存储失败/);
  assert.doesNotMatch(h.text(), /已保存。后续 AI 请求/);
  assert.equal(h.local.getItem(LOCAL_KEY), originalLocal);
  assert.equal(h.session.getItem(SESSION_KEY), originalSession);
  assert.equal(getAIConfig().model, 'panel-model-a');
  blocked.mock.restore();
  h.click('保存配置');
  assert.match(h.text(), /已保存。后续 AI 请求/);
  assert.equal(getAIConfig().model, 'next-model');
  assert.equal(getAIConfig().apiKey, KEY_B);
});

test('受控Hook交互：清除失败明确反馈；恢复权限重试后清空两种存储', (t) => {
  const h = mountPanel(t, config({ rememberKey: true }));
  const blocked = t.mock.method(h.local, 'removeItem', () => { throw new Error('synthetic storage denial'); });
  h.click('清除配置与密钥');
  assert.match(h.text(), /无法清除/);
  assert.doesNotMatch(h.text(), /已清除配置及密钥/);
  assert.equal(loadUserAIConfig().apiKey, KEY_A);
  blocked.mock.restore();
  h.click('清除配置与密钥');
  assert.equal(h.local.getItem(LOCAL_KEY), null);
  assert.equal(h.session.getItem(SESSION_KEY), null);
  assert.match(h.text(), /已清除配置及密钥/);
});

test('受控Hook交互：部分清除失败后已保存状态应反映实际运行配置', (t) => {
  const h = mountPanel(t, config({ rememberKey: true }));
  const blocked = t.mock.method(h.session, 'removeItem', () => { throw new Error('synthetic session denial'); });
  h.click('清除配置与密钥');
  assert.equal(h.local.getItem(LOCAL_KEY), null);
  assert.equal(getAIConfig().enabled, false);
  assert.match(h.text(), /无法清除/);
  assert.match(h.text(), /AI 文案设置本地文案/);
  blocked.mock.restore();
});

test('受控Hook交互：配置未清除但会话密钥已清除时应显示待补充', (t) => {
  const h = mountPanel(t, config());
  const blocked = t.mock.method(h.local, 'removeItem', () => { throw new Error('synthetic local denial'); });
  h.click('清除配置与密钥');
  assert.notEqual(h.local.getItem(LOCAL_KEY), null);
  assert.equal(h.session.getItem(SESSION_KEY), null);
  assert.equal(getAIConfig().apiKey, '');
  assert.match(h.text(), /无法清除/);
  assert.match(h.text(), /AI 文案设置配置待补充/);
  blocked.mock.restore();
});

for (const [protocol, base, path] of [
  ['openai', 'https://protocol.invalid/v1', '/v1/chat/completions'],
  ['anthropic', 'https://protocol.invalid/v1', '/v1/messages'],
  ['gemini', 'https://protocol.invalid/v1beta', '/v1beta/models/draft-protocol-model:generateContent'],
]) {
  test('受控Hook交互：协议与base地址覆盖使用当前草稿 ' + protocol, async (t) => {
    const h = mountPanel(t, config());
    h.change('protocol', protocol);
    h.change('url', base);
    h.change('model', 'draft-protocol-model');
    const pending = h.click('测试当前草稿');
    assert.equal(h.calls[0].url, 'https://protocol.invalid' + path);
    const payload = JSON.parse(h.calls[0].options.body);
    const content = JSON.stringify({ story: '你完成了当前协议的文案测试。' });
    const response = protocol === 'anthropic'
      ? { content: [{ type: 'text', text: content }], stop_reason: 'end_turn' }
      : protocol === 'gemini'
        ? { candidates: [{ content: { parts: [{ text: content }] }, finishReason: 'STOP' }] }
        : { choices: [{ message: { content }, finish_reason: 'stop' }] };
    if (protocol === 'gemini') {
      assert.ok(payload.contents);
      assert.equal(h.calls[0].options.headers['x-goog-api-key'], KEY_A);
    } else {
      assert.equal(payload.model, 'draft-protocol-model');
      assert.equal(h.calls[0].options.headers[protocol === 'anthropic' ? 'x-api-key' : 'Authorization'], protocol === 'anthropic' ? KEY_A : 'Bearer ' + KEY_A);
    }
    h.calls[0].resolve(new Response(JSON.stringify(response), { headers: { 'Content-Type': 'application/json' } }));
    await pending;
    await h.settle();
    assert.match(h.text(), /事件文案生成通过/);
    assert.equal(getAIConfig().apiUrl, 'https://panel-a.invalid/mock');
  });
}

test('受控Hook交互：其他页面修改取消测试，保留本页未保存草稿并更新保存状态', async (t) => {
  const h = mountPanel(t, config());
  h.change('model', 'local-draft-model');
  const pending = h.click('测试当前草稿');
  h.external(config({ enabled: false, apiKey: '', model: 'external-model', customUrl: 'https://external.invalid/mock' }));
  assert.equal(h.calls[0].options.signal.aborted, true);
  await pending;
  await h.settle();
  assert.equal(getAIConfig().enabled, false);
  assert.equal(h.field('model').props.value, 'local-draft-model');
  assert.match(h.text(), /另一个页面已更改保存配置/);
  assert.doesNotMatch(h.text(), /事件文案生成通过/);
  h.click('撤销更改');
  assert.equal(h.field('model').props.value, 'external-model');
  assert.equal(h.field('key').props.value, '');
});
