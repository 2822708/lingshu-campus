export type AIProtocol = 'openai' | 'anthropic' | 'gemini';

export interface AIRequestConfig {
  apiUrl: string;
  apiKey: string;
  model: string;
  protocol?: AIProtocol;
  timeoutMs?: number;
  tokenParameter?: 'max_tokens' | 'max_completion_tokens';
  omitTemperature?: boolean;
}

export interface AIRequest {
  system: string;
  user: string;
  maxTokens: number;
  temperature?: number;
}

type ErrorCode =
  | 'configuration'
  | 'timeout'
  | 'cancelled'
  | 'network'
  | 'http'
  | 'json'
  | 'empty'
  | 'refused'
  | 'truncated'
  | 'response_too_large'
  | 'protocol';

/** Only application-owned messages leave this boundary; provider bodies and URLs do not. */
export class AIClientError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly status?: number
  ) {
    super(message);
    this.name = 'AIClientError';
  }
}

const MAX_RESPONSE_BYTES = 1024 * 1024;
const MAX_TEXT_CHARS = 65536;
const configurationError = () =>
  new AIClientError('configuration', 'AI 配置无效，请检查地址、模型和密钥。');
const record = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

function isLoopback(host: string): boolean {
  return (
    host === 'localhost' ||
    host === '[::1]' ||
    /^127(?:\.\d{1,3}){3}$/.test(host)
  );
}

function safeUrl(raw: string): URL {
  let url: URL;
  if (typeof raw !== 'string' || !raw.trim()) throw configurationError();
  try {
    url = new URL(raw);
  } catch {
    throw configurationError();
  }
  if (
    !['https:', 'http:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.hash
  ) {
    throw configurationError();
  }
  if (url.protocol === 'http:' && !isLoopback(url.hostname))
    throw configurationError();
  for (const key of url.searchParams.keys()) {
    const normalized = key.replace(/[^a-z0-9]/gi, '').toLowerCase();
    if (
      /key|token|secret|password|credential|authorization|signature|^auth$|^sig$/.test(
        normalized
      )
    ) {
      throw configurationError();
    }
  }
  return url;
}

/** Standard bases are expanded; nonstandard proxy paths remain exactly user supplied. */
export function normalizeAIEndpoint(
  raw: string,
  protocol: AIProtocol,
  model: string
): string {
  if (
    !['openai', 'anthropic', 'gemini'].includes(protocol) ||
    typeof model !== 'string' ||
    !model.trim().replace(/^models\//, '') ||
    model.length > 256 ||
    /[\r\n]/.test(model)
  )
    throw configurationError();
  const url = safeUrl(raw);
  const path = url.pathname.replace(/\/+$/, '');
  if (protocol === 'gemini') {
    const name = encodeURIComponent(model.trim().replace(/^models\//, ''));
    if (/\/models\/[^/]+:generateContent$/.test(path)) {
      url.pathname = path.replace(
        /\/models\/[^/]+:generateContent$/,
        `/models/${name}:generateContent`
      );
    } else if (!path) url.pathname = `/v1beta/models/${name}:generateContent`;
    else if (/\/(?:v1|v1beta)$/.test(path))
      url.pathname = `${path}/models/${name}:generateContent`;
    else if (/\/(?:v1|v1beta)\/models$/.test(path))
      url.pathname = `${path}/${name}:generateContent`;
  } else {
    const suffix = protocol === 'anthropic' ? 'messages' : 'chat/completions';
    if (!path) url.pathname = `/v1/${suffix}`;
    else if ((protocol === 'openai' ? /\/v\d+$/ : /\/v1$/).test(path))
      url.pathname = `${path}/${suffix}`;
  }
  return url.toString();
}

type Usage = { inputTokens?: number; outputTokens?: number };
function usageOf(input: unknown, output: unknown): Usage | undefined {
  const valid = (n: unknown): n is number =>
    typeof n === 'number' && Number.isSafeInteger(n) && n >= 0;
  const usage: Usage = {};
  if (valid(input)) usage.inputTokens = input;
  if (valid(output)) usage.outputTokens = output;
  return Object.keys(usage).length ? usage : undefined;
}

function textParts(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .map((part: unknown) => {
      if (typeof part === 'string') return part;
      const p = record(part);
      if (p.type === 'refusal')
        throw new AIClientError('refused', 'AI 拒绝生成本次内容。');
      if (
        p.thought === true ||
        (p.type && p.type !== 'text' && p.type !== 'output_text')
      )
        return '';
      return typeof p.text === 'string' ? p.text : '';
    })
    .join('');
}

function extractResponse(
  data: unknown,
  protocol: AIProtocol
): { text: string; usage?: Usage } {
  const root = record(data);
  if (root.error || root.type === 'error')
    throw new AIClientError('protocol', 'AI 返回了无效的协议响应。');
  let text: string;
  let usage: Usage | undefined;
  if (protocol === 'openai') {
    const choice = record(
      Array.isArray(root.choices) ? root.choices[0] : undefined
    );
    const message = record(choice.message);
    if (message.refusal || choice.finish_reason === 'content_filter') {
      throw new AIClientError('refused', 'AI 拒绝生成本次内容。');
    }
    if (choice.finish_reason === 'length')
      throw new AIClientError('truncated', 'AI 输出达到上限，内容不完整。');
    if (
      ['tool_calls', 'function_call'].includes(String(choice.finish_reason))
    ) {
      throw new AIClientError('protocol', '本次 AI 响应不是完整文本。');
    }
    // Some OpenAI-compatible proxies omit this field; explicit unfinished or
    // malformed reasons must never turn partial text into a successful result.
    if (choice.finish_reason !== undefined && choice.finish_reason !== 'stop') {
      throw new AIClientError('protocol', '本次 AI 响应不是完整文本。');
    }
    text = textParts(message.content);
    const u = record(root.usage);
    usage = usageOf(u.prompt_tokens, u.completion_tokens);
  } else if (protocol === 'anthropic') {
    if (
      root.stop_reason === 'refusal' ||
      record(root.stop_details).type === 'refusal'
    ) {
      throw new AIClientError('refused', 'AI 拒绝生成本次内容。');
    }
    if (
      ['max_tokens', 'model_context_window_exceeded'].includes(
        String(root.stop_reason)
      )
    ) {
      throw new AIClientError('truncated', 'AI 输出达到上限，内容不完整。');
    }
    if (['tool_use', 'pause_turn'].includes(String(root.stop_reason))) {
      throw new AIClientError('protocol', '本次 AI 响应不是完整文本。');
    }
    // Native non-streaming Messages must confirm a completed assistant turn.
    if (!['end_turn', 'stop_sequence'].includes(String(root.stop_reason))) {
      throw new AIClientError('protocol', '本次 AI 响应不是完整文本。');
    }
    text = textParts(root.content);
    const u = record(root.usage);
    usage = usageOf(u.input_tokens, u.output_tokens);
  } else {
    const feedback = record(root.promptFeedback);
    const candidate = record(
      Array.isArray(root.candidates) ? root.candidates[0] : undefined
    );
    if (
      (feedback.blockReason &&
        feedback.blockReason !== 'BLOCK_REASON_UNSPECIFIED') ||
      [
        'SAFETY',
        'RECITATION',
        'BLOCKLIST',
        'PROHIBITED_CONTENT',
        'SPII',
        'IMAGE_SAFETY',
      ].includes(String(candidate.finishReason))
    ) {
      throw new AIClientError('refused', 'AI 拒绝生成本次内容。');
    }
    if (candidate.finishReason === 'MAX_TOKENS')
      throw new AIClientError('truncated', 'AI 输出达到上限，内容不完整。');
    if (candidate.finishReason !== 'STOP') {
      throw new AIClientError('protocol', '本次 AI 响应不是完整文本。');
    }
    text = textParts(record(candidate.content).parts);
    const u = record(root.usageMetadata);
    usage = usageOf(u.promptTokenCount, u.candidatesTokenCount);
  }
  text = text.trim();
  if (!text)
    throw new AIClientError('empty', 'AI 返回了空内容，请重试或使用本地模式。');
  if (text.length > MAX_TEXT_CHARS)
    throw new AIClientError('response_too_large', 'AI 返回内容超过大小限制。');
  return { text, ...(usage ? { usage } : {}) };
}

async function readBounded(
  response: Response,
  signal: AbortSignal
): Promise<unknown> {
  const declared = Number(response.headers.get('content-length'));
  if (declared > MAX_RESPONSE_BYTES) {
    void response.body?.cancel().catch(() => {});
    throw new AIClientError('response_too_large', 'AI 返回内容超过大小限制。');
  }
  let raw = '';
  if (response.body) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const cancelReader = () => {
      void reader.cancel().catch(() => {});
    };
    signal.addEventListener('abort', cancelReader, { once: true });
    if (signal.aborted) cancelReader();
    let bytes = 0;
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        bytes += chunk.value.byteLength;
        if (bytes > MAX_RESPONSE_BYTES) {
          void reader.cancel().catch(() => {});
          throw new AIClientError(
            'response_too_large',
            'AI 返回内容超过大小限制。'
          );
        }
        raw += decoder.decode(chunk.value, { stream: true });
      }
      raw += decoder.decode();
    } finally {
      signal.removeEventListener('abort', cancelReader);
      reader.releaseLock();
    }
  } else {
    raw = await response.text();
    if (new TextEncoder().encode(raw).byteLength > MAX_RESPONSE_BYTES) {
      throw new AIClientError(
        'response_too_large',
        'AI 返回内容超过大小限制。'
      );
    }
  }
  if (!raw.trim())
    throw new AIClientError('empty', 'AI 返回了空内容，请重试或使用本地模式。');
  try {
    return JSON.parse(raw);
  } catch {
    throw new AIClientError('json', 'AI 返回的响应不是合法 JSON。');
  }
}

export async function requestAI(
  config: AIRequestConfig,
  input: AIRequest,
  options: { signal?: AbortSignal; fetchImpl?: typeof fetch } = {}
): Promise<{ text: string; usage?: Usage; durationMs: number }> {
  const protocol = config.protocol ?? 'openai';
  const endpoint = normalizeAIEndpoint(config.apiUrl, protocol, config.model);
  const url = safeUrl(endpoint);
  if (typeof config.apiKey !== 'string') throw configurationError();
  const key = config.apiKey.trim();
  const timeoutMs = config.timeoutMs ?? 12000;
  if (
    (!key && !isLoopback(url.hostname)) ||
    /[\r\n]/.test(key) ||
    !Number.isFinite(timeoutMs) ||
    timeoutMs <= 0 ||
    timeoutMs > 120000 ||
    !Number.isSafeInteger(input.maxTokens) ||
    input.maxTokens <= 0 ||
    typeof input.system !== 'string' ||
    typeof input.user !== 'string' ||
    !input.user.trim() ||
    (input.temperature !== undefined &&
      (!Number.isFinite(input.temperature) ||
        input.temperature < 0 ||
        input.temperature > 2))
  ) {
    throw configurationError();
  }
  if (
    config.tokenParameter &&
    !['max_tokens', 'max_completion_tokens'].includes(config.tokenParameter)
  )
    throw configurationError();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  const officialOpenAI =
    protocol === 'openai' && url.hostname === 'api.openai.com';
  const withTemperature =
    !(config.omitTemperature ?? officialOpenAI) &&
    input.temperature !== undefined;
  let body: Record<string, unknown>;
  if (protocol === 'anthropic') {
    if (key) headers['x-api-key'] = key;
    headers['anthropic-version'] = '2023-06-01';
    body = {
      model: config.model,
      system: input.system,
      messages: [{ role: 'user', content: input.user }],
      max_tokens: input.maxTokens,
      stream: false,
      ...(withTemperature ? { temperature: input.temperature } : {}),
    };
  } else if (protocol === 'gemini') {
    if (key) headers['x-goog-api-key'] = key;
    body = {
      systemInstruction: { parts: [{ text: input.system }] },
      contents: [{ role: 'user', parts: [{ text: input.user }] }],
      generationConfig: {
        maxOutputTokens: input.maxTokens,
        ...(withTemperature ? { temperature: input.temperature } : {}),
      },
    };
  } else {
    if (key) headers.Authorization = `Bearer ${key}`;
    body = {
      model: config.model,
      messages: [
        { role: 'system', content: input.system },
        { role: 'user', content: input.user },
      ],
      stream: false,
      [config.tokenParameter ??
      (officialOpenAI ? 'max_completion_tokens' : 'max_tokens')]:
        input.maxTokens,
      ...(withTemperature ? { temperature: input.temperature } : {}),
    };
  }

  const started = Date.now();
  const controller = new AbortController();
  let timedOut = false;
  const cancelError = () =>
    new AIClientError(
      timedOut ? 'timeout' : 'cancelled',
      timedOut ? 'AI 请求超时，请重试或使用本地模式。' : 'AI 请求已取消。'
    );
  const onExternalAbort = () => controller.abort();
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  options.signal?.addEventListener('abort', onExternalAbort, { once: true });
  if (options.signal?.aborted) controller.abort();
  let onAbort: () => void = () => {};
  try {
    if (controller.signal.aborted) throw cancelError();
    const cancelled = new Promise<never>((_, reject) => {
      onAbort = () => reject(cancelError());
      controller.signal.addEventListener('abort', onAbort, { once: true });
    });
    const work = (async () => {
      const response = await (options.fetchImpl ?? fetch)(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
        redirect: 'error',
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
        cache: 'no-store',
      });
      if (controller.signal.aborted) {
        void response.body?.cancel().catch(() => {});
        throw cancelError();
      }
      if (!response.ok) {
        void response.body?.cancel().catch(() => {});
        throw new AIClientError(
          'http',
          `AI 服务请求失败（HTTP ${response.status}）。`,
          response.status
        );
      }
      const result = extractResponse(
        await readBounded(response, controller.signal),
        protocol
      );
      if (controller.signal.aborted) throw cancelError();
      return { ...result, durationMs: Math.max(0, Date.now() - started) };
    })();
    return await Promise.race([work, cancelled]);
  } catch (error) {
    if (controller.signal.aborted) throw cancelError();
    if (error instanceof AIClientError) throw error;
    throw new AIClientError(
      'network',
      'AI 网络请求失败，请检查连接或跨域设置。'
    );
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', onExternalAbort);
    controller.signal.removeEventListener('abort', onAbort);
  }
}
