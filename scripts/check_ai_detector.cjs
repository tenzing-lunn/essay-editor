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

test('humanShare weighs sentences by words and counts AI_POSSIBLE as AI-patterned', () => {
  const { humanShare, AI_POSSIBLE } = require('../lib/ai-check.ts');
  const s = (words, score) => ({ words, score });
  assert.equal(AI_POSSIBLE, 55);
  assert.deepEqual(humanShare({ sentences: [s(10, 0), s(5, AI_POSSIBLE - 1)] }), { human: 100, ai: 0, words: 15 });
  assert.deepEqual(humanShare({ sentences: [s(10, AI_POSSIBLE)] }), { human: 0, ai: 100, words: 10 });
  assert.deepEqual(humanShare({ sentences: [s(30, 90), s(10, 10)] }), { human: 25, ai: 75, words: 40 });
  for (const sentences of [[s(1, 60), s(2, 0)], [s(7, 60), s(11, 0), s(13, 55)], [s(3, 99), s(3, 1), s(3, 56)]]) {
    const share = humanShare({ sentences });
    assert.equal(share.human + share.ai, 100);
  }
  assert.equal(humanShare({ sentences: [] }), null);
  assert.equal(humanShare({ sentences: [s(0, 90)] }), null);
});

test('even rhythm alone never flags formal human prose; it only strengthens a wording flag', () => {
  const { AI_POSSIBLE } = require('../lib/ai-check.ts');
  const even = 'The king makes a law that forbids the burial today. The sister breaks the law because she loves her brother. The city watches as the conflict grows between both sides. The chorus offers advice that nobody in power will heed.';
  const sentences = splitSentences([even]);
  const plain = scoreEssay(even, sentences, new Map(sentences.map((x) => [x.text, { predictability: 30, phrases: [], note: '' }])));
  assert.ok(plain.sentences.every((x) => x.score < AI_POSSIBLE), plain.sentences.map((x) => x.score).join());
  const tells = scoreEssay(even, sentences, new Map(sentences.map((x) => [x.text, { predictability: 60, phrases: [], note: 'Stock.' }])));
  assert.ok(tells.sentences.every((x) => x.score > 60));
});

const { detectorText, tokens, sentenceNgrams, windowOf, detect } = require('../lib/ai-detector.ts');
const { styleScore, AI_POSSIBLE: POSSIBLE, AI_LIKELY: LIKELY } = require('../lib/ai-check.ts');

test('the detector reads text without citations, links or quote and dash variants', () => {
  assert.equal(detectorText('Creon’s law (Sophocles 45) fails—“badly” [3] at https://x.y/z today.'), 'Creon\'s law fails — "badly" at today.');
  assert.deepEqual(tokens('It’s 1818; he fails.'), ["it's", '<num>', ';', 'he', 'fails', '.']);
  assert.equal(sentenceNgrams('the the cat').get('the'), 2);
  assert.equal(sentenceNgrams('the the cat').get('the cat'), 1);
});

test('a sentence is scored with its neighbours in the same paragraph only', () => {
  const s = [{ paragraphId: 0 }, { paragraphId: 0 }, { paragraphId: 1 }, { paragraphId: 1 }, { paragraphId: 1 }];
  assert.deepEqual(windowOf(s, 1), [0, 1]);
  assert.deepEqual(windowOf(s, 3), [2, 3, 4]);
});

const tiny = {
  version: 'test', ngrams: { delve: 3, 'pivotal role': 2, honestly: -3 }, bias: -1,
  numeric: { names: [], mean: [], std: [], weights: [] },
  doc: { names: ['meanLogit'], mean: [0], std: [1], weights: [1], bias: 0 },
  thresholds: { sentencePossible: 0, sentenceLikely: 1, docAi: 0.9, docMixed: 0.6 },
};

test('detect scores sentences from n-gram weights and returns exact evidence phrases', () => {
  const sentences = [{ paragraphId: 0, text: 'We Delve into its pivotal role.' }, { paragraphId: 1, text: 'Honestly I hated it.' }];
  const d = detect(tiny, sentences);
  assert.ok(d.sentences[0].logit > 0 && d.sentences[1].logit < 0);
  assert.deepEqual(d.sentences[0].phrases, ['Delve', 'pivotal role']);
  assert.deepEqual(d.sentences[1].phrases, []);
  assert.ok(['human', 'mixed', 'ai'].includes(d.label));
});

test('detector cut-offs land on the check scale, and the AI wording score can raise a sentence but never lower it', () => {
  const t = tiny.thresholds;
  assert.equal(styleScore(0, t), POSSIBLE);
  assert.equal(styleScore(1, t), LIKELY);
  assert.equal(styleScore(-10, t), 0);
  const sentences = splitSentences(['We delve into it. It plays a pivotal role. Honestly I hated it.']);
  const detection = detect(tiny, sentences);
  const plain = scoreEssay('x', sentences, new Map(), undefined, { detection, model: tiny });
  const worded = scoreEssay('x', sentences, new Map(sentences.map((s) => [s.text, { predictability: 90, phrases: [], note: 'Stock.' }])), undefined, { detection, model: tiny });
  plain.sentences.forEach((s, i) => assert.ok(worded.sentences[i].score >= s.score));
  assert.ok(worded.sentences[2].score > plain.sentences[2].score);
  assert.equal(plain.detector.version, 'test');
  // Only sentences the model actually scored are reused on the next check; the detector's phrases stay apart from the model's.
  assert.deepEqual(plain.sentences.map((s) => s.scored), [false, false, false]);
  assert.deepEqual(worded.sentences.map((s) => s.scored), [true, true, true]);
  assert.deepEqual(plain.sentences[0].phrases, []);
  assert.deepEqual(plain.sentences[0].stylePhrases, ['delve']);
  assert.ok(plain.sentences[0].reasons[0].startsWith('Word choice and rhythm'));
});

test('the shipped model separates stock chatbot prose from a casual student paragraph', () => {
  const { DETECTOR_MODEL } = require('../lib/ai-detector-model.ts');
  const ai = splitSentences(['Ultimately, the novel serves as a powerful testament to the enduring complexities of ambition. Moreover, it underscores the pivotal role that isolation plays in shaping identity. By exploring these intricate themes, Shelley invites readers to reflect on the profound responsibilities of creation.']);
  const human = splitSentences(["I didn't like Victor at all, honestly. He makes this thing and then just runs off because it's ugly? My roommate said that's the point of the book and I guess she's right."]);
  const a = detect(DETECTOR_MODEL, ai), h = detect(DETECTOR_MODEL, human);
  assert.ok(Math.min(...a.sentences.map((s) => s.logit)) > Math.max(...h.sentences.map((s) => s.logit)));
});
