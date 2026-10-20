import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  PROVIDER_PRESETS,
  AI_CONFIG_CHANGED_EVENT,
  getDefaultConfig,
  getProviderPreset,
  loadUserAIConfig,
  saveUserAIConfig,
  clearUserAIConfig,
  hasLegacyPersistedAIKey,
  resolveUserAIUrl,
  isLoopbackUrl,
  maskApiKey,
} from '../config/userAIConfig';
import {
  getAIConfig,
  resolveUserAIConfig,
  validateAIConfig,
} from '../config/aiConfig';
import AIConfigPanel from '../components/AIConfigPanel';

const LOCAL_KEY = 'npu-user-ai-config';
const SESSION_KEY = 'lingshu-ai-session-key';
class MemoryStorage {
  data = new Map();
  getItem(key) {
    return this.data.get(key) ?? null;
  }
  setItem(key, value) {
    this.data.set(key, String(value));
  }
  removeItem(key) {
    this.data.delete(key);
  }
}
function installStorage(t) {
  const local = new MemoryStorage();
  const session = new MemoryStorage();
  const windowTarget = new EventTarget();
  for (const [name, value] of [
    ['localStorage', local],
    ['sessionStorage', session],
    ['window', windowTarget],
  ]) {
    const previous = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { configurable: true, value });
    t.after(() => {
      if (previous) Object.defineProperty(globalThis, name, previous);
      else delete globalThis[name];
    });
  }
  return { local, session, windowTarget };
}
const config = (overrides = {}) => ({
  enabled: true,
  provider: 'custom',
  apiKey: 'test-session-placeholder',
  model: 'account-model',
  protocol: 'openai',
  customUrl: 'https://campus.invalid/mock',
  ...overrides,
});

test('常见服务保留旧ID，新服务均可解析预设地址且不承诺账户模型', () => {
  const ids = PROVIDER_PRESETS.map((p) => p.id);
  for (const id of [
    'siliconflow',
    'deepseek',
    'MiniMax',
    'openai',
    'doubao',
    'custom',
    'qwen',
    'moonshot',
    'zhipu',
    'gemini',
    'anthropic',
    'ollama',
    'lmstudio',
  ])
    assert.ok(ids.includes(id));
  assert.equal(ids.filter((id) => id === 'MiniMax').length, 1);
  for (const preset of PROVIDER_PRESETS.filter((p) => p.id !== 'custom')) {
    const url = resolveUserAIUrl(
      config({
        provider: preset.id,
        customUrl: '',
        protocol: preset.protocol,
        model: preset.models[0]?.id || 'loaded-model',
      })
    );
    assert.ok(url.startsWith('https://') || isLoopbackUrl(url));
    assert.ok(preset.models.length <= 2);
  }
  assert.equal(getDefaultConfig().enabled, false);
  assert.equal(getDefaultConfig().rememberKey, false);
});

test('旧完整密钥可读取且明确标记迁移，旧MiniMax大小写和手填模型保留', (t) => {
  const { local } = installStorage(t);
  local.setItem(
    LOCAL_KEY,
    JSON.stringify(
      config({
        provider: 'MiniMax',
        protocol: undefined,
        customUrl: '',
        model: 'MiniMax-Text-01',
      })
    )
  );
  const loaded = loadUserAIConfig();
  assert.equal(loaded.provider, 'MiniMax');
  assert.equal(loaded.model, 'MiniMax-Text-01');
  assert.equal(loaded.apiKey, 'test-session-placeholder');
  assert.equal(loaded.rememberKey, false);
  assert.equal(new URL(resolveUserAIUrl(loaded)).host, 'api.minimax.chat');
  assert.equal(hasLegacyPersistedAIKey(), true);
  saveUserAIConfig(loaded);
  assert.equal(JSON.parse(local.getItem(LOCAL_KEY)).apiKey, '');
  assert.equal(hasLegacyPersistedAIKey(), false);
});

test('默认保存只把密钥写入session，非敏感配置持久化并可重新加载', (t) => {
  const { local, session, windowTarget } = installStorage(t);
  let changes = 0;
  windowTarget.addEventListener(AI_CONFIG_CHANGED_EVENT, () => changes++);
  saveUserAIConfig(config());
  assert.equal(JSON.parse(local.getItem(LOCAL_KEY)).apiKey, '');
  assert.equal(
    JSON.parse(session.getItem(SESSION_KEY)).apiKey,
    'test-session-placeholder'
  );
  assert.equal(loadUserAIConfig().apiKey, 'test-session-placeholder');
  session.data.clear();
  assert.equal(loadUserAIConfig().apiKey, '');
  assert.equal(loadUserAIConfig().model, 'account-model');
  assert.equal(changes, 1);
});

test('显式记住才长期保存，取消勾选会移除本地完整密钥', (t) => {
  const { local, session } = installStorage(t);
  saveUserAIConfig(config({ rememberKey: true }));
  assert.equal(
    JSON.parse(local.getItem(LOCAL_KEY)).apiKey,
    'test-session-placeholder'
  );
  assert.equal(session.getItem(SESSION_KEY), null);
  saveUserAIConfig(config({ rememberKey: false }));
  assert.equal(JSON.parse(local.getItem(LOCAL_KEY)).apiKey, '');
  assert.equal(loadUserAIConfig().apiKey, 'test-session-placeholder');
});

test('session密钥绑定服务商和目标地址，旧会话密钥不会串发给另一服务', (t) => {
  const { local } = installStorage(t);
  saveUserAIConfig(config());
  local.setItem(
    LOCAL_KEY,
    JSON.stringify(
      config({ apiKey: '', customUrl: 'https://another.invalid/mock' })
    )
  );
  assert.equal(loadUserAIConfig().apiKey, '');
  local.setItem(
    LOCAL_KEY,
    JSON.stringify(config({ provider: 'deepseek', apiKey: '' }))
  );
  assert.equal(loadUserAIConfig().apiKey, '');
});

test('保存关闭状态仍压过默认配置，session读取失败不会丢失关闭选择', (t) => {
  const { local, session } = installStorage(t);
  local.setItem(
    LOCAL_KEY,
    JSON.stringify(config({ enabled: false, apiKey: '' }))
  );
  t.mock.method(session, 'getItem', () => {
    throw new Error('test-blocked');
  });
  assert.equal(loadUserAIConfig().enabled, false);
  assert.equal(getAIConfig().enabled, false);
  assert.equal(getAIConfig().provider, 'custom');
});

test('两种storage保存失败都会抛错，不把旧完整密钥当成迁移成功', (t) => {
  const { local, session } = installStorage(t);
  const previous = JSON.stringify(config());
  local.setItem(LOCAL_KEY, previous);
  const deniedLocal = t.mock.method(local, 'setItem', () => {
    throw new Error('test-quota');
  });
  assert.throws(
    () => saveUserAIConfig(config({ apiKey: 'next-test-placeholder' })),
    /存储失败/
  );
  assert.equal(local.getItem(LOCAL_KEY), previous);
  deniedLocal.mock.restore();
  t.mock.method(session, 'setItem', () => {
    throw new Error('test-blocked');
  });
  assert.throws(() => saveUserAIConfig(config()), /存储失败/);
  assert.equal(local.getItem(LOCAL_KEY), previous);
});

test('清除同时移除local/session并通知；失败必须抛错', (t) => {
  const { local, session, windowTarget } = installStorage(t);
  saveUserAIConfig(config());
  let changes = 0;
  windowTarget.addEventListener(AI_CONFIG_CHANGED_EVENT, () => changes++);
  clearUserAIConfig();
  assert.equal(local.getItem(LOCAL_KEY), null);
  assert.equal(session.getItem(SESSION_KEY), null);
  assert.equal(changes, 1);
  t.mock.method(local, 'removeItem', () => {
    throw new Error('test-blocked');
  });
  assert.throws(clearUserAIConfig, /无法清除/);
});

test('OpenAI兼容base/fullURL与旧任意代理路径保持兼容', () => {
  for (const [raw, expected] of [
    ['https://campus.invalid', 'https://campus.invalid/v1/chat/completions'],
    [
      'https://campus.invalid/v1/',
      'https://campus.invalid/v1/chat/completions',
    ],
    [
      'https://campus.invalid/api/v3',
      'https://campus.invalid/api/v3/chat/completions',
    ],
    [
      'https://campus.invalid/api/paas/v4',
      'https://campus.invalid/api/paas/v4/chat/completions',
    ],
    [
      'https://campus.invalid/compatible-mode/v1',
      'https://campus.invalid/compatible-mode/v1/chat/completions',
    ],
    ['https://campus.invalid/mock', 'https://campus.invalid/mock'],
    [
      'https://campus.invalid/v1/chat/completions?api-version=2026',
      'https://campus.invalid/v1/chat/completions?api-version=2026',
    ],
  ])
    assert.equal(resolveUserAIUrl(config({ customUrl: raw })), expected);
});

test('Anthropic和Gemini的base/fullURL采用同一client规则', () => {
  for (const raw of [
    'https://campus.invalid',
    'https://campus.invalid/v1',
    'https://campus.invalid/v1/messages',
  ])
    assert.equal(
      resolveUserAIUrl(config({ protocol: 'anthropic', customUrl: raw })),
      'https://campus.invalid/v1/messages'
    );
  for (const raw of [
    'https://campus.invalid',
    'https://campus.invalid/v1beta',
    'https://campus.invalid/v1beta/models',
    'https://campus.invalid/v1beta/models/old:generateContent',
  ])
    assert.equal(
      resolveUserAIUrl(
        config({ protocol: 'gemini', customUrl: raw, model: 'new-model' })
      ),
      'https://campus.invalid/v1beta/models/new-model:generateContent'
    );
  assert.equal(
    resolveUserAIUrl(
      config({
        protocol: 'gemini',
        customUrl: 'https://campus.invalid/custom-gemini',
        model: 'new-model',
      })
    ),
    'https://campus.invalid/custom-gemini'
  );
});

test('本机loopback可免Key，远程和伪装localhost地址必须有Key', () => {
  for (const customUrl of [
    'http://localhost:11434/v1',
    'http://127.0.0.1:1234/v1',
    'http://[::1]:1234/v1',
  ])
    assert.equal(
      validateAIConfig(resolveUserAIConfig(config({ apiKey: '', customUrl })))
        .valid,
      true
    );
  for (const customUrl of [
    'https://campus.invalid/v1',
    'https://localhost.attacker.invalid/v1',
  ])
    assert.equal(
      validateAIConfig(resolveUserAIConfig(config({ apiKey: '', customUrl })))
        .valid,
      false
    );
});

test('远程HTTP、凭证查询和URL登录信息在保存前拒绝，配置摘要不回显输入', (t) => {
  installStorage(t);
  for (const customUrl of [
    'http://campus.invalid/v1',
    'https://campus.invalid/mock?api_key=test-only',
    'https://campus.invalid/mock?access-token=test-only',
    'https://user:pass@campus.invalid/v1',
  ]) {
    assert.throws(() => saveUserAIConfig(config({ customUrl })));
    assert.equal(
      validateAIConfig(resolveUserAIConfig(config({ customUrl }))).valid,
      false
    );
  }
  assert.equal(maskApiKey('test-only-placeholder'), '••••••••');
});

test('自定义官方OpenAI地址不覆盖client的参数自动识别，预设明确值仍保留', () => {
  const custom = resolveUserAIConfig(
    config({ customUrl: 'https://api.openai.com/v1', model: 'gpt-5-mini' })
  );
  assert.equal(custom.tokenParameter, undefined);
  assert.equal(custom.omitTemperature, undefined);
  const official = resolveUserAIConfig(
    config({ provider: 'openai', customUrl: '', model: 'gpt-4.1-mini' })
  );
  assert.equal(official.tokenParameter, 'max_completion_tokens');
  assert.equal(official.omitTemperature, true);
});

test('面板初次渲染不发请求，区分草稿提示并允许手填模型及显式记住', (t) => {
  installStorage(t);
  let requests = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    requests++;
    throw new Error('unexpected-network');
  });
  const html = renderToStaticMarkup(
    React.createElement(AIConfigPanel, { defaultCollapsed: false })
  );
  assert.equal(requests, 0);
  assert.match(html, /测试当前草稿/);
  assert.match(html, /模型 ID（可直接手填）/);
  assert.match(html, /长期保存/);
  assert.match(html, /更多接口设置/);
  assert.match(html, /浏览器明文存储/);
  assert.match(html, /密钥会发送到上面显示的服务地址/);
  assert.match(html, /将发送到/);
});
