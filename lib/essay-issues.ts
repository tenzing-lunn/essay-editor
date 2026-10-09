export const ISSUE_CATEGORIES = [
  "Grammar", "Wrong word", "Factual accuracy", "Analysis", "Use of evidence", "Clarity", "Structure",
] as const;

export type IssueCategory = (typeof ISSUE_CATEGORIES)[number];
export type EssayIssue = { quote: string; note: string; category: IssueCategory; replacement?: string; paragraphId?: number };
export type LiveIssue = EssayIssue & { id: string; resolved: boolean; disposition?: "accepted" | "declined" | "resolved"; paragraph?: string };

export type LiveCheck = { draft: string; issues: LiveIssue[]; checkedAt?: number };
export const LIVE_CHECK_KEY = "finals:essay-live-check:v1";

export function readLiveCheck(value: string | null): LiveCheck | null {
  if (!value) return null;
  try {
    const check = JSON.parse(value) as LiveCheck;
    if (typeof check.draft !== "string" || !Array.isArray(check.issues)) return null;
    if (!check.issues.every((i) => i && typeof i.id === "string" && typeof i.quote === "string" && typeof i.note === "string" && typeof i.resolved === "boolean" && (i.replacement === undefined || typeof i.replacement === "string") && (i.paragraph === undefined || typeof i.paragraph === "string") && ISSUE_CATEGORIES.includes(i.category))) return null;
    return check;
  } catch {
    return null;
  }
}
