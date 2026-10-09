// Uploaded books and readings: chunked into passages, searched locally, and sent to the model only as short excerpts.
export type Section = { location: string; text: string };
export type Passage = { sourceId: string; title: string; location: string; text: string };
export type PassageIndex = { passages: Passage[]; terms: Set<string>[]; df: Map<string, number> };
type Ranked = Passage & { snippet: string; score: number };

const STOPWORDS = new Set(("about above after again against also among another because been before being below between both cannot could does doing down during each either even every from further have having here hers herself himself into itself just like many more most much must myself neither never once only other ourselves over same shall should since some still such than that their theirs them themselves then there these they this those though through thus under until upon very were what when where whether which while whom whose will with within without would your yours yourself").split(" "));
const flat = (text: string) => text.replace(/\s+/g, " ").trim();
export const normalize = (text: string) => flat(text.toLowerCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"'));
export const terms = (text: string) => [...new Set([...normalize(text).matchAll(/\p{L}{4,}/gu)].map((m) => m[0]).filter((w) => !STOPWORDS.has(w)))];
const normalized = new WeakMap<Passage, string>();
const normOf = (p: Passage) => { let n = normalized.get(p); if (n === undefined) normalized.set(p, n = normalize(p.text)); return n; };

/** Pieces no longer than size: paragraphs, then sentences, then words. `sep` is how a piece joins the one before it. */
function pieces(text: string, size: number) {
  const out: { text: string; sep: string }[] = [];
  for (const paragraph of text.split(/\n\s*\n/)) {
    const p = flat(paragraph);
    if (!p) continue;
    let sep = "\n\n";
    const push = (t: string) => { out.push({ text: t, sep }); sep = " "; };
    if (p.length <= size) { push(p); continue; }
    for (const sentence of p.split(/(?<=[.!?…]["”’)\]]*)\s+/)) {
      if (sentence.length <= size) { push(sentence); continue; }
      let line = "";
      for (const word of sentence.split(" ")) {
        if (line && line.length + 1 + word.length > size) { push(line); line = ""; }
        if (word.length > size) { for (let i = 0; i < word.length; i += size) push(word.slice(i, i + size)); continue; }
        line = line ? `${line} ${word}` : word;
      }
      if (line) push(line);
    }
  }
  return out;
}

export function chunkSections(sourceId: string, title: string, sections: Section[], size = 1500): Passage[] {
  const out: Passage[] = [];
  for (const { location, text } of sections) {
    let window = "";
    for (const piece of pieces(text, size)) {
      if (window && window.length + piece.sep.length + piece.text.length > size) { out.push({ sourceId, title, location, text: window }); window = ""; }
      window = window ? window + piece.sep + piece.text : piece.text;
    }
    if (window) out.push({ sourceId, title, location, text: window });
  }
  return out;
}

export function indexPassages(passages: Passage[]): PassageIndex {
  const sets = passages.map((p) => new Set(terms(p.text)));
  const df = new Map<string, number>();
  for (const set of sets) for (const t of set) df.set(t, (df.get(t) ?? 0) + 1);
  return { passages, terms: sets, df };
}

const overlap = (index: PassageIndex, i: number, query: string[]) => {
  const set = index.terms[i];
  let score = 0;
  for (const t of query) if (set.has(t)) score += Math.log(1 + index.passages.length / (index.df.get(t) ?? 1));
  return set.size ? score / Math.sqrt(set.size) : 0;
};

/** ≤ 400 chars around the exact match, else around the sentence with the most query terms. */
function snippet(text: string, query: string, queryTerms: string[]) {
  const t = flat(text), max = 398;
  if (t.length <= 400) return t;
  let at = query ? normalize(t).indexOf(query) : -1, length = query.length;
  if (at < 0) {
    let best = -1;
    for (const m of t.matchAll(/[^.!?…]+[.!?…]*["”’)\]]*\s*/g)) {
      const words = new Set(terms(m[0]));
      const n = queryTerms.filter((q) => words.has(q)).length;
      if (n > best) { best = n; at = m.index; length = m[0].length; }
    }
  }
  let start = Math.max(0, Math.min(at + Math.floor(length / 2) - max / 2, t.length - max)), end = Math.min(t.length, start + max);
  if (start > 0 && t[start - 1] !== " ") start = t.indexOf(" ", start) + 1 || start;
  if (end < t.length && t[end] !== " ") end = t.lastIndexOf(" ", end) > start ? t.lastIndexOf(" ", end) : end;
  return `${start > 0 ? "…" : ""}${t.slice(start, end).trim()}${end < t.length ? "…" : ""}`;
}

export function rankPassages(index: PassageIndex, query: string, limit = 8): Ranked[] {
  const q = normalize(query).replace(/^["'\s]+|["'\s]+$/g, "");
  const queryTerms = terms(q);
  const exact = !!q && (q.includes(" ") || q.length >= 8);
  const scored: { i: number; score: number; hit: boolean }[] = [];
  index.passages.forEach((p, i) => {
    const hit = exact && normOf(p).includes(q);
    const score = (queryTerms.length ? overlap(index, i, queryTerms) : 0) + (hit ? 1000 : 0);
    if (score > 0) scored.push({ i, score, hit });
  });
  return scored.sort((a, b) => b.score - a.score).slice(0, limit)
    .map(({ i, score, hit }) => ({ ...index.passages[i], score, snippet: snippet(index.passages[i].text, hit ? q : "", queryTerms) }));
}

/** Passages the essay quotes go first, then the ones closest to the essay's vocabulary, within `budget` characters. */
export function selectExcerpts(index: PassageIndex, essayParagraphs: string[], budget: number): { text: string; count: number; titles: string[] } {
  if (budget <= 0) return { text: "", count: 0, titles: [] };
  const essay = essayParagraphs.join("\n\n");
  const order: number[] = [];
  const trim = (s: string) => s.replace(/^[\s\p{P}]+|[\s\p{P}]+$/gu, "");
  for (const m of essay.matchAll(/[“"]([^”"]{12,400})[”"]/g)) {
    const full = trim(normalize(m[1])), start = trim(full.split(" ").slice(0, 8).join(" "));
    if (!start) continue;
    let found = index.passages.flatMap((p, i) => normOf(p).includes(full) ? [i] : []);
    if (!found.length) found = index.passages.flatMap((p, i) => normOf(p).includes(start) ? [i] : []);
    for (const i of found.slice(0, 2)) if (!order.includes(i)) order.push(i);
  }
  const essayTerms = terms(essay);
  const quoted = new Set(order);
  index.passages.map((_, i) => ({ i, score: quoted.has(i) ? 0 : overlap(index, i, essayTerms) }))
    .filter((r) => r.score > 0).sort((a, b) => b.score - a.score).forEach((r) => order.push(r.i));
  const blocks: string[] = [], titles = new Set<string>();
  let length = 0;
  for (const i of order) {
    const p = index.passages[i], block = `[${p.title}, ${p.location}]\n${p.text}`;
    const next = length + (blocks.length ? 2 : 0) + block.length;
    if (next > budget) continue;
    blocks.push(block); titles.add(p.title); length = next;
  }
  return { text: blocks.join("\n\n"), count: blocks.length, titles: [...titles] };
}

export const sourcesKey = (manual: string, books: { id: string; chars: number }[]) =>
  books.length ? `${manual}\u0000${books.map((b) => `${b.id}:${b.chars}`).join(",")}` : manual;

export const formatCitation = ({ title, location }: { title: string; location: string }, quote: string) => `“${flat(quote)}” (${title}, ${location})`;
