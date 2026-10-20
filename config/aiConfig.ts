import {
  loadUserAIConfig,
  getProviderPreset,
  resolveUserAIUrl,
  isLoopbackUrl,
  type UserAIConfig,
  type AIProviderId,
  type AIProtocol,
  type AITokenParameter,
} from './userAIConfig';
import { normalizeAIEndpoint } from '../services/ai/client';

export type AIProvider = AIProviderId;
export interface AIConfig {
  provider: AIProvider;
  apiKey: string;
  apiUrl: string;
  model: string;
  enabled: boolean;
  protocol: AIProtocol;
  tokenParameter?: AITokenParameter;
  omitTemperature?: boolean;
  useProxy: boolean;
  proxyPath?: string;
}

/** Drafts and saved configuration use the identical provider/URL resolution path. */
export function resolveUserAIConfig(config: UserAIConfig): AIConfig {
  const preset = getProviderPreset(config.provider);
  let apiUrl = '';
  try {
    apiUrl = resolveUserAIUrl(config);
  } catch {
    /* Validation below reports invalid URL without exposing input/key. */
  }
  return {
    provider: config.provider,
    apiKey: config.apiKey.trim(),
    apiUrl,
    model: config.model.trim(),
    enabled: config.enabled,
    protocol: config.protocol || preset.protocol,
    tokenParameter: preset.tokenParameter,
    omitTemperature: preset.omitTemperature,
    useProxy: false,
  };
}
export function getAIConfig(): AIConfig {
  const saved = loadUserAIConfig();
  // A saved OFF choice always wins over environment fallback.
  if (saved) return resolveUserAIConfig(saved);
  const env = import.meta.env;
  const provider = (env.VITE_AI_PROVIDER || 'siliconflow') as AIProviderId;
  const preset = getProviderPreset(provider);
  const config = resolveUserAIConfig({
    enabled: false,
    provider: preset.id,
    apiKey: env.VITE_AI_KEY || '',
    model: env.VITE_AI_MODEL || preset.models[0]?.id || '',
    customUrl: env.VITE_AI_API_URL || '',
    protocol: preset.protocol,
  });
  if (env.VITE_AI_USE_PROXY === 'true') {
    config.apiUrl = env.VITE_AI_API_URL || '/api/v1/chat/completions';
    config.useProxy = true;
  }
  return config;
}
export function validateAIConfig(config: AIConfig): {
  valid: boolean;
  error?: string;
} {
  if (!config.enabled)
    return { valid: false, error: 'AI 模式未启用；当前使用本地文案。' };
  if (!config.apiUrl)
    return {
      valid: false,
      error:
        'API 地址无效。请填写 http/https Base URL 或完整接口地址，密钥应单独填写。',
    };
  if (!config.model) return { valid: false, error: '请填写你的模型 ID。' };
  try {
    normalizeAIEndpoint(
      config.apiUrl,
      config.protocol || 'openai',
      config.model
    );
  } catch {
    return {
      valid: false,
      error: 'API 地址或模型无效；远程服务需使用 HTTPS，密钥请单独填写。',
    };
  }
  if (!config.apiKey && !isLoopbackUrl(config.apiUrl))
    return {
      valid: false,
      error: '远程服务需要 API Key；仅本机 loopback 地址允许留空。',
    };
  return { valid: true };
}
export function getAIConfigInfo(): string {
  const config = getAIConfig();
  let host = '未配置';
  try {
    host = new URL(config.apiUrl).host;
  } catch {
    /* Never include raw URL/query in logs. */
  }
  const validation = validateAIConfig(config);
  return [
    'AI 服务配置:',
    '提供商: ' + config.provider,
    '目标主机: ' + host,
    '协议: ' + config.protocol,
    '模型: ' + config.model,
    'API Key: ' + (config.apiKey ? '已设置' : '未设置'),
    '配置状态: ' + (validation.valid ? '可用' : validation.error),
  ].join('\n');
}
