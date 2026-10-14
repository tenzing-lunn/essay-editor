const { test } = require('node:test');
const assert = require('node:assert/strict');
const { resolveAiCredentials, AiError } = require('../lib/ai-config.ts');
const { freeLimit, freeBudget, reserveFree, peekFree, freeStatus, freeGate, freeConnection, exhaustedMessage, pausedMessage, CHECK_REQUESTS } = require('../lib/server/ai-quota.ts');
const { withAiUsage, recordAiUsage } = require('../lib/ai-usage.ts');
const { aiFetch, readAiFree, clearAiFree, primeAiFree, saveAiSettings } = require('../lib/ai-client.ts');

const ENV = { AI_PROVIDER: 'anthropic', ANTHROPIC_API_KEY: 'sk-ant-owner-secret', AI_FREE_CHECKS_PER_ACCOUNT: '3', AI_FREE_BUDGET_USD: '10' };
const NOW = new Date('2026-10-12T15:00:00Z');
const later = (minutes) => new Date(NOW.getTime() + minutes * 60_000); // checks three minutes apart never share a window
const RESETS = '2026-11-01T00:00:00.000Z';
const me = async () => ({ id: 'user-1' });
const nobody = async () => null;
const failing = (status) => Object.assign(new Error('provider body with sk-secret'), { status });

// Simulates the statements ai-quota runs, keyed like the ai_quota and ai_free_spend primary keys. A request joins the
// open check (started after params[4], fewer than params[6] requests) or opens one while checks are left; nothing is
// written once the month's spend reaches params[5]. The real SQL runs against Postgres in the live checks.
function fakeDb() {
  const rows = new Map(); const spend = new Map(); const calls = [];
  const db = async (text, params) => {
    const key = `${params[0]}|${params[1]}`;
    if (text.startsWith('INSERT INTO ai_free_spend')) { calls.push('SPEND'); spend.set(params[0], (spend.get(params[0]) ?? 0) + params[1]); return []; }
    if (text.startsWith('INSERT INTO ai_quota')) {
      calls.push('INSERT');
      const [, month, limit, at, openAfter, budget, cap] = params;
      if ((spend.get(month) ?? 0) >= budget) return [];
      const row = rows.get(key);
      if (!row) { rows.set(key, { used: 1, started: at, requests: 1 }); return [{ used: 1 }]; }
      const open = row.started !== null && row.started > openAfter && row.requests < cap;
      if (!open && row.used >= limit) return [];
      if (open) row.requests += 1; else Object.assign(row, { used: row.used + 1, started: at, requests: 1 });
      return [{ used: row.used }];
    }
    if (text.startsWith('UPDATE ai_quota')) {
      calls.push('REFUND');
      const row = rows.get(key);
      if (!row || row.requests <= 0) return [];
      if (row.requests === 1) Object.assign(row, { used: Math.max(row.used - 1, 0), started: null });
      row.requests -= 1; return [{ used: row.used }];
    }
    if (text.startsWith('SELECT')) { calls.push('SELECT'); return [{ used: rows.get(key)?.used ?? null, spent: spend.has(params[1]) ? String(spend.get(params[1])) : null }]; }
    throw new Error(`unexpected statement: ${text}`);
  };
  const used = (user = 'user-1', month = '2026-10-01') => rows.get(`${user}|${month}`)?.used;
  return { db, rows, spend, calls, used };
}

test('the free door is closed without both variables, without a well-formed server key for AI_PROVIDER, or with the unlimited switch on', () => {
  assert.equal(freeLimit({}), 0);
  assert.equal(freeLimit(ENV), 3);
  assert.equal(freeLimit({ ...ENV, AI_FREE_CHECKS_PER_ACCOUNT: '0' }), 0);
  assert.equal(freeLimit({ ...ENV, AI_FREE_CHECKS_PER_ACCOUNT: 'many' }), 0);
  for (const budget of [undefined, '0', '-5', 'lots']) assert.equal(freeLimit({ ...ENV, AI_FREE_BUDGET_USD: budget }), 0, `no monthly budget (${budget}), no free door`);
  assert.equal(freeBudget({ AI_FREE_BUDGET_USD: '12.5' }), 12_500_000);
  assert.equal(freeLimit({ ...ENV, ANTHROPIC_API_KEY: ' ' }), 0);
  assert.equal(freeLimit({ ...ENV, ANTHROPIC_API_KEY: 'sk-owner' }), 0, 'a malformed key would fail every free check with a key error');
  assert.equal(freeLimit({ ...ENV, AI_PROVIDER: 'openai', OPENAI_API_KEY: 'sk-ant-owner' }), 0);
  assert.equal(freeLimit({ ...ENV, AI_PROVIDER: 'openai' }), 0);
  assert.equal(freeLimit({ ...ENV, AI_PROVIDER: 'openai', OPENAI_API_KEY: 'sk-owner' }), 3);
  assert.equal(freeLimit({ ...ENV, AI_ALLOW_SERVER_KEY: 'true' }), 0);
});

test('checks count up and refuse past the limit', async () => {
  const { db, used } = fakeDb();
  const first = await reserveFree(new Headers(), ENV, me, { db, now: NOW });
  assert.deepEqual(first, { free: { used: 1, limit: 3, resetsAt: RESETS }, granted: true, paused: false, userId: 'user-1', month: '2026-10-01' });
  const rest = [];
  for (const minutes of [3, 6, 9]) rest.push(await reserveFree(new Headers(), ENV, me, { db, now: later(minutes) }));
  assert.deepEqual(rest.map((slot) => [slot.granted, slot.paused, slot.free.used]), [[true, false, 2], [true, false, 3], [false, false, 3]]);
  assert.equal(used(), 3, 'the count never goes past the limit');
  assert.equal((await reserveFree(new Headers(), ENV, async () => ({ id: 'user-2' }), { db, now: NOW })).free.used, 1, 'accounts are counted apart');
});

test('one click is one check: requests within two minutes of the first share it, up to forty', async () => {
  const { db, used, rows } = fakeDb();
  // Check my essay: a request per paragraph plus the grade, all at once.
  const click = await Promise.all(Array.from({ length: 6 }, () => reserveFree(new Headers(), ENV, me, { db, now: NOW })));
  assert.ok(click.every((slot) => slot.granted && slot.free.used === 1), 'six parallel requests, one check');
  assert.equal((await reserveFree(new Headers(), ENV, me, { db, now: new Date(NOW.getTime() + 119_000) })).free.used, 1, 'still the same click');
  assert.equal((await reserveFree(new Headers(), ENV, me, { db, now: new Date(NOW.getTime() + 121_000) })).free.used, 2, 'two minutes on, a new check');
  // A check holds at most forty requests, so a script cannot stretch one check forever.
  const window = rows.get('user-1|2026-10-01');
  window.requests = CHECK_REQUESTS;
  assert.equal((await reserveFree(new Headers(), ENV, me, { db, now: new Date(NOW.getTime() + 122_000) })).free.used, 3, 'the forty-first request opens a new check');
  // With no checks left, an open check still finishes, and nothing new opens.
  assert.deepEqual([(await reserveFree(new Headers(), ENV, me, { db, now: new Date(NOW.getTime() + 123_000) })).granted, used()], [true, 3]);
  assert.deepEqual([(await reserveFree(new Headers(), ENV, me, { db, now: later(10) })).granted, used()], [false, 3]);
});

test('a new month starts at zero', async () => {
  const { db } = fakeDb();
  const late = (minutes) => new Date(Date.parse('2026-10-31T23:40:00Z') + minutes * 60_000);
  for (let i = 0; i < 3; i++) assert.equal((await reserveFree(new Headers(), ENV, me, { db, now: late(i * 3) })).granted, true);
  assert.equal((await reserveFree(new Headers(), ENV, me, { db, now: late(12) })).granted, false);
  const next = await reserveFree(new Headers(), ENV, me, { db, now: new Date('2026-11-01T00:00:00Z') });
  assert.deepEqual([next.granted, next.free.used, next.month, next.free.resetsAt], [true, 1, '2026-11-01', '2026-12-01T00:00:00.000Z']);
});

test('the count can be read without spending a check, for the button on page load', async () => {
  const { db, rows, calls } = fakeDb();
  assert.deepEqual(await peekFree(new Headers(), ENV, me, { db, now: NOW }), { used: 0, limit: 3, resetsAt: RESETS });
  assert.equal(rows.size, 0, 'reading writes no row');
  await reserveFree(new Headers(), ENV, me, { db, now: NOW });
  const status = await freeStatus(new Headers(), ENV, me, { db, now: NOW });
  assert.deepEqual(await status.json(), { free: { used: 1, limit: 3, resetsAt: RESETS } });
  assert.deepEqual(JSON.parse(status.headers.get('x-ai-free')), { used: 1, limit: 3, resetsAt: RESETS }, 'the same header every check carries');
  assert.equal(status.headers.get('cache-control'), 'no-store');
  assert.deepEqual(calls, ['SELECT', 'INSERT', 'SELECT']);
  // Silent in the same cases as a reservation: a visitor key, a closed door, nobody signed in.
  for (const [headers, env, who] of [[new Headers({ 'x-ai-key': 'sk-ant-visitor' }), ENV, me], [new Headers(), { ...ENV, AI_FREE_CHECKS_PER_ACCOUNT: '0' }, me], [new Headers(), ENV, nobody]]) {
    const response = await freeStatus(headers, env, who, { db, now: NOW });
    assert.deepEqual(await response.json(), { free: null }); assert.equal(response.headers.get('x-ai-free'), null);
  }
  assert.equal(calls.length, 3, 'no query when the allowance cannot apply');
});

test('the quota is never touched for a visitor key, a closed door, or a signed-out visitor', async () => {
  const { db, calls } = fakeDb();
  let asked = 0; const counted = async () => { asked++; return { id: 'user-1' }; };
  for (const headers of [new Headers({ 'x-ai-key': 'sk-ant-visitor' }), new Headers({ 'x-ai-key': '' })]) assert.equal(await reserveFree(headers, ENV, counted, { db }), null);
  assert.equal(await reserveFree(new Headers(), { ...ENV, AI_FREE_CHECKS_PER_ACCOUNT: '0' }, counted, { db }), null);
  assert.equal(asked, 0, 'no session lookup when the allowance cannot apply');
  assert.equal(await reserveFree(new Headers(), ENV, nobody, { db }), null);
  // Through the gate a visitor key goes straight to the work with no count attached, and an invalid one fails as it did before.
  const visitor = new Headers({ 'x-ai-key': 'sk-ant-visitor', 'x-ai-economy': 'false' });
  const own = await freeGate(visitor, ENV, counted, async (free) => ({ free, ...resolveAiCredentials(visitor, ENV, false) }), { db });
  assert.equal(own.headers.get('x-ai-free'), null);
  assert.deepEqual(await own.json(), { free: null, provider: 'anthropic', apiKey: 'sk-ant-visitor', economy: false, model: 'claude-sonnet-5-5' });
  const bad = new Headers({ 'x-ai-key': 'bad key' });
  const rejected = await freeGate(bad, ENV, counted, async () => resolveAiCredentials(bad, ENV, false), { db });
  assert.equal(rejected.status, 400); assert.equal(rejected.headers.get('x-ai-free'), null);
  // Signed out with no key: today's 401, word for word.
  const signedOut = await freeGate(new Headers(), ENV, nobody, async () => resolveAiCredentials(new Headers(), ENV, false), { db });
  assert.equal(signedOut.status, 401);
  assert.deepEqual(await signedOut.json(), { error: 'Connect your API key in AI settings to use AI tools.' });
  assert.equal(calls.length, 0);
});

test('a free check runs on the server key with the economy model, and only inside the gate', async () => {
  const { db } = fakeDb();
  const headers = new Headers({ 'x-ai-economy': 'false', 'x-ai-provider': 'openai' });
  assert.throws(() => resolveAiCredentials(headers, ENV, false), /Connect your API key/, 'outside the gate nothing changed');
  const response = await freeGate(headers, ENV, me, async () => resolveAiCredentials(headers, ENV, false), { db, now: NOW });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { provider: 'anthropic', apiKey: 'sk-ant-owner-secret', economy: true, model: 'claude-haiku-5-5' });
  assert.deepEqual(JSON.parse(response.headers.get('x-ai-free')), { used: 1, limit: 3, resetsAt: RESETS });
  // The explicit parameter says the same, and a visitor key wins over it every time.
  assert.equal(resolveAiCredentials(new Headers(), ENV, false, true).apiKey, 'sk-ant-owner-secret');
  assert.equal(resolveAiCredentials(new Headers({ 'x-ai-economy': 'false' }), ENV, false, true).model, 'claude-haiku-5-5');
  assert.equal(resolveAiCredentials(new Headers({ 'x-ai-key': 'sk-ant-visitor', 'x-ai-economy': 'false' }), ENV, false, true).model, 'claude-sonnet-5-5');
  assert.throws(() => resolveAiCredentials(new Headers({ 'x-ai-key': '' }), ENV, false, true), /Connect your API key/);
});

test('the check after the last one is a 402 that says what to do, with the count in its header', async () => {
  const { db } = fakeDb();
  let click = 0;
  const ask = () => freeGate(new Headers(), ENV, me, async () => ({ ok: true }), { db, now: later(3 * click++) });
  for (let i = 1; i <= 3; i++) {
    const response = await ask();
    assert.equal(response.status, 200);
    assert.deepEqual(JSON.parse(response.headers.get('x-ai-free')), { used: i, limit: 3, resetsAt: RESETS });
  }
  const refused = await ask();
  assert.equal(refused.status, 402);
  assert.deepEqual(await refused.json(), { error: "You've used this month's 3 free checks. Connect your own API key for unlimited checks, billed by your provider." });
  assert.deepEqual(JSON.parse(refused.headers.get('x-ai-free')), { used: 3, limit: 3, resetsAt: RESETS });
  assert.match(exhaustedMessage(12), /API key/i, 'KeyErrorLink appends its Connect-your-key link to messages matching /API key/i');
});

test('a check is given back only when the provider was unavailable or the server key failed', async () => {
  const { db, used } = fakeDb();
  let click = 0;
  const outcome = async (error) => {
    const response = await freeGate(new Headers(), ENV, me, async () => { throw error; }, { db, now: later(3 * click++) });
    const body = await response.json();
    assert.doesNotMatch(body.error, /sk-secret/);
    return [response.status, JSON.parse(response.headers.get('x-ai-free')).used, used()];
  };
  assert.deepEqual(await outcome(failing(529)), [503, 0, 0], 'overloaded: refunded');
  assert.deepEqual(await outcome(failing(429)), [429, 0, 0], 'out of credit: refunded');
  assert.deepEqual(await outcome(new TypeError('fetch failed')), [502, 0, 0], 'never reached the provider: refunded');
  assert.deepEqual(await outcome(failing(undefined)), [502, 0, 0], "the SDK's connection error carries status undefined: refunded");
  assert.deepEqual(await outcome(new Error('No model output')), [502, 0, 0], 'nothing usable came back: refunded');
  assert.deepEqual(await outcome(new AiError('Claude keys start with sk-ant-. Check you chose the right provider.', 400)), [400, 0, 0], 'malformed server key: refunded, the writer typed no key');
  assert.deepEqual(await outcome(failing(401)), [401, 0, 0], 'server key rejected: refunded, the writer cannot fix it');
  assert.deepEqual(await outcome(new AiError('The provider declined this request.', 422)), [422, 1, 1], 'refusal: kept');
  assert.deepEqual(await outcome(failing(400)), [502, 2, 2], 'bad request to the provider: kept');
  assert.deepEqual(await outcome(new AiError('The provider declined this request.', 422)), [422, 3, 3], 'another refusal: kept');
  assert.deepEqual(await outcome(failing(503)), [402, 3, 3], 'nothing was reserved, so nothing to give back');
});

test('a click is given back only when every request in it was', async () => {
  const { db, used } = fakeDb();
  const run = (fail) => freeGate(new Headers(), ENV, me, async () => { if (fail) throw failing(529); return { ok: true }; }, { db, now: NOW });
  // The provider is down for the whole click: each request is given back, and with the last one the check.
  const down = await Promise.all([1, 2, 3].map(() => run(true)));
  assert.deepEqual([down.map((r) => r.status), used()], [[503, 503, 503], 0]);
  // Two paragraphs answered and one did not: the writer got feedback, so the check stays spent.
  const mixed = await Promise.all([false, true, false].map(run));
  assert.deepEqual([mixed.map((r) => r.status), used()], [[200, 503, 200], 1]);
});

test("the month's budget is a hard ceiling across every account, open checks included", async () => {
  const { db, spend, calls } = fakeDb();
  const env = { ...ENV, AI_FREE_BUDGET_USD: '0.002' }; // 2,000 millionths of a dollar
  const priced = (input, output) => async () => { recordAiUsage({ provider: 'anthropic', model: 'claude-haiku-5-5' }, { input_tokens: input, output_tokens: output }); return { ok: true }; };
  const gate = (who, work, now = NOW) => withAiUsage(() => freeGate(new Headers(), env, who, work, { db, now }));
  // What the provider billed is added: 3,000 in and 1,000 out on the economy model is 800 millionths.
  assert.equal((await gate(me, priced(3000, 1000))).status, 200);
  assert.equal(spend.get('2026-10-01'), 800);
  // A request that never got an answer costs nothing; a request outside any receipt scope is charged the pessimistic 0.05.
  assert.equal((await gate(me, async () => { throw failing(529); })).status, 503);
  assert.equal(spend.get('2026-10-01'), 800);
  assert.equal((await freeGate(new Headers(), { ...ENV }, async () => ({ id: 'user-9' }), async () => ({ ok: true }), { db, now: NOW })).status, 200);
  assert.equal(spend.get('2026-10-01'), 50_800, 'unknown cost counts as five cents');
  // Spent: a brand-new account is refused, and so is an account in the middle of its open check.
  const fresh = await gate(async () => ({ id: 'user-new' }), priced(1, 1));
  assert.equal(fresh.status, 402);
  const message = (await fresh.json()).error;
  assert.equal(message, pausedMessage(RESETS));
  assert.match(message, /paused until November 1.*API key/, 'says when, and KeyErrorLink adds the connect link');
  assert.deepEqual(JSON.parse(fresh.headers.get('x-ai-free')), { used: 3, limit: 3, resetsAt: RESETS }, 'the button reads used up');
  assert.equal((await gate(me, priced(1, 1))).status, 402, 'an open check stops too');
  // The page-load count and the connection test say the same.
  assert.deepEqual(await peekFree(new Headers(), env, me, { db, now: NOW }), { used: 3, limit: 3, resetsAt: RESETS });
  const test = await freeConnection(new Headers(), env, me, { db, now: NOW });
  assert.deepEqual([test.status, (await test.json()).error], [402, pausedMessage(RESETS)]);
  // A visitor's own key is never counted against it and never stopped by it.
  const before = calls.length;
  const own = new Headers({ 'x-ai-key': 'sk-ant-visitor' });
  assert.equal((await withAiUsage(() => freeGate(own, env, me, priced(1, 1), { db, now: NOW }))).status, 200);
  assert.equal(calls.length, before);
  // The 1st starts a fresh budget.
  assert.equal((await gate(me, priced(1, 1), new Date('2026-11-01T00:00:00Z'))).status, 200);
});

test('the connection test on the allowance spends no check and calls no provider', async () => {
  const { db, rows, calls } = fakeDb();
  const ok = await freeConnection(new Headers(), ENV, me, { db, now: NOW });
  assert.deepEqual([ok.status, await ok.json()], [200, { ok: true, model: 'claude-haiku-5-5', free: { used: 0, limit: 3, resetsAt: RESETS } }]);
  assert.deepEqual(JSON.parse(ok.headers.get('x-ai-free')), { used: 0, limit: 3, resetsAt: RESETS });
  assert.deepEqual([calls, rows.size], [['SELECT'], 0], 'read, never reserved');
  for (let i = 0; i < 3; i++) await reserveFree(new Headers(), ENV, me, { db, now: later(3 * i) });
  const usedUp = await freeConnection(new Headers(), ENV, me, { db, now: NOW });
  assert.deepEqual([usedUp.status, (await usedUp.json()).error], [402, exhaustedMessage(3)], 'used up says so instead of Connected');
  assert.equal(await freeConnection(new Headers({ 'x-ai-key': 'sk-ant-visitor' }), ENV, me, { db, now: NOW }), null, 'a visitor key is tested with the provider');
});

test('the browser keeps the latest count from x-ai-free and tells the AI button', async () => {
  const originals = { window: global.window, sessionStorage: global.sessionStorage, fetch: global.fetch };
  const storage = new Map(); const events = [];
  global.window = { dispatchEvent: (event) => events.push(event.type) };
  global.sessionStorage = { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: (key) => storage.delete(key) };
  const serve = (status, free) => async () => Response.json({ status }, { status, headers: free === undefined ? {} : { 'x-ai-free': typeof free === 'string' ? free : JSON.stringify(free) } });
  try {
    assert.equal(readAiFree(), null);
    const free = { used: 2, limit: 3, resetsAt: '2999-01-01T00:00:00.000Z' };
    global.fetch = serve(200, free); await aiFetch('/api/ai');
    assert.deepEqual(readAiFree(), free);
    assert.deepEqual(JSON.parse(storage.get('finals:ai-free:v1')), free);
    assert.ok(events.includes('ai-free-change'));
    // Six parallel checks reserve 1..6 and answer in any order: a late answer with a smaller count for the same month is ignored.
    global.fetch = serve(200, { ...free, used: 1 }); await aiFetch('/api/ai'); assert.equal(readAiFree().used, 2, 'an older answer arriving late');
    global.fetch = serve(200, { ...free, used: 1, resetsAt: '2999-02-01T00:00:00.000Z' }); await aiFetch('/api/ai'); assert.equal(readAiFree().used, 1, 'a new month starts lower');
    global.fetch = serve(200, free); await aiFetch('/api/ai'); assert.deepEqual(readAiFree(), free);
    // A response without the header (a visitor key, or the door closed) leaves the last count alone; garbage is ignored.
    global.fetch = serve(200); await aiFetch('/api/ai'); assert.deepEqual(readAiFree(), free);
    global.fetch = serve(200, '{"used":"two","limit":3}'); await aiFetch('/api/ai'); assert.deepEqual(readAiFree(), free);
    global.fetch = serve(200, 'not json'); await aiFetch('/api/ai'); assert.deepEqual(readAiFree(), free);
    // The 402 carries the header too, so the button turns to "used up" without another request.
    global.fetch = serve(402, { ...free, used: 3 }); await aiFetch('/api/ai'); assert.equal(readAiFree().used, 3);
    clearAiFree(); assert.equal(readAiFree(), null); assert.equal(storage.size, 0);
    // A count from a month that has ended is not shown.
    global.fetch = serve(200, { ...free, resetsAt: '2000-01-01T00:00:00.000Z' }); await aiFetch('/api/ai'); assert.equal(readAiFree(), null);
    // On page load the button asks once, with GET and no key header, even when a count is stored: a reload or another tab may be behind.
    global.fetch = serve(200, { ...free, used: 2 }); await aiFetch('/api/ai'); assert.equal(readAiFree().used, 2);
    const asked = [];
    global.fetch = async (url, init) => { asked.push([url, init.method, init.headers.get('x-ai-key')]); return serve(200, { ...free, used: 6 })(); };
    saveAiSettings({ provider: 'anthropic', apiKey: 'sk-ant-visitor', economy: true }); primeAiFree();
    assert.deepEqual(asked, [], 'a saved key shows its own label; nothing to ask');
    saveAiSettings(null); primeAiFree(); await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(asked, [['/api/ai/connection', 'GET', null]], 'disconnecting the key asks once');
    assert.equal(readAiFree().used, 6, 'the stored count catches up');
    primeAiFree(); clearAiFree(); primeAiFree(); await new Promise((resolve) => setImmediate(resolve));
    assert.equal(asked.length, 1, 'once per page load');
  } finally { clearAiFree(); Object.assign(global, originals); }
});
