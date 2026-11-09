const assert = require('node:assert/strict');
const { test } = require('node:test');
const { groundFixes, FixRequest } = require('../lib/essay-fixes.ts');

const draft = 'Antigone defies Creon because "I owe a longer allegiance to the dead." Creon is a tyrant.\n\nThe chorus warns that pride is punished.';
const sources = [
  { title: 'Antigone', location: 'lines 71-77', text: 'I owe a longer allegiance to the dead than to the living: in that world I shall abide for ever.' },
  { title: 'Antigone', location: 'lines 1348-1353', text: 'Wisdom is the supreme part of happiness; and reverence towards the gods must be inviolate.' },
];
const input = FixRequest.parse({ draft, issue: { quote: 'Creon is a tyrant.', note: 'Unsupported claim.' }, revise: true, sources });
const result = (patch = {}) => ({ advice: 'Try X.', options: [], quotes: [], ...patch });
const option = (text, how = 'An approach') => ({ how, text });

test('requests default to no revision, no quotes and no sources', () => {
  const parsed = FixRequest.parse({ draft, issue: { quote: 'Creon', note: 'n' } });
  assert.equal(parsed.revise, false);
  assert.equal(parsed.quotes, false);
  assert.deepEqual(parsed.sources, []);
  assert.equal(FixRequest.safeParse({ ...parsed, sources: Array(11).fill(sources[0]) }).success, false);
});

test('quotes are kept only when asked for and copied from the numbered passage, with its citation', () => {
  const quotes = [
    { source: 2, text: 'reverence towards the gods must be inviolate', why: 'Shows the cost of impiety.' },
    { source: 1, text: 'reverence towards the gods must be inviolate', why: 'Wrong passage.' },
    { source: 9, text: 'Wisdom is the supreme part', why: 'No such passage.' },
    { source: 2, text: 'Creon was always wicked', why: 'Invented.' },
    { source: 2, text: 'Reverence  towards the gods must be inviolate', why: 'Duplicate after normalizing.' },
  ];
  const fixes = groundFixes(result({ quotes }), { ...input, quotes: true });
  assert.deepEqual(fixes.quotes, [{ title: 'Antigone', location: 'lines 1348-1353', text: 'reverence towards the gods must be inviolate', why: 'Shows the cost of impiety.' }]);
  assert.equal(fixes.advice, 'Try X.');
  assert.deepEqual(groundFixes(result({ quotes }), input).quotes, []);
});

test('a rewrite survives only when its quotations come from the draft or the sources', () => {
  const ok = 'Creon rules as a tyrant who ignores that "reverence towards the gods must be inviolate."';
  assert.equal(groundFixes(result({ options: [option(ok)] }), input).options[0].text, ok);
  const elided = 'Creon ignores that "Wisdom is the supreme part … reverence towards the gods must be inviolate."';
  assert.equal(groundFixes(result({ options: [option(elided)] }), input).options[0].text, elided);
  assert.deepEqual(groundFixes(result({ options: [option('Creon ignores that "the gods demand mercy."')] }), input).options, []);
  assert.deepEqual(groundFixes(result({ options: [option(' Creon is a tyrant. ')] }), input).options, []);
  assert.deepEqual(groundFixes(result({ options: [option(ok)] }), { ...input, revise: false }).options, []);
});

test('rewrites are deduplicated and capped at two', () => {
  const options = [option('First rewrite.', 'One'), option('First rewrite.', 'Dup'), option('Second rewrite.', 'Two'), option('Third rewrite.', 'Three')];
  assert.deepEqual(groundFixes(result({ options }), input).options, [{ how: 'One', text: 'First rewrite.' }, { how: 'Two', text: 'Second rewrite.' }]);
});
