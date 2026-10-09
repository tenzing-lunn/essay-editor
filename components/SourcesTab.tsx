"use client";

import { useEffect, useRef, useState } from "react";
import type { FormEvent, RefObject } from "react";
import { aiFetch } from "@/lib/ai-client";
import { essayParagraphs } from "@/lib/essay-document";
import type { EssaySettings } from "@/lib/essay-document";
import { essayContext, mergeRevisionTasks } from "@/lib/essay-workflow";
import type { RevisionTask, SourceCheck } from "@/lib/essay-workflow";
import { ANTIGONE_URN, ANTIGONE_VIEWER, findBookQuotes } from "@/lib/antigone";
import type { BookQuote } from "@/lib/antigone";
import { formatCitation, indexPassages, rankPassages, selectExcerpts, sourcesKey } from "@/lib/sources";
import type { Passage, PassageIndex } from "@/lib/sources";
import { ACCEPT_SOURCES, fileKind } from "@/lib/file-text";
import type { BookMeta } from "@/lib/book-store";
import { booksKey, currentBooks, useBooks } from "@/lib/use-books";
import type { BookImport } from "@/lib/use-books";
import DropZone, { PromptFileDrop } from "@/components/DropZone";
import EssayRevisionTasks from "@/components/EssayRevisionTasks";

type Props = {
  editorRef: RefObject<HTMLDivElement | null>; draft: string; loaded: boolean; words: number;
  brief: string; onBriefChange: (text: string) => void; getBrief: () => string;
  settings: EssaySettings; getSettings: () => EssaySettings; updateSettings: (update: (settings: EssaySettings) => EssaySettings) => void;
  onJumpTask: (task: RevisionTask, context?: string) => void; onError: (message: string | null) => void;
  evidenceRequest: { query: string; nonce: number } | null;
};
type Block = Parameters<typeof findBookQuotes>[0][number];
type Hit = { key: string; title: string; location: string; text: string; citation: string; url?: string };

const CHECKLIST = ["Thesis states a specific argument", "Each paragraph develops that argument", "Claims have verified supporting evidence", "Quotations have checked citations", "Repetition and contradictions reviewed", "Grammar and formatting checked"];
const RANGE = /^\d+\s*(?:[-–—]\s*\d+)?$/;
const SOURCES_LIMIT = 50000;

/** The saved schema takes a whole number 0–100000; anything else would make every autosave fail. */
export const clampWords = (n: unknown) => Math.min(100000, Math.max(0, Math.round(Number(n)) || 0));
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const unit = (name: string) => ({ pdf: "page", epub: "chapter" } as Record<string, string>)[fileKind(name) ?? ""] ?? "part";
export const bookMeta = (book: BookMeta) => `${book.kind.toUpperCase()} · ${plural(book.sections, unit(book.fileName))}`;

export function BookImports({ imports, onDismiss }: { imports: BookImport[]; onDismiss: (key: string) => void }) {
  return imports.length > 0 && <ul className="book-imports" aria-live="polite">
    {imports.map((i) => <li key={i.key}>
      {i.error
        ? <><span className="error" role="alert">{i.name}: {i.error}</span><button className="link" aria-label={`Dismiss ${i.name}`} onClick={() => onDismiss(i.key)}>Dismiss</button></>
        : <span className="muted">Reading {i.name}{i.total ? ` ${i.done}/${plural(i.total, unit(i.name))}` : ""}…</span>}
    </li>)}
  </ul>;
}

const lines = (start: number, end: number) => start === end ? `line ${start}` : `lines ${start}–${end}`;
const antigoneCitation = (text: string, reference: string) => `“${text}” (Sophocles, Antigone ${reference}; trans. Richard Jebb)`;
const scaife = (reference: string) => `https://scaife.perseus.org/reader/${ANTIGONE_URN}:${reference}/`;
let antigone: Promise<{ blocks: Block[]; passages: Passage[] }> | null = null;
const loadAntigone = () => antigone ??= fetch("/api/antigone").then(async (r) => {
  const data = await r.json();
  if (!r.ok) throw new Error(data.error ?? "The Antigone text could not be loaded.");
  const blocks: Block[] = data.blocks;
  return { blocks, passages: blocks.map((b) => ({ sourceId: "antigone", title: "Antigone", location: lines(b.start, b.end), text: b.text })) };
}).catch((e) => { antigone = null; throw e; });
let searchCache: { key: string; index: Promise<PassageIndex> } | null = null;
function searchIndex(includeAntigone: boolean, passages: () => Promise<Passage[]>) {
  const key = `${includeAntigone}|${booksKey(currentBooks())}`;
  if (searchCache?.key !== key) {
    const index = (async () => indexPassages([...includeAntigone ? (await loadAntigone()).passages : [], ...await passages()]))();
    searchCache = { key, index };
    index.catch(() => { if (searchCache?.index === index) searchCache = null; });
  }
  return searchCache.index;
}
const quoteHit = (q: BookQuote): Hit => {
  const [start, end = start] = q.reference.split("-").map(Number);
  return { key: `antigone:${q.reference}`, title: "Antigone", location: `${q.speaker} · ${lines(start, end)}`, text: q.text, citation: antigoneCitation(q.text, q.reference), url: q.url };
};

export default function SourcesTab({ editorRef, draft, loaded, words, brief, onBriefChange, getBrief, settings, getSettings, updateSettings, onJumpTask, onError, evidenceRequest }: Props) {
  const { books, imports, error: booksError, add, remove, rename, dismissImport, passages, bookIndex } = useBooks();
  const [checking, setChecking] = useState(false);
  const sourceRunning = useRef(false);
  const [lastCheck, setLastCheck] = useState<{ context: string; issues: number; label: string } | null>(null);
  const [pastedOpen, setPastedOpen] = useState(false);
  const searchRunning = useRef(false);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<{ hits: Hit[]; query: string; evidence: boolean } | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const quoteSection = useRef<HTMLElement>(null);
  const queryInput = useRef<HTMLInputElement>(null);
  const handledNonce = useRef<number | null>(null);
  const text = () => editorRef.current?.innerText ?? "";
  const currentContext = essayContext(draft, brief, sourcesKey(settings.sources, books), settings.includeAntigone);
  const hasSources = settings.includeAntigone || books.length > 0 || !!settings.sources.trim();

  useEffect(() => { if (loaded && getSettings().sources) setPastedOpen(true); }, [loaded, getSettings]);

  const checkSources = async () => {
    const editor = editorRef.current;
    if (!loaded || sourceRunning.current || !text().trim() || !editor) return;
    sourceRunning.current = true; setChecking(true); onError(null);
    try {
      const snapshot = text(), assignment = getBrief(), { sources: manual, includeAntigone } = getSettings(), bookCount = currentBooks().length;
      const context = essayContext(snapshot, assignment, sourcesKey(manual, currentBooks()), includeAntigone);
      const paragraphs = essayParagraphs(editor).map((p, id) => ({ id, text: p.innerText.trim() }));
      const excerpts = selectExcerpts(await bookIndex(), paragraphs.map((p) => p.text), SOURCES_LIMIT - manual.length - 2);
      const sources = [manual, excerpts.text].filter(Boolean).join("\n\n");
      const r = await aiFetch("/api/ai", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mode: "sources", paragraphs, brief: assignment, sources, includeAntigone }) });
      const result: SourceCheck = await r.json();
      if (!r.ok) throw new Error((result as unknown as { error: string }).error);
      if (context !== essayContext(text(), getBrief(), sourcesKey(getSettings().sources, currentBooks()), getSettings().includeAntigone)) {
        onError("Your essay or sources changed during the source check. Check again for current results."); return;
      }
      const tasks: RevisionTask[] = result.issues.map((issue) => ({
        ...issue, id: crypto.randomUUID(), kind: "source", paragraph: paragraphs[issue.paragraphId].text,
        status: "open", context, note: "",
      }));
      updateSettings((s) => ({ ...s, tasks: mergeRevisionTasks(s.tasks, tasks, "source") }));
      const against = [includeAntigone && "Antigone", manual.trim() && "pasted excerpts", bookCount > 0 && plural(bookCount, "book")].filter(Boolean).join(" + ");
      setLastCheck({ context, issues: result.issues.length, label: `Checked against ${against || "your essay"}${excerpts.count ? ` (${plural(excerpts.count, "excerpt")})` : ""}` });
    } catch (e) { onError(e instanceof Error ? e.message : String(e)); }
    finally { sourceRunning.current = false; setChecking(false); }
  };

  const search = async (raw: string, evidence = false) => {
    const q = raw.trim();
    if (!q || searchRunning.current) return;
    searchRunning.current = true; setSearching(true); setSearchError(null); setResults(null); setCopied(null);
    try {
      const includeAntigone = getSettings().includeAntigone;
      let hits: Hit[];
      if (!evidence && RANGE.test(q)) hits = findBookQuotes((await loadAntigone()).blocks, q).quotes.map(quoteHit);
      else {
        // A common word can match dozens of Antigone blocks; leave room for the books.
        const quotes = !evidence && includeAntigone ? findBookQuotes((await loadAntigone()).blocks, q).quotes.slice(0, currentBooks().length ? 6 : 12) : [];
        const covered = quotes.map((quote) => quote.reference.split("-").map(Number));
        const ranked = rankPassages(await searchIndex(includeAntigone, passages), q, 12).flatMap((p, i): Hit[] => {
          if (p.sourceId !== "antigone") return [{ key: `${p.sourceId}:${i}`, title: p.title, location: p.location, text: p.snippet, citation: formatCitation(p, p.snippet) }];
          const [start, end = start] = (p.location.match(/\d+/g) ?? []).map(Number);
          if (covered.some(([s, e = s]) => start >= s && start <= e)) return [];
          const reference = start === end ? `${start}` : `${start}-${end}`;
          return [{ key: `antigone:${reference}`, title: "Antigone", location: p.location, text: p.snippet, citation: antigoneCitation(p.snippet, reference), url: scaife(reference) }];
        });
        const seen = new Set<string>();
        hits = [...quotes.map(quoteHit), ...ranked].filter((h) => !seen.has(h.key) && !!seen.add(h.key)).slice(0, 12);
      }
      setResults({ hits, query: q, evidence });
    } catch (e) { setSearchError(e instanceof Error ? e.message : "Could not search the sources."); }
    finally { searchRunning.current = false; setSearching(false); }
  };

  useEffect(() => {
    if (!evidenceRequest || handledNonce.current === evidenceRequest.nonce) return;
    handledNonce.current = evidenceRequest.nonce;
    const q = evidenceRequest.query.replace(/\s+/g, " ").trim().slice(0, 200);
    setQuery(q);
    quoteSection.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    queryInput.current?.focus({ preventScroll: true });
    void search(q, true);
  }, [evidenceRequest]);

  const copy = async (hit: Hit) => {
    try { await navigator.clipboard.writeText(hit.citation); setCopied(hit.key); }
    catch { setSearchError("Could not copy. Select the passage and copy it."); }
  };

  const groups = new Map<string, Hit[]>();
  for (const hit of results?.hits ?? []) groups.set(hit.title, [...groups.get(hit.title) ?? [], hit]);

  return <>
    <section className="sources-tab" aria-labelledby="sources-title">
      <h2 id="sources-title">Assignment &amp; sources</h2>
      <h3>Prompt</h3>
      <textarea rows={4} maxLength={20000} value={brief} aria-label="Assignment prompt or rubric" placeholder="Paste the prompt or rubric" onChange={(e) => onBriefChange(e.target.value)} />
      <PromptFileDrop label="Replace from file" compact onText={onBriefChange} />
      <label className="field-inline">Word goal
        <input type="number" min={0} max={100000} step={50} value={settings.targetWords || ""} placeholder="None"
          onChange={(e) => updateSettings((s) => ({ ...s, targetWords: clampWords(e.target.value) }))} />
      </label>
      <details><summary>Before you submit</summary>
        {CHECKLIST.map((item) => <label className="checklist-item" key={item}><input type="checkbox" checked={settings.checklist[item] ?? false} onChange={(e) => updateSettings((s) => ({ ...s, checklist: { ...s.checklist, [item]: e.target.checked } }))} />{item}</label>)}
      </details>

      <h3>Sources</h3>
      <ul className="source-list">
        <li className="source-row">
          <label className="checklist-item"><input type="checkbox" checked={settings.includeAntigone} onChange={(e) => updateSettings((s) => ({ ...s, includeAntigone: e.target.checked }))} />Sophocles, <i>Antigone</i> (built in)</label>
          <a href={ANTIGONE_VIEWER} target="_blank" rel="noopener noreferrer">Read ↗</a>
        </li>
        {books.map((book) => <li className="source-row" key={book.id}>
          <div className="source-name">
            <input key={book.title} defaultValue={book.title} maxLength={200} aria-label={`Title of ${book.fileName}`} title="Used in citations"
              onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
              onBlur={(e) => { const title = e.target.value.trim(); if (!title) e.target.value = book.title; else if (title !== book.title) void rename(book.id, title); }} />
            <span className="muted">{bookMeta(book)}</span>
          </div>
          <button className="link" aria-label={`Remove ${book.title}`} onClick={() => void remove(book.id)}>Remove</button>
        </li>)}
      </ul>
      {booksError && <p className="error" role="alert">{booksError}</p>}
      <BookImports imports={imports} onDismiss={dismissImport} />
      <DropZone label="Add a book or reading" hint=".pdf .epub .docx .txt .md" accept={ACCEPT_SOURCES} multiple onFiles={(files) => void add(files)} />
      <details open={pastedOpen} onToggle={(e) => setPastedOpen(e.currentTarget.open)}>
        <summary>Pasted excerpts</summary>
        <textarea rows={5} maxLength={50000} value={settings.sources} aria-label="Pasted excerpts with title and page" placeholder="Title, p. 12: “…”" onChange={(e) => updateSettings((s) => ({ ...s, sources: e.target.value }))} />
      </details>

      <button className={hasSources ? "primary check-sources" : "check-sources"} disabled={!loaded || checking || !words} onClick={() => void checkSources()}>{checking ? "Checking sources…" : "Check sources"}</button>
      <p className="muted" aria-live="polite">{lastCheck?.context === currentContext && `${lastCheck.label}${lastCheck.issues ? "" : " · Nothing to verify."}`}</p>
    </section>
    <EssayRevisionTasks kind="source" tasks={settings.tasks} context={currentContext} onJump={(t) => onJumpTask(t, currentContext)}
      onRemove={(task) => updateSettings((s) => ({ ...s, tasks: s.tasks.filter((t) => t.id !== task.id) }))}
      onChange={(task) => updateSettings((s) => ({ ...s, tasks: s.tasks.map((t) => t.id === task.id ? task : t) }))} />
    <section className="quote-finder" aria-labelledby="quote-title" ref={quoteSection}>
      <h2 id="quote-title">Find a quote</h2>
      <form className="quote-search" role="search" onSubmit={(e: FormEvent) => { e.preventDefault(); void search(query); }}>
        <input ref={queryInput} type="search" value={query} maxLength={200} aria-label="Phrase, words or Antigone line numbers" placeholder="Phrase or line 175–191" onChange={(e) => setQuery(e.target.value)} />
        <button disabled={searching || !query.trim()}>{searching ? "Searching…" : "Search"}</button>
      </form>
      <div aria-live="polite">
        {searchError && <p className="error" role="alert">{searchError}</p>}
        {results?.evidence && <h3 title="Passages that share words with this claim">Evidence for: “{results.query.slice(0, 80)}{results.query.length > 80 ? "…" : ""}”</h3>}
        {results && !results.hits.length && <p className="muted">No matches. Try fewer words.</p>}
      </div>
      {[...groups].map(([title, hits]) => <div className="quote-group" key={title}>
        <h4>{title}</h4>
        {hits.map((hit) => <article className="book-quote" key={hit.key}>
          <p className="muted">{hit.location}</p>
          <blockquote>{hit.text}</blockquote>
          <div className="quote-actions">
            <button onClick={() => void copy(hit)}>{copied === hit.key ? "Copied" : "Copy quote + citation"}</button>
            {hit.url && <a href={hit.url} target="_blank" rel="noopener noreferrer">View ↗</a>}
          </div>
        </article>)}
        {title === "Antigone" && <p className="quote-credit">Text: <a href="https://github.com/PerseusDL/canonical-greekLit/blob/master/data/tlg0011/tlg002/tlg0011.tlg002.perseus-eng2.xml" target="_blank" rel="noopener noreferrer">Perseus Digital Library, Tufts University</a> · <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener noreferrer">CC BY-SA 4.0</a></p>}
      </div>)}
    </section>
  </>;
}
