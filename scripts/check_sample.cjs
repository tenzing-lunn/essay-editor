const assert = require('node:assert/strict');
const { test } = require('node:test');
const { SAMPLE_ESSAY_PARAGRAPHS, SAMPLE_ESSAY_TEXT } = require('../lib/sample-essay.ts');
const { computeGrade, LEVEL_NAMES, TRAITS } = require('../lib/essay-grade.ts');
const { ISSUE_CATEGORIES } = require('../lib/essay-issues.ts');
const { SAMPLE_GRADE, SAMPLE_ISSUES, SAMPLE_LEVELS, markSegments } = require('../lib/sample-results.ts');

const count = (hay, needle) => hay.split(needle).length - 1;
const words = (s) => s.trim().split(/\s+/).length;

test('six to eight suggestions, each quoting the sample essay exactly once, in its own paragraph', () => {
  assert.ok(SAMPLE_ISSUES.length >= 6 && SAMPLE_ISSUES.length <= 8, String(SAMPLE_ISSUES.length));
  for (const s of SAMPLE_ISSUES) {
    assert.equal(count(SAMPLE_ESSAY_TEXT, s.quote), 1, s.quote);
    assert.equal(count(SAMPLE_ESSAY_PARAGRAPHS[s.paragraphId], s.quote), 1, `paragraph ${s.paragraphId}: ${s.quote}`);
    assert.ok(ISSUE_CATEGORIES.includes(s.category), s.category);
  }
});

test('the documented flaws are all covered', () => {
  const quotes = SAMPLE_ISSUES.map((s) => s.quote).join('\n');
  for (const flaw of ['sympathy, he is making threats', 'effected', 'This quote is very important', 'both Victor and the creature are responsible', 'Society has always rejected', 'Mary Shelley wrote the novel', 'In conclusion'])
    assert.ok(quotes.includes(flaw), flaw);
});

test('drop-in replacements exist for the comma splice and the wrong word, and differ from the quote', () => {
  const fixes = SAMPLE_ISSUES.filter((s) => s.replacement !== undefined);
  for (const s of fixes) { assert.ok(s.replacement.trim()); assert.notEqual(s.replacement, s.quote, s.quote); }
  assert.ok(fixes.some((s) => s.category === 'Grammar'));
  assert.ok(fixes.some((s) => s.category === 'Wrong word'));
});

test('notes are in the product voice: under 45 words, no exclamation marks', () => {
  for (const s of SAMPLE_ISSUES) { assert.ok(words(s.note) < 45, s.note); assert.ok(!s.note.includes('!'), s.note); }
  for (const n of SAMPLE_GRADE.nextSteps) assert.ok(words(n.step) <= 30, n.step);
});

test('quotes do not overlap, so every underline can be drawn', () => {
  const spans = SAMPLE_ISSUES.map((s) => { const at = SAMPLE_ESSAY_TEXT.indexOf(s.quote); return [at, at + s.quote.length]; }).sort((a, b) => a[0] - b[0]);
  for (let i = 1; i < spans.length; i++) assert.ok(spans[i][0] >= spans[i - 1][1], `overlap at ${spans[i][0]}`);
});

test('percent and letter are computeGrade of the trait levels, one trait per rubric row', () => {
  const g = computeGrade(SAMPLE_LEVELS, true);
  assert.equal(SAMPLE_GRADE.percent, g.percent);
  assert.equal(SAMPLE_GRADE.letter, g.letter);
  assert.equal(SAMPLE_GRADE.capped, g.capped);
  assert.ok(SAMPLE_GRADE.promptScored);
  assert.deepEqual(SAMPLE_GRADE.traits.map((t) => t.key), TRAITS.map((t) => t.key));
  for (const t of SAMPLE_GRADE.traits) {
    assert.equal(t.level, SAMPLE_LEVELS[t.key]);
    assert.equal(t.label, LEVEL_NAMES[t.level]);
    assert.equal(t.weight, TRAITS.find((x) => x.key === t.key).weight);
    assert.ok(t.level === 4 || t.weaknesses, t.key);
  }
  assert.equal(SAMPLE_GRADE.nextSteps.length, 3);
});

test('every quotation on the grade card is in the essay', () => {
  assert.ok(SAMPLE_ESSAY_TEXT.includes(SAMPLE_GRADE.thesis));
  for (const t of SAMPLE_GRADE.traits) for (const q of t.evidence) assert.ok(SAMPLE_ESSAY_TEXT.includes(q), q);
  for (const r of SAMPLE_GRADE.requirements) if (r.evidence) assert.ok(SAMPLE_ESSAY_TEXT.includes(r.evidence), r.evidence);
});

test('markSegments keeps every character and marks each quote once', () => {
  for (const [i, p] of SAMPLE_ESSAY_PARAGRAPHS.entries()) {
    const segs = markSegments(p, SAMPLE_ISSUES);
    assert.equal(segs.map((s) => s.text).join(''), p);
    assert.equal(segs.filter((s) => s.issue !== undefined).length, SAMPLE_ISSUES.filter((s) => s.paragraphId === i).length);
  }
  assert.deepEqual(markSegments('ab', []), [{ text: 'ab' }]);
});
