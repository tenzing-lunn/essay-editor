const assert = require('node:assert/strict');
const { test } = require('node:test');
const { groundFixes, FixRequest } = require('../lib/essay-fixes.ts');

const draft = 'Antigone defies Creon because "I owe a longer allegiance to the dead." Creon is a tyrant.\n\nThe chorus warns that pride is punished.';
const sources = [
  { title: 'Antigone', location: 'lines 71-77', text: 'I owe a longer allegiance to the dead than to the living: in that world I shall abide for ever.' },
  { title: 'Antigone', location: 'lines 1348-1353', text: 'Wisdom is the supreme part of happiness; and reverence towards the gods must be inviolate.' },
];
const input = FixRequest.parse({ draft, issue: { quote: 'Creon is a tyrant.', note: 'Unsupported claim.' }, revise: true, sources });
const result = (patch = {}) => ({ steps: ['One.', 'Two.', 'Three.'], revision: '', quotes: [], elsewhere: [], ...patch });

test('requests default to no revision and no sources', () => {
  const parsed = FixRequest.parse({ draft, issue: { quote: 'Creon', note: 'n' } });
  assert.equal(parsed.revise, false);
  assert.deepEqual(parsed.sources, []);
  assert.equal(FixRequest.safeParse({ ...parsed, sources: Array(11).fill(sources[0]) }).success, false);
});

test('quotes are kept only when copied from the numbered passage, with its citation', () => {
  const fixes = groundFixes(result({ quotes: [
    { source: 2, text: 'reverence towards the gods must be inviolate', why: 'Shows the cost of impiety.' },
    { source: 1, text: 'reverence towards the gods must be inviolate', why: 'Wrong passage.' },
    { source: 9, text: 'Wisdom is the supreme part', why: 'No such passage.' },
    { source: 2, text: 'Creon was always wicked', why: 'Invented.' },
    { source: 2, text: 'Reverence  towards the gods must be inviolate', why: 'Duplicate after normalizing.' },
  ] }), input);
  assert.deepEqual(fixes.quotes, [{ title: 'Antigone', location: 'lines 1348-1353', text: 'reverence towards the gods must be inviolate', why: 'Shows the cost of impiety.' }]);
  assert.equal(fixes.steps.length, 2);
});

test('a revision survives only when its quotations come from the draft or the sources', () => {
  const ok = 'Creon rules as a tyrant who ignores that "reverence towards the gods must be inviolate."';
  assert.equal(groundFixes(result({ revision: ok }), input).revision, ok);
  const elided = 'Creon ignores that "Wisdom is the supreme part … reverence towards the gods must be inviolate."';
  assert.equal(groundFixes(result({ revision: elided }), input).revision, elided);
  assert.equal(groundFixes(result({ revision: 'Creon ignores that "the gods demand mercy."' }), input).revision, '');
  assert.equal(groundFixes(result({ revision: 'Creon is a tyrant.' }), input).revision, '');
  assert.equal(groundFixes(result({ revision: ok }), { ...input, revise: false }).revision, '');
});

test('elsewhere keeps up to two exact places other than the flagged passage', () => {
  const fixes = groundFixes(result({ elsewhere: [
    { quote: 'Creon is a tyrant', instruction: 'Flagged passage itself.' },
    { quote: 'Not in the draft', instruction: 'Invented.' },
    { quote: 'The chorus warns that pride is punished.', instruction: 'Use this.' },
    { quote: 'Antigone defies Creon', instruction: 'And this.' },
    { quote: 'I owe a longer allegiance', instruction: 'Third.' },
  ] }), input);
  assert.deepEqual(fixes.elsewhere.map((e) => e.instruction), ['Use this.', 'And this.']);
});
