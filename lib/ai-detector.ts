import type { Sentence } from "./ai-check.ts";

/**
 * Local AI-text detector: a logistic model trained on human and AI-written essays (scripts/ai-detector/), run in the browser.
 * Each sentence is scored in a window of itself and its neighbours, from two kinds of evidence:
 *  - word and punctuation n-grams (which words and constructions the writer reaches for), and
 *  - style rates (rhythm, punctuation, contractions, first person, stock transitions, words models overuse).
 * The essay score combines the sentence scores with whole-essay rhythm. Training and the app share this file, so features match exactly.
 */

export type DetectorModel = {
  version: string;
  ngrams: Record<string, number>;
  numeric: { names: string[]; mean: number[]; std: number[]; weights: number[] };
  bias: number;
  doc: { names: string[]; mean: number[]; std: number[]; weights: number[]; bias: number };
  /** Sentence logit cut-offs chosen on held-out human essays, and the essay probability cut-offs. */
  thresholds: { sentencePossible: number; sentenceLikely: number; docAi: number; docMixed: number };
};

// Stock vocabulary whose use rose sharply after chat models arrived (Kobak et al. 2024, Liang et al. 2024) plus common chat-model tells.
export const EXCESS_WORDS = new Set(("delve delves delved delving showcase showcases showcased showcasing underscore underscores underscored underscoring " +
  "pivotal intricate intricately intricacies tapestry realm realms multifaceted nuanced testament crucial crucially comprehensive meticulous meticulously " +
  "commendable notably foster fosters fostering fostered garner garnered bolster bolstered navigate navigates navigating navigation landscape embark embarks " +
  "endeavor endeavors endeavour unwavering profound profoundly poignant poignantly resonate resonates resonated resonating vibrant interplay encompass " +
  "encompasses encompassing seamless seamlessly leverage leveraging paramount invaluable enhance enhances enhancing elevate elevates evoke evokes evoking " +
  "complexities insightful adept intriguing captivating compelling vital ultimately additionally furthermore moreover overall significance significantly " +
  "highlight highlights highlighting highlighted emphasize emphasizes emphasizing illuminate illuminates illuminating reflects reflecting enduring timeless " +
  "serves embodies embody embodying signifies symbolizes juxtaposition nuance nuances dynamic dynamics transformative holistic robust essence").split(" "));

const TRANSITION_OPENERS = new Set("moreover furthermore additionally however overall ultimately thus therefore consequently notably importantly similarly likewise conversely nevertheless nonetheless hence indeed in".split(" "));

/** Text as the detector reads it: straight quotes, one dash, citations and URLs removed (those are formatting, not voice). */
export function detectorText(text: string): string {
  return text
    .replace(/[‘’ʼ`]/g, "'").replace(/[“”«»]/g, '"')
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/\s*\([^()]*\d[^()]*\)/g, "") // (Smith, 2020), (p. 12), (Sophocles 45)
    .replace(/\s*\[[^\][]*\d[^\][]*\]/g, "")  // [3]
    .replace(/\s?(?:—|–|--)\s?/g, " — ")
    .replace(/\s+/g, " ").trim();
}

/** Lowercase word, number and punctuation tokens. */
export function tokens(text: string): string[] {
  return (detectorText(text).toLowerCase().match(/[a-z]+(?:'[a-z]+)*|\d+(?:[.,]\d+)*|[.,;:!?"()—]/g) ?? [])
    .map((t) => /^\d/.test(t) ? "<num>" : t);
}

/** Unigrams and bigrams of a sentence, with counts. Bigrams don't cross sentences. */
export function sentenceNgrams(text: string): Map<string, number> {
  const t = tokens(text);
  const out = new Map<string, number>();
  const add = (k: string) => out.set(k, (out.get(k) ?? 0) + 1);
  t.forEach((w, i) => { add(w); if (i) add(`${t[i - 1]} ${w}`); });
  return out;
}

/**
 * Raw per-sentence counts; window features are ratios of summed counts, so neighbours combine exactly.
 * No contraction, first/second-person or dash rates: in the training essays those mark register and era, not authorship (scripts/ai-detector/train.py).
 */
export type SentenceCounts = {
  words: number; chars: number; tokens: number; commas: number; semicolons: number; colons: number; parens: number;
  questions: number; exclaims: number; quotes: number; excess: number;
  transition: number; longWords: number; digits: number; the: number; and: number; unique: Set<string>;
};

export function sentenceCounts(text: string): SentenceCounts {
  const t = tokens(text);
  const words = t.filter((w) => /^[a-z<]/.test(w));
  const count = (s: string) => t.filter((w) => w === s).length;
  const first = words[0] === "in" ? `in ${words[1] ?? ""}` : words[0];
  return {
    words: words.length,
    chars: words.reduce((n, w) => n + (w === "<num>" ? 1 : w.length), 0),
    tokens: t.length,
    commas: count(","), semicolons: count(";"), colons: count(":"), parens: count("("),
    questions: count("?"), exclaims: count("!"), quotes: count('"'),
    excess: words.filter((w) => EXCESS_WORDS.has(w)).length,
    transition: words.length && (TRANSITION_OPENERS.has(words[0]) && (words[0] !== "in" || /^in (conclusion|summary|essence|addition|contrast|fact|short)$/.test(first))) ? 1 : 0,
    longWords: words.filter((w) => w.length >= 9).length,
    digits: count("<num>"),
    the: count("the"), and: count("and"),
    unique: new Set(words),
  };
}

const cv = (xs: number[]) => {
  if (xs.length < 2) return 0;
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  return m ? Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / xs.length) / m : 0;
};

/** Neighbouring sentences in the same paragraph (one either side), the unit every sentence is scored in. */
export function windowOf(sentences: Pick<Sentence, "paragraphId">[], i: number): number[] {
  return [i - 1, i, i + 1].filter((j) => j >= 0 && j < sentences.length && sentences[j].paragraphId === sentences[i].paragraphId);
}

/** Style rates for a window, by name; the model reads the ones it lists. */
export function windowNumeric(counts: SentenceCounts[], window: number[], target: number): Record<string, number> {
  const sum = (k: Exclude<keyof SentenceCounts, "unique">) => window.reduce((n, j) => n + counts[j][k], 0);
  const words = Math.max(1, sum("words"));
  const unique = new Set(window.flatMap((j) => [...counts[j].unique])).size;
  const rate = (k: Exclude<keyof SentenceCounts, "unique">) => sum(k) / words;
  return {
    sentWords: counts[target].words, logSentWords: Math.log1p(counts[target].words), windowLenCv: cv(window.map((j) => counts[j].words)), wordLen: sum("chars") / words,
    commaRate: rate("commas"), semicolonRate: rate("semicolons"), colonRate: rate("colons"), parenRate: rate("parens"), questionRate: rate("questions"),
    exclaimRate: rate("exclaims"), quoteRate: rate("quotes"), excessRate: rate("excess"), transitionShare: sum("transition") / window.length, longWordRate: rate("longWords"), digitRate: rate("digits"),
    theRate: rate("the"), andRate: rate("and"), ttr: unique / Math.sqrt(words),
  };
}

export function docNumeric(sentences: Pick<Sentence, "paragraphId">[], counts: SentenceCounts[], logits: number[]): Record<string, number> {
  const n = Math.max(1, logits.length);
  const mean = logits.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(logits.reduce((a, x) => a + (x - mean) ** 2, 0) / n);
  const paragraphs = new Map<number, number>();
  sentences.forEach((s, i) => paragraphs.set(s.paragraphId, (paragraphs.get(s.paragraphId) ?? 0) + counts[i].words));
  const words = Math.max(1, counts.reduce((a, c) => a + c.words, 0));
  return {
    meanLogit: mean, sdLogit: sd, shareAbove: logits.filter((l) => l > 0).length / n, sentLenCv: cv(counts.map((c) => c.words)), paraLenCv: cv([...paragraphs.values()]),
    excessRate: counts.reduce((a, c) => a + c.excess, 0) / words,
  };
}

const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));
const linear = (x: Record<string, number>, m: { names: string[]; mean: number[]; std: number[]; weights: number[] }) =>
  m.names.reduce((a, name, i) => a + m.weights[i] * (((x[name] ?? 0) - m.mean[i]) / (m.std[i] || 1)), 0);

export type SentenceDetection = { logit: number; probability: number; phrases: string[] };
export type Detection = { sentences: SentenceDetection[]; probability: number; label: "human" | "mixed" | "ai" };

/** Score every sentence (in context) and the essay. Sentences must be in essay order. */
export function detect(model: DetectorModel, sentences: Pick<Sentence, "paragraphId" | "text">[]): Detection {
  const counts = sentences.map((s) => sentenceCounts(s.text));
  const grams = sentences.map((s) => sentenceNgrams(s.text));
  const logits = sentences.map((_, i) => {
    const window = windowOf(sentences, i);
    const scale = 1 / Math.sqrt(Math.max(1, window.reduce((n, j) => n + counts[j].tokens, 0)));
    let z = model.bias + linear(windowNumeric(counts, window, i), model.numeric);
    for (const j of window) for (const [g, c] of grams[j]) z += (model.ngrams[g] ?? 0) * c * scale;
    return z;
  });
  const results = sentences.map((s, i): SentenceDetection => ({ logit: logits[i], probability: sigmoid(logits[i]), phrases: evidence(model, s.text, grams[i]) }));
  const probability = sentences.length ? sigmoid(model.doc.bias + linear(docNumeric(sentences, counts, logits), model.doc)) : 0;
  const label = probability >= model.thresholds.docAi ? "ai" : probability >= model.thresholds.docMixed ? "mixed" : "human";
  return { sentences: results, probability, label };
}

// Words that carry weight in the model but mean nothing to a writer when quoted back as "AI wording".
const PLAIN = new Set(("a an the and or but if so as at by for from in into of on onto to up with within than then that this these those it its is are was were be been being " +
  "can could may might must should will would do does did has have had not no just like own also only very more most such which who whom whose what when where how why " +
  "there here they them their he him his she her one ones some any all each other way essay key").split(" "));

/** The sentence's strongest AI-leaning wording, as exact substrings so the editor can underline them. Stock vocabulary first. */
function evidence(model: DetectorModel, text: string, grams: Map<string, number>): string[] {
  const rank = (g: string) => model.ngrams[g] + (EXCESS_WORDS.has(g) ? 2 : 0);
  const words = [...grams.keys()].filter((g) => /^[a-z' ]+$/.test(g) && (model.ngrams[g] ?? 0) > 0.4 && g.split(" ").some((w) => !PLAIN.has(w)))
    .sort((a, b) => rank(b) - rank(a));
  const out: string[] = [];
  for (const g of words) {
    if (out.length >= 3 || out.some((o) => o.toLowerCase().includes(g) || g.includes(o.toLowerCase()))) continue;
    const match = new RegExp(`\\b${g.replace(/'/g, "['’]").replace(/ /g, "\\s+")}\\b`, "i").exec(text);
    if (match) out.push(match[0]);
  }
  return out;
}
