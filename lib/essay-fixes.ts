import { z } from "zod";
import { normalize } from "./sources.ts";

/** Passages from the writer's own books and readings, picked in the browser (relevantPassages in components/SourcesTab.tsx). */
export const SourcePassages = z.array(z.object({ title: z.string().max(300), location: z.string().max(300), text: z.string().max(4000) })).max(10).default([]);

// Every mode is size-limited so oversized or malformed text never reaches a provider.
export const FixRequest = z.object({
  draft: z.string().max(200000).trim().min(1),
  brief: z.string().max(20000).optional(),
  issue: z.object({ quote: z.string().trim().min(1).max(20000), note: z.string().trim().min(1).max(5000) }),
  revise: z.boolean().default(false),
  /** The writer's follow-up "what quotes could I use": quotations only, no advice. */
  quotes: z.boolean().default(false),
  sources: SourcePassages,
});
export type FixRequest = z.infer<typeof FixRequest>;

// Limits are only hints to the API, so groundFixes clamps instead of rejecting a billed response
export const FixResult = z.object({
  advice: z.string().describe("One plain sentence, under 25 words, starting with 'Try': the single move that fixes this passage, naming the specific claim, quotation or phrase involved. Empty when only quotations were asked for."),
  options: z.array(z.object({
    how: z.string().describe("Under 8 words: the approach this rewrite takes, e.g. 'Name what the quotation proves'."),
    text: z.string().describe("A drop-in replacement for the exact FLAGGED PASSAGE that applies the fix in the writer's voice."),
  })).describe("Exactly 2 rewrites of the FLAGGED PASSAGE that take genuinely different approaches. Empty when not requested or when the feedback no longer applies."),
  quotes: z.array(z.object({
    source: z.number().int().describe("The number of the SOURCE PASSAGE the quotation comes from."),
    text: z.string().describe("5-60 words copied character-for-character from that passage."),
    why: z.string().describe("Under 20 words: what this quotation shows that supports the flagged claim."),
  })).describe("Only when quotations are asked for: up to 3 quotations from SOURCE PASSAGES that would make the flagged claim stronger, best first. If the flagged passage misquotes a source, the first entry is the correct wording. Otherwise empty."),
});
export type FixResult = z.infer<typeof FixResult>;
export type FixQuote = { title: string; location: string; text: string; why: string };
export type FixOption = { how: string; text: string };
export type FixAdvice = { advice: string; options: FixOption[]; quotes: FixQuote[] };

/** Quoted material in a revision, split at ellipses and editorial brackets. */
const quotedPieces = (text: string) => [...text.matchAll(/[“"]([^”"]+)[”"]/g)]
  .flatMap((m) => m[1].split(/\s*(?:\.\.\.|…|\[[^\]]*\])\s*/)).map((piece) => normalize(piece).replace(/^[\s\p{P}]+|[\s\p{P}]+$/gu, "")).filter(Boolean);

/** Keep only what can be located: quotes copied from a supplied passage, rewrites that quote nothing invented. */
export function groundFixes(result: FixResult, input: FixRequest): FixAdvice {
  const seen = new Set<string>();
  const quotes = input.quotes ? result.quotes.flatMap((q) => {
    const source = input.sources[q.source - 1], text = q.text.trim(), key = normalize(text);
    if (!source || !key || seen.has(key) || !normalize(source.text).includes(key)) return [];
    seen.add(key);
    return [{ title: source.title, location: source.location, text, why: q.why.slice(0, 300) }];
  }).slice(0, 3) : [];
  const known = normalize([input.draft, ...input.sources.map((s) => s.text)].join("\n"));
  const kept = new Set<string>();
  const options = input.revise ? result.options.flatMap((option) => {
    const text = option.text.trim();
    if (!text || text === input.issue.quote.trim() || kept.has(text) || !quotedPieces(text).every((piece) => known.includes(piece))) return [];
    kept.add(text);
    return [{ how: option.how.trim().slice(0, 80), text }];
  }).slice(0, 2) : [];
  return { advice: result.advice.trim().slice(0, 400), options, quotes };
}
