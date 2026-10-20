import React, { useState, useEffect, useRef, useCallback, useId } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Brain,
  Eye,
  EyeOff,
  ExternalLink,
  Loader2,
} from 'lucide-react';
import {
  PROVIDER_PRESETS,
  loadUserAIConfig,
  saveUserAIConfig,
  clearUserAIConfig,
  getDefaultConfig,
  getProviderPreset,
  hasLegacyPersistedAIKey,
  resolveUserAIUrl,
  isLoopbackUrl,
  type UserAIConfig,
  type AIProtocol,
  type AIProviderId,
} from '../config/userAIConfig';
import { resolveUserAIConfig, validateAIConfig } from '../config/aiConfig';
import { testAIConnection } from '../services/ai/runtime';

interface AIConfigPanelProps {
  defaultCollapsed?: boolean;
}
type ConnectionResult = { ok: boolean; message: string; latencyMs?: number };
const sameConfig = (a: UserAIConfig, b: UserAIConfig) =>
  JSON.stringify(a) === JSON.stringify(b);
function validationFor(config: UserAIConfig) {
  return validateAIConfig(resolveUserAIConfig({ ...config, enabled: true }));
}

const AIConfigPanel: React.FC<AIConfigPanelProps> = ({
  defaultCollapsed = true,
}) => {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const [saved, setSaved] = useState<UserAIConfig | null>(() =>
    loadUserAIConfig()
  );
  const [draft, setDraft] = useState<UserAIConfig>(() =>
    saved ? { ...saved } : getDefaultConfig()
  );
  const savedRef = useRef(saved);
  const requestRef = useRef<AbortController | null>(null);
  const [legacyKey, setLegacyKey] = useState(() => hasLegacyPersistedAIKey());
  const [showKey, setShowKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<ConnectionResult | null>(null);
  const [feedback, setFeedback] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);
  const fieldId = useId();
  const cancelTest = useCallback(() => {
    requestRef.current?.abort();
    requestRef.current = null;
    setTesting(false);
  }, []);

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== 'npu-user-ai-config' && event.key !== null) return;
      cancelTest();
      setTestResult(null);
      const previous = savedRef.current || getDefaultConfig();
      const next = loadUserAIConfig();
      setDraft((current) =>
        sameConfig(current, previous)
          ? { ...(next || getDefaultConfig()) }
          : current
      );
      savedRef.current = next;
      setSaved(next);
      setLegacyKey(hasLegacyPersistedAIKey());
      setFeedback({
        ok: true,
        message: '另一个页面已更改保存配置；未保存的草稿不会自动生效。',
      });
    };
    window.addEventListener('storage', handleStorage);
    return () => {
      window.removeEventListener('storage', handleStorage);
      requestRef.current?.abort();
      requestRef.current = null;
    };
  }, [cancelTest]);

  const updateDraft = (update: Partial<UserAIConfig>) => {
    cancelTest();
    setTestResult(null);
    setFeedback(null);
    setDraft((current) => ({ ...current, ...update }));
  };
  const selectProvider = (provider: AIProviderId) => {
    if (provider === draft.provider) return;
    const next = getProviderPreset(provider);
    updateDraft({
      provider,
      apiKey: '',
      customUrl: '',
      protocol: next.protocol,
      model: next.models[0]?.id || '',
      rememberKey: false,
    });
    setShowKey(false);
  };
  const handleSave = () => {
    cancelTest();
    setFeedback(null);
    if (draft.enabled && !validationFor(draft).valid) {
      setFeedback({
        ok: false,
        message: validationFor(draft).error || '请检查配置。',
      });
      return;
    }
    const next = {
      ...draft,
      apiKey: draft.apiKey.trim(),
      model: draft.model.trim(),
      customUrl: draft.customUrl?.trim() || '',
      rememberKey: draft.rememberKey === true,
    };
    try {
      saveUserAIConfig(next);
      savedRef.current = next;
      setSaved(next);
      setDraft(next);
      setLegacyKey(false);
      setFeedback({
        ok: true,
        message: next.enabled
          ? '已保存。后续 AI 请求使用这份配置。'
          : '已保存为本地文案模式。',
      });
    } catch (error) {
      const actual = loadUserAIConfig();
      savedRef.current = actual;
      setSaved(actual);
      setLegacyKey(hasLegacyPersistedAIKey());
      setFeedback({
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : '保存失败，请检查浏览器存储权限。',
      });
    }
  };
  const handleClear = () => {
    if (!window.confirm('清除保存配置和密钥，并回到本地文案模式？')) return;
    cancelTest();
    setTestResult(null);
    try {
      clearUserAIConfig();
      savedRef.current = null;
      setSaved(null);
      setDraft(getDefaultConfig());
      setLegacyKey(false);
      setShowKey(false);
      setFeedback({
        ok: true,
        message: '已清除配置及密钥。当前使用本地文案。',
      });
    } catch (error) {
      const actual = loadUserAIConfig();
      savedRef.current = actual;
      setSaved(actual);
      setLegacyKey(hasLegacyPersistedAIKey());
      setFeedback({
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : '清除失败，请检查浏览器存储权限。',
      });
    }
  };
  const handleTest = async () => {
    cancelTest();
    setTestResult(null);
    setFeedback(null);
    const validation = validationFor(draft);
    if (!validation.valid) {
      setTestResult({ ok: false, message: validation.error || '配置不完整。' });
      return;
    }
    const controller = new AbortController();
    requestRef.current = controller;
    setTesting(true);
    const testedDraft = { ...draft };
    try {
      const result = await testAIConnection(testedDraft, controller.signal);
      if (controller.signal.aborted || requestRef.current !== controller)
        return;
      const safeMessage = testedDraft.apiKey
        ? result.message.split(testedDraft.apiKey).join('[已隐藏密钥]')
        : result.message;
      setTestResult({ ...result, message: safeMessage });
    } catch {
      if (!controller.signal.aborted && requestRef.current === controller)
        setTestResult({
          ok: false,
          message: '测试未完成，请检查网络、地址与服务端跨域设置。',
        });
    } finally {
      if (requestRef.current === controller) {
        requestRef.current = null;
        setTesting(false);
      }
    }
  };
  const preset = getProviderPreset(draft.provider);
  const dirty = !sameConfig(draft, saved || getDefaultConfig());
  const savedValid =
    saved && validateAIConfig(resolveUserAIConfig(saved)).valid;
  let endpoint = '';
  let targetHost = '';
  try {
    endpoint = resolveUserAIUrl(draft);
    targetHost = endpoint ? new URL(endpoint).host : '';
  } catch {
    /* The visible validation message covers invalid URLs. */
  }
  const allowsEmptyKey = isLoopbackUrl(endpoint);
  const validation = validationFor(draft);
  const inputClass =
    'w-full px-3 py-2 bg-npu-bg border border-npu-border text-npu-text text-sm';

  return (
    <section
      className="bg-npu-panel border border-npu-border"
      aria-label="AI 配置"
    >
      <button
        type="button"
        onClick={() => setCollapsed((value) => !value)}
        aria-expanded={!collapsed}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-npu-bg transition-colors"
      >
        <span className="flex items-center gap-2 text-sm">
          <Brain size={15} />
          <span>AI 文案设置</span>
          <span className="text-xs text-npu-muted">
            {saved?.enabled
              ? savedValid
                ? '已启用'
                : '配置待补充'
              : '本地文案'}
          </span>
        </span>
        {collapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
      </button>
      {!collapsed && (
        <div className="px-4 pb-4 border-t border-npu-border space-y-4 text-sm">
          <p className="pt-3 text-xs text-npu-dim">
            用于校园事件、升学文案和对手名称。关闭后使用本地文案。
            {dirty ? ' 当前有未保存更改。' : ' 当前显示已保存配置。'}
          </p>
          {legacyKey && (
            <p role="status" className="text-xs text-npu-warn">
              检测到旧版长期保留的密钥。下次保存默认迁移为本标签页会话保存；只有勾选“记住密钥”才继续长期保留。
            </p>
          )}
          <label className="flex items-center justify-between gap-4">
            <span>启用 AI 文案（保存后生效）</span>
            <input
              type="checkbox"
              checked={draft.enabled}
              onChange={(event) =>
                updateDraft({ enabled: event.target.checked })
              }
              className="w-5 h-5 accent-npu-code"
            />
          </label>
          <div>
            <label
              htmlFor={fieldId + '-provider'}
              className="block text-xs text-npu-dim mb-1.5"
            >
              服务商
            </label>
            <select
              id={fieldId + '-provider'}
              value={draft.provider}
              onChange={(event) =>
                selectProvider(event.target.value as AIProviderId)
              }
              className={inputClass}
            >
              {PROVIDER_PRESETS.map((provider) => (
                <option key={provider.id} value={provider.id}>
                  {provider.name}
                </option>
              ))}
            </select>
            <p className="text-xs text-npu-muted mt-1">
              {preset.description}。切换服务商会清空草稿中的旧密钥。
            </p>
          </div>
          <div>
            <label
              htmlFor={fieldId + '-model'}
              className="block text-xs text-npu-dim mb-1.5"
            >
              模型 ID（可直接手填）
            </label>
            <input
              id={fieldId + '-model'}
              list={fieldId + '-models'}
              value={draft.model}
              onChange={(event) => updateDraft({ model: event.target.value })}
              placeholder={
                draft.provider === 'doubao'
                  ? '模型 ID 或 ep-推理接入点'
                  : '服务商提供或本机已加载的模型 ID'
              }
              className={inputClass}
              autoComplete="off"
              spellCheck={false}
            />
            <datalist id={fieldId + '-models'}>
              {preset.models.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.label}
                </option>
              ))}
            </datalist>
            <p className="text-xs text-npu-muted mt-1">
              预设仅为少量填写示例，不代表账户已开通或模型仍可用。
              {draft.provider === 'doubao' &&
                '豆包可填写控制台的 ep-* 接入点。'}
            </p>
          </div>
          <div>
            <label
              htmlFor={fieldId + '-key'}
              className="block text-xs text-npu-dim mb-1.5"
            >
              API Key
              {allowsEmptyKey ? '（本机地址可留空）' : '（远程服务必填）'}
            </label>
            <div className="relative">
              <input
                id={fieldId + '-key'}
                type={showKey ? 'text' : 'password'}
                value={draft.apiKey}
                onChange={(event) =>
                  updateDraft({ apiKey: event.target.value })
                }
                className={inputClass + ' pr-12'}
                autoComplete="off"
                spellCheck={false}
              />
              <button
                type="button"
                onClick={() => setShowKey((value) => !value)}
                aria-label={showKey ? '隐藏密钥' : '显示密钥'}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-npu-dim p-1"
              >
                {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            <label className="flex items-center gap-2 text-xs mt-3">
              <input
                type="checkbox"
                checked={draft.rememberKey === true}
                onChange={(event) =>
                  updateDraft({ rememberKey: event.target.checked })
                }
                className="w-4 h-4 accent-npu-code"
              />
              在这台设备记住密钥（长期保存）
            </label>
            <p className="text-xs text-npu-muted mt-1">
              默认密钥仅保留在本标签页会话，关闭标签页后需重新填写。配置其他字段可长期保存。
            </p>
            {preset.docsUrl && (
              <a
                href={preset.docsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex gap-1 items-center text-xs text-npu-code mt-2"
              >
                服务商官方接口说明
                <ExternalLink size={12} />
              </a>
            )}
          </div>
          <details
            key={draft.provider}
            open={draft.provider === 'custom' || undefined}
            className="border-t border-npu-border pt-3"
          >
            <summary className="cursor-pointer text-xs text-npu-dim">
              更多接口设置
            </summary>
            <div className="space-y-3 pt-3">
              <div>
                <label
                  htmlFor={fieldId + '-protocol'}
                  className="block text-xs text-npu-dim mb-1.5"
                >
                  接口协议
                </label>
                <select
                  id={fieldId + '-protocol'}
                  value={draft.protocol || preset.protocol}
                  onChange={(event) =>
                    updateDraft({ protocol: event.target.value as AIProtocol })
                  }
                  className={inputClass}
                >
                  <option value="openai">OpenAI 兼容 Chat Completions</option>
                  <option value="anthropic">Anthropic Messages</option>
                  <option value="gemini">Gemini generateContent</option>
                </select>
              </div>
              <div>
                <label
                  htmlFor={fieldId + '-url'}
                  className="block text-xs text-npu-dim mb-1.5"
                >
                  API 地址（Base URL 或完整接口地址）
                </label>
                <input
                  id={fieldId + '-url'}
                  type="url"
                  value={draft.customUrl || ''}
                  onChange={(event) =>
                    updateDraft({ customUrl: event.target.value })
                  }
                  placeholder={preset.baseUrl || 'https://你的服务地址/v1'}
                  className={inputClass}
                  spellCheck={false}
                  autoComplete="off"
                />
                <p className="text-xs text-npu-muted mt-1">
                  {preset.baseUrl ? '留空使用预设地址。' : '请填写服务地址。'}
                  地址中不要填写密钥。
                </p>
              </div>
            </div>
          </details>
          <p className="text-xs text-npu-code mt-1 break-all">
            测试和保存后请求将发送到：{targetHost || '地址尚未有效填写'}
          </p>
          <p className="text-xs text-npu-muted">
            密钥会发送到上面显示的服务地址。长期记住会使用浏览器明文存储，请仅在可信设备勾选。
          </p>
          {targetHost.toLowerCase() === 'api.minimax.chat' && (
            <p role="status" className="text-xs text-npu-warn">
              当前保留旧版 MiniMax
              地址，未自动切换到国际站。迁移时请展开接口设置，确认账户地域、地址和密钥匹配。
            </p>
          )}
          <div className="border-t border-npu-border pt-3 space-y-2">
            <p className="text-xs text-npu-dim">
              测试仅发送当前草稿，不保存密钥、不消耗游戏资源；服务商可能按请求计费。不会自动发起测试。
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleTest}
                disabled={testing || !validation.valid}
                className="px-4 py-2 border border-npu-code text-npu-code disabled:opacity-50"
              >
                {testing ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 size={14} className="animate-spin" />
                    测试中…
                  </span>
                ) : (
                  '测试当前草稿'
                )}
              </button>
              {testing && (
                <button
                  type="button"
                  onClick={() => {
                    cancelTest();
                    setTestResult(null);
                    setFeedback({ ok: true, message: '已取消测试。' });
                  }}
                  className="px-3 py-2 border border-npu-border"
                >
                  取消测试
                </button>
              )}
            </div>
            {!validation.valid && (
              <p className="text-xs text-npu-warn">{validation.error}</p>
            )}
            {testResult && (
              <p
                role="status"
                className={
                  'text-xs ' +
                  (testResult.ok ? 'text-npu-code' : 'text-npu-warn')
                }
              >
                {testResult.message}
                {testResult.latencyMs !== undefined &&
                  ' · ' + Math.round(testResult.latencyMs) + ' ms'}
                。此结果仅对应测试时的草稿。
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={draft.enabled && !validation.valid}
              className="px-4 py-2 bg-npu-code text-npu-panel disabled:opacity-50"
            >
              保存配置
            </button>
            {dirty && (
              <button
                type="button"
                onClick={() => {
                  cancelTest();
                  setDraft({ ...(saved || getDefaultConfig()) });
                  setTestResult(null);
                  setFeedback(null);
                }}
                className="px-3 py-2 border border-npu-border"
              >
                撤销更改
              </button>
            )}
            <button
              type="button"
              onClick={handleClear}
              className="px-3 py-2 text-npu-warn border border-npu-border"
            >
              清除配置与密钥
            </button>
          </div>
          {feedback && (
            <p
              role="status"
              className={
                'text-xs ' + (feedback.ok ? 'text-npu-code' : 'text-npu-warn')
              }
            >
              {feedback.message}
            </p>
          )}
        </div>
      )}
    </section>
  );
};

export default AIConfigPanel;
