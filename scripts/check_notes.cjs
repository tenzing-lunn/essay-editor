const assert = require('node:assert/strict');
const { test } = require('node:test');
const { anchorTask, collectNotes, reviewOrder, stackMargin } = require('../lib/notes.ts');

const paragraphs = ['Intro with a thesis.', 'Body one quotes "the law".', 'Body two repeats it.'];
const suggestion = (id, category, paragraphId, position, origin = 'live') => ({ id, origin, quote: 'q', note: `${id} note`, category, paragraphId, position });
const task = (patch = {}) => ({ id: 't1', kind: 'source', paragraphId: 1, paragraph: paragraphs[1], quote: '"the law"', task: 'Cite it.', reason: 'No page.', priority: 'high', status: 'open', context: 'ctx', note: '', ...patch });

test('a task keeps its index while its check applies, then follows its quote or exact paragraph text', () => {
  assert.equal(anchorTask(task(), paragraphs, 'ctx'), 1);
  assert.equal(anchorTask(task({ paragraphId: 0 }), ['New intro.', ...paragraphs], 'other'), 2);
  assert.equal(anchorTask(task({ kind: 'revision', quote: '', paragraphId: 0, paragraph: paragraphs[2] }), paragraphs, 'other'), 2);
  assert.equal(anchorTask(task({ kind: 'revision', quote: '', paragraph: 'Gone.' }), paragraphs, 'other'), undefined);
});

test('notes merge suggestions, open tasks and a failing plan check in essay order', () => {
  const notes = collectNotes({
    suggestions: [suggestion('g', 'Grammar', 2, 50), suggestion('a', 'Analysis', 0, 3, 'review')],
    tasks: [task(), task({ id: 'done', status: 'done' })],
    contexts: { source: 'ctx', revision: 'ctx' },
    planCheck: { key: 'plan', name: 'Every planned claim has a paragraph', state: 'fail', detail: 'Claim 3 has no paragraph yet.', show: '' },
  }, paragraphs);
  assert.deepEqual(notes.map((n) => n.id), ['a', 't1', 'g', 'plan:plan']);
  assert.equal(notes[1].category, 'Use of evidence');
  assert.equal(notes[3].text, 'Claim 3 has no paragraph yet.');
  assert.equal(collectNotes({ suggestions: [], tasks: [], contexts: { source: '', revision: '' }, planCheck: { key: 'plan', name: 'x', state: 'pass', detail: '', show: '' } }, paragraphs).length, 0);
});

test('review goes biggest first: priority, then the cost of the category, then essay order', () => {
  const notes = collectNotes({ suggestions: [suggestion('g', 'Grammar', 0, 1), suggestion('c', 'Clarity', 0, 2), suggestion('s', 'Structure', 2, 40), suggestion('e', 'Use of evidence', 1, 20)], tasks: [], contexts: { source: '', revision: '' }, planCheck: null }, paragraphs);
  assert.deepEqual(reviewOrder(notes).map((n) => n.id), ['s', 'e', 'c', 'g']);
});

test('margin cards stack below each other without overlapping and keep their order', () => {
  assert.deepEqual(stackMargin([{ key: 'b', top: 40, height: 50 }, { key: 'a', top: 0, height: 60 }, { key: 'c', top: 300, height: 10 }], 8),
    [{ key: 'a', top: 0 }, { key: 'b', top: 68 }, { key: 'c', top: 300 }]);
});
