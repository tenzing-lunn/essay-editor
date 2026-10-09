const assert = require('node:assert/strict');
const { test } = require('node:test');
const { groundArgumentMap, ArgumentMapRequest } = require('../lib/argument-map.ts');

const input = { paragraphs: [{ id: 0, text: 'Fate and Choice' }, { id: 2, text: 'Antigone chooses her death freely. Creon rules.' }, { id: 5, text: 'The chorus sings.' }] };
const entry = (paragraphId, patch = {}) => ({ paragraphId, claim: 'A claim', relation: 'supports', note: '', transition: 'Abrupt move.', ...patch });

test('grounding keeps known ids once, in input order, and clears the first transition', () => {
  const map = groundArgumentMap({ thesis: '', paragraphs: [entry(5), entry(9), entry(2, { claim: 'first' }), entry(2, { claim: 'second' }), entry(0, { relation: 'frame' })] }, input);
  assert.deepEqual(map.paragraphs.map((p) => p.paragraphId), [0, 2, 5]);
  assert.equal(map.paragraphs[1].claim, 'first');
  assert.equal(map.paragraphs[0].transition, '');
  assert.equal(map.paragraphs[1].transition, 'Abrupt move.');
});

test('the first input paragraph loses its transition even when the model skips it', () => {
  const map = groundArgumentMap({ thesis: '', paragraphs: [entry(2), entry(5)] }, input);
  assert.deepEqual(map.paragraphs.map((p) => [p.paragraphId, p.transition]), [[2, 'Abrupt move.'], [5, 'Abrupt move.']]);
  assert.equal(groundArgumentMap({ thesis: '', paragraphs: [entry(0)] }, input).paragraphs[0].transition, '');
});

test('thesis is kept only when pinned or found in the essay', () => {
  assert.equal(groundArgumentMap({ thesis: 'Invented thesis.', paragraphs: [] }, input).thesis, '');
  assert.equal(groundArgumentMap({ thesis: 'Antigone chooses her death freely.', paragraphs: [] }, input).thesis, 'Antigone chooses her death freely.');
  assert.equal(groundArgumentMap({ thesis: 'Pinned claim.', paragraphs: [] }, { ...input, thesis: 'Pinned claim.' }).thesis, 'Pinned claim.');
});

test('claim, note and transition are clamped', () => {
  const p = groundArgumentMap({ thesis: '', paragraphs: [entry(2, { claim: 'c'.repeat(500), note: 'n'.repeat(500), transition: 't'.repeat(500), relation: 'drifts' })] }, input).paragraphs[0];
  assert.equal(p.claim.length, 160);
  assert.equal(p.note.length, 300);
  assert.equal(p.transition.length, 300);
  assert.equal(p.relation, 'drifts');
});

test('requests reject duplicate ids and more than 150 paragraphs', () => {
  assert.ok(ArgumentMapRequest.safeParse(input).success);
  const dup = ArgumentMapRequest.safeParse({ paragraphs: [{ id: 1, text: 'a' }, { id: 1, text: 'b' }] });
  assert.equal(dup.success, false);
  assert.equal(dup.error.issues[0].message, 'Paragraph locations must be unique.');
  assert.equal(ArgumentMapRequest.safeParse({ paragraphs: Array.from({ length: 151 }, (_, id) => ({ id, text: 'x' })) }).success, false);
  assert.ok(ArgumentMapRequest.safeParse({ paragraphs: Array.from({ length: 150 }, (_, id) => ({ id, text: 'x' })) }).success);
  assert.equal(ArgumentMapRequest.safeParse({ paragraphs: [] }).success, false);
  assert.equal(ArgumentMapRequest.safeParse({ paragraphs: [{ id: 0, text: 'x' }], thesis: 't'.repeat(2001) }).success, false);
});
