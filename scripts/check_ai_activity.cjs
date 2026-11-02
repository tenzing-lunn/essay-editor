const assert = require('node:assert/strict');
const { test } = require('node:test');
const { describeReads, runLabel } = require('../lib/ai-activity.ts');

test('a paragraph question names the paragraph, the prompt and each book with its pages', () => {
  const body = { mode: 'focus', paragraphs: [{ id: 0 }, { id: 1 }, { id: 2 }], target: 0, brief: 'Write about it.', question: 'Where is this quote?',
    sources: [{ title: 'Their Eyes', location: 'p. 11' }, { title: 'Their Eyes', location: 'p. 12' }, { title: 'Their Eyes', location: 'p. 11' }] };
  assert.deepEqual(describeReads(body), ['one paragraph', 'the other 2 paragraphs', 'your prompt', 'Their Eyes: p. 11, p. 12']);
  assert.deepEqual(runLabel(body), { label: 'Paragraph analysis', detail: 'Where is this quote?' });
});

test('without sources nothing claims a book was read', () => {
  assert.deepEqual(describeReads({ mode: 'selection', action: 'ask', selection: 'x', draft: 'x', question: 'Why?', sources: [] }), ['the passage you asked about', 'the whole essay']);
  assert.deepEqual(runLabel({ mode: 'selection', action: 'ask', question: 'Why?' }), { label: 'You asked', detail: 'Why?' });
});

test('whole-essay calls name the essay, the rubric, pasted excerpts, Antigone and the writing setup', () => {
  assert.deepEqual(describeReads({ mode: 'grade', draft: 'x', brief: 'Prompt.', writing: { profile: { kind: 'Literary analysis', course: '' } } }), ['the whole essay', 'your prompt and rubric', 'your writing setup']);
  assert.deepEqual(describeReads({ mode: 'sources', paragraphs: [{}], sources: 'Title, p. 2: "..."', includeAntigone: true }), ['the whole essay', 'excerpts from your sources', 'Antigone']);
  assert.deepEqual(describeReads({ mode: 'live', paragraph: 'x', thesis: 'T', plan: '' }), ['one paragraph', 'your opening paragraph']);
});
