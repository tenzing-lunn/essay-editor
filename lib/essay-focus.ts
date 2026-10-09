import { z } from "zod";
export const FocusRequest = z.object({
  paragraphs: z.array(z.object({ id: z.number().int().min(0), text: z.string().min(1).max(15000) })).min(1).max(150),
  target: z.number().int().min(0), selection: z.string().max(15000).optional(), question: z.string().max(4000).optional(), brief: z.string().max(20000).optional(),
}).refine((v) => new Set(v.paragraphs.map((p) => p.id)).size === v.paragraphs.length, "Paragraph locations must be unique.")
  .refine((v) => v.paragraphs.some((p) => p.id === v.target && (!v.selection || p.text.includes(v.selection))), "Select a passage in an existing paragraph.");
export const FocusResult = z.object({
  summary: z.string(),
  // Limits are only hints to the API (it drops max/min), so groundFocus clamps instead of rejecting a billed response
  nextSteps: z.array(z.string()).describe("At most 3."),
  related: z.array(z.object({ paragraphId: z.number().int(), quote: z.string(), relationship: z.enum(["supports", "develops", "repeats", "contradicts", "transitions"]), reason: z.string() })).describe("At most 6."),
  priorities: z.array(z.object({ paragraphId: z.number().int(), priority: z.enum(["high", "medium", "low"]), task: z.string(), reason: z.string() })),
});
export type FocusAnalysis = z.infer<typeof FocusResult>;
export function groundFocus(result: FocusAnalysis, input: z.infer<typeof FocusRequest>): FocusAnalysis {
  const ids = new Map(input.paragraphs.map((p) => [p.id, p.text]));
  const seen = new Set<number>();
  return { ...result, nextSteps: result.nextSteps.slice(0, 3),
    related: result.related.filter((r) => r.paragraphId !== input.target && r.quote.trim() && ids.get(r.paragraphId)?.includes(r.quote) && !seen.has(r.paragraphId) && !!seen.add(r.paragraphId)).slice(0, 6),
    // Priorities become saved revision tasks, so they must fit RevisionTaskSchema
    priorities: result.priorities.filter((p, index, all) => ids.has(p.paragraphId) && all.findIndex((other) => other.paragraphId === p.paragraphId) === index).slice(0, 150).map((p) => ({ ...p, task: p.task.slice(0, 5000), reason: p.reason.slice(0, 5000) })) };
}
