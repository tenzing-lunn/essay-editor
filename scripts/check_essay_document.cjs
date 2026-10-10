const assert = require('node:assert/strict');
const { test } = require('node:test');
const { bodyParagraphNumber, clampWords } = require('../lib/essay-document.ts');

test('body paragraph numbers skip headings and count continuation blocks once', () => {
  // Title, P1, a block quote continuing P1, P2, Works Cited.
  const of = [-1, 1, 1, 3, -1];
  assert.deepEqual(of.map((_, i) => bodyParagraphNumber(of, i)), [0, 1, 1, 2, 0]);
});

test('target words are clamped to a whole number the schema accepts', () => {
  assert.deepEqual(['250', 99.6, -5, 1e9, 'abc', undefined].map(clampWords), [250, 100, 0, 100000, 0, 0]);
});
