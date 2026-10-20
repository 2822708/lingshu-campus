import { normalizeAIEndpoint } from '../services/ai/client';
/** Provider examples are not an account model catalogue. Keys are session-only unless explicitly remembered. */
export type AIProtocol = 'openai' | 'anthropic' | 'gemini';
export type AITokenParameter = 'max_tokens' | 'max_completion_tokens';
export type AIProviderId =
  | 'siliconflow'
  | 'deepseek'
  | 'MiniMax'
  | 'openai'
  | 'doubao'
  | 'custom'
  | 'qwen'
  | 'moonshot'
  | 'zhipu'
  | 'gemini'
  | 'anthropic'
  | 'ollama'
  | 'lmstudio';

export interface UserAIConfig {
  enabled: boolean;
  provider: AIProviderId;
  apiKey: string;
  model: string;
  /** Any provider may override its URL; both a base URL and a full endpoint are accepted. */
  customUrl?: string;
  protocol?: AIProtocol;
  rememberKey?: boolean;
}
export interface ProviderPreset {
  id: AIProviderId;
  name: string;
  description: string;
  baseUrl: string;
  homepage: string;
  docsUrl: string;
  protocol: AIProtocol;
  allowEmptyKey?: boolean;
  tokenParameter?: AITokenParameter;
  omitTemperature?: boolean;
  models: Array<{ id: string; label: string; description: string }>;
  needsCustomUrl?: boolean;
}
const sample = (id: string) => ({
  id,
  label: id,
  description: '示例 ID；请以你的账户或本地已加载模型为准。',
});

/** Endpoints checked against the linked official documentation on 2026-10-16. */
export const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    id: 'siliconflow',
    name: '硅基流动',
    description: 'OpenAI 兼容接口',
    baseUrl: 'https://api.siliconflow.cn/v1/chat/completions',
    protocol: 'openai',
    homepage: 'https://cloud.siliconflow.cn/account/apiKey',
    docsUrl: 'https://docs.siliconflow.cn/docs/api/chat-completions-post',
    models: [sample('deepseek-ai/DeepSeek-V4-Flash')],
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    description: 'DeepSeek 官方接口',
    baseUrl: 'https://api.deepseek.com/v1/chat/completions',
    protocol: 'openai',
    omitTemperature: true,
    homepage: 'https://platform.deepseek.com/api_keys',
    docsUrl: 'https://api-docs.deepseek.com/',
    models: [sample('deepseek-flash')],
  },
  {
    id: 'MiniMax',
    name: 'MiniMax',
    description: '国际站；国内站可覆盖为控制台地址',
    baseUrl: 'https://api.minimax.io/v1/chat/completions',
    protocol: 'openai',
    tokenParameter: 'max_completion_tokens',
    omitTemperature: true,
    homepage: 'https://platform.minimax.io/',
    docsUrl: 'https://platform.minimax.io/docs/api-reference/text-openai-api',
    models: [sample('MiniMax-M2.5')],
  },
  {
    id: 'openai',
    name: 'OpenAI',
    description: 'Chat Completions 接口',
    baseUrl: 'https://api.openai.com/v1/chat/completions',
    protocol: 'openai',
    tokenParameter: 'max_completion_tokens',
    omitTemperature: true,
    homepage: 'https://platform.openai.com/api-keys',
    docsUrl:
      'https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create',
    models: [sample('gpt-4.1-mini')],
  },
  {
    id: 'doubao',
    name: '豆包 / 火山方舟',
    description: '填写模型 ID 或控制台推理接入点 ep-*',
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3/chat/completions',
    protocol: 'openai',
    homepage: 'https://console.volcengine.com/ark',
    docsUrl: 'https://docs.volcengine.com/docs/ark/chat-api?lang=zh',
    models: [sample('doubao-seed-2-1-pro-260915')],
  },
  {
    id: 'qwen',
    name: '通义千问 / 阿里云百炼',
    description: '默认北京旧兼容域名；其他地域请按控制台覆盖',
    baseUrl:
      'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
    protocol: 'openai',
    homepage: 'https://bailian.console.aliyun.com/',
    docsUrl:
      'https://help.aliyun.com/zh/model-studio/compatibility-of-openai-with-dashscope',
    models: [sample('qwen-plus')],
  },
  {
    id: 'moonshot',
    name: 'Kimi / Moonshot',
    description: '默认中国站；国际站需匹配账户地域',
    baseUrl: 'https://api.moonshot.cn/v1/chat/completions',
    protocol: 'openai',
    omitTemperature: true,
    homepage: 'https://platform.moonshot.cn/',
    docsUrl: 'https://platform.kimi.com/docs/api/chat',
    models: [sample('kimi-k3')],
  },
  {
    id: 'zhipu',
    name: '智谱 GLM',
    description: '通用 API，编码套餐可能使用独立地址',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
    protocol: 'openai',
    homepage: 'https://bigmodel.cn/',
    docsUrl: 'https://docs.bigmodel.cn/cn/api/introduction',
    models: [sample('glm-5.3')],
  },
  {
    id: 'gemini',
    name: 'Google Gemini',
    description: 'Gemini 原生 generateContent 协议',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    protocol: 'gemini',
    homepage: 'https://aistudio.google.com/api-keys',
    docsUrl: 'https://ai.google.dev/api/generate-content',
    models: [sample('gemini-3.8-flash')],
  },
  {
    id: 'anthropic',
    name: 'Anthropic Claude',
    description: 'Claude 原生 Messages 协议',
    baseUrl: 'https://api.anthropic.com/v1/messages',
    protocol: 'anthropic',
    omitTemperature: true,
    homepage: 'https://platform.claude.com/',
    docsUrl: 'https://platform.claude.com/docs/en/api/messages/create',
    models: [sample('claude-sonnet-4-6')],
  },
  {
    id: 'ollama',
    name: 'Ollama（本机）',
    description: '先启动本地服务并下载模型；本机地址可免 Key',
    baseUrl: 'http://localhost:11434/v1/chat/completions',
    protocol: 'openai',
    allowEmptyKey: true,
    homepage: 'https://ollama.com/',
    docsUrl: 'https://docs.ollama.com/api/openai-compatibility',
    models: [sample('qwen3:8b')],
  },
  {
    id: 'lmstudio',
    name: 'LM Studio（本机）',
    description: '先启动本地服务器；填写已加载的模型 ID',
    baseUrl: 'http://localhost:1234/v1/chat/completions',
    protocol: 'openai',
    allowEmptyKey: true,
    homepage: 'https://lmstudio.ai/',
    docsUrl: 'https://lmstudio.ai/docs/developer/openai-compat',
    models: [],
  },
  {
    id: 'custom',
    name: '自定义服务',
    description: '填写地址、协议和模型 ID',
    baseUrl: '',
    protocol: 'openai',
    homepage: '',
    docsUrl: '',
    needsCustomUrl: true,
    models: [],
  },
];

export const AI_CONFIG_CHANGED_EVENT = 'lingshu-ai-config-changed';
// Preserve the old key so existing installations can explicitly migrate it.
const STORAGE_KEY = 'npu-user-ai-config';
const SESSION_KEY = 'lingshu-ai-session-key';

function notifyConfigChanged() {
  if (typeof window !== 'undefined')
    window.dispatchEvent(new Event(AI_CONFIG_CHANGED_EVENT));
}
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === STORAGE_KEY || event.key === null) notifyConfigChanged();
  });
}

export function getProviderPreset(id: AIProviderId): ProviderPreset {
  return (
    PROVIDER_PRESETS.find((preset) => preset.id === id) || PROVIDER_PRESETS[0]
  );
}
export function getDefaultConfig(): UserAIConfig {
  const preset = PROVIDER_PRESETS[0];
  return {
    enabled: false,
    provider: preset.id,
    apiKey: '',
    model: preset.models[0]?.id || '',
    customUrl: '',
    protocol: preset.protocol,
    rememberKey: false,
  };
}
function normalizeStoredConfig(value: unknown): UserAIConfig | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  if (typeof record.enabled !== 'boolean') return null;
  const preset = PROVIDER_PRESETS.find(
    (entry) => entry.id.toLowerCase() === String(record.provider).toLowerCase()
  );
  if (!preset) return null;
  const protocol =
    record.protocol === 'anthropic' ||
    record.protocol === 'gemini' ||
    record.protocol === 'openai'
      ? record.protocol
      : preset.protocol;
  return {
    enabled: record.enabled,
    provider: preset.id,
    apiKey: typeof record.apiKey === 'string' ? record.apiKey : '',
    model:
      typeof record.model === 'string'
        ? record.model
        : preset.models[0]?.id || '',
    customUrl:
      preset.id === 'MiniMax' &&
      record.protocol === undefined &&
      !record.customUrl
        ? 'https://api.minimax.chat/v1/chat/completions'
        : typeof record.customUrl === 'string'
          ? record.customUrl
          : '',
    protocol,
    rememberKey: record.rememberKey === true,
  };
}
export function isLoopbackUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      (url.protocol === 'http:' || url.protocol === 'https:') &&
      (url.hostname === 'localhost' ||
        url.hostname === '[::1]' ||
        /^127\./.test(url.hostname))
    );
  } catch {
    return false;
  }
}
export function resolveUserAIUrl(config: UserAIConfig): string {
  const preset = getProviderPreset(config.provider);
  const raw = config.customUrl?.trim() || preset.baseUrl;
  if (!raw) return '';
  return normalizeAIEndpoint(
    raw,
    config.protocol || preset.protocol,
    config.model.trim() || 'model-not-set'
  );
}
export function hasLegacyPersistedAIKey(): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const value = raw ? JSON.parse(raw) : null;
    return (
      typeof value?.apiKey === 'string' &&
      !!value.apiKey &&
      value.rememberKey !== true
    );
  } catch {
    return false;
  }
}
export function loadUserAIConfig(): UserAIConfig | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const config = normalizeStoredConfig(JSON.parse(raw));
    if (!config) return null;
    // An old local key remains readable until the user explicitly saves/clears it.
    if (config.apiKey) return config;
    try {
      const sessionRaw = sessionStorage.getItem(SESSION_KEY);
      if (sessionRaw) {
        const session = JSON.parse(sessionRaw);
        if (
          session?.provider === config.provider &&
          session.endpoint === resolveUserAIUrl(config) &&
          typeof session.apiKey === 'string'
        ) {
          config.apiKey = session.apiKey;
        }
      }
    } catch {
      /* Keep saved OFF/local preferences even if session storage is unavailable. */
    }
    return config;
  } catch {
    return null;
  }
}

export function saveUserAIConfig(config: UserAIConfig): void {
  const normalized = normalizeStoredConfig(config);
  if (!normalized) throw new Error('AI 配置格式无效，未保存。');
  const endpoint = resolveUserAIUrl(normalized);
  let previousLocal: string | null;
  let previousSession: string | null;
  try {
    previousLocal = localStorage.getItem(STORAGE_KEY);
    previousSession = sessionStorage.getItem(SESSION_KEY);
  } catch {
    throw new Error('浏览器不允许读取存储，AI 配置未保存。');
  }
  try {
    if (normalized.rememberKey) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
      sessionStorage.removeItem(SESSION_KEY);
    } else {
      if (normalized.apiKey)
        sessionStorage.setItem(
          SESSION_KEY,
          JSON.stringify({
            provider: normalized.provider,
            endpoint,
            apiKey: normalized.apiKey,
          })
        );
      else sessionStorage.removeItem(SESSION_KEY);
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ ...normalized, apiKey: '' })
      );
    }
  } catch {
    // Best-effort rollback; never report a successful save after a storage failure.
    try {
      if (previousLocal === null) localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, previousLocal);
    } catch {
      /* Storage may remain unavailable. */
    }
    try {
      if (previousSession === null) sessionStorage.removeItem(SESSION_KEY);
      else sessionStorage.setItem(SESSION_KEY, previousSession);
    } catch {
      /* Storage may remain unavailable. */
    }
    notifyConfigChanged();
    throw new Error(
      '浏览器存储失败，无法确认配置已保存。请检查存储权限后重试。'
    );
  }
  notifyConfigChanged();
}
export function clearUserAIConfig(): void {
  let failed = false;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    failed = true;
  }
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    failed = true;
  }
  notifyConfigChanged();
  if (failed) throw new Error('部分浏览器存储无法清除，请检查存储权限后重试。');
}
export function maskApiKey(key: string): string {
  return key ? '••••••••' : '';
}
