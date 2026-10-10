const assert = require('node:assert/strict');
const { test } = require('node:test');
const { computeGrade, groundGrade, letterFor, GradeRequest, TRAITS } = require('../lib/essay-grade.ts');

const all = (level) => Object.fromEntries(TRAITS.map((t) => [t.key, level]));

test('weights sum to 100 and every trait has five level descriptors', () => {
  assert.equal(TRAITS.reduce((n, t) => n + t.weight, 0), 100);
  assert.ok(TRAITS.every((t) => t.levels.length === 5));
});

test('rubric levels map to letter grades, not a straight fraction', () => {
  assert.equal(computeGrade(all(4), true).letter, 'A');
  assert.equal(computeGrade(all(3), true).letter, 'B');
  assert.equal(computeGrade(all(2), true).letter, 'C');
  assert.equal(computeGrade(all(1), true).letter, 'D');
  assert.equal(letterFor(89.9 | 0), 'B+');
});

test('evidence outweighs language: strong evidence with weak mechanics beats the reverse', () => {
  const strongArgument = computeGrade({ ...all(3), evidence: 4, language: 1 }, true).percent;
  const polishedOnly = computeGrade({ ...all(3), evidence: 1, language: 4 }, true).percent;
  assert.ok(strongArgument > polishedOnly, `${strongArgument} vs ${polishedOnly}`);
});

test('not answering the prompt caps the grade', () => {
  const g = computeGrade({ ...all(4), prompt: 1 }, true);
  assert.equal(g.percent, 72); assert.ok(g.capped);
  assert.equal(computeGrade({ ...all(4), prompt: 0 }, true).percent, 55);
  assert.ok(!computeGrade(all(2), true).capped);
});

test('without a prompt the prompt trait is left out and the rest reweighted', () => {
  const g = computeGrade({ ...all(3), prompt: 0 }, false);
  assert.equal(g.percent, 85); assert.ok(!g.capped);
});

test('grounding drops invented quotes, clamps levels, keeps one entry per trait', () => {
  const draft = 'Creon fails because he confuses law with justice. In line 450, Antigone defies him.';
  const input = GradeRequest.parse({ draft, brief: 'Argue whether Creon is a tragic hero. Use two quotations.', words: 15 });
  const traits = TRAITS.map((t) => ({ trait: t.key, evidence: ['Creon fails because he confuses law with justice.', 'not in the essay'], strengths: 's', weaknesses: 'w', level: 3 }));
  traits[1] = { ...traits[1], level: 9 };
  traits.push({ ...traits[0], level: 0 }); // duplicate is ignored
  const g = groundGrade({
    requirements: [{ requirement: 'Use two quotations', evidence: 'invented quote', status: 'partial', note: 'Only one quotation.' }],
    thesis: 'Creon fails because he confuses law with justice.', traits,
    nextSteps: [{ trait: 'evidence', step: 'Add a second quotation from the Creon–Haemon scene.' }],
  }, input);
  assert.equal(g.traits.length, TRAITS.length);
  assert.equal(g.traits[0].level, 3);
  assert.equal(g.traits[1].level, 4); assert.equal(g.traits[1].weaknesses, '');
  assert.deepEqual(g.traits[0].evidence, ['Creon fails because he confuses law with justice.']);
  assert.equal(g.requirements[0].evidence, '');
  assert.equal(g.thesis, 'Creon fails because he confuses law with justice.');
  assert.ok(g.promptScored);
});
