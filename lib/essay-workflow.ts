import { z } from "zod";

export const RevisionTaskSchema = z.object({
  id: z.string().max(100), kind: z.enum(["revision", "source"]),
  paragraphId: z.number().int().min(0), paragraph: z.string().max(20000),
  quote: z.string().max(20000), task: z.string().max(5000), reason: z.string().max(5000),
  priority: z.enum(["high", "medium", "low"]),
  status: z.enum(["open", "done", "declined"]),
  context: z.string().max(100), note: z.string().max(5000),
});
export type RevisionTask = z.infer<typeof RevisionTaskSchema>;
/** What the writer tells the AI about this piece: the essay's equivalent of a project brief. */
export const WRITING_KINDS = ["Literary analysis", "Argumentative essay", "Research paper", "Personal essay", "Response paper"] as const;
export const CITATION_STYLES = ["MLA", "APA", "Chicago", "None"] as const;
export const WritingProfileSchema = z.object({
  kind: z.string().max(100).default(""),
  course: z.string().max(200).default(""),
  citation: z.string().max(40).default(""),
  instructions: z.string().max(4000).default(""),
});
export type WritingProfile = z.infer<typeof WritingProfileSchema>;
export const EMPTY_WRITING_PROFILE: WritingProfile = { kind: "", course: "", citation: "", instructions: "" };
/** Sent with every AI request; the server turns it into system instructions. */
export const WritingRequest = z.object({ profile: WritingProfileSchema.default(EMPTY_WRITING_PROFILE), thesis: z.string().max(2000).default(""), targetWords: z.number().int().min(0).max(100000).default(0) });
export function writingContext(input: z.infer<typeof WritingRequest>): string {
  const { profile, thesis, targetWords } = input;
  const facts = [
    profile.kind.trim() && `- Type of writing: ${profile.kind.trim()}`,
    profile.course.trim() && `- Course and level: ${profile.course.trim()}`,
    profile.citation.trim() && `- Citation style: ${profile.citation.trim()}`,
    targetWords > 0 && `- Target length: about ${targetWords} words`,
    thesis.trim() && `- Working thesis: ${thesis.trim()}`,
  ].filter(Boolean);
  const notes = profile.instructions.trim();
  if (!facts.length && !notes) return "";
  return [
    "WRITING PROFILE (set by the writer for this piece). Calibrate feedback to this kind of writing, the course's expectations and the citation style.",
    ...facts,
    notes && `WRITER'S NOTES FOR THE AI. Follow them about how to help, unless a note conflicts with the TASK's required output or asks you to invent quotations, citations or facts:\n<notes>\n${notes}\n</notes>`,
  ].filter(Boolean).join("\n");
}

export const EssaySettingsSchema = z.object({
  targetWords: z.number().int().min(0).max(100000),
  checklist: z.record(z.string(), z.boolean()),
  notes: z.array(z.object({ paragraph: z.string().max(20000), note: z.string().max(5000) })).max(150),
  sources: z.string().max(50000).default(""),
  includeAntigone: z.boolean().default(false),
  tasks: z.array(RevisionTaskSchema).max(300).default([]),
  thesis: z.string().max(2000).default(""),
  profile: WritingProfileSchema.default(EMPTY_WRITING_PROFILE),
});

/** A compact freshness key; never used for authentication or save conflicts. */
export function essayContext(draft: string, brief: string, sources = "", includeAntigone = true): string {
  const text = JSON.stringify([draft, brief, sources, includeAntigone]);
  let a = 2166136261, b = 5381;
  for (let i = 0; i < text.length; i++) {
    a = Math.imul(a ^ text.charCodeAt(i), 16777619);
    b = Math.imul(b, 33) ^ text.charCodeAt(i);
  }
  return `${text.length}:${a >>> 0}:${b >>> 0}`;
}

/** Analysis never deletes saved work. Identical tasks keep notes; changed input reopens them. */
export function mergeRevisionTasks(current: RevisionTask[], incoming: RevisionTask[], kind: RevisionTask["kind"]): RevisionTask[] {
  const key = (t: RevisionTask) => JSON.stringify([t.kind, t.paragraphId, t.paragraph, t.quote, t.task]);
  const result = [...current];
  for (const task of incoming) {
    if (task.kind !== kind) continue;
    const index = result.findIndex((old) => key(old) === key(task));
    if (index < 0) result.push(task);
    else {
      const old = result[index];
      result[index] = { ...task, id: old.id, note: old.note, status: old.context === task.context ? old.status : "open" };
    }
  }
  if (result.length > 300) throw new Error("The revision checklist has reached its 300-task limit. Existing tasks and notes were kept; no new analysis was saved.");
  return result;
}

/** Follow an unambiguous edit to one paragraph; splits, merges and rewrites remain flagged. */
export function followParagraphNotes(notes: { paragraph: string; note: string }[], before: string[], after: string[]) {
  if (before.length !== after.length) return notes;
  const changed = before.flatMap((text, i) => text === after[i] ? [] : [i]);
  if (changed.length !== 1) return notes;
  const i = changed[0];
  if (!after[i] || before.filter((p) => p === before[i]).length !== 1 || after.filter((p) => p === after[i]).length !== 1) return notes;
  return notes.map((note) => note.paragraph === before[i] ? { ...note, paragraph: after[i] } : note);
}

export const SourceCheckRequest = z.object({
  paragraphs: z.array(z.object({ id: z.number().int().min(0), text: z.string().min(1).max(20000) })).min(1).max(150),
  brief: z.string().max(20000).optional(), sources: z.string().max(50000).optional(),
  includeAntigone: z.boolean().default(false),
}).refine((v) => new Set(v.paragraphs.map((p) => p.id)).size === v.paragraphs.length, "Paragraph locations must be unique.");
export const SourceCheckResult = z.object({
  issues: z.array(z.object({
    paragraphId: z.number().int(), quote: z.string(), task: z.string(), reason: z.string(),
    priority: z.enum(["high", "medium", "low"]),
  })).describe("At most 30."), // limits are only hints to the API; groundSourceCheck clamps
});
export type SourceCheck = z.infer<typeof SourceCheckResult>;
export function groundSourceCheck(result: SourceCheck, input: Pick<z.infer<typeof SourceCheckRequest>, "paragraphs">): SourceCheck {
  const paragraphs = new Map(input.paragraphs.map((p) => [p.id, p.text]));
  const seen = new Set<string>();
  return { issues: result.issues.filter((issue) => {
    const key = `${issue.paragraphId}:${issue.quote}`;
    if (!issue.quote.trim() || !issue.task.trim() || !issue.reason.trim() || !paragraphs.get(issue.paragraphId)?.includes(issue.quote) || seen.has(key)) return false;
    seen.add(key); return true;
  }).slice(0, 30).map((issue) => ({ ...issue, task: issue.task.slice(0, 5000), reason: issue.reason.slice(0, 5000) })) };
}
