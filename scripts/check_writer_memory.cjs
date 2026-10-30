const assert = require('node:assert/strict');
const { test } = require('node:test');
const { buildMemory, CheckInput, memoryLines, memoryPrompt } = require('../lib/writer-memory.ts');

let clock = 0;
const grade = (essayId, levels) => ({ essayId, kind: 'grade', words: 800, createdAt: ++clock, data: { levels } });
const issues = (essayId, counts) => ({ essayId, kind: 'issues', words: 800, createdAt: ++clock, data: { counts } });

test('a trait that fails on two essays and still fails is a weak spot', () => {
  const m = buildMemory([grade('a', { evidence: 2, thesis: 3 }), grade('b', { evidence: 3, thesis: 3 }), grade('c', { evidence: 1, thesis: 3 })]);
  assert.deepEqual(m.weak, [{ key: 'evidence', name: 'Evidence & analysis', failed: 2, of: 3 }]);
  assert.deepEqual(m.improved, []);
  assert.equal(memoryLines(m)[0], 'Evidence & analysis failed on 2 of your last 3 graded essays.');
});

test('only each essay\'s latest grade counts', () => {
  const m = buildMemory([grade('a', { evidence: 1 }), grade('a', { evidence: 3 }), grade('b', { evidence: 2 })]);
  assert.deepEqual(m.weak, [], 'essay a now passes, so only one essay fails');
  assert.equal(m.essays, 2);
});

test('a trait that failed before and passes on the latest essay is an improvement, not a weak spot', () => {
  const m = buildMemory([grade('a', { organization: 1 }), grade('b', { organization: 2 }), grade('c', { organization: 3 })]);
  assert.deepEqual(m.weak, []);
  assert.deepEqual(m.improved, [{ key: 'organization', name: 'Organization' }]);
});

test('a note category in an essay\'s top two on two essays recurs', () => {
  const m = buildMemory([issues('a', { Clarity: 5, Grammar: 2, Analysis: 1 }), issues('b', { Clarity: 1, Analysis: 4, Grammar: 0 }), issues('c', { Structure: 3 })]);
  assert.deepEqual(m.categories, [{ category: 'Clarity', essays: 2 }]);
});

test('nothing is said until two essays have been checked', () => {
  const m = buildMemory([grade('a', { evidence: 1 }), issues('a', { Clarity: 3 })]);
  assert.deepEqual(memoryLines(m), []);
  assert.equal(memoryPrompt(m), '');
});

test('the prompt names the weak spots, stays short, and warns against inventing problems', () => {
  const p = memoryPrompt(buildMemory([grade('a', { evidence: 1, thesis: 2 }), grade('b', { evidence: 2, thesis: 1 }), issues('a', { Clarity: 2 }), issues('b', { Clarity: 3 })]));
  assert.match(p, /Thesis \(failed on 2 of 2 essays\)/);
  assert.match(p, /Clarity notes/);
  assert.match(p, /do not report a problem this draft doesn't have/);
  assert.ok(p.length <= 400);
});

test('check input accepts levels and counts and rejects anything else', () => {
  assert.ok(CheckInput.safeParse({ kind: 'grade', words: 10, levels: { evidence: 3 } }).success);
  assert.ok(CheckInput.safeParse({ kind: 'issues', words: 10, counts: { Clarity: 2 } }).success);
  assert.ok(!CheckInput.safeParse({ kind: 'grade', words: 10, levels: { evidence: 7 } }).success);
  assert.ok(!CheckInput.safeParse({ kind: 'issues', words: 10, counts: { Spelling: 1 } }).success);
  assert.ok(!CheckInput.safeParse({ kind: 'notes', words: 10 }).success);
});

test('when everything fails, the heaviest traits lead and a recurring category still gets a line', () => {
  const all = (n) => ({ prompt: n, thesis: n, evidence: n, organization: n, sophistication: n, language: n });
  const m = buildMemory([grade('a', all(2)), grade('b', all(2)), issues('a', { Analysis: 4 }), issues('b', { Analysis: 2 })]);
  assert.deepEqual(m.weak.slice(0, 2).map((w) => w.key), ['evidence', 'prompt']);
  assert.deepEqual(memoryLines(m), [
    'Evidence & analysis failed on 2 of your last 2 graded essays.',
    'Answers the prompt failed on 2 of your last 2 graded essays.',
    'Analysis notes were among your most frequent on 2 essays.',
  ]);
});
