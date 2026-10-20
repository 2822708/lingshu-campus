import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { requestAI } from '../services/ai/client';

const prompt = {
  system: '本地协议测试',
  user: '仅返回测试文字',
  maxTokens: 50,
  temperature: 0.2,
};
async function withServer(t, handler) {
  const requests = [];
  const server = createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    requests.push({
      path: req.url,
      headers: req.headers,
      body: JSON.parse(body),
    });
    handler(req, res);
  });
  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
  } catch (error) {
    throw new Error('本地HTTP验收无法启动：' + error.code);
  }
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  });
  return { url: 'http://127.0.0.1:' + server.address().port, requests };
}

test('真实本机HTTP：三协议请求经过socket，正确读取最终文本和使用量', async (t) => {
  for (const protocol of ['openai', 'anthropic', 'gemini']) {
    await t.test(protocol, async (t) => {
      const { url, requests } = await withServer(t, (_req, res) => {
        res.setHeader('Content-Type', 'application/json');
        const response =
          protocol === 'openai'
            ? {
                choices: [
                  {
                    message: { content: '{"story":"本地测试通过。"}' },
                    finish_reason: 'stop',
                  },
                ],
                usage: { prompt_tokens: 10, completion_tokens: 5 },
              }
            : protocol === 'anthropic'
              ? {
                  content: [
                    { type: 'text', text: '{"story":"本地测试通过。"}' },
                  ],
                  stop_reason: 'end_turn',
                  usage: { input_tokens: 10, output_tokens: 5 },
                }
              : {
                  candidates: [
                    {
                      content: {
                        parts: [{ text: '{"story":"本地测试通过。"}' }],
                      },
                      finishReason: 'STOP',
                    },
                  ],
                  usageMetadata: {
                    promptTokenCount: 10,
                    candidatesTokenCount: 5,
                  },
                };
        res.end(JSON.stringify(response));
      });
      const result = await requestAI(
        {
          apiUrl: url,
          model: 'local-fixture-model',
          apiKey: '',
          protocol,
          timeoutMs: 1000,
        },
        prompt
      );
      assert.equal(result.text, '{"story":"本地测试通过。"}');
      assert.deepEqual(result.usage, { inputTokens: 10, outputTokens: 5 });
      assert.equal(requests.length, 1);
      assert.equal(requests[0].headers.authorization, undefined);
      assert.equal(requests[0].headers['x-goog-api-key'], undefined);
      assert.equal(requests[0].headers['x-api-key'], undefined);
      assert.match(
        requests[0].path,
        protocol === 'openai'
          ? /\/v1\/chat\/completions$/
          : protocol === 'anthropic'
            ? /\/v1\/messages$/
            : /\/v1beta\/models\/local-fixture-model:generateContent$/
      );
      assert.equal(
        requests[0].body.stream,
        protocol === 'gemini' ? undefined : false
      );
    });
  }
});

test('真实本机HTTP：200空体和不完整响应拒绝，响应正文等待受总超时限制', async (t) => {
  const { url, requests } = await withServer(t, (req, res) => {
    if (req.url === '/empty') {
      res.end();
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.write('{"choices":[');
    // Intentionally never finish: requestAI must cancel the body read.
  });
  await assert.rejects(
    requestAI(
      { apiUrl: url + '/empty', model: 'fixture', apiKey: '', timeoutMs: 1000 },
      prompt
    ),
    (error) => error.code === 'empty'
  );
  await assert.rejects(
    requestAI(
      {
        apiUrl: url + '/slow-body',
        model: 'fixture',
        apiKey: '',
        timeoutMs: 80,
      },
      prompt
    ),
    (error) => error.code === 'timeout'
  );
  assert.equal(requests.length, 2);
});
