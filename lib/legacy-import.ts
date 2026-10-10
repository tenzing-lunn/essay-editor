// Before accounts, the essay and uploaded books lived only in this browser's IndexedDB. This finds them and copies
// them into the signed-in account. The old databases are only ever read: never created, upgraded, written or deleted.
import { clip, displayTitle, TITLE_MAX } from "./api-types";
import { addBook } from "./book-store";
import type { BookMeta } from "./book-store";
import { EMPTY_ESSAY_SETTINGS, ESSAY_BLOCKS } from "./essay-document";
import { EssaySettingsSchema } from "./essay-workflow";
import { createEssay } from "./essay-store";
import type { Section } from "./sources";

type OldDraft = { html?: string; text?: string; brief?: string; settings?: unknown; revision?: string };
type OldRecovery = { html?: unknown; brief?: unknown; settings?: unknown; revision?: unknown };
type OldEssay = { key: "draft" | "recovery"; title: string; html: string; text: string; brief: string; settings: unknown };
export type Legacy = { essays: OldEssay[]; books: BookMeta[] };
// Per account: "done" (or the timestamp older builds wrote) once everything is in, or JSON listing what already made it.
type Progress = { essays: string[]; books: string[] };

const ESSAY_DB = "essay-editor", BOOKS_DB = "essay-editor-sources";
const OLD_RECOVERY = "finals:essay-recovery:v2"; // the old editor's copy of changes not yet saved to IndexedDB
export const legacyFlag = (accountId: string) => `essay:legacy-import:${accountId}`;

const request = <T,>(r: IDBRequest<T>) => new Promise<T>((resolve, reject) => { r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });

// Opening without a version never upgrades; the caller has already checked the database exists,
// and onupgradeneeded aborts in case it vanished in between (an abort leaves no empty database behind).
function openExisting(name: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(name);
    r.onupgradeneeded = () => r.transaction?.abort();
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

async function read<T>(name: string, store: string, key: IDBValidKey | null): Promise<T | undefined> {
  const db = await openExisting(name);
  try {
    if (!db.objectStoreNames.contains(store)) return undefined;
    const s = db.transaction(store, "readonly").objectStore(store);
    return await request(key === null ? s.getAll() : s.get(key)) as T | undefined;
  } finally { db.close(); }
}

/** null: nothing recorded yet. Throws when storage is unavailable, so nothing is imported twice. */
function readProgress(accountId: string): Progress | "done" | null {
  const raw = localStorage.getItem(legacyFlag(accountId));
  if (!raw) return null;
  if (!raw.startsWith("{")) return "done";
  try { const p = JSON.parse(raw); return { essays: Array.isArray(p.essays) ? p.essays : [], books: Array.isArray(p.books) ? p.books : [] }; }
  catch { return null; }
}
const writeProgress = (accountId: string, progress: Progress | "done") => {
  try { localStorage.setItem(legacyFlag(accountId), progress === "done" ? String(Date.now()) : JSON.stringify(progress)); } catch {}
};

// The old recovery copy has only HTML; parsed inertly (DOMParser runs no scripts and loads nothing), one line per block.
function htmlText(html: string): string {
  const body = new DOMParser().parseFromString(html, "text/html").body;
  const blocks = Array.from(body.querySelectorAll(ESSAY_BLOCKS)).filter((b) => !b.querySelector(ESSAY_BLOCKS));
  return (blocks.length ? blocks.map((b) => b.textContent ?? "") : [body.textContent ?? ""]).join("\n");
}

// The old editor kept unsaved changes in localStorage until they reached IndexedDB. One built on the stored draft's
// revision is simply newer and replaces it; one built on an older revision (another tab saved since) comes in beside it.
function oldEssays(draft: OldDraft | undefined): OldEssay[] {
  const saved = draft?.text?.trim() ? { key: "draft" as const, title: "", html: draft.html ?? "", text: draft.text, brief: draft.brief ?? "", settings: draft.settings } : null;
  let recovery: OldRecovery | null = null;
  try { recovery = JSON.parse(localStorage.getItem(OLD_RECOVERY) ?? "null"); } catch {}
  const html = typeof recovery?.html === "string" ? recovery.html : "";
  const text = html ? htmlText(html) : "";
  const brief = typeof recovery?.brief === "string" ? recovery.brief : "";
  const changed = text.trim() && (!saved || html !== saved.html || brief !== saved.brief || JSON.stringify(recovery?.settings) !== JSON.stringify(saved.settings));
  if (!changed) return saved ? [saved] : [];
  const unsaved = { key: "recovery" as const, title: "", html, text, brief, settings: recovery?.settings };
  if (!saved || recovery?.revision === draft?.revision) return [unsaved];
  return [saved, { ...unsaved, title: `${clip(displayTitle({ title: "", text }), TITLE_MAX - 16)} (unsaved copy)` }];
}

/** What this browser kept from before accounts and this account hasn't imported yet, or null when there's nothing (or no way to check). */
export async function findLegacy(accountId: string): Promise<Legacy | null> {
  if (typeof indexedDB === "undefined" || typeof indexedDB.databases !== "function") return null;
  const progress = readProgress(accountId);
  if (progress === "done") return null;
  const names = new Set((await indexedDB.databases()).map((d) => d.name));
  const old = names.has(ESSAY_DB) ? await read<OldDraft>(ESSAY_DB, "essay", "draft").catch(() => undefined) : undefined;
  const books = names.has(BOOKS_DB) ? (await read<BookMeta[]>(BOOKS_DB, "books", null).catch(() => undefined)) ?? [] : [];
  const legacy = {
    essays: oldEssays(old).filter((e) => !progress?.essays.includes(e.key)),
    books: books.filter((b) => !progress?.books.includes(b.id)).sort((a, b) => a.addedAt - b.addedAt),
  };
  return legacy.essays.length || legacy.books.length ? legacy : null;
}

/**
 * Adds the old essays and books to the account, recording each as it lands so a retry never adds it twice.
 * Books are best-effort: the count that failed is returned, and the account is marked done only when none did.
 */
export async function importLegacy(accountId: string, legacy: Legacy): Promise<{ essayIds: string[]; failedBooks: number }> {
  const progress: Progress = (() => { const p = readProgress(accountId); return p === "done" || !p ? { essays: [], books: [] } : p; })();
  const essayIds: string[] = [];
  for (const old of legacy.essays) {
    const parsed = EssaySettingsSchema.safeParse(old.settings);
    const essay = await createEssay({ title: old.title, html: old.html, text: old.text, brief: old.brief, settings: parsed.success ? parsed.data : EMPTY_ESSAY_SETTINGS });
    essayIds.push(essay.id);
    progress.essays.push(old.key); writeProgress(accountId, progress);
  }
  let failedBooks = 0;
  for (const meta of legacy.books) {
    try {
      await addBook(meta, (await read<Section[]>(BOOKS_DB, "text", meta.id)) ?? []);
      progress.books.push(meta.id); writeProgress(accountId, progress);
    } catch { failedBooks++; }
  }
  if (!failedBooks) writeProgress(accountId, "done");
  return { essayIds, failedBooks };
}
