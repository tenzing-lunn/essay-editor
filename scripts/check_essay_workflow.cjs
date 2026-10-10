const assert = require('node:assert/strict');
const { test } = require('node:test');
const { EssaySettingsSchema, essayContext, mergeRevisionTasks, followParagraphNotes, groundSourceCheck, SourceCheckRequest } = require('../lib/essay-workflow.ts');

const task = (patch = {}) => ({ id: 'task-1', kind: 'revision', paragraphId: 0, paragraph: 'A claim.', quote: '', task: 'Develop the argument', reason: 'Explain the inference.', priority: 'high', status: 'open', context: essayContext('A claim.', 'Prompt'), note: '', ...patch });

test('old drafts and version settings gain workflow defaults without losing notes', () => {
  const settings = EssaySettingsSchema.parse({ targetWords: 2000, checklist: { thesis: true }, notes: [{ paragraph: 'A claim.', note: 'Expand' }] });
  assert.deepEqual(settings.tasks, []);
  assert.equal(settings.sources, '');
  assert.equal(settings.includeAntigone, true);
  assert.equal(settings.notes[0].note, 'Expand');
  assert.deepEqual(EssaySettingsSchema.parse(JSON.parse(JSON.stringify({ ...settings, tasks: [task({ status: 'done', note: 'Revised' })] }))).tasks[0].status, 'done');
});

test('draft, assignment, and source changes invalidate task freshness', () => {
  const original = essayContext('Essay', 'Prompt', 'Source');
  assert.equal(original, essayContext('Essay', 'Prompt', 'Source'));
  for (const input of [['Changed', 'Prompt', 'Source'], ['Essay', 'Changed', 'Source'], ['Essay', 'Prompt', 'Changed']]) assert.notEqual(original, essayContext(...input));
  assert.notEqual(original, essayContext('Essay', 'Prompt', 'Source', false));
});

test('repeat analysis keeps decisions, while changed input reopens tasks', () => {
  const prior = task({ status: 'done', note: 'Revised' });
  const source = task({ id: 'source-1', kind: 'source' });
  const repeated = mergeRevisionTasks([prior, source], [task({ id: 'new-id' })], 'revision');
  assert.equal(repeated[0].id, prior.id);
  assert.equal(repeated[0].status, 'done');
  assert.equal(repeated[0].note, 'Revised');
  assert.equal(repeated[1].kind, 'source');
  const changed = mergeRevisionTasks([prior], [task({ context: essayContext('Edited', 'Prompt') })], 'revision');
  assert.equal(changed[0].status, 'open');
  assert.equal(changed[0].note, 'Revised');
});

test('partial, empty, and paraphrased analyses never delete saved tasks or notes', () => {
  const prior = task({ status: 'done', note: 'Checked page 12' });
  assert.deepEqual(mergeRevisionTasks([prior], [], 'revision'), [prior]);
  const unrelated = task({ id: 'other', paragraphId: 2, paragraph: 'Another point.' });
  const combined = mergeRevisionTasks([prior], [unrelated], 'revision');
  assert.equal(combined[0].note, 'Checked page 12');
  assert.equal(combined.length, 2);
  assert.equal(mergeRevisionTasks([prior], [task({ id: 'new', task: 'Explain your argument' })], 'revision').length, 2);
  const full = Array.from({ length: 300 }, (_, i) => task({ id: `task-${i}`, paragraphId: i }));
  assert.throws(() => mergeRevisionTasks(full, [unrelated, task({ id: 'extra', paragraphId: 999 })], 'revision'), /limit/);
  assert.equal(full.length, 300);
});

test('source checks discard invented locations, unsupported quotations and duplicates', () => {
  const input = { paragraphs: [{ id: 0, text: 'A claim.' }, { id: 1, text: 'Evidence here.' }] };
  const issue = { paragraphId: 1, quote: 'Evidence', task: 'Verify the quotation', reason: 'Check the source.', priority: 'high' };
  const grounded = groundSourceCheck({ issues: [issue, issue, { ...issue, paragraphId: 9 }, { ...issue, quote: 'Invented' }, { ...issue, quote: ' ' }] }, input);
  assert.deepEqual(grounded.issues, [issue]);
  assert.equal(SourceCheckRequest.safeParse({ paragraphs: [{ id: 0, text: 'A' }, { id: 0, text: 'B' }] }).success, false);
});

test('paragraph notes follow a single edit and avoid ambiguous remapping', () => {
  const notes = [{ paragraph: 'Original', note: 'Develop this point' }];
  assert.equal(followParagraphNotes(notes, ['Original', 'Other'], ['Edited', 'Other'])[0].paragraph, 'Edited');
  assert.equal(followParagraphNotes(notes, ['Original', 'Other'], ['One', 'Two']), notes);
  assert.equal(followParagraphNotes(notes, ['Original'], ['Part one', 'Part two']), notes);
  assert.equal(followParagraphNotes(notes, ['Original', 'Original'], ['Edited', 'Original']), notes);
  assert.equal(followParagraphNotes(notes, ['Original', 'Other'], ['Other', 'Other']), notes);
});

test('oversized model output is clamped to what the editor can save instead of rejected', () => {
  const { FocusResult, groundFocus } = require('../lib/essay-focus.ts');
  const { RevisionTaskSchema, SourceCheckResult } = require('../lib/essay-workflow.ts');
  const paragraphs = Array.from({ length: 10 }, (_, id) => ({ id, text: `Paragraph ${id} says something.` }));
  const raw = FocusResult.parse({
    summary: 's', nextSteps: ['a', 'b', 'c', 'd'],
    related: [{ paragraphId: 1, quote: '', relationship: 'supports', reason: 'r' }, ...paragraphs.slice(1).map((p) => ({ paragraphId: p.id, quote: 'says', relationship: 'supports', reason: 'r' }))],
    priorities: [{ paragraphId: 0, priority: 'high', task: 'x'.repeat(6000), reason: 'y'.repeat(6000) }],
  });
  const focus = groundFocus(raw, { paragraphs, target: 0 });
  assert.equal(focus.nextSteps.length, 3);
  assert.equal(focus.related.length, 6);
  assert.ok(focus.related.every((r) => r.quote.trim()));
  assert.equal(focus.priorities[0].task.length, 5000);
  assert.ok(RevisionTaskSchema.safeParse({ id: 'x', kind: 'revision', paragraphId: 0, paragraph: 'p', quote: '', task: focus.priorities[0].task, reason: focus.priorities[0].reason, priority: 'high', status: 'open', context: 'c', note: '' }).success);
  const sourceParagraphs = [{ id: 0, text: Array.from({ length: 40 }, (_, i) => `w${i};`).join(' ') }];
  const issues = [{ paragraphId: 0, quote: 'w0;', task: ' ', reason: 'r', priority: 'low' }, ...Array.from({ length: 40 }, (_, i) => ({ paragraphId: 0, quote: `w${i};`, task: 't'.repeat(6000), reason: 'r', priority: 'low' }))];
  const checked = groundSourceCheck(SourceCheckResult.parse({ issues }), { paragraphs: sourceParagraphs });
  assert.equal(checked.issues.length, 30);
  assert.equal(checked.issues[0].quote, 'w0;'); // the blank-task duplicate was dropped, not the real one
  assert.ok(checked.issues.every((i) => i.task.trim() && i.task.length <= 5000));
});

test('old settings gain an empty thesis; a saved thesis survives', () => {
  const { EMPTY_ESSAY_SETTINGS } = require('../lib/essay-document.ts');
  assert.equal(EssaySettingsSchema.parse({ targetWords: 0, checklist: {}, notes: [] }).thesis, '');
  assert.equal(EssaySettingsSchema.parse({ ...EMPTY_ESSAY_SETTINGS, thesis: 'Creon is the tragic hero.' }).thesis, 'Creon is the tragic hero.');
  assert.throws(() => EssaySettingsSchema.parse({ ...EMPTY_ESSAY_SETTINGS, thesis: 'x'.repeat(2001) }));
});

test('saved live checks load with and without paragraph anchors', () => {
  const { readLiveCheck } = require('../lib/essay-issues.ts');
  const issue = { id: 'a', quote: 'teh', note: 'Typo.', category: 'Grammar', resolved: false, replacement: 'the' };
  const old = readLiveCheck(JSON.stringify({ draft: 'teh end', issues: [issue] }));
  assert.equal(old.issues[0].paragraph, undefined);
  assert.equal(old.checkedAt, undefined);
  const next = readLiveCheck(JSON.stringify({ draft: 'teh end', checkedAt: 5, issues: [{ ...issue, paragraph: 'teh end' }] }));
  assert.equal(next.issues[0].paragraph, 'teh end');
  assert.equal(next.checkedAt, 5);
  assert.equal(readLiveCheck(JSON.stringify({ draft: 'teh end', issues: [{ ...issue, paragraph: 3 }] })), null);
});

test('writing profile: old settings gain an empty one; it renders into AI instructions only when filled', () => {
  const { WritingRequest, writingContext } = require('../lib/essay-workflow.ts');
  assert.deepEqual(EssaySettingsSchema.parse({ targetWords: 0, checklist: {}, notes: [] }).profile, { kind: '', course: '', citation: '', instructions: '' });
  assert.equal(writingContext(WritingRequest.parse({})), '');
  const text = writingContext(WritingRequest.parse({ profile: { kind: 'Literary analysis', citation: 'MLA', instructions: 'No rewrites.' }, thesis: 'Creon is the tragic hero.', targetWords: 1500 }));
  assert.match(text, /Target length: about 1500 words/);
  assert.match(text, /Type of writing: Literary analysis/);
  assert.match(text, /Citation style: MLA/);
  assert.match(text, /Working thesis: Creon is the tragic hero\./);
  assert.match(text, /<notes>\nNo rewrites\.\n<\/notes>/);
  assert.doesNotMatch(text, /Course and level/);
  assert.equal(WritingRequest.safeParse({ profile: { instructions: 'x'.repeat(4001) } }).success, false);
});

test('download names come from the first non-blank line as a short, clean slug', () => {
  const { essaySlug } = require('../lib/essay-document.ts');
  assert.equal(essaySlug(''), 'essay');
  assert.equal(essaySlug('\n  \n?!\nBody'), 'essay');
  assert.equal(essaySlug('\n  \n"Creon\'s Fall": A Tragedy?!\nBody text'), 'creon-s-fall-a-tragedy');
  assert.equal(essaySlug(`${'a'.repeat(59)} b`), 'a'.repeat(59));
  assert.equal(essaySlug('Café Société'), 'cafe-societe');
});

test('a saved review loads back; corrupt or malformed ones are ignored', () => {
  const { readReview } = require('../lib/essay-issues.ts');
  const review = { issues: [{ id: 'r1', quote: 'Creon is right', note: 'Support this claim.', category: 'Analysis', replacement: '', paragraph: 'Creon is right.' }], overall: ['Sharpen the thesis.'], draft: 'Creon is right.', brief: 'Prompt', reviewedKey: 'Prompt\u0000Creon is right.' };
  assert.deepEqual(readReview(JSON.stringify(review)), review);
  assert.equal(readReview(null), null);
  assert.equal(readReview('{not json'), null);
  assert.equal(readReview('null'), null);
  assert.equal(readReview(JSON.stringify({ ...review, reviewedKey: undefined })), null);
  assert.equal(readReview(JSON.stringify({ ...review, overall: [3] })), null);
  assert.equal(readReview(JSON.stringify({ ...review, issues: [{ ...review.issues[0], category: 'Style' }] })), null);
});
