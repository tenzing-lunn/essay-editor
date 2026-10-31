import { z } from "zod";
import { MAX_CLAIMS } from "./argument-plan.ts";
export const RELATIONS = ["thesis", "supports", "partial", "drifts", "frame"] as const;
export const ArgumentMapRequest = z.object({
  paragraphs: z.array(z.object({ id: z.number().int().min(0), text: z.string().min(1).max(15000) })).min(1).max(150),
  thesis: z.string().max(2000).optional(), brief: z.string().max(20000).optional(),
  /** The Argue plan's claims (lib/argument-plan.ts), so each paragraph can be matched to the claim it argues. */
  claims: z.array(z.object({ id: z.number().int().min(0), claim: z.string().trim().min(1).max(400) })).max(MAX_CLAIMS).optional(),
}).refine((v) => new Set(v.paragraphs.map((p) => p.id)).size === v.paragraphs.length, "Paragraph locations must be unique.")
  .refine((v) => !v.claims || new Set(v.claims.map((c) => c.id)).size === v.claims.length, "Claim numbers must be unique.");
// Limits are only hints to the API, so groundArgumentMap clamps instead of rejecting a billed response
export const ArgumentMapResult = z.object({
  thesis: z.string().describe("The thesis sentence copied exactly from the essay, or the PINNED THESIS when one is supplied. Empty if the essay has no identifiable thesis."),
  paragraphs: z.array(z.object({
    paragraphId: z.number().int().describe("The id of the numbered paragraph this entry describes."),
    claim: z.string().describe("The paragraph's main claim in at most 15 plain words, in your own words, not a quotation."),
    relation: z.enum(RELATIONS).describe("thesis: states the thesis. supports: advances the thesis. partial: related but not tied back to the thesis. drifts: off the thesis. frame: title, heading, hook, or a conclusion that only restates."),
    note: z.string().describe("For partial or drifts, one sentence on what would connect this paragraph to the thesis. Empty otherwise."),
    transition: z.string().describe("For paragraphs after the first, one sentence when the move from the previous paragraph is abrupt, saying what link is missing. Empty otherwise."),
    planClaim: z.number().int().describe("The id of the PLANNED CLAIM this paragraph mainly argues, judged by what it argues and not by shared words. -1 if it argues none of them, if it is frame, or if no planned claims were supplied."),
  })).describe("One entry per paragraph, in order."),
});
export type ArgumentMap = z.infer<typeof ArgumentMapResult>;
export function groundArgumentMap(result: ArgumentMap, input: z.infer<typeof ArgumentMapRequest>): ArgumentMap {
  const first = new Map<number, ArgumentMap["paragraphs"][number]>();
  for (const p of result.paragraphs) if (!first.has(p.paragraphId)) first.set(p.paragraphId, p);
  const paragraphs = input.paragraphs.flatMap((source, index) => {
    const p = first.get(source.id);
    // A planned claim counts only when it was sent; a frame paragraph (title, hook, restating conclusion) argues none.
    const planClaim = p && p.relation !== "frame" && input.claims?.some((c) => c.id === p.planClaim) ? p.planClaim : -1;
    return p ? [{ paragraphId: p.paragraphId, claim: p.claim.slice(0, 160), relation: p.relation, note: p.note.slice(0, 300), transition: index === 0 ? "" : p.transition.slice(0, 300), planClaim }] : [];
  });
  const thesis = result.thesis.trim();
  return { thesis: thesis && (thesis === input.thesis?.trim() || input.paragraphs.some((p) => p.text.includes(thesis))) ? thesis : "", paragraphs };
}
