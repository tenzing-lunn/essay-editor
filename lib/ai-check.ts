import { z } from "zod";
import type { Detection, DetectorModel } from "./ai-detector.ts";

/**
 * AI-writing check, from three signals:
 * Style: a detector trained on human and AI-written essays, run locally on each sentence in context (lib/ai-detector.ts).
 * Predictability: how strongly the wording shows concrete AI tells (scored by the model, cached per sentence).
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
  predictability: z.number().describe("0-100. 0-30 = ordinary student writing, including formal academic prose. 55+ = two or more concrete AI tells. 75+ = reads like unedited chatbot output."),
  phrases: z.array(z.string()).describe("Up to 3 exact substrings (2-8 words) of the sentence that are concrete AI tells. Empty if none."),
  note: z.string().describe("For scores 55 or more, one short sentence naming the specific tells. Empty otherwise."),
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
  /** The local detector's sentence score, 0-100 on the same scale as score (55 = possible, 75 = likely), and its strongest wording. */
  style?: number; stylePhrases?: string[];
  /** Whether the model scored this sentence's wording; unscored sentences are sent again on the next check. */
  scored?: boolean;
};
export type AiCheck = {
  draft: string; checkedAt: number; sentences: SentenceResult[];
  score: number; predictability: number; burstiness: { variation: number; score: number };
  rescored: number; reused: number;
  /** The local detector's whole-essay verdict. */
  detector?: { probability: number; label: Detection["label"]; version: string };
};

/** Map a detector logit onto the check's 0-100 scale, so its cut-offs (set on human essays) land on AI_POSSIBLE and AI_LIKELY. */
export function styleScore(logit: number, t: DetectorModel["thresholds"]) {
  return clamp(AI_POSSIBLE + (AI_LIKELY - AI_POSSIBLE) * (logit - t.sentencePossible) / (t.sentenceLikely - t.sentencePossible));
}

/**
 * Combine the local detector with model predictability (keyed by sentence text, so unchanged sentences keep their score) and burstiness.
 * The detector leads; strong wording tells from the model can raise a sentence, never lower it. Without a detector, the model score stands alone.
 */
export function scoreEssay(draft: string, sentences: Sentence[], predictions: Map<string, Omit<Prediction, "id">>, counts = { rescored: 0, reused: 0 },
  local?: { detection: Detection; model: Pick<DetectorModel, "thresholds" | "version"> }): AiCheck {
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
    // Even rhythm is weak evidence (careful human prose is often even), so it can only strengthen a flag the wording already earned.
    const worded = prediction.predictability < AI_POSSIBLE ? prediction.predictability : clamp(prediction.predictability + 0.2 * burst);
    const scored = predictions.has(s.text);
    const detected = local?.detection.sentences[i];
    if (!local || !detected) return { ...s, ...prediction, flatness: flat, repeatedOpener, score: worded, reasons, scored };
    const style = styleScore(detected.logit, local.model.thresholds);
    // Either signal can flag on its own: the detector was trained on 2023-era model text and misses much current prose the wording check catches.
    const score = Math.max(style, worded);
    const stylePhrases = detected.phrases.filter((p) => !prediction.phrases.some((q) => q.toLowerCase().includes(p.toLowerCase())));
    if (style >= AI_POSSIBLE) reasons.unshift(stylePhrases.length
      ? `Word choice and rhythm match AI-written essays (e.g. “${stylePhrases.join("”, “")}”).`
      : "Word choice and rhythm match AI-written essays more than student ones.");
    return { ...s, ...prediction, flatness: flat, repeatedOpener, score, style, stylePhrases, reasons, scored };
  });
  const cv = variation(sentences.map((s) => s.words));
  const burstScore = flatness(cv);
  const predictability = results.length ? clamp(mean(results.map((r) => r.predictability * r.words)) / mean(results.map((r) => r.words))) : 0;
  return {
    draft, checkedAt: Date.now(), sentences: results,
    score: local ? clamp(100 * local.detection.probability) : clamp(0.6 * predictability + 0.4 * burstScore), predictability,
    burstiness: { variation: Number.isNaN(cv) ? 0 : Math.round(cv * 100) / 100, score: burstScore },
    ...counts,
    ...(local ? { detector: { probability: local.detection.probability, label: local.detection.label, version: local.model.version } } : {}),
  };
}

export const AI_LIKELY = 75;
export const AI_POSSIBLE = 55;
// v3: the local detector leads. A new key drops v2 results, whose sentence scores came from the model alone.
export const aiCheckKey = (essayId: string) => `finals:essay-ai-check:v3:${essayId}`;

/** Word share of sentences scored below vs at/above AI_POSSIBLE. An estimate, not a verdict. */
export function humanShare(check: Pick<AiCheck, "sentences">): { human: number; ai: number; words: number } | null {
  const words = check.sentences.reduce((n, s) => n + s.words, 0);
  if (!words) return null;
  const ai = Math.round(100 * check.sentences.reduce((n, s) => n + (s.score >= AI_POSSIBLE ? s.words : 0), 0) / words);
  return { human: 100 - ai, ai, words };
}
