const assert = require('node:assert/strict');
const { test } = require('node:test');
const { chunkSections, indexPassages, rankPassages, selectExcerpts, sourcesKey, formatCitation } = require('../lib/sources.ts');
const { fileKind, stripMarkdown, splitParagraphSections, epubSpine, ACCEPT_PROMPT, ACCEPT_SOURCES, MAX_FILE_BYTES } = require('../lib/file-text.ts');

const words = (n, word = 'filler') => Array.from({ length: n }, (_, i) => `${word}${i % 7}`).join(' ');

test('chunks stay within size, split on paragraph then sentence boundaries, and keep locations', () => {
  const long = Array.from({ length: 40 }, (_, i) => `Sentence number ${i} talks about something.`).join(' ');
  const passages = chunkSections('b1', 'Book', [{ location: 'p. 1', text: `Short opening.\n\nSecond paragraph.\n\n${long}` }, { location: 'p. 2', text: '   \n\n  ' }, { location: 'p. 3', text: 'Last page.' }], 300);
  assert.ok(passages.every((p) => p.text.length <= 300 && p.text.trim() === p.text && p.text));
  assert.ok(passages[0].text.startsWith('Short opening.\n\nSecond paragraph.\n\nSentence number 0 '));
  assert.ok(passages.slice(1, -1).every((p) => p.location === 'p. 1' && /\.$/.test(p.text)));
  assert.deepEqual(passages.at(-1), { sourceId: 'b1', title: 'Book', location: 'p. 3', text: 'Last page.' });
  assert.equal(passages.slice(0, -1).map((p) => p.text).join(' ').replace(/\s+/g, ' '), `Short opening. Second paragraph. ${long}`);
  const run = chunkSections('b', 'B', [{ location: 'x', text: words(200) }], 100);
  assert.ok(run.every((p) => p.text.length <= 100 && !/^\S*\d\S*\d/.test(p.text.split(' ')[0].slice(7))));
  assert.equal(run.map((p) => p.text).join(' '), words(200));
});

test('an exact phrase outranks term overlap; term ranking prefers rarer shared words', () => {
  const index = indexPassages([
    { sourceId: 'a', title: 'Antigone', location: 'l. 1', text: 'Creon speaks of the city and the law of the city, the law, the law.' },
    { sourceId: 'a', title: 'Antigone', location: 'l. 2', text: 'Antigone says: I was born to join in love, not hate.' },
    { sourceId: 'b', title: 'Ethics', location: 'p. 4', text: 'Love and duty pull against each other; duty wins in tragedy.' },
    { sourceId: 'b', title: 'Ethics', location: 'p. 5', text: 'Nothing relevant here at all.' },
  ]);
  const exact = rankPassages(index, '“born to join in love”');
  assert.equal(exact[0].location, 'l. 2');
  assert.ok(exact[0].score > 1000);
  assert.deepEqual(rankPassages(index, 'duty').map((r) => r.location), ['p. 4']);
  assert.deepEqual(rankPassages(index, 'love city').map((r) => r.location).sort(), ['l. 1', 'l. 2', 'p. 4']);
  assert.deepEqual(rankPassages(index, 'zebra'), []);
  assert.equal(rankPassages(index, 'love', 1).length, 1);
});

test('snippets are short, centered on the match, and trimmed at word boundaries', () => {
  const text = `${words(150, 'before')} the hidden phrase sits here ${words(150, 'after')}`;
  const [hit] = rankPassages(indexPassages([{ sourceId: 's', title: 'T', location: 'p. 1', text }]), 'hidden phrase sits');
  assert.ok(hit.snippet.length <= 400);
  assert.ok(hit.snippet.includes('the hidden phrase sits here'));
  assert.ok(hit.snippet.startsWith('…') && hit.snippet.endsWith('…'));
  for (const w of hit.snippet.slice(1, -1).split(' ')) assert.match(w, /^(before\d|after\d|the|hidden|phrase|sits|here)$/);
  const short = rankPassages(indexPassages([{ sourceId: 's', title: 'T', location: 'p. 1', text: 'Tiny hidden text.' }]), 'hidden');
  assert.equal(short[0].snippet, 'Tiny hidden text.');
});

test('excerpts put quoted passages first and never exceed the budget', () => {
  const passages = [
    { sourceId: 'a', title: 'Antigone', location: 'l. 10', text: `Chorus on fate and the gods. ${words(60, 'chorus')}` },
    { sourceId: 'a', title: 'Antigone', location: 'l. 20', text: 'Creon: whoever the city appoints must be obeyed in small things and in just and unjust.' },
    { sourceId: 'b', title: 'Essay on Tragedy', location: 'p. 3', text: 'Fate and the gods shape tragedy; the chorus speaks for the city.' },
  ];
  const index = indexPassages(passages);
  const essay = ['Creon insists that "whoever the city appoints must be obeyed in small things" even when unjust.', 'Fate and the gods matter to the chorus.'];
  const all = selectExcerpts(index, essay, 100000);
  assert.ok(all.text.startsWith('[Antigone, l. 20]\nCreon: whoever'));
  assert.equal(all.count, 3);
  assert.deepEqual(all.titles.sort(), ['Antigone', 'Essay on Tragedy']);
  for (const budget of [0, -5, 50, 120, 200, 400]) {
    const out = selectExcerpts(index, essay, budget);
    assert.ok(out.text.length <= Math.max(0, budget), `budget ${budget}`);
    assert.equal(out.count, out.text ? out.text.split(/\n\n(?=\[)/).length : 0);
  }
  assert.deepEqual(selectExcerpts(index, essay, 0), { text: '', count: 0, titles: [] });
  const paraphrased = selectExcerpts(index, ['He says "whoever the city appoints must be obeyed in all things, always" here.'], 100000);
  assert.ok(paraphrased.text.startsWith('[Antigone, l. 20]'));
});

test('sourcesKey only changes when books are present and citations are formatted', () => {
  assert.equal(sourcesKey('Manual notes', []), 'Manual notes');
  assert.equal(sourcesKey('Manual notes', [{ id: 'a', chars: 10 }, { id: 'b', chars: 5 }]), 'Manual notes\u0000a:10,b:5');
  assert.notEqual(sourcesKey('', [{ id: 'a', chars: 10 }]), sourcesKey('', [{ id: 'a', chars: 11 }]));
  assert.equal(formatCitation({ title: 'Antigone', location: 'l. 523' }, '  I was born\n to join in love '), '“I was born to join in love” (Antigone, l. 523)');
});

test('file kinds and markdown cleanup', () => {
  assert.deepEqual(['a.TXT', 'b.md', 'c.markdown', 'd.pdf', 'e.Docx', 'f.epub', 'g.doc', 'noext', 'x.pdf.exe'].map(fileKind), ['txt', 'md', 'md', 'pdf', 'docx', 'epub', null, null, null]);
  assert.equal(ACCEPT_PROMPT, '.txt,.md,.markdown,.pdf,.docx');
  assert.ok(ACCEPT_SOURCES.endsWith('.epub'));
  assert.equal(MAX_FILE_BYTES, 60 * 1024 * 1024);
  const md = '---\ntitle: Prompt\n---\n# Essay prompt\n\nWrite **1500 words** on _Antigone_ and see [the rubric](https://x.y/r).\n\n- Thesis\n- Evidence\n\n```\ncode\n```\n![img](a.png)\nsnake_case stays.';
  assert.equal(stripMarkdown(md), 'Essay prompt\n\nWrite 1500 words on Antigone and see the rubric.\n\nThesis\nEvidence\n\n\ncode\n\n\nsnake_case stays.');
});

test('paragraph sections group up to the size and are labeled by first paragraph', () => {
  assert.deepEqual(splitParagraphSections('One.\n\nTwo.\n\n\nThree.', 11), [{ location: 'para. 1', text: 'One.\n\nTwo.' }, { location: 'para. 3', text: 'Three.' }]);
  assert.deepEqual(splitParagraphSections('Line one.\r\nLine two.\nLine three.', 3000), [{ location: 'para. 1', text: 'Line one.\n\nLine two.\n\nLine three.' }]);
  const long = 'x'.repeat(50);
  assert.deepEqual(splitParagraphSections(`a\n\n${long}\n\nb`, 20).map((s) => s.location), ['para. 1', 'para. 2', 'para. 3']);
  assert.deepEqual(splitParagraphSections('  \n\n '), []);
});

test('epub spine follows reading order from a nested OPF and skips non-html items', () => {
  const container = '<?xml version="1.0"?><container><rootfiles><rootfile full-path="OEBPS/content/book.opf" media-type="application/oebps-package+xml"/></rootfiles></container>';
  const opf = `<package><manifest>
    <item id="css" href="../style.css" media-type="text/css"/>
    <item href="ch%202.xhtml" id="c2" media-type="application/xhtml+xml"/>
    <item id="c1" href="text/ch1.xhtml#start" media-type="application/xhtml+xml"/>
    <item id="img" href="cover.jpg" media-type="image/jpeg"/>
    <item id="nav" href="../nav.html" media-type="text/html"/>
  </manifest><spine toc="ncx"><itemref idref="nav"/><itemref idref="c1"/><itemref idref="img"/><itemref idref="c2"/><itemref idref="css"/></spine></package>`;
  assert.deepEqual(epubSpine(container, opf), { opfPath: 'OEBPS/content/book.opf', hrefs: ['OEBPS/nav.html', 'OEBPS/content/text/ch1.xhtml', 'OEBPS/content/ch 2.xhtml'] });
  assert.deepEqual(epubSpine('<container><rootfile full-path="book.opf"/></container>', '<item id="a" href="a.html" media-type="application/xhtml+xml"/><itemref idref="a"/>'), { opfPath: 'book.opf', hrefs: ['a.html'] });
  assert.deepEqual(epubSpine('', ''), { opfPath: '', hrefs: [] });
});

test('only two-word or 8+ char queries earn the exact-match bonus; stopword-only queries match nothing', () => {
  const index = indexPassages([{ sourceId: 'a', title: 'A', location: 'l. 1', text: 'Polyneices lies unburied outside Thebes.' }, { sourceId: 'a', title: 'A', location: 'l. 2', text: 'Ismene stays inside.' }]);
  assert.ok(rankPassages(index, 'Polyneices')[0].score > 1000);
  assert.ok(rankPassages(index, 'lies unburied')[0].score > 1000);
  assert.ok(rankPassages(index, 'stays')[0].score < 1000);
  assert.deepEqual(rankPassages(index, 'there were which'), []);
  assert.deepEqual(rankPassages(index, ''), []);
});
