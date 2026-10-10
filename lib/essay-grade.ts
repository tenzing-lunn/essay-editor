import { z } from "zod";

/**
 * Prompt-based essay grading, built on what assessment research and LLM-scoring studies agree on:
 * - Analytic rubric (trait by trait), adapted from the AP English argument rubric and the AAC&U Written Communication VALUE rubric.
 * - Prompt-specific: the assignment is broken into its explicit requirements, and each is checked against the essay.
 * - Evidence before score: the schema asks for quotes and reasons before each level, so the level follows from them.
 * - The model only picks levels; the grade is computed here, so weights, caps and the letter scale are fixed and repeatable.
 */

export const TRAITS = [
  { key: "prompt", name: "Answers the prompt", weight: 20,
    levels: ["Ignores or misreads the question.", "Touches the topic but doesn't answer what was asked.", "Answers the question, but skips or thins out part of it.", "Answers every part of the question directly.", "Answers every part and engages with what the question is really asking."] },
  { key: "thesis", name: "Thesis", weight: 15,
    levels: ["No identifiable claim.", "Restates the prompt or states a fact, not an arguable claim.", "Arguable but vague or general, with no line of reasoning.", "Clear, arguable claim that sets up a line of reasoning.", "Precise, specific claim that needs real evidence to prove and frames the whole essay."] },
  { key: "evidence", name: "Evidence & analysis", weight: 30,
    levels: ["No relevant evidence.", "Evidence is summarized or dropped in with little or no explanation.", "Some evidence is explained, but links to the claim are thin or uneven.", "Specific evidence supports each claim, and commentary explains how.", "Well-chosen evidence throughout; commentary consistently shows how it proves the argument."] },
  { key: "organization", name: "Organization", weight: 15,
    levels: ["No discernible structure.", "Paragraphs wander; order seems arbitrary.", "Paragraphs mostly hold one idea, but the progression is loose.", "Each paragraph advances the thesis in a logical order with clear transitions.", "Structure builds the argument; each paragraph sets up the next."] },
  { key: "sophistication", name: "Complexity", weight: 10,
    levels: ["Not attempted.", "Sweeping generalizations stand in for nuance.", "Gestures at counterargument, context or tension without developing it.", "Develops nuance: qualifies claims, engages a counterargument, or explores a tension.", "Nuance is central to the argument and convincingly resolved."] },
  { key: "language", name: "Language & mechanics", weight: 10,
    levels: ["Errors make much of it hard to follow.", "Frequent errors sometimes block meaning.", "Generally clear, with errors that distract but don't block meaning.", "Clear and controlled; few errors.", "Precise, fluent and virtually error-free."] },
] as const;
export type TraitKey = (typeof TRAITS)[number]["key"];
const TRAIT_KEYS = TRAITS.map((t) => t.key) as [TraitKey, ...TraitKey[]];

/**
 * Rubric level -> percentage, the way teachers convert rubrics to grades. A straight level/4 would make
 * "Developing" (2/4) an F, which no rubric intends. 4 = A, 3 = B, 2 = C, 1 = D, 0 = F.
 */
export const LEVEL_PERCENT = [45, 65, 75, 85, 96] as const;
export const LEVEL_NAMES = ["Missing", "Beginning", "Developing", "Proficient", "Exemplary"] as const;
/** An essay that doesn't answer the question can't score well on writing alone. */
export const PROMPT_CAP: Record<number, number> = { 0: 55, 1: 72 };
export const gradeKey = (essayId: string) => `finals:essay-grade:v1:${essayId}`;

export const GradeRequest = z.object({
  draft: z.string().max(200000).trim().min(1),
  brief: z.string().max(20000).default(""),
  words: z.number().int().min(0).max(100000),
});
export type GradeRequest = z.infer<typeof GradeRequest>;

// Field order matters: the model writes evidence and reasons before it commits to a level.
export const GradeResult = z.object({
  requirements: z.array(z.object({
    requirement: z.string().describe("One explicit requirement from the ASSIGNMENT PROMPT, in under 15 words: a question to answer, a text or number of sources to use, a length, a format or citation rule, or a criterion from a supplied rubric."),
    evidence: z.string().describe("An exact substring of the essay (under 30 words) showing how it meets this requirement. Empty if it doesn't, or if the requirement is about length or format."),
    status: z.enum(["met", "partial", "missed"]),
    note: z.string().describe("For partial or missed, one sentence on what is missing. Empty if met."),
  })).describe("Every explicit requirement in the ASSIGNMENT PROMPT, in the order given. Empty when there is no prompt."),
  thesis: z.string().describe("The essay's thesis sentence copied exactly from the essay. Empty if there is none."),
  traits: z.array(z.object({
    trait: z.enum(TRAIT_KEYS),
    evidence: z.array(z.string()).describe("1-3 exact substrings of the essay (under 30 words each) that most determine this trait's level."),
    strengths: z.string().describe("One sentence: what earns credit on this trait. Empty if nothing does."),
    weaknesses: z.string().describe("One sentence: what keeps it from the next level up. Empty only at level 4."),
    level: z.number().int().describe("0-4, from the rubric descriptors. Decide only after the evidence above."),
  })).describe("Exactly one entry per rubric trait, in rubric order."),
  nextSteps: z.array(z.object({
    trait: z.enum(TRAIT_KEYS),
    step: z.string().describe("One concrete revision move (under 30 words) naming the specific paragraph, claim or quotation to change. Never generic advice."),
  })).describe("The 3 revisions that would raise the grade most, biggest gain first, weighing trait weights."),
});
export type GradeResult = z.infer<typeof GradeResult>;

export type TraitGrade = { key: TraitKey; name: string; weight: number; level: number; label: string; evidence: string[]; strengths: string; weaknesses: string };
export type Grade = {
  percent: number; letter: string; capped: boolean; promptScored: boolean;
  thesis: string; traits: TraitGrade[]; requirements: GradeResult["requirements"]; nextSteps: GradeResult["nextSteps"];
};

const LETTERS: [number, string][] = [[93, "A"], [90, "A−"], [87, "B+"], [83, "B"], [80, "B−"], [77, "C+"], [73, "C"], [70, "C−"], [67, "D+"], [60, "D"], [0, "F"]];
export const letterFor = (percent: number) => LETTERS.find(([min]) => percent >= min)![1];

/** Weighted grade from trait levels. Without a prompt, the prompt trait isn't scored and the rest are reweighted. */
export function computeGrade(levels: Partial<Record<TraitKey, number>>, promptScored: boolean) {
  const scored = TRAITS.filter((t) => levels[t.key] !== undefined && (promptScored || t.key !== "prompt"));
  const total = scored.reduce((n, t) => n + t.weight, 0);
  if (!total) return { percent: 0, letter: "F", capped: false };
  let percent = Math.round(scored.reduce((n, t) => n + LEVEL_PERCENT[levels[t.key]!] * t.weight, 0) / total);
  const cap = promptScored ? PROMPT_CAP[levels.prompt ?? 4] : undefined;
  const capped = cap !== undefined && percent > cap;
  if (capped) percent = cap;
  return { percent, letter: letterFor(percent), capped };
}

const clampLevel = (n: number) => Math.max(0, Math.min(4, Math.round(n)));

/** Keep only evidence that exists in the essay, one entry per trait, and compute the grade. */
export function groundGrade(result: GradeResult, input: GradeRequest): Grade {
  const real = (quote: string) => { const q = quote.trim(); return q.length > 0 && input.draft.includes(q) ? q : ""; };
  const promptScored = input.brief.trim().length > 0;
  const byKey = new Map<TraitKey, GradeResult["traits"][number]>();
  for (const t of result.traits) if (!byKey.has(t.trait)) byKey.set(t.trait, t);
  const traits = TRAITS.flatMap((t): TraitGrade[] => {
    const r = byKey.get(t.key);
    if (!r || (!promptScored && t.key === "prompt")) return [];
    const level = clampLevel(r.level);
    return [{ key: t.key, name: t.name, weight: t.weight, level, label: LEVEL_NAMES[level],
      evidence: r.evidence.map(real).filter(Boolean).slice(0, 3), strengths: r.strengths.slice(0, 400), weaknesses: level === 4 ? "" : r.weaknesses.slice(0, 400) }];
  });
  const { percent, letter, capped } = computeGrade(Object.fromEntries(traits.map((t) => [t.key, t.level])), promptScored);
  return {
    percent, letter, capped, promptScored, thesis: real(result.thesis), traits,
    requirements: promptScored ? result.requirements.slice(0, 15).map((r) => ({ requirement: r.requirement.slice(0, 200), evidence: real(r.evidence), status: r.status, note: r.status === "met" ? "" : r.note.slice(0, 300) })) : [],
    nextSteps: result.nextSteps.filter((s) => s.step.trim() && (promptScored || s.trait !== "prompt")).slice(0, 3).map((s) => ({ trait: s.trait, step: s.step.slice(0, 300) })),
  };
}

/** The rubric as the model sees it. */
export function rubricText() {
  return TRAITS.map((t) => `${t.key} (${t.name}, ${t.weight}%):\n${t.levels.map((d, i) => `  ${i} ${d}`).join("\n")}`).join("\n");
}
