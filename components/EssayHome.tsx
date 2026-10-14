"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { KeyboardEvent, MouseEvent } from "react";
import AccountMenu from "@/components/AccountMenu";
import { TITLE_MAX, TRASH_DAYS, displayTitle } from "@/lib/api-types";
import type { Account, CreateEssayRequest, EssaySummary, EssayView, PatchEssayRequest } from "@/lib/api-types";
import { APP_NAME } from "@/lib/brand";
import { EMPTY_ESSAY_SETTINGS } from "@/lib/essay-document";
import { ApiError, createEssay, deleteEssay, emptyTrash, listEssays, patchEssay } from "@/lib/essay-store";
import { findLegacy, importLegacy, legacyFlag } from "@/lib/legacy-import";
import type { Legacy } from "@/lib/legacy-import";
import { forgetEssay } from "@/lib/local-essay-data";
import { textToHtml } from "@/lib/paste";
import { SAMPLE_ESSAY_PARAGRAPHS, SAMPLE_ESSAY_TEXT, SAMPLE_ESSAY_TITLE, SAMPLE_PROFILE, SAMPLE_PROMPT, SAMPLE_TARGET_WORDS } from "@/lib/sample-essay";
import { refreshBooks } from "@/lib/use-books";

type Sort = "edited" | "opened" | "title";
// Keyed by view ("trash") or view and search ("trash?antigone").
type Lists = Partial<Record<string, EssaySummary[]>>;
type Toast = { id: number; message: string; action?: { label: string; run: () => void } };
// A function runs the action; an href is a real link (opens in a new tab).
type Item = [label: string, run: (() => void) | { href: string }];
type Confirm = { title: string; message: string; action: string; run: () => void };

const VIEWS: { view: EssayView; label: string; heading: string; href: string }[] = [
  { view: "recent", label: "Essays", heading: "Your essays", href: "/" },
  { view: "archived", label: "Archived", heading: "Archived", href: "/?view=archived" },
  { view: "trash", label: "Trash", heading: "Trash", href: "/?view=trash" },
];
const SORTS: Record<Sort, [label: string, compare: (a: EssaySummary, b: EssaySummary) => number]> = {
  edited: ["Last edited", (a, b) => b.updatedAt - a.updatedAt],
  opened: ["Last opened by me", (a, b) => b.openedAt - a.openedAt],
  title: ["Title A–Z", (a, b) => displayTitle(a).localeCompare(displayTitle(b), undefined, { sensitivity: "base", numeric: true })],
};
const sortKey = (accountId: string) => `essay:home-sort:${accountId}`; // per account, so a shared computer keeps each person's choice
const SEARCH_MAX = 200;
const PREVIEW_CHARS = 200; // the server keeps this much of the text as the preview (lib/server/essays.ts)
const DAY = 86_400_000;
const toView = (v: string | null): EssayView => v === "archived" || v === "trash" ? v : "recent";
const listKey = (v: EssayView, q: string) => q ? `${v}?${q}` : v;
const essayHref = (id: string) => `/essay/${encodeURIComponent(id)}`;
type Creating = "blank" | "sample" | null;
// The sample opens straight into the editor: it already has a brief, and the editor only shows the setup wizard when text and
// brief are both empty. Paragraphs become <p> blocks the way a plain-text paste does, so the check sees them one by one.
const SAMPLE_ESSAY: CreateEssayRequest = {
  title: SAMPLE_ESSAY_TITLE, html: textToHtml(SAMPLE_ESSAY_TEXT), text: SAMPLE_ESSAY_TEXT, brief: SAMPLE_PROMPT,
  settings: { ...EMPTY_ESSAY_SETTINGS, includeAntigone: false, profile: SAMPLE_PROFILE, targetWords: SAMPLE_TARGET_WORDS },
};
// An untitled essay is named after its first line, so the snippet starts after it. A full preview may end mid-word: drop that word.
function snippet(e: EssaySummary): string {
  const text = (e.title.trim() ? e.preview : e.preview.replace(/^\s*[^\n]*\n?/, "")).replace(/\s+/g, " ").trim();
  return text && e.preview.length >= PREVIEW_CHARS ? `${text.replace(/\s+\S*$/, "") || text}…` : text;
}
const plural = (n: number, word: string) => `${n.toLocaleString()} ${word}${n === 1 ? "" : "s"}`;
const relative = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
function ago(t: number, now: number): string {
  const s = Math.round((t - now) / 1000), a = Math.abs(s);
  if (a < 45) return "just now";
  if (a < 3600) return relative.format(Math.round(s / 60), "minute");
  if (a < 86400) return relative.format(Math.round(s / 3600), "hour");
  if (a < 7 * 86400) return relative.format(Math.round(s / 86400), "day");
  const d = new Date(t);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: d.getFullYear() === new Date(now).getFullYear() ? undefined : "numeric" });
}

export default function EssayHome({ account }: { account: Account }) {
  const router = useRouter();
  const params = useSearchParams();
  const view = toView(params.get("view"));
  const moved = params.get("moved"), movedId = params.get("essay");
  const [lists, setLists] = useState<Lists>({});
  const [errors, setErrors] = useState<Partial<Record<EssayView, string>>>({});
  const [query, setQuery] = useState("");
  const [searchQuery, setSearchQuery] = useState(""); // `query`, once typing pauses
  const [searched, setSearched] = useState<Partial<Record<EssayView, string>>>({}); // the search last loaded per view
  const [sort, setSort] = useState<Sort>("edited");
  const [confirming, setConfirming] = useState<Confirm | null>(null);
  const [creating, setCreating] = useState<Creating>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<EssaySummary | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [holdToast, setHoldToast] = useState(false);
  const [legacy, setLegacy] = useState<Legacy | null>(null);
  const [importing, setImporting] = useState(false);
  // Every change bumps this, so a list fetched before the change can't overwrite its optimistic result.
  const epoch = useRef(0);
  const viewRef = useRef(view);
  const searchRef = useRef(searchQuery);
  useEffect(() => { viewRef.current = view; searchRef.current = searchQuery; }, [view, searchQuery]);

  const describe = useCallback((e: unknown): string => {
    if (e instanceof ApiError && e.status === 401) window.location.assign(`/login?next=${encodeURIComponent(location.pathname + location.search)}`);
    return e instanceof Error ? e.message : String(e);
  }, []);
  const load = useCallback(async (v: EssayView, q: string) => {
    const started = epoch.current;
    try {
      const essays = await listEssays(v, q);
      if (epoch.current !== started) return;
      setLists((l) => ({ ...l, [listKey(v, q)]: essays }));
      setSearched((s) => ({ ...s, [v]: q }));
      setErrors((x) => ({ ...x, [v]: undefined }));
    } catch (e) { if (epoch.current === started) setErrors((x) => ({ ...x, [v]: describe(e) })); }
  }, [describe]);
  const settle = useCallback(() => void load(viewRef.current, searchRef.current), [load]);
  const notify = (message: string, action?: Toast["action"]) => setToast({ id: Date.now(), message, action });

  useEffect(() => { void load(view, searchQuery); }, [view, searchQuery, load]);
  useEffect(() => {
    const q = query.trim();
    const t = setTimeout(() => setSearchQuery(q), q ? 250 : 0);
    return () => clearTimeout(t);
  }, [query]);
  // Another tab may have edited, renamed or trashed an essay while this one was hidden, or since this page went into the back/forward cache.
  useEffect(() => {
    const visible = () => { if (document.visibilityState === "visible") settle(); };
    const shown = (event: PageTransitionEvent) => { if (event.persisted) settle(); };
    document.addEventListener("visibilitychange", visible);
    window.addEventListener("pageshow", shown);
    return () => { document.removeEventListener("visibilitychange", visible); window.removeEventListener("pageshow", shown); };
  }, [settle]);
  useEffect(() => {
    try { const saved = localStorage.getItem(sortKey(account.id)); if (saved && Object.hasOwn(SORTS, saved)) setSort(saved as Sort); } catch {}
  }, []);
  // File → Archive / Move to trash in the editor comes back here with ?moved=…&essay=…: confirm it, offer Undo, and tidy the address.
  useEffect(() => {
    if (!movedId || (moved !== "archived" && moved !== "trashed")) return;
    const undo: PatchEssayRequest = moved === "archived" ? { archived: false } : { trashed: false };
    setToast({ id: Date.now(), message: moved === "archived" ? "Essay archived" : "Moved to trash", action: { label: "Undo", run: () => {
      epoch.current++;
      patchEssay(movedId, undo).catch((err) => setToast({ id: Date.now(), message: describe(err) })).finally(settle);
    } } });
    const url = new URL(window.location.href);
    url.searchParams.delete("moved"); url.searchParams.delete("essay");
    window.history.replaceState(null, "", url.pathname + url.search + url.hash);
  }, [moved, movedId, describe, settle]);
  useEffect(() => {
    if (!toast || holdToast) return;
    const t = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(t);
  }, [toast, holdToast]);
  useEffect(() => {
    try { if (sessionStorage.getItem(legacyFlag(account.id))) return; } catch { return; }
    let live = true;
    findLegacy(account.id).then((found) => { if (live) setLegacy(found); }, () => {});
    return () => { live = false; };
  }, [account.id]);

  const showView = (event: MouseEvent<HTMLAnchorElement>, href: string) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    window.history.pushState(null, "", href);
  };
  const create = async (kind: Exclude<Creating, null> = "blank") => {
    setCreating(kind); setCreateError(null);
    try { router.push(essayHref((await createEssay(kind === "sample" ? SAMPLE_ESSAY : {})).id)); }
    catch (e) { setCreateError(describe(e)); setCreating(null); }
  };

  // Moves an essay between lists right away and puts it back if the server refuses.
  const shift = (e: EssaySummary, run: () => Promise<unknown>, from: EssayView, to: EssayView | null) => {
    epoch.current++;
    const edit = (drop: EssayView | null, put: EssayView | null) => setLists((l) => {
      const next = { ...l };
      if (drop) for (const k of Object.keys(next)) if (k === drop || k.startsWith(`${drop}?`)) next[k] = next[k]?.filter((x) => x.id !== e.id);
      if (put && next[put]) next[put] = [...next[put].filter((x) => x.id !== e.id), e];
      return next;
    });
    edit(from, to);
    return run().then(() => true, (err) => { edit(to, from); notify(describe(err)); return false; }).finally(settle);
  };
  const move = (e: EssaySummary, from: EssayView, to: EssayView, patch: { archived?: boolean; trashed?: boolean }, undo: typeof patch, message: string) =>
    void shift(e, () => patchEssay(e.id, patch), from, to).then((ok) => {
      if (ok) notify(message, { label: "Undo", run: () => { setToast(null); void shift(e, () => patchEssay(e.id, undo), to, from); } });
    });
  const copy = (e: EssaySummary) => {
    epoch.current++;
    createEssay({ copyOf: e.id }).then((c) => {
      setLists((l) => ({ ...l, recent: l.recent && [...l.recent, c] }));
      notify(`Made a copy of “${displayTitle(e)}”`, { label: "Open", run: () => router.push(essayHref(c.id)) });
    }, (err) => notify(describe(err))).finally(settle);
  };
  const destroy = (e: EssaySummary) => setConfirming({
    title: "Delete forever?", message: `“${displayTitle(e)}” will be deleted forever. You can’t undo this.`, action: "Delete forever",
    run: () => void shift(e, () => deleteEssay(e.id), "trash", null).then((ok) => { if (ok) { forgetEssay(e.id); notify("Deleted forever"); } }),
  });
  const empty = async () => {
    let trash = lists.trash; // the whole trash, even while a search narrows the rows shown
    if (!trash) try { trash = await listEssays("trash"); } catch (err) { notify(describe(err)); return; }
    const all = trash;
    if (!all.length) { settle(); return; }
    setConfirming({
      title: "Empty trash?", message: `${all.length === 1 ? "The essay" : `All ${all.length} essays`} in the trash will be deleted forever. You can’t undo this.`, action: "Delete forever",
      run: () => {
        epoch.current++;
        setLists((l) => Object.fromEntries(Object.entries(l).map(([k, list]) => [k, k === "trash" || k.startsWith("trash?") ? [] : list])));
        emptyTrash().then(() => { all.forEach((e) => forgetEssay(e.id)); notify("Trash emptied"); }, (err) => { setLists((l) => ({ ...l, trash: all })); notify(describe(err)); }).finally(settle);
      },
    });
  };
  const rename = async (e: EssaySummary, title: string): Promise<string | null> => {
    epoch.current++;
    try {
      const saved = await patchEssay(e.id, { title });
      setLists((l) => Object.fromEntries(Object.entries(l).map(([v, list]) => [v, list?.map((x) => x.id === saved.id ? saved : x)])));
      return null;
    } catch (err) { return describe(err); }
    finally { settle(); }
  };
  const importOld = async () => {
    if (!legacy) return;
    setImporting(true);
    try {
      const { essayIds: [first], failedBooks } = await importLegacy(account.id, legacy);
      if (legacy.books.length > failedBooks) void refreshBooks();
      // What failed stays in the banner to try again; what made it in is never added twice.
      setLegacy(failedBooks ? await findLegacy(account.id).catch(() => null) : null);
      notify(failedBooks ? `Added to your account, but ${plural(failedBooks, "source")} couldn’t be copied. Try again above.` : "Added to your account.",
        first ? { label: "Open", run: () => router.push(essayHref(first)) } : undefined);
    } catch (e) {
      notify(describe(e));
      setLegacy(await findLegacy(account.id).catch(() => null));
    } finally { epoch.current++; settle(); setImporting(false); }
  };
  const notNow = () => { try { sessionStorage.setItem(legacyFlag(account.id), "later"); } catch {} setLegacy(null); };

  const actions = (e: EssaySummary): Item[] => {
    const rest: Item[] = [["Rename", () => setRenaming(e)], ["Make a copy", () => copy(e)]];
    const toTrash: Item = ["Move to trash", () => move(e, view, "trash", { trashed: true }, { trashed: false }, "Moved to trash")];
    if (view === "trash") return [
      ["Restore", () => move(e, "trash", e.archivedAt ? "archived" : "recent", { trashed: false }, { trashed: true }, "Essay restored")],
      ["Delete forever", () => destroy(e)],
    ];
    if (view === "archived") return [["Open", () => router.push(essayHref(e.id))], ...rest,
      ["Unarchive", () => move(e, "archived", "recent", { archived: false }, { archived: true }, "Essay unarchived")], toTrash];
    return [["Open in new tab", { href: essayHref(e.id) }], ...rest,
      ["Archive", () => move(e, "recent", "archived", { archived: true }, { archived: false }, "Essay archived")], toTrash];
  };

  // Until the newest search loads, the last results for this view stay up.
  const shownQuery = lists[listKey(view, searchQuery)] ? searchQuery : searched[view] ?? "";
  const all = lists[listKey(view, shownQuery)];
  const shown = all && [...all].sort(SORTS[sort][1]);
  const searching = shownQuery !== searchQuery || searchQuery !== query.trim();
  const trashCount = (lists.trash ?? (view === "trash" ? all : undefined))?.length;
  const error = errors[view];
  const current = VIEWS.find((v) => v.view === view)!;
  const now = Date.now();

  return (
    <div className="home">
      <header className="home-header">
        <Link href="/" className="home-brand">{APP_NAME}</Link>
        <form className="home-search" role="search" onSubmit={(e) => e.preventDefault()}>
          <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M15.5 14h-.8l-.3-.3A6.5 6.5 0 1 0 14 15.5l.3.3v.8l5 5 1.5-1.5-5-5zm-6 0a4.5 4.5 0 1 1 0-9 4.5 4.5 0 0 1 0 9z" /></svg>
          <input type="search" aria-label="Search essays" placeholder="Search" value={query} maxLength={SEARCH_MAX} onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Escape" && query) { e.preventDefault(); setQuery(""); } }} />
        </form>
        <AccountMenu account={account} />
      </header>

      <main className="home-main">
        {legacy && (
          <section className="home-legacy" aria-label="Saved in this browser">
            <p>
              This browser has {[legacy.essays.length === 1 ? "an essay" : legacy.essays.length ? plural(legacy.essays.length, "essay") : "", legacy.books.length ? plural(legacy.books.length, "uploaded source") : ""].filter(Boolean).join(" and ")} saved
              from before accounts. Add {legacy.essays.length + legacy.books.length === 1 ? "it" : "them"} to your account?
            </p>
            <div className="home-legacy-actions">
              <button className="primary" disabled={importing} onClick={() => void importOld()}>{importing ? "Adding…" : "Add to my essays"}</button>
              <button disabled={importing} onClick={notNow}>Not now</button>
            </div>
          </section>
        )}

        {view === "recent" && (
          <section className="home-start" aria-labelledby="home-start-title">
            <h2 id="home-start-title">Start a new essay</h2>
            <div className="home-tiles">
              <button className="home-blank" aria-label="Start a blank essay" disabled={!!creating} aria-busy={creating === "blank"} onClick={() => void create()}>
                <span className="home-blank-page" aria-hidden="true"><span>+</span></span>
                <span>{creating === "blank" ? "Creating…" : "Blank essay"}</span>
              </button>
              <button className="home-blank" aria-label="Start with the sample essay" title="A first-year Frankenstein draft with real problems to find" disabled={!!creating} aria-busy={creating === "sample"} onClick={() => void create("sample")}>
                <span className="home-blank-page home-sample-page" aria-hidden="true"><b>{SAMPLE_ESSAY_TITLE}</b><small>{SAMPLE_ESSAY_PARAGRAPHS[0]}</small></span>
                <span>{creating === "sample" ? "Creating…" : "Start with the sample"}</span>
              </button>
            </div>
            {createError && <p className="error" role="alert">{createError}</p>}
          </section>
        )}

        <section className="home-list" aria-labelledby="home-list-title">
          <nav className="home-views" aria-label="Essay lists">
            {VIEWS.map((v) => (
              <a key={v.view} href={v.href} aria-current={v.view === view ? "page" : undefined} onClick={(e) => showView(e, v.href)}>{v.label}</a>
            ))}
          </nav>
          <div className="home-list-head">
            <h2 id="home-list-title" tabIndex={-1}>{current.heading}</h2>
            <label className="home-sort">
              <span>Sort</span>
              <select value={sort} onChange={(e) => { const next = e.target.value as Sort; setSort(next); try { localStorage.setItem(sortKey(account.id), next); } catch {} }}>
                {(Object.keys(SORTS) as Sort[]).map((s) => <option key={s} value={s}>{SORTS[s][0]}</option>)}
              </select>
            </label>
          </div>
          {view === "trash" && (
            <div className="home-trash-note">
              <p>Essays in the trash are deleted forever after {TRASH_DAYS} days.</p>
              {!!trashCount && <button onClick={() => void empty()}>Empty trash</button>}
            </div>
          )}

          {error && (
            <div className="home-error" role="alert">
              <p>{error}</p>
              <button onClick={() => { setErrors((x) => ({ ...x, [view]: undefined })); void load(view, searchQuery); }}>Retry</button>
            </div>
          )}
          {!all && !error && (
            <div className="home-skeleton">
              <span className="home-sr" role="status">Loading essays…</span>
              {[0, 1, 2, 3].map((i) => <div key={i} className="home-skeleton-row" aria-hidden="true"><span /><span /></div>)}
            </div>
          )}
          {all && !all.length && shownQuery && (
            <div className="home-empty" role="status">
              <p>No essays match “{shownQuery}”.</p>
              <p className="muted">{view === "recent" ? "Archived essays and the trash are searched from their own tabs." : "Try fewer or different words."}</p>
            </div>
          )}
          {all && !all.length && !shownQuery && (
            <div className="home-empty">
              {view === "recent" && <><p>No essays yet — start one.</p><button className="primary" disabled={!!creating} onClick={() => void create()}>Start an essay</button></>}
              {view === "archived" && <><p>Nothing archived.</p><p className="muted">Archive essays you’re finished with to keep your list short.</p></>}
              {view === "trash" && <p>Trash is empty.</p>}
            </div>
          )}
          {!!shown?.length && (
            <ul className="home-rows" aria-busy={searching || undefined}>
              {shown.map((e) => {
                const title = displayTitle(e), text = snippet(e), metaId = `home-row-meta-${e.id}`;
                const trashed = view === "trash" && e.trashedAt !== null;
                const [verb, at] = trashed ? ["Trashed", e.trashedAt!] : sort === "opened" ? ["Opened", e.openedAt] : ["Edited", e.updatedAt];
                const body = <>
                  <span className="home-row-icon" aria-hidden="true" />
                  <span className="home-row-text">
                    <span className="home-row-title">{title}</span>
                    {text && <span className="home-row-preview">{text}</span>}
                  </span>
                  <span className="home-row-meta" id={metaId}>
                    <time dateTime={new Date(at).toISOString()} title={new Date(at).toLocaleString()}>{verb} {ago(at, now)}</time>
                    {trashed
                      ? <span className="home-row-expiry">Deleted forever in {plural(Math.max(1, Math.ceil((e.trashedAt! + TRASH_DAYS * DAY - now) / DAY)), "day")}</span>
                      : <span>{plural(e.words, "word")}</span>}
                  </span>
                </>;
                return (
                  <li key={e.id} className="home-row">
                    {/* Trashed essays don't open; restore them first. */}
                    {view === "trash" ? <div className="home-row-main">{body}</div>
                      : <Link href={essayHref(e.id)} prefetch={false} className="home-row-main" aria-label={title} aria-describedby={metaId}>{body}</Link>}
                    <RowMenu label={`More actions for ${title}`} items={actions(e)} />
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </main>

      <div className="home-toast-region" role="status" aria-live="polite" onMouseEnter={() => setHoldToast(true)} onMouseLeave={() => setHoldToast(false)}
        onFocus={() => setHoldToast(true)} onBlur={() => setHoldToast(false)}>
        {toast && (
          <div key={toast.id} className="home-toast">
            <span>{toast.message}</span>
            {toast.action && <button className="link" onClick={() => { setToast(null); toast.action!.run(); }}>{toast.action.label}</button>}
            <button className="home-toast-close" aria-label="Dismiss" onClick={() => setToast(null)}>×</button>
          </div>
        )}
      </div>

      {renaming && <RenameDialog key={renaming.id} essay={renaming} onClose={() => setRenaming(null)} onSave={rename} />}
      {confirming && <ConfirmDialog confirm={confirming} onClose={() => setConfirming(null)} />}
    </div>
  );
}

function RowMenu({ label, items }: { label: string; items: Item[] }) {
  const [open, setOpen] = useState(false);
  const [up, setUp] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const id = useId();
  const list = () => Array.from(menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
  useEffect(() => { if (open) list()[0]?.focus(); }, [open]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!menu.current?.contains(event.target as Node) && !button.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);

  // Rows near the bottom of the window open their menu upwards so it isn't cut off.
  const toggle = () => {
    if (!open && button.current) setUp(window.innerHeight - button.current.getBoundingClientRect().bottom < items.length * 40 + 24);
    setOpen((v) => !v);
  };
  const choose = (run: () => void) => () => { setOpen(false); button.current?.focus(); run(); };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") { event.preventDefault(); setOpen(false); button.current?.focus(); return; }
    if (event.key === "Tab") { setOpen(false); return; }
    if (event.key === " " && document.activeElement instanceof HTMLAnchorElement) { event.preventDefault(); document.activeElement.click(); return; }
    const all = list(), i = all.indexOf(document.activeElement as HTMLElement);
    const keys: Record<string, number | undefined> = { ArrowDown: (i + 1) % all.length, ArrowUp: (i + all.length - 1) % all.length, Home: 0, End: all.length - 1 };
    const next = keys[event.key];
    if (next === undefined) return;
    event.preventDefault();
    all[next]?.focus();
  };

  return (
    <div className="row-menu-wrap">
      <button ref={button} className="row-menu-button" aria-label={label} title="More actions" aria-haspopup="menu" aria-expanded={open} aria-controls={id}
        onClick={toggle} onKeyDown={(e) => { if (e.key === "ArrowDown" && !open) { e.preventDefault(); toggle(); } }}>
        <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20"><circle cx="12" cy="5" r="2" fill="currentColor" /><circle cx="12" cy="12" r="2" fill="currentColor" /><circle cx="12" cy="19" r="2" fill="currentColor" /></svg>
      </button>
      <div ref={menu} id={id} className="row-menu" data-up={up || undefined} role="menu" aria-label={label} hidden={!open} onKeyDown={onKeyDown}>
        {items.map(([text, run]) => typeof run === "function"
          ? <button key={text} role="menuitem" tabIndex={-1} onClick={choose(run)}>{text}</button>
          : <a key={text} role="menuitem" tabIndex={-1} href={run.href} target="_blank" rel="noopener" onClick={() => { setOpen(false); button.current?.focus(); }}>{text}</a>)}
      </div>
    </div>
  );
}

function RenameDialog({ essay, onClose, onSave }: { essay: EssaySummary; onClose: () => void; onSave: (e: EssaySummary, title: string) => Promise<string | null> }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState(displayTitle(essay));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The dialog unmounts instead of closing, so focus has to be handed back by hand (to what had it before opening).
  const [back] = useState(() => document.activeElement as HTMLElement | null);
  useEffect(() => {
    const d = dialog.current;
    d?.showModal();
    input.current?.select();
    return () => { d?.close(); back?.focus(); };
  }, [back]);

  const save = async () => {
    const next = title.trim();
    // Saving the untouched first-line name would pin it; leave the title following the text instead.
    if (next === essay.title.trim() || (!essay.title.trim() && next === displayTitle(essay))) { onClose(); return; }
    setBusy(true); setError(null);
    const problem = await onSave(essay, next);
    if (problem) { setError(problem); setBusy(false); } else onClose();
  };

  return (
    <dialog ref={dialog} className="rename-dialog" aria-labelledby="rename-title" onCancel={(e) => { e.preventDefault(); if (!busy) onClose(); }}>
      <form onSubmit={(e) => { e.preventDefault(); void save(); }}>
        <h2 id="rename-title">Rename</h2>
        <label className="login-field">
          <span>Title</span>
          <input ref={input} value={title} maxLength={TITLE_MAX} disabled={busy} placeholder="Untitled essay" onChange={(e) => setTitle(e.target.value)} />
        </label>
        {error && <p className="error" role="alert">{error}</p>}
        <div className="rename-actions">
          <button type="button" disabled={busy} onClick={onClose}>Cancel</button>
          <button type="submit" className="primary" disabled={busy}>{busy ? "Saving…" : "OK"}</button>
        </div>
      </form>
    </dialog>
  );
}

// A destructive step asks first; Cancel has focus, so Enter or Escape right away loses nothing.
function ConfirmDialog({ confirm, onClose }: { confirm: Confirm; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  // As in RenameDialog; if what had focus went away with the deleted row, focus goes to the list heading instead.
  const [back] = useState(() => document.activeElement as HTMLElement | null);
  useEffect(() => {
    const d = dialog.current;
    d?.showModal();
    cancel.current?.focus();
    return () => { d?.close(); (back?.isConnected ? back : document.getElementById("home-list-title"))?.focus(); };
  }, [back]);

  return (
    <dialog ref={dialog} className="rename-dialog" role="alertdialog" aria-labelledby="confirm-title" aria-describedby="confirm-message"
      onCancel={(e) => { e.preventDefault(); onClose(); }}>
      <h2 id="confirm-title">{confirm.title}</h2>
      <p id="confirm-message" className="confirm-message">{confirm.message}</p>
      <div className="rename-actions">
        <button ref={cancel} type="button" onClick={onClose}>Cancel</button>
        <button type="button" className="danger" onClick={() => { onClose(); confirm.run(); }}>{confirm.action}</button>
      </div>
    </dialog>
  );
}
