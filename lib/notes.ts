// Everything the AI has said that still waits on the writer, as one list: the margin draws it beside the page and Review
// walks it, biggest first. The stores stay where they are (live check, review, selection, tasks, the Draft gate); this only reads them.
import type { IssueCategory } from "./essay-issues";
import type { RevisionTask } from "./essay-workflow";
import type { StageCheck } from "./essay-grade";
import { anchorParagraph } from "./suggestions.ts";
import type { Suggestion } from "./suggestions";

export type NoteOrigin = "live" | "review" | "selection" | "source" | "revision" | "plan";
export type Priority = "high" | "medium" | "low";
export type Note = {
  /** The id in the store it came from, so actions route back to it. */
  id: string; origin: NoteOrigin; paragraphId?: number; quote?: string; category?: IssueCategory;
  text: string; why?: string; replacement?: string; priority: Priority;
  /** Character offset in the essay; notes that are not anchored sort last. */
  position: number;
};

// The same order as the underline weights in app/styles/tokens.css: structure costs the most, mechanics the least.
const WEIGHT: Record<IssueCategory, number> = { Structure: 3, Analysis: 2, "Use of evidence": 2, "Factual accuracy": 2, Clarity: 1, Grammar: 0, "Wrong word": 0 };
const RANK: Record<Priority, number> = { high: 0, medium: 1, low: 2 };
export const ORIGIN_LABEL: Record<NoteOrigin, string> = { live: "Live check", review: "Full read", selection: "You asked", source: "Source check", revision: "Paragraph check", plan: "Plan" };

const starts = (paragraphs: string[]) => { const out: number[] = []; paragraphs.reduce((at, p) => { out.push(at); return at + p.length + 2; }, 0); return out; };
const priorityOf = (category: IssueCategory): Priority => WEIGHT[category] >= 2 ? "high" : WEIGHT[category] === 1 ? "medium" : "low";

/** Where a task's paragraph is now: its saved index while the check still applies, else its quote or its exact text. */
export function anchorTask(task: RevisionTask, paragraphs: string[], context: string): number | undefined {
  if (task.context === context && paragraphs[task.paragraphId] === task.paragraph) return task.paragraphId;
  if (task.quote) return anchorParagraph(task.quote, task.paragraph, paragraphs);
  const same = paragraphs.flatMap((p, i) => p === task.paragraph ? [i] : []);
  return same.length === 1 ? same[0] : undefined;
}

/** `contexts` is what each kind of task was checked against (source tasks include the uploaded books), for anchorTask. */
export function collectNotes({ suggestions, tasks, contexts, planCheck }: { suggestions: Suggestion[]; tasks: RevisionTask[]; contexts: Record<RevisionTask["kind"], string>; planCheck: StageCheck | null }, paragraphs: string[]): Note[] {
  const at = starts(paragraphs);
  const notes: Note[] = suggestions.map((s) => ({
    id: s.id, origin: s.origin, paragraphId: s.paragraphId, quote: s.quote, category: s.category,
    text: s.note, replacement: s.replacement, priority: priorityOf(s.category), position: s.position,
  }));
  for (const task of tasks) {
    if (task.status !== "open") continue;
    const paragraphId = anchorTask(task, paragraphs, contexts[task.kind]);
    const offset = paragraphId === undefined ? Number.POSITIVE_INFINITY : at[paragraphId] + Math.max(0, task.quote ? paragraphs[paragraphId].indexOf(task.quote) : 0);
    notes.push({ id: task.id, origin: task.kind, paragraphId, quote: task.quote || undefined, category: task.kind === "source" ? "Use of evidence" : undefined, text: task.task, why: task.reason, priority: task.priority, position: offset });
  }
  if (planCheck?.state === "fail") notes.push({ id: `plan:${planCheck.key}`, origin: "plan", category: "Structure", text: planCheck.detail || planCheck.name, priority: "high", position: Number.POSITIVE_INFINITY });
  return notes.sort((a, b) => (a.position === b.position ? 0 : a.position - b.position));
}

const weightOf = (n: Note) => n.category ? WEIGHT[n.category] : 2;
/** Review's order: priority, then how much the kind of problem costs, then where it is in the essay. */
export const reviewOrder = (notes: Note[]): Note[] => [...notes].sort((a, b) =>
  RANK[a.priority] - RANK[b.priority] || weightOf(b) - weightOf(a) || (a.position === b.position ? 0 : a.position - b.position));

/** Margin cards in top order, each pushed below the one before it so none overlap. */
export function stackMargin(items: { key: string; top: number; height: number }[], gap = 8): { key: string; top: number }[] {
  let bottom = Number.NEGATIVE_INFINITY;
  return [...items].sort((a, b) => a.top - b.top).map(({ key, top, height }) => {
    const placed = Math.max(top, bottom + gap);
    bottom = placed + height;
    return { key, top: placed };
  });
}
