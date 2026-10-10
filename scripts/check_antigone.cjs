const assert = require('node:assert/strict');
const { test } = require('node:test');
const { parseAntigone, findBookQuotes, scaifeUrl } = require('../lib/antigone.ts');

const XML = `<TEI><text><body>
<sp><speaker>Antigone</speaker><l n="1">Ismene, sister, <stage>aside</stage>mine own dear sister,</l>
<l n="4">knowest thou what ill there is &amp; what woe</l></sp>
<sp><speaker>Ismene</speaker><l n="11">No word of friends, Antigone, hath come to me,</l>
<l n="15">since we two sisters were bereft of our brothers’ lives.</l></sp>
<sp><speaker>Creon</speaker><l n="162">Sirs, the vessel of our State, after being tossed</l></sp>
</body></text></TEI>`;
const blocks = parseAntigone(XML);

test('parses speakers and block ranges, dropping stage directions and decoding entities', () => {
  assert.deepEqual(blocks.map((b) => [b.speaker, b.start, b.end]), [['Antigone', 1, 3], ['Antigone', 4, 10], ['Ismene', 11, 14], ['Ismene', 15, 161], ['Creon', 162, 162]]);
  assert.equal(blocks[0].text, 'Ismene, sister, mine own dear sister,');
  assert.equal(blocks[1].text, 'knowest thou what ill there is & what woe');
  assert.throws(() => parseAntigone('<TEI></TEI>'), /could not be read/);
});

test('line numbers return the whole blocks that cover them, with a Scaife link', () => {
  const single = findBookQuotes(blocks, '2');
  assert.equal(single.total, 1);
  assert.deepEqual(single.quotes[0], { text: blocks[0].text, reference: '1-3', speaker: 'Antigone', url: 'https://scaife.perseus.org/reader/urn:cts:greekLit:tlg0011.tlg002.perseus-eng2:1-3/' });
  const range = findBookQuotes(blocks, ' 5 – 12 ').quotes[0];
  assert.equal(range.reference, '4-14');
  assert.equal(range.speaker, 'Antigone / Ismene');
  assert.equal(range.text, `${blocks[1].text} ${blocks[2].text}`);
  assert.equal(range.url, scaifeUrl('4-14'));
  assert.deepEqual(findBookQuotes(blocks, '500'), { quotes: [], total: 0 });
});

test('invalid ranges are rejected', () => {
  for (const query of ['0', '12-5', '1-102']) assert.throws(() => findBookQuotes(blocks, query), /valid range of up to 101 lines/);
  assert.equal(findBookQuotes(blocks, '1-101').total, 1);
});

test('phrases match across a same-speaker block break and ignore curly quotes and case', () => {
  const across = findBookQuotes(blocks, 'dear sister, knowest thou');
  assert.equal(across.total, 1);
  assert.equal(across.quotes[0].reference, '1-10');
  assert.equal(findBookQuotes(blocks, "brothers' lives. sirs").total, 0, 'a phrase never spans two speakers');
  assert.equal(findBookQuotes(blocks, "brothers' lives").quotes[0].reference, '15-161');
  assert.equal(findBookQuotes(blocks, '“No WORD of friends”').quotes[0].reference, '11-14');
  assert.deepEqual(findBookQuotes(blocks, '  ').quotes, []);
});
