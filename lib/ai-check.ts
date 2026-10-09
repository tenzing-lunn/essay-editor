import { z } from "zod";

/**
 * AI-writing check: two signals detectors use.
 * Predictability: how likely a model would produce these exact words (scored by the model, cached per sentence).
 * Burstiness: how much sentence length and shape vary (measured locally; humans vary more than models).
 */

export type Sentence = { id: number; paragraphId: number; text: string; words: number; opener: string };

const ABBREVIATIONS = /\b(?:e\.g|i\.e|etc|vs|cf|Mr|Mrs|Ms|Dr|St|Jr|Sr|Prof|ll|pp|p|ed|trans|vol)\.$/i;

/** Split each paragraph into sentences, keeping each sentence's exact text so it can be highlighted. */
export function splitSentences(paragraphs: string[]): Sentence[] {
  const out: Sentence[] = [];
  paragraphs.forEach((paragraph, paragraphId) => {
    // Name, date and title lines aren't prose and would skew the length statistics.
    if (!/[.!?…]["”’)\]]*\s*$/.test(paragraph) && paragraph.split(/\s+/).length < 12) return;
    const push = (raw: string) => {
      const text = raw.trim();
      const words = text.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w));
      if (!words.length) return;
      out.push({ id: out.length, paragraphId, text, words: words.length, opener: words[0].toLowerCase().replace(/[^\p{L}\p{N}']/gu, "") });
    };
    let start = 0;
    // End punctuation, optional closing quotes/brackets, then whitespace.
    for (const end of paragraph.matchAll(/[.!?…]+["”’)\]]*\s+/g)) {
      const candidate = paragraph.slice(start, end.index + end[0].length).trimEnd();
      if (ABBREVIATIONS.test(candidate)) continue;
      push(candidate);
      start = end.index + end[0].length;
    }
    push(paragraph.slice(start));
  });
  return out;
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
/** Coefficient of variation: standard deviation relative to the mean. 0 = every sentence the same length. */
export function variation(xs: number[]) {
  if (xs.length < 2) return NaN;
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2))) / m;
}
const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
// Human prose usually varies sentence length by 50%+ of the mean; models often stay near 25-35%.
const flatness = (cv: number) => Number.isNaN(cv) ? 0 : clamp(((0.6 - cv) / 0.35) * 100);

export const Prediction = z.object({
  id: z.number().int().describe("The target sentence id."),
  predictability: z.number().describe("0-100. 0 = surprising, specific, idiosyncratic wording. 100 = exactly the words a language model would most likely produce here."),
  phrases: z.array(z.string()).describe("Up to 3 exact substrings (2-8 words) of the sentence that are the most predictable, stock or model-typical. Empty if none."),
  note: z.string().describe("For predictability 50 or more, one short sentence on what makes it predictable. Empty otherwise."),
});
export type Prediction = z.infer<typeof Prediction>;
export const PredictabilityResult = z.object({ sentences: z.array(Prediction) });

export const PredictabilityRequest = z.object({
  sentences: z.array(z.object({ id: z.number().int().min(0), paragraphId: z.number().int().min(0), text: z.string().max(3000) })).min(1).max(400),
  targets: z.array(z.number().int().min(0)).min(1).max(250),
});
export type PredictabilityRequest = z.infer<typeof PredictabilityRequest>;

/** Keep only scores for requested sentences, and only phrases that really occur in them. */
export function groundPredictions(result: z.infer<typeof PredictabilityResult>, input: PredictabilityRequest): Prediction[] {
  const wanted = new Map(input.sentences.filter((s) => input.targets.includes(s.id)).map((s) => [s.id, s.text]));
  const seen = new Set<number>();
  return result.sentences.flatMap((p) => {
    const text = wanted.get(p.id);
    if (text === undefined || seen.has(p.id)) return [];
    seen.add(p.id);
    return [{ id: p.id, predictability: clamp(p.predictability), phrases: p.phrases.filter((q) => q.trim() && text.includes(q)).slice(0, 3), note: p.note.trim() }];
  });
}

export type SentenceResult = Sentence & {
  predictability: number; phrases: string[]; note: string;
  flatness: number; repeatedOpener: boolean; score: number; reasons: string[];
};
export type AiCheck = {
  draft: string; checkedAt: number; sentences: SentenceResult[];
  score: number; predictability: number; burstiness: { variation: number; score: number };
  rescored: number; reused: number;
};

/** Combine model predictability (keyed by sentence text, so unchanged sentences keep their score) with locally measured burstiness. */
export function scoreEssay(draft: string, sentences: Sentence[], predictions: Map<string, Omit<Prediction, "id">>, counts = { rescored: 0, reused: 0 }): AiCheck {
  const results = sentences.map((s, i): SentenceResult => {
    const prediction = predictions.get(s.text) ?? { predictability: 0, phrases: [], note: "" };
    const neighbors = sentences.filter((n) => n.paragraphId === s.paragraphId && Math.abs(n.id - s.id) <= 2);
    const lengths = neighbors.map((n) => n.words);
    const flat = neighbors.length >= 3 ? flatness(variation(lengths)) : 0;
    const previous = sentences[i - 1], next = sentences[i + 1];
    const repeatedOpener = !!s.opener && [previous, next].some((n) => n && n.paragraphId === s.paragraphId && n.opener === s.opener);
    const burst = Math.min(100, flat + (repeatedOpener ? 20 : 0));
    const reasons = [
      prediction.note,
      flat >= 50 ? `Similar length to its neighbors (${lengths.join(", ")} words).` : "",
      repeatedOpener ? `Starts the same way as the sentence next to it (“${s.opener}”).` : "",
    ].filter(Boolean);
    return { ...s, ...prediction, flatness: flat, repeatedOpener, score: clamp(0.6 * prediction.predictability + 0.4 * burst), reasons };
  });
  const cv = variation(sentences.map((s) => s.words));
  const burstScore = flatness(cv);
  const predictability = results.length ? clamp(mean(results.map((r) => r.predictability * r.words)) / mean(results.map((r) => r.words))) : 0;
  return {
    draft, checkedAt: Date.now(), sentences: results,
    score: clamp(0.6 * predictability + 0.4 * burstScore), predictability,
    burstiness: { variation: Number.isNaN(cv) ? 0 : Math.round(cv * 100) / 100, score: burstScore },
    ...counts,
  };
}

export const AI_LIKELY = 65;
export const AI_POSSIBLE = 45;
export const AI_CHECK_KEY = "finals:essay-ai-check:v1";
