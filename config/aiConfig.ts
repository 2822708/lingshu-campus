/**
 * 校园事件生成器 AI 服务配置
 *
 * 配置来源（按优先级）：
 * 1. 用户运行时配置（config/userAIConfig.ts 持久化的 localStorage）
 *    —— 用户在首页"AI 设置"面板里填的，普通玩家也配得了
 * 2. 兜底：环境变量 VITE_AI_KEY / VITE_AI_API_URL / VITE_AI_MODEL
 *    —— 给开发者本地 dev 用的，不影响其他人
 *
 * 重要：AI 模式默认关闭（enabled=false），所有 AI 调用自动降级到本地模板
 * （utils/localEvents.ts），局域网多人玩 / 公网部署都零成本。
 */

import {
  loadUserAIConfig,
  getProviderPreset,
  AIProviderId,
} from './userAIConfig';

export type AIProvider = AIProviderId | 'siliconflow' | 'openai' | 'custom';

export interface AIConfig {
  provider: AIProvider;
  apiKey: string;
  apiUrl: string;
  model: string;
  useProxy: boolean; // 是否使用 Vite 代理（仅本地 dev）
  proxyPath?: string;
  enabled: boolean;  // 用户是否在面板里打开了 AI 开关
}

/**
 * 获取 AI 配置（每次调用都重新读，以支持运行时切换）
 *
 * 注意：故意不做模块级缓存 —— 用户在面板里改了设置后，下次 AI 调用立即生效。
 */
export function getAIConfig(): AIConfig {
  // ===== 第一优先级：用户运行时配置 =====
  const userCfg = loadUserAIConfig();
  if (userCfg && userCfg.enabled && userCfg.apiKey) {
    const preset = getProviderPreset(userCfg.provider);
    const apiUrl =
      userCfg.provider === 'custom'
        ? userCfg.customUrl || ''
        : preset.baseUrl;

    return {
      provider: userCfg.provider,
      apiKey: userCfg.apiKey,
      apiUrl,
      model: userCfg.model,
      useProxy: false, // 用户配的 key 直连，不走 Vite 代理
      enabled: true,
    };
  }

  // ===== 第二优先级：环境变量（开发者本地 dev） =====
  // 没有用户配置 / 用户没启用 / 没填 key → 返回空 apiKey → aiService 自动本地降级
  const provider = (import.meta.env.VITE_AI_PROVIDER ||
    'siliconflow') as AIProvider;
  const apiKey = import.meta.env.VITE_AI_KEY || '';
  const customApiUrl = import.meta.env.VITE_AI_API_URL;
  const customModel = import.meta.env.VITE_AI_MODEL;
  const proxyPreference = import.meta.env.VITE_AI_USE_PROXY;

  // 兜底 URL 表（兼容旧版 env 配置）
  const FALLBACK_URLS: Record<string, string> = {
    siliconflow: 'https://api.siliconflow.cn/v1/chat/completions',
    deepseek:    'https://api.deepseek.com/v1/chat/completions',
    MiniMax:     'https://api.MiniMax.chat/v1/chat/completions',
    openai:      'https://api.openai.com/v1/chat/completions',
    doubao:      'https://ark.cn-beijing.volces.com/api/v3/chat/completions',
    custom:      '',
  };
  const FALLBACK_MODELS: Record<string, string> = {
    siliconflow: 'Qwen/Qwen2.5-72B-Instruct',
    deepseek:    'deepseek-chat',
    MiniMax:     'MiniMax-Text-01',
    openai:      'gpt-3.5-turbo',
    doubao:      'doubao-pro-32k',
    custom:      '',
  };

  const apiUrl = customApiUrl || FALLBACK_URLS[provider] || '';
  const model = customModel || FALLBACK_MODELS[provider] || '';

  const shouldUseProxy = proxyPreference === 'true';
  const finalApiUrl = customApiUrl
    ? customApiUrl
    : shouldUseProxy
      ? '/api/v1/chat/completions'
      : apiUrl;

  return {
    provider,
    apiKey,
    apiUrl: finalApiUrl,
    model,
    useProxy: shouldUseProxy,
    enabled: false, // env 模式不算用户主动启用
  };
}

/**
 * 验证配置
 */
export function validateAIConfig(config: AIConfig): {
  valid: boolean;
  error?: string;
} {
  if (!config.enabled) {
    return {
      valid: false,
      error: 'AI 模式未启用。请在首页"AI 设置"面板里打开开关。',
    };
  }
  if (!config.apiKey) {
    return {
      valid: false,
      error: '未配置 API Key。请在首页"AI 设置"面板里填写。',
    };
  }
  if (!config.apiUrl) {
    return {
      valid: false,
      error: 'API URL 未配置。请检查 provider 设置。',
    };
  }
  if (!config.model) {
    return {
      valid: false,
      error: 'AI 模型未配置。请选择一个模型。',
    };
  }
  return { valid: true };
}

/**
 * 获取配置信息（用于调试 / 日志）
 */
export function getAIConfigInfo(): string {
  const config = getAIConfig();
  const validation = validateAIConfig(config);

  return `
AI 服务配置:
- 来源: ${config.enabled ? '用户配置' : '环境变量 / 默认'}
- 提供商: ${config.provider}
- API URL: ${config.apiUrl}
- 模型: ${config.model}
- 使用代理: ${config.useProxy}
- API Key: ${config.apiKey ? '已设置' : '未设置'}
- 配置状态: ${validation.valid ? '✅ 有效' : '❌ 无效'}
${validation.error ? `- 错误: ${validation.error}` : ''}
  `.trim();
}