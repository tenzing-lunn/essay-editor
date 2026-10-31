const assert = require('node:assert/strict');
const { test } = require('node:test');
const { argueGate, draftGate, planText, groundPlanReview, plannedClaims, ArgumentPlanSchema, PlanReviewRequest, EMPTY_PLAN, MAX_CLAIMS } = require('../lib/argument-plan.ts');
const { EssaySettingsSchema } = require('../lib/essay-workflow.ts');

const plan = (claims, skippedAt = 0) => ({ claims: claims.map(([claim, evidence], i) => ({ id: `c${i}`, claim, evidence })), skippedAt });
const states = (gate) => Object.fromEntries(gate.checks.map((c) => [c.key, c.pass]));

test('the gate passes with a thesis and every claim naming evidence', () => {
  const gate = argueGate('Creon is the tragic hero.', plan([['He changes his mind too late.', 'Lines 1095-1114'], ['The chorus blames him.', '"Wisdom is the supreme part of happiness"']]));
  assert.equal(gate.pass, true);
  assert.ok(gate.checks.every((c) => c.detail === ''));
});

test('the gate fails on a missing thesis, no claims, or claims without evidence, and says which', () => {
  assert.deepEqual(states(argueGate('  ', EMPTY_PLAN)), { thesis: false, claims: false, evidence: false });
  const gate = argueGate('A thesis.', plan([['One', 'e'], ['Two', ''], ['', ''], ['Four', ' ']]));
  assert.deepEqual(states(gate), { thesis: true, claims: true, evidence: false });
  assert.equal(gate.checks[2].detail, 'Claims 2 and 4 have no evidence yet.');
  assert.equal(argueGate('A thesis.', plan([['One', '']])).checks[2].detail, 'Claim 1 has no evidence yet.');
  assert.equal(argueGate('A thesis.', plan([['One', 'e'], ['', 'orphan evidence']])).checks[2].detail, 'Claim 2 names evidence but no claim.');
});

test('blank rows are not claims, and a skip does not pass the gate', () => {
  assert.equal(plannedClaims(plan([['', ''], ['A', '']])).length, 1);
  assert.equal(argueGate('T', plan([['', '']], Date.now())).pass, false);
});

test('settings without a plan load with an empty one; oversized plans are refused', () => {
  const settings = EssaySettingsSchema.parse({ targetWords: 0, checklist: {}, notes: [] });
  assert.deepEqual(settings.plan, EMPTY_PLAN);
  assert.equal(ArgumentPlanSchema.safeParse(plan(Array.from({ length: MAX_CLAIMS + 1 }, () => ['c', 'e']))).success, false);
  assert.equal(ArgumentPlanSchema.safeParse(plan([['c'.repeat(401), 'e']])).success, false);
});

test('the draft gate passes only when every planned claim is argued by a paragraph, and names the ones that are not', () => {
  const p = plan([['One', 'e'], ['', ''], ['Three', ''], ['Four', 'e']]);
  assert.equal(draftGate(p, ['c0', 'c2', 'c3', 'c0']).pass, true);
  const gate = draftGate(p, ['c0', 'stale-id']);
  assert.equal(gate.pass, false);
  assert.equal(gate.checks[0].detail, 'Claims 3 and 4 have no paragraph yet.');
  assert.equal(draftGate(p, ['c0', 'c2']).checks[0].detail, 'Claim 4 has no paragraph yet.');
  assert.equal(draftGate(EMPTY_PLAN, []).pass, false);
});

test('the plan reaches the live check as numbered claims with their evidence', () => {
  assert.equal(planText(plan([['One', ' Lines 10-12 '], ['', 'orphan'], ['Three', '']])), '1. One (evidence: Lines 10-12)\n3. Three');
  assert.equal(planText(EMPTY_PLAN), '');
});

const input = { thesis: 'Creon, not Antigone, is the tragic hero.', claims: [{ id: 0, claim: 'Creon reverses.', evidence: 'Teiresias scene' }, { id: 1, claim: 'Antigone never doubts.', evidence: '' }, { id: 2, claim: 'The chorus judges.', evidence: 'final ode' }], includeAntigone: false };
const SOURCES = 'TEIRESIAS: All men make mistakes,\n  but a good man yields when he knows his course is wrong.';
const entry = (claimId, patch = {}) => ({ claimId, objection: 'Objection.', evidence: 'found', quote: 'but a good man yields when he knows his course is wrong', note: 'Note.', ...patch });
const review = (claims, thesis = {}) => ({ thesis: { quote: 'not Antigone', objection: 'She dies for it.', question: 'Why is his fall the tragic one?', ...thesis }, claims });

test('claims are kept once, by known id, in plan order', () => {
  const r = groundPlanReview(review([entry(2), entry(9), entry(0, { note: 'first' }), entry(0, { note: 'second' })]), input, SOURCES);
  assert.deepEqual(r.claims.map((c) => c.claimId), [0, 2]);
  assert.equal(r.claims[0].note, 'first');
});

test('found evidence keeps its quote only when it is in the sources, matched across line breaks and curly quotes', () => {
  const [kept] = groundPlanReview(review([entry(0, { quote: 'All men make mistakes, but a good man yields' })]), input, SOURCES).claims;
  assert.equal(kept.evidence, 'found');
  assert.equal(kept.quote, 'All men make mistakes, but a good man yields');
  const curly = groundPlanReview(review([entry(0, { quote: '“a fool”' })]), input, 'He said "a fool" twice.').claims[0];
  assert.equal(curly.evidence, 'found');
  const [invented] = groundPlanReview(review([entry(0, { quote: 'Pride goes before a fall' })]), input, SOURCES).claims;
  assert.equal(invented.evidence, 'missing');
  assert.equal(invented.quote, '');
  assert.match(invented.note, /could not be found/);
  assert.equal(groundPlanReview(review([entry(0, { quote: '' })]), input, SOURCES).claims[0].evidence, 'missing');
});

test('nothing is checked without sources or without named evidence', () => {
  assert.deepEqual(groundPlanReview(review([entry(0)]), input, '  \n ').claims.map((c) => [c.evidence, c.quote]), [['unchecked', '']]);
  assert.deepEqual(groundPlanReview(review([entry(1)]), input, SOURCES).claims.map((c) => [c.evidence, c.quote]), [['unchecked', '']]);
  const missing = groundPlanReview(review([entry(2, { evidence: 'missing', quote: 'stray' })]), input, SOURCES).claims[0];
  assert.deepEqual([missing.evidence, missing.quote], ['missing', '']);
});

test('the thesis quote must be in the thesis; text is clamped', () => {
  assert.equal(groundPlanReview(review([]), input, SOURCES).thesis.quote, 'not Antigone');
  assert.equal(groundPlanReview(review([], { quote: 'an invented phrase' }), input, SOURCES).thesis.quote, '');
  assert.equal(groundPlanReview(review([], { quote: input.thesis }), input, SOURCES).thesis.quote, '');
  const r = groundPlanReview(review([entry(0, { objection: 'o'.repeat(900), note: 'n'.repeat(900) })], { objection: 'x'.repeat(900), question: 'q'.repeat(900) }), input, SOURCES);
  assert.equal(r.thesis.objection.length, 500);
  assert.equal(r.thesis.question.length, 300);
  assert.equal(r.claims[0].objection.length, 500);
  assert.equal(r.claims[0].note.length, 500);
});

test('requests need a thesis and one to eight claims with unique ids', () => {
  assert.ok(PlanReviewRequest.safeParse(input).success);
  assert.equal(PlanReviewRequest.safeParse({ ...input, thesis: '   ' }).success, false);
  assert.equal(PlanReviewRequest.safeParse({ ...input, claims: [] }).success, false);
  assert.equal(PlanReviewRequest.safeParse({ ...input, claims: Array.from({ length: MAX_CLAIMS + 1 }, (_, id) => ({ id, claim: 'c', evidence: '' })) }).success, false);
  const dup = PlanReviewRequest.safeParse({ ...input, claims: [{ id: 1, claim: 'a', evidence: '' }, { id: 1, claim: 'b', evidence: '' }] });
  assert.equal(dup.error.issues[0].message, 'Claim numbers must be unique.');
  assert.equal(PlanReviewRequest.safeParse({ ...input, sources: 's'.repeat(50001) }).success, false);
});
