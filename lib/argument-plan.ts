import { z } from "zod";

/**
 * The Argue stage (docs/harness.md, "The loop"): a thesis and one line per claim, each naming its evidence, written before any
 * paragraph exists. Code runs the gate; the model only attacks the plan and looks for the evidence, and groundPlanReview checks
 * what it returns before the writer sees it.
 */

export const MAX_CLAIMS = 8;
export const ArgumentPlanSchema = z.object({
  claims: z.array(z.object({ id: z.string().max(100), claim: z.string().max(400), evidence: z.string().max(600) })).max(MAX_CLAIMS).default([]),
  /** When the writer chose to draft without passing the gate, 0 if never. Nothing is locked; the skip is only kept. */
  skippedAt: z.number().int().min(0).default(0),
});
export type ArgumentPlan = z.infer<typeof ArgumentPlanSchema>;
export const EMPTY_PLAN: ArgumentPlan = { claims: [], skippedAt: 0 };

/** Rows the writer has started; a row with neither a claim nor evidence is an empty slot, not a claim. */
export const plannedClaims = (plan: ArgumentPlan) => plan.claims.filter((c) => c.claim.trim() || c.evidence.trim());

/** The plan as the live check reads it: one numbered line per claim, with its evidence. Empty without claims. */
export const planText = (plan: ArgumentPlan) => plan.claims
  .flatMap((c, i) => c.claim.trim() ? [`${i + 1}. ${c.claim.trim()}${c.evidence.trim() ? ` (evidence: ${c.evidence.trim()})` : ""}`] : []).join("\n");

export type GateCheck = { key: "thesis" | "claims" | "evidence" | "paragraphs"; name: string; pass: boolean; detail: string };
const list = (ns: number[]) => ns.length === 1 ? `Claim ${ns[0]}` : `Claims ${ns.slice(0, -1).join(", ")} and ${ns.at(-1)}`;
/** The gate out of Argue: thesis stated, at least one claim, and every claim names its evidence. */
export function argueGate(thesis: string, plan: ArgumentPlan): { pass: boolean; checks: GateCheck[] } {
  const rows = plan.claims.map((c, i) => ({ ...c, n: i + 1 })).filter((c) => c.claim.trim() || c.evidence.trim());
  const noClaim = rows.filter((c) => !c.claim.trim()).map((c) => c.n);
  const noEvidence = rows.filter((c) => c.claim.trim() && !c.evidence.trim()).map((c) => c.n);
  const checks: GateCheck[] = [
    { key: "thesis", name: "Thesis stated", pass: !!thesis.trim(), detail: thesis.trim() ? "" : "Write the one sentence the essay will prove." },
    { key: "claims", name: "Claims listed", pass: rows.some((c) => c.claim.trim()), detail: rows.some((c) => c.claim.trim()) ? "" : "Add one line for each point that will become a paragraph." },
    { key: "evidence", name: "Every claim names its evidence", pass: rows.length > 0 && !noClaim.length && !noEvidence.length,
      detail: [noEvidence.length && `${list(noEvidence)} ${noEvidence.length === 1 ? "has" : "have"} no evidence yet.`, noClaim.length && `${list(noClaim)} ${noClaim.length === 1 ? "names evidence but no claim" : "name evidence but no claim"}.`].filter(Boolean).join(" ") },
  ];
  return { pass: checks.every((c) => c.pass), checks };
}

/**
 * The gate out of Draft: every planned claim has a paragraph that argues it. The argument map (lib/argument-map.ts) says which
 * claim each paragraph argues; `carried` is the plan ids it named for the paragraphs as they are now, and code does the counting.
 */
export function draftGate(plan: ArgumentPlan, carried: string[]): { pass: boolean; checks: GateCheck[] } {
  const claims = plan.claims.map((c, i) => ({ ...c, n: i + 1 })).filter((c) => c.claim.trim());
  const missing = claims.filter((c) => !carried.includes(c.id)).map((c) => c.n);
  const pass = claims.length > 0 && !missing.length;
  const detail = !claims.length ? "The plan has no claims yet." : missing.length ? `${list(missing)} ${missing.length === 1 ? "has" : "have"} no paragraph yet.` : "";
  return { pass, checks: [{ key: "paragraphs", name: "Every planned claim has a paragraph", pass, detail }] };
}

export const PlanReviewRequest = z.object({
  thesis: z.string().trim().min(1).max(2000),
  claims: z.array(z.object({ id: z.number().int().min(0), claim: z.string().trim().min(1).max(400), evidence: z.string().max(600) })).min(1).max(MAX_CLAIMS),
  brief: z.string().max(20000).optional(), sources: z.string().max(50000).optional(),
  includeAntigone: z.boolean().default(false),
}).refine((v) => new Set(v.claims.map((c) => c.id)).size === v.claims.length, "Claim numbers must be unique.");
export type PlanReviewRequest = z.infer<typeof PlanReviewRequest>;

export const EVIDENCE = ["found", "missing", "unchecked"] as const;
// Limits are only hints to the API, so groundPlanReview clamps instead of rejecting a billed response
export const PlanReviewResult = z.object({
  thesis: z.object({
    quote: z.string().describe("The few words of the THESIS the objection targets, copied exactly. Empty if it targets the thesis as a whole."),
    objection: z.string().describe("The strongest objection a fair, skeptical reader would raise against the thesis, in one or two plain sentences to the writer as you."),
    question: z.string().describe("The one question the essay must answer to survive that objection. A question, never an answer or a rewording."),
  }),
  claims: z.array(z.object({
    claimId: z.number().int().describe("The id of the claim this entry is about."),
    objection: z.string().describe("The strongest objection to this claim, or how it fails to advance the thesis, in one plain sentence. Empty if a fair reader would accept it."),
    evidence: z.enum(EVIDENCE).describe("found: the SOURCES contain the evidence the writer named. missing: SOURCES were supplied but do not contain it. unchecked: no SOURCES were supplied, or the evidence names nothing that could be looked up."),
    quote: z.string().describe("For found, the passage in SOURCES that is the named evidence, copied exactly, at most 40 words. Empty otherwise."),
    note: z.string().describe("One sentence of under 40 words, to the writer as you: whether the named evidence can carry this claim, and if not, what kind of evidence would."),
  })).describe("One entry per claim, in order."),
});
export type PlanReview = z.infer<typeof PlanReviewResult>;

const flat = (text: string) => text.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, " ").trim();
const NOT_FOUND = "This evidence could not be found in the sources you supplied. Check the wording against the text, or add the source.";

/** `sources` is every text the auditor was shown (pasted excerpts, book excerpts, the built-in primary text): a found quote must be in it. */
export function groundPlanReview(result: PlanReview, input: PlanReviewRequest, sources: string): PlanReview {
  const corpus = flat(sources);
  const first = new Map<number, PlanReview["claims"][number]>();
  for (const c of result.claims) if (!first.has(c.claimId)) first.set(c.claimId, c);
  const claims = input.claims.flatMap((source): PlanReview["claims"] => {
    const c = first.get(source.id);
    if (!c) return [];
    const entry = { claimId: source.id, objection: c.objection.slice(0, 500), evidence: c.evidence, quote: "", note: c.note.slice(0, 500) };
    if (!corpus || !source.evidence.trim()) return [{ ...entry, evidence: "unchecked" }];
    if (c.evidence !== "found") return [entry];
    // A "found" without a quote that is really in the sources is the model's word only; it is reported as not found.
    const quote = flat(c.quote);
    return [quote && corpus.includes(quote) ? { ...entry, quote: quote.slice(0, 400) } : { ...entry, evidence: "missing", note: NOT_FOUND }];
  });
  const quote = result.thesis.quote.trim();
  return {
    // A quote of the whole thesis points at nothing in particular; it is shown as an objection to the thesis as a whole.
    thesis: { quote: quote && quote !== input.thesis && input.thesis.includes(quote) ? quote : "", objection: result.thesis.objection.slice(0, 500), question: result.thesis.question.slice(0, 300) },
    claims,
  };
}
