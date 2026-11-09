// A log of every AI run on an essay: what started it and what it was shown. Kept in this browser, per essay, so the writer can
// see what the AI did (and, for example, whether their book went with a question). aiFetch records it; the end comment shows it.
export type AiRun = { id: string; mode: string; label: string; detail?: string; at: number; reads: string[]; ok: boolean };

const KEY = (essayId: string) => `essay:activity:v1:${essayId}`;
const LIMIT = 200;
const LABELS: Record<string, string> = {
  live: "Live check", review: "Whole-essay review", focus: "Paragraph analysis", fixes: "Fix suggestions", grade: "Grade",
  sources: "Source check", aicheck: "AI-pattern check", outline: "Argument map", argue: "Plan check",
};
const ACTIONS: Record<string, string> = { ask: "You asked", unclear: "Unclear check", synonyms: "Synonyms", tighten: "Tighten", evidence: "Evidence check" };
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const filled = (v: unknown) => typeof v === "string" && !!v.trim();

export function runLabel(body: Record<string, unknown>): { label: string; detail?: string } {
  const mode = String(body.mode ?? "");
  if (mode === "selection") return { label: ACTIONS[String(body.action)] ?? "Selection", detail: filled(body.question) ? String(body.question) : undefined };
  return { label: LABELS[mode] ?? mode, detail: mode === "focus" && filled(body.question) ? String(body.question) : undefined };
}

/** What a request showed the AI, in the writer's words. Book passages are named by title and page. */
export function describeReads(body: Record<string, unknown>): string[] {
  const mode = String(body.mode ?? "");
  const out: string[] = [];
  const paragraphs = Array.isArray(body.paragraphs) ? body.paragraphs.length : 0;
  if (mode === "live") out.push("one paragraph", ...filled(body.thesis) ? ["your opening paragraph"] : [], ...filled(body.plan) ? ["your plan"] : []);
  else if (mode === "selection") out.push(body.action === "ask" ? "the passage you asked about" : "the words you highlighted", body.action === "synonyms" ? "their paragraph" : "the whole essay");
  else if (mode === "focus") out.push("one paragraph", ...paragraphs > 1 ? [`the other ${plural(paragraphs - 1, "paragraph")}`] : []);
  else if (mode === "fixes") out.push("the flagged passage", "the whole essay");
  else if (mode === "aicheck") out.push(plural(Array.isArray(body.sentences) ? body.sentences.length : 0, "sentence"));
  else if (mode === "argue") out.push(`your thesis and ${plural(Array.isArray(body.claims) ? body.claims.length : 0, "claim")}`);
  else if (filled(body.draft) || paragraphs) out.push("the whole essay");
  if (mode === "outline" && Array.isArray(body.claims) && body.claims.length) out.push("your plan");
  if (filled(body.brief)) out.push(mode === "grade" ? "your prompt and rubric" : "your prompt");
  const writing = body.writing as { profile?: Record<string, unknown> } | undefined;
  if (writing?.profile && Object.values(writing.profile).some(filled)) out.push("your writing setup");
  if (Array.isArray(body.sources)) {
    const byTitle = new Map<string, string[]>();
    for (const s of body.sources as { title?: unknown; location?: unknown }[]) {
      const title = String(s?.title ?? "a source"), location = String(s?.location ?? "");
      byTitle.set(title, [...byTitle.get(title) ?? [], ...location && !byTitle.get(title)?.includes(location) ? [location] : []]);
    }
    for (const [title, locations] of byTitle) out.push(locations.length ? `${title}: ${locations.join(", ")}` : title);
  } else if (filled(body.sources)) out.push("excerpts from your sources");
  if (body.includeAntigone === true) out.push("Antigone");
  return out;
}

let essay: string | null = null;
/** The essay open in this tab; runs outside an essay (the connection test) are not logged. */
export const setAiEssay = (id: string | null) => { essay = id; };

export function readAiRuns(essayId: string): AiRun[] {
  try { const saved = JSON.parse(localStorage.getItem(KEY(essayId)) ?? "[]"); return Array.isArray(saved) ? saved : []; }
  catch { return []; }
}

export function recordAiRun(body: Record<string, unknown>, ok: boolean) {
  if (!essay || typeof window === "undefined") return;
  const run: AiRun = { id: crypto.randomUUID(), mode: String(body.mode ?? ""), ...runLabel(body), at: Date.now(), reads: describeReads(body), ok };
  try { localStorage.setItem(KEY(essay), JSON.stringify([run, ...readAiRuns(essay)].slice(0, LIMIT))); } catch { /* the log is a convenience */ }
  window.dispatchEvent(new Event("ai-activity-change"));
}
