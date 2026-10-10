import type { EssayIssue, IssueCategory, LiveCheck, LiveIssue } from "./essay-issues";

type Anchored = EssayIssue & { id: string; paragraph?: string };
export type Suggestion = Anchored & { origin: "selection" | "live" | "review"; position: number };
export const SERIOUS: readonly IssueCategory[] = ["Factual accuracy", "Analysis", "Use of evidence", "Structure"];
const ORIGINS: Suggestion["origin"][] = ["live", "review", "selection"];

/** Where a quote lives now: its own unchanged paragraph, else the quote's only occurrence in the essay, else nowhere. */
export function anchorParagraph(quote: string, paragraph: string | undefined, paragraphs: string[]): number | undefined {
  if (!quote) return undefined;
  if (paragraph) {
    const same = paragraphs.flatMap((p, i) => p === paragraph ? [i] : []);
    if (same.length === 1 && paragraphs[same[0]].includes(quote)) return same[0];
  }
  let total = 0, found: number | undefined;
  paragraphs.forEach((p, i) => {
    for (let at = p.indexOf(quote); at >= 0; at = p.indexOf(quote, at + quote.length)) { total++; found = i; }
  });
  return total === 1 ? found : undefined;
}

/** Follow an unambiguous edit to one paragraph (same rule as followParagraphNotes). */
export function followAnchors<T extends { paragraph?: string }>(items: T[], before: string[], after: string[]): T[] {
  if (before.length !== after.length) return items;
  const changed = before.flatMap((text, i) => text === after[i] ? [] : [i]);
  if (changed.length !== 1) return items;
  const i = changed[0];
  if (!after[i] || before.filter((p) => p === before[i]).length !== 1 || after.filter((p) => p === after[i]).length !== 1) return items;
  if (!items.some((item) => item.paragraph === before[i])) return items;
  return items.map((item) => item.paragraph === before[i] ? { ...item, paragraph: after[i] } : item);
}

/** One inbox in essay order. Live beats review beats selection for the same category, quote and paragraph. */
export function mergeSuggestions({ selection, live, review }: { selection: Anchored[]; live: LiveIssue[]; review: Anchored[] }, paragraphs: string[]): Suggestion[] {
  const starts: number[] = [];
  paragraphs.reduce((at, p) => { starts.push(at); return at + p.length + 2; }, 0);
  const merged = new Map<string, Suggestion>();
  const add = (issues: Anchored[], origin: Suggestion["origin"]) => {
    for (const issue of issues) {
      const paragraphId = anchorParagraph(issue.quote, issue.paragraph, paragraphs);
      const key = `${issue.category}\u0000${issue.quote}\u0000${paragraphId ?? "x"}`;
      if (merged.has(key)) continue;
      const position = paragraphId === undefined ? Number.POSITIVE_INFINITY : starts[paragraphId] + paragraphs[paragraphId].indexOf(issue.quote);
      merged.set(key, { ...issue, paragraphId, origin, position });
    }
  };
  add(live.filter((i) => !i.resolved), "live");
  add(review, "review");
  add(selection, "selection");
  return [...merged.values()].sort((a, b) => (a.position === b.position ? 0 : a.position - b.position) || ORIGINS.indexOf(a.origin) - ORIGINS.indexOf(b.origin));
}

/** "Fixed 6, 2 new" since the previous live check. */
export function checkProgress(previous: LiveCheck | null, next: LiveIssue[], draft: string): { fixed: number; added: number } | null {
  if (!previous) return null;
  // Count occurrences, so the same mistake made again in another paragraph still counts as new.
  const key = (i: EssayIssue) => `${i.category}\u0000${i.quote}`;
  const old = new Map<string, number>();
  for (const i of previous.issues) old.set(key(i), (old.get(key(i)) ?? 0) + 1);
  return {
    fixed: previous.issues.filter((i) => i.disposition === "accepted" || (!i.resolved && !draft.includes(i.quote))).length,
    added: next.filter((i) => { const n = old.get(key(i)) ?? 0; old.set(key(i), n - 1); return n <= 0; }).length,
  };
}
