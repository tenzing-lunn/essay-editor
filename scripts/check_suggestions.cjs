const assert = require('node:assert/strict');
const { test } = require('node:test');
const { anchorParagraph, followAnchors, mergeSuggestions, checkProgress, SERIOUS } = require('../lib/suggestions.ts');

const issue = (quote, patch = {}) => ({ id: quote, quote, note: 'Note.', category: 'Grammar', ...patch });
const live = (quote, patch = {}) => issue(quote, { resolved: false, ...patch });

test('an unchanged paragraph keeps its anchor after a paragraph with the same quote is inserted above', () => {
  const original = 'Creon refuses to bend.';
  assert.equal(anchorParagraph('refuses', original, ['Intro.', original]), 1);
  assert.equal(anchorParagraph('refuses', original, ['Intro.', 'Antigone refuses too.', original]), 2);
});

test('an edited paragraph anchors only while the quote is unique in the essay', () => {
  assert.equal(anchorParagraph('refuses', 'Creon refuses.', ['Intro.', 'Creon still refuses.']), 1);
  assert.equal(anchorParagraph('refuses', 'Creon refuses.', ['He refuses.', 'Creon still refuses.']), undefined);
  assert.equal(anchorParagraph('refuses', 'Creon refuses.', ['Creon refuses, then refuses again.']), undefined);
  assert.equal(anchorParagraph('gone', 'Creon refuses.', ['Creon relents.']), undefined);
  assert.equal(anchorParagraph('', 'Creon refuses.', ['Creon refuses.']), undefined);
});

test('duplicate paragraphs, old issues without a paragraph, and empty paragraphs fall back to the unique quote', () => {
  assert.equal(anchorParagraph('law', 'Same.', ['Same.', 'Same.', 'The law.']), 2);
  assert.equal(anchorParagraph('Same', 'Same.', ['Same.', 'Same.']), undefined);
  assert.equal(anchorParagraph('law', undefined, ['Intro.', 'The law.']), 1);
  assert.equal(anchorParagraph('law', '', ['', '', 'The law.']), 2);
  assert.equal(anchorParagraph('law', 'The law.', ['', 'The law.', '']), 1);
});

test('anchors follow a single unambiguous paragraph edit and nothing else', () => {
  const items = [{ id: 'a', paragraph: 'One.' }, { id: 'b', paragraph: 'Two.' }, { id: 'c' }];
  const moved = followAnchors(items, ['One.', 'Two.'], ['One!', 'Two.']);
  assert.deepEqual(moved.map((i) => i.paragraph), ['One!', 'Two.', undefined]);
  assert.equal(followAnchors(items, ['One.', 'Two.'], ['One!', 'Two!']), items);
  assert.equal(followAnchors(items, ['One.', 'Two.'], ['One.', 'Two.', 'Three.']), items);
  assert.equal(followAnchors(items, ['One.', 'Two.'], ['One.', 'Two.']), items);
  assert.equal(followAnchors(items, ['One.', 'One.'], ['One!', 'One.']), items);
  assert.equal(followAnchors(items, ['One.', 'Two.'], ['', 'Two.']), items);
  assert.equal(followAnchors(items, ['Six.', 'Two.'], ['Seven.', 'Two.']), items);
});

test('suggestions merge in essay order with unanchored ones last', () => {
  const paragraphs = ['Alpha beta.', '', 'Gamma delta.'];
  const out = mergeSuggestions({
    selection: [issue('delta', { paragraph: 'Gamma delta.' })],
    live: [live('beta', { paragraph: 'Alpha beta.', paragraphId: 2 }), live('missing')],
    review: [issue('Gamma', { category: 'Analysis' })],
  }, paragraphs);
  assert.deepEqual(out.map((s) => s.quote), ['beta', 'Gamma', 'delta', 'missing']);
  assert.deepEqual(out.map((s) => s.paragraphId), [0, 2, 2, undefined]);
  assert.deepEqual(out.map((s) => s.position), [6, 15, 21, Number.POSITIVE_INFINITY]);
  assert.deepEqual(out.map((s) => s.origin), ['live', 'review', 'selection', 'live']);
  assert.equal(out[0].paragraph, 'Alpha beta.');
});

test('resolved live issues drop out and duplicates keep live over review over selection', () => {
  const paragraphs = ['Alpha beta.'];
  const out = mergeSuggestions({
    selection: [issue('beta', { id: 's' }), issue('Alpha', { id: 's2' })],
    live: [live('beta', { id: 'l' }), live('Alpha', { id: 'gone', resolved: true, disposition: 'declined' })],
    review: [issue('beta', { id: 'r' }), issue('Alpha', { id: 'r2' })],
  }, paragraphs);
  assert.deepEqual(out.map((s) => s.id), ['r2', 'l']);
  assert.deepEqual(mergeSuggestions({ selection: [issue('beta', { id: 's' })], live: [], review: [] }, paragraphs).map((s) => s.origin), ['selection']);
});

test('the same category and quote in two paragraphs stays two suggestions', () => {
  const paragraphs = ['The law is the law.', 'Creon. The law is cruel.'];
  const out = mergeSuggestions({ selection: [], live: [live('The law', { paragraph: paragraphs[0] }), live('The law', { id: 'x', paragraph: paragraphs[1] })], review: [] }, paragraphs);
  assert.deepEqual(out.map((s) => s.paragraphId), [0, 1]);
  assert.deepEqual(out.map((s) => s.position), [0, 28]);
});

test('progress counts fixed and new issues since the last check', () => {
  assert.equal(checkProgress(null, [live('a')], 'a'), null);
  const previous = { draft: 'old', issues: [
    live('teh', { resolved: true, disposition: 'accepted' }),
    live('wierd'),
    live('kept'),
    live('dismissed', { resolved: true, disposition: 'declined' }),
  ] };
  const next = [live('kept'), live('dismissed'), live('brand new'), live('kept', { category: 'Clarity' })];
  assert.deepEqual(checkProgress(previous, next, 'the kept dismissed brand new'), { fixed: 2, added: 2 });
  assert.ok(SERIOUS.includes('Analysis') && !SERIOUS.includes('Grammar'));
});

test('the same mistake made again elsewhere counts as new', () => {
  const previous = { draft: 'its clear', issues: [live('its clear')] };
  assert.deepEqual(checkProgress(previous, [live('its clear'), live('its clear')], 'its clear. its clear'), { fixed: 0, added: 1 });
});
