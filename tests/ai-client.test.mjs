import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AIClientError,
  normalizeAIEndpoint,
  requestAI,
} from '../services/ai/client';

const input = {
  system: '虚构校园',
  user: '给出一句描述',
  maxTokens: 128,
  temperature: 0.6,
};
const config = {
  apiUrl: 'https://example.invalid/v1',
  apiKey: 'test-placeholder',
  model: 'test-model',
};
const completion = (content = '测试文本', extra = {}) => ({
  choices: [{ message: { content }, finish_reason: 'stop', ...extra }],
});
const jsonResponse = (value, init) => new Response(JSON.stringify(value), init);
const responds = (value) => async () => jsonResponse(value);
const isCode = (code) => (error) =>
  error instanceof AIClientError && error.code === code;

test('端点：标准base、完整地址和自定义代理不重复拼接', () => {
  const cases = [
    [
      'https://api.openai.com',
      'openai',
      'https://api.openai.com/v1/chat/completions',
    ],
    [
      'https://api.openai.com/v1/',
      'openai',
      'https://api.openai.com/v1/chat/completions',
    ],
    [
      'https://x.invalid/v1/chat/completions',
      'openai',
      'https://x.invalid/v1/chat/completions',
    ],
    [
      'https://x.invalid/proxy/v1',
      'openai',
      'https://x.invalid/proxy/v1/chat/completions',
    ],
    ['https://x.invalid/v3', 'openai', 'https://x.invalid/v3/chat/completions'],
    [
      'https://x.invalid/api/v4/',
      'openai',
      'https://x.invalid/api/v4/chat/completions',
    ],
    [
      'https://x.invalid/compatible-mode/v1',
      'openai',
      'https://x.invalid/compatible-mode/v1/chat/completions',
    ],
    ['https://campus.invalid/mock', 'openai', 'https://campus.invalid/mock'],
    [
      'https://x.invalid/custom/proxy?route=campus',
      'openai',
      'https://x.invalid/custom/proxy?route=campus',
    ],
    [
      'https://api.anthropic.com',
      'anthropic',
      'https://api.anthropic.com/v1/messages',
    ],
    [
      'https://api.anthropic.com/v1',
      'anthropic',
      'https://api.anthropic.com/v1/messages',
    ],
    [
      'https://x.invalid/v1/messages',
      'anthropic',
      'https://x.invalid/v1/messages',
    ],
    ['https://x.invalid/relay/', 'anthropic', 'https://x.invalid/relay/'],
    [
      'https://generativelanguage.googleapis.com',
      'gemini',
      'https://generativelanguage.googleapis.com/v1beta/models/test-model:generateContent',
    ],
    [
      'https://x.invalid/v1beta',
      'gemini',
      'https://x.invalid/v1beta/models/test-model:generateContent',
    ],
    [
      'https://x.invalid/v1/models',
      'gemini',
      'https://x.invalid/v1/models/test-model:generateContent',
    ],
    [
      'https://x.invalid/v1beta/models/custom:generateContent',
      'gemini',
      'https://x.invalid/v1beta/models/test-model:generateContent',
    ],
    [
      'https://x.invalid/proxy/v1beta/models/old:generateContent?route=campus',
      'gemini',
      'https://x.invalid/proxy/v1beta/models/test-model:generateContent?route=campus',
    ],
    [
      'https://x.invalid/gemini-proxy',
      'gemini',
      'https://x.invalid/gemini-proxy',
    ],
  ];
  for (const [url, protocol, expected] of cases)
    assert.equal(normalizeAIEndpoint(url, protocol, 'test-model'), expected);
  assert.equal(
    normalizeAIEndpoint('http://[::1]:11434/v1', 'openai', 'local'),
    'http://[::1]:11434/v1/chat/completions'
  );
  assert.match(
    normalizeAIEndpoint(
      'https://x.invalid/v1beta',
      'gemini',
      'models/test-model'
    ),
    /\/models\/test-model:generateContent$/
  );
});

test('端点：拒绝不安全协议、远端HTTP、URL凭证，错误不泄漏地址', () => {
  for (const url of [
    'file:///secret',
    'javascript:alert(1)',
    '/api/proxy',
    'http://192.168.1.2/v1',
    'http://localhost.evil.invalid/v1',
    'https://user:private-secret@x.invalid/v1',
    'https://x.invalid/v1?key=private-secret',
    'https://x.invalid/v1?api_key=private-secret',
    'https://x.invalid/v1?access_token=private-secret',
    'https://x.invalid/v1?X-Goog-Api-Key=private-secret',
    'https://x.invalid/v1#private-secret',
  ]) {
    assert.throws(
      () => normalizeAIEndpoint(url, 'openai', 'model'),
      (error) => {
        assert.equal(error.code, 'configuration');
        assert.doesNotMatch(
          error.message,
          /private-secret|x\.invalid|javascript/
        );
        return true;
      }
    );
  }
});

test('OpenAI兼容请求：系统消息、Bearer、max_tokens、温度，无强制JSON模式', async () => {
  const result = await requestAI(config, input, {
    fetchImpl: async (url, init) => {
      assert.equal(url, 'https://example.invalid/v1/chat/completions');
      assert.equal(init.headers.Authorization, 'Bearer test-placeholder');
      assert.equal(init.redirect, 'error');
      assert.equal(init.credentials, 'omit');
      assert.ok(init.signal instanceof AbortSignal);
      const body = JSON.parse(init.body);
      assert.deepEqual(body, {
        model: 'test-model',
        messages: [
          { role: 'system', content: input.system },
          { role: 'user', content: input.user },
        ],
        stream: false,
        max_tokens: 128,
        temperature: 0.6,
      });
      assert.equal(body.response_format, undefined);
      return jsonResponse({
        ...completion('  校园内容  '),
        usage: { prompt_tokens: 13, completion_tokens: 7 },
      });
    },
  });
  assert.equal(result.text, '校园内容');
  assert.deepEqual(result.usage, { inputTokens: 13, outputTokens: 7 });
  assert.ok(result.durationMs >= 0);
});

test('官方OpenAI默认max_completion_tokens且省略温度，兼容配置可显式调整', async () => {
  await requestAI({ ...config, apiUrl: 'https://api.openai.com/v1' }, input, {
    fetchImpl: async (_, init) => {
      const body = JSON.parse(init.body);
      assert.equal(body.max_completion_tokens, 128);
      assert.equal(body.max_tokens, undefined);
      assert.equal(body.temperature, undefined);
      return jsonResponse(completion());
    },
  });
  await requestAI(
    {
      ...config,
      tokenParameter: 'max_completion_tokens',
      omitTemperature: true,
    },
    input,
    {
      fetchImpl: async (_, init) => {
        const body = JSON.parse(init.body);
        assert.equal(body.max_completion_tokens, 128);
        assert.equal(body.temperature, undefined);
        return jsonResponse(completion());
      },
    }
  );
});

test('Anthropic：system独立、版本头、文本块与usage，不添加浏览器保护绕过头', async () => {
  const result = await requestAI({ ...config, protocol: 'anthropic' }, input, {
    fetchImpl: async (url, init) => {
      assert.equal(url, 'https://example.invalid/v1/messages');
      assert.equal(init.headers['x-api-key'], 'test-placeholder');
      assert.equal(init.headers['anthropic-version'], '2023-06-01');
      assert.equal(init.headers.Authorization, undefined);
      assert.ok(
        !Object.keys(init.headers).some((key) => /dangerous/i.test(key))
      );
      assert.deepEqual(JSON.parse(init.body), {
        model: 'test-model',
        system: input.system,
        messages: [{ role: 'user', content: input.user }],
        max_tokens: 128,
        stream: false,
        temperature: 0.6,
      });
      return jsonResponse({
        content: [
          { type: 'thinking', thinking: '不显示的推理' },
          { type: 'text', text: '第一句' },
          { type: 'text', text: '第二句' },
        ],
        stop_reason: 'end_turn',
        usage: { input_tokens: 20, output_tokens: 9 },
      });
    },
  });
  assert.equal(result.text, '第一句第二句');
  assert.deepEqual(result.usage, { inputTokens: 20, outputTokens: 9 });
});

test('Gemini：systemInstruction、contents、输出上限、header key及usage', async () => {
  const result = await requestAI(
    {
      ...config,
      protocol: 'gemini',
      apiUrl: 'https://generativelanguage.googleapis.com/v1beta',
    },
    input,
    {
      fetchImpl: async (url, init) => {
        assert.equal(
          url,
          'https://generativelanguage.googleapis.com/v1beta/models/test-model:generateContent'
        );
        assert.equal(new URL(url).search, '');
        assert.equal(init.headers['x-goog-api-key'], 'test-placeholder');
        assert.equal(init.headers.Authorization, undefined);
        assert.deepEqual(JSON.parse(init.body), {
          systemInstruction: { parts: [{ text: input.system }] },
          contents: [{ role: 'user', parts: [{ text: input.user }] }],
          generationConfig: { maxOutputTokens: 128, temperature: 0.6 },
        });
        return jsonResponse({
          candidates: [
            {
              content: {
                parts: [
                  { text: '隐藏推理', thought: true },
                  { text: '校园' },
                  { text: '短句' },
                ],
              },
              finishReason: 'STOP',
            },
          ],
          usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 4 },
        });
      },
    }
  );
  assert.equal(result.text, '校园短句');
  assert.deepEqual(result.usage, { inputTokens: 10, outputTokens: 4 });
});

test('OpenAI content数组只提取文本，保留JSON围栏供skill层解析', async () => {
  const result = await requestAI(config, input, {
    fetchImpl: responds(
      completion([
        { type: 'text', text: '```json\n' },
        { type: 'image_url', image_url: 'ignored' },
        { type: 'text', text: '{"story":"测试"}\n```' },
      ])
    ),
  });
  assert.equal(result.text, '```json\n{"story":"测试"}\n```');
});

test('拒绝：三个协议均不把拒绝内容当成功文本', async () => {
  const cases = [
    [
      'openai',
      {
        choices: [
          {
            message: {
              content: '表面文本',
              refusal: 'sensitive-provider-body',
            },
          },
        ],
      },
    ],
    [
      'openai',
      completion([{ type: 'refusal', refusal: 'sensitive-provider-body' }]),
    ],
    ['openai', completion('文本', { finish_reason: 'content_filter' })],
    [
      'anthropic',
      { content: [{ type: 'text', text: '拒绝' }], stop_reason: 'refusal' },
    ],
    [
      'anthropic',
      {
        content: [{ type: 'text', text: '拒绝' }],
        stop_reason: 'end_turn',
        stop_details: { type: 'refusal' },
      },
    ],
    ['gemini', { promptFeedback: { blockReason: 'SAFETY' } }],
    [
      'gemini',
      {
        candidates: [
          { finishReason: 'SAFETY', content: { parts: [{ text: '拒绝' }] } },
        ],
      },
    ],
  ];
  for (const [protocol, response] of cases) {
    await assert.rejects(
      requestAI({ ...config, protocol }, input, {
        fetchImpl: responds(response),
      }),
      isCode('refused')
    );
  }
});

test('截断：三个协议达到token上限均拒绝不完整文本', async () => {
  for (const [protocol, response] of [
    ['openai', completion('{"story":', { finish_reason: 'length' })],
    [
      'anthropic',
      {
        content: [{ type: 'text', text: '{"story":' }],
        stop_reason: 'max_tokens',
      },
    ],
    [
      'gemini',
      {
        candidates: [
          {
            finishReason: 'MAX_TOKENS',
            content: { parts: [{ text: '{"story":' }] },
          },
        ],
      },
    ],
  ]) {
    await assert.rejects(
      requestAI({ ...config, protocol }, input, {
        fetchImpl: responds(response),
      }),
      isCode('truncated')
    );
  }
});

test('工具调用或未完成轮次不能作为完整文本成功返回', async () => {
  await assert.rejects(
    requestAI(config, input, {
      fetchImpl: responds(completion('部分', { finish_reason: 'tool_calls' })),
    }),
    isCode('protocol')
  );
  await assert.rejects(
    requestAI({ ...config, protocol: 'anthropic' }, input, {
      fetchImpl: responds({
        content: [{ type: 'text', text: '部分' }],
        stop_reason: 'pause_turn',
      }),
    }),
    isCode('protocol')
  );
});

test('Anthropic未知终止原因必须拒绝，不能把未确认完整的文本当成功', async () => {
  for (const stop_reason of [
    'unknown_pending_state',
    undefined,
    null,
    false,
    0,
  ]) {
    await assert.rejects(
      requestAI({ ...config, protocol: 'anthropic' }, input, {
        fetchImpl: responds({
          content: [{ type: 'text', text: '看似完整的文字' }],
          stop_reason,
        }),
      }),
      isCode('protocol')
    );
  }
  const complete = await requestAI(
    { ...config, protocol: 'anthropic' },
    input,
    {
      fetchImpl: responds({
        content: [{ type: 'text', text: '已完成' }],
        stop_reason: 'stop_sequence',
      }),
    }
  );
  assert.equal(complete.text, '已完成');
});

test('OpenAI兼容缺省终止原因，但显式无效原因与Gemini未完成状态不能成功', async () => {
  for (const finish_reason of ['unknown_pending_state', null, false, 0]) {
    await assert.rejects(
      requestAI(config, input, {
        fetchImpl: responds(completion('部分文本', { finish_reason })),
      }),
      isCode('protocol')
    );
  }
  const compatible = await requestAI(config, input, {
    fetchImpl: responds({ choices: [{ message: { content: '兼容代理' } }] }),
  });
  assert.equal(compatible.text, '兼容代理');
  for (const finishReason of [
    'UNKNOWN',
    'FINISH_REASON_UNSPECIFIED',
    undefined,
    null,
    false,
    0,
  ]) {
    await assert.rejects(
      requestAI({ ...config, protocol: 'gemini' }, input, {
        fetchImpl: responds({
          candidates: [
            { content: { parts: [{ text: '部分文本' }] }, finishReason },
          ],
        }),
      }),
      isCode('protocol')
    );
  }
});

test('空200、空白文本、缺失候选与非法JSON均分类，错误不含原始报文', async () => {
  for (const response of [
    new Response(''),
    jsonResponse(completion('  ')),
    jsonResponse({}),
  ]) {
    await assert.rejects(
      requestAI(config, input, { fetchImpl: async () => response }),
      isCode('empty')
    );
  }
  await assert.rejects(
    requestAI(config, input, {
      fetchImpl: async () => new Response('secret raw provider body'),
    }),
    (error) => {
      assert.equal(error.code, 'json');
      assert.doesNotMatch(error.message, /secret|provider/);
      return true;
    }
  );
});

test('HTTP与网络错误不返回provider报文、URL、密钥或底层错误', async () => {
  await assert.rejects(
    requestAI(config, input, {
      fetchImpl: async () =>
        new Response('test-placeholder sensitive-provider-body', {
          status: 401,
        }),
    }),
    (error) => {
      assert.equal(error.code, 'http');
      assert.equal(error.status, 401);
      assert.doesNotMatch(error.message, /placeholder|sensitive|invalid/);
      return true;
    }
  );
  await assert.rejects(
    requestAI(config, input, {
      fetchImpl: async () => {
        throw new Error('https://example.invalid/?key=test-placeholder');
      },
    }),
    (error) => {
      assert.equal(error.code, 'network');
      assert.doesNotMatch(error.message, /invalid|placeholder|https/);
      return true;
    }
  );
});

test('限制响应体与模型文本大小，不靠截断文本掩盖失败', async () => {
  await assert.rejects(
    requestAI(config, input, {
      fetchImpl: async () =>
        new Response('{}', {
          headers: { 'content-length': String(1024 * 1024 + 1) },
        }),
    }),
    isCode('response_too_large')
  );
  await assert.rejects(
    requestAI(config, input, {
      fetchImpl: responds(completion('a'.repeat(65537))),
    }),
    isCode('response_too_large')
  );
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(1024 * 1024 + 1));
      controller.close();
    },
  });
  await assert.rejects(
    requestAI(config, input, { fetchImpl: async () => new Response(stream) }),
    isCode('response_too_large')
  );
});

test('默认配置允许localhost无key，远端缺key与非法参数在fetch前拒绝', async () => {
  await requestAI(
    { apiUrl: 'http://localhost:11434/v1', apiKey: '', model: 'local' },
    input,
    {
      fetchImpl: async (_, init) => {
        assert.equal(init.headers.Authorization, undefined);
        return jsonResponse(completion());
      },
    }
  );
  let calls = 0;
  const fetchImpl = async () => {
    calls++;
    return jsonResponse(completion());
  };
  for (const change of [
    { apiKey: '' },
    { apiKey: true },
    { apiKey: 'bad\nvalue' },
    { model: '' },
    { model: 3 },
    { model: 'models/' },
    { timeoutMs: -1 },
    { timeoutMs: Infinity },
    { tokenParameter: 'unsafe' },
    { protocol: 'unsafe' },
  ]) {
    await assert.rejects(
      requestAI({ ...config, ...change }, input, { fetchImpl }),
      isCode('configuration')
    );
  }
  await assert.rejects(
    requestAI(config, { ...input, maxTokens: 0 }, { fetchImpl }),
    isCode('configuration')
  );
  await assert.rejects(
    requestAI(config, { ...input, temperature: NaN }, { fetchImpl }),
    isCode('configuration')
  );
  assert.equal(calls, 0);
});

test('usage忽略无效数值且允许零，不展示虚构统计', async () => {
  const result = await requestAI(config, input, {
    fetchImpl: responds({
      ...completion(),
      usage: { prompt_tokens: -1, completion_tokens: 0 },
    }),
  });
  assert.deepEqual(result.usage, { outputTokens: 0 });
  const absent = await requestAI(config, input, {
    fetchImpl: responds({
      ...completion(),
      usage: { prompt_tokens: '10', completion_tokens: 1.5 },
    }),
  });
  assert.equal(absent.usage, undefined);
});

test('请求超时会取消内部signal，即使fetch桩未处理abort也能结束', async () => {
  let signal;
  await assert.rejects(
    requestAI({ ...config, timeoutMs: 10 }, input, {
      fetchImpl: async (_, init) => {
        signal = init.signal;
        return new Promise(() => {});
      },
    }),
    isCode('timeout')
  );
  assert.equal(signal.aborted, true);
});

test('外部取消与超时分别分类，预取消不调用fetch', async () => {
  const controller = new AbortController();
  let innerSignal;
  const pending = requestAI(config, input, {
    signal: controller.signal,
    fetchImpl: async (_, init) => {
      innerSignal = init.signal;
      return new Promise(() => {});
    },
  });
  controller.abort('secret reason');
  await assert.rejects(pending, isCode('cancelled'));
  assert.equal(innerSignal.aborted, true);
  await assert.rejects(
    requestAI(config, input, {
      signal: controller.signal,
      fetchImpl: async () => {
        assert.fail('预取消不应发送');
      },
    }),
    isCode('cancelled')
  );
});

test('超时覆盖响应体读取，迟到响应不成功且成功后清理外部监听', async () => {
  const controller = new AbortController();
  let signal;
  const result = await requestAI(config, input, {
    signal: controller.signal,
    fetchImpl: async (_, init) => {
      signal = init.signal;
      return jsonResponse(completion());
    },
  });
  controller.abort();
  assert.equal(result.text, '测试文本');
  assert.equal(signal.aborted, false);
  let bodyCancelled = false;
  const body = new ReadableStream({
    start() {},
    cancel() {
      bodyCancelled = true;
    },
  });
  await assert.rejects(
    requestAI({ ...config, timeoutMs: 10 }, input, {
      fetchImpl: async () => new Response(body),
    }),
    isCode('timeout')
  );
  assert.equal(bodyCancelled, true);
});
