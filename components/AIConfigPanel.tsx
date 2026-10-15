/**
 * AI 配置面板（普通用户级）
 *
 * 让玩家在游戏里自己配置 AI 服务，而不需要动环境变量：
 * - 开关：启用 / 关闭 AI（关闭时所有事件走本地模板，零成本）
 * - Provider：选择服务商（SiliconFlow / OpenAI / 豆包 / 自定义）
 * - 模型：根据 provider 自动出可选模型
 * - API Key：用户自己的 key，只存浏览器 localStorage，不上传
 *
 * 为什么是普通用户级别：
 * - 之前依赖 VITE_AI_KEY 环境变量，只有开发者能配
 * - 现在把 AI 配置降到 UI 面板，谁都能用、谁都能关
 * - 默认关闭 → 局域网多人玩 / 公网部署都零成本（不会因为别人开了 AI 把额度打光）
 */

import React, { useState, useEffect } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Brain,
  Key,
  ExternalLink,
  Trash2,
  CheckCircle2,
  XCircle,
  Eye,
  EyeOff,
  Zap,
  Loader2,
} from 'lucide-react';
import {
  PROVIDER_PRESETS,
  loadUserAIConfig,
  saveUserAIConfig,
  clearUserAIConfig,
  getDefaultConfig,
  getProviderPreset,
  maskApiKey,
  UserAIConfig,
} from '../config/userAIConfig';

interface AIConfigPanelProps {
  /** 是否默认折叠（首页里默认折叠，避免干扰主流程） */
  defaultCollapsed?: boolean;
}

const AIConfigPanel: React.FC<AIConfigPanelProps> = ({
  defaultCollapsed = true,
}) => {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const [config, setConfig] = useState<UserAIConfig>(() => {
    const saved = loadUserAIConfig();
    return saved || getDefaultConfig();
  });
  const [showKey, setShowKey] = useState(false);
  const [savedToast, setSavedToast] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<
    { ok: boolean; msg: string; reply?: string } | null
  >(null);

  // 配置切换 provider 时，自动切到该 provider 的默认模型
  useEffect(() => {
    setConfig((current) => {
      const preset = getProviderPreset(current.provider);
      // 只在 provider 切换时校正模型，保留自定义模型输入。
      const modelExists = preset.models.some((m) => m.id === current.model);
      if (modelExists || preset.models.length === 0) return current;
      return {
        ...current,
        model: preset.models[0].id,
      };
    });
  }, [config.provider]);

  const handleSave = () => {
    saveUserAIConfig(config);
    setSavedToast('已保存');
    setTimeout(() => setSavedToast(null), 1500);
  };

  const handleClear = () => {
    if (!window.confirm('确定清除已保存的 AI 配置吗？清除后将回到本地模式。')) return;
    clearUserAIConfig();
    setConfig(getDefaultConfig());
    setSavedToast('已清除');
    setTimeout(() => setSavedToast(null), 1500);
  };

  // 测试连接：用当前表单（未保存）的配置跑一次最小化请求
  // 用 state 而不是 localStorage，让用户填完 key 不必先保存就能验证
  const handleTest = async () => {
    setTestResult(null);

    if (!config.apiKey.trim()) {
      setTestResult({ ok: false, msg: '请先填 API Key' });
      return;
    }
    if (config.provider === 'custom' && !(config.customUrl || '').trim()) {
      setTestResult({ ok: false, msg: '自定义 provider 需要填 URL' });
      return;
    }
    if (!config.model.trim()) {
      setTestResult({ ok: false, msg: '请先选模型' });
      return;
    }

    const preset = getProviderPreset(config.provider);
    const url =
      config.provider === 'custom'
        ? (config.customUrl || '').trim()
        : preset.baseUrl;

    setTesting(true);
    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.apiKey.trim()}`,
        },
        body: JSON.stringify({
          model: config.model.trim(),
          messages: [{ role: 'user', content: '回复一个字：OK' }],
          max_tokens: 10,
          temperature: 0,
        }),
      });

      if (!resp.ok) {
        const text = await resp.text().catch(() => '');
        let detail = text.slice(0, 200);
        try {
          const j = JSON.parse(text);
          detail = j.error?.message || j.message || detail;
        } catch {
          /* 不是 JSON，原样显示 */
        }
        let hint = '';
        if (resp.status === 401) hint = '（API Key 无效或被吊销）';
        else if (resp.status === 403) hint = '（可能被地域限制或账户欠费）';
        else if (resp.status === 404) hint = '（API 地址或模型名错误）';
        else if (resp.status === 429) hint = '（请求过快或额度耗尽）';
        setTestResult({
          ok: false,
          msg: `HTTP ${resp.status} ${hint} ${detail ? '· ' + detail : ''}`.trim(),
        });
        return;
      }

      const data = await resp.json().catch(() => null);
      const reply =
        data?.choices?.[0]?.message?.content?.toString?.()?.trim?.() || '';
      setTestResult({
        ok: true,
        msg: '连接成功',
        reply: reply ? `模型回复："${reply.slice(0, 40)}"` : '',
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // 浏览器跨域错误通常是 TypeError: Failed to fetch
      const isCors =
        msg.toLowerCase().includes('failed to fetch') ||
        msg.toLowerCase().includes('networkerror');
      setTestResult({
        ok: false,
        msg: isCors
          ? `网络/CORS 错误：浏览器拦截了跨域请求。OpenAI 等海外服务直连会被拦截，需要配 Vite 代理或中转。`
          : `请求失败：${msg}`,
      });
    } finally {
      setTesting(false);
    }
  };

  const preset = getProviderPreset(config.provider);
  const currentModelLabel =
    preset.models.find((m) => m.id === config.model)?.label || config.model;

  // 校验
  const canSave =
    !config.enabled ||
    (config.apiKey.trim() !== '' &&
      config.model.trim() !== '' &&
      (config.provider !== 'custom' || (config.customUrl || '').trim() !== ''));

  return (
    <div className="bg-npu-panel border border-npu-border">
      {/* 折叠头部 —— 显示当前状态 */}
      <button
        onClick={() => setCollapsed((c) => !c)}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-npu-bg transition-colors"
      >
        <div className="flex items-center gap-2 text-sm font-mono">
          <Brain size={14} className="text-npu-code" />
          <span className="text-npu-dim">AI 模式</span>
          {config.enabled && config.apiKey ? (
            <span className="flex items-center gap-1 text-npu-code">
              <CheckCircle2 size={12} />
              已启用
            </span>
          ) : (
            <span className="flex items-center gap-1 text-npu-muted">
              <XCircle size={12} />
              本地模式（默认）
            </span>
          )}
          {config.enabled && config.apiKey && (
            <span className="text-npu-muted text-xs">
              · {preset.name.split('（')[0]} · {currentModelLabel}
            </span>
          )}
        </div>
        {collapsed ? (
          <ChevronDown size={16} className="text-npu-dim" />
        ) : (
          <ChevronUp size={16} className="text-npu-dim" />
        )}
      </button>

      {!collapsed && (
        <div className="px-4 pb-4 border-t border-npu-border space-y-4 font-mono text-sm">
          {/* 提示 */}
          <p className="text-[10px] text-npu-muted pt-3">
            {'// AI 用于生成校园事件描述（每次约 0.001-0.01 元）。关闭后走本地模板， '}
            {'// 零成本、可离线、永远不会打光额度。配置仅存浏览器 localStorage。'}
          </p>

          {/* 启用开关 */}
          <label className="flex items-center justify-between cursor-pointer">
            <span className="text-npu-text">启用 AI 模式</span>
            <button
              type="button"
              onClick={() => setConfig((c) => ({ ...c, enabled: !c.enabled }))}
              className={[
                'w-12 h-6 border transition-colors relative',
                config.enabled
                  ? 'bg-npu-code border-npu-code'
                  : 'bg-npu-bg border-npu-border',
              ].join(' ')}
            >
              <span
                className={[
                  'absolute top-0.5 w-4 h-4 transition-all',
                  config.enabled
                    ? 'left-7 bg-npu-bg'
                    : 'left-1 bg-npu-muted',
                ].join(' ')}
              />
            </button>
          </label>

          {/* Provider 选择 */}
          <div>
            <label className="block text-npu-dim text-xs mb-1.5">
              服务商
            </label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {PROVIDER_PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() =>
                    setConfig((c) => ({
                      ...c,
                      provider: p.id,
                      model: p.models[0]?.id || '',
                    }))
                  }
                  className={[
                    'text-left p-2 border transition-colors',
                    config.provider === p.id
                      ? 'border-npu-code bg-npu-code/10'
                      : 'border-npu-border hover:border-npu-ink-light',
                  ].join(' ')}
                >
                  <div className="text-xs font-bold text-npu-text">
                    {p.name}
                  </div>
                  <div className="text-[10px] text-npu-muted mt-0.5">
                    {p.description}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* 模型选择 */}
          <div>
            <label className="block text-npu-dim text-xs mb-1.5">
              模型
            </label>
            {preset.needsCustomUrl && (
              <input
                type="url"
                placeholder="API 完整地址，如 https://api.openai.com/v1/chat/completions"
                value={config.customUrl || ''}
                onChange={(e) =>
                  setConfig((c) => ({ ...c, customUrl: e.target.value }))
                }
                className="w-full px-3 py-2 mb-2 bg-npu-bg border border-npu-border text-npu-text text-xs"
              />
            )}
            <select
              value={config.model}
              onChange={(e) =>
                setConfig((c) => ({ ...c, model: e.target.value }))
              }
              className="w-full px-3 py-2 bg-npu-bg border border-npu-border text-npu-text"
            >
              {preset.models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
            {(() => {
              const cur = preset.models.find((m) => m.id === config.model);
              return cur ? (
                <p className="text-[10px] text-npu-muted mt-1">
                  {'// '}{cur.description}
                </p>
              ) : null;
            })()}
          </div>

          {/* API Key 输入 */}
          <div>
            <label className="block text-npu-dim text-xs mb-1.5">
              <Key size={10} className="inline mr-1" />
              API Key
            </label>
            <div className="relative">
              <input
                type={showKey ? 'text' : 'password'}
                placeholder="sk-..."
                value={config.apiKey}
                onChange={(e) =>
                  setConfig((c) => ({ ...c, apiKey: e.target.value }))
                }
                className="w-full px-3 py-2 pr-10 bg-npu-bg border border-npu-border text-npu-text"
                autoComplete="off"
                spellCheck={false}
              />
              <button
                type="button"
                onClick={() => setShowKey((s) => !s)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-npu-muted hover:text-npu-text p-1"
                title={showKey ? '隐藏' : '显示'}
              >
                {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
            {config.apiKey && !showKey && (
              <p className="text-[10px] text-npu-muted mt-1">
                当前已填：{maskApiKey(config.apiKey)}
              </p>
            )}
            {preset.homepage && (
              <a
                href={preset.homepage}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[10px] text-npu-code hover:underline mt-1"
              >
                没有 key？去 {preset.name.split('（')[0]} 申请
                <ExternalLink size={10} />
              </a>
            )}

            {/* 测试连接 */}
            <div className="pt-2">
              <button
                type="button"
                onClick={handleTest}
                disabled={testing || !config.apiKey.trim() || !config.model.trim()}
                className={[
                  'w-full px-3 py-2 border flex items-center justify-center gap-2 transition-colors',
                  testing || !config.apiKey.trim() || !config.model.trim()
                    ? 'border-npu-border text-npu-muted cursor-not-allowed'
                    : 'border-npu-code text-npu-code hover:bg-npu-code hover:text-npu-bg',
                ].join(' ')}
              >
                {testing ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    测试中...
                  </>
                ) : (
                  <>
                    <Zap size={14} />
                    测试连接
                  </>
                )}
              </button>

              {testResult && (
                <div
                  className={[
                    'mt-2 px-3 py-2 text-xs border font-mono',
                    testResult.ok
                      ? 'border-npu-code text-npu-code bg-npu-code/5'
                      : 'border-npu-warn text-npu-warn bg-npu-warn/5',
                  ].join(' ')}
                >
                  <div className="flex items-start gap-1.5">
                    {testResult.ok ? (
                      <CheckCircle2 size={14} className="shrink-0 mt-0.5" />
                    ) : (
                      <XCircle size={14} className="shrink-0 mt-0.5" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="font-bold">{testResult.msg}</div>
                      {testResult.reply && (
                        <div className="text-npu-dim mt-0.5 break-all">
                          {testResult.reply}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* 操作按钮 */}
          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={!canSave}
              className={[
                'flex-1 px-4 py-2 font-bold transition-colors',
                canSave
                  ? 'bg-npu-code text-npu-bg hover:bg-npu-ink-light'
                  : 'bg-npu-bg border border-npu-border text-npu-muted cursor-not-allowed',
              ].join(' ')}
            >
              保存配置
            </button>
            <button
              type="button"
              onClick={handleClear}
              className="px-3 py-2 border border-npu-border text-npu-dim hover:border-npu-warn hover:text-npu-warn"
              title="清除已保存的配置"
            >
              <Trash2 size={14} />
            </button>
          </div>

          {savedToast && (
            <p className="text-xs text-npu-code text-center">{savedToast}</p>
          )}

          {!canSave && config.enabled && (
            <p className="text-[10px] text-npu-warn">
              ⚠ 配置不完整：API Key 和模型是必填项
              {config.provider === 'custom' && '，自定义 URL 也是必填'}
            </p>
          )}
        </div>
      )}
    </div>
  );
};

export default AIConfigPanel;
