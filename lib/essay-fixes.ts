import { z } from "zod";
import { normalize } from "./sources.ts";

// Every mode is size-limited so oversized or malformed text never reaches a provider.
export const FixRequest = z.object({
  draft: z.string().max(200000).trim().min(1),
  brief: z.string().max(20000).optional(),
  issue: z.object({ quote: z.string().trim().min(1).max(20000), note: z.string().trim().min(1).max(5000) }),
  revise: z.boolean().default(false),
  sources: z.array(z.object({ title: z.string().max(300), location: z.string().max(300), text: z.string().max(4000) })).max(10).default([]),
});
export type FixRequest = z.infer<typeof FixRequest>;

// Limits are only hints to the API, so groundFixes clamps instead of rejecting a billed response
export const FixResult = z.object({
  steps: z.array(z.string()).min(1).describe("1-2 concrete editing moves, each one or two short sentences (under 35 words). Name the specific claim, distinction, quotation or paragraph involved; never generic advice like 'add evidence' or 'clarify'."),
  revision: z.string().describe("A drop-in replacement for the exact FLAGGED PASSAGE that applies the fix, keeping the writer's words, voice and citations wherever possible. May extend it by a clause or one sentence. Any quotation in it must be copied exactly from SOURCE PASSAGES or the draft. Empty if not requested, or if the fix needs work only the writer can do."),
  quotes: z.array(z.object({
    source: z.number().int().describe("The number of the SOURCE PASSAGE the quotation comes from."),
    text: z.string().describe("5-60 words copied character-for-character from that passage."),
    why: z.string().describe("Under 25 words: what this quotation shows that supports or sharpens the flagged claim."),
  })).describe("Up to 3 quotations from SOURCE PASSAGES that would make the flagged claim stronger, best first. If the flagged passage misquotes a source, the first entry is the correct wording. Empty when no passage helps."),
  elsewhere: z.array(z.object({
    quote: z.string().describe("An exact, nonempty substring from another passage in the full draft, so the writer can jump to it."),
    instruction: z.string().describe("One short sentence (under 25 words): what that passage already argues and how to use it here, or what to change there."),
  })).describe("Up to 2 other places in the draft that make a stronger version of this point, contain the evidence it needs, or must change for the fix to work. Empty if none."),
});
export type FixResult = z.infer<typeof FixResult>;
export type FixQuote = { title: string; location: string; text: string; why: string };
export type FixAdvice = { steps: string[]; revision: string; quotes: FixQuote[]; elsewhere: FixResult["elsewhere"] };

/** Quoted material in a revision, split at ellipses and editorial brackets. */
const quotedPieces = (text: string) => [...text.matchAll(/[“"]([^”"]+)[”"]/g)]
  .flatMap((m) => m[1].split(/\s*(?:\.\.\.|…|\[[^\]]*\])\s*/)).map((piece) => normalize(piece).replace(/^[\s\p{P}]+|[\s\p{P}]+$/gu, "")).filter(Boolean);

/** Keep only what can be located: quotes copied from a supplied passage, a revision that quotes nothing invented, places in the draft. */
export function groundFixes(result: FixResult, input: FixRequest): FixAdvice {
  const seen = new Set<string>();
  const quotes = result.quotes.flatMap((q) => {
    const source = input.sources[q.source - 1], text = q.text.trim(), key = normalize(text);
    if (!source || !key || seen.has(key) || !normalize(source.text).includes(key)) return [];
    seen.add(key);
    return [{ title: source.title, location: source.location, text, why: q.why.slice(0, 300) }];
  }).slice(0, 3);
  const known = normalize([input.draft, ...input.sources.map((s) => s.text)].join("\n"));
  const revision = result.revision.trim();
  const groundedRevision = input.revise && revision && revision !== input.issue.quote && quotedPieces(revision).every((piece) => known.includes(piece)) ? revision : "";
  return {
    steps: result.steps.slice(0, 2),
    revision: groundedRevision,
    quotes,
    elsewhere: result.elsewhere.filter((place) => place.quote.trim() && input.draft.includes(place.quote) && !input.issue.quote.includes(place.quote)).slice(0, 2),
  };
}
