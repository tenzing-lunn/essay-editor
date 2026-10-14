const assert = require('node:assert/strict');
const { test, beforeEach } = require('node:test');
const { encodeShare, decodeShare, shareEnabled, SharePayload, ShareRequest, STEP_MAX, TITLE_MAX } = require('../lib/server/share.ts');
const { TRAITS, computeGrade } = require('../lib/essay-grade.ts');

// A throwaway secret for these tests only; a real one lives in .env.local and never here.
const SECRET = 'check-share-test-secret-not-real';
const levels = Object.fromEntries(TRAITS.map((t, i) => [t.key, (i % 3) + 1]));
const { percent, letter } = computeGrade(levels, true);
const report = (patch = {}) => ({
  v: 1, letter, percent, traits: TRAITS.map((t) => ({ key: t.key, level: levels[t.key] })),
  steps: ['Cut the second body paragraph to one claim.', 'Quote the creature, not the summary of him.', 'Name the counterargument in the thesis.'],
  at: '2026-10-12T15:04:05.000Z', title: 'Frankenstein draft 2', ...patch,
});
const flip = (s, i) => s.slice(0, i) + (s[i] === 'A' ? 'B' : 'A') + s.slice(i + 1);

beforeEach(() => { process.env.SHARE_SECRET = SECRET; });

test('a report round-trips through the link and the link is URL-safe', () => {
  const d = encodeShare(report());
  assert.match(d, /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/);
  assert.deepEqual(decodeShare(d), report());
  const untitled = report({ title: undefined });
  delete untitled.title;
  assert.deepEqual(decodeShare(encodeShare(untitled)), untitled);
});

test('a tampered payload, a tampered signature, a truncated link and junk all fail to verify', () => {
  const d = encodeShare(report());
  const [data, sig] = d.split('.');
  assert.equal(decodeShare(`${flip(data, 10)}.${sig}`), null, 'payload byte changed');
  assert.equal(decodeShare(`${data}.${flip(sig, 5)}`), null, 'signature byte changed');
  const forged = Buffer.from(JSON.stringify(report({ percent: 96, letter: 'A' }))).toString('base64url');
  assert.equal(decodeShare(`${forged}.${sig}`), null, 'new payload under the old signature');
  for (const bad of [d.slice(0, -1), d.slice(0, d.indexOf('.')), d.slice(0, 20), `${d}.extra`, `.${sig}`, `${data}.`, '', 'garbage', 'a.b', 'x'.repeat(5000)]) {
    assert.equal(decodeShare(bad), null, JSON.stringify(bad.slice(0, 30)));
  }
  for (const notAString of [undefined, null, 42, ['a', 'b'], { d }]) assert.equal(decodeShare(notAString), null);
});

test('a link signed under one secret does not verify under another', () => {
  const d = encodeShare(report());
  process.env.SHARE_SECRET = 'a-different-secret-of-decent-length';
  assert.equal(decodeShare(d), null);
  process.env.SHARE_SECRET = SECRET;
  assert.ok(decodeShare(d));
});

test('sharing is off without a real secret', () => {
  for (const missing of [undefined, '', 'short']) {
    if (missing === undefined) delete process.env.SHARE_SECRET; else process.env.SHARE_SECRET = missing;
    assert.equal(shareEnabled(), false, JSON.stringify(missing));
    assert.throws(() => encodeShare(report()), /SHARE_SECRET/);
  }
  process.env.SHARE_SECRET = SECRET;
  const d = encodeShare(report());
  delete process.env.SHARE_SECRET;
  assert.equal(decodeShare(d), null, 'a valid link is refused when the secret is gone');
  assert.equal(shareEnabled(), false);
});

test('length caps are enforced at the edge', () => {
  assert.ok(SharePayload.safeParse(report({ steps: ['x'.repeat(STEP_MAX)] })).success);
  assert.equal(SharePayload.safeParse(report({ steps: ['x'.repeat(STEP_MAX + 1)] })).success, false);
  assert.ok(SharePayload.safeParse(report({ title: 't'.repeat(TITLE_MAX) })).success);
  assert.equal(SharePayload.safeParse(report({ title: 't'.repeat(TITLE_MAX + 1) })).success, false);
  assert.throws(() => encodeShare(report({ steps: ['x'.repeat(STEP_MAX + 1)] })), 'encoding validates too');
});

test('the payload schema rejects anything that is not a report', () => {
  const bad = (patch, why) => assert.equal(SharePayload.safeParse(report(patch)).success, false, why);
  bad({ traits: [{ key: 'style', level: 2 }] }, 'unknown trait key');
  bad({ traits: [...report().traits, { key: 'thesis', level: 2 }] }, 'duplicate trait');
  bad({ traits: [] }, 'no traits');
  bad({ traits: [{ key: 'thesis', level: 5 }] }, 'level above 4');
  bad({ traits: [{ key: 'thesis', level: 2.5 }] }, 'fractional level');
  bad({ steps: [...report().steps, 'A fourth step.'] }, 'a fourth step');
  bad({ steps: [''] }, 'an empty step');
  bad({ title: 't'.repeat(TITLE_MAX + 1) }, 'title over the cap');
  bad({ text: 'The whole essay.' }, 'extra field: essay text');
  bad({ username: 'ada' }, 'extra field: username');
  bad({ essayId: '123' }, 'extra field: essay id');
  bad({ percent: 101 }, 'percent over 100');
  bad({ percent: 81.5 }, 'fractional percent');
  bad({ letter: 'Z', percent: 81 }, 'letter outside the scale');
  bad({ letter: 'A', percent: 40 }, 'letter that does not match the percent');
  bad({ v: 2 }, 'unknown version');
  bad({ at: 'yesterday' }, 'not an ISO date');
  assert.ok(SharePayload.safeParse(report({ steps: [] })).success, 'no steps is allowed');
});

test('the request schema reduces a Grade to the payload and drops everything else', () => {
  const grade = {
    percent, letter, capped: false, promptScored: true, thesis: 'Creon confuses law with justice.',
    traits: TRAITS.map((t) => ({ key: t.key, name: t.name, weight: t.weight, level: levels[t.key], label: 'x', evidence: ['a quote from the essay'], strengths: 's', weaknesses: 'w' })),
    requirements: [{ requirement: 'Use two quotations', evidence: 'a quote', status: 'met', note: '' }],
    nextSteps: report().steps.map((step) => ({ trait: 'evidence', step })),
    text: 'The whole essay pasted in by mistake.',
  };
  const out = ShareRequest.safeParse({ grade, title: '  Draft 2  ' });
  assert.ok(out.success, out.error?.message);
  const json = JSON.stringify(out.data);
  for (const leak of ['"thesis":', '"evidence":', '"requirements":', '"strengths":', '"weaknesses":', '"text":', 'confuses law', 'whole essay', 'a quote']) assert.ok(!json.includes(leak), leak);
  assert.equal(out.data.title, 'Draft 2');
  assert.deepEqual(out.data.traits, report().traits);
  assert.deepEqual(out.data.steps, report().steps);
  assert.ok(decodeShare(encodeShare(out.data)));
  assert.equal('title' in ShareRequest.parse({ grade, title: '   ' }), false, 'a blank title is left out');
  assert.equal(ShareRequest.safeParse({ grade: { ...grade, nextSteps: [...grade.nextSteps, { trait: 'thesis', step: 'four' }] } }).success, false, 'four steps');
  assert.equal(ShareRequest.safeParse({ grade: { ...grade, traits: [{ key: 'style', level: 2 }] } }).success, false, 'unknown trait');
  assert.equal(ShareRequest.safeParse({ grade: { ...grade, letter: 'A', percent: 40 } }).success, false, 'inconsistent letter');
  assert.equal(ShareRequest.safeParse({ grade, title: 't'.repeat(TITLE_MAX + 1) }).success, false, 'long title');
  assert.equal(ShareRequest.safeParse({ title: 'no grade' }).success, false);
});
