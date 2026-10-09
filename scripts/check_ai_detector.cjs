const assert = require('node:assert/strict');
const { test } = require('node:test');
const { splitSentences, variation, scoreEssay, groundPredictions, PredictabilityRequest } = require('../lib/ai-check.ts');

test('sentences keep their exact text, skip abbreviations, and handle closing quotes', () => {
  const s = splitSentences(['Creon speaks first (see p. 12).  Antigone answers, “No.” Then she leaves!', 'One more e.g. here. The end.'])
  assert.deepEqual(s.map((x) => x.text), ['Creon speaks first (see p. 12).', 'Antigone answers, “No.”', 'Then she leaves!', 'One more e.g. here.', 'The end.']);
  assert.deepEqual(s.map((x) => x.paragraphId), [0, 0, 0, 1, 1]);
  assert.equal(s[1].words, 3);
  assert.equal(s[2].opener, 'then');
});

test('heading and title lines are skipped but keep paragraph numbering', () => {
  const s = splitSentences(['Jordan Lee', '13 October 2026', 'Fate and Choice in Antigone', '', 'Creon rules. He falls.']);
  assert.deepEqual(s.map((x) => [x.paragraphId, x.text]), [[4, 'Creon rules.'], [4, 'He falls.']]);
});

test('even sentence lengths read as flat; varied lengths read as bursty', () => {
  const even = 'The king makes a law that forbids the burial today. The sister breaks the law because she loves her brother. The city watches as the conflict grows between both sides. The chorus offers advice that nobody in power will heed.';
  const varied = 'Creon decrees. Antigone, who has watched her family collapse one generation after another, refuses to let the city decide what her brother deserves in death. She acts. The chorus hesitates, unsure whether loyalty to the state or to the gods should come first.';
  const flat = scoreEssay(even, splitSentences([even]), new Map());
  const bursty = scoreEssay(varied, splitSentences([varied]), new Map());
  assert.ok(variation([10, 10, 10]) === 0);
  assert.ok(flat.burstiness.score > 80, `flat ${flat.burstiness.score}`);
  assert.ok(bursty.burstiness.score < 20, `bursty ${bursty.burstiness.score}`);
  assert.ok(flat.sentences.every((x) => x.reasons.some((r) => r.startsWith('Similar length'))));
  assert.ok(flat.sentences[0].repeatedOpener);
});

test('cached predictions apply by sentence text, so unchanged sentences keep their score', () => {
  const sentences = splitSentences(['Moreover, it plays a crucial role. I hated the ending, honestly.']);
  const cache = new Map([[sentences[0].text, { predictability: 90, phrases: ['plays a crucial role'], note: 'Stock phrasing.' }]]);
  const check = scoreEssay('x', sentences, cache, { rescored: 1, reused: 1 });
  assert.equal(check.sentences[0].predictability, 90);
  assert.equal(check.sentences[1].predictability, 0);
  assert.ok(check.sentences[0].score > check.sentences[1].score);
  assert.equal(check.reused, 1);
});

test('model output is grounded to requested sentences and real phrases', () => {
  const input = PredictabilityRequest.parse({ sentences: [{ id: 0, paragraphId: 0, text: 'It plays a crucial role.' }, { id: 1, paragraphId: 0, text: 'Odd one.' }], targets: [0] });
  const out = groundPredictions({ sentences: [
    { id: 0, predictability: 140, phrases: ['plays a crucial role', 'invented phrase'], note: ' Stock. ' },
    { id: 0, predictability: 10, phrases: [], note: '' },
    { id: 1, predictability: 50, phrases: [], note: '' },
    { id: 7, predictability: 50, phrases: [], note: '' },
  ] }, input);
  assert.deepEqual(out, [{ id: 0, predictability: 100, phrases: ['plays a crucial role'], note: 'Stock.' }]);
});
