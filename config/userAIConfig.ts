/**
 * 用户级 AI 配置（运行时 localStorage 持久化）
 *
 * 为什么需要这个模块：
 * - 项目原本依赖环境变量 VITE_AI_KEY 配 AI，但环境变量是开发者级别，普通玩家配不了
 * - 现在把 AI 配置降到"普通用户级别"：在首页开个面板，让玩家自己填 API Key、选模型
 * - 配置存 localStorage（每个玩家浏览器独立，不污染、不共享）
 * - 想用 AI → 开开关、选 provider、填 key，三个动作搞定
 * - 不想用 AI → 默认关闭，全走本地模板（utils/localEvents.ts），零成本可离线玩
 *
 * 工作流：
 * - aiConfig.ts 的 getAIConfig() 优先读这里（loadUserAIConfig），没设置回退到环境变量
 * - aiService.ts 每次 AI 调用前重新 getAIConfig()，实现运行时切换
 */

export type AIProviderId = 'siliconflow' | 'deepseek' | 'MiniMax' | 'openai' | 'doubao' | 'custom';

export interface UserAIConfig {
  enabled: boolean;            // 是否启用 AI（默认 false）
  provider: AIProviderId;      // 服务商
  apiKey: string;              // 用户的 API Key
  model: string;               // 模型 ID
  customUrl?: string;          // 仅 custom provider 用：API base URL
}

const STORAGE_KEY = 'npu-user-ai-config';

// ========================================================================
// 预设 provider 和模型
// ========================================================================
// 设计原则：每个 provider 给 3-5 个常见模型，覆盖主流档位
// - 旗舰档：贵/慢/强（如 Qwen2.5-72B / GPT-4o / DeepSeek-V3）
// - 性价比档：便宜/快/够用（如 Qwen2.5-7B / GPT-4o-mini / DeepSeek-V2.5）
// - 长文本档：窗口大（如 Qwen2.5-72B 都支持长上下文）
// ========================================================================

export interface ProviderPreset {
  id: AIProviderId;
  name: string;
  description: string;       // 给用户看的简介
  baseUrl: string;           // API 完整地址（chat/completions）
  homepage: string;          // 控制台/注册地址
  models: Array<{
    id: string;
    label: string;           // 给用户看的中文名
    description: string;     // 简短描述（速度/质量/价格）
  }>;
  needsCustomUrl?: boolean;  // 是否需要用户填 URL（custom 时为 true）
}

export const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    id: 'siliconflow',
    name: 'SiliconFlow（硅基流动）',
    description: '国内服务商，注册送额度，Qwen/DeepSeek/GLM 齐全',
    baseUrl: 'https://api.siliconflow.cn/v1/chat/completions',
    homepage: 'https://cloud.siliconflow.cn/account/apiKey',
    models: [
      { id: 'Qwen/Qwen2.5-72B-Instruct',         label: 'Qwen 2.5 72B（旗舰）',  description: '中文最强、逻辑强、价格中等' },
      { id: 'Qwen/Qwen2.5-32B-Instruct',         label: 'Qwen 2.5 32B（性价比）',description: '速度快、价格便宜、够用' },
      { id: 'Qwen/Qwen2.5-7B-Instruct',          label: 'Qwen 2.5 7B（最快）',     description: '超便宜、速度快、质量一般' },
      { id: 'deepseek-ai/DeepSeek-V3',           label: 'DeepSeek V3',           description: '综合强、价格低，长文本友好' },
      { id: 'deepseek-ai/DeepSeek-V2.5',         label: 'DeepSeek V2.5',         description: '老款便宜' },
    ],
  },
  {
    id: 'deepseek',
    name: 'DeepSeek（深度求索）',
    description: 'DeepSeek 官方 API，国内直连，便宜量大，中文强',
    baseUrl: 'https://api.deepseek.com/v1/chat/completions',
    homepage: 'https://platform.deepseek.com/api_keys',
    models: [
      { id: 'deepseek-chat',     label: 'DeepSeek-V3（deepseek-chat）',   description: '官方旗舰，对话综合最强' },
      { id: 'deepseek-reasoner', label: 'DeepSeek-R1（reasoner）',         description: '深度推理，长思考链，逻辑最强' },
      { id: 'deepseek-coder',    label: 'DeepSeek-Coder',                 description: '代码专用（已合并入 V3）' },
    ],
  },
  {
    id: 'MiniMax',
    name: 'MiniMax（MiniMax）',
    description: 'MiniMax 官方 API，国内直连，长文本友好',
    baseUrl: 'https://api.MiniMax.chat/v1/chat/completions',
    homepage: 'https://platform.MiniMax.cn/user-center/basic-information/interface-key',
    models: [
      { id: 'MiniMax-Text-01',         label: 'MiniMax Text-01',           description: '旗舰长文本，200k 上下文' },
      { id: 'MiniMax-32k',             label: 'MiniMax 32k',               description: '性价比，长文本' },
      { id: 'MiniMax-VL-01',           label: 'MiniMax VL-01',             description: '多模态（图+文），本游戏用不到' },
      { id: 'MiniMax-M1',              label: 'MiniMax M1',                description: '推理增强版' },
    ],
  },
  {
    id: 'openai',
    name: 'OpenAI',
    description: 'GPT 系列，需要海外卡/魔法',
    baseUrl: 'https://api.openai.com/v1/chat/completions',
    homepage: 'https://platform.openai.com/api-keys',
    models: [
      { id: 'gpt-4o',             label: 'GPT-4o（旗舰）',     description: '最强、最贵' },
      { id: 'gpt-4o-mini',        label: 'GPT-4o mini（性价比）',description: '便宜够用，速度快' },
      { id: 'gpt-3.5-turbo',      label: 'GPT-3.5 Turbo（最便宜）',description: '快但中文一般' },
    ],
  },
  {
    id: 'doubao',
    name: '豆包（字节火山）',
    description: '字节豆包，国内便宜',
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3/chat/completions',
    homepage: 'https://www.volcengine.com/product/doubao',
    models: [
      { id: 'doubao-pro-32k',         label: '豆包 Pro 32k',     description: '综合强' },
      { id: 'doubao-pro-256k',        label: '豆包 Pro 256k',    description: '超长文本' },
      { id: 'doubao-lite-32k',        label: '豆包 Lite 32k',    description: '便宜够用' },
    ],
  },
  {
    id: 'custom',
    name: '自定义（兼容 OpenAI 协议）',
    description: '任何兼容 OpenAI chat/completions 的服务（中转站、本地 Ollama、LM Studio 等）',
    baseUrl: '',
    homepage: '',
    needsCustomUrl: true,
    models: [
      { id: '', label: '自定义模型 ID', description: '填入服务商给你的模型名' },
    ],
  },
];

// ========================================================================
// localStorage 读写
// ========================================================================

export function loadUserAIConfig(): UserAIConfig | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // 简单校验
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof parsed.enabled === 'boolean'
    ) {
      return parsed as UserAIConfig;
    }
    return null;
  } catch {
    return null;
  }
}

export function saveUserAIConfig(config: UserAIConfig): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch (e) {
    console.error('保存 AI 配置失败:', e);
  }
}

export function clearUserAIConfig(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (e) {
    console.error('清除 AI 配置失败:', e);
  }
}

// ========================================================================
// 辅助函数
// ========================================================================

export function getDefaultConfig(): UserAIConfig {
  return {
    enabled: false,
    provider: 'siliconflow',
    apiKey: '',
    model: 'Qwen/Qwen2.5-72B-Instruct',
    customUrl: '',
  };
}

export function getProviderPreset(id: AIProviderId): ProviderPreset {
  return PROVIDER_PRESETS.find((p) => p.id === id) || PROVIDER_PRESETS[0];
}

// 遮蔽 API Key（只显示前 4 后 4）
export function maskApiKey(key: string): string {
  if (!key) return '';
  if (key.length <= 8) return '****';
  return `${key.slice(0, 4)}...${key.slice(-4)}`;
}