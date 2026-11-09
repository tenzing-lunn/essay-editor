import { z } from "zod";
import { ISSUE_CATEGORIES } from "./essay-issues.ts";
import type { IssueCategory } from "./essay-issues";
import { PASS_LEVEL, TRAIT_KEYS, TRAITS } from "./essay-grade.ts";
import type { TraitKey } from "./essay-grade";

/**
 * The writer's memory across essays (docs/harness.md, "Writer memory"): what keeps coming back, built from the check results
 * stored per account. Code decides what counts as a pattern; no model is asked, so the same history always says the same thing.
 * Only rubric levels and note counts are stored, never essay text.
 */

const Words = z.number().int().min(0).max(100000);
export const CheckInput = z.discriminatedUnion("kind", [
  // A grade: the level of each scored trait.
  z.object({ kind: z.literal("grade"), words: Words, levels: z.partialRecord(z.enum(TRAIT_KEYS), z.number().int().min(0).max(4)) }),
  // The latest live check: open notes per category. One snapshot per essay; a new one replaces it.
  z.object({ kind: z.literal("issues"), words: Words, counts: z.partialRecord(z.enum(ISSUE_CATEGORIES), z.number().int().min(0).max(1000)) }),
], { error: "Send a grade's trait levels or a live check's note counts." });
export type CheckInput = z.infer<typeof CheckInput>;

export type StoredCheck = { essayId: string; kind: "grade" | "issues"; words: number; createdAt: number; data: { levels?: Partial<Record<TraitKey, number>>; counts?: Partial<Record<IssueCategory, number>> } };

export type Memory = {
  /** Essays with at least one stored check, up to the last ESSAYS. */
  essays: number;
  /** A trait that failed on two or more graded essays and still fails on the latest. */
  weak: { key: TraitKey; name: string; failed: number; of: number }[];
  /** A note category among an essay's two most frequent on two or more essays. */
  categories: { category: IssueCategory; essays: number }[];
  /** A trait that failed on an earlier essay and passes on the latest. */
  improved: { key: TraitKey; name: string }[];
};

const ESSAYS = 8;
const traitName = (key: TraitKey) => TRAITS.find((t) => t.key === key)!.name;

export function buildMemory(checks: StoredCheck[]): Memory {
  // Each essay's latest grade and latest note counts, newest essay first.
  const byEssay = new Map<string, { at: number; levels?: Partial<Record<TraitKey, number>>; gradedAt?: number; counts?: Partial<Record<IssueCategory, number>> }>();
  for (const c of [...checks].sort((a, b) => b.createdAt - a.createdAt)) {
    const e = byEssay.get(c.essayId) ?? { at: c.createdAt };
    if (c.kind === "grade" && !e.levels && c.data.levels) { e.levels = c.data.levels; e.gradedAt = c.createdAt; }
    if (c.kind === "issues" && !e.counts && c.data.counts) e.counts = c.data.counts;
    byEssay.set(c.essayId, e);
  }
  const essays = [...byEssay.values()].slice(0, ESSAYS);
  const graded = essays.filter((e) => e.levels).sort((a, b) => b.gradedAt! - a.gradedAt!);
  const latest = graded[0]?.levels;

  const weak: Memory["weak"] = [], improved: Memory["improved"] = [];
  for (const key of TRAIT_KEYS) {
    const scored = graded.filter((e) => e.levels![key] !== undefined);
    const failed = scored.filter((e) => e.levels![key]! < PASS_LEVEL).length;
    const now = latest?.[key];
    if (now === undefined) continue;
    if (now < PASS_LEVEL && failed >= 2) weak.push({ key, name: traitName(key), failed, of: scored.length });
    else if (now >= PASS_LEVEL && scored.slice(1).some((e) => e.levels![key]! < PASS_LEVEL)) improved.push({ key, name: traitName(key) });
  }
  // Most consistent failure first; ties go to the trait that weighs most in the grade.
  const weight = (key: TraitKey) => TRAITS.find((t) => t.key === key)!.weight;
  weak.sort((a, b) => b.failed / b.of - a.failed / a.of || weight(b.key) - weight(a.key));

  const top = new Map<IssueCategory, number>();
  for (const e of essays) {
    const ranked = Object.entries(e.counts ?? {}).filter(([, n]) => n! > 0).sort(([, a], [, b]) => b! - a!).slice(0, 2);
    for (const [category] of ranked) top.set(category as IssueCategory, (top.get(category as IssueCategory) ?? 0) + 1);
  }
  const categories = [...top].filter(([, n]) => n >= 2).sort(([, a], [, b]) => b - a).map(([category, n]) => ({ category, essays: n }));

  return { essays: essays.length, weak, categories, improved };
}

/** Up to three plain sentences for the writer: two weak spots, then a recurring category and an improvement if there are any. */
export function memoryLines(memory: Memory): string[] {
  if (memory.essays < 2) return [];
  const weak = memory.weak.map((w) => `${w.name} failed on ${w.failed} of your last ${w.of} graded essays.`);
  const categories = memory.categories.map((c) => `${c.category} notes were among your most frequent on ${c.essays} essays.`);
  const improved = memory.improved.map((i) => `${i.name} passes on your latest essay after failing before.`);
  return [...weak.slice(0, 2), ...categories.slice(0, 1), ...improved.slice(0, 1), ...weak.slice(2), ...categories.slice(1)].slice(0, 3);
}

/** The memory as the client sends it with live and review requests: keys and counts only, so no free text reaches the prompt. */
const Count = z.number().int().min(0).max(1000);
export const MemoryRequest = z.object({
  essays: Count,
  weak: z.array(z.object({ key: z.enum(TRAIT_KEYS), failed: Count, of: Count })).max(TRAIT_KEYS.length),
  categories: z.array(z.object({ category: z.enum(ISSUE_CATEGORIES), essays: Count })).max(ISSUE_CATEGORIES.length),
});
export type MemoryRequest = z.infer<typeof MemoryRequest>;

/** What the live and review calls are told about this writer. Never sent to the grade, so a grade stays independent of history. */
export function memoryPrompt(memory: MemoryRequest): string {
  if (memory.essays < 2) return "";
  const spots = [...memory.weak.map((w) => `${traitName(w.key)} (failed on ${w.failed} of ${w.of} essays)`), ...memory.categories.map((c) => `${c.category} notes`)];
  if (!spots.length) return "";
  return `WRITER HISTORY (computed from this writer's past checks). Recurring weak spots: ${spots.slice(0, 4).join("; ")}. Check for these closely, but do not report a problem this draft doesn't have.`.slice(0, 400);
}
