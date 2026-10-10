// Shapes shared by the account API (app/api/**) and the browser (lib/essay-store.ts). Times are epoch milliseconds.
import type { EssaySettings } from "./essay-document";

export type Account = { id: string; username: string; name: string };

/** One row in the essay list. `title` is "" until the writer names it; show displayTitle() instead. */
export type EssaySummary = {
  id: string; title: string; preview: string; words: number;
  createdAt: number; updatedAt: number; openedAt: number;
  archivedAt: number | null; trashedAt: number | null;
};
export type VersionInfo = { id: string; savedAt: number; words: number };
export type Version = { id: string; savedAt: number; html: string; text: string; brief: string; settings: EssaySettings };
export type EssayDoc = EssaySummary & { html: string; text: string; brief: string; settings: EssaySettings; revision: string; versions: VersionInfo[] };

export type EssayView = "recent" | "archived" | "trash";
export type SaveRequest = { html: string; text: string; brief: string; settings: EssaySettings; expectedRevision: string; checkpoint?: boolean };
export type SaveResponse = { savedAt: number; revision: string; versions: VersionInfo[] };
export type CreateEssayRequest = { title?: string; html?: string; text?: string; brief?: string; settings?: EssaySettings; copyOf?: string };
export type PatchEssayRequest = { title?: string; archived?: boolean; trashed?: boolean };

/** Error codes the client branches on; every error body is { error: string, code?: ErrorCode }. */
export type ErrorCode = "unauthenticated" | "not_found" | "conflict" | "trashed" | "invalid" | "taken" | "locked" | "limit";

export const USERNAME_RE = /^[a-z0-9][a-z0-9._-]{2,31}$/; // stored lowercased
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 200;
export const NAME_MAX = 80;
export const TITLE_MAX = 200;
export const TRASH_DAYS = 30;
export const MAX_VERSIONS = 100;

/** Google Docs names an untitled document after its first line (cut at a word, with "…", when long). */
export function displayTitle(e: { title: string; preview?: string; text?: string }): string {
  const first = (e.text ?? e.preview ?? "").split("\n").find((l) => l.trim())?.trim() ?? "";
  return e.title.trim() || clip(first, 80) || "Untitled essay";
}
/** Shortens text to at most `max` characters, at a word boundary when there is one nearby, marking the cut with "…". */
export function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1).replace(/[\uD800-\uDBFF]$/, ""), space = cut.lastIndexOf(" ");
  return (space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,;:.\-–—]+$/, "") + "…";
}
