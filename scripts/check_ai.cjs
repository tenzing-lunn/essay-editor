const { test } = require('node:test');
const assert = require('node:assert/strict');
const { resolveAiCredentials, publicAiError } = require('../lib/ai-config.ts');
const { readAiSettings, saveAiSettings, aiFetch } = require('../lib/ai-client.ts');
const { z } = require('zod');
const { structuredAi, streamClaudeText } = require('../lib/ai-provider.ts');
const { estimateAiCost, formatAiCost } = require('../lib/ai-cost.ts');
const { withAiUsage, recordAiUsage } = require('../lib/ai-usage.ts');
const { readAiCost, resetAiCost } = require('../lib/ai-client.ts');

test('shared server credit is inaccessible unless explicitly enabled', () => {
  const env = { ANTHROPIC_API_KEY: 'sk-ant-owner-secret', OPENAI_API_KEY: 'sk-other-owner' };
  assert.throws(() => resolveAiCredentials(new Headers(), env, false), /Connect your API key/);
  assert.equal(resolveAiCredentials(new Headers(), { ...env, AI_ALLOW_SERVER_KEY: 'true' }, false).apiKey, 'sk-ant-owner-secret');
  assert.throws(() => resolveAiCredentials(new Headers({ 'x-ai-key': '' }), { ...env, AI_ALLOW_SERVER_KEY: 'true' }, false));
});

test('concurrent visitors have independent keys and provider choices', async () => {
  const env = { ANTHROPIC_API_KEY: 'sk-ant-owner-secret', AI_ALLOW_SERVER_KEY: 'true' };
  const [claude, openai] = await Promise.all([
    Promise.resolve().then(() => resolveAiCredentials(new Headers({ 'x-ai-provider': 'anthropic', 'x-ai-key': 'sk-ant-visitor-a', 'x-ai-economy': 'false' }), env, false)),
    Promise.resolve().then(() => resolveAiCredentials(new Headers({ 'x-ai-provider': 'openai', 'x-ai-key': 'sk-visitor-b' }), env, false)),
  ]);
  assert.equal(claude.apiKey, 'sk-ant-visitor-a'); assert.equal(claude.model, 'claude-sonnet-5-5');
  assert.equal(openai.apiKey, 'sk-visitor-b'); assert.equal(openai.model, 'gpt-4.1-mini');
  assert.equal(resolveAiCredentials(new Headers({ 'x-ai-key': 'sk-ant-a' }), {}, false).model, 'claude-haiku-5-5');
  assert.equal(resolveAiCredentials(new Headers({ 'x-ai-key': 'sk-ant-a', 'x-ai-economy': 'false' }), {}, true).model, 'claude-haiku-5-5');
  assert.throws(() => resolveAiCredentials(new Headers({ 'x-ai-provider': 'arbitrary', 'x-ai-key': 'key' }), env, false));
  assert.throws(() => resolveAiCredentials(new Headers({ 'x-ai-key': 'bad key' }), env, false));
  assert.throws(() => resolveAiCredentials(new Map([['x-ai-key', 'sk-ant-abc\u200bdef']]), env, false), /hidden characters/);
  // A key is never forwarded to the other company's API.
  assert.throws(() => resolveAiCredentials(new Headers({ 'x-ai-provider': 'anthropic', 'x-ai-key': 'sk-proj-openai' }), env, false), /sk-ant-/);
  assert.throws(() => resolveAiCredentials(new Headers({ 'x-ai-provider': 'openai', 'x-ai-key': 'sk-ant-claude' }), env, false), /not sk-ant-/);
});

test('errors do not expose keys, provider bodies, or essays', () => {
  for (const status of [400, 401, 403, 429, 500]) {
    const error = Object.assign(new Error('sk-secret essay contents'), { status });
    assert.doesNotMatch(publicAiError(error).error, /sk-secret|essay contents/);
  }
});

test('saved tab credentials accompany every AI endpoint and forget removes them', async () => {
  const originals = { window: global.window, sessionStorage: global.sessionStorage, fetch: global.fetch };
  const storage = new Map(); const calls = [];
  global.window = { dispatchEvent() {} };
  global.sessionStorage = { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: (key) => storage.delete(key) };
  global.fetch = async (url, init) => { calls.push({ url, init }); return new Response('{}'); };
  try {
    assert.equal(readAiSettings(), null);
    saveAiSettings({ provider: 'openai', apiKey: 'visitor-key', economy: true });
    for (const path of ['/api/ai', '/api/tutor', '/api/ai/connection']) await aiFetch(path, { method: 'POST', headers: { 'content-type': 'application/json' } });
    for (const { init } of calls) {
      assert.equal(init.headers.get('x-ai-key'), 'visitor-key'); assert.equal(init.headers.get('x-ai-provider'), 'openai');
      assert.equal(init.headers.get('content-type'), 'application/json'); assert.equal(init.redirect, 'error');
    }
    saveAiSettings(null); await aiFetch('/api/ai');
    assert.equal(calls.at(-1).init.headers.get('x-ai-key'), null); assert.equal(storage.size, 0);
    global.sessionStorage.setItem = () => { throw new Error('blocked'); };
    saveAiSettings({ provider: 'anthropic', apiKey: 'memory-key', economy: false }); await aiFetch('/api/ai');
    assert.equal(calls.at(-1).init.headers.get('x-ai-key'), 'memory-key');
  } finally {
    saveAiSettings(null); Object.assign(global, originals);
  }
});

test('both providers receive only their visitor key and return validated structured output', async () => {
  const originalFetch = global.fetch;
  const calls = [];
  global.fetch = async (url, init) => {
    const headers = new Headers(init.headers);
    const body = JSON.parse(init.body);
    calls.push({ url: String(url), headers, body });
    if (String(url).includes('openai.com')) return Response.json({ choices: [{ finish_reason: 'stop', message: { content: '{"connected":true}' } }] });
    return Response.json({ id: 'msg_test', type: 'message', role: 'assistant', model: body.model, content: [{ type: 'text', text: '{"connected":true}' }], stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 10, output_tokens: 5 } });
  };
  try {
    const schema = z.object({ connected: z.boolean() });
    const credentials = (provider, apiKey) => resolveAiCredentials(new Headers({ 'x-ai-provider': provider, 'x-ai-key': apiKey }), {}, false);
    const results = await Promise.all([
      structuredAi(credentials('anthropic', 'sk-ant-claude-visitor'), schema, 'Instructions', 'Draft context', 64),
      structuredAi(credentials('openai', 'sk-openai-visitor'), schema, 'Instructions', 'Draft context', 64),
    ]);
    assert.deepEqual(results, [{ connected: true }, { connected: true }]);
    const claude = calls.find((call) => call.url.includes('anthropic.com'));
    const openai = calls.find((call) => call.url.includes('openai.com'));
    assert.equal(claude.headers.get('x-api-key'), 'sk-ant-claude-visitor');
    assert.equal(openai.headers.get('authorization'), 'Bearer sk-openai-visitor');
    assert.equal(openai.body.response_format.json_schema.strict, true);
    assert.equal(openai.body.store, false);
    assert.equal(claude.body.output_config.format.type, 'json_schema');
    assert.equal(claude.body.max_tokens, 64);
  } finally { global.fetch = originalFetch; }
});

test('provider refusals, truncated output, invalid structure, and bad keys do not produce usable feedback', async () => {
  const originalFetch = global.fetch;
  const credentials = resolveAiCredentials(new Headers({ 'x-ai-provider': 'openai', 'x-ai-key': 'sk-visitor' }), {}, false);
  const schema = z.object({ connected: z.boolean() });
  try {
    for (const choice of [
      { message: { refusal: 'No' } },
      { finish_reason: 'length', message: { content: '{"connected":true}' } },
      { finish_reason: 'stop', message: { content: '{"connected":"wrong type"}' } },
    ]) {
      global.fetch = async () => Response.json({ choices: [choice] });
      await assert.rejects(() => structuredAi(credentials, schema, 'Instructions', 'Draft', 64));
    }
    global.fetch = async () => Response.json({ error: 'key=visitor' }, { status: 401 });
    await assert.rejects(() => structuredAi(credentials, schema, 'Instructions', 'Draft', 64), (error) => publicAiError(error).status === 401 && !publicAiError(error).error.includes('visitor'));
  } finally { global.fetch = originalFetch; }
});

test('costs use reported tokens, cache discounts and cache write duration without rounding tiny charges away', () => {
  const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-12, `${actual} != ${expected}`);
  close(estimateAiCost('openai', 'gpt-4.1-mini-2025-04-14', { prompt_tokens: 3000, completion_tokens: 1000 }).costUsd, 0.0028);
  close(estimateAiCost('openai', 'gpt-4.1-mini', { prompt_tokens: 3000, completion_tokens: 1000, prompt_tokens_details: { cached_tokens: 1000 } }).costUsd, 0.0025);
  close(estimateAiCost('anthropic', 'claude-haiku-5-5', { input_tokens: 3000, output_tokens: 1000, cache_read_input_tokens: 500, cache_creation_input_tokens: 200, cache_creation: { ephemeral_1h_input_tokens: 100 } }).costUsd, 0.0008375);
  close(estimateAiCost('anthropic', 'claude-sonnet-5-5', { input_tokens: 3000, output_tokens: 1000 }).costUsd, 0.016);
  assert.equal(estimateAiCost('openai', 'unknown-model', { prompt_tokens: 3, completion_tokens: 1 }).costUsd, null);
  assert.equal(estimateAiCost('anthropic', 'claude-haiku-5-5', null).costUsd, null);
  assert.equal(estimateAiCost('openai', 'gpt-4.1-mini', { prompt_tokens: -1, completion_tokens: 2 }).costUsd, null);
  assert.equal(formatAiCost(0.0000001), '<$0.0001');
});

test('usage receipts are isolated for concurrent routes and include billable invalid responses', async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => Response.json({ model: 'gpt-4.1-mini', usage: { prompt_tokens: 3000, completion_tokens: 1000 }, choices: [{ finish_reason: 'stop', message: { content: '{"connected":"invalid"}' } }] });
  try {
    const credentials = resolveAiCredentials(new Headers({ 'x-ai-provider': 'openai', 'x-ai-key': 'sk-visitor' }), {}, false);
    const [invalid, other] = await Promise.all([
      withAiUsage(async () => {
        try { await structuredAi(credentials, z.object({ connected: z.boolean() }), 'Instructions', 'Draft', 64); }
        catch { return Response.json({ error: 'Invalid model response' }, { status: 502 }); }
      }),
      withAiUsage(async () => { recordAiUsage({ ...credentials, provider: 'anthropic', model: 'claude-haiku-5-5' }, { input_tokens: 10, output_tokens: 5 }); return Response.json({ ok: true }); }),
    ]);
    assert.equal(invalid.status, 502);
    const first = JSON.parse(invalid.headers.get('x-ai-usage'));
    const second = JSON.parse(other.headers.get('x-ai-usage'));
    assert.equal(first.length, 1); assert.equal(first[0].model, 'gpt-4.1-mini');
    assert.equal(first[0].costUsd, 0.0028);
    assert.equal(second.length, 1); assert.equal(second[0].inputTokens, 10);
    assert.doesNotMatch(JSON.stringify(first), /visitor|Draft/);
  } finally { global.fetch = originalFetch; }
});

test('JSON and fragmented tutor streams update the counter, preserve Unicode text, and survive reload storage', async () => {
  const originals = { window: global.window, sessionStorage: global.sessionStorage, fetch: global.fetch };
  const storage = new Map(); const events = [];
  global.window = { dispatchEvent: (event) => events.push(event.type) };
  global.sessionStorage = { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: (key) => storage.delete(key) };
  try {
    resetAiCost();
    const credentials = { provider: 'anthropic', model: 'claude-sonnet-5-5' };
    global.fetch = () => withAiUsage(async () => {
      recordAiUsage(credentials, { input_tokens: 3000, output_tokens: 1000 });
      return Response.json({ answer: 'Feedback' });
    });
    const result = await aiFetch('/api/ai');
    assert.equal((await result.json()).answer, 'Feedback');
    assert.equal(readAiCost().costUsd, 0.016); assert.equal(readAiCost().requests, 1);
    global.fetch = async () => {
      const response = await withAiUsage(async () => new Response(new ReadableStream({
        async start(controller) {
          const bytes = new TextEncoder().encode('A hint 🙂');
          controller.enqueue(bytes.slice(0, bytes.length - 2));
          await Promise.resolve();
          controller.enqueue(bytes.slice(bytes.length - 2));
          recordAiUsage(credentials, { input_tokens: 3000, output_tokens: 1000 });
          controller.close();
        },
      })), true);
      // Split the SSE envelope itself across arbitrary network chunk boundaries.
      const bytes = new Uint8Array(await response.arrayBuffer());
      return new Response(new ReadableStream({ start(controller) {
        for (let i = 0; i < bytes.length; i += 7) controller.enqueue(bytes.slice(i, i + 7));
        controller.close();
      } }), { headers: response.headers });
    };
    const streamed = await aiFetch('/api/tutor');
    assert.equal(await streamed.text(), 'A hint 🙂');
    assert.equal(readAiCost().requests, 2); assert.equal(readAiCost().costUsd, 0.032);
    assert.equal(readAiCost().inputTokens, 6000); assert.equal(readAiCost().outputTokens, 2000);
    const persisted = JSON.parse(storage.get('finals:ai-cost:v1'));
    assert.deepEqual(persisted, readAiCost());
    assert.ok(events.includes('ai-cost-change'));
    global.fetch = () => withAiUsage(async () => { recordAiUsage(credentials, null); return Response.json({ error: 'Unavailable' }, { status: 502 }); });
    await aiFetch('/api/ai');
    assert.equal(readAiCost().unpriced, 1); assert.equal(readAiCost().costUsd, 0.032);
    resetAiCost(); assert.equal(readAiCost().requests, 0); assert.equal(readAiCost().costUsd, 0);
  } finally { Object.assign(global, originals); }
});

test('Sonnet and Haiku 5.5 both run with thinking off at the requested effort, each in the form it accepts', async () => {
  const originalFetch = global.fetch;
  const bodies = [];
  global.fetch = async (url, init) => {
    const body = JSON.parse(init.body); bodies.push(body);
    return Response.json({ id: 'msg_test', type: 'message', role: 'assistant', model: body.model, content: [{ type: 'text', text: '{"connected":true}' }], stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 10, output_tokens: 5 } });
  };
  try {
    const schema = z.object({ connected: z.boolean() });
    const sonnet = resolveAiCredentials(new Headers({ 'x-ai-key': 'sk-ant-k', 'x-ai-economy': 'false' }), {}, false);
    const haiku = resolveAiCredentials(new Headers({ 'x-ai-key': 'sk-ant-k', 'x-ai-economy': 'true' }), {}, false);
    await structuredAi(sonnet, schema, 's', 'u', 64);
    await structuredAi(sonnet, schema, 's', 'u', 64, 'medium');
    await structuredAi(haiku, schema, 's', 'u', 64, 'medium');
    for (const maxTokens of [64, 500, 2000]) await structuredAi(haiku, schema, 's', 'u', maxTokens);
    assert.deepEqual(bodies[0].thinking, { type: 'between_tools' });
    assert.equal(bodies[0].output_config.effort, 'low');
    assert.equal(bodies[1].output_config.effort, 'medium');
    for (const body of bodies.slice(2)) {
      assert.equal(body.model, 'claude-haiku-5-5');
      // Haiku 5.5 rejects between_tools and budget_tokens; disabled is accepted at effort high or below.
      assert.deepEqual(body.thinking, { type: 'disabled' });
      assert.equal(body.output_config.format.type, 'json_schema');
      for (const key of ['temperature', 'top_p', 'top_k', 'fallbacks']) assert.equal(key in body, false, key);
    }
    assert.equal(bodies[2].output_config.effort, 'medium');
    assert.deepEqual(bodies.slice(3).map((body) => [body.max_tokens, body.output_config.effort]), [[64, 'low'], [500, 'low'], [2000, 'low']]);
  } finally { global.fetch = originalFetch; }
});

const sse = (events) => new Response(events.map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join(''), { headers: { 'content-type': 'text/event-stream' } });
const tutorEvents = (model, text, stopReason) => [
  { type: 'message_start', message: { id: 'msg_test', type: 'message', role: 'assistant', model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 1200, output_tokens: 1 } } },
  { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
  ...text.map((part) => ({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: part } })),
  { type: 'content_block_stop', index: 0 },
  { type: 'message_delta', delta: { stop_reason: stopReason, stop_sequence: null }, usage: { output_tokens: 40 } },
  { type: 'message_stop' },
];

test('the Haiku 5.5 tutor stream turns thinking off, streams text, and reports refusals once', async () => {
  const originalFetch = global.fetch;
  const bodies = [];
  const credentials = resolveAiCredentials(new Headers({ 'x-ai-key': 'sk-ant-k', 'x-ai-economy': 'false' }), {}, true);
  const messages = [{ role: 'user', content: 'Hint please' }];
  try {
    global.fetch = async (url, init) => { const body = JSON.parse(init.body); bodies.push(body); return sse(tutorEvents(body.model, ['Which ', 'formula applies?'], 'end_turn')); };
    let out = '';
    const ok = await withAiUsage(async () => { await streamClaudeText(credentials, 'Tutor', messages, 800, (text) => { out += text; }); return Response.json({}); });
    assert.equal(out, 'Which formula applies?');
    assert.equal(bodies[0].model, 'claude-haiku-5-5');
    assert.equal(bodies[0].stream, true);
    assert.equal(bodies[0].max_tokens, 800);
    assert.deepEqual(bodies[0].thinking, { type: 'disabled' });
    assert.equal(bodies[0].output_config.effort, 'low');
    const receipts = JSON.parse(ok.headers.get('x-ai-usage'));
    assert.equal(receipts.length, 1); assert.equal(receipts[0].outputTokens, 40);
    assert.ok(Math.abs(receipts[0].costUsd - (1200 * 0.1 + 40 * 0.5) / 1e6) < 1e-12);

    global.fetch = async (url, init) => sse(tutorEvents(JSON.parse(init.body).model, ['Par'], 'refusal'));
    let failure;
    const refused = await withAiUsage(async () => {
      try { await streamClaudeText(credentials, 'Tutor', messages, 800, () => {}); } catch (error) { failure = publicAiError(error); }
      return Response.json({});
    });
    assert.equal(failure.status, 422); assert.match(failure.error, /declined/);
    assert.equal(JSON.parse(refused.headers.get('x-ai-usage')).length, 1);
  } finally { global.fetch = originalFetch; }
});

test('Haiku 5.5 switches to the long-prompt rate card above 100K prompt tokens, counting cache tokens', () => {
  const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-12, `${actual} != ${expected}`);
  const cost = (usage) => estimateAiCost('anthropic', 'claude-haiku-5-5', usage).costUsd;
  close(cost({ input_tokens: 3000, output_tokens: 1000 }), 0.0008);
  close(cost({ input_tokens: 100_000, output_tokens: 1000 }), (100_000 * 0.1 + 1000 * 0.5) / 1e6);
  close(cost({ input_tokens: 100_001, output_tokens: 1000 }), (100_001 * 0.5 + 1000 * 2.5) / 1e6);
  // A small uncached remainder still bills at the long rates when cache tokens push the prompt over.
  close(cost({ input_tokens: 2000, output_tokens: 1000, cache_read_input_tokens: 90_000, cache_creation_input_tokens: 10_000, cache_creation: { ephemeral_1h_input_tokens: 4000 } }),
    (2000 * 0.5 + 90_000 * 0.05 + 6000 * 0.5 * 1.25 + 4000 * 0.5 * 2 + 1000 * 2.5) / 1e6);
  close(cost({ input_tokens: 2000, output_tokens: 1000, cache_read_input_tokens: 98_000 }), (2000 * 0.1 + 98_000 * 0.01 + 1000 * 0.5) / 1e6);
  assert.equal(estimateAiCost('anthropic', 'claude-haiku-5-5', { input_tokens: 2000, output_tokens: 0, cache_read_input_tokens: 99_000 }).inputTokens, 101_000);
  close(estimateAiCost('anthropic', 'claude-sonnet-5-5', { input_tokens: 200_000, output_tokens: 0 }).costUsd, 0.4);
});

test('Claude refusals are a clear 422 and overloaded providers are retried, then reported as busy', async () => {
  const originalFetch = global.fetch;
  const credentials = resolveAiCredentials(new Headers({ 'x-ai-key': 'sk-ant-k' }), {}, false);
  const schema = z.object({ connected: z.boolean() });
  const ok = (body) => Response.json({ id: 'msg_test', type: 'message', role: 'assistant', model: body.model, content: [{ type: 'text', text: '{"connected":true}' }], stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 10, output_tokens: 5 } });
  const overloaded = () => Response.json({ type: 'error', error: { type: 'overloaded_error', message: 'x' } }, { status: 529, headers: { 'retry-after-ms': '1' } });
  try {
    global.fetch = async (url, init) => Response.json({ id: 'msg_test', type: 'message', role: 'assistant', model: JSON.parse(init.body).model, content: [{ type: 'text', text: '{"conn' }], stop_reason: 'refusal', stop_sequence: null, usage: { input_tokens: 10, output_tokens: 1 } });
    await assert.rejects(() => structuredAi(credentials, schema, 's', 'u', 64), (error) => publicAiError(error).status === 422 && /declined/.test(publicAiError(error).error));
    let calls = 0;
    global.fetch = async (url, init) => ++calls === 1 ? overloaded() : ok(JSON.parse(init.body));
    assert.deepEqual(await structuredAi(credentials, schema, 's', 'u', 64), { connected: true });
    assert.equal(calls, 2);
    calls = 0;
    global.fetch = async () => { calls++; return overloaded(); };
    await assert.rejects(() => structuredAi(credentials, schema, 's', 'u', 64), (error) => publicAiError(error).status === 503);
    assert.equal(calls, 3);
    assert.equal(publicAiError({ status: 401 }).status, 401);
    assert.equal(publicAiError({ status: 429 }).status, 429);
  } finally { global.fetch = originalFetch; }
});

test('Sonnet cache reads are priced at $0.20 per million', () => {
  assert.ok(Math.abs(estimateAiCost('anthropic', 'claude-sonnet-5-5', { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 1e6 }).costUsd - 0.2) < 1e-12);
});

test('state-changing routes refuse requests sent by other sites', () => {
  const { rejectCrossSite } = require('../lib/same-origin.ts');
  const req = (headers) => new Request('http://127.0.0.1:3000/api/plan', { method: 'POST', headers: { host: '127.0.0.1:3000', ...headers } });
  assert.equal(rejectCrossSite(req({ origin: 'http://127.0.0.1:3000', 'sec-fetch-site': 'same-origin' })), null);
  assert.equal(rejectCrossSite(req({})), null); // curl and other non-browser clients
  assert.equal(rejectCrossSite(req({ origin: 'https://finals.example', 'x-forwarded-host': 'finals.example' })), null); // behind a reverse proxy
  for (const headers of [
    { origin: 'https://evil.example', 'sec-fetch-site': 'cross-site' },
    { 'sec-fetch-site': 'same-site' },
    { origin: 'https://evil.example' },
    { origin: 'http://127.0.0.1:4000' },
    { origin: 'null' },
    { origin: 'not a url' },
  ]) assert.equal(rejectCrossSite(req(headers))?.status, 403, JSON.stringify(headers));
});

test('the AI-writing check runs on Sonnet even in economy mode, and its receipt says so', async () => {
  const resolve = (headers, fast, ignoreEconomy) => resolveAiCredentials(new Headers({ 'x-ai-key': 'sk-ant-k', ...headers }), {}, fast, ignoreEconomy).model;
  for (const economy of [{}, { 'x-ai-economy': 'true' }, { 'x-ai-economy': 'false' }]) {
    assert.equal(resolve(economy, false, true), 'claude-sonnet-5-5', JSON.stringify(economy));
    assert.equal(resolve(economy, true, false), 'claude-haiku-5-5', JSON.stringify(economy));
  }
  // Every other mode still follows economy.
  assert.equal(resolve({}, false), 'claude-haiku-5-5');
  assert.equal(resolve({ 'x-ai-economy': 'false' }, false), 'claude-sonnet-5-5');
  assert.equal(resolveAiCredentials(new Headers({ 'x-ai-provider': 'openai', 'x-ai-key': 'sk-visitor' }), {}, false, true).model, 'gpt-4.1-mini');

  const originalFetch = global.fetch;
  global.fetch = async (url, init) => Response.json({ id: 'msg_test', type: 'message', role: 'assistant', model: JSON.parse(init.body).model, content: [{ type: 'text', text: '{"connected":true}' }], stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 10, output_tokens: 5 } });
  try {
    const credentials = resolveAiCredentials(new Headers({ 'x-ai-key': 'sk-ant-k' }), {}, false, true);
    const response = await withAiUsage(async () => { await structuredAi(credentials, z.object({ connected: z.boolean() }), 's', 'u', 64); return Response.json({}); });
    assert.equal(JSON.parse(response.headers.get('x-ai-usage'))[0].model, 'claude-sonnet-5-5');
  } finally { global.fetch = originalFetch; }
});
